import { createHash, createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { and, asc, eq, gt, inArray, or, sql } from "drizzle-orm";

import { getDb } from "../db";
import {
  tenantDataTransferActions,
  tenantDataTransferItems,
  tenantDataTransferPlans,
  tenantDataTransferPreviewItems,
  tenantDataTransferPreviews,
  users,
  workerJobs,
} from "../../drizzle/schema";
import {
  cancelQueuedJobInTransaction,
  canonicalizeStoredStatus,
  createCanonicalJobInTransaction,
  compatibilityStatus,
  createJobControlPlane,
  enforceCanonicalJobAdmissionInTransaction,
  resumeReviewGatedJobInTransaction,
  sanitizeJobErrorMessage,
} from "./jobControlPlane";
import {
  JobControlPlaneError,
  type JobResult,
  type LeaseContext,
} from "./jobControlPlaneTypes";
import {
  assertTransferHandlerRegistered,
  getTenantTransferHandler,
  getTenantTransferHandlerSnapshot,
  isTerminalTransferResourceStatus,
  TENANT_TRANSFER_HANDLER_REGISTRY_VERSION,
  TENANT_TRANSFER_POLICY_VERSION,
  type TransferActor,
  type TransferPreviewItem,
  type TransferSelection,
} from "./tenantTransferHandlers";

const MAX_SELECTIONS = 32;
const MAX_SELECTION_IDS = 5_000;
const MAX_PREVIEW_ITEMS = 10_000;
const MAX_PAGE_SIZE = 100;
const MAX_BATCH_SIZE = 100;
const PREVIEW_TTL_MS = 24 * 60 * 60 * 1000;
const OPERATION_DEADLINE_MS = 24 * 60 * 60 * 1000;
const TRANSFER_CONTRACT_VERSION = "feature-189-v1";
const CURSOR_VERSION = 1;

export type TransferServiceActor = {
  tenantId: string;
  actorId: number;
  authorizationScope: string;
};

export type TransferSelectionInput = {
  resourceKind: string;
  resourceIds: string[];
};

export type TransferPreviewResponse = {
  previewId: string;
  tenantId: string;
  sourceUserId: number;
  targetUserId: number;
  snapshotFingerprint: string;
  selectionHash: string;
  expiresAt: string;
  counts: Record<string, number>;
  items: TransferPreviewItemResponse[];
  nextCursor: string | null;
};

export type TransferPreviewItemResponse = {
  id?: string;
  resourceKind: string;
  sourceResourceId: string;
  classification: string;
  disposition: string | null;
  reasonCode: string | null;
  reasonDetail: string | null;
  dependencyOrder: number;
  contentHash: string | null;
  metadata: Record<string, unknown>;
};

export type TransferOperationResponse = {
  operationId: string;
  previewId: string;
  tenantId: string;
  status: string;
  compatibilityStatus: string;
  transferState: "approved" | "running" | "paused_on_error" | "completed" | "completed_with_conflicts" | "cancelled" | "failed";
  attempt: number;
  maxAttempts: number;
  operatorReviewRequired: boolean;
  operatorReviewReason: string | null;
  counts: Record<string, number>;
  sourceUserId: number;
  targetUserId: number;
};

type CursorPayload = {
  v: number;
  scope: string;
  key: string;
  id: string;
  exp: number;
};

type CommandOutcome = {
  accepted: boolean;
  command: string;
  previewId?: string;
  operationId?: string;
  itemId?: string;
  state?: string;
  created?: boolean;
  errorCode?: string;
  errorMessage?: string;
};

function transferError(code: string, message: string, details?: Record<string, unknown>): never {
  throw new JobControlPlaneError(code, message, details);
}

function boundedKey(value: string, max: number, code = "TRANSFER_INPUT_INVALID"): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > max || /[\u0000-\u001f\u007f]/.test(normalized)) transferError(code, "Transfer input is invalid");
  return normalized;
}

function normalizeActionId(value: string): string {
  const actionId = boundedKey(value, 128, "IDEMPOTENCY_CONFLICT");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(actionId)) transferError("TRANSFER_INPUT_INVALID", "Action key is invalid");
  return actionId;
}

function stableValue(value: unknown): unknown {
  if (typeof value === "string") return value.normalize("NFC");
  if (typeof value === "number") {
    if (!Number.isFinite(value)) transferError("TRANSFER_INPUT_INVALID", "Non-finite numbers are not allowed");
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .map(([key, child]) => [key.normalize("NFC"), stableValue(child)] as const)
      .sort(([left], [right]) => left.localeCompare(right)));
  }
  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export function hashTransferDefinition(value: unknown): string {
  return createHash("sha256").update(stableJson(value), "utf8").digest("hex");
}

function normalizeSelections(input: TransferSelectionInput[]): TransferSelection[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_SELECTIONS) transferError("TRANSFER_INPUT_INVALID", "At least one bounded resource selection is required");
  const seenKinds = new Set<string>();
  return input.map(selection => {
    const resourceKind = boundedKey(selection.resourceKind, 100);
    if (seenKinds.has(resourceKind)) transferError("TRANSFER_INPUT_INVALID", "Duplicate resource selection");
    seenKinds.add(resourceKind);
    assertTransferHandlerRegistered(resourceKind);
    const rawIds = Array.isArray(selection.resourceIds) ? selection.resourceIds : [];
    if (rawIds.length > MAX_SELECTION_IDS) transferError("BACKPRESSURE", "Selection is larger than the configured transfer budget");
    const resourceIds = [...new Set(rawIds.map(id => boundedKey(id, 255)))].sort((left, right) => left.localeCompare(right));
    return { resourceKind, resourceIds };
  });
}

function cursorSecret(): string {
  return process.env.FEATURE_189_CURSOR_SECRET || process.env.JWT_SECRET || "local-feature-189-cursor-secret";
}

function encodeCursor(payload: CursorPayload): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", cursorSecret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function decodeCursor(value: string | null | undefined, expectedScope: string): CursorPayload | null {
  if (!value) return null;
  const [body, signature] = value.split(".");
  if (!body || !signature || body.length > 1_000 || signature.length > 200) transferError("TRANSFER_INPUT_INVALID", "Cursor is invalid");
  const expected = createHmac("sha256", cursorSecret()).update(body).digest("base64url");
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) transferError("TRANSFER_INPUT_INVALID", "Cursor is invalid");
  let payload: CursorPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as CursorPayload;
  } catch {
    transferError("TRANSFER_INPUT_INVALID", "Cursor is invalid");
  }
  if (payload.v !== CURSOR_VERSION || payload.scope !== expectedScope || !payload.key || !payload.id || !Number.isSafeInteger(payload.exp) || payload.exp < Date.now()) transferError("TRANSFER_INPUT_INVALID", "Cursor is expired or invalid");
  return payload;
}

