import {
  buildSceneShotGroups,
  computeSceneMembershipHash,
  renderSceneContinuityLockBlock,
  type VdSceneShotGroup,
  type VdSceneVisualState,
} from "@shared/verticalDramaSeries/sceneContinuity";
import {
  readSceneVisualStatesFromPlan,
} from "./verticalDramaStartFrameGeneration";
import type { VerticalDramaStartFramePlan } from "@shared/verticalDramaSeries/contracts";
import { debugError } from "../_core/logger";
import { auditLogger } from "./auditLogger";
import type { GenerateSceneVisualStateParams } from "./verticalDramaSceneVisualState";

type StoryboardRecord = Record<string, unknown>;

export interface VdSceneContinuityLockResolution {
  blockByShotNumber: Map<number, string>;
  /** Resolved scene identity for each requested shot, including when no usable state exists. */
  locationKeyByShotNumber: Map<number, string>;
  statesByLocationKey: Record<string, VdSceneVisualState>;
  newlyAuthoredByLocationKey: Record<string, VdSceneVisualState>;
  diagnostics: {
    sceneCount: number;
    authoredCount: number;
    authoringFailures: Array<{ locationKey: string; reason: string }>;
  };
}

function record(value: unknown): StoryboardRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as StoryboardRecord
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function shotNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function storyboardShots(storyboard: unknown): StoryboardRecord[] {
  const shots = record(storyboard).shots;
  return Array.isArray(shots) ? shots.map(record) : [];
}

function emptyResolution(): VdSceneContinuityLockResolution {
  return {
    blockByShotNumber: new Map(),
    locationKeyByShotNumber: new Map(),
    statesByLocationKey: {},
    newlyAuthoredByLocationKey: {},
    diagnostics: { sceneCount: 0, authoredCount: 0, authoringFailures: [] },
  };
}

/**
 * Build the authoring facts once so the batch resolver and future scene-state
 * mutations cannot drift into separate prompt-input contracts. This helper is
 * intentionally factual: the skill remains the only creative author.
 */
export function buildSceneVisualStateAuthoringInput(params: {
  userId: number;
  tenantId?: string;
  seriesId: number;
  episodeId: number;
  group: VdSceneShotGroup;
  location: StoryboardRecord;
  shots: GenerateSceneVisualStateParams["shots"];
  locationImageUrl?: string;
  membershipHash: string;
  revision: number;
  seriesLook?: GenerateSceneVisualStateParams["seriesLook"];
  lang?: GenerateSceneVisualStateParams["lang"];
  idempotencyKey?: string;
}): GenerateSceneVisualStateParams {
  const locationImageUrl = stringValue(params.locationImageUrl) ?? stringValue(
    params.location.location_image_url ??
      params.location.reference_image_url ??
      params.location.image_url,
  );
  return {
    userId: params.userId,
    tenantId: params.tenantId,
    seriesId: params.seriesId,
    episodeId: params.episodeId,
    locationKey: params.group.locationKey,
    locationName: stringValue(params.location.location_name),
    locationDescription: stringValue(params.location.description),
    sceneDescription: stringValue(params.location.scene_description),
    ...(locationImageUrl ? { locationImageUrl } : {}),
    shots: params.shots,
    seriesLook: params.seriesLook,
    membershipHash: params.membershipHash,
    revision: params.revision,
    lang: params.lang,
    idempotencyKey: params.idempotencyKey,
  };
}

