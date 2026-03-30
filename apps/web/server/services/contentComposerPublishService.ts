import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import sanitizeHtml from "sanitize-html";

import { blogPosts, contentComposerDrafts, libraryItems, socialPages, socialProviderConnections, tenantPages, type ContentComposerDraft } from "../../drizzle/schema";
import { type DrizzleDB, getDb } from "../db";
import { createPublishingDraft, publishPublishingPostNow } from "./socialPublishingService";
import { publishUploadPostNow } from "./uploadPostService";

const CONTENT_HTML_SANITIZE: sanitizeHtml.IOptions = {
  allowedTags: [
    "article",
    "section",
    "h1",
    "h2",
    "h3",
    "h4",
    "p",
    "ul",
    "ol",
    "li",
    "blockquote",
    "pre",
    "code",
    "a",
    "b",
    "i",
    "em",
    "strong",
    "br",
    "img",
    "figure",
    "figcaption",
    "video",
    "source",
  ],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "title", "width", "height", "loading"],
    video: ["src", "controls", "autoplay", "loop", "muted", "playsinline", "poster", "width", "height"],
    source: ["src", "type"],
    "*": ["class", "id"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  disallowedTagsMode: "discard",
};

export interface ContentComposerLibraryItem {
  id: number;
  itemType: string;
  title: string;
  sourceUrl: string | null;
  thumbnailUrl: string | null;
}

export interface ContentComposerPublishResult {
  draftId: string;
  destinationKind: "docs" | "blog" | "social";
  targetId: number | null;
  targetSlug: string | null;
  targetPath: string | null;
  publishedAt: string;
  summary: string;
  upstreamResult: Record<string, unknown> | null;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "article";
}

function stripHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [],
    allowedAttributes: {},
    allowedSchemes: ["http", "https", "mailto", "tel"],
    disallowedTagsMode: "discard",
  }).replace(/\s+/g, " ").trim();
}

function sanitizeComposerHtml(html: string): string {
  return sanitizeHtml(html, CONTENT_HTML_SANITIZE);
}

function firstParagraph(html: string): string {
  const text = stripHtml(html);
  return text.length > 280 ? `${text.slice(0, 277)}...` : text;
}

function buildAttachmentGalleryHtml(items: ContentComposerLibraryItem[]): string {
  if (items.length === 0) return "";

  const cards = items.map((item) => {
    const url = item.sourceUrl ?? item.thumbnailUrl ?? "";
    const escapedUrl = url.replace(/"/g, "&quot;");
    const escapedTitle = item.title.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    if ((item.itemType || "").toLowerCase() === "video") {
      return `<figure><video controls playsinline src="${escapedUrl}"></video><figcaption>${escapedTitle}</figcaption></figure>`;
    }
    return `<figure><img src="${escapedUrl}" alt="${escapedTitle}" loading="lazy" /><figcaption>${escapedTitle}</figcaption></figure>`;
  });

  return `<section><h2>Attachments</h2>${cards.join("")}</section>`;
}

function buildArticleHtml(draft: ContentComposerDraft, libraryItems: ContentComposerLibraryItem[]): string {
  const title = draft.topic?.trim() || "Untitled article";
  const body = sanitizeComposerHtml(draft.articleBody ?? "");
  const gallery = buildAttachmentGalleryHtml(libraryItems);
  const sections = [
    `<article>`,
    `<h1>${title.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</h1>`,
    body || "<p></p>",
    gallery,
    `</article>`,
  ].filter(Boolean);
  return sections.join("");
}

function buildDocsSections(draft: ContentComposerDraft, libraryItems: ContentComposerLibraryItem[]) {
  const mediaSection = libraryItems.length > 0
    ? {
        id: "composer-media",
        type: "gallery" as const,
        title: "Attached Media",
        items: libraryItems.map((item) => ({
          id: item.id,
          type: item.itemType,
          title: item.title,
          src: item.sourceUrl ?? item.thumbnailUrl,
        })),
      }
    : null;

  return [
    {
      id: "composer-content",
      type: "content" as const,
      title: draft.topic?.trim() || "Article",
      content: sanitizeComposerHtml(draft.articleBody ?? ""),
    },
    ...(mediaSection ? [mediaSection] : []),
  ];
}

function buildSocialCaption(params: {
  topic: string;
  articleBody: string;
  socialPlatform: string | null;
  attachmentCount: number;
  requiresWebSearch: boolean;
  requiresThinking: boolean;
}): string {
  const topic = params.topic.trim() || "New content";
  const summary = stripHtml(params.articleBody).slice(0, 220);
  const platformTag = params.socialPlatform === "youtube"
    ? "#YouTube"
    : params.socialPlatform === "facebook"
      ? "#Facebook"
      : params.socialPlatform === "tiktok"
        ? "#TikTok"
        : "#UploadPost";
  const hints = [
    params.requiresWebSearch ? "web search on" : null,
    params.requiresThinking ? "thinking on" : null,
    params.attachmentCount > 0 ? `${params.attachmentCount} media asset${params.attachmentCount === 1 ? "" : "s"}` : null,
  ].filter(Boolean).join(" • ");

  return [
    topic,
    summary,
    hints,
    platformTag,
  ].filter((part) => part && part.length > 0).join("\n\n").slice(0, 2000);
}

async function resolveDb(db?: DrizzleDB | null): Promise<DrizzleDB> {
  const resolved = db ?? await getDb();
  if (!resolved) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  }
  return resolved;
}

