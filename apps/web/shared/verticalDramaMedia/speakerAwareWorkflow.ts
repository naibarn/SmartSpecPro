import type {
  ActiveSpeakerEvidence,
  AdapterCapability,
  AdapterPolicy,
  CameraAction,
  ComposedEditMap,
  DiarizationSegment,
  EditMapRange,
  EditStage,
  SubtitleEvidence,
  SubtitleCue,
  VadSegment,
  VisualTrack,
  WorkflowRecipe,
} from "./speakerAwareContracts";
import { adapterPolicySchema, composedEditMapSchema, hashAdapterPolicy, workflowRecipeSchema } from "./speakerAwareContracts";
import { canonicalJsonStringify, sha256Hex } from "../verticalDramaSeries/artifacts";

export type AdapterResolution = {
  adapterId: AdapterCapability["adapterId"] | null;
  status: "ready" | "blocked" | "fallback" | "unknown";
  fallbackFrom: AdapterCapability["adapterId"] | null;
  reason: string | null;
};

export function resolveSpeakerAwareAdapter(
  policyInput: AdapterPolicy,
  stage: keyof Pick<AdapterPolicy, "vad" | "diarization" | "face" | "person" | "activeSpeaker">,
  capabilities: AdapterCapability[],
): AdapterResolution {
  const policy = adapterPolicySchema.parse(policyInput);
  const stagePolicy = policy[stage];
  const byId = new Map(capabilities.map((capability) => [capability.adapterId, capability]));
  const primary = byId.get(stagePolicy.primary);
  if (primary?.status === "ready") return { adapterId: primary.adapterId, status: "ready", fallbackFrom: null, reason: null };
  if (stagePolicy.fallbackPolicy === "deny") {
    return { adapterId: null, status: "blocked", fallbackFrom: stagePolicy.primary, reason: `primary adapter unavailable: ${primary?.status ?? "not_reported"}` };
  }
  if (stagePolicy.fallbackPolicy === "report_unknown") {
    return { adapterId: null, status: "unknown", fallbackFrom: stagePolicy.primary, reason: "primary adapter unavailable and fallback is report-only" };
  }
  for (const candidateId of stagePolicy.fallbackAllowList) {
    const candidate = byId.get(candidateId);
    if (candidate?.status === "ready") {
      return { adapterId: candidate.adapterId, status: "fallback", fallbackFrom: stagePolicy.primary, reason: `explicit fallback from ${stagePolicy.primary}` };
    }
  }
  return { adapterId: null, status: "blocked", fallbackFrom: stagePolicy.primary, reason: "no ready adapter in explicit fallback allow-list" };
}

export function validateWorkflowOrder(recipeInput: WorkflowRecipe): { recipe: WorkflowRecipe; errors: string[] } {
  const recipe = workflowRecipeSchema.parse(recipeInput);
  const enabled = recipe.stages.filter((stage) => stage.enabled).sort((a, b) => a.order - b.order);
  const seen = new Set<EditStage["kind"]>();
  const errors: string[] = [];
  for (const stage of enabled) {
    for (const requirement of stage.requires) {
      if (!seen.has(requirement)) errors.push(`${stage.kind} requires ${requirement} earlier in the workflow`);
    }
    seen.add(stage.kind);
  }
  return { recipe, errors };
}

export function normalizeEditMapRanges(ranges: EditMapRange[]): EditMapRange[] {
  return [...ranges]
    .sort((a, b) => a.sourceStartMs - b.sourceStartMs || a.sourceEndMs - b.sourceEndMs)
    .reduce<EditMapRange[]>((result, current) => {
      const previous = result[result.length - 1];
      if (previous && previous.decision === current.decision && current.sourceStartMs <= previous.sourceEndMs && canonicalJsonStringify(previous.reasons) === canonicalJsonStringify(current.reasons)) {
        previous.sourceEndMs = Math.max(previous.sourceEndMs, current.sourceEndMs);
        previous.outputEndMs = Math.max(previous.outputEndMs, current.outputEndMs);
      } else {
        result.push({ ...current, reasons: [...current.reasons] });
      }
      return result;
    }, []);
}

export function buildOutputTimeMap(ranges: EditMapRange[]): EditMapRange[] {
  let outputCursor = 0;
  return normalizeEditMapRanges(ranges).map((range) => {
    const duration = range.sourceEndMs - range.sourceStartMs;
    if (range.decision === "remove") {
      return { ...range, outputStartMs: outputCursor, outputEndMs: outputCursor };
    }
    const mapped = { ...range, outputStartMs: outputCursor, outputEndMs: outputCursor + duration };
    outputCursor += duration;
    return mapped;
  });
}

