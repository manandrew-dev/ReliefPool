import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockWallets } from "./wallets";

// The mock oracle and mock program client share module-level state, so
// every test loads fresh copies of both.
async function loadMocks() {
  vi.resetModules();
  const oracle = await import("../api/oracle");
  const program = await import("../program/client");
  const { toAddress } = await import("@solana/client");
  const pool = toAddress(mockWallets.pool);
  const vault = toAddress(mockWallets.vault);
  const responderA = toAddress(mockWallets.responderA);
  const responderB = toAddress(mockWallets.responderB);

  async function snapshot() {
    const [state, vaultBalance, a, b] = await Promise.all([
      program.getPool(pool),
      program.getVaultBalance(vault),
      program.getWalletBalance(responderA),
      program.getWalletBalance(responderB),
    ]);
    return {
      vault: vaultBalance,
      totalPaidOut: state.totalPaidOut,
      totalContributed: state.totalContributed,
      responderA: a,
      responderB: b,
    };
  }

  // Mock payouts confirm only after MOCK_CONFIRMATION_MS, so move the
  // (faked) clock past it before polling.
  async function afterConfirmation() {
    vi.setSystemTime(Date.now() + oracle.MOCK_CONFIRMATION_MS);
    return oracle.getEvents();
  }

  return { oracle, program, pool, snapshot, afterConfirmation };
}

const SOL = 1_000_000_000n;
const RENT = 890_880n;

