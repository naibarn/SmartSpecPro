import { TRPCError } from "@trpc/server";
import {
  HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
  buildHyperframesLibraryIdempotencyKey,
  createDefaultHyperframesPollingGuidance,
  stableHash,
  type HyperframesArtifactRef,
  type HyperframesChargeSummary,
  type HyperframesRenderStatusProjection,
  type HyperframesRenderIntent,
  type MarketplaceAutoReviewCompositionMode,
} from "@shared/hyperframes/contracts";
import {
  HyperframesFinalCompositeConfigSchema,
  RepairHyperframesRenderJobOutputSchema,
  type CreateHyperframesFinalCompositeInput,
  type GetVideoSegmentPlanPreviewInput,
  type GetVideoSegmentPlanPreviewOutput,
  type ListHyperframesCreativePresetsInput,
  type RepairHyperframesRenderJobOutput,
} from "@shared/hyperframes/runtimeApiSchemas";
import {
  HYPERFRAMES_CREATIVE_PRESET_ALIASES,
  listHyperframesCreativePresets,
  type HyperframesCreativePreset,
} from "@shared/hyperframes/creativePresets";
import { listHyperframesTemplateRegistry } from "./hyperframesTemplateRegistry";
import { getHyperframesAutoStoryboardReviewPlan } from "./hyperframesAutoPlanService";
import {
  buildHyperframesCreditEstimate,
  resolveHyperframesFeatureAccessForTenant,
  type HyperframesAuthContext,
} from "./hyperframesFeatureAccessService";
import {
  getMarketplaceAutoReviewRun,
  startMarketplaceAutoReviewRun,
  queueMarketplaceAutoReviewAdvance,
  type MarketplaceAutoReviewReferenceAnchorsInput,
} from "./marketplaceAutoReviewService";
import { getMarketplaceProductWithAccess } from "./marketplaceProductService";
import {
  buildHyperframesCompositionInput,
  buildHyperframesFinalCompositeCompositionInput,
  normalizeHyperframesFinalCompositeTimeline,
} from "./hyperframesCompositionService";
import {
  buildHyperframesRenderJobPayload,
  buildHyperframesRenderProjection,
  cancelHyperframesRenderJob,
  getHyperframesRenderProjection,
  queueHyperframesRenderJob,
  redactHyperframesRenderProjectionForUser,
  retryHyperframesRenderJob,
} from "./hyperframesRenderService";
import {
  getHyperframesCliRuntimeReadinessIssues,
  getHyperframesProducerRuntimeReadinessIssues,
  getHyperframesRuntimeMode,
  isHyperframesCliRuntimeAllowed,
  isHyperframesProducerRuntimeAllowed,
  type HyperframesRuntimeAdapterEnv,
} from "./hyperframesRuntimeAdapter";
import { queueDesktopHyperframesFinalCompositeJob } from "./workerSchedulerService";
import { getTenantFeatureFlags } from "./tenantFeatureFlagService";
import { finalizeHyperframesRenderToLibrary } from "./hyperframesLibraryFinalizeService";
import { startDetachedHyperframesRenderWorker } from "./backgroundWorkerProcess";
import {
  normalizeVideoSegmentCreativeBrief,
  planVideoSegments,
  resolveVideoModelSegmentCapability,
  type VideoSegmentAudioStrategy,
  type VideoSegmentPlanWarning,
  type VideoSegmentPlannerShot,
  type VideoSegmentTransport,
} from "../../shared/videoSegmentPlanner";

