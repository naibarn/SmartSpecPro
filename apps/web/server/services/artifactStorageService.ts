/**
 * Artifact Storage Service
 * Routes artifact types to correct storage (messages.artifacts JSONB vs conversationArtifacts table).
 */
import { eq, and, asc, desc } from "drizzle-orm";
import { getDb } from "../db";
import { conversationArtifacts, messages, conversations } from "../../drizzle/schema";
import type { ParsedArtifact } from "./artifactParser";
import { randomUUID } from "crypto";

const MAX_CONTENT_BYTES = 512_000; // 500KB

/** Types stored in messages.artifacts JSONB (simple, no versioning) */
const SIMPLE_TYPES = new Set(["code", "markdown", "mermaid", "svg"]);

/** Types stored in conversationArtifacts table (versioned, interactive) */
const VERSIONED_TYPES = new Set(["react", "html", "chart", "table"]);

export function isSimpleArtifact(type: string): boolean {
  return SIMPLE_TYPES.has(type);
}

export function isVersionedArtifact(type: string): boolean {
  return VERSIONED_TYPES.has(type);
}

/**
 * Store parsed artifacts from an LLM response.
 * - Simple types: append to messages.artifacts JSONB array
 * - Versioned types: INSERT into conversationArtifacts with version=1
 */
export async function storeArtifacts(
  conversationId: number,
  messageId: number,
  artifacts: ParsedArtifact[],
): Promise<void> {
  const db = await getDb();
  if (!db || artifacts.length === 0) return;

  const simpleArtifacts = artifacts.filter((a) => isSimpleArtifact(a.type));
  const versionedArtifacts = artifacts.filter((a) => isVersionedArtifact(a.type));

  // Append simple artifacts to messages.artifacts JSONB
  if (simpleArtifacts.length > 0) {
    const [msg] = await db
      .select({ id: messages.id, artifacts: messages.artifacts })
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);

    if (msg) {
      const existing = (msg.artifacts as any[]) || [];
      const newEntries = simpleArtifacts.map((a) => ({
        id: randomUUID(),
        type: a.type,
        title: a.title || `${a.type} artifact`,
        content: a.content,
        language: a.language,
      }));

      await db
        .update(messages)
        .set({ artifacts: [...existing, ...newEntries] })
        .where(eq(messages.id, messageId));
    }
  }

  // Insert versioned artifacts into conversationArtifacts table
  for (const artifact of versionedArtifacts) {
    await db.insert(conversationArtifacts).values({
      id: randomUUID(),
      conversationId,
      messageId,
      artifactType: artifact.type,
      title: artifact.title || `${artifact.type} artifact`,
      content: artifact.content,
      language: artifact.language,
      version: 1,
      parentArtifactId: null,
    });
  }
}

/**
 * Create a new version of an existing artifact.
 * INSERTs a new row with parentArtifactId pointing to the current version.
 */
export async function createArtifactVersion(
  artifactId: string,
  newContent: string,
  userId: number,
  tenantId?: string,
): Promise<{ id: string; version: number }> {
  if (new TextEncoder().encode(newContent).length > MAX_CONTENT_BYTES) {
    throw new Error("Artifact content exceeds 500KB limit");
  }

  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  // Get existing artifact
  const [existing] = await db
    .select()
    .from(conversationArtifacts)
    .where(eq(conversationArtifacts.id, artifactId));

  if (!existing) throw new Error("NOT_FOUND");

  // Verify ownership through conversation
  const [convo] = await db
    .select({ userId: conversations.userId, tenantId: conversations.tenantId })
    .from(conversations)
    .where(eq(conversations.id, existing.conversationId));

  if (!convo) throw new Error("NOT_FOUND");
  if (convo.userId !== userId) throw new Error("FORBIDDEN");
  if (tenantId && convo.tenantId !== tenantId) throw new Error("FORBIDDEN");

  const newId = randomUUID();
  const newVersion = (existing.version ?? 1) + 1;

  await db.insert(conversationArtifacts).values({
    id: newId,
    conversationId: existing.conversationId,
    messageId: existing.messageId,
    artifactType: existing.artifactType,
    title: existing.title,
    content: newContent,
    language: existing.language,
    version: newVersion,
    parentArtifactId: artifactId,
  });

  return { id: newId, version: newVersion };
}

/**
 * Get all versioned artifacts for a conversation.
 * Only returns the latest version of each artifact chain.
 */
export async function getConversationArtifacts(
  conversationId: number,
  userId: number,
  tenantId: string,
): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];

  // Verify ownership
  const [convo] = await db
    .select({ id: conversations.id, userId: conversations.userId, tenantId: conversations.tenantId })
    .from(conversations)
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.tenantId, tenantId),
      ),
    );

  if (!convo) throw new Error("NOT_FOUND");
  if (convo.userId !== userId) throw new Error("FORBIDDEN");

  return db
    .select()
    .from(conversationArtifacts)
    .where(eq(conversationArtifacts.conversationId, conversationId))
    .orderBy(asc(conversationArtifacts.createdAt));
}

/**
 * Get version history for a specific artifact chain.
 */
export async function getArtifactVersions(
  artifactId: string,
  userId: number,
  tenantId: string,
): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];

  // Get the artifact to find its conversation
  const [artifact] = await db
    .select()
    .from(conversationArtifacts)
    .where(eq(conversationArtifacts.id, artifactId));

  if (!artifact) throw new Error("NOT_FOUND");

  // Verify ownership through conversation
  const [convo] = await db
    .select({ userId: conversations.userId, tenantId: conversations.tenantId })
    .from(conversations)
    .where(eq(conversations.id, artifact.conversationId));

  if (!convo) throw new Error("NOT_FOUND");
  if (convo.tenantId !== tenantId || convo.userId !== userId) {
    throw new Error("FORBIDDEN");
  }

  // Find the root artifact (version 1)
  let rootId = artifactId;
  if (artifact.parentArtifactId) {
    // Walk up the chain to find root
    const all = await db
      .select()
      .from(conversationArtifacts)
      .where(eq(conversationArtifacts.conversationId, artifact.conversationId));

    const byId = new Map(all.map((a) => [a.id, a]));
    let current = artifact;
    while (current.parentArtifactId && byId.has(current.parentArtifactId)) {
      current = byId.get(current.parentArtifactId)!;
    }
    rootId = current.id;
  }

  // Get all versions in chain
  const allArtifacts = await db
    .select()
    .from(conversationArtifacts)
    .where(eq(conversationArtifacts.conversationId, artifact.conversationId))
    .orderBy(asc(conversationArtifacts.version));

  // Filter to just this chain
  const chain: any[] = [];
  const visited = new Set<string>();
  const queue = [rootId];

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const item = allArtifacts.find((a) => a.id === id);
    if (item) chain.push(item);

    // Find children
    for (const a of allArtifacts) {
      if (a.parentArtifactId === id && !visited.has(a.id)) {
        queue.push(a.id);
      }
    }
  }

  return chain.sort((a, b) => a.version - b.version);
}
