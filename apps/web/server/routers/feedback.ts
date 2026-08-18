import { z } from "zod";
import { eq, and, desc, isNull, or, sql } from "drizzle-orm";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { createRateLimitMiddleware } from "../_core/rateLimitedProcedure";
import { getDb } from "../db";
import {
  feedbackTickets,
  feedbackTicketComments,
  feedbackTicketAttachments,
  users,
} from "../../drizzle/schema";
import { processTicket } from "../services/virtualAdmin/feedbackProcessor";
import { deriveTitleFromDescription } from "../services/feedbackTitle";
import { createNotification } from "../services/notificationService";
import { TRPCError } from "@trpc/server";
import type { Express, Request, Response } from "express";
import multer from "multer";
import os from "os";
import fs from "fs";
import path from "path";
import { authorizeRequest } from "../_core/authz";
import { storagePut, storageResolveUrl, storageDelete } from "../storage";
import {
  extractAffectedUserIds,
  resolveAffectedUsers,
  type AffectedUser,
} from "../services/feedbackAffectedUsers";

type TenantRequest = Request & { tenantId?: string };

function adminTicketTenantCondition(tenantId: string | null) {
  if (!tenantId) return null;
  // Keep legacy unscoped system diagnostics visible to admins. Human tickets
  // and tenant-scoped system tickets still require an exact tenant match.
  return or(
    eq(feedbackTickets.tenantId, tenantId),
    and(eq(feedbackTickets.submittedByType, "system"), isNull(feedbackTickets.tenantId)),
  );
}

