import { TRPCError } from "@trpc/server";
import crypto from "node:crypto";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";

import { getDb } from "../db";
import {
  libraryItems,
  libraryKnowledgeRelations,
  libraryContextPackMembers,
  libraryContextPacks,
  libraryContextPackReviewEvents,
  type LibraryContextPack,
  type LibraryContextPackMember,
  type LibraryContextPackReviewEvent,
} from "../../drizzle/schema";
import type { LibraryActor } from "./libraryService";
import { getUserGroups } from "./groupsService";
import {
  getLibraryItemById,
  getLibraryMarkdownContent,
} from "./libraryService";
import {
  executeLibrarySavedView,
  getLibrarySavedView,
} from "./librarySavedViewService";
import {
  buildContextPackResolutionMetric,
  recordLibraryContextPackResolutionMetric,
} from "./libraryKnowledgeObservabilityService";
import type {
  LibraryArchiveContextPackInput,
  LibraryApproveContextPackForAgentsInput,
  LibraryApproveContextPackInput,
  LibraryContextPackBudgetProfile,
  LibraryContextPackDetail,
  LibraryContextPackDiagnostic,
  LibraryContextPackListInput,
  LibraryContextPackMemberMode,
  LibraryContextPackReviewAction,
  LibraryContextPackResolveResult,
  LibraryContextPackRuntimeTier,
  LibraryContextPackSummary,
  LibraryConvertContextPackToSnapshotInput,
  LibraryCreateContextPackInput,
  LibraryDuplicateContextPackAsSnapshotInput,
  LibraryGetContextPackInput,
  LibraryMarkContextPackStaleInput,
  LibraryPublishSavedViewAsContextPackInput,
  LibraryRequestContextPackReReviewInput,
  LibraryRevokeContextPackAgentApprovalInput,
  LibraryResolveContextPackInput,
  LibrarySubmitContextPackForReviewInput,
  LibraryUpdateContextPackInput,
} from "../../shared/libraryContextPacks";

type DbClient = NonNullable<Awaited<ReturnType<typeof getDb>>>;

function normalizeTenantId(tenantId: string | number): string {
  const normalized = String(tenantId).trim();
  if (!normalized) {
    throw new Error("Invalid tenant ID");
  }
  return normalized;
}

function slugifyContextPack(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160) || "context-pack";
}

function canReadContextPack(row: LibraryContextPack, actor: LibraryActor): boolean {
  return row.ownerUserId === actor.userId || actor.role === "admin";
}

function canManageContextPack(row: LibraryContextPack, actor: LibraryActor): boolean {
  return row.ownerUserId === actor.userId || actor.role === "admin";
}

