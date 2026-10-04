import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { Idl } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { ChainError } from "../src/chain.js";
import {
  SolanaChain,
  checkIdl,
  errorNameFromLogs,
  loadIdl,
  payoutRecordAddress,
  vaultAddress,
} from "../src/solana.js";

// Shaped like docs/api.md §5; replace with the real IDL once it is committed.
const idlPath = fileURLToPath(new URL("./fixtures/reliefpool.idl.json", import.meta.url));
const idl = loadIdl(idlPath);
const programId = new PublicKey(idl.address);
const pool = Keypair.generate().publicKey;
const responders = [Keypair.generate().publicKey, Keypair.generate().publicKey];

const anchorErrorLogs = (code: string, number: number) => [
  `Program ${programId.toBase58()} invoke [1]`,
  "Program log: Instruction: TriggerPayout",
  `Program log: AnchorError thrown in programs/reliefpool/src/instructions/trigger_payout.rs:40. Error Code: ${code}. Error Number: ${number}. Error Message: Vault cannot pay.`,
  `Program ${programId.toBase58()} consumed 5000 of 200000 compute units`,
  `Program ${programId.toBase58()} failed: custom program error: 0x${number.toString(16)}`,
];

// A SolanaChain whose RPC calls are replaced by the given stubs.
function stubbedChain(rpc: Record<string, unknown> = {}, amount = 100_000_000) {
  const oracle = Keypair.generate();
  const chain = new SolanaChain({ rpcUrl: "http://127.0.0.1:1", idl, poolAddress: pool.toBase58(), oracle });
  const internals = chain as unknown as {
    connection: Record<string, unknown>;
    accounts: Record<string, { fetch: () => Promise<unknown> }>;
  };
  internals.accounts.pool.fetch = async () => ({
    threshold: 70,
    responders: responders.map((wallet, i) => ({ wallet, shareBps: i === 0 ? 6000 : 4000 })),
  });
  internals.accounts.payoutRecord.fetch = async () => ({ amount: { toNumber: () => amount } });
  Object.assign(internals.connection, {
    getLatestBlockhash: async () => ({
      blockhash: Keypair.generate().publicKey.toBase58(),
      lastValidBlockHeight: 1000,
    }),
    ...rpc,
  });
  return { chain, oracle };
}

test("the fixture IDL passes the contract check", () => {
  assert.deepEqual(checkIdl(idl), []);
});

test("checkIdl reports what the oracle relies on but the IDL lacks", () => {
  const broken = structuredClone(idl) as Idl;
  const poolType = broken.types!.find((t) => t.name === "Pool")!.type as { fields: { name: string }[] };
  poolType.fields = poolType.fields.filter((f) => f.name !== "responders");
  broken.instructions[0].args[0].type = "bytes";
  const problems = checkIdl(broken);
  assert.equal(problems.length, 2);
  assert.match(problems[0], /trigger_payout args/);
  assert.match(problems[1], /Pool has no responders/);
});

test("PDAs use the seeds from api.md §5.3", () => {
  const [vault] = PublicKey.findProgramAddressSync([Buffer.from("vault"), pool.toBuffer()], programId);
  assert.ok(vaultAddress(programId, pool).equals(vault));
  const [record] = PublicKey.findProgramAddressSync(
    [Buffer.from("payout"), pool.toBuffer(), Buffer.from("jp-2022-m73-r1")],
    programId,
  );
  assert.ok(payoutRecordAddress(programId, pool, "jp-2022-m73-r1").equals(record));
});

test("errorNameFromLogs reads program errors and repeated payouts", () => {
  assert.equal(errorNameFromLogs(anchorErrorLogs("InsufficientFunds", 6004)), "InsufficientFunds");
  assert.equal(
    errorNameFromLogs(["Allocate: account Address { address: abc, base: None } already in use"]),
    "PAYOUT_ALREADY_EXISTS",
  );
  assert.equal(errorNameFromLogs(["Program log: something else"]), null);
});

test("triggerPayout sends the api.md §5.5 accounts with responders in pool order", async () => {
  let sent: Transaction | undefined;
  const { chain, oracle } = stubbedChain({
    sendRawTransaction: async (raw: Buffer) => {
      sent = Transaction.from(raw);
      return "sig1";
    },
  });
  assert.equal(await chain.triggerPayout("jp-2022-m73-r1", 77), "sig1");

  assert.ok(sent, "a transaction was sent");
  assert.ok(sent.verifySignatures(), "signed by the oracle");
  assert.ok(sent.feePayer?.equals(oracle.publicKey));
  const [ix] = sent.instructions;
  assert.ok(ix.programId.equals(programId));
  const keys = ix.keys.map((k) => k.pubkey.toBase58());
  assert.deepEqual(keys, [
    pool.toBase58(),
    vaultAddress(programId, pool).toBase58(),
    chain.payoutRecord("jp-2022-m73-r1").toBase58(),
    oracle.publicKey.toBase58(),
    SystemProgram.programId.toBase58(),
    ...responders.map((r) => r.toBase58()),
  ]);
  assert.ok(ix.keys.slice(5).every((k) => k.isWritable && !k.isSigner));
  // Borsh: 8-byte discriminator, u32 length + UTF-8 event ID, u8 risk score.
  const data = ix.data;
  assert.deepEqual([...data.subarray(0, 8)], idl.instructions[0].discriminator);
  assert.equal(data.readUInt32LE(8), 14);
  assert.equal(data.subarray(12, 26).toString("utf8"), "jp-2022-m73-r1");
  assert.equal(data[26], 77);
});

test("a preflight rejection becomes a ChainError with the program error name", async () => {
  const { chain } = stubbedChain({
    sendRawTransaction: async () => {
      throw Object.assign(new Error("Simulation failed"), {
        logs: anchorErrorLogs("InsufficientFunds", 6004),
      });
    },
  });
  await assert.rejects(
    chain.triggerPayout("e1", 90),
    (err) => err instanceof ChainError && err.errorName === "InsufficientFunds",
  );
});

test("a confirmed payout reports PayoutRecord.amount and the block time", async () => {
  const { chain } = stubbedChain(
    {
      sendRawTransaction: async () => "sig2",
      confirmTransaction: async () => ({ value: { err: null } }),
      getTransaction: async () => ({ blockTime: 1_790_000_000, meta: { logMessages: [] } }),
    },
    60_000_000,
  );
  const signature = await chain.triggerPayout("e2", 90);
  const result = await chain.waitForConfirmation(signature, "e2");
  assert.equal(result.amountLamports, 60_000_000);
  assert.equal(result.confirmedAt, new Date(1_790_000_000_000).toISOString().replace(/\.\d{3}Z$/, "Z"));
});

test("a payout that fails on-chain rejects with the program error name", async () => {
  const { chain } = stubbedChain({
    sendRawTransaction: async () => "sig3",
    confirmTransaction: async () => ({ value: { err: { InstructionError: [0, { Custom: 6004 }] } } }),
    getTransaction: async () => ({
      blockTime: 1_790_000_000,
      meta: { logMessages: anchorErrorLogs("InsufficientFunds", 6004) },
    }),
  });
  const signature = await chain.triggerPayout("e3", 90);
  await assert.rejects(
    chain.waitForConfirmation(signature, "e3"),
    (err) => err instanceof ChainError && err.errorName === "InsufficientFunds",
  );
});
