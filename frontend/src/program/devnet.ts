// The real ReliefPool program client on devnet (docs/api.md section 5),
// built on the Codama-generated client in ./generated. client.ts picks this
// or the mock chain.

import {
  createWalletTransactionSigner,
  type WalletSession,
} from "@solana/client";
import {
  address,
  appendTransactionMessageInstruction,
  compileTransaction,
  createSolanaRpc,
  createTransactionMessage,
  getBase58Decoder,
  getBase64EncodedWireTransaction,
  getBase64Encoder,
  getSignatureFromTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Base58EncodedBytes,
} from "@solana/kit";
import { config } from "../config";
import {
  CONTRIBUTION_DISCRIMINATOR,
  fetchMaybePool,
  getContributeInstructionAsync,
  getContributionDecoder,
  getContributionSize,
} from "./generated";
import { toTransactionError } from "./transactionErrors";
import type { Address, Contribution, Pool } from "./types";

// Same endpoint as the wallet provider in src/providers.tsx.
const rpc = createSolanaRpc(config.rpcUrl);

// Checked on use rather than at import, so a bad VITE_PROGRAM_ID shows up
// as an error in the pool cards instead of a blank page.
function programAddress() {
  return address(config.programId);
}

const CONFIRM_POLL_MS = 1_000;
// Contribution layout: 8-byte discriminator, then the pool address.
const CONTRIBUTION_POOL_OFFSET = 8n;

const base58 = getBase58Decoder();
const base64 = getBase64Encoder();

// Pool account at the address from GET /pool. Throws if it is missing or
// is not a ReliefPool account.
export async function getPool(poolAddress: Address): Promise<Pool> {
  const account = await fetchMaybePool(rpc, poolAddress);
  if (!account.exists) {
    throw new Error(`Pool account ${poolAddress} not found on devnet.`);
  }
  if (account.programAddress !== programAddress()) {
    throw new Error(
      `Account ${poolAddress} is not owned by the ReliefPool program.`
    );
  }
  const { admin, oracle, regionId, threshold, payoutCapLamports } =
    account.data;
  return {
    admin,
    oracle,
    regionId,
    threshold,
    payoutCapLamports,
    responders: account.data.responders.map(({ wallet, shareBps }) => ({
      wallet,
      shareBps,
    })),
    totalContributed: account.data.totalContributed,
    totalPaidOut: account.data.totalPaidOut,
  };
}

// All Contribution accounts for the pool: the program's accounts with the
// Contribution discriminator and size whose pool field matches.
export async function getContributions(
  poolAddress: Address
): Promise<Contribution[]> {
  const accounts = await rpc
    .getProgramAccounts(programAddress(), {
      encoding: "base64",
      filters: [
        { dataSize: BigInt(getContributionSize()) },
        {
          memcmp: {
            offset: 0n,
            bytes: base58.decode(
              CONTRIBUTION_DISCRIMINATOR
            ) as Base58EncodedBytes,
            encoding: "base58",
          },
        },
        {
          memcmp: {
            offset: CONTRIBUTION_POOL_OFFSET,
            bytes: poolAddress as string as Base58EncodedBytes,
            encoding: "base58",
          },
        },
      ],
    })
    .send();

  const decoder = getContributionDecoder();
  return accounts
    .map(({ account }) => decoder.decode(base64.encode(account.data[0])))
    .filter((c) => c.pool === poolAddress)
    .map(({ pool, contributor, amount }) => ({ pool, contributor, amount }));
}

// Lamport balance of the vault, at the address from GET /pool.
export async function getVaultBalance(vaultAddress: Address): Promise<bigint> {
  const { value } = await rpc.getBalance(vaultAddress).send();
  return value;
}

// Lamport balance of any wallet, e.g. the connected one before contributing.
export async function getWalletBalance(
  walletAddress: Address
): Promise<bigint> {
  const { value } = await rpc.getBalance(walletAddress).send();
  return value;
}

// Builds the contribute instruction, simulates it, has the wallet sign it,
// sends it through the app's devnet RPC and waits for confirmation.
// Resolves with the transaction signature.
//
// The wallet only signs. A wallet that can only send would send on
// whatever network it is set to, possibly mainnet, so it is refused.
export async function contribute(
  amountLamports: bigint,
  { pool, wallet }: { pool: Address; wallet: WalletSession }
): Promise<string> {
  const { signer, mode } = createWalletTransactionSigner(wallet);
  if (mode !== "partial") {
    throw new Error(
      "This wallet can only send transactions itself, so ReliefPool can't make sure it goes to devnet. Use a wallet that can sign, such as Phantom."
    );
  }

  // The vault and contribution addresses are derived from the pool and the
  // contributor (docs/api.md section 5.3).
  const instruction = await getContributeInstructionAsync(
    { contributor: signer, pool, amountLamports },
    { programAddress: programAddress() }
  );
  const { value: blockhash } = await rpc
    .getLatestBlockhash({ commitment: "confirmed" })
    .send();
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(signer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) => appendTransactionMessageInstruction(instruction, m)
  );

  // Simulate first, so a failing contribution shows its reason without a
  // wallet prompt.
  const simulation = await rpc
    .simulateTransaction(
      getBase64EncodedWireTransaction(compileTransaction(message)),
      { encoding: "base64", sigVerify: false, commitment: "confirmed" }
    )
    .send();
  if (simulation.value.err) throw toTransactionError(simulation.value.err);

  const transaction = await signTransactionMessageWithSigners(message);
  const signature = getSignatureFromTransaction(transaction);
  await rpc
    .sendTransaction(getBase64EncodedWireTransaction(transaction), {
      encoding: "base64",
      preflightCommitment: "confirmed",
    })
    .send();
  await waitForConfirmation(signature, blockhash.lastValidBlockHeight);
  return signature;
}

// Polls the signature status instead of opening a websocket, so any HTTP
// devnet endpoint works. Gives up once the blockhash has expired.
async function waitForConfirmation(
  signature: ReturnType<typeof getSignatureFromTransaction>,
  lastValidBlockHeight: bigint
): Promise<void> {
  for (;;) {
    const {
      value: [status],
    } = await rpc.getSignatureStatuses([signature]).send();
    if (status?.err) throw toTransactionError(status.err);
    if (
      status?.confirmationStatus === "confirmed" ||
      status?.confirmationStatus === "finalized"
    ) {
      return;
    }
    const height = await rpc.getBlockHeight({ commitment: "confirmed" }).send();
    if (height > lastValidBlockHeight) {
      throw new Error(
        "The transaction wasn't confirmed before it expired. Check your wallet's activity, then try again."
      );
    }
    await new Promise((resolve) => setTimeout(resolve, CONFIRM_POLL_MS));
  }
}
