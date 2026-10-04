// Error codes from docs/api.md §2. A classifier outage is not one of them: it is a
// failureReason on a 202 failed event (§3.1).
export type ErrorCode =
  | "INVALID_REQUEST"
  | "EVENT_NOT_FOUND"
  | "SCENARIO_NOT_FOUND"
  | "EVENT_ALREADY_PROCESSED"
  | "INTERNAL_ERROR";

const STATUS: Record<ErrorCode, number> = {
  INVALID_REQUEST: 400,
  EVENT_NOT_FOUND: 404,
  SCENARIO_NOT_FOUND: 404,
  EVENT_ALREADY_PROCESSED: 409,
  INTERNAL_ERROR: 500,
};

export class ApiError extends Error {
  readonly status: number;

  constructor(readonly code: ErrorCode, message: string) {
    super(message);
    this.status = STATUS[code];
  }

  toBody() {
    return { error: { code: this.code, message: this.message } };
  }
}
