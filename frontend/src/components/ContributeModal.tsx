import { useWalletConnection } from "@solana/react-hooks";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAsyncData } from "../hooks/useAsyncData";
import { describeError } from "../lib/errors";
import {
  explorerTxUrl,
  formatLamportsAsSol,
  parseSolToLamports,
} from "../lib/format";
import * as program from "../program/client";

const PRESETS = ["0.1", "0.5", "1"];
// Kept back when warning about the balance: the transaction fee plus rent
// for the Contribution account on a wallet's first contribution, with room
// to spare.
const FEE_BUFFER_LAMPORTS = 10_000_000n; // 0.01 SOL

type Status =
  | { kind: "editing" }
  | { kind: "submitting" }
  | { kind: "success"; signature: string; lamports: bigint }
  | { kind: "error"; message: string };

interface ContributeModalProps {
  poolAddress: program.Address;
  networkProblem: string | null;
  onClose: () => void;
  onContributed: () => void;
}

// Rendered only while open, so every opening starts fresh. A preset amount
// is selected up front, so contributing takes three clicks after
// connecting: Contribute, Confirm, approve in the wallet (NFR-8).
export function ContributeModal({
  poolAddress,
  networkProblem,
  onClose,
  onContributed,
}: ContributeModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const { connected, connecting, connectors, connect, wallet, error } =
    useWalletConnection();
  const [amountText, setAmountText] = useState(PRESETS[0]);
  const [status, setStatus] = useState<Status>({ kind: "editing" });

  const address = connected ? wallet?.account.address : undefined;
  const balance = useAsyncData(address ? `balance:${address}` : null, () =>
    program.getWalletBalance(address!)
  );

  const parsed = parseSolToLamports(amountText);
  const validationError = !parsed.ok
    ? amountText.trim() === ""
      ? null
      : parsed.error
    : parsed.lamports === 0n
      ? "Enter an amount greater than 0."
      : null;
  const lamports = parsed.ok && parsed.lamports > 0n ? parsed.lamports : null;
  const overBalance =
    lamports !== null &&
    balance.data !== undefined &&
    lamports + FEE_BUFFER_LAMPORTS > balance.data;

  const submitting = status.kind === "submitting";
  const canSubmit =
    lamports !== null && !submitting && !networkProblem && !!wallet;

  // Set synchronously, so a second submit that arrives before React
  // re-renders (and disables the button) cannot send a second transaction.
  const inFlight = useRef(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    if (!canSubmit || !wallet || lamports === null) return;
    inFlight.current = true;
    setStatus({ kind: "submitting" });
    try {
      const signature = await program.contribute(lamports, {
        pool: poolAddress,
        wallet,
      });
      setStatus({ kind: "success", signature, lamports });
      onContributed();
      balance.refresh();
    } catch (err) {
      setStatus({ kind: "error", message: describeError(err) });
    } finally {
      inFlight.current = false;
    }
  }

  let body;
  if (!connected || !wallet) {
    body = (
      <div className="flex flex-col gap-2">
        <p className="text-sm">Connect a devnet wallet to contribute.</p>
        {connectors.length === 0 ? (
          <p className="text-sm text-muted">
            No Solana wallet detected. Install Phantom (phantom.com), switch it
            to devnet, then reload this page.
          </p>
        ) : (
          connectors.map((c) => (
            <button
              key={c.id}
              type="button"
              className="flex items-center gap-2 rounded-md border border-border p-2 text-left text-sm hover:bg-cream disabled:opacity-60"
              onClick={() => connect(c.id)}
              disabled={connecting}
            >
              {c.icon && <img src={c.icon} alt="" className="size-5" />}
              {c.name}
            </button>
          ))
        )}
        {error != null && (
          <p className="text-sm text-red-600">{describeError(error)}</p>
        )}
        <button
          type="button"
          className="self-end rounded-md border border-border px-3 py-1.5 text-sm"
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    );
  } else if (status.kind === "success") {
    body = (
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-base font-medium text-green-700">
          Contributed {formatLamportsAsSol(status.lamports)} SOL.
        </p>
        {program.isMock ? (
          <p className="text-muted">
            Mock transaction{" "}
            <span className="font-mono">{status.signature}</span>, so there is
            no explorer link.
          </p>
        ) : (
          <a
            className="underline"
            href={explorerTxUrl(status.signature)}
            target="_blank"
            rel="noreferrer"
          >
            View transaction on Solana Explorer
          </a>
        )}
        <button
          type="button"
          className="self-end rounded-md bg-primary px-3 py-1.5 text-background"
          onClick={onClose}
        >
          Done
        </button>
      </div>
    );
  } else {
    body = (
      <form className="flex flex-col gap-3" onSubmit={submit}>
        <label className="flex flex-col gap-1 text-sm">
          Amount (SOL)
          <input
            className="rounded-md border border-border bg-background px-3 py-2 font-mono"
            inputMode="decimal"
            autoComplete="off"
            value={amountText}
            onChange={(e) => {
              setAmountText(e.target.value);
              if (status.kind === "error") setStatus({ kind: "editing" });
            }}
            disabled={submitting}
            aria-invalid={validationError !== null}
          />
        </label>

        <div className="flex gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className={`rounded-full border px-3 py-1 text-sm ${
                amountText === preset
                  ? "border-primary bg-primary text-background"
                  : "border-border"
              }`}
              onClick={() => {
                setAmountText(preset);
                if (status.kind === "error") setStatus({ kind: "editing" });
              }}
              disabled={submitting}
            >
              {preset} SOL
            </button>
          ))}
        </div>

        {validationError && (
          <p className="text-sm text-red-600">{validationError}</p>
        )}
        {balance.data !== undefined && (
          <p className="text-xs text-muted">
            Wallet balance: {formatLamportsAsSol(balance.data, 4)} SOL
          </p>
        )}
        {overBalance && (
          <p className="text-sm text-amber-700">
            That is more than your balance minus about 0.01 SOL for fees. The
            transaction may fail.
          </p>
        )}
        {balance.error && (
          <p className="text-xs text-muted">
            Couldn't check your balance. You can still contribute.
          </p>
        )}
        {networkProblem && (
          <p className="text-sm text-red-600">{networkProblem}</p>
        )}
        {status.kind === "error" && (
          <p className="text-sm text-red-600" role="alert">
            {status.message}
          </p>
        )}
        <p className="text-xs text-muted">
          Make sure your wallet is set to devnet.
        </p>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-background disabled:opacity-50"
            disabled={!canSubmit}
          >
            {submitting
              ? "Waiting for wallet…"
              : status.kind === "error"
                ? "Try again"
                : lamports !== null
                  ? `Confirm ${formatLamportsAsSol(lamports)} SOL`
                  : "Confirm"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-border bg-card p-5 text-foreground backdrop:bg-black/40"
    >
      <h2 className="mb-3 text-lg font-semibold">Contribute to the pool</h2>
      {body}
    </dialog>
  );
}
