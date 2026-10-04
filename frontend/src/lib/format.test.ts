import { describe, expect, it } from "vitest";
import {
  apportionBps,
  explorerTxUrl,
  formatBpsAsPercent,
  formatLamportsAsSol,
  formatRelativeTime,
  labelFor,
  parseSolToLamports,
  shortAddress,
} from "./format";

function lamportsOf(input: string): bigint {
  const result = parseSolToLamports(input);
  if (!result.ok)
    throw new Error(`expected ok for "${input}": ${result.error}`);
  return result.lamports;
}

describe("parseSolToLamports", () => {
  it.each([
    ["0.1", 100_000_000n],
    ["0.2", 200_000_000n],
    ["0.3", 300_000_000n],
    ["1", 1_000_000_000n],
    ["1.5", 1_500_000_000n],
    ["2.000000001", 2_000_000_001n],
    ["0.000000001", 1n],
    ["0.123456789", 123_456_789n],
    [".5", 500_000_000n],
    ["1.", 1_000_000_000n],
    ["007.25", 7_250_000_000n],
    ["  0.1  ", 100_000_000n],
    ["0", 0n],
    ["18446744073.709551615", 18_446_744_073_709_551_615n],
  ])("parses %j exactly", (input, expected) => {
    expect(lamportsOf(input)).toBe(expected);
  });

  it("gives exactly 100000000n for 0.1", () => {
    expect(lamportsOf("0.1")).toBe(100000000n);
  });

  it("avoids floating point error", () => {
    // Number("1.005") * 1e9 is 1004999999.9999999 in floating point.
    expect(lamportsOf("1.005")).toBe(1_005_000_000n);
  });

  it.each([
    ["", "empty"],
    ["   ", "blank"],
    [".", "lone dot"],
    ["-1", "negative"],
    ["-0.1", "negative fraction"],
    ["+1", "explicit plus"],
    ["1e3", "exponent"],
    ["1E-3", "negative exponent"],
    ["1.5e2", "decimal exponent"],
    ["0.1234567891", "10 decimal places"],
    ["1,5", "comma separator"],
    ["1 000", "space separator"],
    ["abc", "letters"],
    ["0x10", "hex"],
    ["Infinity", "Infinity"],
    ["NaN", "NaN"],
    ["1.2.3", "two dots"],
    ["18446744073.709551616", "over u64 max"],
  ])("rejects %j (%s)", (input) => {
    const result = parseSolToLamports(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).not.toBe("");
  });

  it("explains each kind of rejection", () => {
    expect(parseSolToLamports("")).toEqual({
      ok: false,
      error: "Enter an amount.",
    });
    expect(parseSolToLamports("0.1234567891")).toEqual({
      ok: false,
      error: "Use at most 9 decimal places.",
    });
    expect(parseSolToLamports("99999999999")).toEqual({
      ok: false,
      error: "Amount is too large.",
    });
  });
});

describe("formatLamportsAsSol", () => {
  it.each([
    [0n, "0"],
    [1n, "0.000000001"],
    [100_000_000n, "0.1"],
    [1_000_000_000n, "1"],
    [1_500_000_000n, "1.5"],
    [6_000_890_880n, "6.00089088"],
    [18_446_744_073_709_551_615n, "18446744073.709551615"],
    [-2_500_000_000n, "-2.5"],
  ])("formats %s lamports as %j", (lamports, expected) => {
    expect(formatLamportsAsSol(lamports)).toBe(expected);
  });

  it("accepts the number amounts the oracle API returns", () => {
    expect(formatLamportsAsSol(2000000000)).toBe("2");
  });

  it("truncates to maxFractionDigits without rounding up", () => {
    expect(formatLamportsAsSol(6_000_890_880n, 4)).toBe("6.0008");
    expect(formatLamportsAsSol(1_999_999_999n, 2)).toBe("1.99");
    expect(formatLamportsAsSol(1n, 4)).toBe("0");
    expect(formatLamportsAsSol(1_500_000_000n, 0)).toBe("1");
  });

  it("round-trips with parseSolToLamports", () => {
    for (const text of ["0.1", "1.5", "0.000000001", "123.456789"]) {
      expect(formatLamportsAsSol(lamportsOf(text))).toBe(text);
    }
  });
});

