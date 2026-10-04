// Runtime configuration from Vite env vars. See .env.example.

export const config = {
  rpcUrl: import.meta.env.VITE_RPC_URL ?? "https://api.devnet.solana.com",
  oracleUrl: import.meta.env.VITE_ORACLE_URL ?? "http://localhost:3001/api",
  // Serve oracle responses from fixtures until the backend is ready.
  // Only the exact string "false" turns this off.
  oracleMock: import.meta.env.VITE_ORACLE_MOCK !== "false",
  // Placeholder until the program is deployed to devnet (#8).
  programId:
    import.meta.env.VITE_PROGRAM_ID ?? "REPLACE_WITH_DEPLOYED_PROGRAM_ID",
};
