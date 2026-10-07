import { and, eq } from "drizzle-orm";
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
