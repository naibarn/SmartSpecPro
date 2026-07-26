import { buildProductionStableHash } from "../../shared/mediaProduction";
import {
  validateNineShotContract,
  type HumanApprovalCheckpointV1,
} from "@shared/marketplaceAutoReview/stagedContracts";

export type StagedStoryArcProduct = {
  productId: string;
  productName: string;
  description?: string | null;
  imageUrls: string[];
};

export type StagedStoryArcShot = {
  shotId: number;
  title: string;
  storySummary: string;
  visualSummary: string;
  dialogue: string;
  durationSeconds: 10;
};

export type StagedStoryArcPlan = {
  planRevision: number;
  title: string;
  storySummary: string;
  product: StagedStoryArcProduct;
  shots: StagedStoryArcShot[];
  referenceManifestHash: string;
  storyPlanHash: string;
  source: "bounded_story_arc_fallback";
};

const SHOT_BEATS = [
  ["เปิดเรื่อง", "เปิดภาพสินค้าแบบเต็มชิ้นจากมุมที่เห็นตัวตนของสินค้าได้ชัด"],
  ["เผยสินค้า", "พาสายตาดูรูปทรงและรายละเอียดที่มีหลักฐานจากภาพอ้างอิง"],
  [
    "บริบทการใช้งาน",
    "วางสินค้าในบริบทการใช้งานที่ไม่เพิ่มคุณสมบัติที่ไม่มีหลักฐาน",
  ],
  ["ฟังก์ชันหลัก", "แสดงการใช้งานหรือจุดเด่นที่เห็นได้จากข้อมูลสินค้า"],
  ["ฟังก์ชันรอง", "ย้ำอีกหนึ่งมุมของสินค้าโดยคงรูปทรงและสีตามภาพอ้างอิง"],
  [
    "รายละเอียดวัสดุ",
    "เข้าใกล้รายละเอียดพื้นผิว งานประกอบ หรือส่วนที่มองเห็นได้",
  ],
  [
    "ความต่อเนื่อง",
    "เชื่อมกลับมายังสินค้าชิ้นเดิมโดยไม่เปลี่ยนรุ่นหรืออุปกรณ์",
  ],
  ["สรุปการใช้งาน", "แสดงภาพรวมการใช้งานอย่างสงบและตรวจสอบได้"],
  ["ปิดเรื่อง", "ปิดด้วยภาพสินค้าชัดเจนและคำชวนติดตามแบบไม่กล่าวอ้างเกินจริง"],
] as const;

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function bounded(value: string, max: number): string {
  return value.slice(0, max).trim();
}

export function buildStagedStoryArcPlan(input: {
  runId: string;
  product: StagedStoryArcProduct;
  referenceManifestHash?: string | null;
  revision?: number;
  previousStorySummary?: string | null;
}): StagedStoryArcPlan {
  const productName = bounded(
    clean(input.product.productName) || "สินค้า",
    240
  );
  const productId = clean(input.product.productId);
  const productDescription = bounded(clean(input.product.description), 500);
  const storySummary = bounded(
    clean(input.previousStorySummary) ||
      `รีวิว ${productName} แบบต่อเนื่อง 9 ช็อต โดยยึดภาพอ้างอิงสินค้าและข้อมูลที่ตรวจสอบได้เป็นหลัก`,
    500
  );
  const shots = SHOT_BEATS.map(([title, visual], index) => {
    const shotId = index + 1;
    return {
      shotId,
      title,
      storySummary: bounded(`${shotId}. ${title}: ${visual}`, 600),
      visualSummary: bounded(visual, 400),
      dialogue: bounded(
        `ช็อตที่ ${shotId} พาไปดู${title}ของ${productName} โดยยึดข้อมูลและภาพอ้างอิงที่ตรวจสอบได้`,
        320
      ),
      durationSeconds: 10 as const,
    };
  });
  const product = {
    productId,
    productName,
    description: productDescription || null,
    imageUrls: input.product.imageUrls.map(clean).filter(Boolean).slice(0, 5),
  } satisfies StagedStoryArcProduct;
  const referenceManifestHash =
    clean(input.referenceManifestHash) ||
    buildProductionStableHash({ productId, imageUrls: product.imageUrls });
  const planRevision = Math.max(1, Math.floor(input.revision ?? 1));
  const storyPlanHash = buildProductionStableHash({
    runId: input.runId,
    planRevision,
    storySummary,
    product,
    shots,
    referenceManifestHash,
  });
  const plan = {
    planRevision,
    title: `Marketplace Auto Review: ${productName}`,
    storySummary,
    product,
    shots,
    referenceManifestHash,
    storyPlanHash,
    source: "bounded_story_arc_fallback" as const,
  };
  const contract = validateNineShotContract(
    shots.map(shot => ({
      shotId: shot.shotId,
      durationSeconds: shot.durationSeconds,
    }))
  );
  if (!contract.valid) {
    throw new Error(
      `staged_story_plan_invalid:${contract.reasonCodes.join(",")}`
    );
  }
  return plan;
}

