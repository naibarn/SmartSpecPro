/**
 * Persona tRPC Router — CRUD for AI persona templates with RBAC.
 *
 * RBAC rules:
 * - platform scope: admin only
 * - tenant scope: domain_admin (or admin) + tenantId must match
 * - user scope: any authenticated user (userId = ctx.user.id)
 */

import { z } from "zod";
import { router, protectedProcedure, adminProcedure, domainAdminProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  listPersonas,
  getPersonaById,
  createPersona,
  updatePersona,
  deletePersona,
} from "../services/personaService";
import { getFeatureFlag } from "../services/featureFlags";

// ── Zod Schemas ──────────────────────────────────────────────

const personaCreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).nullable().optional(),
  systemPromptPrefix: z.string().min(1).max(2000),
  tone: z.enum(["formal", "casual", "friendly", "technical", "creative"]).nullable().optional(),
  language: z.string().max(10).optional().default("auto"),
  responseStyle: z.record(z.string(), z.unknown()).nullable().optional(),
  restrictions: z.array(z.string().max(500)).max(20).optional().default([]),
  scope: z.enum(["platform", "tenant", "user"]),
  isDefault: z.boolean().optional().default(false),
});

const personaUpdateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
  systemPromptPrefix: z.string().min(1).max(2000).optional(),
  tone: z.enum(["formal", "casual", "friendly", "technical", "creative"]).nullable().optional(),
  language: z.string().max(10).optional(),
  responseStyle: z.record(z.string(), z.unknown()).nullable().optional(),
  restrictions: z.array(z.string().max(500)).max(20).optional(),
  isDefault: z.boolean().optional(),
});

// ── Helper: check persona feature flag ────────────────────────

async function requirePersonaEnabled() {
  const enabled = await getFeatureFlag("AI_PERSONA_ENABLED");
  if (!enabled) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "AI Persona feature is not enabled",
    });
  }
}

// ── Helper: validate RBAC for scope ───────────────────────────

function validateScopePermission(
  scope: "platform" | "tenant" | "user",
  userRole: string,
  userTenantId: string | null,
  personaTenantId?: string | null,
) {
  if (scope === "platform") {
    if (userRole !== "admin") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Platform-scope personas require admin role",
      });
    }
  } else if (scope === "tenant") {
    if (userRole !== "admin" && userRole !== "domain_admin") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Tenant-scope personas require domain_admin or admin role",
      });
    }
    // domain_admin can only create for their own tenant
    if (userRole === "domain_admin" && personaTenantId && personaTenantId !== userTenantId) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Cannot manage personas for a different tenant",
      });
    }
  }
  // scope === "user" is allowed for any authenticated user
}

// ── Router ────────────────────────────────────────────────────

export const personaRouter = router({
  /** List personas visible to the current user (own + tenant + platform scope). */
  list: protectedProcedure.query(async ({ ctx }) => {
    await requirePersonaEnabled();
    return listPersonas(ctx.user!.id, ctx.tenantId);
  }),

  /** Get a single persona by ID with ownership validation. */
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requirePersonaEnabled();
      const persona = await getPersonaById(input.id);
      if (!persona) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Persona not found" });
      }

      // Validate access: platform personas visible to all,
      // tenant personas only to matching tenant, user personas only to owner
      if (persona.scope === "tenant" && persona.tenantId !== ctx.tenantId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Persona not found" });
      }
      if (persona.scope === "user" && persona.userId !== ctx.user!.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Persona not found" });
      }

      return persona;
    }),

  /** Create a persona. RBAC enforced by scope. */
  create: protectedProcedure
    .input(personaCreateSchema)
    .mutation(async ({ ctx, input }) => {
      await requirePersonaEnabled();

      const userRole = ctx.user!.role;
      const userTenantId = ctx.tenantId;

      validateScopePermission(input.scope, userRole, userTenantId);

      return createPersona({
        ...input,
        tenantId: input.scope === "tenant" ? userTenantId : null,
        userId: input.scope === "user" ? ctx.user!.id : null,
      });
    }),

  /** Update a persona with sanitization. */
  update: protectedProcedure
    .input(personaUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      await requirePersonaEnabled();

      const existing = await getPersonaById(input.id);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Persona not found" });
      }

      // Validate ownership/RBAC based on existing persona's scope
      const userRole = ctx.user!.role;
      if (existing.scope === "platform" && userRole !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can update platform personas" });
      }
      if (existing.scope === "tenant" && userRole !== "admin" && userRole !== "domain_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only domain admins can update tenant personas" });
      }
      if (existing.scope === "user" && existing.userId !== ctx.user!.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot update another user's persona" });
      }

      const { id, ...updateData } = input;
      return updatePersona(id, updateData);
    }),

  /** Delete a persona. Side effect: nullify defaultPersonaId on affected users/tenants. */
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requirePersonaEnabled();

      const existing = await getPersonaById(input.id);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Persona not found" });
      }

      // Validate ownership/RBAC
      const userRole = ctx.user!.role;
      if (existing.scope === "platform" && userRole !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can delete platform personas" });
      }
      if (existing.scope === "tenant" && userRole !== "admin" && userRole !== "domain_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only domain admins can delete tenant personas" });
      }
      if (existing.scope === "user" && existing.userId !== ctx.user!.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot delete another user's persona" });
      }

      await deletePersona(input.id);
      return { success: true };
    }),

  /** Set the current user's default persona. */
  setUserDefault: protectedProcedure
    .input(z.object({ personaId: z.string().uuid().nullable() }))
    .mutation(async ({ ctx, input }) => {
      await requirePersonaEnabled();

      // Validate persona exists and is accessible
      if (input.personaId) {
        const persona = await getPersonaById(input.personaId);
        if (!persona) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Persona not found" });
        }
        // Must be accessible: platform scope, or matching tenant, or user's own
        if (persona.scope === "tenant" && persona.tenantId !== ctx.tenantId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Cannot use persona from another tenant" });
        }
        if (persona.scope === "user" && persona.userId !== ctx.user!.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Cannot use another user's persona" });
        }
      }

      const { getDb } = await import("../db");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const { users } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");

      await db
        .update(users)
        .set({ defaultPersonaId: input.personaId })
        .where(eq(users.id, ctx.user!.id));

      return { success: true };
    }),

  /** Set the tenant's default persona (domain_admin only). */
  setTenantDefault: domainAdminProcedure
    .input(z.object({ personaId: z.string().uuid().nullable() }))
    .mutation(async ({ ctx, input }) => {
      await requirePersonaEnabled();

      if (!ctx.tenantId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No tenant context" });
      }

      // Validate persona exists and is accessible to this tenant
      if (input.personaId) {
        const persona = await getPersonaById(input.personaId);
        if (!persona) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Persona not found" });
        }
        if (persona.scope === "tenant" && persona.tenantId !== ctx.tenantId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Cannot use persona from another tenant" });
        }
        if (persona.scope === "user") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Cannot set user-scope persona as tenant default" });
        }
      }

      const { getDb } = await import("../db");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const { tenants } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");

      await db
        .update(tenants)
        .set({ defaultPersonaId: input.personaId })
        .where(eq(tenants.id, ctx.tenantId));

      return { success: true };
    }),
});