function previewItemResponse(row: any): TransferPreviewItemResponse {
  return {
    ...(row.id ? { id: String(row.id) } : {}),
    resourceKind: row.resourceKind,
    sourceResourceId: String(row.sourceResourceId),
    classification: row.classification ?? row.state ?? "unknown",
    disposition: row.disposition ?? null,
    reasonCode: row.reasonCode ?? row.errorCode ?? null,
    reasonDetail: row.reasonDetail ?? row.errorDetail ?? null,
    dependencyOrder: Number(row.dependencyOrder ?? 0),
    contentHash: row.contentHash ?? null,
    metadata: (row.metadataJson ?? row.metadata ?? {}) as Record<string, unknown>,
  };
}

function safeOutcome(outcome: CommandOutcome): Record<string, unknown> {
  return {
    accepted: Boolean(outcome.accepted),
    command: outcome.command,
    ...(outcome.previewId ? { previewId: outcome.previewId } : {}),
    ...(outcome.operationId ? { operationId: outcome.operationId } : {}),
    ...(outcome.itemId ? { itemId: outcome.itemId } : {}),
    ...(outcome.state ? { state: outcome.state } : {}),
    ...(outcome.created !== undefined ? { created: outcome.created } : {}),
  };
}

function actionTargetHash(command: string, target: Record<string, unknown>): string {
  return hashTransferDefinition({ command, target });
}

function isTerminalJob(status: string): boolean {
  return isTerminalTransferResourceStatus(status);
}

function transferStateForJob(status: string, review: boolean, counts: Record<string, number>): TransferOperationResponse["transferState"] {
  const canonical = canonicalizeStoredStatus(status);
  if (canonical === "cancelled") return "cancelled";
  if (canonical === "succeeded") return counts.conflict || counts.unsupported ? "completed_with_conflicts" : "completed";
  if (canonical === "retry_scheduled" && review) return "paused_on_error";
  if (canonical === "running" || canonical === "leased" || canonical === "waiting_external") return "running";
  if (canonical === "failed") return "failed";
  return "approved";
}

async function getUserPair(queryDb: any, actor: TransferServiceActor, sourceUserId: number, targetUserId: number): Promise<{ source: any; target: any }> {
  if (!Number.isSafeInteger(sourceUserId) || !Number.isSafeInteger(targetUserId) || sourceUserId <= 0 || targetUserId <= 0 || sourceUserId === targetUserId) transferError("TRANSFER_INPUT_INVALID", "Source and target users must be different valid users");
  const rows = await queryDb.select({ id: users.id, currentTenantId: users.currentTenantId, isSystemUser: users.isSystemUser, isDisabled: users.isDisabled }).from(users).where(inArray(users.id, [sourceUserId, targetUserId]));
  const source = rows.find((row: any) => row.id === sourceUserId);
  const target = rows.find((row: any) => row.id === targetUserId);
  if (!source || !target) transferError("TRANSFER_INPUT_INVALID", "Source or target user was not found");
  if (source.isSystemUser || target.isSystemUser || source.isDisabled || target.isDisabled) transferError("FORBIDDEN", "System or disabled users cannot participate in a transfer");
  if (String(source.currentTenantId ?? "") !== actor.tenantId || String(target.currentTenantId ?? "") !== actor.tenantId) transferError("TENANT_MISMATCH", "Both users must belong to the authenticated tenant");
  return { source, target };
}

async function getPreview(queryDb: any, actor: TransferServiceActor, previewId: string): Promise<any> {
  const [preview] = await queryDb.select().from(tenantDataTransferPreviews).where(and(eq(tenantDataTransferPreviews.id, previewId), eq(tenantDataTransferPreviews.tenantId, actor.tenantId))).limit(1);
  if (!preview) transferError("PREVIEW_STALE", "Transfer preview was not found");
  return preview;
}

async function getOperationRows(queryDb: any, actor: TransferServiceActor, operationId: string): Promise<{ job: any; plan: any }> {
  const [job] = await queryDb.select().from(workerJobs).where(and(eq(workerJobs.id, operationId), eq(workerJobs.tenantId, actor.tenantId), eq(workerJobs.jobType, "tenant_data_transfer"))).limit(1);
  if (!job) transferError("JOB_STATE_CONFLICT", "Transfer operation was not found");
  const [plan] = await queryDb.select().from(tenantDataTransferPlans).where(and(eq(tenantDataTransferPlans.operationId, operationId), eq(tenantDataTransferPlans.tenantId, actor.tenantId))).limit(1);
  if (!plan) transferError("JOB_STATE_CONFLICT", "Transfer plan was not found");
  return { job, plan };
}

async function loadCounts(queryDb: any, operationId: string): Promise<Record<string, number>> {
  const rows = await queryDb.select({ state: tenantDataTransferItems.state, count: sql<number>`count(*)::int` }).from(tenantDataTransferItems).where(eq(tenantDataTransferItems.operationId, operationId)).groupBy(tenantDataTransferItems.state);
  return Object.fromEntries(rows.map((row: any) => [row.state, Number(row.count)]));
}

