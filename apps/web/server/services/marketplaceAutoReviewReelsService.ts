import { createHash } from "node:crypto";
import { accessSync, constants, createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { AUTO_REVIEW_PUBLISH_HASHTAG, AUTO_REVIEW_PUBLISH_MAX_HASHTAGS } from "../../shared/marketplaceAutoReview/publishingHashtags";

import {
  libraryItems,
  marketplaceAutoReviewRuns,
  marketplaceAutoReviewStages,
  marketplaceProductAffiliateLinks,
  marketplaceProducts,
  socialPages,
  socialPosts,
  socialProviderConnections,
  workerArtifacts,
  workerJobs,
} from "../../drizzle/schema";
import { getDb, type DrizzleDB } from "../db";
import { decrypt } from "./crypto";
import { createControlPlaneJob } from "./jobControlPlaneGateway";
import { buildMarketplaceAutoReviewPublishJobKeys, parseMarketplaceAutoReviewScheduledAt } from "./marketplaceAutoReviewPublishJobKeys";
import {
  finishFacebookReelUpload,
  getFacebookReelStatus,
  startFacebookReelUpload,
  uploadFacebookReelBinary,
} from "./facebookReelsPublishGateway";
import { queueAffiliateCommentForConfirmation } from "./marketplaceAutoReviewAffiliateComment";
import { storageStreamFile } from "../storage";

export const MARKETPLACE_AUTO_REVIEW_REELS_JOB_TYPE = "social.facebook.reels.publish";
const MARKETPLACE_REELS_CONTRACT_VERSION = "feature-186-v1";
const MAX_REELS_BYTES = 1024 * 1024 * 1024;
const ACTIVE_JOB_STATUSES = ["pending", "queued", "leased", "claimed", "preparing", "running", "waiting_external", "retry_scheduled", "uploading", "publishing", "indexing"] as const;
const affiliateModeSchema = z.enum(["description", "first_comment", "manual_native", "none"]);
const ACTIVE_REELS_PUBLISH_STATES = new Set([
  "queued", "scheduled", "preflight", "token_check", "uploading", "processing", "publish_requested", "reconciling",
]);

export type AffiliatePublishMode = z.infer<typeof affiliateModeSchema>;
export type ReelsPublishState = "queued" | "scheduled" | "preflight" | "needs_connection" | "token_check" | "uploading" | "processing" | "publish_requested" | "reconciling" | "published" | "needs_user_action" | "failed" | "cancelled";

export function resolveUnstartedReelsPublicationStatus(input: {
  publicationStatus: string;
  jobStatus: string;
  jobStartedAt: Date | null;
  hasExternalVideoSession: boolean;
}): ReelsPublishState | null {
  if (!ACTIVE_REELS_PUBLISH_STATES.has(input.publicationStatus)) return null;
  if (!["failed", "expired", "canceled", "cancelled"].includes(input.jobStatus)) return null;
  if (input.hasExternalVideoSession) return "needs_user_action";
  return input.jobStartedAt ? null : "failed";
}

const publishSnapshotSchema = z.object({
  caption: z.string().trim().min(1).max(2000),
  hashtags: z.array(z.string().trim().regex(AUTO_REVIEW_PUBLISH_HASHTAG)).max(AUTO_REVIEW_PUBLISH_MAX_HASHTAGS),
  affiliateMode: affiliateModeSchema,
  aiGenerated: z.boolean(),
  commercialDisclosure: z.string().trim().max(500).default(""),
  allowNoAffiliate: z.boolean().optional(),
}).strict();

type RunMetadata = Record<string, any>;
type Db = DrizzleDB;

function record(value: unknown): RunMetadata {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RunMetadata : {};
}

function nonemptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function hashJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function composeFacebookReelsDescription(snapshot: {
  caption: string;
  hashtags: string[];
  commercialDisclosure: string;
  affiliateUrl?: string | null;
}): string {
  return [snapshot.caption, snapshot.hashtags.join(" "), snapshot.commercialDisclosure, snapshot.affiliateUrl]
    .filter(Boolean)
    .join("\n\n");
}

export function hashFacebookReelsContentSnapshot(value: unknown): string {
  return hashJson(value);
}

function fail(code: string, message: string, status: "PRECONDITION_FAILED" | "NOT_FOUND" | "BAD_REQUEST" | "INTERNAL_SERVER_ERROR" = "PRECONDITION_FAILED"): never {
  throw new TRPCError({ code: status, message: `${code}: ${message}` });
}

async function resolveDb(): Promise<Db> {
  const db = await getDb();
  if (!db) fail("DATABASE_UNAVAILABLE", "Publishing is temporarily unavailable", "INTERNAL_SERVER_ERROR");
  return db;
}

async function loadAuthoritativePackage(input: {
  db: Db;
  tenantId: string;
  userId: number;
  runId: string;
}) {
  const [run] = await input.db.select().from(marketplaceAutoReviewRuns).where(and(
    eq(marketplaceAutoReviewRuns.id, input.runId),
    eq(marketplaceAutoReviewRuns.tenantId, input.tenantId),
    eq(marketplaceAutoReviewRuns.userId, input.userId),
  )).limit(1);
  if (!run) fail("AUTO_REVIEW_RUN_NOT_FOUND", "The Auto Review run is unavailable", "NOT_FOUND");
  if (run.outputMode !== "full_video" || !run.resultLibraryItemId || !run.renderJobId) {
    fail("FINAL_VIDEO_NOT_FINALIZED", "Finish final video and Library finalization before publishing");
  }
  if (run.status !== "completed") fail("AUTO_REVIEW_NOT_COMPLETED", "Auto Review must finish its existing finalization workflow first");

  const stages = await input.db.select({ stageKey: marketplaceAutoReviewStages.stageKey, status: marketplaceAutoReviewStages.status })
    .from(marketplaceAutoReviewStages).where(eq(marketplaceAutoReviewStages.runId, run.id));
  const stageMap = new Map(stages.map(stage => [stage.stageKey, stage.status]));
  if (stageMap.get("render") !== "completed" || stageMap.get("library_finalize") !== "completed") {
    fail("FINALIZATION_EVIDENCE_REQUIRED", "The final render and private Library finalization are not verified");
  }

  const runMetadata = record(run.metadataJson);
  const staged = record(runMetadata.stagedPipeline);
  const savedSocialCaption = record(staged.socialCaption);
  // The publish form can carry an edited caption even when older runs do not
  // have the social caption copied into stagedPipeline metadata.
  const caption = nonemptyString(savedSocialCaption.caption) ?? "";
  const hashtags = Array.isArray(savedSocialCaption.hashtags)
    ? savedSocialCaption.hashtags
        .filter((tag: unknown): tag is string => typeof tag === "string")
        .slice(0, 20)
        .map((tag: string) => `#${tag.replace(/^#+/, "")}`)
    : [];
  const [product] = await input.db.select({ id: marketplaceProducts.id })
    .from(marketplaceProducts).where(and(
      eq(marketplaceProducts.id, run.productId),
      eq(marketplaceProducts.userId, input.userId),
      eq(marketplaceProducts.tenantId, input.tenantId),
    )).limit(1);
  if (!product) fail("PRODUCT_OWNERSHIP_MISMATCH", "Product ownership could not be verified");
  const [affiliate] = await input.db.select({ affiliateUrl: marketplaceProductAffiliateLinks.affiliateUrl })
    .from(marketplaceProductAffiliateLinks).where(and(
      eq(marketplaceProductAffiliateLinks.productId, run.productId),
      eq(marketplaceProductAffiliateLinks.userId, input.userId),
      eq(marketplaceProductAffiliateLinks.tenantId, input.tenantId),
      isNotNull(marketplaceProductAffiliateLinks.affiliateUrl),
      sql`length(trim(${marketplaceProductAffiliateLinks.affiliateUrl})) > 0`,
    )).orderBy(sql`${marketplaceProductAffiliateLinks.updatedAt} DESC`).limit(1);
  const affiliateUrl = nonemptyString(affiliate?.affiliateUrl);

  const [libraryItem] = await input.db.select().from(libraryItems).where(and(
    eq(libraryItems.id, run.resultLibraryItemId),
    eq(libraryItems.tenantId, input.tenantId),
    eq(libraryItems.ownerUserId, input.userId),
    eq(libraryItems.itemType, "video"),
    eq(libraryItems.visibility, "private"),
    isNull(libraryItems.deletedAt),
  )).limit(1);
  if (!libraryItem) fail("FINAL_ARTIFACT_OWNERSHIP_MISMATCH", "The private final video Library item is unavailable");
  const libraryMetadata = record(libraryItem.metadata);
  if (
    libraryMetadata.source_type !== "marketplace_auto_review_render" ||
    libraryMetadata.auto_review_run_id !== run.id ||
    libraryMetadata.media_job_id !== run.renderJobId
  ) fail("FINAL_ARTIFACT_IDENTITY_MISMATCH", "The Library item is not the final artifact for this run");
  const renderQa = record(runMetadata.finalRenderQaEnvelope);
  const mediaQa = record(runMetadata.finalMediaQaEnvelope);
  const probe = record(runMetadata.renderArtifactProbe);
  const packageEvidence = record(runMetadata.publishableAssetPackage);
  if (renderQa.status !== "passed" || mediaQa.status !== "passed" || probe.status !== "passed" ||
    packageEvidence.status !== "ready_private_library_asset" ||
    packageEvidence.runId !== run.id ||
    packageEvidence.libraryItemId !== run.resultLibraryItemId ||
    !nonemptyString(packageEvidence.packageId) ||
    !Array.isArray(packageEvidence.evidenceRefs) ||
    !packageEvidence.evidenceRefs.some(nonemptyString)) {
    fail("FINAL_ARTIFACT_QA_UNVERIFIED", "Final render, media, probe, or package evidence is missing");
  }

  const [renderJob] = await input.db.select().from(workerJobs).where(and(
    eq(workerJobs.id, run.renderJobId),
    eq(workerJobs.tenantId, input.tenantId),
    eq(workerJobs.requestedByUserId, input.userId),
    eq(workerJobs.status, "completed"),
  )).limit(1);
  if (!renderJob) fail("RENDER_JOB_OWNERSHIP_MISMATCH", "The completed render job could not be verified");
  const [artifact] = await input.db.select().from(workerArtifacts).where(and(
    eq(workerArtifacts.workerJobId, renderJob.id),
    eq(workerArtifacts.artifactType, "remotion_render_mp4"),
  )).limit(1);
  if (!artifact || !artifact.storageRef || artifact.storageRef.startsWith("http")) {
    fail("PRIVATE_RENDER_ARTIFACT_UNAVAILABLE", "A private MP4 artifact is required for server-side upload");
  }
  const artifactMetadata = record(artifact.metadataJson);
  const expectedChecksum = nonemptyString(artifactMetadata.checksumSha256)?.toLowerCase() ?? null;
  const expectedSize = Number(artifactMetadata.sizeBytes ?? 0);
  const contentType = nonemptyString(artifactMetadata.contentType) ?? "video/mp4";
  if (!expectedChecksum || !/^[a-f0-9]{64}$/.test(expectedChecksum) || !Number.isSafeInteger(expectedSize) || expectedSize <= 0 || expectedSize > MAX_REELS_BYTES || contentType !== "video/mp4") {
    fail("RENDER_ARTIFACT_INTEGRITY_METADATA_MISSING", "The render artifact lacks a valid checksum, size, or MP4 content type");
  }
  return { run, runMetadata, caption, hashtags, affiliateUrl, libraryItem, renderJob, artifact, expectedChecksum, expectedSize, contentType };
}

export async function getMarketplaceAutoReviewReelsReadiness(input: {
  tenantId: string;
  userId: number;
  runId: string;
}) {
  const db = await resolveDb();
  const pkg = await loadAuthoritativePackage({ db, ...input }).catch(error => ({
    error: error instanceof TRPCError ? error.message : "Publishing readiness could not be determined",
    canListPages: error instanceof TRPCError && error.code === "PRECONDITION_FAILED",
  }));
  if ("error" in pkg && !pkg.canListPages) return { ready: false, reason: pkg.error, pages: [] };
  const pages = (await (await import("./socialPublishingService")).listPublishingPages(input.tenantId, input.userId))
    .filter(page => page.provider === "meta");
  if ("error" in pkg) return { ready: false, reason: pkg.error, pages };
  const hasPage = pages.some(page => page.publishingReady);
  return {
    ready: hasPage,
    reason: hasPage ? null : "Connect a Facebook Page and enable publishing in Social Channels",
    pages,
    savedCaption: pkg.caption,
    savedHashtags: pkg.hashtags,
    hasAffiliateLink: Boolean(pkg.affiliateUrl),
    finalArtifactId: pkg.artifact.id,
  };
}

export async function startMarketplaceAutoReviewReelsPublish(input: {
  tenantId: string;
  userId: number;
  runId: string;
  pageId: number;
  scheduledAt?: string;
  snapshot: z.infer<typeof publishSnapshotSchema>;
}) {
  const snapshot = publishSnapshotSchema.parse(input.snapshot);
  const scheduledAt = parseMarketplaceAutoReviewScheduledAt(input.scheduledAt);
  if (scheduledAt && snapshot.affiliateMode === "manual_native") fail("MANUAL_HANDOFF_CANNOT_BE_SCHEDULED", "Manual Facebook product tagging cannot be scheduled", "BAD_REQUEST");
  if (scheduledAt && scheduledAt.getTime() < Date.now() + 30 * 60_000) {
    fail("SCHEDULED_AT_TOO_SOON", "ตั้งเวลา Reel ล่วงหน้าอย่างน้อย 30 นาที เพื่อให้ Facebook รับไฟล์และจัดคิวได้ทัน", "BAD_REQUEST");
  }
  const db = await resolveDb();
  const pkg = await loadAuthoritativePackage({ db, tenantId: input.tenantId, userId: input.userId, runId: input.runId });
  const { listPublishingPages } = await import("./socialPublishingService");
  const selectedPageReadiness = (await listPublishingPages(input.tenantId, input.userId))
    .find(page => page.id === input.pageId);
  if (!selectedPageReadiness?.publishingReady || selectedPageReadiness.provider !== "meta") {
    fail("FACEBOOK_PAGE_NOT_READY", selectedPageReadiness?.publishingIssue ?? "Select an active Facebook Page with verified publishing permission");
  }
  // First-comment permission is checked only when the user confirms the comment, after publishing.
  if (snapshot.affiliateMode === "description" && !pkg.affiliateUrl) fail("AFFILIATE_LINK_MISSING", "No canonical affiliate URL is stored for this product");
  if (snapshot.affiliateMode === "none" && !snapshot.allowNoAffiliate) fail("NO_AFFILIATE_CONFIRMATION_REQUIRED", "Explicitly confirm publishing without the affiliate link");
  const canonical = {
    tenantId: input.tenantId,
    userId: input.userId,
    runId: pkg.run.id,
    productId: pkg.run.productId,
    finalVideoArtifactId: pkg.artifact.id,
    artifactChecksum: pkg.expectedChecksum,
    renderWorkerJobId: pkg.renderJob.id,
    caption: snapshot.caption,
    hashtags: snapshot.hashtags,
    affiliateUrl: snapshot.affiliateMode === "none" ? null : pkg.affiliateUrl,
    targetPageId: input.pageId,
    affiliateMode: snapshot.affiliateMode,
    aiGenerated: snapshot.aiGenerated,
    commercialDisclosure: snapshot.commercialDisclosure,
    publicationFormat: "facebook_reel",
  };
  const intentHash = hashJson(canonical);
  const [existing] = await db.select().from(socialPosts).where(and(
    eq(socialPosts.tenantId, input.tenantId),
    eq(socialPosts.pageId, input.pageId),
    sql`${socialPosts.metadata}->>'source' = 'marketplace_auto_review_reels'`,
    sql`${socialPosts.metadata}->>'intentHash' = ${intentHash}`,
  )).limit(1);
  const existingMetadata = record(existing?.metadata);
  const existingPublicationStatus = String(existingMetadata.videoPublicationStatus ?? "queued");
  const [priorPublishJob] = existing ? await db.select({
    status: workerJobs.status,
    startedAt: workerJobs.startedAt,
  }).from(workerJobs).where(and(
    eq(workerJobs.tenantId, input.tenantId),
    eq(workerJobs.requestedByUserId, input.userId),
    eq(workerJobs.jobType, MARKETPLACE_AUTO_REVIEW_REELS_JOB_TYPE),
    existingMetadata.publishingWorkerJobId
      ? eq(workerJobs.id, String(existingMetadata.publishingWorkerJobId))
      : sql`${workerJobs.inputJson}->>'postId' = ${String(existing.id)}`,
  )).orderBy(desc(workerJobs.createdAt)).limit(1) : [];
  const recoveredQueueStatus = priorPublishJob ? resolveUnstartedReelsPublicationStatus({
    publicationStatus: existingPublicationStatus,
    jobStatus: String(priorPublishJob.status),
    jobStartedAt: priorPublishJob.startedAt,
    hasExternalVideoSession: Boolean(existingMetadata.externalVideoId || existingMetadata.finishRequestedAt),
  }) : null;
  const retryableWithoutExternalSession = Boolean(
    existing && (
      (["failed", "needs_connection"].includes(existingPublicationStatus) && !existingMetadata.externalVideoId) ||
      recoveredQueueStatus === "failed"
    ) && snapshot.affiliateMode !== "manual_native"
  );
  const needsQueueRepair = Boolean(existing && existingPublicationStatus === "queued" && !existingMetadata.publishingWorkerJobId && snapshot.affiliateMode !== "manual_native");
  if (existing && !retryableWithoutExternalSession && !needsQueueRepair) {
    return { postId: existing.id, status: existingPublicationStatus, intentHash };
  }
  const publishAttempt = retryableWithoutExternalSession
    ? Math.min(10, Math.max(1, Number(existingMetadata.publishAttempt ?? 1) + 1))
    : Math.max(1, Number(existingMetadata.publishAttempt ?? 1));

  const description = composeFacebookReelsDescription({
    caption: snapshot.caption,
    hashtags: snapshot.hashtags,
    commercialDisclosure: snapshot.commercialDisclosure,
    affiliateUrl: snapshot.affiliateMode === "description" ? canonical.affiliateUrl : null,
  });
  const newMetadata = {
    source: "marketplace_auto_review_reels",
    autoReviewRunId: pkg.run.id,
    productId: pkg.run.productId,
    finalVideoArtifactId: pkg.artifact.id,
    artifactChecksum: pkg.expectedChecksum,
    renderWorkerJobId: pkg.renderJob.id,
    intentHash,
    publishAttempt,
    snapshot: canonical,
    videoPublicationStatus: (scheduledAt ? "scheduled" : "queued") satisfies ReelsPublishState,
    ...(scheduledAt ? { scheduledAt: scheduledAt.toISOString() } : {}),
    affiliateLinkStatus: canonical.affiliateUrl ? (snapshot.affiliateMode === "first_comment" ? "pending_first_comment" : "pending") : "none",
    commercialDisclosureStatus: snapshot.commercialDisclosure ? "included_in_description" : "not_provided",
    attributionVerificationStatus: "unverified",
    aiDisclosure: snapshot.aiGenerated,
    reconciliation: { state: "not_started" },
  };
  let post: { id: number } | undefined;
  if (existing) {
    [post] = await db.update(socialPosts).set({
        status: scheduledAt ? "scheduled" : "draft",
        scheduledAt,
        contentText: description,
        contentLink: snapshot.affiliateMode === "description" ? canonical.affiliateUrl : null,
        errorMessage: null,
        metadata: newMetadata,
        updatedAt: new Date(),
      }).where(eq(socialPosts.id, existing.id)).returning({ id: socialPosts.id });
  } else {
    try {
      [post] = await db.insert(socialPosts).values({
        tenantId: input.tenantId,
        pageId: input.pageId,
        status: scheduledAt ? "scheduled" : "draft",
        scheduledAt,
        contentText: description,
        contentLink: snapshot.affiliateMode === "description" ? canonical.affiliateUrl : null,
        mediaRefs: null,
        createdByUserId: input.userId,
        metadata: newMetadata,
      }).returning({ id: socialPosts.id });
    } catch (error) {
      if ((error as { code?: unknown })?.code !== "23505") throw error;
      const [concurrentIntent] = await db.select({ id: socialPosts.id, metadata: socialPosts.metadata }).from(socialPosts).where(and(
        eq(socialPosts.tenantId, input.tenantId),
        eq(socialPosts.pageId, input.pageId),
        sql`${socialPosts.metadata}->>'source' = 'marketplace_auto_review_reels'`,
        sql`${socialPosts.metadata}->>'intentHash' = ${intentHash}`,
      )).limit(1);
      if (!concurrentIntent) throw error;
      return { postId: concurrentIntent.id, status: record(concurrentIntent.metadata).videoPublicationStatus ?? "queued", intentHash };
    }
  }
  if (!post) fail("SOCIAL_POST_CREATE_FAILED", "Could not create publishing intent", "INTERNAL_SERVER_ERROR");

  if (snapshot.affiliateMode === "manual_native") {
    const metadata = {
      source: "marketplace_auto_review_reels",
      autoReviewRunId: pkg.run.id,
      productId: pkg.run.productId,
      finalVideoArtifactId: pkg.artifact.id,
      artifactChecksum: pkg.expectedChecksum,
      renderWorkerJobId: pkg.renderJob.id,
      intentHash,
      snapshot: canonical,
      videoPublicationStatus: "needs_user_action" satisfies ReelsPublishState,
      affiliateLinkStatus: "manual_handoff",
      commercialDisclosureStatus: snapshot.commercialDisclosure ? "prepared_for_manual_handoff" : "not_provided",
      attributionVerificationStatus: "unverified",
      aiDisclosure: snapshot.aiGenerated,
      manualHandoff: {
        state: "prepared",
        libraryItemId: pkg.libraryItem.id,
        affiliateUrl: pkg.affiliateUrl,
        instructions: "Open this private final video in Library, then use Facebook's native Reel composer to apply product tagging and its commercial partnership label before publishing.",
      },
    };
    await db.update(socialPosts).set({
      contentText: composeFacebookReelsDescription({
        caption: snapshot.caption,
        hashtags: snapshot.hashtags,
        commercialDisclosure: snapshot.commercialDisclosure,
      }),
      contentLink: pkg.affiliateUrl,
      metadata,
      updatedAt: new Date(),
    }).where(eq(socialPosts.id, post.id));
    return { postId: post.id, status: "needs_user_action" as const, intentHash, manualHandoff: true };
  }

  try {
    const jobKeys = buildMarketplaceAutoReviewPublishJobKeys({ format: "reels", intentHash, attempt: publishAttempt, purpose: "publish" });
    const job = await createControlPlaneJob({
      context: {
        tenantId: input.tenantId,
        actorType: "user",
        actorId: input.userId,
        authorizationScope: "marketplace-auto-review:facebook-reels-publish",
        correlationId: `marketplace-reels:${pkg.run.id}`,
        idempotencyKey: jobKeys.idempotencyKey,
      },
      definition: {
        contractVersion: MARKETPLACE_REELS_CONTRACT_VERSION,
        jobType: MARKETPLACE_AUTO_REVIEW_REELS_JOB_TYPE,
        executionClass: "long",
        input: { postId: post.id, runId: pkg.run.id, intentHash },
        ...(scheduledAt ? { scheduledAt: scheduledAt.toISOString() } : {}),
        idempotencyKey: jobKeys.idempotencyKey,
        activeDedupeKey: jobKeys.activeDedupeKey,
        retryPolicy: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, jitter: "bounded", deadlineMs: 30 * 60_000, allowedErrorClasses: [] },
        timeoutPolicy: { softTimeoutMs: 15 * 60_000, hardTimeoutMs: 30 * 60_000 },
        requiredCapabilities: { runtime: "node_job_worker", provider: "meta", format: "facebook_reel" },
      },
      createOptions: { runtimeType: "node_job_worker", admissionMode: "durable_queue" },
    });
    const metadata = record((await db.select({ metadata: socialPosts.metadata }).from(socialPosts).where(eq(socialPosts.id, post.id)).limit(1))[0]?.metadata);
    await db.update(socialPosts).set({ metadata: { ...metadata, publishingWorkerJobId: job.jobId }, updatedAt: new Date() }).where(eq(socialPosts.id, post.id));
    return { postId: post.id, jobId: job.jobId, status: scheduledAt ? "scheduled" as const : "queued" as const, intentHash };
  } catch (error) {
    await db.update(socialPosts).set({
      status: "failed",
      errorMessage: "Publishing job could not be queued. Retry from this run; no Facebook post was requested.",
      metadata: { ...newMetadata, videoPublicationStatus: "failed", failureCode: "JOB_ADMISSION_FAILED" },
      updatedAt: new Date(),
    }).where(eq(socialPosts.id, post.id));
    throw error;
  }
}

