import type { TraceGraph } from "../traceability/graph.js";
import type { ProjectInfo, SyncSnapshotInput } from "../traceability/snapshot.js";

/**
 * Storage contract. The SQLite implementation is the prototype; anything
 * honoring this interface (Postgres, a graph DB) can replace it.
 *
 * Three memory levels:
 *  - Project memory: ADRs, specs, conventions -> versioned files in the repo
 *    (docs/, specs/), not this database;
 *  - Agent execution memory: tasks and steps with evidence (tables agent_*);
 *  - Traceability memory: synced entities and relations with provenance.
 */
export interface SyncResult {
  projectId: string;
  syncRunId: number;
  entities: { upserted: number; stale: number };
  relations: { upserted: number; stale: number };
}

export interface ProjectRow {
  id: string;
  name: string;
  demo: boolean;
  info: ProjectInfo;
  lastSyncAt: string | null;
}

export interface AgentTask {
  id: string;
  title: string;
  agent: string;
  specPath: string | null;
  status: "pending" | "running" | "done" | "failed";
  createdAt: string;
  updatedAt: string;
}

export interface AgentStep {
  id: number;
  taskId: string;
  name: string;
  status: "ok" | "failed" | "skipped";
  result: unknown;
  evidence: string | null;
  createdAt: string;
}

export interface TraceStore {
  migrate(): number;
  saveSnapshot(snapshot: SyncSnapshotInput, source?: string): SyncResult;
  loadGraph(projectId: string, options?: { includeStale?: boolean }): TraceGraph;
  listProjects(): ProjectRow[];
  getProject(projectId: string): ProjectRow | undefined;
  lastCursor(projectId: string, source: string): string | null;

  cacheGet<T>(key: string, now?: number): T | undefined;
  cacheSet(key: string, value: unknown, ttlMs: number, now?: number): void;
  cachePurge(now?: number): number;

  createTask(task: Omit<AgentTask, "createdAt" | "updatedAt" | "status">): AgentTask;
  updateTaskStatus(id: string, status: AgentTask["status"]): void;
  addStep(step: Omit<AgentStep, "id" | "createdAt">): AgentStep;
  getTask(id: string): (AgentTask & { steps: AgentStep[] }) | undefined;

  close(): void;
}