async function buildPreviewItems(queryDb: any, actor: TransferServiceActor, sourceUserId: number, targetUserId: number, selections: TransferSelection[]): Promise<TransferPreviewItem[]> {
  const sourceActor: TransferActor = { tenantId: actor.tenantId, sourceUserId, targetUserId };
  const targetActor: TransferActor = { tenantId: actor.tenantId, sourceUserId: targetUserId, targetUserId: sourceUserId };
  const items: TransferPreviewItem[] = [];
  for (const selection of selections) {
    const handler = getTenantTransferHandler(selection.resourceKind);
    if (!handler) transferError("UNSUPPORTED_RESOURCE", `No transfer handler registered for ${selection.resourceKind}`);
    const [sourceRows, targetRows] = await Promise.all([
      handler.list({ db: queryDb, actor: sourceActor, resourceIds: selection.resourceIds, limit: Math.min(MAX_PREVIEW_ITEMS, MAX_SELECTION_IDS) }),
      handler.list({ db: queryDb, actor: targetActor, limit: Math.min(MAX_PREVIEW_ITEMS, MAX_SELECTION_IDS) }),
    ]);
    const targetConflictKeys = new Set(targetRows.map(row => row.conflictKey).filter(Boolean));
    for (const row of sourceRows) {
      if (items.length >= MAX_PREVIEW_ITEMS) transferError("BACKPRESSURE", "Preview is larger than the configured transfer budget");
      if (row.classification === "transferable" && row.conflictKey && targetConflictKeys.has(row.conflictKey)) {
        items.push({ ...row, classification: "conflict", disposition: "conflict", reasonCode: "RESOURCE_CONFLICT", reasonDetail: "The target already has a resource with the same stable conflict key." });
      } else {
        items.push(row);
      }
    }
  }

  // Queue state is always inspected separately from selectable domain data.
  // It is never copied as a resource and is cancelled only after approval.
  const queuedJobs = await queryDb
    .select({ id: workerJobs.id, jobType: workerJobs.jobType, status: workerJobs.status, attempt: workerJobs.attempt })
    .from(workerJobs)
    .where(and(
      eq(workerJobs.tenantId, actor.tenantId),
      eq(workerJobs.requestedByUserId, sourceUserId),
      inArray(workerJobs.status, ["pending", "queued", "retry_scheduled", "leased", "claimed", "preparing", "running", "waiting_external", "uploading", "publishing", "indexing"]),
    ))
    .orderBy(asc(workerJobs.createdAt))
    .limit(MAX_SELECTION_IDS);
  for (const job of queuedJobs) {
    const active = ["leased", "claimed", "preparing", "running", "waiting_external", "uploading", "publishing", "indexing"].includes(job.status);
    items.push({
      resourceKind: "worker_job",
      sourceResourceId: String(job.id),
      handlerVersion: "feature-186-cancel-v1",
      dependencyOrder: -10,
      classification: active ? "active_work" : "queue_cancelled",
      disposition: active ? "active_work" : "queue_cancelled",
      reasonCode: active ? "ACTIVE_JOB_BLOCKED" : "QUEUE_CANCEL_ON_APPROVAL",
      reasonDetail: active ? "Active canonical execution must finish before tenant transfer approval." : "Queued canonical work is cancelled and retained as job history during approval.",
      metadata: { jobType: job.jobType, status: job.status, attempt: job.attempt },
      conflictKey: `worker_job:${job.id}`,
    });
  }
  return items.sort((left, right) => left.dependencyOrder - right.dependencyOrder || left.resourceKind.localeCompare(right.resourceKind) || left.sourceResourceId.localeCompare(right.sourceResourceId));
}

function buildCursor(scope: string, key: string, id: string, expiresAt: Date): string {
  return encodeCursor({ v: CURSOR_VERSION, scope, key, id, exp: expiresAt.getTime() });
}

export async function createTenantTransferPreview(input: {
  actor: TransferServiceActor;
  sourceUserId: number;
  targetUserId: number;
  selections: TransferSelectionInput[];
  requestIdempotencyKey: string;
}): Promise<TransferPreviewResponse> {
  const queryDb = getDb();
  const requestKey = normalizeActionId(input.requestIdempotencyKey);
  const selections = normalizeSelections(input.selections);
  const actor = input.actor;
  await getUserPair(queryDb, actor, input.sourceUserId, input.targetUserId);
  const selectionHash = hashTransferDefinition({ tenantId: actor.tenantId, sourceUserId: input.sourceUserId, targetUserId: input.targetUserId, selections });

  const existing = await queryDb.select().from(tenantDataTransferPreviews).where(and(eq(tenantDataTransferPreviews.tenantId, actor.tenantId), eq(tenantDataTransferPreviews.requestIdempotencyKey, requestKey))).limit(1);
  if (existing[0]) {
    if (existing[0].selectionHash !== selectionHash) transferError("IDEMPOTENCY_CONFLICT", "Preview key was already used for a different transfer definition");
    return listTenantTransferPreviewItems({ actor, previewId: existing[0].id, pageSize: MAX_PAGE_SIZE });
  }

  const items = await buildPreviewItems(queryDb, actor, input.sourceUserId, input.targetUserId, selections);
  const generatedAt = new Date();
  const expiresAt = new Date(generatedAt.getTime() + PREVIEW_TTL_MS);
  const snapshotFingerprint = hashTransferDefinition({ tenantId: actor.tenantId, sourceUserId: input.sourceUserId, targetUserId: input.targetUserId, selectionHash, handlerRegistryVersion: TENANT_TRANSFER_HANDLER_REGISTRY_VERSION, policyVersion: TENANT_TRANSFER_POLICY_VERSION, schemaVersion: "0317", items: items.map(item => ({ ...item, metadata: item.metadata })) });
  const counts = items.reduce<Record<string, number>>((acc, item) => { acc[item.classification] = (acc[item.classification] ?? 0) + 1; return acc; }, {});
  const previewId = randomUUID();
  try {
    await queryDb.transaction(async tx => {
      await tx.insert(tenantDataTransferPreviews).values({
        id: previewId,
        tenantId: actor.tenantId,
        sourceUserId: input.sourceUserId,
        targetUserId: input.targetUserId,
        selectionHash,
        snapshotFingerprint,
        handlerRegistryVersion: TENANT_TRANSFER_HANDLER_REGISTRY_VERSION,
        policyVersion: TENANT_TRANSFER_POLICY_VERSION,
        schemaVersion: "0317",
        createdByUserId: actor.actorId,
        selectionJson: { selections },
        handlerSnapshotJson: getTenantTransferHandlerSnapshot(),
        countsJson: counts,
        requestIdempotencyKey: requestKey,
        generatedAt,
        expiresAt,
      });
      for (const [index, item] of items.entries()) {
        await tx.insert(tenantDataTransferPreviewItems).values({
          id: randomUUID(),
          previewId,
          tenantId: actor.tenantId,
          sourceUserId: input.sourceUserId,
          targetUserId: input.targetUserId,
          resourceKind: item.resourceKind,
          sourceResourceId: item.sourceResourceId,
          handlerVersion: item.handlerVersion,
          dependencyOrder: item.dependencyOrder,
          classification: item.classification,
          disposition: item.disposition ?? null,
          reasonCode: item.reasonCode ?? null,
          reasonDetail: item.reasonDetail ?? null,
          contentHash: item.contentHash ?? null,
          metadataJson: item.metadata,
          cursorKey: `${String(index).padStart(8, "0")}:${item.resourceKind}:${item.sourceResourceId}`,
        });
      }
    });
  } catch (error) {
    if ((error as { code?: string })?.code === "23505") {
      const winner = await queryDb.select().from(tenantDataTransferPreviews).where(and(eq(tenantDataTransferPreviews.tenantId, actor.tenantId), eq(tenantDataTransferPreviews.requestIdempotencyKey, requestKey))).limit(1);
      if (winner[0] && winner[0].selectionHash === selectionHash) return listTenantTransferPreviewItems({ actor, previewId: winner[0].id, pageSize: MAX_PAGE_SIZE });
      transferError("IDEMPOTENCY_CONFLICT", "Preview was created concurrently with a different definition");
    }
    throw error;
  }
  return listTenantTransferPreviewItems({ actor, previewId, pageSize: MAX_PAGE_SIZE });
}