export async function resolveSceneContinuityLocks(params: {
  enabled: boolean;
  tenantId: string;
  userId: number;
  seriesId: number;
  episodeId: number;
  storyboard: unknown;
  startFramePlan: VerticalDramaStartFramePlan | null;
  shotNumbers: readonly number[];
  authorIfMissing?: boolean;
  canonicalShotSummaryByShotNumber?: ReadonlyMap<number, string>;
  /** Optional caller-resolved approved location images for the authoring call. */
  locationImageUrlByLocationKey?: ReadonlyMap<string, string>;
  idempotencyKey?: string;
  traceId?: string;
  seriesLook?: GenerateSceneVisualStateParams["seriesLook"];
  lang?: GenerateSceneVisualStateParams["lang"];
}): Promise<VdSceneContinuityLockResolution> {
  if (!params.enabled) return emptyResolution();

  const shots = storyboardShots(params.storyboard);
  const previousFrames = params.startFramePlan?.frames ?? [];
  const overrides = new Map(
    previousFrames
      .filter(frame => stringValue(frame.locationKey))
      .map(frame => [frame.shotNumber, frame.locationKey]),
  );
  const groups = buildSceneShotGroups({
    distinctLocations: record(params.storyboard).distinct_locations,
    overridesByShotNumber: overrides,
  });
  const stored = readSceneVisualStatesFromPlan(params.startFramePlan);
  const resolution = emptyResolution();
  resolution.diagnostics.sceneCount = groups.length;
  const requested = new Set(params.shotNumbers);
  const shotsByNumber = new Map(
    shots.flatMap(raw => {
      const n = shotNumber(raw.shot_number ?? raw.shotNumber);
      return n ? [[n, raw] as const] : [];
    }),
  );

  for (const group of groups) {
    for (const n of group.shotNumbers) {
      if (requested.has(n)) resolution.locationKeyByShotNumber.set(n, group.locationKey);
    }
    const memberSummaries = new Map<number, string>();
    const memberInputs = group.shotNumbers.map(n => {
      const raw = shotsByNumber.get(n) ?? {};
      const summary = params.canonicalShotSummaryByShotNumber?.get(n) ??
        stringValue(raw.summary ?? raw.visual_description ?? raw.description);
      if (summary) memberSummaries.set(n, summary);
      const characters = Array.isArray(raw.required_character_refs)
        ? raw.required_character_refs.filter((v): v is string => typeof v === "string")
        : Array.isArray(raw.characters)
          ? raw.characters.filter((v): v is string => typeof v === "string")
          : [];
      return { shotNumber: n, summary, characters };
    });
    const membershipHash = computeSceneMembershipHash({
      episodeId: params.episodeId,
      locationKey: group.locationKey,
      memberShotNumbers: group.shotNumbers,
      canonicalSummariesByShotNumber: memberSummaries,
    });
    let state = stored[group.locationKey];
    if (!state || state.stale === true || state.membershipHash !== membershipHash) {
      if (state?.manualEdit === true) {
        resolution.diagnostics.authoringFailures.push({
          locationKey: group.locationKey,
          reason: "manual_edit_state_stale_or_membership_mismatch",
        });
        continue;
      }
      if (!params.authorIfMissing) continue;
      const authorStartedAt = Date.now();
      try {
        const rawLocations = record(params.storyboard).distinct_locations;
        const locations: StoryboardRecord[] = Array.isArray(rawLocations)
          ? rawLocations.map((entry: unknown) => record(entry))
          : [];
        const location = locations.find(
          (entry: StoryboardRecord) => stringValue(entry.location_key) === group.locationKey,
        ) ?? {};
        const { generateSceneVisualState } = await import("./verticalDramaSceneVisualState");
        const authored = await generateSceneVisualState(
          buildSceneVisualStateAuthoringInput({
            userId: params.userId,
            tenantId: params.tenantId,
            seriesId: params.seriesId,
            episodeId: params.episodeId,
            group,
            location,
            shots: memberInputs,
            locationImageUrl: params.locationImageUrlByLocationKey?.get(group.locationKey),
            seriesLook: params.seriesLook,
            membershipHash,
            revision: (state?.revision ?? 0) + 1,
            lang: params.lang,
            idempotencyKey: params.idempotencyKey
              ? `${params.idempotencyKey}:scene-visual-state:${group.locationKey}`
              : undefined,
          }),
        );
        state = authored.state;
        resolution.newlyAuthoredByLocationKey[group.locationKey] = state;
        resolution.diagnostics.authoredCount += 1;
        const metadata = {
          locationKey: group.locationKey,
          memberShotCount: group.shotNumbers.length,
          coverageGapCount: state.coverageGaps.length,
          timeJumpSuspected: state.timeJumpSuspected,
          usedVision: authored.usedVision,
          ms: Date.now() - authorStartedAt,
          outcome: "authored" as const,
        };
        auditLogger.log({
          traceId: params.traceId,
          eventType: "vd_scene_state_planned",
          userId: params.userId,
          tenantId: params.tenantId,
          metadata,
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        resolution.diagnostics.authoringFailures.push({ locationKey: group.locationKey, reason });
        const metadata = {
          locationKey: group.locationKey,
          memberShotCount: group.shotNumbers.length,
          coverageGapCount: 0,
          timeJumpSuspected: false,
          usedVision: false,
          ms: Date.now() - authorStartedAt,
          outcome: "failed" as const,
          reason,
        };
        auditLogger.log({
          traceId: params.traceId,
          eventType: "vd_scene_state_planned",
          userId: params.userId,
          tenantId: params.tenantId,
          metadata,
        });
        debugError("vd_scene_state_planned", JSON.stringify({ traceId: params.traceId, ...metadata }));
        continue;
      }
    }
    if (!state || state.stale === true || state.membershipHash !== membershipHash) continue;
    resolution.statesByLocationKey[group.locationKey] = state;
    for (const n of group.shotNumbers) {
      if (!requested.has(n)) continue;
      const block = renderSceneContinuityLockBlock(state, membershipHash);
      if (!block) continue;
      resolution.blockByShotNumber.set(n, block);
    }
  }
  return resolution;
}

export async function resolveShotSceneContinuityLock(params: Omit<Parameters<typeof resolveSceneContinuityLocks>[0], "shotNumbers"> & { shotNumber: number }) {
  const result = await resolveSceneContinuityLocks({ ...params, shotNumbers: [params.shotNumber] });
  return {
    block: result.blockByShotNumber.get(params.shotNumber),
    locationKey: result.locationKeyByShotNumber.get(params.shotNumber),
    newlyAuthored: Object.values(result.newlyAuthoredByLocationKey)[0],
    failure: result.diagnostics.authoringFailures[0],
  };
}
