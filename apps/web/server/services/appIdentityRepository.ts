import { and, eq, or, sql } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import { appIdentities, appRouteAliases } from "../../drizzle/schema";
import { getDb } from "../db";
import {
  resolveAppRouteAlias,
  type AppIdentity,
  type AppRouteAlias,
} from "./tenantProductIdentityContracts";

/**
 * Resolve a route alias using tenant identity established by trusted host
 * routing. Callers must not pass a tenant ID supplied by the request body.
 */
export async function resolveAppRouteForTenant(input: {
  tenantId: string;
  kind: AppRouteAlias["kind"];
  value: string;
}) {
  const value = input.value.trim().toLowerCase();
  if (!value) return null;

  const [row] = await getDb()
    .select({
      aliasId: appRouteAliases.aliasId,
      aliasTenantId: appRouteAliases.tenantId,
      aliasAppId: appRouteAliases.appId,
      kind: appRouteAliases.kind,
      value: appRouteAliases.value,
      status: appRouteAliases.status,
      appId: appIdentities.appId,
      publicAppId: appIdentities.publicAppId,
      appTenantId: appIdentities.tenantId,
      publisherId: appIdentities.publisherRef,
      lifecycle: appIdentities.lifecycle,
      canonicalProductId: appIdentities.canonicalProductId,
      policyRefs: appIdentities.policyRefs,
      createdAt: appIdentities.createdAt,
      parentAppId: appIdentities.parentAppId,
    })
    .from(appRouteAliases)
    .innerJoin(appIdentities, eq(appIdentities.appId, appRouteAliases.appId))
    .where(and(
      eq(appRouteAliases.tenantId, input.tenantId),
      eq(appRouteAliases.kind, input.kind),
      eq(appRouteAliases.value, value),
    ))
    .limit(1);

  if (!row) return null;
  const alias: AppRouteAlias = {
    aliasId: row.aliasId,
    tenantId: row.aliasTenantId,
    appId: row.aliasAppId,
    kind: row.kind as AppRouteAlias["kind"],
    value: row.value,
    status: row.status as AppRouteAlias["status"],
  };
  const app: AppIdentity = {
    appId: row.appId,
    publicAppId: row.publicAppId,
    tenantId: row.appTenantId,
    publisherId: row.publisherId,
    lifecycle: row.lifecycle as AppIdentity["lifecycle"],
    canonicalProductId: row.canonicalProductId,
    policyRefs: row.policyRefs,
    createdAt: row.createdAt.toISOString(),
    ...(row.parentAppId ? { parentAppId: row.parentAppId } : {}),
  };

  return resolveAppRouteAlias({ alias, app, tenantId: input.tenantId });
}

export async function resolveActiveAppByPublicId(input: {
  tenantId: string;
  publicAppId: string;
}) {
  const [app] = await getDb()
    .select({ appId: appIdentities.appId, publicAppId: appIdentities.publicAppId, tenantId: appIdentities.tenantId })
    .from(appIdentities)
    .where(and(
      eq(appIdentities.tenantId, input.tenantId),
      eq(appIdentities.publicAppId, input.publicAppId),
      eq(appIdentities.lifecycle, "active"),
    ))
    .limit(1);
  return app ?? null;
}