async function canReviewContextPack(
  row: LibraryContextPack,
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<boolean> {
  if (actor.role === "admin") {
    return true;
  }
  if (!row.managingGroupId) {
    return false;
  }

  const groups = await getUserGroups(
    {
      userId: actor.userId,
      tenantId: actor.tenantId,
      role: actor.role,
    },
    dbClient,
  );

  return groups.some(
    (group) => group.id === row.managingGroupId && group.role === "admin",
  );
}

async function buildUniqueContextPackSlug(
  db: DbClient,
  tenantId: string,
  preferredSlug: string | undefined,
  title: string,
): Promise<string> {
  const baseSlug = slugifyContextPack(preferredSlug || title);
  const rows = await db
    .select({ slug: libraryContextPacks.slug })
    .from(libraryContextPacks)
    .where(eq(libraryContextPacks.tenantId, tenantId));

  const taken = new Set(rows.map((row) => row.slug));
  if (!taken.has(baseSlug)) {
    return baseSlug;
  }

  for (let index = 2; index <= 1000; index += 1) {
    const candidate = `${baseSlug}-${index}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }

  throw new TRPCError({
    code: "CONFLICT",
    message: "Unable to allocate a unique context-pack slug",
  });
}

async function resolveContextPackRow(
  ref: LibraryGetContextPackInput,
  actor: LibraryActor,
  options: {
    requireManage?: boolean;
    includeArchived?: boolean;
  } = {},
  dbClient?: DbClient,
): Promise<LibraryContextPack | null> {
  const db = dbClient ?? await getDb();
  const tenantId = normalizeTenantId(actor.tenantId);
  const rows = "id" in ref
    ? await db
      .select()
      .from(libraryContextPacks)
      .where(eq(libraryContextPacks.id, ref.id))
      .limit(1)
    : await db
      .select()
      .from(libraryContextPacks)
      .where(eq(libraryContextPacks.slug, ref.slug))
      .limit(1);

  const row = rows.find((candidate) => candidate.tenantId === tenantId) ?? null;
  if (!row) {
    return null;
  }
  if (!options.includeArchived && (row.archivedAt || row.status === "archived")) {
    return null;
  }
  if (options.requireManage ? !canManageContextPack(row, actor) : !canReadContextPack(row, actor)) {
    return null;
  }
  return row;
}

async function loadPackMembers(
  db: DbClient,
  contextPackId: number,
): Promise<LibraryContextPackMember[]> {
  return db
    .select()
    .from(libraryContextPackMembers)
    .where(eq(libraryContextPackMembers.contextPackId, contextPackId));
}

async function loadPackReviewHistory(
  db: DbClient,
  contextPackId: number,
): Promise<LibraryContextPackReviewEvent[]> {
  return db
    .select()
    .from(libraryContextPackReviewEvents)
    .where(eq(libraryContextPackReviewEvents.contextPackId, contextPackId))
    .orderBy(desc(libraryContextPackReviewEvents.createdAt))
    .limit(25);
}

function countMembers(members: LibraryContextPackMember[]) {
  return {
    included: members.filter((member) => member.memberMode === "include").length,
    excluded: members.filter((member) => member.memberMode === "exclude").length,
    pinned: members.filter((member) => member.memberMode === "pin").length,
    dynamicCandidates: null,
  };
}

async function loadMemberPreview(
  members: LibraryContextPackMember[],
  actor: LibraryActor,
): Promise<LibraryContextPackDetail["memberPreview"]> {
  const prioritized = [...members]
    .sort((left, right) => left.orderIndex - right.orderIndex)
    .slice(0, 10);

  const previews = await Promise.all(
    prioritized.map(async (member) => {
      const item = await getLibraryItemById(member.libraryItemId, actor);
      if (!item) {
        return null;
      }
      return {
        libraryItemId: item.id,
        title: item.title,
        memberMode: member.memberMode,
      };
    }),
  );

  return previews.filter(
    (preview): preview is NonNullable<typeof preview> => preview !== null,
  );
}

async function toContextPackDetail(
  row: LibraryContextPack,
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<LibraryContextPackDetail> {
  const db = dbClient ?? await getDb();
  const members = await loadPackMembers(db, row.id);
  const reviewHistory = await loadPackReviewHistory(db, row.id);
  const metadata = row.metadata ?? {};
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description ?? null,
    status: row.status,
    sourceMode: row.sourceMode,
    approvedForAgents: row.approvedForAgents,
    readinessStatus: row.readinessStatus,
    defaultRuntimeTier: row.defaultRuntimeTier,
    relationExpansionPolicy: row.relationExpansionPolicy,
    budgetProfile: row.budgetProfile as LibraryContextPackDetail["budgetProfile"],
    maxNoteCount: row.maxNoteCount ?? null,
    maxTokenHint: row.maxTokenHint ?? null,
    freshnessExpectation: row.freshnessExpectation ?? null,
    savedViewId: row.savedViewId ?? null,
    submittedForReviewAt: row.submittedForReviewAt ?? null,
    reviewedAt: row.reviewedAt ?? null,
    approvedAt: row.approvedAt ?? null,
    reviewerUserId: row.reviewerUserId ?? null,
    lastSourceMutationAt: row.lastSourceMutationAt ?? null,
    freshUntil: row.freshUntil ?? null,
    archivedAt: row.archivedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    metadata,
    memberCounts: countMembers(members),
    estimatedTokenHint: row.maxTokenHint ?? null,
    memberPreview: await loadMemberPreview(members, actor),
    reviewHistory: reviewHistory.map((event) => ({
      id: event.id,
      contextPackId: event.contextPackId,
      actorUserId: event.actorUserId ?? null,
      action: event.action as LibraryContextPackReviewAction,
      previousReadinessStatus: event.previousReadinessStatus ?? null,
      nextReadinessStatus: event.nextReadinessStatus ?? null,
      previousApprovedForAgents: event.previousApprovedForAgents,
      nextApprovedForAgents: event.nextApprovedForAgents,
      reason: event.reason ?? null,
      metadata: event.metadata ?? {},
      createdAt: event.createdAt,
    })),
    lastResolutionDiagnostics: Array.isArray((metadata as Record<string, unknown>).lastResolutionDiagnostics)
      ? ((metadata as Record<string, unknown>).lastResolutionDiagnostics as LibraryContextPackDiagnostic[])
      : [],
  };
}

async function loadPackListRows(
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<LibraryContextPack[]> {
  const db = dbClient ?? await getDb();
  const tenantId = normalizeTenantId(actor.tenantId);
  const rows = await db
    .select()
    .from(libraryContextPacks)
    .where(eq(libraryContextPacks.tenantId, tenantId))
    .orderBy(desc(libraryContextPacks.updatedAt));

  return rows.filter((row) => canReadContextPack(row, actor));
}

function hashSnapshotContent(content: string): string | null {
  const normalized = content.trim();
  if (!normalized) {
    return null;
  }
  return `sha256:${crypto
    .createHash("sha256")
    .update(normalized)
    .digest("hex")}`;
}

function toIsoString(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function stableJsonStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJsonStringify(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) =>
        `${JSON.stringify(key)}:${stableJsonStringify(
          (value as Record<string, unknown>)[key],
        )}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashSavedViewQueryDefinition(
  queryDefinition: Record<string, unknown> | null | undefined,
): string | null {
  if (!queryDefinition || typeof queryDefinition !== "object") {
    return null;
  }
  return `sha256:${crypto
    .createHash("sha256")
    .update(stableJsonStringify(queryDefinition))
    .digest("hex")}`;
}

function getItemLogicalPath(item: { metadata?: Record<string, unknown> | null }): string | null {
  return typeof item.metadata?.logical_path === "string"
    ? item.metadata.logical_path
    : null;
}

async function buildSnapshotMemberMetadata(
  row: LibraryContextPack,
  libraryItemId: number,
  actor: LibraryActor,
  capturedAt: Date,
  savedViewQueryHash: string | null,
): Promise<Record<string, unknown>> {
  const item = await getLibraryItemById(libraryItemId, actor);
  const markdown = item?.itemType === "md"
    ? await getLibraryMarkdownContent(libraryItemId, actor)
    : null;
  const content = markdown?.content?.trim() || item?.description?.trim() || "";

  return {
    title: item?.title ?? null,
    logicalPath: item ? getItemLogicalPath(item) : null,
    contentFingerprint: hashSnapshotContent(content),
    sourceUpdatedAt: toIsoString(item?.updatedAt),
    capturedAt: capturedAt.toISOString(),
    capturedByUserId: actor.userId,
    savedViewId: row.savedViewId ?? null,
    savedViewQueryHash,
  };
}

async function resolveSnapshotSavedViewQueryHash(
  row: LibraryContextPack,
  actor: LibraryActor,
  db: DbClient,
): Promise<string | null> {
  if (!row.savedViewId) {
    return null;
  }

  const savedView = await getLibrarySavedView({ id: row.savedViewId }, actor, db);
  return savedView
    ? hashSavedViewQueryDefinition(
        savedView.queryDefinition as Record<string, unknown> | undefined,
      )
    : null;
}

async function replacePackMemberMode(
  db: DbClient,
  row: LibraryContextPack,
  memberMode: LibraryContextPackMemberMode,
  itemIds: number[],
  actor: LibraryActor,
): Promise<void> {
  await db
    .delete(libraryContextPackMembers)
    .where(
      and(
        eq(libraryContextPackMembers.contextPackId, row.id),
        eq(libraryContextPackMembers.memberMode, memberMode),
      ),
    );

  if (!itemIds.length) {
    return;
  }

  const now = new Date();
  const uniqueItemIds = Array.from(new Set(itemIds));
  const savedViewQueryHash = row.sourceMode === "snapshot"
    ? await resolveSnapshotSavedViewQueryHash(row, actor, db)
    : null;
  const values = await Promise.all(
    uniqueItemIds.map(async (libraryItemId, index) => ({
      tenantId: row.tenantId,
      contextPackId: row.id,
      libraryItemId,
      memberMode,
      orderIndex: index,
      createdByUserId: actor.userId,
      snapshotMetadata:
        row.sourceMode === "snapshot"
          ? await buildSnapshotMemberMetadata(
              row,
              libraryItemId,
              actor,
              now,
              savedViewQueryHash,
            )
          : {},
      createdAt: now,
      updatedAt: now,
    })),
  );

  await db.insert(libraryContextPackMembers).values(
    values,
  );
}

function assertTrustedApproval(
  readinessStatus: string,
  approvedForAgents: boolean,
): void {
  if (approvedForAgents && readinessStatus !== "trusted") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Only trusted context packs can be approved for agents",
    });
  }
}

function buildCreateReviewAudit(
  readinessStatus: string,
  approvedForAgents: boolean,
  actor: LibraryActor,
  now: Date,
): Pick<
  typeof libraryContextPacks.$inferInsert,
  | "submittedForReviewAt"
  | "reviewedAt"
  | "approvedAt"
  | "reviewerUserId"
  | "lastSourceMutationAt"
> {
  return {
    submittedForReviewAt:
      readinessStatus === "review_pending" || readinessStatus === "trusted"
        ? now
        : null,
    reviewedAt: readinessStatus === "trusted" ? now : null,
    approvedAt: approvedForAgents ? now : null,
    reviewerUserId: readinessStatus === "trusted" ? actor.userId : null,
    lastSourceMutationAt: now,
  };
}

