import {
  EntitySchema,
  RelationSchema,
  relationId,
  strongest,
  type Entity,
  type EntityInput,
  type EntityType,
  type Relation,
  type RelationStatus,
  type RelationType,
} from "./model.js";

/**
 * In-memory graph with deduplication. Entities merge by id; relations
 * dedupe by (type, from, to, method), so a verified and an inferred link
 * between the same nodes coexist and both stay visible as evidence.
 */
export class TraceGraph {
  private readonly entities = new Map<string, Entity>();
  private readonly relations = new Map<string, Relation>();
  private readonly outgoing = new Map<string, Set<string>>();
  private readonly incoming = new Map<string, Set<string>>();

  addEntity(input: EntityInput): Entity {
    const entity = EntitySchema.parse(input);
    const existing = this.entities.get(entity.id);
    if (existing) {
      const merged: Entity = {
        ...existing,
        ...entity,
        attributes: { ...existing.attributes, ...entity.attributes },
        observedAt:
          entity.observedAt > existing.observedAt ? entity.observedAt : existing.observedAt,
      };
      this.entities.set(entity.id, merged);
      return merged;
    }
    this.entities.set(entity.id, entity);
    return entity;
  }

  addRelation(input: Relation): Relation {
    const relation = RelationSchema.parse(input);
    const id = relationId(relation);
    const existing = this.relations.get(id);
    if (existing && existing.observedAt >= relation.observedAt) return existing;
    this.relations.set(id, relation);
    if (!this.outgoing.has(relation.from)) this.outgoing.set(relation.from, new Set());
    if (!this.incoming.has(relation.to)) this.incoming.set(relation.to, new Set());
    this.outgoing.get(relation.from)!.add(id);
    this.incoming.get(relation.to)!.add(id);
    return relation;
  }

  getEntity(id: string): Entity | undefined {
    return this.entities.get(id);
  }

  allEntities(type?: EntityType): Entity[] {
    const all = [...this.entities.values()];
    return type ? all.filter((e) => e.type === type) : all;
  }

  allRelations(): Relation[] {
    return [...this.relations.values()];
  }

  out(id: string, type?: RelationType): Relation[] {
    return [...(this.outgoing.get(id) ?? [])]
      .map((rid) => this.relations.get(rid)!)
      .filter((r) => !type || r.type === type);
  }

  in(id: string, type?: RelationType): Relation[] {
    return [...(this.incoming.get(id) ?? [])]
      .map((rid) => this.relations.get(rid)!)
      .filter((r) => !type || r.type === type);
  }

  /** Strongest status of any relation of `type` between two nodes. */
  linkStatus(from: string, to: string, type?: RelationType): RelationStatus {
    const statuses = this.out(from, type)
      .filter((r) => r.to === to)
      .map((r) => r.status);
    return statuses.length ? strongest(statuses) : "unknown";
  }

  stats(): { entities: Record<string, number>; relations: Record<RelationStatus, number> } {
    const entities: Record<string, number> = {};
    for (const e of this.entities.values()) entities[e.type] = (entities[e.type] ?? 0) + 1;
    const relations: Record<RelationStatus, number> = { verified: 0, inferred: 0, unknown: 0 };
    for (const r of this.relations.values()) relations[r.status] += 1;
    return { entities, relations };
  }

  toJSON(): { entities: Entity[]; relations: Relation[] } {
    return { entities: this.allEntities(), relations: this.allRelations() };
  }
}
