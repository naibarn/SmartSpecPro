import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { AlertCircle, AlertTriangle, Archive, ArrowRight, CheckCircle, Clock, Copy, Eye, Film, Image as ImageIcon, Layers, ListTree, Loader2, Lock, Maximize2, MoreHorizontal, Music, PackagePlus, Paperclip, Play, RotateCcw, Route, Save, Search, Settings2, ShieldCheck, Sparkles, Trash2, Video, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ProductionContextAssetZone, ProductionEvidenceStatus, ProductionFlowNode, ProductionGenerationDefaults, ProductionGoal, ProductionPlanningSelection, ProductionReferenceInput, ProductionSpace } from "@shared/mediaProduction";
import { ContextAssetBoard } from "./ContextAssetBoard";
import { NodeConfigPanel } from "./NodeConfigPanel";
import { ProductEvidenceTray } from "./ProductEvidenceTray";
import { ProductionFlowCanvas } from "./ProductionFlowCanvas";
import { evidenceStatusLabel, targetLabel } from "./displayLabels";
import type { ProductionCanvasCallbacks, ProductionLocale, ProductionWorkspaceViewState } from "./types";

export interface ProductionWorkspaceProps extends ProductionCanvasCallbacks {
  displayMode?: "full" | "planning" | "workflow" | "canvas";
  title: string;
  status: string;
  summary: string;
  productionRunId?: string;
  onTitleChange: (value: string) => void;
  onSummaryChange: (value: string) => void;
  onBriefChange?: (brief: ProductionGoal) => void;
  onSave: () => void;
  onProjectSearchOpen?: () => void;
  onNewProject?: () => void;
  onCreateFixturePlan: () => void;
  storyConceptWizard?: ProductionStoryConceptWizardState | null;
  onSelectStoryConcept?: (conceptId: string) => void;
  onConfirmStoryConceptPlan?: (conceptId: string) => void;
  onRegenerateStoryConcepts?: (conceptId?: string) => void;
  onGenerateStoryConceptInfographic?: (conceptId: string) => void;
  onResetStoryConcepts?: () => void;
  onOpenVideoShot: () => void;
  isSaving?: boolean;
  isPlanning?: boolean;
  locale?: ProductionLocale;
  space?: ProductionSpace | null;
  selectedNodeId?: string | null;
  workspaceViewState?: ProductionWorkspaceViewState;
  workspaceStateMessage?: string;
  workspaceStatePrimaryLabel?: string;
  workspaceStateSecondaryLabel?: string;
  onWorkspacePrimaryAction?: () => void;
  onWorkspaceSecondaryAction?: () => void;
  onArchiveProject?: () => void;
  onRestoreProject?: () => void;
  onDeleteProject?: () => void;
  isLifecycleActionDisabled?: boolean;
  planningSkills?: Array<{
    id: string;
    slug: string;
    title: string;
    tags: string[];
    compatibility: ProductionPlanningSelection["compatibility"];
  }>;
  selectedPlanningSkillId?: string;
  planningSelection?: ProductionPlanningSelection;
  selectedPlanningModel?: string;
  planningModelMode?: ProductionPlanningSelection["modelMode"];
  planningModelOptions?: ProductionPlanningModelOption[];
  onPlanningSkillChange?: (skillId: string) => void;
  onPlanningModelChange?: (modelMode: ProductionPlanningSelection["modelMode"], modelId?: string) => void;
  storyboardBuildMode?: ProductionStoryboardBuildMode;
  onStoryboardBuildModeChange?: (mode: ProductionStoryboardBuildMode) => void;
  storyboardClipDurationSeconds?: number;
  storyboardClipDurationOptions?: number[];
  onStoryboardClipDurationSecondsChange?: (seconds: number) => void;
  generationDefaults?: ProductionGenerationDefaults;
  imageModelOptions?: ProductionMediaModelOption[];
  videoModelOptions?: ProductionMediaModelOption[];
  storyboardReferenceSkillId?: string;
  storyboardReferenceSkillOptions?: Array<{ id: string; label: string }>;
  onStoryboardReferenceSkillChange?: (skillId: string) => void;
  onGenerationDefaultChange?: (patch: Partial<ProductionGenerationDefaults>) => void;
  onSetProductRole?: (productId: string, nextRole: string | null) => void;
  onSetClaimStatus?: (productId: string, claimId: string, nextStatus: ProductionEvidenceStatus) => void;
  onOpenEvidence?: (evidenceId: string) => void;
  onRemoveEvidenceFromClaim?: (productId: string, claimId: string, evidenceId: string) => void;
  onAddPlanningAsset?: (asset: ProductionReferenceInput) => void;
  onRemovePlanningAsset?: (asset: ProductionReferenceInput) => void;
  onCancelExecution?: (attemptId?: string) => void;
  onRepairOutputRefs?: () => void;
  onSendStoryboardReview?: () => void;
  onSendVideoEdit?: () => void;
  isHandoffDisabled?: boolean;
}

export interface ProductionStoryConceptOption {
  id: string;
  title: string;
  angle: string;
  audience: string;
  painPoint: string;
  hook: string;
  sellingPoints: string[];
  objectionsTrust: string[];
  useCase: string;
  storyOptionId?: string;
  storyDimension?: "problem_solution" | "objection_trust" | "quick_demo" | "use_case_moment";
  narrativeStructure?: string;
  emotionalTone?: string;
  hookTechnique?: string;
  hookFormula?: string;
  source?: "marketplace_insight" | "llm_synthesized" | "local_fallback";
  videoBrief?: Record<string, unknown>;
  conceptDetails?: string;
  productFacts?: string;
  visualSummary?: string;
  keyVisualElements?: string[];
  storyboardThumbnailNotes?: string;
  infographicPrompt?: string;
  infographicTaskId?: string;
  infographicBackendTaskId?: string;
  infographicProviderTaskId?: string;
  infographicUrl?: string;
  infographicStatus?: "idle" | "prompt_ready" | "queued" | "generating" | "ready" | "failed";
  infographicError?: string;
  infographicSubmittedAt?: string;
  infographicGeneratedAt?: string;
  infographicModelId?: string;
  sceneTimeline: Array<{
    timeRange: string;
    title: string;
    detail: string;
  }>;
  risks: string[];
  sourceSignals: string[];
}

export interface ProductionMediaModelOption {
  modelId: string;
  name: string;
  provider?: string;
  isDefault?: boolean;
}

export interface ProductionPlanningModelOption {
  modelId: string;
  name: string;
  provider?: string;
  supportsThinking?: boolean;
  supportsVision?: boolean;
  contextLength?: number | null;
  isDefault?: boolean;
}

export type ProductionStoryboardBuildMode = "image_first" | "prompt_to_video";

export interface ProductionStoryConceptWizardState {
  status: "idle" | "options_ready";
  options: ProductionStoryConceptOption[];
  selectedId?: string | null;
  contextSummary?: string;
  generatedAt?: string;
  generationSeed?: string;
  source?: "marketplace_insight" | "llm_synthesized" | "local_fallback";
}

const fallbackSpace: ProductionSpace = {
  schemaVersion: "1.0.0",
  productionRunId: "fixture",
  version: 1,
  status: "plan_ready_for_review",
  brief: { summary: "Fixture Production Space" },
  contextAssets: [
    { id: "asset-hero", title: "Hero Product Packshot", kind: "product_image", source: "fixture", assetId: "product-1" },
    { id: "asset-voice", title: "Brand Voice Reference", kind: "audio_asset", source: "fixture" },
  ],
  productEvidenceManifest: {
    manifestId: "fixture-evidence",
    products: [
      {
        id: "product-1",
        productId: "product-1",
        title: "Hero Product Packshot",
        approvalState: "needs_review",
        claimEvidence: [{ claimId: "claim-1", evidenceIds: ["asset-hero"], status: "needs_review", riskLevel: "medium" }],
      },
    ],
    requiredClaimIds: ["claim-1"],
    status: "warning",
    warnings: ["Product evidence review pending."],
  },
  shots: [
    { id: "shot-1", title: "Hook", order: 1, durationSeconds: 4, nodeIds: ["brief", "hero-image", "shot-1-node"] },
    { id: "shot-2", title: "Proof", order: 2, durationSeconds: 6, nodeIds: ["proof-video", "handoff"] },
  ],
  flowNodes: [
    {
      id: "brief",
      kind: "planning",
      title: "Goal Brief",
      status: "ready",
      position: { x: 0, y: 80 },
      metadata: {
        objective: "Create a short product story from approved evidence.",
        concept: "Hook with the hero product, prove the claim, then hand off for final review.",
        plan: ["Confirm product truth", "Generate hero image", "Build proof clip", "Review before edit"],
        expectedOutput: "A reviewable production graph.",
      },
    },
    {
      id: "hero-image",
      kind: "image",
      title: "Hero Product Image",
      status: "warning",
      position: { x: 280, y: 20 },
      readinessIssues: ["Product evidence review pending"],
      metadata: { objective: "Create the visual anchor for the product hook.", expectedOutput: "Hero image output attached to this node." },
    },
    {
      id: "shot-1-node",
      kind: "video_shot",
      title: "Shot 1 Group",
      status: "ready",
      position: { x: 280, y: 180 },
      shotId: "shot-1",
      metadata: { objective: "Hold the shot-level script, cast, product use, and child node plan.", expectedOutput: "Editable Video Shot record." },
    },
    {
      id: "proof-video",
      kind: "video",
      title: "Proof Clip",
      status: "blocked",
      position: { x: 600, y: 100 },
      readinessIssues: ["Missing approved source video"],
      metadata: { objective: "Generate the proof clip once source evidence is ready.", plan: "Blocked until source video is approved." },
    },
    {
      id: "handoff",
      kind: "video_edit",
      title: "Video Edit Preview",
      status: "disabled",
      position: { x: 920, y: 100 },
      metadata: { objective: "Preview downstream Video Edit handoff after generation and QA." },
    },
  ],
  flowEdges: [
    { id: "brief-hero", source: "brief", target: "hero-image" },
    { id: "hero-shot", source: "hero-image", target: "shot-1-node" },
    { id: "shot-proof", source: "shot-1-node", target: "proof-video" },
    { id: "proof-handoff", source: "proof-video", target: "handoff" },
  ],
  planningSelection: {
    skillId: "media-production-storyboard-planner",
    skillSlug: "media-production-storyboard-planner",
    skillTitle: "Media Production Storyboard Planner",
    tags: ["production_planning", "storyboard_planning"],
    modelMode: "auto",
    compatibility: "compatible",
    contextPack: {
      packId: "fixture-context-pack",
      goalHash: "fixture",
      assetCount: 2,
      productEvidenceStatus: "warning",
      shotCount: 2,
      desiredTargets: ["storyboard_review", "video_edit"],
      capabilityIds: ["image", "video", "tts"],
    },
  },
};

function formatProductionStatus(status: string, isThai: boolean): string {
  const labels: Record<string, { en: string; th: string }> = {
    draft: { en: "Draft", th: "แบบร่าง" },
    planning: { en: "Planning", th: "กำลังวางแผน" },
    plan_ready_for_review: { en: "Plan ready for review", th: "แผนพร้อมตรวจ" },
    approved: { en: "Approved", th: "อนุมัติแล้ว" },
    completed: { en: "Completed", th: "เสร็จสิ้น" },
    archived: { en: "Archived", th: "เก็บถาวร" },
    deleted: { en: "Deleted", th: "ลบแล้ว" },
  };
  const label = labels[status];
  if (label) return isThai ? label.th : label.en;
  return status.replace(/_/g, " ").replace(/\b\w/g, (value) => value.toUpperCase());
}

const goalTypeOptions = [
  { value: "single_shot", en: "Single shot", th: "วิดีโอเดียว / ช็อตเดียว" },
  { value: "multi_shot_single_video", en: "Multi-shot single video", th: "วิดีโอเดียว / หลายช็อต" },
  { value: "storyboard_multi_video", en: "Storyboard multiple videos", th: "Storyboard หลายวิดีโอ" },
  { value: "product_demo", en: "Product demo", th: "เดโมสินค้า" },
  { value: "ugc_review", en: "UGC review", th: "รีวิว UGC" },
  { value: "social_ad", en: "Social ad", th: "โฆษณาโซเชียล" },
];

const audienceOptions = [
  { value: "general_consumers", en: "General consumers", th: "ผู้บริโภคทั่วไป" },
  { value: "new_parents", en: "New parents", th: "พ่อแม่มือใหม่" },
  { value: "home_living_buyers", en: "Home & living buyers", th: "คนแต่งบ้าน / ของใช้ในบ้าน" },
  { value: "beauty_shoppers", en: "Beauty shoppers", th: "ผู้ซื้อสินค้า beauty" },
  { value: "small_business_owners", en: "Small business owners", th: "เจ้าของธุรกิจขนาดเล็ก" },
  { value: "existing_customers", en: "Existing customers", th: "ลูกค้าเดิม" },
];

const platformOptions = [
  { value: "TikTok", en: "TikTok", th: "TikTok" },
  { value: "Instagram Reels", en: "Instagram Reels", th: "Instagram Reels" },
  { value: "YouTube Shorts", en: "YouTube Shorts", th: "YouTube Shorts" },
  { value: "Facebook", en: "Facebook", th: "Facebook" },
  { value: "Shopee", en: "Shopee", th: "Shopee" },
  { value: "Lazada", en: "Lazada", th: "Lazada" },
  { value: "Website", en: "Website", th: "เว็บไซต์" },
];

