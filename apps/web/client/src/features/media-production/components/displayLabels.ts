import type {
  ProductionContextAssetZone,
  ProductionEvidenceStatus,
  ProductionFlowEdgeKind,
  ProductionNodeKind,
  ProductionReferenceInput,
} from "@shared/mediaProduction";
import type { ProductionLocale } from "./types";

const nodeKindLabels: Partial<Record<ProductionNodeKind, { en: string; th: string }>> = {
  goal_brief: { en: "Goal brief", th: "บรีฟงาน" },
  context_summary: { en: "Context summary", th: "สรุปบริบท" },
  story_strategy: { en: "Story strategy", th: "กลยุทธ์เรื่อง" },
  script_generation: { en: "Script draft", th: "ร่างสคริปต์" },
  script_revision: { en: "Script revision", th: "แก้สคริปต์" },
  storyboard_planning: { en: "Storyboard planning", th: "วางแผนสตอรีบอร์ด" },
  planning: { en: "Planning", th: "วางแผน" },
  script: { en: "Script", th: "สคริปต์" },
  shot_breakdown: { en: "Shot breakdown", th: "แตกช็อต" },
  prompt_packaging: { en: "Prepare prompt", th: "เตรียมพรอมป์" },
  character_reference: { en: "Character reference", th: "อ้างอิงตัวละคร" },
  product_reference: { en: "Product reference", th: "อ้างอิงสินค้า" },
  scene_reference: { en: "Scene reference", th: "อ้างอิงฉาก" },
  brand_reference: { en: "Brand reference", th: "อ้างอิงแบรนด์" },
  audio_reference: { en: "Audio reference", th: "อ้างอิงเสียง" },
  source_video_reference: { en: "Source video reference", th: "อ้างอิงวิดีโอต้นฉบับ" },
  video_shot: { en: "Video shot", th: "ช็อตวิดีโอ" },
  image: { en: "Image", th: "ภาพ" },
  image_generate: { en: "Generate image", th: "สร้างภาพ" },
  video: { en: "Video", th: "วิดีโอ" },
  video_generate: { en: "Generate video", th: "สร้างวิดีโอ" },
  image_edit: { en: "Edit image", th: "แก้ภาพ" },
  image_upscale_enhance: { en: "Enhance image", th: "เพิ่มคุณภาพภาพ" },
  image_to_video: { en: "Image to video", th: "ภาพเป็นวิดีโอ" },
  video_to_video: { en: "Video to video", th: "วิดีโอเป็นวิดีโอ" },
  tts: { en: "Text to speech", th: "อ่านข้อความ" },
  text_to_speech: { en: "Text to speech", th: "อ่านข้อความ" },
  qa: { en: "Quality check", th: "ตรวจคุณภาพ" },
  handoff: { en: "Handoff", th: "ส่งต่องาน" },
  storyboard_review: { en: "Storyboard review", th: "รีวิวสตอรีบอร์ด" },
  video_edit: { en: "Video edit", th: "ตัดต่อวิดีโอ" },
};

const edgeKindLabels: Partial<Record<ProductionFlowEdgeKind, { en: string; th: string }>> = {
  dependency: { en: "Dependency", th: "ลำดับงาน" },
  reference: { en: "Reference", th: "อ้างอิง" },
  handoff: { en: "Handoff", th: "ส่งต่อ" },
  qa: { en: "QA", th: "ตรวจคุณภาพ" },
  uses_asset: { en: "Uses asset", th: "ใช้แอสเซ็ต" },
  requires_before: { en: "Runs before", th: "ทำก่อน" },
  generates_for: { en: "Generates for", th: "สร้างให้" },
  qa_of: { en: "QA of", th: "ตรวจงานของ" },
  approval_gate: { en: "Approval gate", th: "จุดอนุมัติ" },
  handoff_to: { en: "Handoff to", th: "ส่งต่อไป" },
  fallback_to: { en: "Fallback to", th: "ทางสำรอง" },
};

