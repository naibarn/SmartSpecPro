import { desc, eq } from "drizzle-orm";

import { getDb } from "../db";
import {
  libraryItems,
  libraryKnowledgeNotes,
  libraryKnowledgeRelations,
  type LibraryKnowledgeNote,
  type LibraryKnowledgeRelation,
} from "../../drizzle/schema";
import type { LibraryActor } from "./libraryService";
import {
  getLibraryItemById,
  getLibraryMarkdownContent,
  searchLibraryItems,
} from "./libraryService";
import type {
  LibraryKnowledgeInspectorInput,
  LibraryKnowledgeInspectorResult,
  LibraryKnowledgePropertyCatalogInput,
  LibraryKnowledgePropertyCatalogResult,
  LibraryKnowledgeQuickSwitchInput,
  LibraryKnowledgeQuickSwitchResult,
  LibraryKnowledgeTagCatalogInput,
  LibraryKnowledgeTagCatalogResult,
} from "../../shared/libraryKnowledgeRead";
import { recordLibraryKnowledgeSurfaceLatency } from "./libraryKnowledgeObservabilityService";

type DbClient = NonNullable<Awaited<ReturnType<typeof getDb>>>;

function normalizeTenantId(tenantId: string | number): string {
  const normalized = String(tenantId).trim();
  if (!normalized) {
    throw new Error("Invalid tenant ID");
  }
  return normalized;
}

function inferPropertyType(value: unknown): LibraryKnowledgePropertyCatalogResult["properties"][number]["inferredType"] {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "object") return "object";
  return "mixed";
}

function normalizeLogicalPath(metadata: Record<string, unknown> | undefined): string | null {
  return typeof metadata?.logical_path === "string" ? metadata.logical_path : null;
}

function titleOrFallback(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "Untitled";
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const unique = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") {
      continue;
    }

    const normalized = entry.trim();
    if (normalized) {
      unique.add(normalized);
    }
  }

  return [...unique];
}

function extractHeadingTexts(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const unique = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const text = typeof (entry as { text?: unknown }).text === "string"
      ? (entry as { text: string }).text.trim()
      : "";
    if (text) {
      unique.add(text);
    }
  }

  return [...unique];
}

