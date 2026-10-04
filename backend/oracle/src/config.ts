import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface Bounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export interface Region {
  id: number;
  name: string;
  bounds: Bounds;
}

export interface Label {
  name: string;
  role: "responder" | "contributor" | "admin";
}

export interface Config {
  port: number;
  corsOrigins: string[];
  usgsFeedUrl: string;
  pollIntervalMs: number;
  pollEnabled: boolean;
  minMagnitude: number;
  classifierUrl: string;
  mockClassifier: boolean;
  mockChain: boolean;
  mockThreshold: number;
  mockPayoutLamports: number;
  mockConfirmMs: number;
  rpcUrl: string;
  oracleKeypairPath: string;
  programId: string | null;
  poolAddress: string | null;
  vaultAddress: string | null;
  dataFile: string;
  region: Region;
  labels: Record<string, Label>;
}

const str = (name: string, fallback: string) => process.env[name]?.trim() || fallback;
const optional = (name: string) => process.env[name]?.trim() || null;
const bool = (name: string, fallback: boolean) => {
  const v = process.env[name]?.trim().toLowerCase();
  return v ? v === "true" || v === "1" : fallback;
};
const num = (name: string, fallback: number) => {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const v = Number(raw);
  if (!Number.isFinite(v)) throw new Error(`Env ${name} must be a number, got "${raw}"`);
  return v;
};

const poolConfigPath = fileURLToPath(new URL("../pool.config.json", import.meta.url));

export function loadConfig(): Config {
  const pool = JSON.parse(readFileSync(poolConfigPath, "utf8")) as {
    region: Region;
    labels: Record<string, Label>;
  };
  return {
    port: num("PORT", 3001),
    // Vite dev server (5173) and preview/Next.js (3000) by default.
    corsOrigins: str("CORS_ORIGIN", "http://localhost:5173,http://localhost:3000")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),
    usgsFeedUrl: str(
      "USGS_FEED_URL",
      "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson",
    ),
    pollIntervalMs: num("POLL_INTERVAL_MS", 30_000),
    pollEnabled: bool("POLL_ENABLED", true),
    minMagnitude: num("MIN_MAGNITUDE", 5.0),
    classifierUrl: str("CLASSIFIER_URL", "http://localhost:8000"),
    mockClassifier: bool("MOCK_CLASSIFIER", true),
    mockChain: bool("MOCK_CHAIN", true),
    mockThreshold: num("MOCK_THRESHOLD", 70),
    mockPayoutLamports: num("MOCK_PAYOUT_LAMPORTS", 100_000_000),
    mockConfirmMs: num("MOCK_CONFIRM_MS", 1000),
    rpcUrl: str("RPC_URL", "https://api.devnet.solana.com"),
    oracleKeypairPath: str("ORACLE_KEYPAIR_PATH", "./oracle-keypair.json"),
    programId: optional("PROGRAM_ID"),
    poolAddress: optional("POOL_ADDRESS"),
    vaultAddress: optional("VAULT_ADDRESS"),
    dataFile: str("DATA_FILE", "./data/events.json"),
    region: pool.region,
    labels: pool.labels,
  };
}
