import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseDotEnv } from "../security/secrets.js";

/**
 * Loads `.env` from the working directory into process.env without
 * overriding variables already present. Values are never printed.
 */
export function loadDotEnv(
  cwd: string = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const file = path.join(cwd, ".env");
  if (!existsSync(file)) return [];
  const parsed = parseDotEnv(readFileSync(file, "utf8"));
  const loaded: string[] = [];
  for (const [key, value] of Object.entries(parsed)) {
    if (env[key] === undefined) {
      env[key] = value;
      loaded.push(key);
    }
  }
  return loaded;
}

export function envString(name: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = env[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

export function envInt(
  name: string,
  fallback: number,
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = envString(name, env);
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
