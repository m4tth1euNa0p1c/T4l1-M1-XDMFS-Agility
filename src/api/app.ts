import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { z } from "zod";
import { answerWithAgent } from "../assistant/agent.js";
import { answerDeterministic } from "../assistant/router.js";
import { TRACE_TOOLS, runTraceTool } from "../assistant/tools.js";
import { connectorStatus } from "../connectors/factory.js";
import { XdmfsError } from "../core/errors.js";
import type { TraceStore } from "../memory/store.js";
import { UsageMeter, type LLMProvider } from "../providers/types.js";
import { describeEnvironment, redact } from "../security/secrets.js";
import { RateLimiter } from "../security/rate-limit.js";

export interface AppDeps {
  store: TraceStore;
  publicDir: string;
  provider: LLMProvider | null;
  version?: string;
  log?: (entry: Record<string, unknown>) => void;
  askRateLimit?: { capacity: number; refillPerMinute: number };
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const SECURITY_HEADERS: Record<string, string> = {
  "content-security-policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "cross-origin-opener-policy": "same-origin",
};

const AskSchema = z.object({
  question: z.string().trim().min(1).max(500),
  mode: z.enum(["auto", "deterministic", "llm"]).default("auto"),
});

const MAX_BODY = 16 * 1024;

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const type = req.headers["content-type"] ?? "";
  if (!type.startsWith("application/json"))
    throw new HttpError(415, "unsupported_media_type", "Content-Type must be application/json.");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new HttpError(413, "payload_too_large", "Body too large.");
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new HttpError(400, "invalid_json", "Malformed JSON.");
  }
}

function send(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers,
  });
  res.end(payload);
}