export async function createPrivateMiniAppIdentity(input: {
  tenantId: string;
  ownerUserId: number;
  idempotencyKey: string;
  preferredAppId?: string;
}) {
  if (!input.tenantId.trim() || !Number.isSafeInteger(input.ownerUserId) || input.ownerUserId <= 0) {
    throw new Error("MINI_APP_OWNER_SCOPE_INVALID");
  }
  if (!/^[A-Za-z0-9._:-]{16,160}$/.test(input.idempotencyKey)) {
    throw new Error("MINI_APP_IDEMPOTENCY_KEY_INVALID");
  }
  if (input.preferredAppId && !/^app_[A-Za-z0-9_-]{1,120}$/.test(input.preferredAppId)) {
    throw new Error("MINI_APP_ID_INVALID");
  }
  const db = getDb();
  const [existing] = await db.select({
    appId: appIdentities.appId,
    publicAppId: appIdentities.publicAppId,
    tenantId: appIdentities.tenantId,
    ownerUserId: appIdentities.ownerUserId,
    visibility: appIdentities.visibility,
    deploymentVersion: appIdentities.deploymentVersion,
    lastKnownGoodArtifactRef: appIdentities.lastKnownGoodArtifactRef,
    runtimeDataMigrationStatus: appIdentities.runtimeDataMigrationStatus,
    runtimeDataMigrationVerifiedAt: appIdentities.runtimeDataMigrationVerifiedAt,
    runtimeDataMigrationImportedCount: appIdentities.runtimeDataMigrationImportedCount,
    runtimeDataMigrationPreservedCount: appIdentities.runtimeDataMigrationPreservedCount,
    runtimeDataMigrationConfirmedAt: appIdentities.runtimeDataMigrationConfirmedAt,
    lifecycle: appIdentities.lifecycle,
  }).from(appIdentities).where(and(
    eq(appIdentities.tenantId, input.tenantId),
    eq(appIdentities.ownerUserId, input.ownerUserId),
    eq(appIdentities.creationIdempotencyKey, input.idempotencyKey),
  )).limit(1);
  if (existing) {
    if (input.preferredAppId && existing.appId !== input.preferredAppId) throw new Error("MINI_APP_IDEMPOTENCY_CONFLICT");
    return existing;
  }

  const appId = input.preferredAppId ?? `app_${createHash("sha256").update(`${input.tenantId}:${input.ownerUserId}:${input.idempotencyKey}`).digest("hex").slice(0, 32)}`;
  const publicAppId = `mini_${randomUUID().replace(/-/g, "")}`;
  const [created] = await db.insert(appIdentities).values({
    appId,
    publicAppId,
    tenantId: input.tenantId,
    ownerUserId: input.ownerUserId,
    visibility: "private",
    deploymentVersion: 0,
    lastKnownGoodArtifactRef: null,
    creationIdempotencyKey: input.idempotencyKey,
    publisherRef: `user:${input.ownerUserId}`,
    canonicalProductId: `miniapp:${appId}`,
    lifecycle: "draft",
  }).returning({
    appId: appIdentities.appId,
    publicAppId: appIdentities.publicAppId,
    tenantId: appIdentities.tenantId,
    ownerUserId: appIdentities.ownerUserId,
    visibility: appIdentities.visibility,
    deploymentVersion: appIdentities.deploymentVersion,
    lastKnownGoodArtifactRef: appIdentities.lastKnownGoodArtifactRef,
    lifecycle: appIdentities.lifecycle,
  });
  return created;
}

export async function resolveOwnedPrivateMiniAppIdentity(input: {
  appId: string;
  tenantId: string;
  ownerUserId: number;
}) {
  const [app] = await getDb().select({
    appId: appIdentities.appId,
    publicAppId: appIdentities.publicAppId,
    tenantId: appIdentities.tenantId,
    ownerUserId: appIdentities.ownerUserId,
    visibility: appIdentities.visibility,
    deploymentVersion: appIdentities.deploymentVersion,
    lastKnownGoodArtifactRef: appIdentities.lastKnownGoodArtifactRef,
    runtimeDataMigrationStatus: appIdentities.runtimeDataMigrationStatus,
    runtimeDataMigrationVerifiedAt: appIdentities.runtimeDataMigrationVerifiedAt,
    runtimeDataMigrationImportedCount: appIdentities.runtimeDataMigrationImportedCount,
    runtimeDataMigrationPreservedCount: appIdentities.runtimeDataMigrationPreservedCount,
    runtimeDataMigrationConfirmedAt: appIdentities.runtimeDataMigrationConfirmedAt,
    lifecycle: appIdentities.lifecycle,
  }).from(appIdentities).where(and(
    eq(appIdentities.appId, input.appId),
    eq(appIdentities.tenantId, input.tenantId),
    eq(appIdentities.ownerUserId, input.ownerUserId),
    eq(appIdentities.visibility, "private"),
    sql`${appIdentities.lifecycle} IN ('draft', 'active')`,
  )).limit(1);
  return app ?? null;
}

export async function recordMiniAppRuntimeMigrationVerification(input: {
  appId: string;
  tenantId: string;
  ownerUserId: number;
  imported: number;
  preserved: number;
}) {
  const [app] = await getDb().update(appIdentities).set({
    runtimeDataMigrationStatus: sql`CASE WHEN ${appIdentities.runtimeDataMigrationStatus} = 'OWNER_CONFIRMED' THEN 'OWNER_CONFIRMED' ELSE 'VERIFIED' END`,
    runtimeDataMigrationVerifiedAt: new Date(),
    runtimeDataMigrationVerifiedByUserId: input.ownerUserId,
    runtimeDataMigrationImportedCount: sql`CASE WHEN ${appIdentities.runtimeDataMigrationStatus} = 'NOT_STARTED' THEN ${input.imported} ELSE ${appIdentities.runtimeDataMigrationImportedCount} END`,
    runtimeDataMigrationPreservedCount: sql`CASE WHEN ${appIdentities.runtimeDataMigrationStatus} = 'NOT_STARTED' THEN ${input.preserved} ELSE ${appIdentities.runtimeDataMigrationPreservedCount} END`,
    updatedAt: new Date(),
  }).where(and(
    eq(appIdentities.appId, input.appId),
    eq(appIdentities.tenantId, input.tenantId),
    eq(appIdentities.ownerUserId, input.ownerUserId),
    eq(appIdentities.visibility, "private"),
    sql`${appIdentities.lifecycle} IN ('draft', 'active')`,
  )).returning({ appId: appIdentities.appId, runtimeDataMigrationStatus: appIdentities.runtimeDataMigrationStatus });
  return app ?? null;
}

