import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { getDb } from "../db";
import { storageExists, storagePut, storageResolveUrl } from "../storage";
import { getAppRuntimeConfig } from "./appRuntimeConfig";
import { shouldUseCloudTasksForMediaJobs } from "./mediaJobDispatchMode";
import { getRedisClient } from "./redis";
import { computeRenderHash } from "./renderHash";
import { routeVideoJob } from "./videoJobRouter";
import { mediaGenerationService, type MediaTask } from "./mediaGenerationService";
import {
  buildProductionOutputProjectionIdentity,
  buildProductionStableHash,
  getDefaultProductionMetrics,
  type ProductionFlowNode,
  type ProductionGoal,
  type ProductionNodeConfigSnapshot,
  type ProductionNodeOutputRef,
  type ProductionShot,
  type ProductionSpace,
} from "../../shared/mediaProduction";
import { buildVeo31StoryboardVideoPrompt } from "../../shared/storyboardPromptAudio";
import type { VideoEditorProject } from "../../client/src/types/videoEditor";
import {
  libraryItems,
  mediaProductionApprovals,
  mediaProductionGoalVersions,
  mediaProductionOutputProjections,
  mediaProductionPlanVerifications,
  mediaProductionPlanVersions,
  mediaProductionRuns,
  mediaProductionSpaces,
  mediaStudioStoryboardReviews,
  marketplaceAutoReviewRuns,
  marketplaceAutoReviewStages,
  marketplaceCaptureInsights,
  videoEditorProjects,
  type MarketplaceAutoReviewRun,
  type MarketplaceAutoReviewStage,
} from "../../drizzle/schema";
import { createMarketplaceId } from "./marketplaceCaptureService";
import { getMarketplaceProductWithAccess } from "./marketplaceProductService";
import {
  getProductionSpace,
  reconcileProductionExecution,
  saveProductionSpace,
  scheduleProductionExecution,
} from "./productionSpaceService";
import { createLibraryItem, safeEnqueueLibraryIndexJob } from "./libraryService";

export type MarketplaceAutoReviewOutputMode = "storyboard_images" | "full_video";
export type MarketplaceAutoReviewFrameStrategy =
  | "storyboard_3x3_split"
  | "video_shot_start_stop";
export type MarketplaceAutoReviewFrameStrategyInput = "auto" | MarketplaceAutoReviewFrameStrategy;
export type MarketplaceAutoReviewAudioStrategyInput =
  | "auto"
  | "native_video_audio"
  | "separate_tts_voiceover"
  | "silent";
export type MarketplaceAutoReviewResolvedAudioStrategy =
  | "native_video_audio"
  | "separate_tts_voiceover"
  | "silent";
export type MarketplaceAutoReviewStatus =
  | "queued"
  | "running"
  | "waiting_provider"
  | "completed"
  | "failed"
  | "cancelled";

type AuthContext = { userId: number; tenantId?: string };
type RuntimeContext = { userToken?: string | null; publicUrl?: string | null };
type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

const AUTO_REVIEW_SCHEMA_VERSION = "marketplace_auto_review_v1";
const DEFAULT_SHOT_COUNT = 9;
const DEFAULT_DURATION_SECONDS = 45;
const DEFAULT_SHOT_DURATION_SECONDS = 5;
const DEFAULT_IMAGE_MODEL = "google-nano-banana-pro";
const DEFAULT_VIDEO_MODEL = "veo3/generate-veo-3-video-lite";
const RENDER_JOB_TTL_SECONDS = 86_400;
const DEFAULT_RENDER_STALE_TIMEOUT_MS = 12 * 60 * 60 * 1000;

const ACTIVE_RUN_STATUSES: MarketplaceAutoReviewStatus[] = [
  "queued",
  "running",
  "waiting_provider",
];

const BASE_STAGES = [
  "product_preflight",
  "production_project",
  "concept_story",
  "prompt_plan",
  "image_generation",
  "storyboard_review",
] as const;

const FULL_VIDEO_STAGES = [
  ...BASE_STAGES,
  "video_generation",
  "audio_generation",
  "video_edit",
  "render",
  "library_finalize",
] as const;

type StageKey = typeof FULL_VIDEO_STAGES[number];

type ProductAccessBundle = Awaited<ReturnType<typeof getMarketplaceProductWithAccess>>;

type ProductTruth = {
  productId: string;
  productName: string;
  brand: string | null;
  platform: string;
  sourceUrl: string;
  affiliateUrl: string | null;
  shopName: string | null;
  price: string | null;
  rating: string | null;
  sold: string | null;
  reviews: string | null;
  description: string;
  specs: Record<string, unknown>;
  imageUrls: string[];
};

type AutoReviewShot = {
  id: string;
  order: number;
  title: string;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  storyboardGuide: string;
  voiceover: string;
  camera: string;
  visual: string;
  movement: string;
  productRole: string;
};

type AutoReviewPlan = {
  conceptId: string;
  title: string;
  productTruth: ProductTruth;
  storyboardGuide: string;
  voiceoverScript: string;
  productDetail: string;
  shots: AutoReviewShot[];
};

type RunMetadata = Record<string, any> & {
  schemaVersion?: string;
  imageAttemptId?: string;
  videoAttemptId?: string;
  audioMediaTaskId?: string;
  audioProviderTaskId?: string;
  audioUrl?: string;
  audioTaskModel?: string;
  audioActualDurationSeconds?: number;
  audioTargetDurationSeconds?: number;
  storyboardFrameUrls?: string[];
  startFrameUrls?: string[];
  stopFrameUrls?: string[];
  videoClipUrls?: string[];
  libraryFrameItemIds?: number[];
  concept?: AutoReviewPlan;
  audioStrategy?: MarketplaceAutoReviewAudioStrategyInput;
  resolvedAudioStrategy?: MarketplaceAutoReviewResolvedAudioStrategy;
  expectedNativeAudio?: boolean;
  voiceoverSource?: string;
  audioFallbackUsed?: boolean;
  renderJobId?: string;
  renderSubmittedAt?: number;
};

type MarketplaceAutoReviewVideoReferenceMode =
  | "start_stop"
  | "single_storyboard_frame";

function nowDate() {
  return new Date();
}

function nowIso() {
  return new Date().toISOString();
}

function renderStaleTimeoutMs(): number {
  const parsed = Number(process.env.MARKETPLACE_AUTO_REVIEW_RENDER_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed >= 30 * 60 * 1000
    ? parsed
    : DEFAULT_RENDER_STALE_TIMEOUT_MS;
}

function isTimedOutSince(timestamp: unknown, timeoutMs = renderStaleTimeoutMs()): boolean {
  const submittedAt = Number(timestamp);
  return Number.isFinite(submittedAt) && submittedAt > 0 && Date.now() - submittedAt > timeoutMs;
}

function autoTenantId(auth: AuthContext): string {
  const tenantId = auth.tenantId?.trim();
  if (!tenantId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "ต้องเลือก workspace/tenant ก่อนสร้าง Marketplace Auto Review เพื่อให้ Production Project และ Library ตรวจย้อนกลับได้ถูกต้อง",
    });
  }
  return tenantId;
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function compactRecord<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => {
      if (item == null || item === "") return false;
      if (Array.isArray(item)) return item.length > 0;
      if (typeof item === "object") return Object.keys(item as Record<string, unknown>).length > 0;
      return true;
    }),
  ) as T;
}

function resolveFrameStrategy(
  outputMode: MarketplaceAutoReviewOutputMode,
  requested?: MarketplaceAutoReviewFrameStrategyInput,
): MarketplaceAutoReviewFrameStrategy {
  if (requested === "storyboard_3x3_split" || requested === "video_shot_start_stop") {
    return requested;
  }
  return outputMode === "full_video" ? "video_shot_start_stop" : "storyboard_3x3_split";
}

function isVeo31NativeAudioModel(modelId?: string | null): boolean {
  const value = cleanText(modelId ?? DEFAULT_VIDEO_MODEL).toLowerCase();
  return /veo\s*3(?:\.1)?|veo3|veo-3|generate-veo-3/.test(value);
}

export function resolveMarketplaceAutoReviewAudioStrategy(input: {
  outputMode: MarketplaceAutoReviewOutputMode;
  requested?: MarketplaceAutoReviewAudioStrategyInput | null;
  videoModel?: string | null;
}): MarketplaceAutoReviewResolvedAudioStrategy {
  if (input.outputMode !== "full_video") return "silent";
  if (input.requested === "native_video_audio") return "native_video_audio";
  if (input.requested === "separate_tts_voiceover") return "separate_tts_voiceover";
  if (input.requested === "silent") return "silent";
  return isVeo31NativeAudioModel(input.videoModel) ? "native_video_audio" : "separate_tts_voiceover";
}

function nativeSpeechTargetSeconds(durationSeconds: number, isLastShot: boolean): number {
  const duration = Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : DEFAULT_SHOT_DURATION_SECONDS;
  if (isLastShot) return Math.round(duration * 2) / 2;
  const extra = duration <= 8 ? 1.5 : duration <= 12 ? 1 : 0;
  return Math.round((duration + extra) * 2) / 2;
}

function estimateThaiSpeechSeconds(text: string): number {
  const compact = cleanText(text).replace(/\s+/g, "");
  if (!compact) return 0;
  return compact.length / 13;
}

export function buildMarketplaceAutoReviewNativeSpeechText(input: {
  plan: { productTruth: { productName: string } };
  shot: { voiceover: string; durationSeconds: number; title?: string };
  isLastShot?: boolean;
}): string {
  const base = cleanText(input.shot.voiceover);
  if (!base) return "";
  if (input.isLastShot) return base;
  const targetSeconds = nativeSpeechTargetSeconds(input.shot.durationSeconds, false);
  if (estimateThaiSpeechSeconds(base) >= targetSeconds * 0.9) return base;

  const productName = input.plan.productTruth.productName;
  const extensions = [
    `โดยดูจากภาพจริงและรายละเอียดของ ${productName} ในช็อตนี้เป็นหลัก`,
    "ให้จังหวะการพูดต่อเนื่องพอดีกับภาพ ไม่ปล่อยท้ายช็อตเงียบ",
  ];
  let expanded = base;
  for (const extension of extensions) {
    expanded = `${expanded} ${extension}`;
    if (estimateThaiSpeechSeconds(expanded) >= targetSeconds * 0.9) break;
  }
  return expanded;
}

function stageKeysForMode(outputMode: MarketplaceAutoReviewOutputMode): StageKey[] {
  return outputMode === "full_video" ? [...FULL_VIDEO_STAGES] : [...BASE_STAGES];
}

function stageIndex(stageKey: string, stages: readonly string[]): number {
  const index = stages.indexOf(stageKey);
  return index < 0 ? 0 : index + 1;
}

function taskUrlFromOutputRef(ref: ProductionNodeOutputRef | undefined): string {
  return cleanText(ref?.url ?? ref?.thumbnailUrl);
}

function outputRefUrl(node: ProductionFlowNode | undefined): string {
  if (!node) return "";
  const refs = node.outputRefs ?? [];
  for (let index = refs.length - 1; index >= 0; index -= 1) {
    const url = taskUrlFromOutputRef(refs[index]);
    if (url) return url;
  }
  return "";
}

function productionNodeOutputTaskIds(nodes: ProductionFlowNode[], ids: string[]) {
  const idSet = new Set(ids);
  return nodes
    .filter((node) => idSet.has(node.id))
    .flatMap((node) => node.outputRefs ?? [])
    .map((ref) => cleanText(ref.mediaTaskId))
    .filter(Boolean);
}

export function assertCompleteMarketplaceAutoReviewVideoClips(input: {
  clipUrls: string[];
  expectedCount: number;
  nodeIds?: string[];
}) {
  const missing = Array.from({ length: input.expectedCount }, (_item, index) => index)
    .filter((index) => !cleanText(input.clipUrls[index]))
    .map((index) => input.nodeIds?.[index] ?? `shot-${index + 1}`);
  if (input.clipUrls.length !== input.expectedCount || missing.length > 0) {
    throw new Error(
      `Completed video generation is incomplete: expected ${input.expectedCount} clips, got ${input.clipUrls.length}${missing.length ? `; missing ${missing.join(", ")}` : ""}`,
    );
  }
}

function productPriceText(product: any): string | null {
  const price = cleanText(product.priceCurrent);
  if (!price) return null;
  return `${price} ${cleanText(product.currency) || "THB"}`;
}

function buildProductTruth(bundle: ProductAccessBundle): ProductTruth {
  const product = bundle.product as any;
  const imageUrls = (bundle.images ?? [])
    .map((image: any) => cleanText(image.url))
    .filter(Boolean)
    .slice(0, 8);
  return {
    productId: product.id,
    productName: cleanText(product.productName) || "สินค้า",
    brand: cleanText(product.brand) || null,
    platform: cleanText(product.platform) || "marketplace",
    sourceUrl: cleanText(product.sourceUrl),
    affiliateUrl: cleanText(product.affiliateUrl) || null,
    shopName: cleanText(product.shopName) || null,
    price: productPriceText(product),
    rating: cleanText(product.ratingScore) || null,
    sold: cleanText(product.soldCountText) || (product.soldCountNormalized ? String(product.soldCountNormalized) : null),
    reviews: cleanText(product.reviewCountText) || null,
    description: cleanText(product.descriptionText),
    specs: asRecord(product.specsJson),
    imageUrls,
  };
}

async function loadSupportingInsights(db: Db, bundle: ProductAccessBundle, auth: AuthContext) {
  const product = bundle.product as any;
  const captureId = cleanText(product.captureId);
  const rows = await db
    .select({
      id: marketplaceCaptureInsights.id,
      insightType: marketplaceCaptureInsights.insightType,
      payloadJson: marketplaceCaptureInsights.payloadJson,
      createdAt: marketplaceCaptureInsights.createdAt,
    })
    .from(marketplaceCaptureInsights)
    .where(and(
      auth.tenantId
        ? eq(marketplaceCaptureInsights.tenantId, auth.tenantId)
        : eq(marketplaceCaptureInsights.userId, auth.userId),
      sql`(${marketplaceCaptureInsights.productId} = ${product.id}${captureId ? sql` OR ${marketplaceCaptureInsights.captureId} = ${captureId}` : sql``})`,
    ))
    .orderBy(desc(marketplaceCaptureInsights.createdAt))
    .limit(12);
  return rows;
}

function buildProductDetailText(productTruth: ProductTruth): string {
  const specs = Object.entries(productTruth.specs)
    .slice(0, 12)
    .map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join("; ");
  return [
    `PRODUCT FACTS LOCK: ${productTruth.productName}.`,
    productTruth.brand ? `Brand: ${productTruth.brand}.` : "",
    productTruth.price ? `Price signal: ${productTruth.price}.` : "",
    productTruth.rating ? `Rating signal: ${productTruth.rating}.` : "",
    productTruth.sold ? `Sold signal: ${productTruth.sold}.` : "",
    productTruth.shopName ? `Shop: ${productTruth.shopName}.` : "",
    specs ? `Specs: ${specs}.` : "",
    productTruth.description ? `Description: ${productTruth.description.slice(0, 1200)}.` : "",
    "Do not alter the product category, shape, proportions, material, visible construction, label/logo placement, or real-world usage beyond what the product references and facts support.",
  ].filter(Boolean).join(" ");
}

