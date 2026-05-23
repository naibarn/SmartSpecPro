import type {
  ProductionFlowEdge,
  ProductionFlowNode,
  ProductionFlowEdgeKind,
  ProductionNodeConfigSnapshot,
  ProductionNodeKind,
  ProductionReferenceInput,
  ProductionShot,
} from "@shared/mediaProduction";

export type ProductionLocale = "en" | "th";

export type ProductionCanvasDropSource =
  | { type: "asset"; asset: ProductionReferenceInput }
  | { type: "node-kind"; kind: ProductionNodeKind };

export interface ProductionNodeConfigDraft {
  nodeId: string;
  title: string;
  adapter: ProductionNodeConfigSnapshot["adapter"];
  toolSurface: ProductionNodeConfigSnapshot["toolSurface"];
  config: Record<string, unknown>;
  manuallyEdited: boolean;
}

export interface ProductionInvalidEdgeWarning {
  code: "missing_source" | "missing_target" | "self_edge" | "locked_target" | "duplicate_edge" | "cycle_detected" | "unsupported_edge_kind" | "deferred_node";
  message: string;
  source?: string | null;
  target?: string | null;
}

export interface ProductionAssetTarget {
  asset: ProductionReferenceInput;
  nodeId?: string | null;
}

export interface ProductionShotDraft {
  id: string;
  title: string;
  order: number;
  durationSeconds?: number;
  version?: number;
  storyBeat?: string;
  shotType?: ProductionShot["shotType"];
  cameraIntent?: string;
  sourceVideoControl?: ProductionShot["sourceVideoControl"];
  characterAssetIds: string[];
  customerJourneyStage?: string;
  mustShow: string[];
  mustAvoid: string[];
  script?: string;
  visualIntent?: string;
  audioIntent?: string;
  productAssetIds: string[];
  locked: boolean;
  status: ProductionShot["status"];
}

export interface ProductionCanvasCallbacks {
  onAddNode?: (kind: ProductionNodeKind, position?: { x: number; y: number }) => void;
  onSelectNode?: (nodeId: string | null) => void;
  onConnectNodes?: (edge: Pick<ProductionFlowEdge, "source" | "target"> & Partial<ProductionFlowEdge> & { kind?: ProductionFlowEdgeKind }) => void;
  onInvalidEdge?: (warning: ProductionInvalidEdgeWarning) => void;
  onNodePositionChange?: (nodeId: string, position: { x: number; y: number }) => void;
  onAssetAddToCanvas?: (asset: ProductionReferenceInput, position?: { x: number; y: number }) => void;
  onAssetAssignToNode?: (target: ProductionAssetTarget) => void;
  onSaveNodeConfig?: (draft: ProductionNodeConfigDraft) => void;
  onDeleteNode?: (nodeId: string) => void;
  onConfigureNode?: (nodeId: string) => void;
  onRunNode?: (nodeId: string) => void;
}

export type ProductionWorkspaceViewState = "ready" | "loading" | "error" | "conflict" | "feature_disabled" | "archived" | "deleted" | "stale";

export interface VideoShotWorkspaceCallbacks {
  onSelectShot?: (shotId: string) => void;
  onSaveShot?: (draft: ProductionShotDraft) => void;
  onDuplicateShot?: (shotId: string) => void;
  onSplitShot?: (shotId: string) => void;
  onToggleShotLock?: (shotId: string, locked: boolean) => void;
  onDeleteShot?: (shotId: string) => void;
  onReorderShot?: (shotId: string, direction: "up" | "down") => void;
  onMergeShot?: (sourceShotId: string, targetShotId: string) => void;
  onConfigureShot?: (shotId: string) => void;
  onOpenShot?: (shotId: string) => void;
}

export function nodeConfigToDraft(node: ProductionFlowNode): ProductionNodeConfigDraft {
  const snapshot = node.configSnapshot;
  return {
    nodeId: node.id,
    title: node.title,
    adapter: snapshot?.adapter ?? adapterForNodeKind(node.kind),
    toolSurface: snapshot?.toolSurface ?? toolSurfaceForNodeKind(node.kind),
    config: snapshot?.config ?? {},
    manuallyEdited: snapshot?.manuallyEdited ?? false,
  };
}

export function adapterForNodeKind(kind: ProductionNodeKind): ProductionNodeConfigSnapshot["adapter"] {
  if (kind === "image" || kind === "image_generate" || kind === "image_edit" || kind === "image_upscale_enhance" || kind === "character_create") return "image";
  if (kind === "video" || kind === "video_shot" || kind === "video_generate" || kind === "image_to_video" || kind === "video_to_video" || kind === "lip_sync" || kind === "video_edit") return "video";
  if (kind === "tts" || kind === "text_to_speech" || kind === "voice" || kind === "voice_change") return "tts";
  if ([
    "goal_brief",
    "context_summary",
    "story_strategy",
    "script_generation",
    "script_revision",
    "storyboard_planning",
    "planning",
    "shot_breakdown",
    "prompt_packaging",
    "character_reference",
    "product_reference",
    "scene_reference",
    "brand_reference",
    "audio_reference",
    "source_video_reference",
    "qa",
    "human_review",
    "storyboard_review",
    "handoff",
    "speech_to_text",
    "caption",
    "caption_subtitle",
    "voice_isolate_cleanup",
  ].includes(kind)) return "preview_only";
  return "disabled";
}

export function toolSurfaceForNodeKind(kind: ProductionNodeKind): ProductionNodeConfigSnapshot["toolSurface"] {
  if (kind === "image" || kind === "image_generate" || kind === "image_edit" || kind === "image_upscale_enhance" || kind === "character_create") return "image";
  if (kind === "video" || kind === "video_shot" || kind === "video_generate" || kind === "image_to_video" || kind === "video_to_video" || kind === "lip_sync" || kind === "source_video_reference") return "video";
  if (kind === "tts" || kind === "text_to_speech" || kind === "voice" || kind === "voice_change" || kind === "music" || kind === "music_generate" || kind === "sound_effect" || kind === "sound_effect_generate" || kind === "audio_reference" || kind === "speech_to_text" || kind === "voice_isolate_cleanup") return "audio";
  if (kind === "storyboard_review") return "storyboard_review";
  if (kind === "video_edit" || kind === "handoff") return "video_edit";
  return "production";
}

export function shotToDraft(shot: ProductionShot): ProductionShotDraft {
  return {
    id: shot.id,
    title: shot.title,
    order: shot.order,
    durationSeconds: shot.durationSeconds,
    version: shot.version,
    storyBeat: shot.storyBeat,
    shotType: shot.shotType,
    cameraIntent: shot.cameraIntent,
    sourceVideoControl: shot.sourceVideoControl,
    characterAssetIds: shot.characterAssetIds ?? [],
    customerJourneyStage: shot.customerJourneyStage,
    mustShow: shot.mustShow ?? [],
    mustAvoid: shot.mustAvoid ?? [],
    script: shot.script,
    visualIntent: shot.visualIntent,
    audioIntent: shot.audioIntent,
    productAssetIds: shot.productAssetIds ?? [],
    locked: shot.locked ?? false,
    status: shot.status,
  };
}
