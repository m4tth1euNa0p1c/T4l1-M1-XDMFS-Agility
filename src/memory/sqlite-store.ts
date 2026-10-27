import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { buildGraph } from "../traceability/builder.js";
import { TraceGraph } from "../traceability/graph.js";
import { relationId, type Entity, type Relation } from "../traceability/model.js";
import {
  ProjectInfoSchema,
  SyncSnapshotSchema,
  type SyncSnapshotInput,
} from "../traceability/snapshot.js";
import { MIGRATIONS } from "./migrations.js";
import type { AgentStep, AgentTask, ProjectRow, SyncResult, TraceStore } from "./store.js";

type Row = Record<string, unknown>;

export class SqliteTraceStore implements TraceStore {
  private readonly db: Database.Database;

  constructor(file = ":memory:") {
    if (file !== ":memory:") mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    this.db = new Database(file);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
  }

  /** Applies pending migrations in order. Returns the schema version. */
  migrate(): number {
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)",
    );
    const applied = new Set(
      (this.db.prepare("SELECT version FROM schema_migrations").all() as Row[]).map((r) =>
        Number(r.version),
      ),
    );
    for (const m of MIGRATIONS) {
      if (applied.has(m.version)) continue;
      this.db.transaction(() => {
        this.db.exec(m.sql);
        this.db
          .prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)")
          .run(m.version, m.name, new Date().toISOString());
      })();
    }
    const row = this.db.prepare("SELECT MAX(version) AS v FROM schema_migrations").get() as Row;
    return Number(row.v ?? 0);
  }

  /**
   * Upserts a snapshot. Deduplication is by stable id. Rows of the same
   * project not seen in this sync are flagged stale (kept for audit,
   * hidden from queries by default).
   */
  saveSnapshot(input: SyncSnapshotInput, source = "snapshot"): SyncResult {
    const snapshot = SyncSnapshotSchema.parse(input);
    const graph = buildGraph(snapshot);
    const p = snapshot.project;
    const now = new Date().toISOString();

    return this.db.transaction((): SyncResult => {
      this.db
        .prepare(
          `INSERT INTO projects (id, name, demo, info_json, created_at, last_sync_at) VALUES (@id, @name, @demo, @info, @now, @now)
           ON CONFLICT(id) DO UPDATE SET name = excluded.name, demo = excluded.demo, info_json = excluded.info_json, last_sync_at = excluded.last_sync_at`,
        )
        .run({ id: p.id, name: p.name, demo: p.demo ? 1 : 0, info: JSON.stringify(p), now });

      const run = this.db
        .prepare(
          "INSERT INTO sync_runs (project_id, source, started_at, status, cursor) VALUES (?, ?, ?, 'running', ?)",
        )
        .run(p.id, source, now, snapshot.observedAt);
      const syncId = Number(run.lastInsertRowid);

      const upsertEntity = this.db.prepare(
        `INSERT INTO entities (id, project_id, type, key, title, attributes_json, source, url, observed_at, first_seen_at, last_seen_sync, stale)
         VALUES (@id, @projectId, @type, @key, @title, @attributes, @source, @url, @observedAt, @now, @sync, 0)
         ON CONFLICT(id) DO UPDATE SET title = excluded.title, attributes_json = excluded.attributes_json, source = excluded.source,
           url = excluded.url, observed_at = excluded.observed_at, last_seen_sync = excluded.last_seen_sync, stale = 0`,
      );
      for (const e of graph.allEntities()) {
        upsertEntity.run({
          id: e.id,
          projectId: e.projectId,
          type: e.type,
          key: e.key,
          title: e.title,
          attributes: JSON.stringify(e.attributes),
          source: e.source,
          url: e.url ?? null,
          observedAt: e.observedAt,
          now,
          sync: syncId,
        });
      }

      const upsertRelation = this.db.prepare(
        `INSERT INTO relations (id, project_id, type, from_id, to_id, status, method, confidence, source, source_object_id, observed_at, evidence, last_seen_sync, stale)
         VALUES (@id, @projectId, @type, @from, @to, @status, @method, @confidence, @source, @sourceObjectId, @observedAt, @evidence, @sync, 0)
         ON CONFLICT(id) DO UPDATE SET status = excluded.status, confidence = excluded.confidence, source = excluded.source,
           source_object_id = excluded.source_object_id, observed_at = excluded.observed_at, evidence = excluded.evidence,
           last_seen_sync = excluded.last_seen_sync, stale = 0`,
      );
      for (const r of graph.allRelations()) {
        upsertRelation.run({
          id: relationId(r),
          projectId: p.id,
          type: r.type,
          from: r.from,
          to: r.to,
          status: r.status,
          method: r.method,
          confidence: r.confidence,
          source: r.source,
          sourceObjectId: r.sourceObjectId,
          observedAt: r.observedAt,
          evidence: r.evidence ?? null,
          sync: syncId,
        });
      }

      const staleE = this.db
        .prepare(
          "UPDATE entities SET stale = 1 WHERE project_id = ? AND last_seen_sync <> ? AND stale = 0",
        )
        .run(p.id, syncId).changes;
      const staleR = this.db
        .prepare(
          "UPDATE relations SET stale = 1 WHERE project_id = ? AND last_seen_sync <> ? AND stale = 0",
        )
        .run(p.id, syncId).changes;
      const stats = {
        entities: { upserted: graph.allEntities().length, stale: staleE },
        relations: { upserted: graph.allRelations().length, stale: staleR },
      };
      this.db
        .prepare("UPDATE sync_runs SET finished_at = ?, status = 'ok', stats_json = ? WHERE id = ?")
        .run(new Date().toISOString(), JSON.stringify(stats), syncId);
      return { projectId: p.id, syncRunId: syncId, ...stats };
    })();
  }

  loadGraph(projectId: string, options: { includeStale?: boolean } = {}): TraceGraph {
    const graph = new TraceGraph();
    const staleClause = options.includeStale ? "" : "AND stale = 0";
    for (const r of this.db
      .prepare(`SELECT * FROM entities WHERE project_id = ? ${staleClause}`)
      .all(projectId) as Row[]) {
      const entity: Entity = {
        id: String(r.id),
        type: r.type as Entity["type"],
        projectId: String(r.project_id),
        key: String(r.key),
        title: String(r.title),
        attributes: {
          ...(JSON.parse(String(r.attributes_json)) as Record<string, unknown>),
          ...(r.stale ? { stale: true } : {}),
        },
        source: r.source as Entity["source"],
        ...(r.url ? { url: String(r.url) } : {}),
        observedAt: String(r.observed_at),
      };
      graph.addEntity(entity);
    }
    for (const r of this.db
      .prepare(`SELECT * FROM relations WHERE project_id = ? ${staleClause}`)
      .all(projectId) as Row[]) {
      const relation: Relation = {
        type: r.type as Relation["type"],
        from: String(r.from_id),
        to: String(r.to_id),
        status: r.status as Relation["status"],
        method: r.method as Relation["method"],
        confidence: Number(r.confidence),
        source: r.source as Relation["source"],
        sourceObjectId: String(r.source_object_id),
        observedAt: String(r.observed_at),
        ...(r.evidence ? { evidence: String(r.evidence) } : {}),
      };
      graph.addRelation(relation);
    }
    return graph;
  }

  private toProject(r: Row): ProjectRow {
    return {
      id: String(r.id),
      name: String(r.name),
      demo: Boolean(r.demo),
      info: ProjectInfoSchema.parse(JSON.parse(String(r.info_json))),
      lastSyncAt: r.last_sync_at ? String(r.last_sync_at) : null,
    };
  }

  listProjects(): ProjectRow[] {
    return (this.db.prepare("SELECT * FROM projects ORDER BY name").all() as Row[]).map((r) =>
      this.toProject(r),
    );
  }

  getProject(projectId: string): ProjectRow | undefined {
    const r = this.db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as
      Row | undefined;
    return r ? this.toProject(r) : undefined;
  }

  /** Cursor of the last successful sync, for incremental fetches. */
  lastCursor(projectId: string, source: string): string | null {
    const r = this.db
      .prepare(
        "SELECT cursor FROM sync_runs WHERE project_id = ? AND source = ? AND status = 'ok' ORDER BY id DESC LIMIT 1",
      )
      .get(projectId, source) as Row | undefined;
    return r?.cursor ? String(r.cursor) : null;
  }

  cacheGet<T>(key: string, now: number = Date.now()): T | undefined {
    const r = this.db.prepare("SELECT value_json, expires_at FROM cache WHERE key = ?").get(key) as
      Row | undefined;
    if (!r) return undefined;
    if (Number(r.expires_at) <= now) {
      this.db.prepare("DELETE FROM cache WHERE key = ?").run(key);
      return undefined;
    }
    return JSON.parse(String(r.value_json)) as T;
  }

  cacheSet(key: string, value: unknown, ttlMs: number, now: number = Date.now()): void {
    if (!(ttlMs > 0)) throw new RangeError("ttlMs must be positive");
    this.db
      .prepare(
        "INSERT INTO cache (key, value_json, expires_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, expires_at = excluded.expires_at",
      )
      .run(key, JSON.stringify(value), now + ttlMs);
  }

  cachePurge(now: number = Date.now()): number {
    return this.db.prepare("DELETE FROM cache WHERE expires_at <= ?").run(now).changes;
  }

  createTask(task: Omit<AgentTask, "createdAt" | "updatedAt" | "status">): AgentTask {
    const now = new Date().toISOString();
    this.db
      .prepare(
        "INSERT INTO agent_tasks (id, title, agent, spec_path, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', ?, ?)",
      )
      .run(task.id, task.title, task.agent, task.specPath, now, now);
    return { ...task, status: "pending", createdAt: now, updatedAt: now };
  }

  updateTaskStatus(id: string, status: AgentTask["status"]): void {
    this.db
      .prepare("UPDATE agent_tasks SET status = ?, updated_at = ? WHERE id = ?")
      .run(status, new Date().toISOString(), id);
  }

  addStep(step: Omit<AgentStep, "id" | "createdAt">): AgentStep {
    const now = new Date().toISOString();
    const res = this.db
      .prepare(
        "INSERT INTO agent_steps (task_id, name, status, result_json, evidence, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        step.taskId,
        step.name,
        step.status,
        JSON.stringify(step.result ?? null),
        step.evidence,
        now,
      );
    return { ...step, id: Number(res.lastInsertRowid), createdAt: now };
  }

  getTask(id: string): (AgentTask & { steps: AgentStep[] }) | undefined {
    const t = this.db.prepare("SELECT * FROM agent_tasks WHERE id = ?").get(id) as Row | undefined;
    if (!t) return undefined;
    const steps = (
      this.db.prepare("SELECT * FROM agent_steps WHERE task_id = ? ORDER BY id").all(id) as Row[]
    ).map((s) => ({
      id: Number(s.id),
      taskId: String(s.task_id),
      name: String(s.name),
      status: s.status as AgentStep["status"],
      result: s.result_json ? JSON.parse(String(s.result_json)) : null,
      evidence: s.evidence ? String(s.evidence) : null,
      createdAt: String(s.created_at),
    }));
    return {
      id: String(t.id),
      title: String(t.title),
      agent: String(t.agent),
      specPath: t.spec_path ? String(t.spec_path) : null,
      status: t.status as AgentTask["status"],
      createdAt: String(t.created_at),
      updatedAt: String(t.updated_at),
      steps,
    };
  }

  close(): void {
    this.db.close();
  }
}