function applyReviewAuditPatch(
  patch: Partial<typeof libraryContextPacks.$inferInsert>,
  input: LibraryUpdateContextPackInput,
  existing: LibraryContextPack,
  actor: LibraryActor,
  now: Date,
  sourceMutated: boolean,
): void {
  if (sourceMutated) {
    patch.lastSourceMutationAt = now;
  }

  const nextStatus = patch.readinessStatus ?? existing.readinessStatus;
  const nextApprovedForAgents =
    patch.approvedForAgents ?? existing.approvedForAgents;

  if (input.readinessStatus === "review_pending") {
    patch.submittedForReviewAt = now;
  }

  if (nextStatus === "trusted" && input.readinessStatus === "trusted") {
    patch.reviewedAt = now;
    patch.reviewerUserId = actor.userId;
  }

  if (nextStatus === "stale") {
    patch.lastSourceMutationAt = now;
    patch.approvedForAgents = false;
  }

  if (nextApprovedForAgents) {
    patch.approvedAt = now;
    patch.reviewedAt = patch.reviewedAt ?? existing.reviewedAt ?? now;
    patch.reviewerUserId = patch.reviewerUserId ?? actor.userId;
  }
}

function assertContextPackExpectedUpdatedAt(
  expectedUpdatedAt: Date | undefined,
  existing: LibraryContextPack,
): void {
  if (
    expectedUpdatedAt
    && existing.updatedAt.getTime() !== expectedUpdatedAt.getTime()
  ) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Context pack has changed since it was loaded",
    });
  }
}

function assertContextPackWorkflowAllowed(existing: LibraryContextPack): void {
  if (existing.archivedAt || existing.status === "archived") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Archived context packs cannot change workflow state",
    });
  }
}

async function insertContextPackReviewEvent(
  db: DbClient,
  input: {
    row: LibraryContextPack;
    actor: LibraryActor;
    action: LibraryContextPackReviewAction;
    previousReadinessStatus: LibraryContextPack["readinessStatus"] | null;
    nextReadinessStatus: LibraryContextPack["readinessStatus"] | null;
    previousApprovedForAgents: boolean;
    nextApprovedForAgents: boolean;
    reason?: string | null;
    metadata?: Record<string, unknown>;
    now?: Date;
  },
): Promise<void> {
  await db.insert(libraryContextPackReviewEvents).values({
    tenantId: input.row.tenantId,
    contextPackId: input.row.id,
    actorUserId: input.actor.userId,
    action: input.action,
    previousReadinessStatus: input.previousReadinessStatus,
    nextReadinessStatus: input.nextReadinessStatus,
    previousApprovedForAgents: input.previousApprovedForAgents,
    nextApprovedForAgents: input.nextApprovedForAgents,
    reason: input.reason?.trim() || null,
    metadata: input.metadata ?? {},
    createdAt: input.now ?? new Date(),
  });
}

async function assertCanReviewContextPack(
  row: LibraryContextPack,
  actor: LibraryActor,
  dbClient?: DbClient,
): Promise<void> {
  const allowed = await canReviewContextPack(row, actor, dbClient);
  if (!allowed) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to review this context pack",
    });
  }
}

function shouldDemoteTrustedPack(
  existing: LibraryContextPack,
  input: Pick<
    LibraryUpdateContextPackInput,
    | "title"
    | "description"
    | "relationExpansionPolicy"
    | "defaultRuntimeTier"
    | "budgetProfile"
    | "maxNoteCount"
    | "maxTokenHint"
    | "metadata"
  >,
  membershipChanged: boolean,
): boolean {
  if (existing.readinessStatus !== "trusted") {
    return false;
  }

  return membershipChanged
    || input.title !== undefined
    || input.description !== undefined
    || input.relationExpansionPolicy !== undefined
    || input.defaultRuntimeTier !== undefined
    || input.budgetProfile !== undefined
    || input.maxNoteCount !== undefined
    || input.maxTokenHint !== undefined
    || input.metadata !== undefined;
}

function estimateTokenCount(text: string): number {
  return Math.max(1, Math.ceil(text.trim().length / 4));
}

function freshnessForDate(value: Date): "fresh" | "recent" | "stale" {
  const ageMs = Date.now() - value.getTime();
  if (ageMs <= 7 * 24 * 60 * 60 * 1000) return "fresh";
  if (ageMs <= 30 * 24 * 60 * 60 * 1000) return "recent";
  return "stale";
}

function pushDiagnostic(
  diagnostics: LibraryContextPackDiagnostic[],
  diagnostic: LibraryContextPackDiagnostic,
): void {
  diagnostics.push(diagnostic);
}

async function resolvePackCandidateIds(
  row: LibraryContextPack,
  members: LibraryContextPackMember[],
  actor: LibraryActor,
): Promise<{
  orderedIds: number[];
  excludedIds: Set<number>;
  candidateCount: number;
}> {
  const pinnedIds = members
    .filter((member) => member.memberMode === "pin")
    .sort((left, right) => left.orderIndex - right.orderIndex)
    .map((member) => member.libraryItemId);
  const includedIds = members
    .filter((member) => member.memberMode === "include")
    .sort((left, right) => left.orderIndex - right.orderIndex)
    .map((member) => member.libraryItemId);
  const excludedIds = new Set(
    members
      .filter((member) => member.memberMode === "exclude")
      .map((member) => member.libraryItemId),
  );

  let dynamicIds: number[] = [];
  if (row.sourceMode === "view_backed" && row.savedViewId) {
    const savedView = await getLibrarySavedView({ id: row.savedViewId }, actor);
    if (!savedView) {
      return {
        orderedIds: [...new Set([...pinnedIds, ...includedIds])].filter(
          (id) => !excludedIds.has(id),
        ),
        excludedIds,
        candidateCount: pinnedIds.length + includedIds.length,
      };
    }

    const executed = await executeLibrarySavedView(
      {
        ref: { id: savedView.id },
        limitOverride: row.maxNoteCount ?? 200,
      },
      actor,
    );
    dynamicIds = executed.items.map((item) => item.id);
  }

  const orderedIds = Array.from(
    new Set([...pinnedIds, ...includedIds, ...dynamicIds]),
  ).filter((id) => !excludedIds.has(id));

  return {
    orderedIds,
    excludedIds,
    candidateCount: orderedIds.length,
  };
}

async function expandPackCandidatesWithGraphRelations(
  db: DbClient,
  input: {
    row: LibraryContextPack;
    orderedIds: number[];
    excludedIds: Set<number>;
  },
): Promise<{
  orderedIds: number[];
  relationExpansionApplied: boolean;
  includedReasonsById: Map<number, string>;
  citationRefsById: Map<number, string[]>;
}> {
  const includedReasonsById = new Map<number, string>();
  const citationRefsById = new Map<number, string[]>();

  if (
    input.row.relationExpansionPolicy !== "one_hop_gated"
    || input.orderedIds.length === 0
  ) {
    return {
      orderedIds: input.orderedIds,
      relationExpansionApplied: false,
      includedReasonsById,
      citationRefsById,
    };
  }

  const seedIds = new Set(input.orderedIds);
  const candidateIds = [...seedIds];
  const relations = await db
    .select()
    .from(libraryKnowledgeRelations)
    .where(
      and(
        eq(libraryKnowledgeRelations.tenantId, input.row.tenantId),
        eq(libraryKnowledgeRelations.resolutionStatus, "resolved"),
        or(
          inArray(libraryKnowledgeRelations.sourceLibraryItemId, input.orderedIds),
          inArray(libraryKnowledgeRelations.targetLibraryItemId, input.orderedIds),
        ),
      ),
    );

  const addRelationCandidate = (
    candidateId: number | null,
    reason: string,
    relationId: number,
    sourceId: number,
  ) => {
    if (
      !candidateId
      || seedIds.has(candidateId)
      || input.excludedIds.has(candidateId)
      || candidateIds.includes(candidateId)
    ) {
      return;
    }

    candidateIds.push(candidateId);
    includedReasonsById.set(candidateId, reason);
    citationRefsById.set(candidateId, [
      `library_relation:${relationId}`,
      `library_item:${sourceId}`,
    ]);
  };

  for (const relation of relations) {
    if (seedIds.has(relation.sourceLibraryItemId)) {
      addRelationCandidate(
        relation.targetLibraryItemId,
        `One-hop graph expansion: outgoing ${relation.relationKind} from library item ${relation.sourceLibraryItemId}`,
        relation.id,
        relation.sourceLibraryItemId,
      );
    }
    if (relation.targetLibraryItemId && seedIds.has(relation.targetLibraryItemId)) {
      addRelationCandidate(
        relation.sourceLibraryItemId,
        `One-hop graph expansion: backlink ${relation.relationKind} to library item ${relation.targetLibraryItemId}`,
        relation.id,
        relation.targetLibraryItemId,
      );
    }
  }

  return {
    orderedIds: candidateIds,
    relationExpansionApplied: candidateIds.length > input.orderedIds.length,
    includedReasonsById,
    citationRefsById,
  };
}

