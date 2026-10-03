import { randomBytes } from "node:crypto";
import bs58 from "bs58";
import type { DependencyStatus } from "./types.js";

export interface Confirmation {
  confirmedAt: string;
  amountLamports: number;
}

export type SignatureState = "confirmed" | "failed" | "unknown";

// Everything the oracle needs from the Solana program (docs/api.md §5).
// MockChain stands in until Alice's IDL is ready; the real client implements the same interface.
export interface Chain {
  status(): Promise<DependencyStatus>;
  getThreshold(): Promise<number>;
  payoutExists(eventId: string): Promise<boolean>;
  // Sends trigger_payout and returns the signature without waiting for confirmation.
  triggerPayout(eventId: string, riskScore: number): Promise<string>;
  // Resolves once confirmed; rejects with a ChainError if the transaction failed.
  waitForConfirmation(signature: string, eventId: string): Promise<Confirmation>;
  signatureState(signature: string): Promise<SignatureState>;
  explorerUrl(signature: string): string;
}

// An on-chain failure. `name` is the program error (docs/api.md §5.4), e.g. "BelowThreshold".
export class ChainError extends Error {
  constructor(readonly errorName: string, message?: string) {
    super(message ?? errorName);
  }
}

export function devnetExplorerUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

export interface MockChainOptions {
  threshold: number;
  payoutLamports: number;
  confirmMs: number;
}

// Behaves like the program for the oracle's purposes: enforces the threshold
// and refuses a second payout for the same event ID.
export class MockChain implements Chain {
  private paidEvents = new Set<string>();
  private signatures = new Map<string, SignatureState>();

  constructor(private readonly opts: MockChainOptions) {}

  async status(): Promise<DependencyStatus> {
    return "mock";
  }

  async getThreshold(): Promise<number> {
    return this.opts.threshold;
  }

  async payoutExists(eventId: string): Promise<boolean> {
    return this.paidEvents.has(eventId);
  }

  async triggerPayout(eventId: string, riskScore: number): Promise<string> {
    if (riskScore < this.opts.threshold) throw new ChainError("BelowThreshold");
    if (this.paidEvents.has(eventId)) {
      throw new ChainError("PayoutAlreadyExists", `Payout record for ${eventId} already exists`);
    }
    this.paidEvents.add(eventId);
    const signature = bs58.encode(randomBytes(64));
    this.signatures.set(signature, "confirmed");
    return signature;
  }

  async waitForConfirmation(_signature: string, _eventId: string): Promise<Confirmation> {
    await new Promise((r) => setTimeout(r, this.opts.confirmMs));
    return {
      confirmedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      amountLamports: this.opts.payoutLamports,
    };
  }

  async signatureState(signature: string): Promise<SignatureState> {
    // A fresh process has no memory of earlier mock signatures; treat them as confirmed.
    return this.signatures.get(signature) ?? "confirmed";
  }

  explorerUrl(signature: string): string {
    return devnetExplorerUrl(signature);
  }
}
