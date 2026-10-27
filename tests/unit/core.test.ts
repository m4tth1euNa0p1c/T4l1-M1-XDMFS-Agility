import { describe, expect, it, vi } from "vitest";
import { XdmfsError, codeFromStatus } from "../../src/core/errors.js";
import { parseRetryAfter, withRetry } from "../../src/core/retry.js";
import {
  describeEnvironment,
  isSecretName,
  parseDotEnv,
  redact,
} from "../../src/security/secrets.js";
import { RateLimiter } from "../../src/security/rate-limit.js";

describe("errors", () => {
  it("maps HTTP statuses to normalized codes", () => {
    expect(codeFromStatus(401)).toBe("authentication");
    expect(codeFromStatus(403)).toBe("permission_denied");
    expect(codeFromStatus(429)).toBe("rate_limited");
    expect(codeFromStatus(529)).toBe("unavailable");
    expect(codeFromStatus(500)).toBe("upstream_error");
  });
  it("flags only transient errors as retryable", () => {
    expect(new XdmfsError("rate_limited", "x", "m").retryable).toBe(true);
    expect(new XdmfsError("authentication", "x", "m").retryable).toBe(false);
  });
});

describe("withRetry", () => {
  it("retries retryable errors then succeeds", async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    let n = 0;
    const result = await withRetry(
      async () => {
        n += 1;
        if (n < 3) throw new XdmfsError("unavailable", "t", "down");
        return "ok";
      },
      { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 1000 },
      sleep,
    );
    expect(result).toBe("ok");
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([100, 200]);
  });
  it("does not retry permanent errors", async () => {
    const op = vi.fn(async () => {
      throw new XdmfsError("invalid_request", "t", "bad");
    });
    await expect(
      withRetry(op, { maxAttempts: 5, baseDelayMs: 1, maxDelayMs: 1 }, async () => {}),
    ).rejects.toThrow("bad");
    expect(op).toHaveBeenCalledTimes(1);
  });
  it("honors retry-after, capped by maxDelayMs", async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    let n = 0;
    await withRetry(
      async () => {
        if (n++ === 0) throw new XdmfsError("rate_limited", "t", "slow", { retryAfterMs: 60_000 });
        return 1;
      },
      { maxAttempts: 2, baseDelayMs: 10, maxDelayMs: 5_000 },
      sleep,
    );
    expect(sleep).toHaveBeenCalledWith(5_000);
  });
  it("parses Retry-After seconds and dates", () => {
    expect(parseRetryAfter("3")).toBe(3000);
    expect(
      parseRetryAfter("Wed, 21 Oct 2026 07:28:10 GMT", Date.parse("Wed, 21 Oct 2026 07:28:00 GMT")),
    ).toBe(10_000);
    expect(parseRetryAfter(null)).toBeUndefined();
  });
});

describe("secrets", () => {
  it("detects secret variable names", () => {
    expect(isSecretName("ANTHROPIC_API_KEY")).toBe(true);
    expect(isSecretName("SONARQUBE_TOKEN")).toBe(true);
    expect(isSecretName("PORT")).toBe(false);
  });
  it("redacts known values and token shapes", () => {
    const env = { MY_TOKEN: "supersecretvalue123" };
    expect(redact("x supersecretvalue123 y", env)).toBe("x [REDACTED:MY_TOKEN] y");
    expect(redact("key sk-ant-api03-abcdefghijklmnop", {})).toBe("key [REDACTED]");
    expect(redact("ghp_abcdefghijklmnopqrstuvwxyz0123", {})).toBe("[REDACTED]");
    expect(redact("Authorization: Bearer abc.def", {})).toBe("Authorization: Bearer [REDACTED]");
  });
  it("reports presence without values", () => {
    const report = describeEnvironment({ ANTHROPIC_API_KEY: "sk-ant-xxxxxxxxxxxx", PORT: "" });
    const key = report.find((r) => r.name === "ANTHROPIC_API_KEY")!;
    expect(key).toEqual({ name: "ANTHROPIC_API_KEY", set: true, secret: true });
    expect(JSON.stringify(report)).not.toContain("sk-ant");
    expect(report.find((r) => r.name === "PORT")!.set).toBe(false);
  });
  it("parses .env files and rejects invalid names", () => {
    expect(parseDotEnv('# c\nA=1\nB="two words"\nbad-name=x\n C = 3 ')).toEqual({
      A: "1",
      B: "two words",
      C: "3",
    });
  });
});

describe("RateLimiter", () => {
  it("allows a burst then refills over time", () => {
    let t = 0;
    const rl = new RateLimiter(2, 60, () => t);
    expect(rl.take("ip")).toBe(true);
    expect(rl.take("ip")).toBe(true);
    expect(rl.take("ip")).toBe(false);
    t += 1000;
    expect(rl.take("ip")).toBe(true);
    expect(rl.take("other")).toBe(true);
  });
});
