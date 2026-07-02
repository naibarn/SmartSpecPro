import type { AuthResult } from "../_core/authz";
import {
  createOpenAiHostedShopeeProbe,
  openAiHostedShopeeWritebackSchema,
  type OpenAiHostedShopeeWriteback,
} from "../../shared/marketplaceOpenAiShopeeWriteback";
import {
  saveMarketplaceProbeSnapshot,
} from "./marketplaceIntelligenceService";
import type { MarketplaceIntelligenceSnapshot } from "../../shared/marketplaceIntelligence";
import {
  assertActiveConnectorGrant,
  type ConnectorGrantTenantContext,
} from "./marketplaceConnectorGrantService";

type SessionAuth = Extract<AuthResult, { ok: true; mode: "session" }>;

export type MarketplaceOpenAiShopeeWritebackResult = {
  snapshot: MarketplaceIntelligenceSnapshot;
  sourceProvider: "openai_hosted_shopee_mcp";
  itemCount: number;
  fieldCoveragePercent: number;
  unknownFieldCount: number;
  sourceCapturedAt: string | null;
  warnings: string[];
};

function resolveActor(auth: SessionAuth, context: ConnectorGrantTenantContext = {}) {
  const tenantId = String(
    context.requestTenantId
      ?? auth.tenantId
      ?? (auth.user as any)?.currentTenantId
      ?? (auth.user as any)?.tenantId
      ?? context.explicitTenantId
      ?? "",
  ).trim();
  const userId = Number(auth.userId ?? (auth.user as any)?.id);
  if (!tenantId) {
    throw Object.assign(new Error("Tenant is required for marketplace write-back ingestion."), {
      statusCode: 400,
      code: "tenant_required",
    });
  }
  if (!Number.isInteger(userId) || userId <= 0) {
    throw Object.assign(new Error("User is required for marketplace write-back ingestion."), {
      statusCode: 400,
      code: "user_required",
    });
  }
  return { tenantId, userId };
}

function sourceWarnings(input: OpenAiHostedShopeeWriteback, result: MarketplaceIntelligenceSnapshot): string[] {
  const warnings: string[] = [];
  if (!input.sourceMetadata.upstreamAppId) {
    warnings.push("upstreamAppId was not provided; provenance is still accepted but less specific.");
  }
  if (result.fieldCoveragePercent < 50) {
    warnings.push("Field coverage is below 50%; downstream reports should treat missing metrics as partial evidence.");
  }
  if (!result.items.some((item) => item.monthlySoldCount !== null || item.historicalSoldCount !== null)) {
    warnings.push("Sales fields were not available in this payload.");
  }
  return warnings;
}

export async function saveOpenAiHostedShopeeSearchSnapshot(params: {
  auth: SessionAuth;
  context?: ConnectorGrantTenantContext;
  payload: unknown;
}): Promise<MarketplaceOpenAiShopeeWritebackResult> {
  await assertActiveConnectorGrant(params.auth, "shopee", params.context);
  const actor = resolveActor(params.auth, params.context);
  const input = openAiHostedShopeeWritebackSchema.parse(params.payload);
  const probe = createOpenAiHostedShopeeProbe(input);
  const snapshot = await saveMarketplaceProbeSnapshot({ ...actor, probe });
  return {
    snapshot,
    sourceProvider: "openai_hosted_shopee_mcp",
    itemCount: snapshot.itemCount,
    fieldCoveragePercent: snapshot.fieldCoveragePercent,
    unknownFieldCount: snapshot.unknownFieldCount,
    sourceCapturedAt: snapshot.sourceCapturedAt,
    warnings: sourceWarnings(input, snapshot),
  };
}