function getOrderedMemberIdsByMode(
  members: LibraryContextPackMember[],
  memberMode: LibraryContextPackMemberMode,
): number[] {
  return members
    .filter((member) => member.memberMode === memberMode)
    .sort((left, right) => left.orderIndex - right.orderIndex)
    .map((member) => member.libraryItemId);
}

function shouldDemoteSnapshotPackOnResolve(
  row: LibraryContextPack,
  diagnostics: LibraryContextPackDiagnostic[],
): boolean {
  if (row.sourceMode !== "snapshot" || row.readinessStatus !== "trusted") {
    return false;
  }

  const policy =
    typeof row.metadata?.snapshotDriftPolicy === "string"
      ? row.metadata.snapshotDriftPolicy
      : row.approvedForAgents
        ? "demote_trusted"
        : "diagnose_only";
  if (policy !== "demote_trusted") {
    return false;
  }

  return diagnostics.some((diagnostic) =>
    [
      "ITEM_UNREADABLE",
      "ITEM_DELETED",
      "ITEM_UNINDEXED",
      "SNAPSHOT_CONTENT_DRIFT",
      "SNAPSHOT_METADATA_DRIFT",
    ].includes(diagnostic.code),
  );
}

async function demoteSnapshotPackOnResolve(
  db: DbClient,
  row: LibraryContextPack,
  actor: LibraryActor,
  diagnostics: LibraryContextPackDiagnostic[],
): Promise<LibraryContextPack | null> {
  if (!shouldDemoteSnapshotPackOnResolve(row, diagnostics)) {
    return null;
  }

  const now = new Date();
  const [updated] = await db
    .update(libraryContextPacks)
    .set({
      readinessStatus: "stale",
      approvedForAgents: false,
      lastSourceMutationAt: now,
      updatedAt: now,
    })
    .where(eq(libraryContextPacks.id, row.id))
    .returning();

  await insertContextPackReviewEvent(db, {
    row: updated ?? row,
    actor,
    action: "mark_stale",
    previousReadinessStatus: row.readinessStatus,
    nextReadinessStatus: "stale",
    previousApprovedForAgents: row.approvedForAgents,
    nextApprovedForAgents: false,
    reason: "snapshot drift detected during resolve",
    metadata: {
      autoDemotedOnResolve: true,
      snapshotDiagnosticCodes: diagnostics.map((diagnostic) => diagnostic.code),
    },
    now,
  });

  return updated ?? null;
}

export async function listLibraryContextPacks(
  input: LibraryContextPackListInput | undefined,
  actor: LibraryActor,
): Promise<LibraryContextPackSummary[]> {
  const rows = await loadPackListRows(actor);
  const query = input?.query?.trim().toLowerCase();
  const filtered = rows
    .filter((row) => !row.archivedAt && row.status !== "archived")
    .filter((row) => !input?.status || row.status === input.status)
    .filter((row) => !input?.sourceMode || row.sourceMode === input.sourceMode)
    .filter(
      (row) =>
        input?.approvedForAgents === undefined
        || row.approvedForAgents === input.approvedForAgents,
    )
    .filter(
      (row) =>
        !input?.readinessStatus || row.readinessStatus === input.readinessStatus,
    )
    .filter((row) => {
      if (!query) return true;
      return row.title.toLowerCase().includes(query)
        || row.slug.toLowerCase().includes(query)
        || (row.description ?? "").toLowerCase().includes(query);
    });

  const offset = Math.max(0, input?.offset ?? 0);
  const limit = Math.min(Math.max(input?.limit ?? 25, 1), 50);

  const page = filtered.slice(offset, offset + limit);
  const db = await getDb();
  return Promise.all(page.map(async (row) => {
    const members = await loadPackMembers(db, row.id);
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      status: row.status,
      sourceMode: row.sourceMode,
      approvedForAgents: row.approvedForAgents,
      readinessStatus: row.readinessStatus,
      defaultRuntimeTier: row.defaultRuntimeTier,
      memberCounts: countMembers(members),
      estimatedTokenHint: row.maxTokenHint ?? null,
      updatedAt: row.updatedAt,
    };
  }));
}

export async function getLibraryContextPack(
  input: LibraryGetContextPackInput,
  actor: LibraryActor,
): Promise<LibraryContextPackDetail | null> {
  const row = await resolveContextPackRow(input, actor);
  return row ? toContextPackDetail(row, actor) : null;
}

