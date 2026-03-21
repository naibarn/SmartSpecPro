/**
 * Notification Webhooks tRPC Router
 *
 * CRUD operations for webhook endpoints with SSRF validation,
 * encrypted secret storage, and ownership isolation.
 */

import { z } from "zod";
import { eq, and, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { notificationWebhooks } from "../../drizzle/schema";
import { encrypt, decrypt } from "../services/crypto";
import {
  validateWebhookUrl,
  computeSignature,
  deliverWebhook,
} from "../services/notificationWebhookService";

const createWebhookInput = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url().max(2000),
  secret: z.string().min(16).max(256),
  categories: z.array(z.string()).nullable().optional(),
  minSeverity: z
    .enum(["low", "normal", "high", "critical"])
    .nullable()
    .optional(),
  scope: z.enum(["user", "tenant"]),
});

const updateWebhookInput = z.object({
  id: z.number(),
  name: z.string().min(1).max(100).optional(),
  url: z.string().url().max(2000).optional(),
  secret: z.string().min(16).max(256).optional(),
  categories: z.array(z.string()).nullable().optional(),
  minSeverity: z
    .enum(["low", "normal", "high", "critical"])
    .nullable()
    .optional(),
  isEnabled: z.boolean().optional(),
});

function stripSecret(webhook: any) {
  const { secretEncrypted, ...rest } = webhook;
  return { ...rest, hasSecret: true };
}

export const notificationWebhooksRouter = router({
  listWebhooks: protectedProcedure
    .input(z.object({ scope: z.enum(["user", "tenant"]) }))
    .query(async ({ ctx, input }) => {
      const db = getDb();

      if (input.scope === "tenant") {
        if (ctx.user.role !== "admin" && ctx.user.role !== "system_agent") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Admin access required for tenant-wide webhooks",
          });
        }
        if (!ctx.tenantId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Tenant context required",
          });
        }
        const rows = await db
          .select()
          .from(notificationWebhooks)
          .where(
            and(
              eq(notificationWebhooks.tenantId, ctx.tenantId),
              isNull(notificationWebhooks.userId)
            )
          );
        return rows.map(stripSecret);
      }

      // User scope
      const rows = await db
        .select()
        .from(notificationWebhooks)
        .where(eq(notificationWebhooks.userId, ctx.user.id));
      return rows.map(stripSecret);
    }),

  createWebhook: protectedProcedure
    .input(createWebhookInput)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();

      if (input.scope === "tenant") {
        if (ctx.user.role !== "admin" && ctx.user.role !== "system_agent") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Admin access required for tenant-wide webhooks",
          });
        }
      }

      if (!ctx.tenantId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Tenant context required",
        });
      }

      // SSRF validation
      await validateWebhookUrl(input.url);

      // Encrypt the secret
      const secretEncrypted = encrypt(input.secret);

      const [created] = await db
        .insert(notificationWebhooks)
        .values({
          tenantId: ctx.tenantId,
          userId: input.scope === "user" ? ctx.user.id : null,
          name: input.name,
          url: input.url,
          secretEncrypted,
          categories: input.categories ?? null,
          minSeverity: input.minSeverity ?? null,
        })
        .returning();

      return stripSecret(created);
    }),

  updateWebhook: protectedProcedure
    .input(updateWebhookInput)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();

      // Load existing webhook
      const rows = await db
        .select()
        .from(notificationWebhooks)
        .where(eq(notificationWebhooks.id, input.id))
        .limit(1);

      if (rows.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Webhook not found",
        });
      }

      const webhook = rows[0];

      // Ownership check
      if (webhook.userId !== null) {
        if (webhook.userId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Cannot modify another user's webhook",
          });
        }
      } else {
        // Tenant-wide webhook: admin only
        if (ctx.user.role !== "admin" && ctx.user.role !== "system_agent") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Admin access required for tenant-wide webhooks",
          });
        }
      }

      // SSRF check if URL is changing
      if (input.url) {
        await validateWebhookUrl(input.url);
      }

      // Build update set
      const updates: Record<string, any> = { updatedAt: new Date() };
      if (input.name !== undefined) updates.name = input.name;
      if (input.url !== undefined) updates.url = input.url;
      if (input.secret !== undefined) updates.secretEncrypted = encrypt(input.secret);
      if (input.categories !== undefined) updates.categories = input.categories;
      if (input.minSeverity !== undefined) updates.minSeverity = input.minSeverity;
      if (input.isEnabled !== undefined) {
        updates.isEnabled = input.isEnabled;
        // Reset failure count when re-enabling
        if (input.isEnabled) {
          updates.failureCount = 0;
        }
      }

      const [updated] = await db
        .update(notificationWebhooks)
        .set(updates)
        .where(eq(notificationWebhooks.id, input.id))
        .returning();

      return stripSecret(updated);
    }),

  deleteWebhook: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();

      const rows = await db
        .select()
        .from(notificationWebhooks)
        .where(eq(notificationWebhooks.id, input.id))
        .limit(1);

      if (rows.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Webhook not found",
        });
      }

      const webhook = rows[0];

      // Ownership check
      if (webhook.userId !== null) {
        if (webhook.userId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Cannot delete another user's webhook",
          });
        }
      } else {
        if (ctx.user.role !== "admin" && ctx.user.role !== "system_agent") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Admin access required for tenant-wide webhooks",
          });
        }
      }

      await db
        .delete(notificationWebhooks)
        .where(eq(notificationWebhooks.id, input.id));

      return { success: true };
    }),

  testWebhook: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();

      const rows = await db
        .select()
        .from(notificationWebhooks)
        .where(eq(notificationWebhooks.id, input.id))
        .limit(1);

      if (rows.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Webhook not found",
        });
      }

      const webhook = rows[0];

      // Ownership check
      if (webhook.userId !== null && webhook.userId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot test another user's webhook",
        });
      }
      if (
        webhook.userId === null &&
        ctx.user.role !== "admin" &&
        ctx.user.role !== "system_agent"
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Admin access required for tenant-wide webhooks",
        });
      }

      // SSRF re-validation
      try {
        await validateWebhookUrl(webhook.url);
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "URL validation failed",
        };
      }

      // Send test payload
      const secret = decrypt(webhook.secretEncrypted);
      const testPayload = {
        event: "webhook.test" as const,
        timestamp: new Date().toISOString(),
        notification: {
          id: 0,
          type: "system",
          title: "Test webhook",
          content:
            "This is a test delivery from SmartSpecPro.",
          priority: "normal",
          relatedResourceType: null,
          relatedResourceId: null,
          actionUrl: null,
          metadata: null,
          createdAt: new Date().toISOString(),
        },
      };

      const body = JSON.stringify(testPayload);
      const signature = computeSignature(body, secret);

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(webhook.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Signature-256": `sha256=${signature}`,
            "User-Agent": "SmartSpecPro-Webhook/1.0",
          },
          body,
          signal: controller.signal,
        });

        clearTimeout(timeout);

        return {
          success: response.ok,
          statusCode: response.status,
          error: response.ok
            ? undefined
            : `HTTP ${response.status} ${response.statusText}`,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Request failed",
        };
      }
    }),
});
