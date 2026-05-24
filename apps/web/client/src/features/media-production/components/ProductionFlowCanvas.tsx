import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  useUpdateNodeInternals,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type ReactFlowProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AlertCircle, ArrowRight, ChevronDown, Eye, FileText, Focus, GripVertical, Image, Link2, ListTree, Maximize2, Mic, MoreHorizontal, MousePointer2, Music, Paperclip, Play, Plus, RotateCcw, Settings2, Trash2, Video, X, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PRODUCTION_NODE_CATALOG, getProductionNodeCatalogEntry, type ProductionFlowEdge, type ProductionFlowEdgeKind, type ProductionFlowNode, type ProductionNodeKind, type ProductionNodeToolBinding, type ProductionReferenceInput } from "@shared/mediaProduction";
import { edgeKindLabel, nodeKindLabel } from "./displayLabels";
import type { ProductionCanvasCallbacks, ProductionInvalidEdgeWarning, ProductionLocale } from "./types";

export interface ProductionFlowCanvasProps extends ProductionCanvasCallbacks {
  flowNodes: ProductionFlowNode[];
  flowEdges: ProductionFlowEdge[];
  contextAssets: ProductionReferenceInput[];
  selectedNodeId?: string | null;
  locale?: ProductionLocale;
}

function iconForGroup(group: string): typeof Image {
  if (group === "Video" || group === "Handoff" || group === "Delivery") return Video;
  if (group === "Audio") return Music;
  if (group === "Image" || group === "Reference") return Image;
  if (group === "QA") return AlertCircle;
  return ListTree;
}

const nodeKinds = PRODUCTION_NODE_CATALOG.map((entry) => ({
  ...entry,
  icon: entry.kind === "tts" || entry.kind === "text_to_speech" || entry.kind.includes("voice") ? Mic : iconForGroup(entry.group),
}));

const edgeKinds: ProductionFlowEdgeKind[] = ["dependency", "reference", "handoff", "qa", "uses_asset", "requires_before", "generates_for", "qa_of", "approval_gate", "handoff_to", "fallback_to"];
const runnableProductionSkillNodeKinds = new Set<ProductionNodeKind>([
  "context_summary",
  "story_strategy",
  "script_generation",
  "script_revision",
  "storyboard_planning",
  "shot_breakdown",
  "prompt_packaging",
  "planning",
  "script",
]);

type NodeDetailTab = "overview" | "prompt" | "references" | "outputs" | "runlog";
type CanvasViewMode = "readable" | "overview" | "selected";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function panelPositionNearNode(node: ProductionFlowNode): { x: number; y: number } {
  const x = node.position?.x ?? 0;
  const y = node.position?.y ?? 0;
  return {
    x: clamp(x * 0.46 + 300, 12, 760),
    y: clamp(y * 0.42 + 24, 12, 254),
  };
}

function statusTone(status: string) {
  if (status === "blocked" || status === "failed") return "border-red-200 bg-red-50 text-red-700";
  if (status === "warning" || status === "disabled") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "ready" || status === "approved" || status === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function nodeAccentTone(node: ProductionFlowNode): { border: string; bg: string; text: string; rail: string } {
  const surface = nodeSurface(node);
  if (node.status === "blocked" || node.status === "failed") {
    return { border: "border-red-200", bg: "bg-red-50", text: "text-red-700", rail: "bg-red-500" };
  }
  if (node.status === "warning" || node.status === "disabled") {
    return { border: "border-amber-200", bg: "bg-amber-50", text: "text-amber-700", rail: "bg-amber-500" };
  }
  if (surface === "image") return { border: "border-sky-200", bg: "bg-sky-50", text: "text-sky-700", rail: "bg-sky-500" };
  if (surface === "video") return { border: "border-indigo-200", bg: "bg-indigo-50", text: "text-indigo-700", rail: "bg-indigo-500" };
  if (surface === "audio") return { border: "border-violet-200", bg: "bg-violet-50", text: "text-violet-700", rail: "bg-violet-500" };
  return { border: "border-slate-200", bg: "bg-slate-50", text: "text-slate-700", rail: "bg-slate-500" };
}

function validateConnection(
  connection: Connection,
  nodes: ProductionFlowNode[],
  edges: ProductionFlowEdge[],
): ProductionInvalidEdgeWarning | null {
  if (!connection.source) return { code: "missing_source", message: "Connection is missing a source node.", source: connection.source, target: connection.target };
  if (!connection.target) return { code: "missing_target", message: "Connection is missing a target node.", source: connection.source, target: connection.target };
  if (connection.source === connection.target) return { code: "self_edge", message: "A node cannot connect to itself.", source: connection.source, target: connection.target };
  const targetNode = nodes.find((node) => node.id === connection.target);
  if (targetNode?.locked) return { code: "locked_target", message: "Target node is locked.", source: connection.source, target: connection.target };
  const duplicate = edges.some((edge) => edge.source === connection.source && edge.target === connection.target);
  if (duplicate) return { code: "duplicate_edge", message: "This edge already exists.", source: connection.source, target: connection.target };
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
  outgoing.set(connection.source, [...(outgoing.get(connection.source) ?? []), connection.target]);
  const stack = [connection.target];
  const visited = new Set<string>();
  while (stack.length) {
    const current = stack.pop()!;
    if (current === connection.source) return { code: "cycle_detected", message: "This edge would create a cycle.", source: connection.source, target: connection.target };
    if (visited.has(current)) continue;
    visited.add(current);
    stack.push(...(outgoing.get(current) ?? []));
  }
  return null;
}

function readableStatus(status: string): string {
  return status.replace(/_/g, " ");
}

function nodeStatusLabel(status: string, locale?: ProductionLocale): string {
  const isThai = locale === "th";
  const labels: Record<string, { en: string; th: string }> = {
    draft: { en: "Draft", th: "ร่าง" },
    ready: { en: "Ready", th: "พร้อม" },
    warning: { en: "Needs review", th: "ต้องตรวจ" },
    blocked: { en: "Blocked", th: "ติดปัญหา" },
    running: { en: "Running", th: "กำลังทำงาน" },
    queued: { en: "Queued", th: "รอคิว" },
    reserving_credits: { en: "Reserving", th: "กันเครดิต" },
    completed: { en: "Done", th: "เสร็จแล้ว" },
    approved: { en: "Approved", th: "อนุมัติ" },
    failed: { en: "Failed", th: "ล้มเหลว" },
    disabled: { en: "Off", th: "ปิดอยู่" },
  };
  const label = labels[status];
  return label ? (isThai ? label.th : label.en) : readableStatus(status);
}

function summarizeUnknown(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((item) => summarizeUnknown(item)).filter(Boolean).join(", ");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .slice(0, 4)
      .map(([key, item]) => `${key}: ${summarizeUnknown(item) ?? "-"}`)
      .join(" | ");
  }
  return null;
}

function truncateText(value: string, max = 130): string {
  return value.length > max ? `${value.slice(0, max - 1).trim()}...` : value;
}

function nodeSurface(node: ProductionFlowNode): ProductionNodeToolBinding["toolSurface"] {
  const catalogEntry = getProductionNodeCatalogEntry(node.kind);
  return node.configSnapshot?.toolSurface ?? catalogEntry?.toolSurface ?? "production";
}

function nodePromptText(node: ProductionFlowNode): string | null {
  const configPrompt = node.configSnapshot?.config?.prompt;
  const metadataPrompt = node.metadata?.prompt;
  const latest = node.outputRefs?.at(-1)?.metadata;
  return summarizeUnknown(latest?.generatedPrompt ?? latest?.prompt ?? latest?.text ?? configPrompt ?? metadataPrompt);
}

function nodeLatestOutputText(node: ProductionFlowNode): string | null {
  const latest = node.outputRefs?.at(-1);
  if (!latest) return null;
  if (latest.url || latest.thumbnailUrl) return latest.kind;
  return summarizeUnknown(latest.metadata?.text ?? latest.metadata?.generatedPrompt ?? latest.metadata?.prompt ?? latest.providerTaskId ?? latest.mediaTaskId);
}

function nodeRunScopeLabel(node: ProductionFlowNode, locale?: ProductionLocale): string {
  const isThai = locale === "th";
  const surface = nodeSurface(node);
  if (surface === "production") return isThai ? "สร้างพรอมป์ในระบบ" : "local prompt";
  if (node.status === "running" || node.status === "queued" || node.status === "reserving_credits") return isThai ? "กำลังทำงาน" : "running";
  if (node.estimatedCredits && node.estimatedCredits > 0) return isThai ? "ใช้เครดิต" : "uses credits";
  return isThai ? "ต้องยืนยัน" : "needs confirm";
}

function nodeConfigureActionLabel(node: ProductionFlowNode, locale?: ProductionLocale): string {
  const isThai = locale === "th";
  const surface = nodeSurface(node);
  if (surface === "image") return isThai ? "เปิดแท็บรูปภาพ" : "Open Image tab";
  if (surface === "video") return isThai ? "เปิดแท็บวิดีโอ" : "Open Video tab";
  if (surface === "audio") return isThai ? "เปิดแท็บเสียง" : "Open Audio tab";
  if (surface === "storyboard_review") return isThai ? "เปิด Video Shot" : "Open Video Shot";
  if (surface === "video_edit") return isThai ? "เปิด Video Edit" : "Open Video Edit";
  return isThai ? "ดูรายละเอียด" : "View details";
}

