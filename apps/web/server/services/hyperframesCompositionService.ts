import {
  HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
  HyperframesCompositionInputSchema,
  stableHash,
  type HyperframesCompositionAsset,
  type HyperframesCompositionInput,
  type HyperframesPlatformPresetId,
  type HyperframesRenderIntent,
  type MarketplaceAutoReviewCompositionMode,
} from "@shared/hyperframes/contracts";
import { getHyperframesPlatformPreset } from "@shared/hyperframes/templates";
import {
  sanitizeHyperframesAssetRef,
  sanitizeHyperframesRecordText,
  sanitizeHyperframesText,
} from "./hyperframesCompositionSanitizer";
import { selectHyperframesTemplate } from "./hyperframesTemplateRegistry";
import {
  HyperframesFinalCompositeConfigSchema,
  type HyperframesFinalCompositeConfig,
} from "@shared/hyperframes/runtimeApiSchemas";
import { HYPERFRAMES_FINAL_RENDER_PROMPT_MAX_CHARS } from "@shared/hyperframes/limits";

const HYPERFRAMES_FINAL_COMPOSITE_BUILDER_VERSION =
  "hyperframes_final_composite_builder_v17";

export interface HyperframesCreativeTimelineEntry {
  shotId: string;
  shotIndex: number;
  absoluteStartSec: number;
  absoluteEndSec: number;
  durationSec: number;
  mediaStartSec: number;
  sourceMediaRef: string;
  sourceMediaHash: string;
  timelineHash: string;
  timelineVersion: 1;
}

