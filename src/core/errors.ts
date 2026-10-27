/**
 * Normalized error model shared by providers and connectors.
 * Callers branch on `code`, never on message text.
 */
export type ErrorCode =
  | "not_configured"
  | "invalid_request"
  | "authentication"
  | "permission_denied"
  | "not_found"
  | "rate_limited"
  | "quota_exceeded"
  | "timeout"
  | "unavailable"
  | "refused"
  | "upstream_error"
  | "read_only_violation";

const RETRYABLE: ReadonlySet<ErrorCode> = new Set(["rate_limited", "timeout", "unavailable"]);

export class XdmfsError extends Error {
  readonly code: ErrorCode;
  readonly source: string;
  readonly status: number | undefined;
  readonly retryAfterMs: number | undefined;

  constructor(
    code: ErrorCode,
    source: string,
    message: string,
    options: { status?: number; retryAfterMs?: number; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "XdmfsError";
    this.code = code;
    this.source = source;
    this.status = options.status;
    this.retryAfterMs = options.retryAfterMs;
  }

  get retryable(): boolean {
    return RETRYABLE.has(this.code);
  }

  toJSON(): Record<string, unknown> {
    return {
      code: this.code,
      source: this.source,
      message: this.message,
      status: this.status,
      retryable: this.retryable,
    };
  }
}

/** Maps an HTTP status to a normalized code. */
export function codeFromStatus(status: number): ErrorCode {
  if (status === 400 || status === 422) return "invalid_request";
  if (status === 401) return "authentication";
  if (status === 403) return "permission_denied";
  if (status === 404) return "not_found";
  if (status === 408) return "timeout";
  if (status === 429) return "rate_limited";
  if (status === 529 || status === 503 || status === 502 || status === 504) return "unavailable";
  if (status >= 500) return "upstream_error";
  return "upstream_error";
}
