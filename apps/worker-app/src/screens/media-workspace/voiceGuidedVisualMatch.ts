import type { NleClip, NleTrack, VideoProjectDraft } from "../../types/nleProject";

export type VoiceTranscriptWord = { text: string; startMs: number; endMs: number };
export type VoiceTranscriptSegment = {
  text: string;
  startMs: number;
  endMs: number;
  words?: VoiceTranscriptWord[];
};

export type VoiceClipTimeMap = {
  clipId: string;
  sourceStartMs: number;
  sourceEndMs: number;
  timelineStartMs: number;
  speed: number;
};

export type ImageAnalysis = {
  assetId: string;
  fingerprint: string;
  caption: string;
  subjects?: string[];
  actions?: string[];
  setting?: string[];
  objects?: string[];
  ocrText?: string[];
  keywords?: string[];
  confidence: number;
  analyzer: string;
  modelRevision: string;
};

export type VisualMatchPolicy = {
  highConfidenceFloor: number;
  reorderMargin: number;
  minWindowMs: number;
  maxWindowMs: number;
};

export type VisualMatchEvidence = {
  assetId: string;
  confidence: number;
  score: number;
  reasons: string[];
  manualReview: boolean;
};

export type VisualMatchWindow = {
  assetId: string;
  startMs: number;
  endMs: number;
  transcriptText: string;
  evidence: VisualMatchEvidence;
};

export type VoiceGuidedVisualPlan = {
  contractVersion: "voice-guided-visual-match.v1";
  fingerprint: string;
  projectRevision: string;
  sourceDurationMs: number;
  originalOrder: string[];
  proposedOrder: string[];
  reorderEligible: boolean;
  originalScore: number;
  proposedScore: number;
  windows: VisualMatchWindow[];
  analyses: ImageAnalysis[];
  warnings: string[];
};

const DEFAULT_POLICY: VisualMatchPolicy = {
  highConfidenceFloor: 0.78,
  reorderMargin: 0.12,
  minWindowMs: 1_200,
  maxWindowMs: 9_000,
};

