import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  feedbackTickets,
  feedbackTicketComments,
  feedbackTicketAttachments,
} from "../../drizzle/schema";
import { processTicket } from "../services/virtualAdmin/feedbackProcessor";
import { TRPCError } from "@trpc/server";

// Input sanitization
function sanitizeHtml(str: string): string {
  return str
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

export const feedbackRouter = router({
  // ─── User Endpoints ─────────────────────────────────────

  submit: protectedProcedure
    .input(
      z.object({
        ticketType: z.enum(["bug", "feature_request", "observation", "question"]),
        title: z.string().min(3).max(255),
        description: z.string().max(5000).optional(),
        stepsToReproduce: z.string().max(3000).optional(),
        expectedBehavior: z.string().max(2000).optional(),
        actualBehavior: z.string().max(2000).optional(),
        contextJson: z.record(z.unknown()).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [ticket] = await db
        .insert(feedbackTickets)
        .values({
          tenantId: ctx.tenantId,
          submittedBy: ctx.user.id,
          submittedByType: "human",
          ticketType: input.ticketType,
          title: sanitizeHtml(input.title),
          description: input.description ? sanitizeHtml(input.description) : null,
          stepsToReproduce: input.stepsToReproduce ? sanitizeHtml(input.stepsToReproduce) : null,
          expectedBehavior: input.expectedBehavior ? sanitizeHtml(input.expectedBehavior) : null,
          actualBehavior: input.actualBehavior ? sanitizeHtml(input.actualBehavior) : null,
          contextJson: input.contextJson ?? null,
        })
        .returning({ id: feedbackTickets.id });

      // Auto-process in background (non-blocking)
      processTicket(ticket.id).catch((err) =>
        console.error("[Feedback] Auto-process failed:", err),
      );

      return { id: ticket.id };
    }),

  myTickets: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(20), offset: z.number().min(0).default(0) }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      return db
        .select()
        .from(feedbackTickets)
        .where(eq(feedbackTickets.submittedBy, ctx.user.id))
        .orderBy(desc(feedbackTickets.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  // ─── Admin Endpoints ────────────────────────────────────

  list: adminProcedure
    .input(
      z.object({
        status: z.enum(["new", "triaged", "in_progress", "deferred", "resolved", "duplicate", "closed"]).optional(),
        ticketType: z.enum(["bug", "feature_request", "observation", "question"]).optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const conditions = [];
      if (ctx.tenantId) conditions.push(eq(feedbackTickets.tenantId, ctx.tenantId));
      if (input.status) conditions.push(eq(feedbackTickets.status, input.status));
      if (input.ticketType) conditions.push(eq(feedbackTickets.ticketType, input.ticketType));

      const query = db
        .select()
        .from(feedbackTickets)
        .orderBy(desc(feedbackTickets.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return conditions.length > 0 ? query.where(and(...conditions)) : query;
    }),

  getTicket: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const tickets = await db
        .select()
        .from(feedbackTickets)
        .where(eq(feedbackTickets.id, input.id))
        .limit(1);

      if (tickets.length === 0) throw new TRPCError({ code: "NOT_FOUND" });

      const comments = await db
        .select()
        .from(feedbackTicketComments)
        .where(eq(feedbackTicketComments.ticketId, input.id))
        .orderBy(feedbackTicketComments.createdAt);

      return { ...tickets[0], comments };
    }),

  addComment: adminProcedure
    .input(
      z.object({
        ticketId: z.number(),
        content: z.string().min(1).max(5000),
        isInternal: z.boolean().default(false),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [comment] = await db
        .insert(feedbackTicketComments)
        .values({
          ticketId: input.ticketId,
          authorId: ctx.user.id,
          authorType: "human",
          content: sanitizeHtml(input.content),
          isInternal: input.isInternal,
        })
        .returning({ id: feedbackTicketComments.id });

      // Update ticket respondedAt
      await db
        .update(feedbackTickets)
        .set({ respondedAt: new Date(), updatedAt: new Date() })
        .where(eq(feedbackTickets.id, input.ticketId));

      return { id: comment.id };
    }),

  updateStatus: adminProcedure
    .input(
      z.object({
        ticketId: z.number(),
        status: z.enum(["new", "triaged", "in_progress", "deferred", "resolved", "duplicate", "closed"]),
        resolutionType: z.enum(["fixed", "wont_fix", "duplicate", "cannot_reproduce", "planned", "by_design"]).optional(),
        resolutionNotes: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const updates: Record<string, unknown> = {
        status: input.status,
        updatedAt: new Date(),
      };

      if (input.status === "resolved" || input.status === "closed") {
        updates.resolvedAt = new Date();
        updates.resolutionType = input.resolutionType ?? null;
        updates.resolutionNotes = input.resolutionNotes ?? null;
      }
      if (input.status === "closed") {
        updates.closedAt = new Date();
      }

      await db
        .update(feedbackTickets)
        .set(updates)
        .where(eq(feedbackTickets.id, input.ticketId));

      return { success: true };
    }),

  stats: adminProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const conditions = ctx.tenantId
      ? sql`"tenantId" = ${ctx.tenantId}`
      : sql`1=1`;

    const result = await db.execute(sql`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'new') as new_count,
        COUNT(*) FILTER (WHERE status = 'triaged') as triaged_count,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_count,
        COUNT(*) FILTER (WHERE status = 'resolved') as resolved_count
      FROM feedback_tickets
      WHERE ${conditions}
    `);

    const row = result.rows[0] as any;
    return {
      total: Number(row?.total ?? 0),
      new: Number(row?.new_count ?? 0),
      triaged: Number(row?.triaged_count ?? 0),
      inProgress: Number(row?.in_progress_count ?? 0),
      resolved: Number(row?.resolved_count ?? 0),
    };
  }),
});
