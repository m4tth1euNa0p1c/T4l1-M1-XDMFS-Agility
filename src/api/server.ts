import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { envInt, envString, loadDotEnv } from "../core/config.js";
import { ensureDemoProject } from "../demo/seed.js";
import { SqliteTraceStore } from "../memory/sqlite-store.js";
import { createProviderFromEnv } from "../providers/registry.js";
import { redact } from "../security/secrets.js";
import { createApp } from "./app.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

loadDotEnv(ROOT);
const store = new SqliteTraceStore(
  envString("XDMFS_DB_PATH") ?? path.join(ROOT, "data/xdmfs.sqlite"),
);
const schemaVersion = store.migrate();
const seeded = ensureDemoProject(store);

let provider = null;
try {
  provider = createProviderFromEnv();
} catch (error) {
  console.error(
    redact(`LLM provider disabled: ${error instanceof Error ? error.message : String(error)}`),
  );
}

const handler = createApp({
  store,
  provider,
  publicDir: path.join(ROOT, "public"),
  version: "0.1.0",
});
const port = envInt("PORT", 3000);
const host = envString("HOST") ?? "127.0.0.1";
const server = createServer((req, res) => void handler(req, res));
server.requestTimeout = 30_000;
server.headersTimeout = 10_000;

server.listen(port, host, () => {
  process.stdout.write(
    `${JSON.stringify({ level: "info", event: "listening", url: `http://${host}:${port}/`, schemaVersion, demoSeeded: seeded, llm: provider?.id ?? "none" })}\n`,
  );
});

function shutdown(signal: string): void {
  process.stdout.write(`${JSON.stringify({ level: "info", event: "shutdown", signal })}\n`);
  server.close(() => {
    store.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
