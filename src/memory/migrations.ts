/**
 * Versioned, append-only migrations. Never edit a released migration:
 * add a new one with the next version number.
 */
export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "traceability_core",
    sql: `
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        demo INTEGER NOT NULL DEFAULT 0,
        info_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_sync_at TEXT
      );

      CREATE TABLE entities (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        key TEXT NOT NULL,
        title TEXT NOT NULL,
        attributes_json TEXT NOT NULL,
        source TEXT NOT NULL,
        url TEXT,
        observed_at TEXT NOT NULL,
        first_seen_at TEXT NOT NULL,
        last_seen_sync INTEGER NOT NULL,
        stale INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX idx_entities_project_type ON entities(project_id, type);

      CREATE TABLE relations (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        from_id TEXT NOT NULL,
        to_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('verified','inferred','unknown')),
        method TEXT NOT NULL,
        confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
        source TEXT NOT NULL,
        source_object_id TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        evidence TEXT,
        last_seen_sync INTEGER NOT NULL,
        stale INTEGER NOT NULL DEFAULT 0,
        CHECK (status <> 'verified' OR (evidence IS NOT NULL AND confidence = 1)),
        CHECK (status <> 'inferred' OR confidence < 1)
      );
      CREATE INDEX idx_relations_from ON relations(from_id);
      CREATE INDEX idx_relations_to ON relations(to_id);

      CREATE TABLE sync_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL,
        source TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        status TEXT NOT NULL,
        cursor TEXT,
        stats_json TEXT,
        error TEXT
      );
    `,
  },
  {
    version: 2,
    name: "cache_and_agent_memory",
    sql: `
      CREATE TABLE cache (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX idx_cache_expires ON cache(expires_at);

      CREATE TABLE agent_tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        agent TEXT NOT NULL,
        spec_path TEXT,
        status TEXT NOT NULL CHECK (status IN ('pending','running','done','failed')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE agent_steps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('ok','failed','skipped')),
        result_json TEXT,
        evidence TEXT,
        created_at TEXT NOT NULL
      );
    `,
  },
];