export function createApp(deps: AppDeps) {
  const meter = new UsageMeter();
  const started = Date.now();
  const publicRoot = path.resolve(deps.publicDir);
  const limiter = new RateLimiter(
    deps.askRateLimit?.capacity ?? 20,
    deps.askRateLimit?.refillPerMinute ?? 20,
  );
  const log = deps.log ?? ((e) => process.stdout.write(`${redact(JSON.stringify(e))}\n`));

  const project = (id: string) => {
    const p = deps.store.getProject(id);
    if (!p) throw new HttpError(404, "project_not_found", `Unknown project ${id}.`);
    return p;
  };

  async function serveStatic(
    req: IncomingMessage,
    res: ServerResponse,
    pathname: string,
  ): Promise<void> {
    let rel = decodeURIComponent(pathname);
    if (rel.endsWith("/")) rel += "index.html";
    const file = path.resolve(publicRoot, `.${rel}`);
    if (!file.startsWith(publicRoot + path.sep) && file !== publicRoot)
      throw new HttpError(403, "forbidden", "Forbidden.");
    if (path.basename(file) === "package.json") throw new HttpError(404, "not_found", "Not found.");
    let info;
    try {
      info = await stat(file);
    } catch {
      throw new HttpError(404, "not_found", "Not found.");
    }
    if (info.isDirectory()) return serveStatic(req, res, `${pathname.replace(/\/?$/, "/")}`);
    const body = await readFile(file);
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      "content-type": MIME[path.extname(file)] ?? "application/octet-stream",
      "cache-control": path.extname(file) === ".html" ? "no-cache" : "public, max-age=300",
    });
    res.end(req.method === "HEAD" ? undefined : body);
  }

  async function route(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
    requestId: string,
  ): Promise<void> {
    const parts = url.pathname.split("/").filter(Boolean);
    const method = req.method ?? "GET";

    if (url.pathname === "/api/health") {
      return send(res, 200, {
        status: "ok",
        version: deps.version ?? "0.1.0",
        uptimeSeconds: Math.round((Date.now() - started) / 1000),
      });
    }
    if (url.pathname === "/api/status") {
      return send(res, 200, {
        llm: deps.provider
          ? deps.provider.capabilities()
          : { provider: "none", note: "Mode déterministe uniquement." },
        connectors: connectorStatus(),
        environment: describeEnvironment(),
        usage: meter.snapshot(),
      });
    }
    if (url.pathname === "/api/projects" && method === "GET") {
      return send(
        res,
        200,
        deps.store.listProjects().map((p) => ({
          id: p.id,
          name: p.name,
          demo: p.demo,
          description: p.info.description,
          lastSyncAt: p.lastSyncAt,
        })),
      );
    }
    if (parts[0] === "api" && parts[1] === "projects" && parts[2]) {
      const id = parts[2];
      const p = project(id);
      const rest = parts.slice(3);
      if (rest.length === 0 && method === "GET") return send(res, 200, p);
      if (rest[0] === "graph" && method === "GET")
        return send(res, 200, deps.store.loadGraph(id).toJSON());
      if (rest[0] === "tools" && rest[1] && method === "GET") {
        const tool = TRACE_TOOLS.find((t) => t.name === rest[1]);
        if (!tool) throw new HttpError(404, "tool_not_found", `Unknown tool ${rest[1]}.`);
        const input: Record<string, unknown> = Object.fromEntries(url.searchParams);
        if (typeof input.pr_number === "string") input.pr_number = Number(input.pr_number);
        return send(res, 200, runTraceTool(deps.store.loadGraph(id), id, tool.name, input));
      }
      if (rest[0] === "ask" && method === "POST") {
        const ip = req.socket.remoteAddress ?? "unknown";
        if (!limiter.take(ip))
          throw new HttpError(429, "rate_limited", "Trop de questions, réessayez dans une minute.");
        const body = AskSchema.parse(await readJson(req));
        const graph = deps.store.loadGraph(id);
        const useLlm = body.mode === "llm" || (body.mode === "auto" && deps.provider !== null);
        if (useLlm) {
          if (!deps.provider)
            throw new HttpError(503, "llm_not_configured", "Aucun fournisseur LLM configuré.");
          try {
            const answer = await answerWithAgent(deps.provider, graph, id, body.question, {
              meter,
            });
            log({
              level: "info",
              requestId,
              event: "ask",
              mode: "llm",
              tools: answer.toolCalls.map((c) => c.name),
              usage: answer.usage,
            });
            return send(res, 200, answer);
          } catch (error) {
            if (body.mode === "llm") throw error;
            log({
              level: "warn",
              requestId,
              event: "llm_fallback",
              error: error instanceof XdmfsError ? error.code : "unknown",
            });
            const fallback = answerDeterministic(graph, id, body.question, p.info.jiraProjectKeys);
            return send(res, 200, {
              ...fallback,
              fallbackReason: error instanceof XdmfsError ? error.code : "llm_error",
            });
          }
        }
        return send(
          res,
          200,
          answerDeterministic(graph, id, body.question, p.info.jiraProjectKeys),
        );
      }
    }
    if (parts[0] === "api") throw new HttpError(404, "not_found", "Unknown endpoint.");
    if (method !== "GET" && method !== "HEAD")
      throw new HttpError(405, "method_not_allowed", "Method not allowed.");
    return serveStatic(req, res, url.pathname);
  }

  return async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const requestId = randomUUID();
    const t0 = Date.now();
    const url = new URL(req.url ?? "/", "http://localhost");
    try {
      await route(req, res, url, requestId);
    } catch (error) {
      if (error instanceof HttpError)
        send(res, error.status, { error: error.code, message: error.message, requestId });
      else if (error instanceof z.ZodError)
        send(res, 400, { error: "invalid_request", message: z.prettifyError(error), requestId });
      else if (error instanceof XdmfsError) {
        const status =
          error.code === "not_found"
            ? 404
            : error.code === "rate_limited"
              ? 429
              : error.code === "not_configured"
                ? 503
                : 502;
        send(res, status, { error: error.code, message: redact(error.message), requestId });
      } else {
        log({
          level: "error",
          requestId,
          event: "unhandled",
          message: redact(error instanceof Error ? error.message : String(error)),
        });
        send(res, 500, { error: "internal_error", message: "Erreur interne.", requestId });
      }
    } finally {
      if (url.pathname.startsWith("/api/")) {
        log({
          level: "info",
          requestId,
          method: req.method,
          path: url.pathname,
          status: res.statusCode,
          ms: Date.now() - t0,
        });
      }
    }
  };
}
