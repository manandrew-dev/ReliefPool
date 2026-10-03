// Creates the oracle signing keypair in the Solana CLI format (a JSON array of secret key bytes).
// The file is gitignored (NFR-4). Share only the printed public key.
import { existsSync, writeFileSync } from "node:fs";
import { Keypair } from "@solana/web3.js";
import "dotenv/config";

const path = process.env.ORACLE_KEYPAIR_PATH?.trim() || "./oracle-keypair.json";

if (existsSync(path)) {
  console.error(`${path} already exists; refusing to overwrite the oracle key.`);
  process.exit(1);
}

const keypair = Keypair.generate();
writeFileSync(path, JSON.stringify([...keypair.secretKey]), { mode: 0o600 });
console.log(`Wrote ${path}`);
console.log(`Oracle public key: ${keypair.publicKey.toBase58()}`);
