import { useClusterState } from "@solana/react-hooks";
import type { PoolResponse } from "../api/types";

// ReliefPool runs on devnet only. Returns why the page is not on devnet, or
// null when it is. This checks the app's RPC endpoint and the cluster the
// backend reports. The wallet's own network cannot be read from the wallet
// session, so contribute() must send through the app's RPC instead (see the
// TODO there).
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
  return null;
}
