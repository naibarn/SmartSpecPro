import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import sharp from "sharp";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { AUTO_REVIEW_PUBLISH_HASHTAG, AUTO_REVIEW_PUBLISH_MAX_HASHTAGS } from "../../shared/marketplaceAutoReview/publishingHashtags";

import {
  marketplaceAutoReviewRuns,
  marketplaceProductAffiliateLinks,
  marketplaceProducts,
  socialPages,
  socialPosts,
  socialProviderConnections,
} from "../../drizzle/schema";
import { getDb, type DrizzleDB } from "../db";
import { storageStreamFile } from "../storage";
import { decrypt } from "./crypto";
import { createControlPlaneJob } from "./jobControlPlaneGateway";
import { buildMarketplaceAutoReviewPublishJobKeys } from "./marketplaceAutoReviewPublishJobKeys";
import { publishFacebookPagePhoto, readFacebookPagePhoto } from "./facebookPhotoPublishGateway";
import { publishAffiliateCommentOnce } from "./marketplaceAutoReviewAffiliateComment";

export const MARKETPLACE_AUTO_REVIEW_PHOTO_POST_JOB_TYPE = "social.facebook.photo.publish";
const PHOTO_POST_CONTRACT_VERSION = "feature-187-v1";
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_PHOTO_CAPTION_LENGTH = 2000;
const PHOTO_VARIANTS = ["caption_source", "character_reference", "product_reference"] as const;
const affiliateModeSchema = z.enum(["description", "first_comment", "manual_native", "none"]);

export type MarketplaceAutoReviewPhotoVariant = typeof PHOTO_VARIANTS[number];
export type PhotoPublishState = "queued" | "preflight" | "token_check" | "publish_requested" | "reconciling" | "published" | "needs_connection" | "needs_user_action" | "failed" | "cancelled";

const snapshotSchema = z.object({
  variant: z.enum(PHOTO_VARIANTS),
  caption: z.string().trim().max(2000),
  hashtags: z.array(z.string().trim().regex(AUTO_REVIEW_PUBLISH_HASHTAG)).max(AUTO_REVIEW_PUBLISH_MAX_HASHTAGS),
  affiliateMode: affiliateModeSchema,
  commercialDisclosure: z.string().trim().max(500).default(""),
  allowNoAffiliate: z.boolean().optional(),
}).strict();

type Db = DrizzleDB;
type JsonRecord = Record<string, any>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function hashJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function safeTaskPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 100);
}

function photoPreviewUrl(storageKey: string): string {
  return `/api/storage/files/${storageKey.split("/").map(encodeURIComponent).join("/")}`;
}

export function resolveMarketplaceAutoReviewPhotoVariant(
  metadataJson: unknown,
  input: { tenantId: string; runId: string; variant: MarketplaceAutoReviewPhotoVariant },
) {
  const staged = record(record(metadataJson).stagedPipeline);
  const socialCaption = record(staged.socialCaption);
  const postImages = record(socialCaption.postImages);
  const image = record(record(postImages.variants)[input.variant]);
  if (image.status !== "completed") throw new Error("PHOTO_VARIANT_NOT_COMPLETED");
  const storageKey = text(image.imageStorageKey);
  const prefix = `marketplace-auto-review/${safeTaskPart(input.tenantId)}/${safeTaskPart(input.runId)}/media/image/`;
  const name = storageKey?.slice(prefix.length) ?? "";
  const validKey = Boolean(
    storageKey?.startsWith(prefix) &&
    !storageKey.includes("..") &&
    /^social-post-[a-zA-Z0-9_-]+-[a-z_]+-[a-f0-9]{64}\.png$/.test(name) &&
    name.includes(`-${input.variant}-`),
  );
  if (!storageKey || !validKey) throw new Error("PHOTO_VARIANT_SCOPE_MISMATCH");
  return {
    variant: input.variant,
    storageKey,
    imageUrl: photoPreviewUrl(storageKey),
    sourceLabel: text(image.sourceLabel) ?? input.variant,
  };
}

export function composeFacebookPhotoPostCaption(input: {
  caption: string;
  hashtags: string[];
  commercialDisclosure: string;
  affiliateUrl?: string | null;
}): string {
  return [input.caption, input.hashtags.join(" "), input.commercialDisclosure, input.affiliateUrl]
    .filter(Boolean)
    .join("\n\n");
}

export function assertFacebookPhotoPostCaptionLength(caption: string): string {
  if (caption.length > MAX_PHOTO_CAPTION_LENGTH) fail("PHOTO_CAPTION_TOO_LONG", "The final caption, hashtags, disclosure, and Affiliate URL must fit within 2,000 characters", "BAD_REQUEST");
  return caption;
}

export function hashFacebookPhotoPostIntent(value: unknown): string {
  return hashJson(value);
}