export function selectExecutableFfprobe(
  candidates: Array<string | undefined>,
  canExecute: (candidate: string) => boolean = candidate => {
    try {
      accessSync(candidate, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  },
): string {
  return candidates.find(candidate => candidate && canExecute(candidate)) ?? "ffprobe";
}

function resolveFfprobe(): string {
  return selectExecutableFfprobe([
    process.env.FFPROBE_PATH,
    "/usr/bin/ffprobe",
    "/usr/local/bin/ffprobe",
    join(homedir(), ".local/bin/ffprobe"),
  ]);
}

async function stageAndInspectArtifact(input: { storageRef: string; expectedSize: number; expectedChecksum: string }) {
  const stored = await storageStreamFile(input.storageRef);
  if (!stored || stored.isPartial || stored.contentType !== "video/mp4" || stored.totalLength !== input.expectedSize) {
    fail("RENDER_ARTIFACT_STORAGE_MISMATCH", "Private MP4 object size or content type differs from its verified artifact metadata");
  }
  const directory = await mkdtemp(join(tmpdir(), "facebook-reels-"));
  const filePath = join(directory, "final-video.mp4");
  const digest = createHash("sha256");
  let byteCount = 0;
  const meter = new Transform({ transform(chunk, _encoding, callback) { byteCount += chunk.length; digest.update(chunk); callback(null, chunk); } });
  const source = stored.stream instanceof Readable ? stored.stream : Readable.fromWeb(stored.stream as ReadableStream<Uint8Array>);
  try {
    await pipeline(source, meter, createWriteStream(filePath, { flags: "wx" }));
    const checksum = digest.digest("hex");
    if (byteCount !== input.expectedSize || checksum !== input.expectedChecksum || byteCount > MAX_REELS_BYTES) {
      fail("RENDER_ARTIFACT_INTEGRITY_FAILED", "Final video checksum or size verification failed");
    }
    const probe = await new Promise<Record<string, any>>((resolve, reject) => {
      const child = spawn(resolveFfprobe(), ["-v", "error", "-show_streams", "-show_format", "-of", "json", filePath], { stdio: ["ignore", "pipe", "ignore"] });
      let stdout = "";
      const timeout = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("MEDIA_PREFLIGHT_TIMEOUT")); }, 10_000);
      child.stdout?.on("data", chunk => { stdout += chunk.toString(); });
      child.on("error", error => { clearTimeout(timeout); reject(error); });
      child.on("close", code => { clearTimeout(timeout); if (code !== 0) reject(new Error("MEDIA_PREFLIGHT_FAILED")); else { try { resolve(JSON.parse(stdout)); } catch { reject(new Error("MEDIA_PREFLIGHT_INVALID")); } } });
    });
    const streams = Array.isArray(probe.streams) ? probe.streams : [];
    const video = streams.find((stream: any) => stream.codec_type === "video");
    const audio = streams.find((stream: any) => stream.codec_type === "audio");
    const width = Number(video?.width);
    const height = Number(video?.height);
    const duration = Number(probe.format?.duration ?? video?.duration);
    const fpsParts = String(video?.avg_frame_rate ?? "0/1").split("/").map(Number);
    const frameRate = fpsParts[1] ? fpsParts[0] / fpsParts[1] : 0;
    if (
      probe.format?.format_name?.split(",").includes("mp4") !== true || video?.codec_name !== "h264" ||
      width < 540 || height < 960 || Math.abs(width / height - 9 / 16) > 0.01 ||
      !Number.isFinite(duration) || duration < 3 || duration > 90 || frameRate < 23 || frameRate > 61 ||
      (audio && audio.codec_name !== "aac")
    ) fail("FACEBOOK_REELS_MEDIA_UNSUPPORTED", "Video must be H.264 MP4, 9:16, 3–90 seconds, with supported frame rate and AAC audio when present");
    return { directory, filePath, byteCount, checksum, width, height, duration, frameRate, hasAudio: Boolean(audio) };
  } catch (error) {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

function metaText(value: unknown): string | null {
  return nonemptyString(value);
}

export function isFacebookReelPublished(statusValue: unknown): boolean {
  const status = record(statusValue);
  const publishingPhase = record(status.publishing_phase);
  return status.video_status === "published" ||
    status.status === "published" ||
    publishingPhase.publish_status === "published";
}

export function isFacebookReelScheduled(statusValue: unknown): boolean {
  const status = record(statusValue);
  const publishingPhase = record(status.publishing_phase);
  return status.video_status === "scheduled" || status.video_state === "SCHEDULED" ||
    publishingPhase.publish_status === "scheduled";
}

export const marketplaceAutoReviewReelsWorkerInputSchema = z.object({
  postId: z.number().int().positive(),
  runId: z.string().trim().min(1).max(64),
  intentHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export async function reconcileMarketplaceAutoReviewReelsPublication(input: {
  tenantId: string;
  userId: number;
  postId: number;
}) {
  const db = await resolveDb();
  const [row] = await db.select({ post: socialPosts, page: socialPages, connection: socialProviderConnections })
    .from(socialPosts)
    .innerJoin(socialPages, eq(socialPosts.pageId, socialPages.id))
    .innerJoin(socialProviderConnections, eq(socialPages.connectionId, socialProviderConnections.id))
    .where(and(
      eq(socialPosts.id, input.postId), eq(socialPosts.tenantId, input.tenantId),
      eq(socialPosts.createdByUserId, input.userId), eq(socialPages.tenantId, input.tenantId),
      eq(socialProviderConnections.tenantId, input.tenantId), eq(socialProviderConnections.userId, input.userId),
    )).limit(1);
  if (!row) fail("PUBLISH_INTENT_NOT_FOUND", "Publishing intent is unavailable", "NOT_FOUND");
  const metadata = record(row.post.metadata);
  const videoId = nonemptyString(metadata.externalVideoId);
  if (metadata.source !== "marketplace_auto_review_reels" || !videoId) fail("META_RECONCILIATION_UNAVAILABLE", "No persisted Facebook Reels video ID is available");
  const accessToken = decrypt(row.page.encryptedPageAccessToken ?? "");
  if (!accessToken) fail("META_RECONNECT_REQUIRED", "Reconnect the Facebook Page before checking its status");
  const providerStatus = await getFacebookReelStatus({ pageId: row.page.providerPageId, videoId, accessToken });
  const status = record(providerStatus.status);
  const videoStatus = nonemptyString(status.video_status) ?? "unknown";
  const finishResponse = record(metadata.finishResponse);
  const providerPostId = nonemptyString(providerStatus.post_id) ?? nonemptyString(finishResponse.post_id) ?? nonemptyString(providerStatus.id) ?? row.post.providerPostId;
  const permalink = nonemptyString(providerStatus.permalink_url) ?? nonemptyString(providerStatus.permalink);
  const isPublished = isFacebookReelPublished(status);
  const isScheduled = isFacebookReelScheduled(status);
  const nextMetadata = {
    ...metadata,
    externalStatus: providerStatus,
    reconciliation: { state: videoStatus, checkedAt: new Date().toISOString() },
    videoPublicationStatus: isPublished ? "published" : isScheduled ? "scheduled" : ["processing", "uploading", "ready", "upload_complete"].includes(videoStatus) ? "processing" : "needs_user_action",
    ...(permalink ? { permalink } : {}),
    ...(isPublished ? { publishedAt: new Date().toISOString() } : {}),
  };
  if (isPublished && record(metadata.snapshot).affiliateMode === "first_comment") {
    await queueAffiliateCommentForConfirmation({ metadata: nextMetadata, affiliateUrl: nonemptyString(record(metadata.snapshot).affiliateUrl), persist: async patch => { Object.assign(nextMetadata, patch); } });
  }
  await db.update(socialPosts).set({
    metadata: nextMetadata,
    status: isPublished ? "published" : isScheduled ? "scheduled" : "draft",
    providerPostId,
    publishedAt: isPublished ? new Date() : row.post.publishedAt,
    errorMessage: isPublished ? null : row.post.errorMessage,
    updatedAt: new Date(),
  }).where(eq(socialPosts.id, input.postId));
  return {
    status: nextMetadata.videoPublicationStatus,
    providerPostId,
    permalink: permalink ?? null,
    checkedAt: nextMetadata.reconciliation.checkedAt,
  };
}

export async function resumeMarketplaceAutoReviewReelsUpload(input: {
  tenantId: string;
  userId: number;
  postId: number;
}) {
  const db = await resolveDb();
  const [post] = await db.select({ id: socialPosts.id, pageId: socialPosts.pageId, metadata: socialPosts.metadata })
    .from(socialPosts).where(and(
      eq(socialPosts.id, input.postId), eq(socialPosts.tenantId, input.tenantId),
      eq(socialPosts.createdByUserId, input.userId),
    )).limit(1);
  if (!post) fail("PUBLISH_INTENT_NOT_FOUND", "Publishing intent is unavailable", "NOT_FOUND");
  const metadata = record(post.metadata);
  if (metadata.source !== "marketplace_auto_review_reels" || !nonemptyString(metadata.externalVideoId) || !nonemptyString(metadata.uploadUrl) || metadata.finishRequestedAt) {
    fail("REELS_UPLOAD_NOT_RESUMABLE", "This Reel is not in a safely resumable upload state");
  }
  const attempt = Math.min(10, Math.max(1, Number(metadata.resumeAttempt ?? 0) + 1));
  if (attempt === 10 && Number(metadata.resumeAttempt ?? 0) >= 10) fail("REELS_RESUME_LIMIT_REACHED", "The upload needs manual review before another resume attempt");
  const intentHash = nonemptyString(metadata.intentHash);
  const runId = nonemptyString(metadata.autoReviewRunId);
  if (!intentHash || !runId) fail("REELS_PUBLISH_INTENT_INVALID", "Publishing intent binding is incomplete");
  const nextMetadata = { ...metadata, resumeAttempt: attempt, videoPublicationStatus: "queued", reconciliation: { state: "resume_queued", checkedAt: new Date().toISOString() } };
  await db.update(socialPosts).set({ metadata: nextMetadata, errorMessage: null, updatedAt: new Date() }).where(eq(socialPosts.id, post.id));
  const jobKeys = buildMarketplaceAutoReviewPublishJobKeys({ format: "reels", intentHash, attempt, purpose: "resume" });
  const idempotencyKey = jobKeys.idempotencyKey;
  try {
    const job = await createControlPlaneJob({
      context: {
        tenantId: input.tenantId,
        actorType: "user",
        actorId: input.userId,
        authorizationScope: "marketplace-auto-review:facebook-reels-resume",
        correlationId: `marketplace-reels:${runId}`,
        idempotencyKey,
      },
      definition: {
        contractVersion: MARKETPLACE_REELS_CONTRACT_VERSION,
        jobType: MARKETPLACE_AUTO_REVIEW_REELS_JOB_TYPE,
        executionClass: "long",
        input: { postId: post.id, runId, intentHash },
        idempotencyKey,
        activeDedupeKey: jobKeys.activeDedupeKey,
        retryPolicy: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, jitter: "bounded", deadlineMs: 30 * 60_000, allowedErrorClasses: [] },
        timeoutPolicy: { softTimeoutMs: 15 * 60_000, hardTimeoutMs: 30 * 60_000 },
        requiredCapabilities: { runtime: "node_job_worker", provider: "meta", format: "facebook_reel", mode: "resume" },
      },
      createOptions: { runtimeType: "node_job_worker", admissionMode: "durable_queue" },
    });
    await db.update(socialPosts).set({ metadata: { ...nextMetadata, publishingWorkerJobId: job.jobId }, updatedAt: new Date() }).where(eq(socialPosts.id, post.id));
    return { postId: post.id, jobId: job.jobId, status: "queued" as const };
  } catch (error) {
    await db.update(socialPosts).set({ metadata: { ...nextMetadata, videoPublicationStatus: "needs_user_action", failureCode: "RESUME_JOB_ADMISSION_FAILED" }, updatedAt: new Date() }).where(eq(socialPosts.id, post.id));
    throw error;
  }
}

export async function executeMarketplaceAutoReviewReelsPublish(input: {
  tenantId: string;
  userId: number;
  postId: number;
  runId: string;
  intentHash: string;
  reportProgress?: (input: Record<string, unknown>) => Promise<void> | void;
}) {
  const db = await resolveDb();
  const [postRow] = await db.select({ post: socialPosts, page: socialPages, connection: socialProviderConnections })
    .from(socialPosts)
    .innerJoin(socialPages, eq(socialPosts.pageId, socialPages.id))
    .innerJoin(socialProviderConnections, eq(socialPages.connectionId, socialProviderConnections.id))
    .where(and(
      eq(socialPosts.id, input.postId), eq(socialPosts.tenantId, input.tenantId),
      eq(socialPages.tenantId, input.tenantId), eq(socialProviderConnections.tenantId, input.tenantId),
      eq(socialProviderConnections.userId, input.userId),
    )).limit(1);
  if (!postRow) fail("PUBLISH_INTENT_NOT_FOUND", "Publishing intent is unavailable", "NOT_FOUND");
  const metadata = record(postRow.post.metadata);
  const snapshot = record(metadata.snapshot);
  if (metadata.source !== "marketplace_auto_review_reels" || metadata.autoReviewRunId !== input.runId || metadata.intentHash !== input.intentHash) fail("PUBLISH_INTENT_SCOPE_MISMATCH", "Publishing intent binding does not match the job");
  if (metadata.videoPublicationStatus === "published") {
    if (record(metadata.snapshot).affiliateMode === "first_comment" && !metadata.affiliateCommentStatus) {
      await queueAffiliateCommentForConfirmation({
        metadata,
        affiliateUrl: nonemptyString(record(metadata.snapshot).affiliateUrl),
        persist: async patch => {
          const next = { ...metadata, ...patch };
          Object.assign(metadata, next);
          await db.update(socialPosts).set({ metadata: next, updatedAt: new Date() }).where(eq(socialPosts.id, input.postId));
        },
      });
    }
    return { status: "published", providerPostId: postRow.post.providerPostId };
  }
  const patchMetadata = async (patch: Record<string, unknown>, status?: ReelsPublishState) => {
    const next = { ...metadata, ...patch, ...(status ? { videoPublicationStatus: status } : {}) };
    Object.assign(metadata, next);
    await db.update(socialPosts).set({ metadata: next, updatedAt: new Date() }).where(eq(socialPosts.id, input.postId));
  };
  const page = postRow.page;
  const connectionMetadata = record(postRow.connection.metadata);
  const pageMetadata = record(page.metadata);
  const grantedScopes = Array.isArray(postRow.connection.grantedScopes) ? postRow.connection.grantedScopes : [];
  if (
    connectionMetadata.permissionVerificationStatus !== "verified" ||
    !grantedScopes.includes("pages_manage_posts") ||
    !grantedScopes.includes("pages_read_engagement") ||
    !grantedScopes.includes("pages_show_list") ||
    pageMetadata.canCreateContent !== true
  ) {
    await patchMetadata({ failureCode: "META_PERMISSION_OR_PAGE_TASK_MISSING" }, "needs_connection");
    return { status: "needs_connection" };
  }
  if (page.status !== "active" || !page.selectedForPublishing || !page.encryptedPageAccessToken) {
    await patchMetadata({ failureCode: "FACEBOOK_PAGE_NOT_READY" }, "needs_connection");
    return { status: "needs_connection" };
  }
  const expiresAt = page.tokenExpiresAt;
  if (expiresAt && expiresAt.getTime() <= Date.now()) {
    await patchMetadata({ failureCode: "FACEBOOK_PAGE_TOKEN_EXPIRED" }, "needs_connection");
    return { status: "needs_connection" };
  }
  const accessToken = decrypt(page.encryptedPageAccessToken);
  const providerPageId = page.providerPageId;
  if (!accessToken || !/^\d+$/.test(providerPageId)) {
    await patchMetadata({ failureCode: "FACEBOOK_PAGE_CREDENTIALS_INVALID" }, "needs_connection");
    return { status: "needs_connection" };
  }
  const scheduledAt = nonemptyString(metadata.scheduledAt);
  const scheduledPublishTime = scheduledAt
    ? Math.floor(new Date(scheduledAt).getTime() / 1000)
    : undefined;
  await patchMetadata({ progress: { stage: "preflight", percent: 5 } }, "preflight");
  let pkg: Awaited<ReturnType<typeof loadAuthoritativePackage>>;
  let inspected: Awaited<ReturnType<typeof stageAndInspectArtifact>>;
  try {
    pkg = await loadAuthoritativePackage({ db, tenantId: input.tenantId, userId: input.userId, runId: input.runId });
    if (pkg.artifact.id !== snapshot.finalVideoArtifactId || pkg.expectedChecksum !== snapshot.artifactChecksum || pkg.renderJob.id !== snapshot.renderWorkerJobId) fail("PUBLISH_SNAPSHOT_ARTIFACT_CHANGED", "The final artifact changed after this publishing intent was created");
    inspected = await stageAndInspectArtifact({ storageRef: pkg.artifact.storageRef, expectedSize: pkg.expectedSize, expectedChecksum: pkg.expectedChecksum });
  } catch (error) {
    await patchMetadata({
      failureCode: error instanceof TRPCError ? error.message.slice(0, 120) : "MEDIA_PREFLIGHT_FAILED",
      reconciliation: { state: "not_started", checkedAt: new Date().toISOString() },
    }, "failed");
    await db.update(socialPosts).set({ status: "failed", errorMessage: "Final video failed the publishing preflight. Auto Review was not changed.", updatedAt: new Date() }).where(eq(socialPosts.id, input.postId));
    throw error;
  }
  let offset = 0;
  let externalVideoId = metaText(metadata.externalVideoId);
  let uploadUrl = metaText(metadata.uploadUrl);
  try {
    await input.reportProgress?.({ progress: 15, stage: "token_check" });
    await patchMetadata({ mediaPreflight: { status: "passed", ...inspected, filePath: undefined, directory: undefined } }, "token_check");
    if (externalVideoId) {
      const external = await getFacebookReelStatus({ pageId: providerPageId, videoId: externalVideoId, accessToken });
      const externalStatus = record(external.status);
      const postId = metaText(external.post_id) ?? metaText(external.id);
      if (scheduledPublishTime && isFacebookReelScheduled(externalStatus)) {
        await patchMetadata({ externalStatus: external, reconciliation: { state: "scheduled", checkedAt: new Date().toISOString() } }, "scheduled");
        await db.update(socialPosts).set({ status: "scheduled", providerPostId: postId, errorMessage: null, updatedAt: new Date() }).where(eq(socialPosts.id, input.postId));
        return { status: "scheduled", providerPostId: postId };
      }
      if (isFacebookReelPublished(externalStatus)) {
        const finishResponse = record(metadata.finishResponse);
        const publishedPostId = metaText(external.post_id) ?? metaText(finishResponse.post_id) ?? postId ?? postRow.post.providerPostId;
        await patchMetadata({
          externalStatus: external,
          publishedAt: new Date().toISOString(),
          permalink: metaText(external.permalink_url) ?? metaText(external.permalink),
          videoPublicationStatus: "published",
          affiliateLinkStatus: snapshot.affiliateMode === "description" ? "included_unverified" : snapshot.affiliateMode === "none" ? "none" : "manual_handoff",
          attributionVerificationStatus: "unverified",
        });
        if (snapshot.affiliateMode === "first_comment") await queueAffiliateCommentForConfirmation({ metadata, affiliateUrl: nonemptyString(snapshot.affiliateUrl), persist: patch => patchMetadata(patch) });
        await db.update(socialPosts).set({ status: "published", providerPostId: publishedPostId, publishedAt: new Date(), errorMessage: null, updatedAt: new Date() }).where(eq(socialPosts.id, input.postId));
        return { status: "published", providerPostId: publishedPostId, permalink: metaText(external.permalink_url) ?? null };
      }
      const uploadPhase = record(externalStatus.uploading_phase);
      const uploadStatus = metaText(uploadPhase.status) ?? metaText(externalStatus.uploading_phase);
      const offsetValue = Number(
        externalStatus.start_offset ?? externalStatus.offset ?? uploadPhase.start_offset ??
        uploadPhase.bytes_transferred ?? uploadPhase.bytes_transfered ?? 0
      );
      if (Number.isSafeInteger(offsetValue) && offsetValue >= 0 && offsetValue < inspected.byteCount) offset = offsetValue;
      if (uploadStatus === "complete" || uploadStatus === "uploaded") offset = inspected.byteCount;
    } else {
      await patchMetadata({ videoPublicationStatus: "token_check", reconciliation: { state: "starting_upload_session" } }, "token_check");
      const session = await startFacebookReelUpload({ pageId: providerPageId, accessToken });
      externalVideoId = metaText(session.video_id);
      uploadUrl = metaText(session.upload_url);
      if (!externalVideoId || !uploadUrl || !/^\d+$/.test(externalVideoId)) {
        await patchMetadata({ reconciliation: { state: "uncertain", reason: "meta_session_response_invalid" } }, "needs_user_action");
        return { status: "needs_user_action" };
      }
      // Persist the Meta session before uploading bytes so worker restarts can
      // resume and uncertain calls are reconciled against the same video ID.
      await patchMetadata({ externalVideoId, uploadUrl, externalSessionStartedAt: new Date().toISOString(), reconciliation: { state: "session_persisted" } }, "uploading");
    }
    if (!externalVideoId || !uploadUrl) {
      // A prior worker may have persisted the video ID but not the upload URL.
      // Status remains authoritative; never create a second session blindly.
      await patchMetadata({ reconciliation: { state: "session_incomplete", checkedAt: new Date().toISOString() } }, "needs_user_action");
      return { status: "needs_user_action" };
    }
    if (offset < inspected.byteCount) {
      await input.reportProgress?.({ progress: 30, stage: "uploading" });
      await patchMetadata({ upload: { offset, totalBytes: inspected.byteCount } }, "uploading");
      const result = await uploadFacebookReelBinary({
        videoId: externalVideoId,
        accessToken,
        uploadUrl,
        fileSize: inspected.byteCount,
        offset,
        body: Readable.toWeb(createReadStream(inspected.filePath)) as ReadableStream<Uint8Array>,
      });
      const uploaded = record(result);
      const accepted = uploaded.success === true || Number(uploaded.start_offset) >= inspected.byteCount || Number(uploaded.offset) >= inspected.byteCount;
      if (!accepted) {
        const status = await getFacebookReelStatus({ pageId: providerPageId, videoId: externalVideoId, accessToken }).catch(() => null);
        const state = record(record(status).status);
        const confirmedOffset = Number(state.start_offset ?? state.offset ?? 0);
        if (!Number.isSafeInteger(confirmedOffset) || confirmedOffset < inspected.byteCount) {
          await patchMetadata({ reconciliation: { state: "upload_uncertain", checkedAt: new Date().toISOString(), confirmedOffset: Number.isFinite(confirmedOffset) ? confirmedOffset : null } }, "needs_user_action");
          return { status: "needs_user_action" };
        }
      }
      await patchMetadata({ upload: { offset: inspected.byteCount, totalBytes: inspected.byteCount, completedAt: new Date().toISOString() } }, "processing");
    }
    await input.reportProgress?.({ progress: 70, stage: "processing" });
    const description = composeFacebookReelsDescription({
      caption: String(snapshot.caption ?? ""),
      hashtags: Array.isArray(snapshot.hashtags) ? snapshot.hashtags.map(String) : [],
      commercialDisclosure: String(snapshot.commercialDisclosure ?? ""),
      affiliateUrl: typeof snapshot.affiliateUrl === "string" ? snapshot.affiliateUrl : null,
    });
    if (metadata.finishRequestedAt) {
      const status = await getFacebookReelStatus({ pageId: providerPageId, videoId: externalVideoId, accessToken });
      const statusResponse = record(status);
      const statusObject = record(statusResponse.status);
      const videoStatus = metaText(statusObject.video_status) ?? "unknown";
      if (scheduledPublishTime && isFacebookReelScheduled(statusObject)) {
        const finishResponse = record(metadata.finishResponse);
        const scheduledPostId = metaText(statusResponse.post_id) ?? metaText(finishResponse.post_id) ?? metaText(statusResponse.id) ?? postRow.post.providerPostId;
        await patchMetadata({ externalStatus: status, reconciliation: { state: "scheduled", checkedAt: new Date().toISOString() } }, "scheduled");
        await db.update(socialPosts).set({ status: "scheduled", providerPostId: scheduledPostId, errorMessage: null, updatedAt: new Date() }).where(eq(socialPosts.id, input.postId));
        return { status: "scheduled", providerPostId: scheduledPostId };
      }
      if (isFacebookReelPublished(statusObject)) {
        const finishResponse = record(metadata.finishResponse);
        const publishedPostId = metaText(finishResponse.post_id) ?? metaText(statusResponse.id) ?? postRow.post.providerPostId;
        await patchMetadata({
          externalStatus: status,
          publishedAt: new Date().toISOString(),
          permalink: metaText(statusResponse.permalink_url) ?? metaText(statusResponse.permalink),
          reconciliation: { state: "published", checkedAt: new Date().toISOString() },
          affiliateLinkStatus: snapshot.affiliateMode === "description" ? "included_unverified" : snapshot.affiliateMode === "none" ? "none" : "manual_handoff",
          attributionVerificationStatus: "unverified",
        }, "published");
        if (snapshot.affiliateMode === "first_comment") await queueAffiliateCommentForConfirmation({ metadata, affiliateUrl: nonemptyString(snapshot.affiliateUrl), persist: patch => patchMetadata(patch) });
        await db.update(socialPosts).set({ status: "published", providerPostId: publishedPostId, publishedAt: new Date(), errorMessage: null, updatedAt: new Date() }).where(eq(socialPosts.id, input.postId));
        return { status: "published", providerPostId: publishedPostId, permalink: metaText(statusResponse.permalink_url) ?? null };
      }
      if (["ready", "processing", "upload_complete"].includes(videoStatus)) {
        await patchMetadata({ externalStatus: status, reconciliation: { state: videoStatus, checkedAt: new Date().toISOString() } }, "processing");
        return { status: "processing" };
      }
      await patchMetadata({ reconciliation: { state: "finish_uncertain", checkedAt: new Date().toISOString() } }, "needs_user_action");
      return { status: "needs_user_action" };
    }
    await patchMetadata({ finishRequestedAt: new Date().toISOString(), reconciliation: { state: "finish_requested" } }, "publish_requested");
    let finishResult: Record<string, unknown>;
    try {
      finishResult = await finishFacebookReelUpload({ pageId: providerPageId, videoId: externalVideoId, accessToken, description, isAiGenerated: Boolean(snapshot.aiGenerated), scheduledPublishTime });
    } catch {
      const status = await getFacebookReelStatus({ pageId: providerPageId, videoId: externalVideoId, accessToken }).catch(() => null);
      await patchMetadata({ externalStatus: status, reconciliation: { state: "finish_uncertain", checkedAt: new Date().toISOString() } }, "reconciling");
      return { status: "reconciling" };
    }
    const responsePostId = metaText(finishResult.post_id) ?? metaText(finishResult.id);
    const externalStatus = await getFacebookReelStatus({ pageId: providerPageId, videoId: externalVideoId, accessToken }).catch(() => null);
    const statusObject = record(externalStatus);
    const videoStatus = metaText(record(statusObject.status).video_status) ?? "processing";
    const published = isFacebookReelPublished(record(statusObject.status));
    const scheduled = Boolean(scheduledPublishTime);
    await patchMetadata({
      finishResponse: finishResult,
      externalStatus,
      permalink: metaText(finishResult.permalink_url) ?? metaText(statusObject.permalink_url),
      reconciliation: { state: published ? "published" : scheduled ? "scheduled" : "processing", checkedAt: new Date().toISOString() },
      ...(published ? { publishedAt: new Date().toISOString(), videoPublicationStatus: "published", affiliateLinkStatus: snapshot.affiliateMode === "description" ? "included_unverified" : snapshot.affiliateMode === "none" ? "none" : snapshot.affiliateMode === "first_comment" ? "pending_first_comment" : "manual_handoff" } : scheduled ? { videoPublicationStatus: "scheduled" } : {}),
      attributionVerificationStatus: "unverified",
    }, published ? "published" : scheduled ? "scheduled" : "processing");
    if (published && snapshot.affiliateMode === "first_comment") await queueAffiliateCommentForConfirmation({ metadata, affiliateUrl: nonemptyString(snapshot.affiliateUrl), persist: patch => patchMetadata(patch) });
    await db.update(socialPosts).set({
      status: published ? "published" : scheduled ? "scheduled" : "draft",
      providerPostId: responsePostId,
      publishedAt: published ? new Date() : null,
      errorMessage: null,
      updatedAt: new Date(),
    }).where(eq(socialPosts.id, input.postId));
    return { status: published ? "published" : scheduled ? "scheduled" : "processing", providerPostId: responsePostId, permalink: metaText(finishResult.permalink_url) };
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    const providerError = error instanceof Error ? error.message : "";
    const connectionIssue = ["META_TOKEN_INVALID", "META_PERMISSION_MISSING"].includes(providerError);
    const terminalStatus: ReelsPublishState = connectionIssue
      ? "needs_connection"
      : externalVideoId ? "needs_user_action" : "failed";
    await patchMetadata({
      failureCode: providerError.slice(0, 120) || "REELS_PUBLISH_FAILED",
      reconciliation: { state: externalVideoId ? "uncertain" : "not_started", checkedAt: new Date().toISOString() },
    }, terminalStatus);
    await db.update(socialPosts).set({
      status: externalVideoId ? "draft" : "failed",
      errorMessage: connectionIssue
        ? "Reconnect the Facebook Page or grant the required Page permission, then check status before continuing."
        : externalVideoId
          ? "Facebook may have received this video. Check its status before resuming to avoid duplicate publication."
          : "Facebook Reels publishing failed before an external video session was created.",
      updatedAt: new Date(),
    }).where(eq(socialPosts.id, input.postId));
    return { status: terminalStatus };
  } finally {
    await rm(inspected.directory, { recursive: true, force: true }).catch(() => undefined);
  }
}