export async function listTenantTransferPreviewItems(input: { actor: TransferServiceActor; previewId: string; cursor?: string | null; pageSize?: number; classification?: string }): Promise<TransferPreviewResponse> {
  const queryDb = getDb();
  const preview = await getPreview(queryDb, input.actor, boundedKey(input.previewId, 36));
  if (new Date(preview.expiresAt).getTime() <= Date.now()) transferError("PREVIEW_EXPIRED", "Transfer preview has expired");
  const pageSize = Math.max(1, Math.min(input.pageSize ?? MAX_PAGE_SIZE, MAX_PAGE_SIZE));
  const scope = `preview:${preview.id}:${input.classification ?? "*"}`;
  const cursor = decodeCursor(input.cursor, scope);
  const predicates: any[] = [eq(tenantDataTransferPreviewItems.previewId, preview.id)];
  if (input.classification) predicates.push(eq(tenantDataTransferPreviewItems.classification, boundedKey(input.classification, 40)));
  if (cursor) predicates.push(or(gt(tenantDataTransferPreviewItems.cursorKey, cursor.key), and(eq(tenantDataTransferPreviewItems.cursorKey, cursor.key), gt(tenantDataTransferPreviewItems.id, cursor.id))));
  const rows = await queryDb.select().from(tenantDataTransferPreviewItems).where(and(...predicates)).orderBy(asc(tenantDataTransferPreviewItems.cursorKey), asc(tenantDataTransferPreviewItems.id)).limit(pageSize + 1);
  const hasMore = rows.length > pageSize;
  const page = hasMore ? rows.slice(0, pageSize) : rows;
  const last = page[page.length - 1];
  const expiresAt = new Date(preview.expiresAt);
  const counts = (preview.countsJson ?? {}) as Record<string, number>;
  return {
    previewId: preview.id,
    tenantId: preview.tenantId,
    sourceUserId: preview.sourceUserId,
    targetUserId: preview.targetUserId,
    snapshotFingerprint: preview.snapshotFingerprint,
    selectionHash: preview.selectionHash,
    expiresAt: expiresAt.toISOString(),
    counts,
    items: page.map(previewItemResponse),
    nextCursor: hasMore && last ? buildCursor(scope, last.cursorKey, last.id, expiresAt) : null,
  };
}

async function findTransferAction(queryDb: any, actor: TransferServiceActor, actionId: string): Promise<any | null> {
  const [row] = await queryDb.select().from(tenantDataTransferActions).where(and(eq(tenantDataTransferActions.tenantId, actor.tenantId), eq(tenantDataTransferActions.actionId, actionId))).limit(1);
  return row ?? null;
}

function throwStoredAction(action: any): never {
  const code = action.safeErrorCode;
  if (code) transferError(code, action.safeErrorMessage ?? code);
  const outcome = (action.outcomeJson ?? {}) as CommandOutcome;
  return transferError("IDEMPOTENT_RESULT", JSON.stringify(outcome));
}

async function insertTransferAction(tx: any, input: { actor: TransferServiceActor; actionId: string; command: string; commandTargetHash: string; previewId?: string; operationId?: string; itemId?: string; expectedOperationStatus?: string; expectedAttempt?: number; expectedFencingVersion?: number }): Promise<{ row: any | null; existing: boolean }> {
  const existing = await findTransferAction(tx, input.actor, input.actionId);
  if (existing) {
    if (existing.command !== input.command || existing.commandTargetHash !== input.commandTargetHash) transferError("IDEMPOTENCY_CONFLICT", "Action key was already used for another command or target");
    return { row: existing, existing: true };
  }
  await tx.insert(tenantDataTransferActions).values({
    id: randomUUID(),
    tenantId: input.actor.tenantId,
    actionId: input.actionId,
    command: input.command,
    commandTargetHash: input.commandTargetHash,
    previewId: input.previewId ?? null,
    operationId: input.operationId ?? null,
    itemId: input.itemId ?? null,
    actorType: "user",
    actorId: input.actor.actorId,
    authorizationScope: input.actor.authorizationScope,
    expectedOperationStatus: input.expectedOperationStatus ?? null,
    expectedAttempt: input.expectedAttempt ?? null,
    expectedFencingVersion: input.expectedFencingVersion ?? null,
    outcomeJson: {},
  }).catch((error: unknown) => {
    if ((error as { code?: string })?.code !== "23505") throw error;
  });
  const inserted = await findTransferAction(tx, input.actor, input.actionId);
  if (!inserted) throw new Error("TRANSFER_ACTION_INSERT_FAILED");
  if (inserted.command !== input.command || inserted.commandTargetHash !== input.commandTargetHash) transferError("IDEMPOTENCY_CONFLICT", "Action key was already used for another command or target");
  return { row: inserted, existing: false };
}

async function finishTransferAction(tx: any, tenantId: string, actionId: string, outcome: CommandOutcome, error?: JobControlPlaneError): Promise<void> {
  await tx.update(tenantDataTransferActions).set({
    outcomeJson: safeOutcome(outcome),
    safeErrorCode: error?.code ?? null,
    safeErrorMessage: error ? sanitizeJobErrorMessage(error.message, 1000, error.code) : null,
    effectiveAt: new Date(),
    updatedAt: new Date(),
  }).where(and(eq(tenantDataTransferActions.tenantId, tenantId), eq(tenantDataTransferActions.actionId, actionId)));
}

function actionError(error: unknown): JobControlPlaneError {
  if (error instanceof JobControlPlaneError) return error;
  return new JobControlPlaneError("TRANSFER_FAILED", sanitizeJobErrorMessage(error instanceof Error ? error.message : "Transfer command failed", 1000, "TRANSFER_FAILED"));
}

