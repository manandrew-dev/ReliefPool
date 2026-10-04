import { useClusterState } from "@solana/react-hooks";
import type { PoolResponse } from "../api/types";
import { config } from "../config";

// ReliefPool runs on devnet only. Returns why the page is not on devnet, or
// null when it is. This checks the app's RPC endpoint and the cluster the
// backend reports, and that both use the same program. The wallet's own
// network cannot be read from the wallet session, so contribute() sends
// through the app's RPC instead (see src/program/devnet.ts).
export function useNetworkProblem(poolInfo: PoolResponse | undefined) {
  const { endpoint } = useClusterState();

  let host = "";
  try {
    host = new URL(endpoint).hostname;
  } catch {
    // Leave host empty so the check below reports it.
  }
  if (!host.includes("devnet")) {
    return `The app's Solana RPC (${endpoint}) is not a devnet endpoint.`;
  }
  if (poolInfo && poolInfo.cluster !== "devnet") {
    return `The backend reports cluster "${poolInfo.cluster}", not devnet.`;
  }
  // null before deploy (api.md 3.3); the pool cards cover that case.
  if (poolInfo?.programId && poolInfo.programId !== config.programId) {
    return `The backend uses program ${poolInfo.programId}, but this app is set to ${config.programId} (VITE_PROGRAM_ID).`;
  }
  return null;
}
