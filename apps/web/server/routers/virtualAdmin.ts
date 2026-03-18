import { z } from "zod";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { router } from "../_core/trpc";
import { adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  virtualAdminIncidents,
  virtualAdminApprovals,
  virtualAdminSensorConfig,
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

      const conditions = [];
      if (ctx.tenantId) conditions.push(eq(virtualAdminIncidents.tenantId, ctx.tenantId));
      if (input.status) conditions.push(eq(virtualAdminIncidents.status, input.status));
      if (input.severity) conditions.push(eq(virtualAdminIncidents.severity, input.severity));
      if (input.sensorId) conditions.push(eq(virtualAdminIncidents.sensorId, input.sensorId));

      const query = db
        .select()
        .from(virtualAdminIncidents)
        .orderBy(desc(virtualAdminIncidents.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      const rows = conditions.length > 0
        ? await query.where(and(...conditions))
        : await query;

      return rows;
    }),

  getIncident: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const incidents = await db
        .select()
        .from(virtualAdminIncidents)
        .where(eq(virtualAdminIncidents.id, input.id))
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

      await db
        .update(virtualAdminIncidents)
        .set({ status: "acknowledged", updatedAt: new Date() })
        .where(eq(virtualAdminIncidents.id, input.id));

      return { success: true };
    }),

  resolveIncident: adminProcedure
    .input(z.object({ id: z.number(), comment: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db
        .update(virtualAdminIncidents)
        .set({
          status: "resolved",
          resolvedBy: ctx.user.id,
          resolvedAt: new Date(),
          actionResult: input.comment ?? null,
          updatedAt: new Date(),
        })
        .where(eq(virtualAdminIncidents.id, input.id));

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

    const conditions = ctx.tenantId
      ? sql`${virtualAdminIncidents.tenantId} = ${ctx.tenantId}`
      : sql`1=1`;

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

      await db.execute(
        sql`INSERT INTO system_settings (category, key, value, "tenantId", "isSensitive")
            VALUES ('virtual_admin', 'VIRTUAL_ADMIN_ENABLED', ${String(input.enabled)}, ${tenantId}, false)
            ON CONFLICT (category, key) WHERE "tenantId" = ${tenantId}
            DO UPDATE SET value = ${String(input.enabled)}`,
      );

      return { success: true, enabled: input.enabled };
    }),

  getSettings: adminProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const settings = await db.execute(
      sql`SELECT key, value FROM system_settings
          WHERE category = 'virtual_admin'
          AND ("tenantId" = ${ctx.tenantId} OR "tenantId" IS NULL)
          ORDER BY "tenantId" NULLS LAST`,
    );

    const result: Record<string, string> = {};
    for (const row of settings.rows as any[]) {
      if (!(row.key in result)) result[row.key] = row.value;
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

      await db.execute(
        sql`INSERT INTO system_settings (category, key, value, "tenantId", "isSensitive")
            VALUES ('virtual_admin', ${input.key}, ${input.value}, ${tenantId}, false)
            ON CONFLICT (category, key) WHERE "tenantId" = ${tenantId}
            DO UPDATE SET value = ${input.value}`,
      );

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
