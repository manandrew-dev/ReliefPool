import { describe, expect, it } from "vitest";
import { toTransactionError } from "./transactionErrors";
import { ProgramError } from "./types";

describe("toTransactionError", () => {
  it("maps each ReliefPool custom error to its api.md name", () => {
    const names = [
      "Unauthorized",
      "TooManyResponders",
      "InvalidShares",
      "BelowThreshold",
      "InsufficientFunds",
      "ZeroAmount",
      "InvalidThreshold",
      "DuplicateResponder",
    ];
    names.forEach((name, index) => {
      const error = toTransactionError({
        InstructionError: [0, { Custom: 6000 + index }],
      });
      expect(error).toBeInstanceOf(ProgramError);
      expect((error as ProgramError).code).toBe(name);
    });
  });

  it("accepts codes as bigint, which is how Kit's RPC returns them", () => {
    const error = toTransactionError({
      InstructionError: [0, { Custom: 6005n }],
    });
    expect((error as ProgramError).code).toBe("ZeroAmount");
    expect(
      toTransactionError({ InstructionError: [0n, { Custom: 1n }] }).message
    ).toMatch(/enough devnet SOL/);
    expect(
      toTransactionError({ InstructionError: [0n, { Custom: 42n }] }).message
    ).toContain("42");
  });

  it("explains a wallet that can't cover the transfer or the fee", () => {
    for (const err of [
      { InstructionError: [0, { Custom: 1 }] },
      "InsufficientFundsForFee",
      "AccountNotFound",
    ]) {
      const error = toTransactionError(err);
      expect(error).not.toBeInstanceOf(ProgramError);
      expect(error.message).toMatch(/enough devnet SOL/);
    }
  });

  it("shows anything else as it is", () => {
    expect(toTransactionError("BlockhashNotFound").message).toContain(
      "BlockhashNotFound"
    );
    expect(
      toTransactionError({ InstructionError: [0, "InvalidAccountData"] })
        .message
    ).toContain("InvalidAccountData");
  });
});
