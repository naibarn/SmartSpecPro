/**
 * Agency tRPC Router
 *
 * CRUD for agencies, agent configs, communication flows.
 * Conversation management for agency chat sessions.
 * Admin operations (toggle tenant, kill run).
 */

import { z } from "zod";
import { router, protectedProcedure, adminProcedure, publicProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { createRateLimitMiddleware } from "../_core/rateLimitedProcedure";
import { requireFeatureFlag } from "../middleware/requireFeatureFlag";
import { db } from "../db";
import {
  agencies,
  agencyAgents,
  agencyAgentTools,
  agencyCommunicationFlows,
  agencyConversations,
  agencyRunArtifacts,
  agencyTools,
  agencyVersions,
  agencyPermissions,
  agencyGuardrails,
  agencyAgentGuardrails,
  agencySharedTools,
  agencyRunTraces,
  agencyAgentMemories,
  userGroups,
  users,
  systemSettings,
} from "../../drizzle/schema";
import { eq, and, or, desc, asc, inArray, sql, getTableColumns, count } from "drizzle-orm";
import { agencyBridge } from "../services/agencyBridge";
import { validateSsrfUrl } from "../services/ssrfValidator";
import { encrypt, decrypt } from "../services/crypto";
import type { RunResult } from "../services/agencyBridge";
import { runPlanner, recordStepAttempt } from "../services/taskPlannerMiddleware";
import { buildAgencyTaskMetadata } from "../services/agencyEscalation";
import {
  AgencyPreviewCommitError,
  commitLibraryBackedPreview,
} from "../services/agencyCommitService";
import { commitPresentationPreview } from "../services/agencyDeckCommitService";
import {
  ensureBuiltInAgencyExperienceTemplates,
  resolveAgencyRetrievalScope,
} from "../services/agencyExperienceTemplateService";
import { getTenantFeatureFlag, setTenantFeatureFlag } from "../services/featureFlags";
import {
  expireRunPreviewArtifacts,
  recordAgencyPreviewMetric,
} from "../services/agencyPreviewLifecycleService";
import { buildAgencyPreview } from "../services/agencyPreviewService";
import crypto from "crypto";
import { sanitizeExamples } from "../services/fewShotSanitizer";
import { invalidateStarterCache } from "../services/conversationStarterCache";
import { generateAgencySvg } from "../lib/agencySvgGenerator";
import { createNotification } from "../services/notificationService";

// Feature flag guard (tenant-scoped)
async function assertAgencyEnabled(tenantId: string): Promise<void> {
  // Always enable in non-production environments for local development
  // OR if explicitly enabled via environment variable
  if (process.env.NODE_ENV !== "production" || process.env.AGENCY_SWARM_ENABLED === "true") {
    return;
  }

  const enabled = await getTenantFeatureFlag("AGENCY_SWARM_ENABLED", tenantId);
  if (!enabled) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Not found" });
  }
}

// Exported Zod schema for custom tool input (reused by section-04 OpenAPI import)
export const customToolInputSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(2000).optional(),
  endpoint: z.string().url(),
  httpMethod: z.enum(["GET", "POST", "PUT", "DELETE"]),
  headers: z.record(z.string()).optional(),
  inputSchema: z.record(z.unknown()).optional(),
  outputSchema: z.record(z.unknown()).optional(),
  riskLevel: z.enum(["low", "medium", "high"]).default("low"),
  strictSchema: z.boolean().default(false),
  oneCallAtATime: z.boolean().default(false),
  icon: z.string().max(50).optional(),
  category: z.string().max(50).optional(),
  retryPolicy: z.object({
    maxRetries: z.number().int().min(0).max(5),
    backoffMs: z.number().int().min(100).max(30000),
  }).optional(),
});

/**
 * Auto-generate trigger phrases from agency metadata.
 * Creates regex-friendly phrases from the agency name, description, and agent names
 * so that the chat can detect when a user's message should invoke this agency.
 */
function generateTriggerPhrases(
  name: string,
  description: string,
  agentNames: string[],
): string[] {
  const phrases: string[] = [];

  // 1. Agency name as exact phrase (case-insensitive via regex later)
  const cleanName = name.trim();
  if (cleanName) {
    phrases.push(cleanName);
  }

  // 2. Extract meaningful keywords from description (words ≥ 3 chars, skip stopwords)
  const stopwords = new Set([
    "the", "and", "for", "with", "that", "this", "from", "your", "are", "was",
    "will", "can", "has", "had", "have", "been", "being", "does", "did", "not",
    "but", "all", "any", "each", "every", "both", "few", "more", "most", "other",
    "some", "such", "than", "too", "very", "just", "about", "into", "over", "also",
    "การ", "ที่", "ของ", "ใน", "และ", "เป็น", "ได้", "จะ", "ให้", "ไม่", "มี",
    "กับ", "อยู่", "จาก", "แล้ว", "ทำ", "ต้อง", "เพื่อ", "หรือ", "อัน", "แต่",
    "agent", "agents", "team", "system", "custom", "instructions", "model",
  ]);

  if (description) {
    const descWords = description
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !stopwords.has(w));

    // Take top unique keywords (max 10)
    const uniqueWords = [...new Set(descWords)].slice(0, 10);

    // Create 2-word keyword pairs from consecutive unique words
    for (let i = 0; i < uniqueWords.length - 1 && phrases.length < 15; i++) {
      phrases.push(`${uniqueWords[i]}\\s+${uniqueWords[i + 1]}`);
    }

    // Add individual strong keywords (≥ 4 chars)
    for (const w of uniqueWords) {
      if (w.length >= 4 && phrases.length < 20) {
        phrases.push(w);
      }
    }
  }

  // 3. Add agent role names (e.g. "Researcher", "SEO Writer") as triggers
  for (const agentName of agentNames) {
    const clean = agentName.trim();
    if (clean && clean.length >= 3 && phrases.length < 25) {
      phrases.push(clean);
    }
  }

  return [...new Set(phrases)].slice(0, 25);
}

