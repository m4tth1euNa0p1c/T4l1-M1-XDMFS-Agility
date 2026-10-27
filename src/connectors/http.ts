import { XdmfsError, codeFromStatus } from "../core/errors.js";
import {
  DEFAULT_RETRY,
  parseRetryAfter,
  realSleep,
  withRetry,
  type RetryPolicy,
  type Sleep,
} from "../core/retry.js";

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface ReadOnlyHttpOptions {
  source: string;
  baseUrl: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  retry?: RetryPolicy;
  fetch?: FetchLike;
  sleep?: Sleep;
  /** Allow plain http (local servers such as a dev SonarQube). */
  allowHttp?: boolean;
}

export interface HttpResult<T> {
  data: T;
  status: number;
  headers: Headers;
  url: string;
}

/**
 * HTTP client restricted to GET. Connectors are read-only by design:
 * any mutation must go through a separate, explicitly authorized path.
 */
export class ReadOnlyHttpClient {
  readonly source: string;
  private readonly baseUrl: URL;
  private readonly headers: Record<string, string>;
  private readonly timeoutMs: number;
  private readonly retry: RetryPolicy;
  private readonly fetchImpl: FetchLike;
  private readonly sleep: Sleep;

  constructor(options: ReadOnlyHttpOptions) {
    this.source = options.source;
    this.baseUrl = new URL(options.baseUrl.endsWith("/") ? options.baseUrl : `${options.baseUrl}/`);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(this.baseUrl.hostname);
    if (this.baseUrl.protocol !== "https:" && !(options.allowHttp || local)) {
      throw new XdmfsError("invalid_request", options.source, "Base URL must use https.");
    }
    this.headers = {
      accept: "application/json",
      "user-agent": "xdmfs-agility",
      ...options.headers,
    };
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.retry = options.retry ?? DEFAULT_RETRY;
    this.fetchImpl = options.fetch ?? fetch;
    this.sleep = options.sleep ?? realSleep;
  }

  /** Builds a URL under the base URL. Rejects absolute or escaping paths. */
  url(path: string, query: Record<string, string | number | boolean | undefined> = {}): string {
    if (/^[a-z]+:\/\//i.test(path) || path.includes("..")) {
      throw new XdmfsError("invalid_request", this.source, "Invalid path.");
    }
    const url = new URL(path.replace(/^\//, ""), this.baseUrl);
    for (const [k, v] of Object.entries(query))
      if (v !== undefined) url.searchParams.set(k, String(v));
    return url.toString();
  }

  async get<T>(
    path: string,
    query: Record<string, string | number | boolean | undefined> = {},
  ): Promise<HttpResult<T>> {
    return this.getUrl<T>(this.url(path, query));
  }

  /** GET an absolute URL that must stay on the same origin (pagination links). */
  async getUrl<T>(absolute: string): Promise<HttpResult<T>> {
    const target = new URL(absolute);
    if (target.origin !== this.baseUrl.origin) {
      throw new XdmfsError("invalid_request", this.source, "Cross-origin request refused.");
    }
    return withRetry(
      async () => {
        let response: Response;
        try {
          response = await this.fetchImpl(target.toString(), {
            method: "GET",
            headers: this.headers,
            signal: AbortSignal.timeout(this.timeoutMs),
          });
        } catch (error) {
          const timedOut = (error as { name?: string })?.name === "TimeoutError";
          throw new XdmfsError(
            timedOut ? "timeout" : "unavailable",
            this.source,
            timedOut ? "Request timed out." : "Network error.",
            {
              cause: error,
            },
          );
        }
        if (!response.ok) {
          const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
          // GitHub signals primary rate limits with 403 + x-ratelimit-remaining: 0.
          const exhausted =
            response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0";
          const code = exhausted ? "rate_limited" : codeFromStatus(response.status);
          const reset = Number(response.headers.get("x-ratelimit-reset"));
          const resetMs =
            exhausted && Number.isFinite(reset)
              ? Math.max(0, reset * 1000 - Date.now())
              : undefined;
          const wait = retryAfter ?? resetMs;
          throw new XdmfsError(code, this.source, `HTTP ${response.status} on ${target.pathname}`, {
            status: response.status,
            ...(wait === undefined ? {} : { retryAfterMs: wait }),
          });
        }
        const data = (await response.json()) as T;
        return { data, status: response.status, headers: response.headers, url: target.toString() };
      },
      this.retry,
      this.sleep,
    );
  }
}

/** Extracts rel="next" from an RFC 8288 Link header. */
export function nextLink(link: string | null): string | undefined {
  if (!link) return undefined;
  for (const part of link.split(",")) {
    const [target, ...params] = part.split(";").map((x) => x.trim());
    if (!target?.startsWith("<") || !target.endsWith(">")) continue;
    if (params.some((p) => p.replaceAll(" ", "") === 'rel="next"')) return target.slice(1, -1);
  }
  return undefined;
}