export function buildStagedImagePrompt(input: {
  plan: StagedStoryArcPlan;
  shot: StagedStoryArcShot;
}): string {
  return [
    `Create one vertical 9:16 product-review image for shot ${input.shot.shotId}.`,
    `Approved story summary: ${input.plan.storySummary}`,
    `Approved shot brief: ${input.shot.storySummary}`,
    `Visual direction: ${input.shot.visualSummary}`,
    "Use @Image1 as the primary product reference and preserve the product's visible shape, color, materials, labels, and proportions exactly.",
    "Do not invent accessories, claims, text, price, badges, logos, watermarks, or marketplace UI.",
    "Keep the product clearly visible and do not render the dialogue as on-screen text.",
  ].join("\n");
}

export function buildStagedVideoPrompt(input: {
  plan: StagedStoryArcPlan;
  shot: StagedStoryArcShot;
}): string {
  return [
    `Create a 10-second vertical 9:16 product-review video for shot ${input.shot.shotId}.`,
    `Use the accepted image artifact for shot ${input.shot.shotId} as the exact visual source.`,
    `Approved dialogue (must not be rewritten): ${input.shot.dialogue}`,
    `Approved story context: ${input.shot.storySummary}`,
    "Use restrained camera motion that preserves product identity and continuity.",
    "Do not add unsupported claims, price text, captions, logos, watermarks, or marketplace UI.",
  ].join("\n");
}

export function buildStagedCheckpoint(input: {
  checkpointId: string;
  kind: HumanApprovalCheckpointV1["kind"];
  shotId?: number | null;
  revision: number;
  contentHash: string;
  estimatedCredits?: number | null;
  model?: string | null;
  provider?: string | null;
  referenceManifestHash?: string | null;
}): HumanApprovalCheckpointV1 {
  const shotScoped =
    input.kind === "image_prompt" ||
    input.kind === "image_result" ||
    input.kind === "video_prompt" ||
    input.kind === "video_result";
  return {
    checkpointId: input.checkpointId,
    kind: input.kind,
    scope: shotScoped ? "shot" : "run",
    shotId: shotScoped ? (input.shotId ?? null) : null,
    state: "awaiting",
    revision: Math.max(1, input.revision),
    contentHash: input.contentHash,
    approvedHash: null,
    approvedByUserId: null,
    approvedAt: null,
    consumedAt: null,
    consumedByOperationId: null,
    rejectionReasonCode: null,
    estimatedCredits: input.estimatedCredits ?? null,
    approvedModel: input.model ?? null,
    approvedProvider: input.provider ?? null,
    approvedSafetyVerdict: "passed",
    approvedReferenceManifestHash: input.referenceManifestHash ?? null,
  };
}

export function buildStagedPlanView(plan: StagedStoryArcPlan) {
  return {
    title: plan.title,
    storySummary: plan.storySummary,
    planRevision: plan.planRevision,
    storyPlanHash: plan.storyPlanHash,
    shots: plan.shots,
    referenceManifestHash: plan.referenceManifestHash,
  };
}