function nodeConfigureShortLabel(node: ProductionFlowNode, locale?: ProductionLocale): string {
  const isThai = locale === "th";
  const surface = nodeSurface(node);
  if (surface === "image") return isThai ? "รูปภาพ" : "Image";
  if (surface === "video") return isThai ? "วิดีโอ" : "Video";
  if (surface === "audio") return isThai ? "เสียง" : "Audio";
  if (surface === "storyboard_review") return isThai ? "Storyboard" : "Storyboard";
  if (surface === "video_edit") return isThai ? "Edit" : "Edit";
  return isThai ? "รายละเอียด" : "Details";
}

function nodeHasExternalToolSurface(node: ProductionFlowNode): boolean {
  return nodeSurface(node) !== "production";
}

function nodeInputSummary(node: ProductionFlowNode, locale?: ProductionLocale): string {
  const isThai = locale === "th";
  const refs = node.referenceInputs?.length ?? 0;
  if (refs > 0) return `${refs} ${isThai ? "ไฟล์อ้างอิง" : "refs"}`;
  const prompt = nodePromptText(node);
  if (prompt) return isThai ? "มีพรอมป์" : "has prompt";
  return isThai ? "รอ input" : "needs input";
}

function nodeWorkSummary(node: ProductionFlowNode, locale?: ProductionLocale): string {
  const isThai = locale === "th";
  const metadata = node.metadata ?? {};
  const config = node.configSnapshot?.config ?? {};
  const summary = summarizeUnknown(
    metadata.summary
      ?? metadata.objective
      ?? metadata.concept
      ?? metadata.plan
      ?? metadata.expectedOutput
      ?? config.instructions
      ?? config.prompt,
  );
  if (summary) return truncateText(summary, 92);
  const surface = nodeSurface(node);
  if (surface === "image") return isThai ? "สร้างภาพหรือภาพอ้างอิงสำหรับช็อตนี้" : "Generate or refine an image reference for this shot.";
  if (surface === "video") return isThai ? "สร้างวิดีโอจากพรอมป์และ reference ที่แนบ" : "Generate video from prompt and attached references.";
  if (surface === "audio") return isThai ? "สร้างเสียงหรือ voice asset สำหรับ workflow" : "Generate audio or voice assets for the workflow.";
  return isThai ? "สรุป วิเคราะห์ หรือเตรียมพรอมป์เพื่อส่งต่อขั้นถัดไป" : "Plan, reason, or prepare prompt output for the next step.";
}

function preferredNodeKindsForSelection(node: ProductionFlowNode | null): ProductionNodeKind[] {
  if (!node) return ["prompt_packaging", "image_generate", "video_generate", "text_to_speech"];
  if (node.kind === "script_generation" || node.kind === "script" || node.kind === "script_revision") return ["prompt_packaging", "shot_breakdown"];
  if (node.kind === "prompt_packaging") return ["image_generate", "video_generate", "text_to_speech"];
  if (nodeSurface(node) === "image") return ["video_generate", "qa"];
  if (nodeSurface(node) === "video" || nodeSurface(node) === "audio") return ["qa", "handoff"];
  if (node.kind === "qa") return ["handoff"];
  return ["prompt_packaging", "image_generate", "video_generate"];
}

function nodeDetailRows(node: ProductionFlowNode, locale?: ProductionLocale): Array<{ label: string; value: string }> {
  const metadata = node.metadata ?? {};
  const config = node.configSnapshot?.config ?? {};
  const latestOutput = node.outputRefs?.at(-1);
  const latestOutputMetadata = latestOutput?.metadata ?? {};
  const rows = [
    [locale === "th" ? "เป้าหมาย" : "Objective", metadata.objective ?? metadata.goal ?? config.objective],
    [locale === "th" ? "แนวคิด" : "Concept", metadata.concept ?? metadata.creativeAngle ?? config.creativeAngle],
    [locale === "th" ? "เรื่องเล่า" : "Narrative", metadata.narrative ?? metadata.story ?? metadata.storyBeat ?? config.narrative],
    [locale === "th" ? "วิธีทำงาน" : "Plan", metadata.plan ?? metadata.steps ?? metadata.actions ?? config.instructions],
    [locale === "th" ? "พรอมป์" : "Prompt", config.prompt ?? metadata.prompt],
    [locale === "th" ? "ผลลัพธ์ล่าสุด" : "Latest output", latestOutputMetadata.text ?? latestOutputMetadata.prompt ?? latestOutputMetadata.generatedPrompt],
    [locale === "th" ? "ผลลัพธ์ที่คาดหวัง" : "Expected output", metadata.expectedOutput ?? metadata.output ?? config.output],
  ].map(([label, value]) => {
    const text = summarizeUnknown(value);
    return text ? { label: String(label), value: truncateText(text) } : null;
  }).filter((row): row is { label: string; value: string } => Boolean(row));
  if (node.referenceInputs?.length) rows.push({ label: locale === "th" ? "อ้างอิง" : "References", value: `${node.referenceInputs.length}` });
  if (node.outputRefs?.length) rows.push({ label: locale === "th" ? "ผลลัพธ์" : "Outputs", value: `${node.outputRefs.length}` });
  if (node.estimatedCredits) rows.push({ label: locale === "th" ? "เครดิต" : "Credits", value: `${node.estimatedCredits}` });
  if (!rows.length && node.readinessIssues?.length) rows.push({ label: locale === "th" ? "ต้องแก้" : "Needs attention", value: truncateText(node.readinessIssues.join(", ")) });
  return rows.slice(0, 4);
}

function adapterStatusLabel(status: string, locale?: ProductionLocale): string {
  if (status === "mvp_enabled") return locale === "th" ? "พร้อม run" : "Run-ready";
  if (status === "preview_only") return locale === "th" ? "ตั้งค่าได้" : "Config-ready";
  return locale === "th" ? "ยังไม่เปิดใช้" : "Unavailable";
}