const INVALIDATES = [
  "marketplaceCapture.listAutoReviewRuns",
  "marketplaceCapture.getProduct",
  "marketplaceCapture.getAutoReviewRun",
  "marketplaceCapture.getAutoStoryboardReviewPlan",
  "marketplaceCapture.getHyperframesRenderJob",
  "media.library",
  "media.panel",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function isManualStoryboardHyperframesIdentity(input: {
  productId: string;
  runId: string;
}): boolean {
  const productId = cleanText(input.productId);
  const runId = cleanText(input.runId);
  return (
    /^manual(?:_storyboard)?_product_/i.test(productId) ||
    /^manual(?:_storyboard)?_run_/i.test(runId)
  );
}

export function buildManualStoryboardProductState(input: {
  productId: string;
  runId: string;
  runState: Record<string, unknown>;
  config: CreateHyperframesFinalCompositeInput["config"];
}) {
  const productionContext = isRecord(input.runState.productionContext)
    ? input.runState.productionContext
    : {};
  const resultJson = isRecord(input.runState.resultJson)
    ? input.runState.resultJson
    : {};
  const title =
    cleanText(productionContext.productionProjectTitle) ||
    cleanText(productionContext.productionStoryConceptTitle) ||
    cleanText(resultJson.title) ||
    cleanText(input.config.hookText) ||
    "Manual Storyboard Project";
  const description =
    cleanText(productionContext.videoConcept) ||
    cleanText(resultJson.description) ||
    cleanText(input.config.supportingText) ||
    "User-managed Storyboard Review project.";
  return {
    product: {
      id: input.productId,
      userId: 0,
      title,
      name: title,
      productName: title,
      description,
      descriptionText: description,
      shortSummary: description,
      cta: "ดูรายละเอียด",
      accessType: "owner",
      groupShare: null,
      platformRawJson: {
        manualStoryboardReview: true,
        runId: input.runId,
      },
    },
    images: [],
    history: [],
    shares: [],
    health: {
      status: "manual_storyboard_review",
      blockers: [],
      warnings: [],
    },
  };
}

async function getHyperframesFinalCompositeProductState(input: {
  productId: string;
  runId: string;
  auth: HyperframesAuthContext;
  runState: Record<string, unknown>;
  config: CreateHyperframesFinalCompositeInput["config"];
}) {
  try {
    return await getMarketplaceProductWithAccess(input.productId, input.auth);
  } catch (error) {
    if (!isManualStoryboardHyperframesIdentity(input)) throw error;
    return buildManualStoryboardProductState(input);
  }
}

function isMarketplaceAutoReviewRunNotFound(error: unknown): boolean {
  return (
    error instanceof TRPCError &&
    error.code === "NOT_FOUND" &&
    /auto review run not found/i.test(error.message)
  );
}

async function getMarketplaceAutoReviewRunOrManualFallback(input: {
  productId: string;
  runId: string;
  auth: HyperframesAuthContext;
}): Promise<Record<string, unknown>> {
  try {
    return (await getMarketplaceAutoReviewRun(
      input.runId,
      input.auth
    )) as Record<string, unknown>;
  } catch (error) {
    if (!isMarketplaceAutoReviewRunNotFound(error)) throw error;
    return {
      id: input.runId,
      productId: input.productId,
      launchMode: "manual_storyboard_review",
      status: "manual_storyboard_review",
      resultJson: {
        storyboardReviewId: input.runId,
        manualStoryboardReview: true,
      },
      metadataJson: {
        manualStoryboardReview: true,
        fallbackReason: "auto_review_run_not_found",
      },
      timeline: { items: [] },
      stages: [],
    };
  }
}

function scheduleHyperframesFinalCompositeWorkerKick(
  renderJobId?: string
): void {
  const timer = setTimeout(() => {
    try {
      const worker = startDetachedHyperframesRenderWorker({
        limit: 1,
        renderJobId,
      });
      console.info("[HyperFrames] Started detached render worker.", {
        renderJobId: renderJobId ?? null,
        pid: worker.pid,
      });
    } catch (error) {
      console.warn(
        "HyperFrames final composite worker kick failed.",
        error instanceof Error ? error.message : error
      );
    }
  }, 250);
  if (typeof timer === "object" && timer && "unref" in timer) {
    timer.unref();
  }
}

async function dispatchHyperframesFinalCompositeWorker(input: {
  renderJobId: string;
}): Promise<void> {
  try {
    const { enqueueTask, getCloudTasksConfigStatus } =
      await import("./cloudTasks");
    const config = getCloudTasksConfigStatus("node");
    if (config.configured) {
      await enqueueTask({
        queueName: "media-jobs",
        handlerPath: "/_internal/tasks/hyperframes-render-worker",
        targetService: "node",
        payload: {
          renderJobId: input.renderJobId,
          limit: 1,
        },
        taskId: `hyperframes-render-${input.renderJobId}`,
      });
      return;
    }
    console.warn(
      `[HyperFrames] Node Cloud Tasks config is incomplete; starting detached render worker. Missing: ${config.missingKeys.join(", ")}`
    );
  } catch (error) {
    console.warn(
      "[HyperFrames] Failed to enqueue render worker task; starting detached render worker.",
      error instanceof Error ? error.message : error
    );
  }
  scheduleHyperframesFinalCompositeWorkerKick(input.renderJobId);
}

export function getHyperframesFinalCompositeRuntimeBlockReason(
  env?: HyperframesRuntimeAdapterEnv
): string | null {
  const runtimeMode = getHyperframesRuntimeMode(env);
  if (runtimeMode === "producer") {
    const issues = getHyperframesProducerRuntimeReadinessIssues(env);
    return issues.length > 0 ? issues.join(" ") : null;
  }
  if (runtimeMode === "cli") {
    const issues = getHyperframesCliRuntimeReadinessIssues(env);
    return issues.length > 0 ? issues.join(" ") : null;
  }
  return "HyperFrames official HTML/CSS/browser runtime is not ready. Enable the tenant HyperFrames worker in Admin Tenant Feature Flags and verify the official HyperFrames runtime package.";
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(item => cleanText(item)).filter(Boolean)
    : [];
}

function isCompleteValidatedAudioAsset(value: {
  assetRef?: string;
  licenseName?: string;
  checksum?: { algorithm?: string; value?: string };
  mimeType?: string;
  durationSec?: number;
}): boolean {
  return (
    Boolean(cleanText(value.assetRef)) &&
    Boolean(cleanText(value.licenseName)) &&
    value.checksum?.algorithm === "sha256" &&
    /^[a-f0-9]{32,128}$/i.test(cleanText(value.checksum.value)) &&
    /^audio\/[a-z0-9.+-]+$/i.test(cleanText(value.mimeType)) &&
    Number.isFinite(value.durationSec) &&
    Number(value.durationSec) > 0
  );
}

function isSfxAudioRole(role: string): boolean {
  return (
    role === "transition_sfx" || role === "ui_sfx" || role === "accent_sfx"
  );
}

function sfxPresetFamily(presetId?: string): string {
  const value = cleanText(presetId).toLowerCase();
  if (/whoosh|scene_transition/.test(value)) return "whoosh";
  if (/button|click|tap/.test(value)) return "button";
  if (/cash|register|sales/.test(value)) return "cash";
  if (/riser|impact|reveal/.test(value)) return "riser";
  if (/extraction|ping|detect/.test(value)) return "extraction";
  if (/keyboard|typing/.test(value)) return "typing";
  if (/shutter|capture/.test(value)) return "shutter";
  if (/completion|cta/.test(value)) return "completion";
  if (/notification|message|pop|chime|bell/.test(value)) return "notification";
  if (/error|warning|buzz/.test(value)) return "warning";
  return "custom";
}

function allowedSfxTriggersForFamily(family: string): string[] {
  switch (family) {
    case "whoosh":
      return ["scene_cut"];
    case "button":
      return ["button_depress", "cta_lock"];
    case "notification":
      return ["card_materializes", "text_appears"];
    case "cash":
      return ["price_badge_pop", "sales_number_lock"];
    case "riser":
      return ["product_reveal"];
    case "extraction":
      return ["text_appears", "card_materializes"];
    case "typing":
      return ["text_appears"];
    case "shutter":
      return ["product_reveal", "card_materializes"];
    case "completion":
      return ["cta_lock"];
    case "warning":
      return ["text_appears", "manual"];
    default:
      return [
        "scene_cut",
        "text_appears",
        "card_materializes",
        "button_depress",
        "price_badge_pop",
        "sales_number_lock",
        "product_reveal",
        "cta_lock",
      ];
  }
}

function storyboardShotRanges(
  shots: Array<{
    id: string;
    index: number;
    startSec: number;
    durationSec: number;
  }>
): Array<{ id: string; startSec: number; endSec: number }> {
  return [...shots]
    .sort((a, b) => a.index - b.index)
    .map(shot => ({
      id: shot.id,
      startSec: Number(shot.startSec),
      endSec: Number(shot.startSec) + Number(shot.durationSec),
    }));
}

function audioVolumePolicyForEvent(input: {
  role: string;
  presetId?: string;
  hasVoiceover: boolean;
}): { label: string; maxVolume: number } | null {
  const role = cleanText(input.role);
  const presetId = cleanText(input.presetId).toLowerCase();
  if (role === "voiceover") {
    return { label: "voiceover", maxVolume: 1 };
  }
  if (role === "music") {
    return input.hasVoiceover
      ? { label: "music under voiceover", maxVolume: 0.18 }
      : { label: "music without voiceover", maxVolume: 0.45 };
  }
  if (role === "ambience") {
    return { label: "ambience", maxVolume: 0.1 };
  }
  if (role === "ui_sfx") {
    return { label: "UI click SFX", maxVolume: 0.42 };
  }
  if (role === "transition_sfx") {
    return { label: "transition whoosh SFX", maxVolume: 0.65 };
  }
  if (role === "accent_sfx") {
    if (/cash|register|sales/.test(presetId)) {
      return { label: "cash register SFX", maxVolume: 0.55 };
    }
    if (/notification|chime|bell/.test(presetId)) {
      return { label: "notification SFX", maxVolume: 0.4 };
    }
    if (/riser/.test(presetId)) {
      return { label: "riser SFX", maxVolume: 0.5 };
    }
    return { label: "impact SFX", maxVolume: 0.7 };
  }
  return null;
}

function validateHyperframesAudioVolumePolicy(input: {
  audioEvents: Array<{
    role: string;
    presetId?: string;
    volume: number;
  }>;
}): void {
  const hasVoiceover = input.audioEvents.some(
    event => event.role === "voiceover"
  );
  for (const event of input.audioEvents) {
    const policy = audioVolumePolicyForEvent({
      role: event.role,
      presetId: event.presetId,
      hasVoiceover,
    });
    if (!policy) continue;
    const volume = Number(event.volume);
    if (Number.isFinite(volume) && volume > policy.maxVolume + 0.001) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Audio event volume exceeds the safe mix policy for ${policy.label}.`,
      });
    }
  }
}

function validateHyperframesSfxPolicy(input: {
  audioEvents: Array<{
    role: string;
    presetId?: string;
    startSec: number;
    durationSec?: number;
    volume: number;
  }>;
  shotCount: number;
}): void {
  const sfxEvents = input.audioEvents.filter(event =>
    isSfxAudioRole(event.role)
  );
  const maxPerPreset = Math.max(4, input.shotCount + 2);
  const byPreset = new Map<string, typeof sfxEvents>();
  for (const event of sfxEvents) {
    const presetId = cleanText(event.presetId) || event.role;
    if (Number(event.durationSec ?? 0) > 2) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "SFX duration exceeds the allowed trigger policy.",
      });
    }
    if (Number(event.volume) > 0.75) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "SFX volume exceeds the safe mix policy.",
      });
    }
    const events = byPreset.get(presetId) ?? [];
    events.push(event);
    byPreset.set(presetId, events);
  }
  for (const [presetId, events] of byPreset) {
    if (events.length > maxPerPreset) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `SFX preset ${presetId} repeats too often for the final composite.`,
      });
    }
    const sorted = [...events].sort(
      (a, b) => Number(a.startSec) - Number(b.startSec)
    );
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      if (Number(current.startSec) - Number(previous.startSec) < 0.15) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Repeated SFX triggers are too close together.",
        });
      }
    }
  }
}

function validateHyperframesSfxShotBounds(input: {
  audioEvents: Array<{
    role: string;
    id?: string;
    startSec: number;
    durationSec?: number;
  }>;
  shots: Array<{
    id: string;
    index: number;
    startSec: number;
    durationSec: number;
  }>;
}): void {
  const ranges = storyboardShotRanges(input.shots);
  for (const event of input.audioEvents.filter(item =>
    isSfxAudioRole(item.role)
  )) {
    const eventStart = Number(event.startSec);
    const eventEnd = eventStart + Number(event.durationSec ?? 0);
    const ownerShot = ranges.find(
      range =>
        eventStart >= range.startSec - 0.05 && eventEnd <= range.endSec + 0.05
    );
    if (!ownerShot || eventEnd > ownerShot.endSec + 0.05) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "SFX event timing must stay within a single storyboard shot range.",
      });
    }
  }
}

function validateHyperframesSfxTriggerPolicy(input: {
  audioEvents: Array<{
    role: string;
    presetId?: string;
    visualTrigger: string;
    startSec: number;
    durationSec?: number;
  }>;
  shots: Array<{
    id: string;
    index: number;
    startSec: number;
    durationSec: number;
  }>;
}): void {
  const ranges = storyboardShotRanges(input.shots);
  for (const event of input.audioEvents.filter(item =>
    isSfxAudioRole(item.role)
  )) {
    const family = sfxPresetFamily(event.presetId);
    const visualTrigger = cleanText(event.visualTrigger);
    if (!visualTrigger || visualTrigger === "video_start") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Every SFX event must reference a concrete visual trigger.",
      });
    }
    const allowedTriggers = allowedSfxTriggersForFamily(family);
    if (!allowedTriggers.includes(visualTrigger)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `SFX preset ${cleanText(event.presetId) || family} requires a matching visual trigger.`,
      });
    }

    const eventStart = Number(event.startSec);
    const ownerShot = ranges.find(
      (range, index) =>
        eventStart >= range.startSec - 0.05 &&
        (eventStart < range.endSec - 0.05 ||
          (index === ranges.length - 1 && eventStart <= range.endSec + 0.05))
    );
    if (!ownerShot) continue;
    const offsetFromShotStart = eventStart - ownerShot.startSec;
    const offsetToNearestBoundary = Math.min(
      Math.abs(eventStart - ownerShot.startSec),
      Math.abs(ownerShot.endSec - eventStart)
    );

    if (family === "whoosh" && offsetToNearestBoundary > 0.25) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Whoosh SFX must be timed near a storyboard scene cut boundary.",
      });
    }
    if (family === "cash" && offsetFromShotStart < 0.5) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Cash register SFX must fire after the price/sales lock, not at sentence start.",
      });
    }
    if (family === "riser" && offsetFromShotStart > 1.2) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Riser SFX must start close to the product or feature reveal.",
      });
    }
  }
}

export function validateHyperframesFinalCompositeAudioAssets(
  rawConfig: unknown
): void {
  const config = HyperframesFinalCompositeConfigSchema.parse(rawConfig);
  const audioEvents = Array.isArray(config.audioEvents)
    ? config.audioEvents
    : [];
  if (audioEvents.length === 0) return;
  const validation = config.audioAssetValidation ?? {
    stagedAssetsRequired: true,
    allowSyntheticFallback: true,
    missingAssetRefs: [],
    validatedAssetRefs: [],
  };
  const missingAssetRefs = new Set(
    (validation.missingAssetRefs ?? [])
      .map(ref => cleanText(ref))
      .filter(Boolean)
  );
  const validatedAssetRefs = new Set(
    (validation.validatedAssetRefs ?? [])
      .map(ref => cleanText(ref))
      .filter(Boolean)
  );
  const validatedAssets = new Map(
    (validation.validatedAssets ?? [])
      .filter(asset => isCompleteValidatedAudioAsset(asset))
      .map(asset => [cleanText(asset.assetRef), asset])
  );
  const finalDuration = Number(config.finalVideoLengthSec) || 0;
  validateHyperframesAudioVolumePolicy({ audioEvents });
  validateHyperframesSfxPolicy({
    audioEvents,
    shotCount: Array.isArray(config.shots) ? config.shots.length : 0,
  });
  validateHyperframesSfxTriggerPolicy({
    audioEvents,
    shots: config.shots,
  });
  for (const event of audioEvents) {
    const assetRef = cleanText(event.assetRef);
    const eventEnd =
      Number(event.startSec ?? 0) + Number(event.durationSec ?? 0);
    if (
      Number.isFinite(finalDuration) &&
      finalDuration > 0 &&
      eventEnd > finalDuration + 0.5
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Audio/SFX event timing exceeds the final composite timeline.",
      });
    }
    if (
      validation.stagedAssetsRequired &&
      !validatedAssetRefs.has(assetRef) &&
      !validatedAssets.has(assetRef)
    ) {
      missingAssetRefs.add(assetRef);
    }
    if (
      validation.stagedAssetsRequired &&
      validation.allowSyntheticFallback === false &&
      !validatedAssets.has(assetRef)
    ) {
      missingAssetRefs.add(assetRef);
    }
  }
  validateHyperframesSfxShotBounds({
    audioEvents,
    shots: config.shots,
  });
  if (
    validation.stagedAssetsRequired &&
    missingAssetRefs.size > 0 &&
    validation.allowSyntheticFallback === false
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Final composite audio/SFX requires staged licensed assets with checksum metadata, or enable explicit synthetic fallback.",
    });
  }
}

function hyperframesAspectRatioForOutput(width: number, height: number): "9:16" | "16:9" | "1:1" | "4:5" {
  if (Math.abs(width - height) <= 2) return "1:1";
  const ratio = width / height;
  if (Math.abs(ratio - 16 / 9) < 0.05) return "16:9";
  if (Math.abs(ratio - 4 / 5) < 0.05) return "4:5";
  return "9:16";
}

function buildHyperframesFinalCompositeWorkerInput(input: {
  apiInput: CreateHyperframesFinalCompositeInput;
  payload: ReturnType<typeof buildHyperframesRenderJobPayload>;
}) {
  const config = HyperframesFinalCompositeConfigSchema.parse(input.apiInput.config);
  const timeline = normalizeHyperframesFinalCompositeTimeline(config);
  const timelineByShotId = new Map(timeline.entries.map(entry => [entry.shotId, entry]));
  const finalCompositeConfig =
    input.payload.finalCompositeConfig &&
    typeof input.payload.finalCompositeConfig === "object" &&
    !Array.isArray(input.payload.finalCompositeConfig)
      ? input.payload.finalCompositeConfig
      : {};
  const finalCompositeConfigHash = stableHash({
    compositionInputHash: input.payload.compositionInputHash,
    compositionHtmlHash: input.payload.compositionHtmlHash,
    creativePlanHash: input.payload.creativePlanHash,
    finalCompositeConfig,
  });

  return {
    renderIntent: "hyperframes_final_composite" as const,
    compositionHash: input.payload.compositionInputHash,
    timelineHash: timeline.timelineHash,
    finalCompositeConfigHash,
    templateVersion: input.payload.templateVersion,
    platformContractVersion: HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
    rendererPolicyVersion:
      input.payload.rendererPolicyVersion ??
      "official_html_css_browser_final_composite_v1",
    runtimeProfileId: input.payload.runtimeProfileHash,
    source: {
      storyboardReviewId: null,
      productId: input.apiInput.productId,
      manualProjectName: input.payload.productTitle ?? null,
      runId: input.apiInput.runId,
    },
    finalVideoLengthSec: timeline.durationSec,
    shots: config.shots.map(shot => {
      const timelineEntry = timelineByShotId.get(shot.id);
      return {
        shotId: shot.id,
        shotIndex: shot.index,
        absoluteStartSec: timelineEntry?.absoluteStartSec ?? shot.startSec,
        absoluteEndSec:
          timelineEntry?.absoluteEndSec ?? shot.startSec + shot.durationSec,
        durationSec: timelineEntry?.durationSec ?? shot.durationSec,
        mediaStartSec: timelineEntry?.mediaStartSec ?? shot.mediaStartSec ?? 0,
        overlayText: shot.onScreenText.join("\n") || null,
        subtitleText: shot.subtitleCues.map(cue => cue.text).join("\n") || null,
        stylePresetId: shot.overlayPreset,
        transitionPresetId: shot.transition,
        textMotionPresetId: shot.textMotionPreset,
      };
    }),
    assetManifest: {
      sourceVideos: timeline.entries.map(entry => ({
        shotId: entry.shotId,
        storageRef: entry.sourceMediaRef,
        mediaStartSec: entry.mediaStartSec,
        durationSec: entry.durationSec,
        contentType: "video/mp4",
        checksumSha256: entry.sourceMediaHash,
      })),
      audioRefs: config.audioEvents.map(event => ({
        role:
          event.role === "voiceover"
            ? ("voiceover" as const)
            : event.role === "music"
              ? ("music_bed" as const)
              : ("sfx" as const),
        storageRef: event.assetRef,
        checksumSha256: null,
      })),
      subtitleRefs: [],
      fontRefs: [
        {
          family: config.fontFamily,
          storageRef: null,
          required: true,
        },
      ],
      runtimeAssets: {
        compositionHtmlHash: input.payload.compositionHtmlHash,
        templateContentHash: input.payload.templateContentHash,
      },
    },
    outputRequirements: {
      format: "mp4" as const,
      aspectRatio: hyperframesAspectRatioForOutput(config.width, config.height),
      width: config.width,
      height: config.height,
      fps: config.fps,
      requireOfficialRuntime: true,
      rejectFallbackRender: true,
      requireCssBrowserRuntime: true,
      requireServerVerification: true,
      publishToLibrary: true,
    },
    renderConfig: {
      ...finalCompositeConfig,
      compositionHtml: input.payload.compositionHtml,
      platformPresetId: input.payload.platformPresetId,
      platformPresetVersion: input.payload.platformPresetVersion,
      creativePlanHash: input.payload.creativePlanHash,
      presetManifestHash: input.payload.presetManifestHash,
      audioEventMapHash: input.payload.audioEventMapHash,
      renderPayload: {
        productId: input.payload.productId,
        productTitle: input.payload.productTitle,
        compositionInputHash: input.payload.compositionInputHash,
        compositionHtmlHash: input.payload.compositionHtmlHash,
        templateId: input.payload.templateId,
        templateVersion: input.payload.templateVersion,
        templateContentHash: input.payload.templateContentHash,
        platformPresetId: input.payload.platformPresetId,
        platformPresetVersion: input.payload.platformPresetVersion,
        renderIntent: input.payload.renderIntent,
        compositionMode: input.payload.compositionMode,
        runtimeProfileHash: input.payload.runtimeProfileHash,
        launchMode: input.payload.launchMode,
        traceId: input.payload.traceId,
        correlationId: input.payload.correlationId,
        fps: input.payload.fps,
        quality: input.payload.quality,
        creativePlanHash: input.payload.creativePlanHash,
        presetManifestHash: input.payload.presetManifestHash,
        audioEventMapHash: input.payload.audioEventMapHash,
        overlayPresetId: input.payload.overlayPresetId,
        subtitlePresetId: input.payload.subtitlePresetId,
        audioPackPresetId: input.payload.audioPackPresetId,
        musicPresetId: input.payload.musicPresetId,
        sfxPresetIds: input.payload.sfxPresetIds,
        presetVersions: input.payload.presetVersions,
        rendererPolicyVersion: input.payload.rendererPolicyVersion,
      },
    },
  };
}

function buildHyperframesFinalCompositeWorkerIdempotencyKey(input: {
  tenantId: string;
  runId: string;
  payload: ReturnType<typeof buildHyperframesRenderJobPayload>;
  finalCompositeConfigHash: string;
}): string {
  return `hf_worker_final_${stableHash({
    tenantId: input.tenantId,
    runId: input.runId,
    renderIntent: input.payload.renderIntent,
    compositionInputHash: input.payload.compositionInputHash,
    templateVersion: input.payload.templateVersion,
    platformPresetId: input.payload.platformPresetId,
    runtimeProfileHash: input.payload.runtimeProfileHash,
    creativePlanHash: input.payload.creativePlanHash,
    finalCompositeConfigHash: input.finalCompositeConfigHash,
  })}`;
}

function buildAutoStoryboardProductReferenceAnchors(
  productBundle: unknown
): MarketplaceAutoReviewReferenceAnchorsInput | null {
  const bundle = isRecord(productBundle) ? productBundle : {};
  const images = Array.isArray(bundle.images) ? bundle.images : [];
  const image = images.find(item =>
    cleanText((item as Record<string, unknown>)?.url)
  );
  if (!isRecord(image)) return null;
  const url = cleanText(image.url);
  if (!url) return null;
  const id = cleanText(image.id);
  const hash = cleanText(image.sha256) || cleanText(image.hash);
  const ref = hash
    ? `product-image-sha256:${hash}`
    : id
      ? `marketplace-product-image:${id}`
      : `product-image-url:${url}`;
  return {
    schemaVersion: 1,
    creationIntent: "auto_review_video",
    requiredRoles: ["product"],
    lockPolicy: {
      mode: "auto_product_anchor_from_product_default",
      bindingPolicy:
        "system_selected_hero_or_first_product_image_is_primary_generation_truth",
      product: "preserve_exact_visible_product_identity",
      character: "not_required_for_auto_product_review",
      environment: "not_required_for_auto_product_review",
      auditMetadataRequired: true,
    },
    productImageUrl: url,
    productImageId: id || null,
    productImageRef: ref,
    productImageSource: cleanText(image.source) || "marketplace_product_image",
    productImageSourceUrl:
      cleanText(image.sourceUrl) || cleanText(image.originalSourceUrl) || null,
    productImageStorageKey:
      cleanText(image.storageKey) || cleanText(image.key) || null,
    productImageHash: hash || null,
    productImageIndex: 0,
    auditMetadata: {
      product: {
        id: id || null,
        source: cleanText(image.source) || "marketplace_product_image",
        referenceFormat: "single_product_image",
        selectedBy: "auto_storyboard_review_backend_fallback",
      },
    },
    fileEvidence: {
      productImage: {
        url,
        id: id || null,
        hash: hash || null,
        index: 0,
      },
    },
    sourceRefs: [
      ...(id ? [`product-image:${id}`] : []),
      ...(hash ? [`product-image-sha256:${hash}`] : []),
    ],
  };
}

function renderJobIdFromRunState(runState: unknown): string {
  const run = isRecord(runState) ? runState : {};
  const metadata = isRecord(run.metadataJson) ? run.metadataJson : {};
  const result = isRecord(run.resultJson) ? run.resultJson : {};
  const metadataPreview = isRecord(metadata.hyperframesAutoPreview)
    ? metadata.hyperframesAutoPreview
    : {};
  const resultPreview = isRecord(result.hyperframesAutoPreview)
    ? result.hyperframesAutoPreview
    : {};
  const resultRender = isRecord(result.render) ? result.render : {};
  return (
    cleanText(run.renderJobId) ||
    cleanText(metadataPreview.renderJobId) ||
    cleanText(resultPreview.renderJobId) ||
    cleanText(result.hyperframesRenderJobId) ||
    cleanText(resultRender.renderJobId)
  );
}

export function isHyperframesRunEligibleForPreview(runState: unknown): {
  eligible: boolean;
  reason: string;
} {
  const run = isRecord(runState) ? runState : {};
  const metadata = isRecord(run.metadataJson) ? run.metadataJson : {};
  const result = isRecord(run.resultJson) ? run.resultJson : {};
  const links = isRecord(run.links) ? run.links : {};
  const storyboardReviewId =
    cleanText(run.storyboardReviewId) ||
    cleanText(result.storyboardReviewId) ||
    cleanText(links.storyboardReview);
  const frameUrls = [
    ...stringList(metadata.storyboardFrameUrls),
    ...stringList(result.frameUrls),
    ...stringList(result.storyboardFrameUrls),
  ];
  const timeline = isRecord(run.timeline) ? run.timeline : {};
  const items = Array.isArray(timeline.items) ? timeline.items : [];
  const storyboardStageCompleted = items.some(item => {
    const record = isRecord(item) ? item : {};
    return (
      cleanText(record.stageKey) === "storyboard_review" &&
      ["completed", "completed_with_warnings", "skipped"].includes(
        cleanText(record.status)
      )
    );
  });
  if (storyboardReviewId || frameUrls.length > 0 || storyboardStageCompleted) {
    return { eligible: true, reason: "storyboard_ready" };
  }
  return {
    eligible: false,
    reason: "storyboard_review_not_ready",
  };
}

function unavailableRenderProjection(input: {
  auth: HyperframesAuthContext;
  productId: string;
  runId: string;
  renderJobId: string;
  status?: HyperframesRenderStatusProjection["status"];
  diagnostics?: string[];
}) {
  return buildHyperframesRenderProjection({
    tenantId: input.auth.tenantId ?? "default",
    productId: input.productId,
    runId: input.runId,
    renderJobId: input.renderJobId,
    status: input.status ?? "not_available",
    safeDiagnostics: input.diagnostics,
  });
}

function isLibraryVideoArtifact(ref: HyperframesArtifactRef): boolean {
  return (
    (ref.kind === "hyperframes_render_mp4" ||
      ref.kind === "hyperframes_render_webm") &&
    ref.retentionClass === "library"
  );
}

function findLibraryOutputPair(render: HyperframesRenderStatusProjection): {
  output: HyperframesRenderStatusProjection["outputRefs"][number];
  artifact: HyperframesArtifactRef;
} | null {
  const libraryOutputCandidates = render.outputRefs.filter(
    ref =>
      (ref.kind === "final_video" || ref.kind === "library_item") &&
      Boolean(ref.contentHash)
  );

  for (const output of libraryOutputCandidates) {
    const artifact = render.artifactRefs.find(
      ref =>
        ref.contentHash === output.contentHash && isLibraryVideoArtifact(ref)
    );
    if (artifact) {
      return { output, artifact };
    }
  }

  return null;
}

export function buildHyperframesFinalizeInputFromCompletedRender(input: {
  auth: HyperframesAuthContext;
  productId: string;
  runId: string;
  renderJobId: string;
  idempotencyKey: string;
  render: HyperframesRenderStatusProjection;
}) {
  const render = input.render;
  if (render.status !== "completed" && render.status !== "ready_for_review") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "HyperFrames render must be completed before saving to Library.",
    });
  }
  if (render.renderIntent === "preview" || render.renderIntent === "snapshot") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Preview-only HyperFrames outputs cannot be saved as durable Library videos.",
    });
  }
  const libraryOutput = findLibraryOutputPair(render);
  if (!libraryOutput?.output.contentHash) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "HyperFrames render output artifact is missing or not QA-ready.",
    });
  }
  const compositionInputHash = render.compositionInputHash;
  if (
    !compositionInputHash ||
    !render.compositionHtmlHash ||
    !render.templateId ||
    !render.templateVersion ||
    !render.templateContentHash ||
    !render.platformPresetId ||
    !render.platformPresetVersion ||
    !render.renderIntent ||
    !render.compositionMode ||
    !render.runtimeProfileHash
  ) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "HyperFrames render metadata is incomplete for Library finalization.",
    });
  }
  if (
    render.qaStatus !== "passed" &&
    render.qaStatus !== "passed_with_warnings"
  ) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "HyperFrames render QA must pass before saving to Library.",
    });
  }
  const expectedKey = buildHyperframesLibraryIdempotencyKey({
    tenantId: input.auth.tenantId ?? "default",
    runId: input.runId,
    renderIntent: render.renderIntent,
    compositionInputHash,
    outputHash: libraryOutput.artifact.contentHash,
  });
  if (input.idempotencyKey !== expectedKey) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "HyperFrames Library idempotency key does not match the completed output.",
    });
  }
  return {
    auth: input.auth,
    productId: input.productId,
    runId: input.runId,
    renderJobId: input.renderJobId,
    idempotencyKey: input.idempotencyKey,
    payload: {
      productId: input.productId,
      compositionInputHash,
      compositionHtmlHash: render.compositionHtmlHash,
      templateId: render.templateId,
      templateVersion: render.templateVersion,
      templateContentHash: render.templateContentHash,
      platformPresetId: render.platformPresetId,
      platformPresetVersion: render.platformPresetVersion,
      renderIntent: render.renderIntent,
      compositionMode: render.compositionMode,
      runtimeProfileHash: render.runtimeProfileHash,
      launchMode: "auto_storyboard_review" as const,
      traceId: `trace_${input.renderJobId}`,
      correlationId: `corr_${input.renderJobId}`,
      outputArtifactRef: libraryOutput.artifact,
      outputUrl: libraryOutput.output.url ?? null,
      thumbnailUrl: libraryOutput.output.thumbnailUrl ?? null,
      qaStatus: render.qaStatus,
    },
    outputArtifactRef: libraryOutput.artifact,
    outputUrl: libraryOutput.output.url ?? null,
    thumbnailUrl: libraryOutput.output.thumbnailUrl ?? null,
    qaStatus: render.qaStatus,
  };
}

export function buildHyperframesLibrarySaveChargeSummary(input: {
  created: boolean;
  idempotencyKey: string;
}): HyperframesChargeSummary {
  return {
    chargeRequired: false,
    quotaDecision: "no_charge",
    noChargeReason: input.created
      ? "not_billable"
      : "duplicate_library_finalize",
    idempotencyKey: input.idempotencyKey,
  };
}

export async function getAutoStoryboardReviewPlanForApi(input: {
  productId: string;
  auth: HyperframesAuthContext;
  includeTemplates?: boolean;
  overrides?: Record<string, unknown>;
}) {
  const plan = await getHyperframesAutoStoryboardReviewPlan({
    productId: input.productId,
    auth: input.auth,
    overrides: input.overrides,
  });
  return {
    contractVersion:
      HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION as typeof HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
    access: plan.access,
    plan,
    templates: input.includeTemplates
      ? listHyperframesTemplateRegistry({
          compositionMode: plan.defaults.compositionMode,
          renderIntent: plan.defaults.renderIntent,
        })
      : [],
  };
}

function hyperframesVideoSegmentPlannerShots(input: {
  shotCount: number;
  referenceImageUrl?: string | null;
}): VideoSegmentPlannerShot[] {
  const shotCount = Math.min(12, Math.max(1, Math.round(input.shotCount)));
  return Array.from({ length: shotCount }, (_, index) => ({
    shotId: `auto-shot-${index + 1}`,
    index,
    title: `Auto review shot ${index + 1}`,
    durationSeconds: 5,
    storyboardFrameUrl: cleanText(input.referenceImageUrl) || undefined,
  }));
}

function normalizeVideoSegmentPreviewWarning(warning: {
  code: string;
  message: string;
  severity?: "info" | "warning" | "error";
  source?: string;
  segmentId?: string;
  shotIds?: string[];
}): VideoSegmentPlanWarning {
  return {
    code: warning.code,
    message: warning.message,
    severity: warning.severity ?? "warning",
    source: warning.source === "fallback" ? "fallback" : "planner",
    segmentId: warning.segmentId,
    shotIds: warning.shotIds,
  };
}

export async function getVideoSegmentPlanPreviewForApi(input: {
  productId: string;
  auth: HyperframesAuthContext;
  overrides?: GetVideoSegmentPlanPreviewInput["overrides"];
  transportMetadata?: GetVideoSegmentPlanPreviewInput["transportMetadata"];
  referenceAnchors?: GetVideoSegmentPlanPreviewInput["referenceAnchors"];
}): Promise<GetVideoSegmentPlanPreviewOutput> {
  const plan = await getHyperframesAutoStoryboardReviewPlan({
    productId: input.productId,
    auth: input.auth,
    overrides: input.overrides,
  });
  const transport: VideoSegmentTransport =
    input.transportMetadata?.transport === "mcp" ? "mcp" : "gateway_api";
  const audioStrategy = plan.defaults
    .audioStrategy as VideoSegmentAudioStrategy;
  const referenceImageUrl =
    cleanText(input.referenceAnchors?.productImageUrl) || null;
  const videoSegmentPlan = planVideoSegments({
    sourceSurface: "marketplace_capture",
    mode: plan.defaults.videoStructureMode,
    manualGroupSize: plan.defaults.manualVideoGroupSize,
    videoModelId: plan.defaults.videoModel,
    transport,
    audioStrategy,
    referenceMode: "single_storyboard_frame",
    creativeBrief: normalizeVideoSegmentCreativeBrief(
      plan.defaults.creativeBrief
    ),
    creativePresets: input.referenceAnchors?.creativePresets ?? [],
    shots: hyperframesVideoSegmentPlannerShots({
      shotCount: plan.defaults.shotCount,
      referenceImageUrl,
    }),
    capability: resolveVideoModelSegmentCapability({
      modelId: plan.defaults.videoModel,
      transport,
    }),
  });
  const warnings = videoSegmentPlan.warnings.map(
    normalizeVideoSegmentPreviewWarning
  );
  if (!plan.canStart) {
    warnings.push({
      code: "auto_storyboard_not_available",
      message: plan.primaryAction.label,
      severity: "warning",
      source: "access",
    });
  }
  const isPerShot = videoSegmentPlan.effectiveMode === "per_shot";
  return {
    contractVersion:
      HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION as typeof HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
    videoSegmentPlan,
    accessDecision: {
      allowed: plan.canStart,
      reasonCode: plan.canStart ? undefined : plan.primaryAction.actionId,
      message: plan.canStart ? undefined : plan.primaryAction.label,
      transport,
      mcpConnectionId:
        cleanText(input.transportMetadata?.mcpConnectionId) ||
        cleanText(input.transportMetadata?.connectionId) ||
        undefined,
      sharedGroupId: input.transportMetadata?.sharedGroupId,
    },
    creditEstimate: {
      mode: isPerShot ? "per_shot" : "segment_duration",
      estimatedCredits: videoSegmentPlan.segments.length,
      basis: isPerShot ? "jobs" : "segments",
      creditSource:
        transport === "mcp" ? "mcp_provider_account" : "gateway_api",
      notes: [
        "Estimate counts planned video segment submissions before provider-specific adjustments.",
      ],
    },
    warnings,
    fallbackReason: videoSegmentPlan.fallbackReason,
  };
}

function toMarketplaceAutoReviewQualityMode(
  qualityMode: "fast" | "balanced" | "high"
): "fast_draft" | "balanced" | "premium_strict_qa" {
  if (qualityMode === "fast") return "fast_draft";
  if (qualityMode === "high") return "premium_strict_qa";
  return "balanced";
}

async function buildStartAutoStoryboardReviewResumeResponse(input: {
  productId: string;
  auth: HyperframesAuthContext;
  plan: Awaited<ReturnType<typeof getHyperframesAutoStoryboardReviewPlan>>;
  runtime?: Record<string, unknown>;
}) {
  const activeRunId = cleanText(input.plan.activeRunId);
  if (!activeRunId) return null;
  queueMarketplaceAutoReviewAdvance(
    activeRunId,
    input.auth,
    input.runtime ?? {},
    500
  );
  const activeRun = await getMarketplaceAutoReviewRun(activeRunId, input.auth);
  const activeRunRecord = (activeRun ?? {}) as Record<string, unknown>;
  const activeRunProductId = cleanText(activeRunRecord.productId);
  if (activeRunProductId && activeRunProductId !== input.productId) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Auto review run was not found for this product.",
    });
  }
  const renderJobId = renderJobIdFromRunState(activeRunRecord);
  const render = renderJobId
    ? redactHyperframesRenderProjectionForUser(
        await getHyperframesRenderProjection({
          auth: input.auth,
          productId: input.productId,
          runId: activeRunId,
          renderJobId,
        })
      )
    : null;
  return {
    contractVersion:
      HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION as typeof HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
    launchMode: "auto_storyboard_review" as const,
    plan: input.plan,
    run: activeRunRecord,
    render,
    chargeSummary: {
      chargeRequired: false,
      quotaDecision: input.plan.quotaDecision,
      noChargeReason: "not_applicable" as const,
    },
    polling:
      render?.polling ??
      createDefaultHyperframesPollingGuidance("not_available"),
    invalidates: INVALIDATES,
  };
}

export async function startAutoStoryboardReviewForApi(input: {
  productId: string;
  auth: HyperframesAuthContext;
  expectedPlanHash?: string;
  idempotencyKey?: string;
  overrides?: Record<string, unknown>;
  transportMetadata?: Record<string, unknown> | null;
  referenceAnchors?: MarketplaceAutoReviewReferenceAnchorsInput | null;
  runtime?: Record<string, unknown>;
}) {
  const plan = await getHyperframesAutoStoryboardReviewPlan({
    productId: input.productId,
    auth: input.auth,
    overrides: input.overrides,
  });
  if (input.expectedPlanHash && input.expectedPlanHash !== plan.planHash) {
    const resumeResponse =
      plan.primaryAction.actionId === "resume_auto_storyboard_review"
        ? await buildStartAutoStoryboardReviewResumeResponse({
            productId: input.productId,
            auth: input.auth,
            plan,
            runtime: input.runtime,
          })
        : null;
    if (resumeResponse) return resumeResponse;
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Auto Storyboard Review plan is stale. Refresh the plan and try again.",
    });
  }
  if (
    plan.primaryAction.actionId === "resume_auto_storyboard_review" &&
    plan.activeRunId
  ) {
    const resumeResponse = await buildStartAutoStoryboardReviewResumeResponse({
      productId: input.productId,
      auth: input.auth,
      plan,
      runtime: input.runtime,
    });
    if (resumeResponse) return resumeResponse;
  }
  if (!plan.canStart) {
    return {
      contractVersion:
        HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION as typeof HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
      launchMode: "auto_storyboard_review" as const,
      plan,
      run: null,
      render: null,
      chargeSummary: {
        chargeRequired: false,
        quotaDecision: plan.quotaDecision,
        noChargeReason: "feature_disabled" as const,
      },
      polling: createDefaultHyperframesPollingGuidance("not_available"),
      invalidates: [],
    };
  }
  const productBundle = await getMarketplaceProductWithAccess(
    input.productId,
    input.auth
  );
  const referenceAnchors =
    input.referenceAnchors ??
    buildAutoStoryboardProductReferenceAnchors(productBundle);
  const run = await startMarketplaceAutoReviewRun(
    {
      productId: input.productId,
      idempotencyKey: input.idempotencyKey,
      creationIntent: "auto_review_video",
      outputMode: plan.defaults.outputMode,
      frameStrategy: plan.defaults.frameStrategy,
      audioStrategy: plan.defaults.audioStrategy,
      shotCount: plan.defaults.shotCount,
      overlayTextMode: plan.defaults.overlayTextMode,
      imageModel: plan.defaults.imageModel,
      videoModel: plan.defaults.videoModel,
      videoStructureMode: plan.defaults.videoStructureMode,
      manualVideoGroupSize: plan.defaults.manualVideoGroupSize,
      speechLanguage: plan.defaults.speechLanguage,
      creativeBrief: plan.defaults.creativeBrief,
      qualityMode: toMarketplaceAutoReviewQualityMode(
        plan.defaults.qualityMode
      ),
      referenceAnchors,
      transportMetadata: input.transportMetadata,
    },
    input.auth,
    input.runtime ?? {}
  );
  const runRecord = (run ?? {}) as Record<string, unknown>;
  const runId = String(runRecord.id ?? "");
  const eligibility = isHyperframesRunEligibleForPreview(runRecord);
  if (!eligibility.eligible) {
    return {
      contractVersion:
        HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION as typeof HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
      launchMode: "auto_storyboard_review" as const,
      plan,
      run: runRecord,
      render: null,
      chargeSummary: {
        chargeRequired: false,
        creditEstimate: plan.creditEstimate ?? undefined,
        quotaDecision: plan.quotaDecision,
        noChargeReason: "not_applicable" as const,
        idempotencyKey: plan.creditEstimate?.idempotencyKey,
      },
      polling: createDefaultHyperframesPollingGuidance("not_available"),
      invalidates: INVALIDATES,
    };
  }
  const composition = buildHyperframesCompositionInput({
    tenantId: input.auth.tenantId ?? "default",
    userId: input.auth.userId,
    productId: input.productId,
    runId,
    productState: productBundle,
    runState: runRecord,
  });
  const render = await queueHyperframesRenderJob({
    auth: input.auth,
    composition,
  });
  return {
    contractVersion:
      HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION as typeof HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
    launchMode: "auto_storyboard_review" as const,
    plan,
    run: runRecord,
    render,
    chargeSummary: {
      chargeRequired: false,
      creditEstimate: plan.creditEstimate ?? undefined,
      quotaDecision: plan.quotaDecision,
      noChargeReason: "preview_only" as const,
      idempotencyKey: plan.creditEstimate?.idempotencyKey,
    },
    polling: render.polling,
    invalidates: INVALIDATES,
  };
}

export async function createHyperframesPreviewForApi(input: {
  productId: string;
  runId: string;
  auth: HyperframesAuthContext;
  expectedCompositionInputHash?: string;
}) {
  const access = await resolveHyperframesFeatureAccessForTenant({
    auth: input.auth,
    productId: input.productId,
    runId: input.runId,
  });
  if (!access.capabilities.canPreview) {
    const render = buildHyperframesRenderProjection({
      tenantId: input.auth.tenantId ?? "default",
      productId: input.productId,
      runId: input.runId,
      renderJobId: `hf_unavailable_${input.runId}`,
      status: "not_available",
    });
    return {
      contractVersion:
        HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION as typeof HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
      render,
      chargeSummary: {
        chargeRequired: false,
        quotaDecision: access.creditAndQuota.quotaDecision,
        noChargeReason: "feature_disabled" as const,
      },
      polling: render.polling,
      invalidates: [],
    };
  }
  const [productBundle, runRecord] = await Promise.all([
    getMarketplaceProductWithAccess(input.productId, input.auth),
    getMarketplaceAutoReviewRun(input.runId, input.auth),
  ]);
  const runProductId = cleanText(
    (runRecord as Record<string, unknown>).productId
  );
  if (runProductId && runProductId !== input.productId) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Auto review run was not found for this product.",
    });
  }
  const eligibility = isHyperframesRunEligibleForPreview(runRecord);
  if (!eligibility.eligible) {
    const render = unavailableRenderProjection({
      auth: input.auth,
      productId: input.productId,
      runId: input.runId,
      renderJobId: `hf_pending_${input.runId}`,
      status: "blocked_needs_user",
      diagnostics: [
        "Storyboard Review output is not ready yet; HyperFrames preview will queue after storyboard evidence exists.",
      ],
    });
    return {
      contractVersion:
        HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION as typeof HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
      render,
      chargeSummary: {
        chargeRequired: false,
        quotaDecision: "no_charge" as const,
        noChargeReason: "not_applicable" as const,
      },
      polling: render.polling,
      invalidates: [],
    };
  }
  const composition = buildHyperframesCompositionInput({
    tenantId: input.auth.tenantId ?? "default",
    userId: input.auth.userId,
    productId: input.productId,
    runId: input.runId,
    productState: productBundle,
    runState: runRecord,
  });
  if (
    input.expectedCompositionInputHash &&
    input.expectedCompositionInputHash !==
      composition.provenance.compositionInputHash
  ) {
    const render = buildHyperframesRenderProjection({
      tenantId: input.auth.tenantId ?? "default",
      productId: input.productId,
      runId: input.runId,
      renderJobId: `hf_stale_${input.runId}`,
      status: "stale_input_hash",
      payload: buildHyperframesRenderJobPayload({ composition }),
    });
    return {
      contractVersion:
        HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION as typeof HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
      render,
      chargeSummary: {
        chargeRequired: false,
        quotaDecision: "no_charge" as const,
        noChargeReason: "not_applicable" as const,
      },
      polling: render.polling,
      invalidates: [],
    };
  }
  const render = await queueHyperframesRenderJob({
    auth: input.auth,
    composition,
  });
  return {
    contractVersion:
      HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION as typeof HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
    render,
    chargeSummary: {
      chargeRequired: false,
      creditEstimate: buildHyperframesCreditEstimate({
        tenantId: input.auth.tenantId ?? "default",
        userId: input.auth.userId,
        runId: input.runId,
        renderIntent: "preview",
        compositionMode: "storyboard_motion_preview",
        costClass: "composition_preview",
        compositionInputHash: composition.provenance.compositionInputHash,
        templateVersion: composition.template.templateVersion,
      }),
      quotaDecision: "free_preview_allowed" as const,
      noChargeReason: "preview_only" as const,
    },
    polling: render.polling,
    invalidates: INVALIDATES,
  };
}

export async function createHyperframesFinalCompositeForApi(
  input: CreateHyperframesFinalCompositeInput & {
    auth: HyperframesAuthContext;
  }
) {
  const access = await resolveHyperframesFeatureAccessForTenant({
    auth: input.auth,
    productId: input.productId,
    runId: input.runId,
  });
  if (!access.capabilities.canStartAuto) {
    const render = buildHyperframesRenderProjection({
      tenantId: input.auth.tenantId ?? "default",
      productId: input.productId,
      runId: input.runId,
      renderJobId: `hf_final_unavailable_${input.runId}`,
      status: "not_available",
      safeDiagnostics: [
        "HyperFrames final composite is unavailable for this tenant or run.",
      ],
    });
    return {
      contractVersion:
        HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION as typeof HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
      render,
      chargeSummary: {
        chargeRequired: false,
        quotaDecision: access.creditAndQuota.quotaDecision,
        noChargeReason: "feature_disabled" as const,
      },
      polling: render.polling,
      invalidates: [],
    };
  }
  const sourceVideos = input.config.shots
    .map(shot => cleanText(shot.sourceVideoUrl))
    .filter(Boolean);
  if (sourceVideos.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Final composite requires at least one Storyboard Review MP4 source.",
    });
  }
  validateHyperframesFinalCompositeAudioAssets(input.config);
  const runRecord = await getMarketplaceAutoReviewRunOrManualFallback({
    productId: input.productId,
    runId: input.runId,
    auth: input.auth,
  });
  const productBundle = await getHyperframesFinalCompositeProductState({
    productId: input.productId,
    runId: input.runId,
    auth: input.auth,
    runState: runRecord,
    config: input.config,
  });
  const runProductId = cleanText(
    (runRecord as Record<string, unknown>).productId
  );
  if (runProductId && runProductId !== input.productId) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Auto review run was not found for this product.",
    });
  }
  let composition: ReturnType<
    typeof buildHyperframesFinalCompositeCompositionInput
  >;
  try {
    composition = buildHyperframesFinalCompositeCompositionInput({
      tenantId: input.auth.tenantId ?? "default",
      userId: input.auth.userId,
      productId: input.productId,
      runId: input.runId,
      productState: productBundle,
      runState: runRecord,
      finalComposite: input.config,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/HyperFrames (stale|invalid) timeline/i.test(message)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message,
      });
    }
    throw error;
  }
  if (
    input.expectedCompositionInputHash &&
    input.expectedCompositionInputHash !==
      composition.provenance.compositionInputHash
  ) {
    const render = buildHyperframesRenderProjection({
      tenantId: input.auth.tenantId ?? "default",
      productId: input.productId,
      runId: input.runId,
      renderJobId: `hf_final_stale_${input.runId}`,
      status: "stale_input_hash",
      payload: buildHyperframesRenderJobPayload({ composition }),
    });
    return {
      contractVersion:
        HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION as typeof HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
      render,
      chargeSummary: {
        chargeRequired: false,
        quotaDecision: "no_charge" as const,
        noChargeReason: "not_applicable" as const,
      },
      polling: render.polling,
      invalidates: [],
    };
  }
  const runtimeBlockReason = getHyperframesFinalCompositeRuntimeBlockReason();
  const payload = buildHyperframesRenderJobPayload({ composition });
  const tenantFlags = await getTenantFeatureFlags(input.auth.tenantId ?? "default");
  if (tenantFlags.hyperframesWorkerFinalComposite === true) {
    const workerInput = buildHyperframesFinalCompositeWorkerInput({
      apiInput: input,
      payload,
    });
    const creditEstimate = buildHyperframesCreditEstimate({
      tenantId: input.auth.tenantId ?? "default",
      userId: input.auth.userId,
      runId: input.runId,
      renderIntent: "final",
      compositionMode: "captioned_final_composite",
      costClass: "composition_render",
      compositionInputHash: composition.provenance.compositionInputHash,
      templateVersion: composition.template.templateVersion,
      platformPreset: {
        ...composition.platformPreset,
        durationSeconds: workerInput.finalVideoLengthSec,
        maxDurationSeconds: workerInput.finalVideoLengthSec,
      },
      workerComplexityMultiplier: Math.max(1, input.config.shots.length / 6),
    });
    try {
      const queued = await queueDesktopHyperframesFinalCompositeJob({
        ...workerInput,
        tenantId: input.auth.tenantId ?? "default",
        teamId: null,
        workflowRunId: input.runId,
        requestedByUserId: input.auth.userId,
        requestedBySystemComponent: "hyperframes_final_composite_api",
        priority: 82,
        timeoutSeconds: 7200,
        idempotencyKey: buildHyperframesFinalCompositeWorkerIdempotencyKey({
          tenantId: input.auth.tenantId ?? "default",
          runId: input.runId,
          payload,
          finalCompositeConfigHash: workerInput.finalCompositeConfigHash,
        }),
        reservedCredits: creditEstimate.estimatedCredits,
      });
      const render = buildHyperframesRenderProjection({
        tenantId: input.auth.tenantId ?? "default",
        productId: input.productId,
        runId: input.runId,
        renderJobId: String(queued.job.id),
        status: "queued",
        payload,
        safeMessage: queued.created
          ? "ส่งงาน Final Composite เข้า Smart AI Hub Worker App แล้ว กำลังรอ worker รับงาน"
          : "พบงาน Final Composite ชุดเดียวกันในคิวแล้ว ระบบจะติดตามงานเดิมต่อ",
        safeDiagnostics: [
          queued.created
            ? "Queued as worker_jobs.hyperframes_final_composite; no server render was started."
            : "Reused existing worker job with the same composition/config hash.",
        ],
        canMutate: true,
      });
      return {
        contractVersion:
          HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION as typeof HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
        render,
        chargeSummary: {
          chargeRequired: true,
          creditEstimate,
          quotaDecision: access.creditAndQuota.quotaDecision,
        },
        polling: render.polling,
        invalidates: INVALIDATES,
      };
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (Reflect.get(error, "code") === "feature_disabled" ||
          Reflect.get(error, "code") === "dispatch_disabled")
      ) {
        const render = buildHyperframesRenderProjection({
          tenantId: input.auth.tenantId ?? "default",
          productId: input.productId,
          runId: input.runId,
          renderJobId: `hf_final_worker_blocked_${input.runId}`,
          status: "blocked_needs_user",
          payload,
          safeMessage:
            "ยังไม่ได้เปิด Smart AI Hub Worker App สำหรับ Final Composite จึงไม่สามารถ render งานคุณภาพจริงได้",
          safeDiagnostics: [
            error instanceof Error ? error.message : "Worker dispatch is not enabled.",
            "Enable desktopZeroClawWorker and hyperframesWorkerFinalComposite for this tenant, then render again.",
          ],
          permissions: {
            canCancel: false,
            canRepair: false,
          },
          canMutate: false,
        });
        return {
          contractVersion:
            HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION as typeof HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
          render,
          chargeSummary: {
            chargeRequired: false,
            quotaDecision: "no_charge" as const,
            noChargeReason: "not_applicable" as const,
          },
          polling: render.polling,
          invalidates: [],
        };
      }
      throw error;
    }
  }
  const finalCompositeConfig =
    payload.finalCompositeConfig &&
    typeof payload.finalCompositeConfig === "object" &&
    !Array.isArray(payload.finalCompositeConfig)
      ? (payload.finalCompositeConfig as Record<string, unknown>)
      : {};
  const fallbackCapability =
    finalCompositeConfig.fallbackCapability &&
    typeof finalCompositeConfig.fallbackCapability === "object" &&
    !Array.isArray(finalCompositeConfig.fallbackCapability)
      ? (finalCompositeConfig.fallbackCapability as Record<string, unknown>)
      : {};
  const allowFfmpegAssFallback = fallbackCapability.ffmpegAssFallback === true;
  if (runtimeBlockReason && !allowFfmpegAssFallback) {
    const render = buildHyperframesRenderProjection({
      tenantId: input.auth.tenantId ?? "default",
      productId: input.productId,
      runId: input.runId,
      renderJobId: `hf_final_runtime_blocked_${input.runId}`,
      status: "blocked_needs_user",
      payload,
      safeMessage:
        "Final Composite ต้องใช้ official HyperFrames HTML/CSS/browser runtime เท่านั้น ระบบปิด ASS fallback แล้วเพื่อให้ผลลัพธ์ตรงกับ preview",
      safeDiagnostics: [
        runtimeBlockReason,
        "No render job was queued and no credits were reserved. Configure the official HyperFrames CSS/browser runtime, then render again.",
      ],
      permissions: {
        canCancel: false,
        canRepair: false,
      },
      canMutate: false,
    });
    return {
      contractVersion:
        HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION as typeof HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
      render,
      chargeSummary: {
        chargeRequired: false,
        quotaDecision: "no_charge" as const,
        noChargeReason: "not_applicable" as const,
      },
      polling: render.polling,
      invalidates: [],
    };
  }
  const render = await queueHyperframesRenderJob({
    auth: input.auth,
    composition,
    priority: 82,
    maxAttempts: 3,
  });
  void dispatchHyperframesFinalCompositeWorker({
    renderJobId: render.renderJobId,
  });
  return {
    contractVersion:
      HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION as typeof HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
    render,
    chargeSummary: {
      chargeRequired: true,
      creditEstimate: buildHyperframesCreditEstimate({
        tenantId: input.auth.tenantId ?? "default",
        userId: input.auth.userId,
        runId: input.runId,
        renderIntent: "final",
        compositionMode: "captioned_final_composite",
        costClass: "composition_render",
        compositionInputHash: composition.provenance.compositionInputHash,
        templateVersion: composition.template.templateVersion,
        platformPreset: composition.platformPreset,
        workerComplexityMultiplier: Math.max(1, input.config.shots.length / 6),
      }),
      quotaDecision: "allowed" as const,
      noChargeReason: null,
    },
    polling: render.polling,
    invalidates: INVALIDATES,
  };
}

export async function getHyperframesRenderJobForApi(input: {
  auth: HyperframesAuthContext;
  renderJobId?: string;
  productId?: string;
  runId?: string;
}) {
  const render = await getHyperframesRenderProjection(input);
  const publicRender = redactHyperframesRenderProjectionForUser(render);
  return {
    contractVersion:
      HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION as typeof HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
    render: publicRender,
    polling: publicRender.polling,
    notModified: false,
  };
}

export async function repairHyperframesRenderJobForApi(input: {
  auth: HyperframesAuthContext;
  renderJobId: string;
  productId: string;
  runId: string;
  actionId: string;
  actionType:
    | "regenerate_from_current_plan"
    | "recreate_snapshot"
    | "retry_worker_step"
    | "rerun_layout_inspect"
    | "cancel_render"
    | "open_standard_order";
  expectedCompositionInputHash?: string;
}): Promise<RepairHyperframesRenderJobOutput> {
  const current = await getHyperframesRenderProjection(input);
  if (!current.permissions.canRepair) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to repair this HyperFrames render.",
    });
  }
  const action = current.repairActions.find(
    item =>
      item.actionId === input.actionId && item.actionType === input.actionType
  );
  if (!action) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "HyperFrames repair action is no longer available. Refresh status and try again.",
    });
  }
  if (action.requiresOperator) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This HyperFrames repair action requires operator support.",
    });
  }
  if (action.disabledReason) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: action.disabledReason,
    });
  }

  if (action.actionType === "retry_worker_step") {
    if (
      input.expectedCompositionInputHash &&
      current.compositionInputHash &&
      input.expectedCompositionInputHash !== current.compositionInputHash
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "HyperFrames render input changed. Refresh status before retrying this worker step.",
      });
    }
    const repaired = await retryHyperframesRenderJob(input);
    const publicRender = redactHyperframesRenderProjectionForUser(repaired);
    return RepairHyperframesRenderJobOutputSchema.parse({
      contractVersion:
        HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION as typeof HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
      render: publicRender,
      polling: publicRender.polling,
      invalidates: INVALIDATES,
    });
  }

  if (action.actionType === "regenerate_from_current_plan") {
    return RepairHyperframesRenderJobOutputSchema.parse(
      await createHyperframesPreviewForApi({
        productId: input.productId,
        runId: input.runId,
        auth: input.auth,
      })
    );
  }

  throw new TRPCError({
    code: "BAD_REQUEST",
    message:
      "This HyperFrames repair action is not supported for self-service repair yet.",
  });
}

export async function listHyperframesTemplatesForApi(input: {
  auth: HyperframesAuthContext;
  includeDisabled?: boolean;
  compositionMode?: MarketplaceAutoReviewCompositionMode;
  renderIntent?: HyperframesRenderIntent;
}) {
  const access = await resolveHyperframesFeatureAccessForTenant({
    auth: input.auth,
  });
  return {
    contractVersion:
      HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION as typeof HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
    access,
    templates: listHyperframesTemplateRegistry({
      includeDisabled: input.includeDisabled,
      compositionMode: input.compositionMode,
      renderIntent: input.renderIntent,
      allowlist: access.flags.templateAllowlist,
    }),
  };
}

export async function listHyperframesCreativePresetsForApi(
  input: ListHyperframesCreativePresetsInput & {
    auth: HyperframesAuthContext;
  }
) {
  const access = await resolveHyperframesFeatureAccessForTenant({
    auth: input.auth,
  });
  const producerRuntimeReady = isHyperframesProducerRuntimeAllowed();
  const cliRuntimeReady = isHyperframesCliRuntimeAllowed();
  const officialCliReady =
    access.flags.workerEnabled &&
    access.capabilities.canStartAuto &&
    (cliRuntimeReady || producerRuntimeReady);
  const hyperframesProducer = officialCliReady && producerRuntimeReady;
  const officialRuntimeMode:
    | "official_runtime_blocked"
    | "official_cli_ready"
    | "official_producer_ready" = officialCliReady
    ? hyperframesProducer
      ? "official_producer_ready"
      : "official_cli_ready"
    : "official_runtime_blocked";
  const runtimeCapabilities = {
    diagnosticFallbackOnly: !officialCliReady,
    hyperframesCli: officialCliReady,
    hyperframesProducer,
    runtimeMode: officialRuntimeMode,
    minRuntimeProfile: "feature_120_runtime_v1",
    testedRuntimeProfileHash: "hf_runtime_feature_120_v1",
    minHyperframesVersion: "0.6.95",
    testedHyperframesVersion: "0.6.95",
    ffmpegAssFallback: false,
    smokeRenderer: false,
  };
  const presets = listHyperframesCreativePresets({
    includeDisabled: input.includeDisabled,
    includeCandidate: input.includeCandidate,
    category: input.category,
  }).filter(preset => {
    const requiresOfficialRuntime =
      preset.capabilityState === "producer_ready" ||
      preset.capabilityState === "official_cli_ready" ||
      preset.capabilityState === "official_producer_ready" ||
      preset.runtimeSupport.hyperframesCli ||
      preset.runtimeSupport.hyperframesProducer;
    return (
      !requiresOfficialRuntime || officialCliReady || input.includeDisabled
    );
  });
  const presetAvailability = presets.reduce<
    Record<
      string,
      {
        selectable: boolean;
        reason: string | null;
        fallbackMode:
          | "official_producer"
          | "official_cli"
          | "diagnostic_only"
          | "not_available";
      }
    >
  >((availability, preset: HyperframesCreativePreset) => {
    const producerOnly =
      preset.capabilityState === "producer_ready" ||
      preset.capabilityState === "official_producer_ready" ||
      preset.runtimeSupport.hyperframesProducer;
    const officialRuntimeRequired =
      producerOnly ||
      preset.capabilityState === "official_cli_ready" ||
      preset.runtimeSupport.hyperframesCli;
    const diagnosticOnly =
      preset.capabilityState === "fallback_only" ||
      preset.capabilityState === "diagnostic_fallback_only" ||
      preset.runtimeSupport.diagnosticFallbackOnly ||
      preset.runtimeSupport.ffmpegAssFallback;
    const selectable =
      access.capabilities.canAccessAuto &&
      (producerOnly
        ? hyperframesProducer
        : officialRuntimeRequired
          ? officialCliReady
          : false);
    availability[preset.id] = {
      selectable,
      reason: selectable
        ? null
        : officialRuntimeRequired
          ? "Official HyperFrames runtime is not ready for this tenant."
          : diagnosticOnly
            ? "Diagnostic fallback cannot complete user-facing renders."
            : "This preset is not available in the current runtime profile.",
      fallbackMode: producerOnly
        ? hyperframesProducer
          ? "official_producer"
          : "not_available"
        : officialRuntimeRequired
          ? officialCliReady
            ? "official_cli"
            : "not_available"
          : diagnosticOnly
            ? "diagnostic_only"
            : "not_available",
    };
    return availability;
  }, {});
  return {
    contractVersion:
      HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION as typeof HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
    access,
    presets,
    aliases: HYPERFRAMES_CREATIVE_PRESET_ALIASES,
    creativeCapabilities: {
      canUseProducerPresets: hyperframesProducer,
      canUseFallbackPresets: false,
      canUseOfficialCliPresets: officialCliReady,
      canUseAudioPacks: officialCliReady,
      canUseSfx: officialCliReady,
    },
    runtimeCapabilities,
    presetAvailability,
  };
}

export async function cancelHyperframesRenderJobForApi(input: {
  auth: HyperframesAuthContext;
  renderJobId: string;
  productId?: string;
  runId?: string;
}) {
  const current = await getHyperframesRenderProjection(input);
  if (!current.permissions.canCancel) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to cancel this HyperFrames render.",
    });
  }
  const render = await cancelHyperframesRenderJob(input);
  const publicRender = redactHyperframesRenderProjectionForUser(render);
  return {
    contractVersion:
      HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION as typeof HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
    render: publicRender,
    polling: publicRender.polling,
  };
}

export async function saveHyperframesRenderToLibraryForApi(input: {
  auth: HyperframesAuthContext;
  productId: string;
  runId: string;
  renderJobId: string;
  idempotencyKey: string;
}) {
  const access = await resolveHyperframesFeatureAccessForTenant({
    auth: input.auth,
    productId: input.productId,
    runId: input.runId,
    canSaveToLibrary: true,
  });
  if (!access.capabilities.canSaveToLibrary) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "HyperFrames Library save is not available for this tenant.",
    });
  }
  const renderJob = await getHyperframesRenderProjection(input);
  const finalizeInput = buildHyperframesFinalizeInputFromCompletedRender({
    auth: input.auth,
    productId: input.productId,
    runId: input.runId,
    renderJobId: input.renderJobId,
    idempotencyKey: input.idempotencyKey,
    render: renderJob,
  });
  const finalized = await finalizeHyperframesRenderToLibrary(finalizeInput);
  const publicRender = redactHyperframesRenderProjectionForUser(
    finalized.render
  );
  return {
    contractVersion:
      HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION as typeof HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
    created: finalized.created,
    libraryItem: finalized.libraryItem,
    render: publicRender,
    chargeSummary: buildHyperframesLibrarySaveChargeSummary({
      created: finalized.created,
      idempotencyKey: finalized.metadata.idempotencyKey,
    }),
    polling: publicRender.polling,
    invalidates: INVALIDATES,
  };
}
