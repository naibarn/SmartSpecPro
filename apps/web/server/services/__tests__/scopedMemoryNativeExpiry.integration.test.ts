import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { scopedMemories } from "../../../drizzle/schema";
import { createSpec267NativePostgres } from "./support/spec267NativePostgres";

const { database } = vi.hoisted(() => ({ database: { current: null as any } }));
vi.mock("../../db", () => ({ getDb: () => {
  if (!database.current) throw new Error("Native test database is not ready");
  return database.current;
} }));
vi.mock("../queryEmbeddingService", () => ({ generateQueryEmbedding: vi.fn(async () => null) }));

import { listMemories, retrieveForPrompt, searchMemories } from "../scopedMemoryService";

const suite = process.env.RUN_NATIVE_MEMORY_EXPIRY_TESTS === "true" ? describe : describe.skip;

suite("scoped memory expiry with native PostgreSQL", () => {
  let fixture: Awaited<ReturnType<typeof createSpec267NativePostgres>> | undefined;
  let client: ReturnType<Awaited<ReturnType<typeof createSpec267NativePostgres>>["connect"]> | undefined;
  const tenantId = randomUUID();
  const userId = 268001;
  const assistantId = randomUUID();

  beforeAll(async () => {
    fixture = await createSpec267NativePostgres();
    client = fixture.connect();
    database.current = drizzle(client);
    await client.unsafe("CREATE EXTENSION vector");
    await client.unsafe(`
      CREATE TYPE memory_owner_type AS ENUM ('user', 'agent', 'team', 'room', 'project', 'run');
      CREATE TYPE memory_kind AS ENUM ('fact', 'rule', 'preference', 'decision', 'note', 'checklist', 'artifact_note', 'handoff_note', 'episode');
      CREATE TYPE memory_visibility AS ENUM ('private', 'shared_team', 'shared_room', 'shared_project');
      CREATE TYPE memory_source_type AS ENUM ('auto', 'manual', 'promoted');
      CREATE TABLE scoped_memories (
        id text PRIMARY KEY, "tenantId" varchar(36) NOT NULL, "ownerType" memory_owner_type NOT NULL,
        "ownerId" text NOT NULL, "memoryKind" memory_kind NOT NULL,
        visibility memory_visibility NOT NULL DEFAULT 'private', "sourceType" memory_source_type NOT NULL DEFAULT 'auto',
        "sourceUserId" integer, "sourceAssistantId" text, "sourceRoomId" text, "projectId" varchar(100),
        title text NOT NULL, content text NOT NULL, summary text, tags text[], "metadataJson" jsonb,
        embedding vector(1536), confidence numeric(3,2) DEFAULT 0.80, importance integer DEFAULT 5,
        "reinforcementCount" integer DEFAULT 0, "lastAccessedAt" timestamptz, "expiresAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE memory_promotions (
        id text PRIMARY KEY, "memoryId" text NOT NULL, "fromOwnerType" memory_owner_type NOT NULL,
        "fromOwnerId" text NOT NULL, "toOwnerType" memory_owner_type NOT NULL, "toOwnerId" text NOT NULL,
        "promotedByUserId" integer, "promotedByAssistantId" text, reason text,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );
    `);
  }, 30_000);

  afterAll(async () => {
    database.current = null;
    await client?.end({ timeout: 2 });
    await fixture?.close();
  });

  it("applies null-or-future expiry in native list, search, and prompt SQL", async () => {
    const cutoff = new Date();
    const entries = [
      { id: "expired", expiresAt: new Date(cutoff.getTime() - 1) },
      { id: "boundary", expiresAt: cutoff },
      { id: "future", expiresAt: new Date(cutoff.getTime() + 60_000) },
      { id: "never", expiresAt: null },
    ];
    await database.current.insert(scopedMemories).values(entries.map(({ id, expiresAt }) => ({
      id,
      tenantId,
      ownerType: "user" as const,
      ownerId: String(userId),
      memoryKind: "fact" as const,
      title: "Native expiry marker",
      content: `native expiry acceptance ${id}`,
      expiresAt,
    })));

    const managementList = await listMemories(tenantId, "user", String(userId));
    expect(managementList.map(memory => memory.id).sort()).toEqual(["boundary", "expired", "future", "never"]);

    const activeList = await listMemories(tenantId, "user", String(userId), 50, undefined, false, cutoff);
    expect(activeList.map(memory => memory.id).sort()).toEqual(["future", "never"]);

    const search = await searchMemories({
      tenantId,
      scopes: [{ type: "user", id: String(userId) }],
      query: "native expiry acceptance",
      projectId: null,
      activeAt: cutoff,
    });
    expect(search.map(result => result.memory.id).sort()).toEqual(["future", "never"]);

    const prompt = await retrieveForPrompt(
      tenantId, assistantId, null, null, null, "native expiry acceptance", 1200,
      undefined, { initiatedByUserId: userId, projectId: null },
    );
    expect(prompt.map(result => result.memory.id).sort()).toEqual(["future", "never"]);
  }, 30_000);
});
