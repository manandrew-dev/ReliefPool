// Sets up the demo pool from a config file (docs/api.md §5.6): initialize_pool, then the
// responders in order, then one contribution per contributor. Safe to run again: each step
// is skipped if it is already done.
//
//   npx tsx scripts/setup-demo-pool.ts [config]          (default: demo-pool.json)
//
// Env: RPC_URL (default devnet), ADMIN_KEYPAIR (default ~/.config/solana/id.json),
// WALLET_DIR (default ~/.config/solana/reliefpool-demo). Responder and contributor keypairs
// live in WALLET_DIR, outside the repo, and are generated on first run.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import * as anchor from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import idl from "../../../idl/reliefpool.json";
import type { Reliefpool } from "../../../idl/reliefpool";

interface Config {
  regionId: number;
  threshold: number;
  payoutCapLamports: number;
  oracle: string;
  responders: { name: string; shareBps: number }[];
  contributors: { name: string; lamports: number }[];
}

const home = (p: string) => p.replace(/^~(?=\/)/, homedir());
const rpcUrl = process.env.RPC_URL ?? "https://api.devnet.solana.com";
const adminPath = home(process.env.ADMIN_KEYPAIR ?? "~/.config/solana/id.json");
const walletDir = home(process.env.WALLET_DIR ?? "~/.config/solana/reliefpool-demo");
const config = JSON.parse(readFileSync(resolve(process.argv[2] ?? "demo-pool.json"), "utf8")) as Config;

const readKeypair = (path: string) =>
  Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8")) as number[]));

// The keypair for a named wallet, generated the first time.
function wallet(name: string): Keypair {
  const path = join(walletDir, `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`);
  if (existsSync(path)) return readKeypair(path);
  mkdirSync(walletDir, { recursive: true, mode: 0o700 });
  const kp = Keypair.generate();
  writeFileSync(path, JSON.stringify(Array.from(kp.secretKey)), { mode: 0o600 });
  console.log(`generated ${name}: ${kp.publicKey.toBase58()} (${path})`);
  return kp;
}

async function main() {
  const admin = readKeypair(adminPath);
  const connection = new anchor.web3.Connection(rpcUrl, "confirmed");
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(admin), {
    commitment: "confirmed",
  });
  const program = new anchor.Program(idl as Reliefpool, provider);
  const seed = (...parts: (Buffer | Uint8Array)[]) =>
    PublicKey.findProgramAddressSync(parts, program.programId)[0];

  const regionId = Buffer.alloc(2);
  regionId.writeUInt16LE(config.regionId);
  const pool = seed(Buffer.from("pool"), admin.publicKey.toBuffer(), regionId);
  const vault = seed(Buffer.from("vault"), pool.toBuffer());
  console.log(`program ${program.programId.toBase58()} on ${rpcUrl}`);
  console.log(`admin   ${admin.publicKey.toBase58()}`);

  if (await connection.getAccountInfo(pool)) {
    console.log(`pool exists: ${pool.toBase58()}`);
  } else {
    await program.methods
      .initializePool(
        config.regionId,
        config.threshold,
        new anchor.BN(config.payoutCapLamports),
        new PublicKey(config.oracle),
      )
      .accountsPartial({ admin: admin.publicKey, pool, vault })
      .rpc();
    console.log(`initialized pool ${pool.toBase58()}`);
  }

  const labels: Record<string, { name: string; role: "responder" | "contributor" }> = {};

  const registered = (await program.account.pool.fetch(pool)).responders.map((r) => r.wallet.toBase58());
  for (const r of config.responders) {
    const address = wallet(r.name).publicKey;
    labels[address.toBase58()] = { name: r.name, role: "responder" };
    if (registered.includes(address.toBase58())) continue;
    await program.methods
      .registerResponder(address, r.shareBps)
      .accountsPartial({ admin: admin.publicKey, pool })
      .rpc();
    console.log(`registered ${r.name} at ${r.shareBps} bps`);
  }

  for (const c of config.contributors) {
    const kp = wallet(c.name);
    labels[kp.publicKey.toBase58()] = { name: c.name, role: "contributor" };
    const contribution = seed(Buffer.from("contribution"), pool.toBuffer(), kp.publicKey.toBuffer());
    const done = await program.account.contribution.fetchNullable(contribution);
    const remaining = c.lamports - (done?.amount.toNumber() ?? 0);
    if (remaining <= 0) continue;
    // Contribution rent and fees on top of the amount itself.
    const needed = remaining + 0.01 * LAMPORTS_PER_SOL;
    const have = await connection.getBalance(kp.publicKey);
    if (have < needed) {
      console.log(
        `skipped ${c.name}: holds ${have / LAMPORTS_PER_SOL} SOL, needs ${needed / LAMPORTS_PER_SOL}. ` +
          `Send SOL to ${kp.publicKey.toBase58()} and run again.`,
      );
      continue;
    }
    await program.methods
      .contribute(new anchor.BN(remaining))
      .accountsPartial({ contributor: kp.publicKey, pool, vault, contribution })
      .signers([kp])
      .rpc();
    console.log(`${c.name} contributed ${remaining / LAMPORTS_PER_SOL} SOL`);
  }

  const vaultBalance = await connection.getBalance(vault);
  console.log(`\nvault holds ${vaultBalance / LAMPORTS_PER_SOL} SOL`);
  console.log("\nFor backend/oracle/.env:");
  console.log(`PROGRAM_ID=${program.programId.toBase58()}`);
  console.log(`POOL_ADDRESS=${pool.toBase58()}`);
  console.log(`VAULT_ADDRESS=${vault.toBase58()}`);
  console.log('\nFor "labels" in backend/oracle/pool.config.json:');
  console.log(JSON.stringify(labels, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
