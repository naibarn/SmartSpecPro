/**
 * Portable Markdown representation of a SPEC-268 MemoryItem.
 *
 * Pure format helpers only: NOT a memory provider, authorization source, or R2
 * writer. The canonical MemorySpace/MemoryView authority must check permissions
 * before storage access and again before hydration into LLM context.
 */
import yaml from "js-yaml";
import { z } from "zod";

const opaqueId = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const wikiLink = z.object({
  target_memory_id: opaqueId,
  kind: z.enum(["relates_to", "supports", "supersedes"]),
}).strict();

const wikiHeader = z.object({
  schema_version: z.literal(1),
  memory_id: opaqueId,
  memory_space_id: opaqueId,
  revision: z.number().int().positive().safe(),
  memory_tier: z.enum(["short", "medium", "long"]),
  status: z.enum(["CANDIDATE", "ACTIVE", "ARCHIVED", "DELETED"]),
  title: z.string().max(512),
  updated_at: z.string().datetime({ offset: true }),
  source_refs: z.array(z.string().max(2048)).max(128),
  links: z.array(wikiLink).max(512),
}).strict();

export type WikiMemoryHeader = z.infer<typeof wikiHeader>;
export type WikiMemoryTier = WikiMemoryHeader["memory_tier"];
export type WikiMemoryPage = { header: WikiMemoryHeader; body: string };

const MAX_FRONTMATTER_BYTES = 64 * 1024;
const MAX_NOTE_BYTES = 2 * 1024 * 1024;

/** Canonical storage key relative to the authorized R2 provider binding. */
export function wikiNoteObjectKey(memorySpaceId: string, memoryId: string): string {
  const space = opaqueId.parse(memorySpaceId);
  const note = opaqueId.parse(memoryId);
  return `spaces/${space}/notes/${note.slice(0, 2)}/${note}.md`;
}

function validatePage(page: WikiMemoryPage): WikiMemoryPage {
  const header = wikiHeader.parse(page.header);
  if (typeof page.body !== "string") {
    throw new Error("WIKI_INVALID_BODY");
  }
  if (header.status === "DELETED" && page.body.trim()) {
    throw new Error("WIKI_DELETED_NOTE_MUST_NOT_RETAIN_BODY");
  }
  if (new Set(header.links.map(link => `${link.kind}:${link.target_memory_id}`)).size !== header.links.length) {
    throw new Error("WIKI_DUPLICATE_LINK");
  }
  if (Buffer.byteLength(page.body, "utf8") > MAX_NOTE_BYTES) {
    throw new Error("WIKI_NOTE_TOO_LARGE");
  }
  return { header, body: page.body };
}

/** YAML frontmatter + Markdown body; never accept content as an ACL or instruction. */
export function serializeWikiMemoryPage(page: WikiMemoryPage): string {
  const valid = validatePage(page);
  const frontmatter = yaml.dump(valid.header, {
    schema: yaml.JSON_SCHEMA,
    noRefs: true,
    lineWidth: 120,
    sortKeys: false,
  }).trimEnd();
  if (Buffer.byteLength(frontmatter, "utf8") > MAX_FRONTMATTER_BYTES) {
    throw new Error("WIKI_FRONTMATTER_TOO_LARGE");
  }
  return `---\n${frontmatter}\n---\n${valid.body}`;
}

export function parseWikiMemoryPage(markdown: string): WikiMemoryPage {
  if (typeof markdown !== "string" || Buffer.byteLength(markdown, "utf8") > MAX_NOTE_BYTES + MAX_FRONTMATTER_BYTES + 16) {
    throw new Error("WIKI_INVALID_SIZE");
  }
  if (!markdown.startsWith("---\n")) {
    throw new Error("WIKI_MISSING_FRONTMATTER");
  }
  const closing = markdown.indexOf("\n---\n", 4);
  if (closing === -1 || Buffer.byteLength(markdown.slice(4, closing), "utf8") > MAX_FRONTMATTER_BYTES) {
    throw new Error("WIKI_INVALID_FRONTMATTER");
  }
  const rawHeader = yaml.load(markdown.slice(4, closing), { schema: yaml.JSON_SCHEMA });
  const header = wikiHeader.parse(rawHeader);
  return validatePage({ header, body: markdown.slice(closing + 5) });
}

/**
 * Promotion/demotion changes only this Note's metadata and revision; IDs and
 * link targets are stable, and no second "long-term store" is created.
 */
export function changeWikiMemoryTier(
  page: WikiMemoryPage,
  tier: WikiMemoryTier,
  updatedAt: string,
): WikiMemoryPage {
  const valid = validatePage(page);
  const next = { ...valid, header: { ...valid.header, memory_tier: tier, revision: valid.header.revision + 1, updated_at: updatedAt } };
  return validatePage(next);
}

/**
 * Derived graph projection. The caller MUST supply an already authorized set
 * of note IDs, scoped to a single server-authorized MemorySpace. Neither Wiki
 * frontmatter nor a link alone authorizes reading another note.
 */
export function buildAuthorizedWikiBacklinks(
  pages: readonly WikiMemoryPage[],
  memorySpaceId: string,
  authorizedMemoryIds: ReadonlySet<string>,
): Map<string, string[]> {
  const space = opaqueId.parse(memorySpaceId);
  const allowed = new Map<string, WikiMemoryPage>();
  for (const entry of pages) {
    const page = validatePage(entry);
    if (page.header.memory_space_id !== space || page.header.status === "DELETED" || !authorizedMemoryIds.has(page.header.memory_id)) {
      continue;
    }
    if (allowed.has(page.header.memory_id)) {
      throw new Error("WIKI_DUPLICATE_MEMORY_ID");
    }
    allowed.set(page.header.memory_id, page);
  }
  const backlinks = new Map<string, Set<string>>();
  for (const noteId of allowed.keys()) backlinks.set(noteId, new Set());
  for (const [sourceId, page] of allowed) {
    for (const link of page.header.links) {
      if (allowed.has(link.target_memory_id)) {
        backlinks.get(link.target_memory_id)!.add(sourceId);
      }
    }
  }
  return new Map(Array.from(backlinks, ([id, sources]) => [id, [...sources].sort()]));
}
