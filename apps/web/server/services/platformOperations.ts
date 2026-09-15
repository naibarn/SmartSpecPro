import { createHash, createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";

import { getDb } from "../db";
import {
  dataPromotionBatches,
  dataPromotions,
  platformActionKeys,
  platformGateResults,
  platformOperationOutbox,
  platformReleaseControls,
} from "../../drizzle/schema";
import { ENV } from "../_core/env";

export const PLATFORM_LIFECYCLES = [
  "preparing", "blocked", "ready_for_cutover", "activating", "active", "separated", "rollback_required", "retired",
] as const;
export type PlatformLifecycle = (typeof PLATFORM_LIFECYCLES)[number];
export type PlatformAction = "prepare" | "validate" | "requestMaintenance" | "activate" | "cancelActivation" | "requestRollback" | "separateSync" | "reconcileActivation";
export type PlatformGateStatus = "passed" | "ready" | "failed" | "blocked" | "unknown" | "unavailable";

export const REQUIRED_PLATFORM_GATES = [
  "source_inventory", "schema_migrations", "promotion_validation", "backup_restore",
  "hyperdrive_connectivity", "feature_186_recovery", "synthetic_target", "legacy_call_audit",
  "feature_187_cutover_candidate", "feature_189_tenant_auth",
] as const;

export type PlatformActor = { actorId: number; authorizationScope: string; correlationId?: string };
export type PlatformActionRequest = PlatformActor & {
  environment: string;
  scope: string;
  action: PlatformAction;
  actionKey: string;
  expectedControlVersion: number;
  reason: string;
  targetIdentity?: string;
  releaseIdentity?: string;
  promotionId?: string;
  manifestVersion?: string;
};

export class PlatformOperationError extends Error {
  constructor(public readonly code: string, message = code) {
    super(message);
    this.name = "PlatformOperationError";
  }
}

export function isLegalPlatformTransition(from: string, to: string): boolean {
  const edges = new Set([
    "preparing->blocked", "preparing->ready_for_cutover", "blocked->preparing",
    "ready_for_cutover->activating", "activating->active", "activating->rollback_required",
    "active->separated", "active->rollback_required", "rollback_required->active", "rollback_required->retired",
  ]);
  return edges.has(`${from}->${to}`);
}

function bounded(value: unknown, field: string, max: number): string {
  const result = String(value ?? "").trim();
  if (!result || result.length > max) throw new PlatformOperationError("INVALID_INPUT", `${field} is invalid`);
  return result;
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function cursorSecret(): Buffer {
  if (!ENV.cookieSecret && ENV.isProduction) {
    throw new PlatformOperationError("CURSOR_SECRET_UNAVAILABLE", "Cursor signing secret is unavailable");
  }
  return Buffer.from(ENV.cookieSecret || "feature-188-local-cursor-secret", "utf8");
}

function encodeCursor(value: { createdAt: string; id: string }): string {
  const body = Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  const signature = createHmac("sha256", cursorSecret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function decodeCursor(value: string | null | undefined): { createdAt: string; id: string } | null {
  if (!value) return null;
  const [body, signature] = value.split(".");
  if (!body || !signature) throw new PlatformOperationError("INVALID_CURSOR", "Cursor is invalid");
  const expected = createHmac("sha256", cursorSecret()).update(body).digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new PlatformOperationError("INVALID_CURSOR", "Cursor is invalid");
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { createdAt?: string; id?: string };
    if (!parsed.createdAt || !parsed.id) throw new Error("missing cursor fields");
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    throw new PlatformOperationError("INVALID_CURSOR", "Cursor is invalid");
  }
}

function controlDefaults(input: { environment: string; scope: string; targetIdentity?: string }) {
  const sourceIdentity = process.env.FEATURE_188_SOURCE_IDENTITY?.trim() || "dev-server";
  const targetIdentity = input.targetIdentity?.trim() || process.env.FEATURE_188_TARGET_IDENTITY?.trim() || "production-postgres";
  if (sourceIdentity === targetIdentity) throw new PlatformOperationError("IDENTITY_MISMATCH", "Source and target identities must differ");
  return {
    environment: input.environment,
    scope: input.scope,
    platform: process.env.FEATURE_188_PLATFORM?.trim() || "cloudflare",
    sourceIdentity,
    targetIdentity,
    schemaVersion: process.env.FEATURE_188_SCHEMA_VERSION?.trim() || "feature-188-v1",
    adapterContractVersion: process.env.FEATURE_188_ADAPTER_CONTRACT_VERSION?.trim() || "feature-186-v1",
  };
}

type GateIdentity = {
  releaseIdentity?: string | null;
  targetIdentity?: string | null;
  promotionId?: string | null;
};

const DEFAULT_GATE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function latestGateRows(
  rows: Array<typeof platformGateResults.$inferSelect>,
  now = new Date(),
  expected?: GateIdentity,
) {
  const latest = new Map<string, typeof platformGateResults.$inferSelect>();
  for (const row of rows) {
    const current = latest.get(row.gateKey);
    if (!current || row.evaluatedAt.getTime() > current.evaluatedAt.getTime() || (row.evaluatedAt.getTime() === current.evaluatedAt.getTime() && row.id > current.id)) {
      latest.set(row.gateKey, row);
    }
  }
  const maxAgeMs = Number(process.env.FEATURE_188_GATE_MAX_AGE_MS ?? DEFAULT_GATE_MAX_AGE_MS);
  const gateMaxAgeMs = Number.isFinite(maxAgeMs) && maxAgeMs > 0 ? maxAgeMs : DEFAULT_GATE_MAX_AGE_MS;
  return REQUIRED_PLATFORM_GATES.map(gateKey => {
    const row = latest.get(gateKey);
    const expired = Boolean(row?.expiresAt && row.expiresAt.getTime() <= now.getTime());
    const stale = Boolean(row && now.getTime() - row.evaluatedAt.getTime() > gateMaxAgeMs);
    const identityMismatch = Boolean(row && expected && (
      (expected.releaseIdentity != null && row.releaseIdentity !== expected.releaseIdentity)
      || (expected.targetIdentity != null && row.targetIdentity !== expected.targetIdentity)
      || (expected.promotionId != null && row.promotionId !== expected.promotionId)
    ));
    const status = !row ? "unknown" : expired ? "expired" : stale ? "stale" : identityMismatch ? "mismatched" : row.status;
    return {
      gateKey,
      status,
      passed: status === "passed" || status === "ready",
      safeReason: !row ? "No durable gate evidence has been recorded" : identityMismatch ? "Gate evidence does not match the selected release, target, or promotion" : stale ? "Gate evidence is older than the configured freshness window" : row.safeReason ?? "Gate evidence has no safe reason",
      evidenceRef: row?.evidenceRef ?? null,
      source: row?.source ?? "unavailable",
      evaluatedAt: row?.evaluatedAt?.toISOString() ?? null,
      expiresAt: row?.expiresAt?.toISOString() ?? null,
      releaseIdentity: row?.releaseIdentity ?? null,
      targetIdentity: row?.targetIdentity ?? null,
      promotionId: row?.promotionId ?? null,
    };
  });
}

function gatesReady(gates: ReturnType<typeof latestGateRows>): boolean {
  return gates.length === REQUIRED_PLATFORM_GATES.length && gates.every(gate => gate.passed);
}

async function readGateRows(database: any, environment: string) {
  return database.select().from(platformGateResults)
    .where(eq(platformGateResults.environment, environment))
    .orderBy(desc(platformGateResults.evaluatedAt)).limit(500);
}

async function getControl(database: any, environment: string, scope: string, forUpdate = false) {
  const query = database.select().from(platformReleaseControls)
    .where(and(eq(platformReleaseControls.environment, environment), eq(platformReleaseControls.scope, scope)));
  const rows = forUpdate ? await query.for("update").limit(1) : await query.limit(1);
  const [control] = rows;
  return control ?? null;
}

export async function getOverview(input: { environment: string; scope: string }) {
  const environment = bounded(input.environment, "environment", 24);
  const scope = bounded(input.scope, "scope", 120);
  const database = await getDb();
  if (!database) throw new PlatformOperationError("DATABASE_UNAVAILABLE");
  const control = await getControl(database, environment, scope);
  const promotion = await database.select().from(dataPromotions)
    .where(control?.promotionId
      ? and(eq(dataPromotions.id, control.promotionId), eq(dataPromotions.environment, environment))
      : control
        ? and(eq(dataPromotions.environment, environment), eq(dataPromotions.controlId, control.id))
        : eq(dataPromotions.environment, environment))
    .orderBy(desc(dataPromotions.updatedAt)).limit(1).then(rows => rows[0] ?? null);
  const gates = latestGateRows(await readGateRows(database, environment), new Date(), control ? {
    targetIdentity: control.targetIdentity,
    releaseIdentity: control.sourceReleaseSha,
    promotionId: control.promotionId,
  } : undefined);
  const controlGatesReady = Boolean(control?.sourceReleaseSha && control.promotionId) && gatesReady(gates);
  return {
    environment, scope,
    control: control ? {
      id: control.id, platform: control.platform, lifecycle: control.lifecycle,
      sourceIdentity: control.sourceIdentity, targetIdentity: control.targetIdentity,
      promotionId: control.promotionId,
      schemaVersion: control.schemaVersion, adapterContractVersion: control.adapterContractVersion,
      controlVersion: control.fencingVersion, separationState: control.separationState,
      maintenanceWindowAt: control.maintenanceWindowAt?.toISOString() ?? null,
      updatedAt: control.updatedAt.toISOString(),
    } : null,
    gates,
    gatesReady: controlGatesReady,
    promotion: promotion ? { id: promotion.id, phase: promotion.phase, validationState: promotion.validationState, lagMs: promotion.lagMs, updatedAt: promotion.updatedAt.toISOString() } : null,
    productionReady: Boolean(controlGatesReady && (control?.lifecycle === "active" || control?.lifecycle === "separated")),
  };
}

export async function listGates(input: { environment: string; cursor?: string | null; limit?: number }) {
  const environment = bounded(input.environment, "environment", 24);
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const cursor = decodeCursor(input.cursor);
  const database = await getDb();
  if (!database) throw new PlatformOperationError("DATABASE_UNAVAILABLE");
  const rows = (await readGateRows(database, environment)).filter((row: any) => !cursor || row.evaluatedAt < new Date(cursor.createdAt) || (row.evaluatedAt.getTime() === new Date(cursor.createdAt).getTime() && row.id < cursor.id));
  const result = rows.slice(0, limit).map(row => ({ ...row, evaluatedAt: row.evaluatedAt.toISOString(), expiresAt: row.expiresAt?.toISOString() ?? null }));
  return { items: result, nextCursor: rows.length > limit ? encodeCursor({ createdAt: result[result.length - 1].evaluatedAt, id: result[result.length - 1].id }) : null, required: REQUIRED_PLATFORM_GATES };
}

export async function getPromotion(input: { environment: string; promotionId: string }) {
  const environment = bounded(input.environment, "environment", 24);
  const promotionId = bounded(input.promotionId, "promotionId", 36);
  const database = await getDb();
  if (!database) throw new PlatformOperationError("DATABASE_UNAVAILABLE");
  const [promotion] = await database.select().from(dataPromotions).where(and(eq(dataPromotions.id, promotionId), eq(dataPromotions.environment, environment))).limit(1);
  if (!promotion) throw new PlatformOperationError("PROMOTION_NOT_FOUND");
  const [batchSummary] = await database.select({ count: sql<number>`count(*)` }).from(dataPromotionBatches).where(eq(dataPromotionBatches.promotionId, promotion.id));
  return { ...promotion, batchCount: Number(batchSummary?.count ?? 0), createdAt: promotion.createdAt.toISOString(), updatedAt: promotion.updatedAt.toISOString() };
}

export async function listPromotionBatches(input: { promotionId: string; cursor?: string | null; limit?: number }) {
  const promotionId = bounded(input.promotionId, "promotionId", 36);
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const cursor = decodeCursor(input.cursor);
  const database = await getDb();
  if (!database) throw new PlatformOperationError("DATABASE_UNAVAILABLE");
  const rows = (await database.select().from(dataPromotionBatches).where(eq(dataPromotionBatches.promotionId, promotionId)).orderBy(desc(dataPromotionBatches.createdAt), desc(dataPromotionBatches.id)).limit(limit + 1)).filter((row: any) => !cursor || row.createdAt < new Date(cursor.createdAt) || (row.createdAt.getTime() === new Date(cursor.createdAt).getTime() && row.id < cursor.id));
  const items = rows.slice(0, limit).map((row: any) => ({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }));
  return { items, nextCursor: rows.length > limit ? encodeCursor({ createdAt: items[items.length - 1].createdAt, id: items[items.length - 1].id }) : null };
}

export async function listEvidence(input: { environment: string; cursor?: string | null; limit?: number; category?: string }) {
  const environment = bounded(input.environment, "environment", 24);
  const category = input.category?.trim();
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const cursor = decodeCursor(input.cursor);
  const database = await getDb();
  if (!database) throw new PlatformOperationError("DATABASE_UNAVAILABLE");
  const gates = (await readGateRows(database, environment)).filter((row: any) => (!category || row.gateKey.includes(category) || row.source.includes(category)) && (!cursor || row.evaluatedAt < new Date(cursor.createdAt) || (row.evaluatedAt.getTime() === new Date(cursor.createdAt).getTime() && row.id < cursor.id)));
  const items = gates.slice(0, limit).map((row: any) => ({ category: "gate", key: row.gateKey, status: row.status, evidenceRef: row.evidenceRef, safeReason: row.safeReason, source: row.source, createdAt: row.evaluatedAt.toISOString(), id: row.id }));
  return { items, nextCursor: gates.length > limit && items.length > 0 ? encodeCursor({ createdAt: items[items.length - 1].createdAt, id: items[items.length - 1].id }) : null };
}

/**
 * Record one immutable gate observation. Deployment/rehearsal runners use this
 * narrow port; no route is allowed to mark a gate passed by copying secrets or
 * invoking a provider. A later observation supersedes an older one only in the
 * read model, while every row remains audit evidence.
 */
export async function recordPlatformGate(input: PlatformActor & {
  environment: string;
  gateKey: string;
  status: PlatformGateStatus;
  safeReason: string;
  source: string;
  evidenceRef?: string;
  releaseIdentity?: string;
  targetIdentity?: string;
  promotionId?: string;
  expiresAt?: Date;
}) {
  const environment = bounded(input.environment, "environment", 24);
  const gateKey = bounded(input.gateKey, "gateKey", 120);
  const safeReason = bounded(input.safeReason, "safeReason", 1000);
  const source = bounded(input.source, "source", 80);
  const evidenceRef = input.evidenceRef ? bounded(input.evidenceRef, "evidenceRef", 512) : null;
  if (!REQUIRED_PLATFORM_GATES.includes(gateKey as (typeof REQUIRED_PLATFORM_GATES)[number])) throw new PlatformOperationError("UNKNOWN_GATE");
  if (input.status === "passed" || input.status === "ready") {
    if (!evidenceRef || !input.targetIdentity || !input.releaseIdentity) throw new PlatformOperationError("GATE_EVIDENCE_INCOMPLETE");
  }
  const database = await getDb();
  if (!database) throw new PlatformOperationError("DATABASE_UNAVAILABLE");
  const [row] = await database.insert(platformGateResults).values({
    id: randomUUID(), environment, gateKey, status: input.status,
    safeReason, source, evidenceRef, releaseIdentity: input.releaseIdentity ?? null,
    targetIdentity: input.targetIdentity ?? null, promotionId: input.promotionId ?? null,
    actorId: input.actorId, evaluatedAt: new Date(), expiresAt: input.expiresAt ?? null,
  }).returning();
  return row ?? null;
}

export type PlatformOutboxClaim = {
  id: string;
  controlId: string | null;
  environment: string;
  action: string;
  envelopeJson: Record<string, unknown>;
  fencingVersion: number;
  publisherLeaseToken: string;
  publisherLeaseExpiresAt: string;
};

function publisherTokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Claim one platform operation intent with a short publisher lease. */
export async function claimPlatformOperationOutbox(input: { environment: string; leaseMs?: number }): Promise<PlatformOutboxClaim | null> {
  const environment = bounded(input.environment, "environment", 24);
  const leaseMs = Math.min(Math.max(input.leaseMs ?? 30_000, 5_000), 120_000);
  const database = await getDb();
  if (!database) throw new PlatformOperationError("DATABASE_UNAVAILABLE");
  return database.transaction(async (tx: any) => {
    const now = new Date();
    const nowIso = now.toISOString();
    const [row] = await tx.select().from(platformOperationOutbox)
      .where(and(
        eq(platformOperationOutbox.environment, environment),
        sql`"acknowledgedAt" IS NULL AND "nextAttemptAt" <= ${nowIso} AND ("status" IN ('pending', 'failed') OR "publisherLeaseExpiresAt" <= ${nowIso})`,
      ))
      .orderBy(platformOperationOutbox.nextAttemptAt, platformOperationOutbox.createdAt, platformOperationOutbox.id)
      .for("update").limit(1);
    if (!row) return null;
    const publisherLeaseToken = randomUUID();
    const publisherLeaseExpiresAt = new Date(now.getTime() + leaseMs);
    const [claimed] = await tx.update(platformOperationOutbox).set({
      status: "publishing", publishAttempts: row.publishAttempts + 1,
      publisherLeaseTokenHash: publisherTokenHash(publisherLeaseToken),
      publisherLeaseExpiresAt, fencingVersion: row.fencingVersion + 1, updatedAt: now,
    }).where(and(eq(platformOperationOutbox.id, row.id), eq(platformOperationOutbox.fencingVersion, row.fencingVersion))).returning();
    if (!claimed) return null;
    return {
      id: claimed.id, controlId: claimed.controlId, environment: claimed.environment,
      action: claimed.action, envelopeJson: claimed.envelopeJson,
      fencingVersion: claimed.fencingVersion, publisherLeaseToken,
      publisherLeaseExpiresAt: claimed.publisherLeaseExpiresAt.toISOString(),
    };
  });
}

/** Settle a provider acknowledgement only when the current publisher owns the lease. */
export async function settlePlatformOperationOutbox(input: { id: string; publisherLeaseToken: string; fencingVersion: number; providerReference?: string }) {
  const id = bounded(input.id, "outboxId", 36);
  const providerReference = input.providerReference ? bounded(input.providerReference, "providerReference", 255) : null;
  const database = await getDb();
  if (!database) throw new PlatformOperationError("DATABASE_UNAVAILABLE");
  const now = new Date();
  const [row] = await database.update(platformOperationOutbox).set({
    status: "acknowledged", providerReference, acknowledgedAt: now,
    publisherLeaseTokenHash: null, publisherLeaseExpiresAt: null, safeError: null, updatedAt: now,
  }).where(and(
    eq(platformOperationOutbox.id, id), eq(platformOperationOutbox.status, "publishing"),
    eq(platformOperationOutbox.fencingVersion, input.fencingVersion),
    eq(platformOperationOutbox.publisherLeaseTokenHash, publisherTokenHash(input.publisherLeaseToken)),
  )).returning();
  if (!row) throw new PlatformOperationError("OUTBOX_LEASE_CONFLICT");
  return row;
}

/** A failed/ambiguous external publication is retained for retry or quarantine. */
export async function failPlatformOperationOutbox(input: { id: string; publisherLeaseToken: string; fencingVersion: number; reason: string; quarantine?: boolean }) {
  const id = bounded(input.id, "outboxId", 36);
  const reason = bounded(input.reason, "reason", 1000);
  const database = await getDb();
  if (!database) throw new PlatformOperationError("DATABASE_UNAVAILABLE");
  const now = new Date();
  const status = input.quarantine ? "quarantined" : "failed";
  const [row] = await database.update(platformOperationOutbox).set({
    status, safeError: reason, nextAttemptAt: new Date(now.getTime() + 30_000),
    publisherLeaseTokenHash: null, publisherLeaseExpiresAt: null, updatedAt: now,
  }).where(and(
    eq(platformOperationOutbox.id, id), eq(platformOperationOutbox.status, "publishing"),
    eq(platformOperationOutbox.fencingVersion, input.fencingVersion),
    eq(platformOperationOutbox.publisherLeaseTokenHash, publisherTokenHash(input.publisherLeaseToken)),
  )).returning();
  if (!row) throw new PlatformOperationError("OUTBOX_LEASE_CONFLICT");
  return row;
}

export async function requestAction(input: PlatformActionRequest) {
  const environment = bounded(input.environment, "environment", 24);
  const scope = bounded(input.scope, "scope", 120);
  const actionKey = bounded(input.actionKey, "actionKey", 128);
  const reason = bounded(input.reason, "reason", 500);
  if (!Number.isSafeInteger(input.actorId) || input.actorId <= 0 || !Number.isInteger(input.expectedControlVersion) || input.expectedControlVersion < 0) {
    throw new PlatformOperationError("INVALID_INPUT");
  }
  const payloadDigest = digest({ environment, scope, action: input.action, reason, targetIdentity: input.targetIdentity ?? null, releaseIdentity: input.releaseIdentity ?? null, promotionId: input.promotionId ?? null, manifestVersion: input.manifestVersion ?? null });
  const database = await getDb();
  if (!database) throw new PlatformOperationError("DATABASE_UNAVAILABLE");

  return database.transaction(async (tx: any) => {
    const [existing] = await tx.select().from(platformActionKeys).where(and(eq(platformActionKeys.environment, environment), eq(platformActionKeys.actionKey, actionKey))).limit(1);
    if (existing) {
      if (existing.payloadDigest !== payloadDigest) throw new PlatformOperationError("IDEMPOTENCY_CONFLICT");
      return existing.outcomeJson;
    }
    let control = await getControl(tx, environment, scope, true);
    if (!control) {
      const defaults = controlDefaults({ environment, scope, targetIdentity: input.targetIdentity });
      await tx.insert(platformReleaseControls).values(defaults).onConflictDoNothing();
      control = await getControl(tx, environment, scope, true);
    }
    if (!control) throw new PlatformOperationError("CONTROL_NOT_FOUND");

    const activationAction = ["validate", "activate", "reconcileActivation"].includes(input.action);
    let promotion: { id: string; environment: string; sourceIdentity: string; targetIdentity: string; controlId: string | null } | null = null;
    if (activationAction && input.promotionId) {
      const [candidate] = await tx.select({
        id: dataPromotions.id,
        environment: dataPromotions.environment,
        sourceIdentity: dataPromotions.sourceIdentity,
        targetIdentity: dataPromotions.targetIdentity,
        controlId: dataPromotions.controlId,
      }).from(dataPromotions).where(eq(dataPromotions.id, input.promotionId)).limit(1);
      promotion = candidate ?? null;
    }
    const promotionMatchesControl = Boolean(
      promotion
      && promotion.environment === environment
      && promotion.sourceIdentity === control.sourceIdentity
      && promotion.targetIdentity === control.targetIdentity
      && (!promotion.controlId || promotion.controlId === control.id),
    );
    const gateReleaseIdentity = input.releaseIdentity ?? control.sourceReleaseSha;
    const gatePromotionId = input.promotionId ?? control.promotionId;
    const actionRow = {
      id: randomUUID(), environment, actionKey, actorId: input.actorId,
      authorizationScope: input.authorizationScope, requestedControlVersion: input.expectedControlVersion,
      payloadDigest, outcomeJson: {},
    };
    await tx.insert(platformActionKeys).values(actionRow).onConflictDoNothing();
    const [winner] = await tx.select().from(platformActionKeys).where(and(eq(platformActionKeys.environment, environment), eq(platformActionKeys.actionKey, actionKey))).limit(1);
    if (!winner || winner.payloadDigest !== payloadDigest) throw new PlatformOperationError("IDEMPOTENCY_CONFLICT");

    if (control.fencingVersion !== input.expectedControlVersion) {
      const outcome = { accepted: false, action: input.action, errorCode: "CONTROL_VERSION_CONFLICT", lifecycle: control.lifecycle, controlVersion: control.fencingVersion };
      await tx.update(platformActionKeys).set({ outcomeJson: outcome }).where(eq(platformActionKeys.id, winner.id));
      return outcome;
    }

    const gates = latestGateRows(await readGateRows(tx, environment), new Date(), {
      targetIdentity: control.targetIdentity,
      releaseIdentity: gateReleaseIdentity,
      promotionId: gatePromotionId,
    });
    const current = control.lifecycle as PlatformLifecycle;
    const invalid = (errorCode: string) => ({ accepted: false, action: input.action, errorCode, lifecycle: current, controlVersion: control!.fencingVersion, gatesReady: gatesReady(gates) });
    let next: PlatformLifecycle = current;
    let accepted = true;
    let errorCode: string | undefined;
    if (input.action === "prepare") {
      if (current !== "blocked" && current !== "preparing") { accepted = false; errorCode = "ILLEGAL_LIFECYCLE"; } else next = "preparing";
    } else if (input.action === "validate") {
      if (current !== "preparing" && current !== "blocked") { accepted = false; errorCode = "ILLEGAL_LIFECYCLE"; }
      else if (!input.targetIdentity || input.targetIdentity !== control.targetIdentity) { accepted = false; errorCode = "TARGET_IDENTITY_MISMATCH"; }
      else if (!input.releaseIdentity) { accepted = false; errorCode = "RELEASE_IDENTITY_REQUIRED"; }
      else if (!input.promotionId) { accepted = false; errorCode = "PROMOTION_ID_REQUIRED"; }
      else if (!promotionMatchesControl) { accepted = false; errorCode = "PROMOTION_IDENTITY_MISMATCH"; }
      else next = gatesReady(gates) ? "ready_for_cutover" : "blocked";
    } else if (input.action === "activate") {
      if (current !== "ready_for_cutover") { accepted = false; errorCode = "ILLEGAL_LIFECYCLE"; }
      else if (!input.targetIdentity || input.targetIdentity !== control.targetIdentity) { accepted = false; errorCode = "TARGET_IDENTITY_MISMATCH"; }
      else if (!input.releaseIdentity) { accepted = false; errorCode = "RELEASE_IDENTITY_REQUIRED"; }
      else if (!input.promotionId) { accepted = false; errorCode = "PROMOTION_ID_REQUIRED"; }
      else if (!promotionMatchesControl) { accepted = false; errorCode = "PROMOTION_IDENTITY_MISMATCH"; }
      else if (!gatesReady(gates)) { accepted = false; errorCode = "REQUIRED_GATE_BLOCKED"; next = "blocked"; }
      else next = "activating";
    } else if (input.action === "reconcileActivation") {
      if (current !== "activating") { accepted = false; errorCode = "ILLEGAL_LIFECYCLE"; }
      else if (!input.targetIdentity || input.targetIdentity !== control.targetIdentity) { accepted = false; errorCode = "TARGET_IDENTITY_MISMATCH"; }
      else if (!input.releaseIdentity) { accepted = false; errorCode = "RELEASE_IDENTITY_REQUIRED"; }
      else if (!input.promotionId) { accepted = false; errorCode = "PROMOTION_ID_REQUIRED"; }
      else if (control.sourceReleaseSha !== input.releaseIdentity) { accepted = false; errorCode = "RELEASE_IDENTITY_MISMATCH"; }
      else if (!promotionMatchesControl || control.promotionId !== input.promotionId) { accepted = false; errorCode = "PROMOTION_IDENTITY_MISMATCH"; }
      else if (!gatesReady(gates)) { accepted = false; errorCode = "ACTIVATION_EVIDENCE_INCOMPLETE"; }
      else next = "active";
    } else if (input.action === "cancelActivation") {
      if (current !== "activating") { accepted = false; errorCode = "ILLEGAL_LIFECYCLE"; }
      else next = "ready_for_cutover";
    } else if (input.action === "requestRollback") {
      if (current !== "active" && current !== "activating") { accepted = false; errorCode = "ILLEGAL_LIFECYCLE"; }
      else next = "rollback_required";
    } else if (input.action === "separateSync") {
      if (current !== "active") { accepted = false; errorCode = "ILLEGAL_LIFECYCLE"; }
      else next = "separated";
    } else if (input.action === "requestMaintenance") {
      if (current !== "preparing" && current !== "ready_for_cutover" && current !== "activating") { accepted = false; errorCode = "ILLEGAL_LIFECYCLE"; }
    }
    if (!accepted) {
      const outcome = invalid(errorCode ?? "ACTION_REJECTED");
      await tx.update(platformActionKeys).set({ outcomeJson: outcome }).where(eq(platformActionKeys.id, winner.id));
      return outcome;
    }

    const now = new Date();
    const controlValues: Record<string, unknown> = { lifecycle: next, fencingVersion: control.fencingVersion + 1, updatedAt: now };
    if (input.action === "requestMaintenance") controlValues.maintenanceWindowAt = now;
    if (input.action === "activate") {
      controlValues.activationRequestedAt = now;
      controlValues.sourceReleaseSha = input.releaseIdentity;
      controlValues.promotionId = input.promotionId;
    }
    if (input.action === "reconcileActivation") controlValues.activatedAt = now;
    if (input.action === "requestRollback") controlValues.rollbackAt = now;
    if (input.action === "separateSync") controlValues.separationState = "separated";
    const [updatedControl] = await tx.update(platformReleaseControls).set(controlValues).where(and(eq(platformReleaseControls.id, control.id), eq(platformReleaseControls.fencingVersion, input.expectedControlVersion))).returning({ id: platformReleaseControls.id });
    if (!updatedControl) {
      const outcome = { accepted: false, action: input.action, errorCode: "CONTROL_VERSION_CONFLICT", lifecycle: current, controlVersion: control.fencingVersion, gatesReady: gatesReady(gates) };
      await tx.update(platformActionKeys).set({ outcomeJson: outcome }).where(eq(platformActionKeys.id, winner.id));
      return outcome;
    }

    let outboxId: string | null = null;
    if (["activate", "cancelActivation", "requestRollback", "separateSync"].includes(input.action)) {
      outboxId = randomUUID();
      await tx.insert(platformOperationOutbox).values({
        id: outboxId, controlId: control.id, environment, action: input.action,
        dedupeKey: `platform:${environment}:${scope}:${actionKey}`,
        envelopeJson: { environment, scope, action: input.action, controlVersion: input.expectedControlVersion + 1, targetIdentity: control.targetIdentity, releaseIdentity: input.releaseIdentity ?? null, promotionId: input.promotionId ?? null },
      }).onConflictDoNothing();
    }
    const outcome = { accepted: true, action: input.action, lifecycle: next, controlVersion: input.expectedControlVersion + 1, outboxId, gatesReady: gatesReady(gates), evidenceRequired: true };
    await tx.update(platformActionKeys).set({ outcomeJson: outcome, effectiveAt: now }).where(eq(platformActionKeys.id, winner.id));
    return outcome;
  });
}

export async function reconcileActivation(input: { environment: string; scope: string; actionKey: string; expectedControlVersion: number; reason: string } & PlatformActor) {
  return requestAction({ ...input, action: "reconcileActivation" });
}
