/**
 * MCP Server Management tRPC Router (section-13)
 *
 * CRUD endpoints for MCP server registry. All endpoints require admin role.
 * Encrypted fields never returned — only boolean indicators.
 */

import { TRPCError } from "@trpc/server";
import crypto from "crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import {
  adminProcedure,
  rateLimitedAdminProcedure,
  router,
} from "../_core/trpc";
import { getDb } from "../db";
import { agencies, agencyAgents, mcpServerAssignments, mcpServers } from "../../drizzle/schema";
import { encrypt } from "../services/crypto";
import { assertPublicIp, sanitizeUri } from "../services/ssrfValidation";

// ────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────

export const BLOCKED_HEADERS = [
  "Host",
  "X-Forwarded-For",
  "X-Forwarded-Host",
  "X-Forwarded-Proto",
  "Cookie",
  "Set-Cookie",
];

export const mcpToolNameRegex = /^[a-zA-Z0-9_-]+$/;

const MAX_TOOLS_PER_SERVER = 100;
const MAX_DESCRIPTION_LENGTH = 500;

function resolveTenantId(ctx: { tenantId?: unknown; user?: { currentTenantId?: unknown } | null }): string {
  const tenantId = ctx.tenantId ?? ctx.user?.currentTenantId;
  return tenantId == null ? "" : String(tenantId);
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

export function validateHeaders(
  headers: Record<string, string> | undefined,
): void {
  if (!headers) return;
  for (const key of Object.keys(headers)) {
    const lower = key.toLowerCase();
    if (
      BLOCKED_HEADERS.some((blocked) => lower === blocked.toLowerCase()) ||
      lower.startsWith("x-forwarded-")
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Header "${key}" is not allowed in MCP server config`,
      });
    }
  }
}

export function sanitizeDescription(
  desc: string | undefined,
): string | undefined {
  if (desc === undefined || desc === null) return undefined;
  // Strip HTML tags
  const cleaned = desc.replace(/<[^>]*>/g, "").trim();
  return cleaned.slice(0, MAX_DESCRIPTION_LENGTH);
}

function computeConfigHash(config: unknown): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(config))
    .digest("hex");
}

function toResponse(server: typeof mcpServers.$inferSelect) {
  // M09: Strip env values from stdio configs — they may contain API keys.
  // Replace each env value with "***" so callers know keys exist but secrets
  // are never returned over the wire.
  const rawConfig = server.config as Record<string, unknown> | null;
  let safeConfig: Record<string, unknown> | null = rawConfig;
  if (rawConfig && typeof rawConfig === "object") {
    safeConfig = { ...rawConfig };
    if (safeConfig.env && typeof safeConfig.env === "object") {
      safeConfig.env = Object.fromEntries(
        Object.keys(safeConfig.env as Record<string, unknown>).map((k) => [
          k,
          "***",
        ]),
      );
    }
  }

  return {
    id: server.id,
    name: server.name,
    slug: server.slug,
    description: server.description,
    transportType: server.transportType,
    enabled: server.enabled,
    config: safeConfig,
    oauthConfigured: !!(server.oauthAccessTokenEncrypted || server.oauthClientSecretEncrypted),
    riskLevel: server.riskLevel,
    dataClassification: server.dataClassification,
    healthStatus: server.healthStatus,
    lastHealthCheck: server.lastHealthCheck,
    timeoutSeconds: server.timeoutSeconds,
    maxToolsExposed: server.maxToolsExposed,
    toolNamePrefix: server.toolNamePrefix,
    creditPerCall: server.creditPerCall,
    capabilities: server.capabilities,
    configHash: server.configHash,
    createdAt: server.createdAt,
    updatedAt: server.updatedAt,
  };
}

// ────────────────────────────────────────────────────────────
// Zod Schemas (exported for testing)
// ────────────────────────────────────────────────────────────

const httpConfigSchema = z
  .object({
    url: z.string().url(),
    headers: z.record(z.string()).optional(),
  })
  .strict();

const stdioConfigSchema = z
  .object({
    command: z.enum(["npx"]),
    args: z.array(z.string().max(256)).max(10),
    env: z.record(z.string()).optional(),
    packageIntegrityHash: z.string().optional(),
  })
  .strict();

const streamableHttpConfigSchema = z
  .object({
    url: z.string().url(),
    headers: z.record(z.string()).optional(),
  })
  .strict();

const oauthConfigSchema = z.object({
  tokenUrl: z.string().url(),
  grantType: z.enum(["client_credentials", "authorization_code"]),
  scope: z.string().optional(),
});

export const createMcpServerSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .min(1)
    .max(100),
  description: z.string().max(500).optional(),
  transportType: z.enum(["http", "streamable_http", "stdio"]),
  config: z.union([httpConfigSchema, stdioConfigSchema, streamableHttpConfigSchema]),
  oauthConfig: oauthConfigSchema.optional(),
  oauthClientId: z.string().optional(),
  oauthClientSecret: z.string().max(1024).optional(),
  timeoutSeconds: z.number().int().min(5).max(120).default(30),
  riskLevel: z.enum(["low", "medium", "high"]).default("high"),
  dataClassification: z
    .enum(["public", "internal", "confidential"])
    .default("internal"),
  creditPerCall: z.number().min(0).max(100).default(1),
});

export const updateMcpServerSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  transportType: z.enum(["http", "streamable_http", "stdio"]).optional(),
  config: z
    .union([httpConfigSchema, stdioConfigSchema, streamableHttpConfigSchema])
    .optional(),
  oauthConfig: oauthConfigSchema.optional(),
  oauthClientId: z.string().optional(),
  oauthClientSecret: z.string().max(1024).optional(),
  enabled: z.boolean().optional(),
  timeoutSeconds: z.number().int().min(5).max(120).optional(),
  riskLevel: z.enum(["low", "medium", "high"]).optional(),
  dataClassification: z
    .enum(["public", "internal", "confidential"])
    .optional(),
  creditPerCall: z.number().min(0).max(100).optional(),
  maxToolsExposed: z.number().int().min(1).max(200).optional(),
});

export const assignToAgencySchema = z
  .object({
    mcpServerId: z.number().int().positive(),
    targetType: z.enum(["tenant", "agency", "agent"]),
    targetId: z.string().min(1).max(36),
    enabledToolNames: z.array(z.string().max(100)).max(200).optional(),
    disabledToolNames: z.array(z.string().max(100)).max(200).optional(),
  });

// ────────────────────────────────────────────────────────────
// Router
// ────────────────────────────────────────────────────────────

export const mcpServersRouter = router({
  /** List all MCP servers for the current tenant */
  list: adminProcedure.query(async ({ ctx }) => {
    const tenantId = resolveTenantId(ctx);
    const rows = await getDb()
      .select()
      .from(mcpServers)
      .where(eq(mcpServers.tenantId, tenantId))
      .orderBy(mcpServers.name);

    return rows.map(toResponse);
  }),

  /** Get a single MCP server by ID (tenant-scoped) */
  getById: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const [server] = await getDb()
        .select()
        .from(mcpServers)
        .where(
          and(
            eq(mcpServers.id, input.id),
            eq(mcpServers.tenantId, resolveTenantId(ctx)),
          ),
        );

      if (!server) {
        throw new TRPCError({ code: "NOT_FOUND", message: "MCP server not found" });
      }

      return toResponse(server);
    }),

  /** Create a new MCP server */
  create: adminProcedure
    .input(createMcpServerSchema)
    .mutation(async ({ ctx, input }) => {
      // M06: Validate headers unconditionally — function handles undefined
      validateHeaders((input.config as { headers?: Record<string, string> }).headers);

      // SSRF protection for HTTP transports
      if (
        input.transportType === "http" ||
        input.transportType === "streamable_http"
      ) {
        const rawUrl = (input.config as { url?: string }).url;
        if (rawUrl) {
          const sanitizedUrl = sanitizeUri(rawUrl);
          const parsed = new URL(sanitizedUrl);
          await assertPublicIp(parsed.hostname);
        }
      }

      const description = sanitizeDescription(input.description);
      const configHash = computeConfigHash(input.config);

      const insertData: Record<string, unknown> = {
        tenantId: resolveTenantId(ctx),
        name: input.name,
        slug: input.slug,
        description,
        transportType: input.transportType,
        config: input.config,
        configHash,
        timeoutSeconds: input.timeoutSeconds,
        riskLevel: input.riskLevel,
        dataClassification: input.dataClassification,
        creditPerCall: String(input.creditPerCall),
        createdBy: ctx.user.id,
      };

      // Encrypt OAuth secret if provided
      if (input.oauthClientId) {
        insertData.oauthClientId = input.oauthClientId;
      }
      if (input.oauthClientSecret) {
        insertData.oauthClientSecretEncrypted = encrypt(input.oauthClientSecret);
      }
      if (input.oauthConfig) {
        insertData.oauthConfig = input.oauthConfig;
      }

      const [created] = await getDb()
        .insert(mcpServers)
        .values(insertData as typeof mcpServers.$inferInsert)
        .returning();

      return toResponse(created);
    }),

  /** Update an existing MCP server */
  update: adminProcedure
    .input(updateMcpServerSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      const [existing] = await getDb()
        .select()
        .from(mcpServers)
        .where(
          and(
            eq(mcpServers.id, input.id),
            eq(mcpServers.tenantId, resolveTenantId(ctx)),
          ),
        );

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "MCP server not found" });
      }

      // M06: Validate headers unconditionally — function handles undefined
      validateHeaders((input.config as { headers?: Record<string, string> } | undefined)?.headers);

      // SSRF protection for HTTP transports on config change
      if (input.config) {
        const transportType = input.transportType ?? existing.transportType;
        if (
          transportType === "http" ||
          transportType === "streamable_http"
        ) {
          const rawUrl = (input.config as { url?: string }).url;
          if (rawUrl) {
            const sanitizedUrl = sanitizeUri(rawUrl);
            const parsed = new URL(sanitizedUrl);
            await assertPublicIp(parsed.hostname);
          }
        }
      }

      const updates: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (input.name !== undefined) updates.name = input.name;
      if (input.description !== undefined)
        updates.description = sanitizeDescription(input.description);
      if (input.transportType !== undefined)
        updates.transportType = input.transportType;
      if (input.enabled !== undefined) updates.enabled = input.enabled;
      if (input.timeoutSeconds !== undefined)
        updates.timeoutSeconds = input.timeoutSeconds;
      if (input.riskLevel !== undefined) updates.riskLevel = input.riskLevel;
      if (input.dataClassification !== undefined)
        updates.dataClassification = input.dataClassification;
      if (input.creditPerCall !== undefined)
        updates.creditPerCall = String(input.creditPerCall);
      if (input.maxToolsExposed !== undefined)
        updates.maxToolsExposed = input.maxToolsExposed;

      if (input.config !== undefined) {
        updates.config = input.config;
        updates.configHash = computeConfigHash(input.config);
      }

      if (input.oauthClientId !== undefined)
        updates.oauthClientId = input.oauthClientId;
      if (input.oauthClientSecret !== undefined)
        updates.oauthClientSecretEncrypted = encrypt(input.oauthClientSecret);
      if (input.oauthConfig !== undefined)
        updates.oauthConfig = input.oauthConfig;

      const [updated] = await getDb()
        .update(mcpServers)
        .set(updates)
        .where(and(eq(mcpServers.id, input.id), eq(mcpServers.tenantId, resolveTenantId(ctx))))
        .returning();

      return toResponse(updated);
    }),

  /** Delete an MCP server */
  delete: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await getDb()
        .select()
        .from(mcpServers)
        .where(
          and(
            eq(mcpServers.id, input.id),
            eq(mcpServers.tenantId, resolveTenantId(ctx)),
          ),
        );

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "MCP server not found" });
      }

      // Cascade delete handles assignments via FK
      await getDb().delete(mcpServers).where(and(eq(mcpServers.id, input.id), eq(mcpServers.tenantId, resolveTenantId(ctx))));

      return { success: true };
    }),

  /** Test connection to an MCP server (rate limited: 5/min) */
  testConnection: rateLimitedAdminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const [server] = await getDb()
        .select()
        .from(mcpServers)
        .where(
          and(
            eq(mcpServers.id, input.id),
            eq(mcpServers.tenantId, resolveTenantId(ctx)),
          ),
        );

      if (!server) {
        throw new TRPCError({ code: "NOT_FOUND", message: "MCP server not found" });
      }

      const config = server.config as Record<string, unknown>;
      const url = config?.url as string | undefined;

      if (!url) {
        return { reachable: false, toolCount: 0, latencyMs: 0 };
      }

      try {
        // SSRF protection — sanitize URL (strip credentials, enforce HTTPS) then reject private IPs
        const sanitizedUrl = sanitizeUri(url);
        const parsed = new URL(sanitizedUrl);
        await assertPublicIp(parsed.hostname);

        const start = Date.now();
        const controller = new AbortController();
        const timeout = setTimeout(
          () => controller.abort(),
          (server.timeoutSeconds ?? 30) * 1000,
        );

        try {
          const resp = await fetch(sanitizedUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              method: "tools/list",
              id: 1,
            }),
            signal: controller.signal,
          });

          clearTimeout(timeout);
          const latencyMs = Date.now() - start;

          if (!resp.ok) {
            return { reachable: false, toolCount: 0, latencyMs };
          }

          // Read up to 1MB
          const text = await resp.text();
          if (text.length > 1_048_576) {
            return { reachable: true, toolCount: 0, latencyMs };
          }

          const body = JSON.parse(text);
          const tools = Array.isArray(body?.result?.tools)
            ? body.result.tools
            : [];

          // Update health status
          await getDb()
            .update(mcpServers)
            .set({
              healthStatus: "healthy",
              lastHealthCheck: new Date(),
            })
            .where(and(eq(mcpServers.id, input.id), eq(mcpServers.tenantId, resolveTenantId(ctx))));

          return {
            reachable: true,
            toolCount: Math.min(tools.length, MAX_TOOLS_PER_SERVER),
            latencyMs,
          };
        } finally {
          clearTimeout(timeout);
        }
      } catch {
        // Update health status on failure
        await getDb()
          .update(mcpServers)
            .set({
              healthStatus: "unhealthy",
              lastHealthCheck: new Date(),
            })
            .where(and(eq(mcpServers.id, input.id), eq(mcpServers.tenantId, resolveTenantId(ctx))));

        // Never expose error details (SSRF oracle prevention)
        return { reachable: false, toolCount: 0, latencyMs: 0 };
      }
    }),

  /** List discovered tools from a server (namespaced) */
  listDiscoveredTools: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const [server] = await getDb()
        .select()
        .from(mcpServers)
        .where(
          and(
            eq(mcpServers.id, input.id),
            eq(mcpServers.tenantId, resolveTenantId(ctx)),
          ),
        );

      if (!server) {
        throw new TRPCError({ code: "NOT_FOUND", message: "MCP server not found" });
      }

      const config = server.config as Record<string, unknown>;
      const url = config?.url as string | undefined;

      if (!url) {
        return { tools: [], serverSlug: server.slug };
      }

      try {
        const sanitizedUrl = sanitizeUri(url);
        const parsed = new URL(sanitizedUrl);
        await assertPublicIp(parsed.hostname);

        const controller = new AbortController();
        const timeout = setTimeout(
          () => controller.abort(),
          (server.timeoutSeconds ?? 30) * 1000,
        );

        try {
          const resp = await fetch(sanitizedUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              method: "tools/list",
              id: 1,
            }),
            signal: controller.signal,
          });

          clearTimeout(timeout);

          if (!resp.ok) {
            return { tools: [], serverSlug: server.slug };
          }

          const text = await resp.text();
          if (text.length > 1_048_576) {
            throw new TRPCError({
              code: "PAYLOAD_TOO_LARGE",
              message: "Tool discovery response exceeds 1MB limit",
            });
          }

          const body = JSON.parse(text);
          const rawTools = Array.isArray(body?.result?.tools)
            ? body.result.tools
            : [];

          // Limit to MAX_TOOLS_PER_SERVER, validate names, namespace
          const tools = rawTools
            .slice(0, MAX_TOOLS_PER_SERVER)
            .filter(
              (t: { name?: string }) =>
                t.name && mcpToolNameRegex.test(t.name),
            )
            .map(
              (t: {
                name: string;
                description?: string;
                inputSchema?: unknown;
              }) => ({
                name: `mcp.${server.slug}.${t.name}`,
                originalName: t.name,
                description: sanitizeDescription(t.description),
                hasInputSchema: !!t.inputSchema,
              }),
            );

          return { tools, serverSlug: server.slug };
        } finally {
          clearTimeout(timeout);
        }
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        return { tools: [], serverSlug: server.slug };
      }
    }),

  /** Assign an MCP server to a tenant, agency, or agent */
  assignToTarget: adminProcedure
    .input(assignToAgencySchema)
    .mutation(async ({ ctx, input }) => {
      // Verify the MCP server belongs to this tenant
      const [server] = await getDb()
        .select()
        .from(mcpServers)
        .where(
          and(
            eq(mcpServers.id, input.mcpServerId),
            eq(mcpServers.tenantId, resolveTenantId(ctx)),
          ),
        );

      if (!server) {
        throw new TRPCError({ code: "NOT_FOUND", message: "MCP server not found" });
      }

      // Verify targetId belongs to the caller's tenant (prevent cross-tenant assignment)
      if (input.targetType === "tenant" && input.targetId !== resolveTenantId(ctx)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot assign to another tenant" });
      }
      if (input.targetType === "agency") {
        const [agency] = await getDb()
          .select({ id: agencies.id })
          .from(agencies)
          .where(and(eq(agencies.id, input.targetId), eq(agencies.tenantId, resolveTenantId(ctx))));
        if (!agency) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found in your tenant" });
        }
      }
      if (input.targetType === "agent") {
        const [agent] = await getDb()
          .select({ id: agencyAgents.id })
          .from(agencyAgents)
          .innerJoin(agencies, eq(agencyAgents.agencyId, agencies.id))
          .where(and(eq(agencyAgents.id, input.targetId), eq(agencies.tenantId, resolveTenantId(ctx))));
        if (!agent) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Agent not found in your tenant" });
        }
      }

      const [assignment] = await getDb()
        .insert(mcpServerAssignments)
        .values({
          mcpServerId: input.mcpServerId,
          targetType: input.targetType,
          targetId: input.targetId,
          enabledToolNames: input.enabledToolNames ?? null,
          disabledToolNames: input.disabledToolNames ?? null,
        })
        .onConflictDoUpdate({
          target: [
            mcpServerAssignments.mcpServerId,
            mcpServerAssignments.targetType,
            mcpServerAssignments.targetId,
          ],
          set: {
            enabledToolNames: input.enabledToolNames ?? null,
            disabledToolNames: input.disabledToolNames ?? null,
            updatedAt: new Date(),
          },
        })
        .returning();

      return assignment;
    }),

  /** Remove an MCP server assignment */
  removeAssignment: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      // Verify via join that assignment belongs to tenant's server
      const [assignment] = await getDb()
        .select({ id: mcpServerAssignments.id })
        .from(mcpServerAssignments)
        .innerJoin(
          mcpServers,
          eq(mcpServerAssignments.mcpServerId, mcpServers.id),
        )
        .where(
          and(
            eq(mcpServerAssignments.id, input.id),
            eq(mcpServers.tenantId, resolveTenantId(ctx)),
          ),
        );

      if (!assignment) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Assignment not found" });
      }

      await getDb()
        .delete(mcpServerAssignments)
        .where(eq(mcpServerAssignments.id, assignment.id));

      return { success: true };
    }),

  /** List assignments for a specific target */
  listAssignments: adminProcedure
    .input(
      z.object({
        targetType: z.enum(["tenant", "agency", "agent"]),
        targetId: z.string().min(1).max(36),
      }),
    )
    .query(async ({ ctx, input }) => {
      const rows = await getDb()
        .select({
          assignment: mcpServerAssignments,
          serverName: mcpServers.name,
          serverSlug: mcpServers.slug,
          serverEnabled: mcpServers.enabled,
        })
        .from(mcpServerAssignments)
        .innerJoin(
          mcpServers,
          eq(mcpServerAssignments.mcpServerId, mcpServers.id),
        )
        .where(
          and(
            eq(mcpServerAssignments.targetType, input.targetType),
            eq(mcpServerAssignments.targetId, input.targetId),
            eq(mcpServers.tenantId, resolveTenantId(ctx)),
          ),
        );

      return rows.map((r) => ({
        ...r.assignment,
        serverName: r.serverName,
        serverSlug: r.serverSlug,
        serverEnabled: r.serverEnabled,
      }));
    }),
});