export function hasMarketplaceAutoReviewPhotoPostExternalAttempt(metadataValue: unknown): boolean {
  const metadata = record(metadataValue);
  return Boolean(text(metadata.photoPublishRequestedAt) || text(metadata.externalPhotoId) || metadata.photoPublicationStatus === "published");
}

export function assertMarketplaceAutoReviewPhotoRunOwnership(
  run: unknown,
  expected: { tenantId: string; userId: number },
) {
  const row = record(run);
  if (row.tenantId !== expected.tenantId || Number(row.userId) !== expected.userId) {
    fail("PHOTO_RUN_SCOPE_MISMATCH", "The Auto Review run is outside this user and tenant", "NOT_FOUND");
  }
  return run;
}

export const marketplaceAutoReviewPhotoPostWorkerInputSchema = z.object({
  postId: z.number().int().positive(),
  runId: z.string().trim().min(1).max(64),
  intentHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

function fail(code: string, message: string, trpcCode: "BAD_REQUEST" | "NOT_FOUND" | "PRECONDITION_FAILED" | "INTERNAL_SERVER_ERROR" | "CONFLICT" = "PRECONDITION_FAILED"): never {
  throw new TRPCError({ code: trpcCode, message: `${code}: ${message}` });
}

async function resolveDb(): Promise<Db> {
  const db = await getDb();
  if (!db) fail("DATABASE_UNAVAILABLE", "Photo publishing is temporarily unavailable", "INTERNAL_SERVER_ERROR");
  return db;
}

async function loadPhotoPackage(input: { db: Db; tenantId: string; userId: number; runId: string }) {
  const [run] = await input.db.select().from(marketplaceAutoReviewRuns).where(and(
    eq(marketplaceAutoReviewRuns.id, input.runId),
    eq(marketplaceAutoReviewRuns.tenantId, input.tenantId),
    eq(marketplaceAutoReviewRuns.userId, input.userId),
  )).limit(1);
  if (!run) fail("AUTO_REVIEW_RUN_NOT_FOUND", "The Auto Review run is unavailable", "NOT_FOUND");
  assertMarketplaceAutoReviewPhotoRunOwnership(run, { tenantId: input.tenantId, userId: input.userId });

  const metadata = record(run.metadataJson);
  const staged = record(metadata.stagedPipeline);
  const socialCaption = record(staged.socialCaption);
  const caption = text(socialCaption.caption);
  if (!caption) fail("CAPTION_UNAVAILABLE", "No saved Auto Review caption is available");
  const hashtags = Array.isArray(socialCaption.hashtags)
    ? socialCaption.hashtags.filter((tag: unknown): tag is string => typeof tag === "string")
      .slice(0, 20).map((tag: string) => `#${tag.replace(/^#+/, "")}`)
    : [];
  const [product] = await input.db.select({ id: marketplaceProducts.id }).from(marketplaceProducts).where(and(
    eq(marketplaceProducts.id, run.productId),
    eq(marketplaceProducts.userId, input.userId),
    eq(marketplaceProducts.tenantId, input.tenantId),
  )).limit(1);
  if (!product) fail("PRODUCT_OWNERSHIP_MISMATCH", "Product ownership could not be verified", "NOT_FOUND");
  const [affiliate] = await input.db.select({ affiliateUrl: marketplaceProductAffiliateLinks.affiliateUrl })
    .from(marketplaceProductAffiliateLinks).where(and(
      eq(marketplaceProductAffiliateLinks.productId, run.productId),
      eq(marketplaceProductAffiliateLinks.userId, input.userId),
      eq(marketplaceProductAffiliateLinks.tenantId, input.tenantId),
      isNotNull(marketplaceProductAffiliateLinks.affiliateUrl),
      sql`length(trim(${marketplaceProductAffiliateLinks.affiliateUrl})) > 0`,
    )).orderBy(desc(marketplaceProductAffiliateLinks.updatedAt)).limit(1);
  return {
    run,
    product,
    caption,
    hashtags,
    affiliateUrl: text(affiliate?.affiliateUrl),
    runMetadata: metadata,
  };
}

function projectPhotoVariants(metadata: unknown, tenantId: string, runId: string) {
  const postImages = record(record(record(record(metadata).stagedPipeline).socialCaption).postImages);
  const variants = record(postImages.variants);
  return PHOTO_VARIANTS.map(variant => {
    const status = text(record(variants[variant]).status) ?? "pending";
    try {
      const resolved = resolveMarketplaceAutoReviewPhotoVariant(metadata, { tenantId, runId, variant });
      return { ...resolved, status: "completed" as const };
    } catch {
      return { variant, status, imageUrl: null, sourceLabel: text(record(variants[variant]).sourceLabel) ?? variant };
    }
  });
}

export async function getMarketplaceAutoReviewPhotoPostReadiness(input: { tenantId: string; userId: number; runId: string }) {
  const db = await resolveDb();
  const pkg = await loadPhotoPackage({ db, ...input }).catch(error => ({
    error: error instanceof TRPCError ? error.message : "Photo publishing readiness could not be determined",
    canListPages: error instanceof TRPCError && error.code === "PRECONDITION_FAILED",
  }));
  if ("error" in pkg && !pkg.canListPages) return { ready: false, reason: pkg.error, pages: [], imageVariants: [] };
  const pages = (await (await import("./socialPublishingService")).listPublishingPages(input.tenantId, input.userId))
    .filter(page => page.provider === "meta");
  if ("error" in pkg) return { ready: false, reason: pkg.error, pages, imageVariants: [] };
  const imageVariants = projectPhotoVariants(pkg.runMetadata, input.tenantId, pkg.run.id);
  const hasImage = imageVariants.some(image => image.status === "completed");
  const hasPage = pages.some(page => page.publishingReady);
  return {
    ready: hasImage && hasPage,
    reason: !hasImage ? "Generate at least one completed Auto Review social image" : !hasPage ? "Connect a Facebook Page and enable publishing in Social Channels" : null,
    pages,
    imageVariants,
    savedCaption: pkg.caption,
    savedHashtags: pkg.hashtags,
    hasAffiliateLink: Boolean(pkg.affiliateUrl),
  };
}

function allowedImageContentType(value: string): boolean {
  return value === "image/png";
}

export async function inspectMarketplaceAutoReviewPhotoImage(bytes: Buffer, contentType: string) {
  if (contentType !== "image/png") fail("PHOTO_ARTIFACT_UNSUPPORTED_TYPE", "Only generated PNG images are supported for this Photo Post");
  if (!Buffer.isBuffer(bytes) || bytes.length <= 0 || bytes.length > MAX_PHOTO_BYTES) fail("PHOTO_ARTIFACT_TOO_LARGE", "The selected image exceeds Facebook's 10 MiB photo limit");
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || bytes.toString("ascii", 12, 16) !== "IHDR") {
    fail("PHOTO_ARTIFACT_INVALID", "The selected image is not a valid PNG");
  }
  let dimensions: { width?: number; height?: number; format?: string };
  try {
    dimensions = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata();
  } catch {
    fail("PHOTO_ARTIFACT_INVALID", "The selected image could not be decoded");
  }
  if (dimensions.format !== "png" || !dimensions.width || !dimensions.height) fail("PHOTO_ARTIFACT_INVALID", "The selected image dimensions could not be verified");
  return { contentType: "image/png" as const, size: bytes.length, checksum: createHash("sha256").update(bytes).digest("hex"), width: dimensions.width, height: dimensions.height };
}

async function readAndInspectPhoto(storageKey: string) {
  const stored = await storageStreamFile(storageKey);
  if (!stored || stored.isPartial || !allowedImageContentType(stored.contentType) || stored.totalLength <= 0 || stored.totalLength > MAX_PHOTO_BYTES) {
    fail("PHOTO_ARTIFACT_UNAVAILABLE", "The selected private image is not a supported Facebook photo");
  }
  const stream = stored.stream instanceof Readable ? stored.stream : Readable.fromWeb(stored.stream as ReadableStream<Uint8Array>);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_PHOTO_BYTES || size > stored.totalLength) fail("PHOTO_ARTIFACT_TOO_LARGE", "The selected image exceeds Facebook's 10 MiB photo limit");
    chunks.push(buffer);
  }
  if (size !== stored.totalLength) fail("PHOTO_ARTIFACT_SIZE_MISMATCH", "The selected image was incomplete");
  const bytes = Buffer.concat(chunks, size);
  return { bytes, ...await inspectMarketplaceAutoReviewPhotoImage(bytes, stored.contentType) };
}

