import crypto from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, lt, ne, sql } from "drizzle-orm";
import sanitizeHtml from "sanitize-html";
import { z } from "zod";

import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { getTenantFeatureFlag } from "../services/featureFlags";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import { blogPosts, contentComposerDrafts, tenantPages, type ContentComposerDraft } from "../../drizzle/schema";
import { generateComposerCaption, publishContentComposerDraft } from "../services/contentComposerPublishService";

const articleSanitizeConfig: sanitizeHtml.IOptions = {
  allowedTags: ["h1", "h2", "h3", "h4", "p", "ul", "ol", "li", "blockquote", "pre", "code", "a", "b", "i", "em", "strong", "br", "img"],
  allowedAttributes: {
    a: ["href", "title"],
    img: ["src", "alt"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  disallowedTagsMode: "discard",
};

const contentComposerProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
  if (!tenantId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Tenant context is required",
    });
  }

  const enabled = await getTenantFeatureFlag("CONTENT_COMPOSER_ENABLED", tenantId);
  if (!enabled) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Content Composer is disabled for this tenant",
    });
  }

  return next({
    ctx: {
      ...ctx,
      tenantId,
    },
  });
});

const saveDraftInputSchema = z.object({
  id: z.string().optional().nullable(),
  topic: z.string().max(2000).optional().nullable(),
  executionSource: z.enum(["skill", "agency"]).optional().nullable(),
  skillId: z.string().max(255).optional().nullable(),
  agencyId: z.string().max(255).optional().nullable(),
  requiresWebSearch: z.boolean().optional(),
  requiresThinking: z.boolean().optional(),
  articleBody: z.string().optional().nullable(),
  attachmentIds: z.array(z.number().int().positive()).max(6).optional().nullable(),
  destinationKind: z.enum(["docs", "blog", "social"]).optional().nullable(),
  docsSubKind: z.enum(["doc_page", "cms_page"]).optional().nullable(),
  docsTargetId: z.number().int().positive().optional().nullable(),
  blogTargetId: z.number().int().positive().optional().nullable(),
  socialPlatform: z.enum(["youtube", "facebook", "tiktok", "upload_post"]).optional().nullable(),
  socialTargetId: z.number().int().positive().optional().nullable(),
  socialCaption: z.string().max(2000).optional().nullable(),
});

const listDraftsInputSchema = z.object({
  cursor: z.string().optional().nullable(),
  limit: z.number().int().min(1).max(50).default(20),
});

const generateCaptionInputSchema = z.object({
  topic: z.string().max(2000),
  articleBody: z.string().optional().nullable(),
  socialPlatform: z.enum(["youtube", "facebook", "tiktok", "upload_post"]).optional().nullable(),
  attachmentCount: z.number().int().min(0).max(6).default(0),
  requiresWebSearch: z.boolean().default(false),
  requiresThinking: z.boolean().default(false),
});

function sanitizeDraftHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  return sanitizeHtml(html, articleSanitizeConfig);
}

async function loadDraftById(db: Awaited<ReturnType<typeof getDb>>, id: string): Promise<ContentComposerDraft | null> {
  const rows = await db.select().from(contentComposerDrafts).where(eq(contentComposerDrafts.id, id)).limit(1);
  return rows[0] ?? null;
}

function assertDraftAccess(draft: ContentComposerDraft | null, tenantId: string, userId: number): ContentComposerDraft {
  if (!draft || draft.status === "deleted") {
    throw new TRPCError({ code: "NOT_FOUND", message: "Draft not found" });
  }

  if (draft.tenantId !== tenantId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Draft not found" });
  }

  if (draft.userId !== userId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You do not own this draft" });
  }

  return draft;
}

function assertPrivilegedRole(role: string | null | undefined): void {
  if (role !== "admin" && role !== "domain_admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This action is restricted to admins",
    });
  }
}