describe("shared mock chain state", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_ORACLE_MOCK", "true");
    // Only Date is faked; setTimeout stays real for the mocks' latency.
    vi.useFakeTimers({ toFake: ["Date"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("moves money only when a replayed payout goes from pending to paid", async () => {
    const { oracle, snapshot, afterConfirmation } = await loadMocks();
    const before = await snapshot();
    expect(before.vault).toBe(6n * SOL + RENT);
    expect(before.totalPaidOut).toBe(2n * SOL);

    const event = await oracle.postReplay({
      scenarioId: "replay-major-01",
      runId: "a",
    });
    expect(event.status).toBe("pending");
    expect(event.payout?.amountLamports).toBe(2_000_000_000);
    // Pending: nothing has moved yet.
    expect(await snapshot()).toEqual(before);

    const { events } = await afterConfirmation();
    const confirmed = events.find((e) => e.id === "replay-major-01-a");
    expect(confirmed?.status).toBe("paid");

    const after = await snapshot();
    expect(after.vault).toBe(before.vault - 2n * SOL);
    expect(after.totalPaidOut).toBe(before.totalPaidOut + 2n * SOL);
    expect(after.totalContributed).toBe(before.totalContributed);
    // 60/40 split of 2 SOL.
    expect(after.responderA).toBe(before.responderA + 1_200_000_000n);
    expect(after.responderB).toBe(before.responderB + 800_000_000n);
  });

  it("keeps a payout pending until the confirmation delay has passed", async () => {
    const { oracle, snapshot, afterConfirmation } = await loadMocks();
    const before = await snapshot();
    await oracle.postReplay({ scenarioId: "replay-major-01", runId: "p" });

    vi.setSystemTime(Date.now() + oracle.MOCK_CONFIRMATION_MS - 1);
    const early = await oracle.getEvents();
    expect(early.events.find((e) => e.id === "replay-major-01-p")?.status).toBe(
      "pending"
    );
    expect(await snapshot()).toEqual(before);

    const late = await afterConfirmation();
    expect(late.events.find((e) => e.id === "replay-major-01-p")?.status).toBe(
      "paid"
    );
    expect((await snapshot()).vault).toBe(before.vault - 2n * SOL);
  });

  it("does not move money for a below-threshold replay", async () => {
    const { oracle, snapshot, afterConfirmation } = await loadMocks();
    const before = await snapshot();
    const event = await oracle.postReplay({ scenarioId: "replay-minor-01" });
    expect(event.status).toBe("scored");
    await afterConfirmation();
    expect(await snapshot()).toEqual(before);
  });

  it("caps a payout at what the vault can pay and stay rent-exempt", async () => {
    const { oracle, snapshot, afterConfirmation } = await loadMocks();
    // 6 SOL available, 2 SOL cap: three full payouts drain it.
    for (const runId of ["1", "2", "3"]) {
      await oracle.postReplay({ scenarioId: "replay-major-01", runId });
      await afterConfirmation();
    }
    expect((await snapshot()).vault).toBe(RENT);

    const event = await oracle.postReplay({
      scenarioId: "replay-major-01",
      runId: "4",
    });
    expect(event.status).toBe("failed");
    expect(event.riskScore).toBe(97);
    expect(event.payout).toBeNull();
    expect(event.failureReason).toMatch(/^InsufficientFunds/);
    expect((await snapshot()).vault).toBe(RENT);
  });

  it("pays a partial amount when the vault holds less than the cap", async () => {
    const { oracle, program, pool, snapshot, afterConfirmation } =
      await loadMocks();
    const { toAddress } = await import("@solana/client");
    for (const runId of ["1", "2"]) {
      await oracle.postReplay({ scenarioId: "replay-major-01", runId });
      await afterConfirmation();
    }
    // 2 SOL left, plus a 0.5 SOL contribution: 2.5 SOL available, cap 2.
    await program.contribute(SOL / 2n, {
      pool,
      wallet: {
        account: { address: toAddress(mockWallets.contributorB) },
      } as never,
    });
    const full = await oracle.postReplay({
      scenarioId: "replay-major-01",
      runId: "3",
    });
    expect(full.payout?.amountLamports).toBe(2_000_000_000);
    await afterConfirmation();

    // 0.5 SOL left: the next payout is 0.5 SOL, not the 2 SOL cap.
    const partial = await oracle.postReplay({
      scenarioId: "replay-major-01",
      runId: "4",
    });
    expect(partial.status).toBe("pending");
    expect(partial.payout?.amountLamports).toBe(500_000_000);
    await afterConfirmation();
    expect((await snapshot()).vault).toBe(RENT);
  });

  it("fails a pending payout at confirmation if another one drained the vault", async () => {
    const { oracle, snapshot, afterConfirmation } = await loadMocks();
    for (const runId of ["1", "2"]) {
      await oracle.postReplay({ scenarioId: "replay-major-01", runId });
      await afterConfirmation();
    }
    // 2 SOL available. Two payouts are both quoted 2 SOL before either
    // confirms; only the first can be paid.
    const first = await oracle.postReplay({
      scenarioId: "replay-major-01",
      runId: "x",
    });
    const second = await oracle.postReplay({
      scenarioId: "replay-major-01",
      runId: "y",
    });
    expect(first.status).toBe("pending");
    expect(second.status).toBe("pending");

    const { events } = await afterConfirmation();
    const byId = new Map(events.map((e) => [e.id, e]));
    const statuses = [
      byId.get("replay-major-01-x")?.status,
      byId.get("replay-major-01-y")?.status,
    ].sort();
    expect(statuses).toEqual(["failed", "paid"]);
    expect((await snapshot()).vault).toBe(RENT);
  });

  it("adds contributions to the vault and takes them from the wallet", async () => {
    const { program, pool, snapshot } = await loadMocks();
    const { toAddress } = await import("@solana/client");
    const contributor = toAddress(mockWallets.contributorA);
    const before = await snapshot();
    const walletBefore = await program.getWalletBalance(contributor);

    await program.contribute(SOL / 2n, {
      pool,
      wallet: { account: { address: contributor } } as never,
    });

    const after = await snapshot();
    expect(after.vault).toBe(before.vault + SOL / 2n);
    expect(after.totalContributed).toBe(before.totalContributed + SOL / 2n);
    expect(await program.getWalletBalance(contributor)).toBe(
      walletBefore - SOL / 2n
    );
  });
});