export async function createLibraryContextPack(
  input: LibraryCreateContextPackInput,
  actor: LibraryActor,
): Promise<LibraryContextPackDetail> {
  const db = await getDb();
  const tenantId = normalizeTenantId(actor.tenantId);
  if (input.readinessStatus !== undefined && input.readinessStatus !== "draft") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "New context packs start in draft. Use workflow actions to submit or approve them.",
    });
  }
  if (input.approvedForAgents) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Context packs cannot be approved for agents during creation",
    });
  }
  if (input.sourceMode === "view_backed") {
    if (!input.savedViewId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "view_backed context packs require savedViewId",
      });
    }
    const savedView = await getLibrarySavedView({ id: input.savedViewId }, actor, db);
    if (!savedView) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Saved view not found",
      });
    }
  }
  if (input.sourceMode === "snapshot" && input.savedViewId) {
    const savedView = await getLibrarySavedView({ id: input.savedViewId }, actor, db);
    if (!savedView) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Saved view not found",
      });
    }
  }

  const slug = await buildUniqueContextPackSlug(db, tenantId, input.slug, input.title);
  const now = new Date();

  const [created] = await db
    .insert(libraryContextPacks)
    .values({
      tenantId,
      ownerUserId: actor.userId,
      slug,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      status: input.approvedForAgents ? "active" : "draft",
      sourceMode: input.sourceMode,
      savedViewId:
        input.sourceMode === "view_backed" || input.sourceMode === "snapshot"
          ? input.savedViewId ?? null
          : null,
      relationExpansionPolicy: input.relationExpansionPolicy,
      defaultRuntimeTier: input.defaultRuntimeTier,
      budgetProfile: input.budgetProfile,
      maxNoteCount: input.maxNoteCount ?? null,
      maxTokenHint: input.maxTokenHint ?? null,
      freshnessExpectation: null,
      readinessStatus: "draft",
      approvedForAgents: false,
      ...buildCreateReviewAudit("draft", false, actor, now),
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  await replacePackMemberMode(db, created, "include", input.includeItemIds, actor);
  await replacePackMemberMode(db, created, "exclude", input.excludeItemIds, actor);
  await replacePackMemberMode(db, created, "pin", input.pinnedItemIds, actor);

  return toContextPackDetail(created, actor, db);
}

export async function updateLibraryContextPack(
  input: LibraryUpdateContextPackInput,
  actor: LibraryActor,
): Promise<LibraryContextPackDetail> {
  const db = await getDb();
  const existing = await resolveContextPackRow(
    input.ref,
    actor,
    { requireManage: true },
    db,
  );
  if (!existing) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Context pack not found",
    });
  }

  if (
    input.readinessStatus !== undefined
    || input.approvedForAgents !== undefined
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Use explicit workflow actions to change review or agent-approval state",
    });
  }
  assertContextPackExpectedUpdatedAt(input.expectedUpdatedAt, existing);

  const membershipChanged =
    input.includeItemIds !== undefined
    || input.excludeItemIds !== undefined
    || input.pinnedItemIds !== undefined;

  const autoDemote = shouldDemoteTrustedPack(existing, input, membershipChanged);
  const readinessStatus = autoDemote ? "stale" : existing.readinessStatus;
  const approvedForAgents = autoDemote ? false : existing.approvedForAgents;
  assertTrustedApproval(readinessStatus, approvedForAgents);
  const now = new Date();
  const sourceMutated =
    membershipChanged
    || input.relationExpansionPolicy !== undefined
    || input.defaultRuntimeTier !== undefined
    || input.budgetProfile !== undefined
    || input.maxNoteCount !== undefined
    || input.maxTokenHint !== undefined
    || input.metadata !== undefined;

  const patch: Partial<typeof libraryContextPacks.$inferInsert> = {
    updatedAt: now,
    readinessStatus,
    approvedForAgents,
  };

  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.description !== undefined) patch.description = input.description?.trim() || null;
  if (input.relationExpansionPolicy !== undefined) patch.relationExpansionPolicy = input.relationExpansionPolicy;
  if (input.defaultRuntimeTier !== undefined) patch.defaultRuntimeTier = input.defaultRuntimeTier;
  if (input.budgetProfile !== undefined) patch.budgetProfile = input.budgetProfile;
  if (input.maxNoteCount !== undefined) patch.maxNoteCount = input.maxNoteCount ?? null;
  if (input.maxTokenHint !== undefined) patch.maxTokenHint = input.maxTokenHint ?? null;
  if (input.metadata !== undefined) patch.metadata = input.metadata;
  applyReviewAuditPatch(patch, input, existing, actor, now, sourceMutated || autoDemote);

  const [updated] = await db
    .update(libraryContextPacks)
    .set(patch)
    .where(eq(libraryContextPacks.id, existing.id))
    .returning();

  if (input.includeItemIds !== undefined) {
    await replacePackMemberMode(db, updated, "include", input.includeItemIds, actor);
  }
  if (input.excludeItemIds !== undefined) {
    await replacePackMemberMode(db, updated, "exclude", input.excludeItemIds, actor);
  }
  if (input.pinnedItemIds !== undefined) {
    await replacePackMemberMode(db, updated, "pin", input.pinnedItemIds, actor);
  }

  if (autoDemote && (existing.readinessStatus !== "stale" || existing.approvedForAgents)) {
    await insertContextPackReviewEvent(db, {
      row: updated,
      actor,
      action: "mark_stale",
      previousReadinessStatus: existing.readinessStatus,
      nextReadinessStatus: "stale",
      previousApprovedForAgents: existing.approvedForAgents,
      nextApprovedForAgents: false,
      reason: "Source membership or pack configuration changed",
      metadata: {
        autoDemoted: true,
        membershipChanged,
        sourceMutated,
      },
      now,
    });
  }

  return toContextPackDetail(updated, actor, db);
}

export async function archiveLibraryContextPack(
  input: LibraryArchiveContextPackInput,
  actor: LibraryActor,
): Promise<{ success: true }> {
  const db = await getDb();
  const existing = await resolveContextPackRow(
    input,
    actor,
    { requireManage: true },
    db,
  );
  if (!existing) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Context pack not found",
    });
  }

  const now = new Date();
  await db
    .update(libraryContextPacks)
    .set({
      status: "archived",
      archivedAt: now,
      updatedAt: now,
      approvedForAgents: false,
      approvedAt: null,
    })
    .where(eq(libraryContextPacks.id, existing.id));

  await insertContextPackReviewEvent(db, {
    row: existing,
    actor,
    action: "archive",
    previousReadinessStatus: existing.readinessStatus,
    nextReadinessStatus: existing.readinessStatus,
    previousApprovedForAgents: existing.approvedForAgents,
    nextApprovedForAgents: false,
    reason: "Context pack archived",
    now,
  });

  return { success: true };
}

export async function submitLibraryContextPackForReview(
  input: LibrarySubmitContextPackForReviewInput,
  actor: LibraryActor,
): Promise<LibraryContextPackDetail> {
  const db = await getDb();
  const existing = await resolveContextPackRow(input.ref, actor, { requireManage: true }, db);
  if (!existing) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Context pack not found",
    });
  }
  assertContextPackExpectedUpdatedAt(input.expectedUpdatedAt, existing);
  assertContextPackWorkflowAllowed(existing);
  if (existing.readinessStatus !== "draft") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Only draft context packs can be submitted for review",
    });
  }

  const now = new Date();
  const [updated] = await db
    .update(libraryContextPacks)
    .set({
      readinessStatus: "review_pending",
      submittedForReviewAt: now,
      updatedAt: now,
    })
    .where(eq(libraryContextPacks.id, existing.id))
    .returning();

  await insertContextPackReviewEvent(db, {
    row: updated,
    actor,
    action: "submit_for_review",
    previousReadinessStatus: existing.readinessStatus,
    nextReadinessStatus: "review_pending",
    previousApprovedForAgents: existing.approvedForAgents,
    nextApprovedForAgents: existing.approvedForAgents,
    reason: input.reason,
    metadata: input.metadata,
    now,
  });

  return toContextPackDetail(updated, actor, db);
}

export async function approveLibraryContextPack(
  input: LibraryApproveContextPackInput,
  actor: LibraryActor,
): Promise<LibraryContextPackDetail> {
  const db = await getDb();
  const existing = await resolveContextPackRow(input.ref, actor, { includeArchived: true }, db);
  if (!existing) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Context pack not found",
    });
  }
  await assertCanReviewContextPack(existing, actor, db);
  assertContextPackExpectedUpdatedAt(input.expectedUpdatedAt, existing);
  assertContextPackWorkflowAllowed(existing);
  if (existing.readinessStatus !== "review_pending") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Only review-pending context packs can be approved as trusted",
    });
  }

  const now = new Date();
  const [updated] = await db
    .update(libraryContextPacks)
    .set({
      readinessStatus: "trusted",
      reviewedAt: now,
      reviewerUserId: actor.userId,
      updatedAt: now,
      status: "active",
    })
    .where(eq(libraryContextPacks.id, existing.id))
    .returning();

  await insertContextPackReviewEvent(db, {
    row: updated,
    actor,
    action: "approve_trusted",
    previousReadinessStatus: existing.readinessStatus,
    nextReadinessStatus: "trusted",
    previousApprovedForAgents: existing.approvedForAgents,
    nextApprovedForAgents: existing.approvedForAgents,
    reason: input.reason,
    metadata: input.metadata,
    now,
  });

  return toContextPackDetail(updated, actor, db);
}

