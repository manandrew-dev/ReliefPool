import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";
import type { Reliefpool } from "../../../idl/reliefpool";

// Acceptance criteria of issues #3–#7, against docs/api.md §5.

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
const program = anchor.workspace.Reliefpool as Program<Reliefpool>;
const connection = provider.connection;
const admin = provider.wallet as anchor.Wallet;

const CAP = 100_000_000; // 0.1 SOL, docs/api.md §5.6
const THRESHOLD = 70;

const u16le = (n: number) => {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
};
const pda = (seeds: (Buffer | Uint8Array)[]) =>
  PublicKey.findProgramAddressSync(seeds, program.programId)[0];
const poolPda = (adminKey: PublicKey, regionId: number) =>
  pda([Buffer.from("pool"), adminKey.toBuffer(), u16le(regionId)]);
const vaultPda = (pool: PublicKey) => pda([Buffer.from("vault"), pool.toBuffer()]);
const payoutPda = (pool: PublicKey, eventId: string) =>
  pda([Buffer.from("payout"), pool.toBuffer(), Buffer.from(eventId)]);
const contributionPda = (pool: PublicKey, contributor: PublicKey) =>
  pda([Buffer.from("contribution"), pool.toBuffer(), contributor.toBuffer()]);

async function funded(sol = 2): Promise<Keypair> {
  const kp = Keypair.generate();
  const sig = await connection.requestAirdrop(kp.publicKey, sol * LAMPORTS_PER_SOL);
  await connection.confirmTransaction({ signature: sig, ...(await connection.getLatestBlockhash()) });
  return kp;
}

// Same commitment as the provider's .rpc() confirmations, so reads see the last transaction.
const balance = (key: PublicKey) => connection.getBalance(key);

// Asserts that `p` fails with the named program error.
async function failsWith(p: Promise<unknown>, code: string) {
  try {
    await p;
  } catch (err) {
    const name = (err as anchor.AnchorError).error?.errorCode?.code;
    assert.equal(name, code, String(err));
    return;
  }
  assert.fail(`expected ${code}`);
}

async function fails(p: Promise<unknown>) {
  try {
    await p;
  } catch {
    return;
  }
  assert.fail("expected the transaction to fail");
}

async function createPool(regionId: number, oracle: PublicKey, cap = CAP, threshold = THRESHOLD) {
  const pool = poolPda(admin.publicKey, regionId);
  await program.methods
    .initializePool(regionId, threshold, new anchor.BN(cap), oracle)
    .accountsPartial({ admin: admin.publicKey, pool, vault: vaultPda(pool) })
    .rpc();
  return pool;
}

const register = (pool: PublicKey, wallet: PublicKey, shareBps: number, signer?: Keypair) =>
  program.methods
    .registerResponder(wallet, shareBps)
    .accountsPartial({ admin: signer?.publicKey ?? admin.publicKey, pool })
    .signers(signer ? [signer] : [])
    .rpc();

const contribute = (pool: PublicKey, contributor: Keypair, lamports: number) =>
  program.methods
    .contribute(new anchor.BN(lamports))
    .accountsPartial({
      contributor: contributor.publicKey,
      pool,
      vault: vaultPda(pool),
      contribution: contributionPda(pool, contributor.publicKey),
    })
    .signers([contributor])
    .rpc();