function buildAutoReviewPlan(bundle: ProductAccessBundle, insightRows: Awaited<ReturnType<typeof loadSupportingInsights>>): AutoReviewPlan {
  const productTruth = buildProductTruth(bundle);
  const productLabel = productTruth.productName;
  const audienceHint = insightRows
    .flatMap((row) => {
      const payload = asRecord(row.payloadJson);
      const summary = asRecord(payload.summary);
      return [
        ...(Array.isArray(summary.audiences) ? summary.audiences : []),
        ...(Array.isArray(payload.targetAudiences) ? payload.targetAudiences : []),
      ];
    })
    .map((item) => cleanText(item))
    .filter(Boolean)[0] || "คนที่กำลังตัดสินใจซื้อจาก marketplace";
  const painHint = insightRows
    .flatMap((row) => {
      const payload = asRecord(row.payloadJson);
      const summary = asRecord(payload.summary);
      return [
        ...(Array.isArray(summary.painPoints) ? summary.painPoints : []),
        ...(Array.isArray(payload.buyerPainPoints) ? payload.buyerPainPoints : []),
      ];
    })
    .map((item) => cleanText(item))
    .filter(Boolean)[0] || "อยากเห็นภาพใช้งานจริงก่อนตัดสินใจ";

  const shotTemplates = [
    ["เปิดปัญหา", `เปิดด้วยสถานการณ์จริงของ ${audienceHint} ที่กำลังเจอเรื่อง ${painHint}`, "wide-to-medium push in", "บรรยากาศก่อนใช้สินค้า เห็นบริบทชีวิตจริง", "slow push-in", "product not forced yet, only context"],
    ["ขยาย pain point", "เน้นจุดลังเลหรือความไม่สะดวกในชีวิตจริงก่อนมีสินค้า", "handheld medium close", "รายละเอียดปัญหาแบบจับต้องได้ ไม่ขายเร็ว", "subtle handheld pan", "show problem props that relate to product category"],
    ["สินค้าเข้ามาแก้", `นำ ${productLabel} เข้าฉากอย่างเป็นธรรมชาติ ให้เห็นขนาดและสัดส่วนกับพื้นที่`, "medium product reveal", "สินค้าเป็นพระเอกแต่ยังอยู่ในบริบทจริง", "gentle reveal", "product visible and locked to reference"],
    ["หลักฐานจากภาพ", "โชว์รายละเอียดที่มองเห็นจริงจากภาพอ้างอิงและข้อมูลสินค้า", "cinematic close-up", "วัสดุ รูปทรง ส่วนประกอบ และงานประกอบตรงสินค้า", "slow detail move", "strict product evidence"],
    ["ใช้งานจริง", "แสดงการใช้งานหลักทีละขั้นอย่างเข้าใจทันที", "POV or over-shoulder", "มือหรือผู้ใช้ใช้งานจริง โดยใบหน้าต้องเห็นถ้ามีคนในช็อต", "short action beat", "product function visible"],
    ["ผลลัพธ์", "ถอยภาพให้เห็นก่อน/หลังและผลลัพธ์ของการมีสินค้าในพื้นที่", "wide result shot", "ภาพรวมชัดขึ้นและดูใช้งานได้จริง", "slow pull back", "product remains same design"],
    ["กันคาดหวังเกินจริง", "ให้เห็นรายละเอียดจริงเพื่อให้ผู้ชมเทียบกับพื้นที่/ความต้องการของตนเอง", "steady inspection shot", "ภาพนิ่งพอให้ตรวจรายละเอียด ไม่มีเคลมเกินจริง", "locked-off or very slow move", "scale and details honest"],
    ["ยืนยันภาพรวม", `กลับมาที่ภาพรวมว่า ${productLabel} ช่วยสถานการณ์หลักได้อย่างไร`, "medium-wide continuity shot", "ภาพเชื่อมรายละเอียดกับผลลัพธ์", "smooth reconnect move", "same product, same environment"],
    ["CTA", "ปิดด้วย hero shot สะอาด ชวนเช็กว่าสินค้าตรงกับชีวิตผู้ชมไหม", "clean cinematic hero", "สินค้าเด่น มีพื้นที่หายใจ ไม่มีข้อความล้นจอ", "soft hero hold", "reference-locked product"],
  ] as const;

  const shots: AutoReviewShot[] = shotTemplates.map((template, index) => {
    const order = index + 1;
    const startSeconds = index * DEFAULT_SHOT_DURATION_SECONDS;
    const endSeconds = startSeconds + DEFAULT_SHOT_DURATION_SECONDS;
    const voiceoverByShot = [
      `เคยไหม เวลาจะเลือกซื้อของสักชิ้น เราอยากเห็นก่อนว่ามันช่วยแก้ปัญหาในชีวิตจริงได้แค่ไหน โดยเฉพาะ ${productLabel}`,
      `ปัญหานี้อาจดูเล็ก แต่ถ้าเจอบ่อย ๆ มันทำให้การตัดสินใจซื้อไม่มั่นใจ เพราะรูปสินค้าอย่างเดียวอาจยังไม่พอ`,
      `พอเอา ${productLabel} เข้ามาในสถานการณ์จริง ภาพที่ควรเห็นคือมันเข้ามาเปลี่ยนบริบทตรงไหน และเหมาะกับพื้นที่แบบใด`,
      `ช็อตนี้ให้ดูใกล้ขึ้น เน้นรายละเอียดที่เห็นจากตัวสินค้าจริง ไม่ต้องพูดเกินภาพ ให้ภาพช่วยพิสูจน์วัสดุ รูปทรง และสัดส่วน`,
      `จากนั้นโชว์การใช้งานจริงแบบเข้าใจทันที ว่าสินค้านี้ถูกหยิบ ใช้ วาง หรือจัดการอย่างไรในชีวิตประจำวัน`,
      `ผลลัพธ์ที่อยากให้รู้สึกคือมุมนี้ดูใช้งานได้ง่ายขึ้นและเข้าใจสินค้าได้ชัดกว่าเดิม ก่อนจะตัดสินใจต่อ`,
      `ถ้ายังกังวลอยู่ ให้เทียบขนาด รายละเอียด และพื้นที่ของตัวเองก่อนเสมอ เพื่อไม่คาดหวังเกินสิ่งที่สินค้าแสดงไว้จริง`,
      `แล้วค่อยกลับมาดูภาพรวมอีกทีว่า ${productLabel} ตอบโจทย์ปัญหาหลักได้แค่ไหนจากภาพใช้งานทั้งหมด`,
      `ถ้าปัญหานี้คือสิ่งที่เจออยู่ ${productLabel} ก็น่าเก็บไว้เป็นตัวเลือก แล้วเช็กต่อว่าสเปกและราคาตรงกับที่ต้องการไหม`,
    ][index];
    return {
      id: `shot-${order}`,
      order,
      title: template[0],
      startSeconds,
      endSeconds,
      durationSeconds: DEFAULT_SHOT_DURATION_SECONDS,
      storyboardGuide: `${order}. ${startSeconds}-${endSeconds}s ${template[0]}: ${template[1]} / มุมกล้อง: ${template[2]} / ภาพ: ${template[3]}`,
      voiceover: voiceoverByShot,
      camera: template[2],
      visual: template[3],
      movement: template[4],
      productRole: template[5],
    };
  });
  const storyboardGuide = [
    `แกนเรื่อง: รีวิวสินค้า ${productLabel} แบบใช้งานจริง เริ่มจากปัญหา/ความลังเลของผู้ชม แล้วนำสินค้าเข้ามาให้เห็นบริบท รายละเอียด หลักฐานจากภาพ การใช้งาน ผลลัพธ์ และ CTA อย่างซื่อสัตย์`,
    `แนวคิดวิดีโอแบบ Shot-by-shot: ${shots.length} shot / ${DEFAULT_DURATION_SECONDS} วินาที`,
    ...shots.map((shot) => shot.storyboardGuide),
  ].join("\n");
  const voiceoverScript = [
    "VOICEOVER SCRIPT BY SHOT:",
    ...shots.map((shot) => `${shot.order}. ${shot.startSeconds}-${shot.endSeconds}s ${shot.title}: ${shot.voiceover}`),
    "Use these spoken lines as the narration contract for the matching shots. Do not invent a different spoken story.",
  ].join("\n");
  return {
    conceptId: `marketplace-auto-${productTruth.productId}-concept-1`,
    title: `รีวิวอัตโนมัติ: ${productLabel}`,
    productTruth,
    storyboardGuide,
    voiceoverScript,
    productDetail: buildProductDetailText(productTruth),
    shots,
  };
}

function buildReferenceInputs(plan: AutoReviewPlan) {
  return plan.productTruth.imageUrls.map((url, index) => ({
    id: `product-ref-${index + 1}`,
    kind: "product_image" as const,
    title: `Product reference ${index + 1}`,
    label: `Product reference ${index + 1}`,
    url,
    source: "marketplace_capture",
    role: index === 0 ? "hero_product_reference" : "supporting_product_reference",
    zone: "products" as const,
    locked: true,
    approvalState: "approved" as const,
    metadata: {
      productId: plan.productTruth.productId,
      marketplaceProductId: plan.productTruth.productId,
      source: "marketplace_capture_product_image",
    },
  }));
}

function buildProductEvidenceManifest(plan: AutoReviewPlan): ProductionSpace["productEvidenceManifest"] {
  return {
    manifestId: `marketplace-auto-review:${plan.productTruth.productId}`,
    status: plan.productTruth.imageUrls.length ? "ready" : "warning",
    warnings: plan.productTruth.imageUrls.length
      ? []
      : ["No marketplace product reference image is attached. Prompts will use product facts only and require human review."],
    requiredClaimIds: [],
    products: [{
      id: `product:${plan.productTruth.productId}`,
      productId: plan.productTruth.productId,
      title: plan.productTruth.productName,
      role: "hero",
      imageUrl: plan.productTruth.imageUrls[0],
      frameStrategy: "image_reference",
      requiredVisualAccuracy: "strict",
      claimEvidence: [],
      productTruth: compactRecord({
        ...plan.productTruth,
        immutableReferenceRule: "Do not add, remove, reshape, recolor, relabel, stylize, or change product material beyond the attached product reference images and product facts.",
      }),
      provenance: {
        source: "marketplace_capture",
        productId: plan.productTruth.productId,
        sourceUrl: plan.productTruth.sourceUrl,
      },
    }],
  } as ProductionSpace["productEvidenceManifest"];
}

function hashConfig(config: Record<string, unknown>): string {
  return buildProductionStableHash(config);
}

function configSnapshot(input: {
  nodeId: string;
  version?: number;
  toolSurface: ProductionNodeConfigSnapshot["toolSurface"];
  adapter: ProductionNodeConfigSnapshot["adapter"];
  config: Record<string, unknown>;
}): ProductionNodeConfigSnapshot {
  const now = nowIso();
  return {
    snapshotId: `${input.nodeId}:auto-review:${input.version ?? 1}`,
    version: input.version ?? 1,
    toolSurface: input.toolSurface,
    adapter: input.adapter,
    config: input.config,
    configHash: hashConfig(input.config),
    manuallyEdited: false,
    createdAt: now,
    updatedAt: now,
  };
}

function promptReferenceSection(plan: AutoReviewPlan): string {
  return [
    "STORYBOARD GUIDE CONTRACT:",
    plan.storyboardGuide,
    "",
    "VOICEOVER / DIALOGUE CONTRACT:",
    plan.voiceoverScript,
    "",
    "PRODUCT DETAIL / PRODUCT FACTS LOCK:",
    plan.productDetail,
    "",
    "GLOBAL VISUAL QUALITY LOCK:",
    "Photorealistic cinematic commercial film stills, natural skin texture, believable human anatomy, real lens depth, grounded shadows, warm but realistic lighting, coherent camera language, no plastic skin, no waxy faces, no catalog-rendered flat product.",
    "If a person appears, keep the face clearly visible unless the shot explicitly says the person will never turn back in video. Maintain the same identity, hair, age, face shape, outfit continuity, and natural expression across shots.",
    "The product must match the attached reference images exactly. Do not add drawers, panels, handles, extra shelves, extra logos, alternate materials, alternate colors, or changed proportions.",
  ].join("\n");
}

function build3x3StoryboardPrompt(plan: AutoReviewPlan): string {
  const frameLines = plan.shots.map((shot) => [
    `Frame ${shot.order} (${shot.startSeconds}-${shot.endSeconds}s) - ${shot.title}`,
    `Visual: ${shot.visual}`,
    `Camera: ${shot.camera}; movement: ${shot.movement}`,
    `Narration contract: ${shot.voiceover}`,
    `Product role: ${shot.productRole}`,
  ].join("\n")).join("\n\n");
  return [
    "OUTPUT FORMAT LOCK: Plain prompt text only. Generate one 9:16 final canvas containing a 3x3 storyboard grid with exactly 9 equal vertical frames, no text, no labels, no gutters beyond thin clean dividers.",
    promptReferenceSection(plan),
    "",
    "SHOT-BY-SHOT STORYBOARD PROMPT:",
    frameLines,
    "",
    "Continuity: every frame must look like the same commercial film, same product, same environment family, same character identity if visible. Do not let a frame drift into a different story than the corresponding narration.",
  ].join("\n");
}

function buildShotFramePrompt(plan: AutoReviewPlan, shot: AutoReviewShot, role: "start" | "stop"): string {
  const roleText = role === "start"
    ? "START FRAME: establish the opening visual state for this shot before motion begins."
    : "STOP FRAME: establish the natural end visual state after this shot's motion, consistent with the start frame and next shot.";
  return [
    "OUTPUT FORMAT LOCK: Plain prompt text only. Single 9:16 photorealistic cinematic frame. No text, captions, labels, watermarks, UI, price badges, or overlaid graphics.",
    promptReferenceSection(plan),
    "",
    roleText,
    `Shot ${shot.order}: ${shot.title}`,
    `Storyboard guide for this shot: ${shot.storyboardGuide}`,
    `Voiceover/dialogue for this shot: ${shot.voiceover}`,
    `Camera and light: ${shot.camera}; ${shot.movement}; realistic cinematic light with dimensional shadows.`,
    `Visual content: ${shot.visual}`,
    `Product continuity: ${shot.productRole}; product must remain exact to reference images and product facts.`,
    "Human continuity: if a person appears, show the face clearly and naturally, same identity across the set, not back-facing unless this exact generated video shot will never rotate to reveal a face.",
  ].join("\n");
}

function buildVideoVisualPrompt(plan: AutoReviewPlan, shot: AutoReviewShot): string {
  return [
    `Shot ${shot.order}: ${shot.title}`,
    `Storyboard guide: ${shot.storyboardGuide}`,
    `Voiceover/story beat to match: ${shot.voiceover}`,
    `Camera movement: ${shot.movement}; camera language: ${shot.camera}.`,
    `Visual action: ${shot.visual}.`,
    `Product lock: ${plan.productDetail}`,
    "Use the attached visual references exactly as defined by the reference contract below. Preserve character identity, face, outfit, lighting, environment, and exact product geometry/material. No new product parts, no changed material, no changed shelf/drawer/panel count, no text overlays.",
  ].join("\n");
}

function videoReferenceContract(mode: MarketplaceAutoReviewVideoReferenceMode): string {
  if (mode === "single_storyboard_frame") {
    return [
      "Reference contract: @Image1 is the single storyboard frame for this shot and the only visual timing anchor.",
      "Any remaining attached images are immutable product references only, not alternate frames and not a stop/end frame.",
      "Animate subtly from the storyboard frame while preserving its composition, product fidelity, character identity, lighting, and environment.",
    ].join(" ");
  }
  return [
    "Reference contract: use @Image1 as the strict start frame and @Image2 as the strict stop/end frame.",
    "Any remaining attached images are immutable product references only.",
    "Preserve endpoint continuity and do not treat product references as extra motion frames.",
  ].join(" ");
}

export function buildMarketplaceAutoReviewVideoPromptForTest(input: {
  plan: AutoReviewPlan;
  shot: AutoReviewShot;
  audioStrategy?: MarketplaceAutoReviewResolvedAudioStrategy;
  isLastShot?: boolean;
  referenceMode?: MarketplaceAutoReviewVideoReferenceMode;
}): string {
  return buildVideoPrompt(input.plan, input.shot, {
    audioStrategy: input.audioStrategy,
    isLastShot: input.isLastShot,
    referenceMode: input.referenceMode,
  });
}

