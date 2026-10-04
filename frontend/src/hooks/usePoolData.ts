import { toAddress } from "@solana/client";
import { useCallback } from "react";
import * as oracle from "../api/oracle";
import * as program from "../program/client";
import { useAsyncData } from "./useAsyncData";

// Chain data is also refreshed after every new payout (see useEventData);
// this interval is the backstop.
const CHAIN_POLL_MS = 10_000;

// Shown instead of chain data while GET /pool has no addresses yet. This is
// a normal state before deploy, not an error.
export const POOL_NOT_DEPLOYED_MESSAGE =
  "Pool not deployed yet. This fills in once the program is on devnet.";

// Everything the pool cards need (docs/api.md section 6): addresses, labels
// and region from the backend, then pool state, vault balance and
// contributions from the chain. Each chain read has its own state so one
// failure only affects the cards it feeds.
export function usePoolData() {
  const info = useAsyncData("pool-info", oracle.getPool);

  // null before deploy (api.md 3.3): the chain reads below stay off.
  const poolAddress = info.data?.poolAddress;
  const vaultAddress = info.data?.vaultAddress;
  const notDeployed =
    info.data !== undefined && (!poolAddress || !vaultAddress);

  const pool = useAsyncData(
    poolAddress ? `pool:${poolAddress}` : null,
    () => program.getPool(toAddress(poolAddress!)),
    CHAIN_POLL_MS
  );
  const vaultBalance = useAsyncData(
    vaultAddress ? `vault:${vaultAddress}` : null,
    () => program.getVaultBalance(toAddress(vaultAddress!)),
    CHAIN_POLL_MS
  );
  const contributions = useAsyncData(
    poolAddress ? `contributions:${poolAddress}` : null,
    () => program.getContributions(toAddress(poolAddress!)),
    CHAIN_POLL_MS
  );

  const { refresh: refreshPool } = pool;
  const { refresh: refreshVault } = vaultBalance;
  const { refresh: refreshContributions } = contributions;
  const refreshChain = useCallback(() => {
    refreshPool();
    refreshVault();
    refreshContributions();
  }, [refreshPool, refreshVault, refreshContributions]);

  return {
    info,
    pool,
    vaultBalance,
    contributions,
    refreshChain,
    notDeployed,
  };
}

export type PoolData = ReturnType<typeof usePoolData>;
