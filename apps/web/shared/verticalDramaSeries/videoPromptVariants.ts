import { z } from "zod";

import { canonicalJsonStringify, sha256Hex } from "./artifacts";
import { videoShotMediaBundleSchema } from "../verticalDramaShotMedia";

/** Additive JSONB contract for one clip's Legacy/Enhanced prompt variants. */
export const VIDEO_PROMPT_VARIANT_STORE_VERSION =
  "vd-video-prompt-variants/1" as const;
export const videoPromptVariantIdSchema = z.enum(["legacy", "enhanced"]);
export type VideoPromptVariantId = z.infer<typeof videoPromptVariantIdSchema>;

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/i);
const jsonObjectSchema = z.record(z.string(), z.unknown());

const boundedPromptText = z.string().trim().max(40_000);

const promptBundleFields = {
  prompt: boundedPromptText.min(1),
  negativeMotionPrompt: boundedPromptText.optional(),
  dialogue: z.array(z.unknown()).optional(),
  requiredDisclosure: z.string().optional(),
  audioDirection: z.string().optional(),
  promptModelTarget: jsonObjectSchema.optional(),
  frameAnalysis: jsonObjectSchema.optional(),
  castPositionLock: z.unknown().optional(),
  motionProfile: z.unknown().optional(),
  effectiveRisk: z.string().optional(),
  motionContractStatus: z.string().optional(),
  promptQuality: z.unknown().optional(),
};

const modelProvenanceSchema = z
  .object({
    sourceImageModelId: z.string().min(1).optional(),
    authoringModelId: z.string().min(1),
    targetVideoModelId: z.string().min(1),
    /** Exact catalog capability snapshot used for authoring/apply gates. */
    targetModelSnapshot: jsonObjectSchema,
    targetModelFingerprint: hashSchema,
    providerProfileId: z.string().min(1),
    providerPlanHash: hashSchema,
  })
  .strict();

const diagnosticSchema = z
  .object({
    warnings: z.array(z.string().trim().max(400)).max(32).default([]),
    assumptions: z.array(z.string().trim().max(400)).max(32).default([]),
    researchProvenance: z.array(z.record(z.string(), z.unknown())).max(32).default([]),
  })
  .strict();

