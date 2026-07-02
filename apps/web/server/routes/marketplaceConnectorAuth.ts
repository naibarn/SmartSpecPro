import express, { type Express } from "express";
import { z } from "zod";
import { authorizeRequest } from "../_core/authz";
import type { TenantRequest } from "../_core/tenant";
import {
  completeConnectorAuthorization,
  ConnectorGrantError,
  type ConnectorGrantTenantContext,
  getConnectorGrantStatus,
  issueConnectorWriteBackToken,
  listConnectorGrantEvents,
  refreshActiveConnectorGrantTtl,
  revokeConnectorGrant,
  startConnectorAuthorization,
  verifyConnectorWriteBackToken,
} from "../services/marketplaceConnectorGrantService";
import { marketplaceConnectorProviderSchema } from "../../shared/marketplaceIntelligence";
import {
  fetchShopeeSearchProbe,
  getShopeeLiveConnectorReadiness,
  ShopeeLiveConnectorError,
} from "../services/marketplaceShopeeLiveConnector";
import { getMarketplaceConnectorTenantRuntimeConfig } from "../services/marketplaceConnectorTenantConfigService";
import { saveOpenAiHostedShopeeSearchSnapshot } from "../services/marketplaceOpenAiShopeeWritebackService";

const authorizeStartSchema = z.object({
  provider: z.literal("shopee").default("shopee"),
});

const authorizeCompleteSchema = z.object({
  provider: z.literal("shopee").default("shopee"),
  authorizationAttemptId: z.string().min(1).max(128).nullish(),
  tenantId: z.string().min(1).max(128).optional(),
});

const probeSchema = z.object({
  keyword: z.string().trim().min(1).max(120).default("CGM"),
  region: z.string().trim().min(2).max(10).default("TH"),
  locale: z.string().trim().min(2).max(20).default("th-TH"),
  limit: z.coerce.number().int().min(1).max(25).default(10),
  sourceMode: z.enum(["live", "recorded_sample"]).default("live"),
});

const DEFAULT_SHOPEE_CONNECTOR_AUTHORIZE_URL =
  "/marketplace-capture/intelligence/connect/authorize?provider=shopee";

function resolveShopeeAuthorizeUrl(): string {
  const configured = (process.env.MARKETPLACE_SHOPEE_CONNECTOR_AUTHORIZE_URL || "").trim();
  const url = configured || DEFAULT_SHOPEE_CONNECTOR_AUTHORIZE_URL;
  if (url.startsWith("/")) return url;
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") {
    throw new Error("Shopee connector authorization URL must use HTTPS.");
  }
  return parsed.toString();
}

function sendConnectorError(res: express.Response, status: number, code: string, message: string) {
  res.status(status).json({
    error: {
      code,
      message,
      type: status >= 500 ? "server_error" : "invalid_request_error",
    },
  });
}

function requestOrigin(req: express.Request): string {
  const forwardedProto = singleQueryValue(req.headers["x-forwarded-proto"]);
  const proto = forwardedProto || req.protocol || "https";
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").trim();
  return host ? `${proto}://${host}` : "";
}

function bearerTokenFromRequest(req: express.Request): string | null {
  const header = String(req.headers.authorization || "").trim();
  if (header.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  return null;
}

function singleQueryValue(value: unknown): string | null {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0].trim() || null : null;
  return typeof value === "string" ? value.trim() || null : null;
}

function requestTenantContext(req: express.Request): ConnectorGrantTenantContext {
  const tenantReq = req as TenantRequest;
  const bodyTenantId = typeof req.body?.tenantId === "string" ? req.body.tenantId.trim() : "";
  return {
    requestTenantId: tenantReq.tenantId ?? tenantReq.tenant?.id ?? null,
    explicitTenantId: singleQueryValue(req.query.tenantId) || singleQueryValue(req.query.workspaceId) || bodyTenantId || null,
  };
}

async function requireSessionAuth(req: express.Request, res: express.Response) {
  const auth = await authorizeRequest(req, { allowBearer: false, allowSession: true });
  if (!auth.ok || auth.mode !== "session") {
    sendConnectorError(res, 401, "unauthorized", "Please log in before authorizing the Shopee connector.");
    return null;
  }
  return auth;
}

async function requireWriteBackAuth(req: express.Request, res: express.Response) {
  const bearerToken = bearerTokenFromRequest(req);
  if (bearerToken?.startsWith("mci_wb_")) {
    const verified = await verifyConnectorWriteBackToken(bearerToken);
    return {
      auth: verified.auth,
      context: verified.context,
      tokenMode: true,
    };
  }
  const auth = await requireSessionAuth(req, res);
  if (!auth) return null;
  return {
    auth,
    context: requestTenantContext(req),
    tokenMode: false,
  };
}