export async function confirmMiniAppRuntimeMigration(input: {
  appId: string;
  tenantId: string;
  ownerUserId: number;
}) {
  const [app] = await getDb().update(appIdentities).set({
    runtimeDataMigrationStatus: "OWNER_CONFIRMED",
    runtimeDataMigrationConfirmedAt: new Date(),
    runtimeDataMigrationConfirmedByUserId: input.ownerUserId,
    updatedAt: new Date(),
  }).where(and(
    eq(appIdentities.appId, input.appId),
    eq(appIdentities.tenantId, input.tenantId),
    eq(appIdentities.ownerUserId, input.ownerUserId),
    eq(appIdentities.visibility, "private"),
    eq(appIdentities.runtimeDataMigrationStatus, "VERIFIED"),
    sql`${appIdentities.lastKnownGoodArtifactRef} IS NOT NULL`,
  )).returning({ appId: appIdentities.appId });
  return app ?? null;
}

/**
 * Private Mini Apps require both the authenticated tenant and owner principal.
 * Public Apps are intentionally readable without a tenant session.
 */
export async function resolveMiniAppForViewer(input: {
  appId: string;
  tenantId?: string | null;
  userId?: number | null;
}) {
  const predicates = [eq(appIdentities.appId, input.appId)];
  if (Number.isSafeInteger(input.userId) && input.userId! > 0 && input.tenantId?.trim()) {
    predicates.push(or(
      and(eq(appIdentities.visibility, "public"), eq(appIdentities.lifecycle, "active"))!,
      and(
        eq(appIdentities.visibility, "private"),
        eq(appIdentities.tenantId, input.tenantId),
        eq(appIdentities.ownerUserId, input.userId!),
      )!,
    )!);
  } else {
    predicates.push(and(eq(appIdentities.visibility, "public"), eq(appIdentities.lifecycle, "active"))!);
  }
  const [app] = await getDb().select({
    appId: appIdentities.appId,
    publicAppId: appIdentities.publicAppId,
    tenantId: appIdentities.tenantId,
    ownerUserId: appIdentities.ownerUserId,
    visibility: appIdentities.visibility,
    deploymentVersion: appIdentities.deploymentVersion,
    lastKnownGoodArtifactRef: appIdentities.lastKnownGoodArtifactRef,
    runtimeDataMigrationStatus: appIdentities.runtimeDataMigrationStatus,
    runtimeDataMigrationVerifiedAt: appIdentities.runtimeDataMigrationVerifiedAt,
    runtimeDataMigrationImportedCount: appIdentities.runtimeDataMigrationImportedCount,
    runtimeDataMigrationPreservedCount: appIdentities.runtimeDataMigrationPreservedCount,
    runtimeDataMigrationConfirmedAt: appIdentities.runtimeDataMigrationConfirmedAt,
    lifecycle: appIdentities.lifecycle,
  }).from(appIdentities).where(and(...predicates)).limit(1);
  if (!app || !canViewMiniApp(app, input)) return null;
  if (app.visibility !== "private" || app.ownerUserId !== input.userId) {
    return {
      ...app,
      runtimeDataMigrationStatus: null,
      runtimeDataMigrationVerifiedAt: null,
      runtimeDataMigrationImportedCount: null,
      runtimeDataMigrationPreservedCount: null,
      runtimeDataMigrationConfirmedAt: null,
    };
  }
  return app;
}

export function canViewMiniApp(
  app: { tenantId: string; ownerUserId: number | null; visibility: string; lifecycle: string },
  viewer: { tenantId?: string | null; userId?: number | null },
): boolean {
  if (app.visibility === "public") return app.lifecycle === "active";
  return app.visibility === "private"
    && app.lifecycle !== "suspended" && app.lifecycle !== "archived"
    && Boolean(viewer.tenantId?.trim()) && viewer.tenantId === app.tenantId
    && Number.isSafeInteger(viewer.userId) && viewer.userId === app.ownerUserId;
}

export async function setMiniAppVisibility(input: {
  appId: string;
  tenantId: string;
  ownerUserId: number;
  visibility: "private" | "public";
}) {
  const [updated] = await getDb().update(appIdentities).set({
    visibility: input.visibility,
    ...(input.visibility === "public" ? { lifecycle: "active" } : {}),
    updatedAt: new Date(),
  }).where(and(
    eq(appIdentities.appId, input.appId),
    eq(appIdentities.tenantId, input.tenantId),
    eq(appIdentities.ownerUserId, input.ownerUserId),
    ...(input.visibility === "public" ? [sql`${appIdentities.lastKnownGoodArtifactRef} IS NOT NULL`] : []),
  )).returning({
    appId: appIdentities.appId,
    visibility: appIdentities.visibility,
    lifecycle: appIdentities.lifecycle,
  });
  return updated ?? null;
}