function buildSemanticKnowledgeQuery(input: {
  title: string;
  logicalPath: string | null;
  aliases: string[];
  tags: string[];
  headings: string[];
}): string | null {
  const tokens = new Set<string>();
  const candidates = [
    input.title,
    ...(input.logicalPath ? input.logicalPath.split(/[\/#]/g) : []),
    ...input.aliases,
    ...input.tags,
    ...input.headings.slice(0, 6),
  ];

  for (const candidate of candidates) {
    const normalized = candidate.trim();
    if (normalized) {
      tokens.add(normalized);
    }
  }

  const query = [...tokens].join(" ").trim();
  return query || null;
}

function collectErrorMessages(
  error: unknown,
  seen = new Set<unknown>(),
): string[] {
  if (error == null || seen.has(error)) {
    return [];
  }
  seen.add(error);

  if (typeof error === "string") {
    return error.trim() ? [error] : [];
  }

  if (error instanceof Error) {
    const messages = error.message.trim() ? [error.message] : [];
    const errorWithCause = error as Error & {
      cause?: unknown;
      detail?: unknown;
      hint?: unknown;
      query?: unknown;
      errors?: unknown;
    };

    if (typeof errorWithCause.detail === "string" && errorWithCause.detail.trim()) {
      messages.push(errorWithCause.detail);
    }
    if (typeof errorWithCause.hint === "string" && errorWithCause.hint.trim()) {
      messages.push(errorWithCause.hint);
    }
    if (typeof errorWithCause.query === "string" && errorWithCause.query.trim()) {
      messages.push(errorWithCause.query);
    }
    if (Array.isArray(errorWithCause.errors)) {
      for (const nested of errorWithCause.errors) {
        messages.push(...collectErrorMessages(nested, seen));
      }
    }
    if ("cause" in errorWithCause) {
      messages.push(...collectErrorMessages(errorWithCause.cause, seen));
    }

    return messages;
  }

  if (typeof error === "object") {
    const values = Object.values(error as Record<string, unknown>);
    return values.flatMap((value) => collectErrorMessages(value, seen));
  }

  return [String(error)];
}

function isKnowledgeSchemaUnavailableError(error: unknown): boolean {
  const message = collectErrorMessages(error)
    .join("\n")
    .toLowerCase();

  const mentionsKnowledgeTable =
    message.includes("library_knowledge_notes")
    || message.includes("library_knowledge_relations");
  const indicatesMissingSchema =
    message.includes("does not exist")
    || message.includes("no such table")
    || message.includes("column")
    || message.includes("relation")
    || message.includes("unknown")
    || message.includes("failed query");

  return mentionsKnowledgeTable && indicatesMissingSchema;
}

function isMarkdownLikeKnowledgeItem(item: {
  itemType?: string | null;
  sourceUrl?: string | null;
  metadata?: Record<string, unknown>;
}): boolean {
  const metadataExtension =
    typeof item.metadata?.extension === "string"
      ? item.metadata.extension.toLowerCase().replace(/^\./, "")
      : "";
  const sourceUrl = item.sourceUrl ?? "";
  const extFromUrl = sourceUrl
    ? sourceUrl.split("?")[0]?.split(".").pop()?.toLowerCase() ?? ""
    : "";
  const itemType = (item.itemType ?? "").toLowerCase();
  const ext = metadataExtension || extFromUrl || itemType;
  return ext === "md" || ext === "markdown" || itemType === "markdown";
}

export async function getLibraryKnowledgeInspector(
  input: LibraryKnowledgeInspectorInput,
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<LibraryKnowledgeInspectorResult | null> {
  const startedAt = Date.now();
  const db = dbClient ?? await getDb();
  const tenantId = normalizeTenantId(actor.tenantId);
  const item = await getLibraryItemById(input.itemId, actor, db);
  if (!item) {
    return null;
  }

  let noteRows: LibraryKnowledgeNote[] = [];
  try {
    noteRows = await db
      .select()
      .from(libraryKnowledgeNotes)
      .where(eq(libraryKnowledgeNotes.libraryItemId, item.id))
      .limit(1);
  } catch (error) {
    if (!isKnowledgeSchemaUnavailableError(error)) {
      throw error;
    }
  }
  const note = noteRows[0];

  let outgoingRows: LibraryKnowledgeRelation[] = [];
  let backlinkRows: LibraryKnowledgeRelation[] = [];
  try {
    outgoingRows = await db
      .select()
      .from(libraryKnowledgeRelations)
      .where(eq(libraryKnowledgeRelations.sourceLibraryItemId, item.id));
    backlinkRows = await db
      .select()
      .from(libraryKnowledgeRelations)
      .where(eq(libraryKnowledgeRelations.targetLibraryItemId, item.id));
  } catch (error) {
    if (!isKnowledgeSchemaUnavailableError(error)) {
      throw error;
    }
  }

  const outgoing: LibraryKnowledgeInspectorResult["outgoing"] = [];
  for (const relation of outgoingRows) {
    const target = relation.targetLibraryItemId
      ? await getLibraryItemById(relation.targetLibraryItemId, actor, db)
      : null;
    outgoing.push({
      libraryItemId: target?.id ?? null,
      title: target?.title ?? null,
      logicalPath: normalizeLogicalPath(target?.metadata),
      status: relation.resolutionStatus,
      matchedBy: relation.matchedBy ?? null,
      matchedValue: relation.matchedValue ?? null,
      rawReference: relation.rawReference,
      displayText: relation.displayText ?? null,
    });
  }

  const backlinks: LibraryKnowledgeInspectorResult["backlinks"] = [];
  for (const relation of backlinkRows) {
    const source = await getLibraryItemById(relation.sourceLibraryItemId, actor, db);
    if (!source) {
      continue;
    }
    backlinks.push({
      libraryItemId: source.id,
      title: source.title,
      logicalPath: normalizeLogicalPath(source.metadata),
      status: relation.resolutionStatus,
      matchedBy: relation.matchedBy ?? null,
      matchedValue: relation.matchedValue ?? null,
      rawReference: relation.rawReference,
      displayText: relation.displayText ?? null,
    });
  }

  const currentMarkdown = await getLibraryMarkdownContent(item.id, actor, db);
  const contentLower = currentMarkdown?.content.toLowerCase() ?? "";
  const linkedIds = new Set(
    outgoingRows
      .map((relation) => relation.targetLibraryItemId)
      .filter((value): value is number => Number.isInteger(value)),
  );
  let neighborRows: LibraryKnowledgeNote[] = [];
  try {
    neighborRows = await db
      .select()
      .from(libraryKnowledgeNotes)
      .where(eq(libraryKnowledgeNotes.tenantId, tenantId));
  } catch (error) {
    if (!isKnowledgeSchemaUnavailableError(error)) {
      throw error;
    }
  }

  const unlinkedMentions: LibraryKnowledgeInspectorResult["unlinkedMentions"] = [];
  for (const candidate of neighborRows) {
    if (
      candidate.libraryItemId === item.id
      || linkedIds.has(candidate.libraryItemId)
      || unlinkedMentions.length >= 10
    ) {
      continue;
    }

    const candidateItem = await getLibraryItemById(candidate.libraryItemId, actor, db);
    if (!candidateItem) {
      continue;
    }

    const aliases = Array.isArray(candidate.aliases) ? candidate.aliases : [];
    const matchText = [candidateItem.title, ...aliases].find((value) =>
      typeof value === "string" && value.trim() && contentLower.includes(value.toLowerCase()),
    );
    if (!matchText) {
      continue;
    }

    unlinkedMentions.push({
      libraryItemId: candidateItem.id,
      title: candidateItem.title,
      logicalPath: normalizeLogicalPath(candidateItem.metadata),
      matchedText: matchText,
    });
  }

  const noteAliases = normalizeStringArray(note?.aliases);
  const noteTags = normalizeStringArray(note?.tags);
  const noteHeadings = extractHeadingTexts(note?.headings);
  const noteLogicalPath = note?.logicalPath ?? normalizeLogicalPath(item.metadata);
  const noteTagSet = new Set(noteTags.map((tag) => tag.toLowerCase()));

  const sharedTags: LibraryKnowledgeInspectorResult["sharedTags"] = [];
  for (const candidate of neighborRows) {
    if (candidate.libraryItemId === item.id || sharedTags.length >= 8) {
      continue;
    }

    const overlap = normalizeStringArray(candidate.tags).filter((tag) =>
      noteTagSet.has(tag.toLowerCase()),
    );
    if (overlap.length === 0) {
      continue;
    }

    const candidateItem = await getLibraryItemById(candidate.libraryItemId, actor, db);
    if (!candidateItem) {
      continue;
    }

    sharedTags.push({
      libraryItemId: candidateItem.id,
      title: candidateItem.title,
      logicalPath: normalizeLogicalPath(candidateItem.metadata),
      sharedTags: overlap,
    });
  }
  sharedTags.sort((left, right) => {
    if (right.sharedTags.length !== left.sharedTags.length) {
      return right.sharedTags.length - left.sharedTags.length;
    }
    return left.title.localeCompare(right.title);
  });

  const explicitlyConnectedIds = new Set<number>([
    item.id,
    ...linkedIds,
    ...backlinkRows.map((relation) => relation.sourceLibraryItemId),
    ...sharedTags.map((entry) => entry.libraryItemId),
  ]);
  const semanticRelated: LibraryKnowledgeInspectorResult["semanticRelated"] = [];
  const semanticQuery = buildSemanticKnowledgeQuery({
    title: item.title,
    logicalPath: noteLogicalPath,
    aliases: noteAliases,
    tags: noteTags,
    headings: noteHeadings,
  });
  if (semanticQuery) {
    const semanticSearch = await searchLibraryItems(
      {
        query: semanticQuery,
        limit: 10,
        filters: {
          itemType: "md",
        },
      },
      actor,
      db,
    );
    for (const result of semanticSearch.results) {
      if (
        explicitlyConnectedIds.has(result.item_id)
        || semanticRelated.length >= 6
      ) {
        continue;
      }

      semanticRelated.push({
        libraryItemId: result.item_id,
        title: result.title,
        logicalPath: normalizeLogicalPath(
          result.metadata as Record<string, unknown> | undefined,
        ),
        score: result.combined_score,
        rationale:
          noteTags.length > 0
            ? "Hybrid search matched note topic, tags, or headings."
            : "Hybrid search matched note title or structure.",
      });
    }
  }

  const localGraphNodes: LibraryKnowledgeInspectorResult["localGraph"]["nodes"] = [
    {
      libraryItemId: item.id,
      title: item.title,
      logicalPath: normalizeLogicalPath(item.metadata),
      role: "active",
    },
  ];
  const localGraphEdges: LibraryKnowledgeInspectorResult["localGraph"]["edges"] = [];
  const localGraphLimit = Math.min(Math.max(input.localGraphLimit ?? 25, 1), 100);
  const seenNodes = new Set([item.id]);

  for (const relation of [...outgoingRows, ...backlinkRows]) {
    const sourceId = relation.sourceLibraryItemId;
    const targetId = relation.targetLibraryItemId;
    if (!targetId || relation.resolutionStatus !== "resolved") {
      continue;
    }
    const source = await getLibraryItemById(sourceId, actor, db);
    const target = await getLibraryItemById(targetId, actor, db);
    if (!source || !target) {
      continue;
    }

    if (!seenNodes.has(source.id) && localGraphNodes.length < localGraphLimit) {
      localGraphNodes.push({
        libraryItemId: source.id,
        title: source.title,
        logicalPath: normalizeLogicalPath(source.metadata),
        role: source.id === item.id ? "active" : "neighbor",
      });
      seenNodes.add(source.id);
    }
    if (!seenNodes.has(target.id) && localGraphNodes.length < localGraphLimit) {
      localGraphNodes.push({
        libraryItemId: target.id,
        title: target.title,
        logicalPath: normalizeLogicalPath(target.metadata),
        role: target.id === item.id ? "active" : "neighbor",
      });
      seenNodes.add(target.id);
    }

    localGraphEdges.push({
      sourceLibraryItemId: source.id,
      targetLibraryItemId: target.id,
      relationKind: relation.relationKind,
    });
  }

  const result = {
    note: {
      libraryItemId: item.id,
      title: item.title,
      logicalPath: note?.logicalPath ?? normalizeLogicalPath(item.metadata),
      aliases: Array.isArray(note?.aliases) ? note.aliases : [],
      tags: Array.isArray(note?.tags) ? note.tags : [],
      properties:
        note?.properties && typeof note.properties === "object"
          ? note.properties as Record<string, unknown>
          : {},
    },
    outgoing,
    backlinks,
    unlinkedMentions,
    sharedTags,
    semanticRelated,
    localGraph: {
      nodes: localGraphNodes,
      edges: localGraphEdges,
    },
  };
  const latencyMs = Date.now() - startedAt;
  recordLibraryKnowledgeSurfaceLatency({
    tenantId,
    surface: "inspector",
    latencyMs,
  });
  recordLibraryKnowledgeSurfaceLatency({
    tenantId,
    surface: "localGraph",
    latencyMs,
  });
  return result;
}

export async function quickSwitchLibraryNotes(
  input: LibraryKnowledgeQuickSwitchInput,
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<LibraryKnowledgeQuickSwitchResult> {
  const startedAt = Date.now();
  const db = dbClient ?? await getDb();
  const tenantId = normalizeTenantId(actor.tenantId);
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
  const query = input.query?.trim().toLowerCase() ?? "";

  let noteRows: LibraryKnowledgeNote[] = [];
  try {
    noteRows = await db
      .select()
      .from(libraryKnowledgeNotes)
      .where(eq(libraryKnowledgeNotes.tenantId, tenantId));
  } catch (error) {
    if (!isKnowledgeSchemaUnavailableError(error)) {
      throw error;
    }
  }
  const itemRows = await db
    .select()
    .from(libraryItems)
    .where(eq(libraryItems.tenantId, tenantId))
    .orderBy(desc(libraryItems.updatedAt));

  const noteById = new Map(noteRows.map((row) => [row.libraryItemId, row]));
  const readableItems = [];
  for (const row of itemRows) {
    const item = await getLibraryItemById(row.id, actor, db);
    if (!item) {
      continue;
    }
    if (!isMarkdownLikeKnowledgeItem(item)) {
      continue;
    }
    readableItems.push(item);
  }

  const scored = readableItems
    .map((item) => {
      const note = noteById.get(item.id);
      const aliases = Array.isArray(note?.aliases) ? note.aliases : [];
      const logicalPath = note?.logicalPath ?? normalizeLogicalPath(item.metadata);
      const title = item.title.toLowerCase();
      const normalizedLogicalPath = logicalPath?.toLowerCase() ?? "";
      const exactAlias = aliases.find((alias) => alias.toLowerCase() === query);
      let rank = 100;
      let matchType: LibraryKnowledgeQuickSwitchResult["results"][number]["matchType"] = "recent";

      if (!query) {
        rank = 0;
        matchType = "recent";
      } else if (title === query) {
        rank = 0;
        matchType = "exact_title";
      } else if (normalizedLogicalPath === query) {
        rank = 1;
        matchType = "exact_path";
      } else if (exactAlias) {
        rank = 2;
        matchType = "exact_alias";
      } else if (title.startsWith(query) || aliases.some((alias) => alias.toLowerCase().startsWith(query))) {
        rank = 3;
        matchType = "prefix";
      } else if (normalizedLogicalPath.startsWith(query)) {
        rank = 4;
        matchType = "path_prefix";
      } else if (title.includes(query) || aliases.some((alias) => alias.toLowerCase().includes(query))) {
        rank = 5;
        matchType = "fuzzy";
      } else if (normalizedLogicalPath.includes(query)) {
        rank = 6;
        matchType = "path_fuzzy";
      }

      return {
        item,
        note,
        rank,
        matchType,
      };
    })
    .filter((entry) => !query || entry.rank < 100)
    .sort((left, right) => {
      if (left.rank !== right.rank) return left.rank - right.rank;
      return right.item.updatedAt.getTime() - left.item.updatedAt.getTime();
    })
    .slice(0, limit);

  const titleCounts = new Map<string, number>();
  for (const entry of scored) {
    titleCounts.set(entry.item.title, (titleCounts.get(entry.item.title) ?? 0) + 1);
  }

  const result = {
    results: scored.map((entry) => ({
      libraryItemId: entry.item.id,
      title: entry.item.title,
      logicalPath: entry.note?.logicalPath ?? normalizeLogicalPath(entry.item.metadata),
      aliases: Array.isArray(entry.note?.aliases) ? entry.note.aliases : [],
      matchType: entry.matchType,
      disambiguation:
        (titleCounts.get(entry.item.title) ?? 0) > 1
          ? entry.note?.logicalPath ?? `item:${entry.item.id}`
          : null,
    })),
    createSuggestion:
      query
      && !scored.some((entry) => entry.item.title.toLowerCase() === query)
        ? input.query ?? null
        : null,
  };
  recordLibraryKnowledgeSurfaceLatency({
    tenantId,
    surface: "quickSwitch",
    latencyMs: Date.now() - startedAt,
  });
  return result;
}

export async function listLibraryPropertyCatalog(
  input: LibraryKnowledgePropertyCatalogInput | undefined,
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<LibraryKnowledgePropertyCatalogResult> {
  const db = dbClient ?? await getDb();
  const tenantId = normalizeTenantId(actor.tenantId);
  let rows: LibraryKnowledgeNote[] = [];
  try {
    rows = await db
      .select()
      .from(libraryKnowledgeNotes)
      .where(eq(libraryKnowledgeNotes.tenantId, tenantId));
  } catch (error) {
    if (!isKnowledgeSchemaUnavailableError(error)) {
      throw error;
    }
  }

  const usage = new Map<string, { types: Set<string>; count: number }>();
  for (const row of rows) {
    const item = await getLibraryItemById(row.libraryItemId, actor, db);
    if (!item) {
      continue;
    }

    const properties =
      row.properties && typeof row.properties === "object"
        ? row.properties as Record<string, unknown>
        : {};
    for (const [key, value] of Object.entries(properties)) {
      const entry = usage.get(key) ?? { types: new Set<string>(), count: 0 };
      entry.count += 1;
      entry.types.add(inferPropertyType(value));
      usage.set(key, entry);
    }
  }

  const query = input?.query?.trim().toLowerCase();
  const properties = [...usage.entries()]
    .map(([key, value]) => ({
      key,
      inferredType:
        value.types.size === 1
          ? ([...value.types][0] as LibraryKnowledgePropertyCatalogResult["properties"][number]["inferredType"])
          : "mixed",
      usageCount: value.count,
    }))
    .filter((entry) => !query || entry.key.toLowerCase().includes(query))
    .sort((left, right) => right.usageCount - left.usageCount || left.key.localeCompare(right.key));

  return { properties };
}

export async function listLibraryTagCatalog(
  input: LibraryKnowledgeTagCatalogInput | undefined,
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<LibraryKnowledgeTagCatalogResult> {
  const db = dbClient ?? await getDb();
  const tenantId = normalizeTenantId(actor.tenantId);
  let rows: LibraryKnowledgeNote[] = [];
  try {
    rows = await db
      .select()
      .from(libraryKnowledgeNotes)
      .where(eq(libraryKnowledgeNotes.tenantId, tenantId));
  } catch (error) {
    if (!isKnowledgeSchemaUnavailableError(error)) {
      throw error;
    }
  }

  const usage = new Map<string, number>();
  for (const row of rows) {
    const item = await getLibraryItemById(row.libraryItemId, actor, db);
    if (!item) {
      continue;
    }

    for (const tag of normalizeStringArray(row.tags)) {
      usage.set(tag, (usage.get(tag) ?? 0) + 1);
    }
  }

  const query = input?.query?.trim().toLowerCase();
  const tags = [...usage.entries()]
    .map(([tag, usageCount]) => ({
      tag,
      usageCount,
    }))
    .filter((entry) => !query || entry.tag.toLowerCase().includes(query))
    .sort((left, right) => right.usageCount - left.usageCount || left.tag.localeCompare(right.tag));

  return { tags };
}