export interface HyperframesCreativeTimeline {
  timelineVersion: 1;
  timelineHash: string;
  durationSec: number;
  entries: HyperframesCreativeTimelineEntry[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function arrayFrom(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function cleanId(value: unknown, fallback: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cssString(value: unknown): string {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function isHyperframesVideoPromptLikeText(value: unknown): boolean {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return false;
  return (
    /^Create a\s+\d+(?:\.\d+)?-second\s+cinematic\s+vid/i.test(text) ||
    /\bUse\s+@Image\d+\s+as\s+(?:start|stop)\s+frame\b/i.test(text) ||
    /\bVIDEO CHARACTER LOCK\b/i.test(text) ||
    /\bScene:\s*Use\s+@Image\d+/i.test(text)
  );
}

function normalizeSubtitleFontSizePx(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 34;
  return Math.max(24, Math.min(52, Math.round(numeric)));
}

function roundTimelineSecond(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function productRecordFromState(state: unknown): Record<string, unknown> {
  const record = isRecord(state) ? state : {};
  if (isRecord(record.productTruth)) return record.productTruth;
  if (isRecord(record.product)) return record.product;
  if (isRecord(record.item)) return record.item;
  return record;
}

function buildAssetsFromState(input: {
  tenantId: string;
  runState: unknown;
  productState: unknown;
}): HyperframesCompositionAsset[] {
  const run = isRecord(input.runState) ? input.runState : {};
  const product = productRecordFromState(input.productState);
  const imageCandidates = [
    ...arrayFrom(product.selectedImageUrls),
    ...arrayFrom(product.imageUrls),
    ...arrayFrom(product.imagesJson),
    ...arrayFrom(run.frameUrls),
    ...arrayFrom(isRecord(run.resultJson) ? run.resultJson.frameUrls : []),
  ];
  const assets: HyperframesCompositionAsset[] = [];
  for (const [index, raw] of imageCandidates.entries()) {
    const ref = typeof raw === "string" ? raw : cleanId((raw as Record<string, unknown>)?.url, "");
    if (!ref) continue;
    try {
      assets.push({
        assetId: `asset_product_${index + 1}`,
        slot: index === 0 ? "product_image" : "storyboard_frame",
        kind: index === 0 ? "product_image" : "storyboard_frame",
        ref: sanitizeHyperframesAssetRef(ref),
        ownedByTenantId: input.tenantId,
      });
    } catch {
      continue;
    }
  }
  return assets.slice(0, 18);
}

export function normalizeHyperframesFinalCompositeTimeline(
  config: HyperframesFinalCompositeConfig
): HyperframesCreativeTimeline {
  let cursor = 0;
  const seenShotIds = new Set<string>();
  const sortedShots = [...config.shots].sort((a, b) => a.index - b.index);
  const entriesWithoutHash = sortedShots.map((shot, index) => {
    if (seenShotIds.has(shot.id)) {
      throw new Error(`HyperFrames invalid timeline: duplicate shot id ${shot.id}.`);
    }
    seenShotIds.add(shot.id);
    if (shot.index !== index) {
      throw new Error(
        `HyperFrames invalid timeline: shot indices must be contiguous from 0; got ${shot.index} at position ${index}.`
      );
    }
    if (!Number.isFinite(shot.startSec)) {
      throw new Error(
        `HyperFrames invalid timeline: shot ${shot.id} startSec must be finite.`
      );
    }
    if (!Number.isFinite(shot.durationSec) || Number(shot.durationSec) <= 0) {
      throw new Error(
        `HyperFrames invalid timeline: shot ${shot.id} durationSec must be positive.`
      );
    }
    const expectedStart = roundTimelineSecond(cursor);
    const declaredStart = roundTimelineSecond(shot.startSec);
    if (Math.abs(declaredStart - expectedStart) > 0.05) {
      throw new Error(
        `HyperFrames stale timeline: shot ${shot.id} starts at ${declaredStart}s, expected ${expectedStart}s.`
      );
    }
    const durationSec = roundTimelineSecond(shot.durationSec);
    if (!Number.isFinite(durationSec) || durationSec <= 0) {
      throw new Error(
        `HyperFrames invalid timeline: shot ${shot.id} durationSec must be positive.`
      );
    }
    const absoluteStartSec = expectedStart;
    const absoluteEndSec = roundTimelineSecond(absoluteStartSec + durationSec);
    const sortedSubtitleCues = [...shot.subtitleCues].sort(
      (a, b) => roundTimelineSecond(a.startSec) - roundTimelineSecond(b.startSec)
    );
    let previousSubtitleEndSec = absoluteStartSec;
    for (const cue of sortedSubtitleCues) {
      const cueStart = roundTimelineSecond(cue.startSec);
      const cueEnd = roundTimelineSecond(cue.endSec);
      if (!Number.isFinite(cueStart) || !Number.isFinite(cueEnd) || cueEnd <= cueStart) {
        throw new Error(
          `HyperFrames invalid timeline: subtitle cue for shot ${shot.id} must have finite start/end seconds.`
        );
      }
      if (
        cueStart < absoluteStartSec - 0.05 ||
        cueEnd > absoluteEndSec + 0.05
      ) {
        throw new Error(
          `HyperFrames invalid timeline: subtitle cue for shot ${shot.id} must stay within ${absoluteStartSec}s-${absoluteEndSec}s.`
        );
      }
      if (cueStart < previousSubtitleEndSec - 0.05) {
        throw new Error(
          `HyperFrames invalid timeline: subtitle cues for shot ${shot.id} must not overlap.`
        );
      }
      previousSubtitleEndSec = Math.max(previousSubtitleEndSec, cueEnd);
    }
    cursor = absoluteEndSec;
    const sourceMediaRef = shot.sourceVideoRef || shot.sourceVideoUrl;
    if (!sourceMediaRef) {
      throw new Error(
        `HyperFrames invalid timeline: shot ${shot.id} requires a source media ref.`
      );
    }
    return {
      shotId: shot.id,
      shotIndex: shot.index,
      absoluteStartSec,
      absoluteEndSec,
      durationSec,
      mediaStartSec: roundTimelineSecond(shot.mediaStartSec ?? 0),
      sourceMediaRef,
      sourceMediaHash: stableHash({
        sourceMediaRef,
        sourceVideoUrl: shot.sourceVideoUrl,
        mediaStartSec: roundTimelineSecond(shot.mediaStartSec ?? 0),
        durationSec,
      }),
      subtitleCues: shot.subtitleCues,
      onScreenText: shot.onScreenText,
    };
  });
  const durationSec = roundTimelineSecond(cursor);
  if (Math.abs(durationSec - roundTimelineSecond(config.finalVideoLengthSec)) > 0.05) {
    throw new Error(
      `HyperFrames stale timeline: final duration ${config.finalVideoLengthSec}s does not match normalized ${durationSec}s.`
    );
  }
  const timelineHash = stableHash({
    timelineVersion: 1,
    durationSec,
    entries: entriesWithoutHash,
  });
  return {
    timelineVersion: 1,
    timelineHash,
    durationSec,
    entries: entriesWithoutHash.map(({ subtitleCues, onScreenText, ...entry }) => ({
      ...entry,
      timelineHash,
      timelineVersion: 1,
    })),
  };
}

export function getHyperframesFinalCompositeFallbackCapability(
  config: Pick<
    HyperframesFinalCompositeConfig,
    "overlayPreset" | "subtitlePreset" | "cssAnimationEnabled" | "gsapCompatibleTimeline"
  > & {
    allowFfmpegAssFallback?: boolean;
    audioEvents?: unknown[];
  }
): {
  ffmpegAssFallback: boolean;
  fallbackQuality: "full" | "partial" | "not_supported";
  unsupportedFeatures: string[];
} {
  const unsupportedFeatures: string[] = [];
  if (config.cssAnimationEnabled || config.gsapCompatibleTimeline) {
    unsupportedFeatures.push("rich_css_gsap_timeline");
  }
  if (
    ["kinetic_bold_hook", "neon_gaming_specs", "premium_product_hero"].includes(
      config.overlayPreset
    )
  ) {
    unsupportedFeatures.push("kinetic_typography");
  }
  if (config.subtitlePreset === "karaoke_word") {
    unsupportedFeatures.push("word_level_karaoke_timing");
  }
  if (Array.isArray(config.audioEvents) && config.audioEvents.length > 0) {
    unsupportedFeatures.push("audio_event_map_runtime_mix");
  }
  if (config.allowFfmpegAssFallback) {
    return {
      ffmpegAssFallback: true,
      fallbackQuality: unsupportedFeatures.length > 0 ? "partial" : "full",
      unsupportedFeatures,
    };
  }
  return {
    ffmpegAssFallback: false,
    fallbackQuality: "not_supported",
    unsupportedFeatures: [
      ...unsupportedFeatures,
      "official_html_css_browser_runtime_required",
    ],
  };
}

function isManualStoryboardFinalCompositeInput(input: {
  productId: string;
  runId: string;
  productState?: unknown;
  runState?: unknown;
}): boolean {
  const productId = cleanId(input.productId, "");
  const runId = cleanId(input.runId, "");
  if (
    /^manual(?:_storyboard)?_product_/i.test(productId) ||
    /^manual(?:_storyboard)?_run_/i.test(runId)
  ) {
    return true;
  }
  const product = productRecordFromState(input.productState);
  const platformRawJson = isRecord(product.platformRawJson) ? product.platformRawJson : {};
  if (platformRawJson.manualStoryboardReview === true) return true;
  const run = isRecord(input.runState) ? input.runState : {};
  const metadataJson = isRecord(run.metadataJson) ? run.metadataJson : {};
  const resultJson = isRecord(run.resultJson) ? run.resultJson : {};
  return (
    run.launchMode === "manual_storyboard_review" ||
    run.status === "manual_storyboard_review" ||
    metadataJson.manualStoryboardReview === true ||
    resultJson.manualStoryboardReview === true
  );
}

export function buildHyperframesCompositionInput(input: {
  tenantId: string;
  userId: number | string;
  productId: string;
  runId?: string;
  renderJobId?: string;
  productState?: unknown;
  runState?: unknown;
  compositionMode?: MarketplaceAutoReviewCompositionMode;
  renderIntent?: HyperframesRenderIntent;
  platformPresetId?: HyperframesPlatformPresetId;
  now?: Date;
}): HyperframesCompositionInput {
  const compositionMode = input.compositionMode ?? "storyboard_motion_preview";
  const renderIntent = input.renderIntent ?? "preview";
  const platformPreset = getHyperframesPlatformPreset(
    input.platformPresetId ?? "generic_vertical_9_16"
  );
  const template = selectHyperframesTemplate({
    compositionMode,
    renderIntent,
    platformPresetId: platformPreset.presetId,
  });
  const product = productRecordFromState(input.productState);
  const title = sanitizeHyperframesText(
    product.title ?? product.productName ?? product.name ?? "Marketplace product",
    160
  );
  const productTruth = {
    title,
    price: sanitizeHyperframesText(product.price ?? "", 80),
    rating: sanitizeHyperframesText(product.rating ?? "", 80),
    summary: sanitizeHyperframesText(
      product.shortSummary ?? product.description ?? product.descriptionText ?? "",
      500
    ),
  };
  const run = isRecord(input.runState) ? input.runState : {};
  const shots = arrayFrom(
    isRecord(run.concept) ? run.concept.shots : isRecord(run.metadataJson) ? (run.metadataJson as Record<string, unknown>).shots : []
  )
    .slice(0, 9)
    .map((shot, index) =>
      isRecord(shot)
        ? sanitizeHyperframesRecordText(shot, 500)
        : { title: sanitizeHyperframesText(shot, 500), index: String(index + 1) }
    );
  const compositionSeed = {
    productId: input.productId,
    runId: input.runId ?? "pending_run",
    productTruth,
    shots,
    templateId: template.templateId,
    templateVersion: template.templateVersion,
    platformPresetId: platformPreset.presetId,
    renderIntent,
    compositionMode,
  };
  const compositionInputHash = stableHash(compositionSeed);
  return HyperframesCompositionInputSchema.parse({
    contractVersion: HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
    launchMode: "auto_storyboard_review",
    renderEngine: "hyperframes_composition",
    compositionMode,
    renderIntent,
    template: {
      templateId: template.templateId,
      templateVersion: template.templateVersion,
      templateContentHash: template.templateContentHash,
      label: template.label,
    },
    platformPreset,
    productTruth,
    storyboard: {
      shotCount: shots.length || 9,
      shots,
    },
    copy: {
      product_title: title,
      hook: sanitizeHyperframesText(
        product.hook ?? "รีวิวสินค้าแบบอัตโนมัติ",
        120
      ),
      cta: sanitizeHyperframesText(product.cta ?? "ดูรายละเอียดสินค้า", 120),
    },
    assets: buildAssetsFromState({
      tenantId: input.tenantId,
      runState: input.runState,
      productState: input.productState,
    }),
    compliance: {
      requiresDisclosure: Boolean(product.requiresDisclosure),
      disclosureText: sanitizeHyperframesText(product.disclosureText ?? "", 240),
      blockedClaims: arrayFrom(product.blockedClaims).map(value =>
        sanitizeHyperframesText(value, 240)
      ),
      warnings: arrayFrom(product.warnings).map(value =>
        sanitizeHyperframesText(value, 240)
      ),
    },
    provenance: {
      tenantId: input.tenantId,
      userId: input.userId,
      productId: input.productId,
      runId: input.runId,
      renderJobId: input.renderJobId,
      launchMode: "auto_storyboard_review",
      renderIntent,
      compositionMode,
      templateId: template.templateId,
      templateVersion: template.templateVersion,
      templateContentHash: template.templateContentHash,
      platformPresetId: platformPreset.presetId,
      platformPresetVersion: platformPreset.platformPresetVersion,
      compositionInputHash,
      builderVersion: "hyperframes_composition_builder_v1",
      createdAt: (input.now ?? new Date()).toISOString(),
    },
  });
}

export function buildHyperframesFinalCompositeCompositionInput(input: {
  tenantId: string;
  userId: number | string;
  productId: string;
  runId: string;
  productState?: unknown;
  runState?: unknown;
  finalComposite: HyperframesFinalCompositeConfig;
  now?: Date;
}): HyperframesCompositionInput & {
  compositionHtml: string;
  finalCompositeConfig: Record<string, unknown>;
} {
  const compositionMode = "captioned_final_composite" as const;
  const renderIntent = "final" as const;
  const platformPreset = getHyperframesPlatformPreset("generic_vertical_9_16");
  const template = selectHyperframesTemplate({
    compositionMode,
    renderIntent,
    platformPresetId: platformPreset.presetId,
  });
  const product = productRecordFromState(input.productState);
  const title = sanitizeHyperframesText(
    product.title ?? product.productName ?? product.name ?? "Marketplace product",
    160
  );
  const productTruth = {
    title,
    price: sanitizeHyperframesText(product.price ?? "", 80),
    rating: sanitizeHyperframesText(product.rating ?? "", 80),
    summary: sanitizeHyperframesText(
      product.shortSummary ?? product.description ?? product.descriptionText ?? "",
      500
    ),
  };
  const finalCompositeInput = HyperframesFinalCompositeConfigSchema.parse(
    input.finalComposite
  );
  const allowFfmpegAssFallback = isManualStoryboardFinalCompositeInput(input);
  const sanitizedShots = finalCompositeInput.shots.map((shot, index) => ({
    id: sanitizeHyperframesText(shot.id, 160) || `shot_${index + 1}`,
    index: shot.index,
    title: sanitizeHyperframesText(shot.title ?? "", 180),
    sourceVideoUrl: sanitizeHyperframesAssetRef(shot.sourceVideoUrl),
    sourceVideoRef: sanitizeHyperframesText(shot.sourceVideoRef ?? "", 512),
    mediaStartSec: shot.mediaStartSec,
    startSec: shot.startSec,
    durationSec: shot.durationSec,
    endSec: shot.startSec + shot.durationSec,
    onScreenText: shot.onScreenText.map(line => sanitizeHyperframesText(line, 600)),
    subtitleCues: shot.subtitleCues.map(cue => ({
      startSec: cue.startSec,
      endSec: cue.endSec,
      text: sanitizeHyperframesText(cue.text, 360),
    })),
    overlayPreset: shot.overlayPreset,
    animationPreset: shot.animationPreset,
    transition: shot.transition,
    textMotionPreset: shot.textMotionPreset,
  }));
  const finalCompositeBase = {
    ...finalCompositeInput,
    styleBrief: sanitizeHyperframesText(
      finalCompositeInput.styleBrief,
      HYPERFRAMES_FINAL_RENDER_PROMPT_MAX_CHARS
    ),
    hookText: sanitizeHyperframesText(finalCompositeInput.hookText, 160),
    supportingText: sanitizeHyperframesText(finalCompositeInput.supportingText, 160),
    audioEvents: finalCompositeInput.audioEvents.map(event => ({
      ...event,
      id: sanitizeHyperframesText(event.id, 160),
      presetId: sanitizeHyperframesText(event.presetId ?? "", 180) || undefined,
      assetRef: sanitizeHyperframesAssetRef(event.assetRef),
      notes: event.notes ? sanitizeHyperframesText(event.notes, 300) : undefined,
    })),
    audioAssetValidation: {
      ...finalCompositeInput.audioAssetValidation,
      missingAssetRefs: finalCompositeInput.audioAssetValidation.missingAssetRefs.map(ref =>
        sanitizeHyperframesAssetRef(ref)
      ),
      validatedAssetRefs: finalCompositeInput.audioAssetValidation.validatedAssetRefs.map(ref =>
        sanitizeHyperframesAssetRef(ref)
      ),
      validatedAssets: finalCompositeInput.audioAssetValidation.validatedAssets.map(asset => ({
        ...asset,
        assetRef: sanitizeHyperframesAssetRef(asset.assetRef),
        licenseName: sanitizeHyperframesText(asset.licenseName, 160),
        ownerTenantId: asset.ownerTenantId
          ? sanitizeHyperframesText(asset.ownerTenantId, 128)
          : undefined,
      })),
    },
    shots: [...sanitizedShots].sort((a, b) => a.index - b.index),
  };
  const audioEventMapHash =
    finalCompositeBase.audioEvents.length > 0
      ? stableHash({
          audioPackPresetId: finalCompositeBase.audioPackPresetId,
          musicPresetId: finalCompositeBase.musicPresetId,
          sfxPresetIds: finalCompositeBase.sfxPresetIds,
          audioEvents: finalCompositeBase.audioEvents,
          validation: finalCompositeBase.audioAssetValidation,
        })
      : undefined;
  const creativeTimeline = normalizeHyperframesFinalCompositeTimeline(
    finalCompositeBase as HyperframesFinalCompositeConfig
  );
  const fallbackCapability = getHyperframesFinalCompositeFallbackCapability(
    {
      ...(finalCompositeBase as HyperframesFinalCompositeConfig),
      allowFfmpegAssFallback,
    }
  );
  const finalComposite = {
    ...finalCompositeBase,
    creativeTimeline,
    fallbackCapability,
    audioEventMapHash,
    fallbackPolicy: allowFfmpegAssFallback
      ? {
          source: "manual_storyboard_review",
          renderer: "ffmpeg_ass",
          quality: fallbackCapability.fallbackQuality,
        }
      : undefined,
  };
  const compositionSeed = {
    builderVersion: HYPERFRAMES_FINAL_COMPOSITE_BUILDER_VERSION,
    productId: input.productId,
    runId: input.runId,
    productTruth,
    templateId: template.templateId,
    templateVersion: template.templateVersion,
    platformPresetId: platformPreset.presetId,
    renderIntent,
    compositionMode,
    finalComposite,
  };
  const compositionInputHash = stableHash(compositionSeed);
  const assets: HyperframesCompositionAsset[] = finalComposite.shots.map((shot, index) => ({
    assetId: `asset_generated_clip_${index + 1}`,
    slot: "generated_clip",
    kind: "generated_clip",
    ref: shot.sourceVideoUrl,
    durationSeconds: shot.durationSec,
    ownedByTenantId: input.tenantId,
  }));
  if (finalComposite.burnInSubtitles) {
    assets.push({
      assetId: "asset_subtitle_burn_in",
      slot: "subtitle",
      kind: "subtitle",
      ref: `inline-subtitles:${compositionInputHash}`,
      ownedByTenantId: input.tenantId,
    });
  }
  assets.push({
    assetId: "asset_font_thai",
    slot: "font",
    kind: "font",
    ref: finalComposite.fontFamily,
    ownedByTenantId: input.tenantId,
  });
  const renderableAudioEvents = getRenderableHyperframesAudioEvents(finalComposite);
  const remainingAssetSlots = Math.max(0, 40 - assets.length);
  for (const [index, event] of renderableAudioEvents.slice(0, remainingAssetSlots).entries()) {
    assets.push({
      assetId: `asset_audio_event_${index + 1}`,
      slot: event.role,
      kind: "audio",
      ref: event.assetRef,
      durationSeconds: event.durationSec,
      ownedByTenantId: input.tenantId,
    });
  }
  const composition = HyperframesCompositionInputSchema.parse({
    contractVersion: HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
    launchMode: "auto_storyboard_review",
    renderEngine: "hyperframes_composition",
    compositionMode,
    renderIntent,
    template: {
      templateId: template.templateId,
      templateVersion: template.templateVersion,
      templateContentHash: template.templateContentHash,
      label: template.label,
    },
    platformPreset: {
      ...platformPreset,
      width: finalComposite.width,
      height: finalComposite.height,
      fps: finalComposite.fps,
      durationSeconds: finalComposite.finalVideoLengthSec,
      maxDurationSeconds: Math.max(
        platformPreset.maxDurationSeconds,
        finalComposite.finalVideoLengthSec
      ),
    },
    productTruth,
    storyboard: {
      shotCount: finalComposite.shots.length,
      shots: finalComposite.shots.map(shot => ({
        ...shot,
        cssAnimationEnabled: finalComposite.cssAnimationEnabled,
        gsapCompatibleTimeline: finalComposite.gsapCompatibleTimeline,
        textMode: finalComposite.textMode,
        burnInSubtitles: finalComposite.burnInSubtitles,
      })),
    },
    copy: {
      product_title: title,
      caption: finalComposite.hookText || title,
      hook: finalComposite.hookText || title,
      supporting_text: finalComposite.supportingText,
      cta: sanitizeHyperframesText(product.cta ?? "กดดูโปรเลย", 120),
      disclosure: sanitizeHyperframesText(product.disclosureText ?? "", 240),
    },
    assets,
    compliance: {
      requiresDisclosure: Boolean(product.requiresDisclosure),
      disclosureText: sanitizeHyperframesText(product.disclosureText ?? "", 240),
      blockedClaims: arrayFrom(product.blockedClaims).map(value =>
        sanitizeHyperframesText(value, 240)
      ),
      warnings: arrayFrom(product.warnings).map(value =>
        sanitizeHyperframesText(value, 240)
      ),
    },
    provenance: {
      tenantId: input.tenantId,
      userId: input.userId,
      productId: input.productId,
      runId: input.runId,
      launchMode: "auto_storyboard_review",
      renderIntent,
      compositionMode,
      templateId: template.templateId,
      templateVersion: template.templateVersion,
      templateContentHash: template.templateContentHash,
      platformPresetId: platformPreset.presetId,
      platformPresetVersion: platformPreset.platformPresetVersion,
      compositionInputHash,
      builderVersion: HYPERFRAMES_FINAL_COMPOSITE_BUILDER_VERSION,
      createdAt: (input.now ?? new Date()).toISOString(),
    },
  });
  return {
    ...composition,
    finalCompositeConfig: finalComposite,
    compositionHtml: buildHyperframesFinalCompositeHtml({
      composition,
      finalComposite,
      productTitle: title,
    }),
  };
}

function getRenderableHyperframesAudioEvents(
  config: HyperframesFinalCompositeConfig
): HyperframesFinalCompositeConfig["audioEvents"] {
  const missingRefs = new Set(
    config.audioAssetValidation.missingAssetRefs.map(ref => ref.trim()).filter(Boolean)
  );
  const validatedRefs = new Set([
    ...config.audioAssetValidation.validatedAssetRefs.map(ref => ref.trim()).filter(Boolean),
    ...config.audioAssetValidation.validatedAssets
      .map(asset => asset.assetRef.trim())
      .filter(Boolean),
  ]);
  return config.audioEvents.filter(event => {
    const ref = event.assetRef.trim();
    return Boolean(ref) && validatedRefs.has(ref) && !missingRefs.has(ref);
  });
}

function uniqueRenderTextLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const line of lines) {
    const clean = line.trim();
    const key = clean.toLocaleLowerCase("th-TH");
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    output.push(clean);
  }
  return output;
}

function getRenderableOverlayTextLines(lines: string[]): string[] {
  return lines.filter(line => Boolean(line.trim()) && !isHyperframesVideoPromptLikeText(line));
}

function motionDelayStyle(index: number): string {
  const delaySec = Math.round(Math.max(0, index) * 14) / 100;
  return ` style="--motion-delay:${delaySec}s"`;
}

function buildHyperframesFinalCompositeHtml(input: {
  composition: HyperframesCompositionInput;
  finalComposite: HyperframesFinalCompositeConfig & {
    creativeTimeline?: HyperframesCreativeTimeline;
    audioEventMapHash?: string;
  };
  productTitle: string;
}): string {
  const config = input.finalComposite;
  const timeline =
    config.creativeTimeline ?? normalizeHyperframesFinalCompositeTimeline(config);
  const timelineByShotId = new Map(timeline.entries.map(entry => [entry.shotId, entry]));
  const fontStack = `"${cssString(config.fontFamily)}", "Noto Sans Thai", "Prompt", "Kanit", "Sarabun", system-ui, sans-serif`;
  const safeInset = `${Math.round(config.safeZonePercent * 10) / 10}%`;
  const preserveNativeAudio = config.preserveNativeAudio !== false;
  const defaultTextMotionPreset = config.textMotionPreset ?? "slide_right_to_left";
  const firstShot = config.shots[0];
  const hookOverlayPreset = firstShot?.overlayPreset ?? config.overlayPreset;
  const hookTextMotionPreset = firstShot?.textMotionPreset ?? defaultTextMotionPreset;
  const subtitleFontSizePx = normalizeSubtitleFontSizePx(config.subtitleFontSizePx);
  const renderConfig = {
    ...config,
    subtitleFontSizePx,
    shots: config.shots.map(shot => ({
      ...shot,
      onScreenText: getRenderableOverlayTextLines(shot.onScreenText),
    })),
  };
  const sourceVideoAudioAttributes = preserveNativeAudio
    ? 'data-has-audio="true" data-native-audio="true" data-audio-role="native_source"'
    : 'muted data-has-audio="false"';
  const shotHtml = config.shots
    .map((shot, index) => {
      const lines =
        config.includeShotText
          ? getRenderableOverlayTextLines(shot.onScreenText)
          : [];
      const cues = config.burnInSubtitles ? shot.subtitleCues : [];
      const timelineEntry = timelineByShotId.get(shot.id);
      const videoTrackIndex = shot.index * 2;
      const overlayTrackIndex = videoTrackIndex + 1;
      const shotOverlayPreset = shot.overlayPreset ?? config.overlayPreset;
      const shotTextMotionPreset = shot.textMotionPreset ?? defaultTextMotionPreset;
      const hasShotOverlayCopy = lines.length > 0;
      const shouldDeferShotCopyAfterHook =
        Boolean(config.includeHookText && hasShotOverlayCopy && (index === 0 || shot.index === 0));
      return `
      <video id="video-${escapeHtml(shot.id)}" class="clip scene source-video" src="${escapeHtml(shot.sourceVideoUrl)}" data-hf-auto-start="true" data-shot-id="${escapeHtml(shot.id)}" data-track-index="${videoTrackIndex}" data-start="${shot.startSec}" data-duration="${shot.durationSec}" data-media-start="${shot.mediaStartSec ?? 0}" preload="auto" ${sourceVideoAudioAttributes} playsinline></video>
      <section id="shot-${escapeHtml(shot.id)}" class="clip shot shot-${escapeHtml(shot.animationPreset)}" data-overlay-preset="${escapeHtml(shotOverlayPreset)}" data-text-motion-preset="${escapeHtml(shotTextMotionPreset)}" data-shot-id="${escapeHtml(shot.id)}" data-shot-index="${shot.index}" data-track-index="${overlayTrackIndex}" data-start="${shot.startSec}" data-duration="${shot.durationSec}" data-timeline-hash="${escapeHtml(timelineEntry?.timelineHash ?? timeline.timelineHash)}"${shouldDeferShotCopyAfterHook ? ' data-shot-copy-deferred="after-hook"' : ""} data-has-shot-copy="${hasShotOverlayCopy ? "true" : "false"}">
        ${hasShotOverlayCopy ? `<div class="overlay-copy-layer">
          <div class="shade"></div>
          <div class="shot-copy">
            ${lines.map((line, lineIndex) => `<div class="shot-line line-${lineIndex + 1} motion-item"${motionDelayStyle(lineIndex)}>${escapeHtml(line)}</div>`).join("")}
          </div>
        </div>` : ""}
        <div class="subtitle-stack">
          ${cues.map((cue, cueIndex) => `<div class="subtitle-cue cue-${cueIndex + 1}" data-cue-start="${cue.startSec}" data-cue-end="${cue.endSec}">${escapeHtml(cue.text)}</div>`).join("")}
        </div>
      </section>`;
    })
    .join("\n");
  const firstShotLines = uniqueRenderTextLines(
    firstShot ? getRenderableOverlayTextLines(firstShot.onScreenText) : []
  );
  const hookMainText = config.hookText || firstShotLines[0] || input.productTitle;
  const hookSubText =
    config.supportingText ||
    firstShotLines.find(line => line !== hookMainText) ||
    "";
  const hookChipText =
    firstShotLines.find(line => line !== hookMainText && line !== hookSubText) ||
    hookSubText ||
    (input.productTitle !== hookMainText ? input.productTitle : "");
  const hook = config.includeHookText
    ? `<div id="hook-layer" class="clip hook-layer" data-overlay-preset="${escapeHtml(hookOverlayPreset)}" data-text-motion-preset="${escapeHtml(hookTextMotionPreset)}" data-start="0" data-duration="3" data-track-index="${config.shots.length * 2 + 1}">
        <div class="hook-stack">
          <div class="hook-main motion-item"${motionDelayStyle(0)}>${escapeHtml(hookMainText)}</div>
          ${hookSubText ? `<div class="hook-sub motion-item"${motionDelayStyle(1)}>${escapeHtml(hookSubText)}</div>` : ""}
        </div>
        ${hookChipText ? `<div class="hook-chip motion-item"${motionDelayStyle(2)}>${escapeHtml(hookChipText)}</div>` : ""}
      </div>`
    : "";
  const audioHtml = getRenderableHyperframesAudioEvents(config)
    .map(
      (event, index) =>
        `<audio id="audio-event-${index + 1}" class="clip audio-event" data-track-index="${config.shots.length * 2 + 2 + index}" data-audio-role="${escapeHtml(event.role)}" data-visual-trigger="${escapeHtml(event.visualTrigger)}" data-start="${event.startSec}" data-duration="${event.durationSec ?? ""}" data-volume="${event.volume}" data-preset-id="${escapeHtml(event.presetId ?? "")}" src="${escapeHtml(event.assetRef)}" preload="metadata"></audio>`
    )
    .join("\n");
  return `<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      @font-face {
        font-family: "SmartSpecThai";
        src: url("./assets/fonts/smartspec-thai-runtime.ttf") format("truetype");
        font-display: swap;
      }
      @font-face {
        font-family: "Prompt";
        src: url("./assets/fonts/smartspec-thai-runtime.ttf") format("truetype");
        font-display: swap;
      }
      @font-face {
        font-family: "Noto Sans Thai";
        src: url("./assets/fonts/smartspec-thai-runtime.ttf") format("truetype");
        font-display: swap;
      }
      @font-face {
        font-family: "Kanit";
        src: url("./assets/fonts/smartspec-thai-runtime.ttf") format("truetype");
        font-display: swap;
      }
      @font-face {
        font-family: "Sarabun";
        src: url("./assets/fonts/smartspec-thai-runtime.ttf") format("truetype");
        font-display: swap;
      }
      html, body { margin: 0; width: 100%; height: 100%; background: #050505; }
      body { font-family: "SmartSpecThai", ${fontStack}; }
      [data-composition-id] {
        position: relative;
        width: ${config.width}px;
        height: ${config.height}px;
        overflow: hidden;
        background: #050505;
        color: #fff;
      }
      .shot { position: absolute; inset: 0; opacity: 1; overflow: hidden; background: transparent; pointer-events: none; z-index: 2; }
      .source-video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 1; transform: scale(1.02); z-index: 0; }
      .overlay-copy-layer { position: absolute; inset: 0; z-index: 1; opacity: 0; pointer-events: none; }
      .shade { position: absolute; inset: 0; z-index: 1; background: linear-gradient(180deg, rgba(0,0,0,.16), rgba(0,0,0,.08) 48%, rgba(0,0,0,.62)); pointer-events: none; }
      .shot-copy { position: absolute; left: ${safeInset}; right: ${safeInset}; top: 9%; z-index: 2; display: grid; gap: 14px; text-shadow: 0 4px 18px rgba(0,0,0,.55); }
      .shot-line, .hook-main, .hook-sub, .hook-chip, .subtitle-cue { box-sizing: border-box; overflow-wrap: anywhere; word-break: break-word; }
      .shot-line { display: inline-block; width: fit-content; max-width: 100%; border-radius: 20px; background: rgba(7, 12, 24, .74); padding: 18px 24px; font-size: 52px; font-weight: 800; line-height: 1.08; opacity: 1; transform: translateY(0); }
      .shot-line + .shot-line { font-size: 40px; font-weight: 700; background: rgba(255, 255, 255, .88); color: #0f172a; }
      [data-overlay-preset="auto"] .shot-copy { top: 8%; max-width: 78%; }
      [data-overlay-preset="auto"] .shot-line:first-child { background: rgba(255,255,255,.9); color: #0f172a; font-size: 58px; }
      [data-overlay-preset="auto"] .shot-line + .shot-line { background: rgba(14,165,233,.9); color: #fff; }
      [data-overlay-preset="premium_product_hero"] .shot-copy { left: ${safeInset}; right: ${safeInset}; top: 8%; justify-items: center; text-align: center; }
      [data-overlay-preset="premium_product_hero"] .shot-line:first-child { background: rgba(255,255,255,.92); color: #111827; font-size: 68px; }
      [data-overlay-preset="premium_product_hero"] .shot-line + .shot-line { border-radius: 999px; background: rgba(15,23,42,.82); color: #fff; }
      [data-overlay-preset="hook_sequence"] .shot-copy { top: 8%; right: auto; max-width: 74%; }
      [data-overlay-preset="hook_sequence"] .shot-line:first-child { background: rgba(255,255,255,.92); color: #0f172a; font-size: 62px; }
      [data-overlay-preset="hook_sequence"] .shot-line + .shot-line { background: rgba(37,99,235,.9); color: #fff; }
      [data-overlay-preset="kinetic_bold_hook"] .shade { background: linear-gradient(90deg, rgba(2,6,23,.9) 0 53%, rgba(2,6,23,.18) 54% 100%), linear-gradient(135deg, transparent 0 53%, rgba(250,204,21,.9) 54% 78%, transparent 79% 100%); }
      [data-overlay-preset="kinetic_bold_hook"] .shot-copy { top: 7%; max-width: 78%; }
      [data-overlay-preset="kinetic_bold_hook"] .shot-line:first-child { background: rgba(2,6,23,.86); color: #fff; font-size: 76px; transform: rotate(-1deg); }
      [data-overlay-preset="kinetic_bold_hook"] .shot-line + .shot-line { background: #facc15; color: #020617; transform: rotate(-1deg); }
      [data-overlay-preset="creator_top_punch"] .shade { background: linear-gradient(180deg, rgba(2,6,23,.2), rgba(2,6,23,.02) 46%, rgba(2,6,23,.42)); }
      [data-overlay-preset="creator_top_punch"] .shot-copy { left: 8%; right: 8%; top: 5%; justify-items: center; gap: 2px; text-align: center; text-shadow: 0 4px 0 #020617, 0 8px 18px rgba(2,6,23,.55); }
      [data-overlay-preset="creator_top_punch"] .shot-line { display: block; width: auto; max-width: 92%; padding: 0; border-radius: 0; background: transparent; box-shadow: none; font-size: 66px; line-height: 1.02; font-weight: 950; color: #fff; -webkit-text-stroke: 2px #020617; text-stroke: 2px #020617; }
      [data-overlay-preset="creator_top_punch"] .shot-line:first-child { color: #a7f3d0; font-size: 70px; }
      [data-overlay-preset="creator_top_punch"] .shot-line + .shot-line { color: #fff; font-size: 62px; transform: none; }
      [data-overlay-preset="ugc_center_stack"] .shade { background: linear-gradient(180deg, rgba(2,6,23,.08), rgba(2,6,23,.04) 44%, rgba(2,6,23,.34)); }
      [data-overlay-preset="ugc_center_stack"] .shot-copy { left: 7%; right: 7%; top: 42%; transform: translateY(-50%); justify-items: center; gap: 0; text-align: center; text-shadow: 0 4px 0 rgba(2,6,23,.82), 0 10px 22px rgba(2,6,23,.46); }
      [data-overlay-preset="ugc_center_stack"] .shot-line { display: block; width: auto; max-width: 96%; padding: 0; border-radius: 0; background: transparent; box-shadow: none; color: #f8fafc; font-size: 74px; line-height: 1.02; font-weight: 950; -webkit-text-stroke: 2px rgba(2,6,23,.86); text-stroke: 2px rgba(2,6,23,.86); }
      [data-overlay-preset="ugc_center_stack"] .shot-line:nth-child(2) { color: #fbbf24; font-size: 78px; }
      [data-overlay-preset="ugc_center_stack"] .shot-line:nth-child(n+3) { color: #fff; font-size: 54px; }
      [data-overlay-preset="white_intro_card"] .shade { background: #f1f5f9; }
      [data-overlay-preset="white_intro_card"] .overlay-copy-layer { z-index: 10; }
      [data-overlay-preset="white_intro_card"] .shot-copy { inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 0 10%; text-align: center; text-shadow: 0 10px 28px rgba(15,23,42,.14); }
      [data-overlay-preset="white_intro_card"] .shot-copy::before { content: ""; width: 118px; height: 86px; border-radius: 999px; background: radial-gradient(circle at 28% 42%, #2563eb 0 26%, transparent 27%), radial-gradient(circle at 68% 28%, #3b82f6 0 18%, transparent 19%), radial-gradient(circle at 56% 72%, #2563eb 0 18%, transparent 19%); filter: drop-shadow(0 14px 26px rgba(37,99,235,.18)); }
      [data-overlay-preset="white_intro_card"] .shot-line { display: block; width: auto; max-width: 92%; padding: 0; border-radius: 0; background: transparent; box-shadow: none; color: #111827; font-size: 76px; line-height: 1.04; font-weight: 950; }
      [data-overlay-preset="white_intro_card"] .shot-line + .shot-line { color: #334155; font-size: 48px; transform: none; }
      [data-overlay-preset="tech_signal_map"] .shade { background: radial-gradient(circle at 50% 36%, rgba(34,211,238,.34), transparent 22%), radial-gradient(circle at 24% 70%, rgba(251,146,60,.2), transparent 24%), linear-gradient(180deg, rgba(2,6,23,.92), rgba(15,23,42,.8)); }
      [data-overlay-preset="tech_signal_map"] .shot-copy { left: 7%; right: 7%; top: 6%; bottom: 12%; display: flex; flex-direction: column; align-items: stretch; justify-content: flex-start; gap: 12px; text-align: center; overflow: hidden; }
      [data-overlay-preset="tech_signal_map"] .shot-copy::before { content: ""; position: absolute; left: 8%; right: 8%; top: 38%; height: 2px; background: linear-gradient(90deg, transparent, rgba(34,211,238,.9), rgba(251,146,60,.9), transparent); box-shadow: 0 0 34px rgba(34,211,238,.42); }
      [data-overlay-preset="tech_signal_map"] .shot-line { position: relative; z-index: 1; display: block; box-sizing: border-box; width: 100%; max-width: 100%; overflow: hidden; white-space: nowrap; text-overflow: clip; padding: 0; border-radius: 0; background: transparent; box-shadow: none; color: #f8fafc; font-size: 52px; line-height: 1.04; font-weight: 950; letter-spacing: 0; text-align: center; text-shadow: 0 0 28px rgba(34,211,238,.48), 0 4px 0 rgba(2,6,23,.95); }
      [data-overlay-preset="tech_signal_map"] .shot-line:first-child { color: #22d3ee; font-size: 54px; }
      [data-overlay-preset="tech_signal_map"] .shot-line:nth-child(2) { color: #fb923c; font-size: 48px; }
      [data-overlay-preset="tech_signal_map"] .shot-line:nth-child(n+3) { margin: auto auto 0; width: min(78%, 720px); border: 1px solid rgba(34,211,238,.42); border-radius: 16px; background: rgba(2,6,23,.58); padding: 12px 16px; color: #cffafe; font-size: 30px; box-shadow: 0 0 24px rgba(34,211,238,.18); }
      [data-overlay-preset="spec_highlight"] .shade { background: linear-gradient(180deg, rgba(2,6,23,.2), rgba(2,6,23,.02) 46%, rgba(2,6,23,.48)); }
      [data-overlay-preset="spec_highlight"] .shot-copy { left: 8%; right: 8%; top: 4%; justify-items: center; gap: 2px; text-align: center; text-shadow: 0 4px 0 #020617, 0 8px 18px rgba(2,6,23,.55); }
      [data-overlay-preset="spec_highlight"] .shot-line { display: block; width: auto; max-width: 92%; padding: 0; border-radius: 0; background: transparent; box-shadow: none; font-size: 66px; line-height: 1.04; font-weight: 950; color: #fff; -webkit-text-stroke: 2px #020617; text-stroke: 2px #020617; }
      [data-overlay-preset="spec_highlight"] .shot-line:first-child { color: #facc15; font-size: 70px; }
      [data-overlay-preset="spec_highlight"] .shot-line + .shot-line { color: #fff; font-size: 62px; transform: none; }
      [data-overlay-preset="electronics_spec_stack"] .shade { background: linear-gradient(90deg, rgba(2,6,23,.08), rgba(2,6,23,.72)); }
      [data-overlay-preset="electronics_spec_stack"] .shot-copy { left: auto; top: 14%; right: 6%; width: 43%; max-width: 43%; box-sizing: border-box; padding: 22px; border: 1px solid rgba(148,163,184,.34); border-radius: 30px; background: rgba(2,6,23,.72); justify-items: stretch; gap: 12px; text-align: left; backdrop-filter: blur(10px); }
      [data-overlay-preset="electronics_spec_stack"] .shot-line:first-child { width: auto; border-radius: 18px; background: #38bdf8; color: #020617; font-size: 42px; box-shadow: 0 14px 32px rgba(56,189,248,.28); }
      [data-overlay-preset="electronics_spec_stack"] .shot-line + .shot-line { width: auto; border: 1px solid rgba(255,255,255,.16); border-radius: 16px; background: rgba(255,255,255,.12); color: #f8fafc; font-size: 30px; box-shadow: none; }
      [data-overlay-preset="split_product_specs"] .shade { background: linear-gradient(90deg, rgba(2,6,23,.78) 0 43%, rgba(2,6,23,.08) 44% 100%); }
      [data-overlay-preset="split_product_specs"] .shot-copy { top: 13%; right: auto; left: 6%; max-width: 40%; gap: 14px; }
      [data-overlay-preset="split_product_specs"] .shot-line:first-child { border-radius: 0 22px 22px 0; background: #f8fafc; color: #0f172a; font-size: 48px; box-shadow: 0 14px 36px rgba(2,6,23,.26); }
      [data-overlay-preset="split_product_specs"] .shot-line + .shot-line { border-radius: 999px; background: #facc15; color: #020617; font-size: 32px; transform: translateX(28px); }
      [data-overlay-preset="neon_gaming_specs"] .shade { background: radial-gradient(circle at 70% 16%, rgba(34,211,238,.28), transparent 28%), radial-gradient(circle at 22% 72%, rgba(217,70,239,.22), transparent 30%), linear-gradient(180deg, rgba(2,6,23,.25), rgba(2,6,23,.78)); }
      [data-overlay-preset="neon_gaming_specs"] .shot-copy { top: 9%; left: 7%; right: 7%; gap: 12px; }
      [data-overlay-preset="neon_gaming_specs"] .shot-line:first-child { border: 1px solid rgba(34,211,238,.62); background: rgba(2,6,23,.76); color: #cffafe; font-size: 58px; box-shadow: 0 0 42px rgba(34,211,238,.32); }
      [data-overlay-preset="neon_gaming_specs"] .shot-line + .shot-line { border: 1px solid rgba(217,70,239,.58); background: rgba(76,29,149,.54); color: #fdf4ff; font-size: 34px; box-shadow: 0 0 34px rgba(217,70,239,.22); }
      [data-overlay-preset^="spec_lines_"] .shot-line { display: block; width: auto; max-width: 100%; white-space: pre-wrap; overflow-wrap: normal; word-break: keep-all; text-wrap: pretty; }
      [data-overlay-preset^="spec_lines_"] .shot-copy { gap: 10px; text-align: left; text-shadow: none; }
      [data-overlay-preset="spec_lines_6_clean"] .shade { background: linear-gradient(180deg, rgba(248,250,252,.18), rgba(248,250,252,.62)); }
      [data-overlay-preset="spec_lines_6_clean"] .shot-copy { top: auto; bottom: 24%; left: 7%; right: 7%; }
      [data-overlay-preset="spec_lines_6_clean"] .shot-line:first-child { border-radius: 26px; background: rgba(255,255,255,.94); color: #0f172a; font-size: 46px; box-shadow: 0 20px 54px rgba(15,23,42,.22); }
      [data-overlay-preset="spec_lines_6_clean"] .shot-line + .shot-line { border-left: 8px solid #0ea5e9; border-radius: 18px; background: rgba(255,255,255,.9); color: #0f172a; font-size: 30px; box-shadow: 0 12px 30px rgba(15,23,42,.14); }
      [data-overlay-preset="spec_lines_10_dark"] .shade { background: linear-gradient(90deg, rgba(2,6,23,.88) 0 66%, rgba(2,6,23,.24)); }
      [data-overlay-preset="spec_lines_10_dark"] .shot-copy { top: 11%; right: auto; left: 6%; width: 64%; max-width: 64%; box-sizing: border-box; border: 1px solid rgba(148,163,184,.24); border-radius: 30px; background: rgba(2,6,23,.74); padding: 24px; backdrop-filter: blur(10px); }
      [data-overlay-preset="spec_lines_10_dark"] .shot-line:first-child { padding: 0 0 8px; border-radius: 0; border-bottom: 1px solid rgba(56,189,248,.38); background: transparent; color: #38bdf8; font-size: 38px; box-shadow: none; }
      [data-overlay-preset="spec_lines_10_dark"] .shot-line + .shot-line { border-radius: 14px; background: rgba(255,255,255,.11); color: #f8fafc; font-size: 24px; padding: 11px 14px; box-shadow: none; }
      [data-overlay-preset="spec_lines_12_light"] .shade { background: linear-gradient(180deg, rgba(255,255,255,.12), rgba(248,250,252,.76)); }
      [data-overlay-preset="spec_lines_12_light"] .shot-copy { top: auto; bottom: 23%; left: 6%; right: 6%; border-radius: 28px; background: rgba(255,255,255,.88); padding: 24px 26px; color: #0f172a; box-shadow: 0 24px 60px rgba(15,23,42,.2); backdrop-filter: blur(12px); }
      [data-overlay-preset="spec_lines_12_light"] .shot-line:first-child { padding: 0 0 10px; border-radius: 0; border-bottom: 2px solid rgba(14,165,233,.38); background: transparent; color: #111827; font-size: 34px; box-shadow: none; }
      [data-overlay-preset="spec_lines_12_light"] .shot-line:nth-child(2) { background: transparent; color: #0369a1; font-size: 26px; padding: 0 0 8px; box-shadow: none; }
      [data-overlay-preset="spec_lines_12_light"] .shot-line:nth-child(n+3) { border-radius: 0; border-bottom: 1px solid rgba(148,163,184,.34); background: transparent; color: #0f172a; font-size: 22px; padding: 6px 0 7px; box-shadow: none; }
      [data-overlay-preset="spec_lines_15_neon"] .shade { background: radial-gradient(circle at 80% 14%, rgba(34,211,238,.24), transparent 26%), radial-gradient(circle at 18% 76%, rgba(168,85,247,.2), transparent 28%), linear-gradient(180deg, rgba(2,6,23,.76), rgba(15,23,42,.6)); }
      [data-overlay-preset="spec_lines_15_neon"] .shot-copy { top: 7%; left: 5%; right: 5%; box-sizing: border-box; border: 1px solid rgba(34,211,238,.34); border-radius: 28px; background: rgba(2,6,23,.7); padding: 22px; box-shadow: 0 0 52px rgba(34,211,238,.18); backdrop-filter: blur(12px); }
      [data-overlay-preset="spec_lines_15_neon"] .shot-line:first-child { padding: 0 0 8px; border-radius: 0; border-bottom: 1px solid rgba(34,211,238,.34); background: transparent; color: #67e8f9; font-size: 31px; text-shadow: 0 0 20px rgba(34,211,238,.5); box-shadow: none; }
      [data-overlay-preset="spec_lines_15_neon"] .shot-line:nth-child(2) { background: transparent; color: #f0abfc; font-size: 23px; padding: 0 0 8px; box-shadow: none; }
      [data-overlay-preset="spec_lines_15_neon"] .shot-line:nth-child(n+3) { border-left: 4px solid rgba(34,211,238,.72); border-radius: 12px; background: rgba(15,23,42,.78); color: #f8fafc; font-size: 18px; padding: 6px 10px; box-shadow: none; }
      [data-overlay-preset^="spec_lines_"] .shot-copy { border: 0 !important; background: transparent !important; box-shadow: none !important; backdrop-filter: none !important; padding: 0 !important; }
      [data-overlay-preset^="spec_lines_"] .shot-line { border: 0 !important; border-radius: 0 !important; background: transparent !important; box-shadow: none !important; padding: 0 !important; text-shadow: 0 2px 0 rgba(255,255,255,.82), 0 10px 24px rgba(15,23,42,.24); }
      [data-overlay-preset^="spec_lines_"] .shot-line:first-child { width: fit-content; max-width: 100%; border-radius: 22px !important; padding: 12px 18px !important; font-weight: 950; }
      [data-overlay-preset="spec_lines_6_clean"] .shot-line:first-child { background: rgba(255,255,255,.94) !important; color: #0f172a; font-size: 56px; box-shadow: 0 20px 54px rgba(15,23,42,.22) !important; }
      [data-overlay-preset="spec_lines_6_clean"] .shot-line:nth-child(n+2) { color: #0f172a; font-size: 38px; line-height: 1.12; }
      [data-overlay-preset="spec_lines_10_dark"] .shot-line:first-child { border: 1px solid rgba(56,189,248,.45) !important; background: rgba(2,6,23,.66) !important; color: #67e8f9; font-size: 44px; text-shadow: 0 0 18px rgba(34,211,238,.42), 0 6px 18px rgba(2,6,23,.72); }
      [data-overlay-preset="spec_lines_10_dark"] .shot-line:nth-child(n+2) { color: #f8fafc; font-size: 28px; line-height: 1.12; text-shadow: 0 2px 0 rgba(2,6,23,.82), 0 8px 18px rgba(2,6,23,.58); }
      [data-overlay-preset="spec_lines_12_light"] .shot-line:first-child { background: rgba(255,255,255,.9) !important; color: #111827; font-size: 38px; box-shadow: 0 18px 48px rgba(15,23,42,.18) !important; }
      [data-overlay-preset="spec_lines_12_light"] .shot-line:nth-child(2) { color: #0369a1; font-size: 24px; line-height: 1.1; }
      [data-overlay-preset="spec_lines_12_light"] .shot-line:nth-child(n+3) { color: #0f172a; font-size: 22px; line-height: 1.08; }
      [data-overlay-preset="spec_lines_15_neon"] .shot-line:first-child { border: 1px solid rgba(34,211,238,.48) !important; background: rgba(2,6,23,.64) !important; color: #67e8f9; font-size: 32px; text-shadow: 0 0 20px rgba(34,211,238,.5); }
      [data-overlay-preset="spec_lines_15_neon"] .shot-line:nth-child(2) { color: #f0abfc; font-size: 24px; line-height: 1.08; text-shadow: 0 0 16px rgba(217,70,239,.34), 0 6px 16px rgba(2,6,23,.72); }
      [data-overlay-preset="spec_lines_15_neon"] .shot-line:nth-child(n+3) { color: #f8fafc; font-size: 18px; line-height: 1.06; text-shadow: 0 0 12px rgba(34,211,238,.34), 0 6px 16px rgba(2,6,23,.72); }
      [data-overlay-preset="feature_cards"] .shot-copy { top: 19%; right: auto; left: 6%; max-width: 88%; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; text-shadow: none; }
      [data-overlay-preset="feature_cards"] .shot-line { width: auto; min-height: 150px; border-radius: 22px; background: rgba(255,255,255,.92); color: #0f172a; border: 1px solid rgba(255,255,255,.42); font-size: 34px; box-shadow: 0 18px 44px rgba(2,6,23,.24); }
      [data-overlay-preset="feature_cards"] .shot-line:first-child { grid-column: span 2; min-height: auto; background: rgba(2,6,23,.86); color: #fff; font-size: 48px; }
      [data-overlay-preset="badge_cascade"] .shot-copy { top: 18%; right: auto; left: 7%; max-width: 74%; gap: 14px; }
      [data-overlay-preset="badge_cascade"] .shot-line { border-radius: 999px; background: rgba(15,23,42,.88); color: #fff; border: 1px solid rgba(255,255,255,.22); font-size: 40px; box-shadow: 0 14px 34px rgba(2,6,23,.24); }
      [data-overlay-preset="badge_cascade"] .shot-line:nth-child(2) { transform: translateX(52px); background: rgba(14,165,233,.92); color: #fff; }
      [data-overlay-preset="badge_cascade"] .shot-line:nth-child(3) { transform: translateX(104px); background: rgba(250,204,21,.94); color: #020617; }
      [data-overlay-preset="lower_third_review"] .shot-copy { top: auto; bottom: 31%; right: auto; max-width: 76%; }
      [data-overlay-preset="lower_third_review"] .shot-line:first-child { border-left: 10px solid #38bdf8; border-radius: 18px; background: rgba(15,23,42,.82); color: #fff; font-size: 42px; }
      [data-overlay-preset="lower_third_review"] .shot-line + .shot-line { border-radius: 18px 18px 18px 4px; background: rgba(255,255,255,.92); color: #0f172a; font-size: 34px; }
      [data-overlay-preset="price_impact"] .shot-copy { top: auto; bottom: 28%; text-align: center; justify-items: center; }
      [data-overlay-preset="price_impact"] .shot-line:first-child { font-size: 42px; background: rgba(2,6,23,.88); color: #fff; }
      [data-overlay-preset="price_impact"] .shot-line:nth-child(2) { font-size: 92px; background: transparent; color: #facc15; text-shadow: 0 8px 0 rgba(120,53,15,.45), 0 12px 34px rgba(0,0,0,.5); }
      [data-overlay-preset="hero_price_billboard"] .shot-copy { top: auto; bottom: 25%; text-align: center; justify-items: center; }
      [data-overlay-preset="hero_price_billboard"] .shot-line:first-child { font-size: 44px; background: rgba(2,6,23,.9); color: #fff; }
      [data-overlay-preset="hero_price_billboard"] .shot-line:nth-child(2) { font-size: 104px; background: transparent; color: #facc15; text-shadow: 0 10px 0 rgba(120,53,15,.48), 0 14px 36px rgba(0,0,0,.55); }
      [data-overlay-preset="clean_subtitle"] .shot-copy,
      [data-overlay-preset="none"] .shot-copy { display: none; }
      .subtitle-stack { position: absolute; left: ${safeInset}; right: ${safeInset}; bottom: ${config.subtitlePlacement === "lower_third" ? "20%" : "7%"}; z-index: 3; display: grid; gap: 10px; justify-items: center; }
      .subtitle-cue { max-width: 92%; border-radius: 16px; background: rgba(0,0,0,.76); padding: 12px 18px; font-size: ${subtitleFontSizePx}px; font-weight: 700; line-height: 1.18; text-align: center; opacity: 1; box-shadow: 0 8px 26px rgba(0,0,0,.28); }
      [data-subtitle-preset="minimal_shadow"] .subtitle-cue { background: transparent; box-shadow: none; text-shadow: 0 4px 12px rgba(0,0,0,.9); }
      [data-subtitle-preset="creator_pop"] .subtitle-cue { border-radius: 999px; background: rgba(255,255,255,.92); color: #020617; transform: scale(.94); }
      [data-subtitle-preset="karaoke_word"] .subtitle-cue { background: rgba(0,0,0,.7); color: #facc15; }
      [data-subtitle-preset="highlight_bar"] .subtitle-cue { background: linear-gradient(transparent 50%, rgba(250,204,21,.84) 50%); box-shadow: none; text-shadow: 0 4px 10px rgba(0,0,0,.86); }
      [data-subtitle-preset="lower_third"] .subtitle-stack { bottom: 17%; justify-items: start; }
      [data-subtitle-preset="lower_third"] .subtitle-cue { max-width: 78%; border-left: 8px solid #38bdf8; border-radius: 12px; background: rgba(15,23,42,.82); text-align: left; }
      [data-subtitle-preset="cinematic_wide"] .subtitle-cue { width: 100%; max-width: 100%; border-radius: 0; background: rgba(0,0,0,.58); }
      [data-subtitle-preset="neon_glow"] .subtitle-cue { border: 1px solid rgba(34,211,238,.55); background: rgba(2,6,23,.78); color: #cffafe; box-shadow: 0 0 30px rgba(34,211,238,.32); }
      [data-subtitle-preset="review_bubble"] .subtitle-cue { border-radius: 24px 24px 24px 6px; background: rgba(255,255,255,.94); color: #0f172a; }
      [data-subtitle-preset="no_subtitle_style"] .subtitle-stack { display: none; }
      [data-has-subtitles="true"] .shot-copy { bottom: 25% !important; max-height: 66% !important; overflow: hidden !important; }
      [data-has-subtitles="true"] .hook-layer { bottom: 26% !important; overflow: hidden !important; }
      [data-has-subtitles="true"][data-subtitle-preset="lower_third"] .shot-copy { bottom: 34% !important; max-height: 55% !important; }
      [data-has-subtitles="true"][data-subtitle-preset="lower_third"] .hook-layer { bottom: 36% !important; }
      [data-has-subtitles="true"] [data-overlay-preset="ugc_center_stack"] .shot-copy { top: 14% !important; transform: none !important; }
      [data-has-subtitles="true"] [data-overlay-preset="white_intro_card"] .shot-copy { inset: 6% 7% 25% !important; justify-content: center !important; }
      [data-has-subtitles="true"] [data-overlay-preset="feature_cards"] .shot-copy,
      [data-has-subtitles="true"] [data-overlay-preset="badge_cascade"] .shot-copy { top: 8% !important; left: 7% !important; right: 7% !important; width: auto !important; max-width: none !important; }
      [data-has-subtitles="true"] [data-overlay-preset="badge_cascade"] .shot-line { max-width: calc(100% - 80px) !important; }
      [data-has-subtitles="true"] [data-overlay-preset="badge_cascade"] .shot-line:nth-child(2) { transform: translateX(32px) !important; }
      [data-has-subtitles="true"] [data-overlay-preset="badge_cascade"] .shot-line:nth-child(n+3) { transform: translateX(64px) !important; }
      [data-has-subtitles="true"] [data-overlay-preset="price_impact"] .shot-copy,
      [data-has-subtitles="true"] [data-overlay-preset="hero_price_billboard"] .shot-copy,
      [data-has-subtitles="true"] [data-overlay-preset="lower_third_review"] .shot-copy { bottom: 33% !important; }
      .hook-layer { position: absolute; left: ${safeInset}; right: ${safeInset}; top: 8%; bottom: 20%; z-index: 20; display: flex; flex-direction: column; justify-content: space-between; gap: 14px; text-align: left; text-shadow: 0 5px 24px rgba(0,0,0,.5); pointer-events: none; }
      .hook-stack, .hook-chip { position: relative; z-index: 1; }
      .hook-stack { display: grid; justify-items: start; gap: 14px; }
      .hook-main { width: fit-content; max-width: 100%; border-radius: 22px; background: #f8fafc; color: #020617; padding: 22px 28px; font-size: 58px; font-weight: 900; line-height: 1.08; }
      .hook-sub { width: fit-content; max-width: 100%; border-radius: 999px; background: #f59e0b; color: #111827; padding: 14px 22px; font-size: 36px; font-weight: 800; line-height: 1.12; text-shadow: none; }
      .hook-chip { width: fit-content; max-width: 78%; border-radius: 20px; background: rgba(255,255,255,.94); color: #020617; padding: 16px 22px; font-size: 30px; font-weight: 900; line-height: 1.12; text-shadow: none; box-shadow: 0 20px 50px rgba(2,6,23,.25); }
      [data-overlay-preset="kinetic_bold_hook"].hook-layer { left: 0; right: 0; top: 0; bottom: 0; box-sizing: border-box; padding: 4% 6% 22%; }
      [data-overlay-preset="kinetic_bold_hook"].hook-layer::before { content: ""; position: absolute; inset: 0; z-index: 0; background: linear-gradient(90deg, rgba(2,6,23,.9) 0 53%, rgba(2,6,23,.18) 54% 100%), linear-gradient(135deg, transparent 0 53%, rgba(250,204,21,.9) 54% 78%, transparent 79% 100%); pointer-events: none; }
      [data-overlay-preset="kinetic_bold_hook"] .hook-main { max-width: 72%; border-radius: 0; background: transparent; padding: 0; color: #fff; font-size: 74px; text-shadow: 0 7px 0 rgba(0,0,0,.52), 0 12px 36px rgba(0,0,0,.48); }
      [data-overlay-preset="kinetic_bold_hook"] .hook-sub { max-width: 92%; border-radius: 22px; background: #facc15; color: #020617; padding: 18px 24px; font-size: 42px; font-weight: 900; transform: rotate(-2deg); }
      [data-overlay-preset="kinetic_bold_hook"] .hook-chip { max-width: 72%; border-radius: 18px; background: rgba(255,255,255,.94); color: #020617; font-size: 30px; transform: rotate(-1deg); }
      [data-overlay-preset="creator_top_punch"].hook-layer { left: 0; right: 0; top: 0; bottom: 0; box-sizing: border-box; justify-content: flex-start; align-items: center; padding: 5% 8% 24%; text-align: center; }
      [data-overlay-preset="creator_top_punch"].hook-layer::before { content: ""; position: absolute; inset: 0; z-index: 0; background: linear-gradient(180deg, rgba(2,6,23,.2), rgba(2,6,23,.02) 46%, rgba(2,6,23,.42)); pointer-events: none; }
      [data-overlay-preset="creator_top_punch"] .hook-stack { justify-items: center; gap: 0; }
      [data-overlay-preset="creator_top_punch"] .hook-main,
      [data-overlay-preset="creator_top_punch"] .hook-sub,
      [data-overlay-preset="creator_top_punch"] .hook-chip { max-width: 92%; border-radius: 0; background: transparent; padding: 0; box-shadow: none; color: #fff; font-weight: 950; line-height: 1.02; text-align: center; text-shadow: 0 4px 0 #020617, 0 8px 18px rgba(2,6,23,.55); -webkit-text-stroke: 2px #020617; text-stroke: 2px #020617; }
      [data-overlay-preset="creator_top_punch"] .hook-main { color: #a7f3d0; font-size: 70px; }
      [data-overlay-preset="creator_top_punch"] .hook-sub { font-size: 62px; }
      [data-overlay-preset="creator_top_punch"] .hook-chip { margin-top: 10px; font-size: 42px; }
      [data-overlay-preset="ugc_center_stack"].hook-layer { left: 0; right: 0; top: 0; bottom: 0; box-sizing: border-box; justify-content: center; align-items: center; padding: 0 7% 18%; text-align: center; }
      [data-overlay-preset="ugc_center_stack"].hook-layer::before { content: ""; position: absolute; inset: 0; z-index: 0; background: linear-gradient(180deg, rgba(2,6,23,.08), rgba(2,6,23,.04) 44%, rgba(2,6,23,.34)); pointer-events: none; }
      [data-overlay-preset="ugc_center_stack"] .hook-stack { justify-items: center; gap: 0; transform: translateY(-6%); }
      [data-overlay-preset="ugc_center_stack"] .hook-main,
      [data-overlay-preset="ugc_center_stack"] .hook-sub,
      [data-overlay-preset="ugc_center_stack"] .hook-chip { max-width: 96%; border-radius: 0; background: transparent; padding: 0; box-shadow: none; color: #f8fafc; font-weight: 950; line-height: 1.02; text-align: center; text-shadow: 0 4px 0 rgba(2,6,23,.82), 0 10px 22px rgba(2,6,23,.46); -webkit-text-stroke: 2px rgba(2,6,23,.86); text-stroke: 2px rgba(2,6,23,.86); }
      [data-overlay-preset="ugc_center_stack"] .hook-main { font-size: 74px; }
      [data-overlay-preset="ugc_center_stack"] .hook-sub { color: #fbbf24; font-size: 78px; }
      [data-overlay-preset="ugc_center_stack"] .hook-chip { display: none; }
      [data-overlay-preset="white_intro_card"].hook-layer { left: 0; right: 0; top: 0; bottom: 0; box-sizing: border-box; justify-content: center; align-items: center; padding: 0 10% 10%; text-align: center; text-shadow: 0 10px 28px rgba(15,23,42,.14); }
      [data-overlay-preset="white_intro_card"].hook-layer::before { content: ""; position: absolute; inset: 0; z-index: 0; background: #f1f5f9; pointer-events: none; }
      [data-overlay-preset="white_intro_card"] .hook-stack { justify-items: center; gap: 8px; }
      [data-overlay-preset="white_intro_card"] .hook-stack::before { content: ""; width: 118px; height: 86px; border-radius: 999px; background: radial-gradient(circle at 28% 42%, #2563eb 0 26%, transparent 27%), radial-gradient(circle at 68% 28%, #3b82f6 0 18%, transparent 19%), radial-gradient(circle at 56% 72%, #2563eb 0 18%, transparent 19%); filter: drop-shadow(0 14px 26px rgba(37,99,235,.18)); }
      [data-overlay-preset="white_intro_card"] .hook-main,
      [data-overlay-preset="white_intro_card"] .hook-sub,
      [data-overlay-preset="white_intro_card"] .hook-chip { max-width: 92%; border-radius: 0; background: transparent; padding: 0; box-shadow: none; color: #111827; font-weight: 950; line-height: 1.04; text-align: center; text-shadow: 0 10px 28px rgba(15,23,42,.14); }
      [data-overlay-preset="white_intro_card"] .hook-main { font-size: 76px; }
      [data-overlay-preset="white_intro_card"] .hook-sub { color: #334155; font-size: 48px; }
      [data-overlay-preset="white_intro_card"] .hook-chip { display: none; }
      [data-overlay-preset="tech_signal_map"].hook-layer { left: 0; right: 0; top: 0; bottom: 0; box-sizing: border-box; justify-content: flex-start; align-items: stretch; overflow: hidden; padding: 6% 7% 18%; text-align: center; }
      [data-overlay-preset="tech_signal_map"].hook-layer::before { content: ""; position: absolute; inset: 0; z-index: 0; background: radial-gradient(circle at 50% 36%, rgba(34,211,238,.34), transparent 22%), radial-gradient(circle at 24% 70%, rgba(251,146,60,.2), transparent 24%), linear-gradient(180deg, rgba(2,6,23,.92), rgba(15,23,42,.8)); pointer-events: none; }
      [data-overlay-preset="tech_signal_map"].hook-layer::after { content: ""; position: absolute; left: 8%; right: 8%; top: 42%; height: 2px; background: linear-gradient(90deg, transparent, rgba(34,211,238,.9), rgba(251,146,60,.9), transparent); box-shadow: 0 0 34px rgba(34,211,238,.42); }
      [data-overlay-preset="tech_signal_map"] .hook-stack { justify-items: center; gap: 0; }
      [data-overlay-preset="tech_signal_map"] .hook-main,
      [data-overlay-preset="tech_signal_map"] .hook-sub,
      [data-overlay-preset="tech_signal_map"] .hook-chip { box-sizing: border-box; width: 100%; max-width: 100%; overflow: hidden; white-space: nowrap; text-overflow: clip; border-radius: 0; background: transparent; padding: 0; box-shadow: none; color: #f8fafc; font-weight: 950; line-height: 1.04; letter-spacing: 0; text-align: center; text-shadow: 0 0 28px rgba(34,211,238,.48), 0 4px 0 rgba(2,6,23,.95); }
      [data-overlay-preset="tech_signal_map"] .hook-main { color: #22d3ee; font-size: 54px; }
      [data-overlay-preset="tech_signal_map"] .hook-sub { color: #fb923c; font-size: 48px; }
      [data-overlay-preset="tech_signal_map"] .hook-chip { margin: 34% auto 0; width: min(78%, 720px); border: 1px solid rgba(34,211,238,.42); border-radius: 16px; background: rgba(2,6,23,.58); padding: 12px 16px; color: #cffafe; font-size: 30px; }
      @keyframes overlayCopyLifetime { 0%, 88% { opacity: 1; } 100% { opacity: 0; } }
      @keyframes shotIn { from { opacity: 0; transform: scale(1.035); } to { opacity: 1; transform: scale(1); } }
      @keyframes lineIn { from { opacity: 0; transform: translateY(28px) scale(.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
      @keyframes textSlideRightToLeft { from { opacity: 0; transform: translateX(100%) scale(.98); } 72% { opacity: 1; transform: translateX(-2%) scale(1.015); } to { opacity: 1; transform: translateX(0) scale(1); } }
      @keyframes textSlideLeftToRight { from { opacity: 0; transform: translateX(-84%) scale(.98); } 72% { opacity: 1; transform: translateX(2%) scale(1.015); } to { opacity: 1; transform: translateX(0) scale(1); } }
      @keyframes textPopScale { 0% { opacity: 0; transform: scale(.72); } 68% { opacity: 1; transform: scale(1.08); } 100% { opacity: 1; transform: scale(1); } }
      @keyframes textWipeReveal { from { opacity: 1; clip-path: inset(0 100% 0 0); transform: translateX(14px); } to { opacity: 1; clip-path: inset(0 0 0 0); transform: translateX(0); } }
      @keyframes textStaggerRise { from { opacity: 0; transform: translateY(34px) scale(.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
      @keyframes floatProduct { 0%,100% { transform: scale(1.02) translateY(0); } 50% { transform: scale(1.055) translateY(-16px); } }
      .motion-item { --motion-delay: 0s; transform-origin: left center; }
      .shot.is-active { opacity: 1; animation: shotIn .38s ease-out both; }
      .shot.is-active .overlay-copy-layer { animation: overlayCopyLifetime 3.2s linear both; }
      .shot.is-active[data-shot-copy-deferred="after-hook"] .overlay-copy-layer { animation: overlayCopyLifetime 3.2s linear 3s forwards; }
      .source-video.is-active { animation: floatProduct ${Math.max(shotDurationAverage(config), 4)}s ease-in-out infinite; }
      .shot.is-active .shot-line { animation: textStaggerRise .52s cubic-bezier(.22,1,.36,1) both; }
      .shot.is-active .line-2 { animation-delay: .16s; }
      .shot.is-active .line-3 { animation-delay: .28s; }
      .shot.is-active .line-4 { animation-delay: .42s; }
      .hook-layer[data-text-motion-preset="stagger_rise"] .motion-item,
      .shot.is-active[data-text-motion-preset="stagger_rise"] .motion-item { animation: textStaggerRise .58s cubic-bezier(.22,1,.36,1) both; animation-delay: var(--motion-delay); }
      .hook-layer[data-text-motion-preset="slide_right_to_left"] .motion-item,
      .shot.is-active[data-text-motion-preset="slide_right_to_left"] .motion-item { animation: textSlideRightToLeft .68s cubic-bezier(.18,.9,.24,1) both; animation-delay: var(--motion-delay); }
      .hook-layer[data-text-motion-preset="slide_left_to_right"] .motion-item,
      .shot.is-active[data-text-motion-preset="slide_left_to_right"] .motion-item { animation: textSlideLeftToRight .68s cubic-bezier(.18,.9,.24,1) both; animation-delay: var(--motion-delay); }
      .hook-layer[data-text-motion-preset="pop_scale"] .motion-item,
      .shot.is-active[data-text-motion-preset="pop_scale"] .motion-item { animation: textPopScale .62s cubic-bezier(.18,.9,.24,1) both; animation-delay: var(--motion-delay); }
      .hook-layer[data-text-motion-preset="wipe_reveal"] .motion-item,
      .shot.is-active[data-text-motion-preset="wipe_reveal"] .motion-item { animation: textWipeReveal .72s cubic-bezier(.22,1,.36,1) both; animation-delay: var(--motion-delay); }
      [data-text-motion-preset="none"] .motion-item { animation: none !important; opacity: 1; clip-path: none; transform: none; }
      .shot-bounce_price.is-active .shot-line:first-child { background: #111827; color: #facc15; transform-origin: left center; }
      .shot-glow_feature.is-active .shot-line:first-child { box-shadow: 0 0 38px rgba(45,212,191,.48); }
      .subtitle-cue.is-active { opacity: 1; }
    </style>
  </head>
  <body>
    <div id="stage" data-composition-id="ssp-marketplace-captioned-final-composite" data-overlay-preset="${escapeHtml(config.overlayPreset)}" data-subtitle-preset="${escapeHtml(config.subtitlePreset)}" data-has-subtitles="${config.burnInSubtitles && config.subtitlePreset !== "no_subtitle_style" ? "true" : "false"}"
      data-start="0" data-width="${config.width}" data-height="${config.height}" data-duration="${config.finalVideoLengthSec}" data-timeline-hash="${escapeHtml(timeline.timelineHash)}" data-audio-event-map-hash="${escapeHtml(String(config.audioEventMapHash ?? ""))}">
      ${shotHtml}
      ${hook}
      ${audioHtml}
      <script>
        window.__hyperframesFinalCompositeConfig = ${JSON.stringify({
          ...renderConfig,
          creativeTimeline: timeline,
          compositionInputHash: input.composition.provenance.compositionInputHash,
        })};
        (function () {
          var shots = Array.prototype.slice.call(document.querySelectorAll(".shot"));
          var sourceVideos = Array.prototype.slice.call(document.querySelectorAll(".source-video"));
          var shotWindowById = ${JSON.stringify(Object.fromEntries(
            timeline.entries.map(entry => [
              entry.shotId,
              {
                start: entry.absoluteStartSec,
                duration: entry.durationSec,
              },
            ])
          ))};
          function setTime(t) {
            sourceVideos.forEach(function (video) {
              var start = Number(video.dataset.start || 0);
              var duration = Number(video.dataset.duration || 0);
              var mediaStart = Number(video.dataset.mediaStart || 0);
              var local = t - start;
              var active = local >= 0 && local < duration;
              video.classList.toggle("is-active", active);
              if (active && Math.abs((video.currentTime || 0) - (mediaStart + local)) > 0.25) {
                try { video.currentTime = Math.max(0, mediaStart + local); } catch (error) {}
              }
            });
            shots.forEach(function (shot) {
              var shotWindow = shotWindowById[shot.dataset.shotId] || { start: 0, duration: 0 };
              var start = Number(shotWindow.start || 0);
              var duration = Number(shotWindow.duration || 0);
              var local = t - start;
              var active = local >= 0 && local < duration;
              shot.classList.toggle("is-active", active);
              Array.prototype.slice.call(shot.querySelectorAll(".subtitle-cue")).forEach(function (cue) {
                var cueStart = Number(cue.dataset.cueStart || 0);
                var cueEnd = Number(cue.dataset.cueEnd || 0);
                cue.classList.toggle("is-active", active && t >= cueStart && t < cueEnd);
              });
            });
          }
          window.__timelines = window.__timelines || {};
          window.__timelines["ssp-marketplace-captioned-final-composite"] = {
            timelineHash: ${JSON.stringify(timeline.timelineHash)},
            entries: ${JSON.stringify(timeline.entries)},
            duration: function () { return ${Number(config.finalVideoLengthSec)}; },
            seek: function (seconds) { setTime(Number(seconds) || 0); return this; },
            pause: function () { return this; }
          };
          setTime(0);
          window.__playerReady = true;
          window.__renderReady = true;
        })();
      </script>
    </div>
  </body>
</html>`;
}

function shotDurationAverage(config: HyperframesFinalCompositeConfig): number {
  if (config.shots.length === 0) return 8;
  return config.shots.reduce((sum, shot) => sum + shot.durationSec, 0) / config.shots.length;
}

export function getHyperframesCompositionInputHash(
  input: HyperframesCompositionInput
): string {
  return input.provenance.compositionInputHash;
}