const defaultStoryboardClipDurationOptions = [5, 6, 8, 9, 10, 12, 15];
const storyboardShotCountOptions = Array.from({ length: 12 }, (_, index) => index + 1);
const baseDurationOptions = [6, 10, 15, 20, 30, 40, 45, 60, 90, 120];
const durationOptions = Array.from(new Set([
  ...baseDurationOptions,
  ...defaultStoryboardClipDurationOptions.flatMap((seconds) => (
    storyboardShotCountOptions.map((shotCount) => seconds * shotCount)
  )),
])).sort((left, right) => left - right);
const aspectRatioOptions = ["9:16", "16:9", "1:1", "4:5", "3:4", "21:9"];
const languageOptions = [
  { value: "th", en: "Thai", th: "ไทย" },
  { value: "en", en: "English", th: "อังกฤษ" },
  { value: "ja", en: "Japanese", th: "ญี่ปุ่น" },
  { value: "ko", en: "Korean", th: "เกาหลี" },
  { value: "zh", en: "Chinese", th: "จีน" },
];
const maxPlanningAttachments = 10;

const planningImageDropZones: Array<{
  zone: Extract<ProductionContextAssetZone, "cast" | "products" | "scene_mood">;
  kind: ProductionReferenceInput["kind"];
  role: string;
}> = [
  { zone: "cast", kind: "character_asset", role: "character_reference" },
  { zone: "products", kind: "product_image", role: "product_reference" },
  { zone: "scene_mood", kind: "reference_image", role: "environment_reference" },
];

function inferPlanningAssetZone(asset: ProductionReferenceInput): ProductionContextAssetZone {
  if (asset.zone) return asset.zone;
  if (asset.kind === "marketplace_product" || asset.kind === "product_image") return "products";
  if (asset.kind === "character_asset") return "cast";
  if (asset.kind === "audio_asset") return "audio";
  if (asset.kind === "generated_media") return "generated";
  if (asset.kind === "source_video") return "targets";
  return "scene_mood";
}

function planningAttachmentLabel(zone: ProductionContextAssetZone, isThai: boolean): string {
  const labels: Record<ProductionContextAssetZone, { en: string; th: string }> = {
    cast: { en: "Characters", th: "ตัวละคร" },
    products: { en: "Products", th: "สินค้า" },
    scene_mood: { en: "Scenes", th: "ฉาก" },
    audio: { en: "Audio", th: "เสียง" },
    generated: { en: "Generated", th: "ภาพ/สื่อประกอบ" },
    targets: { en: "Video / target", th: "วิดีโอ / ปลายทาง" },
  };
  return isThai ? labels[zone].th : labels[zone].en;
}

function planningAttachmentIcon(asset: ProductionReferenceInput) {
  if (asset.kind === "audio_asset") return Music;
  if (asset.kind === "source_video") return Video;
  if (asset.kind === "marketplace_product" || asset.kind === "product_image") return PackagePlus;
  return ImageIcon;
}

function normalizePlanningAssetForZone(asset: ProductionReferenceInput, zone?: ProductionContextAssetZone): ProductionReferenceInput {
  if (!zone) return asset.zone ? asset : { ...asset, zone: inferPlanningAssetZone(asset) };
  const keepSpecificRole = asset.role && asset.role !== "visual_reference";
  if (zone === "cast") {
    return { ...asset, kind: "character_asset", zone, role: keepSpecificRole ? asset.role : "character_reference" };
  }
  if (zone === "products") {
    const kind = asset.kind === "marketplace_product" ? "marketplace_product" : "product_image";
    return { ...asset, kind, zone, role: keepSpecificRole ? asset.role : "product_reference" };
  }
  if (zone === "scene_mood") {
    return { ...asset, kind: asset.kind === "generated_media" ? "generated_media" : "reference_image", zone, role: keepSpecificRole ? asset.role : "environment_reference" };
  }
  if (zone === "audio") {
    return { ...asset, kind: "audio_asset", zone, role: asset.role || "audio_reference" };
  }
  if (zone === "targets") {
    return { ...asset, kind: "source_video", zone, role: asset.role || "source_video_reference" };
  }
  return { ...asset, zone };
}

function workspaceNodeSurface(node: ProductionFlowNode): string {
  return node.configSnapshot?.toolSurface ?? (node.kind.includes("image") ? "image" : node.kind.includes("video") ? "video" : node.kind.includes("audio") || node.kind.includes("tts") ? "audio" : "production");
}

function workspaceNodeCanRun(node: ProductionFlowNode | null): boolean {
  if (!node) return false;
  const surface = workspaceNodeSurface(node);
  if (surface === "production") return ["ready", "approved", "qa_passed", "completed", "warning"].includes(node.status);
  return Boolean(node.configSnapshot) && ["ready", "approved", "qa_passed", "completed"].includes(node.status);
}

function workspaceNodeOutputCount(node: ProductionFlowNode | null): number {
  return (node?.outputRefs ?? []).filter((ref) => ref.url || ref.thumbnailUrl || ref.storageKey || ref.libraryItemId || ref.mediaTaskId || ref.mediaId || ref.providerTaskId || ref.metadata?.text || ref.metadata?.prompt || ref.metadata?.generatedPrompt).length;
}

function nextActionForWorkspace(params: {
  selectedNode: ProductionFlowNode | null;
  activeStepIndex: number;
  hasAssets: boolean;
  hasProductEvidence: boolean;
  isPlanning?: boolean;
  isThai: boolean;
}): { title: string; body: string; label: string; action: "plan" | "run" | "output" | "configure" | "attach"; disabled?: boolean } {
  const { selectedNode, activeStepIndex, hasAssets, hasProductEvidence, isPlanning, isThai } = params;
  if (isPlanning) {
    return {
      title: isThai ? "กำลังสร้างแผน" : "Planning is running",
      body: isThai ? "รอ planner สร้าง flow และตรวจความพร้อมก่อน run generation" : "Wait for the planner to create the flow and readiness checks before generation.",
      label: isThai ? "กำลังสร้างแผน" : "Planning in progress",
      action: "plan",
      disabled: true,
    };
  }
  if (!selectedNode) {
    if (activeStepIndex <= 1 && (!hasAssets || !hasProductEvidence)) {
      return {
        title: isThai ? "เพิ่มบริบทให้แผนก่อน" : "Add context before planning",
        body: isThai ? "เพิ่มรูปสินค้า ฉาก ตัวละคร หรือ evidence เพื่อให้ prompt/generate node มีข้อมูลอ้างอิง" : "Add product, scene, cast, or evidence assets so prompt/generate nodes have references.",
        label: isThai ? "เพิ่ม asset / evidence" : "Add assets",
        action: "attach",
      };
    }
    return {
      title: isThai ? "เลือก node เพื่อทำงานทีละขั้น" : "Select a node to work step by step",
      body: isThai ? "เลือก node บน canvas เพื่อดูรายละเอียด prompt, references, output และปุ่ม run เฉพาะ node" : "Pick a canvas node to inspect prompt, references, outputs, and node-specific run controls.",
      label: isThai ? "เลือก node บน canvas" : "Select node",
      action: "configure",
      disabled: true,
    };
  }
  const outputs = workspaceNodeOutputCount(selectedNode);
  if (outputs > 0) {
    return {
      title: isThai ? "มีผลลัพธ์แล้ว ตรวจหรือ regenerate ได้" : "Output is ready to review",
      body: isThai ? "เปิดดูผลลัพธ์จาก node นี้ หรือกด Regenerate หากต้องการเวอร์ชันใหม่" : "Open this node's output, or regenerate if you need a new version.",
      label: isThai ? "ดูผลลัพธ์" : "View output",
      action: "output",
    };
  }
  if (workspaceNodeCanRun(selectedNode)) {
    const surface = workspaceNodeSurface(selectedNode);
    return {
      title: surface === "production" ? (isThai ? "สร้าง prompt/ข้อมูลจาก node นี้" : "Run this prompt/work node") : (isThai ? "Generate เฉพาะ node นี้" : "Generate this node only"),
      body: surface === "production"
        ? (isThai ? "ขั้นนี้เป็น local prompt/skill output และจะส่งต่อไป node ถัดไป" : "This creates a local prompt/skill output and passes it downstream.")
        : (isThai ? "ขั้นนี้อาจใช้เครดิตและต้องยืนยันก่อนส่งงาน provider" : "This may use credits and requires confirmation before provider execution."),
      label: outputs > 0 ? "Regenerate" : "Run",
      action: "run",
    };
  }
  return {
    title: isThai ? "ตั้งค่า node ก่อน run" : "Configure this node before running",
    body: isThai ? "เติม prompt/model/reference/output target หรือแก้ปัญหาความพร้อมของ node นี้" : "Add prompt, model, references, output target, or resolve readiness issues for this node.",
    label: isThai ? "เปิดตั้งค่า" : "Configure",
    action: "configure",
  };
}

function modelOptionLabel(option: ProductionMediaModelOption): string {
  return [
    option.name || option.modelId,
    option.provider,
    option.isDefault ? "default" : "",
  ].filter(Boolean).join(" · ");
}

function planningModelOptionLabel(option: ProductionPlanningModelOption): string {
  const contextLabel = Number(option.contextLength ?? 0) > 0
    ? `${Math.round(Number(option.contextLength) / 1000)}k`
    : "";
  return [
    option.name || option.modelId,
    option.provider,
    option.supportsThinking ? "thinking" : "",
    option.supportsVision !== false ? "vision" : "",
    contextLabel,
    option.isDefault ? "default" : "",
  ].filter(Boolean).join(" · ");
}

function buildConceptInfographicPrompt(option: ProductionStoryConceptOption): string {
  return option.infographicPrompt || [
    "Create a beautiful realistic infographic with photorealistic supporting images.",
    `Concept: ${option.title}`,
    `Angle: ${option.angle}`,
    `Hook: ${option.hook}`,
    option.visualSummary ? `Visual summary: ${option.visualSummary}` : "",
    option.keyVisualElements?.length ? `Key visual elements: ${option.keyVisualElements.join(", ")}` : "",
    `Storyboard: ${option.sceneTimeline.map((scene) => `${scene.timeRange} ${scene.title} - ${scene.detail}`).join(" | ")}`,
    "Make the idea understandable at a glance, premium, clean, product-safe, and do not invent unsupported product claims.",
  ].filter(Boolean).join("\n");
}

const CONCEPT_DETAILS_DISPLAY_MAX_CHARS = 520;
const CONCEPT_DETAILS_DISPLAY_PART_MAX_CHARS = 90;
const CONCEPT_DETAILS_DECORATIVE_SYMBOL_PATTERN = /[\p{Extended_Pictographic}\uFE0F\u20E3]/gu;

function normalizeConceptDetailsText(value: unknown): string {
  return String(value ?? "")
    .replace(CONCEPT_DETAILS_DECORATIVE_SYMBOL_PATTERN, "")
    .replace(/^[\s>*•·▪▫◦‣⁃\-=+|]+/gm, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function clampConceptDetailsText(value: unknown, maxChars = CONCEPT_DETAILS_DISPLAY_PART_MAX_CHARS): string {
  const text = normalizeConceptDetailsText(value);
  if (text.length <= maxChars) return text;
  const sliced = text.slice(0, maxChars + 1);
  const boundary = Math.max(
    sliced.lastIndexOf("."),
    sliced.lastIndexOf("!"),
    sliced.lastIndexOf("?"),
    sliced.lastIndexOf(","),
    sliced.lastIndexOf("/"),
    sliced.lastIndexOf(" "),
  );
  return sliced.slice(0, boundary >= Math.floor(maxChars * 0.65) ? boundary : maxChars).trim();
}

function joinCompactConceptDetails(parts: string[]): string {
  return parts.reduce((output, part) => {
    const text = normalizeConceptDetailsText(part);
    if (!text) return output;
    const candidate = output ? `${output} ${text}` : text;
    if (candidate.length <= CONCEPT_DETAILS_DISPLAY_MAX_CHARS) return candidate;
    return output || clampConceptDetailsText(text, CONCEPT_DETAILS_DISPLAY_MAX_CHARS);
  }, "");
}

function isTemplateConceptDetailsText(value: unknown): boolean {
  const text = normalizeConceptDetailsText(value);
  if (!text) return false;
  const labels = [
    "สินค้า:",
    "รายละเอียดย่อ:",
    "แนวคิด:",
    "กลุ่มเป้าหมาย:",
    "ปัญหา:",
    "จุดขาย:",
    "Product name:",
    "Product:",
    "Brief details:",
    "Summarized product details:",
    "Concept:",
    "Audience:",
    "Problem:",
    "Selling points:",
  ];
  const labelCount = labels.filter((label) => text.toLowerCase().includes(label.toLowerCase())).length;
  return labelCount >= 3 || /จุดเด่นหลักของ|รีวิวสินค้า|Main value of|marketplace description/i.test(text);
}

function extractTemplateConceptSegment(text: string, labels: string[]): string {
  const source = normalizeConceptDetailsText(text);
  const stopLabels = [
    "สินค้า",
    "รายละเอียดย่อ",
    "แนวคิด",
    "กลุ่มเป้าหมาย",
    "ปัญหา",
    "จุดขาย",
    "Product name",
    "Product",
    "Brief details",
    "Summarized product details",
    "Concept",
    "Audience",
    "Problem",
    "Selling points",
  ].filter((label) => !labels.some((activeLabel) => activeLabel.toLowerCase() === label.toLowerCase()));
  const escapePattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`(?:${labels.map(escapePattern).join("|")})\\s*[:：]?\\s*(.+?)(?=\\s+(?:${stopLabels.map(escapePattern).join("|")})\\s*[:：]?|$)`, "i"));
  return normalizeConceptDetailsText(match?.[1] ?? "");
}