export async function approveTenantTransfer(input: { actor: TransferServiceActor; previewId: string; snapshotFingerprint: string; sourceUserId: number; targetUserId: number; confirmation: string; actionId: string }): Promise<{ operationId: string; created: boolean; state: string }> {
  const queryDb = getDb();
  const actionId = normalizeActionId(input.actionId);
  const targetHash = actionTargetHash("approve", { previewId: input.previewId, snapshotFingerprint: input.snapshotFingerprint, sourceUserId: input.sourceUserId, targetUserId: input.targetUserId, confirmation: input.confirmation });
  const result = await queryDb.transaction(async tx => {
    const action = await insertTransferAction(tx, {
      actor: input.actor,
      actionId,
      command: "approve",
      commandTargetHash: targetHash,
      previewId: input.previewId,
      // Approval has no canonical job yet; persist the preview projection as
      // the expected operation state so every mutating command has an
      // explicit precondition snapshot in its durable action record.
      expectedOperationStatus: "previewed",
    });
    if (action.existing) {
      if (action.row.safeErrorCode) return { error: new JobControlPlaneError(action.row.safeErrorCode, action.row.safeErrorMessage ?? action.row.safeErrorCode) };
      const old = action.row.outcomeJson as CommandOutcome;
      return { value: { operationId: String(old.operationId), created: false, state: String(old.state ?? "approved") } };
    }
    try {
      // Match the normal Feature 186 create lock order: global/class ->
      // tenant -> source user. The user lock must not be acquired before
      // admission because ordinary creates acquire those locks in this order
      // before checking the tenant-transfer fence.
      await enforceCanonicalJobAdmissionInTransaction(tx, { tenantId: input.actor.tenantId, executionClass: "long" });
      await tx.execute(sql`SELECT 1 FROM "users" WHERE "id" = ${input.sourceUserId} FOR UPDATE`);
      const [preview] = await tx.select().from(tenantDataTransferPreviews).where(and(eq(tenantDataTransferPreviews.id, input.previewId), eq(tenantDataTransferPreviews.tenantId, input.actor.tenantId))).limit(1);
      if (!preview || preview.snapshotFingerprint !== input.snapshotFingerprint || preview.sourceUserId !== input.sourceUserId || preview.targetUserId !== input.targetUserId) transferError("PREVIEW_STALE", "Preview fingerprint or source/target no longer matches");
      if (new Date(preview.expiresAt).getTime() <= Date.now()) transferError("PREVIEW_EXPIRED", "Transfer preview has expired");
      if (input.confirmation.trim().toUpperCase() !== "TRANSFER") transferError("TRANSFER_INPUT_INVALID", "Typed confirmation must be TRANSFER");
      await getUserPair(tx, input.actor, input.sourceUserId, input.targetUserId);
      const [activePlan] = await tx.select({ operationId: tenantDataTransferPlans.operationId })
        .from(tenantDataTransferPlans)
        .innerJoin(workerJobs, eq(workerJobs.id, tenantDataTransferPlans.operationId))
        .where(and(
          eq(tenantDataTransferPlans.tenantId, input.actor.tenantId),
          eq(tenantDataTransferPlans.sourceUserId, input.sourceUserId),
          sql`"worker_jobs"."status" NOT IN ('succeeded', 'completed', 'failed', 'cancelled', 'canceled', 'expired')`,
        )).limit(1);
      if (activePlan) transferError("TRANSFER_IN_PROGRESS", "User already has an active tenant transfer");
      const previewItems = await tx.select().from(tenantDataTransferPreviewItems).where(eq(tenantDataTransferPreviewItems.previewId, preview.id)).orderBy(asc(tenantDataTransferPreviewItems.dependencyOrder), asc(tenantDataTransferPreviewItems.cursorKey));
      if (previewItems.some((item: any) => item.classification === "active_work")) transferError("ACTIVE_JOB_BLOCKED", "Active canonical jobs must finish before transfer approval");
      const operationId = randomUUID();
      const now = new Date();
      await createCanonicalJobInTransaction({
        query: tx,
        definition: {
          tenantId: input.actor.tenantId,
          requestedByUserId: preview.sourceUserId,
          jobType: "tenant_data_transfer",
          executionClass: "long",
          contractVersion: TRANSFER_CONTRACT_VERSION,
          input: { operationId, previewFingerprint: preview.snapshotFingerprint, sourceUserId: preview.sourceUserId, targetUserId: preview.targetUserId },
          retryPolicy: { maxAttempts: 5, baseDelayMs: 30_000, maxDelayMs: 15 * 60_000, jitter: "recorded", deadlineMs: OPERATION_DEADLINE_MS, allowedErrorClasses: ["retryable", "unknown"] },
          timeoutPolicy: { softTimeoutMs: OPERATION_DEADLINE_MS, hardTimeoutMs: OPERATION_DEADLINE_MS },
          requiredCapabilities: {},
        },
        options: { canonicalJobId: operationId, runtimeType: "node_job_worker", requestedBySystemComponent: "feature-189-tenant-transfer" },
        createdPayload: { source: "feature-189-transfer" },
        queuedPayload: { previewId: preview.id },
        admissionAlreadyChecked: true,
      });

      await tx.insert(tenantDataTransferPlans).values({ id: randomUUID(), operationId, previewId: preview.id, tenantId: input.actor.tenantId, sourceUserId: preview.sourceUserId, targetUserId: preview.targetUserId, previewFingerprint: preview.snapshotFingerprint, selectionJson: preview.selectionJson, handlerSnapshotJson: preview.handlerSnapshotJson, policyJson: { policyVersion: TENANT_TRANSFER_POLICY_VERSION, contractVersion: TRANSFER_CONTRACT_VERSION }, approvedAt: now, createdAt: now });
      for (const [index, item] of previewItems.entries()) {
        const isQueueItem = item.resourceKind === "worker_job";
        const state = item.classification === "transferable" ? "pending" : item.classification === "conflict" ? "conflict" : "skipped";
        const settled = state === "skipped" ? now : null;
        await tx.insert(tenantDataTransferItems).values({ operationId, tenantId: input.actor.tenantId, sourceUserId: preview.sourceUserId, targetUserId: preview.targetUserId, resourceKind: item.resourceKind, sourceResourceId: item.sourceResourceId, destinationResourceId: null, destinationMarker: null, state, handlerVersion: item.handlerVersion, contentHash: item.contentHash, definitionHash: hashTransferDefinition({ operationId, resourceKind: item.resourceKind, sourceResourceId: item.sourceResourceId, handlerVersion: item.handlerVersion }), itemIdempotencyKey: hashTransferDefinition({ operationId, sourceUserId: preview.sourceUserId, targetUserId: preview.targetUserId, resourceKind: item.resourceKind, sourceResourceId: item.sourceResourceId, handlerVersion: item.handlerVersion }).slice(0, 200), disposition: isQueueItem ? "queue_cancelled" : item.disposition ?? (state === "skipped" ? "unsupported" : null), conflictKey: item.conflictKey ?? null, errorCode: item.reasonCode ?? null, errorDetail: item.reasonDetail ?? null, checkpointKey: `${String(index).padStart(8, "0")}:${item.resourceKind}:${item.sourceResourceId}`, batchSequence: index, causalJobId: isQueueItem ? item.sourceResourceId : null, createdAt: now, updatedAt: now, settledAt: settled });
      }

      // Cancel only canonical queued work found in the immutable preview. The
      // job id remains the identity and every cancellation is fenced/audited.
      for (const item of previewItems.filter((candidate: any) => candidate.resourceKind === "worker_job" && candidate.classification === "queue_cancelled")) {
        await cancelQueuedJobInTransaction({
          query: tx,
          jobId: item.sourceResourceId,
          reason: `tenant_transfer_cancelled:${operationId}`,
          actionId: `tenant-transfer:${operationId}:${item.sourceResourceId}`,
          actorId: input.actor.actorId,
          scope: { tenantId: input.actor.tenantId, requestedByUserId: preview.sourceUserId, authorizationScope: input.actor.authorizationScope },
        });
      }
      const outcome: CommandOutcome = { accepted: true, command: "approve", previewId: preview.id, operationId, state: "approved", created: true };
      await finishTransferAction(tx, input.actor.tenantId, actionId, outcome);
      return { value: { operationId, created: true, state: "approved" } };
    } catch (error) {
      const safe = actionError(error);
      await finishTransferAction(tx, input.actor.tenantId, actionId, { accepted: false, command: "approve", previewId: input.previewId, state: "rejected", errorCode: safe.code }, safe);
      return { error: safe };
    }
  });
  if (result.error) throw result.error;
  return result.value!;
}