async function verifySelectedPage(input: { tenantId: string; userId: number; pageId: number }) {
  const pages = await (await import("./socialPublishingService")).listPublishingPages(input.tenantId, input.userId);
  const selected = pages.find(page => page.id === input.pageId);
  if (!selected?.publishingReady || selected.provider !== "meta") fail("FACEBOOK_PAGE_NOT_READY", selected?.publishingIssue ?? "Select an active Facebook Page with verified publishing permission");
  return selected;
}

export async function startMarketplaceAutoReviewPhotoPost(input: {
  tenantId: string;
  userId: number;
  runId: string;
  pageId: number;
  snapshot: z.infer<typeof snapshotSchema>;
}) {
  const snapshot = snapshotSchema.parse(input.snapshot);
  const db = await resolveDb();
  const pkg = await loadPhotoPackage({ db, tenantId: input.tenantId, userId: input.userId, runId: input.runId });
  const image = resolveMarketplaceAutoReviewPhotoVariant(pkg.runMetadata, { tenantId: input.tenantId, runId: pkg.run.id, variant: snapshot.variant });
  const selectedPage = await verifySelectedPage(input);
  if (snapshot.affiliateMode === "first_comment" && !selectedPage.firstCommentReady) fail("FIRST_COMMENT_PERMISSION_MISSING", "Reconnect Facebook with pages_manage_engagement permission before using the first-comment option");
  const inspected = await readAndInspectPhoto(image.storageKey);
  if (snapshot.affiliateMode === "description" && !pkg.affiliateUrl) fail("AFFILIATE_LINK_MISSING", "No canonical affiliate URL is stored for this product");
  if (snapshot.affiliateMode === "none" && !snapshot.allowNoAffiliate) fail("NO_AFFILIATE_CONFIRMATION_REQUIRED", "Explicitly confirm publishing without the affiliate link");

  const affiliateUrl = snapshot.affiliateMode === "none" ? null : pkg.affiliateUrl;
  const publishCaption = assertFacebookPhotoPostCaptionLength(composeFacebookPhotoPostCaption({ caption: snapshot.caption, hashtags: snapshot.hashtags, commercialDisclosure: snapshot.commercialDisclosure, affiliateUrl: snapshot.affiliateMode === "description" ? pkg.affiliateUrl : null }));
  const canonical = {
    tenantId: input.tenantId,
    userId: input.userId,
    runId: pkg.run.id,
    productId: pkg.run.productId,
    targetPageId: input.pageId,
    publicationFormat: "facebook_photo_post",
    selectedVariant: snapshot.variant,
    imageStorageKey: image.storageKey,
    imageChecksum: inspected.checksum,
    imageSizeBytes: inspected.size,
    imageContentType: inspected.contentType,
    caption: snapshot.caption,
    hashtags: snapshot.hashtags,
    affiliateUrl,
    affiliateMode: snapshot.affiliateMode,
    commercialDisclosure: snapshot.commercialDisclosure,
  };
  const intentHash = hashJson(canonical);
  const source = "marketplace_auto_review_photo_post";
  const whereIntent = and(
    eq(socialPosts.tenantId, input.tenantId),
    eq(socialPosts.pageId, input.pageId),
    sql`${socialPosts.metadata}->>'source' = ${source}`,
    sql`${socialPosts.metadata}->>'intentHash' = ${intentHash}`,
  );
  let [existing] = await db.select().from(socialPosts).where(whereIntent).limit(1);
  const previousPhotoIntents = await db.select().from(socialPosts).where(and(
    eq(socialPosts.tenantId, input.tenantId),
    eq(socialPosts.pageId, input.pageId),
    sql`${socialPosts.metadata}->>'source' = ${source}`,
    sql`${socialPosts.metadata}->>'autoReviewRunId' = ${pkg.run.id}`,
    sql`${socialPosts.metadata}->>'intentHash' <> ${intentHash}`,
  )).limit(1);
  if (previousPhotoIntents.length) {
    const previous = previousPhotoIntents[0];
    const previousMetadata = record(previous.metadata);
    const previousStatus = String(previousMetadata.photoPublicationStatus ?? "queued");
    if (hasMarketplaceAutoReviewPhotoPostExternalAttempt(previousMetadata)) {
      fail("PHOTO_POST_PREVIOUS_ATTEMPT_EXISTS", "A Photo Post for this Auto Review run may already have been sent. Check Facebook and its history before creating another post.", "CONFLICT");
    }
    if (!existing && ["failed", "needs_connection"].includes(previousStatus)) existing = previous;
    else fail("PHOTO_POST_INTENT_ALREADY_EXISTS", "A Photo Post intent already exists for this Auto Review run. Check its status before changing the selected image or caption.", "CONFLICT");
  }
  const existingMetadata = record(existing?.metadata);
  const oldState = String(existingMetadata.photoPublicationStatus ?? "queued");
  const safeRetry = Boolean(existing && ["failed", "needs_connection"].includes(oldState) && !existingMetadata.photoPublishRequestedAt);
  const queueRepair = Boolean(existing && oldState === "queued" && !existingMetadata.publishingWorkerJobId);
  if (existing && !safeRetry && !queueRepair) return { postId: existing.id, status: oldState, intentHash };
  const publishAttempt = safeRetry ? Math.min(10, Math.max(1, Number(existingMetadata.publishAttempt ?? 1) + 1)) : Math.max(1, Number(existingMetadata.publishAttempt ?? 1));
  const newMetadata: JsonRecord = {
    source,
    autoReviewRunId: pkg.run.id,
    productId: pkg.run.productId,
    publicationFormat: "facebook_photo_post",
    intentHash,
    publishAttempt,
    snapshot: canonical,
    selectedPhotoVariant: snapshot.variant,
    imageStorageKey: image.storageKey,
    imageChecksum: inspected.checksum,
    imageSizeBytes: inspected.size,
    imageContentType: inspected.contentType,
    photoPublicationStatus: snapshot.affiliateMode === "manual_native" ? "needs_user_action" : "queued",
    affiliateLinkStatus: affiliateUrl ? (snapshot.affiliateMode === "manual_native" ? "manual_handoff" : snapshot.affiliateMode === "first_comment" ? "pending_first_comment" : "pending") : "none",
    commercialDisclosureStatus: snapshot.commercialDisclosure ? "included_in_caption" : "not_provided",
    attributionVerificationStatus: "unverified",
    reconciliation: { state: "not_started" },
    ...(snapshot.affiliateMode === "manual_native" ? { manualHandoff: { state: "prepared", selectedPhotoVariant: snapshot.variant, imageUrl: image.imageUrl, affiliateUrl: pkg.affiliateUrl, instructions: "เปิดภาพและข้อความตัวอย่างใน Auto Review แล้วนำไปเผยแพร่ใน Facebook Page โดยใช้ native product tag และ commercial partnership disclosure ของ Facebook" } } : {}),
  };
  let post: { id: number } | undefined;
  if (existing) {
    [post] = await db.update(socialPosts).set({ status: "draft", contentText: publishCaption, contentLink: snapshot.affiliateMode === "description" ? pkg.affiliateUrl : null, errorMessage: null, metadata: newMetadata, updatedAt: new Date() }).where(eq(socialPosts.id, existing.id)).returning({ id: socialPosts.id });
  } else {
    try {
      [post] = await db.insert(socialPosts).values({ tenantId: input.tenantId, pageId: input.pageId, status: "draft", contentText: publishCaption, contentLink: snapshot.affiliateMode === "description" ? pkg.affiliateUrl : null, mediaRefs: null, createdByUserId: input.userId, metadata: newMetadata }).returning({ id: socialPosts.id });
    } catch (error) {
      if ((error as { code?: unknown })?.code !== "23505") throw error;
      const [concurrent] = await db.select({ id: socialPosts.id, metadata: socialPosts.metadata }).from(socialPosts).where(whereIntent).limit(1);
      if (!concurrent) throw error;
      return { postId: concurrent.id, status: record(concurrent.metadata).photoPublicationStatus ?? "queued", intentHash };
    }
  }
  if (!post) fail("SOCIAL_POST_CREATE_FAILED", "Could not create Photo Post intent", "INTERNAL_SERVER_ERROR");
  if (snapshot.affiliateMode === "manual_native") return { postId: post.id, status: "needs_user_action" as const, intentHash, manualHandoff: true };

  try {
    const jobKeys = buildMarketplaceAutoReviewPublishJobKeys({ format: "photo", intentHash, attempt: publishAttempt, purpose: "publish" });
    const job = await createControlPlaneJob({
      context: { tenantId: input.tenantId, actorType: "user", actorId: input.userId, authorizationScope: "marketplace-auto-review:facebook-photo-publish", correlationId: `marketplace-photo:${pkg.run.id}`, idempotencyKey: jobKeys.idempotencyKey },
      definition: {
        contractVersion: PHOTO_POST_CONTRACT_VERSION,
        jobType: MARKETPLACE_AUTO_REVIEW_PHOTO_POST_JOB_TYPE,
        executionClass: "long",
        input: { postId: post.id, runId: pkg.run.id, intentHash },
        idempotencyKey: jobKeys.idempotencyKey,
        activeDedupeKey: jobKeys.activeDedupeKey,
        retryPolicy: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, jitter: "bounded", deadlineMs: 15 * 60_000, allowedErrorClasses: [] },
        timeoutPolicy: { softTimeoutMs: 5 * 60_000, hardTimeoutMs: 10 * 60_000 },
        requiredCapabilities: { runtime: "node_job_worker", provider: "meta", format: "facebook_photo_post" },
      },
      createOptions: { runtimeType: "node_job_worker", admissionMode: "durable_queue" },
    });
    const latest = record((await db.select({ metadata: socialPosts.metadata }).from(socialPosts).where(eq(socialPosts.id, post.id)).limit(1))[0]?.metadata);
    await db.update(socialPosts).set({ metadata: { ...latest, publishingWorkerJobId: job.id }, updatedAt: new Date() }).where(eq(socialPosts.id, post.id));
    return { postId: post.id, jobId: job.id, status: "queued" as const, intentHash };
  } catch (error) {
    await db.update(socialPosts).set({ status: "failed", errorMessage: "Photo publishing job could not be queued. No Facebook photo request was made.", metadata: { ...newMetadata, photoPublicationStatus: "failed", failureCode: "JOB_ADMISSION_FAILED" }, updatedAt: new Date() }).where(eq(socialPosts.id, post.id));
    throw error;
  }
}

