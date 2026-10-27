import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildBankDemoSnapshot } from "../../src/demo/bank-project.js";
import { MIGRATIONS } from "../../src/memory/migrations.js";
import { SqliteTraceStore } from "../../src/memory/sqlite-store.js";
import { buildGraph } from "../../src/traceability/builder.js";

let store: SqliteTraceStore;
beforeEach(() => {
  store = new SqliteTraceStore(":memory:");
  store.migrate();
});
afterEach(() => store.close());

describe("SqliteTraceStore", () => {
  it("applies all migrations idempotently", () => {
    expect(store.migrate()).toBe(MIGRATIONS.at(-1)!.version);
  });

  it("round-trips a snapshot without loss", () => {
    const snap = buildBankDemoSnapshot();
    const result = store.saveSnapshot(snap, "demo");
    const fromDb = store.loadGraph("aurore-pay");
    const direct = buildGraph(snap);
    expect(fromDb.stats()).toEqual(direct.stats());
    expect(result.entities.stale).toBe(0);
    expect(store.getProject("aurore-pay")?.demo).toBe(true);
  });

  it("deduplicates on re-sync and records a cursor", () => {
    const snap = buildBankDemoSnapshot();
    store.saveSnapshot(snap, "demo");
    const second = store.saveSnapshot(snap, "demo");
    expect(second.entities.stale).toBe(0);
    expect(store.loadGraph("aurore-pay").allEntities()).toHaveLength(
      buildGraph(snap).allEntities().length,
    );
    expect(store.lastCursor("aurore-pay", "demo")).toBe(snap.observedAt);
  });

  it("flags entities missing from a newer sync as stale and hides them", () => {
    const snap = buildBankDemoSnapshot();
    store.saveSnapshot(snap, "demo");
    const smaller = {
      ...snap,
      observedAt: "2026-10-28T09:00:00+01:00",
      issues: (snap.issues ?? []).filter((i) => i.key !== "PAY-15"),
    };
    const res = store.saveSnapshot(smaller, "demo");
    expect(res.entities.stale).toBeGreaterThan(0);
    expect(store.loadGraph("aurore-pay").getEntity("Issue:aurore-pay:PAY-15")).toBeUndefined();
    expect(
      store.loadGraph("aurore-pay", { includeStale: true }).getEntity("Issue:aurore-pay:PAY-15")
        ?.attributes.stale,
    ).toBe(true);
  });

  it("enforces relation invariants at the database level", () => {
    store.saveSnapshot(buildBankDemoSnapshot(), "demo");
    const db = (
      store as unknown as { db: { prepare(s: string): { run(...a: unknown[]): unknown } } }
    ).db;
    expect(() =>
      db
        .prepare(
          "INSERT INTO relations (id, project_id, type, from_id, to_id, status, method, confidence, source, source_object_id, observed_at, evidence, last_seen_sync) VALUES ('x','aurore-pay','IMPLEMENTS','a','b','verified','manual',1,'demo','o','t',NULL,1)",
        )
        .run(),
    ).toThrow(/CHECK/);
  });

  it("expires cache entries after their TTL", () => {
    store.cacheSet("k", { v: 1 }, 1000, 0);
    expect(store.cacheGet("k", 500)).toEqual({ v: 1 });
    expect(store.cacheGet("k", 1000)).toBeUndefined();
    store.cacheSet("a", 1, 10, 0);
    expect(store.cachePurge(100)).toBe(1);
  });

  it("stores agent execution memory with evidence", () => {
    store.createTask({
      id: "T-001",
      title: "Bootstrap",
      agent: "qa-agent",
      specPath: "specs/T-001.md",
    });
    store.updateTaskStatus("T-001", "running");
    store.addStep({
      taskId: "T-001",
      name: "npm test",
      status: "ok",
      result: { passed: 10 },
      evidence: "docs/evidence/test.txt",
    });
    const task = store.getTask("T-001")!;
    expect(task.status).toBe("running");
    expect(task.steps[0]).toMatchObject({ name: "npm test", result: { passed: 10 } });
  });
});
