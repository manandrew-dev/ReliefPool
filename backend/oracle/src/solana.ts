import { readFileSync } from "node:fs";
import { AnchorError, Program, type Idl } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  type AccountMeta,
  type Commitment,
} from "@solana/web3.js";
import {
  ChainError,
  devnetExplorerUrl,
  type Chain,
  type Confirmation,
  type SignatureState,
} from "./chain.js";
import type { DependencyStatus } from "./types.js";

// The real program client (docs/api.md §5). Everything about the program's shape is read
// from its IDL, so a rebuilt IDL is picked up without code changes as long as checkIdl passes.

const STATUS_TIMEOUT_MS = 1500;
// How long to wait for a signature we have no blockhash for (e.g. sent before a restart).
const POLL_CONFIRM_MS = 60_000;

export interface SolanaChainOptions {
  rpcUrl: string;
  idl: Idl;
  poolAddress: string;
  oracle: Keypair;
}

interface PoolAccount {
  threshold: number;
  responders: { wallet: PublicKey; shareBps: number }[];
}

interface AccountFetcher {
  fetch(address: PublicKey, commitment?: Commitment): Promise<unknown>;
}

interface PayoutRecordAccount {
  amount: { toNumber(): number };
}

export class SolanaChain implements Chain {
  private readonly connection: Connection;
  private readonly program: Program;
  // Account clients keyed by camelCase account name; untyped because the IDL is loaded at runtime.
  private readonly accounts: Record<string, AccountFetcher>;
  private readonly pool: PublicKey;
  private readonly vault: PublicKey;
  private readonly oracle: Keypair;
  // Blockhash each payout was sent with, so confirmation knows when it has expired.
  private readonly sent = new Map<string, { blockhash: string; lastValidBlockHeight: number }>();

  constructor(opts: SolanaChainOptions) {
    this.connection = new Connection(opts.rpcUrl, "confirmed");
    this.program = new Program(opts.idl, { connection: this.connection });
    this.accounts = this.program.account as unknown as Record<string, AccountFetcher>;
    this.pool = new PublicKey(opts.poolAddress);
    this.vault = vaultAddress(this.program.programId, this.pool);
    this.oracle = opts.oracle;
  }

  get programId(): PublicKey {
    return this.program.programId;
  }

  get vaultAddress(): PublicKey {
    return this.vault;
  }

  async status(): Promise<DependencyStatus> {
    try {
      const info = await withTimeout(this.connection.getAccountInfo(this.pool), STATUS_TIMEOUT_MS);
      return info?.owner.equals(this.programId) ? "ok" : "down";
    } catch {
      return "down";
    }
  }

  async getThreshold(): Promise<number> {
    return (await this.fetchPool()).threshold;
  }

  async payoutExists(eventId: string): Promise<boolean> {
    const info = await this.connection.getAccountInfo(this.payoutRecord(eventId));
    return info !== null;
  }