function safeFacebookPhotoLink(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["facebook.com", "www.facebook.com", "m.facebook.com"].includes(url.hostname) ? url.toString() : null;
  } catch { return null; }
}

export async function reconcileMarketplaceAutoReviewPhotoPost(input: { tenantId: string; userId: number; postId: number }) {
  const db = await resolveDb();
  const [row] = await db.select({ post: socialPosts, page: socialPages, connection: socialProviderConnections }).from(socialPosts)
    .innerJoin(socialPages, eq(socialPosts.pageId, socialPages.id))
    .innerJoin(socialProviderConnections, eq(socialPages.connectionId, socialProviderConnections.id))
    .where(and(eq(socialPosts.id, input.postId), eq(socialPosts.tenantId, input.tenantId), eq(socialPosts.createdByUserId, input.userId), eq(socialPages.tenantId, input.tenantId), eq(socialProviderConnections.tenantId, input.tenantId), eq(socialProviderConnections.userId, input.userId))).limit(1);
  if (!row) fail("PHOTO_POST_NOT_FOUND", "The Photo Post is unavailable", "NOT_FOUND");
  const metadata = record(row.post.metadata);
  if (metadata.source !== "marketplace_auto_review_photo_post") fail("PHOTO_POST_SCOPE_MISMATCH", "This post is not an Auto Review Photo Post");
  const photoId = text(metadata.externalPhotoId);
  if (!photoId) return { postId: row.post.id, status: metadata.photoPublicationStatus ?? "needs_user_action", message: "No Facebook photo ID was saved. Check the Page manually before creating another post." };
  if (!row.page.encryptedPageAccessToken || row.page.status !== "active" || !row.page.selectedForPublishing) fail("FACEBOOK_PAGE_NOT_READY", "Reconnect and enable this Facebook Page");
  const accessToken = decrypt(row.page.encryptedPageAccessToken);
  const result = await readFacebookPagePhoto({ pageId: row.page.providerPageId, photoId, accessToken });
  const providerPostId = text(result.page_story_id);
  const permalink = safeFacebookPhotoLink(result.link);
  if (!providerPostId) return { postId: row.post.id, status: "reconciling", externalPhotoId: photoId, permalink };
  const nextMetadata = { ...metadata, externalPostId: providerPostId, permalink, photoPublicationStatus: "published", reconciliation: { state: "published", checkedAt: new Date().toISOString() } };
  if (record(metadata.snapshot).affiliateMode === "first_comment") {
    const scopes = Array.isArray(row.connection.grantedScopes) ? row.connection.grantedScopes : [];
    if (scopes.includes("pages_manage_engagement")) {
      await publishAffiliateCommentOnce({ metadata: nextMetadata, pageId: row.page.providerPageId, objectId: providerPostId, accessToken, affiliateUrl: text(record(metadata.snapshot).affiliateUrl), persist: async patch => { Object.assign(nextMetadata, patch); } });
    } else {
      Object.assign(nextMetadata, { affiliateCommentStatus: "needs_user_action", affiliateLinkStatus: "comment_permission_missing" });
    }
  }
  await db.update(socialPosts).set({ status: "published", providerPostId: providerPostId, publishedAt: row.post.publishedAt ?? new Date(), errorMessage: null, metadata: nextMetadata, updatedAt: new Date() }).where(eq(socialPosts.id, row.post.id));
  return { postId: row.post.id, status: "published", providerPostId, permalink };
}