export async function getTenantTransferOperation(input: { actor: TransferServiceActor; operationId: string }): Promise<TransferOperationResponse> {
  const queryDb = getDb();
  const { job, plan } = await getOperationRows(queryDb, input.actor, boundedKey(input.operationId, 36));
  const counts = await loadCounts(queryDb, job.id);
  const status = canonicalizeStoredStatus(job.status);
  return { operationId: job.id, previewId: plan.previewId, tenantId: job.tenantId, status, compatibilityStatus: compatibilityStatus(job.status), transferState: transferStateForJob(job.status, job.operatorReviewRequired, { ...counts, conflict: counts.conflict ?? 0, unsupported: counts.skipped ?? 0 }), attempt: job.attempt, maxAttempts: job.maxAttempts, operatorReviewRequired: job.operatorReviewRequired, operatorReviewReason: job.operatorReviewReason ? sanitizeJobErrorMessage(job.operatorReviewReason, 500, "operator_review") : null, counts, sourceUserId: plan.sourceUserId, targetUserId: plan.targetUserId };
}

export async function listTenantTransferItems(input: { actor: TransferServiceActor; operationId: string; cursor?: string | null; pageSize?: number; state?: string }): Promise<{ operationId: string; items: TransferPreviewItemResponse[]; nextCursor: string | null }> {
  const queryDb = getDb();
  const { job } = await getOperationRows(queryDb, input.actor, boundedKey(input.operationId, 36));
  const state = input.state ? boundedKey(input.state, 40) : undefined;
  const scope = `operation:${job.id}:${state ?? "*"}`;
  const cursor = decodeCursor(input.cursor, scope);
  const predicates: any[] = [eq(tenantDataTransferItems.operationId, job.id)];
  if (state) predicates.push(eq(tenantDataTransferItems.state, state));
  if (cursor) predicates.push(or(gt(tenantDataTransferItems.checkpointKey, cursor.key), and(eq(tenantDataTransferItems.checkpointKey, cursor.key), gt(tenantDataTransferItems.id, cursor.id))));
  const rows = await queryDb.select().from(tenantDataTransferItems).where(and(...predicates)).orderBy(asc(tenantDataTransferItems.checkpointKey), asc(tenantDataTransferItems.id)).limit(Math.min(input.pageSize ?? MAX_PAGE_SIZE, MAX_PAGE_SIZE) + 1);
  const pageSize = Math.min(input.pageSize ?? MAX_PAGE_SIZE, MAX_PAGE_SIZE);
  const hasMore = rows.length > pageSize;
  const page = hasMore ? rows.slice(0, pageSize) : rows;
  const last = page[page.length - 1];
  return { operationId: job.id, items: page.map(previewItemResponse), nextCursor: hasMore && last ? buildCursor(scope, last.checkpointKey ?? "", last.id, new Date(Date.now() + PREVIEW_TTL_MS)) : null };
}

async function runTransferAction(input: { actor: TransferServiceActor; actionId: string; command: string; target: Record<string, unknown>; operationId?: string; previewId?: string; itemId?: string; expectedOperationStatus?: string; expectedAttempt?: number; expectedFencingVersion?: number; execute: (tx: any, actionId: string) => Promise<CommandOutcome> }): Promise<CommandOutcome> {
  const queryDb = getDb();
  const actionId = normalizeActionId(input.actionId);
  const commandTargetHash = actionTargetHash(input.command, input.target);
  const result = await queryDb.transaction(async tx => {
    const action = await insertTransferAction(tx, { actor: input.actor, actionId, command: input.command, commandTargetHash, operationId: input.operationId, previewId: input.previewId, itemId: input.itemId, expectedOperationStatus: input.expectedOperationStatus, expectedAttempt: input.expectedAttempt, expectedFencingVersion: input.expectedFencingVersion });
    if (action.existing) {
      if (action.row.safeErrorCode) return { error: new JobControlPlaneError(action.row.safeErrorCode, action.row.safeErrorMessage ?? action.row.safeErrorCode) };
      return { value: action.row.outcomeJson as CommandOutcome };
    }
    try {
      const outcome = await input.execute(tx, actionId);
      await finishTransferAction(tx, input.actor.tenantId, actionId, outcome);
      return { value: outcome };
    } catch (error) {
      const safe = actionError(error);
      await finishTransferAction(tx, input.actor.tenantId, actionId, { accepted: false, command: input.command, operationId: input.operationId, previewId: input.previewId, itemId: input.itemId, state: "rejected", errorCode: safe.code }, safe);
      return { error: safe };
    }
  });
  if (result.error) throw result.error;
  return result.value!;
}

