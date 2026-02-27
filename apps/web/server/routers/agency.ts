/**
 * Agency tRPC Router
 *
 * CRUD for agencies, agent configs, communication flows.
 * Conversation management for agency chat sessions.
 * Admin operations (toggle tenant, kill run).
 */

import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { createRateLimitMiddleware } from "../_core/rateLimitedProcedure";
import { db } from "../db";
import {
  agencies,
  agencyAgents,
  agencyAgentTools,
  agencyCommunicationFlows,
  agencyConversations,
  systemSettings,
} from "../../drizzle/schema";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { agencyBridge } from "../services/agencyBridge";
import { getTenantFeatureFlag, setTenantFeatureFlag } from "../services/featureFlags";
import crypto from "crypto";

// Feature flag guard (tenant-scoped)
async function assertAgencyEnabled(tenantId: string): Promise<void> {
  const enabled = await getTenantFeatureFlag("AGENCY_SWARM_ENABLED", tenantId);
  if (!enabled) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Not found" });
  }
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

      const conditions: any[] = [eq(agencies.tenantId, tenantId)];
      if (input.status) {
        conditions.push(eq(agencies.status, input.status));
      }

      const result = await db
        .select()
        .from(agencies)
        .where(and(...conditions))
        .orderBy(desc(agencies.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return { agencies: result };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
      await assertAgencyEnabled(tenantId);

      const [agency] = await db
        .select()
        .from(agencies)
        .where(and(eq(agencies.id, input.id), eq(agencies.tenantId, tenantId)))
        .limit(1);

      if (!agency) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });
      }

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

      return { ...agency, agents, communicationFlows: flows, agentToolAssignments: toolAssignments };
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
        agents: z
          .array(
            z.object({
              name: z.string().min(1).max(100),
              description: z.string().optional(),
              instructions: z.string(),
              model: z.string().max(100),
              modelSettings: z
                .object({
                  max_tokens: z.number().optional(),
                  temperature: z.number().min(0).max(2).optional(),
                  top_p: z.number().min(0).max(1).optional(),
                })
                .optional(),
              isEntryPoint: z.boolean().default(false),
              isOptional: z.boolean().default(false),
              position: z.object({ x: z.number(), y: z.number() }).optional(),
              toolIds: z.array(z.string().uuid()).optional(),
            }),
          )
          .min(1),
        communicationFlows: z
          .array(
            z.object({
              fromAgentName: z.string(),
              toAgentName: z.string(),
              flowType: z.enum(["delegation", "handoff"]),
            }),
          )
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
      await assertAgencyEnabled(tenantId);
      const userId = ctx.user!.id;

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
            instructions: agent.instructions,
            model: agent.model,
            modelSettings: agent.modelSettings ?? null,
            isEntryPoint: agent.isEntryPoint,
            isOptional: agent.isOptional,
            position: agent.position ?? null,
          });

          // Insert tool assignments
          if (agent.toolIds?.length) {
            for (const toolId of agent.toolIds) {
              await tx.insert(agencyAgentTools).values({
                id: crypto.randomUUID(),
                agentId,
                toolId,
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
        creditMultiplier: z.number().min(1).max(10).optional(),
        maxRunTimeSeconds: z.number().min(30).max(3600).optional(),
        isFallbackSafe: z.boolean().optional(),
        status: z.enum(["draft", "published", "archived"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
      await assertAgencyEnabled(tenantId);
      const userId = ctx.user!.id;
      const isAdmin = ctx.user!.role === "admin";

      // Fetch existing agency
      const [agency] = await db
        .select()
        .from(agencies)
        .where(and(eq(agencies.id, input.id), eq(agencies.tenantId, tenantId)))
        .limit(1);

      if (!agency) {
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
      if (updateFields.creditMultiplier !== undefined)
        setValues.creditMultiplier = String(updateFields.creditMultiplier);
      if (updateFields.maxRunTimeSeconds !== undefined)
        setValues.maxRunTimeSeconds = updateFields.maxRunTimeSeconds;
      if (updateFields.isFallbackSafe !== undefined) setValues.isFallbackSafe = updateFields.isFallbackSafe;
      if (updateFields.status !== undefined) {
        setValues.status = updateFields.status;
        if (updateFields.status === "published") setValues.isPublished = true;
        if (updateFields.status === "archived") setValues.isPublished = false;
      }

      if (Object.keys(setValues).length > 0) {
        await db.update(agencies).set(setValues).where(and(eq(agencies.id, id), eq(agencies.tenantId, tenantId)));
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
        agents: z.array(
          z.object({
            name: z.string().min(1).max(100),
            description: z.string().optional(),
            instructions: z.string(),
            model: z.string().max(100),
            modelSettings: z
              .object({
                max_tokens: z.number().optional(),
                temperature: z.number().min(0).max(2).optional(),
                top_p: z.number().min(0).max(1).optional(),
              })
              .optional(),
            isEntryPoint: z.boolean().default(false),
            isOptional: z.boolean().default(false),
            position: z.object({ x: z.number(), y: z.number() }).optional(),
            toolIds: z.array(z.string().uuid()).optional(),
          }),
        ).min(1),
        communicationFlows: z
          .array(
            z.object({
              fromAgentName: z.string(),
              toAgentName: z.string(),
              flowType: z.enum(["delegation", "handoff"]),
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

      const [agency] = await db
        .select()
        .from(agencies)
        .where(and(eq(agencies.id, input.id), eq(agencies.tenantId, tenantId)))
        .limit(1);

      if (!agency) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });
      }
      if (agency.createdBy !== userId && !isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized" });
      }

      // Validate exactly one entry point
      const entryPoints = input.agents.filter((a) => a.isEntryPoint);
      if (entryPoints.length !== 1) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Exactly one entry point agent is required, found ${entryPoints.length}`,
        });
      }

      await db.transaction(async (tx) => {
        // Update agency metadata
        const setValues: Record<string, any> = {};
        if (input.name !== undefined) setValues.name = input.name;
        if (input.description !== undefined) setValues.description = input.description;
        if (input.systemPrompt !== undefined) setValues.systemPrompt = input.systemPrompt;
        if (Object.keys(setValues).length > 0) {
          await tx.update(agencies).set(setValues).where(eq(agencies.id, input.id));
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
            instructions: agent.instructions,
            model: agent.model,
            modelSettings: agent.modelSettings ?? null,
            isEntryPoint: agent.isEntryPoint,
            isOptional: agent.isOptional,
            position: agent.position ?? null,
          });

          if (agent.toolIds?.length) {
            for (const toolId of agent.toolIds) {
              await tx.insert(agencyAgentTools).values({
                id: crypto.randomUUID(),
                agentId,
                toolId,
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
            });
          }
        }
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
        .where(and(eq(agencies.id, input.id), eq(agencies.tenantId, tenantId)))
        .limit(1);

      if (!agency) {
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

      // Validate agency exists in tenant
      const [agency] = await db
        .select()
        .from(agencies)
        .where(and(eq(agencies.id, input.agencyId), eq(agencies.tenantId, tenantId)))
        .limit(1);

      if (!agency) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });
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

      const result = await agencyBridge.executeRun({
        agencyId: input.agencyId,
        conversationId: input.conversationId,
        message: input.message,
        userToken,
        tenantId,
        userId,
      });

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

      return result;
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

  adminSetToolWhitelist: adminProcedure
    .input(
      z.object({
        agencyId: z.string().uuid(),
        toolIds: z.array(z.string().uuid()),
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

      const row = (result as any).rows?.[0] ?? {};
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

      for (const row of (result as any).rows ?? []) {
        const total = Number(row.total);
        const failed = Number(row.failed);
        const successRate = total > 0 ? (total - failed) / total : 1;

        if (successRate < 0.9) {
          alerts.push({
            agencyId: row.agency_id,
            metric: "success_rate",
            value: successRate,
            threshold: 0.9,
          });
        }
      }

      return { alerts };
    }),

  // --- Templates ---

  listTemplates: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
    await assertAgencyEnabled(tenantId);
    const templatesEnabled = await getTenantFeatureFlag(
      "AGENCY_TEMPLATES_ENABLED",
      tenantId,
    );
    if (!templatesEnabled) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Not found" });
    }

    const { getTemplates } = await import(
      "../../skills/agency-templates/index"
    );
    return getTemplates().map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      longDescription: t.longDescription,
      category: t.category,
      agentCount: t.agentCount,
      icon: t.icon,
      agents: t.agents.map((a) => ({
        name: a.name,
        description: a.description,
        model: a.model,
        isEntryPoint: a.isEntryPoint,
        isOptional: a.isOptional,
      })),
      communicationFlows: t.communicationFlows,
    }));
  }),

  createFromTemplate: agencyTemplateProcedure
    .input(
      z.object({
        templateId: z.string(),
        name: z.string().min(1).max(255).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
      await assertAgencyEnabled(tenantId);
      const templatesEnabled = await getTenantFeatureFlag(
        "AGENCY_TEMPLATES_ENABLED",
        tenantId,
      );
      if (!templatesEnabled) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Not found" });
      }

      const { getTemplateById } = await import(
        "../../skills/agency-templates/index"
      );
      const template = getTemplateById(input.templateId);
      if (!template) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Template not found",
        });
      }

      const userId = ctx.user!.id;
      const name = input.name || template.name;
      const slug = `${template.id}-${crypto.randomUUID().slice(0, 8)}`;
      const agencyId = crypto.randomUUID();

      await db.transaction(async (tx) => {
        await tx.insert(agencies).values({
          id: agencyId,
          tenantId,
          slug,
          name,
          description: template.description,
          systemPrompt: null,
          creditMultiplier: String(template.defaultSettings.creditMultiplier),
          maxAgents: template.agentCount,
          maxRunTimeSeconds: template.defaultSettings.maxRunTimeSeconds,
          isFallbackSafe: template.defaultSettings.isFallbackSafe,
          status: "draft",
          createdBy: userId,
        });

        const agentNameToId: Record<string, string> = {};

        for (const agent of template.agents) {
          const agentId = crypto.randomUUID();
          agentNameToId[agent.name] = agentId;

          await tx.insert(agencyAgents).values({
            id: agentId,
            agencyId,
            name: agent.name,
            description: agent.description,
            instructions: agent.instructions,
            model: agent.model,
            isEntryPoint: agent.isEntryPoint,
            isOptional: agent.isOptional,
            position: agent.position,
          });
        }

        for (const flow of template.communicationFlows) {
          const fromId = agentNameToId[flow.fromAgentName];
          const toId = agentNameToId[flow.toAgentName];
          if (!fromId || !toId) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: `Invalid template: agent name "${!fromId ? flow.fromAgentName : flow.toAgentName}" not found`,
            });
          }
          await tx.insert(agencyCommunicationFlows).values({
            id: crypto.randomUUID(),
            agencyId,
            fromAgentId: fromId,
            toAgentId: toId,
            flowType: flow.flowType,
          });
        }
      });

      return { agencyId };
    }),
});