async function loadDraft(db: DrizzleDB, draftId: string): Promise<ContentComposerDraft | null> {
  const rows = await db.select().from(contentComposerDrafts).where(eq(contentComposerDrafts.id, draftId)).limit(1);
  return rows[0] ?? null;
}

async function loadLibraryItems(tenantId: string, attachmentIds: number[], db: DrizzleDB): Promise<ContentComposerLibraryItem[]> {
  const ids = Array.from(new Set(attachmentIds));
  if (ids.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Select at least one library attachment before publishing",
    });
  }
  if (ids.length > 6) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A maximum of 6 attachments is allowed",
    });
  }

  const rows = await db
    .select({
      id: libraryItems.id,
      itemType: libraryItems.itemType,
      title: libraryItems.title,
      sourceUrl: libraryItems.sourceUrl,
      thumbnailUrl: libraryItems.thumbnailUrl,
    })
    .from(libraryItems)
    .where(and(
      eq(libraryItems.tenantId, tenantId),
      inArray(libraryItems.id, ids),
      eq(libraryItems.status, "ready"),
      isNull(libraryItems.deletedAt),
    ));

  if (rows.length !== ids.length) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "One or more library attachments are missing or unavailable",
    });
  }

  return rows;
}

function assertPublishRole(role: string | null | undefined): void {
  if (role !== "admin" && role !== "domain_admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Docs and Blog publishing is restricted to admins",
    });
  }
}

function assertDraftReady(draft: ContentComposerDraft): void {
  if (!draft.articleBody || !draft.articleBody.trim()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Article body is required before publishing" });
  }
  if (!draft.destinationKind) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Destination is required before publishing" });
  }
  if (draft.destinationKind === "social" && !draft.socialPlatform) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Social platform is required before publishing" });
  }
}

async function validateSocialTarget(
  db: DrizzleDB,
  tenantId: string,
  draft: ContentComposerDraft,
): Promise<void> {
  if (draft.destinationKind !== "social") return;
  if (!draft.socialTargetId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Social platform and target are required" });
  }

  if (draft.socialPlatform === "upload_post") {
    return;
  }

  const [page] = await db
    .select({
      id: socialPages.id,
      tenantId: socialPages.tenantId,
      status: socialPages.status,
      selectedForPublishing: socialPages.selectedForPublishing,
      provider: socialProviderConnections.provider,
    })
    .from(socialPages)
    .innerJoin(socialProviderConnections, eq(socialPages.connectionId, socialProviderConnections.id))
    .where(and(eq(socialPages.id, draft.socialTargetId), eq(socialPages.tenantId, tenantId)))
    .limit(1);

  if (!page) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Social target not found" });
  }
  if (page.status !== "active" || !page.selectedForPublishing) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Social target is not ready for publishing" });
  }
  if (draft.socialPlatform && page.provider !== draft.socialPlatform) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Social platform does not match the selected target" });
  }
}

export async function generateComposerCaption(params: {
  topic: string;
  articleBody: string;
  socialPlatform: string | null;
  attachmentCount: number;
  requiresWebSearch: boolean;
  requiresThinking: boolean;
}): Promise<{ caption: string }> {
  return {
    caption: buildSocialCaption(params),
  };
}