function buildVideoPrompt(
  plan: AutoReviewPlan,
  shot: AutoReviewShot,
  options: {
    audioStrategy?: MarketplaceAutoReviewResolvedAudioStrategy;
    isLastShot?: boolean;
    referenceMode?: MarketplaceAutoReviewVideoReferenceMode;
  } = {},
): string {
  const audioStrategy = options.audioStrategy ?? "native_video_audio";
  const referenceMode = options.referenceMode ?? "start_stop";
  const frameRoles = referenceMode === "single_storyboard_frame"
    ? ["single_storyboard"]
    : ["start", "stop"];
  const visualPrompt = [
    buildVideoVisualPrompt(plan, shot),
    videoReferenceContract(referenceMode),
  ].join("\n");
  if (audioStrategy === "native_video_audio") {
    const timedSpeech = buildMarketplaceAutoReviewNativeSpeechText({
      plan,
      shot,
      isLastShot: Boolean(options.isLastShot),
    });
    return buildVeo31StoryboardVideoPrompt({
      visualPrompt,
      durationSeconds: shot.durationSeconds,
      aspectRatio: "9:16",
      frameRoles,
      conceptDetails: plan.productDetail,
      storyboardGuide: shot.storyboardGuide,
      includeVoiceover: true,
      speechMode: "th",
      speechLanguage: "thai",
      voiceoverScript: timedSpeech,
      includeSound: false,
    });
  }

  const noAudioPrompt = [
    visualPrompt,
    audioStrategy === "separate_tts_voiceover"
      ? "External audio workflow: create visual-only footage. Do not generate speech, dialogue, narration, lip-sync audio, background music, sound effects, ambient audio, subtitles, captions, lower-thirds, readable text, logos with letters, or random glyphs. The final Thai voiceover will be added later in the video editor."
      : "Silent video workflow: do not generate speech, dialogue, narration, music, sound effects, ambient audio, subtitles, captions, lower-thirds, readable text, logos with letters, or random glyphs.",
  ].join("\n");
  return buildVeo31StoryboardVideoPrompt({
    visualPrompt: noAudioPrompt,
    durationSeconds: shot.durationSeconds,
    aspectRatio: "9:16",
    frameRoles,
    conceptDetails: plan.productDetail,
    storyboardGuide: shot.storyboardGuide,
    includeVoiceover: false,
    speechMode: "none",
    speechLanguage: "thai",
    includeSound: false,
  });
}

function buildImageNode(plan: AutoReviewPlan, nodeId: string, title: string, prompt: string, shotId?: string): ProductionFlowNode {
  const config = {
    prompt,
    model: DEFAULT_IMAGE_MODEL,
    aspectRatio: "9:16",
    resolution: "2K",
    outputFormat: "png",
    numImages: 1,
    referenceImageUrls: plan.productTruth.imageUrls.slice(0, 5),
    extraParams: {
      __marketplace_product_id: plan.productTruth.productId,
      __marketplace_product_name: plan.productTruth.productName,
      __auto_review_concept_id: plan.conceptId,
      productId: plan.productTruth.productId,
      marketplaceProductId: plan.productTruth.productId,
      conceptId: plan.conceptId,
    },
  };
  return {
    id: nodeId,
    kind: "image_generate",
    title,
    status: "ready",
    shotId,
    configSnapshot: configSnapshot({ nodeId, toolSurface: "image", adapter: "image", config }),
    referenceInputs: buildReferenceInputs(plan),
    outputRefs: [],
    estimatedCredits: 15,
    metadata: {
      source: "marketplace_auto_review",
      marketplaceProductId: plan.productTruth.productId,
      conceptId: plan.conceptId,
    },
  };
}

function buildVideoNode(
  plan: AutoReviewPlan,
  shot: AutoReviewShot,
  referenceImageUrls: string[],
  options: {
    audioStrategy?: MarketplaceAutoReviewResolvedAudioStrategy;
    isLastShot?: boolean;
    referenceMode?: MarketplaceAutoReviewVideoReferenceMode;
  } = {},
): ProductionFlowNode {
  const nodeId = `${shot.id}-video`;
  const audioStrategy = options.audioStrategy ?? "native_video_audio";
  const nativeSpeechText = audioStrategy === "native_video_audio"
    ? buildMarketplaceAutoReviewNativeSpeechText({ plan, shot, isLastShot: Boolean(options.isLastShot) })
    : "";
  const config = {
    prompt: buildVideoPrompt(plan, shot, {
      audioStrategy,
      isLastShot: Boolean(options.isLastShot),
      referenceMode: options.referenceMode,
    }),
    model: DEFAULT_VIDEO_MODEL,
    aspectRatio: "9:16",
    duration: shot.durationSeconds,
    fps: 24,
    referenceImageUrls: referenceImageUrls.filter(Boolean).slice(0, 5),
    extraParams: {
      __marketplace_product_id: plan.productTruth.productId,
      __marketplace_product_name: plan.productTruth.productName,
      __auto_review_concept_id: plan.conceptId,
      __auto_review_shot_id: shot.id,
      productId: plan.productTruth.productId,
      marketplaceProductId: plan.productTruth.productId,
      conceptId: plan.conceptId,
      shotId: shot.id,
      voiceover: shot.voiceover,
      audioStrategy,
      expectedNativeAudio: audioStrategy === "native_video_audio",
      referenceMode: options.referenceMode ?? "start_stop",
      nativeSpeechText,
      nativeSpeechTargetSeconds: audioStrategy === "native_video_audio"
        ? nativeSpeechTargetSeconds(shot.durationSeconds, Boolean(options.isLastShot))
        : 0,
    },
  };
  return {
    id: nodeId,
    kind: "video_generate",
    title: `${shot.order}. ${shot.title} - video`,
    status: "ready",
    shotId: shot.id,
    configSnapshot: configSnapshot({ nodeId, toolSurface: "video", adapter: "video", config }),
    referenceInputs: buildReferenceInputs(plan),
    outputRefs: [],
    estimatedCredits: 45,
    metadata: {
      source: "marketplace_auto_review",
      marketplaceProductId: plan.productTruth.productId,
      conceptId: plan.conceptId,
      shotId: shot.id,
      audioStrategy,
      expectedNativeAudio: audioStrategy === "native_video_audio",
      referenceMode: options.referenceMode ?? "start_stop",
    },
  };
}

function buildInitialProductionSpace(input: {
  productionRunId: string;
  plan: AutoReviewPlan;
  outputMode: MarketplaceAutoReviewOutputMode;
  frameStrategy: MarketplaceAutoReviewFrameStrategy;
  audioStrategy: MarketplaceAutoReviewAudioStrategyInput;
  resolvedAudioStrategy: MarketplaceAutoReviewResolvedAudioStrategy;
  userId: number;
}): ProductionSpace {
  const imageNodes: ProductionFlowNode[] = input.frameStrategy === "storyboard_3x3_split"
    ? [buildImageNode(input.plan, "storyboard-grid-image", "3x3 storyboard image", build3x3StoryboardPrompt(input.plan))]
    : input.plan.shots.flatMap((shot) => [
      buildImageNode(input.plan, `${shot.id}-start`, `${shot.order}. ${shot.title} - start frame`, buildShotFramePrompt(input.plan, shot, "start"), shot.id),
      buildImageNode(input.plan, `${shot.id}-stop`, `${shot.order}. ${shot.title} - stop frame`, buildShotFramePrompt(input.plan, shot, "stop"), shot.id),
    ]);

  const shots: ProductionShot[] = input.plan.shots.map((shot) => ({
    id: shot.id,
    title: `${shot.order}. ${shot.title}`,
    order: shot.order,
    durationSeconds: shot.durationSeconds,
    shotType: shot.order === 1 ? "hook" : shot.order === input.plan.shots.length ? "cta" : shot.order <= 3 ? "problem" : shot.order <= 5 ? "demo" : "proof",
    cameraIntent: shot.camera,
    customerJourneyStage: shot.title,
    mustShow: [shot.visual, "สินค้าเหมือนภาพอ้างอิงจริง"],
    mustAvoid: ["สินค้าเปลี่ยนรูปร่างหรือวัสดุ", "บุคคลหันหลังแล้วไปสร้างคนละคน", "ภาพไม่ตรงบทพูด"],
    script: shot.voiceover,
    visualIntent: shot.visual,
    audioIntent: shot.voiceover,
    productAssetIds: [`product:${input.plan.productTruth.productId}`],
    nodeIds: imageNodes.filter((node) => node.shotId === shot.id).map((node) => node.id),
    status: "ready",
  }));
  if (input.frameStrategy === "storyboard_3x3_split") {
    for (const shot of shots) {
      shot.nodeIds = ["storyboard-grid-image"];
    }
  }

  const brief: ProductionGoal = {
    summary: input.plan.storyboardGuide,
    targetSurfaces: input.outputMode === "full_video" ? ["storyboard_review", "video_edit"] : ["storyboard_review"],
    audience: "marketplace product review viewer",
    platform: "TikTok",
    language: "th",
    durationSeconds: DEFAULT_DURATION_SECONDS,
    aspectRatio: "9:16",
    productTruth: input.plan.productDetail,
    creativeDirection: "cinematic realistic product review with strict product and shot continuity",
    constraintsText: [
      "Storyboard Guide and Voiceover Script are the shot contract.",
      "Product reference images and Product Detail are immutable.",
      "Faces must stay visible when characters appear unless explicitly locked as never turning back.",
      input.resolvedAudioStrategy === "native_video_audio"
        ? "Veo native audio must speak the shot dialogue long enough to fill each clip; non-final shots slightly over-target speech duration to avoid silent tails."
        : input.resolvedAudioStrategy === "separate_tts_voiceover"
          ? "Video generation must be visual-only; voiceover is generated separately and added on audio track A1."
          : "Video generation is silent unless the user later adds audio.",
    ].join("\n"),
    constraints: {
      storyboardVoiceoverContract: true,
      strictProductReferenceLock: true,
      visibleFaceContinuity: true,
      audioStrategy: input.audioStrategy,
      resolvedAudioStrategy: input.resolvedAudioStrategy,
    },
  } as unknown as ProductionGoal;

  return {
    schemaVersion: "1.0.0",
    productionRunId: input.productionRunId,
    version: 1,
    status: "final_preflight_passed",
    brief,
    shots,
    flowNodes: imageNodes.map((node, index) => ({
      ...node,
      position: { x: 80 + (index % 3) * 280, y: 120 + Math.floor(index / 3) * 170 },
    })),
    flowEdges: [],
    contextAssets: buildReferenceInputs(input.plan),
    productEvidenceManifest: buildProductEvidenceManifest(input.plan),
    shotProductUsage: input.plan.shots.map((shot) => ({
      shotId: shot.id,
      productStoryboardAssetIds: [`product:${input.plan.productTruth.productId}`],
      claimIds: [],
      evidenceIds: [],
      customerJourneyStage: shot.title,
      frameStrategy: "image_reference",
      requiredVisualAccuracy: "strict",
      mustShow: [shot.visual, "สินค้าเหมือนภาพอ้างอิง"],
      mustAvoid: ["ห้ามเพิ่ม/ลด/เปลี่ยนชิ้นส่วนสินค้า", "ห้ามเปลี่ยนวัสดุ/สี/รูปทรงสินค้า"],
      qaStatus: "pending",
    })),
    layerVersions: {
      spaceVersion: 1,
      briefVersion: 1,
      canvasLayoutVersion: 1,
      planVersion: 1,
      verifierVersion: 1,
      approvalVersion: 1,
      shotVersions: Object.fromEntries(shots.map((shot) => [shot.id, 1])),
      nodeVersions: Object.fromEntries(imageNodes.map((node) => [node.id, 1])),
    },
    approvalState: {
      status: "approved",
      approvalVersion: 1,
      approvedAt: nowIso(),
      approvedByUserId: input.userId,
      sourcePlanVersion: 1,
      sourceVerifierVersion: 1,
    },
    actionAttempts: [],
    auditEvents: [{
      eventId: `${input.productionRunId}:marketplace_auto_review_created:${nowIso()}`,
      action: "marketplace_auto_review_created",
      actorUserId: input.userId,
      at: nowIso(),
      redactedPayload: {
        outputMode: input.outputMode,
        frameStrategy: input.frameStrategy,
        audioStrategy: input.audioStrategy,
        resolvedAudioStrategy: input.resolvedAudioStrategy,
        marketplaceProductId: input.plan.productTruth.productId,
      },
    }],
    metrics: getDefaultProductionMetrics(),
    storyConceptWizard: {
      source: "marketplace_auto_review",
      selectedConceptId: input.plan.conceptId,
      storyboardGuide: input.plan.storyboardGuide,
      voiceoverScript: input.plan.voiceoverScript,
      productDetail: input.plan.productDetail,
      audioStrategy: input.audioStrategy,
      resolvedAudioStrategy: input.resolvedAudioStrategy,
    },
    generationDefaults: {
      aspectRatio: "9:16",
      durationSeconds: DEFAULT_SHOT_DURATION_SECONDS,
      imageModel: DEFAULT_IMAGE_MODEL,
      videoModel: DEFAULT_VIDEO_MODEL,
    } as ProductionSpace["generationDefaults"],
    cues: input.plan.shots.map((shot) => ({
      id: `cue-${shot.id}`,
      shotId: shot.id,
      startSeconds: shot.startSeconds,
      endSeconds: shot.endSeconds,
      kind: "shot",
      label: shot.title,
      metadata: {
        voiceover: shot.voiceover,
        storyboardGuide: shot.storyboardGuide,
      },
    })),
    warnings: [],
    featureFlags: {
      marketplaceAutoReview: true,
      forceProviderDispatch: true,
    },
    accessPolicy: {
      ownerUserId: input.userId,
      approvalRequired: false,
      approvedByUserIds: [input.userId],
    },
    updatedAt: nowIso(),
  };
}