export function compileStableCameraActions(input: {
  activeSpeakers: ActiveSpeakerEvidence[];
  tracks: VisualTrack[];
  minHoldMs?: number;
  confirmationWindows?: number;
}): CameraAction[] {
  const minHoldMs = input.minHoldMs ?? 500;
  const confirmations = input.confirmationWindows ?? 2;
  const sorted = [...input.activeSpeakers].sort((a, b) => a.startMs - b.startMs);
  const actions: CameraAction[] = [];
  let previousTrack: string | null = null;
  let previousEnd = 0;
  let candidateTrack: string | null = null;
  let candidateCount = 0;
  for (const evidence of sorted) {
    const trackId = evidence.activeFaceTrackId ?? evidence.activePersonTrackId;
    if (!trackId || evidence.conflict !== "none" || evidence.fusedConfidence < 0.55) {
      actions.push({ startMs: evidence.startMs, endMs: evidence.endMs, action: "hold", targetTrackId: previousTrack, fromX: 0.5, fromY: 0.5, toX: 0.5, toY: 0.5, reason: "no_evidence" });
      continue;
    }
    if (trackId !== candidateTrack) { candidateTrack = trackId; candidateCount = 1; } else candidateCount += 1;
    const targetTrack = input.tracks.find((track) => track.trackId === trackId);
    const boxes = targetTrack?.boxes ?? [];
    const sample = boxes.length > 0
      ? boxes.reduce((closest, box) => Math.abs(box.timeMs - evidence.startMs) < Math.abs(closest.timeMs - evidence.startMs) ? box : closest, boxes[0])
      : undefined;
    const targetX = sample ? Math.min(1, Math.max(0, sample.x + sample.width / 2)) : 0.5;
    const targetY = sample ? Math.min(1, Math.max(0, sample.y + sample.height / 2)) : 0.5;
    if (trackId === previousTrack || candidateCount < confirmations || evidence.startMs < previousEnd + minHoldMs) {
      actions.push({ startMs: evidence.startMs, endMs: evidence.endMs, action: "hold", targetTrackId: previousTrack ?? trackId, fromX: targetX, fromY: targetY, toX: targetX, toY: targetY, reason: "stable_target" });
    } else {
      actions.push({ startMs: evidence.startMs, endMs: evidence.endMs, action: "cut_to_track", targetTrackId: trackId, fromX: 0.5, fromY: 0.5, toX: targetX, toY: targetY, reason: "speaker_switch" });
      previousTrack = trackId;
    }
    previousEnd = Math.max(previousEnd, evidence.endMs);
  }
  return actions;
}

export function fuseActiveSpeakerVisualEvidence(input: {
  activeSpeakers: ActiveSpeakerEvidence[];
  tracks: VisualTrack[];
}): ActiveSpeakerEvidence[] {
  return input.activeSpeakers.map((evidence) => {
    const candidates = input.tracks.filter((track) => track.endMs > evidence.startMs && track.startMs < evidence.endMs);
    if (candidates.length === 0) return { ...evidence, conflict: evidence.conflict === "none" ? "missing_visual" : evidence.conflict };
    const ranked = candidates.map((track) => ({ track, confidence: Math.max(0, ...track.boxes.filter((box) => box.timeMs >= evidence.startMs && box.timeMs <= evidence.endMs).map((box) => box.confidence)) })).sort((a, b) => b.confidence - a.confidence);
    const winner = ranked[0];
    const nearTie = ranked[1] && winner.confidence > 0 && winner.confidence - ranked[1].confidence < 0.1;
    const visualConfidence = winner.confidence;
    return {
      ...evidence,
      activeFaceTrackId: winner.track.kind === "face" ? winner.track.trackId : null,
      activePersonTrackId: winner.track.kind !== "face" ? winner.track.trackId : null,
      visualConfidence,
      fusedConfidence: Math.min(1, evidence.speechConfidence * 0.45 + visualConfidence * 0.55),
      basis: [...new Set([...evidence.basis, winner.track.kind === "face" ? "face" : "person"])],
      conflict: nearTie ? "multiple_candidates" : evidence.conflict,
    };
  });
}