// Rate-limited procedure for feedback submission: max 10 per hour per IP.
// Keyed on IP (same as all other rate-limited procedures in the codebase) so a
// single address cannot spam the ticket queue regardless of how many accounts it
// holds.  Auth check via protectedProcedure runs first, before any rate-limit
// bucket is consumed.
const feedbackSubmitProcedure = protectedProcedure.use(
  createRateLimitMiddleware({ namespace: "feedback-submit", limit: 10, windowMs: 60 * 60_000 }),
);

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

  submit: feedbackSubmitProcedure
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

      const normalized = deriveTitleFromDescription(input.title, input.description);

      const [ticket] = await db
        .insert(feedbackTickets)
        .values({
          tenantId: ctx.tenantId,
          submittedBy: ctx.user.id,
          submittedByType: "human",
          ticketType: input.ticketType,
          title: sanitizeHtml(normalized.title),
          description: normalized.description ? sanitizeHtml(normalized.description) : null,
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

      // "My Feedback" lists only tickets the user actually submitted.
      // Auto-filed system error reports carry the user's id in submittedBy
      // but are not their feedback — showing them buried real tickets and
      // made this page look like a (broken) admin inbox.
      return db
        .select()
        .from(feedbackTickets)
        .where(
          and(
            eq(feedbackTickets.submittedBy, ctx.user.id),
            eq(feedbackTickets.submittedByType, "human"),
            ...(ctx.tenantId ? [eq(feedbackTickets.tenantId, ctx.tenantId)] : []),
          ),
        )
        .orderBy(desc(feedbackTickets.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  myTicketDetail: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const tickets = await db
        .select()
        .from(feedbackTickets)
        .where(and(
          eq(feedbackTickets.id, input.id),
          eq(feedbackTickets.submittedBy, ctx.user.id),
          ...(ctx.tenantId ? [eq(feedbackTickets.tenantId, ctx.tenantId)] : []),
        ))
        .limit(1);

      if (tickets.length === 0) throw new TRPCError({ code: "NOT_FOUND" });

      // Only return non-internal comments to the user
      const comments = await db
        .select()
        .from(feedbackTicketComments)
        .where(
          and(
            eq(feedbackTicketComments.ticketId, input.id),
            eq(feedbackTicketComments.isInternal, false),
          ),
        )
        .orderBy(feedbackTicketComments.createdAt);

      const attachments = await db
        .select()
        .from(feedbackTicketAttachments)
        .where(eq(feedbackTicketAttachments.ticketId, input.id))
        .orderBy(feedbackTicketAttachments.createdAt);

      const resolvedAttachments = await Promise.all(
        attachments.map(async (a) => {
          const url = await storageResolveUrl(a.fileUrl).catch(() => a.fileUrl);
          return { ...a, resolvedUrl: url ?? a.fileUrl };
        }),
      );

      return { ...tickets[0], comments, attachments: resolvedAttachments };
    }),

  // ─── Admin Endpoints ────────────────────────────────────

  list: adminProcedure
    .input(
      z.object({
        status: z.enum(["new", "triaged", "in_progress", "deferred", "resolved", "duplicate", "closed"]).optional(),
        ticketType: z.enum(["bug", "feature_request", "observation", "question"]).optional(),
        // Separate genuine user feedback ("human") from auto-filed system
        // error reports ("system"). Defaults to no filter so existing callers
        // keep seeing everything.
        submittedByType: z.enum(["human", "system"]).optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const conditions = [];
      const tenantCondition = adminTicketTenantCondition(ctx.tenantId);
      if (tenantCondition) conditions.push(tenantCondition);
      if (input.status) conditions.push(eq(feedbackTickets.status, input.status));
      if (input.ticketType) conditions.push(eq(feedbackTickets.ticketType, input.ticketType));
      if (input.submittedByType)
        conditions.push(eq(feedbackTickets.submittedByType, input.submittedByType));

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
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const conditions = [eq(feedbackTickets.id, input.id)];
      const tenantCondition = adminTicketTenantCondition(ctx.tenantId);
      if (tenantCondition) conditions.push(tenantCondition);

      const tickets = await db
        .select()
        .from(feedbackTickets)
        .where(and(...conditions))
        .limit(1);

      if (tickets.length === 0) throw new TRPCError({ code: "NOT_FOUND" });

      const ticket = tickets[0];
      const affectedUserIds = extractAffectedUserIds(ticket.contextJson);
      let affectedUsers: AffectedUser[] = affectedUserIds.map((id) => ({
        id,
        email: null,
      }));
      if (affectedUserIds.length > 0) {
        try {
          affectedUsers = await resolveAffectedUsers(
            db,
            affectedUserIds,
            ticket.tenantId ?? ctx.tenantId,
          );
        } catch (err) {
          console.error("[Feedback] Failed to resolve affected user emails:", err);
        }
      }

      const comments = await db
        .select()
        .from(feedbackTicketComments)
        .where(eq(feedbackTicketComments.ticketId, input.id))
        .orderBy(feedbackTicketComments.createdAt);

      const attachments = await db
        .select()
        .from(feedbackTicketAttachments)
        .where(eq(feedbackTicketAttachments.ticketId, input.id))
        .orderBy(feedbackTicketAttachments.createdAt);

      const resolvedAttachments = await Promise.all(
        attachments.map(async (a) => {
          const url = await storageResolveUrl(a.fileUrl).catch(() => a.fileUrl);
          return { ...a, resolvedUrl: url ?? a.fileUrl };
        }),
      );

      return { ...ticket, affectedUsers, comments, attachments: resolvedAttachments };
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
        .where(and(
          eq(feedbackTickets.id, input.ticketId),
          adminTicketTenantCondition(ctx.tenantId) ?? sql`true`,
        ));

      // Notify the ticket submitter (non-internal comments only)
      if (!input.isInternal) {
        const [ticket] = await db
          .select({ submittedBy: feedbackTickets.submittedBy, title: feedbackTickets.title })
          .from(feedbackTickets)
          .where(and(
            eq(feedbackTickets.id, input.ticketId),
            adminTicketTenantCondition(ctx.tenantId) ?? sql`true`,
          ))
          .limit(1);

        if (ticket?.submittedBy && ticket.submittedBy !== ctx.user.id) {
          createNotification({
            db,
            userId: ticket.submittedBy,
            type: "system",
            title: `Reply on feedback: ${ticket.title}`,
            content: input.content.slice(0, 300),
            priority: "normal",
            relatedResourceType: "feedback",
            relatedResourceId: String(input.ticketId),
            actionUrl: `/admin/feedback-hub?ticketId=${input.ticketId}`,
            actionLabel: "View Feedback",
            metadata: { source: "feedback.reply" },
          }).catch((err) =>
            console.error("[Feedback] Notification failed:", err),
          );
        }
      }

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

      const tenantCondition = adminTicketTenantCondition(ctx.tenantId);
      const updateConditions = [eq(feedbackTickets.id, input.ticketId)];
      if (tenantCondition) updateConditions.push(tenantCondition);

      const updated = await db
        .update(feedbackTickets)
        .set(updates)
        .where(and(...updateConditions))
        .returning({ id: feedbackTickets.id });

      if (updated.length === 0) throw new TRPCError({ code: "NOT_FOUND" });

      // Notify user on meaningful status changes
      if (["resolved", "closed", "in_progress"].includes(input.status)) {
        const [ticket] = await db
          .select({ submittedBy: feedbackTickets.submittedBy, title: feedbackTickets.title })
          .from(feedbackTickets)
          .where(and(
            eq(feedbackTickets.id, input.ticketId),
            adminTicketTenantCondition(ctx.tenantId) ?? sql`true`,
          ))
          .limit(1);

        if (ticket?.submittedBy && ticket.submittedBy !== ctx.user.id) {
          const statusMsg: Record<string, string> = {
            in_progress: "is now being worked on",
            resolved: "has been resolved",
            closed: "has been closed",
          };
          createNotification({
            db,
            userId: ticket.submittedBy,
            type: "system",
            title: `Reply on feedback: ${ticket.title}`,
            content: `Your feedback "${ticket.title}" ${statusMsg[input.status] ?? "status updated"}.${input.resolutionNotes ? ` Note: ${input.resolutionNotes.slice(0, 200)}` : ""}`,
            priority: input.status === "resolved" ? "high" : "normal",
            relatedResourceType: "feedback",
            relatedResourceId: String(input.ticketId),
            actionUrl: `/admin/feedback-hub?ticketId=${input.ticketId}`,
            actionLabel: "View Feedback",
            metadata: { source: "feedback.statusChange" },
          }).catch((err) =>
            console.error("[Feedback] Status notification failed:", err),
          );
        }
      }

      return { success: true };
    }),

  getAttachments: protectedProcedure
    .input(z.object({ ticketId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Verify ticket access: users see own tickets only, admins see same-tenant tickets
      const isAdmin = ctx.user.role === "admin" || ctx.user.role === "domain_admin";
      const ticketConditions = [eq(feedbackTickets.id, input.ticketId)];
      if (!isAdmin) {
        ticketConditions.push(eq(feedbackTickets.submittedBy, ctx.user.id));
      }
      if (ctx.tenantId) {
        ticketConditions.push(eq(feedbackTickets.tenantId, ctx.tenantId));
      }
      const [ticket] = await db
        .select({ id: feedbackTickets.id })
        .from(feedbackTickets)
        .where(and(...ticketConditions))
        .limit(1);
      if (!ticket) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const attachments = await db
        .select()
        .from(feedbackTicketAttachments)
        .where(eq(feedbackTicketAttachments.ticketId, input.ticketId))
        .orderBy(feedbackTicketAttachments.createdAt);

      // Resolve URLs for each attachment
      const resolved = await Promise.all(
        attachments.map(async (a) => {
          const url = await storageResolveUrl(a.fileUrl).catch(() => a.fileUrl);
          return { ...a, resolvedUrl: url ?? a.fileUrl };
        }),
      );
      return resolved;
    }),

  deleteAttachment: protectedProcedure
    .input(z.object({ attachmentId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Find the attachment
      const [att] = await db
        .select()
        .from(feedbackTicketAttachments)
        .where(eq(feedbackTicketAttachments.id, input.attachmentId))
        .limit(1);

      if (!att) throw new TRPCError({ code: "NOT_FOUND" });

      const isAdmin = ctx.user.role === "admin" || ctx.user.role === "domain_admin";
      const ticketConditions = [eq(feedbackTickets.id, att.ticketId)];
      if (!isAdmin) ticketConditions.push(eq(feedbackTickets.submittedBy, ctx.user.id));
      const tenantCondition = isAdmin
        ? adminTicketTenantCondition(ctx.tenantId)
        : ctx.tenantId
          ? eq(feedbackTickets.tenantId, ctx.tenantId)
          : null;
      if (tenantCondition) ticketConditions.push(tenantCondition);
      const [ticket] = await db
        .select({ id: feedbackTickets.id })
        .from(feedbackTickets)
        .where(and(...ticketConditions))
        .limit(1);
      if (!ticket) throw new TRPCError({ code: "NOT_FOUND" });

      // Verify ownership: uploader or admin
      if (att.uploadedBy !== ctx.user.id && !isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to delete this attachment" });
      }

      // Delete from storage (best-effort)
      await storageDelete(att.fileUrl).catch((err) =>
        console.error("[Feedback] Storage delete failed:", err),
      );

      // Delete from DB
      await db
        .delete(feedbackTicketAttachments)
        .where(and(
          eq(feedbackTicketAttachments.id, input.attachmentId),
          eq(feedbackTicketAttachments.ticketId, ticket.id),
        ));

      return { success: true };
    }),

  stats: adminProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const conditions = ctx.tenantId
      ? sql`("tenantId" = ${ctx.tenantId} OR ("submittedByType" = 'system' AND "tenantId" IS NULL))`
      : sql`1=1`;

    const result = await db.execute(sql`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'new') as new_count,
        COUNT(*) FILTER (WHERE status = 'triaged') as triaged_count,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_count,
        COUNT(*) FILTER (WHERE status = 'resolved') as resolved_count,
        COUNT(*) FILTER (WHERE "submittedByType" = 'human') as human_count,
        COUNT(*) FILTER (WHERE "submittedByType" = 'system') as system_count
      FROM feedback_tickets
      WHERE ${conditions}
    `);

    const [row] = result as any[];
    return {
      total: Number(row?.total ?? 0),
      new: Number(row?.new_count ?? 0),
      triaged: Number(row?.triaged_count ?? 0),
      inProgress: Number(row?.in_progress_count ?? 0),
      resolved: Number(row?.resolved_count ?? 0),
      human: Number(row?.human_count ?? 0),
      system: Number(row?.system_count ?? 0),
    };
  }),
});

// ─── Express Upload Route ────────────────────────────────────
// Separate from tRPC because multer multipart handling requires Express middleware.

const FEEDBACK_MAX_FILES = 5;
const FEEDBACK_MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB per file
const FEEDBACK_ALLOWED_EXTS = new Set(["jpg", "jpeg", "png", "webp", "pdf", "md"]);

/** Strip path traversal and special chars from filename, keep extension */
function sanitizeFileName(original: string): string {
  const base = path.basename(original); // strip directory components
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
}

/** Cleanup all multer temp files from the request */
function cleanupTempFiles(req: Request) {
  const files = (req as any).files as Express.Multer.File[] | undefined;
  if (files) {
    for (const f of files) {
      fs.unlink(f.path, () => {});
    }
  }
}

const feedbackUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, os.tmpdir()),
    filename: (_req, file, cb) => {
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      cb(null, `fb-${uniqueSuffix}-${sanitizeFileName(file.originalname)}`);
    },
  }),
  limits: { fileSize: FEEDBACK_MAX_FILE_SIZE, files: FEEDBACK_MAX_FILES },
  fileFilter: (_req, file, cb) => {
    // Validate by extension only (MIME can be spoofed)
    const ext = file.originalname.split(".").pop()?.toLowerCase() ?? "";
    if (!FEEDBACK_ALLOWED_EXTS.has(ext)) {
      return cb(new Error(`File type not allowed: .${ext}. Allowed: ${[...FEEDBACK_ALLOWED_EXTS].join(", ")}`));
    }
    cb(null, true);
  },
});