async function insertInitialProductionProject(params: {
  db: Db;
  tenantId: string;
  auth: AuthContext;
  productionRunId: string;
  plan: AutoReviewPlan;
  outputMode: MarketplaceAutoReviewOutputMode;
  frameStrategy: MarketplaceAutoReviewFrameStrategy;
  audioStrategy: MarketplaceAutoReviewAudioStrategyInput;
  resolvedAudioStrategy: MarketplaceAutoReviewResolvedAudioStrategy;
}) {
  const now = nowDate();
  const space = buildInitialProductionSpace({
    productionRunId: params.productionRunId,
    plan: params.plan,
    outputMode: params.outputMode,
    frameStrategy: params.frameStrategy,
    audioStrategy: params.audioStrategy,
    resolvedAudioStrategy: params.resolvedAudioStrategy,
    userId: params.auth.userId,
  });
  const goal = space.brief as any;
  const productionBible = {
    source: "marketplace_auto_review",
    schemaVersion: AUTO_REVIEW_SCHEMA_VERSION,
    productId: params.plan.productTruth.productId,
    conceptId: params.plan.conceptId,
    storyboardGuide: params.plan.storyboardGuide,
    voiceoverScript: params.plan.voiceoverScript,
    productDetail: params.plan.productDetail,
    audioStrategy: params.audioStrategy,
    resolvedAudioStrategy: params.resolvedAudioStrategy,
    nativeAudioPacingRule: params.resolvedAudioStrategy === "native_video_audio"
      ? "Each non-final Veo 3.1/Lite clip receives a dialogue target slightly longer than the clip duration to avoid silent tails."
      : undefined,
    shots: params.plan.shots,
  };
  const planVersionPayload = {
    source: "marketplace_auto_review",
    outputMode: params.outputMode,
    frameStrategy: params.frameStrategy,
    audioStrategy: params.audioStrategy,
    resolvedAudioStrategy: params.resolvedAudioStrategy,
    storyboardGuide: params.plan.storyboardGuide,
    voiceoverScript: params.plan.voiceoverScript,
    shots: params.plan.shots,
    assetRequirements: {
      nodes: space.flowNodes.map((node) => ({
        id: node.id,
        kind: node.kind,
        role: node.title,
        required: true,
        status: "ready",
        estimatedCredits: node.estimatedCredits ?? 0,
      })),
    },
  };
  await params.db
    .insert(mediaProductionRuns)
    .values({
      tenantId: params.tenantId,
      userId: params.auth.userId,
      productionRunId: params.productionRunId,
      status: space.status,
      goalVersion: 1,
      planVersion: 1,
      goal,
      productionBible,
      assetPlan: {
        contextAssets: space.contextAssets,
        productEvidenceManifest: space.productEvidenceManifest,
      },
      qualityGateSummary: {
        source: "marketplace_auto_review",
        verdict: "approved_for_automatic_execution",
        warnings: space.warnings ?? [],
      },
      budgetSummary: {
        estimatedCredits: space.flowNodes.reduce((sum, node) => sum + toNumber(node.estimatedCredits), 0),
      },
      contractVersion: "1.0.0",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();

  await params.db
    .insert(mediaProductionSpaces)
    .values({
      tenantId: params.tenantId,
      userId: params.auth.userId,
      productionRunId: params.productionRunId,
      version: 1,
      space: space as any,
      changeKind: "marketplace_auto_review_create",
      changedFields: ["brief", "shots", "flowNodes", "productEvidenceManifest"],
      spaceHash: buildProductionStableHash(space),
      status: space.status,
      contractVersion: "1.0.0",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();

  await params.db.insert(mediaProductionGoalVersions).values({
    tenantId: params.tenantId,
    userId: params.auth.userId,
    productionRunId: params.productionRunId,
    version: 1,
    goal,
    changedFields: ["marketplace_auto_review"],
    inputHash: buildProductionStableHash({ productId: params.plan.productTruth.productId, outputMode: params.outputMode, frameStrategy: params.frameStrategy }),
    status: "active",
    contractVersion: "1.0.0",
    createdAt: now,
  }).onConflictDoNothing();

  await params.db.insert(mediaProductionPlanVersions).values({
    tenantId: params.tenantId,
    userId: params.auth.userId,
    productionRunId: params.productionRunId,
    goalVersion: 1,
    version: 1,
    plannerSkillId: "marketplace-auto-review-director",
    plannerSkillVersion: "1.0.0",
    plan: planVersionPayload,
    inputHash: buildProductionStableHash(goal),
    outputHash: buildProductionStableHash(planVersionPayload),
    status: "approved",
    contractVersion: "1.0.0",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  await params.db.insert(mediaProductionPlanVerifications).values({
    tenantId: params.tenantId,
    userId: params.auth.userId,
    productionRunId: params.productionRunId,
    planVersion: 1,
    verifierSkillId: "marketplace-auto-review-verifier",
    verifierSkillVersion: "1.0.0",
    verdict: "pass",
    score: 92,
    verification: {
      source: "marketplace_auto_review",
      checks: [
        "product_reference_lock",
        "storyboard_voiceover_alignment",
        "face_visibility_guard",
        "traceability_metadata",
      ],
    },
    blockingIssues: [],
    warnings: params.plan.productTruth.imageUrls.length ? [] : [{ code: "missing_product_reference", message: "No product image attached." }],
    missingDecisions: [],
    recommendedRevisions: [],
    status: "active",
    contractVersion: "1.0.0",
    createdAt: now,
  });

  await params.db.insert(mediaProductionApprovals).values({
    tenantId: params.tenantId,
    userId: params.auth.userId,
    productionRunId: params.productionRunId,
    planVersion: 1,
    approvalType: "marketplace_auto_review",
    status: "approved",
    acceptedWarnings: params.plan.productTruth.imageUrls.length ? [] : ["missing_product_reference"],
    lockedTargets: ["product_reference", "storyboard_guide", "voiceover_script"],
    notes: "Auto-approved by Marketplace Auto Review after product facts and shot contract were generated.",
    policySnapshot: {
      source: "marketplace_auto_review",
      productReferenceLock: "strict",
      faceVisibilityGuard: "enabled",
      storyboardVoiceoverContract: "enabled",
    },
    budgetSnapshot: {
      estimatedCredits: space.flowNodes.reduce((sum, node) => sum + toNumber(node.estimatedCredits), 0),
    },
    createdAt: now,
  });

  return space;
}

async function upsertRunStage(params: {
  db: Db;
  runId: string;
  stageKey: StageKey;
  stageOrder: number;
  status: string;
  providerTaskIds?: string[];
  output?: Record<string, unknown>;
  errorMessage?: string | null;
}) {
  const now = nowDate();
  const updateSet: Record<string, unknown> = {
    status: params.status,
    providerTaskIdsJson: params.providerTaskIds ?? [],
    outputJson: params.output ?? {},
    errorMessage: params.errorMessage ?? null,
    updatedAt: now,
  };
  if (["running", "waiting_provider"].includes(params.status)) {
    updateSet.startedAt = sql`COALESCE(${marketplaceAutoReviewStages.startedAt}, ${now})`;
  }
  if (params.status === "completed") {
    updateSet.completedAt = now;
  }
  await params.db
    .insert(marketplaceAutoReviewStages)
    .values({
      runId: params.runId,
      stageKey: params.stageKey,
      stageOrder: params.stageOrder,
      status: params.status,
      providerTaskIdsJson: params.providerTaskIds ?? [],
      outputJson: params.output ?? {},
      errorMessage: params.errorMessage ?? null,
      startedAt: ["running", "waiting_provider"].includes(params.status) ? now : null,
      completedAt: params.status === "completed" ? now : null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [marketplaceAutoReviewStages.runId, marketplaceAutoReviewStages.stageKey],
      set: updateSet as any,
    });
}

async function updateRun(params: {
  db: Db;
  runId: string;
  status?: MarketplaceAutoReviewStatus;
  currentStage?: StageKey | string;
  stageIndex?: number;
  stageCount?: number;
  selectedConceptId?: string | null;
  storyboardReviewId?: string | null;
  videoEditorProjectId?: string | null;
  renderJobId?: string | null;
  resultLibraryItemId?: number | null;
  resultJson?: Record<string, unknown>;
  metadataJson?: RunMetadata;
  errorMessage?: string | null;
  completedAt?: Date | null;
}) {
  const set: Record<string, unknown> = { updatedAt: nowDate() };
  for (const key of [
    "status",
    "currentStage",
    "stageIndex",
    "stageCount",
    "selectedConceptId",
    "storyboardReviewId",
    "videoEditorProjectId",
    "renderJobId",
    "resultLibraryItemId",
    "resultJson",
    "metadataJson",
    "errorMessage",
    "completedAt",
  ] as const) {
    if (params[key] !== undefined) set[key] = params[key];
  }
  const [run] = await params.db
    .update(marketplaceAutoReviewRuns)
    .set(set as any)
    .where(eq(marketplaceAutoReviewRuns.id, params.runId))
    .returning();
  return run;
}

function serializeRun(run: MarketplaceAutoReviewRun, stages: MarketplaceAutoReviewStage[] = []) {
  return {
    ...run,
    stages,
    links: {
      productionProject: run.productionRunId ? `/media-studio?tab=production&productionRunId=${encodeURIComponent(run.productionRunId)}` : null,
      storyboardReview: run.storyboardReviewId ? `/storyboard-review?reviewId=${encodeURIComponent(run.storyboardReviewId)}` : null,
      videoEditor: run.videoEditorProjectId ? `/video-editor?projectId=${encodeURIComponent(run.videoEditorProjectId)}` : null,
      libraryItem: run.resultLibraryItemId ? `/library/${run.resultLibraryItemId}` : null,
    },
  };
}

export async function getMarketplaceAutoReviewRun(runId: string, auth: AuthContext) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  const [run] = await db
    .select()
    .from(marketplaceAutoReviewRuns)
    .where(and(eq(marketplaceAutoReviewRuns.id, runId), eq(marketplaceAutoReviewRuns.userId, auth.userId)))
    .limit(1);
  if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Auto review run not found" });
  const stages = await db
    .select()
    .from(marketplaceAutoReviewStages)
    .where(eq(marketplaceAutoReviewStages.runId, run.id))
    .orderBy(marketplaceAutoReviewStages.stageOrder);
  return serializeRun(run, stages);
}

export async function listMarketplaceAutoReviewRuns(input: {
  productId?: string;
  limit?: number;
}, auth: AuthContext) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 50);
  const runs = await db
    .select()
    .from(marketplaceAutoReviewRuns)
    .where(and(
      eq(marketplaceAutoReviewRuns.userId, auth.userId),
      input.productId ? eq(marketplaceAutoReviewRuns.productId, input.productId) : undefined,
    ))
    .orderBy(desc(marketplaceAutoReviewRuns.createdAt))
    .limit(limit);
  if (runs.length === 0) return [];
  const stages = await db
    .select()
    .from(marketplaceAutoReviewStages)
    .where(inArray(marketplaceAutoReviewStages.runId, runs.map((run) => run.id)))
    .orderBy(marketplaceAutoReviewStages.runId, marketplaceAutoReviewStages.stageOrder);
  const stagesByRun = new Map<string, MarketplaceAutoReviewStage[]>();
  for (const stage of stages) {
    stagesByRun.set(stage.runId, [...(stagesByRun.get(stage.runId) ?? []), stage]);
  }
  return runs.map((run) => serializeRun(run, stagesByRun.get(run.id) ?? []));
}

async function ensureRunStages(db: Db, runId: string, outputMode: MarketplaceAutoReviewOutputMode) {
  const stages = stageKeysForMode(outputMode);
  for (const [index, stageKey] of stages.entries()) {
    await upsertRunStage({
      db,
      runId,
      stageKey,
      stageOrder: index + 1,
      status: index === 0 ? "completed" : "queued",
    });
  }
}

export async function startMarketplaceAutoReviewRun(input: {
  productId: string;
  outputMode: MarketplaceAutoReviewOutputMode;
  frameStrategy?: MarketplaceAutoReviewFrameStrategyInput;
  audioStrategy?: MarketplaceAutoReviewAudioStrategyInput;
}, auth: AuthContext, runtime: RuntimeContext = {}) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  const outputMode = input.outputMode;
  const frameStrategy = resolveFrameStrategy(outputMode, input.frameStrategy);
  const audioStrategy: MarketplaceAutoReviewAudioStrategyInput = input.audioStrategy ?? "auto";
  const resolvedAudioStrategy = resolveMarketplaceAutoReviewAudioStrategy({
    outputMode,
    requested: audioStrategy,
    videoModel: DEFAULT_VIDEO_MODEL,
  });
  const stages = stageKeysForMode(outputMode);
  const tenantId = autoTenantId(auth);

  const active = await db
    .select()
    .from(marketplaceAutoReviewRuns)
    .where(and(
      eq(marketplaceAutoReviewRuns.userId, auth.userId),
      eq(marketplaceAutoReviewRuns.productId, input.productId),
      inArray(marketplaceAutoReviewRuns.status, ACTIVE_RUN_STATUSES),
    ))
    .orderBy(desc(marketplaceAutoReviewRuns.createdAt))
    .limit(1);
  if (active[0]) {
    queueMarketplaceAutoReviewAdvance(active[0].id, auth, runtime, 5_000);
    return getMarketplaceAutoReviewRun(active[0].id, auth);
  }

  const bundle = await getMarketplaceProductWithAccess(input.productId, auth);
  const insights = await loadSupportingInsights(db, bundle, auth);
  const plan = buildAutoReviewPlan(bundle, insights);
  const runId = createMarketplaceId("mar");
  const idempotencyKey = [
    tenantId,
    input.productId,
    outputMode,
    frameStrategy,
    audioStrategy,
    resolvedAudioStrategy,
    runId,
  ].join(":");
  const productionRunId = `mp-auto-${input.productId}-${Date.now().toString(36)}-${nanoid(6)}`;
  const now = nowDate();

  const [insertedRun] = await db.insert(marketplaceAutoReviewRuns).values({
    id: runId,
    tenantId: auth.tenantId ?? null,
    userId: auth.userId,
    productId: input.productId,
    productionRunId,
    outputMode,
    frameStrategy,
    status: "queued",
    currentStage: "production_project",
    stageIndex: stageIndex("production_project", stages),
    stageCount: stages.length,
    selectedConceptId: plan.conceptId,
    storyboardReviewId: null,
    videoEditorProjectId: null,
    renderJobId: null,
    resultLibraryItemId: null,
    resultJson: {},
    metadataJson: {
      schemaVersion: AUTO_REVIEW_SCHEMA_VERSION,
      productId: input.productId,
      outputMode,
      frameStrategy,
      audioStrategy,
      resolvedAudioStrategy,
      expectedNativeAudio: resolvedAudioStrategy === "native_video_audio",
      voiceoverSource: resolvedAudioStrategy === "native_video_audio"
        ? "native_video_prompt"
        : resolvedAudioStrategy === "separate_tts_voiceover"
          ? "separate_tts_voiceover"
          : "none",
      concept: plan,
      productTruth: plan.productTruth,
      productImageUrls: plan.productTruth.imageUrls,
      supportingInsightIds: insights.map((row) => row.id),
    },
    errorMessage: null,
    idempotencyKey,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing().returning({ id: marketplaceAutoReviewRuns.id });
  if (!insertedRun?.id) {
    const [conflictingActive] = await db
      .select()
      .from(marketplaceAutoReviewRuns)
      .where(and(
        eq(marketplaceAutoReviewRuns.userId, auth.userId),
        eq(marketplaceAutoReviewRuns.productId, input.productId),
        inArray(marketplaceAutoReviewRuns.status, ACTIVE_RUN_STATUSES),
      ))
      .orderBy(desc(marketplaceAutoReviewRuns.createdAt))
      .limit(1);
    if (conflictingActive?.id) {
      queueMarketplaceAutoReviewAdvance(conflictingActive.id, auth, runtime, 5_000);
      return getMarketplaceAutoReviewRun(conflictingActive.id, auth);
    }
    throw new TRPCError({ code: "CONFLICT", message: "Could not start auto review run because another run was created at the same time" });
  }
  await ensureRunStages(db, runId, outputMode);
  await insertInitialProductionProject({
    db,
    tenantId,
    auth,
    productionRunId,
    plan,
    outputMode,
    frameStrategy,
    audioStrategy,
    resolvedAudioStrategy,
  });
  await upsertRunStage({ db, runId, stageKey: "production_project", stageOrder: stageIndex("production_project", stages), status: "completed", output: { productionRunId } });
  await upsertRunStage({ db, runId, stageKey: "concept_story", stageOrder: stageIndex("concept_story", stages), status: "completed", output: { conceptId: plan.conceptId, storyboardGuide: plan.storyboardGuide, voiceoverScript: plan.voiceoverScript } });
  await upsertRunStage({
    db,
    runId,
    stageKey: "prompt_plan",
    stageOrder: stageIndex("prompt_plan", stages),
    status: "completed",
    output: { frameStrategy, shotCount: plan.shots.length, audioStrategy, resolvedAudioStrategy },
  });
  await updateRun({
    db,
    runId,
    status: "running",
    currentStage: "image_generation",
    stageIndex: stageIndex("image_generation", stages),
    stageCount: stages.length,
    selectedConceptId: plan.conceptId,
  });

  queueMarketplaceAutoReviewAdvance(runId, auth, runtime, 500);
  return getMarketplaceAutoReviewRun(runId, auth);
}

async function markRunFailed(db: Db, run: MarketplaceAutoReviewRun, message: string, stageKey?: StageKey | string) {
  const stages = stageKeysForMode(run.outputMode as MarketplaceAutoReviewOutputMode);
  if (stageKey && stages.includes(stageKey as StageKey)) {
    await upsertRunStage({
      db,
      runId: run.id,
      stageKey: stageKey as StageKey,
      stageOrder: stageIndex(stageKey, stages),
      status: "failed",
      errorMessage: message,
    });
  }
  return updateRun({
    db,
    runId: run.id,
    status: "failed",
    currentStage: stageKey ?? run.currentStage,
    errorMessage: message,
    completedAt: nowDate(),
  });
}

async function scheduleImageAttempt(params: {
  db: Db;
  tenantId: string;
  auth: AuthContext;
  run: MarketplaceAutoReviewRun;
  metadata: RunMetadata;
  runtime: RuntimeContext;
}) {
  if (params.metadata.imageAttemptId) return params.metadata.imageAttemptId;
  const current = await getProductionSpace({
    db: params.db,
    tenantId: params.tenantId,
    userId: params.auth.userId,
    productionRunId: params.run.productionRunId,
  });
  if (!current) throw new Error("Production space not found");
  const scheduled = await scheduleProductionExecution({
    db: params.db,
    tenantId: params.tenantId,
    userId: params.auth.userId,
    productionRunId: params.run.productionRunId,
    expectedVersion: current.version,
    scope: "batch",
    confirmed: true,
    userToken: cleanText(params.runtime.userToken) || undefined,
    publicUrl: cleanText(params.runtime.publicUrl) || undefined,
    forceExecutionGates: true,
    forceProviderDispatch: true,
  });
  const metadata = {
    ...params.metadata,
    imageAttemptId: scheduled.attempt.attemptId,
    imageNodeIds: scheduled.attempt.nodeIds,
    imageMediaTaskIds: scheduled.attempt.mediaTaskIds,
    imageProviderTaskIds: scheduled.attempt.providerTaskIds,
  };
  await updateRun({
    db: params.db,
    runId: params.run.id,
    status: "waiting_provider",
    currentStage: "image_generation",
    metadataJson: metadata,
  });
  await upsertRunStage({
    db: params.db,
    runId: params.run.id,
    stageKey: "image_generation",
    stageOrder: stageIndex("image_generation", stageKeysForMode(params.run.outputMode as MarketplaceAutoReviewOutputMode)),
    status: "waiting_provider",
    providerTaskIds: scheduled.attempt.providerTaskIds,
    output: {
      attemptId: scheduled.attempt.attemptId,
      mediaTaskIds: scheduled.attempt.mediaTaskIds,
      nodeIds: scheduled.attempt.nodeIds,
    },
  });
  return scheduled.attempt.attemptId;
}

async function reconcileAttempt(params: {
  db: Db;
  tenantId: string;
  auth: AuthContext;
  productionRunId: string;
  attemptId: string;
  runtime: RuntimeContext;
}) {
  const current = await getProductionSpace({
    db: params.db,
    tenantId: params.tenantId,
    userId: params.auth.userId,
    productionRunId: params.productionRunId,
  });
  if (!current) throw new Error("Production space not found");
  return reconcileProductionExecution({
    db: params.db,
    tenantId: params.tenantId,
    userId: params.auth.userId,
    productionRunId: params.productionRunId,
    expectedVersion: current.version,
    attemptId: params.attemptId,
    userToken: cleanText(params.runtime.userToken) || undefined,
  });
}

async function fetchBufferFromUrl(url: string, publicUrl?: string | null): Promise<Buffer> {
  const absoluteUrl = url.startsWith("/")
    ? `${(cleanText(publicUrl) || process.env.NODE_BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, "")}${url}`
    : url;
  const response = await fetch(absoluteUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image for split: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function splitStoryboardGrid(params: {
  runId: string;
  tenantId: string;
  sourceUrl: string;
  publicUrl?: string | null;
}) {
  const sharpModule = await import("sharp");
  const sharp = sharpModule.default;
  const buffer = await fetchBufferFromUrl(params.sourceUrl, params.publicUrl);
  const image = sharp(buffer);
  const metadata = await image.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width < 30 || height < 30) {
    throw new Error("Storyboard grid image is too small to split");
  }
  const cellWidth = Math.floor(width / 3);
  const cellHeight = Math.floor(height / 3);
  const urls: string[] = [];
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      const shotNumber = row * 3 + col + 1;
      const left = col * cellWidth;
      const top = row * cellHeight;
      const extractWidth = col === 2 ? width - left : cellWidth;
      const extractHeight = row === 2 ? height - top : cellHeight;
      const cell = await sharp(buffer)
        .extract({ left, top, width: extractWidth, height: extractHeight })
        .png()
        .toBuffer();
      const stored = await storagePut(
        `marketplace-auto-review/${params.tenantId}/${params.runId}/frames/shot-${String(shotNumber).padStart(2, "0")}.png`,
        cell,
        "image/png",
      );
      urls.push(stored.url);
    }
  }
  return urls;
}

async function ensureStoryboardFrames(params: {
  db: Db;
  tenantId: string;
  auth: AuthContext;
  run: MarketplaceAutoReviewRun;
  metadata: RunMetadata;
  runtime: RuntimeContext;
  space: ProductionSpace;
}): Promise<RunMetadata> {
  const frameStrategy = params.run.frameStrategy as MarketplaceAutoReviewFrameStrategy;
  if (frameStrategy === "storyboard_3x3_split") {
    if (params.metadata.storyboardFrameUrls?.length === DEFAULT_SHOT_COUNT) return params.metadata;
    const gridUrl = outputRefUrl(params.space.flowNodes.find((node) => node.id === "storyboard-grid-image"));
    if (!gridUrl) throw new Error("Completed storyboard grid image is missing URL");
    const frameUrls = await splitStoryboardGrid({
      runId: params.run.id,
      tenantId: params.tenantId,
      sourceUrl: gridUrl,
      publicUrl: params.runtime.publicUrl,
    });
    const metadata = { ...params.metadata, storyboardGridUrl: gridUrl, storyboardFrameUrls: frameUrls };
    await updateRun({ db: params.db, runId: params.run.id, metadataJson: metadata });
    return metadata;
  }

  if ((params.metadata.startFrameUrls?.length ?? 0) >= DEFAULT_SHOT_COUNT && (params.metadata.stopFrameUrls?.length ?? 0) >= DEFAULT_SHOT_COUNT) {
    return params.metadata;
  }
  const startFrameUrls: string[] = [];
  const stopFrameUrls: string[] = [];
  for (let index = 1; index <= DEFAULT_SHOT_COUNT; index += 1) {
    const startNode = params.space.flowNodes.find((node) => node.id === `shot-${index}-start`);
    const stopNode = params.space.flowNodes.find((node) => node.id === `shot-${index}-stop`);
    startFrameUrls.push(outputRefUrl(startNode));
    stopFrameUrls.push(outputRefUrl(stopNode));
  }
  if (startFrameUrls.some((url) => !url) || stopFrameUrls.some((url) => !url)) {
    throw new Error("Completed start/stop frame set is missing URLs");
  }
  const metadata = { ...params.metadata, startFrameUrls, stopFrameUrls, storyboardFrameUrls: startFrameUrls };
  await updateRun({ db: params.db, runId: params.run.id, metadataJson: metadata });
  return metadata;
}

async function addFrameImagesToLibrary(params: {
  db: Db;
  tenantId: string;
  auth: AuthContext;
  run: MarketplaceAutoReviewRun;
  plan: AutoReviewPlan;
  metadata: RunMetadata;
}): Promise<RunMetadata> {
  const existingIds = Array.isArray(params.metadata.libraryFrameItemIds)
    ? params.metadata.libraryFrameItemIds.filter((id) => Number.isFinite(Number(id))).map(Number)
    : [];

  const frameEntries = params.plan.shots.flatMap((shot, index) => {
    const entries: Array<{ url: string; frameRole: string; shot: AutoReviewShot }> = [];
    const storyboardUrl = cleanText(params.metadata.storyboardFrameUrls?.[index]);
    const startUrl = cleanText(params.metadata.startFrameUrls?.[index]);
    const stopUrl = cleanText(params.metadata.stopFrameUrls?.[index]);
    if (startUrl) {
      entries.push({ url: startUrl, frameRole: "start", shot });
    } else if (storyboardUrl) {
      entries.push({ url: storyboardUrl, frameRole: "storyboard", shot });
    }
    if (stopUrl) entries.push({ url: stopUrl, frameRole: "stop", shot });
    return entries;
  });
  if (frameEntries.length === 0) return params.metadata;
  if (existingIds.length >= frameEntries.length) return params.metadata;

  const libraryFrameItemIds: number[] = [...existingIds];
  for (const entry of frameEntries) {
    const [existing] = await params.db
      .select({ id: libraryItems.id })
      .from(libraryItems)
      .where(and(
        eq(libraryItems.ownerUserId, params.auth.userId),
        eq(libraryItems.tenantId, params.tenantId),
        eq(libraryItems.itemType, "image"),
        sql`${libraryItems.metadata}->>'auto_review_run_id' = ${params.run.id}`,
        sql`${libraryItems.metadata}->>'shot_id' = ${entry.shot.id}`,
        sql`${libraryItems.metadata}->>'frame_role' = ${entry.frameRole}`,
      ))
      .limit(1);
    if (existing?.id) {
      libraryFrameItemIds.push(existing.id);
      continue;
    }

    const metadata = {
      source_type: "marketplace_auto_review_frame",
      marketplace_product_id: params.plan.productTruth.productId,
      product_id: params.plan.productTruth.productId,
      production_run_id: params.run.productionRunId,
      auto_review_run_id: params.run.id,
      concept_id: params.plan.conceptId,
      frame_strategy: params.run.frameStrategy,
      output_mode: params.run.outputMode,
      shot_id: entry.shot.id,
      shot_order: entry.shot.order,
      frame_role: entry.frameRole,
      product_name: params.plan.productTruth.productName,
      source_url: params.plan.productTruth.sourceUrl,
      storyboard_guide: entry.shot.storyboardGuide,
      voiceover: entry.shot.voiceover,
    };
    const created = await createLibraryItem({
      itemType: "image",
      source: "marketplace_auto_review_frame",
      title: `${params.plan.title} - ${entry.shot.order}. ${entry.shot.title} (${entry.frameRole})`,
      description: entry.shot.voiceover,
      status: "indexing",
      visibility: "private",
      projectId: params.run.productionRunId,
      metadata,
      sourceUrl: entry.url,
      thumbnailUrl: entry.url,
      sourceLink: {
        linkType: "marketplace_auto_review_frame",
        linkId: `${params.run.id}:${entry.shot.id}:${entry.frameRole}`,
      },
    }, {
      userId: params.auth.userId,
      tenantId: params.tenantId,
      role: "user",
    }, params.db);
    libraryFrameItemIds.push(created.item.id);
    await safeEnqueueLibraryIndexJob({
      libraryItemId: created.item.id,
      tenantId: params.tenantId,
      jobType: "initial_index",
      domain: "gallery",
      operation: "index",
      source: "gallery.marketplace_auto_review_frame",
      sourceMetadata: metadata,
      allowThrottle: true,
    }, params.db);
  }

  const metadata = { ...params.metadata, libraryFrameItemIds: Array.from(new Set(libraryFrameItemIds)) };
  await updateRun({ db: params.db, runId: params.run.id, metadataJson: metadata });
  return metadata;
}

function buildStoryboardReviewOutput(params: {
  run: MarketplaceAutoReviewRun;
  plan: AutoReviewPlan;
  metadata: RunMetadata;
}) {
  const frameUrls = params.metadata.storyboardFrameUrls ?? params.metadata.startFrameUrls ?? [];
  const referenceMode: MarketplaceAutoReviewVideoReferenceMode = params.metadata.startFrameUrls?.length
    ? "start_stop"
    : "single_storyboard_frame";
  const resolvedAudioStrategy = params.metadata.resolvedAudioStrategy ?? resolveMarketplaceAutoReviewAudioStrategy({
    outputMode: params.run.outputMode as MarketplaceAutoReviewOutputMode,
    requested: params.metadata.audioStrategy,
    videoModel: DEFAULT_VIDEO_MODEL,
  });
  return {
    schemaVersion: AUTO_REVIEW_SCHEMA_VERSION,
    title: params.plan.title,
    conceptId: params.plan.conceptId,
    productId: params.plan.productTruth.productId,
    productionRunId: params.run.productionRunId,
    outputMode: params.run.outputMode,
    frameStrategy: params.run.frameStrategy,
    audioStrategy: params.metadata.audioStrategy ?? "auto",
    resolvedAudioStrategy,
    expectedNativeAudio: resolvedAudioStrategy === "native_video_audio",
    conceptDetails: params.plan.productDetail,
    storyboardGuide: params.plan.storyboardGuide,
    voiceoverScript: params.plan.voiceoverScript,
    durationSeconds: DEFAULT_DURATION_SECONDS,
    aspectRatio: "9:16",
    clips: params.plan.shots.map((shot, index) => ({
      id: shot.id,
      index,
      order: shot.order,
      title: shot.title,
      status: frameUrls[index] ? "completed" : "pending",
      url: frameUrls[index] ?? null,
      thumbnailUrl: frameUrls[index] ?? null,
      startFrameUrl: params.metadata.startFrameUrls?.[index] ?? frameUrls[index] ?? null,
      stopFrameUrl: params.metadata.stopFrameUrls?.[index] ?? null,
      prompt: buildVideoPrompt(params.plan, shot, {
        audioStrategy: resolvedAudioStrategy,
        isLastShot: index === params.plan.shots.length - 1,
        referenceMode,
      }),
      storyboardGuide: shot.storyboardGuide,
      voiceover: shot.voiceover,
      startSeconds: shot.startSeconds,
      endSeconds: shot.endSeconds,
      durationSeconds: shot.durationSeconds,
      metadata: {
        marketplaceProductId: params.plan.productTruth.productId,
        productionRunId: params.run.productionRunId,
        conceptId: params.plan.conceptId,
        audioStrategy: params.metadata.audioStrategy ?? "auto",
        resolvedAudioStrategy,
        expectedNativeAudio: resolvedAudioStrategy === "native_video_audio",
        referenceMode,
      },
    })),
  };
}

async function createStoryboardReview(params: {
  db: Db;
  tenantId: string;
  auth: AuthContext;
  run: MarketplaceAutoReviewRun;
  plan: AutoReviewPlan;
  metadata: RunMetadata;
}) {
  if (params.run.storyboardReviewId) return params.run.storyboardReviewId;
  const output = buildStoryboardReviewOutput(params);
  const identity = buildProductionOutputProjectionIdentity({
    tenantId: params.tenantId,
    productionRunId: params.run.productionRunId,
    surface: "storyboard_review",
    sourceOutput: output,
  });
  const [existingProjection] = await params.db
    .select()
    .from(mediaProductionOutputProjections)
    .where(and(
      eq(mediaProductionOutputProjections.tenantId, params.tenantId),
      eq(mediaProductionOutputProjections.productionRunId, params.run.productionRunId),
      eq(mediaProductionOutputProjections.surface, "storyboard_review"),
      eq(mediaProductionOutputProjections.sourceOutputHash, identity.sourceOutputHash),
    ))
    .limit(1);
  if (existingProjection?.surfaceRecordId) {
    await updateRun({ db: params.db, runId: params.run.id, storyboardReviewId: existingProjection.surfaceRecordId });
    return existingProjection.surfaceRecordId;
  }
  const clips = output.clips;
  const now = nowDate();
  const [review] = await params.db.insert(mediaStudioStoryboardReviews).values({
    userId: params.auth.userId,
    name: params.plan.title,
    reviewData: {
      productionRunId: params.run.productionRunId,
      sourceSurface: "marketplace_auto_review",
      sourceProductId: params.plan.productTruth.productId,
      marketplaceProduct: params.plan.productTruth,
      storyBible: {
        conceptId: params.plan.conceptId,
        storyboardGuide: params.plan.storyboardGuide,
        voiceoverScript: params.plan.voiceoverScript,
        productDetail: params.plan.productDetail,
        audioStrategy: params.metadata.audioStrategy ?? "auto",
        resolvedAudioStrategy: params.metadata.resolvedAudioStrategy,
      },
      qualityGateSummary: {
        productReferenceLock: "strict",
        faceVisibilityGuard: "enabled",
        storyboardVoiceoverContract: "enabled",
        nativeAudioPacingContract: params.metadata.resolvedAudioStrategy === "native_video_audio" ? "enabled" : "not_applicable",
      },
      tasks: clips,
      clips,
      output,
      conceptDetails: params.plan.productDetail,
      storyboardGuide: params.plan.storyboardGuide,
      voiceoverScript: params.plan.voiceoverScript,
      autoReviewRunId: params.run.id,
      audioStrategy: params.metadata.audioStrategy ?? "auto",
      resolvedAudioStrategy: params.metadata.resolvedAudioStrategy,
      updatedAt: Date.now(),
    },
    clipCount: clips.length,
    completedClipCount: clips.filter((clip) => Boolean(clip.url)).length,
    thumbnailUrl: cleanText(clips.find((clip) => clip.thumbnailUrl)?.thumbnailUrl) || undefined,
    status: "active",
    createdAt: now,
    updatedAt: now,
  }).returning({ id: mediaStudioStoryboardReviews.id });
  const surfaceRecordId = String(review.id);
  await params.db.insert(mediaProductionOutputProjections).values({
    tenantId: params.tenantId,
    userId: params.auth.userId,
    productionRunId: params.run.productionRunId,
    storyboardRunId: params.plan.conceptId,
    surface: "storyboard_review",
    surfaceRecordId,
    sourceOutputHash: identity.sourceOutputHash,
    metadata: {
      idempotencyKey: identity.idempotencyKey,
      clipCount: clips.length,
      marketplaceProductId: params.plan.productTruth.productId,
      autoReviewRunId: params.run.id,
    },
    status: "active",
    lastSyncedAt: now,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: [
      mediaProductionOutputProjections.tenantId,
      mediaProductionOutputProjections.productionRunId,
      mediaProductionOutputProjections.surface,
      mediaProductionOutputProjections.sourceOutputHash,
    ],
    set: {
      surfaceRecordId,
      metadata: {
        idempotencyKey: identity.idempotencyKey,
        clipCount: clips.length,
        marketplaceProductId: params.plan.productTruth.productId,
        autoReviewRunId: params.run.id,
      },
      status: "active",
      lastSyncedAt: now,
      updatedAt: now,
    },
  });
  await updateRun({ db: params.db, runId: params.run.id, storyboardReviewId: surfaceRecordId });
  return surfaceRecordId;
}

async function ensureVideoNodes(params: {
  db: Db;
  tenantId: string;
  auth: AuthContext;
  productionRunId: string;
  plan: AutoReviewPlan;
  metadata: RunMetadata;
}) {
  const current = await getProductionSpace({
    db: params.db,
    tenantId: params.tenantId,
    userId: params.auth.userId,
    productionRunId: params.productionRunId,
  });
  if (!current) throw new Error("Production space not found");
  if (current.space.flowNodes.some((node) => node.kind === "video_generate")) {
    if (current.space.status !== "final_preflight_passed") {
      const reset = await saveProductionSpace({
        db: params.db,
        tenantId: params.tenantId,
        userId: params.auth.userId,
        productionRunId: params.productionRunId,
        expectedVersion: current.version,
        space: { ...current.space, status: "final_preflight_passed" },
        changeKind: "marketplace_auto_review_video_preflight",
        changedFields: ["status"],
      });
      return reset;
    }
    return current;
  }

  const frameStrategy = params.metadata.startFrameUrls?.length ? "video_shot_start_stop" : "storyboard_3x3_split";
  const resolvedAudioStrategy = params.metadata.resolvedAudioStrategy ?? resolveMarketplaceAutoReviewAudioStrategy({
    outputMode: "full_video",
    requested: params.metadata.audioStrategy,
    videoModel: DEFAULT_VIDEO_MODEL,
  });
  const videoNodes = params.plan.shots.map((shot, index) => {
    const refs = frameStrategy === "video_shot_start_stop"
      ? [
        params.metadata.startFrameUrls?.[index],
        params.metadata.stopFrameUrls?.[index],
        ...params.plan.productTruth.imageUrls.slice(0, 3),
      ].filter(Boolean) as string[]
      : [
        params.metadata.storyboardFrameUrls?.[index],
        ...params.plan.productTruth.imageUrls.slice(0, 4),
      ].filter(Boolean) as string[];
    return buildVideoNode(params.plan, shot, refs, {
      audioStrategy: resolvedAudioStrategy,
      isLastShot: index === params.plan.shots.length - 1,
      referenceMode: frameStrategy === "video_shot_start_stop" ? "start_stop" : "single_storyboard_frame",
    });
  });
  const nextSpace: ProductionSpace = {
    ...current.space,
    status: "final_preflight_passed",
    flowNodes: [
      ...current.space.flowNodes,
      ...videoNodes.map((node, index) => ({
        ...node,
        position: { x: 980, y: 120 + index * 160 },
      })),
    ],
    flowEdges: [
      ...current.space.flowEdges,
      ...videoNodes.flatMap((node) => {
        const shot = params.plan.shots.find((item) => `${item.id}-video` === node.id);
        if (!shot) return [];
        if (frameStrategy === "video_shot_start_stop") {
          return [
            { id: `${shot.id}-start-to-video`, source: `${shot.id}-start`, target: node.id, kind: "dependency" as const },
            { id: `${shot.id}-stop-to-video`, source: `${shot.id}-stop`, target: node.id, kind: "dependency" as const },
          ];
        }
        return [];
      }),
    ],
    shots: current.space.shots.map((shot) => {
      const videoNodeId = `${shot.id}-video`;
      return params.plan.shots.some((item) => item.id === shot.id)
        ? { ...shot, nodeIds: Array.from(new Set([...(shot.nodeIds ?? []), videoNodeId])) }
        : shot;
    }),
  };
  return saveProductionSpace({
    db: params.db,
    tenantId: params.tenantId,
    userId: params.auth.userId,
    productionRunId: params.productionRunId,
    expectedVersion: current.version,
    space: nextSpace,
    changeKind: "marketplace_auto_review_video_nodes",
    changedFields: ["flowNodes", "flowEdges", "shots.nodeIds", "status"],
  });
}

async function scheduleVideoAttempt(params: {
  db: Db;
  tenantId: string;
  auth: AuthContext;
  run: MarketplaceAutoReviewRun;
  metadata: RunMetadata;
  runtime: RuntimeContext;
}) {
  if (params.metadata.videoAttemptId) return params.metadata.videoAttemptId;
  const current = await getProductionSpace({
    db: params.db,
    tenantId: params.tenantId,
    userId: params.auth.userId,
    productionRunId: params.run.productionRunId,
  });
  if (!current) throw new Error("Production space not found");
  const scheduled = await scheduleProductionExecution({
    db: params.db,
    tenantId: params.tenantId,
    userId: params.auth.userId,
    productionRunId: params.run.productionRunId,
    expectedVersion: current.version,
    scope: "batch",
    confirmed: true,
    userToken: cleanText(params.runtime.userToken) || undefined,
    publicUrl: cleanText(params.runtime.publicUrl) || undefined,
    forceExecutionGates: true,
    forceProviderDispatch: true,
  });
  const metadata = {
    ...params.metadata,
    videoAttemptId: scheduled.attempt.attemptId,
    videoNodeIds: scheduled.attempt.nodeIds,
    videoMediaTaskIds: scheduled.attempt.mediaTaskIds,
    videoProviderTaskIds: scheduled.attempt.providerTaskIds,
  };
  await updateRun({
    db: params.db,
    runId: params.run.id,
    status: "waiting_provider",
    currentStage: "video_generation",
    stageIndex: stageIndex("video_generation", stageKeysForMode(params.run.outputMode as MarketplaceAutoReviewOutputMode)),
    stageCount: stageKeysForMode(params.run.outputMode as MarketplaceAutoReviewOutputMode).length,
    metadataJson: metadata,
  });
  await upsertRunStage({
    db: params.db,
    runId: params.run.id,
    stageKey: "video_generation",
    stageOrder: stageIndex("video_generation", stageKeysForMode(params.run.outputMode as MarketplaceAutoReviewOutputMode)),
    status: "waiting_provider",
    providerTaskIds: scheduled.attempt.providerTaskIds,
    output: {
      attemptId: scheduled.attempt.attemptId,
      mediaTaskIds: scheduled.attempt.mediaTaskIds,
      nodeIds: scheduled.attempt.nodeIds,
    },
  });
  return scheduled.attempt.attemptId;
}

function buildFullVoiceoverScript(plan: AutoReviewPlan): string {
  return plan.shots
    .map((shot) => buildMarketplaceAutoReviewNativeSpeechText({
      plan,
      shot,
      isLastShot: shot.order === plan.shots.length,
    }))
    .filter(Boolean)
    .join("\n");
}

function mediaTaskResultUrl(task: MediaTask): string {
  const direct = cleanText(task.resultUrl);
  if (direct) return direct;
  const data = asRecord(task.resultData);
  for (const key of ["audioUrl", "audio_url", "url", "resultUrl", "result_url", "outputUrl", "output_url"]) {
    const value = cleanText(data[key]);
    if (value) return value;
  }
  const artifacts = data.artifacts;
  if (Array.isArray(artifacts)) {
    for (const artifact of artifacts) {
      const value = cleanText(asRecord(artifact).url ?? asRecord(artifact).uri);
      if (value) return value;
    }
  }
  return "";
}

function readPositiveNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed * 100) / 100;
  }
  return undefined;
}