// Q-1: Detect cycles in communication flows using DFS
function detectFlowCycle(
  flows: Array<{ fromAgentName: string; toAgentName: string }>,
): string | null {
  const adj = new Map<string, string[]>();
  for (const f of flows) {
    if (!adj.has(f.fromAgentName)) adj.set(f.fromAgentName, []);
    adj.get(f.fromAgentName)!.push(f.toAgentName);
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(node: string): boolean {
    visited.add(node);
    inStack.add(node);
    for (const neighbor of adj.get(node) ?? []) {
      if (inStack.has(neighbor)) return true; // Cycle found
      if (!visited.has(neighbor) && dfs(neighbor)) return true;
    }
    inStack.delete(node);
    return false;
  }

  for (const node of adj.keys()) {
    if (!visited.has(node) && dfs(node)) {
      return node; // Return first node in cycle
    }
  }
  return null;
}

// Rate-limited procedures specific to agencies
const agencyCreateProcedure = protectedProcedure.use(
  createRateLimitMiddleware({ namespace: "agency-create", limit: 10, windowMs: 86_400_000 }),
);
const agencyMessageProcedure = protectedProcedure.use(
  createRateLimitMiddleware({ namespace: "agency-message", limit: 60, windowMs: 60_000 }),
);
const agencyTemplateProcedure = protectedProcedure.use(
  createRateLimitMiddleware({ namespace: "agency-template", limit: 5, windowMs: 86_400_000 }),
);

export const agencyRouter = router({
  // --- CRUD ---

  list: protectedProcedure
    .input(
      z.object({
        status: z.enum(["draft", "published", "archived"]).optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
      await assertAgencyEnabled(tenantId);

      // Include user's tenant agencies + system template agencies
      const tenantCondition = or(
        eq(agencies.tenantId, tenantId),
        and(
          eq(agencies.tenantId, "__system__"),
          eq(agencies.visibility, "template"),
        ),
      );
      const conditions: any[] = [tenantCondition];
      if (input.status) {
        conditions.push(eq(agencies.status, input.status));
      }

      const userId = ctx.user!.id;
      const isAdmin = ctx.user!.role === "admin";

      const result = await db
        .select({
          ...getTableColumns(agencies),
          agentCount: sql<number>`(SELECT count(*)::int FROM agency_agents WHERE "agencyId" = ${agencies.id})`.as("agentCount"),
          ownerName: users.name,
          ownerEmail: users.email,
          sharedGroupCount: sql<number>`(SELECT count(*)::int FROM agency_permissions WHERE "agencyId" = ${agencies.id})`.as("sharedGroupCount"),
        })
        .from(agencies)
        .leftJoin(users, eq(agencies.createdBy, users.id))
        .where(and(...conditions))
        .orderBy(desc(agencies.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return {
        agencies: result.map((a: typeof result[number]) => ({
          ...a,
          canEdit: a.createdBy === userId || isAdmin,
        })),
      };
    }),

  /** Lightweight list for trigger detection in chat — returns only agencies with triggerPhrases */
  listTriggers: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
    await assertAgencyEnabled(tenantId);

    const result = await db
      .select({
        id: agencies.id,
        name: agencies.name,
        description: agencies.description,
        triggerPhrases: agencies.triggerPhrases,
      })
      .from(agencies)
      .where(
        and(
          eq(agencies.tenantId, tenantId),
          sql`${agencies.triggerPhrases} IS NOT NULL AND jsonb_array_length(${agencies.triggerPhrases}) > 0`,
        ),
      );

    return { agencies: result };
  }),

  // --- Sharing / Permissions ---

  listAgencyGroups: protectedProcedure
    .input(z.object({ agencyId: z.string() }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
      await assertAgencyEnabled(tenantId);

      const userId = ctx.user!.id;
      const isAdmin = ctx.user!.role === "admin";

      // Verify agency exists and user has permission
      const [agency] = await db
        .select({ id: agencies.id, createdBy: agencies.createdBy })
        .from(agencies)
        .where(and(eq(agencies.id, input.agencyId), eq(agencies.tenantId, tenantId)));

      if (!agency) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });
      }
      if (agency.createdBy !== userId && !isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the owner or admin can view sharing settings" });
      }

      const rows = await db
        .select({
          id: userGroups.id,
          name: userGroups.name,
          description: userGroups.description,
        })
        .from(agencyPermissions)
        .innerJoin(userGroups, eq(agencyPermissions.groupId, userGroups.id))
        .where(eq(agencyPermissions.agencyId, input.agencyId))
        .orderBy(asc(userGroups.name));

      return { groups: rows };
    }),

  shareAgencyWithGroups: protectedProcedure
    .input(z.object({
      agencyId: z.string(),
      groupIds: z.array(z.number()).min(1).max(50),
    }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
      await assertAgencyEnabled(tenantId);

      const userId = ctx.user!.id;
      const isAdmin = ctx.user!.role === "admin";

      // Verify agency ownership
      const [agency] = await db
        .select({ id: agencies.id, createdBy: agencies.createdBy, visibility: agencies.visibility })
        .from(agencies)
        .where(and(eq(agencies.id, input.agencyId), eq(agencies.tenantId, tenantId)));

      if (!agency) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });
      }
      if (agency.createdBy !== userId && !isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the owner or admin can share" });
      }

      // Verify groups exist in this tenant
      const validGroups = await db
        .select({ id: userGroups.id })
        .from(userGroups)
        .where(and(
          inArray(userGroups.id, input.groupIds),
          eq(userGroups.tenantId, tenantId),
        ));

      const validIds = validGroups.map((g: { id: number }) => g.id);
      if (validIds.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No valid groups found" });
      }

      // Insert permissions (ignore conflicts)
      await db
        .insert(agencyPermissions)
        .values(validIds.map((gId: number) => ({
          agencyId: input.agencyId,
          groupId: gId,
          grantedByUserId: userId,
        })))
        .onConflictDoNothing();

      // Update visibility to "shared" if currently "private"
      if (agency.visibility === "private") {
        await db
          .update(agencies)
          .set({ visibility: "shared", updatedAt: new Date() })
          .where(eq(agencies.id, input.agencyId));
      }

      return { success: true, sharedCount: validIds.length };
    }),

  unshareAgencyGroup: protectedProcedure
    .input(z.object({
      agencyId: z.string(),
      groupId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
      await assertAgencyEnabled(tenantId);

      const userId = ctx.user!.id;
      const isAdmin = ctx.user!.role === "admin";

      // Verify agency ownership
      const [agency] = await db
        .select({ id: agencies.id, createdBy: agencies.createdBy })
        .from(agencies)
        .where(and(eq(agencies.id, input.agencyId), eq(agencies.tenantId, tenantId)));

      if (!agency) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });
      }
      if (agency.createdBy !== userId && !isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the owner or admin can manage sharing" });
      }

      // Remove the permission
      await db
        .delete(agencyPermissions)
        .where(and(
          eq(agencyPermissions.agencyId, input.agencyId),
          eq(agencyPermissions.groupId, input.groupId),
        ));

      // Check remaining permissions — revert to private if none left
      const [remaining] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(agencyPermissions)
        .where(eq(agencyPermissions.agencyId, input.agencyId));

      if (remaining.count === 0) {
        await db
          .update(agencies)
          .set({ visibility: "private", updatedAt: new Date() })
          .where(eq(agencies.id, input.agencyId));
      }

      return { success: true };
    }),

  listTemplates: protectedProcedure
    .query(async ({ ctx }) => {
      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
      await assertAgencyEnabled(tenantId);
      const templateExposureEnabled = await getTenantFeatureFlag("AGENCY_TEMPLATE_EXPERIENCES_ENABLED", tenantId);
      if (templateExposureEnabled) {
        await ensureBuiltInAgencyExperienceTemplates(db);
      }

      const { agencyTemplates } = await import("../../drizzle/schema");

      const templates = await db
        .select()
        .from(agencyTemplates)
        .where(eq(agencyTemplates.isActive, true))
        .orderBy(desc(agencyTemplates.createdAt));

      return { templates };
    }),

  listAgentTemplates: protectedProcedure
    .input(z.object({ agencyTemplateId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
      await assertAgencyEnabled(tenantId);

      const { agentTemplates } = await import("../../drizzle/schema");

      const conditions: any[] = [];
      if (input?.agencyTemplateId) {
        conditions.push(eq(agentTemplates.agencyTemplateId, input.agencyTemplateId));
      } else {
        conditions.push(sql`${agentTemplates.agencyTemplateId} IS NULL`);
      }

      const templates = await db
        .select()
        .from(agentTemplates)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(agentTemplates.createdAt));

      return { agentTemplates: templates };
    }),

  listTools: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }).optional().default({ limit: 50, offset: 0 })
    )
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
      await assertAgencyEnabled(tenantId);

      // Default built-in tools that Agency Swarm agents can use
      const builtinTools = [
        {
          id: "builtin-web-search",
          name: "Web Search",
          description: "Search the internet for real-time information",
          toolType: "builtin",
          riskLevel: "low",
          requiresApproval: false,
          configSchema: null,
        },
        {
          id: "builtin-code-interpreter",
          name: "Code Interpreter",
          description: "Execute Python code in a secure sandbox",
          toolType: "sandbox",
          riskLevel: "medium",
          requiresApproval: false,
          configSchema: null,
        },
        {
          id: "builtin-file-reader",
          name: "File Reader",
          description: "Read files from the agent workspace",
          toolType: "builtin",
          riskLevel: "low",
          requiresApproval: false,
          configSchema: null,
        },
        {
          id: "builtin-file-writer",
          name: "File Writer",
          description: "Create or modify files in the workspace",
          toolType: "builtin",
          riskLevel: "medium",
          requiresApproval: false,
          configSchema: null,
        },
        {
          id: "builtin-rag-knowledge",
          name: "Knowledge Base Reader",
          description: "Read documents and knowledge uploaded to the library and search for relevant information.",
          toolType: "builtin",
          riskLevel: "low",
          requiresApproval: false,
          configSchema: {
            fields: [
              { key: "collectionId", label: "Collection", type: "collection_select", required: true },
              { key: "topK", label: "Top K results", type: "select", options: [1, 3, 5, 10, 20], default: 5 },
            ],
          },
        },
        {
          id: "builtin-skill-executor",
          name: "Skill Executor",
          description: "Execute previously created agency skills and custom tools securely in the OpenSandbox environment.",
          toolType: "sandbox",
          riskLevel: "medium",
          requiresApproval: false,
          configSchema: {
            fields: [
              { key: "skillId", label: "Skill", type: "skill_select", required: true },
              { key: "skillSlug", label: "Skill slug", type: "text", readonly: true },
            ],
          },
        },
        {
          id: "builtin-cmd-executor",
          name: "Command Executor",
          description: "Run shell commands",
          toolType: "sandbox",
          riskLevel: "high",
          requiresApproval: true,
          configSchema: null,
        },
        // 5 new tools
        {
          id: "builtin-http-request",
          name: "HTTP / REST API",
          description: "Make HTTP requests to external REST APIs",
          toolType: "builtin",
          riskLevel: "medium",
          requiresApproval: false,
          configSchema: {
            fields: [
              { key: "url", label: "URL", type: "text", required: true, placeholder: "https://api.example.com/endpoint" },
              { key: "method", label: "Method", type: "select", options: ["GET", "POST", "PUT", "PATCH", "DELETE"], default: "GET" },
              { key: "headers", label: "Headers (JSON)", type: "json", placeholder: '{"Authorization": "Bearer ..."}' },
            ],
          },
        },
        {
          id: "builtin-email-notify",
          name: "Email Notification",
          description: "Send email notifications",
          toolType: "builtin",
          riskLevel: "low",
          requiresApproval: false,
          configSchema: {
            fields: [
              { key: "toTemplate", label: "To (template)", type: "text", required: true, placeholder: "user@example.com" },
              { key: "subjectTemplate", label: "Subject template", type: "text", required: true },
            ],
          },
        },
        {
          id: "builtin-webhook",
          name: "Webhook Trigger",
          description: "Send data to a webhook URL",
          toolType: "builtin",
          riskLevel: "medium",
          requiresApproval: false,
          configSchema: {
            fields: [
              { key: "webhookUrl", label: "Webhook URL", type: "text", required: true, placeholder: "https://hooks.example.com/..." },
            ],
          },
        },
        {
          id: "builtin-slack-message",
          name: "Slack Message",
          description: "Send messages to a Slack channel",
          toolType: "builtin",
          riskLevel: "low",
          requiresApproval: false,
          configSchema: {
            fields: [
              { key: "channelId", label: "Channel ID", type: "text", required: true, placeholder: "C0123456789" },
            ],
          },
        },
        {
          id: "builtin-document-search",
          name: "Document Search",
          description: "Search across multiple document collections",
          toolType: "builtin",
          riskLevel: "low",
          requiresApproval: false,
          configSchema: {
            fields: [
              { key: "collectionIds", label: "Collections", type: "collection_multiselect", required: true },
            ],
          },
        },
        {
          id: "builtin-voice",
          name: "Voice",
          description: "Speech-to-text and text-to-speech capabilities",
          toolType: "builtin",
          riskLevel: "medium",
          requiresApproval: false,
          configSchema: {
            type: "object",
            properties: {
              allowedModes: {
                type: "array",
                items: { type: "string", enum: ["stt", "tts"] },
                default: ["stt", "tts"],
              },
              defaultVoice: { type: "string", default: "alloy" },
              maxAudioDurationSec: { type: "number", default: 60, maximum: 300 },
              maxTextLength: { type: "number", default: 5000, maximum: 10000 },
            },
          },
        },
        {
          id: "builtin-agency-call",
          name: "Agency Call",
          description:
            "Call another agency to handle a subtask. Enables cross-agency communication with tenant isolation and depth limits.",
          toolType: "builtin",
          riskLevel: "high",
          requiresApproval: true,
          configSchema: {
            fields: [
              {
                key: "allowedAgencies",
                label: "Allowed Agency IDs",
                type: "multi-select",
                default: [],
                placeholder: "Select agencies this tool can call (empty = deny all)",
              },
              {
                key: "maxDepth",
                label: "Max call depth",
                type: "number",
                default: 2,
                min: 1,
                max: 3,
              },
              {
                key: "timeout",
                label: "Timeout (ms)",
                type: "number",
                default: 120000,
                min: 10000,
                max: 300000,
              },
            ],
          },
        },
        {
          id: "builtin-browser",
          name: "Browser Automation",
          description:
            "Navigate web pages, extract text, take screenshots, and interact with elements in a secure sandbox",
          toolType: "sandbox",
          riskLevel: "high",
          requiresApproval: true,
          configSchema: {
            fields: [
              {
                key: "maxPageLoads",
                label: "Max Page Loads",
                type: "select",
                options: [1, 3, 5, 10],
                default: 5,
              },
              {
                key: "timeout",
                label: "Session Timeout (seconds)",
                type: "select",
                options: [60, 120, 180, 300],
                default: 300,
              },
              {
                key: "screenshotQuality",
                label: "Screenshot Quality",
                type: "select",
                options: ["low", "medium", "high"],
                default: "medium",
              },
              {
                key: "allowedDomains",
                label: "Allowed Domains (comma-separated, empty = DENY ALL)",
                type: "text",
                required: false,
                placeholder: "example.com,docs.example.com",
              },
            ],
          },
        },
      ];

      // Custom tools assigned in the database
      const dbTools = await db
        .select()
        .from(agencyTools)
        .where(eq(agencyTools.tenantId, tenantId))
        .orderBy(desc(agencyTools.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      const dbToolsFormatted = dbTools.map((t: any) => ({
        id: t.id,
        name: t.name,
        description: t.description ?? undefined,
        toolType: t.toolType ?? "custom",
        riskLevel: t.riskLevel ?? "low",
        requiresApproval: t.requiresApproval ?? false,
        isEnabled: t.isEnabled,
        isOwned: true,  // Custom tools belong to this tenant — can be edited/deleted
      }));

      // Combine and filter if searching or paginating (simple combined array)
      const combined = [...builtinTools, ...dbToolsFormatted];

      return { tools: combined };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
      await assertAgencyEnabled(tenantId);

      const userId = ctx.user!.id;
      const isAdmin = ctx.user!.role === "admin";

      // SECURITY: Filter by tenantId in SQL (defense-in-depth, no cross-tenant scan)
      const [agency] = await db
        .select()
        .from(agencies)
        .where(and(eq(agencies.id, input.id), eq(agencies.tenantId, tenantId)))
        .limit(1);

      if (!agency && isAdmin) {
        // Admin fallback: allow cross-tenant lookup
        const [adminAgency] = await db.select().from(agencies).where(eq(agencies.id, input.id)).limit(1);
        if (!adminAgency) throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });
        Object.assign(agency ?? {}, adminAgency);
      }
      if (!agency) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });
      }

      const canEdit = agency.createdBy === userId || isAdmin;

      // Fetch agents
      const agents = await db
        .select()
        .from(agencyAgents)
        .where(eq(agencyAgents.agencyId, input.id));

      // Fetch communication flows
      const flows = await db
        .select()
        .from(agencyCommunicationFlows)
        .where(eq(agencyCommunicationFlows.agencyId, input.id));

      // Fetch agent tool assignments (single query instead of N+1)
      const agentIds = agents.map((a: { id: string }) => a.id);
      const toolAssignments = agentIds.length > 0
        ? await db
          .select()
          .from(agencyAgentTools)
          .where(inArray(agencyAgentTools.agentId, agentIds))
        : [];

      // Fetch shared tools
      const sharedTools = await db
        .select()
        .from(agencySharedTools)
        .where(eq(agencySharedTools.agencyId, input.id));

      // SECURITY: Strip encrypted MCP tokens from response — return boolean flag only
      const safeAgents = agents.map((a: any) => ({
        ...a,
        mcpServerTokensEncrypted: undefined,
        hasMcpTokens: !!a.mcpServerTokensEncrypted,
      }));

      return {
        ...agency,
        canEdit,
        agents: safeAgents,
        communicationFlows: flows,
        agentToolAssignments: toolAssignments,
        sharedToolAssignments: sharedTools,
      };
    }),

  createFromTemplate: agencyCreateProcedure
    .input(z.object({ agencyTemplateId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
      const userId = ctx.user!.id;
      await assertAgencyEnabled(tenantId);
      const templateExposureEnabled = await getTenantFeatureFlag("AGENCY_TEMPLATE_EXPERIENCES_ENABLED", tenantId);
      if (templateExposureEnabled) {
        await ensureBuiltInAgencyExperienceTemplates(db);
      }

      const { agencyTemplates, agentTemplates } = await import("../../drizzle/schema");

      const [template] = await db.select().from(agencyTemplates).where(eq(agencyTemplates.id, input.agencyTemplateId));
      if (!template) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });

      const newAgencyId = crypto.randomUUID();
      const slug = `${template.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${crypto.randomBytes(4).toString("hex")}`;

      await db.insert(agencies).values({
        id: newAgencyId,
        tenantId,
        sourceTemplateId: template.id,
        name: template.name,
        slug,
        description: template.description,
        systemPrompt: template.systemPrompt,
        status: "draft",
        createdBy: userId,
      });

      const templateAgents = await db.select().from(agentTemplates).where(eq(agentTemplates.agencyTemplateId, template.id));

      if (templateAgents.length > 0) {
        const inserts = templateAgents.map((ta: any) => ({
          id: crypto.randomUUID(),
          agencyId: newAgencyId,
          name: ta.name,
          description: ta.description,
          instructions: ta.instructions,
          model: ta.defaultModel,
          isEntryPoint: ta.isEntryPoint,
          position: ta.position as any,
        }));
        await db.insert(agencyAgents).values(inserts);

        const toolAssignments = templateAgents.flatMap((ta: any, index: number) => {
          const clonedAgentId = inserts[index]?.id;
          if (!clonedAgentId || !Array.isArray(ta.defaultTools)) {
            return [];
          }
          return ta.defaultTools
            .filter((toolId: unknown): toolId is string => typeof toolId === "string" && toolId.length > 0)
            .map((toolId: string) => ({
              id: crypto.randomUUID(),
              agentId: clonedAgentId,
              toolId,
            }));
        });

        if (toolAssignments.length > 0) {
          await db.insert(agencyAgentTools).values(toolAssignments);
        }
      }

      return { id: newAgencyId, slug };
    }),

  create: agencyCreateProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
        description: z.string().optional(),
        systemPrompt: z.string().optional(),
        creditMultiplier: z.number().min(1).max(10).default(1),
        maxAgents: z.number().min(1).max(20).default(10),
        maxRunTimeSeconds: z.number().min(30).max(3600).default(600),
        isFallbackSafe: z.boolean().default(false),
        creatorFeeCredits: z.number().int().min(0).max(1000).default(0),
        agents: z
          .array(
            z.object({
              name: z.string().min(1).max(100),
              description: z.string().optional(),
              nodeType: z.enum([
                "agent", "supervisor", "router", "aggregator",
                "knowledge_base", "skill_call", "human_approval", "browser_session", "conditional_branch", "parallel_fan_out", "loop_retry", "skill_discovery", "data_transform", "error_handler",
              ]).default("agent"),
              instructions: z.string().max(50000).optional(),
              model: z.string().max(100).regex(/^[a-zA-Z0-9._\/-]+$/, "Invalid model identifier").optional(),
              modelSettings: z
                .object({
                  maxTokens: z.number().optional(),
                  temperature: z.number().min(0).max(2).optional(),
                  topP: z.number().min(0).max(1).optional(),
                  reasoningEffort: z.enum(["minimal", "low", "medium", "high"]).optional(),
                })
                .optional(),
              parallelToolCalls: z.boolean().default(true),
              maxTurns: z.number().int().min(1).max(100).default(25),
              isEntryPoint: z.boolean().default(false),
              isOptional: z.boolean().default(false),
              position: z.object({ x: z.number().finite(), y: z.number().finite() }).optional(),
              toolIds: z.array(z.string().min(1).max(100)).max(50).optional(),
              toolConfigs: z.record(z.string(), z.record(z.unknown())).optional(),
              nodeConfig: z.record(z.unknown()).optional(),
              outputSchema: z.record(z.unknown()).nullable().optional(),
            }),
          )
          .min(1)
          .max(20),
        communicationFlows: z
          .array(
            z.object({
              fromAgentName: z.string(),
              toAgentName: z.string(),
              flowType: z.enum(["delegation", "handoff", "parallel", "orchestrator_worker", "custom"]),
              flowConfig: z.object({
                contextFields: z.array(z.string().max(100)).max(20).optional(),
                requireSummary: z.boolean().optional(),
                maxRoundTrips: z.number().int().min(0).max(1000).optional(),
                timeout: z.number().int().min(0).max(3600).optional(),
              }).optional(),
            }),
          )
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
      await assertAgencyEnabled(tenantId);
      const userId = ctx.user!.id;

      // Quota enforcement: check tenant agency limit
      const quotaRows = await db
        .select()
        .from(systemSettings)
        .where(
          and(
            eq(systemSettings.category, "agency_quotas"),
            eq(systemSettings.key, `tenant_${tenantId}_maxAgencies`),
          ),
        );
      if (quotaRows.length > 0 && quotaRows[0].value) {
        const maxAgencies = parseInt(quotaRows[0].value, 10);
        if (!isNaN(maxAgencies) && maxAgencies > 0) {
          const [{ count: existingCount }] = await db
            .select({ count: sql<number>`count(*)` })
            .from(agencies)
            .where(
              and(
                eq(agencies.tenantId, tenantId),
                sql`${agencies.status} != 'archived'`,
              ),
            );
          if (Number(existingCount) >= maxAgencies) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: `Agency limit of ${maxAgencies} reached for this tenant`,
            });
          }
        }
      }

      // Validate exactly one entry point
      const entryPoints = input.agents.filter((a) => a.isEntryPoint);
      if (entryPoints.length !== 1) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Exactly one entry point agent is required, found ${entryPoints.length}`,
        });
      }

      const agencyId = crypto.randomUUID();

      await db.transaction(async (tx) => {
        // Insert agency
        await tx.insert(agencies).values({
          id: agencyId,
          tenantId,
          slug: input.slug,
          name: input.name,
          description: input.description ?? null,
          systemPrompt: input.systemPrompt ?? null,
          creditMultiplier: String(input.creditMultiplier),
          maxAgents: input.maxAgents,
          maxRunTimeSeconds: input.maxRunTimeSeconds,
          isFallbackSafe: input.isFallbackSafe,
          creatorFeeCredits: input.creatorFeeCredits,
          status: "draft",
          createdBy: userId,
        });

        // Build agent name -> id mapping for communication flows
        const agentNameToId: Record<string, string> = {};

        // Insert agents
        for (const agent of input.agents) {
          const agentId = crypto.randomUUID();
          agentNameToId[agent.name] = agentId;

          await tx.insert(agencyAgents).values({
            id: agentId,
            agencyId,
            name: agent.name,
            description: agent.description ?? null,
            nodeType: agent.nodeType ?? "agent",
            nodeConfig: (agent.nodeConfig ?? null) as any,
            instructions: agent.instructions ?? null,
            model: agent.model ?? null,
            modelSettings: agent.modelSettings ?? null,
            parallelToolCalls: agent.parallelToolCalls,
            maxTurns: agent.maxTurns,
            isEntryPoint: agent.isEntryPoint,
            isOptional: agent.isOptional,
            position: agent.position ?? null,
            outputSchema: (agent.outputSchema ?? null) as any,
          });

          // Insert tool assignments
          if (agent.toolIds?.length) {
            for (const toolId of agent.toolIds) {
              const toolConfig = agent.toolConfigs?.[toolId] ?? null;
              await tx.insert(agencyAgentTools).values({
                id: crypto.randomUUID(),
                agentId,
                toolId,
                toolConfig: toolConfig as any,
              });
            }
          }
        }

        // Insert communication flows
        if (input.communicationFlows?.length) {
          for (const flow of input.communicationFlows) {
            const fromId = agentNameToId[flow.fromAgentName];
            const toId = agentNameToId[flow.toAgentName];
            if (!fromId || !toId) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `Invalid communication flow: agent "${!fromId ? flow.fromAgentName : flow.toAgentName}" not found`,
              });
            }
            await tx.insert(agencyCommunicationFlows).values({
              id: crypto.randomUUID(),
              agencyId,
              fromAgentId: fromId,
              toAgentId: toId,
              flowType: flow.flowType,
              flowConfig: flow.flowConfig ?? null,
            });
          }
        }
      });

      return { id: agencyId };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        systemPrompt: z.string().optional(),
        defaultModel: z.string().max(100).optional(),
        creditMultiplier: z.number().min(1).max(10).optional(),
        maxRunTimeSeconds: z.number().min(30).max(3600).optional(),
        isFallbackSafe: z.boolean().optional(),
        creatorFeeCredits: z.number().int().min(0).max(1000).optional(),
        status: z.enum(["draft", "published", "archived"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
      await assertAgencyEnabled(tenantId);
      const userId = ctx.user!.id;
      const isAdmin = ctx.user!.role === "admin";

      // Fetch existing agency by ID, then verify access
      const [agency] = await db
        .select()
        .from(agencies)
        .where(eq(agencies.id, input.id))
        .limit(1);

      if (!agency) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });
      }
      if (agency.tenantId !== tenantId && !isAdmin) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });
      }
      if (agency.createdBy !== userId && !isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to update this agency" });
      }

      const { id, ...updateFields } = input;
      const setValues: Record<string, any> = {};
      if (updateFields.name !== undefined) setValues.name = updateFields.name;
      if (updateFields.description !== undefined) setValues.description = updateFields.description;
      if (updateFields.systemPrompt !== undefined) setValues.systemPrompt = updateFields.systemPrompt;
      if (updateFields.defaultModel !== undefined) setValues.defaultModel = updateFields.defaultModel;
      if (updateFields.creditMultiplier !== undefined)
        setValues.creditMultiplier = String(updateFields.creditMultiplier);
      if (updateFields.maxRunTimeSeconds !== undefined)
        setValues.maxRunTimeSeconds = updateFields.maxRunTimeSeconds;
      if (updateFields.isFallbackSafe !== undefined) setValues.isFallbackSafe = updateFields.isFallbackSafe;
      if (updateFields.creatorFeeCredits !== undefined)
        setValues.creatorFeeCredits = updateFields.creatorFeeCredits;
      if (updateFields.status !== undefined) {
        setValues.status = updateFields.status;
        if (updateFields.status === "published") setValues.isPublished = true;
        if (updateFields.status === "archived") setValues.isPublished = false;
      }

      if (Object.keys(setValues).length > 0) {
        await db.update(agencies).set(setValues).where(eq(agencies.id, id));
      }

      return { success: true };
    }),

  /** Full graph save for the visual builder (replaces all agents/flows). */
  saveBuilder: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        systemPrompt: z.string().optional(),
        defaultModel: z.string().max(100).nullish(),
        topology: z.enum(["handoff_chain", "orchestrator_worker", "hybrid", "custom"]).optional(),
        changeDescription: z.string().max(500).optional(),
        agents: z.array(
          z.object({
            name: z.string().min(1).max(100),
            description: z.string().optional(),
            nodeType: z.enum([
              "agent", "supervisor", "router", "aggregator",
              "knowledge_base", "skill_call", "human_approval", "browser_session", "conditional_branch", "parallel_fan_out", "loop_retry", "skill_discovery", "data_transform", "error_handler",
            ]).default("agent"),
            instructions: z.string().max(50000).optional(),
            model: z.string().max(100).regex(/^[a-zA-Z0-9._\/-]+$/, "Invalid model identifier").optional(),
            modelSettings: z
              .object({
                maxTokens: z.number().optional(),
                temperature: z.number().min(0).max(2).optional(),
                topP: z.number().min(0).max(1).optional(),
                reasoningEffort: z.enum(["minimal", "low", "medium", "high"]).optional(),
              })
              .optional(),
            parallelToolCalls: z.boolean().default(true),
            maxTurns: z.number().int().min(1).max(100).default(25),
            isEntryPoint: z.boolean().default(false),
            isOptional: z.boolean().default(false),
            position: z.object({ x: z.number().finite(), y: z.number().finite() }).optional(),
            toolIds: z.array(z.string().min(1).max(100)).max(50).optional(),
            toolConfigs: z.record(z.string(), z.record(z.unknown())).optional(),
            nodeConfig: z.record(z.unknown()).optional(),
            outputSchema: z.record(z.unknown()).nullable().optional(),
            examples: z.array(
              z.array(
                z.object({
                  role: z.enum(["user", "assistant"]),
                  content: z.string().max(2000),
                }).strict(),
              ).min(1).max(2),
            ).max(10).optional(),
          }).superRefine((data, ctx) => {
            if (["agent", "supervisor"].includes(data.nodeType)) {
              if (!data.model) ctx.addIssue({ code: "custom", path: ["model"], message: "model is required for agent/supervisor" });
              if (!data.instructions) ctx.addIssue({ code: "custom", path: ["instructions"], message: "instructions are required for agent/supervisor" });
              // Validate agentic nodeConfig fields
              const nc = data.nodeConfig as Record<string, unknown> | undefined;
              const executionMode = nc?.executionMode;
              if (executionMode !== undefined && executionMode !== "single_shot" && executionMode !== "agentic") {
                ctx.addIssue({ code: "custom", path: ["nodeConfig", "executionMode"], message: "executionMode must be 'single_shot' or 'agentic'" });
              }
              const maxCycles = nc?.maxReflectionCycles;
              if (maxCycles !== undefined) {
                const n = Number(maxCycles);
                if (!Number.isInteger(n) || n < 1 || n > 10) {
                  ctx.addIssue({ code: "custom", path: ["nodeConfig", "maxReflectionCycles"], message: "maxReflectionCycles must be an integer between 1 and 10" });
                }
              }
              const strategy = nc?.planningStrategy;
              if (strategy !== undefined && !["basic", "cot", "react"].includes(String(strategy))) {
                ctx.addIssue({ code: "custom", path: ["nodeConfig", "planningStrategy"], message: "planningStrategy must be 'basic', 'cot', or 'react'" });
              }
              const showReasoning = nc?.showReasoning;
              if (showReasoning !== undefined && typeof showReasoning !== "boolean") {
                ctx.addIssue({ code: "custom", path: ["nodeConfig", "showReasoning"], message: "showReasoning must be a boolean" });
              }
            }
            if (data.nodeType === "router" && !(data.nodeConfig as any)?.routes?.length) {
              ctx.addIssue({ code: "custom", path: ["nodeConfig"], message: "router requires at least 1 route" });
            }
            if (data.nodeType === "browser_session") {
              const goal = String((data.nodeConfig as any)?.goal ?? "").trim();
              const handoffMode = String((data.nodeConfig as any)?.handoffMode ?? "continue_running");
              const handoffSummary = String((data.nodeConfig as any)?.handoffSummary ?? "").trim();
              if (!goal) {
                ctx.addIssue({ code: "custom", path: ["nodeConfig", "goal"], message: "browser_session requires a goal" });
              }
              if (
                ["review_required", "needs_user_input"].includes(handoffMode)
                && !handoffSummary
              ) {
                ctx.addIssue({ code: "custom", path: ["nodeConfig", "handoffSummary"], message: "browser_session requires a handoff summary for review or user input states" });
              }
            }
            if (data.isEntryPoint && !["agent", "supervisor"].includes(data.nodeType)) {
              ctx.addIssue({ code: "custom", path: ["isEntryPoint"], message: `Only agent/supervisor nodes can be entry points, not ${data.nodeType}` });
            }
            // Validate conditional_branch config
            if (data.nodeType === "conditional_branch") {
              const cfg = data.nodeConfig as any;
              const mode = cfg?.evaluationMode;
              if (!mode || !["rule_based", "llm_classify", "context_check"].includes(mode)) {
                ctx.addIssue({ code: "custom", path: ["nodeConfig", "evaluationMode"], message: "conditional_branch requires evaluationMode: rule_based | llm_classify | context_check" });
              }
              if (!cfg?.defaultTargetNodeId) {
                ctx.addIssue({ code: "custom", path: ["nodeConfig", "defaultTargetNodeId"], message: "conditional_branch requires defaultTargetNodeId" });
              }
              if (mode === "rule_based") {
                const rules = cfg?.rules;
                if (!Array.isArray(rules) || rules.length === 0) {
                  ctx.addIssue({ code: "custom", path: ["nodeConfig", "rules"], message: "rule_based mode requires at least 1 rule" });
                } else {
                  const validOps = ["equals", "contains", "regex", "gt", "lt", "gte", "lte", "exists"];
                  for (let ri = 0; ri < rules.length; ri++) {
                    const r = rules[ri];
                    if (!r.field) ctx.addIssue({ code: "custom", path: ["nodeConfig", "rules", ri, "field"], message: "rule field is required" });
                    if (!r.operator || !validOps.includes(r.operator)) ctx.addIssue({ code: "custom", path: ["nodeConfig", "rules", ri, "operator"], message: `operator must be one of: ${validOps.join(", ")}` });
                    if (!r.targetNodeId) ctx.addIssue({ code: "custom", path: ["nodeConfig", "rules", ri, "targetNodeId"], message: "rule targetNodeId is required" });
                  }
                }
              }
              if (mode === "llm_classify") {
                const cats = cfg?.categories;
                if (!Array.isArray(cats) || cats.length < 2) {
                  ctx.addIssue({ code: "custom", path: ["nodeConfig", "categories"], message: "llm_classify mode requires at least 2 categories" });
                }
                const desc = cfg?.classificationDescription;
                if (desc && typeof desc === "string" && desc.length > 200) {
                  ctx.addIssue({ code: "custom", path: ["nodeConfig", "classificationDescription"], message: "classificationDescription max 200 chars" });
                }
              }
            }
            // Validate parallel_fan_out config
            if (data.nodeType === "parallel_fan_out") {
              const cfg = data.nodeConfig as any;
              const branches = cfg?.branches;
              if (!Array.isArray(branches) || branches.length < 2) {
                ctx.addIssue({ code: "custom", path: ["nodeConfig", "branches"], message: "parallel_fan_out requires at least 2 branches" });
              }
              const strategy = cfg?.mergeStrategy;
              if (!strategy || !["wait_all", "first_complete", "majority", "custom_prompt"].includes(strategy)) {
                ctx.addIssue({ code: "custom", path: ["nodeConfig", "mergeStrategy"], message: "mergeStrategy must be: wait_all, first_complete, majority, or custom_prompt" });
              }
              if (strategy === "custom_prompt" && !cfg?.mergePrompt?.trim()) {
                ctx.addIssue({ code: "custom", path: ["nodeConfig", "mergePrompt"], message: "custom_prompt strategy requires mergePrompt" });
              }
              if (cfg?.mergePrompt && typeof cfg.mergePrompt === "string" && cfg.mergePrompt.length > 1000) {
                ctx.addIssue({ code: "custom", path: ["nodeConfig", "mergePrompt"], message: "mergePrompt max 1000 chars" });
              }
              const maxC = cfg?.maxConcurrent;
              if (maxC !== undefined && (typeof maxC !== "number" || maxC < 1 || maxC > 10)) {
                ctx.addIssue({ code: "custom", path: ["nodeConfig", "maxConcurrent"], message: "maxConcurrent must be 1-10" });
              }
              const timeout = cfg?.timeoutMs;
              if (timeout !== undefined && (typeof timeout !== "number" || timeout < 1000 || timeout > 600000)) {
                ctx.addIssue({ code: "custom", path: ["nodeConfig", "timeoutMs"], message: "timeoutMs must be 1000-600000" });
              }
            }
            // Validate loop_retry config
            if (data.nodeType === "loop_retry") {
              const cfg = data.nodeConfig as any;
              if (!cfg?.loopTargetNodeId) {
                ctx.addIssue({ code: "custom", path: ["nodeConfig", "loopTargetNodeId"], message: "loop_retry requires loopTargetNodeId" });
              }
              const exit = cfg?.exitCondition;
              if (!exit?.mode || !["max_iterations", "rule_based", "llm_evaluate", "context_check"].includes(exit.mode)) {
                ctx.addIssue({ code: "custom", path: ["nodeConfig", "exitCondition", "mode"], message: "exitCondition mode must be: max_iterations, rule_based, llm_evaluate, context_check" });
              }
              if (exit?.maxIterations !== undefined && (exit.maxIterations < 1 || exit.maxIterations > 20)) {
                ctx.addIssue({ code: "custom", path: ["nodeConfig", "exitCondition", "maxIterations"], message: "maxIterations must be 1-20" });
              }
              if (exit?.evaluationPrompt && typeof exit.evaluationPrompt === "string" && exit.evaluationPrompt.length > 500) {
                ctx.addIssue({ code: "custom", path: ["nodeConfig", "exitCondition", "evaluationPrompt"], message: "evaluationPrompt max 500 chars" });
              }
              const timeout = cfg?.timeoutMs;
              if (timeout !== undefined && (typeof timeout !== "number" || timeout < 1000 || timeout > 600000)) {
                ctx.addIssue({ code: "custom", path: ["nodeConfig", "timeoutMs"], message: "timeoutMs must be 1000-600000" });
              }
              if (cfg?.feedbackPrompt && typeof cfg.feedbackPrompt === "string" && cfg.feedbackPrompt.length > 500) {
                ctx.addIssue({ code: "custom", path: ["nodeConfig", "feedbackPrompt"], message: "feedbackPrompt max 500 chars" });
              }
            }
            // Validate skill_discovery config
            if (data.nodeType === "skill_discovery") {
              const cfg = data.nodeConfig as any;
              const taskSource = cfg?.taskSource;
              if (!taskSource || !["static", "context", "previous_output"].includes(taskSource)) {
                ctx.addIssue({ code: "custom", path: ["nodeConfig", "taskSource"], message: "skill_discovery requires taskSource (static, context, or previous_output)" });
              }
              if (taskSource === "static" && !cfg?.taskValue) {
                ctx.addIssue({ code: "custom", path: ["nodeConfig", "taskValue"], message: "taskValue is required when taskSource is static" });
              }
              if (taskSource === "context" && !cfg?.contextKey) {
                ctx.addIssue({ code: "custom", path: ["nodeConfig", "contextKey"], message: "contextKey is required when taskSource is context" });
              }
              const threshold = cfg?.confidenceThreshold;
              if (threshold !== undefined && (typeof threshold !== "number" || threshold < 0 || threshold > 1)) {
                ctx.addIssue({ code: "custom", path: ["nodeConfig", "confidenceThreshold"], message: "confidenceThreshold must be 0.0 to 1.0" });
              }
              const maxResults = cfg?.maxResults;
              if (maxResults !== undefined && (typeof maxResults !== "number" || maxResults < 1 || maxResults > 10)) {
                ctx.addIssue({ code: "custom", path: ["nodeConfig", "maxResults"], message: "maxResults must be 1-10" });
              }
            }
            // Validate skill_call inputMappings
            if (data.nodeType === "skill_call") {
              const cfg = data.nodeConfig as any;
              const mappings = cfg?.inputMappings;
              if (mappings && typeof mappings === "object") {
                for (const [field, mapping] of Object.entries(mappings)) {
                  const m = mapping as any;
                  if (!m?.source || !["static", "node_output", "context"].includes(m.source)) {
                    ctx.addIssue({ code: "custom", path: ["nodeConfig", "inputMappings", field], message: `Invalid source type for field "${field}"` });
                  }
                  if (m?.source === "node_output" && (!m?.nodeId || !m?.outputField)) {
                    ctx.addIssue({ code: "custom", path: ["nodeConfig", "inputMappings", field], message: `node_output requires nodeId and outputField for field "${field}"` });
                  }
                  if (m?.source === "context" && !m?.contextKey) {
                    ctx.addIssue({ code: "custom", path: ["nodeConfig", "inputMappings", field], message: `context source requires contextKey for field "${field}"` });
                  }
                }
              }
            }
            // Validate error_handler config
            if (data.nodeType === "error_handler") {
              const cfg = data.nodeConfig as any;
              const watchedNodeIds = cfg?.watchedNodeIds;
              if (!Array.isArray(watchedNodeIds) || watchedNodeIds.length === 0) {
                ctx.addIssue({ code: "custom", path: ["nodeConfig", "watchedNodeIds"], message: "error_handler requires at least 1 watchedNodeId" });
              }
              const onError = cfg?.onError;
              if (!onError || !["retry", "fallback", "skip", "terminate"].includes(onError)) {
                ctx.addIssue({ code: "custom", path: ["nodeConfig", "onError"], message: "onError must be: retry, fallback, skip, or terminate" });
              }
              if (onError === "retry") {
                const maxRetries = cfg?.retryConfig?.maxRetries;
                if (maxRetries !== undefined && (typeof maxRetries !== "number" || maxRetries < 1 || maxRetries > 5)) {
                  ctx.addIssue({ code: "custom", path: ["nodeConfig", "retryConfig", "maxRetries"], message: "maxRetries must be 1-5" });
                }
              }
              if (onError === "fallback") {
                const fallbackNodeId = cfg?.fallbackNodeId;
                const fallbackMessage = cfg?.fallbackMessage;
                if (!fallbackNodeId && !fallbackMessage) {
                  ctx.addIssue({ code: "custom", path: ["nodeConfig", "fallbackNodeId"], message: "fallback requires either fallbackNodeId or fallbackMessage" });
                }
              }
            }
            // Validate data_transform config
            if (data.nodeType === "data_transform") {
              const cfg = data.nodeConfig as any;
              const mode = cfg?.transformMode;
              if (!mode || !["jsonpath", "template", "filter"].includes(mode)) {
                ctx.addIssue({ code: "custom", path: ["nodeConfig", "transformMode"], message: "transformMode must be: jsonpath, template, or filter" });
              }
              if (mode === "jsonpath" && !cfg?.jsonpathExpression) {
                ctx.addIssue({ code: "custom", path: ["nodeConfig", "jsonpathExpression"], message: "jsonpath mode requires jsonpathExpression" });
              }
              if (mode === "template" && !cfg?.template) {
                ctx.addIssue({ code: "custom", path: ["nodeConfig", "template"], message: "template mode requires template" });
              }
              if (mode === "filter") {
                const fc = cfg?.filterCondition;
                if (!fc?.field || !fc?.operator || fc?.value === undefined) {
                  ctx.addIssue({ code: "custom", path: ["nodeConfig", "filterCondition"], message: "filter mode requires field, operator, and value" });
                }
                if (fc?.operator && !["gt", "lt", "equals", "contains"].includes(fc.operator)) {
                  ctx.addIssue({ code: "custom", path: ["nodeConfig", "filterCondition", "operator"], message: "operator must be: gt, lt, equals, or contains" });
                }
              }
            }
            // Validate knowledgeBase config
            const kb = (data.nodeConfig as any)?.knowledgeBase;
            if (kb && ["agent", "supervisor"].includes(data.nodeType)) {
              if (kb.documentIds && kb.documentIds.length > 20) {
                ctx.addIssue({ code: "custom", path: ["nodeConfig", "knowledgeBase"], message: "Maximum 20 KB documents per agent" });
              }
              if (kb.topK !== undefined && (kb.topK < 1 || kb.topK > 20)) {
                ctx.addIssue({ code: "custom", path: ["nodeConfig", "knowledgeBase"], message: "topK must be between 1 and 20" });
              }
              if (kb.scoreThreshold !== undefined && (kb.scoreThreshold < 0 || kb.scoreThreshold > 1)) {
                ctx.addIssue({ code: "custom", path: ["nodeConfig", "knowledgeBase"], message: "scoreThreshold must be between 0 and 1" });
              }
              if (kb.maxContextTokens !== undefined && (kb.maxContextTokens < 100 || kb.maxContextTokens > 32000)) {
                ctx.addIssue({ code: "custom", path: ["nodeConfig", "knowledgeBase"], message: "maxContextTokens must be between 100 and 32000" });
              }
            }
          }),
        ).min(1).max(20),
        userContext: z.record(z.string(), z.unknown()).optional(),
        sharedInstructions: z.string().max(50000).optional(),
        conversationStarters: z.array(z.string().min(1).max(500)).max(10).optional(),
        cacheConversationStarters: z.boolean().optional(),
        sharedToolIds: z.array(z.string().min(1).max(100)).max(50).optional(),
        communicationFlows: z
          .array(
            z.object({
              fromAgentName: z.string(),
              toAgentName: z.string(),
              flowType: z.enum(["delegation", "handoff", "parallel", "orchestrator_worker", "custom"]),
              flowConfig: z.object({
                contextFields: z.array(z.string().max(100)).max(20).optional(),
                requireSummary: z.boolean().optional(),
                maxRoundTrips: z.number().int().min(0).max(1000).optional(),
                timeout: z.number().int().min(0).max(3600).optional(),
              }).optional(),
            }),
          )
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
      await assertAgencyEnabled(tenantId);
      const userId = ctx.user!.id;
      const isAdmin = ctx.user!.role === "admin";

      // Look up agency by ID first, then verify tenant access
      const [agency] = await db
        .select()
        .from(agencies)
        .where(eq(agencies.id, input.id))
        .limit(1);

      if (!agency) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });
      }

      // Verify tenant access — agency must belong to the user's tenant (or user is admin)
      if (agency.tenantId !== tenantId && !isAdmin) {
        console.error(`[saveBuilder] TENANT MISMATCH: agency.tenantId=${agency.tenantId} !== ctx.tenantId=${tenantId}`);
        throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });
      }

      // Verify ownership — only creator or admin can edit
      if (agency.createdBy !== userId && !isAdmin) {
        console.error(`[saveBuilder] OWNER MISMATCH: agency.createdBy=${agency.createdBy} !== userId=${userId}`);
        throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized" });
      }

      // Validate exactly one entry point (must be agent or supervisor)
      const entryPoints = input.agents.filter((a) => a.isEntryPoint);
      if (entryPoints.length !== 1) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Exactly one entry point is required, found ${entryPoints.length}`,
        });
      }

      // Detect cycles in communication flows (prevent infinite-loop agent graphs)
      if (input.communicationFlows?.length) {
        const cycleNode = detectFlowCycle(input.communicationFlows);
        if (cycleNode) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Communication flow contains a cycle starting at agent "${cycleNode}"`,
          });
        }
      }

      await db.transaction(async (tx) => {
        // Row lock inside transaction (defense-in-depth)
        const lockResult = await tx.execute(
          sql`SELECT id FROM agencies WHERE id = ${input.id} AND "tenantId" = ${agency.tenantId} FOR UPDATE`,
        );
        // postgres-js driver returns an array directly (no .rows property)
        if (!lockResult || (lockResult as unknown[]).length === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });
        }

        // Update agency metadata
        const setValues: Record<string, any> = {};
        if (input.name !== undefined) setValues.name = input.name;
        if (input.description !== undefined) setValues.description = input.description;
        if (input.systemPrompt !== undefined) setValues.systemPrompt = input.systemPrompt;
        if (input.defaultModel !== undefined) setValues.defaultModel = input.defaultModel;
        if (input.userContext !== undefined) setValues.userContext = input.userContext;
        if (input.topology !== undefined) setValues.topology = input.topology;
        if (input.sharedInstructions !== undefined) setValues.sharedInstructions = input.sharedInstructions;
        if (input.conversationStarters !== undefined) setValues.conversationStarters = input.conversationStarters;
        if (input.cacheConversationStarters !== undefined) setValues.cacheConversationStarters = input.cacheConversationStarters;
        if (Object.keys(setValues).length > 0) {
          await tx.update(agencies).set(setValues).where(eq(agencies.id, input.id));
        }

        // Handle shared tools (delete-insert pattern)
        if (input.sharedToolIds !== undefined) {
          await tx.delete(agencySharedTools).where(eq(agencySharedTools.agencyId, input.id));
          const uniqueToolIds = [...new Set(input.sharedToolIds)];
          for (const toolId of uniqueToolIds) {
            await tx.insert(agencySharedTools).values({
              id: crypto.randomUUID(),
              agencyId: input.id,
              toolId,
            });
          }
        }

        // Invalidate conversation starter cache if relevant fields changed
        if (input.sharedInstructions !== undefined || input.sharedToolIds !== undefined || input.systemPrompt !== undefined) {
          invalidateStarterCache(input.id).catch(() => {});
        }

        // Delete existing agents, tools, and flows
        const existingAgents = await tx
          .select({ id: agencyAgents.id })
          .from(agencyAgents)
          .where(eq(agencyAgents.agencyId, input.id));
        const existingAgentIds = existingAgents.map((a) => a.id);

        if (existingAgentIds.length > 0) {
          await tx.delete(agencyAgentTools).where(inArray(agencyAgentTools.agentId, existingAgentIds));
        }
        await tx.delete(agencyCommunicationFlows).where(eq(agencyCommunicationFlows.agencyId, input.id));
        await tx.delete(agencyAgents).where(eq(agencyAgents.agencyId, input.id));

        // Re-insert agents
        const agentNameToId: Record<string, string> = {};
        for (const agent of input.agents) {
          const agentId = crypto.randomUUID();
          agentNameToId[agent.name] = agentId;

          await tx.insert(agencyAgents).values({
            id: agentId,
            agencyId: input.id,
            name: agent.name,
            description: agent.description ?? null,
            nodeType: agent.nodeType,
            nodeConfig: (agent.nodeConfig ?? null) as any,
            instructions: agent.instructions ?? null,
            model: agent.model ?? null,
            modelSettings: agent.modelSettings ?? null,
            parallelToolCalls: agent.parallelToolCalls,
            maxTurns: agent.maxTurns,
            isEntryPoint: agent.isEntryPoint,
            isOptional: agent.isOptional,
            position: agent.position ?? null,
            outputSchema: (agent.outputSchema ?? null) as any,
            examples: agent.examples ? (() => {
              try { return sanitizeExamples(agent.examples!) as any; }
              catch (e: any) { throw new TRPCError({ code: "BAD_REQUEST", message: e.message ?? "Invalid examples" }); }
            })() : null,
          });

          if (agent.toolIds?.length) {
            for (const toolId of agent.toolIds) {
              const toolConfig = agent.toolConfigs?.[toolId] ?? null;
              await tx.insert(agencyAgentTools).values({
                id: crypto.randomUUID(),
                agentId,
                toolId,
                toolConfig: toolConfig as any,
              });
            }
          }
        }

        // Re-insert communication flows
        if (input.communicationFlows?.length) {
          for (const flow of input.communicationFlows) {
            const fromId = agentNameToId[flow.fromAgentName];
            const toId = agentNameToId[flow.toAgentName];
            if (!fromId || !toId) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `Invalid flow: agent "${!fromId ? flow.fromAgentName : flow.toAgentName}" not found`,
              });
            }
            await tx.insert(agencyCommunicationFlows).values({
              id: crypto.randomUUID(),
              agencyId: input.id,
              fromAgentId: fromId,
              toAgentId: toId,
              flowType: flow.flowType,
              flowConfig: flow.flowConfig ?? null,
            });
          }
        }

        // Save version snapshot (deduped by SHA-256 content hash, cap at 50)
        const snapshotJson = { nodes: input.agents, edges: input.communicationFlows ?? [], name: input.name ?? (agency as any).name };
        const contentHash = crypto.createHash("sha256").update(JSON.stringify(snapshotJson)).digest("hex");

        // Only insert if content has changed since last version
        const [lastVersion] = await tx
          .select({ contentHash: agencyVersions.contentHash, versionNumber: agencyVersions.versionNumber })
          .from(agencyVersions)
          .where(eq(agencyVersions.agencyId, input.id))
          .orderBy(desc(agencyVersions.createdAt))
          .limit(1);

        if (!lastVersion || lastVersion.contentHash !== contentHash) {
          const nextVersionNum = (lastVersion?.versionNumber ?? 0) + 1;
          await tx.insert(agencyVersions).values({
            agencyId: input.id,
            tenantId,
            versionNumber: nextVersionNum,
            snapshotJson: snapshotJson as any,
            contentHash,
            changeDescription: input.changeDescription ?? null,
            createdByUserId: userId,
          });

          // Prune to max 50 versions
          await tx.execute(sql`
            DELETE FROM agency_versions
            WHERE "agencyId" = ${input.id}
              AND id NOT IN (
                SELECT id FROM agency_versions WHERE "agencyId" = ${input.id}
                ORDER BY "createdAt" DESC LIMIT 50
              )
          `);
        }

        // Generate SVG preview from current agents + flows
        const svgAgents = await tx
          .select({ id: agencyAgents.id, name: agencyAgents.name, nodeType: agencyAgents.nodeType, position: agencyAgents.position })
          .from(agencyAgents)
          .where(eq(agencyAgents.agencyId, input.id));

        const svgFlows = await tx
          .select({ fromAgentId: agencyCommunicationFlows.fromAgentId, toAgentId: agencyCommunicationFlows.toAgentId })
          .from(agencyCommunicationFlows)
          .where(eq(agencyCommunicationFlows.agencyId, input.id));

        const previewSvg = generateAgencySvg(svgAgents, svgFlows);

        // Auto-generate trigger phrases from agency name, description, and agent names
        const triggerPhrases = generateTriggerPhrases(
          input.name ?? agency.name,
          input.description ?? agency.description ?? "",
          input.agents.map((a) => a.name),
        );

        await tx.update(agencies).set({ previewSvg, triggerPhrases, updatedAt: new Date() }).where(eq(agencies.id, input.id));
      });

      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
      await assertAgencyEnabled(tenantId);
      const userId = ctx.user!.id;
      const isAdmin = ctx.user!.role === "admin";

      const [agency] = await db
        .select()
        .from(agencies)
        .where(eq(agencies.id, input.id))
        .limit(1);

      if (!agency) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });
      }
      if (agency.tenantId !== tenantId && !isAdmin) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });
      }
      if (agency.createdBy !== userId && !isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to delete this agency" });
      }

      // Soft delete
      await db
        .update(agencies)
        .set({ status: "archived", isPublished: false })
        .where(eq(agencies.id, input.id));

      return { success: true };
    }),

  // --- Conversations ---

  listConversations: protectedProcedure
    .input(
      z.object({
        agencyId: z.string().uuid(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
      await assertAgencyEnabled(tenantId);
      const userId = ctx.user!.id;

      // M-1: Verify agency belongs to this tenant
      const [agency] = await db
        .select({ id: agencies.id })
        .from(agencies)
        .where(and(eq(agencies.id, input.agencyId), eq(agencies.tenantId, tenantId)))
        .limit(1);
      if (!agency) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });
      }

      const result = await db
        .select()
        .from(agencyConversations)
        .where(
          and(
            eq(agencyConversations.agencyId, input.agencyId),
            eq(agencyConversations.userId, userId),
            eq(agencyConversations.isArchived, false),
          ),
        )
        .orderBy(desc(agencyConversations.updatedAt))
        .limit(input.limit)
        .offset(input.offset);

      return { conversations: result };
    }),

  createConversation: protectedProcedure
    .input(
      z.object({
        agencyId: z.string().uuid(),
        title: z.string().max(255).default("New Agency Chat"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
      await assertAgencyEnabled(tenantId);
      const userId = ctx.user!.id;

      // Validate agency exists in tenant or is a system template
      const [agency] = await db
        .select()
        .from(agencies)
        .where(and(
          eq(agencies.id, input.agencyId),
          or(
            eq(agencies.tenantId, tenantId),
            and(eq(agencies.tenantId, "__system__"), eq(agencies.visibility, "template")),
          ),
        ))
        .limit(1);

      if (!agency) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });
      }

      // M-2: Non-owners can only create conversations on published or template agencies
      const isTemplate = (agency as any).visibility === "template";
      if (!isTemplate && (agency as any).status !== "published" && (agency as any).createdBy !== userId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Agency is not published" });
      }

      const conversationId = crypto.randomUUID();
      await db.insert(agencyConversations).values({
        id: conversationId,
        agencyId: input.agencyId,
        userId,
        title: input.title,
      });

      return { id: conversationId };
    }),

  // --- Run (delegates to Python) ---

  sendMessage: agencyMessageProcedure
    .input(
      z.object({
        agencyId: z.string().uuid(),
        conversationId: z.string().uuid(),
        message: z.string().min(1).max(10000),
        retrievalScopeOverride: z.object({
          mode: z.enum(["tenant_accessible", "library_only", "web_fallback"]),
        }).optional(),
        /** v1.8: Target a specific agent by name */
        recipientAgent: z.string().max(100).optional(),
        /** v1.8: File IDs to include with the message */
        fileIds: z.array(z.string()).max(20).optional(),
        /** v1.8: Per-run instruction override */
        additionalInstructions: z.string().max(5000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
      await assertAgencyEnabled(tenantId);
      const userId = ctx.user!.id;
      const userToken = ctx.userToken ?? "";

      // Validate conversation belongs to user AND the correct agency
      const [conv] = await db
        .select()
        .from(agencyConversations)
        .where(
          and(
            eq(agencyConversations.id, input.conversationId),
            eq(agencyConversations.agencyId, input.agencyId),
            eq(agencyConversations.userId, userId),
          ),
        )
        .limit(1);

      if (!conv) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conversation not found",
        });
      }

      const resolvedRetrievalScope = await resolveAgencyRetrievalScope({
        agencyId: input.agencyId,
        tenantId,
        userId,
        overrideMode: input.retrievalScopeOverride?.mode ?? null,
        dbClient: db,
      });

      // Wire task planner for agency execution tracking
      const plannerResult = await runPlanner({
        sourceType: "agency",
        userId,
        tenantId,
        isAgencyEscalation: true,
      }).catch(() => null);

      const taskMetadata = plannerResult
        ? buildAgencyTaskMetadata({
            taskRunId: plannerResult.taskRunId,
            plan: plannerResult.plan,
            routeReason: "agency:direct_request",
          })
        : undefined;

      const agencyStartTime = Date.now();
      const result = await agencyBridge.executeRun({
        agencyId: input.agencyId,
        conversationId: input.conversationId,
        message: input.message,
        retrievalScope: resolvedRetrievalScope,
        userToken,
        tenantId,
        userId,
        taskMetadata,
        recipientAgent: input.recipientAgent,
        fileIds: input.fileIds,
        additionalInstructions: input.additionalInstructions,
      });

      if (plannerResult) {
        recordStepAttempt({
          taskRunId: plannerResult.taskRunId,
          plan: plannerResult.plan,
          model: "agency",
          inputTokens: 0,
          outputTokens: 0,
          durationMs: Date.now() - agencyStartTime,
        }).catch(() => {});
      }

      // --- Channel bridge fan-out (section-08) ---
      try {
        const { channelGateway } = await import("../services/channelGateway");
        const hasChannels = await channelGateway.hasActiveChannels(
          input.conversationId,
          "agency",
        );
        if (hasChannels && (result as any).messages?.length) {
          const lastAssistant = [...(result as any).messages]
            .reverse()
            .find((m: any) => m.role === "assistant");
          if (lastAssistant) {
            await channelGateway.emitEgress({
              eventId: crypto.randomUUID(),
              conversationId: input.conversationId,
              conversationType: "agency",
              messageId: String(lastAssistant.id ?? ""),
              tenantId,
              targets: [],
              rendering: {
                plainText: lastAssistant.content ?? "",
              },
            });
          }
        }
      } catch (err) {
        console.error("[Agency] emitEgress failed:", err);
      }

      const preview = buildAgencyPreview(result);
      recordAgencyPreviewMetric("structured_result_parse", {
        agencyId: input.agencyId,
        tenantId,
        runId: result.runId,
        status: result.structuredResult ? "success" : "none",
        hasPreview: Boolean(preview),
      });

      return {
        ...result,
        preview,
      };
    }),

  getRunPreview: protectedProcedure
    .input(
      z.object({
        agencyId: z.string().uuid(),
        runId: z.string().uuid(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
      await assertAgencyEnabled(tenantId);
      const userId = ctx.user!.id;
      const userToken = ctx.userToken ?? "";
      const expiredCount = await expireRunPreviewArtifacts({
        runId: input.runId,
        tenantId,
        dbClient: db,
      });
      if (expiredCount > 0) {
        recordAgencyPreviewMetric("preview_expired", {
          agencyId: input.agencyId,
          tenantId,
          runId: input.runId,
          count: expiredCount,
        });
      }
      const result = await agencyBridge.getRunDetails(input.agencyId, input.runId, userToken);

      if (!result.conversationId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Run conversation not found",
        });
      }

      const [conv] = await db
        .select()
        .from(agencyConversations)
        .where(
          and(
            eq(agencyConversations.id, result.conversationId),
            eq(agencyConversations.agencyId, input.agencyId),
            eq(agencyConversations.userId, userId),
          ),
        )
        .limit(1);

      if (!conv) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conversation not found",
        });
      }

      return {
        ...result,
        preview: buildAgencyPreview(result),
      };
    }),

  commitPreview: protectedProcedure
    .input(
      z.object({
        agencyId: z.string().uuid(),
        runId: z.string().uuid(),
        artifactId: z.string().uuid(),
        commitToken: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
      await assertAgencyEnabled(tenantId);
      const userId = ctx.user!.id;
      const userToken = ctx.userToken ?? "";
      const expiredCount = await expireRunPreviewArtifacts({
        runId: input.runId,
        tenantId,
        dbClient: db,
      });
      if (expiredCount > 0) {
        recordAgencyPreviewMetric("preview_expired", {
          agencyId: input.agencyId,
          tenantId,
          runId: input.runId,
          count: expiredCount,
        });
      }
      const result = await agencyBridge.getRunDetails(input.agencyId, input.runId, userToken);

      if (!result.conversationId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Run conversation not found",
        });
      }

      const [conv] = await db
        .select()
        .from(agencyConversations)
        .where(
          and(
            eq(agencyConversations.id, result.conversationId),
            eq(agencyConversations.agencyId, input.agencyId),
            eq(agencyConversations.userId, userId),
          ),
        )
        .limit(1);

      if (!conv) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conversation not found",
        });
      }

      const [artifactRecord] = await db
        .select()
        .from(agencyRunArtifacts)
        .where(
          and(
            eq(agencyRunArtifacts.id, input.artifactId),
            eq(agencyRunArtifacts.runId, input.runId),
            eq(agencyRunArtifacts.agencyId, input.agencyId),
            eq(agencyRunArtifacts.tenantId, tenantId),
          ),
        )
        .limit(1);

      if (!artifactRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Preview artifact not found",
        });
      }

      const matchedArtifact = result.previewArtifacts.find((artifact) => artifact.id === input.artifactId);
      const preview = matchedArtifact
        ? buildAgencyPreview({
          ...result,
          previewArtifacts: [matchedArtifact],
        })
        : null;

      if (preview?.previewType === "deck") {
        const deckCommitEnabled = await getTenantFeatureFlag("AGENCY_DECK_COMMIT_ENABLED", tenantId);
        if (!deckCommitEnabled) {
          recordAgencyPreviewMetric("commit_blocked", {
            agencyId: input.agencyId,
            tenantId,
            runId: input.runId,
            artifactId: input.artifactId,
            reason: "deck_commit_disabled",
          });
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Deck commit is disabled for this tenant",
          });
        }
      } else if (preview) {
        const libraryCommitEnabled = await getTenantFeatureFlag("AGENCY_LIBRARY_COMMIT_ENABLED", tenantId);
        if (!libraryCommitEnabled) {
          recordAgencyPreviewMetric("commit_blocked", {
            agencyId: input.agencyId,
            tenantId,
            runId: input.runId,
            artifactId: input.artifactId,
            reason: "library_commit_disabled",
          });
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Preview commit is disabled for this tenant",
          });
        }
      }

      try {
        const commitParams = {
          actor: {
            userId,
            tenantId,
            role: ctx.user?.role,
          },
          artifactRecord: {
            id: artifactRecord.id,
            runId: artifactRecord.runId,
            tenantId: artifactRecord.tenantId,
            commitToken: artifactRecord.commitToken,
            commitStatus: artifactRecord.commitStatus,
            targetType: artifactRecord.targetType,
            targetId: artifactRecord.targetId,
          },
          commitToken: input.commitToken,
          preview,
        };

        const commitResult = preview?.previewType === "deck"
          ? await commitPresentationPreview(commitParams)
          : await commitLibraryBackedPreview(commitParams);

        recordAgencyPreviewMetric("commit_success", {
          agencyId: input.agencyId,
          tenantId,
          runId: input.runId,
          artifactId: input.artifactId,
          previewType: preview?.previewType ?? null,
          targetType: commitResult.targetType,
          duplicateSuppressed: artifactRecord.commitStatus === "committed",
        });

        return {
          ok: true,
          ...commitResult,
        };
      } catch (error) {
        if (error instanceof AgencyPreviewCommitError) {
          recordAgencyPreviewMetric("commit_failure", {
            agencyId: input.agencyId,
            tenantId,
            runId: input.runId,
            artifactId: input.artifactId,
            reason: error.code,
          });
          const code = error.code === "PERMISSION_DENIED"
            ? "FORBIDDEN"
            : error.code === "ARTIFACT_NOT_FOUND"
              ? "NOT_FOUND"
              : "PRECONDITION_FAILED";
          throw new TRPCError({ code, message: error.message });
        }
        throw error;
      }
    }),

  // --- Admin ---

  adminListAgencies: adminProcedure
    .input(
      z.object({
        tenantId: z.string().optional(),
        status: z.enum(["draft", "published", "archived"]).optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conditions: any[] = [];
      if (input.tenantId) {
        conditions.push(eq(agencies.tenantId, input.tenantId));
      }
      if (input.status) {
        conditions.push(eq(agencies.status, input.status));
      }

      const result = await db
        .select()
        .from(agencies)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(agencies.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return { agencies: result };
    }),

  adminToggleTenant: adminProcedure
    .input(
      z.object({
        tenantId: z.string(),
        enabled: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await setTenantFeatureFlag("AGENCY_SWARM_ENABLED", input.tenantId, input.enabled);
      return { success: true, tenantId: input.tenantId, enabled: input.enabled };
    }),

  adminKillRun: adminProcedure
    .input(
      z.object({
        agencyId: z.string().uuid(),
        runId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userToken = ctx.userToken ?? "";
      await agencyBridge.cancelRun(input.agencyId, input.runId, userToken);
      return { success: true };
    }),

  // --- Admin: Quotas ---

  adminSetQuotas: adminProcedure
    .input(
      z.object({
        tenantId: z.string(),
        maxAgencies: z.number().min(0).max(100).optional(),
        maxConcurrentRuns: z.number().min(0).max(50).optional(),
        maxCreditPerRun: z.number().min(0).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const quotaEntries: Array<{ key: string; value: string }> = [];
      if (input.maxAgencies !== undefined) {
        quotaEntries.push({
          key: `tenant_${input.tenantId}_maxAgencies`,
          value: String(input.maxAgencies),
        });
      }
      if (input.maxConcurrentRuns !== undefined) {
        quotaEntries.push({
          key: `tenant_${input.tenantId}_maxConcurrentRuns`,
          value: String(input.maxConcurrentRuns),
        });
      }
      if (input.maxCreditPerRun !== undefined) {
        quotaEntries.push({
          key: `tenant_${input.tenantId}_maxCreditPerRun`,
          value: String(input.maxCreditPerRun),
        });
      }

      await db.transaction(async (tx) => {
        for (const entry of quotaEntries) {
          // Upsert: delete then insert within transaction
          await tx
            .delete(systemSettings)
            .where(
              and(
                eq(systemSettings.category, "agency_quotas"),
                eq(systemSettings.key, entry.key),
              ),
            );
          await tx.insert(systemSettings).values({
            category: "agency_quotas",
            key: entry.key,
            value: entry.value,
            updatedBy: ctx.user!.id,
          });
        }
      });

      return { success: true };
    }),

  adminGetQuotas: adminProcedure
    .input(z.object({ tenantId: z.string() }))
    .query(async ({ ctx, input }) => {
      const rows = await db
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.category, "agency_quotas"));

      const prefix = `tenant_${input.tenantId}_`;
      const quotas: Record<string, number> = {
        maxAgencies: 10,
        maxConcurrentRuns: 5,
        maxCreditPerRun: 100,
      };

      for (const row of rows) {
        if (row.key.startsWith(prefix) && row.value) {
          const quotaName = row.key.slice(prefix.length);
          const parsed = parseInt(row.value, 10);
          if (!isNaN(parsed)) {
            quotas[quotaName] = parsed;
          }
        }
      }

      return quotas;
    }),

  // --- Admin: Tool Whitelists ---

  // --- Version History ---

  listVersions: protectedProcedure
    .input(z.object({ agencyId: z.string().uuid(), limit: z.number().min(1).max(50).default(30) }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
      await assertAgencyEnabled(tenantId);

      const [agency] = await db
        .select({ id: agencies.id })
        .from(agencies)
        .where(and(eq(agencies.id, input.agencyId), eq(agencies.tenantId, tenantId)))
        .limit(1);
      if (!agency) throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });

      const versions = await db
        .select({
          id: agencyVersions.id,
          versionNumber: agencyVersions.versionNumber,
          contentHash: agencyVersions.contentHash,
          changeDescription: agencyVersions.changeDescription,
          createdByUserId: agencyVersions.createdByUserId,
          createdAt: agencyVersions.createdAt,
        })
        .from(agencyVersions)
        .where(eq(agencyVersions.agencyId, input.agencyId))
        .orderBy(desc(agencyVersions.createdAt))
        .limit(input.limit);

      return { versions };
    }),

  restoreVersion: protectedProcedure
    .input(z.object({ versionId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
      await assertAgencyEnabled(tenantId);
      const userId = ctx.user!.id;
      const isAdmin = ctx.user!.role === "admin";

      const [version] = await db
        .select()
        .from(agencyVersions)
        .where(eq(agencyVersions.id, input.versionId))
        .limit(1);
      if (!version) throw new TRPCError({ code: "NOT_FOUND", message: "Version not found" });

      // Verify agency ownership
      const [agency] = await db
        .select()
        .from(agencies)
        .where(and(eq(agencies.id, version.agencyId), eq(agencies.tenantId, tenantId)))
        .limit(1);
      if (!agency) throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });
      if ((agency as any).createdBy !== userId && !isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized" });
      }

      const snapshot = version.snapshotJson as any;
      // SECURITY: Validate snapshot nodeTypes against current allowlist before restoring
      const VALID_NODE_TYPES = new Set([
        "agent", "supervisor", "router", "aggregator",
        "knowledge_base", "skill_call", "human_approval", "browser_session",
        "conditional_branch", "parallel_fan_out", "loop_retry", "skill_discovery",
        "data_transform", "error_handler",
      ]);
      for (const node of (snapshot.nodes ?? [])) {
        if (node.nodeType && !VALID_NODE_TYPES.has(node.nodeType)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Invalid node type '${node.nodeType}' in snapshot` });
        }
        // Sanitize nodeConfig size
        if (node.nodeConfig && JSON.stringify(node.nodeConfig).length > 32768) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `nodeConfig too large for node '${node.name}'` });
        }
      }
      await db.transaction(async (tx) => {
        const existingAgents = await tx
          .select({ id: agencyAgents.id })
          .from(agencyAgents)
          .where(eq(agencyAgents.agencyId, version.agencyId));
        const existingAgentIds = existingAgents.map((a) => a.id);

        if (existingAgentIds.length > 0) {
          await tx.delete(agencyAgentTools).where(inArray(agencyAgentTools.agentId, existingAgentIds));
        }
        await tx.delete(agencyCommunicationFlows).where(eq(agencyCommunicationFlows.agencyId, version.agencyId));
        await tx.delete(agencyAgents).where(eq(agencyAgents.agencyId, version.agencyId));

        const nameToId: Record<string, string> = {};
        for (const node of (snapshot.nodes ?? [])) {
          const agentId = crypto.randomUUID();
          nameToId[node.name] = agentId;
          // Normalise legacy snake_case modelSettings keys from old snapshots
          let ms = node.modelSettings ?? null;
          if (ms && ("max_tokens" in ms || "top_p" in ms)) {
            ms = {
              maxTokens: ms.max_tokens ?? ms.maxTokens,
              temperature: ms.temperature,
              topP: ms.top_p ?? ms.topP,
              reasoningEffort: ms.reasoningEffort,
            };
          }
          await tx.insert(agencyAgents).values({
            id: agentId,
            agencyId: version.agencyId,
            name: node.name,
            description: node.description ?? null,
            nodeType: node.nodeType ?? "agent",
            nodeConfig: node.nodeConfig ?? null,
            instructions: node.instructions ?? null,
            model: node.model ?? null,
            modelSettings: ms,
            parallelToolCalls: node.parallelToolCalls ?? true,
            maxTurns: node.maxTurns ?? 25,
            isEntryPoint: node.isEntryPoint ?? false,
            isOptional: node.isOptional ?? false,
            position: node.position ?? null,
          });
          if (node.toolIds?.length) {
            for (const toolId of node.toolIds) {
              await tx.insert(agencyAgentTools).values({
                id: crypto.randomUUID(),
                agentId,
                toolId,
                toolConfig: node.toolConfigs?.[toolId] ?? null,
              });
            }
          }
        }
        for (const edge of (snapshot.edges ?? [])) {
          const fromId = nameToId[edge.fromAgentName];
          const toId = nameToId[edge.toAgentName];
          if (fromId && toId) {
            await tx.insert(agencyCommunicationFlows).values({
              id: crypto.randomUUID(),
              agencyId: version.agencyId,
              fromAgentId: fromId,
              toAgentId: toId,
              flowType: edge.flowType ?? "delegation",
              flowConfig: edge.flowConfig ?? null,
            });
          }
        }
      });

      return { success: true };
    }),

  adminSetToolWhitelist: adminProcedure
    .input(
      z.object({
        agencyId: z.string().uuid(),
        toolIds: z.array(z.string().min(1).max(100)),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await db.transaction(async (tx) => {
        // Get all agents for this agency
        const agents = await tx
          .select({ id: agencyAgents.id })
          .from(agencyAgents)
          .where(eq(agencyAgents.agencyId, input.agencyId));

        const agentIds = agents.map((a) => a.id);

        // Delete existing tool assignments for all agents
        if (agentIds.length > 0) {
          await tx
            .delete(agencyAgentTools)
            .where(inArray(agencyAgentTools.agentId, agentIds));
        }

        // Insert new tool assignments for each agent
        for (const agentId of agentIds) {
          for (const toolId of input.toolIds) {
            await tx.insert(agencyAgentTools).values({
              id: crypto.randomUUID(),
              agentId,
              toolId,
            });
          }
        }
      });

      return { success: true };
    }),

  adminGetToolWhitelist: adminProcedure
    .input(z.object({ agencyId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const agents = await db
        .select({ id: agencyAgents.id })
        .from(agencyAgents)
        .where(eq(agencyAgents.agencyId, input.agencyId));

      const agentIds = agents.map((a: { id: string }) => a.id);
      if (agentIds.length === 0) return { tools: [] };

      const toolAssignments = await db
        .select()
        .from(agencyAgentTools)
        .where(inArray(agencyAgentTools.agentId, agentIds));

      // Deduplicate tool IDs
      const uniqueToolIds = [...new Set(toolAssignments.map((t: { toolId: string }) => t.toolId))];
      return { tools: uniqueToolIds };
    }),

  // --- Admin: Kill All Runs ---

  adminKillAllRuns: adminProcedure
    .input(z.object({ tenantId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userToken = ctx.userToken ?? "";

      // Query active agency runs for this tenant from Python backend
      const activeAgencies = await db
        .select({ id: agencies.id })
        .from(agencies)
        .where(eq(agencies.tenantId, input.tenantId));

      let cancelledCount = 0;
      for (const agency of activeAgencies) {
        try {
          const runs = await agencyBridge.listRuns(agency.id, userToken, {
            status: "running,queued",
            limit: 100,
          });
          for (const run of runs.runs) {
            try {
              await agencyBridge.cancelRun(agency.id, run.id, userToken);
              cancelledCount++;
            } catch {
              // Continue cancelling other runs
            }
          }
        } catch {
          // Agency may not have active runs
        }
      }

      return { cancelledCount };
    }),

  // --- Admin: Metrics ---

  adminGetMetrics: adminProcedure
    .input(
      z.object({
        agencyId: z.string().uuid().optional(),
        tenantId: z.string().optional(),
        windowHours: z.number().min(1).max(168).default(24),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Query aggregated metrics from agency_runs using parameterized queries
      const conditions: ReturnType<typeof sql>[] = [];

      if (input.agencyId) {
        conditions.push(sql`agency_id = ${input.agencyId}`);
      }
      if (input.tenantId) {
        conditions.push(sql`tenant_id = ${input.tenantId}`);
      }
      conditions.push(
        sql`started_at > NOW() - INTERVAL '1 hour' * ${input.windowHours}`,
      );

      const whereClause = sql.join(conditions, sql` AND `);

      const result = await db.instance.execute(sql`
        SELECT
          COUNT(*) as total_runs,
          COUNT(*) FILTER (WHERE status = 'failed') as failed_runs,
          COUNT(*) FILTER (WHERE status = 'completed') as completed_runs,
          COALESCE(AVG(duration_ms), 0) as avg_duration_ms,
          COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms), 0) as p95_latency_ms,
          COALESCE(AVG(step_count), 0) as avg_step_count
        FROM agency_runs
        WHERE ${whereClause}
      `);

      const row = (result as unknown[])?.[0] as Record<string, unknown> ?? {};
      const totalRuns = Number(row.total_runs ?? 0);
      const failedRuns = Number(row.failed_runs ?? 0);
      const completedRuns = Number(row.completed_runs ?? 0);

      return {
        successRate: totalRuns > 0 ? completedRuns / totalRuns : 0,
        p95Latency: Number(row.p95_latency_ms ?? 0),
        totalRuns,
        failedRuns,
        avgStepCount: Number(row.avg_step_count ?? 0),
      };
    }),

  adminGetAlerts: adminProcedure
    .input(
      z.object({
        tenantId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Simple alert check from DB stats using parameterized queries
      const conditions: ReturnType<typeof sql>[] = [
        sql`started_at > NOW() - INTERVAL '1 hour'`,
      ];
      if (input.tenantId) {
        conditions.push(sql`tenant_id = ${input.tenantId}`);
      }
      const whereClause = sql.join(conditions, sql` AND `);

      const result = await db.instance.execute(sql`
        SELECT
          agency_id,
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'failed') as failed,
          COUNT(*) FILTER (WHERE status = 'completed') as completed
        FROM agency_runs
        WHERE ${whereClause}
        GROUP BY agency_id
        HAVING COUNT(*) > 0
      `);

      const alerts: Array<{
        agencyId: string;
        metric: string;
        value: number;
        threshold: number;
      }> = [];

      for (const row of (result as unknown as Record<string, unknown>[]) ?? []) {
        const total = Number(row.total);
        const failed = Number(row.failed);
        const successRate = total > 0 ? (total - failed) / total : 1;

        if (successRate < 0.9) {
          alerts.push({
            agencyId: String(row.agency_id ?? ""),
            metric: "success_rate",
            value: successRate,
            threshold: 0.9,
          });
        }
      }

      return { alerts };
    }),



  // --- Creator Revenue ---

  getCreatorEarnings: protectedProcedure
    .input(
      z.object({
        entityType: z.enum(["agency", "workflow", "skill"]).optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { getCreatorEarnings } = await import("../services/creatorRevenueService");
      const settlements = await getCreatorEarnings(ctx.user!.id, {
        entityType: input.entityType as any,
        limit: input.limit,
        offset: input.offset,
        startDate: input.startDate,
        endDate: input.endDate,
      });
      return { settlements };
    }),

  getCreatorDashboard: protectedProcedure.query(async ({ ctx }) => {
    const { getCreatorDashboard } = await import("../services/creatorRevenueService");
    return getCreatorDashboard(ctx.user!.id);
  }),

  // --- AI Agency Creator ---

  /**
   * Submit agency creation to queue. Returns taskId immediately.
   * Frontend polls autoCreateStatus for phase updates.
   */
  autoCreate: protectedProcedure
    .use(createRateLimitMiddleware({ namespace: "agency-create", limit: 5, windowMs: 60_000 }))
    .input(
      z.object({
        requirement: z.string().min(10).max(10000),
        specFileBase64: z.string().max(10_000_000).optional(),
        model: z.string().max(100).optional(),
        skipInterview: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { ENV } = await import("../_core/env");
      const pythonBackendUrl = (ENV.pythonBackendUrl || "http://localhost:8000").replace(/\/+$/, "");

      const response = await fetch(`${pythonBackendUrl}/api/v1/agency-creator/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${ctx.userToken ?? ""}`,
        },
        body: JSON.stringify({
          requirement: input.requirement,
          spec_file_base64: input.specFileBase64 ?? null,
          model: input.model,
          skip_interview: input.skipInterview,
          user_id: ctx.user!.id,
          tenant_id: ctx.tenantId ?? String(ctx.user!.currentTenantId ?? ""),
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: `HTTP ${response.status}` }));
        throw new TRPCError({ code: "BAD_REQUEST", message: err.detail || "Failed to start agency creator" });
      }

      const data = await response.json();
      return { taskId: data.task_id as string };
    }),

  /**
   * Poll agency creator task status.
   */
  autoCreateStatus: protectedProcedure
    .input(z.object({ taskId: z.string().regex(/^agcreate-[a-f0-9]{12}$/) }))
    .query(async ({ ctx, input }) => {
      const { ENV } = await import("../_core/env");
      const pythonBackendUrl = (ENV.pythonBackendUrl || "http://localhost:8000").replace(/\/+$/, "");

      const response = await fetch(
        `${pythonBackendUrl}/api/v1/agency-creator/status/${encodeURIComponent(input.taskId)}`,
        {
          headers: { "Authorization": `Bearer ${ctx.userToken ?? ""}` },
        },
      );

      if (!response.ok) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
      }

      const data = await response.json();

      // SECURITY: Verify the task belongs to the requesting user
      // The Python backend stores _user_id in Redis status (stripped before client response)
      if (data._user_id !== undefined && data._user_id !== ctx.user!.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
      }

      // Strip internal fields before returning to client
      const { _user_id, ...safeData } = data;
      return safeData as {
        status: "queued" | "processing" | "awaiting_answers" | "completed" | "failed";
        phase?: string;
        message?: string;
        questions?: Array<{ id: string; question: string; type: string }>;
        previewJson?: unknown;
        agencyId?: string;
        guide?: string;
        error?: string;
      };
    }),

  /**
   * Submit interview answers — resumes design task.
   */
  autoCreateAnswer: protectedProcedure
    .input(
      z.object({
        taskId: z.string().regex(/^agcreate-[a-f0-9]{12}$/),
        answers: z.record(z.string(), z.string()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { ENV } = await import("../_core/env");
      const pythonBackendUrl = (ENV.pythonBackendUrl || "http://localhost:8000").replace(/\/+$/, "");

      const response = await fetch(`${pythonBackendUrl}/api/v1/agency-creator/answer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${ctx.userToken ?? ""}`,
        },
        body: JSON.stringify({ task_id: input.taskId, answers: input.answers }),
      });

      if (!response.ok) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Failed to submit answers" });
      }

      return { ok: true };
    }),

  toggleToolExposure: adminProcedure
    .input(
      z.object({
        toolId: z.string().uuid(),
        exposed: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Feature flag guard
      const { getFeatureFlag } = await import("../services/featureFlags");
      const flagEnabled = await getFeatureFlag("AGENCY_TOOL_API_ENABLED");
      if (!flagEnabled) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Agency Tool API feature is not enabled",
        });
      }

      const drizzle = db.instance;

      // Atomic update with tenant isolation in WHERE clause
      const result = await drizzle
        .update(agencyTools)
        .set({
          isExposedAsApi: input.exposed,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(agencyTools.id, input.toolId),
            eq(agencyTools.tenantId, ctx.tenantId),
          ),
        )
        .returning({ id: agencyTools.id });

      if (result.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Tool not found or not accessible" });
      }

      return { success: true };
    }),

  adminGetRevenueStats: adminProcedure
    .input(
      z.object({
        tenantId: z.string().optional(),
        windowDays: z.number().min(1).max(365).default(30),
      }),
    )
    .query(async ({ input }) => {
      const { getAdminRevenueStats } = await import("../services/creatorRevenueService");
      return getAdminRevenueStats({
        tenantId: input.tenantId,
        windowDays: input.windowDays,
      });
    }),

  // --- Marketplace (public) ---

  listMarketplace: publicProcedure
    .input(
      z.object({
        search: z.string().max(200).optional(),
        limit: z.number().min(1).max(100).default(24),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ input }) => {
      const conditions: any[] = [
        eq(agencies.isPublished, true),
        eq(agencies.visibility, "public"),
        eq(agencies.status, "published"),
      ];

      if (input.search) {
        const searchPattern = `%${input.search}%`;
        conditions.push(
          sql`(${agencies.name} ILIKE ${searchPattern} OR ${agencies.description} ILIKE ${searchPattern})`,
        );
      }

      const whereClause = and(...conditions);

      const items = await db
        .select({
          id: agencies.id,
          name: agencies.name,
          description: agencies.description,
          creatorFeeCredits: agencies.creatorFeeCredits,
          ownerName: users.name,
          agentCount: sql<number>`(SELECT count(*)::int FROM agency_agents WHERE "agencyId" = ${agencies.id})`.as("agentCount"),
          createdAt: agencies.createdAt,
        })
        .from(agencies)
        .leftJoin(users, eq(agencies.createdBy, users.id))
        .where(whereClause)
        .orderBy(desc(agencies.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      const [countResult] = await db
        .select({ cnt: count() })
        .from(agencies)
        .where(whereClause);

      return { items, total: countResult.cnt };
    }),

  getMarketplaceAgency: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const [agency] = await db
        .select({
          id: agencies.id,
          name: agencies.name,
          description: agencies.description,
          previewSvg: agencies.previewSvg,
          creatorFeeCredits: agencies.creatorFeeCredits,
          ownerName: users.name,
          createdAt: agencies.createdAt,
        })
        .from(agencies)
        .leftJoin(users, eq(agencies.createdBy, users.id))
        .where(
          and(
            eq(agencies.id, input.id),
            eq(agencies.isPublished, true),
            eq(agencies.visibility, "public"),
            eq(agencies.status, "published"),
          ),
        )
        .limit(1);

      if (!agency) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });
      }

      // Sanitize SVG
      let safeSvg = agency.previewSvg;
      if (safeSvg && /<script/i.test(safeSvg)) {
        console.error("[Security] Rejected poisoned previewSvg from DB, agencyId:", input.id);
        safeSvg = null;
      }

      // Get agents (public info only — no instructions/prompts)
      const agents = await db
        .select({
          id: agencyAgents.id,
          name: agencyAgents.name,
          nodeType: agencyAgents.nodeType,
          isEntryPoint: agencyAgents.isEntryPoint,
        })
        .from(agencyAgents)
        .where(eq(agencyAgents.agencyId, input.id))
        .orderBy(desc(agencyAgents.isEntryPoint), asc(agencyAgents.name));

      return { ...agency, previewSvg: safeSvg, agents };
    }),

  useMarketplaceAgency: protectedProcedure
    .input(z.object({ agencyId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
      const userId = ctx.user!.id;

      // Verify source agency is published + public
      const [source] = await db
        .select()
        .from(agencies)
        .where(
          and(
            eq(agencies.id, input.agencyId),
            eq(agencies.isPublished, true),
            eq(agencies.visibility, "public"),
            eq(agencies.status, "published"),
          ),
        )
        .limit(1);

      if (!source) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found or not public" });
      }

      const newAgencyId = crypto.randomUUID();
      const slug = `${source.slug}-copy-${Date.now()}`;

      await db.transaction(async (tx) => {
        // Clone agency record
        await tx.insert(agencies).values({
          id: newAgencyId,
          tenantId,
          slug,
          name: `${source.name} (Copy)`,
          description: source.description,
          systemPrompt: source.systemPrompt,
          creditMultiplier: source.creditMultiplier,
          defaultModel: source.defaultModel,
          maxAgents: source.maxAgents,
          maxRunTimeSeconds: source.maxRunTimeSeconds,
          status: "draft",
          isPublished: false,
          visibility: "private",
          previewSvg: source.previewSvg,
          createdBy: userId,
        });

        // Clone agents
        const sourceAgents = await tx
          .select()
          .from(agencyAgents)
          .where(eq(agencyAgents.agencyId, input.agencyId));

        const agentIdMap = new Map<string, string>();
        for (const agent of sourceAgents) {
          const newAgentId = crypto.randomUUID();
          agentIdMap.set(agent.id, newAgentId);

          await tx.insert(agencyAgents).values({
            id: newAgentId,
            agencyId: newAgencyId,
            name: agent.name,
            description: agent.description,
            nodeType: agent.nodeType,
            nodeConfig: agent.nodeConfig as any,
            instructions: agent.instructions,
            model: agent.model,
            modelSettings: agent.modelSettings as any,
            parallelToolCalls: agent.parallelToolCalls,
            maxTurns: agent.maxTurns,
            isEntryPoint: agent.isEntryPoint,
            isOptional: agent.isOptional,
            position: agent.position as any,
          });

          // Clone agent tools
          const agentTools = await tx
            .select()
            .from(agencyAgentTools)
            .where(eq(agencyAgentTools.agentId, agent.id));

          for (const tool of agentTools) {
            await tx.insert(agencyAgentTools).values({
              id: crypto.randomUUID(),
              agentId: newAgentId,
              toolId: tool.toolId,
              toolConfig: tool.toolConfig as any,
            });
          }
        }

        // Clone communication flows
        const sourceFlows = await tx
          .select()
          .from(agencyCommunicationFlows)
          .where(eq(agencyCommunicationFlows.agencyId, input.agencyId));

        for (const flow of sourceFlows) {
          const newFromId = agentIdMap.get(flow.fromAgentId);
          const newToId = agentIdMap.get(flow.toAgentId);
          if (newFromId && newToId) {
            await tx.insert(agencyCommunicationFlows).values({
              id: crypto.randomUUID(),
              agencyId: newAgencyId,
              fromAgentId: newFromId,
              toAgentId: newToId,
              flowType: flow.flowType,
              flowConfig: flow.flowConfig ?? null,
            });
          }
        }
      });

      return { agencyId: newAgencyId };
    }),

  // --- Publish Request / Approval Flow ---

  requestPublish: protectedProcedure
    .input(z.object({ agencyId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
      const userId = ctx.user!.id;
      const isAdmin = ctx.user!.role === "admin";

      const [agency] = await db
        .select({ id: agencies.id, name: agencies.name, createdBy: agencies.createdBy, tenantId: agencies.tenantId, status: agencies.status, visibility: agencies.visibility })
        .from(agencies)
        .where(and(eq(agencies.id, input.agencyId), eq(agencies.tenantId, tenantId)))
        .limit(1);

      if (!agency) throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });
      if (agency.createdBy !== userId && !isAdmin) throw new TRPCError({ code: "FORBIDDEN", message: "Only the creator can request publish" });
      if (agency.status !== "published") throw new TRPCError({ code: "BAD_REQUEST", message: "Agency must be in 'published' status first (not draft/archived)" });
      if (agency.visibility === "public") throw new TRPCError({ code: "BAD_REQUEST", message: "Agency is already public" });
      if (agency.visibility === "pending_approval") throw new TRPCError({ code: "BAD_REQUEST", message: "A publish request is already pending" });

      // Must have at least 1 agent
      const [agentCount] = await db.select({ cnt: count() }).from(agencyAgents).where(eq(agencyAgents.agencyId, input.agencyId));
      if (!agentCount || agentCount.cnt === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Agency must have at least 1 agent" });

      await db.update(agencies).set({
        visibility: "pending_approval",
        requestedPublishAt: new Date(),
        rejectionReason: null,
        updatedAt: new Date(),
      }).where(eq(agencies.id, input.agencyId));

      // Notify all admins in the tenant
      const admins = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, "admin"));

      for (const admin of admins) {
        await createNotification({
          db: db.instance,
          userId: admin.id,
          type: "system",
          title: "Agency Publish Request",
          content: `Agency "${agency.name}" has been submitted for public publishing review.`,
          priority: "normal",
          relatedResourceType: "agency",
          relatedResourceId: agency.id,
          actionUrl: `/admin/agencies?agencyId=${agency.id}`,
          actionLabel: "Review Agency",
          metadata: { source: "agency.publishRequest" },
        });
      }

      return { success: true };
    }),

  cancelPublishRequest: protectedProcedure
    .input(z.object({ agencyId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
      const userId = ctx.user!.id;

      const [agency] = await db
        .select({ id: agencies.id, createdBy: agencies.createdBy, visibility: agencies.visibility })
        .from(agencies)
        .where(and(eq(agencies.id, input.agencyId), eq(agencies.tenantId, tenantId)))
        .limit(1);

      if (!agency) throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });
      if (agency.createdBy !== userId) throw new TRPCError({ code: "FORBIDDEN", message: "Only the creator can cancel" });
      if (agency.visibility !== "pending_approval") throw new TRPCError({ code: "BAD_REQUEST", message: "No pending request to cancel" });

      await db.update(agencies).set({
        visibility: "private",
        requestedPublishAt: null,
        updatedAt: new Date(),
      }).where(eq(agencies.id, input.agencyId));

      return { success: true };
    }),

  adminApproveAgency: adminProcedure
    .input(z.object({ agencyId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const adminId = ctx.user!.id;

      const [agency] = await db
        .select({ id: agencies.id, name: agencies.name, createdBy: agencies.createdBy, visibility: agencies.visibility })
        .from(agencies)
        .where(eq(agencies.id, input.agencyId))
        .limit(1);

      if (!agency) throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });
      if (agency.visibility !== "pending_approval") throw new TRPCError({ code: "BAD_REQUEST", message: "Agency is not pending approval" });

      await db.update(agencies).set({
        visibility: "public",
        isPublished: true,
        approvedBy: adminId,
        approvedAt: new Date(),
        rejectionReason: null,
        updatedAt: new Date(),
      }).where(eq(agencies.id, input.agencyId));

      // Notify creator
      if (agency.createdBy) {
        await createNotification({
          db: db.instance,
          userId: agency.createdBy,
          type: "system",
          title: "Agency Approved!",
          content: `Your agency "${agency.name}" has been approved and is now public on the Marketplace.`,
          priority: "normal",
          relatedResourceType: "agency",
          relatedResourceId: agency.id,
          actionUrl: `/agency/${agency.id}`,
          actionLabel: "View Agency",
          metadata: { source: "agency.approved" },
        });
      }

      return { success: true };
    }),

  adminRejectAgency: adminProcedure
    .input(z.object({
      agencyId: z.string(),
      reason: z.string().max(1000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [agency] = await db
        .select({ id: agencies.id, name: agencies.name, createdBy: agencies.createdBy, visibility: agencies.visibility })
        .from(agencies)
        .where(eq(agencies.id, input.agencyId))
        .limit(1);

      if (!agency) throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });
      if (agency.visibility !== "pending_approval") throw new TRPCError({ code: "BAD_REQUEST", message: "Agency is not pending approval" });

      await db.update(agencies).set({
        visibility: "rejected",
        approvedBy: null,
        approvedAt: null,
        rejectionReason: input.reason ?? null,
        updatedAt: new Date(),
      }).where(eq(agencies.id, input.agencyId));

      // Notify creator
      if (agency.createdBy) {
        const reasonText = input.reason ? ` Reason: ${input.reason}` : "";
        await createNotification({
          db: db.instance,
          userId: agency.createdBy,
          type: "system",
          title: "Agency Publish Request Rejected",
          content: `Your agency "${agency.name}" was not approved for public publishing.${reasonText}`,
          priority: "normal",
          relatedResourceType: "agency",
          relatedResourceId: agency.id,
          actionUrl: `/agency/${agency.id}`,
          actionLabel: "View Agency",
          metadata: { source: "agency.rejected" },
        });
      }

      return { success: true };
    }),

  adminListPendingAgencies: adminProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const conditions = [eq(agencies.visibility, "pending_approval")];

      const items = await db
        .select({
          id: agencies.id,
          name: agencies.name,
          description: agencies.description,
          creatorFeeCredits: agencies.creatorFeeCredits,
          platformSharePct: agencies.platformSharePct,
          requestedPublishAt: agencies.requestedPublishAt,
          ownerName: users.name,
          ownerEmail: users.email,
          agentCount: sql<number>`(SELECT count(*)::int FROM agency_agents WHERE "agencyId" = ${agencies.id})`.as("agentCount"),
        })
        .from(agencies)
        .leftJoin(users, eq(agencies.createdBy, users.id))
        .where(and(...conditions))
        .orderBy(asc(agencies.requestedPublishAt))
        .limit(input.limit)
        .offset(input.offset);

      const [countResult] = await db
        .select({ cnt: count() })
        .from(agencies)
        .where(and(...conditions));

      return { items, total: countResult.cnt };
    }),

  /**
   * Route an agency result envelope to its destination.
   * Called by the frontend after an agency run produces structured output.
   */
  routeResult: protectedProcedure
    .input(z.object({
      envelope: z.unknown(),
      agencyId: z.string().min(1).max(36).optional(),
      agencyRunId: z.string().min(1).max(100).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { parseAndRouteAgencyResult } = await import("../services/agencyResultRouter");
      return parseAndRouteAgencyResult(input.envelope, {
        agencyId: input.agencyId,
        agencyRunId: input.agencyRunId,
        userId: ctx.user!.id,
      });
    }),

  // ─── Custom Tool CRUD ────────────────────────────────────────────────

  createCustomTool: protectedProcedure
    .use(requireFeatureFlag("agencyCustomTools"))
    .use(createRateLimitMiddleware({ namespace: "agency-tool-create", limit: 10, windowMs: 60_000 }))
    .input(customToolInputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!;
      await assertAgencyEnabled(tenantId);

      // Enforce per-tenant tool limit
      const [toolCount] = await db
        .select({ count: count() })
        .from(agencyTools)
        .where(and(eq(agencyTools.tenantId, tenantId), eq(agencyTools.isEnabled, true)));
      if (toolCount.count >= 50) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Custom tool limit reached (50 per tenant)",
        });
      }

      // Check name uniqueness
      const existing = await db
        .select({ id: agencyTools.id })
        .from(agencyTools)
        .where(and(eq(agencyTools.tenantId, tenantId), eq(agencyTools.name, input.name)))
        .limit(1);
      if (existing.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `A tool named '${input.name}' already exists`,
        });
      }

      // SSRF validation
      try {
        validateSsrfUrl(input.endpoint);
      } catch (e: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `SSRF: ${e.message}` });
      }

      // Encrypt headers if provided
      const headersEncrypted = input.headers
        ? encrypt(JSON.stringify(input.headers))
        : null;

      const id = crypto.randomUUID();
      const [tool] = await db.insert(agencyTools).values({
        id,
        tenantId,
        name: input.name,
        description: input.description ?? null,
        toolType: "http_api",
        config: { endpoint: input.endpoint },
        riskLevel: input.riskLevel,
        requiresApproval: input.riskLevel === "high",
        inputSchema: input.inputSchema ?? null,
        outputSchema: input.outputSchema ?? null,
        httpMethod: input.httpMethod,
        headersEncrypted,
        retryPolicy: input.retryPolicy ?? null,
        icon: input.icon ?? null,
        category: input.category ?? null,
        version: 1,
        isExposedAsApi: false,
        strictSchema: input.strictSchema,
        oneCallAtATime: input.oneCallAtATime,
        isEnabled: true,
      }).returning();

      return { ...tool, headersEncrypted: undefined, hasHeaders: !!headersEncrypted };
    }),

  updateCustomTool: protectedProcedure
    .use(requireFeatureFlag("agencyCustomTools"))
    .input(z.object({ toolId: z.string().uuid() }).merge(customToolInputSchema.partial()))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!;
      await assertAgencyEnabled(tenantId);

      const [existing] = await db
        .select()
        .from(agencyTools)
        .where(and(eq(agencyTools.id, input.toolId), eq(agencyTools.tenantId, tenantId)))
        .limit(1);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Tool not found" });
      }

      // SSRF re-validation if endpoint changed
      if (input.endpoint) {
        try {
          validateSsrfUrl(input.endpoint);
        } catch (e: any) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `SSRF: ${e.message}` });
        }
      }

      const updates: Record<string, unknown> = { updatedAt: new Date(), version: existing.version + 1 };
      if (input.name !== undefined) updates.name = input.name;
      if (input.description !== undefined) updates.description = input.description;
      if (input.endpoint !== undefined) updates.config = { endpoint: input.endpoint };
      if (input.httpMethod !== undefined) updates.httpMethod = input.httpMethod;
      if (input.headers !== undefined) {
        updates.headersEncrypted = encrypt(JSON.stringify(input.headers));
      }
      if (input.inputSchema !== undefined) updates.inputSchema = input.inputSchema;
      if (input.outputSchema !== undefined) updates.outputSchema = input.outputSchema;
      if (input.riskLevel !== undefined) {
        updates.riskLevel = input.riskLevel;
        updates.requiresApproval = input.riskLevel === "high";
      }
      if (input.strictSchema !== undefined) updates.strictSchema = input.strictSchema;
      if (input.oneCallAtATime !== undefined) updates.oneCallAtATime = input.oneCallAtATime;
      if (input.icon !== undefined) updates.icon = input.icon;
      if (input.category !== undefined) updates.category = input.category;
      if (input.retryPolicy !== undefined) updates.retryPolicy = input.retryPolicy;

      const [updated] = await db
        .update(agencyTools)
        .set(updates)
        .where(and(eq(agencyTools.id, input.toolId), eq(agencyTools.tenantId, tenantId)))
        .returning();
      return { ...updated, headersEncrypted: undefined, hasHeaders: !!updated.headersEncrypted };
    }),

  deleteCustomTool: protectedProcedure
    .use(requireFeatureFlag("agencyCustomTools"))
    .input(z.object({ toolId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!;
      await assertAgencyEnabled(tenantId);

      const [tool] = await db
        .select({ id: agencyTools.id, tenantId: agencyTools.tenantId })
        .from(agencyTools)
        .where(and(eq(agencyTools.id, input.toolId), eq(agencyTools.tenantId, tenantId)));
      if (!tool) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Tool not found" });
      }

      // Check if any agents reference this tool
      const refs = await db
        .select({ id: agencyAgentTools.id })
        .from(agencyAgentTools)
        .where(eq(agencyAgentTools.toolId, input.toolId))
        .limit(1);
      if (refs.length > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Tool is in use by agents. Remove it from agents first.",
        });
      }

      // Soft-delete
      await db
        .update(agencyTools)
        .set({ isEnabled: false, updatedAt: new Date() })
        .where(eq(agencyTools.id, input.toolId));
      return { success: true };
    }),

  listCustomTools: protectedProcedure
    .use(requireFeatureFlag("agencyCustomTools"))
    .input(z.object({
      search: z.string().optional(),
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(50).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!;
      await assertAgencyEnabled(tenantId);

      const conditions = [
        eq(agencyTools.tenantId, tenantId),
        eq(agencyTools.isEnabled, true),
        inArray(agencyTools.toolType, ["http_api", "openapi_import", "mcp_bridge"]),
      ];

      if (input.search) {
        conditions.push(
          or(
            sql`${agencyTools.name} ILIKE ${"%" + input.search + "%"}`,
            sql`${agencyTools.description} ILIKE ${"%" + input.search + "%"}`,
          )!,
        );
      }

      const offset = (input.page - 1) * input.limit;
      const tools = await db
        .select({
          id: agencyTools.id,
          name: agencyTools.name,
          description: agencyTools.description,
          toolType: agencyTools.toolType,
          httpMethod: agencyTools.httpMethod,
          riskLevel: agencyTools.riskLevel,
          icon: agencyTools.icon,
          category: agencyTools.category,
          version: agencyTools.version,
          strictSchema: agencyTools.strictSchema,
          oneCallAtATime: agencyTools.oneCallAtATime,
          hasHeaders: sql<boolean>`${agencyTools.headersEncrypted} IS NOT NULL`.as("hasHeaders"),
          createdAt: agencyTools.createdAt,
          updatedAt: agencyTools.updatedAt,
        })
        .from(agencyTools)
        .where(and(...conditions))
        .orderBy(desc(agencyTools.createdAt))
        .limit(input.limit)
        .offset(offset);

      const [{ total }] = await db
        .select({ total: count() })
        .from(agencyTools)
        .where(and(...conditions));

      return { tools, total, page: input.page, limit: input.limit };
    }),

  testCustomTool: protectedProcedure
    .use(requireFeatureFlag("agencyCustomTools"))
    .use(createRateLimitMiddleware({ namespace: "agency-tool-test", limit: 20, windowMs: 60_000 }))
    .input(z.object({
      toolId: z.string().uuid(),
      sampleInput: z.record(z.unknown()),
    }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!;
      await assertAgencyEnabled(tenantId);

      const [tool] = await db
        .select()
        .from(agencyTools)
        .where(and(eq(agencyTools.id, input.toolId), eq(agencyTools.tenantId, tenantId)));
      if (!tool) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Tool not found" });
      }

      // Validate input against schema if present
      if (tool.inputSchema) {
        const { default: Ajv } = await import("ajv");
        const ajv = new Ajv({ allErrors: true });
        const validate = ajv.compile(tool.inputSchema as Record<string, unknown>);
        if (!validate(input.sampleInput)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Input schema validation failed: ${ajv.errorsText(validate.errors)}`,
          });
        }
      }

      // SSRF re-validation (defense in depth)
      const endpoint = (tool.config as any)?.endpoint;
      if (!endpoint) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Tool has no endpoint configured" });
      }
      try {
        validateSsrfUrl(endpoint);
      } catch (e: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `SSRF: ${e.message}` });
      }

      // Decrypt headers
      let headers: Record<string, string> = { "Content-Type": "application/json" };
      if (tool.headersEncrypted) {
        const parsed = JSON.parse(decrypt(tool.headersEncrypted));
        headers = { ...headers, ...parsed };
      }

      const startMs = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      try {
        const method = tool.httpMethod || "POST";
        const fetchOpts: RequestInit = {
          method,
          headers,
          signal: controller.signal,
        };
        if (method !== "GET") {
          fetchOpts.body = JSON.stringify(input.sampleInput);
        }

        const resp = await fetch(endpoint, fetchOpts);
        const bodyText = await resp.text();
        const durationMs = Date.now() - startMs;

        return {
          status: resp.status,
          body: bodyText.slice(0, 10_240), // truncate to 10KB
          durationMs,
        };
      } catch (e: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Tool test failed: ${e.message}`,
        });
      } finally {
        clearTimeout(timeout);
      }
    }),

  // ─── OpenAPI Import ─────────────────────────────────────────────────

  importOpenAPITools: protectedProcedure
    .use(requireFeatureFlag("agencyCustomTools"))
    .use(createRateLimitMiddleware({ namespace: "agency-openapi-import", limit: 5, windowMs: 60_000 }))
    .input(z.object({
      specContent: z.string().min(1).max(500_000),
      specFormat: z.enum(["json", "yaml"]),
      baseUrl: z.string().url().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!;
      await assertAgencyEnabled(tenantId);

      // SSRF validate baseUrl override if provided
      if (input.baseUrl) {
        try {
          validateSsrfUrl(input.baseUrl);
        } catch (e: any) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `SSRF: ${e.message}` });
        }
      }

      const { parseOpenApiSpec } = await import("../services/openApiToolFactory");
      try {
        const result = await parseOpenApiSpec({
          specContent: input.specContent,
          specFormat: input.specFormat,
          baseUrlOverride: input.baseUrl,
        });
        return result;
      } catch (e: any) {
        if (e.name === "OpenApiImportError") {
          throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
        }
        throw new TRPCError({ code: "BAD_REQUEST", message: `Failed to parse spec: ${e.message}` });
      }
    }),

  confirmOpenAPIImport: protectedProcedure
    .use(requireFeatureFlag("agencyCustomTools"))
    .use(createRateLimitMiddleware({ namespace: "agency-openapi-confirm", limit: 5, windowMs: 60_000 }))
    .input(z.object({
      selectedTools: z.array(z.object({
        name: z.string().max(100),
        description: z.string().max(500),
        httpMethod: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]),
        path: z.string(),
        inputSchema: z.record(z.unknown()),
      })).min(1).max(100),
      baseUrl: z.string().url(),
      apiKey: z.string().max(500).optional(),
      agencyId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!;
      await assertAgencyEnabled(tenantId);

      // SSRF validate baseUrl
      try {
        validateSsrfUrl(input.baseUrl);
      } catch (e: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `SSRF: ${e.message}` });
      }

      // Enforce 50-tool-per-tenant cap
      const [toolCount] = await db
        .select({ count: count() })
        .from(agencyTools)
        .where(and(eq(agencyTools.tenantId, tenantId), eq(agencyTools.isEnabled, true)));
      if (toolCount.count + input.selectedTools.length > 50) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot import ${input.selectedTools.length} tools: would exceed 50 tool limit (currently have ${toolCount.count})`,
        });
      }

      // Encrypt API key as Authorization header if provided
      const headersEncrypted = input.apiKey
        ? encrypt(JSON.stringify({ Authorization: `Bearer ${input.apiKey}` }))
        : null;

      // Bulk insert all selected tools
      const toolRows = input.selectedTools.map((tool) => ({
        id: crypto.randomUUID(),
        tenantId,
        name: tool.name,
        description: tool.description,
        toolType: "openapi_import" as const,
        config: { baseUrl: input.baseUrl, path: tool.path },
        riskLevel: "low" as const,
        requiresApproval: false,
        inputSchema: tool.inputSchema,
        outputSchema: null,
        httpMethod: tool.httpMethod,
        headersEncrypted,
        retryPolicy: null,
        icon: null,
        category: null,
        version: 1,
        isExposedAsApi: false,
        strictSchema: false,
        oneCallAtATime: false,
        isEnabled: true,
      }));

      await db.insert(agencyTools).values(toolRows);

      return {
        created: toolRows.length,
        toolIds: toolRows.map((r) => r.id),
      };
    }),

  // ─── Guardrails CRUD ────────────────────────────────────────────────────

  createGuardrail: protectedProcedure
    .use(requireFeatureFlag("agencyGuardrails"))
    .use(createRateLimitMiddleware({ namespace: "agency-guardrail", limit: 30, windowMs: 60_000 }))
    .input(z.object({
      agencyId: z.string().uuid(),
      name: z.string().min(1).max(100),
      type: z.enum(["input", "output"]),
      mode: z.enum(["guidance", "strict"]),
      strategy: z.enum([
        "keyword_block", "regex_match", "llm_classify", "json_schema",
        "max_length", "pii_detection", "custom_endpoint",
      ]),
      config: z.record(z.unknown()),
      validationAttempts: z.number().int().min(1).max(5).default(1),
      isEnabled: z.boolean().default(true),
      sortOrder: z.number().int().min(0).default(0),
      enforceOnHandoff: z.boolean().default(false),
    }).superRefine((data, ctx) => {
      const c = data.config as Record<string, unknown>;
      switch (data.strategy) {
        case "keyword_block": {
          const kw = c.keywords;
          if (!Array.isArray(kw) || kw.length < 1 || kw.length > 100)
            ctx.addIssue({ code: "custom", message: "keywords must be 1-100 items", path: ["config", "keywords"] });
          break;
        }
        case "regex_match": {
          if (typeof c.pattern !== "string" || (c.pattern as string).length > 1000)
            ctx.addIssue({ code: "custom", message: "pattern required, max 1000 chars", path: ["config", "pattern"] });
          break;
        }
        case "llm_classify": {
          if (typeof c.prompt !== "string" || (c.prompt as string).length > 2000)
            ctx.addIssue({ code: "custom", message: "prompt required, max 2000 chars", path: ["config", "prompt"] });
          if (typeof c.blockIf !== "string")
            ctx.addIssue({ code: "custom", message: "blockIf is required", path: ["config", "blockIf"] });
          break;
        }
        case "json_schema": {
          if (typeof c.schema !== "object" || c.schema === null)
            ctx.addIssue({ code: "custom", message: "schema must be an object", path: ["config", "schema"] });
          break;
        }
        case "max_length": {
          if (typeof c.maxChars !== "number" || c.maxChars < 1 || c.maxChars > 100000)
            ctx.addIssue({ code: "custom", message: "maxChars must be 1-100000", path: ["config", "maxChars"] });
          break;
        }
        case "pii_detection": {
          const pats = c.patterns;
          if (!Array.isArray(pats) || pats.length < 1)
            ctx.addIssue({ code: "custom", message: "patterns required", path: ["config", "patterns"] });
          break;
        }
        case "custom_endpoint": {
          if (typeof c.endpoint !== "string")
            ctx.addIssue({ code: "custom", message: "endpoint URL required", path: ["config", "endpoint"] });
          else {
            try { validateSsrfUrl(c.endpoint as string); } catch (e: any) {
              ctx.addIssue({ code: "custom", message: `SSRF: ${e.message}`, path: ["config", "endpoint"] });
            }
          }
          break;
        }
      }
    }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!;
      await assertAgencyEnabled(tenantId);

      // Verify agency belongs to tenant
      const [agency] = await db.select({ id: agencies.id })
        .from(agencies)
        .where(and(eq(agencies.id, input.agencyId), eq(agencies.tenantId, tenantId)));
      if (!agency) throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });

      const id = crypto.randomUUID();
      const configWithHandoff = { ...input.config, enforceOnHandoff: input.enforceOnHandoff };

      const [created] = await db.insert(agencyGuardrails).values({
        id,
        tenantId,
        agencyId: input.agencyId,
        name: input.name,
        type: input.type,
        mode: input.mode,
        strategy: input.strategy,
        config: configWithHandoff,
        validationAttempts: input.validationAttempts,
        isEnabled: input.isEnabled,
        sortOrder: input.sortOrder,
      }).returning();

      return created;
    }),

  updateGuardrail: protectedProcedure
    .use(requireFeatureFlag("agencyGuardrails"))
    .use(createRateLimitMiddleware({ namespace: "agency-guardrail", limit: 30, windowMs: 60_000 }))
    .input(z.object({
      guardrailId: z.string().uuid(),
      name: z.string().min(1).max(100).optional(),
      type: z.enum(["input", "output"]).optional(),
      mode: z.enum(["guidance", "strict"]).optional(),
      config: z.record(z.unknown()).optional(),
      validationAttempts: z.number().int().min(1).max(5).optional(),
      isEnabled: z.boolean().optional(),
      sortOrder: z.number().int().min(0).optional(),
      enforceOnHandoff: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!;
      await assertAgencyEnabled(tenantId);

      const [existing] = await db.select()
        .from(agencyGuardrails)
        .where(eq(agencyGuardrails.id, input.guardrailId));
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Guardrail not found" });
      if (existing.tenantId !== tenantId)
        throw new TRPCError({ code: "FORBIDDEN", message: "Cross-tenant access denied" });

      const updates: Record<string, unknown> = {};
      if (input.name !== undefined) updates.name = input.name;
      if (input.type !== undefined) updates.type = input.type;
      if (input.mode !== undefined) updates.mode = input.mode;
      if (input.validationAttempts !== undefined) updates.validationAttempts = input.validationAttempts;
      if (input.isEnabled !== undefined) updates.isEnabled = input.isEnabled;
      if (input.sortOrder !== undefined) updates.sortOrder = input.sortOrder;
      if (input.config !== undefined || input.enforceOnHandoff !== undefined) {
        const currentConfig = (existing.config as Record<string, unknown>) || {};
        const newConfig = input.config ? { ...currentConfig, ...input.config } : currentConfig;
        if (input.enforceOnHandoff !== undefined) newConfig.enforceOnHandoff = input.enforceOnHandoff;
        updates.config = newConfig;
      }
      updates.updatedAt = new Date();

      const [updated] = await db.update(agencyGuardrails)
        .set(updates)
        .where(eq(agencyGuardrails.id, input.guardrailId))
        .returning();

      return updated;
    }),

  deleteGuardrail: protectedProcedure
    .use(requireFeatureFlag("agencyGuardrails"))
    .use(createRateLimitMiddleware({ namespace: "agency-guardrail", limit: 30, windowMs: 60_000 }))
    .input(z.object({ guardrailId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!;
      await assertAgencyEnabled(tenantId);

      const [existing] = await db.select()
        .from(agencyGuardrails)
        .where(eq(agencyGuardrails.id, input.guardrailId));
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Guardrail not found" });
      if (existing.tenantId !== tenantId)
        throw new TRPCError({ code: "FORBIDDEN", message: "Cross-tenant access denied" });

      await db.delete(agencyGuardrails)
        .where(eq(agencyGuardrails.id, input.guardrailId));

      return { deleted: true };
    }),

  listGuardrails: protectedProcedure
    .use(requireFeatureFlag("agencyGuardrails"))
    .use(createRateLimitMiddleware({ namespace: "agency-guardrail", limit: 30, windowMs: 60_000 }))
    .input(z.object({
      agencyId: z.string().uuid(),
    }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!;
      await assertAgencyEnabled(tenantId);

      const rows = await db.select()
        .from(agencyGuardrails)
        .where(and(
          eq(agencyGuardrails.tenantId, tenantId),
          eq(agencyGuardrails.agencyId, input.agencyId),
        ))
        .orderBy(asc(agencyGuardrails.sortOrder));

      // Fetch agent assignments for each guardrail
      const guardrailIds = rows.map((r: { id: string }) => r.id);
      const assignments = guardrailIds.length > 0
        ? await db.select()
            .from(agencyAgentGuardrails)
            .where(inArray(agencyAgentGuardrails.guardrailId, guardrailIds))
        : [];

      const assignmentMap = new Map<string, string[]>();
      for (const a of assignments) {
        const list = assignmentMap.get(a.guardrailId) || [];
        list.push(a.agentId);
        assignmentMap.set(a.guardrailId, list);
      }

      return rows.map((r: { id: string }) => ({
        ...r,
        assignedAgentIds: assignmentMap.get(r.id) || [],
      }));
    }),

  testGuardrail: protectedProcedure
    .use(requireFeatureFlag("agencyGuardrails"))
    .use(createRateLimitMiddleware({ namespace: "agency-guardrail-test", limit: 10, windowMs: 60_000 }))
    .input(z.object({
      guardrailId: z.string().uuid(),
      sampleMessage: z.string().min(1).max(50000),
    }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!;
      await assertAgencyEnabled(tenantId);

      const [guardrail] = await db.select()
        .from(agencyGuardrails)
        .where(eq(agencyGuardrails.id, input.guardrailId));
      if (!guardrail) throw new TRPCError({ code: "NOT_FOUND", message: "Guardrail not found" });
      if (guardrail.tenantId !== tenantId)
        throw new TRPCError({ code: "FORBIDDEN", message: "Cross-tenant access denied" });

      const PY_BACKEND = process.env.PYTHON_BACKEND_URL || "http://localhost:8000";
      const token = process.env.SMARTSPEC_WEB_GATEWAY_TOKEN || "";

      try {
        const resp = await fetch(`${PY_BACKEND}/api/internal/guardrails/test`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Internal-Token": token,
          },
          body: JSON.stringify({
            strategy: guardrail.strategy,
            config: guardrail.config || {},
            message: input.sampleMessage,
          }),
        });

        if (!resp.ok) {
          const errText = await resp.text();
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Guardrail test failed: ${errText}` });
        }

        return await resp.json() as { passed: boolean; message: string; action: string; redactedMessage?: string };
      } catch (e: any) {
        if (e instanceof TRPCError) throw e;
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Guardrail test failed: ${e.message}` });
      }
    }),

  assignGuardrailToAgent: protectedProcedure
    .use(requireFeatureFlag("agencyGuardrails"))
    .use(createRateLimitMiddleware({ namespace: "agency-guardrail", limit: 30, windowMs: 60_000 }))
    .input(z.object({
      guardrailId: z.string().uuid(),
      agentId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!;
      await assertAgencyEnabled(tenantId);

      // Verify guardrail belongs to tenant
      const [guardrail] = await db.select()
        .from(agencyGuardrails)
        .where(eq(agencyGuardrails.id, input.guardrailId));
      if (!guardrail) throw new TRPCError({ code: "NOT_FOUND", message: "Guardrail not found" });
      if (guardrail.tenantId !== tenantId)
        throw new TRPCError({ code: "FORBIDDEN", message: "Cross-tenant access denied" });

      // Verify agent's agency belongs to same tenant
      const [agent] = await db.select({ id: agencyAgents.id, agencyId: agencyAgents.agencyId })
        .from(agencyAgents)
        .where(eq(agencyAgents.id, input.agentId));
      if (!agent) throw new TRPCError({ code: "NOT_FOUND", message: "Agent not found" });

      const [agentAgency] = await db.select({ tenantId: agencies.tenantId })
        .from(agencies)
        .where(eq(agencies.id, agent.agencyId));
      if (!agentAgency || agentAgency.tenantId !== tenantId)
        throw new TRPCError({ code: "FORBIDDEN", message: "Cross-tenant assignment denied" });

      try {
        const [created] = await db.insert(agencyAgentGuardrails).values({
          id: crypto.randomUUID(),
          agentId: input.agentId,
          guardrailId: input.guardrailId,
        }).returning();
        return created;
      } catch (e: any) {
        if (e.code === "23505" || e.message?.includes("unique")) {
          throw new TRPCError({ code: "CONFLICT", message: "Guardrail already assigned to this agent" });
        }
        throw e;
      }
    }),

  removeGuardrailFromAgent: protectedProcedure
    .use(requireFeatureFlag("agencyGuardrails"))
    .use(createRateLimitMiddleware({ namespace: "agency-guardrail", limit: 30, windowMs: 60_000 }))
    .input(z.object({
      guardrailId: z.string().uuid(),
      agentId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!;
      await assertAgencyEnabled(tenantId);

      // Verify guardrail belongs to tenant
      const [guardrail] = await db.select()
        .from(agencyGuardrails)
        .where(eq(agencyGuardrails.id, input.guardrailId));
      if (!guardrail) throw new TRPCError({ code: "NOT_FOUND", message: "Guardrail not found" });
      if (guardrail.tenantId !== tenantId)
        throw new TRPCError({ code: "FORBIDDEN", message: "Cross-tenant access denied" });

      await db.delete(agencyAgentGuardrails)
        .where(and(
          eq(agencyAgentGuardrails.agentId, input.agentId),
          eq(agencyAgentGuardrails.guardrailId, input.guardrailId),
        ));

      return { deleted: true };
    }),

  // ── Human Approval ──────────────────────────────────────────────────
  submitApproval: protectedProcedure
    .input(
      z.object({
        runId: z.string().uuid(),
        approvalKey: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
        feedback: z.string().max(2000).optional(),
      }),
    )
    .use(createRateLimitMiddleware({ namespace: "agency-approval", limit: 10, windowMs: 60_000 }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const userRole = ctx.user!.role;

      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
      // 1. Look up the conversation/run — SECURITY: scope to tenant to prevent cross-tenant approval
      const [conv] = await db
        .select()
        .from(agencyConversations)
        .where(and(eq(agencyConversations.id, input.runId), eq(agencyConversations.tenantId, tenantId)));
      if (!conv) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Run not found" });
      }

      // 2. Ownership check
      const isOwner = conv.userId === userId;
      const isAdmin = userRole === "admin" || userRole === "domain_admin";
      if (!isOwner && !isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the run creator or an admin can submit approvals",
        });
      }

      // 3. Publish decision to Redis for Python orchestrator
      const { getRedisClient } = await import("../services/redis");
      const redis = getRedisClient();
      await redis.publish(
        `agency:approval:${input.runId}`,
        JSON.stringify({
          approvalKey: input.approvalKey,
          decision: input.decision,
          feedback: input.feedback ?? "",
        }),
      );

      return { success: true };
    }),

  // ── MCP Integration (section-14) ──────────────────────────────────────

  saveMcpServers: protectedProcedure
    .use(createRateLimitMiddleware({ windowMs: 60_000, maxRequests: 20, keyPrefix: "mcp-save" }))
    .input(
      z.object({
        agentId: z.string().uuid(),
        mcpServers: z.array(z.object({
          url: z.string().url(),
          name: z.string().max(50).optional(),
          transport: z.enum(["http", "sse"]).default("http"),
        })).max(5, "Maximum 5 MCP servers per agent"),
        tokens: z.record(z.string(), z.string()).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
      await assertAgencyEnabled(tenantId);

      // Feature flag guard
      const mcpEnabled = await getTenantFeatureFlag("agencyMcpBridge", tenantId);
      if (!mcpEnabled) {
        throw new TRPCError({ code: "FORBIDDEN", message: "MCP integration is not enabled" });
      }

      // Validate URLs against SSRF
      const { validateMcpServerUrl, encryptMcpTokens } = await import(
        "../services/agencyMcpService"
      );
      for (const server of input.mcpServers) {
        const result = validateMcpServerUrl(server.url);
        if (!result.valid) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Invalid MCP server URL: ${result.error}`,
          });
        }
      }

      // Encrypt tokens if provided
      let encryptedTokens: string | null = null;
      if (input.tokens && Object.keys(input.tokens).length > 0) {
        encryptedTokens = encryptMcpTokens(input.tokens);
      }

      // Transaction: verify ownership + update atomically (prevents TOCTOU race)
      return await db.transaction(async (tx) => {
        const [agent] = await tx
          .select({ id: agencyAgents.id })
          .from(agencyAgents)
          .innerJoin(agencies, eq(agencies.id, agencyAgents.agencyId))
          .where(
            and(
              eq(agencyAgents.id, input.agentId),
              eq(agencies.tenantId, tenantId),
            ),
          )
          .limit(1);

        if (!agent) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Agent not found" });
        }

        await tx
          .update(agencyAgents)
          .set({
            mcpServers: input.mcpServers.map((s) => ({
              url: s.url,
              name: s.name,
              transport: s.transport,
            })),
            mcpServerTokensEncrypted: encryptedTokens,
          })
          .where(eq(agencyAgents.id, input.agentId));

        return { success: true };
      });
    }),

  discoverMcpTools: protectedProcedure
    .use(createRateLimitMiddleware({ windowMs: 60_000, maxRequests: 10, keyPrefix: "mcp-discover" }))
    .input(
      z.object({
        serverUrl: z.string().url(),
        token: z.string().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
      await assertAgencyEnabled(tenantId);

      // Feature flag guard
      const mcpEnabled = await getTenantFeatureFlag("agencyMcpBridge", tenantId);
      if (!mcpEnabled) {
        throw new TRPCError({ code: "FORBIDDEN", message: "MCP integration is not enabled" });
      }

      const { validateMcpServerUrl, discoverToolsFromServer } = await import(
        "../services/agencyMcpService"
      );

      const urlResult = validateMcpServerUrl(input.serverUrl);
      if (!urlResult.valid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Invalid MCP server URL: ${urlResult.error}`,
        });
      }

      try {
        const tools = await discoverToolsFromServer(
          input.serverUrl,
          input.token,
          10_000,
        );
        return { tools };
      } catch (err: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to discover tools: ${err.message}`,
        });
      }
    }),

  // ── Run Trace Procedures (section-15) ────────────────────────────────────

  listRunTraces: protectedProcedure
    .input(
      z.object({
        agencyId: z.string().min(1),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        status: z.string().optional(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
      await assertAgencyEnabled(tenantId);

      // Verify agency ownership
      const [agency] = await db
        .select({ id: agencies.id })
        .from(agencies)
        .where(and(eq(agencies.id, input.agencyId), eq(agencies.tenantId, tenantId)))
        .limit(1);
      if (!agency) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });
      }

      const { listRunTraces } = await import("../services/agencyTraceService");
      return listRunTraces({
        agencyId: input.agencyId,
        tenantId,
        startDate: input.startDate,
        endDate: input.endDate,
        status: input.status,
        limit: input.limit,
        offset: input.offset,
      });
    }),

  getRunTrace: protectedProcedure
    .input(
      z.object({
        traceId: z.string().min(1),
      }),
    )
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
      await assertAgencyEnabled(tenantId);

      const { getRunTrace } = await import("../services/agencyTraceService");
      const trace = await getRunTrace(input.traceId, tenantId);
      if (!trace) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Trace not found" });
      }
      return trace;
    }),

  // ── Agent Memory CRUD ──────────────────────────────────────────

  listAgentMemories: protectedProcedure
    .input(z.object({
      agencyId: z.string().min(1),
      agentNodeId: z.string().min(1),
      memoryType: z.enum(["constraint", "preference", "fact", "skill"]).optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
      const userId = ctx.user!.id;
      const isDomainAdmin = ctx.user!.role === "domain_admin";
      const offset = (input.page - 1) * input.pageSize;

      const conditions = [
        eq(agencyAgentMemories.tenantId, tenantId),
        eq(agencyAgentMemories.agencyId, input.agencyId),
        eq(agencyAgentMemories.agentNodeId, input.agentNodeId),
        eq(agencyAgentMemories.isActive, true),
      ];
      if (!isDomainAdmin) {
        conditions.push(eq(agencyAgentMemories.userId, userId));
      }
      if (input.memoryType) {
        conditions.push(eq(agencyAgentMemories.memoryType, input.memoryType));
      }

      const [items, totalResult] = await Promise.all([
        db.select()
          .from(agencyAgentMemories)
          .where(and(...conditions))
          .orderBy(desc(agencyAgentMemories.confidence), desc(agencyAgentMemories.useCount))
          .limit(input.pageSize)
          .offset(offset),
        db.select({ count: count() })
          .from(agencyAgentMemories)
          .where(and(...conditions)),
      ]);

      return {
        items,
        total: totalResult[0]?.count ?? 0,
        page: input.page,
      };
    }),

  deleteAgentMemory: protectedProcedure
    .input(z.object({
      memoryId: z.number().int().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
      const userId = ctx.user!.id;
      const isDomainAdmin = ctx.user!.role === "domain_admin";

      const conditions = [
        eq(agencyAgentMemories.id, input.memoryId),
        eq(agencyAgentMemories.tenantId, tenantId),
        eq(agencyAgentMemories.isActive, true),
      ];
      if (!isDomainAdmin) {
        conditions.push(eq(agencyAgentMemories.userId, userId));
      }

      const result = await db.update(agencyAgentMemories)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(...conditions));

      return { success: (result.rowCount ?? 0) > 0 };
    }),

  resetAgentMemories: protectedProcedure
    .input(z.object({
      agencyId: z.string().min(1),
      agentNodeId: z.string().min(1),
      userId: z.number().int().positive().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
      const isDomainAdmin = ctx.user!.role === "domain_admin";
      const targetUserId = isDomainAdmin && input.userId ? input.userId : ctx.user!.id;

      const result = await db.update(agencyAgentMemories)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(
          eq(agencyAgentMemories.tenantId, tenantId),
          eq(agencyAgentMemories.agencyId, input.agencyId),
          eq(agencyAgentMemories.agentNodeId, input.agentNodeId),
          eq(agencyAgentMemories.userId, targetUserId),
          eq(agencyAgentMemories.isActive, true),
        ));

      return { deletedCount: result.rowCount ?? 0 };
    }),
});
