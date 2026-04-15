/**
 * Standalone Tool API — exposes custom agency tools as independent HTTP endpoints
 * for external automation, webhooks, n8n, etc.
 *
 * Routes:
 *   POST /api/v1/agency-tools/:toolId/execute  — Execute a tool
 *   GET  /api/v1/agency-tools/openapi.json      — Dynamic OpenAPI spec for exposed tools
 */

import { Router, type Request, type Response } from "express";
import { eq, and } from "drizzle-orm";
import Ajv from "../services/simpleJsonSchemaValidator";
import { requireScopes } from "../middleware/requireScopes";
import { sendApiError } from "../middleware/publicApiHeaders";
import { isFeatureEnabled } from "../services/tenantFeatureFlagService";
import { decrypt } from "../services/crypto";
import { getRedisClient } from "../services/redis";
import { db } from "../db";
import { agencyTools } from "../../drizzle/schema";

const ajv = new Ajv({ allErrors: true });

// Rate limit: 100 req/min per API key via Redis sliding window
const RATE_LIMIT_MAX = 100;
const RATE_LIMIT_WINDOW_SECONDS = 60;

// SSRF blocked hosts/networks — must match Python agency_tools.py
const SSRF_BLOCKED_HOSTS = new Set([
  "localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]",
  "169.254.169.254", "metadata.google.internal",
]);

function isSsrfBlocked(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return true;
    const hostname = parsed.hostname;
    if (SSRF_BLOCKED_HOSTS.has(hostname)) return true;
    // Check private IP ranges
    const parts = hostname.split(".");
    if (parts.length === 4) {
      const [a, b] = parts.map(Number);
      if (a === 10) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
      if (a === 127) return true;
      if (a === 169 && b === 254) return true;
    }
    return false;
  } catch {
    return true; // Invalid URL
  }
}

async function checkRateLimit(keyHash: string): Promise<{ allowed: boolean; remaining: number }> {
  try {
    const redis = getRedisClient();
    const key = `agency-tool-api:${keyHash}`;
    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, RATE_LIMIT_WINDOW_SECONDS);
    }
    const remaining = Math.max(0, RATE_LIMIT_MAX - current);
    return { allowed: current <= RATE_LIMIT_MAX, remaining };
  } catch (err) {
    console.warn("[agency-tool-api] Redis unavailable for rate limiting:", (err as Error).message);
    return { allowed: true, remaining: 1 };
  }
}