function mediaTaskDurationSeconds(task: MediaTask): number | undefined {
  const data = asRecord(task.resultData);
  const params = asRecord(task.parameters);
  return readPositiveNumber(
    data.durationSeconds,
    data.duration_seconds,
    data.duration,
    data.audioDurationSeconds,
    data.audio_duration_seconds,
    data.actualDurationSeconds,
    data.actual_duration_seconds,
    params.durationSeconds,
    params.duration_seconds,
    params.duration,
    params.extra_params && asRecord(params.extra_params).durationSeconds,
    params.extra_params && asRecord(params.extra_params).duration_seconds,
  );
}

async function ensureAudioForVideo(params: {
  db: Db;
  tenantId: string;
  auth: AuthContext;
  run: MarketplaceAutoReviewRun;
  plan: AutoReviewPlan;
  metadata: RunMetadata;
  runtime: RuntimeContext;
}): Promise<{ metadata: RunMetadata; completed: boolean }> {
  const resolvedAudioStrategy = params.metadata.resolvedAudioStrategy ?? resolveMarketplaceAutoReviewAudioStrategy({
    outputMode: params.run.outputMode as MarketplaceAutoReviewOutputMode,
    requested: params.metadata.audioStrategy,
    videoModel: DEFAULT_VIDEO_MODEL,
  });
  const stageOrder = stageIndex("audio_generation", FULL_VIDEO_STAGES);
  if (resolvedAudioStrategy !== "separate_tts_voiceover") {
    const metadata = {
      ...params.metadata,
      resolvedAudioStrategy,
      expectedNativeAudio: resolvedAudioStrategy === "native_video_audio",
      voiceoverSource: resolvedAudioStrategy === "native_video_audio" ? "native_video_prompt" : "none",
    };
    await upsertRunStage({
      db: params.db,
      runId: params.run.id,
      stageKey: "audio_generation",
      stageOrder,
      status: "completed",
      output: {
        skipped: true,
        reason: resolvedAudioStrategy === "native_video_audio" ? "native_audio_in_video_prompt" : "silent_video",
        resolvedAudioStrategy,
      },
    });
    if (metadata !== params.metadata) {
      await updateRun({ db: params.db, runId: params.run.id, metadataJson: metadata });
    }
    return { metadata, completed: true };
  }

  if (params.metadata.audioUrl) {
    await upsertRunStage({
      db: params.db,
      runId: params.run.id,
      stageKey: "audio_generation",
      stageOrder,
      status: "completed",
      output: {
        audioUrl: params.metadata.audioUrl,
        mediaTaskId: params.metadata.audioMediaTaskId,
        providerTaskId: params.metadata.audioProviderTaskId,
        resolvedAudioStrategy,
      },
    });
    return { metadata: params.metadata, completed: true };
  }

  const userToken = cleanText(params.runtime.userToken);
  if (!userToken) throw new Error("Audio generation needs an authenticated media token");

  if (!params.metadata.audioMediaTaskId) {
    const text = buildFullVoiceoverScript(params.plan);
    const task = await mediaGenerationService.generateAudioAsync({
      text,
      speed: 0.98,
      publicUrl: cleanText(params.runtime.publicUrl) || undefined,
      extraParams: {
        __origin_surface: "marketplace_auto_review",
        __marketplace_product_id: params.plan.productTruth.productId,
        __marketplace_product_name: params.plan.productTruth.productName,
        __production_run_id: params.run.productionRunId,
        __auto_review_run_id: params.run.id,
        __auto_review_concept_id: params.plan.conceptId,
        target_duration_seconds: DEFAULT_DURATION_SECONDS,
        voiceover_source: "marketplace_auto_review_full_script",
      },
      auditContext: {
        userId: params.auth.userId,
        traceId: `marketplace-auto-review-audio:${params.run.id}`,
        source: "marketplace_auto_review",
        stage: "audio_generation",
      },
    }, userToken);
    const metadata = {
      ...params.metadata,
      resolvedAudioStrategy,
      expectedNativeAudio: false,
        voiceoverSource: "separate_tts_voiceover",
        audioMediaTaskId: task.id,
        audioProviderTaskId: task.taskId,
        audioTaskModel: task.model,
        audioTargetDurationSeconds: DEFAULT_DURATION_SECONDS,
      };
    await updateRun({
      db: params.db,
      runId: params.run.id,
      status: "waiting_provider",
      currentStage: "audio_generation",
      stageIndex: stageOrder,
      stageCount: FULL_VIDEO_STAGES.length,
      metadataJson: metadata,
    });
    await upsertRunStage({
      db: params.db,
      runId: params.run.id,
      stageKey: "audio_generation",
      stageOrder,
      status: "waiting_provider",
      providerTaskIds: [task.taskId ?? task.id].filter(Boolean),
      output: {
        mediaTaskId: task.id,
        providerTaskId: task.taskId,
        model: task.model,
        resolvedAudioStrategy,
      },
    });
    return { metadata, completed: false };
  }

  const task = await mediaGenerationService.getTask(params.metadata.audioMediaTaskId, userToken, {
    userId: params.auth.userId,
    traceId: `marketplace-auto-review-audio-status:${params.run.id}`,
    source: "marketplace_auto_review",
    stage: "audio_generation_status",
  });
  if (task.status === "failed") {
    throw new Error(task.errorMessage || "Separate voiceover generation failed");
  }
  if (task.status !== "completed") {
    await upsertRunStage({
      db: params.db,
      runId: params.run.id,
      stageKey: "audio_generation",
      stageOrder,
      status: "waiting_provider",
      providerTaskIds: [task.taskId ?? params.metadata.audioProviderTaskId ?? task.id].filter(Boolean),
      output: {
        mediaTaskId: task.id,
        providerTaskId: task.taskId,
        status: task.status,
        resolvedAudioStrategy,
      },
    });
    return { metadata: params.metadata, completed: false };
  }

  const audioUrl = mediaTaskResultUrl(task);
  if (!audioUrl) throw new Error("Audio generation completed but result URL is missing");
  const audioActualDurationSeconds = mediaTaskDurationSeconds(task);
  const metadata = {
    ...params.metadata,
    resolvedAudioStrategy,
    expectedNativeAudio: false,
    voiceoverSource: "separate_tts_voiceover",
    audioMediaTaskId: task.id,
    audioProviderTaskId: task.taskId ?? params.metadata.audioProviderTaskId,
    audioTaskModel: task.model,
    audioUrl,
    audioActualDurationSeconds,
    audioTargetDurationSeconds: DEFAULT_DURATION_SECONDS,
  };
  await updateRun({
    db: params.db,
    runId: params.run.id,
    metadataJson: metadata,
  });
  await upsertRunStage({
    db: params.db,
    runId: params.run.id,
    stageKey: "audio_generation",
    stageOrder,
    status: "completed",
    providerTaskIds: [task.taskId ?? task.id].filter(Boolean),
    output: {
      mediaTaskId: task.id,
      providerTaskId: task.taskId,
      audioUrl,
      audioActualDurationSeconds,
      audioTargetDurationSeconds: DEFAULT_DURATION_SECONDS,
      resolvedAudioStrategy,
    },
  });
  return { metadata, completed: true };
}