export async function resumeTenantTransfer(input: { actor: TransferServiceActor; operationId: string; actionId: string }): Promise<CommandOutcome> {
  const { job } = await getOperationRows(getDb(), input.actor, boundedKey(input.operationId, 36));
  return runTransferAction({ actor: input.actor, actionId: input.actionId, command: "resume", operationId: input.operationId, target: { operationId: input.operationId }, expectedOperationStatus: canonicalizeStoredStatus(job.status), expectedAttempt: job.attempt, expectedFencingVersion: job.fencingVersion, execute: async (tx, actionId) => {
    const resumed = await resumeReviewGatedJobInTransaction({
      query: tx,
      jobId: input.operationId,
      expectedJobType: "tenant_data_transfer",
      reason: "authorized_transfer_resume",
      actionId,
      scope: { tenantId: input.actor.tenantId, requestedByUserId: undefined, authorizationScope: input.actor.authorizationScope },
    });
    return { accepted: true, command: "resume", operationId: resumed.jobId, state: "queued", created: resumed.created };
  }});
}

export async function resolveTenantTransferItem(input: { actor: TransferServiceActor; operationId: string; itemId: string; resolution: "retry" | "skip"; actionId: string }): Promise<CommandOutcome> {
  const queryDb = getDb();
  const { job } = await getOperationRows(queryDb, input.actor, boundedKey(input.operationId, 36));
  const [expectedItem] = await queryDb.select({ id: tenantDataTransferItems.id }).from(tenantDataTransferItems).where(and(eq(tenantDataTransferItems.id, input.itemId), eq(tenantDataTransferItems.operationId, input.operationId), eq(tenantDataTransferItems.tenantId, input.actor.tenantId))).limit(1);
  if (!expectedItem) transferError("JOB_STATE_CONFLICT", "Transfer item was not found");
  return runTransferAction({ actor: input.actor, actionId: input.actionId, command: "resolveItem", operationId: input.operationId, itemId: input.itemId, target: { operationId: input.operationId, itemId: input.itemId, resolution: input.resolution }, expectedOperationStatus: canonicalizeStoredStatus(job.status), expectedAttempt: job.attempt, expectedFencingVersion: job.fencingVersion, execute: async tx => {
    const [item] = await tx.select().from(tenantDataTransferItems).where(and(eq(tenantDataTransferItems.id, input.itemId), eq(tenantDataTransferItems.operationId, input.operationId), eq(tenantDataTransferItems.tenantId, input.actor.tenantId))).limit(1);
    if (!item) transferError("JOB_STATE_CONFLICT", "Transfer item was not found");
    if (["transferred", "skipped"].includes(item.state)) return { accepted: true, command: "resolveItem", operationId: input.operationId, itemId: item.id, state: item.state, created: false };
    if (input.resolution === "retry" && !["retryable_error", "conflict"].includes(item.state)) transferError("JOB_STATE_CONFLICT", "Item is not eligible for retry resolution");
    if (input.resolution === "skip" && item.state === "pending") transferError("JOB_STATE_CONFLICT", "Pending items require execution before explicit skip");
    const now = new Date();
    await tx.update(tenantDataTransferItems).set({ state: input.resolution === "retry" ? "pending" : "skipped", disposition: input.resolution === "retry" ? "operator_retry" : "operator_skip", errorCode: null, errorDetail: null, settledAt: input.resolution === "retry" ? null : now, updatedAt: now }).where(and(eq(tenantDataTransferItems.id, item.id), eq(tenantDataTransferItems.state, item.state)));
    return { accepted: true, command: "resolveItem", operationId: input.operationId, itemId: item.id, state: input.resolution === "retry" ? "pending" : "skipped", created: true };
  }});
}

export async function cancelTenantTransfer(input: { actor: TransferServiceActor; operationId: string; actionId: string }): Promise<CommandOutcome> {
  const queryDb = getDb();
  const actionId = normalizeActionId(input.actionId);
  const { job } = await getOperationRows(queryDb, input.actor, boundedKey(input.operationId, 36));
  const target = { operationId: input.operationId };
  const commandTargetHash = actionTargetHash("cancel", target);
  const prepared = await queryDb.transaction(async tx => insertTransferAction(tx, {
    actor: input.actor,
    actionId,
    command: "cancel",
    commandTargetHash,
    operationId: input.operationId,
    expectedOperationStatus: canonicalizeStoredStatus(job.status),
    expectedAttempt: job.attempt,
    expectedFencingVersion: job.fencingVersion,
  }));
  if (prepared.existing) {
    if (prepared.row.safeErrorCode) throw new JobControlPlaneError(prepared.row.safeErrorCode, prepared.row.safeErrorMessage ?? prepared.row.safeErrorCode);
    const outcome = prepared.row.outcomeJson as CommandOutcome;
    if (typeof outcome?.accepted !== "boolean") throw new JobControlPlaneError("ACTION_IN_PROGRESS", "Transfer cancellation is already being processed");
    return outcome;
  }
  // Canonical lifecycle cancellation is delegated through Feature 186. The
  // transfer item/action settlement is committed afterwards in its own short
  // transaction and remains reconcilable by operationId.
  const controlPlane = createJobControlPlane();
  try {
    await controlPlane.cancel(job.id, "tenant_transfer_cancelled", `transfer:${actionId}`, input.actor.actorId, { tenantId: input.actor.tenantId, authorizationScope: input.actor.authorizationScope });
    return await queryDb.transaction(async tx => {
      const now = new Date();
      await tx.update(tenantDataTransferItems).set({ state: "skipped", disposition: "operator_cancelled", errorCode: null, errorDetail: null, settledAt: now, updatedAt: now }).where(and(eq(tenantDataTransferItems.operationId, input.operationId), inArray(tenantDataTransferItems.state, ["pending", "retryable_error", "conflict", "permanent_error"])));
      const outcome = { accepted: true, command: "cancel", operationId: input.operationId, state: "cancelled", created: true } satisfies CommandOutcome;
      await finishTransferAction(tx, input.actor.tenantId, actionId, outcome);
      return outcome;
    });
  } catch (error) {
    const safe = actionError(error);
    await queryDb.transaction(tx => finishTransferAction(tx, input.actor.tenantId, actionId, { accepted: false, command: "cancel", operationId: input.operationId, state: "rejected", errorCode: safe.code }, safe));
    throw safe;
  }
}

/**
 * Called by the canonical Feature 186 executor registry. It receives only a
 * canonical job ID and lease context; all transfer data is reloaded from the
 * approved plan. One invocation processes at most MAX_BATCH_SIZE items.
 */