const payout = (
  pool: PublicKey,
  oracle: Keypair,
  eventId: string,
  score: number,
  wallets: PublicKey[],
  payoutRecord = payoutPda(pool, eventId),
) =>
  program.methods
    .triggerPayout(eventId, score)
    .accountsStrict({
      pool,
      vault: vaultPda(pool),
      payoutRecord,
      oracle: oracle.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .remainingAccounts(wallets.map((pubkey) => ({ pubkey, isSigner: false, isWritable: true })))
    .signers([oracle])
    .rpc();

describe("reliefpool", () => {
  let oracle: Keypair;
  let pool: PublicKey;
  const responderA = Keypair.generate().publicKey;
  const responderB = Keypair.generate().publicKey;
  let vaultRent: number;

  before(async () => {
    oracle = await funded();
    vaultRent = await connection.getMinimumBalanceForRentExemption(8);
  });

  describe("initialize_pool (#3)", () => {
    it("stores the pool fields and creates the vault", async () => {
      pool = await createPool(1, oracle.publicKey);
      const p = await program.account.pool.fetch(pool);
      assert.ok(p.admin.equals(admin.publicKey));
      assert.ok(p.oracle.equals(oracle.publicKey));
      assert.equal(p.regionId, 1);
      assert.equal(p.threshold, THRESHOLD);
      assert.equal(p.payoutCapLamports.toNumber(), CAP);
      assert.deepEqual(p.responders, []);
      assert.equal(p.totalContributed.toNumber(), 0);
      assert.equal(p.totalPaidOut.toNumber(), 0);
      const vault = await connection.getAccountInfo(vaultPda(pool));
      assert.ok(vault?.owner.equals(program.programId), "vault is owned by the program");
      assert.equal(vault?.lamports, vaultRent);
    });

    it("fails when initialized twice with the same seeds", async () => {
      await fails(createPool(1, oracle.publicKey));
    });

    it("rejects a threshold over 100", async () => {
      await failsWith(createPool(90, oracle.publicKey, CAP, 101), "InvalidThreshold");
    });
  });

  describe("register_responder (#4)", () => {
    it("rejects a signer other than the admin", async () => {
      const stranger = await funded(1);
      await failsWith(register(pool, responderA, 6000, stranger), "Unauthorized");
    });

    it("appends responders in order", async () => {
      await register(pool, responderA, 6000);
      await register(pool, responderB, 4000);
      const p = await program.account.pool.fetch(pool);
      assert.deepEqual(
        p.responders.map((r) => [r.wallet.toBase58(), r.shareBps]),
        [
          [responderA.toBase58(), 6000],
          [responderB.toBase58(), 4000],
        ],
      );
    });

    it("rejects the same wallet twice", async () => {
      const other = await createPool(91, oracle.publicKey);
      await register(other, responderA, 5000);
      await failsWith(register(other, responderA, 5000), "DuplicateResponder");
    });

    it("rejects shares that would go over 10,000", async () => {
      const other = await createPool(92, oracle.publicKey);
      await register(other, responderA, 6000);
      await failsWith(register(other, responderB, 4001), "InvalidShares");
    });

    it("rejects a sixth responder", async () => {
      const other = await createPool(93, oracle.publicKey);
      for (let i = 0; i < 5; i++) await register(other, Keypair.generate().publicKey, 2000);
      await failsWith(register(other, Keypair.generate().publicKey, 0), "TooManyResponders");
    });
  });

  describe("contribute (#5)", () => {
    it("moves lamports into the vault and keeps running totals", async () => {
      const c1 = await funded();
      const c2 = await funded();
      const before = await balance(vaultPda(pool));
      await contribute(pool, c1, 300_000_000);
      await contribute(pool, c2, 200_000_000);
      await contribute(pool, c1, 100_000_000);

      assert.equal((await balance(vaultPda(pool))) - before, 600_000_000);
      const r1 = await program.account.contribution.fetch(contributionPda(pool, c1.publicKey));
      const r2 = await program.account.contribution.fetch(contributionPda(pool, c2.publicKey));
      assert.equal(r1.amount.toNumber(), 400_000_000);
      assert.ok(r1.contributor.equals(c1.publicKey));
      assert.equal(r2.amount.toNumber(), 200_000_000);
      const p = await program.account.pool.fetch(pool);
      assert.equal(p.totalContributed.toNumber(), 600_000_000);
    });

    it("rejects 0 lamports", async () => {
      await failsWith(contribute(pool, await funded(1), 0), "ZeroAmount");
    });
  });

  describe("trigger_payout guards (#6)", () => {
    it("rejects a signer other than the pool oracle", async () => {
      const impostor = await funded(1);
      await failsWith(payout(pool, impostor, "ev-impostor", 90, [responderA, responderB]), "Unauthorized");
    });

    it("rejects a score below the threshold", async () => {
      await failsWith(payout(pool, oracle, "ev-low", THRESHOLD - 1, [responderA, responderB]), "BelowThreshold");
    });

    it("rejects an event ID over 32 bytes", async () => {
      // No PDA exists for a 33-byte seed, so the client cannot derive one; pass any address.
      const anyAddress = Keypair.generate().publicKey;
      try {
        await payout(pool, oracle, "x".repeat(33), 90, [responderA, responderB], anyAddress);
        assert.fail("expected the transaction to fail");
      } catch (err) {
        assert.include(String(err), "Length of the seed is too long");
      }
    });
  });

  describe("trigger_payout split and transfers (#7)", () => {
    it("pays the cap 60/40, records it, and costs under 0.01 SOL in fees", async () => {
      const vaultBefore = await balance(vaultPda(pool));
      const sig = await payout(pool, oracle, "ev-1", THRESHOLD, [responderA, responderB]);

      assert.equal(await balance(responderA), 60_000_000);
      assert.equal(await balance(responderB), 40_000_000);
      assert.equal(vaultBefore - (await balance(vaultPda(pool))), CAP);

      const record = await program.account.payoutRecord.fetch(payoutPda(pool, "ev-1"));
      assert.ok(record.pool.equals(pool));
      assert.equal(record.eventId, "ev-1");
      assert.equal(record.riskScore, THRESHOLD);
      assert.equal(record.amount.toNumber(), CAP);
      assert.ok(record.timestamp.toNumber() > 0);
      assert.equal((await program.account.pool.fetch(pool)).totalPaidOut.toNumber(), CAP);

      await connection.confirmTransaction(
        { signature: sig, ...(await connection.getLatestBlockhash()) },
        "confirmed",
      );
      const tx = await connection.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
      assert.ok(tx!.meta!.fee < 0.01 * LAMPORTS_PER_SOL);
    });

    it("refuses to pay the same event ID twice", async () => {
      await fails(payout(pool, oracle, "ev-1", 95, [responderA, responderB]));
    });

    it("rejects responder wallets that do not match the pool's list and order", async () => {
      await failsWith(payout(pool, oracle, "ev-order", 90, [responderB, responderA]), "InvalidShares");
      await failsWith(payout(pool, oracle, "ev-short", 90, [responderA]), "InvalidShares");
      const stranger = Keypair.generate().publicKey;
      await failsWith(payout(pool, oracle, "ev-stranger", 90, [responderA, stranger]), "InvalidShares");
    });

    it("rejects shares that do not total 10,000", async () => {
      const other = await createPool(94, oracle.publicKey);
      await register(other, responderA, 6000);
      await contribute(other, await funded(), 500_000_000);
      await failsWith(payout(other, oracle, "ev-shares", 90, [responderA]), "InvalidShares");
    });

    it("pays what the vault can spare when it holds less than the cap, keeping rent and rounding leftovers", async () => {
      const other = await createPool(95, oracle.publicKey);
      const a = Keypair.generate().publicKey;
      const b = Keypair.generate().publicKey;
      await register(other, a, 6000);
      await register(other, b, 4000);
      await contribute(other, await funded(), 50_000_001);

      await payout(other, oracle, "ev-partial", 90, [a, b]);
      // 50,000,001 × 60% = 30,000,000.6 and × 40% = 20,000,000.4; the 1 lamport left stays.
      assert.equal(await balance(a), 30_000_000);
      assert.equal(await balance(b), 20_000_000);
      assert.equal(await balance(vaultPda(other)), vaultRent + 1);
      const record = await program.account.payoutRecord.fetch(payoutPda(other, "ev-partial"));
      assert.equal(record.amount.toNumber(), 50_000_000);
    });

    it("fails with InsufficientFunds when only the rent-exempt minimum is left", async () => {
      const other = await createPool(96, oracle.publicKey);
      await register(other, responderA, 10_000);
      await failsWith(payout(other, oracle, "ev-empty", 90, [responderA]), "InsufficientFunds");
    });
  });
});