function buildVideoEditorProject(params: {
  plan: AutoReviewPlan;
  videoUrls: string[];
  run: MarketplaceAutoReviewRun;
}): VideoEditorProject {
  const createdAt = nowIso();
  const runMetadata = (params.run.metadataJson as RunMetadata) ?? {};
  const resolvedAudioStrategy = runMetadata.resolvedAudioStrategy ?? "native_video_audio";
  const hasSeparateVoiceover = resolvedAudioStrategy === "separate_tts_voiceover" && Boolean(cleanText(runMetadata.audioUrl));
  const muteGeneratedVideoAudio = resolvedAudioStrategy === "separate_tts_voiceover" || resolvedAudioStrategy === "silent";
  const referenceMode: MarketplaceAutoReviewVideoReferenceMode = runMetadata.startFrameUrls?.length
    ? "start_stop"
    : "single_storyboard_frame";
  const assets: VideoEditorProject["assets"] = {};
  const clips: VideoEditorProject["timeline"]["tracks"][number]["clips"] = [];
  let cursor = 0;
  params.videoUrls.forEach((url, index) => {
    const shot = params.plan.shots[index];
    if (!shot || !url) return;
    const assetId = `asset-${shot.id}`;
    const clipId = `clip-${shot.id}`;
    assets[assetId] = {
      id: assetId,
      type: "video",
      source: "generated",
      taskId: cleanText((params.run.metadataJson as RunMetadata)?.videoMediaTaskIds?.[index]) || undefined,
      model: DEFAULT_VIDEO_MODEL,
      name: `${shot.order}. ${shot.title}`,
      path: url,
      originalPath: url,
      filename: `${shot.id}.mp4`,
      format: "mp4",
      duration: shot.durationSeconds,
      thumbnailPath: (params.run.metadataJson as RunMetadata)?.startFrameUrls?.[index] ?? (params.run.metadataJson as RunMetadata)?.storyboardFrameUrls?.[index],
      generationPrompt: buildVideoPrompt(params.plan, shot, {
        audioStrategy: resolvedAudioStrategy,
        isLastShot: index === params.plan.shots.length - 1,
        referenceMode,
      }),
      referenceUrls: [
        referenceMode === "start_stop"
          ? (params.run.metadataJson as RunMetadata)?.startFrameUrls?.[index]
          : (params.run.metadataJson as RunMetadata)?.storyboardFrameUrls?.[index],
        referenceMode === "start_stop"
          ? (params.run.metadataJson as RunMetadata)?.stopFrameUrls?.[index]
          : undefined,
      ].filter(Boolean) as string[],
      generationModelId: DEFAULT_VIDEO_MODEL,
      generationAspectRatio: "9:16",
      generationExtraParams: {
        marketplaceProductId: params.plan.productTruth.productId,
        productionRunId: params.run.productionRunId,
        autoReviewRunId: params.run.id,
        conceptId: params.plan.conceptId,
        shotId: shot.id,
        voiceover: shot.voiceover,
        audioStrategy: runMetadata.audioStrategy ?? "auto",
        resolvedAudioStrategy,
        expectedNativeAudio: resolvedAudioStrategy === "native_video_audio",
        referenceMode,
      },
    };
    clips.push({
      id: clipId,
      assetId,
      trackId: "track-v1",
      startTime: cursor,
      duration: shot.durationSeconds,
      trimIn: 0,
      trimOut: shot.durationSeconds,
      volume: muteGeneratedVideoAudio ? 0 : 1,
      speed: 1,
      effects: [],
      transitions: { fadeIn: index === 0 ? 0 : 0.12, fadeOut: 0.12 },
      groupId: `auto-review-${params.run.id}`,
    });
    cursor += shot.durationSeconds;
  });
  const audioClips: VideoEditorProject["timeline"]["tracks"][number]["clips"] = [];
  if (hasSeparateVoiceover) {
    const audioUrl = cleanText(runMetadata.audioUrl);
    const audioActualDuration = readPositiveNumber(runMetadata.audioActualDurationSeconds) ?? cursor;
    const voiceoverClipDuration = Math.min(cursor, audioActualDuration);
    const assetId = "asset-voiceover";
    assets[assetId] = {
      id: assetId,
      type: "audio",
      source: "generated",
      taskId: cleanText(runMetadata.audioMediaTaskId) || undefined,
      model: cleanText(runMetadata.audioTaskModel) || undefined,
      name: "Marketplace auto review voiceover",
      path: audioUrl,
      originalPath: audioUrl,
      filename: `${params.run.id}-voiceover.mp3`,
      format: audioUrl.toLowerCase().includes(".wav") ? "wav" : "mp3",
      duration: audioActualDuration,
      generationPrompt: buildFullVoiceoverScript(params.plan),
      generationModelId: cleanText(runMetadata.audioTaskModel) || undefined,
      generationExtraParams: {
        marketplaceProductId: params.plan.productTruth.productId,
        productionRunId: params.run.productionRunId,
        autoReviewRunId: params.run.id,
        conceptId: params.plan.conceptId,
        audioStrategy: runMetadata.audioStrategy ?? "auto",
        resolvedAudioStrategy,
        voiceoverSource: "separate_tts_voiceover",
        audioActualDurationSeconds: audioActualDuration,
        audioTargetDurationSeconds: runMetadata.audioTargetDurationSeconds ?? cursor,
      },
    };
    audioClips.push({
      id: "clip-voiceover",
      assetId,
      trackId: "track-a1",
      startTime: 0,
      duration: voiceoverClipDuration,
      trimIn: 0,
      trimOut: voiceoverClipDuration,
      volume: 1,
      speed: 1,
      effects: [],
      transitions: { fadeIn: 0, fadeOut: 0.16 },
      groupId: `auto-review-${params.run.id}`,
    });
  }
  return {
    version: "1.0",
    name: params.plan.title,
    createdAt,
    modifiedAt: createdAt,
    settings: {
      width: 1080,
      height: 1920,
      fps: 30,
      sampleRate: 48000,
      duration: cursor,
    },
    timeline: {
      tracks: [
        { id: "track-t1", type: "text", name: "T1", clips: [], muted: false, locked: false, visible: true, height: 50 },
        { id: "track-v2", type: "overlay", name: "V2", clips: [], muted: false, locked: false, visible: true, height: 60 },
        { id: "track-v1", type: "video", name: "V1", clips, muted: false, locked: false, visible: true, height: 80 },
        { id: "track-a1", type: "audio", name: "A1", clips: audioClips, muted: false, locked: false, visible: true, height: 60 },
      ],
    },
    assets,
    audioMixing: {
      ducking: {
        enabled: false,
        voiceoverTrackId: "track-a1",
        threshold: 0.03,
        ratio: 6,
        attack: 10,
        release: 300,
        makeupGain: 0,
        backgroundGain: -1,
      },
      masterVolume: 1,
    },
    export: {
      codec: "h264_videotoolbox",
      bitrate: 6000,
      audioCodec: "aac",
      audioBitrate: 192,
    },
  };
}