export async function executeTenantDataTransferJob(input: { jobId: string; lease: LeaseContext; reporter?: { progress(lease: LeaseContext, update: { progress: number; stage: string; message?: string }): Promise<void> }; controlPlane?: ReturnType<typeof createJobControlPlane> }): Promise<JobResult> {
  const queryDb = getDb();
  const leaseHash = createHash("sha256").update(input.lease.leaseToken, "utf8").digest("hex");
  const leaseRows = await queryDb.execute(sql`SELECT j."id", j."tenantId", j."attempt", j."fencingVersion", j."operatorReviewRequired"
    FROM "worker_jobs" j
    INNER JOIN "worker_job_attempts" a
      ON a."workerJobId" = j."id"
      AND a."id" = ${input.lease.attemptId}
      AND a."attempt" = j."attempt"
    WHERE j."id" = ${input.jobId}
      AND j."jobType" = 'tenant_data_transfer'
      AND j."leaseOwnerToken" = ${leaseHash}
      AND j."fencingVersion" = ${input.lease.fencingVersion}
      AND j."leaseExpiresAt" > NOW()
    LIMIT 1`);
  if (!leaseRows[0]) transferError("JOB_LEASE_LOST", "Transfer worker lease is no longer active");
  const planRows = await queryDb.select().from(tenantDataTransferPlans).where(eq(tenantDataTransferPlans.operationId, input.jobId)).limit(1);
  if (!planRows[0]) transferError("JOB_STATE_CONFLICT", "Approved transfer plan is missing");
  const plan = planRows[0];
  const pending = await queryDb.select().from(tenantDataTransferItems).where(and(eq(tenantDataTransferItems.operationId, input.jobId), inArray(tenantDataTransferItems.state, ["pending", "retryable_error"]))).orderBy(asc(tenantDataTransferItems.batchSequence), asc(tenantDataTransferItems.id)).limit(MAX_BATCH_SIZE);
  let transferred = 0;
  let retryable = 0;
  for (const candidate of pending) {
    try {
      await queryDb.transaction(async tx => {
        const leaseCheck = await tx.execute(sql`SELECT 1 FROM "worker_jobs" WHERE "id" = ${input.jobId} AND "tenantId" = ${plan.tenantId} AND "attempt" = (SELECT "attempt" FROM "worker_jobs" WHERE "id" = ${input.jobId}) AND "leaseOwnerToken" = ${leaseHash} AND "fencingVersion" = ${input.lease.fencingVersion} AND "leaseExpiresAt" > NOW() LIMIT 1`);
        if (!leaseCheck[0]) transferError("JOB_LEASE_LOST", "Transfer worker lease is no longer active");
        const [item] = await tx.select().from(tenantDataTransferItems).where(and(eq(tenantDataTransferItems.id, candidate.id), eq(tenantDataTransferItems.operationId, input.jobId), inArray(tenantDataTransferItems.state, ["pending", "retryable_error"]))).limit(1);
        if (!item) return;
        const handler = getTenantTransferHandler(item.resourceKind);
        if (!handler) {
          await tx.update(tenantDataTransferItems).set({ state: "permanent_error", disposition: "unsupported", errorCode: "UNSUPPORTED_RESOURCE", errorDetail: "Handler was not present in the approved registry", updatedAt: new Date() }).where(eq(tenantDataTransferItems.id, item.id));
          return;
        }
        const result = await handler.apply({ db: tx, item: { resourceKind: item.resourceKind, sourceResourceId: item.sourceResourceId, handlerVersion: item.handlerVersion, dependencyOrder: 0, classification: "transferable", contentHash: item.contentHash ?? undefined, metadata: (item.destinationMarker ? { destinationMarker: item.destinationMarker } : {}), conflictKey: item.conflictKey ?? undefined }, context: { tenantId: item.tenantId, sourceUserId: item.sourceUserId, targetUserId: item.targetUserId, operationId: input.jobId, itemIdempotencyKey: item.itemIdempotencyKey } });
        await tx.update(tenantDataTransferItems).set({ state: "transferred", disposition: "transferred", destinationResourceId: result.destinationResourceId, destinationMarker: result.destinationMarker, errorCode: null, errorDetail: null, settledAt: new Date(), updatedAt: new Date() }).where(and(eq(tenantDataTransferItems.id, item.id), eq(tenantDataTransferItems.itemIdempotencyKey, item.itemIdempotencyKey), inArray(tenantDataTransferItems.state, ["pending", "retryable_error"])));
      });
      transferred += 1;
    } catch (error) {
      const safe = actionError(error);
      if (safe.code === "JOB_LEASE_LOST") throw safe;
      retryable += 1;
      await queryDb.update(tenantDataTransferItems).set({ state: "retryable_error", errorCode: safe.code, errorDetail: sanitizeJobErrorMessage(safe.message, 4000, safe.code), updatedAt: new Date() }).where(and(eq(tenantDataTransferItems.id, candidate.id), inArray(tenantDataTransferItems.state, ["pending", "retryable_error"])));
    }
  }
  const counts = await loadCounts(queryDb, input.jobId);
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const settled = (counts.transferred ?? 0) + (counts.skipped ?? 0);
  const progress = total > 0 ? Math.min(99, Math.floor((settled / total) * 100)) : 100;
  if (input.reporter) await input.reporter.progress(input.lease, { progress, stage: "tenant_transfer", message: `Transferred ${counts.transferred ?? 0} of ${total} items` });
  if (retryable > 0 || (counts.pending ?? 0) > 0) {
    if (input.controlPlane) await input.controlPlane.fail(input.lease, { code: "TRANSFER_BATCH_RETRYABLE", message: "Transfer batch contains retryable items", class: "retryable", operatorReviewRequired: true });
    return { deferred: true, output: { transferred, retryable, counts } };
  }
  if ((counts.conflict ?? 0) > 0 || (counts.permanent_error ?? 0) > 0) {
    if (input.controlPlane) await input.controlPlane.fail(input.lease, { code: "TRANSFER_REVIEW_REQUIRED", message: "Transfer has unresolved item conflicts or permanent errors", class: "retryable", operatorReviewRequired: true });
    return { deferred: true, output: { transferred, retryable, counts } };
  }
  return { output: { transferred, retryable, counts }, resultRef: `tenant-transfer:${input.jobId}` };
}

export function registerTenantDataTransferExecutor(): {
  jobType: string;
  executionClass: "long";
  contractVersions: ReadonlySet<string>;
} {
  return { jobType: "tenant_data_transfer", executionClass: "long", contractVersions: new Set([TRANSFER_CONTRACT_VERSION]) };
}

export const TENANT_TRANSFER_LIMITS = Object.freeze({ maxSelections: MAX_SELECTIONS, maxSelectionIds: MAX_SELECTION_IDS, maxPreviewItems: MAX_PREVIEW_ITEMS, maxPageSize: MAX_PAGE_SIZE, maxBatchSize: MAX_BATCH_SIZE, previewTtlMs: PREVIEW_TTL_MS, operationDeadlineMs: OPERATION_DEADLINE_MS });