export async function publishContentComposerDraft(params: {
  draftId: string;
  tenantId: string;
  userId: number;
  userRole?: string | null;
  userName?: string | null;
  db?: DrizzleDB | null;
}): Promise<ContentComposerPublishResult> {
  const db = await resolveDb(params.db);
  const now = new Date();
  const draft = await loadDraft(db, params.draftId);
  if (!draft) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Draft not found" });
  }
  if (draft.tenantId !== params.tenantId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Draft not found" });
  }
  if (draft.userId !== params.userId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You do not own this draft" });
  }
  if (draft.status === "deleted") {
    throw new TRPCError({ code: "NOT_FOUND", message: "Draft not found" });
  }
  assertDraftReady(draft);

  const attachments = await loadLibraryItems(params.tenantId, draft.attachmentIds ?? [], db);
  await validateSocialTarget(db, params.tenantId, draft);
  const articleHtml = buildArticleHtml(draft, attachments);
  const summary = firstParagraph(draft.articleBody ?? draft.topic ?? "");
  const title = draft.topic?.trim() || "Untitled article";
  const slug = slugify(title);
  const author = params.userName?.trim() || "Composer";
  const publishedAtIso = now.toISOString();

  try {
    let result: Record<string, unknown> | null = null;
    let targetId: number | null = null;
    let targetSlug: string | null = null;
    let targetPath: string | null = null;

    if (draft.destinationKind === "docs") {
      assertPublishRole(params.userRole);
      const pageSlug = slug;
      const pageKey = `docs-${slug}`;
      const sections = buildDocsSections(draft, attachments);
      const mediaCover = attachments.find((item) => (item.itemType || "").toLowerCase() !== "video" && (item.sourceUrl || item.thumbnailUrl)) ?? attachments[0] ?? null;

      if (draft.docsTargetId) {
        const [existing] = await db
          .select()
          .from(tenantPages)
          .where(and(eq(tenantPages.id, draft.docsTargetId), eq(tenantPages.tenantId as any, params.tenantId as any)))
          .limit(1);
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Docs target not found" });
        }

        const [updated] = await db
          .update(tenantPages)
          .set({
            title,
            slug: pageSlug,
            content: articleHtml,
            sections: sections as any,
            metadata: {
              ...(existing.metadata ?? {}),
              description: summary,
              author,
              ogImage: mediaCover?.sourceUrl ?? mediaCover?.thumbnailUrl ?? existing.metadata?.ogImage,
            },
            isPublished: true,
            updatedAt: now,
          })
          .where(eq(tenantPages.id, existing.id))
          .returning();

        targetId = updated.id;
        targetSlug = updated.slug;
        targetPath = updated.pageKey.startsWith("docs-") ? `/docs/${updated.slug.replace(/^\/+/, "")}` : `/${updated.slug.replace(/^\/+/, "")}`;
        result = { page: updated };
      } else {
        const [created] = await db
          .insert(tenantPages)
          .values({
            tenantId: params.tenantId as any,
            pageKey,
            title,
            slug: pageSlug,
            content: articleHtml,
            sections: sections as any,
            metadata: {
              description: summary,
              author,
              ogImage: mediaCover?.sourceUrl ?? mediaCover?.thumbnailUrl ?? null,
            },
            isPublished: true,
            sortOrder: 0,
            showInMenu: false,
            updatedAt: now,
          } as any)
          .returning();

        targetId = created.id;
        targetSlug = created.slug;
        targetPath = created.pageKey.startsWith("docs-") ? `/docs/${created.slug.replace(/^\/+/, "")}` : `/${created.slug.replace(/^\/+/, "")}`;
        result = { page: created };
      }
    } else if (draft.destinationKind === "blog") {
      assertPublishRole(params.userRole);
      const coverImage = attachments.find((item) => (item.itemType || "").toLowerCase() === "image" && (item.sourceUrl || item.thumbnailUrl)) ?? attachments[0] ?? null;
      const existingPostId = draft.blogTargetId ?? null;
      if (existingPostId) {
        const [existing] = await db
          .select()
          .from(blogPosts)
          .where(and(eq(blogPosts.id, existingPostId), eq(blogPosts.tenantId, params.tenantId)))
          .limit(1);
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Blog target not found" });
        }

        const [updated] = await db
          .update(blogPosts)
          .set({
            slug: existing.slug,
            title,
            excerpt: summary,
            content: articleHtml,
            coverImage: coverImage?.sourceUrl ?? coverImage?.thumbnailUrl ?? existing.coverImage,
            mediaAttachments: attachments.map((item) => item.id),
            author,
            updatedAt: now,
          })
          .where(eq(blogPosts.id, existing.id))
          .returning();

        targetId = updated.id;
        targetSlug = updated.slug;
        targetPath = `/blog/${updated.slug}`;
        result = { post: updated };
      } else {
        const [created] = await db
          .insert(blogPosts)
          .values({
            tenantId: params.tenantId,
            slug,
            title,
            excerpt: summary,
            content: articleHtml,
            coverImage: coverImage?.sourceUrl ?? coverImage?.thumbnailUrl ?? null,
            mediaAttachments: attachments.map((item) => item.id),
            author,
            isPublished: true,
            publishedAt: now,
            updatedAt: now,
          })
          .returning();

        targetId = created.id;
        targetSlug = created.slug;
        targetPath = `/blog/${created.slug}`;
        result = { post: created };
      }
    } else if (draft.destinationKind === "social") {
      if (!draft.socialPlatform || !draft.socialTargetId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Social platform and target are required" });
      }

      const contentText = (draft.socialCaption ?? "").trim() || buildSocialCaption({
        topic: draft.topic ?? "",
        articleBody: draft.articleBody ?? "",
        socialPlatform: draft.socialPlatform,
        attachmentCount: attachments.length,
        requiresWebSearch: draft.requiresWebSearch ?? false,
        requiresThinking: draft.requiresThinking ?? false,
      });
      const mediaRefs = attachments.map((item) => item.sourceUrl ?? item.thumbnailUrl ?? "").filter(Boolean);

      if (draft.socialPlatform === "upload_post") {
        const published = await publishUploadPostNow({
          tenantId: params.tenantId,
          userId: params.userId,
          profileId: draft.socialTargetId,
          contentText,
          contentLink: null,
          mediaRefs,
          metadata: {
            source: "content_composer",
            draftId: draft.id,
            topic: draft.topic,
          },
        });
        result = { uploadPostJob: published };
        targetId = published.id;
      } else {
        const created = await createPublishingDraft({
          tenantId: params.tenantId,
          userId: params.userId,
          pageId: draft.socialTargetId,
          contentText,
          contentLink: null,
          mediaRefs,
        });
        const published = await publishPublishingPostNow({
          tenantId: params.tenantId,
          userId: params.userId,
          postId: created.id,
        });
        result = { socialPost: published };
        targetId = published.id;
      }
    } else {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Unsupported destination" });
    }

    await db
      .update(contentComposerDrafts)
      .set({
        status: "published",
        publishedAt: now,
        errorMessage: null,
        updatedAt: now,
      })
      .where(eq(contentComposerDrafts.id, draft.id));

    return {
      draftId: draft.id,
      destinationKind: draft.destinationKind as "docs" | "blog" | "social",
      targetId,
      targetSlug,
      targetPath,
      publishedAt: publishedAtIso,
      summary,
      upstreamResult: result,
    };
  } catch (error) {
    await db
      .update(contentComposerDrafts)
      .set({
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Publish failed",
        updatedAt: now,
      })
      .where(eq(contentComposerDrafts.id, draft.id));
    throw error instanceof TRPCError ? error : new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: error instanceof Error ? error.message : "Publish failed",
    });
  }
}

