import { SolanaProvider } from "@solana/react-hooks";
import { PropsWithChildren } from "react";
import { autoDiscover, createClient } from "@solana/client";
import { config } from "./config";

const client = createClient({
  endpoint: config.rpcUrl,
  walletConnectors: autoDiscover(),
});

export function Providers({ children }: PropsWithChildren) {
  return <SolanaProvider client={client}>{children}</SolanaProvider>;
}