export async function approveLibraryContextPackForAgents(
  input: LibraryApproveContextPackForAgentsInput,
  actor: LibraryActor,
): Promise<LibraryContextPackDetail> {
  const db = await getDb();
  const existing = await resolveContextPackRow(input.ref, actor, { includeArchived: true }, db);
  if (!existing) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Context pack not found",
    });
  }
  await assertCanReviewContextPack(existing, actor, db);
  assertContextPackExpectedUpdatedAt(input.expectedUpdatedAt, existing);
  assertContextPackWorkflowAllowed(existing);
  if (existing.readinessStatus !== "trusted") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Only trusted context packs can be approved for agents",
    });
  }

  const now = new Date();
  const [updated] = await db
    .update(libraryContextPacks)
    .set({
      approvedForAgents: true,
      approvedAt: now,
      reviewedAt: existing.reviewedAt ?? now,
      reviewerUserId: actor.userId,
      updatedAt: now,
      status: "active",
    })
    .where(eq(libraryContextPacks.id, existing.id))
    .returning();

  await insertContextPackReviewEvent(db, {
    row: updated,
    actor,
    action: "approve_for_agents",
    previousReadinessStatus: existing.readinessStatus,
    nextReadinessStatus: existing.readinessStatus,
    previousApprovedForAgents: existing.approvedForAgents,
    nextApprovedForAgents: true,
    reason: input.reason,
    metadata: input.metadata,
    now,
  });

  return toContextPackDetail(updated, actor, db);
}

export async function revokeLibraryContextPackAgentApproval(
  input: LibraryRevokeContextPackAgentApprovalInput,
  actor: LibraryActor,
): Promise<LibraryContextPackDetail> {
  const db = await getDb();
  const existing = await resolveContextPackRow(input.ref, actor, { includeArchived: true }, db);
  if (!existing) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Context pack not found",
    });
  }
  await assertCanReviewContextPack(existing, actor, db);
  assertContextPackExpectedUpdatedAt(input.expectedUpdatedAt, existing);

  const now = new Date();
  const [updated] = await db
    .update(libraryContextPacks)
    .set({
      approvedForAgents: false,
      approvedAt: null,
      updatedAt: now,
    })
    .where(eq(libraryContextPacks.id, existing.id))
    .returning();

  await insertContextPackReviewEvent(db, {
    row: updated,
    actor,
    action: "revoke_agent_approval",
    previousReadinessStatus: existing.readinessStatus,
    nextReadinessStatus: existing.readinessStatus,
    previousApprovedForAgents: existing.approvedForAgents,
    nextApprovedForAgents: false,
    reason: input.reason,
    metadata: input.metadata,
    now,
  });

  return toContextPackDetail(updated, actor, db);
}

export async function markLibraryContextPackStale(
  input: LibraryMarkContextPackStaleInput,
  actor: LibraryActor,
): Promise<LibraryContextPackDetail> {
  const db = await getDb();
  const existing = await resolveContextPackRow(input.ref, actor, { includeArchived: true }, db);
  if (!existing) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Context pack not found",
    });
  }
  const canManage = canManageContextPack(existing, actor);
  if (!canManage) {
    await assertCanReviewContextPack(existing, actor, db);
  }
  assertContextPackExpectedUpdatedAt(input.expectedUpdatedAt, existing);
  assertContextPackWorkflowAllowed(existing);

  const now = new Date();
  const [updated] = await db
    .update(libraryContextPacks)
    .set({
      readinessStatus: "stale",
      approvedForAgents: false,
      approvedAt: null,
      lastSourceMutationAt: now,
      updatedAt: now,
    })
    .where(eq(libraryContextPacks.id, existing.id))
    .returning();

  await insertContextPackReviewEvent(db, {
    row: updated,
    actor,
    action: "mark_stale",
    previousReadinessStatus: existing.readinessStatus,
    nextReadinessStatus: "stale",
    previousApprovedForAgents: existing.approvedForAgents,
    nextApprovedForAgents: false,
    reason: input.reason,
    metadata: input.metadata,
    now,
  });

  return toContextPackDetail(updated, actor, db);
}

export async function requestLibraryContextPackReReview(
  input: LibraryRequestContextPackReReviewInput,
  actor: LibraryActor,
): Promise<LibraryContextPackDetail> {
  const db = await getDb();
  const existing = await resolveContextPackRow(input.ref, actor, { requireManage: true }, db);
  if (!existing) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Context pack not found",
    });
  }
  assertContextPackExpectedUpdatedAt(input.expectedUpdatedAt, existing);
  assertContextPackWorkflowAllowed(existing);
  if (existing.readinessStatus !== "stale") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Only stale context packs can be sent back for re-review",
    });
  }

  const now = new Date();
  const [updated] = await db
    .update(libraryContextPacks)
    .set({
      readinessStatus: "review_pending",
      submittedForReviewAt: now,
      updatedAt: now,
    })
    .where(eq(libraryContextPacks.id, existing.id))
    .returning();

  await insertContextPackReviewEvent(db, {
    row: updated,
    actor,
    action: "request_re_review",
    previousReadinessStatus: existing.readinessStatus,
    nextReadinessStatus: "review_pending",
    previousApprovedForAgents: existing.approvedForAgents,
    nextApprovedForAgents: existing.approvedForAgents,
    reason: input.reason,
    metadata: input.metadata,
    now,
  });

  return toContextPackDetail(updated, actor, db);
}

export async function publishSavedViewAsLibraryContextPack(
  input: LibraryPublishSavedViewAsContextPackInput,
  actor: LibraryActor,
): Promise<LibraryContextPackDetail> {
  const savedView = await getLibrarySavedView({ id: input.savedViewId }, actor);
  if (!savedView) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Saved view not found",
    });
  }

  const snapshotItemIds = input.snapshot
    ? (await executeLibrarySavedView(
        {
          ref: { id: savedView.id },
          limitOverride: 500,
        },
        actor,
      )).items.map((item) => item.id)
    : [];
  const savedViewQueryHash = hashSavedViewQueryDefinition(
    savedView.queryDefinition as Record<string, unknown> | undefined,
  );

  return createLibraryContextPack(
    {
      title: input.title,
      slug: input.slug,
      description: input.description,
      sourceMode: input.snapshot ? "snapshot" : "view_backed",
      savedViewId: savedView.id,
      includeItemIds: snapshotItemIds,
      excludeItemIds: input.excludedItemIds,
      pinnedItemIds: input.pinnedItemIds,
      relationExpansionPolicy: "none",
      defaultRuntimeTier: input.defaultRuntimeTier,
      budgetProfile: "retrieval",
      readinessStatus: "draft",
      approvedForAgents: false,
      metadata: {
        publishedFromSavedViewId: savedView.id,
        ...(input.snapshot
          ? {
              snapshotCapturedFromSavedView: true,
              snapshotCandidateCount: snapshotItemIds.length,
              snapshotSavedViewQueryHash: savedViewQueryHash,
              snapshotDriftPolicy: "demote_trusted",
            }
          : {}),
      },
    },
    actor,
  );
}