function finite(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function normalizeMatchText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .normalize("NFC")
    .replace(/\u0e4d\u0e32/gu, "\u0e33")
    .toLocaleLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: unknown): Set<string> {
  const words = normalizeMatchText(value).split(" ").filter((token) => token.length > 1);
  const output = new Set(words);
  // Thai does not consistently use spaces between words. Short character
  // shingles provide a conservative lexical signal without requiring a paid
  // embedding call.
  for (const word of words) {
    if (word.length < 5) continue;
    for (let index = 0; index <= word.length - 3; index += 1) output.add(word.slice(index, index + 3));
  }
  return output;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Convert source-media transcript time into project timeline time. */
export function mapTranscriptToTimeline(
  segments: VoiceTranscriptSegment[],
  maps: VoiceClipTimeMap[],
): VoiceTranscriptSegment[] {
  const sortedMaps = [...maps].sort((a, b) => a.timelineStartMs - b.timelineStartMs);
  const result: VoiceTranscriptSegment[] = [];
  for (const segment of segments) {
    const sourceStart = finite(segment.startMs);
    const sourceEnd = finite(segment.endMs);
    if (sourceEnd <= sourceStart) continue;
    const map = sortedMaps.find((candidate) => sourceStart < candidate.sourceEndMs && sourceEnd > candidate.sourceStartMs);
    if (!map || map.speed <= 0) continue;
    const start = map.timelineStartMs + Math.max(0, sourceStart - map.sourceStartMs) / map.speed;
    const mappedEnd = map.timelineStartMs + Math.max(0, Math.min(map.sourceEndMs, sourceEnd) - map.sourceStartMs) / map.speed;
    if (mappedEnd <= start) continue;
    const words = segment.words?.map((word) => {
      const wordStart = map.timelineStartMs + Math.max(0, finite(word.startMs) - map.sourceStartMs) / map.speed;
      const wordEnd = map.timelineStartMs + Math.max(0, finite(word.endMs) - map.sourceStartMs) / map.speed;
      return { ...word, startMs: wordStart, endMs: wordEnd };
    }).filter((word) => word.endMs > word.startMs);
    result.push({ ...segment, startMs: start, endMs: mappedEnd, ...(words?.length ? { words } : {}) });
  }
  return result.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
}

export function buildVoiceClipMaps(track: NleTrack): VoiceClipTimeMap[] {
  return track.clips.map((clip) => {
    const speed = finite(clip.speed, 1) > 0 ? finite(clip.speed, 1) : 1;
    const sourceStartMs = Math.max(0, finite(clip.trimInMs));
    const sourceEndMs = clip.trimOutMs != null
      ? Math.max(sourceStartMs, finite(clip.trimOutMs))
      : sourceStartMs + Math.max(0, clip.durationMs * speed);
    return { clipId: clip.id, sourceStartMs, sourceEndMs, timelineStartMs: Math.max(0, clip.timelineStartMs), speed };
  });
}

export function scoreImageAgainstText(text: string, analysis?: ImageAnalysis): VisualMatchEvidence {
  if (!analysis) return { assetId: "", confidence: 0, score: 0, reasons: ["image_analysis_missing"], manualReview: true };
  const source = tokens(text);
  const fields = [analysis.caption, ...(analysis.subjects ?? []), ...(analysis.actions ?? []), ...(analysis.setting ?? []), ...(analysis.objects ?? []), ...(analysis.ocrText ?? []), ...(analysis.keywords ?? [])];
  const matched = new Set<string>();
  fields.forEach((field) => tokens(field).forEach((token) => { if (source.has(token)) matched.add(token); }));
  const overlap = source.size ? matched.size / source.size : 0;
  const compactSource = normalizeMatchText(text).replace(/\s+/g, "");
  const keywordHits = (analysis.keywords ?? []).filter((keyword) => {
    const compactKeyword = normalizeMatchText(keyword).replace(/\s+/g, "");
    return compactKeyword.length > 1 && compactSource.includes(compactKeyword);
  }).length;
  const keywordScore = Math.min(1, keywordHits / Math.max(1, Math.min(3, (analysis.keywords ?? []).length)));
  const confidence = Math.max(0, Math.min(1, keywordScore * 0.65 + overlap * 0.25 + finite(analysis.confidence) * 0.1));
  const reasons = matched.size ? [`matched_terms:${[...matched].slice(0, 6).join(",")}`] : ["semantic_or_visual_match"];
  return { assetId: analysis.assetId, confidence, score: confidence, reasons, manualReview: confidence < DEFAULT_POLICY.highConfidenceFloor || finite(analysis.confidence) < DEFAULT_POLICY.highConfidenceFloor };
}

function bestAnalysis(text: string, analyses: ImageAnalysis[]): VisualMatchEvidence {
  return analyses.map((analysis) => scoreImageAgainstText(text, analysis)).sort((a, b) => b.score - a.score || a.assetId.localeCompare(b.assetId))[0] ?? { assetId: "", confidence: 0, score: 0, reasons: ["no_image_analysis"], manualReview: true };
}

export function buildVoiceGuidedVisualPlan(input: {
  transcript: VoiceTranscriptSegment[];
  voiceMaps: VoiceClipTimeMap[];
  analyses: ImageAnalysis[];
  originalOrder: string[];
  projectRevision: string;
  policy?: Partial<VisualMatchPolicy>;
}): VoiceGuidedVisualPlan {
  const policy = { ...DEFAULT_POLICY, ...input.policy };
  const mapped = mapTranscriptToTimeline(input.transcript, input.voiceMaps);
  const mappedDurationMs = Math.max(0, ...mapped.map((segment) => segment.endMs));
  const voiceDurationMs = Math.max(0, ...input.voiceMaps.map((map) => (
    map.timelineStartMs + Math.max(0, map.sourceEndMs - map.sourceStartMs) / Math.max(0.01, map.speed)
  )));
  const sourceDurationMs = Math.max(mappedDurationMs, voiceDurationMs);
  const originalOrder = input.originalOrder.filter((assetId, index, list) => list.indexOf(assetId) === index);
  // Images need a complete timeline allocation, including silence between
  // spoken segments. When the number of images differs from transcript
  // segments, divide the voice duration into stable windows and attach all
  // overlapping transcript text to each window.
  const windowCount = originalOrder.length;
  const timelineWindows = windowCount > 0
    ? Array.from({ length: windowCount }, (_, index) => {
      const startMs = sourceDurationMs * index / windowCount;
      const endMs = sourceDurationMs * (index + 1) / windowCount;
      const transcriptText = mapped
        .filter((segment) => segment.startMs < endMs && segment.endMs > startMs)
        .map((segment) => segment.text)
        .join(" ")
        .trim();
      return { startMs, endMs, transcriptText };
    })
    : [];
  const windows = timelineWindows.map((segment) => {
    const evidence = bestAnalysis(segment.transcriptText, input.analyses);
    return { assetId: evidence.assetId, startMs: segment.startMs, endMs: segment.endMs, transcriptText: segment.transcriptText, evidence };
  }).filter((window) => window.assetId);
  const used = new Set<string>();
  const uniqueWindows = windows.map((window) => {
    if (used.has(window.assetId)) return { ...window, evidence: { ...window.evidence, manualReview: true, reasons: [...window.evidence.reasons, "asset_reuse_requires_review"] } };
    used.add(window.assetId);
    return window;
  });
  const proposedOrder = uniqueWindows.map((window) => window.assetId).concat(originalOrder.filter((id) => !used.has(id)));
  const originalScore = originalOrder.reduce((sum, id, index) => sum + (uniqueWindows[index]?.assetId === id ? uniqueWindows[index].evidence.score : 0), 0);
  const proposedScore = uniqueWindows.reduce((sum, window) => sum + window.evidence.score, 0);
  const moved = proposedOrder.some((id, index) => id !== originalOrder[index]);
  const allMovedHighConfidence = uniqueWindows.every((window) => !moved || window.evidence.confidence >= policy.highConfidenceFloor) && !uniqueWindows.some((window) => window.evidence.manualReview);
  const reorderEligible = moved && allMovedHighConfidence && proposedScore >= originalScore + policy.reorderMargin;
  const warnings: string[] = [];
  if (!mapped.length) warnings.push("voice_timeline_unavailable");
  if (input.analyses.length < originalOrder.length) warnings.push("some_images_need_manual_review");
  if (!reorderEligible) warnings.push("original_order_retained_until_preview_confirmation");
  const fingerprint = stable({ contractVersion: "voice-guided-visual-match.v1", mapped, sourceDurationMs, analyses: input.analyses, originalOrder, policy, matcherRevision: "2026-09-14.2" });
  return { contractVersion: "voice-guided-visual-match.v1", fingerprint, projectRevision: input.projectRevision, sourceDurationMs, originalOrder, proposedOrder: reorderEligible ? proposedOrder : originalOrder, reorderEligible, originalScore, proposedScore, windows: uniqueWindows, analyses: input.analyses, warnings };
}

function isImageClip(clip: NleClip): boolean {
  const path = (clip.sourcePath ?? clip.sourceUrl ?? "").split(/[?#]/, 1)[0].toLowerCase();
  return Boolean(clip.sourcePath || clip.sourceUrl)
    && /\.(png|jpe?g|webp|gif|bmp|avif)$/u.test(path)
    && !clip.text
    && !clip.isBlurOverlay;
}

/** Apply timing/order only to image clips; all other clips are preserved. */
export function applyVoiceGuidedVisualPlan(project: VideoProjectDraft, plan: VoiceGuidedVisualPlan, mode: "original" | "reordered"): VideoProjectDraft {
  if (project.updatedAt !== plan.projectRevision) {
    throw new Error("VISUAL_MATCH_PREVIEW_STALE");
  }
  const order = mode === "reordered" && plan.reorderEligible ? plan.proposedOrder : plan.originalOrder;
  const imageClips = project.tracks.flatMap((track) => track.type === "video_broll" || track.type === "video_main" ? track.clips.filter(isImageClip) : []);
  const orderedClips = order.map((assetId) => imageClips.find((clip) => clip.id === assetId)).filter((clip): clip is NleClip => Boolean(clip));
  const remaining = imageClips.filter((clip) => !order.includes(clip.id));
  const windows = plan.windows;
  const nextByTrack = new Map<string, number>();
  const updates = new Map<string, NleClip>();
  [...orderedClips, ...remaining].forEach((clip, index) => {
    const window = windows[index] ?? windows[windows.length - 1];
    if (!window) return;
    const start = nextByTrack.get("visual") ?? window.startMs;
    const duration = Math.max(1, window.endMs - window.startMs);
    nextByTrack.set("visual", start + duration);
    updates.set(clip.id, { ...clip, timelineStartMs: start, durationMs: duration });
  });
  const previousJson = JSON.stringify(project);
  return {
    ...project,
    updatedAt: new Date().toISOString(),
    tracks: project.tracks.map((track) => ({ ...track, clips: track.clips.map((clip) => updates.get(clip.id) ?? clip) })),
    metadata: { ...project.metadata, visualMatch: { planFingerprint: plan.fingerprint, mode, previousProjectJson: previousJson, appliedAt: new Date().toISOString() } },
  };
}