export async function executeMarketplaceAutoReviewPhotoPostPublish(input: {
  tenantId: string; userId: number; postId: number; runId: string; intentHash: string;
  reportProgress?: (input: Record<string, unknown>) => Promise<void> | void;
}) {
  const db = await resolveDb();
  const [row] = await db.select({ post: socialPosts, page: socialPages, connection: socialProviderConnections }).from(socialPosts)
    .innerJoin(socialPages, eq(socialPosts.pageId, socialPages.id))
    .innerJoin(socialProviderConnections, eq(socialPages.connectionId, socialProviderConnections.id))
    .where(and(eq(socialPosts.id, input.postId), eq(socialPosts.tenantId, input.tenantId), eq(socialPosts.createdByUserId, input.userId), eq(socialPages.tenantId, input.tenantId), eq(socialProviderConnections.tenantId, input.tenantId), eq(socialProviderConnections.userId, input.userId))).limit(1);
  if (!row) fail("PHOTO_POST_NOT_FOUND", "The Photo Post is unavailable", "NOT_FOUND");
  const metadata = record(row.post.metadata);
  const snapshot = record(metadata.snapshot);
  if (metadata.source !== "marketplace_auto_review_photo_post" || metadata.autoReviewRunId !== input.runId || metadata.intentHash !== input.intentHash) fail("PUBLISH_INTENT_SCOPE_MISMATCH", "Publishing intent binding does not match the job");
  if (metadata.photoPublicationStatus === "published") {
    const scopes = Array.isArray(row.connection.grantedScopes) ? row.connection.grantedScopes : [];
    const accessToken = row.page.encryptedPageAccessToken ? decrypt(row.page.encryptedPageAccessToken) : null;
    if (record(metadata.snapshot).affiliateMode === "first_comment" && !metadata.affiliateCommentStatus && scopes.includes("pages_manage_engagement") && accessToken) {
      await publishAffiliateCommentOnce({
        metadata,
        pageId: row.page.providerPageId,
        objectId: row.post.providerPostId,
        accessToken,
        affiliateUrl: text(record(metadata.snapshot).affiliateUrl),
        persist: async patch => {
          const next = { ...metadata, ...patch };
          Object.assign(metadata, next);
          await db.update(socialPosts).set({ metadata: next, updatedAt: new Date() }).where(eq(socialPosts.id, input.postId));
        },
      });
    }
    return { status: "published", providerPostId: row.post.providerPostId };
  }
  const patchMetadata = async (patch: JsonRecord, status?: PhotoPublishState) => {
    const next = { ...metadata, ...patch, ...(status ? { photoPublicationStatus: status } : {}) };
    Object.assign(metadata, next);
    await db.update(socialPosts).set({ metadata: next, updatedAt: new Date() }).where(eq(socialPosts.id, input.postId));
  };
  const scopes = Array.isArray(row.connection.grantedScopes) ? row.connection.grantedScopes : [];
  const connectionMetadata = record(row.connection.metadata);
  const pageMetadata = record(row.page.metadata);
  if (connectionMetadata.permissionVerificationStatus !== "verified" || !scopes.includes("pages_manage_posts") || !scopes.includes("pages_read_engagement") || !scopes.includes("pages_show_list") || (snapshot.affiliateMode === "first_comment" && !scopes.includes("pages_manage_engagement")) || pageMetadata.canCreateContent !== true) {
    await patchMetadata({ failureCode: "META_PERMISSION_OR_PAGE_TASK_MISSING" }, "needs_connection");
    return { status: "needs_connection" };
  }
  if (row.page.status !== "active" || !row.page.selectedForPublishing || !row.page.encryptedPageAccessToken || (row.page.tokenExpiresAt && row.page.tokenExpiresAt.getTime() <= Date.now())) {
    await patchMetadata({ failureCode: "FACEBOOK_PAGE_NOT_READY" }, "needs_connection");
    return { status: "needs_connection" };
  }
  const accessToken = decrypt(row.page.encryptedPageAccessToken);
  if (!accessToken || row.page.provider !== "meta" || !/^\d+$/.test(row.page.providerPageId)) {
    await patchMetadata({ failureCode: "FACEBOOK_PAGE_CREDENTIALS_INVALID" }, "needs_connection");
    return { status: "needs_connection" };
  }
  await input.reportProgress?.({ progress: 10, stage: "preflight" });
  let inspected: Awaited<ReturnType<typeof readAndInspectPhoto>>;
  try {
    const [run] = await db.select().from(marketplaceAutoReviewRuns).where(and(eq(marketplaceAutoReviewRuns.id, input.runId), eq(marketplaceAutoReviewRuns.tenantId, input.tenantId), eq(marketplaceAutoReviewRuns.userId, input.userId))).limit(1);
    if (!run) fail("AUTO_REVIEW_RUN_NOT_FOUND", "The Auto Review run is unavailable", "NOT_FOUND");
    const image = resolveMarketplaceAutoReviewPhotoVariant(run.metadataJson, { tenantId: input.tenantId, runId: input.runId, variant: snapshot.selectedVariant });
    if (image.storageKey !== metadata.imageStorageKey) fail("PHOTO_VARIANT_CHANGED", "The selected Auto Review image changed after the publish intent was created");
    inspected = await readAndInspectPhoto(image.storageKey);
    if (inspected.checksum !== metadata.imageChecksum || inspected.size !== metadata.imageSizeBytes || inspected.contentType !== metadata.imageContentType) fail("PHOTO_ARTIFACT_CHANGED", "The selected image changed after the publish intent was created");
  } catch (error) {
    await patchMetadata({ failureCode: error instanceof TRPCError ? error.message.slice(0, 120) : "PHOTO_PREFLIGHT_FAILED", reconciliation: { state: "not_started", checkedAt: new Date().toISOString() } }, "failed");
    await db.update(socialPosts).set({ status: "failed", errorMessage: "The selected Auto Review image failed preflight. Auto Review was not changed.", updatedAt: new Date() }).where(eq(socialPosts.id, input.postId));
    return { status: "failed" };
  }
  await input.reportProgress?.({ progress: 25, stage: "token_check" });
  const caption = composeFacebookPhotoPostCaption({ caption: String(snapshot.caption ?? ""), hashtags: Array.isArray(snapshot.hashtags) ? snapshot.hashtags.map(String) : [], commercialDisclosure: String(snapshot.commercialDisclosure ?? ""), affiliateUrl: snapshot.affiliateMode === "description" && typeof snapshot.affiliateUrl === "string" ? snapshot.affiliateUrl : null });
  if (caption.length > MAX_PHOTO_CAPTION_LENGTH) {
    await patchMetadata({ failureCode: "PHOTO_CAPTION_TOO_LONG", reconciliation: { state: "not_started", checkedAt: new Date().toISOString() } }, "failed");
    await db.update(socialPosts).set({ status: "failed", errorMessage: "The final Photo Post caption exceeds Meta's character limit. Shorten it and submit again.", updatedAt: new Date() }).where(eq(socialPosts.id, input.postId));
    return { status: "failed" };
  }
  await patchMetadata({ photoPublishRequestedAt: new Date().toISOString(), mediaPreflight: { status: "passed", contentType: inspected.contentType, sizeBytes: inspected.size, checksum: inspected.checksum, width: inspected.width, height: inspected.height }, reconciliation: { state: "publish_requested", checkedAt: new Date().toISOString() } }, "publish_requested");
  try {
    const receipt = await publishFacebookPagePhoto({ pageId: row.page.providerPageId, accessToken, caption, filename: `${input.runId}-${snapshot.selectedVariant}.png`, contentType: inspected.contentType, fileSize: inspected.size, body: inspected.bytes });
    const photoId = text(receipt.id);
    if (!photoId) {
      await patchMetadata({ reconciliation: { state: "uncertain", reason: "meta_photo_id_missing", checkedAt: new Date().toISOString() } }, "needs_user_action");
      await db.update(socialPosts).set({ status: "draft", errorMessage: "Facebook may have received this photo. Check the Page before sending again.", updatedAt: new Date() }).where(eq(socialPosts.id, input.postId));
      return { status: "needs_user_action" };
    }
    await patchMetadata({ externalPhotoId: photoId, externalPostId: text(receipt.post_id), providerReceipt: { id: photoId, postId: text(receipt.post_id) }, permalink: safeFacebookPhotoLink(receipt.permalink_url), reconciliation: { state: "photo_id_saved", checkedAt: new Date().toISOString() } }, "reconciling");
    const status = await readFacebookPagePhoto({ pageId: row.page.providerPageId, photoId, accessToken }).catch(() => null);
    const pageStoryId = text(record(status).page_story_id) ?? text(receipt.post_id);
    const permalink = safeFacebookPhotoLink(record(status).link) ?? safeFacebookPhotoLink(receipt.permalink_url);
    if (!pageStoryId) {
      await patchMetadata({ externalStatus: status, reconciliation: { state: "awaiting_page_story_id", checkedAt: new Date().toISOString() }, permalink }, "reconciling");
      return { status: "reconciling", externalPhotoId: photoId };
    }
    await patchMetadata({ externalStatus: status, externalPostId: pageStoryId, permalink, publishedAt: new Date().toISOString(), reconciliation: { state: "published", checkedAt: new Date().toISOString() }, affiliateLinkStatus: snapshot.affiliateMode === "description" ? "included_unverified" : snapshot.affiliateMode === "none" ? "none" : "manual_handoff" }, "published");
    if (snapshot.affiliateMode === "first_comment") {
      await publishAffiliateCommentOnce({ metadata, pageId: row.page.providerPageId, objectId: pageStoryId, accessToken, affiliateUrl: text(snapshot.affiliateUrl), persist: patch => patchMetadata(patch) });
    }
    await db.update(socialPosts).set({ status: "published", providerPostId: pageStoryId, publishedAt: new Date(), errorMessage: null, updatedAt: new Date() }).where(eq(socialPosts.id, input.postId));
    return { status: "published", providerPostId: pageStoryId, permalink };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const connectionIssue = ["META_TOKEN_INVALID", "META_PERMISSION_MISSING"].includes(message);
    await patchMetadata({ failureCode: connectionIssue ? message : "PHOTO_PUBLISH_OUTCOME_UNCERTAIN", reconciliation: { state: connectionIssue ? "connection_required" : "check_page_before_retry", checkedAt: new Date().toISOString() } }, connectionIssue ? "needs_connection" : "needs_user_action");
    await db.update(socialPosts).set({ status: "draft", errorMessage: connectionIssue ? "Reconnect the Facebook Page or restore its publishing permission." : "Facebook may have received this photo. Check the Page before sending again to prevent duplicates.", updatedAt: new Date() }).where(eq(socialPosts.id, input.postId));
    return { status: connectionIssue ? "needs_connection" : "needs_user_action" };
  }
}