function toFlowNode(
  node: ProductionFlowNode,
  options: {
    selectedNodeId?: string | null;
    locale?: ProductionLocale;
    expanded: boolean;
    outputCount: number;
    canRun: boolean;
    canCancel: boolean;
    canRetry: boolean;
    runLabel: string;
    runScopeLabel: string;
    promptFrom?: string | null;
    feeds?: string[];
    assetDragActive?: boolean;
    onSelect?: (nodeId: string | null) => void;
    onConfigure?: (nodeId: string) => void;
    onRun?: (nodeId: string) => void;
    onCancel?: (nodeId: string) => void;
    onRetry?: (nodeId: string) => void;
    onOpenOutput?: (nodeId: string) => void;
    onToggleExpand?: (nodeId: string) => void;
  },
): Node {
  const { locale } = options;
  const rows = nodeDetailRows(node, locale);
  const catalogEntry = getProductionNodeCatalogEntry(node.kind);
  const isThai = locale === "th";
  const promptText = nodePromptText(node);
  const latestOutputText = nodeLatestOutputText(node);
  const inputLabel = nodeInputSummary(node, locale);
  const workSummary = nodeWorkSummary(node, locale);
  const accent = nodeAccentTone(node);
  const statusText = node.collapsed ? (locale === "th" ? "ย่อ" : "collapsed") : nodeStatusLabel(node.status, locale);
  const surfaceLabel = nodeSurface(node) === "production"
    ? (isThai ? "วางแผน" : "Plan")
    : nodeSurface(node) === "image"
      ? (isThai ? "ภาพ" : "Image")
      : nodeSurface(node) === "video"
        ? (isThai ? "วิดีโอ" : "Video")
        : (isThai ? "เสียง" : "Audio");
  return {
    id: node.id,
    position: node.position ?? { x: 0, y: 0 },
    data: {
      label: (
        <div className="relative w-[286px] max-w-[286px] overflow-visible rounded-xl bg-white text-left text-slate-900">
          <div className={`absolute inset-y-0 left-0 w-1 ${accent.rail}`} aria-hidden="true" />
          <div className="space-y-3 px-4 py-3">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0 max-w-full overflow-hidden">
                <div className="line-clamp-2 max-w-full break-words text-[15px] font-semibold leading-snug text-slate-950">{node.title}</div>
                <div className="mt-1 flex items-center gap-1.5 text-[11px] leading-4 text-slate-500">
                  <span className="max-w-[142px] truncate">{nodeKindLabel(node.kind, locale)}</span>
                  <span aria-hidden="true">/</span>
                  <span className="max-w-[58px] truncate">{surfaceLabel}</span>
                </div>
              </div>
              <span className={`max-w-[78px] shrink-0 truncate rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-4 ${statusTone(node.status)}`}>
                {statusText}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium leading-3 text-slate-600">
                <Paperclip className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{inputLabel}</span>
              </span>
              <span className={`inline-flex max-w-full min-w-0 items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium leading-3 ${accent.border} ${accent.bg} ${accent.text}`}>
                <Zap className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{options.runScopeLabel}</span>
              </span>
              {options.outputCount > 0 ? (
                <span className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium leading-3 text-emerald-700">
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{options.outputCount} {isThai ? "ผลลัพธ์" : "outputs"}</span>
                </span>
              ) : null}
            </div>

            <div className="min-w-0 overflow-hidden rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
              <div className="text-[10px] font-semibold uppercase leading-3 text-slate-500">{isThai ? "งานของ node" : "Node work"}</div>
              <div className="mt-1 line-clamp-2 break-words text-[12px] leading-5 text-slate-700">{workSummary}</div>
            </div>

            <div className="flex min-h-5 max-w-full flex-wrap items-center gap-1 overflow-hidden text-[10.5px] leading-4 text-slate-500">
              {options.promptFrom ? (
                <span className="inline-flex max-w-full min-w-0 items-center gap-1 rounded bg-slate-50 px-1.5">
                  <Link2 className="h-3 w-3 shrink-0" />
                  <span className="min-w-0 truncate">{isThai ? "พรอมป์จาก" : "Prompt from"}: {options.promptFrom}</span>
                </span>
              ) : null}
              {options.feeds?.length ? (
                <span className="inline-flex max-w-full min-w-0 items-center gap-1 rounded bg-slate-50 px-1.5">
                  <ArrowRight className="h-3 w-3 shrink-0" />
                  <span className="min-w-0 truncate">{isThai ? "ส่งต่อ" : "Feeds"}: {options.feeds.slice(0, 2).join(", ")}</span>
                </span>
              ) : null}
              {latestOutputText ? (
                <span className="inline-flex max-w-full min-w-0 items-center gap-1 rounded bg-emerald-50 px-1.5 text-emerald-700">
                  <FileText className="h-3 w-3 shrink-0" />
                  <span className="min-w-0 truncate">{isThai ? "ผลลัพธ์" : "Output"}: {truncateText(latestOutputText, 54)}</span>
                </span>
              ) : null}
            </div>

            <div className="nodrag nopan flex min-w-0 flex-wrap items-center gap-1.5 pt-1">
              {options.canRun ? (
                <button
                  type="button"
                  className="inline-flex h-9 max-w-[98px] items-center gap-1.5 rounded-full bg-sky-700 px-3 text-[12px] font-semibold text-white shadow-sm shadow-sky-900/15 hover:bg-sky-800"
                  onClick={(event) => {
                    event.stopPropagation();
                    options.onRun?.(node.id);
                  }}
                  aria-label={isThai ? `run เฉพาะ node ${node.title}` : `Run only node ${node.title}`}
                >
                  <Play className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{options.runLabel}</span>
                </button>
              ) : null}
              {options.canCancel ? (
                <button
                  type="button"
                  className="inline-flex h-9 items-center rounded-full border border-amber-200 bg-white px-3 text-[12px] font-semibold text-amber-700 hover:bg-amber-50"
                  onClick={(event) => {
                    event.stopPropagation();
                    options.onCancel?.(node.id);
                  }}
                >
                  {isThai ? "ยกเลิก" : "Cancel"}
                </button>
              ) : null}
              {options.canRetry ? (
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-1 rounded-full border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={(event) => {
                    event.stopPropagation();
                    options.onRetry?.(node.id);
                  }}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {isThai ? "ลองใหม่" : "Retry"}
                </button>
              ) : null}
              {options.outputCount > 0 ? (
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-1 rounded-full border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={(event) => {
                    event.stopPropagation();
                    options.onOpenOutput?.(node.id);
                  }}
                >
                  <Eye className="h-3.5 w-3.5" />
                  {isThai ? "ดูผล" : "Output"}
                </button>
              ) : null}
              {options.onConfigure && nodeHasExternalToolSurface(node) ? (
                <button
                  type="button"
                  className="inline-flex h-9 min-w-0 max-w-[104px] items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-3 text-[12px] font-semibold text-sky-800 hover:bg-sky-100"
                  onClick={(event) => {
                    event.stopPropagation();
                    options.onConfigure?.(node.id);
                  }}
                  aria-label={`${nodeConfigureActionLabel(node, locale)} ${node.title}`}
                  title={nodeConfigureActionLabel(node, locale)}
                >
                  <Settings2 className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{nodeConfigureShortLabel(node, locale)}</span>
                </button>
              ) : null}
              <button
                type="button"
                className="inline-flex h-9 min-w-0 max-w-[122px] items-center gap-1 rounded-full border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
                onClick={(event) => {
                  event.stopPropagation();
                  options.onSelect?.(node.id);
                }}
                aria-expanded={options.expanded}
              >
                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{isThai ? "รายละเอียด" : "Details"}</span>
              </button>
            </div>
          </div>
          {options.expanded ? (
            <div className="nodrag nopan mx-3 mb-3 space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2">
              {rows.length ? rows.map((row) => (
                <div key={row.label} className="grid min-w-0 gap-0.5">
                  <div className="text-[9.5px] font-semibold uppercase leading-3 tracking-normal text-slate-500">{row.label}</div>
                  <div className="line-clamp-3 break-words text-[11px] leading-4 text-slate-700">{row.value}</div>
                </div>
              )) : (
                <div className="text-[11px] leading-4 text-slate-500">
                  {isThai ? "ยังไม่มีรายละเอียดจาก planner สำหรับ node นี้" : "No planner details are attached to this node yet."}
                </div>
              )}
              {node.referenceInputs?.length ? (
                <div className="grid gap-1">
                  <div className="text-[9.5px] font-semibold uppercase leading-3 tracking-normal text-slate-500">
                    {isThai ? "ไฟล์ที่แนบ" : "Attached media"}
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {node.referenceInputs.slice(0, 6).map((asset) => {
                      const mediaUrl = asset.thumbnailUrl || asset.url;
                      return (
                        <div key={asset.id} className="min-w-0 overflow-hidden rounded border border-slate-200 bg-slate-50" title={asset.title}>
                          {mediaUrl && asset.kind !== "audio_asset" ? (
                            asset.kind === "source_video" ? (
                              <video src={mediaUrl} className="h-10 w-full object-cover" muted playsInline />
                            ) : (
                              <img src={mediaUrl} alt="" className="h-10 w-full object-cover" />
                            )
                          ) : (
                            <div className="flex h-10 items-center justify-center text-[10px] text-slate-500">{asset.kind.replace(/_/g, " ")}</div>
                          )}
                          <div className="truncate px-1 py-0.5 text-[9px] leading-3 text-slate-500">{asset.title}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              <button
                type="button"
                className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                onClick={(event) => {
                  event.stopPropagation();
                  options.onConfigure?.(node.id);
                }}
              >
                <Settings2 className="h-3 w-3" />
                {isThai ? "เปิดตั้งค่าเต็ม" : "Open full config"}
              </button>
            </div>
          ) : null}
        </div>
      ),
    },
    style: { width: 286 },
    className: `rounded-xl border bg-white p-0 shadow-[0_12px_30px_rgba(15,23,42,0.10)] transition-shadow [&_.react-flow__handle]:h-2.5 [&_.react-flow__handle]:w-2.5 ${accent.border} ${
      options.selectedNodeId === node.id ? "ring-2 ring-sky-400 shadow-[0_16px_34px_rgba(2,132,199,0.18)]" : ""
    } ${options.assetDragActive ? "ring-2 ring-dashed ring-sky-300 shadow-md" : ""}`,
  };
}

function ProductionFlowCanvasInner({
  flowNodes,
  flowEdges,
  contextAssets,
  selectedNodeId,
  locale,
  onAddNode,
  onSelectNode,
  onConnectNodes,
  onInvalidEdge,
  onNodePositionChange,
  onAssetAddToCanvas,
  onAssetAssignToNode,
  onConfigureNode,
  onDeleteNode,
  onRunNode,
  onCancelNodeExecution,
  onRetryNode,
  onOpenNodeOutput,
}: ProductionFlowCanvasProps) {
  const isThai = locale === "th";
  const reactFlow = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const [warning, setWarning] = useState<ProductionInvalidEdgeWarning | null>(null);
  const [listConnectSourceId, setListConnectSourceId] = useState<string | null>(null);
  const [selectedEdgeKind, setSelectedEdgeKind] = useState<ProductionFlowEdgeKind>("dependency");
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(new Set());
  const [interactiveNodes, setInteractiveNodes] = useState<Node[]>([]);
  const [assetDragActive, setAssetDragActive] = useState(false);
  const [nodeDetailTab, setNodeDetailTab] = useState<NodeDetailTab>("overview");
  const [floatingDetailOpen, setFloatingDetailOpen] = useState(false);
  const [floatingDetailPosition, setFloatingDetailPosition] = useState<{ x: number; y: number }>({ x: 320, y: 24 });
  const floatingDetailDragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [showFullCatalog, setShowFullCatalog] = useState(false);
  const [leftPanelTab, setLeftPanelTab] = useState<"catalog" | "nodes">(() => flowNodes.length ? "nodes" : "catalog");
  const [canvasViewMode, setCanvasViewMode] = useState<CanvasViewMode>("readable");
  const flowNodePositionSignature = useMemo(
    () => flowNodes.map((node) => `${node.id}:${node.position?.x ?? 0}:${node.position?.y ?? 0}`).join("|"),
    [flowNodes],
  );
  const previousPositionSignatureRef = useRef(flowNodePositionSignature);
  const selectedFlowNode = useMemo(() => flowNodes.find((node) => node.id === selectedNodeId) ?? null, [flowNodes, selectedNodeId]);
  const preferredNodeKinds = useMemo(() => preferredNodeKindsForSelection(selectedFlowNode), [selectedFlowNode]);
  const recommendedNodeKinds = useMemo(() => {
    const available = nodeKinds.filter((item) => item.adapterStatus !== "deferred");
    const preferred = available.filter((item) => preferredNodeKinds.includes(item.kind));
    const rest = available.filter((item) => !preferredNodeKinds.includes(item.kind));
    return [...preferred, ...rest];
  }, [preferredNodeKinds]);
  const laterNodeKinds = useMemo(() => nodeKinds.filter((item) => item.adapterStatus === "deferred"), []);
  const nodeTitleById = useMemo(() => new Map(flowNodes.map((node) => [node.id, node.title])), [flowNodes]);
  const promptFromByNodeId = useMemo(() => {
    const result = new Map<string, string>();
    for (const node of flowNodes) {
      const upstreamPromptNodeId = typeof node.metadata?.upstreamPromptNodeId === "string" ? node.metadata.upstreamPromptNodeId : null;
      const upstreamPrompt = upstreamPromptNodeId ? nodeTitleById.get(upstreamPromptNodeId) : null;
      if (upstreamPrompt) result.set(node.id, upstreamPrompt);
    }
    for (const edge of flowEdges) {
      const source = flowNodes.find((node) => node.id === edge.source);
      const target = flowNodes.find((node) => node.id === edge.target);
      if (source?.kind === "prompt_packaging" && target && !result.has(target.id)) result.set(target.id, source.title);
    }
    return result;
  }, [flowEdges, flowNodes, nodeTitleById]);
  const feedsByNodeId = useMemo(() => {
    const result = new Map<string, string[]>();
    for (const edge of flowEdges) {
      const targetTitle = nodeTitleById.get(edge.target);
      if (!targetTitle) continue;
      result.set(edge.source, [...(result.get(edge.source) ?? []), targetTitle]);
    }
    return result;
  }, [flowEdges, nodeTitleById]);
  const edges = useMemo<Edge[]>(
    () => flowEdges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, label: edge.label ?? edgeKindLabel(edge.kind ?? "dependency", locale) })),
    [flowEdges, locale],
  );

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setInteractiveNodes((currentNodes) => applyNodeChanges(changes, currentNodes));
  }, []);

  const publishWarning = useCallback(
    (nextWarning: ProductionInvalidEdgeWarning) => {
      setWarning(nextWarning);
      onInvalidEdge?.(nextWarning);
    },
    [onInvalidEdge],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const invalid = validateConnection(connection, flowNodes, flowEdges);
      if (invalid) {
        publishWarning(invalid);
        return;
      }
      setWarning(null);
      onConnectNodes?.({
        id: `${connection.source}-${connection.target}`,
        source: connection.source!,
        target: connection.target!,
        kind: selectedEdgeKind,
      });
    },
    [flowEdges, flowNodes, onConnectNodes, publishWarning, selectedEdgeKind],
  );

  const onNodeDragStop: NonNullable<ReactFlowProps["onNodeDragStop"]> = useCallback(
    (_event, node) => {
      onNodePositionChange?.(node.id, node.position);
    },
    [onNodePositionChange],
  );

  const selectNodeAndOpenDetail = useCallback(
    (nodeId: string | null) => {
      onSelectNode?.(nodeId);
      setFloatingDetailOpen(Boolean(nodeId));
      if (nodeId) {
        const node = flowNodes.find((item) => item.id === nodeId);
        if (node) setFloatingDetailPosition(panelPositionNearNode(node));
      }
    },
    [flowNodes, onSelectNode],
  );

  useEffect(() => {
    if (!selectedFlowNode) {
      setFloatingDetailOpen(false);
      return;
    }
    setFloatingDetailOpen(true);
    setNodeDetailTab("overview");
    setFloatingDetailPosition(panelPositionNearNode(selectedFlowNode));
  }, [selectedFlowNode?.id]);

  const startFloatingDetailDrag = useCallback((event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    floatingDetailDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: floatingDetailPosition.x,
      originY: floatingDetailPosition.y,
    };
  }, [floatingDetailPosition]);

  const moveFloatingDetail = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const dragState = floatingDetailDragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    setFloatingDetailPosition({
      x: clamp(dragState.originX + event.clientX - dragState.startX, 8, 820),
      y: clamp(dragState.originY + event.clientY - dragState.startY, 8, 310),
    });
  }, []);

  const stopFloatingDetailDrag = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (floatingDetailDragRef.current?.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    floatingDetailDragRef.current = null;
  }, []);

  const resetCanvasNodes = useCallback(() => {
    if (!flowNodes.length || !onDeleteNode) return;
    const confirmed = window.confirm(
      isThai
        ? `ต้องการลบ node ทั้งหมด ${flowNodes.length} รายการออกจาก canvas ใช่ไหม? การกระทำนี้ย้อนกลับไม่ได้`
        : `Remove all ${flowNodes.length} nodes from the canvas? This cannot be undone.`,
    );
    if (!confirmed) return;
    for (const node of flowNodes) onDeleteNode(node.id);
    setListConnectSourceId(null);
    setFloatingDetailOpen(false);
    onSelectNode?.(null);
  }, [flowNodes, isThai, onDeleteNode, onSelectNode]);

  const renderDrawerItem = (item: (typeof nodeKinds)[number]) => {
    const isDeferred = item.adapterStatus === "deferred";
    return (
      <button
        key={item.kind}
        type="button"
        draggable={!isDeferred}
        disabled={isDeferred}
        title={isDeferred ? item.deferredReason : item.label}
        onClick={() => {
          if (!isDeferred) onAddNode?.(item.kind);
        }}
        onDragStart={(event) => {
          if (isDeferred) {
            event.preventDefault();
            return;
          }
          event.dataTransfer.setData("application/x-production-node-kind", item.kind);
          event.dataTransfer.effectAllowed = "copy";
        }}
        className="flex min-h-14 items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-2 text-left text-sm transition-colors hover:border-sky-200 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border disabled:hover:bg-slate-50"
      >
        <item.icon className="h-4 w-4 shrink-0 text-sky-600" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium text-slate-900">{item.label}</span>
          <span className="block truncate text-[10px] text-muted-foreground">{item.group} · {adapterStatusLabel(item.adapterStatus, locale)}</span>
          {isDeferred ? <span className="block truncate text-[10px] text-amber-700">{isThai ? "ยังใช้ไม่ได้" : "Not available"}</span> : null}
        </span>
        {isDeferred ? <Badge variant="outline" className="ml-auto shrink-0 text-[10px]">Later</Badge> : <Plus className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
      </button>
    );
  };
  const canRunNode = (node: ProductionFlowNode) => {
    const catalogEntry = getProductionNodeCatalogEntry(node.kind);
    const isRunnableSkillNode = catalogEntry?.toolSurface === "production" && runnableProductionSkillNodeKinds.has(node.kind);
    return Boolean(onRunNode)
      && (
        (Boolean(node.configSnapshot) && catalogEntry?.adapterStatus === "mvp_enabled" && ["ready", "approved", "qa_passed", "completed"].includes(node.status))
        || (isRunnableSkillNode && ["ready", "approved", "qa_passed", "completed", "warning"].includes(node.status))
      );
  };
  const canCancelNode = (node: ProductionFlowNode) =>
    Boolean(onCancelNodeExecution) && ["running", "queued", "reserving_credits"].includes(node.status);
  const canRetryNode = (node: ProductionFlowNode) =>
    Boolean(onRetryNode) && ["failed", "cancelled", "needs_revision"].includes(node.status) && Boolean(node.configSnapshot);
  const visibleOutputs = (node: ProductionFlowNode) =>
    (node.outputRefs ?? []).filter((ref) => ref.url || ref.thumbnailUrl || ref.storageKey || ref.libraryItemId || ref.mediaTaskId || ref.mediaId || ref.providerTaskId || ref.metadata?.text || ref.metadata?.prompt || ref.metadata?.generatedPrompt);
  const latestOutput = (node: ProductionFlowNode) => visibleOutputs(node).at(-1);
  const applyCanvasViewMode = useCallback((mode: CanvasViewMode) => {
    setCanvasViewMode(mode);
    if (mode === "overview") {
      reactFlow.fitView({ padding: 0.18, duration: 220, maxZoom: 0.95 });
      return;
    }
    if (mode === "selected" && selectedFlowNode?.position) {
      reactFlow.setViewport({
        x: 260 - selectedFlowNode.position.x * 1.02,
        y: 118 - selectedFlowNode.position.y * 1.02,
        zoom: 1.02,
      }, { duration: 220 });
      return;
    }
    reactFlow.setViewport({ x: 48, y: 72, zoom: 0.94 }, { duration: 220 });
  }, [reactFlow, selectedFlowNode]);
  const toggleExpandedNode = useCallback((nodeId: string) => {
    setExpandedNodeIds((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);
  const nodes = useMemo(() => flowNodes.map((node) => toFlowNode(node, {
    selectedNodeId,
    locale,
    expanded: expandedNodeIds.has(node.id),
    outputCount: visibleOutputs(node).length,
    canRun: canRunNode(node),
    canCancel: canCancelNode(node),
    canRetry: canRetryNode(node),
    runLabel: node.status === "completed" || visibleOutputs(node).length > 0 ? (locale === "th" ? "Regenerate" : "Regenerate") : "Run",
    runScopeLabel: nodeRunScopeLabel(node, locale),
    promptFrom: promptFromByNodeId.get(node.id),
    feeds: feedsByNodeId.get(node.id),
    assetDragActive,
    onSelect: selectNodeAndOpenDetail,
    onConfigure: onConfigureNode,
    onRun: onRunNode,
    onCancel: onCancelNodeExecution,
    onRetry: onRetryNode,
    onOpenOutput: (nodeId) => onOpenNodeOutput?.(nodeId, latestOutput(node)?.outputRefId),
    onToggleExpand: toggleExpandedNode,
  })), [
    expandedNodeIds,
    assetDragActive,
    feedsByNodeId,
    flowNodes,
    locale,
    onCancelNodeExecution,
    onConfigureNode,
    onOpenNodeOutput,
    onRetryNode,
    onRunNode,
    selectNodeAndOpenDetail,
    promptFromByNodeId,
    selectedNodeId,
    toggleExpandedNode,
  ]);

  useEffect(() => {
    const shouldTrustSourcePositions = previousPositionSignatureRef.current !== flowNodePositionSignature;
    previousPositionSignatureRef.current = flowNodePositionSignature;
    setInteractiveNodes((currentNodes) => {
      const currentById = new Map(currentNodes.map((node) => [node.id, node]));
      return nodes.map((node) => {
        const currentNode = currentById.get(node.id);
        if (!currentNode || shouldTrustSourcePositions) return node;
        return { ...node, position: currentNode.position };
      });
    });
  }, [flowNodePositionSignature, nodes]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      for (const node of flowNodes) updateNodeInternals(node.id);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [flowNodes, nodes, selectedNodeId, updateNodeInternals]);

  const renderDeferredItem = (item: (typeof nodeKinds)[number]) => (
    <div
      key={item.kind}
      title={item.deferredReason}
      className="rounded border border-slate-200 bg-white px-2 py-1.5 text-xs text-muted-foreground"
    >
      <div className="truncate font-medium text-slate-600">{item.label}</div>
      <div className="truncate text-[10px] text-amber-700">{item.deferredReason ?? (isThai ? "ยังไม่เปิดใช้" : "Not available yet")}</div>
    </div>
  );

  const displayedNodeKinds = selectedFlowNode && !showFullCatalog ? recommendedNodeKinds.slice(0, 5) : recommendedNodeKinds;
  const drawerContent = (
    <>
      <div className="text-[10px] font-semibold uppercase tracking-normal text-slate-500">{isThai ? "ใช้ได้ตอนนี้" : "Available now"}</div>
      <div className="rounded-md border border-sky-100 bg-sky-50 px-2 py-1.5 text-[11px] leading-4 text-sky-900">
        {isThai
          ? "รายการด้านล่างคลิกหรือ drag เข้า canvas ได้ทันที ส่วน status บอกว่า run ได้จริงหรือตั้งค่า/ส่งต่อได้"
          : "Items below can be clicked or dragged into the canvas. Status shows whether a node can run now or is config/handoff-ready."}
      </div>
      {selectedFlowNode ? (
        <div className="rounded-md border border-emerald-100 bg-emerald-50 px-2 py-1.5 text-[11px] leading-4 text-emerald-900">
          <div className="font-semibold">{isThai ? "แนะนำถัดไป" : "Recommended next"}</div>
          <div className="mt-0.5">{recommendedNodeKinds.slice(0, 3).map((item) => item.label).join(", ")}</div>
          <button
            type="button"
            className="mt-1 text-[11px] font-semibold text-emerald-800 underline-offset-2 hover:underline"
            onClick={() => setShowFullCatalog((value) => !value)}
          >
            {showFullCatalog ? (isThai ? "แสดงเฉพาะที่แนะนำ" : "Only recommended") : (isThai ? "ดู node ทั้งหมด" : "Show full catalog")}
          </button>
        </div>
      ) : null}
      {displayedNodeKinds.map((item, index) => (
        <div key={item.kind} className={index < 3 && selectedFlowNode ? "rounded-md ring-1 ring-emerald-100" : undefined}>
          {renderDrawerItem(item)}
        </div>
      ))}
      {laterNodeKinds.length ? (
        <details className="rounded-md border border-slate-200 bg-slate-50 p-2">
          <summary className="cursor-pointer text-xs font-medium text-slate-600">
            {isThai ? `ยังไม่เปิดใช้ (${laterNodeKinds.length})` : `Unavailable yet (${laterNodeKinds.length})`}
          </summary>
          <div className="mt-1 text-[11px] leading-4 text-muted-foreground">
            {isThai
              ? "รายการนี้แสดงไว้เพื่อบอก roadmap แต่ยังไม่ควรใช้ในงานจริง"
              : "These are roadmap placeholders and are not available for production work yet."}
          </div>
          <div className="mt-2 grid gap-1.5">
            {laterNodeKinds.map(renderDeferredItem)}
          </div>
        </details>
      ) : null}
      <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-2 text-xs text-muted-foreground">
        {isThai ? "คลิกหรือ drag เข้า canvas" : "Click or drag into the canvas."}
      </div>
    </>
  );
  const nodeListContent = (
    <div className="grid gap-2">
      {selectedFlowNode ? (
        <div className="rounded-md border border-sky-200 bg-sky-50 p-2 text-xs">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate font-semibold text-sky-950">{selectedFlowNode.title}</div>
              <div className="truncate text-sky-800">{nodeKindLabel(selectedFlowNode.kind, locale)}</div>
            </div>
            <Badge variant="outline" className={statusTone(selectedFlowNode.status)}>{readableStatus(selectedFlowNode.status)}</Badge>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <Button type="button" variant="outline" size="sm" className="h-8 px-2 text-[11px]" onClick={() => onConfigureNode?.(selectedFlowNode.id)}>
              <Settings2 className="mr-1 h-3 w-3" />
              {isThai ? "เปิดแท็บ" : "Open tab"}
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-8 px-2 text-[11px]" disabled={!canRunNode(selectedFlowNode)} onClick={() => onRunNode?.(selectedFlowNode.id)}>
              <Play className="mr-1 h-3 w-3" />
              Run
            </Button>
          </div>
        </div>
      ) : null}
      <div className="grid gap-2" role="list" aria-label={isThai ? "รายการ node" : "Production nodes"}>
        {flowNodes.length ? (
          flowNodes.map((node) => (
            <div
              key={node.id}
              role="listitem"
              aria-current={selectedNodeId === node.id ? "true" : undefined}
              className={`rounded-md border p-2 text-xs transition-colors hover:bg-sky-50 ${
                selectedNodeId === node.id ? "border-sky-300 bg-sky-50" : "border-slate-200 bg-white"
              }`}
            >
              <button type="button" className="w-full text-left" onClick={() => selectNodeAndOpenDetail(node.id)}>
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <span className="line-clamp-2 break-words font-semibold text-slate-900">{node.title}</span>
                  <Badge variant="outline" className="shrink-0 text-[10px]">{readableStatus(node.status)}</Badge>
                </div>
                <div className="mt-1 truncate text-[11px] text-muted-foreground">{nodeKindLabel(node.kind, locale)}</div>
              </button>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 text-[11px]"
                  onClick={() => selectNodeAndOpenDetail(node.id)}
                  aria-label={isThai ? `เปิด node ${node.title}` : `Open node ${node.title}`}
                >
                  <Eye className="mr-1 h-3 w-3" />
                  {isThai ? "ดู" : "Open"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 text-[11px]"
                  onClick={() => onConfigureNode?.(node.id)}
                  aria-label={isThai ? `ตั้งค่า node ${node.title}` : `Configure node ${node.title}`}
                >
                  <Settings2 className="mr-1 h-3 w-3" />
                  {isThai ? "แท็บ" : "Tab"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 text-[11px]"
                  disabled={!canRunNode(node)}
                  onClick={() => onRunNode?.(node.id)}
                  aria-label={isThai ? `run เฉพาะ node ${node.title}` : `Run only node ${node.title}`}
                >
                  <Play className="mr-1 h-3 w-3" />
                  Run
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 text-[11px]"
                  onClick={() => {
                    setListConnectSourceId(node.id);
                    selectNodeAndOpenDetail(node.id);
                  }}
                  aria-label={isThai ? `เริ่มเชื่อมจาก ${node.title}` : `Start link from ${node.title}`}
                >
                  <Link2 className="mr-1 h-3 w-3" />
                  {isThai ? "ต้นทาง" : "Start"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 text-[11px]"
                  disabled={!listConnectSourceId || listConnectSourceId === node.id}
                  onClick={() => {
                    if (!listConnectSourceId) return;
                    const connection: Connection = { source: listConnectSourceId, target: node.id, sourceHandle: null, targetHandle: null };
                    const invalid = validateConnection(connection, flowNodes, flowEdges);
                    if (invalid) {
                      publishWarning(invalid);
                      return;
                    }
                    setWarning(null);
                    onConnectNodes?.({
                      id: `${connection.source}-${connection.target}`,
                      source: connection.source,
                      target: connection.target,
                      kind: selectedEdgeKind,
                    });
                    setListConnectSourceId(null);
                  }}
                  aria-label={isThai ? `เชื่อมมาที่ ${node.title}` : `Connect here to ${node.title}`}
                >
                  {isThai ? "เชื่อม" : "Connect"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 border-red-200 px-2 text-[11px] text-red-700 hover:bg-red-50"
                  onClick={() => onDeleteNode?.(node.id)}
                  aria-label={isThai ? `ลบ node ${node.title}` : `Delete node ${node.title}`}
                >
                  <Trash2 className="mr-1 h-3 w-3" />
                  {isThai ? "ลบ" : "Delete"}
                </Button>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-muted-foreground">
            {isThai ? "ยังไม่มี node" : "No nodes yet."}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <section className="max-w-full overflow-x-hidden rounded-lg border border-slate-200 bg-white shadow-sm" data-testid="production-flow-canvas">
      <div className="flex min-w-0 flex-col gap-2 border-b border-slate-100 px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-900">{isThai ? "Production Canvas" : "Production Canvas"}</div>
          <div className="text-xs text-muted-foreground">
            {isThai ? "เลื่อนหน้าได้ตามปกติ ใช้ปุ่มซูมเมื่อต้องการควบคุม canvas" : "Page scroll stays available. Use canvas controls when you need zoom or pan."}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-1" role="group" aria-label={isThai ? "โหมดมุมมอง canvas" : "Canvas view mode"}>
            {([
              ["readable", isThai ? "อ่านง่าย" : "Readable", Eye],
              ["overview", isThai ? "ภาพรวม" : "Overview", Maximize2],
              ["selected", isThai ? "โฟกัส" : "Focus", Focus],
            ] as const).map(([mode, label, Icon]) => (
              <button
                key={mode}
                type="button"
                className={`inline-flex h-7 items-center gap-1 rounded px-2 text-[11px] font-medium ${canvasViewMode === mode ? "bg-white text-sky-800 shadow-sm" : "text-slate-600 hover:bg-white/70"}`}
                onClick={() => applyCanvasViewMode(mode)}
                disabled={mode === "selected" && !selectedFlowNode}
                aria-label={label}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
          <select
            value={selectedEdgeKind}
            onChange={(event) => setSelectedEdgeKind(event.target.value as ProductionFlowEdgeKind)}
            className="h-9 rounded-md border border-slate-200 bg-slate-50 px-2 text-xs"
            aria-label={isThai ? "ชนิด edge" : "Edge kind"}
          >
            {edgeKinds.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
          </select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 border-red-200 px-3 text-xs font-semibold text-red-700 hover:bg-red-50 hover:text-red-800"
            disabled={!flowNodes.length || !onDeleteNode}
            onClick={resetCanvasNodes}
            aria-label={isThai ? "รีเซ็ต canvas และลบ node ทั้งหมด" : "Reset canvas and remove all nodes"}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            {isThai ? "Reset canvas" : "Reset canvas"}
          </Button>
        </div>
      </div>
      {warning ? (
        <div role="alert" aria-live="polite" className="mx-4 mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{warning.message}</span>
        </div>
      ) : null}
      <div className="grid min-w-0 gap-0 xl:grid-cols-[260px_minmax(0,1fr)]">
        <div className="order-2 min-w-0 border-t border-slate-100 p-3 xl:order-1 xl:border-r xl:border-t-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <ListTree className="h-4 w-4 text-sky-600" />
            {isThai ? "แผงควบคุม node" : "Node panel"}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-1 rounded-md border border-slate-200 bg-slate-50 p-1" role="tablist" aria-label={isThai ? "แผงซ้ายของ canvas" : "Canvas left panel"}>
            {([
              ["catalog", isThai ? "เพิ่ม" : "Add"],
              ["nodes", isThai ? "รายการ" : "Nodes"],
            ] as const).map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={leftPanelTab === tab}
                className={`h-8 rounded px-2 text-xs font-semibold ${leftPanelTab === tab ? "bg-white text-sky-800 shadow-sm" : "text-slate-600 hover:bg-white/70"}`}
                onClick={() => setLeftPanelTab(tab)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-3 grid max-h-[calc(100vh-260px)] gap-2 overflow-y-auto pr-1 max-xl:max-h-[420px]" data-testid="production-node-list-fallback">
            {leftPanelTab === "catalog" ? drawerContent : nodeListContent}
          </div>
        </div>
        <div className="order-1 min-w-0 p-3 xl:order-2">
          <div className="min-w-0">
          <div
            data-testid="production-flow-canvas-viewport"
            className="relative h-[72vh] min-h-[620px] touch-pan-y overflow-hidden rounded-md border border-slate-200 bg-[radial-gradient(circle_at_1px_1px,#dbe7ef_1px,transparent_0)] [background-size:24px_24px] max-md:min-h-[520px]"
            onWheelCapture={(event) => {
              if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
              window.scrollBy({ top: event.deltaY, behavior: "auto" });
            }}
            onDragEnter={(event) => {
              if (Array.from(event.dataTransfer.types).includes("application/x-production-asset-id")) setAssetDragActive(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              if (Array.from(event.dataTransfer.types).includes("application/x-production-asset-id")) setAssetDragActive(true);
            }}
            onDragLeave={(event) => {
              if (event.currentTarget.contains(event.relatedTarget as globalThis.Node | null)) return;
              setAssetDragActive(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setAssetDragActive(false);
              const position = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
              const nodeKind = event.dataTransfer.getData("application/x-production-node-kind") as ProductionNodeKind;
              const assetId = event.dataTransfer.getData("application/x-production-asset-id");

              if (nodeKind) {
                const catalogEntry = getProductionNodeCatalogEntry(nodeKind);
                if (catalogEntry?.adapterStatus === "deferred") {
                  publishWarning({
                    code: "deferred_node",
                    message: catalogEntry.deferredReason ?? (isThai ? "node ประเภทนี้ยังอยู่ในรอบ release ถัดไป" : "This node type is deferred until a later release gate."),
                    source: nodeKind,
                    target: null,
                  });
                  return;
                }
                onAddNode?.(nodeKind, position);
                return;
              }

              let asset = contextAssets.find((item) => item.id === assetId);
              if (!asset) {
                try {
                  const serializedAsset = event.dataTransfer.getData("application/x-production-asset-json") || event.dataTransfer.getData("application/json");
                  const parsedAsset = serializedAsset ? JSON.parse(serializedAsset) as ProductionReferenceInput : null;
                  if (parsedAsset?.id && parsedAsset.title && parsedAsset.kind) asset = parsedAsset;
                } catch {
                  asset = undefined;
                }
              }
              if (asset) {
                const nodeAtDrop = interactiveNodes
                  .map((node) => {
                    const dx = position.x - node.position.x;
                    const dy = position.y - node.position.y;
                    const withinCard = dx >= -24 && dx <= 300 && dy >= -24 && dy <= 220;
                    return { id: node.id, distance: Math.hypot(dx, dy), withinCard };
                  })
                  .filter((candidate) => candidate.withinCard)
                  .sort((a, b) => a.distance - b.distance)[0];
                onAssetAddToCanvas?.(asset, position);
                onAssetAssignToNode?.({ asset, nodeId: nodeAtDrop?.id ?? selectedNodeId });
              }
            }}
          >
            {assetDragActive ? (
              <div className="pointer-events-none absolute left-6 top-6 z-10 rounded-md border border-sky-200 bg-white/95 px-3 py-2 text-xs font-medium text-sky-900 shadow-sm">
                {isThai ? "วางบน node เพื่อผูก reference หรือวางพื้นที่ว่างเพื่อเพิ่มเข้า canvas" : "Drop on a node to attach as reference, or drop empty space to add to the canvas."}
              </div>
            ) : null}
            {nodes.length ? (
              <ReactFlow
	                nodes={interactiveNodes}
	                edges={edges}
	                defaultViewport={{ x: 48, y: 72, zoom: 0.94 }}
	                zoomOnScroll={false}
                panOnScroll={false}
                preventScrolling={false}
                onNodesChange={onNodesChange}
                onConnect={onConnect}
                onNodeClick={(_event, node) => selectNodeAndOpenDetail(node.id)}
                onPaneClick={() => selectNodeAndOpenDetail(null)}
                onNodeDragStop={onNodeDragStop}
                proOptions={{ hideAttribution: true }}
              >
                <Background color="transparent" gap={24} />
                <Controls />
                <MiniMap pannable zoomable />
              </ReactFlow>
              ) : (
              <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
                <div>
                  <MousePointer2 className="mx-auto mb-2 h-6 w-6 text-sky-600" />
                  {isThai ? "ยังไม่มี node ใน canvas" : "No nodes yet. Use the drawer to add the first node."}
                </div>
              </div>
              )}
            {selectedFlowNode && floatingDetailOpen ? (
              <div
                data-testid="production-node-detail-panel"
                className="nodrag nopan absolute z-20 flex max-h-[calc(100%-1rem)] min-h-[320px] w-[380px] min-w-[340px] max-w-[calc(100%-1rem)] resize flex-col overflow-auto rounded-xl border border-slate-200 bg-white/98 text-left shadow-[0_24px_70px_rgba(15,23,42,0.22)] backdrop-blur"
                style={{ left: floatingDetailPosition.x, top: floatingDetailPosition.y }}
                onPointerMove={moveFloatingDetail}
                onPointerUp={stopFloatingDetailDrag}
                onPointerCancel={stopFloatingDetailDrag}
              >
                <div
                  className="flex cursor-move items-start gap-2 border-b border-slate-100 bg-slate-50/90 px-3 py-2"
                  onPointerDown={startFloatingDetailDrag}
                  data-testid="production-node-detail-drag-handle"
                  aria-label={isThai ? "ลากเพื่อย้ายหน้าต่างรายละเอียด node" : "Drag to move node detail window"}
                >
                  <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 break-words text-sm font-semibold leading-5 text-slate-950">{selectedFlowNode.title}</div>
                    <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1">
                      <Badge variant="outline" className="max-w-[138px] truncate bg-white text-[10px]">{nodeKindLabel(selectedFlowNode.kind, locale)}</Badge>
                      <Badge variant="outline" className={`max-w-[96px] truncate text-[10px] ${statusTone(selectedFlowNode.status)}`}>{nodeStatusLabel(selectedFlowNode.status, locale)}</Badge>
                      <Badge variant="outline" className="max-w-[116px] truncate bg-white text-[10px]">{nodeRunScopeLabel(selectedFlowNode, locale)}</Badge>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-white hover:text-slate-900"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => setFloatingDetailOpen(false)}
                    aria-label={isThai ? "ปิดรายละเอียด node" : "Close node details"}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-3">
                  <div className="flex flex-wrap gap-2">
                    {nodeHasExternalToolSurface(selectedFlowNode) ? (
                      <Button type="button" variant="outline" size="sm" className="min-h-9 border-sky-800 bg-sky-800 text-white hover:bg-sky-900 hover:text-white" onClick={() => onConfigureNode?.(selectedFlowNode.id)}>
                        <Settings2 className="mr-1 h-3.5 w-3.5" />
                        {nodeConfigureActionLabel(selectedFlowNode, locale)}
                      </Button>
                    ) : null}
                    {canRunNode(selectedFlowNode) ? (
                      <Button type="button" variant="outline" size="sm" className="min-h-9" onClick={() => onRunNode?.(selectedFlowNode.id)}>
                        <Play className="mr-1 h-3.5 w-3.5" />
                        {visibleOutputs(selectedFlowNode).length > 0 || selectedFlowNode.status === "completed" ? "Regenerate" : "Run"}
                      </Button>
                    ) : null}
                    {canCancelNode(selectedFlowNode) ? (
                      <Button type="button" variant="outline" size="sm" className="min-h-9 border-amber-200 text-amber-700 hover:bg-amber-50" onClick={() => onCancelNodeExecution?.(selectedFlowNode.id)}>
                        {isThai ? "ยกเลิก" : "Cancel"}
                      </Button>
                    ) : null}
                    {visibleOutputs(selectedFlowNode).length > 0 ? (
                      <Button type="button" variant="outline" size="sm" className="min-h-9" onClick={() => onOpenNodeOutput?.(selectedFlowNode.id, latestOutput(selectedFlowNode)?.outputRefId)}>
                        <Eye className="mr-1 h-3.5 w-3.5" />
                        {isThai ? "ดูผล" : "Output"}
                      </Button>
                    ) : null}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1" role="tablist" aria-label={isThai ? "รายละเอียด node" : "Node details"}>
                    {([
                      ["overview", isThai ? "ภาพรวม" : "Overview"],
                      ["prompt", isThai ? "พรอมป์" : "Prompt"],
                      ["references", isThai ? "ไฟล์อ้างอิง" : "References"],
                      ["outputs", isThai ? "ผลลัพธ์" : "Outputs"],
                      ["runlog", isThai ? "Run log" : "Run log"],
                    ] as const).map(([tab, label]) => (
                      <button
                        key={tab}
                        type="button"
                        role="tab"
                        aria-selected={nodeDetailTab === tab}
                        onClick={() => setNodeDetailTab(tab)}
                        className={`rounded-md border px-2 py-1 text-[11px] font-medium ${nodeDetailTab === tab ? "border-sky-300 bg-sky-50 text-sky-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-2 text-sm">
                    {nodeDetailTab === "overview" ? (
                      <div className="grid gap-2">
                        {nodeDetailRows(selectedFlowNode, locale).length ? nodeDetailRows(selectedFlowNode, locale).map((row) => (
                          <div key={row.label} className="min-w-0 rounded-md border border-slate-100 bg-white px-2 py-1.5">
                            <div className="text-[10px] font-semibold uppercase tracking-normal text-slate-500">{row.label}</div>
                            <div className="mt-0.5 line-clamp-3 break-words text-xs leading-5 text-slate-700">{row.value}</div>
                          </div>
                        )) : (
                          <div className="text-xs text-muted-foreground">{isThai ? "ยังไม่มีรายละเอียดจาก planner" : "No planner detail yet."}</div>
                        )}
                        <div className="min-w-0 rounded-md border border-slate-100 bg-white px-2 py-1.5">
                          <div className="text-[10px] font-semibold uppercase tracking-normal text-slate-500">{isThai ? "สรุปงาน" : "Work summary"}</div>
                          <div className="mt-0.5 line-clamp-3 break-words text-xs leading-5 text-slate-700">{nodeWorkSummary(selectedFlowNode, locale)}</div>
                        </div>
                        {selectedFlowNode.referenceInputs?.length ? (
                          <div className="min-w-0 rounded-md border border-slate-100 bg-white px-2 py-1.5">
                            <div className="text-[10px] font-semibold uppercase tracking-normal text-slate-500">{isThai ? "ไฟล์ที่แนบ" : "Attached media"}</div>
                            <div className="mt-2 grid grid-cols-2 gap-1.5">
                              {selectedFlowNode.referenceInputs.slice(0, 4).map((asset) => (
                                <div key={asset.id} className="min-w-0 rounded-md border border-slate-100 bg-slate-50 p-1">
                                  <div className="truncate text-[11px] font-medium text-slate-800">{asset.title}</div>
                                  <div className="truncate text-[10px] text-muted-foreground">{asset.kind.replace(/_/g, " ")}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {nodeDetailTab === "prompt" ? (
                      <div className="max-h-44 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-slate-100 bg-white p-2 text-xs leading-5 text-slate-800">
                        {nodePromptText(selectedFlowNode) ?? (isThai ? "ยังไม่มี prompt ใน node นี้ กดเปิดแท็บเพื่อใช้ระบบ prompt/generate เดิม" : "No prompt is attached to this node yet. Open the linked tab to use the existing prompt/generate workflow.")}
                      </div>
                    ) : null}
                    {nodeDetailTab === "references" ? (
                      <div className="grid gap-2">
                        {selectedFlowNode.referenceInputs?.length ? selectedFlowNode.referenceInputs.map((asset) => (
                          <div key={asset.id} className="flex min-w-0 items-center gap-2 rounded-md border border-slate-100 bg-white p-2">
                            <div className="flex h-12 w-14 shrink-0 items-center justify-center overflow-hidden rounded bg-slate-100 text-[10px] text-muted-foreground">
                              {asset.thumbnailUrl || asset.url ? (
                                asset.kind === "source_video" ? <video src={asset.thumbnailUrl || asset.url} className="h-full w-full object-cover" muted playsInline /> : <img src={asset.thumbnailUrl || asset.url} alt="" className="h-full w-full object-cover" />
                              ) : asset.kind}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-xs font-medium text-slate-800">{asset.title}</div>
                              <div className="truncate text-[11px] text-muted-foreground">{asset.kind.replace(/_/g, " ")} · {asset.source}</div>
                            </div>
                          </div>
                        )) : (
                          <div className="text-xs text-muted-foreground">{isThai ? "ยังไม่มีไฟล์อ้างอิง ลากสื่อจาก panel ด้านขวามาวางบน node ได้" : "No references yet. Drop media from the right panel onto this node."}</div>
                        )}
                      </div>
                    ) : null}
                    {nodeDetailTab === "outputs" ? (
                      <div className="grid gap-2">
                        {visibleOutputs(selectedFlowNode).length ? visibleOutputs(selectedFlowNode).map((output) => (
                          <button key={output.outputRefId} type="button" className="min-w-0 rounded-md border border-slate-100 bg-white p-2 text-left text-xs hover:border-sky-200 hover:bg-sky-50" onClick={() => onOpenNodeOutput?.(selectedFlowNode.id, output.outputRefId)}>
                            <div className="truncate font-medium text-slate-800">{output.kind}</div>
                            <div className="mt-1 line-clamp-3 break-words text-muted-foreground">{truncateText(summarizeUnknown(output.metadata?.text ?? output.metadata?.generatedPrompt ?? output.url ?? output.providerTaskId ?? output.mediaTaskId) ?? output.outputRefId, 160)}</div>
                          </button>
                        )) : (
                          <div className="text-xs text-muted-foreground">{isThai ? "ยังไม่มีผลลัพธ์ กด Run เมื่อ node พร้อม" : "No outputs yet. Run the node when it is ready."}</div>
                        )}
                      </div>
                    ) : null}
                    {nodeDetailTab === "runlog" ? (
                      <div className="grid gap-1 break-words text-xs leading-5 text-slate-700">
                        <span>{isThai ? "สถานะ" : "Status"}: {readableStatus(selectedFlowNode.status)}</span>
                        <span>{isThai ? "ขอบเขตการ run" : "Run scope"}: {nodeRunScopeLabel(selectedFlowNode, locale)}</span>
                        <span>{isThai ? "เครดิตโดยประมาณ" : "Estimated credits"}: {selectedFlowNode.estimatedCredits ?? 0}</span>
                        <span>{isThai ? "ปัญหาความพร้อม" : "Readiness"}: {selectedFlowNode.readinessIssues?.join(", ") || (isThai ? "ไม่มี" : "none")}</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          </div>

        <div className="hidden">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-sm font-semibold">{isThai ? "Node Inspector" : "Node Inspector"}</div>
            <Badge variant="outline">{flowNodes.length}</Badge>
          </div>
          {selectedFlowNode ? (
            <div className="mb-3 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium text-sky-950">{selectedFlowNode.title}</div>
                  <div className="text-xs text-sky-800">{nodeKindLabel(selectedFlowNode.kind, locale)}</div>
                </div>
                <Badge variant="outline" className={statusTone(selectedFlowNode.status)}>{readableStatus(selectedFlowNode.status)}</Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {visibleOutputs(selectedFlowNode).length > 0 ? (
                  <Button type="button" variant="outline" size="sm" className="min-h-10 sm:min-h-0" onClick={() => onOpenNodeOutput?.(selectedFlowNode.id, latestOutput(selectedFlowNode)?.outputRefId)}>
                    <Eye className="mr-1 h-3.5 w-3.5" />
                    {isThai ? "ดูผลลัพธ์" : "View output"}
                  </Button>
                ) : null}
                <Button type="button" variant="outline" size="sm" className="min-h-10 border-sky-800 bg-sky-800 text-white hover:bg-sky-900 hover:text-white sm:min-h-0" onClick={() => onConfigureNode?.(selectedFlowNode.id)}>
                  <Settings2 className="mr-1 h-3.5 w-3.5" />
                  {isThai ? "ตั้งค่า" : "Configure"}
                </Button>
                <Button type="button" variant="outline" size="sm" className="min-h-10 sm:min-h-0" disabled={!canRunNode(selectedFlowNode)} onClick={() => onRunNode?.(selectedFlowNode.id)}>
                  <Play className="mr-1 h-3.5 w-3.5" />
                  {isThai ? "Run node นี้" : "Run this node"}
                </Button>
                {canCancelNode(selectedFlowNode) ? (
                  <Button type="button" variant="outline" size="sm" className="min-h-10 border-amber-200 text-amber-700 hover:bg-amber-50 sm:min-h-0" onClick={() => onCancelNodeExecution?.(selectedFlowNode.id)}>
                    {isThai ? "ยกเลิก node" : "Cancel node"}
                  </Button>
                ) : null}
                {canRetryNode(selectedFlowNode) ? (
                  <Button type="button" variant="outline" size="sm" className="min-h-10 sm:min-h-0" onClick={() => onRetryNode?.(selectedFlowNode.id)}>
                    <RotateCcw className="mr-1 h-3.5 w-3.5" />
                    {isThai ? "ลองใหม่" : "Retry"}
                  </Button>
                ) : null}
                <Button type="button" variant="outline" size="sm" className="min-h-10 border-red-200 text-red-700 hover:bg-red-50 sm:min-h-0" onClick={() => onDeleteNode?.(selectedFlowNode.id)}>
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  {isThai ? "ลบ" : "Delete"}
                </Button>
              </div>
            </div>
          ) : null}
          <div className="grid gap-2 md:grid-cols-2" role="list" aria-label={isThai ? "รายการ node" : "Production nodes"}>
            {flowNodes.length ? (
              flowNodes.map((node) => (
                <div
                  key={node.id}
                  role="listitem"
                  aria-current={selectedNodeId === node.id ? "true" : undefined}
                  className={`rounded-md border px-3 py-2 text-sm transition-colors hover:bg-sky-50 ${
                    selectedNodeId === node.id ? "border-sky-300 bg-sky-50" : "bg-slate-50"
                  }`}
                >
                  <button type="button" className="w-full text-left" onClick={() => selectNodeAndOpenDetail(node.id)}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{node.title}</span>
                      <Badge variant="outline">{readableStatus(node.status)}</Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{nodeKindLabel(node.kind, locale)}</span>
                      {visibleOutputs(node).length > 0 ? (
                        <Badge variant="outline" className="bg-white text-[10px]">
                          {visibleOutputs(node).length} {isThai ? "ผลลัพธ์" : "outputs"}
                        </Badge>
                      ) : null}
                    </div>
                  </button>
                  <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-10 sm:min-h-0"
                      onClick={() => selectNodeAndOpenDetail(node.id)}
                      aria-label={isThai ? `เปิด node ${node.title}` : `Open node ${node.title}`}
                    >
                      <Eye className="mr-1 h-3.5 w-3.5" />
                      {isThai ? "รายละเอียด" : "Details"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-10 sm:min-h-0"
                      disabled={!canRunNode(node)}
                      onClick={() => onRunNode?.(node.id)}
                      aria-label={isThai ? `run เฉพาะ node ${node.title}` : `Run only node ${node.title}`}
                    >
                      <Play className="mr-1 h-3.5 w-3.5" />
                      {isThai ? "Run" : "Run"}
                    </Button>
                    {visibleOutputs(node).length > 0 ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="min-h-10 sm:min-h-0"
                        onClick={() => onOpenNodeOutput?.(node.id, latestOutput(node)?.outputRefId)}
                        aria-label={isThai ? `ดูผลลัพธ์ node ${node.title}` : `View output for node ${node.title}`}
                      >
                        <Eye className="mr-1 h-3.5 w-3.5" />
                        {isThai ? "ผลลัพธ์" : "Output"}
                      </Button>
                    ) : null}
                    <details className="relative">
                      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50 sm:min-h-0">
                        <MoreHorizontal className="h-3.5 w-3.5" />
                        {isThai ? "เพิ่มเติม" : "More"}
                      </summary>
                      <div className="absolute right-0 z-20 mt-2 grid min-w-36 gap-1 rounded-md border border-slate-200 bg-white p-2 shadow-lg">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="justify-start"
                          onClick={() => onConfigureNode?.(node.id)}
                          aria-label={isThai ? `ตั้งค่า node ${node.title}` : `Configure node ${node.title}`}
                        >
                          <Settings2 className="mr-1 h-3.5 w-3.5" />
                          {isThai ? "ตั้งค่า" : "Configure"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="justify-start"
                          onClick={() => {
                            setListConnectSourceId(node.id);
                            selectNodeAndOpenDetail(node.id);
                          }}
                          aria-label={isThai ? `เริ่มเชื่อมจาก ${node.title}` : `Start link from ${node.title}`}
                        >
                          <Link2 className="mr-1 h-3.5 w-3.5" />
                          {isThai ? "ตั้งเป็นต้นทาง" : "Set as link source"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="justify-start"
                          disabled={!listConnectSourceId || listConnectSourceId === node.id}
                          onClick={() => {
                            if (!listConnectSourceId) return;
                            const connection: Connection = { source: listConnectSourceId, target: node.id, sourceHandle: null, targetHandle: null };
                            const invalid = validateConnection(connection, flowNodes, flowEdges);
                            if (invalid) {
                              publishWarning(invalid);
                              return;
                            }
                            setWarning(null);
                            onConnectNodes?.({
                              id: `${connection.source}-${connection.target}`,
                              source: connection.source,
                              target: connection.target,
                              kind: selectedEdgeKind,
                            });
                            setListConnectSourceId(null);
                          }}
                        >
                          <ArrowRight className="mr-1 h-3.5 w-3.5" />
                          {isThai ? "เชื่อมมาที่นี่" : "Connect here"}
                        </Button>
                        {canCancelNode(node) ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="justify-start text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                            onClick={() => onCancelNodeExecution?.(node.id)}
                            aria-label={isThai ? `ยกเลิก node ${node.title}` : `Cancel node ${node.title}`}
                          >
                            {isThai ? "ยกเลิก node" : "Cancel node"}
                          </Button>
                        ) : null}
                        {canRetryNode(node) ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="justify-start"
                            onClick={() => onRetryNode?.(node.id)}
                            aria-label={isThai ? `ลองใหม่ node ${node.title}` : `Retry node ${node.title}`}
                          >
                            <RotateCcw className="mr-1 h-3.5 w-3.5" />
                            {isThai ? "ลองใหม่" : "Retry"}
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="justify-start text-red-700 hover:bg-red-50 hover:text-red-800"
                          onClick={() => onDeleteNode?.(node.id)}
                          aria-label={isThai ? `ลบ node ${node.title}` : `Delete node ${node.title}`}
                        >
                          <Trash2 className="mr-1 h-3.5 w-3.5" />
                          {isThai ? "ลบ" : "Delete"}
                        </Button>
                      </div>
                    </details>
                    {listConnectSourceId === node.id ? (
                      <Badge variant="outline">{isThai ? "ต้นทาง" : "source"}</Badge>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded border border-dashed p-3 text-sm text-muted-foreground">
                {isThai ? "ไม่มี fallback list" : "No nodes to list."}
              </div>
            )}
          </div>
        </div>
      </div>
      </div>
    </section>
  );
}

export function ProductionFlowCanvas(props: ProductionFlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <ProductionFlowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