const evidenceStatusLabels: Partial<Record<ProductionEvidenceStatus | "ready" | "warning" | "not_loaded" | "none", { en: string; th: string }>> = {
  approved: { en: "Approved", th: "อนุมัติแล้ว" },
  needs_review: { en: "Needs review", th: "รอตรวจ" },
  blocked: { en: "Blocked", th: "ติดปัญหา" },
  ready: { en: "Ready", th: "พร้อมใช้" },
  warning: { en: "Needs attention", th: "ควรตรวจ" },
  not_loaded: { en: "No evidence loaded", th: "ยังไม่มีหลักฐาน" },
  none: { en: "No evidence", th: "ยังไม่มีหลักฐาน" },
};

const targetLabels: Record<string, { en: string; th: string }> = {
  storyboard_review: { en: "Storyboard review", th: "รีวิวสตอรีบอร์ด" },
  video_edit: { en: "Video edit", th: "ตัดต่อวิดีโอ" },
  image: { en: "Image", th: "ภาพ" },
  video: { en: "Video", th: "วิดีโอ" },
  audio: { en: "Audio", th: "เสียง" },
};

const deliveryModeLabels: Record<string, { en: string; th: string }> = {
  single_shot: { en: "Single shot", th: "ช็อตเดียว" },
  multi_shot: { en: "Multi-shot", th: "หลายช็อต" },
};

const assetKindLabels: Partial<Record<ProductionReferenceInput["kind"], { en: string; th: string }>> = {
  reference_image: { en: "Reference image", th: "ภาพอ้างอิง" },
  product_image: { en: "Product image", th: "ภาพสินค้า" },
  marketplace_product: { en: "Marketplace product", th: "สินค้าจาก marketplace" },
  character_asset: { en: "Character", th: "ตัวละคร" },
  audio_asset: { en: "Audio", th: "เสียง" },
  source_video: { en: "Source video", th: "วิดีโอต้นฉบับ" },
  generated_media: { en: "Generated media", th: "สื่อที่สร้างแล้ว" },
};

const zoneLabels: Record<ProductionContextAssetZone | "all", { en: string; th: string }> = {
  all: { en: "All", th: "ทั้งหมด" },
  cast: { en: "Cast", th: "ตัวละคร" },
  products: { en: "Products", th: "สินค้า" },
  scene_mood: { en: "Scene", th: "ฉาก" },
  audio: { en: "Audio", th: "เสียง" },
  generated: { en: "Generated", th: "สร้างแล้ว" },
  targets: { en: "Targets", th: "ปลายทาง" },
};

function pick(label: { en: string; th: string } | undefined, value: string, locale?: ProductionLocale): string {
  if (label) return locale === "th" ? label.th : label.en;
  return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function nodeKindLabel(kind: ProductionNodeKind | string, locale?: ProductionLocale): string {
  return pick(nodeKindLabels[kind as ProductionNodeKind], kind, locale);
}

export function edgeKindLabel(kind: ProductionFlowEdgeKind | string, locale?: ProductionLocale): string {
  return pick(edgeKindLabels[kind as ProductionFlowEdgeKind], kind, locale);
}

export function evidenceStatusLabel(status: string | undefined, locale?: ProductionLocale): string {
  return pick(evidenceStatusLabels[(status || "not_loaded") as keyof typeof evidenceStatusLabels], status || "not_loaded", locale);
}

export function targetLabel(target: string, locale?: ProductionLocale): string {
  return pick(targetLabels[target], target, locale);
}

export function deliveryModeLabel(mode: string | undefined, locale?: ProductionLocale): string {
  return pick(deliveryModeLabels[mode || ""], mode || "", locale);
}

export function assetKindLabel(kind: ProductionReferenceInput["kind"], locale?: ProductionLocale): string {
  return pick(assetKindLabels[kind], kind, locale);
}

export function zoneLabel(zone: ProductionContextAssetZone | "all", locale?: ProductionLocale): string {
  return pick(zoneLabels[zone], zone, locale);
}