  async triggerPayout(eventId: string, riskScore: number): Promise<string> {
    const pool = await this.fetchPool();
    const responders: AccountMeta[] = pool.responders.map((r) => ({
      pubkey: r.wallet,
      isSigner: false,
      isWritable: true,
    }));
    const ix = await this.program.methods
      .triggerPayout(eventId, riskScore)
      .accountsStrict({
        pool: this.pool,
        vault: this.vault,
        payoutRecord: this.payoutRecord(eventId),
        oracle: this.oracle.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts(responders)
      .instruction();

    const latest = await this.connection.getLatestBlockhash("confirmed");
    const tx = new Transaction({ feePayer: this.oracle.publicKey, ...latest }).add(ix);
    tx.sign(this.oracle);
    try {
      // Preflight is on, so a program error (e.g. InsufficientFunds) is caught here,
      // before the transaction lands and before the event is marked pending.
      const signature = await this.connection.sendRawTransaction(tx.serialize());
      this.sent.set(signature, latest);
      return signature;
    } catch (err) {
      throw toChainError(err);
    }
  }

  async waitForConfirmation(signature: string, eventId: string): Promise<Confirmation> {
    const sent = this.sent.get(signature);
    this.sent.delete(signature);
    let failed: boolean;
    if (sent) {
      try {
        const res = await this.connection.confirmTransaction({ signature, ...sent }, "confirmed");
        failed = res.value.err !== null;
      } catch {
        // Blockhash expired before the transaction landed.
        throw new ChainError("TRANSACTION_FAILED", `Transaction ${signature} expired`);
      }
    } else {
      failed = (await this.pollSignature(signature)) === "failed";
    }

    const tx = await this.connection.getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (failed) {
      throw new ChainError(errorNameFromLogs(tx?.meta?.logMessages ?? []) ?? "TRANSACTION_FAILED");
    }
    // PayoutRecord.amount is what the program actually sent (docs/api.md §5.5).
    const record = (await this.accounts.payoutRecord.fetch(
      this.payoutRecord(eventId),
      "confirmed",
    )) as PayoutRecordAccount;
    const blockTime = tx?.blockTime ? new Date(tx.blockTime * 1000) : new Date();
    return {
      confirmedAt: blockTime.toISOString().replace(/\.\d{3}Z$/, "Z"),
      amountLamports: record.amount.toNumber(),
    };
  }

  async signatureState(signature: string): Promise<SignatureState> {
    const { value } = await this.connection.getSignatureStatuses([signature], {
      searchTransactionHistory: true,
    });
    const s = value[0];
    if (!s) return "unknown";
    if (s.err) return "failed";
    return s.confirmationStatus === "processed" ? "unknown" : "confirmed";
  }

  explorerUrl(signature: string): string {
    return devnetExplorerUrl(signature);
  }

  payoutRecord(eventId: string): PublicKey {
    return payoutRecordAddress(this.programId, this.pool, eventId);
  }

  private async fetchPool(): Promise<PoolAccount> {
    return (await this.accounts.pool.fetch(this.pool, "confirmed")) as PoolAccount;
  }

  private async pollSignature(signature: string): Promise<SignatureState> {
    const deadline = Date.now() + POLL_CONFIRM_MS;
    while (Date.now() < deadline) {
      const state = await this.signatureState(signature);
      if (state !== "unknown") return state;
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new ChainError("TRANSACTION_FAILED", `Transaction ${signature} was not confirmed`);
  }
}

// PDA seeds from docs/api.md §5.3.
export function vaultAddress(programId: PublicKey, pool: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("vault"), pool.toBuffer()], programId)[0];
}

export function payoutRecordAddress(programId: PublicKey, pool: PublicKey, eventId: string): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("payout"), pool.toBuffer(), Buffer.from(eventId, "utf8")],
    programId,
  )[0];
}

// The program error name (docs/api.md §5.4) from a failed transaction's logs.
export function errorNameFromLogs(logs: string[]): string | null {
  const anchorError = AnchorError.parse(logs);
  if (anchorError) return anchorError.error.errorCode.code;
  // The payout record already exists: the system program refuses to create it again.
  if (logs.some((l) => l.includes("already in use"))) return "PAYOUT_ALREADY_EXISTS";
  return null;
}

function toChainError(err: unknown): ChainError {
  const logs = (err as { logs?: string[] }).logs ?? [];
  const message = err instanceof Error ? err.message : String(err);
  return new ChainError(errorNameFromLogs(logs) ?? "TRANSACTION_FAILED", message);
}

// Checks that the IDL has everything the oracle relies on, so a mismatch with
// docs/api.md §5 shows up at startup instead of on the first payout.
export function checkIdl(idl: Idl): string[] {
  const problems: string[] = [];
  const ix = idl.instructions.find((i) => i.name === "trigger_payout");
  if (!ix) {
    problems.push("instruction trigger_payout is missing");
  } else {
    const args = ix.args.map((a) => `${a.name}: ${JSON.stringify(a.type)}`).join(", ");
    if (args !== `event_id: "string", risk_score: "u8"`) {
      problems.push(`trigger_payout args are (${args}), expected (event_id: string, risk_score: u8)`);
    }
    const accounts = ix.accounts.map((a) => a.name).sort().join(", ");
    const expected = ["oracle", "payout_record", "pool", "system_program", "vault"].join(", ");
    if (accounts !== expected) {
      problems.push(`trigger_payout accounts are (${accounts}), expected (${expected})`);
    }
  }
  const fields = (name: string) => {
    const type = idl.types?.find((t) => t.name === name)?.type;
    return type?.kind === "struct" && Array.isArray(type.fields)
      ? (type.fields as { name: string }[]).map((f) => f.name)
      : null;
  };
  const need = (account: string, wanted: string[]) => {
    const have = fields(account);
    if (!have) return problems.push(`account ${account} is missing`);
    const missing = wanted.filter((f) => !have.includes(f));
    if (missing.length) problems.push(`account ${account} has no ${missing.join(", ")}`);
  };
  need("Pool", ["threshold", "responders"]);
  need("PayoutRecord", ["amount"]);
  return problems;
}

export function loadIdl(path: string): Idl {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Idl;
  } catch (err) {
    throw new Error(`Cannot read the program IDL at ${path}: ${(err as Error).message}`);
  }
}

export function loadKeypair(path: string): Keypair {
  const secret = Uint8Array.from(JSON.parse(readFileSync(path, "utf8")) as number[]);
  return Keypair.fromSecretKey(secret);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms).unref()),
  ]);
}