export function registerFeedbackUploadRoutes(app: Express) {
  app.post(
    "/api/feedback/upload",
    feedbackUpload.array("files", FEEDBACK_MAX_FILES) as any,
    async (req: Request, res: Response) => {
      try {
        // Auth — runs after multer; if it fails, clean up temp files
        const auth = await authorizeRequest(req, { allowBearer: true, allowSession: true });
        if (!auth.ok) {
          cleanupTempFiles(req);
          return res.status(401).json({ error: auth.error });
        }

        const ticketId = parseInt(req.body?.ticketId, 10);
        if (isNaN(ticketId)) {
          cleanupTempFiles(req);
          return res.status(400).json({ error: "Missing or invalid ticketId" });
        }

        const db = await getDb();
        if (!db) {
          cleanupTempFiles(req);
          return res.status(500).json({ error: "Database unavailable" });
        }

        const userId = parseInt(auth.sub, 10);
        if (isNaN(userId)) {
          cleanupTempFiles(req);
          return res.status(401).json({ error: "Invalid user identity" });
        }

        // Look up user role from DB (auth.user available only in session mode)
        const [userRow] = await db
          .select({ role: users.role })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);
        const isAdmin = userRow?.role === "admin" || userRow?.role === "domain_admin";

        // Verify ticket exists, belongs to user's tenant, and user owns it (or is admin)
        const tenantReq = req as TenantRequest;
        const tenantId = tenantReq.tenantId ?? null;

        const ticketConditions = [eq(feedbackTickets.id, ticketId)];
        if (tenantId) ticketConditions.push(eq(feedbackTickets.tenantId, tenantId));

        const [ticket] = await db
          .select({ submittedBy: feedbackTickets.submittedBy })
          .from(feedbackTickets)
          .where(and(...ticketConditions))
          .limit(1);

        if (!ticket) {
          cleanupTempFiles(req);
          return res.status(404).json({ error: "Ticket not found" });
        }

        if (ticket.submittedBy !== userId && !isAdmin) {
          cleanupTempFiles(req);
          return res.status(403).json({ error: "Not authorized to upload to this ticket" });
        }

        const files = (req as any).files as Express.Multer.File[] | undefined;
        if (!files || files.length === 0) {
          cleanupTempFiles(req);
          return res.status(400).json({ error: "No files provided" });
        }

        // Use transaction for atomic count check + insert
        const result = await db.transaction(async (tx) => {
          const [countRow] = await tx
            .select({ count: sql<number>`count(*)::int` })
            .from(feedbackTicketAttachments)
            .where(eq(feedbackTicketAttachments.ticketId, ticketId));

          const existingCount = countRow?.count ?? 0;

          if (existingCount + files.length > FEEDBACK_MAX_FILES) {
            return {
              error: `Maximum ${FEEDBACK_MAX_FILES} attachments per ticket. Currently ${existingCount}, trying to add ${files.length}.`,
            };
          }

          const inserted = [];
          const errors = [];

          for (const file of files) {
            let relKey: string | null = null;
            try {
              if (file.size === 0) {
                errors.push({ fileName: file.originalname, error: "File is empty" });
                continue;
              }
              const fileData = fs.readFileSync(file.path);
              const safeName = sanitizeFileName(file.originalname);
              relKey = `feedback/${ticketId}/${Date.now()}-${safeName}`;
              const { url } = await storagePut(relKey, fileData, file.mimetype);

              const safeDisplayName = sanitizeHtml(file.originalname.slice(0, 255));
              const [row] = await tx
                .insert(feedbackTicketAttachments)
                .values({
                  ticketId,
                  fileName: safeDisplayName,
                  fileUrl: relKey,
                  fileSize: file.size,
                  mimeType: file.mimetype,
                  uploadedBy: userId,
                })
                .returning();

              inserted.push({ id: row.id, fileName: row.fileName, fileSize: row.fileSize, url });
            } catch (fileErr: any) {
              // Clean up orphaned storage file on DB insert failure
              if (relKey) {
                const { storageDelete } = await import("../storage");
                await storageDelete(relKey).catch(() => {});
              }
              errors.push({ fileName: file.originalname, error: fileErr.message ?? "Upload failed" });
            } finally {
              fs.unlink(file.path, () => {});
            }
          }

          return { attachments: inserted, errors: errors.length > 0 ? errors : undefined };
        });

        if ("error" in result && typeof result.error === "string") {
          cleanupTempFiles(req);
          return res.status(400).json({ error: result.error });
        }

        return res.json(result);
      } catch (err: any) {
        cleanupTempFiles(req);
        console.error("[Feedback Upload] Error:", err);
        return res.status(500).json({ error: "Upload failed" });
      }
    },
  );

  // Multer error handler — multer errors (file size, file count, filter) are thrown
  // BEFORE the route handler runs, so Express skips to the next error middleware.
  app.use("/api/feedback/upload", (err: any, req: Request, res: Response, _next: any) => {
    cleanupTempFiles(req);
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: `File too large. Maximum ${FEEDBACK_MAX_FILE_SIZE / 1024 / 1024} MB per file.` });
    }
    if (err.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({ error: `Maximum ${FEEDBACK_MAX_FILES} files per upload.` });
    }
    if (err.message?.includes("File type not allowed")) {
      return res.status(400).json({ error: err.message });
    }
    console.error("[Feedback Upload] Multer error:", err);
    return res.status(500).json({ error: "Upload failed" });
  });
}