export async function convertLibraryContextPackToSnapshot(
  input: LibraryConvertContextPackToSnapshotInput,
  actor: LibraryActor,
): Promise<LibraryContextPackDetail> {
  const db = await getDb();
  const existing = await resolveContextPackRow(
    input.ref,
    actor,
    { requireManage: true },
    db,
  );
  if (!existing) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Context pack not found",
    });
  }
  if (existing.sourceMode === "snapshot") {
    return toContextPackDetail(existing, actor, db);
  }

  assertContextPackExpectedUpdatedAt(input.expectedUpdatedAt, existing);
  const members = await loadPackMembers(db, existing.id);
  const { orderedIds } = await resolvePackCandidateIds(existing, members, actor);
  const pinnedItemIds = getOrderedMemberIdsByMode(members, "pin");
  const excludedItemIds = getOrderedMemberIdsByMode(members, "exclude");
  const savedView = existing.savedViewId
    ? await getLibrarySavedView({ id: existing.savedViewId }, actor, db)
    : null;
  const savedViewQueryHash = hashSavedViewQueryDefinition(
    savedView?.queryDefinition as Record<string, unknown> | undefined,
  );
  const now = new Date();
  const [updated] = await db
    .update(libraryContextPacks)
    .set({
      sourceMode: "snapshot",
      title: input.title?.trim() || existing.title,
      description: input.description === undefined
        ? existing.description
        : input.description?.trim() || null,
      readinessStatus: "draft",
      approvedForAgents: false,
      submittedForReviewAt: null,
      reviewedAt: null,
      approvedAt: null,
      reviewerUserId: null,
      lastSourceMutationAt: now,
      metadata: {
        ...(existing.metadata ?? {}),
        ...(input.metadata ?? {}),
        snapshotConvertedFromSourceMode: existing.sourceMode,
        snapshotSavedViewQueryHash: savedViewQueryHash,
        snapshotCapturedAt: now.toISOString(),
        snapshotCapturedByUserId: actor.userId,
        snapshotDriftPolicy: "demote_trusted",
      },
      updatedAt: now,
    })
    .where(eq(libraryContextPacks.id, existing.id))
    .returning();

  await replacePackMemberMode(db, updated, "include", orderedIds, actor);
  await replacePackMemberMode(db, updated, "exclude", excludedItemIds, actor);
  await replacePackMemberMode(db, updated, "pin", pinnedItemIds, actor);

  await insertContextPackReviewEvent(db, {
    row: updated,
    actor,
    action: "mark_stale",
    previousReadinessStatus: existing.readinessStatus,
    nextReadinessStatus: "draft",
    previousApprovedForAgents: existing.approvedForAgents,
    nextApprovedForAgents: false,
    reason: input.reason ?? "converted to snapshot",
    metadata: {
      convertedToSnapshot: true,
      previousSourceMode: existing.sourceMode,
    },
    now,
  });

  return toContextPackDetail(updated, actor, db);
}

export async function duplicateLibraryContextPackAsSnapshot(
  input: LibraryDuplicateContextPackAsSnapshotInput,
  actor: LibraryActor,
): Promise<LibraryContextPackDetail> {
  const db = await getDb();
  const existing = await resolveContextPackRow(
    input.ref,
    actor,
    { requireManage: true },
    db,
  );
  if (!existing) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Context pack not found",
    });
  }

  const members = await loadPackMembers(db, existing.id);
  const { orderedIds } = await resolvePackCandidateIds(existing, members, actor);
  const pinnedItemIds = getOrderedMemberIdsByMode(members, "pin");
  const excludedItemIds = getOrderedMemberIdsByMode(members, "exclude");
  const savedView = existing.savedViewId
    ? await getLibrarySavedView({ id: existing.savedViewId }, actor, db)
    : null;
  const savedViewQueryHash = hashSavedViewQueryDefinition(
    savedView?.queryDefinition as Record<string, unknown> | undefined,
  );

  return createLibraryContextPack(
    {
      title: input.title?.trim() || `${existing.title} Snapshot`,
      slug: input.slug,
      description: input.description?.trim() || existing.description || undefined,
      sourceMode: "snapshot",
      savedViewId: existing.savedViewId ?? undefined,
      includeItemIds: orderedIds,
      excludeItemIds: excludedItemIds,
      pinnedItemIds,
      relationExpansionPolicy: "none",
      defaultRuntimeTier:
        input.defaultRuntimeTier ?? existing.defaultRuntimeTier,
      budgetProfile: existing.budgetProfile as LibraryContextPackBudgetProfile,
      maxNoteCount: existing.maxNoteCount ?? undefined,
      maxTokenHint: existing.maxTokenHint ?? undefined,
      readinessStatus: "draft",
      approvedForAgents: false,
      metadata: {
        ...(existing.metadata ?? {}),
        ...(input.metadata ?? {}),
        snapshotDuplicatedFromContextPackId: existing.id,
        snapshotDuplicatedFromSourceMode: existing.sourceMode,
        snapshotCapturedByUserId: actor.userId,
        snapshotDriftPolicy: "demote_trusted",
        snapshotSavedViewQueryHash: savedViewQueryHash,
      },
    },
    actor,
  );
}

