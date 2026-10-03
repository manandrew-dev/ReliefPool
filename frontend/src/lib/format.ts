// Display and parsing helpers. Lamport math is done in bigint only; SOL
// amounts never pass through floating point.

export const LAMPORTS_PER_SOL = 1_000_000_000n;
const SOL_DECIMALS = 9;
const U64_MAX = 2n ** 64n - 1n;

export type ParseSolResult =
  { ok: true; lamports: bigint } | { ok: false; error: string };

// Parses a user-typed SOL amount such as "0.1", "2" or ".5" into lamports.
// Rejects empty input, signs, exponent notation, separators, more than 9
// decimal places and values that do not fit in a u64.
export function parseSolToLamports(input: string): ParseSolResult {
  const text = input.trim();
  if (text === "") return { ok: false, error: "Enter an amount." };

  const match = /^(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match) {
    return { ok: false, error: "Enter a plain number of SOL, like 0.5." };
  }
  const [, whole, fraction = ""] = match;
  if (whole === "" && fraction === "") {
    return { ok: false, error: "Enter a plain number of SOL, like 0.5." };
  }
  if (fraction.length > SOL_DECIMALS) {
    return { ok: false, error: "Use at most 9 decimal places." };
  }

  const lamports =
    BigInt(whole || "0") * LAMPORTS_PER_SOL +
    BigInt(fraction.padEnd(SOL_DECIMALS, "0"));
  if (lamports > U64_MAX) {
    return { ok: false, error: "Amount is too large." };
  }
  return { ok: true, lamports };
}

// Formats lamports as SOL, exactly. Trailing zeros are dropped. With
// maxFractionDigits, extra digits are truncated, never rounded up, so a
// balance is never overstated.
export function formatLamportsAsSol(
  lamports: bigint | number,
  maxFractionDigits = SOL_DECIMALS
): string {
  const value = typeof lamports === "bigint" ? lamports : BigInt(lamports);
  const sign = value < 0n ? "-" : "";
  const abs = value < 0n ? -value : value;
  const whole = abs / LAMPORTS_PER_SOL;
  const fraction = (abs % LAMPORTS_PER_SOL)
    .toString()
    .padStart(SOL_DECIMALS, "0")
    .slice(0, Math.max(0, Math.min(maxFractionDigits, SOL_DECIMALS)))
    .replace(/0+$/, "");
  const text = fraction ? `${whole}.${fraction}` : `${whole}`;
  return text === "0" ? "0" : `${sign}${text}`;
}

// 10,000 basis points is 100%. 6000 -> "60%", 3333 -> "33.33%".
export function formatBpsAsPercent(bps: number): string {
  if (!Number.isInteger(bps) || bps < 0) {
    throw new RangeError(`Invalid basis points: ${bps}`);
  }
  const whole = Math.floor(bps / 100);
  const fraction = String(bps % 100)
    .padStart(2, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}%` : `${whole}%`;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

// Name from GET /pool labels, falling back to the short address.
export function labelFor(
  address: string,
  labels: Record<string, { name: string }> | undefined
): string {
  return labels?.[address]?.name ?? shortAddress(address);
}

// "just now", "5 min ago", "3 h ago", "2 d ago". Future times read "just now".
export function formatRelativeTime(
  iso: string,
  now: Date = new Date()
): string {
  const seconds = Math.floor((now.getTime() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}