export function createAgencyToolsApiRouter(): Router {
  const router = Router();

  // All routes require agency:tool:execute scope
  router.use(requireScopes("agency:tool:execute"));

  // ── POST /api/v1/agency-tools/:toolId/execute ─────────────────────────
  router.post("/:toolId/execute", async (req: Request, res: Response) => {
    try {
      const auth = req.auth;
      if (!auth || auth.mode !== "api_key") {
        return sendApiError(res, 401, "invalid_api_key", "API key authentication required");
      }

      // Tenant-scoped feature flag check
      const { tenants } = await import("../../drizzle/schema");
      const [tenantRow] = await db.instance
        .select({ featureFlags: tenants.featureFlags })
        .from(tenants)
        .where(eq(tenants.id, auth.tenantId))
        .limit(1);
      const storedFlags = (tenantRow?.featureFlags as Record<string, boolean>) ?? null;
      if (!isFeatureEnabled(storedFlags, "agencyToolApi")) {
        return sendApiError(res, 403, "feature_disabled", "Agency Tool API is not enabled for this tenant");
      }

      // Rate limiting
      const { allowed, remaining } = await checkRateLimit(auth.apiKeyId);
      res.setHeader("X-RateLimit-Limit", RATE_LIMIT_MAX);
      res.setHeader("X-RateLimit-Remaining", remaining);
      if (!allowed) {
        res.setHeader("Retry-After", RATE_LIMIT_WINDOW_SECONDS);
        return sendApiError(res, 429, "rate_limit_exceeded", "Rate limit exceeded. Try again later.");
      }

      const { toolId } = req.params;
      const drizzle = db.instance;

      // Fetch tool with tenant isolation in WHERE clause
      const [tool] = await drizzle
        .select()
        .from(agencyTools)
        .where(
          and(
            eq(agencyTools.id, toolId),
            eq(agencyTools.tenantId, auth.tenantId),
            eq(agencyTools.isExposedAsApi, true),
            eq(agencyTools.isEnabled, true),
          ),
        )
        .limit(1);

      if (!tool) {
        return sendApiError(res, 404, "not_found", "Tool not found or not exposed as API");
      }

      // Validate input against tool inputSchema
      const input = req.body;
      if (tool.inputSchema) {
        const validate = ajv.compile(tool.inputSchema);
        if (!validate(input)) {
          return sendApiError(
            res,
            400,
            "validation_error",
            `Input validation failed: ${ajv.errorsText(validate.errors)}`,
          );
        }
      }

      // Execute the tool via HTTP call
      const endpointUrl = (tool.config as Record<string, unknown>)?.endpoint_url as string | undefined;
      if (!endpointUrl) {
        return sendApiError(res, 500, "tool_error", "Tool has no endpoint configured");
      }

      // SSRF validation at execution time
      if (isSsrfBlocked(endpointUrl)) {
        return sendApiError(res, 422, "ssrf_blocked", "Tool endpoint URL is blocked for security reasons");
      }

      // Prepare headers — abort if decryption fails
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (tool.headersEncrypted) {
        try {
          const decryptedHeaders = JSON.parse(decrypt(tool.headersEncrypted));
          Object.assign(headers, decryptedHeaders);
        } catch {
          return sendApiError(res, 500, "tool_error", "Failed to decrypt tool authentication headers");
        }
      }

      const method = (tool.httpMethod || "POST").toUpperCase();
      const fetchOptions: RequestInit = {
        method,
        headers,
        ...(method !== "GET" ? { body: JSON.stringify(input) } : {}),
      };

      const response = await fetch(endpointUrl, fetchOptions);
      const responseText = await response.text();

      if (!response.ok) {
        return res.status(502).json({
          error: {
            code: "tool_execution_error",
            message: `Tool returned HTTP ${response.status}`,
            type: "tool_error",
          },
        });
      }

      // Try to parse as JSON, otherwise return as text
      try {
        const jsonResult = JSON.parse(responseText);
        return res.json({ result: jsonResult });
      } catch {
        return res.json({ result: responseText.slice(0, 51200) });
      }
    } catch (err) {
      return sendApiError(res, 500, "internal_error", "Tool execution failed unexpectedly");
    }
  });

  // ── GET /api/v1/agency-tools/openapi.json ─────────────────────────────
  router.get("/openapi.json", async (req: Request, res: Response) => {
    try {
      const auth = req.auth;
      if (!auth || auth.mode !== "api_key") {
        return sendApiError(res, 401, "invalid_api_key", "API key authentication required");
      }

      // Tenant-scoped feature flag check
      const { tenants } = await import("../../drizzle/schema");
      const [tenantRow2] = await db.instance
        .select({ featureFlags: tenants.featureFlags })
        .from(tenants)
        .where(eq(tenants.id, auth.tenantId))
        .limit(1);
      const storedFlags2 = (tenantRow2?.featureFlags as Record<string, boolean>) ?? null;
      if (!isFeatureEnabled(storedFlags2, "agencyToolApi")) {
        return sendApiError(res, 403, "feature_disabled", "Agency Tool API is not enabled for this tenant");
      }

      const drizzle = db.instance;
      const exposedTools = await drizzle
        .select()
        .from(agencyTools)
        .where(
          and(
            eq(agencyTools.tenantId, auth.tenantId),
            eq(agencyTools.isExposedAsApi, true),
            eq(agencyTools.isEnabled, true),
          ),
        );

      // Build dynamic paths
      const paths: Record<string, unknown> = {};
      for (const tool of exposedTools) {
        const pathKey = `/api/v1/agency-tools/${tool.id}/execute`;
        paths[pathKey] = {
          post: {
            summary: tool.name,
            description: tool.description || `Execute tool: ${tool.name}`,
            operationId: `execute_${tool.id.replace(/-/g, "_")}`,
            tags: ["Agency Tools"],
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: tool.inputSchema || { type: "object" },
                },
              },
            },
            responses: {
              "200": {
                description: "Tool execution result",
                content: {
                  "application/json": {
                    schema: tool.outputSchema || { type: "object" },
                  },
                },
              },
              "400": { description: "Bad request — invalid parameters" },
              "401": { description: "Authentication failed" },
              "403": { description: "Insufficient scopes or tenant mismatch" },
              "429": { description: "Rate limit exceeded" },
            },
          },
        };
      }

      const spec = {
        openapi: "3.0.3",
        info: {
          title: "SmartAIHub Agency Tools API",
          version: "1.0.0",
          description: "Tenant-specific API for executing exposed agency tools.",
        },
        servers: [{ url: "https://smartaihub.app" }],
        security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
        paths,
        components: {
          securitySchemes: {
            bearerAuth: {
              type: "http",
              scheme: "bearer",
              description: "Bearer token (Authorization: Bearer sk-ssp_...)",
            },
            apiKeyHeader: {
              type: "apiKey",
              in: "header",
              name: "X-Api-Key",
              description: "API key header (X-Api-Key: sk-ssp_...)",
            },
          },
          schemas: {
            Error: {
              type: "object",
              properties: {
                error: {
                  type: "object",
                  properties: {
                    code: { type: "string" },
                    message: { type: "string" },
                    type: { type: "string" },
                  },
                },
              },
            },
          },
        },
      };

      res.setHeader("Content-Type", "application/json");
      return res.json(spec);
    } catch (err) {
      return sendApiError(res, 500, "internal_error", "Failed to generate OpenAPI spec");
    }
  });

  return router;
}