function inferConceptDetailsDimension(option: ProductionStoryConceptOption): NonNullable<ProductionStoryConceptOption["storyDimension"]> {
  if (option.storyDimension) return option.storyDimension;
  const marker = normalizeConceptDetailsText([option.storyOptionId, option.title, option.angle].filter(Boolean).join(" ")).toLowerCase();
  if (/objection|proof|trust|ข้อกังวล|ความมั่นใจ|หลักฐาน/.test(marker)) return "objection_trust";
  if (/quick|demo|เดโม|รวมประโยชน์/.test(marker)) return "quick_demo";
  if (/use.case|real use|สถานการณ์|mini story|ใช้งานจริง/.test(marker)) return "use_case_moment";
  return "problem_solution";
}

function buildJourneyConceptDetailsText(option: ProductionStoryConceptOption, isThai: boolean, rawDetails: string): string {
  const productRef = clampConceptDetailsText(
    extractTemplateConceptSegment(rawDetails, ["สินค้า", "Product name", "Product"])
      || option.useCase
      || (isThai ? "สินค้านี้" : "this product"),
  );
  const points = Array.from(new Set(option.sellingPoints
    .filter((item) => !/จุดเด่นหลักของ|รีวิวสินค้า|Main value of|Relevant to/i.test(item))
    .map((item) => clampConceptDetailsText(item))
    .filter(Boolean)))
    .slice(0, 3)
    .join(isThai ? " / " : " / ");
  const dimension = inferConceptDetailsDimension(option);
  if (isThai) {
    if (dimension === "objection_trust") {
      return joinCompactConceptDetails([
        `เล่าในช่วง consideration ของคนที่ยังลังเลว่าใช้จริงคุ้มไหมและเข้ากับพื้นที่ของตัวเองหรือเปล่า.`,
        `ให้ภาพของ ${productRef} ตอบข้อกังวลด้วยขนาด บริบท และรายละเอียดที่มีหลักฐาน.`,
        points ? `ย้ำเฉพาะจุดที่ตรวจสอบได้: ${points}.` : "",
      ]);
    }
    if (dimension === "quick_demo") {
      return joinCompactConceptDetails([
        `ทำเป็นเดโมเร็ว 4 จังหวะ: ปัญหาก่อนใช้ → วาง ${productRef} เข้าฉาก → โชว์วิธีใช้หลัก → ปิดด้วยผลลัพธ์ที่เห็นภาพ.`,
        points ? `ใช้ ${points} เป็นภาพพิสูจน์แทนคำขายยาว.` : "ให้ภาพพิสูจน์การใช้งานแทนคำขายยาว.",
      ]);
    }
    if (dimension === "use_case_moment") {
      return joinCompactConceptDetails([
        `ทำเป็น mini story หลังผู้ใช้จัดมุมใหม่ด้วย ${productRef}.`,
        `พาเห็นของใช้มีที่อยู่ หยิบง่ายขึ้น และห้องดูเป็นระเบียบในชีวิตจริง.`,
      ]);
    }
    return joinCompactConceptDetails([
      `เปิดจากปัญหาจริงของคนดูที่ยังไม่เห็นภาพการใช้งาน.`,
      `พาเห็น ${productRef} เป็นทางออกผ่านสถานการณ์ก่อน-หลังและบริบทที่จับต้องได้.`,
      points ? `แกนเรื่องเน้น ${points}.` : "",
    ]);
  }
  if (dimension === "objection_trust") {
    return joinCompactConceptDetails([
      "Tell the consideration moment: the shopper is unsure whether it will fit their real routine.",
      `Use ${productRef} to answer doubts with scale, context, and evidence-backed details.`,
      points ? `Keep proof focused on ${points}.` : "",
    ]);
  }
  if (dimension === "quick_demo") {
    return joinCompactConceptDetails([
      `Use a fast four-beat demo: before friction -> place ${productRef} -> show the core use -> end with a visible outcome.`,
      points ? `Let visuals prove ${points} instead of long sales copy.` : "Let visuals prove the use case instead of long sales copy.",
    ]);
  }
  if (dimension === "use_case_moment") {
    return joinCompactConceptDetails([
      `Make it a mini story after the user sets up ${productRef}.`,
      "Show essentials in place, easier reach, and a more organized real-life moment.",
    ]);
  }
  return joinCompactConceptDetails([
    "Open on the audience's real friction before they know the product is the answer.",
    `Show ${productRef} solving that moment through a concrete before/after use case.`,
    points ? `Anchor the story on ${points}.` : "",
  ]);
}

function buildProductFactsText(option: ProductionStoryConceptOption, isThai: boolean): string {
  const productFacts = normalizeConceptDetailsText(option.productFacts);
  if (productFacts) return productFacts;
  const rawDetails = normalizeConceptDetailsText(option.conceptDetails);
  const productName = extractTemplateConceptSegment(rawDetails, ["สินค้า", "Product name", "Product"]);
  const productDetails = extractTemplateConceptSegment(rawDetails, ["รายละเอียดสินค้าที่สรุปมาแล้วคือ", "รายละเอียดย่อ", "Summarized product details", "Brief details"]);
  if (!productName && !productDetails) return "";
  return joinCompactConceptDetails(isThai
    ? [
      productName ? `PRODUCT FACTS LOCK: ${productName}.` : "",
      productDetails ? `รายละเอียดสินค้า: ${productDetails}.` : "",
      "ห้ามเปลี่ยนประเภทสินค้า รูปทรง จำนวนชิ้น/ชั้น ขนาดโดยรวม หรือรายละเอียดสินค้าที่ระบุ.",
    ]
    : [
      productName ? `PRODUCT FACTS LOCK: ${productName}.` : "",
      productDetails ? `Product details: ${productDetails}.` : "",
      "Do not change product category, shape, component/tier count, overall scale, or stated product details.",
    ]);
}

function buildConceptDetailsText(option: ProductionStoryConceptOption, isThai: boolean): string {
  const rawDetails = normalizeConceptDetailsText(option.conceptDetails);
  if (rawDetails && rawDetails.length <= CONCEPT_DETAILS_DISPLAY_MAX_CHARS && !isTemplateConceptDetailsText(rawDetails)) return rawDetails;
  return buildJourneyConceptDetailsText(option, isThai, rawDetails);
}

function ProductionConceptCard(props: {
  option: ProductionStoryConceptOption;
  selected: boolean;
  isThai: boolean;
  isPlanning?: boolean;
  onSelect?: (conceptId: string) => void;
  onRegenerate?: (conceptId: string) => void;
  onGenerateInfographic?: (conceptId: string) => void;
  onOpenPreview: (option: ProductionStoryConceptOption) => void;
}) {
  const { option, selected, isThai } = props;
  const [copiedDetails, setCopiedDetails] = useState(false);
  const [copiedProductFacts, setCopiedProductFacts] = useState(false);
  const infographicStatus = option.infographicStatus ?? (option.infographicUrl ? "ready" : option.infographicPrompt ? "prompt_ready" : "idle");
  const conceptDetails = buildConceptDetailsText(option, isThai);
  const productFacts = buildProductFactsText(option, isThai);
  const handleCopyDetails = async () => {
    if (!conceptDetails) return;
    try {
      await navigator.clipboard?.writeText(conceptDetails);
      setCopiedDetails(true);
      window.setTimeout(() => setCopiedDetails(false), 1200);
    } catch {
      setCopiedDetails(false);
    }
  };
  const handleCopyProductFacts = async () => {
    if (!productFacts) return;
    try {
      await navigator.clipboard?.writeText(productFacts);
      setCopiedProductFacts(true);
      window.setTimeout(() => setCopiedProductFacts(false), 1200);
    } catch {
      setCopiedProductFacts(false);
    }
  };
  return (
    <article
      className={`flex min-w-0 flex-col overflow-hidden rounded-lg border p-3 text-left transition ${
        selected
          ? "border-sky-500 bg-sky-50 shadow-sm ring-1 ring-sky-200"
          : "border-slate-200 bg-slate-50/70 hover:border-sky-200 hover:bg-white"
      }`}
      data-testid={`production-story-option-${option.id}`}
      aria-label={option.title}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="line-clamp-2 text-sm font-semibold text-slate-950">{option.title}</div>
          <div className="mt-1 line-clamp-2 text-[11px] font-medium text-sky-700">{option.angle}</div>
        </div>
        {selected ? <CheckCircle className="h-4 w-4 shrink-0 text-sky-700" /> : null}
      </div>

      <div className="mt-3 overflow-hidden rounded-md border border-slate-200 bg-white">
        {option.infographicUrl ? (
          <button
            type="button"
            className="group flex w-full items-center justify-center bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
            onClick={() => props.onOpenPreview(option)}
            aria-label={isThai ? `ขยายภาพ ${option.title}` : `Open ${option.title} infographic preview`}
          >
            <img
              src={option.infographicUrl}
              alt=""
              className="h-auto max-h-[560px] w-full object-contain transition group-hover:brightness-95"
              draggable={false}
            />
          </button>
        ) : (
          <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 bg-slate-100 px-3 text-center text-xs text-slate-600">
            {infographicStatus === "generating" ? <Loader2 className="h-5 w-5 animate-spin text-sky-700" /> : <ImageIcon className="h-5 w-5 text-sky-700" />}
            <span className="line-clamp-2">
              {infographicStatus === "failed"
                ? (option.infographicError || (isThai ? "สร้าง infographic ไม่สำเร็จ" : "Infographic failed"))
                : infographicStatus === "queued"
                  ? (isThai ? "ส่งงานแล้ว รอระบบสร้างภาพ" : "Queued. Waiting for image generation.")
                  : infographicStatus === "generating"
                    ? (isThai ? "กำลังสร้าง infographic..." : "Generating infographic...")
                  : (isThai ? "ยังไม่มี infographic สำหรับแนวคิดนี้" : "No infographic for this concept yet")}
            </span>
            {option.infographicTaskId && infographicStatus !== "ready" && infographicStatus !== "failed" ? (
              <span className="max-w-full truncate text-[10px] text-slate-500">Task {option.infographicTaskId}</span>
            ) : null}
          </div>
        )}
      </div>

      <div className="mt-3 min-w-0 flex-1 space-y-2 text-xs leading-5 text-slate-700 [overflow-wrap:anywhere]">
        {option.audience ? (
          <div className="min-w-0">
            <span className="font-semibold">{isThai ? "กลุ่มเป้าหมาย: " : "Audience: "}</span>
            <span>{option.audience}</span>
          </div>
        ) : null}
        {option.painPoint ? (
          <div className="min-w-0">
            <span className="font-semibold">{isThai ? "ปัญหา: " : "Problem: "}</span>
            <span>{option.painPoint}</span>
          </div>
        ) : null}
        <div className="min-w-0 rounded-md border border-white bg-white/80 p-2">
          <div className="text-[11px] font-semibold uppercase tracking-normal text-slate-500">Hook</div>
          <div className="mt-0.5 line-clamp-3 font-medium text-slate-900">{option.hook}</div>
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-normal text-slate-500">{isThai ? "Storyboard" : "30s timeline"}</div>
          <div className="mt-1 grid gap-1">
            {option.sceneTimeline.slice(0, 4).map((scene) => (
              <div key={`${option.id}-${scene.timeRange}`} className="min-w-0 rounded border border-slate-100 bg-white px-2 py-1">
                <span className="font-semibold text-sky-800">{scene.timeRange}</span>
                <span className="ml-1">{scene.title}</span>
              </div>
            ))}
          </div>
        </div>
        {option.sellingPoints.length ? (
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-normal text-slate-500">{isThai ? "จุดขาย" : "Selling points"}</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {option.sellingPoints.slice(0, 3).map((item) => (
                <Badge key={item} variant="outline" className="h-auto max-w-full whitespace-normal break-words bg-white text-[10px] leading-4">{item}</Badge>
              ))}
            </div>
          </div>
        ) : null}
        {productFacts ? (
          <div className="min-w-0 rounded-md border border-emerald-200 bg-white p-2">
            <div className="mb-1 flex items-center justify-between gap-2">
              <div className="text-[11px] font-semibold uppercase tracking-normal text-emerald-700">
                {isThai ? "รายละเอียดสินค้า" : "Product facts"}
              </div>
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={handleCopyProductFacts}>
                <Copy className="mr-1 h-3.5 w-3.5" />
                {copiedProductFacts ? (isThai ? "คัดลอกแล้ว" : "Copied") : (isThai ? "คัดลอก" : "Copy")}
              </Button>
            </div>
            <Textarea
              value={productFacts}
              readOnly
              className="min-h-[110px] resize-y border-emerald-100 bg-emerald-50/40 text-xs leading-5 text-slate-800 shadow-none focus-visible:ring-emerald-200"
              aria-label={isThai ? `รายละเอียดสินค้า ${option.title}` : `${option.title} product facts`}
            />
          </div>
        ) : null}
        <div className="min-w-0 rounded-md border border-slate-200 bg-white p-2">
          <div className="mb-1 flex items-center justify-between gap-2">
            <div className="text-[11px] font-semibold uppercase tracking-normal text-slate-500">
              {isThai ? "แนวคิดวิดีโอ" : "Concept journey"}
            </div>
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={handleCopyDetails}>
              <Copy className="mr-1 h-3.5 w-3.5" />
              {copiedDetails ? (isThai ? "คัดลอกแล้ว" : "Copied") : (isThai ? "คัดลอก" : "Copy")}
            </Button>
          </div>
          <Textarea
            value={conceptDetails}
            readOnly
            className="min-h-[140px] resize-y border-slate-100 bg-slate-50 text-xs leading-5 text-slate-800 shadow-none focus-visible:ring-sky-200"
            aria-label={isThai ? `แนวคิดวิดีโอ ${option.title}` : `${option.title} concept journey`}
          />
        </div>
        <div className="flex min-w-0 flex-wrap gap-1">
          {option.narrativeStructure ? <Badge variant="outline" className="h-auto max-w-full whitespace-normal break-words bg-white text-[10px] leading-4">{option.narrativeStructure}</Badge> : null}
          {option.emotionalTone ? <Badge variant="outline" className="h-auto max-w-full whitespace-normal break-words bg-white text-[10px] leading-4">{option.emotionalTone}</Badge> : null}
          {option.hookTechnique ? <Badge variant="outline" className="h-auto max-w-full whitespace-normal break-words bg-white text-[10px] leading-4">{option.hookTechnique}</Badge> : null}
        </div>
        {option.risks.length ? (
          <div className="min-w-0 rounded-md border border-amber-100 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
            {option.risks[0]}
          </div>
        ) : null}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Button type="button" variant={selected ? "default" : "outline"} size="sm" className="h-auto min-h-9 whitespace-normal" onClick={() => props.onSelect?.(option.id)}>
          {selected ? <CheckCircle className="mr-2 h-4 w-4" /> : <Route className="mr-2 h-4 w-4" />}
          {selected ? (isThai ? "เลือกอยู่" : "Selected") : (isThai ? "เลือกแนวคิด" : "Select concept")}
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-auto min-h-9 whitespace-normal" onClick={() => props.onRegenerate?.(option.id)} disabled={!props.onRegenerate}>
          <RotateCcw className="mr-2 h-4 w-4" />
          {isThai ? "Regenerate ใบนี้" : "Regenerate"}
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-auto min-h-9 whitespace-normal" onClick={() => props.onGenerateInfographic?.(option.id)} disabled={!props.onGenerateInfographic}>
          {infographicStatus === "generating" || infographicStatus === "queued" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImageIcon className="mr-2 h-4 w-4" />}
          {infographicStatus === "generating" || infographicStatus === "queued"
            ? (isThai ? "ส่งเพิ่ม" : "Queue another")
            : option.infographicUrl
              ? (isThai ? "สร้างภาพใหม่" : "Regenerate image")
              : (isThai ? "สร้าง infographic" : "Infographic")}
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-auto min-h-9 whitespace-normal" onClick={() => props.onOpenPreview(option)}>
          <Maximize2 className="mr-2 h-4 w-4" />
          {isThai ? "ขยายดูเต็มจอ" : "Fullscreen preview"}
        </Button>
      </div>
    </article>
  );
}

