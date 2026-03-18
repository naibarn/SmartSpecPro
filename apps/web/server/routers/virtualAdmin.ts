import { z } from "zod";
import { eq, and, desc, sql, inArray, like } from "drizzle-orm";
import { router } from "../_core/trpc";
import { adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  virtualAdminIncidents,
  virtualAdminApprovals,
  virtualAdminSensorConfig,
  systemSettings,
} from "../../drizzle/schema";
import { decideApproval } from "../services/virtualAdmin/actuatorRegistry";
import { getSensors, collectSafe } from "../services/virtualAdmin/sensorRegistry";
import { TRPCError } from "@trpc/server";

export const virtualAdminRouter = router({
  listIncidents: adminProcedure
    .input(
      z.object({
        status: z.enum(["open", "acknowledged", "resolved", "expired"]).optional(),
        severity: z.enum(["info", "warning", "error", "critical"]).optional(),
        sensorId: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      if (!ctx.tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant required" });

      const conditions = [eq(virtualAdminIncidents.tenantId, ctx.tenantId)];
      if (input.status) conditions.push(eq(virtualAdminIncidents.status, input.status));
      if (input.severity) conditions.push(eq(virtualAdminIncidents.severity, input.severity));
      if (input.sensorId) conditions.push(eq(virtualAdminIncidents.sensorId, input.sensorId));

      const rows = await db
        .select()
        .from(virtualAdminIncidents)
        .where(and(...conditions))
        .orderBy(desc(virtualAdminIncidents.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return rows;
    }),

  getIncident: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const conditions = [eq(virtualAdminIncidents.id, input.id)];
      if (ctx.tenantId) conditions.push(eq(virtualAdminIncidents.tenantId, ctx.tenantId));

      const incidents = await db
        .select()
        .from(virtualAdminIncidents)
        .where(and(...conditions))
        .limit(1);

      if (incidents.length === 0) throw new TRPCError({ code: "NOT_FOUND" });

      const approvals = await db
        .select()
        .from(virtualAdminApprovals)
        .where(eq(virtualAdminApprovals.incidentId, input.id));

      return { ...incidents[0], approvals };
    }),

  acknowledgeIncident: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const conditions = [eq(virtualAdminIncidents.id, input.id)];
      if (ctx.tenantId) conditions.push(eq(virtualAdminIncidents.tenantId, ctx.tenantId));

      await db
        .update(virtualAdminIncidents)
        .set({ status: "acknowledged", updatedAt: new Date() })
        .where(and(...conditions));

      return { success: true };
    }),

  resolveIncident: adminProcedure
    .input(z.object({ id: z.number(), comment: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const conditions = [eq(virtualAdminIncidents.id, input.id)];
      if (ctx.tenantId) conditions.push(eq(virtualAdminIncidents.tenantId, ctx.tenantId));

      await db
        .update(virtualAdminIncidents)
        .set({
          status: "resolved",
          resolvedBy: ctx.user.id,
          resolvedAt: new Date(),
          actionResult: input.comment ?? null,
          updatedAt: new Date(),
        })
        .where(and(...conditions));

      return { success: true };
    }),

  listPendingApprovals: adminProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const approvals = await db
      .select()
      .from(virtualAdminApprovals)
      .where(eq(virtualAdminApprovals.status, "pending"))
      .orderBy(desc(virtualAdminApprovals.requestedAt));

    // Enrich with incident context
    const incidentIds = [...new Set(approvals.map((a) => a.incidentId))];
    const incidents =
      incidentIds.length > 0
        ? await db
            .select()
            .from(virtualAdminIncidents)
            .where(inArray(virtualAdminIncidents.id, incidentIds))
        : [];

    const incidentMap = new Map(incidents.map((i) => [i.id, i]));

    return approvals.map((a) => ({
      ...a,
      incident: incidentMap.get(a.incidentId) ?? null,
    }));
  }),

  decideApproval: adminProcedure
    .input(
      z.object({
        approvalId: z.number(),
        decision: z.enum(["approved", "rejected"]),
        comment: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const result = await decideApproval(
        input.approvalId,
        input.decision,
        ctx.user.id,
        ctx.tenantId ?? undefined,
        input.comment,
      );
      if (!result.success) {
        throw new TRPCError({ code: "CONFLICT", message: result.message });
      }
      return result;
    }),

  getSensorStatus: adminProcedure.query(async () => {
    const sensors = getSensors();
    const readings = await Promise.all(
      sensors.map(async (s) => ({
        id: s.id,
        name: s.name,
        category: s.category,
        reading: await collectSafe(s),
      })),
    );
    return readings;
  }),

  updateSensorConfig: adminProcedure
    .input(
      z.object({
        sensorId: z.string(),
        enabled: z.boolean().optional(),
        intervalMs: z.number().optional(),
        thresholdsJson: z.record(z.unknown()).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const tenantId = ctx.tenantId;
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant required" });

      const compoundId = `${tenantId}:${input.sensorId}`;
      await db
        .insert(virtualAdminSensorConfig)
        .values({
          id: compoundId,
          tenantId,
          sensorId: input.sensorId,
          enabled: input.enabled ?? true,
          intervalMs: input.intervalMs ?? null,
          thresholdsJson: input.thresholdsJson ?? null,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: virtualAdminSensorConfig.id,
          set: {
            enabled: input.enabled ?? true,
            intervalMs: input.intervalMs ?? null,
            thresholdsJson: input.thresholdsJson ?? null,
            updatedAt: new Date(),
          },
        });

      return { success: true };
    }),

  getDashboardStats: adminProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    if (!ctx.tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant required" });

    const conditions = sql`${virtualAdminIncidents.tenantId} = ${ctx.tenantId}`;

    const stats = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'open') as open_count,
        COUNT(*) FILTER (WHERE severity = 'critical' AND status = 'open') as critical_count,
        COUNT(*) FILTER (WHERE severity = 'warning' AND status = 'open') as warning_count,
        COUNT(*) FILTER (WHERE severity = 'error' AND status = 'open') as error_count,
        COUNT(*) FILTER (WHERE "createdAt" > NOW() - INTERVAL '24 hours') as last_24h_count
      FROM virtual_admin_incidents
      WHERE ${conditions}
    `);

    const pendingApprovals = await db
      .select({ count: sql<number>`count(*)` })
      .from(virtualAdminApprovals)
      .where(eq(virtualAdminApprovals.status, "pending"));

    const row = stats.rows[0] as any;
    return {
      openIncidents: Number(row?.open_count ?? 0),
      criticalCount: Number(row?.critical_count ?? 0),
      warningCount: Number(row?.warning_count ?? 0),
      errorCount: Number(row?.error_count ?? 0),
      last24hCount: Number(row?.last_24h_count ?? 0),
      pendingApprovals: Number(pendingApprovals[0]?.count ?? 0),
    };
  }),

  toggleGuardian: adminProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const tenantId = ctx.tenantId;
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant required" });

      const settingKey = `VIRTUAL_ADMIN_ENABLED:${tenantId}`;
      const existing = await db
        .select({ id: systemSettings.id })
        .from(systemSettings)
        .where(
          and(
            eq(systemSettings.category, "virtual_admin"),
            eq(systemSettings.key, settingKey),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(systemSettings)
          .set({ value: String(input.enabled), updatedAt: new Date() })
          .where(eq(systemSettings.id, existing[0].id));
      } else {
        await db.insert(systemSettings).values({
          category: "virtual_admin",
          key: settingKey,
          value: String(input.enabled),
          isSensitive: false,
        });
      }

      return { success: true, enabled: input.enabled };
    }),

  getSettings: adminProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const tenantId = ctx.tenantId ?? "";

    // Fetch all virtual_admin settings: tenant-specific (key ends with :{tenantId})
    // and global defaults (key contains no colon-tenantId suffix)
    const rows = await db
      .select({ key: systemSettings.key, value: systemSettings.value })
      .from(systemSettings)
      .where(
        and(
          eq(systemSettings.category, "virtual_admin"),
          like(systemSettings.key, "VIRTUAL_ADMIN_%"),
        ),
      );

    // Build result: tenant-specific values take precedence over global defaults.
    // Tenant-specific keys have the form "VIRTUAL_ADMIN_XXX:{tenantId}".
    // Global default keys have the form "VIRTUAL_ADMIN_XXX" (no colon suffix).
    const tenantSuffix = `:${tenantId}`;
    const result: Record<string, string> = {};

    // First pass: collect global defaults (no colon in key after VIRTUAL_ADMIN_)
    for (const row of rows) {
      if (!row.key.includes(":") && row.value != null) {
        result[row.key] = row.value;
      }
    }
    // Second pass: overlay tenant-specific values
    for (const row of rows) {
      if (row.key.endsWith(tenantSuffix) && row.value != null) {
        const baseKey = row.key.slice(0, -tenantSuffix.length);
        result[baseKey] = row.value;
      }
    }

    return result;
  }),

  updateSettings: adminProcedure
    .input(z.object({ key: z.string(), value: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const tenantId = ctx.tenantId;
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant required" });

      if (!input.key.startsWith("VIRTUAL_ADMIN_")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only VIRTUAL_ADMIN_* settings allowed" });
      }

      // Embed tenantId in the key so we don't need a tenantId column
      const settingKey = `${input.key}:${tenantId}`;

      const existing = await db
        .select({ id: systemSettings.id })
        .from(systemSettings)
        .where(
          and(
            eq(systemSettings.category, "virtual_admin"),
            eq(systemSettings.key, settingKey),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(systemSettings)
          .set({ value: input.value, updatedAt: new Date() })
          .where(eq(systemSettings.id, existing[0].id));
      } else {
        await db.insert(systemSettings).values({
          category: "virtual_admin",
          key: settingKey,
          value: input.value,
          isSensitive: false,
        });
      }

      return { success: true };
    }),

  // ─── Chat ─────────────────────────────────────────────

  sendGuardianMessage: adminProcedure
    .input(z.object({ message: z.string().min(1).max(2000) }))
    .mutation(async ({ input, ctx }) => {
      const { handleGuardianMessage } = await import("../services/virtualAdmin/chatHandler");
      return handleGuardianMessage(ctx.user.id, input.message, ctx.tenantId);
    }),

  getGuardianHistory: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const { conversations, messages: messagesTable } = await import("../../drizzle/schema");
      const { isNull } = await import("drizzle-orm");

      const convs = await db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.userId, ctx.user.id),
            sql`${conversations.systemPrompt} LIKE '%[system_guardian]%'`,
            isNull(conversations.trashedAt),
          ),
        )
        .orderBy(desc(conversations.updatedAt))
        .limit(1);

      if (convs.length === 0) {
        return { conversationId: null, messages: [] };
      }

      const conv = convs[0];
      const msgs = await db
        .select()
        .from(messagesTable)
        .where(eq(messagesTable.conversationId, conv.id))
        .orderBy(desc(messagesTable.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return { conversationId: conv.id, messages: msgs.reverse() };
    }),
});