async function createVideoEditorProjection(params: {
  db: Db;
  tenantId: string;
  auth: AuthContext;
  run: MarketplaceAutoReviewRun;
  plan: AutoReviewPlan;
  metadata: RunMetadata;
}) {
  if (params.run.videoEditorProjectId) return params.run.videoEditorProjectId;
  const videoUrls = params.metadata.videoClipUrls ?? [];
  const referenceMode: MarketplaceAutoReviewVideoReferenceMode = params.metadata.startFrameUrls?.length
    ? "start_stop"
    : "single_storyboard_frame";
  const resolvedAudioStrategy = params.metadata.resolvedAudioStrategy ?? resolveMarketplaceAutoReviewAudioStrategy({
    outputMode: params.run.outputMode as MarketplaceAutoReviewOutputMode,
    requested: params.metadata.audioStrategy,
    videoModel: DEFAULT_VIDEO_MODEL,
  });
  const projectData = buildVideoEditorProject({ plan: params.plan, videoUrls, run: { ...params.run, metadataJson: params.metadata } as MarketplaceAutoReviewRun });
  const output = {
    schemaVersion: AUTO_REVIEW_SCHEMA_VERSION,
    productId: params.plan.productTruth.productId,
    productionRunId: params.run.productionRunId,
    conceptId: params.plan.conceptId,
    clips: params.plan.shots.map((shot, index) => ({
      id: shot.id,
      index,
      order: shot.order,
      title: shot.title,
      url: videoUrls[index],
      prompt: buildVideoPrompt(params.plan, shot, {
        audioStrategy: resolvedAudioStrategy,
        isLastShot: index === params.plan.shots.length - 1,
        referenceMode,
      }),
      voiceover: shot.voiceover,
      durationSeconds: shot.durationSeconds,
      status: videoUrls[index] ? "completed" : "pending",
    })),
    projectData,
    audioStrategy: params.metadata.audioStrategy ?? "auto",
    resolvedAudioStrategy,
    audioUrl: params.metadata.audioUrl ?? null,
    expectedNativeAudio: resolvedAudioStrategy === "native_video_audio",
    durationSeconds: projectData.settings.duration,
    resolution: "1080x1920",
  };
  const identity = buildProductionOutputProjectionIdentity({
    tenantId: params.tenantId,
    productionRunId: params.run.productionRunId,
    surface: "video_edit",
    sourceOutput: output,
  });
  const now = nowDate();
  const [existingProjection] = await params.db.select().from(mediaProductionOutputProjections).where(and(
    eq(mediaProductionOutputProjections.tenantId, params.tenantId),
    eq(mediaProductionOutputProjections.productionRunId, params.run.productionRunId),
    eq(mediaProductionOutputProjections.surface, "video_edit"),
    eq(mediaProductionOutputProjections.sourceOutputHash, identity.sourceOutputHash),
  )).limit(1);
  if (existingProjection?.surfaceRecordId) {
    await updateRun({ db: params.db, runId: params.run.id, videoEditorProjectId: existingProjection.surfaceRecordId });
    return existingProjection.surfaceRecordId;
  }
  const [inserted] = await params.db.insert(videoEditorProjects).values({
    userId: params.auth.userId,
    name: params.plan.title,
    projectData,
    thumbnailUrl: params.metadata.startFrameUrls?.[0] ?? params.metadata.storyboardFrameUrls?.[0] ?? null,
    duration: String(projectData.settings.duration),
    resolution: "1080x1920",
    trackCount: projectData.timeline.tracks.length,
    clipCount: videoUrls.length,
    isAutoSave: false,
    createdAt: now,
    updatedAt: now,
  }).returning({ id: videoEditorProjects.id });
  const projectId = String(inserted.id);
  await params.db.insert(mediaProductionOutputProjections).values({
    tenantId: params.tenantId,
    userId: params.auth.userId,
    productionRunId: params.run.productionRunId,
    storyboardRunId: params.plan.conceptId,
    surface: "video_edit",
    surfaceRecordId: projectId,
    sourceOutputHash: identity.sourceOutputHash,
    metadata: {
      idempotencyKey: identity.idempotencyKey,
      clipCount: videoUrls.length,
      marketplaceProductId: params.plan.productTruth.productId,
      autoReviewRunId: params.run.id,
      audioStrategy: params.metadata.audioStrategy ?? "auto",
      resolvedAudioStrategy,
    },
    status: "active",
    lastSyncedAt: now,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: [
      mediaProductionOutputProjections.tenantId,
      mediaProductionOutputProjections.productionRunId,
      mediaProductionOutputProjections.surface,
      mediaProductionOutputProjections.sourceOutputHash,
    ],
    set: {
      surfaceRecordId: projectId,
      metadata: {
        idempotencyKey: identity.idempotencyKey,
        clipCount: videoUrls.length,
        marketplaceProductId: params.plan.productTruth.productId,
        autoReviewRunId: params.run.id,
        audioStrategy: params.metadata.audioStrategy ?? "auto",
        resolvedAudioStrategy,
      },
      status: "active",
      lastSyncedAt: now,
      updatedAt: now,
    },
  });
  await updateRun({ db: params.db, runId: params.run.id, videoEditorProjectId: projectId });
  return projectId;
}

async function setRenderJobKey(jobId: string, suffix: string, data: unknown) {
  const redis = getRedisClient();
  await redis.set(`media-job:${jobId}:${suffix}`, JSON.stringify(data), "EX", RENDER_JOB_TTL_SECONDS);
}

async function getRenderJobKey(jobId: string, suffix: string) {
  const redis = getRedisClient();
  const raw = await redis.get(`media-job:${jobId}:${suffix}`);
  return raw ? JSON.parse(raw) : null;
}

async function addActiveRenderJob(userId: string, jobId: string) {
  const redis = getRedisClient();
  await redis.sadd(`media-jobs:user:${userId}:active`, jobId);
  await redis.zadd(`media-jobs:user:${userId}:recent`, Date.now(), jobId);
  await redis.expire(`media-jobs:user:${userId}:recent`, RENDER_JOB_TTL_SECONDS);
}

async function removeActiveRenderJob(userId: string, jobId: string) {
  const redis = getRedisClient();
  await redis.srem(`media-jobs:user:${userId}:active`, jobId);
}

async function submitRenderJob(params: {
  auth: AuthContext;
  run: MarketplaceAutoReviewRun;
  plan: AutoReviewPlan;
  project: VideoEditorProject;
}) {
  const profile = "standard" as const;
  const inputAssetKeys = Object.fromEntries(
    Object.entries(params.project.assets).map(([assetId, asset]) => [assetId, asset.path]),
  );
  const renderHash = computeRenderHash(params.project, inputAssetKeys, profile);
  const outputKey = `renders/${profile}/${renderHash}.mp4`;
  try {
    if (await storageExists(outputKey)) {
      const existingUrl = await storageResolveUrl(outputKey);
      if (existingUrl) {
        return {
          cached: true as const,
          jobId: `cached-${renderHash.slice(0, 20)}`,
          renderHash,
          queueName: "cache",
          url: existingUrl,
        };
      }
    }
  } catch {
    // Fail open and render normally if the storage cache check is unavailable.
  }
  const queueName = routeVideoJob(params.project);
  const jobId = `render-${nanoid(21)}`;
  const renderSpec = {
    project: params.project,
    profile,
    renderHash,
    outputKey,
    inputAssetKeys,
    jobId,
    params: {
      sourceMetadata: {
        source_type: "marketplace_auto_review",
        marketplace_product_id: params.plan.productTruth.productId,
        product_id: params.plan.productTruth.productId,
        production_run_id: params.run.productionRunId,
        auto_review_run_id: params.run.id,
        concept_id: params.plan.conceptId,
        audio_strategy: (params.run.metadataJson as RunMetadata)?.audioStrategy ?? "auto",
        resolved_audio_strategy: (params.run.metadataJson as RunMetadata)?.resolvedAudioStrategy,
        voiceover_source: (params.run.metadataJson as RunMetadata)?.voiceoverSource,
      },
    },
  };
  const submittedAt = Date.now();
  await setRenderJobKey(jobId, "meta", {
    userId: String(params.auth.userId),
    submittedAt,
    nextPollAt: submittedAt + 120_000,
  });
  await setRenderJobKey(jobId, "status", { status: "queued", progress: 0, jobId });
  await setRenderJobKey(jobId, "spec", renderSpec);
  await addActiveRenderJob(String(params.auth.userId), jobId);
  if (await shouldUseCloudTasksForMediaJobs()) {
    const { enqueueTask } = await import("./cloudTasks");
    await enqueueTask({
      queueName,
      handlerPath: "/_internal/tasks/process-video",
      payload: { render_spec: renderSpec, queue_name: queueName },
    });
  } else {
    const runtime = await getAppRuntimeConfig();
    const response = await fetch(`${runtime.pythonBackendUrl}/api/v1/media/tasks/process-video`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ render_spec: renderSpec, queue_name: queueName }),
    });
    if (!response.ok) {
      await setRenderJobKey(jobId, "status", { status: "error", progress: 0, jobId, message: "Failed to dispatch render job" });
      await removeActiveRenderJob(String(params.auth.userId), jobId);
      throw new Error(`Failed to dispatch render job: ${response.status}`);
    }
  }
  return { cached: false as const, jobId, renderHash, queueName };
}

function extractFirstArtifactUrl(result: unknown): string | null {
  const artifacts = asRecord(result).artifacts;
  if (!Array.isArray(artifacts)) return null;
  for (const artifact of artifacts) {
    const url = cleanText(asRecord(artifact).uri ?? asRecord(artifact).url);
    if (url) return url;
  }
  return null;
}

async function addRenderResultToLibrary(params: {
  db: Db;
  tenantId: string;
  auth: AuthContext;
  run: MarketplaceAutoReviewRun;
  plan: AutoReviewPlan;
  jobId: string;
  sourceUrl: string;
}) {
  const [existing] = await params.db
    .select({ id: libraryItems.id })
    .from(libraryItems)
    .where(and(
      eq(libraryItems.ownerUserId, params.auth.userId),
      eq(libraryItems.tenantId, params.tenantId),
      eq(libraryItems.itemType, "video"),
      sql`${libraryItems.metadata}->>'auto_review_run_id' = ${params.run.id}`,
      sql`${libraryItems.metadata}->>'source_type' = 'marketplace_auto_review_render'`,
    ))
    .limit(1);
  if (existing?.id) return existing.id;
  const metadata = {
    source_type: "marketplace_auto_review_render",
    media_job_id: params.jobId,
    marketplace_product_id: params.plan.productTruth.productId,
    product_id: params.plan.productTruth.productId,
    production_run_id: params.run.productionRunId,
    auto_review_run_id: params.run.id,
    concept_id: params.plan.conceptId,
    frame_strategy: params.run.frameStrategy,
    output_mode: params.run.outputMode,
    audio_strategy: (params.run.metadataJson as RunMetadata)?.audioStrategy ?? "auto",
    resolved_audio_strategy: (params.run.metadataJson as RunMetadata)?.resolvedAudioStrategy,
    voiceover_source: (params.run.metadataJson as RunMetadata)?.voiceoverSource,
    audio_url: (params.run.metadataJson as RunMetadata)?.audioUrl,
    product_name: params.plan.productTruth.productName,
    source_url: params.plan.productTruth.sourceUrl,
  };
  const created = await createLibraryItem({
    itemType: "video",
    source: "video_editor_render",
    title: `${params.plan.title} - Final Video`,
    description: params.plan.voiceoverScript,
    status: "indexing",
    visibility: "private",
    projectId: params.run.productionRunId,
    metadata,
    sourceUrl: params.sourceUrl,
    thumbnailUrl: params.run.metadataJson && typeof params.run.metadataJson === "object"
      ? (params.run.metadataJson as RunMetadata).startFrameUrls?.[0] ?? (params.run.metadataJson as RunMetadata).storyboardFrameUrls?.[0] ?? null
      : null,
    sourceLink: {
      linkType: "marketplace_auto_review",
      linkId: params.run.id,
      providerTaskId: params.jobId,
    },
  }, {
    userId: params.auth.userId,
    tenantId: params.tenantId,
    role: "user",
  }, params.db);
  await safeEnqueueLibraryIndexJob({
    libraryItemId: created.item.id,
    tenantId: params.tenantId,
    jobType: "initial_index",
    domain: "gallery",
    operation: "index",
    source: "gallery.marketplace_auto_review",
    sourceMetadata: metadata,
    allowThrottle: true,
  }, params.db);
  return created.item.id;
}