const enhancedVariantSchema = z
  .object({
    variantId: z.literal("enhanced"),
    status: z.enum(["ready", "stale", "user_edited", "invalid"]),
    ...promptBundleFields,
    mediaBundle: videoShotMediaBundleSchema,
    inputFingerprint: hashSchema,
    terminalPromptHash: hashSchema,
    revision: z.number().int().positive(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
    skillVersion: z.string().min(1),
    adapterVersion: z.string().min(1),
    sdkVersion: z.string().min(1),
    ...modelProvenanceSchema.shape,
    ...diagnosticSchema.shape,
  })
  .passthrough();

const legacyVariantSchema = z
  .object({
    variantId: z.literal("legacy"),
    status: z.enum(["ready", "stale", "invalid"]),
    ...promptBundleFields,
    inputFingerprint: hashSchema,
    revision: z.number().int().positive(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .passthrough();

export const videoPromptVariantStoreSchema = z
  .object({
    version: z.literal(VIDEO_PROMPT_VARIANT_STORE_VERSION),
    activeVariant: videoPromptVariantIdSchema,
    revision: z.number().int().positive(),
    variantGroupFingerprint: hashSchema.optional(),
    variants: z
      .object({
        legacy: legacyVariantSchema.optional(),
        enhanced: enhancedVariantSchema.optional(),
      })
      .strict(),
  })
  .strict();

export type VideoPromptVariantStore = z.infer<
  typeof videoPromptVariantStoreSchema
>;
export type VideoPromptVariant =
  | z.infer<typeof legacyVariantSchema>
  | z.infer<typeof enhancedVariantSchema>;

export type VideoPromptVariantClip = Record<string, unknown>;

export type VideoPromptRenderProvenance = {
  variantId: VideoPromptVariantId;
  promptHash: string;
  targetVideoModelId?: string;
  targetModelFingerprint?: string;
  mediaBundleFingerprint?: string;
  variantGroupFingerprint?: string;
  capturedAt: string;
};

export type VideoPromptVariantRead =
  | {
      kind: "legacy_compatibility";
      activeVariant: "legacy";
      activeProjection: VideoPromptVariantClip;
      store: null;
      reason?: undefined;
    }
  | {
      kind: "ready";
      activeVariant: VideoPromptVariantId;
      activeProjection: VideoPromptVariantClip;
      store: VideoPromptVariantStore;
      reason?: undefined;
    }
  | {
      kind: "invalid";
      activeVariant: "legacy";
      activeProjection: VideoPromptVariantClip;
      store: null;
      reason: string;
    };

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function computeVideoPromptVariantFingerprint(value: unknown): string {
  return sha256Hex(canonicalJsonStringify(value));
}

function projectVariant(
  clip: VideoPromptVariantClip,
  variant: VideoPromptVariant
): VideoPromptVariantClip {
  const projection = { ...clip };
  const fields = Object.keys(promptBundleFields);
  for (const field of fields) {
    if (field in variant)
      projection[field] = variant[field as keyof VideoPromptVariant];
  }
  return projection;
}

function clipPromptBundle(
  clip: VideoPromptVariantClip
): Record<string, unknown> {
  return Object.fromEntries(
    Object.keys(promptBundleFields)
      .filter(field => field in clip)
      .map(field => [field, clip[field]])
  );
}

export function buildVideoPromptRenderProvenance(input: {
  clip: VideoPromptVariantClip;
  store: VideoPromptVariantStore;
  now?: string;
}): VideoPromptRenderProvenance | null {
  const active = input.store.variants[input.store.activeVariant];
  if (!active || typeof active.prompt !== "string" || !active.prompt.trim()) return null;
  const enhanced = active.variantId === "enhanced" ? active : undefined;
  const activeRecord = active as unknown as Record<string, unknown>;
  return {
    variantId: input.store.activeVariant,
    promptHash: computeVideoPromptVariantFingerprint({ prompt: active.prompt }),
    ...(enhanced
      ? {
          targetVideoModelId: enhanced.targetVideoModelId,
          targetModelFingerprint: enhanced.targetModelFingerprint,
          mediaBundleFingerprint: isObject(enhanced.mediaBundle)
            ? String(enhanced.mediaBundle.bundleFingerprint ?? "") || undefined
            : undefined,
        }
      : {
          targetVideoModelId: typeof activeRecord.selectedVideoModelId === "string"
            ? activeRecord.selectedVideoModelId
            : undefined,
        }),
    capturedAt: input.now ?? new Date().toISOString(),
  };
}

/** Reconcile an existing render marker against a newly active projection. */
export function reconcileVideoTaskPromptProvenance(input: {
  clip: VideoPromptVariantClip;
  store: VideoPromptVariantStore;
  currentTargetVideoModelId?: string;
  currentTargetModelFingerprint?: string;
}): VideoPromptVariantClip["videoTask"] {
  const task = input.clip.videoTask;
  if (!isObject(task) || typeof task.videoUrl !== "string" || !task.videoUrl.trim()) return task;
  const provenance = task.promptProvenance;
  if (!isObject(provenance)) {
    return { ...task, provenanceUnknown: true, promptMismatch: undefined };
  }
  const expected = buildVideoPromptRenderProvenance({ clip: input.clip, store: input.store });
  if (!expected) return { ...task, provenanceUnknown: true, promptMismatch: undefined };
  const matches = provenance.variantId === expected.variantId &&
    provenance.promptHash === expected.promptHash &&
    (!input.currentTargetVideoModelId || !expected.targetVideoModelId || provenance.targetVideoModelId === input.currentTargetVideoModelId) &&
    (!input.currentTargetModelFingerprint || !expected.targetModelFingerprint || provenance.targetModelFingerprint === input.currentTargetModelFingerprint);
  return { ...task, promptMismatch: !matches, provenanceUnknown: false };
}

export function buildLegacyVideoPromptVariant(input: {
  clip: VideoPromptVariantClip;
  selectedVideoModelId?: string;
  inputFingerprint: string;
  createdAt: string;
}): z.infer<typeof legacyVariantSchema> {
  const bundle = clipPromptBundle(input.clip);
  const variant = {
    variantId: "legacy" as const,
    status: "ready" as const,
    ...bundle,
    inputFingerprint: input.inputFingerprint,
    revision: 1,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    ...(input.selectedVideoModelId
      ? { selectedVideoModelId: input.selectedVideoModelId }
      : {}),
  };
  return legacyVariantSchema.parse(variant);
}

/**
 * Legacy regeneration replaces the active clip object. Carry the existing
 * variant store across that replacement so an old Legacy writer cannot erase
 * Enhanced history; the new Legacy snapshot becomes active and the prior
 * Enhanced snapshot is explicitly stale until regenerated.
 */
export function preserveVideoPromptVariantsOnLegacyReplacement(input: {
  previousClip: VideoPromptVariantClip;
  nextClip: VideoPromptVariantClip;
  selectedVideoModelId?: string;
  now?: string;
}): VideoPromptVariantClip {
  const parsed = readVideoPromptVariantStore(
    input.previousClip.videoPromptVariants,
    input.previousClip,
  );
  if (!parsed.store) return input.nextClip;
  const now = input.now ?? new Date().toISOString();
  const legacy = buildLegacyVideoPromptVariant({
    clip: input.nextClip,
    selectedVideoModelId: input.selectedVideoModelId,
    inputFingerprint: computeVideoPromptVariantFingerprint({
      variantId: "legacy",
      clip: input.nextClip,
      selectedVideoModelId: input.selectedVideoModelId ?? null,
    }),
    createdAt: now,
  });
  const enhanced = parsed.store.variants.enhanced
    ? { ...parsed.store.variants.enhanced, status: "stale" as const, updatedAt: now }
    : undefined;
  return {
    ...input.nextClip,
    videoPromptVariants: {
      ...parsed.store,
      activeVariant: "legacy",
      revision: parsed.store.revision + 1,
      variants: {
        legacy,
        ...(enhanced ? { enhanced } : {}),
      },
    },
  };
}

/**
 * Preserve additive variant history when a legacy caller replaces an entire
 * motion-prompt pack. This is intentionally best-effort per clip: a new clip
 * that already carries its own store wins, while an unchanged clip identity
 * inherits the old store and makes the regenerated Legacy projection active.
 * The old pack shape and its ordering remain otherwise untouched.
 */
export function preserveVideoPromptVariantsOnPackReplacement(input: {
  previousPack: { clips: VideoPromptVariantClip[] };
  nextPack: { clips: VideoPromptVariantClip[]; selectedVideoModelId?: string };
  now?: string;
}): typeof input.nextPack {
  const previousClips = input.previousPack.clips;
  const usedPrevious = new Set<number>();
  const nextClips = input.nextPack.clips.map(nextClip => {
    const nextRecord = nextClip as VideoPromptVariantClip;
    if (nextRecord.videoPromptVariants !== undefined || !String(nextRecord.prompt ?? "").trim()) {
      return nextClip;
    }
    const nextClipNumber = Number(nextRecord.clipNumber);
    const previousIndex = previousClips.findIndex((candidate, index) => {
      if (usedPrevious.has(index)) return false;
      const previous = candidate as VideoPromptVariantClip;
      if (Number(previous.clipNumber) === nextClipNumber && Number.isFinite(nextClipNumber)) return true;
      const previousShotNumbers = Array.isArray(previous.sourceShotNumbers)
        ? previous.sourceShotNumbers.filter((shot): shot is number => typeof shot === "number")
        : [];
      const nextShotNumbers = Array.isArray(nextRecord.sourceShotNumbers)
        ? nextRecord.sourceShotNumbers.filter((shot): shot is number => typeof shot === "number")
        : [];
      if (previousShotNumbers.some(shot => nextShotNumbers.includes(shot))) return true;
      return previous.parentShotNumber !== undefined &&
        previous.parentShotNumber === nextRecord.parentShotNumber;
    });
    if (previousIndex < 0) return nextClip;
    usedPrevious.add(previousIndex);
    return preserveVideoPromptVariantsOnLegacyReplacement({
      previousClip: previousClips[previousIndex],
      nextClip,
      selectedVideoModelId: input.nextPack.selectedVideoModelId,
      now: input.now,
    });
  });
  return { ...input.nextPack, clips: nextClips };
}

/** Mark only Enhanced snapshots stale after a canonical input change. */
export function markEnhancedVideoPromptVariantsStale(
  pack: { clips: VideoPromptVariantClip[] },
  now = new Date().toISOString(),
): typeof pack {
  let changed = false;
  const clips = pack.clips.map(clip => {
    const record = clip as VideoPromptVariantClip;
    const rawStore = record.videoPromptVariants;
    if (!isObject(rawStore)) return clip;
    const parsed = readVideoPromptVariantStore(rawStore, record);
    if (!parsed.store?.variants.enhanced || parsed.store.variants.enhanced.status === "stale") return clip;
    changed = true;
    return {
      ...record,
      videoPromptVariants: {
        ...parsed.store,
        revision: parsed.store.revision + 1,
        variants: {
          ...parsed.store.variants,
          enhanced: { ...parsed.store.variants.enhanced, status: "stale" as const, updatedAt: now },
        },
      },
    };
  });
  return changed ? { ...pack, clips } : pack;
}

/**
 * Invalidate a stored variant without deleting the clip. Legacy-only clips
 * are intentionally left to their existing caller behavior; this helper is
 * for opted-in clips whose approved visual input changed and whose history
 * must remain recoverable.
 */
export function invalidateVideoPromptVariantsOnInputChange(
  clip: VideoPromptVariantClip,
  reason: string,
  now = new Date().toISOString(),
): VideoPromptVariantClip {
  const parsed = readVideoPromptVariantStore(clip.videoPromptVariants, clip);
  if (!parsed.store) return clip;
  const stale = markEnhancedVideoPromptVariantsStale({ clips: [clip] }, now).clips[0];
  const task = stale.videoTask;
  return {
    ...stale,
    promptStaleReason: reason,
    promptStaleAt: now,
    ...(isObject(task) && typeof task.videoUrl === "string" && task.videoUrl.trim()
      ? {
          videoTask: task.promptProvenance
            ? { ...task, promptMismatch: true, provenanceUnknown: false }
            : { ...task, provenanceUnknown: true, promptMismatch: undefined },
        }
      : {}),
  };
}

export function buildVideoPromptVariantStore(input: {
  clip: VideoPromptVariantClip;
  enhanced: z.input<typeof enhancedVariantSchema>;
  selectedVideoModelId?: string;
  inputFingerprint: string;
  createdAt: string;
}): VideoPromptVariantStore {
  const legacy = buildLegacyVideoPromptVariant({
    clip: input.clip,
    selectedVideoModelId: input.selectedVideoModelId,
    inputFingerprint: input.inputFingerprint,
    createdAt: input.createdAt,
  });
  const enhanced = enhancedVariantSchema.parse(input.enhanced);
  return videoPromptVariantStoreSchema.parse({
    version: VIDEO_PROMPT_VARIANT_STORE_VERSION,
    activeVariant: "legacy",
    revision: 1,
    variants: { legacy, enhanced },
  });
}

/**
 * Build a store for a shot where Enhanced was authored before Legacy. The
 * missing Legacy variant is intentional; Enhanced must not manufacture a
 * Legacy prompt just to satisfy the shared variant schema.
 */
export function buildEnhancedOnlyVideoPromptVariantStore(input: {
  enhanced: z.input<typeof enhancedVariantSchema>;
}): VideoPromptVariantStore {
  const enhanced = enhancedVariantSchema.parse(input.enhanced);
  return videoPromptVariantStoreSchema.parse({
    version: VIDEO_PROMPT_VARIANT_STORE_VERSION,
    activeVariant: "enhanced",
    revision: 1,
    variants: { enhanced },
  });
}

export function readVideoPromptVariantStore(
  raw: unknown,
  clip: VideoPromptVariantClip
): VideoPromptVariantRead {
  if (raw === undefined || raw === null) {
    return {
      kind: "legacy_compatibility",
      activeVariant: "legacy",
      activeProjection: { ...clip },
      store: null,
    };
  }
  if (!isObject(raw) || raw.version !== VIDEO_PROMPT_VARIANT_STORE_VERSION) {
    return {
      kind: "invalid",
      activeVariant: "legacy",
      activeProjection: { ...clip },
      store: null,
      reason: "unsupported video prompt variant store version",
    };
  }
  const parsed = videoPromptVariantStoreSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      kind: "invalid",
      activeVariant: "legacy",
      activeProjection: { ...clip },
      store: null,
      reason: "malformed video prompt variant store",
    };
  }
  const variant = parsed.data.variants[parsed.data.activeVariant];
  if (!variant || variant.status === "invalid") {
    return {
      kind: "invalid",
      activeVariant: "legacy",
      activeProjection: { ...clip },
      store: null,
      reason: "active video prompt variant is missing or invalid",
    };
  }
  return {
    kind: "ready",
    activeVariant: parsed.data.activeVariant,
    activeProjection: projectVariant(clip, variant),
    store: parsed.data,
  };
}

export type ApplyValidation =
  | { ok: true; variant: VideoPromptVariant }
  | {
      ok: false;
      code: "PROMPT_VARIANT_STALE" | "PROMPT_VARIANT_CONFLICT";
      reason: string;
    };

export function validateVideoPromptVariantForApply(
  store: VideoPromptVariantStore,
  variantId: VideoPromptVariantId,
  expected?: {
    targetVideoModelId?: string;
    targetModelFingerprint?: string;
    mediaBundleFingerprint?: string;
    expectedRevision?: number;
  }
): ApplyValidation {
  const variant = store.variants[variantId];
  if (!variant || variant.status === "invalid") {
    return {
      ok: false,
      code: "PROMPT_VARIANT_STALE",
      reason: "variant is not ready",
    };
  }
  if (
    expected?.expectedRevision !== undefined &&
    expected.expectedRevision !== store.revision
  ) {
    return {
      ok: false,
      code: "PROMPT_VARIANT_CONFLICT",
      reason: "variant store revision changed",
    };
  }
  if (variantId === "enhanced") {
    const enhanced = variant;
    const target = enhanced.targetVideoModelId;
    const fingerprint = enhanced.targetModelFingerprint;
    const mediaFingerprint = isObject(enhanced.mediaBundle)
      ? enhanced.mediaBundle.bundleFingerprint
      : undefined;
    if (
      expected?.targetVideoModelId &&
      expected.targetVideoModelId !== target
    ) {
      return {
        ok: false,
        code: "PROMPT_VARIANT_STALE",
        reason: "target video model changed",
      };
    }
    if (
      expected?.targetModelFingerprint &&
      expected.targetModelFingerprint !== fingerprint
    ) {
      return {
        ok: false,
        code: "PROMPT_VARIANT_STALE",
        reason: "target model capability changed",
      };
    }
    if (
      expected?.mediaBundleFingerprint &&
      expected.mediaBundleFingerprint !== mediaFingerprint
    ) {
      return {
        ok: false,
        code: "PROMPT_VARIANT_STALE",
        reason: "shot media bundle changed",
      };
    }
  if (enhanced.status !== "ready") {
      return {
        ok: false,
        code: "PROMPT_VARIANT_STALE",
        reason: "enhanced variant needs finalization",
      };
    }
  }
  return { ok: true, variant };
}

export function applyVideoPromptVariant(
  clip: VideoPromptVariantClip,
  store: VideoPromptVariantStore,
  variantId: VideoPromptVariantId,
  options?: {
    expectedRevision?: number;
    currentTargetVideoModelId?: string;
    currentTargetModelFingerprint?: string;
    currentMediaBundleFingerprint?: string;
  }
): {
  activeVariant: VideoPromptVariantId;
  projection: VideoPromptVariantClip;
  store: VideoPromptVariantStore;
} {
  const validation = validateVideoPromptVariantForApply(store, variantId, {
    expectedRevision: options?.expectedRevision,
    targetVideoModelId: options?.currentTargetVideoModelId,
    targetModelFingerprint: options?.currentTargetModelFingerprint,
    mediaBundleFingerprint: options?.currentMediaBundleFingerprint,
  });
  if (!validation.ok)
    throw new Error(`${validation.code}: ${validation.reason}`);
  const nextStore = videoPromptVariantStoreSchema.parse({
    ...store,
    activeVariant: variantId,
    revision: store.revision + 1,
  });
  const projection = projectVariant(clip, validation.variant);
  if (projection.videoTask && isObject(projection.videoTask)) {
    projection.videoTask = reconcileVideoTaskPromptProvenance({
      clip: projection,
      store: nextStore,
      currentTargetVideoModelId: options?.currentTargetVideoModelId,
      currentTargetModelFingerprint: options?.currentTargetModelFingerprint,
    });
  }
  return {
    activeVariant: variantId,
    projection,
    store: nextStore,
  };
}

export function mergeVideoPromptVariantStore(input: {
  clip: VideoPromptVariantClip;
  existing: VideoPromptVariantStore;
  patch: {
    variants?: Partial<VideoPromptVariantStore["variants"]>;
    activeVariant?: VideoPromptVariantId;
  };
}): VideoPromptVariantStore {
  const next = {
    ...input.existing,
    ...(input.patch.activeVariant
      ? { activeVariant: input.patch.activeVariant }
      : {}),
    revision: input.existing.revision + 1,
    variants: {
      ...input.existing.variants,
      ...(input.patch.variants ?? {}),
    },
  };
  return videoPromptVariantStoreSchema.parse(next);
}
