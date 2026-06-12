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

export interface HyperframesCreativeTimelineEntry {
  shotId: string;
  shotIndex: number;
  absoluteStartSec: number;
  absoluteEndSec: number;
  durationSec: number;
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
      sourceMediaRef,
      sourceMediaHash: stableHash({
        sourceMediaRef,
        sourceVideoUrl: shot.sourceVideoUrl,
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
  >
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
  return {
    ffmpegAssFallback: true,
    fallbackQuality: unsupportedFeatures.length > 0 ? "partial" : "full",
    unsupportedFeatures,
  };
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
  const sanitizedShots = finalCompositeInput.shots.map((shot, index) => ({
    id: sanitizeHyperframesText(shot.id, 160) || `shot_${index + 1}`,
    index: shot.index,
    title: sanitizeHyperframesText(shot.title ?? "", 180),
    sourceVideoUrl: sanitizeHyperframesAssetRef(shot.sourceVideoUrl),
    sourceVideoRef: sanitizeHyperframesText(shot.sourceVideoRef ?? "", 512),
    startSec: shot.startSec,
    durationSec: shot.durationSec,
    endSec: shot.startSec + shot.durationSec,
    onScreenText: shot.onScreenText.map(line => sanitizeHyperframesText(line, 120)),
    subtitleCues: shot.subtitleCues.map(cue => ({
      startSec: cue.startSec,
      endSec: cue.endSec,
      text: sanitizeHyperframesText(cue.text, 360),
    })),
    animationPreset: shot.animationPreset,
    transition: shot.transition,
  }));
  const finalCompositeBase = {
    ...finalCompositeInput,
    styleBrief: sanitizeHyperframesText(finalCompositeInput.styleBrief, 1200),
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
    finalCompositeBase as HyperframesFinalCompositeConfig
  );
  const finalComposite = {
    ...finalCompositeBase,
    creativeTimeline,
    fallbackCapability,
    audioEventMapHash,
  };
  const compositionSeed = {
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
  const remainingAssetSlots = Math.max(0, 40 - assets.length);
  for (const [index, event] of finalComposite.audioEvents.slice(0, remainingAssetSlots).entries()) {
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
      builderVersion: "hyperframes_final_composite_builder_v1",
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
  const shotHtml = config.shots
    .map((shot, index) => {
      const lines = (config.includeShotText ? shot.onScreenText : []).filter(Boolean);
      const cues = config.burnInSubtitles ? shot.subtitleCues : [];
      const timelineEntry = timelineByShotId.get(shot.id);
      return `
      <section class="shot shot-${escapeHtml(shot.animationPreset)}" data-shot-id="${escapeHtml(shot.id)}" data-shot-index="${shot.index}" data-track-index="${shot.index}" data-start="${shot.startSec}" data-duration="${shot.durationSec}" data-media-start="0" data-timeline-hash="${escapeHtml(timelineEntry?.timelineHash ?? timeline.timelineHash)}">
        <video class="source-video" src="${escapeHtml(shot.sourceVideoUrl)}" preload="auto" muted playsinline></video>
        <div class="shade"></div>
        <div class="shot-copy">
          ${lines.map((line, lineIndex) => `<div class="shot-line line-${lineIndex + 1}">${escapeHtml(line)}</div>`).join("")}
        </div>
        <div class="subtitle-stack">
          ${cues.map((cue, cueIndex) => `<div class="subtitle-cue cue-${cueIndex + 1}" data-start="${cue.startSec}" data-end="${cue.endSec}">${escapeHtml(cue.text)}</div>`).join("")}
        </div>
      </section>`;
    })
    .join("\n");
  const hook = config.includeHookText
    ? `<div class="hook-layer" data-start="0" data-duration="3">
        <div class="hook-main">${escapeHtml(config.hookText || input.productTitle)}</div>
        ${config.supportingText ? `<div class="hook-sub">${escapeHtml(config.supportingText)}</div>` : ""}
      </div>`
    : "";
  const audioHtml = config.audioEvents
    .map(
      event =>
        `<audio class="audio-event" data-audio-role="${escapeHtml(event.role)}" data-visual-trigger="${escapeHtml(event.visualTrigger)}" data-start="${event.startSec}" data-duration="${event.durationSec ?? ""}" data-volume="${event.volume}" data-preset-id="${escapeHtml(event.presetId ?? "")}" src="${escapeHtml(event.assetRef)}" preload="metadata"></audio>`
    )
    .join("\n");
  return `<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      html, body { margin: 0; width: 100%; height: 100%; background: #050505; }
      body { font-family: ${fontStack}; }
      [data-composition-id] {
        position: relative;
        width: ${config.width}px;
        height: ${config.height}px;
        overflow: hidden;
        background: #050505;
        color: #fff;
      }
      .shot { position: absolute; inset: 0; opacity: 0; overflow: hidden; background: #050505; }
      .source-video { width: 100%; height: 100%; object-fit: cover; transform: scale(1.02); }
      .shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,.16), rgba(0,0,0,.08) 48%, rgba(0,0,0,.62)); pointer-events: none; }
      .shot-copy { position: absolute; left: ${safeInset}; right: ${safeInset}; top: 9%; display: grid; gap: 14px; text-shadow: 0 4px 18px rgba(0,0,0,.55); }
      .shot-line { display: inline-block; width: fit-content; max-width: 100%; border-radius: 20px; background: rgba(7, 12, 24, .74); padding: 18px 24px; font-size: 52px; font-weight: 800; line-height: 1.08; opacity: 0; transform: translateY(28px); }
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
      [data-overlay-preset="kinetic_bold_hook"] .shade { background: linear-gradient(180deg, rgba(2,6,23,.16), rgba(2,6,23,.68)); }
      [data-overlay-preset="kinetic_bold_hook"] .shot-copy { top: 7%; }
      [data-overlay-preset="kinetic_bold_hook"] .shot-line:first-child { background: rgba(2,6,23,.86); color: #fff; font-size: 76px; transform: rotate(-1deg); }
      [data-overlay-preset="kinetic_bold_hook"] .shot-line + .shot-line { background: #facc15; color: #020617; transform: rotate(-1deg); }
      [data-overlay-preset="spec_highlight"] .shot-copy { left: auto; top: 29%; right: ${safeInset}; justify-items: end; }
      [data-overlay-preset="spec_highlight"] .shot-line { border-radius: 999px; background: rgba(255,255,255,.9); color: #111827; font-size: 40px; box-shadow: 0 12px 32px rgba(15,23,42,.16); }
      [data-overlay-preset="electronics_spec_stack"] .shot-copy { left: auto; top: 24%; right: ${safeInset}; max-width: 48%; justify-items: end; }
      [data-overlay-preset="electronics_spec_stack"] .shot-line { border-radius: 999px; background: rgba(255,255,255,.92); color: #111827; font-size: 42px; box-shadow: 0 12px 32px rgba(15,23,42,.18); }
      [data-overlay-preset="split_product_specs"] .shot-copy { top: 10%; right: auto; max-width: 46%; }
      [data-overlay-preset="split_product_specs"] .shot-line { border-radius: 18px; background: rgba(255,255,255,.9); color: #0f172a; font-size: 44px; }
      [data-overlay-preset="neon_gaming_specs"] .shade { background: radial-gradient(circle at 70% 16%, rgba(34,211,238,.2), transparent 28%), linear-gradient(180deg, rgba(2,6,23,.2), rgba(2,6,23,.74)); }
      [data-overlay-preset="neon_gaming_specs"] .shot-copy { top: 10%; }
      [data-overlay-preset="neon_gaming_specs"] .shot-line { border: 1px solid rgba(34,211,238,.48); background: rgba(2,6,23,.72); color: #cffafe; box-shadow: 0 0 34px rgba(34,211,238,.28); }
      [data-overlay-preset="feature_cards"] .shot-copy { top: 25%; right: auto; max-width: 72%; }
      [data-overlay-preset="feature_cards"] .shot-line { background: rgba(2,6,23,.82); color: #fff; border: 1px solid rgba(255,255,255,.18); }
      [data-overlay-preset="badge_cascade"] .shot-copy { top: 22%; right: auto; max-width: 72%; }
      [data-overlay-preset="badge_cascade"] .shot-line { border-radius: 999px; background: rgba(15,23,42,.84); color: #fff; border: 1px solid rgba(255,255,255,.22); }
      [data-overlay-preset="lower_third_review"] .shot-copy { top: auto; bottom: 22%; right: auto; max-width: 76%; }
      [data-overlay-preset="lower_third_review"] .shot-line { border-radius: 18px; background: rgba(15,23,42,.76); color: #fff; font-size: 42px; }
      [data-overlay-preset="price_impact"] .shot-copy { top: auto; bottom: 12%; text-align: center; justify-items: center; }
      [data-overlay-preset="price_impact"] .shot-line:first-child { font-size: 42px; background: rgba(2,6,23,.88); color: #fff; }
      [data-overlay-preset="price_impact"] .shot-line:nth-child(2) { font-size: 92px; background: transparent; color: #facc15; text-shadow: 0 8px 0 rgba(120,53,15,.45), 0 12px 34px rgba(0,0,0,.5); }
      [data-overlay-preset="hero_price_billboard"] .shot-copy { top: auto; bottom: 10%; text-align: center; justify-items: center; }
      [data-overlay-preset="hero_price_billboard"] .shot-line:first-child { font-size: 44px; background: rgba(2,6,23,.9); color: #fff; }
      [data-overlay-preset="hero_price_billboard"] .shot-line:nth-child(2) { font-size: 104px; background: transparent; color: #facc15; text-shadow: 0 10px 0 rgba(120,53,15,.48), 0 14px 36px rgba(0,0,0,.55); }
      [data-overlay-preset="clean_subtitle"] .shot-copy,
      [data-overlay-preset="none"] .shot-copy { display: none; }
      .subtitle-stack { position: absolute; left: ${safeInset}; right: ${safeInset}; bottom: ${config.subtitlePlacement === "lower_third" ? "20%" : "7%"}; display: grid; gap: 10px; justify-items: center; }
      .subtitle-cue { max-width: 88%; border-radius: 16px; background: rgba(0,0,0,.76); padding: 12px 18px; font-size: 34px; font-weight: 700; line-height: 1.18; text-align: center; opacity: 0; box-shadow: 0 8px 26px rgba(0,0,0,.28); }
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
      .hook-layer { position: absolute; left: ${safeInset}; right: ${safeInset}; top: 8%; z-index: 20; display: grid; gap: 14px; text-align: left; text-shadow: 0 5px 24px rgba(0,0,0,.5); }
      .hook-main { width: fit-content; max-width: 100%; border-radius: 22px; background: #f8fafc; color: #020617; padding: 22px 28px; font-size: 58px; font-weight: 900; line-height: 1.08; }
      .hook-sub { width: fit-content; max-width: 100%; border-radius: 999px; background: #f59e0b; color: #111827; padding: 14px 22px; font-size: 36px; font-weight: 800; }
      @keyframes shotIn { from { opacity: 0; transform: scale(1.035); } to { opacity: 1; transform: scale(1); } }
      @keyframes lineIn { from { opacity: 0; transform: translateY(28px) scale(.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
      @keyframes floatProduct { 0%,100% { transform: scale(1.02) translateY(0); } 50% { transform: scale(1.055) translateY(-16px); } }
      .shot.is-active { opacity: 1; animation: shotIn .38s ease-out both; }
      .shot.is-active .source-video { animation: floatProduct ${Math.max(shotDurationAverage(config), 4)}s ease-in-out infinite; }
      .shot.is-active .shot-line { animation: lineIn .52s cubic-bezier(.22,1,.36,1) both; }
      .shot.is-active .line-2 { animation-delay: .16s; }
      .shot.is-active .line-3 { animation-delay: .28s; }
      .shot.is-active .line-4 { animation-delay: .42s; }
      .shot-bounce_price.is-active .shot-line:first-child { background: #111827; color: #facc15; transform-origin: left center; }
      .shot-glow_feature.is-active .shot-line:first-child { box-shadow: 0 0 38px rgba(45,212,191,.48); }
      .subtitle-cue.is-active { opacity: 1; }
    </style>
  </head>
  <body>
    <div id="stage" data-composition-id="ssp-marketplace-captioned-final-composite" data-overlay-preset="${escapeHtml(config.overlayPreset)}" data-subtitle-preset="${escapeHtml(config.subtitlePreset)}"
      data-start="0" data-width="${config.width}" data-height="${config.height}" data-duration="${config.finalVideoLengthSec}" data-timeline-hash="${escapeHtml(timeline.timelineHash)}" data-audio-event-map-hash="${escapeHtml(String(config.audioEventMapHash ?? ""))}">
      ${shotHtml}
      ${hook}
      ${audioHtml}
    </div>
    <script>
      window.__hyperframesFinalCompositeConfig = ${JSON.stringify({
        ...config,
        creativeTimeline: timeline,
        compositionInputHash: input.composition.provenance.compositionInputHash,
      })};
      (function () {
        var shots = Array.prototype.slice.call(document.querySelectorAll(".shot"));
        function setTime(t) {
          shots.forEach(function (shot) {
            var start = Number(shot.dataset.start || 0);
            var duration = Number(shot.dataset.duration || 0);
            var local = t - start;
            var active = local >= 0 && local < duration;
            shot.classList.toggle("is-active", active);
            var video = shot.querySelector("video");
            if (video && active && Math.abs((video.currentTime || 0) - local) > 0.25) {
              try { video.currentTime = Math.max(0, local); } catch (error) {}
            }
            Array.prototype.slice.call(shot.querySelectorAll(".subtitle-cue")).forEach(function (cue) {
              var cueStart = Number(cue.dataset.start || 0);
              var cueEnd = Number(cue.dataset.end || 0);
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
