import { useMemo, useState } from "react";
import { AlertCircle, AlertTriangle, Archive, CheckCircle, Clock, Film, Layers, ListTree, Loader2, Lock, MoreHorizontal, RotateCcw, Route, Save, Search, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ProductionEvidenceStatus, ProductionFlowNode, ProductionGoal, ProductionPlanningSelection, ProductionSpace } from "@shared/mediaProduction";
import { ContextAssetBoard } from "./ContextAssetBoard";
import { NodeConfigPanel } from "./NodeConfigPanel";
import { ProductEvidenceTray } from "./ProductEvidenceTray";
import { ProductionFlowCanvas } from "./ProductionFlowCanvas";
import { evidenceStatusLabel, targetLabel } from "./displayLabels";
import type { ProductionCanvasCallbacks, ProductionLocale, ProductionWorkspaceViewState } from "./types";

export interface ProductionWorkspaceProps extends ProductionCanvasCallbacks {
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
  onPlanningSkillChange?: (skillId: string) => void;
  onPlanningModelChange?: (modelMode: ProductionPlanningSelection["modelMode"], modelId?: string) => void;
  onSetProductRole?: (productId: string, nextRole: string | null) => void;
  onSetClaimStatus?: (productId: string, claimId: string, nextStatus: ProductionEvidenceStatus) => void;
  onOpenEvidence?: (evidenceId: string) => void;
  onRemoveEvidenceFromClaim?: (productId: string, claimId: string, evidenceId: string) => void;
  onCancelExecution?: () => void;
  onRepairOutputRefs?: () => void;
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
    { id: "brief", kind: "planning", title: "Goal Brief", status: "ready", position: { x: 0, y: 80 } },
    { id: "hero-image", kind: "image", title: "Hero Product Image", status: "warning", position: { x: 240, y: 20 }, readinessIssues: ["Product evidence review pending"] },
    { id: "shot-1-node", kind: "video_shot", title: "Shot 1 Group", status: "ready", position: { x: 240, y: 160 }, shotId: "shot-1" },
    { id: "proof-video", kind: "video", title: "Proof Clip", status: "blocked", position: { x: 520, y: 100 }, readinessIssues: ["Missing approved source video"] },
    { id: "handoff", kind: "video_edit", title: "Video Edit Preview", status: "disabled", position: { x: 800, y: 100 } },
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

const durationOptions = [6, 10, 15, 20, 30, 40, 45, 60, 90, 120];
const aspectRatioOptions = ["9:16", "16:9", "1:1", "4:5", "3:4", "21:9"];
const languageOptions = [
  { value: "th", en: "Thai", th: "ไทย" },
  { value: "en", en: "English", th: "อังกฤษ" },
  { value: "ja", en: "Japanese", th: "ญี่ปุ่น" },
  { value: "ko", en: "Korean", th: "เกาหลี" },
  { value: "zh", en: "Chinese", th: "จีน" },
];

export function ProductionWorkspace(props: ProductionWorkspaceProps) {
  const isThai = props.locale === "th";
  const space = props.space ?? fallbackSpace;
  const workspaceViewState = props.workspaceViewState ?? "ready";
  const [localSelectedNodeId, setLocalSelectedNodeId] = useState<string | null>(props.selectedNodeId ?? null);
  const selectedNodeId = props.selectedNodeId ?? localSelectedNodeId;
  const selectedNode = useMemo<ProductionFlowNode | null>(
    () => space.flowNodes.find((node) => node.id === selectedNodeId) ?? null,
    [selectedNodeId, space.flowNodes],
  );
  const blockedCount = space.flowNodes.filter((node) => node.status === "blocked" || (node.readinessIssues?.length ?? 0) > 0).length;
  const creditEstimate = space.flowNodes.reduce((sum, node) => sum + Math.max(0, Number(node.estimatedCredits ?? 0)), 0);
  const latestAttempt = space.actionAttempts?.at(-1);
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
  const formattedStatus = formatProductionStatus(props.status, isThai);
  const labelForOption = (option: { en: string; th: string }) => isThai ? option.th : option.en;
  const currentDuration = brief.durationSeconds ? String(brief.durationSeconds) : "";
  const hasCustomDuration = currentDuration && !durationOptions.map(String).includes(currentDuration);
  const hasCustomAspectRatio = brief.aspectRatio && !aspectRatioOptions.includes(brief.aspectRatio);
  const hasCustomLanguage = brief.language && !languageOptions.some((option) => option.value === brief.language);
  const hasCustomGoalType = brief.goalType && !goalTypeOptions.some((option) => option.value === brief.goalType);
  const lifecycleDisabled = props.isLifecycleActionDisabled || !props.productionRunId;
  const hasProjectSeed = Boolean(props.productionRunId?.trim() || brief.title?.trim() || brief.summary?.trim());
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
            </div>
            <div className="grid content-start gap-2 rounded-md border border-slate-100 bg-slate-50 p-3">
              <Button type="button" variant="outline" onClick={props.onCreateFixturePlan} disabled={props.isPlanning} className="border-sky-800 bg-sky-800 text-white hover:bg-sky-900 hover:text-white">
                <Route className="mr-2 h-4 w-4" />
                {props.isPlanning
                  ? (isThai ? "กำลังสร้างแผน..." : "Planning...")
                  : (isThai ? "สร้าง Plan + Verify" : "Create Plan + Verify")}
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
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-4 text-slate-900" data-testid="production-workspace">
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
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 xl:max-w-[420px] xl:justify-end">
            <Button type="button" variant="outline" onClick={props.onCreateFixturePlan} disabled={props.isPlanning} className="min-w-[164px] border-sky-800 bg-sky-800 text-white hover:bg-sky-900 hover:text-white">
              <Route className="mr-2 h-4 w-4" />
              {props.isPlanning
                ? (isThai ? "กำลังสร้างแผน..." : "Planning...")
                : (isThai ? "สร้าง Plan + Verify" : "Create Plan + Verify")}
            </Button>
            <Button type="button" variant="outline" onClick={props.onSave} disabled={props.isSaving} className="min-w-[120px]">
              <Save className="mr-2 h-4 w-4" />
              {isThai ? "บันทึก Draft" : "Save Draft"}
            </Button>
            {(props.onProjectSearchOpen || props.onNewProject || props.onOpenVideoShot || props.onArchiveProject || props.onRestoreProject || props.onDeleteProject) ? (
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
                  {props.onNewProject ? (
                    <Button type="button" variant="ghost" size="sm" className="justify-start" onClick={props.onNewProject}>
                      <Sparkles className="mr-2 h-4 w-4" />
                      {isThai ? "โปรเจกต์ใหม่" : "New Project"}
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
              <Input
                value={selectedPlanningModel}
                disabled={planningModelMode === "auto"}
                onChange={(event) => props.onPlanningModelChange?.("manual", event.target.value)}
                placeholder={planningModelMode === "auto" ? (isThai ? "Auto model" : "Auto model") : "gemini / gpt / custom model"}
                aria-label={isThai ? "โมเดล planning" : "Planning model"}
              />
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
      </section>

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
          <select
            value={currentDuration}
            onChange={(event) => patchBrief({ durationSeconds: Number(event.target.value) || undefined })}
            aria-label={isThai ? "ความยาววิดีโอ" : "Duration seconds"}
            className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          >
            <option value="">{isThai ? "เลือกความยาววิดีโอ" : "Select duration"}</option>
            {hasCustomDuration ? <option value={currentDuration}>{currentDuration}s</option> : null}
            {durationOptions.map((seconds) => (
              <option key={seconds} value={seconds}>{seconds}s</option>
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
        onRunNode={props.onRunNode}
      />

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1fr)]">
        <ContextAssetBoard
          assets={space.contextAssets}
          selectedNodeId={selectedNodeId}
          selectedNodeTitle={selectedNode?.title}
          locale={props.locale}
          providerCharacterResults={providerCharacterResults}
          onAddAsset={(asset) => props.onAssetAddToCanvas?.(asset)}
          onAssignAssetToNode={(asset, nodeId) => props.onAssetAssignToNode?.({ asset, nodeId })}
        />
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
        <div className="space-y-3">
          <NodeConfigPanel node={selectedNode} locale={props.locale} onSaveNodeConfig={props.onSaveNodeConfig} />
          <div className="rounded-lg border bg-white p-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              {isThai ? "Safeguards" : "Safeguards"}
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
                <Button type="button" variant="outline" size="sm" onClick={props.onCancelExecution} disabled={!props.onCancelExecution}>
                  {isThai ? "ยกเลิก execution" : "Cancel execution"}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={props.onRepairOutputRefs} disabled={!props.onRepairOutputRefs}>
                  {isThai ? "ซ่อม output refs" : "Repair output refs"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