describe("formatBpsAsPercent", () => {
  it.each([
    [10_000, "100%"],
    [6000, "60%"],
    [4000, "40%"],
    [3333, "33.33%"],
    [2550, "25.5%"],
    [1, "0.01%"],
    [0, "0%"],
  ])("formats %d bps as %j", (bps, expected) => {
    expect(formatBpsAsPercent(bps)).toBe(expected);
  });

  it.each([-1, 12.5, Number.NaN])("rejects %s", (bps) => {
    expect(() => formatBpsAsPercent(bps)).toThrow(RangeError);
  });
});

describe("shortAddress and labelFor", () => {
  const address = "7fYBLiYemKUSSNQiJd1TCxuqk3uFbmewgkKWrDrashYu";

  it("shortens to the first and last four characters", () => {
    expect(shortAddress(address)).toBe("7fYB…shYu");
  });

  it("prefers the label name and falls back to the short address", () => {
    const labels = { [address]: { name: "Coastal Relief NGO" } };
    expect(labelFor(address, labels)).toBe("Coastal Relief NGO");
    expect(labelFor(address, {})).toBe("7fYB…shYu");
    expect(labelFor(address, undefined)).toBe("7fYB…shYu");
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-10-03T18:00:00Z");

  it.each([
    ["2026-10-03T17:59:30Z", "just now"],
    ["2026-10-03T18:05:00Z", "just now"],
    ["2026-10-03T17:55:00Z", "5 min ago"],
    ["2026-10-03T15:00:00Z", "3 h ago"],
    ["2026-10-01T18:00:00Z", "2 d ago"],
  ])("formats %s as %j", (iso, expected) => {
    expect(formatRelativeTime(iso, now)).toBe(expected);
  });
});

describe("apportionBps", () => {
  const SOL = 1_000_000_000n;
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

  it("sums to 100% for the contributor split that showed 99.99%", () => {
    // 5.1 and 3 SOL: rounding each down gave 62.96% + 37.03%.
    const bps = apportionBps([5_100_000_000n, 3n * SOL]);
    expect(bps).toEqual([6296, 3704]);
    expect(bps.map(formatBpsAsPercent)).toEqual(["62.96%", "37.04%"]);
    expect(sum(bps)).toBe(10_000);
  });

  it.each([
    [
      [1n, 1n, 1n],
      [3334, 3333, 3333],
    ],
    [
      [5n, 3n],
      [6250, 3750],
    ],
    [
      [2n, 1n],
      [6667, 3333],
    ],
    [
      [1n, 0n],
      [10_000, 0],
    ],
    [[7n], [10_000]],
    [
      [1n, 1n, 1n, 1n, 1n, 1n],
      [1667, 1667, 1667, 1667, 1666, 1666],
    ],
  ])("apportions %s as %s", (parts, expected) => {
    expect(apportionBps(parts)).toEqual(expected);
  });

  it("returns zeros when nothing has been contributed", () => {
    expect(apportionBps([0n, 0n])).toEqual([0, 0]);
    expect(apportionBps([])).toEqual([]);
  });

  it("always totals 10,000 and stays within 1 bps of the exact share", () => {
    let seed = 42;
    const next = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
      return seed;
    };
    for (let run = 0; run < 500; run++) {
      const parts = Array.from(
        { length: 1 + (next() % 8) },
        () => BigInt(next()) * BigInt(1 + (next() % 1000))
      );
      const total = parts.reduce((a, b) => a + b, 0n);
      const bps = apportionBps(parts);
      expect(sum(bps)).toBe(10_000);
      parts.forEach((part, i) => {
        const floor = Number((part * 10_000n) / total);
        expect(bps[i] - floor).toBeGreaterThanOrEqual(0);
        expect(bps[i] - floor).toBeLessThanOrEqual(1);
      });
    }
  });
});

describe("explorerTxUrl", () => {
  it("links to the devnet explorer", () => {
    expect(explorerTxUrl("abc")).toBe(
      "https://explorer.solana.com/tx/abc?cluster=devnet"
    );
  });
});