function handleConnectorRouteError(error: unknown, res: express.Response) {
  if (error instanceof ConnectorGrantError) {
    sendConnectorError(res, error.statusCode, error.code, error.message);
    return;
  }
  if (error instanceof ShopeeLiveConnectorError) {
    sendConnectorError(res, error.statusCode, error.code, error.message);
    return;
  }
  const statusCode = Number((error as { statusCode?: unknown })?.statusCode);
  const code = typeof (error as { code?: unknown })?.code === "string"
    ? (error as { code: string }).code
    : "";
  if (Number.isInteger(statusCode) && statusCode >= 400 && statusCode < 600 && code) {
    sendConnectorError(res, statusCode, code, error instanceof Error ? error.message : "Marketplace connector request failed.");
    return;
  }
  const message = error instanceof Error ? error.message : "Marketplace connector request failed.";
  sendConnectorError(res, 500, "marketplace_connector_request_failed", message);
}

export function createMarketplaceConnectorAuthRouter() {
  const router = express.Router();

  router.get("/:provider/status", async (req, res) => {
    try {
      const provider = marketplaceConnectorProviderSchema.parse(req.params.provider);
      const auth = await requireSessionAuth(req, res);
      if (!auth) return;
      const context = requestTenantContext(req);
      const status = await getConnectorGrantStatus(auth, provider, context);
      const tenantId = context.requestTenantId ?? context.explicitTenantId ?? auth.tenantId ?? null;
      if (provider === "shopee" && status.status === "active" && tenantId) {
        const config = await getMarketplaceConnectorTenantRuntimeConfig(tenantId);
        res.json(await refreshActiveConnectorGrantTtl({
          auth,
          provider,
          context,
          activeGrantTtlDays: config.activeGrantTtlDays,
        }));
        return;
      }
      res.json(status);
    } catch (error) {
      handleConnectorRouteError(error, res);
    }
  });

  router.get("/shopee/readiness", async (req, res) => {
    try {
      const auth = await requireSessionAuth(req, res);
      if (!auth) return;
      const context = requestTenantContext(req);
      const tenantId = context.requestTenantId ?? context.explicitTenantId ?? auth.tenantId ?? null;
      if (!tenantId) {
        sendConnectorError(res, 400, "tenant_required", "Could not resolve tenant connector configuration.");
        return;
      }
      const grant = await getConnectorGrantStatus(auth, "shopee", context);
      const config = await getMarketplaceConnectorTenantRuntimeConfig(tenantId);
      const bridge = getShopeeLiveConnectorReadiness(config);
      res.json({
        provider: "shopee",
        ready: grant.status === "active" && bridge.ready,
        grant,
        bridge,
        checks: {
          grantActive: grant.status === "active",
          bridgeConfigured: bridge.configured,
          liveProbeRequired: true,
        },
        blockingReason: grant.status !== "active"
          ? "Shopee connector grant is not active."
          : bridge.blockingReason,
      });
    } catch (error) {
      handleConnectorRouteError(error, res);
    }
  });

  router.post("/shopee/authorize/start", express.json({ limit: "8kb" }), async (req, res) => {
    try {
      authorizeStartSchema.parse({ provider: "shopee", ...req.body });
      const auth = await requireSessionAuth(req, res);
      if (!auth) return;
      res.json(await startConnectorAuthorization({
        auth,
        provider: "shopee",
        authorizationUrl: resolveShopeeAuthorizeUrl(),
        context: requestTenantContext(req),
      }));
    } catch (error) {
      handleConnectorRouteError(error, res);
    }
  });

  router.post("/shopee/authorize/complete", express.json({ limit: "8kb" }), async (req, res) => {
    try {
      const input = authorizeCompleteSchema.parse({ provider: "shopee", ...req.body });
      const auth = await requireSessionAuth(req, res);
      if (!auth) return;
      const context = requestTenantContext(req);
      const tenantId = context.requestTenantId ?? context.explicitTenantId ?? auth.tenantId ?? "";
      const config = tenantId
        ? await getMarketplaceConnectorTenantRuntimeConfig(tenantId)
        : { activeGrantTtlDays: 90 };
      res.json(await completeConnectorAuthorization({
        auth,
        provider: "shopee",
        authorizationAttemptId: input.authorizationAttemptId ?? null,
        context,
        activeGrantTtlDays: config.activeGrantTtlDays,
      }));
    } catch (error) {
      handleConnectorRouteError(error, res);
    }
  });

  router.post("/shopee/revoke", express.json({ limit: "8kb" }), async (req, res) => {
    try {
      const auth = await requireSessionAuth(req, res);
      if (!auth) return;
      res.json(await revokeConnectorGrant(auth, "shopee", requestTenantContext(req)));
    } catch (error) {
      handleConnectorRouteError(error, res);
    }
  });

  router.post("/shopee/writeback/token", express.json({ limit: "8kb" }), async (req, res) => {
    try {
      const auth = await requireSessionAuth(req, res);
      if (!auth) return;
      const issued = await issueConnectorWriteBackToken({
        auth,
        provider: "shopee",
        context: requestTenantContext(req),
      });
      const origin = requestOrigin(req);
      const endpointPath = "/api/marketplace-connectors/shopee/writeback/search-snapshot";
      const endpointUrl = origin ? `${origin}${endpointPath}` : endpointPath;
      res.json({
        ok: true,
        provider: "shopee",
        endpointUrl,
        method: "POST",
        tokenType: issued.tokenType,
        writeBackToken: issued.token,
        expiresAt: issued.expiresAt,
        scopes: issued.scopes,
        grantHashPrefix: issued.grantHashPrefix,
        headers: {
          authorization: `Bearer ${issued.token}`,
          "content-type": "application/json",
        },
        payloadSchema: {
          required: ["platform", "sourceProvider", "keyword", "items"],
          platform: "shopee",
          sourceProvider: "openai_hosted_shopee_mcp",
          itemRequiredFields: ["rank", "title", "itemid", "shopid"],
          usefulFields: [
            "image",
            "images",
            "price",
            "originalPrice",
            "discount",
            "monthlySoldCount",
            "historicalSoldCount",
            "ratingScore",
            "reviewCount",
            "shopName",
            "brandName",
            "catid",
            "shopeeVerified",
            "matchedKeywords",
            "estimatedDeliveryTimeText",
          ],
        },
        instructions: [
          "Use the connected Shopee app in the upstream host to search the requested keyword.",
          "Send the real returned search result items to endpointUrl with the Bearer token.",
          "Do not send marketplace passwords, cookies, or unrelated personal data.",
        ],
        prompt: [
          "Search Shopee for the target keyword using the connected Shopee app.",
          "Return the marketplace result items as JSON and POST them to SmartSpecPro.",
          `POST ${endpointUrl}`,
          `Authorization: Bearer ${issued.token}`,
          "Content-Type: application/json",
          "Body shape: { platform: 'shopee', sourceProvider: 'openai_hosted_shopee_mcp', keyword, region, locale, sourceMetadata, items }.",
          "Include useful fields when available: title/name, image/images, itemid, shopid, catid, price, original_price, discount, monthly/historical sold count, rating/review, shop/seller, brand/category, rank/search signals, logistics, and raw diagnostics.",
        ].join("\n"),
      });
    } catch (error) {
      handleConnectorRouteError(error, res);
    }
  });

  router.post("/shopee/probe", express.json({ limit: "8kb" }), async (req, res) => {
    try {
      const input = probeSchema.parse(req.body || {});
      const auth = await requireSessionAuth(req, res);
      if (!auth) return;
      const context = requestTenantContext(req);
      const grant = await getConnectorGrantStatus(auth, "shopee", context);
      const allowRecordedFallback = input.sourceMode === "recorded_sample";
      if (grant.status !== "active" && !allowRecordedFallback) {
        sendConnectorError(res, 403, "connector_grant_not_active", "Please authorize the Shopee connector before running live keyword search.");
        return;
      }
      const tenantId = context.requestTenantId ?? context.explicitTenantId ?? auth.tenantId ?? null;
      if (!tenantId) {
        sendConnectorError(res, 400, "tenant_required", "Could not resolve tenant connector configuration before running live keyword search.");
        return;
      }
      const config = await getMarketplaceConnectorTenantRuntimeConfig(tenantId);
      res.json(await fetchShopeeSearchProbe({
        keyword: input.keyword,
        region: input.region,
        locale: input.locale,
        limit: input.limit,
      }, { allowRecordedFallback, config }));
    } catch (error) {
      handleConnectorRouteError(error, res);
    }
  });

  router.post("/shopee/writeback/search-snapshot", express.json({ limit: "1mb" }), async (req, res) => {
    try {
      const writeBackAuth = await requireWriteBackAuth(req, res);
      if (!writeBackAuth) return;
      const result = await saveOpenAiHostedShopeeSearchSnapshot({
        auth: writeBackAuth.auth,
        context: writeBackAuth.context,
        payload: req.body,
      });
      res.json({
        ok: true,
        authMode: writeBackAuth.tokenMode ? "writeback_token" : "session",
        sourceProvider: result.sourceProvider,
        snapshotId: result.snapshot.id,
        snapshot: result.snapshot,
        snapshotUrl: `/marketplace-capture/intelligence/snapshots/${encodeURIComponent(result.snapshot.id)}`,
        itemCount: result.itemCount,
        fieldCoveragePercent: result.fieldCoveragePercent,
        unknownFieldCount: result.unknownFieldCount,
        sourceCapturedAt: result.sourceCapturedAt,
        warnings: result.warnings,
      });
    } catch (error) {
      handleConnectorRouteError(error, res);
    }
  });

  router.get("/:provider/events", async (req, res) => {
    try {
      const provider = marketplaceConnectorProviderSchema.parse(req.params.provider);
      const auth = await requireSessionAuth(req, res);
      if (!auth) return;
      res.json({ provider, events: await listConnectorGrantEvents(auth, provider, requestTenantContext(req)) });
    } catch (error) {
      handleConnectorRouteError(error, res);
    }
  });

  return router;
}

export function registerMarketplaceConnectorAuthRoutes(app: Express) {
  app.use("/api/marketplace-connectors", createMarketplaceConnectorAuthRouter());
}
