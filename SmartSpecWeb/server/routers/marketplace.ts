/**
 * Marketplace Router — Public skill browsing, likes, comments
 */
import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { skills, skillLikes, skillComments, users } from "../../drizzle/schema";
import { eq, and, ilike, sql, desc, count } from "drizzle-orm";
import { createRateLimiter } from "../services/rateLimiter";
import { TRPCError } from "@trpc/server";

const commentLimiter = createRateLimiter("marketplace-comments", {
  windowMs: 10 * 60 * 1000, // 10 minutes
  maxRequests: 5,
  blockDurationMs: 5 * 60 * 1000, // 5 min block
});

function isSpam(content: string): boolean {
  // Purely URLs
  if (/^(https?:\/\/\S+\s*)+$/.test(content.trim())) return true;
  // 5+ consecutive repeated characters
  if (/(.)\1{4,}/.test(content)) return true;
  // Too many URLs
  const urlCount = (content.match(/https?:\/\/\S+/g) || []).length;
  if (urlCount > 3) return true;
  return false;
}

export const marketplaceRouter = router({
  /**
   * List enabled skills with like counts (public)
   */
  list: publicProcedure
    .input(z.object({
      category: z.string().optional(),
      search: z.string().optional(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { skills: [], total: 0 };

      const filters = input || {};
      const conditions: any[] = [eq(skills.isEnabled, true)];

      if (filters.category) {
        conditions.push(eq(skills.category, filters.category as any));
      }
      if (filters.search) {
        conditions.push(
          sql`(${ilike(skills.name, `%${filters.search}%`)} OR ${ilike(skills.description, `%${filters.search}%`)})`
        );
      }

      const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);

      const items = await db
        .select({
          id: skills.id,
          slug: skills.slug,
          name: skills.name,
          description: skills.description,
          category: skills.category,
          icon: skills.icon,
          tags: skills.tags,
          author: skills.author,
          version: skills.version,
          creditMultiplier: skills.creditMultiplier,
          priority: skills.priority,
          createdAt: skills.createdAt,
          likeCount: sql<number>`COALESCE((SELECT count(*) FROM skill_likes WHERE skill_likes."skillId" = ${skills.id}), 0)`.mapWith(Number),
          commentCount: sql<number>`COALESCE((SELECT count(*) FROM skill_comments WHERE skill_comments."skillId" = ${skills.id}), 0)`.mapWith(Number),
        })
        .from(skills)
        .where(whereClause)
        .orderBy(desc(skills.priority), desc(skills.createdAt))
        .limit(filters.limit ?? 50)
        .offset(filters.offset ?? 0);

      const [totalResult] = await db
        .select({ count: count() })
        .from(skills)
        .where(whereClause);

      return { skills: items, total: totalResult?.count || 0 };
    }),

  /**
   * Get single skill by slug with full content (public)
   */
  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [skill] = await db
        .select({
          id: skills.id,
          slug: skills.slug,
          name: skills.name,
          description: skills.description,
          category: skills.category,
          icon: skills.icon,
          tags: skills.tags,
          author: skills.author,
          version: skills.version,
          creditMultiplier: skills.creditMultiplier,
          skillContent: skills.skillContent,
          configJson: skills.configJson,
          createdAt: skills.createdAt,
          likeCount: sql<number>`COALESCE((SELECT count(*) FROM skill_likes WHERE skill_likes."skillId" = ${skills.id}), 0)`.mapWith(Number),
          commentCount: sql<number>`COALESCE((SELECT count(*) FROM skill_comments WHERE skill_comments."skillId" = ${skills.id}), 0)`.mapWith(Number),
        })
        .from(skills)
        .where(and(eq(skills.slug, input.slug), eq(skills.isEnabled, true)))
        .limit(1);

      if (!skill) throw new TRPCError({ code: "NOT_FOUND", message: "Skill not found" });

      // Check if current user liked this skill
      let userLiked = false;
      const userId = (ctx as any)?.user?.id;
      if (userId) {
        const [like] = await db
          .select({ id: skillLikes.id })
          .from(skillLikes)
          .where(and(eq(skillLikes.skillId, skill.id), eq(skillLikes.userId, userId)))
          .limit(1);
        userLiked = !!like;
      }

      return { ...skill, userLiked };
    }),

  /**
   * Toggle like on a skill (auth required)
   */
  like: protectedProcedure
    .input(z.object({ skillId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const userId = ctx.user.id;

      // Check existing like
      const [existing] = await db
        .select({ id: skillLikes.id })
        .from(skillLikes)
        .where(and(eq(skillLikes.skillId, input.skillId), eq(skillLikes.userId, userId)))
        .limit(1);

      if (existing) {
        await db.delete(skillLikes).where(eq(skillLikes.id, existing.id));
      } else {
        await db.insert(skillLikes).values({ skillId: input.skillId, userId });
      }

      const [result] = await db
        .select({ count: count() })
        .from(skillLikes)
        .where(eq(skillLikes.skillId, input.skillId));

      return { liked: !existing, likeCount: result?.count || 0 };
    }),

  /**
   * Add a comment (auth required, rate limited, spam checked)
   */
  addComment: protectedProcedure
    .input(z.object({
      skillId: z.number(),
      content: z.string().min(3, "Comment too short").max(1000, "Comment too long"),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const userId = ctx.user.id;

      // Rate limit
      if (!commentLimiter.isAllowed(String(userId))) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many comments. Please wait a few minutes.",
        });
      }

      // Spam check
      if (isSpam(input.content)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Comment appears to be spam.",
        });
      }

      const [comment] = await db
        .insert(skillComments)
        .values({ skillId: input.skillId, userId, content: input.content })
        .returning();

      return comment;
    }),

  /**
   * Get comments for a skill (public)
   */
  getComments: publicProcedure
    .input(z.object({
      skillId: z.number(),
      limit: z.number().min(1).max(50).default(20),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { comments: [], total: 0 };

      const items = await db
        .select({
          id: skillComments.id,
          content: skillComments.content,
          createdAt: skillComments.createdAt,
          userId: skillComments.userId,
          userName: users.name,
        })
        .from(skillComments)
        .leftJoin(users, eq(skillComments.userId, users.id))
        .where(eq(skillComments.skillId, input.skillId))
        .orderBy(desc(skillComments.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      const [totalResult] = await db
        .select({ count: count() })
        .from(skillComments)
        .where(eq(skillComments.skillId, input.skillId));

      return { comments: items, total: totalResult?.count || 0 };
    }),

  /**
   * Delete a comment (owner or admin)
   */
  deleteComment: protectedProcedure
    .input(z.object({ commentId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [comment] = await db
        .select({ userId: skillComments.userId })
        .from(skillComments)
        .where(eq(skillComments.id, input.commentId))
        .limit(1);

      if (!comment) throw new TRPCError({ code: "NOT_FOUND" });

      const isOwner = comment.userId === ctx.user.id;
      const isAdmin = (ctx.user as any).role === "admin" || (ctx.user as any).role === "super_admin";

      if (!isOwner && !isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot delete this comment" });
      }

      await db.delete(skillComments).where(eq(skillComments.id, input.commentId));
      return { success: true };
    }),
});
