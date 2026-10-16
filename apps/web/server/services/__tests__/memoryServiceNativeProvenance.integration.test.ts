import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { entityTypeEnum } from "../../../drizzle/schema";
import { createSpec267NativePostgres } from "./support/spec267NativePostgres";

const { getDb, roomMemoryEnabled } = vi.hoisted(() => ({
  getDb: vi.fn(),
  roomMemoryEnabled: vi.fn(() => false),
}));
vi.mock("../../db", () => ({ getDb }));
vi.mock("../teamRoomMemoryPolicy", async importOriginal => ({
  ...await importOriginal<typeof import("../teamRoomMemoryPolicy")>(),
  isTeamRoomMemoryEnabled: roomMemoryEnabled,
}));

import { getEntityMemoriesForContext, upsertEntityMemory } from "../memoryService";

describe("entity memory native PostgreSQL isolation", () => {
  let fixture: Awaited<ReturnType<typeof createSpec267NativePostgres>>;
  let client: ReturnType<typeof fixture.connect>;
  const provenance = {
    tenantId: "tenant-a", roomId: "room-a", teamId: "team-a", runId: "run-a",
    sourceMessageId: "message-a", actorUserId: 7, canonicalProjectId: "project-a",
  };
  const saveRoom = (overrides: Partial<typeof provenance> = {}, facts = ["Prefers concise release notes"]) =>
    upsertEntityMemory(7, "preference", "Release notes", facts, undefined, 5,
      "team_room", overrides.canonicalProjectId ?? "project-a", null,
      { ...provenance, ...overrides });
  const saveOrdinary = (project: string | null, facts: string[], persona: string | null = null) =>
    upsertEntityMemory(7, "preference", "Release notes", facts, undefined, 5,
      "manual", project, persona);
  const readRoom = (user = 7, project = "project-a", tenant = "tenant-a") =>
    getEntityMemoriesForContext(user, 100, project, null, tenant);

  beforeAll(async () => {
    fixture = await createSpec267NativePostgres();
    client = fixture.connect();
    getDb.mockResolvedValue(drizzle(client));
    // Narrow parent tables supply actual FK targets. This is source-ledger
    // acceptance, not an assertion that the entire application schema migrated.
    await client.unsafe(`
      CREATE TABLE tenants (id varchar(36) PRIMARY KEY);
      CREATE TABLE users (id integer PRIMARY KEY);
      CREATE TABLE conversations (id integer PRIMARY KEY, "userId" integer NOT NULL,
        "tenantId" varchar(36), project_id varchar(100));
      CREATE TABLE assistant_teams (id varchar(36) PRIMARY KEY);
      CREATE TABLE team_rooms (id varchar(36) PRIMARY KEY);
      CREATE TABLE team_runs (id varchar(36) PRIMARY KEY);
      CREATE TABLE team_room_messages (id varchar(36) PRIMARY KEY, "roomId" varchar(36) NOT NULL);
      CREATE TABLE canonical_projects (project_id varchar(36) PRIMARY KEY, tenant_id varchar(36) NOT NULL,
        UNIQUE (tenant_id, project_id));
      CREATE TABLE canonical_project_memberships (
        tenant_id varchar(36), project_id varchar(36), principal_id varchar(160),
        role varchar(16) NOT NULL, lifecycle varchar(16) NOT NULL DEFAULT 'ACTIVE',
        created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz,
        PRIMARY KEY (tenant_id, project_id, principal_id));
      CREATE TYPE entity_type AS ENUM (${entityTypeEnum.enumValues.map(value => `'${value}'`).join(",")});
      CREATE TABLE entity_memories (
        id serial PRIMARY KEY, "userId" integer NOT NULL REFERENCES users(id),
        "personaId" varchar(36), "entityType" entity_type NOT NULL,
        "entityName" varchar(255) NOT NULL, facts json NOT NULL DEFAULT '[]',
        "sourceConversationId" integer REFERENCES conversations(id), "projectId" varchar(100), confidence numeric(3,2) DEFAULT 0.8,
        "lastAccessedAt" timestamptz DEFAULT now(), importance integer DEFAULT 5,
        source varchar(20) DEFAULT 'auto', "reinforcementCount" integer DEFAULT 1,
        "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now());
    `);
    // Exercise the checked-in migration unchanged, including its composite FKs.
    await client.unsafe(await readFile(new URL(
      "../../../drizzle/0398_spec268_team_room_entity_memory_sources.sql", import.meta.url), "utf8"));
    await client.unsafe(`
      INSERT INTO tenants VALUES ('tenant-a'), ('tenant-b');
      INSERT INTO users VALUES (7), (8);
      INSERT INTO conversations VALUES (11, 7, 'tenant-a', 'project-a'), (22, 8, 'tenant-b', 'project-b');
      INSERT INTO assistant_teams VALUES ('team-a'), ('team-b');
      INSERT INTO team_rooms VALUES ('room-a'), ('room-b');
      INSERT INTO team_runs VALUES ('run-a');
      INSERT INTO team_room_messages VALUES ('message-a', 'room-a'), ('message-next', 'room-a'), ('message-b', 'room-b');
      INSERT INTO canonical_projects VALUES ('project-a', 'tenant-a'), ('project-b', 'tenant-b');
    `);
  }, 30_000);

  beforeEach(async () => {
    roomMemoryEnabled.mockReturnValue(false);
    await client.unsafe(`
      TRUNCATE entity_memories RESTART IDENTITY CASCADE;
      TRUNCATE canonical_project_memberships;
      INSERT INTO canonical_project_memberships (tenant_id, project_id, principal_id, role)
        VALUES ('tenant-a', 'project-a', 'user:7', 'owner'), ('tenant-b', 'project-b', 'user:7', 'owner');
    `);
  });
  afterAll(async () => {
    await client?.end({ timeout: 2 });
    await fixture?.close();
  });

  it("merges facts in one project and deduplicates source-message provenance", async () => {
    const first = await saveRoom();
    const second = await saveRoom({}, ["Prefers concise release notes", "Uses a weekly release cycle"]);
    await saveRoom({ sourceMessageId: "message-next" });
    expect(second.id).toBe(first.id);
    expect(second.facts).toEqual(["Prefers concise release notes", "Uses a weekly release cycle"]);
    const rows = await client`SELECT * FROM team_room_entity_memory_sources ORDER BY id`;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ entityMemoryId: first.id, entityMemoryOwnerUserId: 7,
      tenantId: "tenant-a", canonicalProjectId: "project-a", actorUserId: 7 });
    expect(rows[0].authorityVersion).toBe("team-room-provider-context.v1");
  });

  it("keeps identical room entities in separate tenant/project scopes", async () => {
    const first = await saveRoom();
    const second = await saveRoom({ tenantId: "tenant-b", canonicalProjectId: "project-b",
      roomId: "room-b", teamId: "team-b", sourceMessageId: "message-b" }, ["Uses a monthly release cycle"]);
    expect(second.id).not.toBe(first.id);
    roomMemoryEnabled.mockReturnValue(true); // Conditional guarded-read coverage only.
    expect((await readRoom()).map(row => row.id)).toEqual([first.id]);
    expect((await readRoom(7, "project-b", "tenant-b")).map(row => row.id)).toEqual([second.id]);
  });

  it("keeps production policy disabled and quarantines legacy rows without provenance", async () => {
    const policy = await vi.importActual<typeof import("../teamRoomMemoryPolicy")>("../teamRoomMemoryPolicy");
    expect(policy.isTeamRoomMemoryEnabled()).toBe(false);
    const saved = await saveRoom();
    await client`INSERT INTO entity_memories ("userId", "entityType", "entityName", source, "projectId")
      VALUES (7, 'preference', 'Legacy room facts', 'team_room', 'project-a')`;
    expect(await readRoom()).toEqual([]);
    roomMemoryEnabled.mockReturnValue(true);
    expect((await readRoom()).map(row => row.id)).toEqual([saved.id]);
    expect(await getEntityMemoriesForContext(7, 100, "project-a", null)).toEqual([]);
    expect(await getEntityMemoriesForContext(7, 100, null, null, "tenant-a")).toEqual([]);
  });

  it("rechecks current tenant, project, owner and membership on every read", async () => {
    const saved = await saveRoom();
    roomMemoryEnabled.mockReturnValue(true);
    expect((await readRoom()).map(row => row.id)).toEqual([saved.id]);
    expect(await readRoom(7, "project-a", "tenant-b")).toEqual([]);
    expect(await readRoom(7, "project-b", "tenant-a")).toEqual([]);
    expect(await readRoom(8)).toEqual([]);
    await client`UPDATE canonical_project_memberships SET lifecycle = 'REVOKED', revoked_at = now()
      WHERE tenant_id = 'tenant-a' AND project_id = 'project-a' AND principal_id = 'user:7'`;
    expect(await readRoom()).toEqual([]);
    await client`UPDATE canonical_project_memberships SET lifecycle = 'ACTIVE', revoked_at = NULL
      WHERE tenant_id = 'tenant-a' AND project_id = 'project-a' AND principal_id = 'user:7'`;
    expect((await readRoom()).map(row => row.id)).toEqual([saved.id]);
  });

  it("rejects mismatched actors before any durable write", async () => {
    await expect(saveRoom({ actorUserId: 8 })).rejects.toThrow("requires canonical source provenance");
    expect(await client`SELECT id FROM entity_memories`).toHaveLength(0);
    expect(await client`SELECT id FROM team_room_entity_memory_sources`).toHaveLength(0);
  });

  it.each([
    { sourceMessageId: "message-b" }, // Actual message/room composite FK.
    { tenantId: "tenant-b" }, // Actual tenant/project composite FK.
  ])("rolls back the memory insert when source FK rejects %j", async overrides => {
    await expect(saveRoom(overrides)).rejects.toThrow();
    expect(await client`SELECT id FROM entity_memories`).toHaveLength(0);
    expect(await client`SELECT id FROM team_room_entity_memory_sources`).toHaveLength(0);
  });

  it("enforces source owner/project and authority constraints in PostgreSQL", async () => {
    const saved = await saveRoom();
    await expect(client`UPDATE team_room_entity_memory_sources SET "entityMemoryOwnerUserId" = 8
      WHERE "entityMemoryId" = ${saved.id}`).rejects.toMatchObject({ code: "23503" });
    await expect(client`UPDATE team_room_entity_memory_sources SET "canonicalProjectId" = 'project-b'
      WHERE "entityMemoryId" = ${saved.id}`).rejects.toMatchObject({ code: "23503" });
    await expect(client`UPDATE team_room_entity_memory_sources SET "authorityVersion" = 'untrusted'
      WHERE "entityMemoryId" = ${saved.id}`).rejects.toMatchObject({ code: "23514" });
    expect(await client`SELECT id FROM team_room_entity_memory_sources`).toHaveLength(1);
  });

  it("preserves provenance and authorization after the owned database restarts", async () => {
    const saved = await saveRoom();
    await client.end({ timeout: 2 });
    await fixture.restart();
    client = fixture.connect();
    getDb.mockResolvedValue(drizzle(client));
    expect(await readRoom()).toEqual([]);
    roomMemoryEnabled.mockReturnValue(true);
    expect((await readRoom()).map(row => row.id)).toEqual([saved.id]);
    expect(await client`SELECT id FROM team_room_entity_memory_sources`).toHaveLength(1);
  });

  it("never merges ordinary project facts into another project", async () => {
    const first = await saveOrdinary("project-a", ["Uses a weekly release cycle"]);
    const second = await saveOrdinary("project-b", ["Uses a monthly release cycle"]);
    expect(second.id).not.toBe(first.id);
    expect((await readRoom()).map(row => row.facts)).toEqual([["Uses a weekly release cycle"]]);
    expect((await readRoom(7, "project-b", "tenant-b")).map(row => row.facts)).toEqual([["Uses a monthly release cycle"]]);
  });

  it("preserves global facts while merging only within the same project and persona", async () => {
    const global = await saveOrdinary(null, ["Prefers concise release notes"]);
    const project = await saveOrdinary("project-a", ["Uses a weekly release cycle"]);
    const merged = await saveOrdinary("project-a", ["Uses a monthly review cycle"]);
    const persona = await saveOrdinary("project-a", ["Uses an editorial checklist"], "persona-a");
    expect(project.id).not.toBe(global.id);
    expect(merged.id).toBe(project.id);
    expect(persona.id).not.toBe(project.id);
    expect(merged.facts).toEqual(["Uses a weekly release cycle", "Uses a monthly review cycle"]);
    expect((await getEntityMemoriesForContext(7, 100, null, null)).map(row => row.facts))
      .toEqual([["Prefers concise release notes"]]);
  });

  it("inherits project scope only from the owner's source conversation", async () => {
    const saved = await upsertEntityMemory(7, "preference", "Release notes",
      ["Uses a weekly release cycle"], 11, 5, "manual", undefined, null);
    expect(saved.projectId).toBe("project-a");
    expect(saved.sourceConversationId).toBe(11);
  });

  it.each([
    { conversation: 22, project: undefined },
    { conversation: 22, project: "project-a" },
    { conversation: 404, project: undefined },
    { conversation: 404, project: "project-a" },
  ])("rejects unavailable source provenance before writing %j", async ({ conversation, project }) => {
    await expect(upsertEntityMemory(7, "preference", "Release notes",
      ["Uses a weekly release cycle"], conversation, 5, "manual", project, null))
      .rejects.toThrow("Source conversation is not available to this user");
    expect(await client`SELECT id FROM entity_memories`).toHaveLength(0);
  });
});