function buildDocsTargetPath(pageKey: string, slug: string): string {
  if (pageKey === "home" || slug === "home") {
    return "/";
  }

  if (pageKey.startsWith("docs-")) {
    return `/docs/${slug.replace(/^\/+/, "")}`;
  }

  return `/${slug.replace(/^\/+/, "")}`;
}

function buildBlogTargetPath(slug: string): string {
  return `/blog/${slug.replace(/^\/+/, "")}`;
}

export const contentComposerRouter = router({
  listDrafts: contentComposerProcedure
    .input(listDraftsInputSchema.optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const limit = input?.limit ?? 20;
      const cursorDate = input?.cursor ? new Date(input.cursor) : null;
      if (cursorDate && Number.isNaN(cursorDate.getTime())) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid cursor value" });
      }

      const conditions = [
        eq(contentComposerDrafts.tenantId, ctx.tenantId),
        eq(contentComposerDrafts.userId, ctx.user.id),
        ne(contentComposerDrafts.status, "deleted"),
      ];
      if (cursorDate) {
        conditions.push(lt(contentComposerDrafts.updatedAt, cursorDate));
      }

      const rows = await db
        .select({
          id: contentComposerDrafts.id,
          topic: contentComposerDrafts.topic,
          status: contentComposerDrafts.status,
          destinationKind: contentComposerDrafts.destinationKind,
          updatedAt: contentComposerDrafts.updatedAt,
          attachmentCount: sql<number>`COALESCE(json_array_length(${contentComposerDrafts.attachmentIds}), 0)`,
        })
        .from(contentComposerDrafts)
        .where(and(...conditions))
        .orderBy(desc(contentComposerDrafts.updatedAt))
        .limit(limit + 1);

      const nextCursorRow = rows.length > limit ? rows.pop() : null;
      return {
        drafts: rows,
        nextCursor: nextCursorRow ? nextCursorRow.updatedAt.toISOString() : null,
      };
    }),

  getDraft: contentComposerProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const draft = await loadDraftById(db, input.id);
      const owned = assertDraftAccess(draft, ctx.tenantId, ctx.user.id);
      return owned;
    }),

  saveDraft: contentComposerProcedure
    .input(saveDraftInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const now = new Date();
      const sanitizedArticleBody = sanitizeDraftHtml(input.articleBody);
      const attachmentIds = input.attachmentIds ? Array.from(new Set(input.attachmentIds)).slice(0, 6) : undefined;

      if (input.id) {
        const existing = assertDraftAccess(await loadDraftById(db, input.id), ctx.tenantId, ctx.user.id);
        const [updated] = await db
          .update(contentComposerDrafts)
          .set({
            topic: input.topic ?? existing.topic,
            executionSource: input.executionSource ?? existing.executionSource,
            skillId: input.skillId ?? existing.skillId,
            agencyId: input.agencyId ?? existing.agencyId,
            articleBody: sanitizedArticleBody ?? existing.articleBody,
            requiresWebSearch: input.requiresWebSearch ?? existing.requiresWebSearch,
            requiresThinking: input.requiresThinking ?? existing.requiresThinking,
            attachmentIds: attachmentIds ?? existing.attachmentIds,
            destinationKind: input.destinationKind ?? existing.destinationKind,
            docsSubKind: input.docsSubKind ?? existing.docsSubKind,
            docsTargetId: input.docsTargetId ?? existing.docsTargetId,
            blogTargetId: input.blogTargetId ?? existing.blogTargetId,
            socialPlatform: input.socialPlatform ?? existing.socialPlatform,
            socialTargetId: input.socialTargetId ?? existing.socialTargetId,
            socialCaption: input.socialCaption ?? existing.socialCaption,
            updatedAt: now,
          })
          .where(eq(contentComposerDrafts.id, input.id))
          .returning();

        return {
          id: updated.id,
          updatedAt: updated.updatedAt.toISOString(),
        };
      }

      const id = crypto.randomUUID();
      const [created] = await db
        .insert(contentComposerDrafts)
        .values({
          id,
          tenantId: ctx.tenantId,
          userId: ctx.user.id,
          topic: input.topic ?? "",
          executionSource: input.executionSource ?? "skill",
          skillId: input.skillId ?? null,
          agencyId: input.agencyId ?? null,
          articleBody: sanitizedArticleBody,
          requiresWebSearch: input.requiresWebSearch ?? false,
          requiresThinking: input.requiresThinking ?? false,
          attachmentIds: attachmentIds ?? [],
          destinationKind: input.destinationKind ?? null,
          docsSubKind: input.docsSubKind ?? null,
          docsTargetId: input.docsTargetId ?? null,
          blogTargetId: input.blogTargetId ?? null,
          socialPlatform: input.socialPlatform ?? null,
          socialTargetId: input.socialTargetId ?? null,
          socialCaption: input.socialCaption ?? null,
          status: "draft",
          createdAt: now,
          updatedAt: now,
          publishedAt: null,
          errorMessage: null,
        })
        .returning();

      return {
        id: created.id,
        updatedAt: created.updatedAt.toISOString(),
      };
    }),

  deleteDraft: contentComposerProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const existing = assertDraftAccess(await loadDraftById(db, input.id), ctx.tenantId, ctx.user.id);
      await db
        .update(contentComposerDrafts)
        .set({
          status: "deleted",
          updatedAt: new Date(),
        })
        .where(eq(contentComposerDrafts.id, existing.id));

      return { success: true as const };
    }),

  listDocsTargets: contentComposerProcedure.query(async ({ ctx }) => {
    assertPrivilegedRole(ctx.user.role);
    const db = await getDb();
    const rows = await db
      .select({
        id: tenantPages.id,
        title: tenantPages.title,
        slug: tenantPages.slug,
        pageKey: tenantPages.pageKey,
        isPublished: tenantPages.isPublished,
        updatedAt: tenantPages.updatedAt,
      })
      .from(tenantPages)
      .where(eq(tenantPages.tenantId as any, ctx.tenantId as any))
      .orderBy(asc(tenantPages.sortOrder), desc(tenantPages.updatedAt));

    return rows.map((row) => ({
      id: row.id,
      label: row.title || row.slug || row.pageKey,
      slug: row.slug,
      pageKey: row.pageKey,
      isPublished: row.isPublished,
      path: buildDocsTargetPath(row.pageKey, row.slug),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }),

  listBlogTargets: contentComposerProcedure.query(async ({ ctx }) => {
    assertPrivilegedRole(ctx.user.role);
    const db = await getDb();
    const rows = await db
      .select({
        id: blogPosts.id,
        title: blogPosts.title,
        slug: blogPosts.slug,
        excerpt: blogPosts.excerpt,
        isPublished: blogPosts.isPublished,
        updatedAt: blogPosts.updatedAt,
      })
      .from(blogPosts)
      .where(eq(blogPosts.tenantId, ctx.tenantId))
      .orderBy(desc(blogPosts.updatedAt));

    return rows.map((row) => ({
      id: row.id,
      label: row.title || row.slug,
      slug: row.slug,
      excerpt: row.excerpt,
      isPublished: row.isPublished,
      path: buildBlogTargetPath(row.slug),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }),

  generateSocialCaption: contentComposerProcedure
    .input(generateCaptionInputSchema)
    .mutation(async ({ input }) => {
      const result = await generateComposerCaption({
        topic: input.topic,
        articleBody: input.articleBody ?? "",
        socialPlatform: input.socialPlatform ?? null,
        attachmentCount: input.attachmentCount,
        requiresWebSearch: input.requiresWebSearch,
        requiresThinking: input.requiresThinking,
      });
      return result;
    }),

  publish: contentComposerProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return publishContentComposerDraft({
        draftId: input.id,
        tenantId: ctx.tenantId,
        userId: ctx.user.id,
        userRole: ctx.user.role,
        userName: ctx.user.name ?? ctx.user.email ?? "Composer",
      });
    }),
});
