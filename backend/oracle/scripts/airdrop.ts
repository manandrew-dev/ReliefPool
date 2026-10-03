// Requests devnet SOL for the oracle wallet, which pays transaction fees.
// The public devnet faucet is rate-limited; if this fails, use https://faucet.solana.com
import { readFileSync } from "node:fs";
import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import "dotenv/config";

const path = process.env.ORACLE_KEYPAIR_PATH?.trim() || "./oracle-keypair.json";
const rpcUrl = process.env.RPC_URL?.trim() || "https://api.devnet.solana.com";
const sol = Number(process.argv[2] ?? 1);

const secret = Uint8Array.from(JSON.parse(readFileSync(path, "utf8")) as number[]);
const keypair = Keypair.fromSecretKey(secret);
const connection = new Connection(rpcUrl, "confirmed");

console.log(`Requesting ${sol} SOL for ${keypair.publicKey.toBase58()} on ${rpcUrl}`);
try {
  const signature = await connection.requestAirdrop(keypair.publicKey, sol * LAMPORTS_PER_SOL);
  const latest = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature, ...latest }, "confirmed");
} catch (err) {
  console.error(`Airdrop failed: ${err instanceof Error ? err.message : err}`);
  console.error("Try https://faucet.solana.com with the public key above.");
  process.exit(1);
}
const balance = await connection.getBalance(keypair.publicKey);
console.log(`Balance: ${balance / LAMPORTS_PER_SOL} SOL`);