export async function resolveLibraryContextPack(
  input: LibraryResolveContextPackInput,
  actor: LibraryActor,
): Promise<LibraryContextPackResolveResult> {
  const startedAt = Date.now();
  const db = await getDb();
  const row = await resolveContextPackRow(input.ref, actor, { includeArchived: true }, db);

  if (!row) {
    return {
      pack: {
        id: "id" in input.ref ? input.ref.id : 0,
        slug: "slug" in input.ref ? input.ref.slug : "unknown",
        title: "Unknown context pack",
        sourceMode: "manual",
        defaultRuntimeTier: input.runtimeTierOverride ?? "retrieved_evidence",
        approvedForAgents: false,
        readinessStatus: "draft",
      },
      status: "empty",
      relationExpansionApplied: false,
      totals: {
        candidateCount: 0,
        resolvedCount: 0,
        missingCount: 0,
        excludedCount: 0,
        estimatedTokens: 0,
      },
      items: [],
      diagnostics: [
        {
          code: "PACK_NOT_FOUND",
          severity: "error",
          message: "Context pack not found",
        },
      ],
    };
  }

  const diagnostics: LibraryContextPackDiagnostic[] = [];

  if (row.archivedAt || row.status === "archived") {
    pushDiagnostic(diagnostics, {
      code: "PACK_ARCHIVED",
      severity: "error",
      message: "Context pack is archived",
    });
    const result: LibraryContextPackResolveResult = {
      pack: {
        id: row.id,
        slug: row.slug,
        title: row.title,
        sourceMode: row.sourceMode,
        defaultRuntimeTier: input.runtimeTierOverride ?? row.defaultRuntimeTier,
        approvedForAgents: false,
        readinessStatus: row.readinessStatus,
      },
      status: "empty",
      relationExpansionApplied: false,
      totals: {
        candidateCount: 0,
        resolvedCount: 0,
        missingCount: 0,
        excludedCount: 0,
        estimatedTokens: 0,
      },
      items: [],
      diagnostics,
    };
    recordLibraryContextPackResolutionMetric({
      tenantId: row.tenantId,
      metric: buildContextPackResolutionMetric({
        result,
        latencyMs: Date.now() - startedAt,
      }),
    });
    if (input.failIfPartial) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Context pack is archived",
      });
    }
    return result;
  }

  const members = await loadPackMembers(db, row.id);

  const baseCandidates = await resolvePackCandidateIds(
    row,
    members,
    actor,
  );
  const {
    orderedIds,
    relationExpansionApplied,
    includedReasonsById,
    citationRefsById,
  } = await expandPackCandidatesWithGraphRelations(db, {
    row,
    orderedIds: baseCandidates.orderedIds,
    excludedIds: baseCandidates.excludedIds,
  });
  const excludedIds = baseCandidates.excludedIds;
  const candidateCount = orderedIds.length;

  const effectiveMaxItems = Math.min(
    Math.max(input.maxItems ?? row.maxNoteCount ?? orderedIds.length, 1),
    500,
  );
  const effectiveRuntimeTier =
    input.runtimeTierOverride ?? row.defaultRuntimeTier;
  const tokenBudgetHint = input.tokenBudgetHint ?? row.maxTokenHint ?? 20_000;

  const items: LibraryContextPackResolveResult["items"] = [];
  let estimatedTokens = 0;
  let missingCount = 0;

  for (const libraryItemId of orderedIds) {
    if (items.length >= effectiveMaxItems) {
      pushDiagnostic(diagnostics, {
        code: "TOKEN_BUDGET_CLAMPED",
        severity: "warning",
        message: "Context pack item count was clamped to the runtime limit",
      });
      break;
    }

    const item = await getLibraryItemById(libraryItemId, actor);
    if (!item) {
      missingCount += 1;
      const existingItemRows = await db
        .select({ id: libraryItems.id })
        .from(libraryItems)
        .where(
          and(
            eq(libraryItems.tenantId, row.tenantId),
            eq(libraryItems.id, libraryItemId),
            isNull(libraryItems.deletedAt),
          ),
        )
        .limit(1);
      pushDiagnostic(diagnostics, {
        code: existingItemRows[0]?.id ? "ITEM_UNREADABLE" : "ITEM_DELETED",
        severity: "warning",
        itemId: libraryItemId,
        message: existingItemRows[0]?.id
          ? "Context pack item is not readable for this actor"
          : "Snapshot item has been deleted since capture",
      });
      continue;
    }

    const markdown = item.itemType === "md"
      ? await getLibraryMarkdownContent(libraryItemId, actor)
      : null;
    const content = markdown?.content?.trim() || item.description?.trim() || "";
    if (!content) {
      missingCount += 1;
      pushDiagnostic(diagnostics, {
        code: "ITEM_UNINDEXED",
        severity: "warning",
        itemId: libraryItemId,
        message: "Context pack item has no markdown content available",
      });
      continue;
    }

    const member = members.find(
      (candidate) => candidate.libraryItemId === libraryItemId,
    );
    const logicalPath = getItemLogicalPath(item);
    const graphIncludedReason = includedReasonsById.get(libraryItemId);
    const graphCitationRefs = citationRefsById.get(libraryItemId) ?? [];

    if (row.sourceMode === "snapshot" && member?.snapshotMetadata) {
      const snapshot = member.snapshotMetadata as Record<string, unknown>;
      const currentFingerprint = hashSnapshotContent(content);
      if (
        typeof snapshot.contentFingerprint === "string"
        && currentFingerprint
        && snapshot.contentFingerprint !== currentFingerprint
      ) {
        pushDiagnostic(diagnostics, {
          code: "SNAPSHOT_CONTENT_DRIFT",
          severity: "warning",
          itemId: libraryItemId,
          message: "Snapshot item content has changed since capture",
        });
      }
      if (
        (typeof snapshot.title === "string" && snapshot.title !== item.title)
        || (typeof snapshot.logicalPath === "string"
          && snapshot.logicalPath !== logicalPath)
      ) {
        pushDiagnostic(diagnostics, {
          code: "SNAPSHOT_METADATA_DRIFT",
          severity: "info",
          itemId: libraryItemId,
          message: "Snapshot item title or logical path has changed since capture",
        });
      }
    }

    const itemTokens = estimateTokenCount(content);
    if (estimatedTokens + itemTokens > tokenBudgetHint) {
      pushDiagnostic(diagnostics, {
        code: "TOKEN_BUDGET_CLAMPED",
        severity: "warning",
        itemId: libraryItemId,
        message: "Context pack was truncated to stay within the token budget",
      });
      break;
    }

    estimatedTokens += itemTokens;
    const memberMode =
      member?.memberMode
      ?? (row.sourceMode === "view_backed" ? "include" : "include");

    items.push({
      libraryItemId,
      title: item.title,
      logicalPath,
      runtimeTier: effectiveRuntimeTier as LibraryContextPackRuntimeTier,
      freshness: freshnessForDate(item.updatedAt),
      includedReason:
        graphIncludedReason
          ? graphIncludedReason
          : memberMode === "pin"
          ? "Pinned context-pack note"
          : row.sourceMode === "snapshot"
            ? "Frozen snapshot context-pack note"
            : row.sourceMode === "view_backed"
            ? "Matched by saved view"
            : "Explicitly included in context pack",
      citations: input.includeCitations
        ? [
            ...graphCitationRefs.map((sourceRef) => ({ sourceRef })),
            {
              sourceRef: `library_item:${libraryItemId}`,
              excerpt: content.slice(0, 240),
            },
          ]
        : [],
    });
  }

  const status: LibraryContextPackResolveResult["status"] =
    items.length === 0
      ? "empty"
      : diagnostics.length > 0 || missingCount > 0 || excludedIds.size > 0
        ? "partial"
        : "complete";

  if (input.failIfPartial && status !== "complete") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Context pack could not be resolved completely",
    });
  }

  const demotedRow = await demoteSnapshotPackOnResolve(
    db,
    row,
    actor,
    diagnostics,
  );
  const effectiveRow = demotedRow ?? row;
  const result: LibraryContextPackResolveResult = {
    pack: {
      id: effectiveRow.id,
      slug: effectiveRow.slug,
      title: effectiveRow.title,
      sourceMode: effectiveRow.sourceMode,
      defaultRuntimeTier: effectiveRow.defaultRuntimeTier,
      approvedForAgents: effectiveRow.approvedForAgents,
      readinessStatus: effectiveRow.readinessStatus,
    },
    status,
    relationExpansionApplied,
    totals: {
      candidateCount,
      resolvedCount: items.length,
      missingCount,
      excludedCount: excludedIds.size,
      estimatedTokens,
    },
    items,
    diagnostics,
  };
  recordLibraryContextPackResolutionMetric({
    tenantId: effectiveRow.tenantId,
    metric: buildContextPackResolutionMetric({
      result,
      latencyMs: Date.now() - startedAt,
    }),
  });
  return result;
}
