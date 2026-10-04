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

  // Replays the given number of above-threshold events, confirming each.
  async function payOut(count: number) {
    for (let i = 0; i < count; i++) {
      await oracle.postReplay({ scenarioId: "jp-2022-m73", runId: `d${i}` });
      await afterConfirmation();
    }
  }

  async function contribute(address: string, lamports: bigint) {
    await program.contribute(lamports, {
      pool,
      wallet: { account: { address: toAddress(address) } } as never,
    });
  }

  return {
    oracle,
    program,
    snapshot,
    afterConfirmation,
    payOut,
    contribute,
  };
}

const CAP = 100_000_000n; // 0.1 SOL, the demo pool's cap (api.md 5.6)
const RENT = 890_880n;
// Three contributions of 0.5 SOL, less one 0.1 SOL fixture payout.
const START_AVAILABLE = 1_400_000_000n;

describe("shared mock chain state", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_ORACLE_MOCK", "true");
    // Only Date is faked; setTimeout stays real for the mocks' latency.
    vi.useFakeTimers({ toFake: ["Date"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts from the demo pool in api.md 5.6", async () => {
    const { program, snapshot } = await loadMocks();
    const { toAddress } = await import("@solana/client");
    const state = await program.getPool(toAddress(mockWallets.pool));
    expect(state.payoutCapLamports).toBe(CAP);
    expect(state.threshold).toBe(70);
    expect(state.responders.map((r) => r.shareBps)).toEqual([6000, 4000]);

    const contributions = await program.getContributions(
      toAddress(mockWallets.pool)
    );
    expect(contributions.map((c) => c.amount)).toEqual([
      500_000_000n,
      500_000_000n,
      500_000_000n,
    ]);

    const start = await snapshot();
    expect(start.vault).toBe(START_AVAILABLE + RENT);
    expect(start.totalContributed).toBe(1_500_000_000n);
    expect(start.totalPaidOut).toBe(CAP);
  });

  it("scores each demo scenario as api.md 3.6 and requirements 13 expect", async () => {
    const { oracle } = await loadMocks();
    const replay = (scenarioId: string) =>
      oracle.postReplay({ scenarioId, runId: "s" });

    const m48 = await replay("jp-2025-m48");
    expect(m48).toMatchObject({ status: "scored", riskScore: 0 });
    expect(m48.magnitude).toBeLessThan(5);

    const deep = await replay("jp-2013-m69-deep");
    expect(deep.status).toBe("scored");
    expect(deep.riskScore).toBeLessThan(70);

    for (const id of ["jp-2022-m73", "tohoku-2011-m91"]) {
      const event = await replay(id);
      expect(event.status).toBe("pending");
      expect(event.riskScore).toBeGreaterThanOrEqual(70);
    }
  });

  it("rejects a repeat of the already paid Tohoku event with 409", async () => {
    const { oracle } = await loadMocks();
    await expect(
      oracle.postReplay({ scenarioId: "tohoku-2011-m91" })
    ).rejects.toMatchObject({ status: 409, code: "EVENT_ALREADY_PROCESSED" });
  });

  it("moves money only when a replayed payout goes from pending to paid", async () => {
    const { oracle, snapshot, afterConfirmation } = await loadMocks();
    const before = await snapshot();

    const event = await oracle.postReplay({
      scenarioId: "jp-2022-m73",
      runId: "a",
    });
    expect(event.status).toBe("pending");
    // api.md 3.1: the amount is 0 until the payout confirms.
    expect(event.payout?.amountLamports).toBe(0);
    // Pending: nothing has moved yet.
    expect(await snapshot()).toEqual(before);

    const { events } = await afterConfirmation();
    const confirmed = events.find((e) => e.id === "jp-2022-m73-a");
    expect(confirmed?.status).toBe("paid");
    expect(confirmed?.payout?.amountLamports).toBe(Number(CAP));

    const after = await snapshot();
    expect(after.vault).toBe(before.vault - CAP);
    expect(after.totalPaidOut).toBe(before.totalPaidOut + CAP);
    expect(after.totalContributed).toBe(before.totalContributed);
    // 60/40 split of 0.1 SOL.
    expect(after.responderA).toBe(before.responderA + 60_000_000n);
    expect(after.responderB).toBe(before.responderB + 40_000_000n);
  });

  it("keeps a payout pending until the confirmation delay has passed", async () => {
    const { oracle, snapshot, afterConfirmation } = await loadMocks();
    const before = await snapshot();
    await oracle.postReplay({ scenarioId: "jp-2022-m73", runId: "p" });

    vi.setSystemTime(Date.now() + oracle.MOCK_CONFIRMATION_MS - 1);
    const early = await oracle.getEvents();
    expect(early.events.find((e) => e.id === "jp-2022-m73-p")?.status).toBe(
      "pending"
    );
    expect(await snapshot()).toEqual(before);

    const late = await afterConfirmation();
    expect(late.events.find((e) => e.id === "jp-2022-m73-p")?.status).toBe(
      "paid"
    );
    expect((await snapshot()).vault).toBe(before.vault - CAP);
  });

  it("does not move money for below-threshold or not-scored replays", async () => {
    const { oracle, snapshot, afterConfirmation } = await loadMocks();
    const before = await snapshot();
    for (const scenarioId of ["jp-2013-m69-deep", "jp-2025-m48"]) {
      const event = await oracle.postReplay({ scenarioId });
      expect(event.status).toBe("scored");
      expect(event.payout).toBeNull();
    }
    await afterConfirmation();
    expect(await snapshot()).toEqual(before);
  });

  it("caps a payout at what the vault can pay and stay rent-exempt", async () => {
    const { oracle, snapshot, payOut } = await loadMocks();
    // 1.4 SOL available, 0.1 SOL cap: fourteen full payouts drain it.
    await payOut(14);
    expect((await snapshot()).vault).toBe(RENT);

    const event = await oracle.postReplay({
      scenarioId: "jp-2022-m73",
      runId: "last",
    });
    expect(event.status).toBe("failed");
    expect(event.riskScore).toBe(95);
    expect(event.payout).toBeNull();
    expect(event.failureReason).toBe("InsufficientFunds");
    expect((await snapshot()).vault).toBe(RENT);
  });

  it("pays a partial amount when the vault holds less than the cap", async () => {
    const { oracle, snapshot, afterConfirmation, payOut, contribute } =
      await loadMocks();
    // 0.1 SOL left, plus a 0.05 SOL contribution: 0.15 SOL available.
    await payOut(13);
    await contribute(mockWallets.contributorB, 50_000_000n);

    const full = await oracle.postReplay({
      scenarioId: "jp-2022-m73",
      runId: "full",
    });
    expect(full.payout?.amountLamports).toBe(0);
    const afterFull = await afterConfirmation();
    expect(
      afterFull.events.find((e) => e.id === full.id)?.payout?.amountLamports
    ).toBe(Number(CAP));

    // 0.05 SOL left: the next payout is 0.05 SOL, not the 0.1 SOL cap.
    const partial = await oracle.postReplay({
      scenarioId: "jp-2022-m73",
      runId: "part",
    });
    expect(partial.status).toBe("pending");
    expect(partial.payout?.amountLamports).toBe(0);
    const afterPartial = await afterConfirmation();
    expect(
      afterPartial.events.find((e) => e.id === partial.id)?.payout
        ?.amountLamports
    ).toBe(50_000_000);
    expect((await snapshot()).vault).toBe(RENT);
  });

  it("fails a pending payout at confirmation if another one drained the vault", async () => {
    const { oracle, snapshot, afterConfirmation, payOut } = await loadMocks();
    // 0.1 SOL left. Two payouts are both quoted 0.1 SOL before either
    // confirms; only the first can be paid.
    await payOut(13);
    const first = await oracle.postReplay({
      scenarioId: "jp-2022-m73",
      runId: "x",
    });
    const second = await oracle.postReplay({
      scenarioId: "jp-2022-m73",
      runId: "y",
    });
    expect(first.status).toBe("pending");
    expect(second.status).toBe("pending");

    const { events } = await afterConfirmation();
    const byId = new Map(events.map((e) => [e.id, e]));
    const pair = [byId.get("jp-2022-m73-x"), byId.get("jp-2022-m73-y")];
    expect(pair.map((e) => e?.status).sort()).toEqual(["failed", "paid"]);
    const failed = pair.find((e) => e?.status === "failed");
    // The transaction was submitted, so payout stays set, with nothing paid.
    expect(failed?.payout?.amountLamports).toBe(0);
    expect(failed?.payout?.confirmedAt).toBeNull();
    expect(failed?.failureReason).toBe("InsufficientFunds");
    expect((await snapshot()).vault).toBe(RENT);
  });

  it("adds contributions to the vault and takes them from the wallet", async () => {
    const { program, snapshot, contribute } = await loadMocks();
    const { toAddress } = await import("@solana/client");
    const contributor = toAddress(mockWallets.contributorA);
    const before = await snapshot();
    const walletBefore = await program.getWalletBalance(contributor);
    expect(walletBefore).toBe(1_000_000_000n);

    await contribute(mockWallets.contributorA, 500_000_000n);

    const after = await snapshot();
    expect(after.vault).toBe(before.vault + 500_000_000n);
    expect(after.totalContributed).toBe(before.totalContributed + 500_000_000n);
    expect(await program.getWalletBalance(contributor)).toBe(
      walletBefore - 500_000_000n
    );
  });
});