function ProductionConceptBoard(props: {
  storyWizard: ProductionStoryConceptWizardState;
  selectedStoryConcept: ProductionStoryConceptOption | null;
  isThai: boolean;
  isPlanning?: boolean;
  emptyState?: boolean;
  storyboardBuildMode?: ProductionStoryboardBuildMode;
  onStoryboardBuildModeChange?: (mode: ProductionStoryboardBuildMode) => void;
  storyboardClipDurationSeconds?: number;
  storyboardClipDurationOptions?: number[];
  totalDurationSeconds?: number;
  onStoryboardClipDurationSecondsChange?: (seconds: number) => void;
  onSelectStoryConcept?: (conceptId: string) => void;
  onConfirmStoryConceptPlan?: (conceptId: string) => void;
  onRegenerateStoryConcepts?: (conceptId?: string) => void;
  onGenerateStoryConceptInfographic?: (conceptId: string) => void;
  onResetStoryConcepts?: () => void;
}) {
  const [previewOption, setPreviewOption] = useState<ProductionStoryConceptOption | null>(null);
  const { storyWizard, isThai } = props;
  const previewPrompt = previewOption ? buildConceptInfographicPrompt(previewOption) : "";
  const clipDurationOptions = props.storyboardClipDurationOptions?.length ? props.storyboardClipDurationOptions : defaultStoryboardClipDurationOptions;
  const clipDurationSeconds = Number(props.storyboardClipDurationSeconds) > 0 ? Number(props.storyboardClipDurationSeconds) : clipDurationOptions[0] ?? 8;
  const totalDurationSeconds = Number(props.totalDurationSeconds) > 0 ? Number(props.totalDurationSeconds) : 0;
  const derivedVideoCount = totalDurationSeconds > 0 ? Math.max(1, Math.ceil(totalDurationSeconds / clipDurationSeconds)) : 0;
  return (
    <section className="rounded-lg border border-sky-200 bg-white p-4 shadow-sm" data-testid="production-story-wizard">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-950">
            <Sparkles className="h-4 w-4 text-sky-700" />
            {props.emptyState
              ? (isThai ? "เลือกแนวคิดและ Storyboard ก่อนสร้าง workflow" : "Choose a concept and storyboard before workflow generation")
              : (isThai ? "เลือกแนวคิดก่อนสร้าง workflow" : "Choose a story concept before workflow generation")}
            <Badge variant="outline" className="bg-sky-50 text-sky-800">4 cards</Badge>
            <Badge variant="outline" className="bg-white text-slate-700">Storyboard</Badge>
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">
            {storyWizard.contextSummary || (isThai
              ? "ระบบเตรียม 4 แนวคิดพร้อม storyboard timeline ให้เลือกก่อนสร้าง workflow"
              : "Four concepts with storyboard timelines are ready to review before creating the workflow.")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
            value={props.storyboardBuildMode ?? "image_first"}
            onChange={(event) => props.onStoryboardBuildModeChange?.(event.target.value as ProductionStoryboardBuildMode)}
            aria-label={isThai ? "รูปแบบการสร้าง storyboard" : "Storyboard build mode"}
          >
            <option value="image_first">{isThai ? "สร้างภาพ storyboard ก่อน" : "Storyboard images first"}</option>
            <option value="prompt_to_video">{isThai ? "ใช้ prompt สร้างวิดีโอเลย" : "Prompt directly to video"}</option>
          </select>
          <select
            className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
            value={String(clipDurationSeconds)}
            onChange={(event) => props.onStoryboardClipDurationSecondsChange?.(Number(event.target.value) || clipDurationSeconds)}
            aria-label={isThai ? "วินาทีต่อวิดีโอ storyboard" : "Seconds per storyboard video"}
          >
            {clipDurationOptions.map((seconds) => (
              <option key={seconds} value={seconds}>
                {isThai ? `${seconds} วินาที/วิดีโอ` : `${seconds}s per video`}
              </option>
            ))}
          </select>
          <Button type="button" variant="outline" size="sm" onClick={() => props.onRegenerateStoryConcepts?.()} disabled={props.isPlanning}>
            {props.isPlanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {isThai ? "Regenerate 4 แนวคิด" : "Regenerate 4 concepts"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={props.onResetStoryConcepts}>
            <RotateCcw className="mr-2 h-4 w-4" />
            {isThai ? "เริ่มเลือกใหม่" : "Start over"}
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {storyWizard.options.map((option) => (
          <ProductionConceptCard
            key={option.id}
            option={option}
            selected={option.id === storyWizard.selectedId}
            isThai={isThai}
            isPlanning={props.isPlanning}
            onSelect={props.onSelectStoryConcept}
            onRegenerate={(conceptId) => props.onRegenerateStoryConcepts?.(conceptId)}
            onGenerateInfographic={props.onGenerateStoryConceptInfographic}
            onOpenPreview={setPreviewOption}
          />
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 text-xs leading-5 text-slate-600">
          <div className="font-semibold text-slate-950">
            {props.selectedStoryConcept
              ? (isThai ? `เลือกแล้ว: ${props.selectedStoryConcept.title}` : `Selected: ${props.selectedStoryConcept.title}`)
              : (isThai ? "เลือก 1 แนวคิดก่อนสร้าง workflow" : "Select one concept before generating the workflow")}
          </div>
          <div>
            {derivedVideoCount
              ? (isThai
                ? `เมื่อยืนยัน ระบบจะสร้าง ${derivedVideoCount} วิดีโอ/shot จากความยาวรวม ${totalDurationSeconds}s ÷ ${clipDurationSeconds}s`
                : `On confirmation, the app will create ${derivedVideoCount} videos/shots from ${totalDurationSeconds}s total ÷ ${clipDurationSeconds}s.`)
              : (isThai
                ? "เมื่อยืนยัน ระบบจะสร้าง workflow ใหม่จากแนวคิดและ storyboard ที่เลือก"
                : "On confirmation, the app will generate a workflow from the selected concept and storyboard.")}
          </div>
        </div>
        <Button
          type="button"
          className="shrink-0 bg-sky-800 text-white hover:bg-sky-900"
          disabled={!props.selectedStoryConcept || props.isPlanning}
          onClick={() => props.selectedStoryConcept && props.onConfirmStoryConceptPlan?.(props.selectedStoryConcept.id)}
        >
          {props.isPlanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Route className="mr-2 h-4 w-4" />}
          {isThai ? "สร้าง workflow จากแนวคิดนี้" : "Generate workflow from this concept"}
        </Button>
      </div>

      <Dialog open={Boolean(previewOption)} onOpenChange={(open) => !open && setPreviewOption(null)}>
        <DialogContent className="max-h-[94vh] w-[96vw] max-w-7xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{previewOption?.title ?? (isThai ? "ดูแนวคิด" : "Concept preview")}</DialogTitle>
            <DialogDescription>
              {isThai ? "ดูภาพรวมแนวคิด infographic และ storyboard timeline แบบเต็มจอ" : "Fullscreen concept preview with infographic and storyboard timeline."}
            </DialogDescription>
          </DialogHeader>
          {previewOption ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.55fr)]">
              <div className="flex min-h-[320px] items-center justify-center overflow-hidden rounded-lg border bg-slate-100">
                {previewOption.infographicUrl ? (
                  <img src={previewOption.infographicUrl} alt="" className="max-h-[82vh] max-w-full object-contain" />
                ) : (
                  <div className="flex min-h-[360px] flex-col items-center justify-center gap-2 p-6 text-center text-sm text-slate-600">
                    <ImageIcon className="h-8 w-8 text-sky-700" />
                    {isThai ? "ยังไม่มี infographic กดสร้างจาก card เพื่อดูภาพรวมแนวคิด" : "No infographic yet. Generate it from the card to see the visual concept."}
                  </div>
                )}
              </div>
              <div className="min-w-0 space-y-3 [overflow-wrap:anywhere]">
                <div className="min-w-0 rounded-lg border bg-white p-3">
                  <div className="text-xs font-semibold uppercase tracking-normal text-slate-500">Hook</div>
                  <div className="mt-1 text-sm font-medium text-slate-950">{previewOption.hook}</div>
                  <div className="mt-2 text-xs leading-5 text-slate-600">{previewOption.angle}</div>
                </div>
                <div className="min-w-0 rounded-lg border bg-white p-3">
                  <div className="text-xs font-semibold uppercase tracking-normal text-slate-500">Storyboard</div>
                  <div className="mt-2 grid gap-2">
                    {previewOption.sceneTimeline.map((scene) => (
                      <div key={`${previewOption.id}-preview-${scene.timeRange}`} className="min-w-0 rounded-md border border-slate-100 bg-slate-50 p-2 text-xs">
                        <div className="font-semibold text-sky-800">{scene.timeRange} · {scene.title}</div>
                        <div className="mt-1 text-slate-700">{scene.detail}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="min-w-0 rounded-lg border bg-white p-3">
                  <div className="text-xs font-semibold uppercase tracking-normal text-slate-500">{isThai ? "Prompt ภาพรวม" : "Infographic prompt"}</div>
                  <div className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-slate-600">{previewPrompt}</div>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}

export function ProductionWorkspace(props: ProductionWorkspaceProps) {
  const isThai = props.locale === "th";
  const displayMode = props.displayMode ?? "full";
  const isCanvasOnlyMode = displayMode === "canvas";
  const showPlanningSections = displayMode === "full" || displayMode === "planning";
  const showConceptSections = displayMode === "full" || displayMode === "planning";
  const showWorkflowSections = displayMode === "full" || displayMode === "workflow";
  const showCanvasSections = displayMode === "full" || displayMode === "canvas";
  const space = props.space ?? fallbackSpace;
  const workspaceViewState = props.workspaceViewState ?? "ready";
  const [localSelectedNodeId, setLocalSelectedNodeId] = useState<string | null>(props.selectedNodeId ?? null);
  const [mobilePanelTab, setMobilePanelTab] = useState<"assets" | "evidence" | "config" | "safeguards">("assets");
  const autoSelectedFlowRef = useRef<string | null>(null);
  const guidedNodeId = useMemo(() => {
    const firstActionableNode =
      space.flowNodes.find((node) => workspaceNodeCanRun(node) || workspaceNodeOutputCount(node) > 0)
      ?? space.flowNodes.find((node) => node.status !== "disabled" && node.status !== "blocked")
      ?? space.flowNodes[0];
    return firstActionableNode?.id ?? null;
  }, [space.flowNodes]);
  const selectedNodeId = props.selectedNodeId ?? localSelectedNodeId ?? guidedNodeId;
  const selectedNode = useMemo<ProductionFlowNode | null>(
    () => space.flowNodes.find((node) => node.id === selectedNodeId) ?? null,
    [selectedNodeId, space.flowNodes],
  );
  const blockedCount = space.flowNodes.filter((node) => node.status === "blocked" || (node.readinessIssues?.length ?? 0) > 0).length;
  const creditEstimate = space.flowNodes.reduce((sum, node) => sum + Math.max(0, Number(node.estimatedCredits ?? 0)), 0);
  const latestAttempt = space.actionAttempts?.at(-1);
  const activeAttempt = [...(space.actionAttempts ?? [])]
    .reverse()
    .find((attempt) => attempt.status === "queued" || attempt.status === "running" || attempt.status === "reserving_credits");
  const latestAttemptProgress = latestAttempt
    ? latestAttempt.status === "completed"
      ? 100
      : latestAttempt.status === "failed" || latestAttempt.status === "cancelled"
        ? 0
        : latestAttempt.mediaTaskIds.length > 0
          ? Math.round((latestAttempt.mediaTaskIds.length / Math.max(1, latestAttempt.nodeIds.length)) * 50)
          : 10
    : 0;
  const brief: ProductionGoal = { ...space.brief, title: props.title, summary: props.summary };
  const providerCharacterResults = space.contextAssets.filter((asset) =>
    asset.kind === "character_asset" || /provider|gemini|character/i.test(asset.source)
  );
  const planningSkills = props.planningSkills ?? [{
    id: "media-production-storyboard-planner",
    slug: "media-production-storyboard-planner",
    title: "Media Production Storyboard Planner",
    tags: ["production_planning", "storyboard_planning", "campaign_planning"],
    compatibility: "compatible" as const,
  }];
  const selectedPlanningSkillId = props.selectedPlanningSkillId ?? props.planningSelection?.skillId ?? space.planningSelection?.skillId ?? planningSkills[0]?.id ?? "";
  const planningSelection = props.planningSelection ?? space.planningSelection;
  const planningModelMode = props.planningModelMode ?? planningSelection?.modelMode ?? "auto";
  const selectedPlanningModel = props.selectedPlanningModel ?? planningSelection?.selectedModel ?? "";
  const generationDefaults = props.generationDefaults ?? space.generationDefaults ?? space.brief.generationDefaults ?? planningSelection?.contextPack?.generationDefaults ?? {};
  const selectedImageModelId = generationDefaults.imageModelId ?? "";
  const selectedVideoModelId = generationDefaults.videoModelId ?? "";
  const storyboardReferenceSkillOptions = props.storyboardReferenceSkillOptions ?? [];
  const selectedStoryboardReferenceSkillId = props.storyboardReferenceSkillId
    ?? generationDefaults.referenceStoryboardSkillId
    ?? storyboardReferenceSkillOptions[0]?.id
    ?? "";
  const storyWizard = props.storyConceptWizard;
  const selectedStoryConcept = storyWizard?.options.find((option) => option.id === storyWizard.selectedId) ?? null;
  const formattedStatus = formatProductionStatus(props.status, isThai);
  const labelForOption = (option: { en: string; th: string }) => isThai ? option.th : option.en;
  const currentDuration = brief.durationSeconds ? String(brief.durationSeconds) : "";
  const storyboardClipDurationOptions = props.storyboardClipDurationOptions?.length ? props.storyboardClipDurationOptions : defaultStoryboardClipDurationOptions;
  const storyboardClipDurationSeconds = Number(props.storyboardClipDurationSeconds) > 0
    ? Number(props.storyboardClipDurationSeconds)
    : storyboardClipDurationOptions[0] ?? 8;
  const hasCustomAspectRatio = brief.aspectRatio && !aspectRatioOptions.includes(brief.aspectRatio);
  const hasCustomLanguage = brief.language && !languageOptions.some((option) => option.value === brief.language);
  const hasCustomGoalType = brief.goalType && !goalTypeOptions.some((option) => option.value === brief.goalType);
  const lifecycleDisabled = props.isLifecycleActionDisabled || !props.productionRunId;
  const activeProductionRunId = [props.productionRunId, space.productionRunId]
    .find((value) => value?.trim() && value.trim() !== "draft")
    ?.trim() ?? "";
  const hasProjectSeed = Boolean(activeProductionRunId);
  const isEmptyProduction = !hasProjectSeed && space.shots.length === 0 && space.contextAssets.length === 0 && space.flowNodes.length <= 1;
  const journeySteps = [
    ["brief", isThai ? "Brief" : "Brief"],
    ["context", isThai ? "Context" : "Context"],
    ["plan", isThai ? "Plan" : "Plan"],
    ["script", isThai ? "Script" : "Script"],
    ["shot", isThai ? "Shot" : "Shot"],
    ["generate", isThai ? "Generate" : "Generate"],
    ["qa", isThai ? "QA" : "QA"],
    ["handoff", isThai ? "Handoff" : "Handoff"],
  ];
  const activeStepIndex = space.status.includes("handoff") || space.status === "completed"
    ? 7
    : space.status.includes("qa")
      ? 6
      : space.status.includes("generating") || space.status.includes("asset")
        ? 5
        : space.status.includes("storyboard")
          ? 4
          : space.status.includes("plan") || space.status.includes("production_bible")
            ? 2
            : space.contextAssets.length > 0
              ? 1
              : 0;
  const selectedNodeOutputRefs = selectedNode?.outputRefs ?? [];
  const selectedNodeLatestOutput = selectedNodeOutputRefs.at(-1);
  const selectedNodeOutputs = workspaceNodeOutputCount(selectedNode);
  const planningAttachments = space.contextAssets.slice(0, maxPlanningAttachments);
  const planningAttachmentCounts = planningAttachments.reduce<Record<ProductionContextAssetZone, number>>((counts, asset) => {
    const zone = inferPlanningAssetZone(asset);
    counts[zone] = (counts[zone] ?? 0) + 1;
    return counts;
  }, {
    cast: 0,
    products: 0,
    scene_mood: 0,
    audio: 0,
    generated: 0,
    targets: 0,
  });
  const nextAction = nextActionForWorkspace({
    selectedNode,
    activeStepIndex,
    hasAssets: space.contextAssets.length > 0,
    hasProductEvidence: Boolean(space.productEvidenceManifest && String(space.productEvidenceManifest.status) !== "not_loaded"),
    isPlanning: props.isPlanning,
    isThai,
  });
  const runScopeLabel = selectedNode
    ? workspaceNodeSurface(selectedNode) === "production"
      ? (isThai ? "สร้างพรอมป์ในระบบ" : "local prompt")
      : selectedNode.estimatedCredits && selectedNode.estimatedCredits > 0
        ? (isThai ? "ใช้เครดิต" : "uses credits")
        : (isThai ? "ต้องยืนยัน" : "needs confirm")
    : null;

  const patchBrief = (patch: Partial<ProductionGoal>) => {
    const nextBrief = { ...brief, ...patch };
    if (patch.title !== undefined) props.onTitleChange(patch.title ?? "");
    if (patch.summary !== undefined) props.onSummaryChange(patch.summary ?? "");
    props.onBriefChange?.(nextBrief);
  };

  const handleSelectNode = (nodeId: string | null) => {
    setLocalSelectedNodeId(nodeId);
    props.onSelectNode?.(nodeId);
  };

  const parseDraggedPlanningAsset = (dataTransfer: DataTransfer): ProductionReferenceInput | null => {
    const serializedAsset =
      dataTransfer.getData("application/x-production-asset-json")
      || dataTransfer.getData("application/json");
    if (serializedAsset) {
      try {
        const parsed = JSON.parse(serializedAsset) as ProductionReferenceInput;
        if (parsed?.id && parsed.title && parsed.kind) return parsed;
      } catch {
        return null;
      }
    }
    return null;
  };

  const handlePlanningAttachmentDrop = (event: DragEvent<HTMLDivElement>, zone?: ProductionContextAssetZone) => {
    event.preventDefault();
    const asset = parseDraggedPlanningAsset(event.dataTransfer);
    if (!asset) return;
    props.onAddPlanningAsset?.(normalizePlanningAssetForZone(asset, zone));
  };

  useEffect(() => {
    if ((props.selectedNodeId ?? localSelectedNodeId) || space.flowNodes.length === 0) return;
    const flowKey = `${space.productionRunId}:${space.version}:${space.flowNodes.map((node) => node.id).join(",")}`;
    if (autoSelectedFlowRef.current === flowKey) return;
    const firstActionableNode = space.flowNodes.find((node) => node.id === guidedNodeId) ?? space.flowNodes[0];
    autoSelectedFlowRef.current = flowKey;
    setLocalSelectedNodeId(firstActionableNode.id);
    props.onSelectNode?.(firstActionableNode.id);
  }, [guidedNodeId, localSelectedNodeId, props.onSelectNode, props.selectedNodeId, space.flowNodes, space.productionRunId, space.version]);

  if (workspaceViewState === "loading") {
    return (
      <div className="space-y-4 rounded-lg border bg-white p-4" data-testid="production-workspace-state-loading">
        <div className="flex items-center gap-2 text-sm font-semibold text-sky-700">
          <Loader2 className="h-4 w-4 motion-safe:animate-spin motion-reduce:animate-none" />
          {isThai ? "กำลังโหลด Production โปรเจกต์" : "Loading production workspace"}
        </div>
        <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          {props.workspaceStateMessage ?? (isThai ? "กำลังโหลดข้อมูลโปรเจกต์ โปรดลองอีกครั้งหลังโหลดเสร็จ" : "Please wait while the production workspace loads.")}
        </div>
      </div>
    );
  }

  if (workspaceViewState === "error") {
    return (
      <div className="space-y-4 rounded-lg border bg-white p-4" data-testid="production-workspace-state-error">
        <div className="flex items-center gap-2 text-sm font-semibold text-red-700">
          <AlertCircle className="h-4 w-4" />
          {isThai ? "โหลดโปรเจกต์ไม่สำเร็จ" : "Failed to load production workspace"}
        </div>
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {props.workspaceStateMessage ?? (isThai ? "เกิดข้อผิดพลาดระหว่างโหลดข้อมูล โปรดลองอีกครั้ง" : "Something went wrong while loading this production workspace.")}
        </div>
        {props.onWorkspacePrimaryAction ? (
          <Button type="button" variant="outline" className="border-sky-800 bg-sky-800 text-white hover:bg-sky-900 hover:text-white" onClick={props.onWorkspacePrimaryAction}>
            {props.workspaceStatePrimaryLabel ?? (isThai ? "ลองอีกครั้ง" : "Retry")}
          </Button>
        ) : null}
      </div>
    );
  }

  if (workspaceViewState === "conflict") {
    return (
      <div className="space-y-4 rounded-lg border bg-white p-4" data-testid="production-workspace-state-conflict">
        <div className="flex items-center gap-2 text-sm font-semibold text-amber-700">
          <AlertTriangle className="h-4 w-4" />
          {isThai ? "พบเวอร์ชันล่าสุดใหม่กว่า" : "Conflict detected"}
        </div>
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {props.workspaceStateMessage ??
            (isThai
              ? "โปรเจกต์นี้มีการแก้ไขใหม่กว่าอยู่แล้ว กรุณาโหลดเวอร์ชันล่าสุดก่อนดำเนินการต่อ"
              : "A newer project version exists. Reload the latest version before making changes.")}
        </div>
        <div className="flex flex-wrap gap-2">
          {props.onWorkspacePrimaryAction ? (
            <Button type="button" variant="outline" className="border-sky-800 bg-sky-800 text-white hover:bg-sky-900 hover:text-white" onClick={props.onWorkspacePrimaryAction}>
              {props.workspaceStatePrimaryLabel ?? (isThai ? "โหลดเวอร์ชันล่าสุด" : "Reload latest")}
            </Button>
          ) : null}
          {props.onWorkspaceSecondaryAction ? (
            <Button type="button" variant="outline" onClick={props.onWorkspaceSecondaryAction}>
              {props.workspaceStateSecondaryLabel ?? (isThai ? "บันทึกเป็นเวอร์ชันใหม่" : "Save as new version")}
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  if (workspaceViewState === "feature_disabled") {
    return (
      <div className="space-y-4 rounded-lg border bg-white p-4" data-testid="production-workspace-state-disabled">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <AlertTriangle className="h-4 w-4" />
          {isThai ? "ฟีเจอร์ Production ยังถูกปิดอยู่" : "Production feature is disabled"}
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-muted-foreground">
          {props.workspaceStateMessage ??
            (isThai
              ? "มีบางส่วนถูกควบคุมด้วยฟีเจอร์แฟล็กเพื่อความปลอดภัย โปรดลองอีกครั้งเมื่อเปิดใช้งานแล้ว"
              : "Some actions are currently gated by feature flags. Open projects or edit details from compatible screens.")}
        </div>
        {props.onWorkspacePrimaryAction ? (
          <Button type="button" variant="outline" onClick={props.onWorkspacePrimaryAction}>
            {props.workspaceStatePrimaryLabel ?? (isThai ? "เปิดใช้งานฟีเจอร์นี้" : "Open feature controls")}
          </Button>
        ) : null}
      </div>
    );
  }

  if (workspaceViewState === "archived" || workspaceViewState === "deleted" || workspaceViewState === "stale") {
    const isDeleted = workspaceViewState === "deleted";
    return (
      <div className="space-y-4 rounded-lg border bg-white p-4" data-testid={`production-workspace-state-${workspaceViewState}`}>
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <AlertTriangle className="h-4 w-4" />
          {workspaceViewState === "stale"
            ? (isThai ? "ข้อมูลที่เปิดอยู่เก่ากว่าเวอร์ชันล่าสุด" : "Workspace is stale")
            : isDeleted
              ? (isThai ? "โปรเจกต์นี้ถูกลบแล้ว" : "Production project is deleted")
              : (isThai ? "โปรเจกต์นี้ถูก archive แล้ว" : "Production project is archived")}
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-muted-foreground">
          {props.workspaceStateMessage ??
            (isDeleted
              ? (isThai ? "อ่านรายละเอียดได้เท่านั้น และต้อง restore ก่อนทำงานต่อ" : "Read-only details remain available. Restore before continuing work.")
              : (isThai ? "โหมดนี้อ่านและ export ได้ แต่ action ที่แก้ไข/execute จะถูกปิด" : "This mode allows read/export only. Editing and execution are disabled."))}
        </div>
        <div className="flex flex-wrap gap-2">
          {props.onWorkspacePrimaryAction ? (
            <Button type="button" variant="outline" className="border-sky-800 bg-sky-800 text-white hover:bg-sky-900 hover:text-white" onClick={props.onWorkspacePrimaryAction}>
              {props.workspaceStatePrimaryLabel ?? (isThai ? "โหลดล่าสุด" : "Reload latest")}
            </Button>
          ) : null}
          {props.onWorkspaceSecondaryAction ? (
            <Button type="button" variant="outline" onClick={props.onWorkspaceSecondaryAction}>
              {props.workspaceStateSecondaryLabel ?? (isThai ? "Restore" : "Restore")}
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  if (isEmptyProduction) {
    return (
      <div className="min-w-0 space-y-4 text-slate-900" data-testid="production-workspace">
        <section className="rounded-lg border border-sky-200 bg-white shadow-sm" data-testid="production-empty-state">
          <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="outline" className="bg-sky-50 text-sky-700">
                  Production
                </Badge>
                <Badge variant="outline">{isThai ? "ยังไม่ได้เลือกโปรเจกต์" : "No project selected"}</Badge>
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-950">
                  {isThai ? "เริ่มจากบรีฟหลักก่อนเปิด canvas" : "Start with a brief before opening the canvas"}
                </h2>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                  {isThai
                    ? "ตั้งชื่อและเป้าหมายกลางของโปรเจกต์ แล้วค่อยสร้างแผนหรือเปิดโปรเจกต์เดิม พื้นที่ canvas, evidence และ config จะปรากฏเมื่อมีบริบทพร้อมทำงาน"
                    : "Name the project and define the central goal, then create a plan or open an existing project. Canvas, evidence, and config panels appear once there is enough context to work with."}
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-[minmax(220px,320px)_minmax(0,1fr)]">
                <Input
                  value={brief.title ?? ""}
                  onChange={(event) => patchBrief({ title: event.target.value })}
                  placeholder={isThai ? "ชื่อโปรเจกต์" : "Project title"}
                  aria-label={isThai ? "ชื่อโปรเจกต์ Production" : "Production project title"}
                  disabled
                  className="h-11 rounded-md border-slate-200 bg-slate-50/70 text-base font-medium shadow-none focus-visible:bg-white"
                />
                <Textarea
                  value={brief.summary ?? ""}
                  onChange={(event) => patchBrief({ summary: event.target.value })}
                  placeholder={isThai ? "เป้าหมายการผลิต" : "Production goal"}
                  aria-label={isThai ? "เป้าหมายการผลิต" : "Production goal"}
                  disabled
                  className="min-h-[72px] rounded-md border-slate-200 bg-slate-50/70 text-sm shadow-none focus-visible:bg-white"
                />
              </div>
            </div>
            <div className="grid content-start gap-2 rounded-md border border-slate-100 bg-slate-50 p-3">
              <Button type="button" variant="outline" onClick={props.onCreateFixturePlan} disabled className="border-sky-800 bg-sky-800 text-white hover:bg-sky-900 hover:text-white">
                <Route className="mr-2 h-4 w-4" />
                {isThai ? "เลือกหรือสร้างโปรเจกต์ก่อน" : "Open or create a project first"}
              </Button>
              <Button type="button" variant="outline" onClick={props.onProjectSearchOpen}>
                <Search className="mr-2 h-4 w-4" />
                {isThai ? "เปิดโปรเจกต์เดิม" : "Open existing project"}
              </Button>
              <Button type="button" variant="outline" onClick={props.onNewProject}>
                <Sparkles className="mr-2 h-4 w-4" />
                {isThai ? "สร้างโปรเจกต์ใหม่" : "New project"}
              </Button>
            </div>
          </div>
        </section>
        {showCanvasSections ? (
          <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm" data-testid="production-empty-canvas">
            <ProductionFlowCanvas
              flowNodes={[]}
              flowEdges={[]}
              contextAssets={[]}
              selectedNodeId={null}
              locale={props.locale}
              onAddNode={props.onAddNode}
              onSelectNode={props.onSelectNode}
              onConnectNodes={props.onConnectNodes}
              onInvalidEdge={props.onInvalidEdge}
              onNodePositionChange={props.onNodePositionChange}
              onAssetAddToCanvas={props.onAssetAddToCanvas}
              onAssetAssignToNode={props.onAssetAssignToNode}
              onConfigureNode={props.onConfigureNode}
              onDeleteNode={props.onDeleteNode}
              onResetCanvas={props.onResetCanvas}
              onRunNode={props.onRunNode}
              onCancelNodeExecution={props.onCancelNodeExecution}
              onRetryNode={props.onRetryNode}
              onOpenNodeOutput={props.onOpenNodeOutput}
            />
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-4 text-slate-900" data-testid={isCanvasOnlyMode ? "production-workspace-canvas-embed" : "production-workspace"}>
      {showPlanningSections ? (
        <>
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 p-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline" className="bg-sky-50 text-sky-700">
                Production
              </Badge>
              <Badge variant="outline">{formattedStatus}</Badge>
              {props.productionRunId ? <Badge variant="outline" className="max-w-full truncate">{props.productionRunId}</Badge> : null}
            </div>
            <div className="grid gap-3 lg:grid-cols-[minmax(220px,340px)_minmax(0,1fr)]">
              <Input
                value={brief.title ?? ""}
                onChange={(event) => patchBrief({ title: event.target.value })}
                placeholder={isThai ? "ชื่อโปรเจกต์" : "Project title"}
                aria-label={isThai ? "ชื่อโปรเจกต์ Production" : "Production project title"}
                className="h-11 rounded-md border-slate-200 bg-slate-50/70 text-base font-medium shadow-none focus-visible:bg-white"
              />
              <Textarea
                value={brief.summary ?? ""}
                onChange={(event) => patchBrief({ summary: event.target.value })}
                placeholder={isThai ? "เป้าหมายการผลิต" : "Production goal"}
                aria-label={isThai ? "เป้าหมายการผลิต" : "Production goal"}
                className="min-h-[72px] rounded-md border-slate-200 bg-slate-50/70 text-sm shadow-none focus-visible:bg-white"
              />
            </div>
            <div className="rounded-lg border border-sky-200 bg-sky-50/70 px-3 py-2" data-testid="production-next-action-compact">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="border-sky-200 bg-white text-sky-800">
                      <Zap className="mr-1 h-3 w-3" />
                      {isThai ? "ขั้นต่อไป" : "Next"}
                    </Badge>
                    {selectedNode ? <span className="truncate text-xs font-medium text-slate-700">{selectedNode.title}</span> : null}
                  </div>
                  <div className="mt-1 truncate text-sm font-semibold text-slate-950">{nextAction.title}</div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={nextAction.action === "run" || nextAction.action === "output" ? "shrink-0 border-sky-800 bg-sky-800 text-white hover:bg-sky-900 hover:text-white" : "shrink-0"}
                  disabled={nextAction.disabled || (nextAction.action !== "attach" && !selectedNode && nextAction.action !== "plan")}
                  onClick={() => {
                    if (nextAction.action === "run" && selectedNode) props.onRunNode?.(selectedNode.id);
                    else if (nextAction.action === "output" && selectedNode) props.onOpenNodeOutput?.(selectedNode.id, selectedNodeLatestOutput?.outputRefId);
                    else if (nextAction.action === "configure" && selectedNode) props.onConfigureNode?.(selectedNode.id);
                    else if (nextAction.action === "plan") props.onCreateFixturePlan();
                    else document.querySelector("[data-testid='context-asset-board']")?.scrollIntoView({ block: "start", behavior: "smooth" });
                  }}
                >
                  {nextAction.label}
                </Button>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 xl:max-w-[420px] xl:justify-end">
            <Button type="button" variant="outline" onClick={props.onCreateFixturePlan} disabled={props.isPlanning} className="min-w-[164px] border-sky-800 bg-sky-800 text-white hover:bg-sky-900 hover:text-white">
              <Route className="mr-2 h-4 w-4" />
              {props.isPlanning
                ? (isThai ? "กำลังเตรียมแนวคิด..." : "Preparing...")
                : (isThai ? "วางแผน / เสนอ 4 แนวคิด" : "Plan / Suggest 4 concepts")}
            </Button>
            <Button type="button" variant="outline" onClick={props.onSave} disabled={props.isSaving} className="min-w-[120px]">
              <Save className="mr-2 h-4 w-4" />
              {isThai ? "บันทึก Draft" : "Save Draft"}
            </Button>
            {(props.onProjectSearchOpen || props.onOpenVideoShot || props.onArchiveProject || props.onRestoreProject || props.onDeleteProject) ? (
              <details className="relative">
                <summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
                  <MoreHorizontal className="h-4 w-4" />
                  {isThai ? "เพิ่มเติม" : "More"}
                </summary>
                <div className="absolute right-0 z-20 mt-2 grid min-w-56 gap-1 rounded-md border border-slate-200 bg-white p-2 shadow-lg">
                  {props.onProjectSearchOpen ? (
                    <Button type="button" variant="ghost" size="sm" className="justify-start" onClick={props.onProjectSearchOpen}>
                      <Search className="mr-2 h-4 w-4" />
                      {isThai ? "ค้นหา/เปิดโปรเจกต์" : "Search / Open"}
                    </Button>
                  ) : null}
                  {props.onOpenVideoShot ? (
                    <Button type="button" variant="ghost" size="sm" className="justify-start" onClick={props.onOpenVideoShot}>
                      <Film className="mr-2 h-4 w-4" />
                      {isThai ? "เปิด Video Shot" : "Open Video Shot"}
                    </Button>
                  ) : null}
                  {props.onArchiveProject ? (
                    <Button type="button" variant="ghost" size="sm" className="justify-start" onClick={props.onArchiveProject} disabled={lifecycleDisabled}>
                      <Archive className="mr-2 h-4 w-4" />
                      {isThai ? "เก็บถาวร" : "Archive"}
                    </Button>
                  ) : null}
                  {props.onRestoreProject ? (
                    <Button type="button" variant="ghost" size="sm" className="justify-start" onClick={props.onRestoreProject} disabled={lifecycleDisabled}>
                      <RotateCcw className="mr-2 h-4 w-4" />
                      {isThai ? "กู้คืน" : "Restore"}
                    </Button>
                  ) : null}
                  {props.onDeleteProject ? (
                    <Button type="button" variant="ghost" size="sm" className="justify-start text-red-700 hover:bg-red-50 hover:text-red-800" onClick={props.onDeleteProject} disabled={lifecycleDisabled}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      {isThai ? "ลบ Draft" : "Delete Draft"}
                    </Button>
                  ) : null}
                </div>
              </details>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" data-testid="production-planning-skill-panel">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Route className="h-4 w-4 text-sky-600" />
              {isThai ? "ทักษะวางแผน / บริบทโมเดล" : "Planning skill / model context"}
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {(planningSelection?.tags ?? planningSkills.find((skill) => skill.id === selectedPlanningSkillId)?.tags ?? []).map((tag) => (
                <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>
              ))}
              <Badge variant="outline" className={planningSelection?.compatibility === "blocked" ? "border-red-200 bg-red-50 text-red-700" : planningSelection?.compatibility === "warning" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}>
                {planningSelection?.compatibility ?? "compatible"}
              </Badge>
            </div>
          </div>
          <div className="grid w-full gap-2 lg:w-[520px]">
            <select
              className="h-9 rounded-md border border-slate-200 bg-slate-50 px-2 text-sm"
              value={selectedPlanningSkillId}
              onChange={(event) => props.onPlanningSkillChange?.(event.target.value)}
              aria-label={isThai ? "เลือก planning skill" : "Planning skill selector"}
            >
              {planningSkills.map((skill) => (
                <option key={skill.id} value={skill.id}>
                  {skill.title}
                </option>
              ))}
            </select>
            <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)]">
              <select
                className="h-9 rounded-md border border-slate-200 bg-slate-50 px-2 text-sm"
                value={planningModelMode}
                onChange={(event) => props.onPlanningModelChange?.(event.target.value as ProductionPlanningSelection["modelMode"], selectedPlanningModel || undefined)}
                aria-label={isThai ? "โหมดเลือกโมเดล planning" : "Planning model mode"}
              >
                <option value="auto">Auto</option>
                <option value="manual">Manual</option>
              </select>
              <select
                className="h-9 min-w-0 rounded-md border border-slate-200 bg-slate-50 px-2 text-sm disabled:text-slate-400"
                value={selectedPlanningModel}
                disabled={planningModelMode === "auto"}
                onChange={(event) => props.onPlanningModelChange?.("manual", event.target.value || undefined)}
                aria-label={isThai ? "โมเดล planning" : "Planning model"}
              >
                <option value="">{planningModelMode === "auto" ? (isThai ? "Auto model" : "Auto model") : (isThai ? "เลือกโมเดล LLM" : "Select LLM model")}</option>
                {(props.planningModelOptions ?? []).map((model) => (
                  <option key={model.modelId} value={model.modelId}>{planningModelOptionLabel(model)}</option>
                ))}
                {selectedPlanningModel && !(props.planningModelOptions ?? []).some((model) => model.modelId === selectedPlanningModel) ? (
                  <option value={selectedPlanningModel}>{selectedPlanningModel}</option>
                ) : null}
              </select>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <select
                className="h-9 rounded-md border border-slate-200 bg-slate-50 px-2 text-sm"
                value={selectedImageModelId}
                onChange={(event) => props.onGenerationDefaultChange?.({
                  imageModelId: event.target.value || undefined,
                  imageModelSource: event.target.value ? "project_default" : "system_default",
                })}
                aria-label={isThai ? "โมเดลเริ่มต้นสำหรับสร้างภาพ" : "Default image generation model"}
              >
                <option value="">{isThai ? "Auto image model" : "Auto image model"}</option>
                {(props.imageModelOptions ?? []).map((model) => (
                  <option key={model.modelId} value={model.modelId}>{modelOptionLabel(model)}</option>
                ))}
              </select>
              {storyboardReferenceSkillOptions.length ? (
                <select
                  className="h-9 rounded-md border border-slate-200 bg-slate-50 px-2 text-sm"
                  value={selectedStoryboardReferenceSkillId}
                  onChange={(event) => props.onStoryboardReferenceSkillChange?.(event.target.value)}
                  aria-label={isThai ? "Skill สำหรับ prompt ภาพ start/stop" : "Start/stop image prompt skill"}
                >
                  {storyboardReferenceSkillOptions.map((skill) => (
                    <option key={skill.id} value={skill.id}>{skill.label}</option>
                  ))}
                </select>
              ) : null}
              <select
                className="h-9 rounded-md border border-slate-200 bg-slate-50 px-2 text-sm"
                value={selectedVideoModelId}
                onChange={(event) => props.onGenerationDefaultChange?.({
                  videoModelId: event.target.value || undefined,
                  videoModelSource: event.target.value ? "project_default" : "system_default",
                })}
                aria-label={isThai ? "โมเดลเริ่มต้นสำหรับสร้างวิดีโอ" : "Default video generation model"}
              >
                <option value="">{isThai ? "Auto video model" : "Auto video model"}</option>
                {(props.videoModelOptions ?? []).map((model) => (
                  <option key={model.modelId} value={model.modelId}>{modelOptionLabel(model)}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="mt-3 grid gap-2 text-xs text-muted-foreground md:grid-cols-4">
          {[
            [isThai ? "Assets" : "Assets", planningSelection?.contextPack?.assetCount ?? space.contextAssets.length],
            [isThai ? "Shots" : "Shots", planningSelection?.contextPack?.shotCount ?? space.shots.length],
            [isThai ? "Product evidence" : "Product evidence", evidenceStatusLabel(String(planningSelection?.contextPack?.productEvidenceStatus ?? space.productEvidenceManifest?.status ?? "none"), props.locale)],
            [isThai ? "Targets" : "Targets", (planningSelection?.contextPack?.desiredTargets ?? ["storyboard_review", "video_edit"]).map((target) => targetLabel(target, props.locale)).join(", ")],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
              <span className="block text-[10px] uppercase tracking-normal text-slate-500">{label}</span>
              <span className="block truncate font-medium text-slate-700">{value}</span>
            </div>
          ))}
        </div>
        <div
          className="mt-3 rounded-lg border border-dashed border-sky-200 bg-sky-50/60 p-3 transition hover:border-sky-300 hover:bg-sky-50"
          data-testid="production-planning-attachment-dropzone"
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDrop={(event) => handlePlanningAttachmentDrop(event)}
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-950">
                <Paperclip className="h-4 w-4 text-sky-700" />
                {isThai ? "ไฟล์แนบสำหรับสร้างแผน" : "Planning attachments"}
                <Badge variant="outline" className="bg-white">
                  {planningAttachments.length}/{maxPlanningAttachments}
                </Badge>
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                {isThai
                  ? "ลากรูปลงช่องตัวละคร สินค้า หรือฉากด้านล่าง เพื่อกำหนดบทบาทก่อนส่งให้ skill และ planner"
                  : "Drop images into the character, product, or environment lanes below so their role is fixed before skill and planner execution."}
              </p>
            </div>
            <div className="grid min-w-[220px] grid-cols-2 gap-1 text-[11px] text-slate-700 sm:grid-cols-3 lg:max-w-[420px]">
              {(Object.keys(planningAttachmentCounts) as ProductionContextAssetZone[]).map((zone) => (
                <div key={zone} className="rounded-md border border-sky-100 bg-white px-2 py-1">
                  <span className="block truncate text-slate-500">{planningAttachmentLabel(zone, isThai)}</span>
                  <span className="font-semibold tabular-nums">{planningAttachmentCounts[zone]}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-3" data-testid="production-planning-role-dropzones">
            {planningImageDropZones.map((dropZone) => {
              const count = planningAttachments.filter((asset) => inferPlanningAssetZone(asset) === dropZone.zone).length;
              return (
                <div
                  key={dropZone.zone}
                  className="rounded-md border border-dashed border-sky-200 bg-white/80 p-3 transition hover:border-sky-400 hover:bg-white"
                  data-testid={`production-planning-attachment-dropzone-${dropZone.zone}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "copy";
                  }}
                  onDrop={(event) => {
                    event.stopPropagation();
                    handlePlanningAttachmentDrop(event, dropZone.zone);
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-900">{planningAttachmentLabel(dropZone.zone, isThai)}</span>
                    <Badge variant="outline" className="bg-slate-50">{count}</Badge>
                  </div>
                  <p className="mt-1 text-[11px] leading-4 text-slate-600">
                    {dropZone.zone === "cast"
                      ? (isThai ? "รูปคน / presenter / character เท่านั้น" : "People, presenter, or character references only.")
                      : dropZone.zone === "products"
                        ? (isThai ? "รูปสินค้าจริง / packshot / marketplace evidence" : "Real product, packshot, or marketplace evidence references.")
                        : (isThai ? "รูปห้อง ฉาก mood แสง พื้น ผนัง หรือ environment" : "Room, scene, mood, lighting, floor, wall, or environment references.")}
                  </p>
                </div>
              );
            })}
          </div>
          {planningAttachments.length ? (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1" data-testid="production-planning-attachment-list">
              {planningAttachments.map((asset) => {
                const Icon = planningAttachmentIcon(asset);
                const zone = inferPlanningAssetZone(asset);
                return (
                  <div key={asset.id} className="flex min-w-[188px] max-w-[240px] items-center gap-2 rounded-md border border-slate-200 bg-white p-2 shadow-sm">
                    <div className="flex h-10 w-12 shrink-0 items-center justify-center overflow-hidden rounded border bg-slate-50">
                      {asset.thumbnailUrl || asset.url ? (
                        asset.kind === "audio_asset" ? (
                          <Icon className="h-4 w-4 text-sky-700" />
                        ) : (
                          <img src={asset.thumbnailUrl || asset.url} alt="" className="h-full w-full object-cover" draggable={false} />
                        )
                      ) : (
                        <Icon className="h-4 w-4 text-sky-700" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-semibold text-slate-900">{asset.title}</div>
                      <div className="truncate text-[11px] text-slate-500">{planningAttachmentLabel(zone, isThai)} · {asset.role ?? asset.kind}</div>
                    </div>
                    {props.onRemovePlanningAsset ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-slate-500 hover:bg-red-50 hover:text-red-600"
                        aria-label={isThai ? `ลบ ${asset.title}` : `Remove ${asset.title}`}
                        data-testid={`production-planning-attachment-remove-${asset.id}`}
                        onClick={() => props.onRemovePlanningAsset?.(asset)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-3 rounded-md border border-sky-100 bg-white px-3 py-2 text-xs text-slate-600">
              {isThai ? "ยังไม่มีไฟล์แนบสำหรับ planner" : "No planner attachments yet."}
            </div>
          )}
        </div>
      </section>
        </>
      ) : null}

      {showConceptSections && storyWizard?.status === "options_ready" && storyWizard.options.length ? (
        <ProductionConceptBoard
          storyWizard={storyWizard}
          selectedStoryConcept={selectedStoryConcept}
          isThai={isThai}
          isPlanning={props.isPlanning}
          onSelectStoryConcept={props.onSelectStoryConcept}
          onConfirmStoryConceptPlan={props.onConfirmStoryConceptPlan}
          onRegenerateStoryConcepts={props.onRegenerateStoryConcepts}
          onGenerateStoryConceptInfographic={props.onGenerateStoryConceptInfographic}
          onResetStoryConcepts={props.onResetStoryConcepts}
          storyboardBuildMode={props.storyboardBuildMode}
          onStoryboardBuildModeChange={props.onStoryboardBuildModeChange}
          storyboardClipDurationSeconds={props.storyboardClipDurationSeconds}
          storyboardClipDurationOptions={props.storyboardClipDurationOptions}
          totalDurationSeconds={Number(brief.durationSeconds) || undefined}
          onStoryboardClipDurationSecondsChange={props.onStoryboardClipDurationSecondsChange}
        />
      ) : null}

      {showWorkflowSections ? (
        <>
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <ol className="flex flex-wrap gap-2" data-testid="production-journey-stepper" aria-label={isThai ? "ขั้นตอน Production" : "Production journey"}>
          {journeySteps.map(([key, label], index) => (
            <li
              key={key}
              aria-current={index === activeStepIndex ? "step" : undefined}
              className={`flex min-w-[92px] flex-1 items-center gap-2 rounded-md border px-2 py-2 text-xs ${
                index <= activeStepIndex ? "border-sky-200 bg-sky-50 text-sky-800" : "border-slate-200 bg-slate-50 text-slate-600"
              }`}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border bg-white text-[11px]">{index + 1}</span>
              <span className="truncate font-medium">{label}</span>
              {index === activeStepIndex ? <span className="sr-only">{isThai ? "ขั้นตอนปัจจุบัน" : "current step"}</span> : null}
            </li>
          ))}
        </ol>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <select
            value={brief.goalType ?? ""}
            onChange={(event) => patchBrief({ goalType: event.target.value || undefined })}
            aria-label={isThai ? "ประเภทเป้าหมาย" : "Goal type"}
            className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          >
            <option value="">{isThai ? "เลือกประเภทเป้าหมาย" : "Select goal type"}</option>
            {hasCustomGoalType ? <option value={brief.goalType}>{brief.goalType}</option> : null}
            {goalTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>{labelForOption(option)}</option>
            ))}
          </select>
          <Input
            list="production-audience-options"
            value={brief.audience ?? ""}
            onChange={(event) => patchBrief({ audience: event.target.value })}
            placeholder={isThai ? "กลุ่มเป้าหมาย" : "Audience"}
            aria-label={isThai ? "กลุ่มเป้าหมาย" : "Audience"}
          />
          <datalist id="production-audience-options">
            {audienceOptions.map((option) => (
              <option key={option.value} value={labelForOption(option)} />
            ))}
          </datalist>
          <Input
            list="production-platform-options"
            value={brief.platform ?? ""}
            onChange={(event) => patchBrief({ platform: event.target.value })}
            placeholder={isThai ? "แพลตฟอร์ม" : "Platform"}
            aria-label={isThai ? "แพลตฟอร์ม" : "Platform"}
          />
          <datalist id="production-platform-options">
            {platformOptions.map((option) => (
              <option key={option.value} value={option.value}>{labelForOption(option)}</option>
            ))}
          </datalist>
          <Input
            list="production-duration-options"
            inputMode="numeric"
            value={currentDuration}
            onChange={(event) => {
              const nextDuration = event.target.value.replace(/[^\d]/g, "");
              patchBrief({ durationSeconds: nextDuration ? Number(nextDuration) : undefined });
            }}
            placeholder={isThai ? "ความยาวรวม วินาที" : "Total seconds"}
            aria-label={isThai ? "ความยาววิดีโอ" : "Duration seconds"}
            className="h-11 bg-white"
          />
          <datalist id="production-duration-options">
            {durationOptions.map((seconds) => (
              <option key={seconds} value={seconds}>{seconds}s</option>
            ))}
          </datalist>
          <select
            value={String(storyboardClipDurationSeconds)}
            onChange={(event) => props.onStoryboardClipDurationSecondsChange?.(Number(event.target.value) || storyboardClipDurationSeconds)}
            aria-label={isThai ? "วินาทีต่อวิดีโอ" : "Storyboard seconds per video"}
            className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          >
            {storyboardClipDurationOptions.map((seconds) => (
              <option key={seconds} value={seconds}>
                {Number(brief.durationSeconds) > 0
                  ? (isThai
                    ? `${seconds}s / วิดีโอ (${Math.max(1, Math.ceil(Number(brief.durationSeconds) / seconds))} วิดีโอ)`
                    : `${seconds}s / video (${Math.max(1, Math.ceil(Number(brief.durationSeconds) / seconds))} videos)`)
                  : (isThai ? `${seconds}s / วิดีโอ` : `${seconds}s / video`)}
              </option>
            ))}
          </select>
          <select
            value={brief.aspectRatio ?? ""}
            onChange={(event) => patchBrief({ aspectRatio: event.target.value || undefined })}
            aria-label={isThai ? "อัตราส่วนภาพ" : "Aspect ratio"}
            className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          >
            <option value="">{isThai ? "เลือกอัตราส่วนภาพ" : "Select aspect ratio"}</option>
            {hasCustomAspectRatio ? <option value={brief.aspectRatio}>{brief.aspectRatio}</option> : null}
            {aspectRatioOptions.map((ratio) => (
              <option key={ratio} value={ratio}>{ratio}</option>
            ))}
          </select>
          <select
            value={brief.language ?? ""}
            onChange={(event) => patchBrief({ language: event.target.value || undefined })}
            aria-label={isThai ? "ภาษา" : "Language"}
            className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          >
            <option value="">{isThai ? "เลือกภาษา" : "Select language"}</option>
            {hasCustomLanguage ? <option value={brief.language}>{brief.language}</option> : null}
            {languageOptions.map((option) => (
              <option key={option.value} value={option.value}>{labelForOption(option)}</option>
            ))}
          </select>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <Textarea
            value={brief.brandTruth ?? ""}
            onChange={(event) => patchBrief({ brandTruth: event.target.value })}
            placeholder={isThai ? "Product truth / brand truth" : "Product truth / brand truth"}
            aria-label="Product truth"
            className="min-h-[92px]"
          />
          <Textarea
            value={brief.creativeDirection ?? ""}
            onChange={(event) => patchBrief({ creativeDirection: event.target.value })}
            placeholder={isThai ? "Creative direction" : "Creative direction"}
            aria-label="Creative direction"
            className="min-h-[92px]"
          />
          <Textarea
            value={brief.constraintsText ?? ""}
            onChange={(event) => patchBrief({ constraintsText: event.target.value })}
            placeholder={isThai ? "ข้อจำกัด / สิ่งที่ห้ามทำ" : "Constraints / guardrails"}
            aria-label="Constraints"
            className="min-h-[92px]"
          />
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        {[
          { icon: Layers, label: isThai ? "ช็อต" : "Shots", value: space.shots.length },
          { icon: ListTree, label: isThai ? "โหนด" : "Nodes", value: space.flowNodes.length },
          { icon: AlertCircle, label: isThai ? "ปัญหาที่ต้องแก้" : "Blockers", value: blockedCount },
          { icon: Clock, label: isThai ? "เครดิตก่อนยืนยัน" : "Credits before confirm", value: creditEstimate },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-2xl font-semibold tabular-nums">{item.value}</div>
                <div className="text-xs text-muted-foreground">{item.label}</div>
              </div>
              <div className="rounded-md bg-sky-50 p-2 text-sky-700">
                <item.icon className="h-4 w-4" />
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-sky-200 bg-sky-50/70 p-3 shadow-sm" data-testid="production-next-action">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-sky-200 bg-white text-sky-800">
                <Zap className="mr-1 h-3 w-3" />
                {isThai ? "ขั้นต่อไป" : "Next best action"}
              </Badge>
              {selectedNode ? <Badge variant="outline">{selectedNode.title}</Badge> : null}
              {runScopeLabel ? <Badge variant="outline">{runScopeLabel}</Badge> : null}
            </div>
            <div className="mt-2 text-sm font-semibold text-slate-950">{nextAction.title}</div>
            <div className="mt-1 text-xs leading-5 text-slate-700">{nextAction.body}</div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {nextAction.action === "run" ? (
              <Button type="button" variant="outline" className="border-sky-800 bg-sky-800 text-white hover:bg-sky-900 hover:text-white" disabled={!selectedNode || !workspaceNodeCanRun(selectedNode)} onClick={() => selectedNode && props.onRunNode?.(selectedNode.id)}>
                <Play className="mr-2 h-4 w-4" />
                {selectedNodeOutputs > 0 || selectedNode?.status === "completed" ? "Regenerate" : nextAction.label}
              </Button>
            ) : nextAction.action === "output" ? (
              <Button type="button" variant="outline" className="border-sky-800 bg-sky-800 text-white hover:bg-sky-900 hover:text-white" disabled={!selectedNode || !selectedNodeLatestOutput} onClick={() => selectedNode && props.onOpenNodeOutput?.(selectedNode.id, selectedNodeLatestOutput?.outputRefId)}>
                <Eye className="mr-2 h-4 w-4" />
                {nextAction.label}
              </Button>
            ) : nextAction.action === "configure" ? (
              <Button type="button" variant="outline" disabled={!selectedNode} onClick={() => selectedNode && props.onConfigureNode?.(selectedNode.id)}>
                <Settings2 className="mr-2 h-4 w-4" />
                {nextAction.label}
              </Button>
            ) : (
              <Button type="button" variant="outline" disabled={nextAction.disabled} onClick={nextAction.action === "plan" ? props.onCreateFixturePlan : () => document.querySelector("[data-testid='context-asset-board']")?.scrollIntoView({ block: "start", behavior: "smooth" })}>
                <ArrowRight className="mr-2 h-4 w-4" />
                {nextAction.label}
              </Button>
            )}
          </div>
        </div>
      </section>
        </>
      ) : null}

      {showCanvasSections ? (
        <>
      <ProductionFlowCanvas
        flowNodes={space.flowNodes}
        flowEdges={space.flowEdges}
        contextAssets={space.contextAssets}
        selectedNodeId={selectedNodeId}
        locale={props.locale}
        onAddNode={props.onAddNode}
        onSelectNode={handleSelectNode}
        onConnectNodes={props.onConnectNodes}
        onInvalidEdge={props.onInvalidEdge}
        onNodePositionChange={props.onNodePositionChange}
        onAssetAddToCanvas={props.onAssetAddToCanvas}
        onAssetAssignToNode={props.onAssetAssignToNode}
        onConfigureNode={props.onConfigureNode}
        onDeleteNode={props.onDeleteNode}
        onResetCanvas={props.onResetCanvas}
        onRunNode={props.onRunNode}
        onCancelNodeExecution={props.onCancelNodeExecution}
        onRetryNode={props.onRetryNode}
        onOpenNodeOutput={props.onOpenNodeOutput}
      />

      {selectedNode ? (
        <section className="sticky bottom-2 z-20 rounded-lg border border-slate-200 bg-white/95 p-2 shadow-lg backdrop-blur 2xl:hidden" data-testid="production-mobile-node-actions">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-slate-900">{selectedNode.title}</div>
              <div className="truncate text-[11px] text-muted-foreground">{runScopeLabel}</div>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button type="button" variant="outline" size="sm" className="h-9 px-2" onClick={() => props.onConfigureNode?.(selectedNode.id)} aria-label={isThai ? "ตั้งค่า node ที่เลือก" : "Configure selected node"}>
                <Settings2 className="h-4 w-4" />
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-9 px-2" disabled={!workspaceNodeCanRun(selectedNode)} onClick={() => props.onRunNode?.(selectedNode.id)} aria-label={isThai ? "run node ที่เลือก" : "Run selected node"}>
                <Play className="h-4 w-4" />
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-9 px-2" disabled={!selectedNodeLatestOutput} onClick={() => props.onOpenNodeOutput?.(selectedNode.id, selectedNodeLatestOutput?.outputRefId)} aria-label={isThai ? "เปิดผลลัพธ์ node ที่เลือก" : "Open selected node output"}>
                <Eye className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 2xl:hidden" role="tablist" aria-label={isThai ? "แผงเสริม Production" : "Production side panels"}>
        {([
          ["assets", isThai ? "แอสเซ็ต" : "Assets"],
          ["evidence", isThai ? "หลักฐาน" : "Evidence"],
          ["config", isThai ? "ตั้งค่า" : "Config"],
          ["safeguards", isThai ? "ควบคุม" : "Safeguards"],
        ] as const).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={mobilePanelTab === tab}
            onClick={() => setMobilePanelTab(tab)}
            className={`min-h-10 rounded-md border px-3 text-sm font-medium ${mobilePanelTab === tab ? "border-sky-300 bg-sky-50 text-sky-800" : "border-slate-200 bg-white text-slate-600"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <section className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,0.85fr)_minmax(0,0.85fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className={mobilePanelTab === "assets" ? "block" : "hidden 2xl:block"}>
          <ContextAssetBoard
            assets={space.contextAssets}
            selectedNodeId={selectedNodeId}
            selectedNodeTitle={selectedNode?.title}
            locale={props.locale}
            providerCharacterResults={providerCharacterResults}
            onAddAsset={(asset) => props.onAssetAddToCanvas?.(asset)}
            onAssignAssetToNode={(asset, nodeId) => props.onAssetAssignToNode?.({ asset, nodeId })}
          />
        </div>
        <div className={mobilePanelTab === "evidence" ? "block" : "hidden 2xl:block"}>
          <ProductEvidenceTray
            manifest={space.productEvidenceManifest}
            contextAssets={space.contextAssets}
            selectedNodeId={selectedNodeId}
            locale={props.locale}
            onAddProductAsset={(asset, nodeId) => props.onAssetAssignToNode?.({ asset, nodeId })}
            onSetProductRole={props.onSetProductRole}
            onSetClaimStatus={props.onSetClaimStatus}
            onOpenEvidence={props.onOpenEvidence}
            onRemoveEvidenceFromClaim={props.onRemoveEvidenceFromClaim}
          />
        </div>
        <div className={mobilePanelTab === "config" ? "block" : "hidden 2xl:block"}>
          <NodeConfigPanel node={selectedNode} locale={props.locale} onSaveNodeConfig={props.onSaveNodeConfig} />
        </div>
        <div className={`space-y-3 ${mobilePanelTab === "safeguards" ? "block" : "hidden 2xl:block"}`}>
          <div className="rounded-lg border bg-white p-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              {isThai ? "การควบคุมและความปลอดภัย" : "Safeguards"}
            </div>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-emerald-600" />
                {isThai ? "Planning ไม่ใช้เครดิต generation provider" : "Planning does not spend generation provider credits"}
              </div>
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-slate-600" />
                {isThai ? "Planner/Verifier อาจใช้เครดิต LLM; Generate ต้องยืนยันแยก" : "Planner/verifier may use LLM credits; Generate requires separate confirmation"}
              </div>
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                {isThai ? "Live handoff/execution ยังปิดด้วย flag" : "Live handoff/execution remains flag-gated"}
              </div>
              <div className="rounded-md border bg-slate-50 p-2 text-xs" data-testid="production-execution-status-panel">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-700">{isThai ? "สถานะ execution" : "Execution status"}</span>
                  <Badge variant="outline">{latestAttempt?.status ?? "not_started"}</Badge>
                </div>
                <div
                  className="mt-2 h-2 overflow-hidden rounded bg-white"
                  role="progressbar"
                  aria-label={isThai ? "ความคืบหน้า execution" : "Execution progress"}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={latestAttemptProgress}
                  aria-valuetext={`${latestAttempt?.status ?? "not_started"} ${latestAttemptProgress}%`}
                >
                  <div className="h-full bg-emerald-500" style={{ width: `${latestAttemptProgress}%` }} />
                </div>
                <div className="mt-2 grid gap-1 text-muted-foreground">
                  <span>{isThai ? "Confirm: ต้องยืนยันก่อนใช้เครดิต generation" : "Confirm: required before generation credits are reserved"}</span>
                  <span>{isThai ? "Progress: แสดงจาก attempt ล่าสุดและ media task refs" : "Progress: derived from the latest attempt and media task refs"}</span>
                  <span>{isThai ? "Failure/Retry: retry ใช้ attempt id เดิมและ version guard" : "Failure/Retry: retries keep the original attempt id and version guard"}</span>
                  <span>{isThai ? "Reconcile: output refs ซ่อมได้จาก task/provider refs" : "Reconcile: output refs can be repaired from task/provider refs"}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button type="button" variant="outline" size="sm" onClick={props.onRunBatch} disabled={!props.onRunBatch || Boolean(activeAttempt)}>
                  {isThai ? "Generate node ที่พร้อม" : "Generate ready nodes"}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => props.onCancelExecution?.(activeAttempt?.attemptId)} disabled={!props.onCancelExecution || !activeAttempt}>
                  {isThai ? "ยกเลิกงานที่กำลังทำ" : "Cancel running work"}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={props.onRepairOutputRefs} disabled={!props.onRepairOutputRefs}>
                  {isThai ? "ซ่อม output refs" : "Repair output refs"}
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button type="button" variant="outline" size="sm" onClick={props.onSendStoryboardReview} disabled={!props.onSendStoryboardReview || props.isHandoffDisabled}>
                  <Layers className="mr-2 h-4 w-4" />
                  {isThai ? "ส่ง Storyboard Review" : "Send to Storyboard Review"}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={props.onSendVideoEdit} disabled={!props.onSendVideoEdit || props.isHandoffDisabled}>
                  <Film className="mr-2 h-4 w-4" />
                  {isThai ? "เปิดใน Video Edit" : "Open in Video Edit"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
        </>
      ) : null}
    </div>
  );
}