async function ensureRender(params: {
  db: Db;
  tenantId: string;
  auth: AuthContext;
  run: MarketplaceAutoReviewRun;
  plan: AutoReviewPlan;
  metadata: RunMetadata;
}) {
  const projectData = buildVideoEditorProject({ plan: params.plan, videoUrls: params.metadata.videoClipUrls ?? [], run: { ...params.run, metadataJson: params.metadata } as MarketplaceAutoReviewRun });
  if (!params.metadata.renderJobId && !params.run.renderJobId) {
    const submitted = await submitRenderJob({
      auth: params.auth,
      run: params.run,
      plan: params.plan,
      project: projectData,
    });
    const metadata = {
      ...params.metadata,
      renderJobId: submitted.jobId,
      renderHash: submitted.renderHash,
      renderQueueName: submitted.queueName,
      renderSubmittedAt: Date.now(),
    };
    if (submitted.cached) {
      const libraryItemId = await addRenderResultToLibrary({
        db: params.db,
        tenantId: params.tenantId,
        auth: params.auth,
        run: { ...params.run, metadataJson: metadata } as MarketplaceAutoReviewRun,
        plan: params.plan,
        jobId: submitted.jobId,
        sourceUrl: submitted.url,
      });
      await upsertRunStage({
        db: params.db,
        runId: params.run.id,
        stageKey: "render",
        stageOrder: stageIndex("render", FULL_VIDEO_STAGES),
        status: "completed",
        output: { jobId: submitted.jobId, renderHash: submitted.renderHash, resultUrl: submitted.url, cached: true },
      });
      await upsertRunStage({
        db: params.db,
        runId: params.run.id,
        stageKey: "library_finalize",
        stageOrder: stageIndex("library_finalize", FULL_VIDEO_STAGES),
        status: "completed",
        output: { libraryItemId, resultUrl: submitted.url, cached: true },
      });
      await updateRun({
        db: params.db,
        runId: params.run.id,
        status: "completed",
        currentStage: "library_finalize",
        renderJobId: submitted.jobId,
        resultLibraryItemId: libraryItemId,
        resultJson: { renderUrl: submitted.url, libraryItemId, jobId: submitted.jobId, cached: true },
        metadataJson: { ...metadata, renderUrl: submitted.url, resultLibraryItemId: libraryItemId },
        completedAt: nowDate(),
      });
      return { completed: true, libraryItemId };
    }
    await updateRun({
      db: params.db,
      runId: params.run.id,
      status: "waiting_provider",
      currentStage: "render",
      stageIndex: stageIndex("render", FULL_VIDEO_STAGES),
      stageCount: FULL_VIDEO_STAGES.length,
      renderJobId: submitted.jobId,
      metadataJson: metadata,
    });
    await upsertRunStage({
      db: params.db,
      runId: params.run.id,
      stageKey: "render",
      stageOrder: stageIndex("render", FULL_VIDEO_STAGES),
      status: "waiting_provider",
      output: { jobId: submitted.jobId, renderHash: submitted.renderHash },
    });
    return { completed: false, jobId: submitted.jobId };
  }
  const jobId = cleanText(params.run.renderJobId ?? params.metadata.renderJobId);
  if (!jobId || jobId.startsWith("cached-")) return { completed: true };
  const status = await getRenderJobKey(jobId, "status");
  if (!status) {
    if (isTimedOutSince(params.metadata.renderSubmittedAt)) {
      throw new Error(`Render job status expired or disappeared after ${Math.round(renderStaleTimeoutMs() / 60000)} minutes`);
    }
    return { completed: false, jobId };
  }
  if (status.status === "error") {
    throw new Error(cleanText(status.message) || "Render job failed");
  }
  if (status.status !== "done") {
    if (isTimedOutSince(params.metadata.renderSubmittedAt)) {
      throw new Error(`Render job timed out after ${Math.round(renderStaleTimeoutMs() / 60000)} minutes`);
    }
    return { completed: false, jobId, status };
  }
  const result = await getRenderJobKey(jobId, "result");
  const url = extractFirstArtifactUrl(result);
  if (!url) throw new Error("Render completed but result artifact URL is missing");
  await removeActiveRenderJob(String(params.auth.userId), jobId).catch(() => undefined);
  const libraryItemId = await addRenderResultToLibrary({
    db: params.db,
    tenantId: params.tenantId,
    auth: params.auth,
    run: params.run,
    plan: params.plan,
    jobId,
    sourceUrl: url,
  });
  await upsertRunStage({
    db: params.db,
    runId: params.run.id,
    stageKey: "render",
    stageOrder: stageIndex("render", FULL_VIDEO_STAGES),
    status: "completed",
    output: { jobId, resultUrl: url },
  });
  await upsertRunStage({
    db: params.db,
    runId: params.run.id,
    stageKey: "library_finalize",
    stageOrder: stageIndex("library_finalize", FULL_VIDEO_STAGES),
    status: "completed",
    output: { libraryItemId, resultUrl: url },
  });
  await updateRun({
    db: params.db,
    runId: params.run.id,
    status: "completed",
    currentStage: "library_finalize",
    resultLibraryItemId: libraryItemId,
    resultJson: { renderUrl: url, libraryItemId, jobId },
    metadataJson: { ...params.metadata, renderUrl: url, resultLibraryItemId: libraryItemId },
    completedAt: nowDate(),
  });
  return { completed: true, libraryItemId };
}

function extractPlanFromRun(run: MarketplaceAutoReviewRun): AutoReviewPlan {
  const metadata = asRecord(run.metadataJson) as RunMetadata;
  const concept = metadata.concept;
  if (!concept || typeof concept !== "object") {
    throw new Error("Auto review run is missing concept metadata");
  }
  return concept as AutoReviewPlan;
}

async function reloadRun(db: Db, runId: string, auth: AuthContext) {
  const [run] = await db
    .select()
    .from(marketplaceAutoReviewRuns)
    .where(and(eq(marketplaceAutoReviewRuns.id, runId), eq(marketplaceAutoReviewRuns.userId, auth.userId)))
    .limit(1);
  if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Auto review run not found" });
  return run;
}

export async function advanceMarketplaceAutoReviewRun(runId: string, auth: AuthContext, runtime: RuntimeContext = {}) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  let run = await reloadRun(db, runId, auth);
  if (run.status === "completed" || run.status === "failed" || run.status === "cancelled") {
    return getMarketplaceAutoReviewRun(runId, auth);
  }
  const tenantId = autoTenantId(auth);
  const stages = stageKeysForMode(run.outputMode as MarketplaceAutoReviewOutputMode);
  let metadata = asRecord(run.metadataJson) as RunMetadata;
  const plan = extractPlanFromRun(run);

  try {
    await scheduleImageAttempt({ db, tenantId, auth, run, metadata, runtime });
    run = await reloadRun(db, runId, auth);
    metadata = asRecord(run.metadataJson) as RunMetadata;

    const imageAttemptId = cleanText(metadata.imageAttemptId);
    if (!imageAttemptId) throw new Error("Image attempt was not created");
    const imageReconciled = await reconcileAttempt({
      db,
      tenantId,
      auth,
      productionRunId: run.productionRunId,
      attemptId: imageAttemptId,
      runtime,
    });
    if (imageReconciled.attempt.status === "failed") {
      await markRunFailed(db, run, imageReconciled.attempt.errorMessage ?? "Image generation failed", "image_generation");
      return getMarketplaceAutoReviewRun(runId, auth);
    }
    if (imageReconciled.attempt.status !== "completed") {
      queueMarketplaceAutoReviewAdvance(runId, auth, runtime, 120_000);
      return getMarketplaceAutoReviewRun(runId, auth);
    }
    metadata = await ensureStoryboardFrames({
      db,
      tenantId,
      auth,
      run,
      metadata,
      runtime,
      space: imageReconciled.space,
    });
    metadata = await addFrameImagesToLibrary({ db, tenantId, auth, run, plan, metadata });
    await upsertRunStage({
      db,
      runId,
      stageKey: "image_generation",
      stageOrder: stageIndex("image_generation", stages),
      status: "completed",
      providerTaskIds: metadata.imageProviderTaskIds,
      output: {
        attemptId: imageAttemptId,
        frameUrls: metadata.storyboardFrameUrls,
        startFrameUrls: metadata.startFrameUrls,
        stopFrameUrls: metadata.stopFrameUrls,
        libraryFrameItemIds: metadata.libraryFrameItemIds,
      },
    });
    await updateRun({
      db,
      runId,
      status: "running",
      currentStage: "storyboard_review",
      stageIndex: stageIndex("storyboard_review", stages),
      stageCount: stages.length,
      metadataJson: metadata,
    });
    run = await reloadRun(db, runId, auth);
    metadata = asRecord(run.metadataJson) as RunMetadata;
    const storyboardReviewId = await createStoryboardReview({ db, tenantId, auth, run, plan, metadata });
    await upsertRunStage({
      db,
      runId,
      stageKey: "storyboard_review",
      stageOrder: stageIndex("storyboard_review", stages),
      status: "completed",
      output: { storyboardReviewId },
    });

    if (run.outputMode === "storyboard_images") {
      await updateRun({
        db,
        runId,
        status: "completed",
        currentStage: "storyboard_review",
        stageIndex: stageIndex("storyboard_review", stages),
        storyboardReviewId,
        resultJson: {
          storyboardReviewId,
          frameUrls: metadata.storyboardFrameUrls,
          startFrameUrls: metadata.startFrameUrls,
          stopFrameUrls: metadata.stopFrameUrls,
          libraryFrameItemIds: metadata.libraryFrameItemIds,
          audioStrategy: metadata.audioStrategy ?? "auto",
          resolvedAudioStrategy: metadata.resolvedAudioStrategy,
        },
        completedAt: nowDate(),
      });
      return getMarketplaceAutoReviewRun(runId, auth);
    }

    await updateRun({
      db,
      runId,
      status: "running",
      currentStage: "video_generation",
      stageIndex: stageIndex("video_generation", stages),
      stageCount: stages.length,
      storyboardReviewId,
      metadataJson: metadata,
    });
    run = await reloadRun(db, runId, auth);
    metadata = asRecord(run.metadataJson) as RunMetadata;
    await ensureVideoNodes({
      db,
      tenantId,
      auth,
      productionRunId: run.productionRunId,
      plan,
      metadata,
    });
    run = await reloadRun(db, runId, auth);
    metadata = asRecord(run.metadataJson) as RunMetadata;
    await scheduleVideoAttempt({ db, tenantId, auth, run, metadata, runtime });
    run = await reloadRun(db, runId, auth);
    metadata = asRecord(run.metadataJson) as RunMetadata;
    const videoAttemptId = cleanText(metadata.videoAttemptId);
    if (!videoAttemptId) throw new Error("Video attempt was not created");
    const videoReconciled = await reconcileAttempt({
      db,
      tenantId,
      auth,
      productionRunId: run.productionRunId,
      attemptId: videoAttemptId,
      runtime,
    });
    if (videoReconciled.attempt.status === "failed") {
      await markRunFailed(db, run, videoReconciled.attempt.errorMessage ?? "Video generation failed", "video_generation");
      return getMarketplaceAutoReviewRun(runId, auth);
    }
    if (videoReconciled.attempt.status !== "completed") {
      queueMarketplaceAutoReviewAdvance(runId, auth, runtime, 180_000);
      return getMarketplaceAutoReviewRun(runId, auth);
    }
    const videoNodeIds = (metadata.videoNodeIds ?? []) as string[];
    const expectedVideoNodeIds = plan.shots.map((shot) => `${shot.id}-video`);
    const orderedVideoNodeIds = expectedVideoNodeIds.every((id) => videoNodeIds.includes(id))
      ? expectedVideoNodeIds
      : videoNodeIds;
    const videoClipUrls = orderedVideoNodeIds.map((nodeId) => outputRefUrl(videoReconciled.space.flowNodes.find((node) => node.id === nodeId)));
    assertCompleteMarketplaceAutoReviewVideoClips({
      clipUrls: videoClipUrls,
      expectedCount: plan.shots.length,
      nodeIds: orderedVideoNodeIds,
    });
    metadata = { ...metadata, videoClipUrls };
    await updateRun({ db, runId, metadataJson: metadata });
    await upsertRunStage({
      db,
      runId,
      stageKey: "video_generation",
      stageOrder: stageIndex("video_generation", stages),
      status: "completed",
      providerTaskIds: metadata.videoProviderTaskIds,
      output: {
        attemptId: videoAttemptId,
        videoClipUrls,
        mediaTaskIds: productionNodeOutputTaskIds(videoReconciled.space.flowNodes, orderedVideoNodeIds),
      },
    });
    await updateRun({
      db,
      runId,
      status: "running",
      currentStage: "audio_generation",
      stageIndex: stageIndex("audio_generation", stages),
      stageCount: stages.length,
      metadataJson: metadata,
    });
    run = await reloadRun(db, runId, auth);
    metadata = asRecord(run.metadataJson) as RunMetadata;
    const audioResult = await ensureAudioForVideo({ db, tenantId, auth, run, plan, metadata, runtime });
    metadata = audioResult.metadata;
    if (!audioResult.completed) {
      queueMarketplaceAutoReviewAdvance(runId, auth, runtime, 180_000);
      return getMarketplaceAutoReviewRun(runId, auth);
    }
    run = await reloadRun(db, runId, auth);
    metadata = asRecord(run.metadataJson) as RunMetadata;
    await updateRun({
      db,
      runId,
      status: "running",
      currentStage: "video_edit",
      stageIndex: stageIndex("video_edit", stages),
      stageCount: stages.length,
      metadataJson: metadata,
    });
    run = await reloadRun(db, runId, auth);
    metadata = asRecord(run.metadataJson) as RunMetadata;
    const videoEditorProjectId = await createVideoEditorProjection({ db, tenantId, auth, run, plan, metadata });
    await upsertRunStage({
      db,
      runId,
      stageKey: "video_edit",
      stageOrder: stageIndex("video_edit", stages),
      status: "completed",
      output: { videoEditorProjectId },
    });
    await updateRun({
      db,
      runId,
      status: "running",
      currentStage: "render",
      stageIndex: stageIndex("render", stages),
      stageCount: stages.length,
      videoEditorProjectId,
    });
    run = await reloadRun(db, runId, auth);
    metadata = asRecord(run.metadataJson) as RunMetadata;
    const render = await ensureRender({ db, tenantId, auth, run, plan, metadata });
    if (!render.completed) {
      queueMarketplaceAutoReviewAdvance(runId, auth, runtime, 180_000);
    }
    return getMarketplaceAutoReviewRun(runId, auth);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Marketplace auto review failed";
    await markRunFailed(db, run, message, run.currentStage as StageKey);
    return getMarketplaceAutoReviewRun(runId, auth);
  }
}

const backgroundTimers = new Map<string, NodeJS.Timeout>();

export function queueMarketplaceAutoReviewAdvance(
  runId: string,
  auth: AuthContext,
  runtime: RuntimeContext = {},
  delayMs = 60_000,
) {
  if (!cleanText(runtime.userToken)) {
    // Provider status polling needs a token. The run remains durable and can be
    // advanced by the next authenticated query/mutation.
    return;
  }
  const key = `${auth.userId}:${runId}`;
  const existing = backgroundTimers.get(key);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    backgroundTimers.delete(key);
    advanceMarketplaceAutoReviewRun(runId, auth, runtime).catch((error) => {
      console.error("[marketplaceAutoReview] background advance failed", {
        runId,
        userId: auth.userId,
        message: error instanceof Error ? error.message : String(error),
      });
    });
  }, Math.max(500, delayMs));
  timer.unref?.();
  backgroundTimers.set(key, timer);
}

export async function cancelMarketplaceAutoReviewRun(runId: string, auth: AuthContext) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  const run = await reloadRun(db, runId, auth);
  if (run.status === "completed" || run.status === "failed") return getMarketplaceAutoReviewRun(runId, auth);
  await updateRun({
    db,
    runId,
    status: "cancelled",
    currentStage: run.currentStage,
    completedAt: nowDate(),
  });
  return getMarketplaceAutoReviewRun(runId, auth);
}
