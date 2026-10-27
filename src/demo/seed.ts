import type { TraceStore } from "../memory/store.js";
import { buildBankDemoSnapshot } from "./bank-project.js";

/** Loads the fictional bank project if it is not already stored. */
export function ensureDemoProject(store: TraceStore): boolean {
  if (store.getProject("aurore-pay")) return false;
  store.saveSnapshot(buildBankDemoSnapshot(), "demo");
  return true;
}