export function buildComposerStreamPayload(params: {
  topic: string;
  executionSource: "skill" | "agency";
  skillId: string | null;
  agencyName: string | null;
  requiresWebSearch: boolean;
  requiresThinking: boolean;
  articleBody: string;
  socialPlatform: string | null;
  attachmentCount: number;
}): { articleHtml: string; caption: string } {
  const escapedTopic = params.topic.trim() || "Untitled article";
  const sourceLabel = params.executionSource === "agency"
    ? (params.agencyName || "Agency")
    : (params.skillId || "Skill");
  const articleHtml = sanitizeComposerHtml([
    `<article>`,
    `<h1>${escapedTopic.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</h1>`,
    `<p>Draft generated with <strong>${sourceLabel.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</strong>.</p>`,
    `<p>Web search: ${params.requiresWebSearch ? "enabled" : "disabled"}.</p>`,
    `<p>Thinking: ${params.requiresThinking ? "enabled" : "disabled"}.</p>`,
    sanitizeComposerHtml(params.articleBody || ""),
    `</article>`,
  ].join(""));

  return {
    articleHtml,
    caption: buildSocialCaption({
      topic: params.topic,
      articleBody: params.articleBody,
      socialPlatform: params.socialPlatform,
      attachmentCount: params.attachmentCount,
      requiresWebSearch: params.requiresWebSearch,
      requiresThinking: params.requiresThinking,
    }),
  };
}
