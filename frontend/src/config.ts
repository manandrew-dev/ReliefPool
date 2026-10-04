// Runtime configuration from Vite env vars. See .env.example.

import { RELIEFPOOL_PROGRAM_ADDRESS } from "./program/generated";

// Older .env files carry this placeholder from before the deploy.
const PROGRAM_ID_PLACEHOLDER = "REPLACE_WITH_DEPLOYED_PROGRAM_ID";
const programIdEnv = import.meta.env.VITE_PROGRAM_ID;

export const config = {
  rpcUrl: import.meta.env.VITE_RPC_URL ?? "https://api.devnet.solana.com",
  oracleUrl: import.meta.env.VITE_ORACLE_URL ?? "http://localhost:3001/api",
  // Serve oracle responses from fixtures, and chain data from the mock
  // chain that matches them. Only the exact string "false" turns this off.
  oracleMock: import.meta.env.VITE_ORACLE_MOCK !== "false",
  // The deployed program; defaults to the address in idl/reliefpool.json.
  programId:
    programIdEnv && programIdEnv !== PROGRAM_ID_PLACEHOLDER
      ? programIdEnv
      : RELIEFPOOL_PROGRAM_ADDRESS,
};