export function composeSpeakerAwareEditMap(input: Omit<ComposedEditMap, "parentArtifactHashes"> & { parentArtifactHashes?: string[] }): ComposedEditMap {
  const map = composedEditMapSchema.parse({ ...input, parentArtifactHashes: input.parentArtifactHashes ?? [] });
  return composedEditMapSchema.parse({ ...map, ranges: buildOutputTimeMap(map.ranges), mapRevision: sha256Hex(canonicalJsonStringify({ ...map, parentArtifactHashes: input.parentArtifactHashes ?? [] })) });
}

export function adapterPolicyFingerprint(policy: AdapterPolicy): string {
  return hashAdapterPolicy(policy);
}

export function normalizeSubtitleCues(evidence: SubtitleEvidence): SubtitleEvidence {
  const cues = [...evidence.cues]
    .map((cue) => ({ ...cue, text: cue.text.trim() }))
    .filter((cue) => cue.endMs > cue.startMs && cue.text.length > 0)
    .sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs);
  return { ...evidence, cues };
}

export function mergeVadSegments(segments: VadSegment[], mergeGapMs = 80): VadSegment[] {
  return [...segments]
    .sort((left, right) => left.startMs - right.startMs)
    .reduce<VadSegment[]>((result, current) => {
      const previous = result[result.length - 1];
      if (previous && previous.isSpeech === current.isSpeech && current.startMs <= previous.endMs + mergeGapMs) {
        previous.endMs = Math.max(previous.endMs, current.endMs);
        previous.speechConfidence = Math.max(previous.speechConfidence, current.speechConfidence);
      } else {
        result.push({ ...current });
      }
      return result;
    }, []);
}

export function joinSpeechToSpeakers(input: {
  vad: VadSegment[];
  diarization: DiarizationSegment[];
  subtitles?: SubtitleCue[];
  overlapToleranceMs?: number;
}): ActiveSpeakerEvidence[] {
  const tolerance = input.overlapToleranceMs ?? 120;
  return mergeVadSegments(input.vad).filter((segment) => segment.isSpeech).map((speech) => {
    const candidates = input.diarization.filter((speaker) => speaker.endMs > speech.startMs - tolerance && speaker.startMs < speech.endMs + tolerance);
    const winner = [...candidates].sort((left, right) => right.confidence - left.confidence)[0];
    const subtitle = input.subtitles?.find((cue) => cue.endMs > speech.startMs && cue.startMs < speech.endMs);
    const conflict = candidates.length > 1 && Math.abs((candidates[0]?.confidence ?? 0) - (candidates[1]?.confidence ?? 0)) < 0.12
      ? "multiple_candidates" as const
      : winner && subtitle?.speakerId && winner.speakerId !== subtitle.speakerId
        ? "audio_visual_mismatch" as const
        : "none" as const;
    const speechConfidence = speech.speechConfidence;
    const diarizationConfidence = winner?.confidence ?? 0;
    return {
      startMs: speech.startMs,
      endMs: speech.endMs,
      speakerId: winner?.speakerId ?? subtitle?.speakerId ?? null,
      activeFaceTrackId: null,
      activePersonTrackId: null,
      speechConfidence,
      visualConfidence: 0,
      fusedConfidence: Math.min(1, winner ? (speechConfidence * 0.55 + diarizationConfidence * 0.45) : speechConfidence * 0.6),
      basis: ["vad", ...(winner ? ["diarization" as const] : []), ...(subtitle ? ["subtitle" as const] : [])],
      conflict,
    };
  });
}

export type CondensationDecision = "keep" | "remove" | "shorten";
export type CondensationProposal = { proposalId: string; startMs: number; endMs: number; text: string; decision: CondensationDecision; reason: string };

export function buildCondensationProposals(cues: SubtitleCue[], targetWordsPerMinute = 155): CondensationProposal[] {
  const safeWpm = Math.max(60, Math.min(300, targetWordsPerMinute));
  return normalizeSubtitleCues({ evidenceId: "condensation-input", sourceKind: "authored_subtitle", format: "json", language: "und", cues, confidence: null, checksum: "a".repeat(64), revision: "inline" }).cues.map((cue, index) => {
    const words = cue.text.split(/\s+/u).filter(Boolean).length;
    const expectedMs = Math.max(250, Math.round(words / safeWpm * 60_000));
    const overloaded = cue.endMs - cue.startMs > expectedMs * 2.5;
    return { proposalId: `condensation-${index + 1}`, startMs: cue.startMs, endMs: cue.endMs, text: cue.text, decision: overloaded ? "shorten" : "keep", reason: overloaded ? "cue duration is much longer than spoken-text estimate" : "cue is within target pacing" };
  });
}
