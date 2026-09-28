import { z } from "zod";
import { executionPolicySchema } from "./unifiedAudio";

/** Provider-neutral transcript contract shared by Worker, Skills and DramaSeries. */
export const AUDIO_TRANSCRIPT_SCHEMA_VERSION = "audio-transcript.v1" as const;
export const AUDIO_TRANSCRIPTION_PROFILES = [
  "whisper.cpp",
  "faster-whisper",
  "vibevoice-asr",
  "cloud",
] as const;

const id = z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const checksum = z.string().regex(/^[a-f0-9]{64}$/i);
const timeMs = z.number().int().nonnegative().max(86_400_000);
const locale = z.string().regex(/^[a-z]{2,8}(?:-[A-Z][A-Z0-9]{1,7})?$/);

export const transcriptWordSchema = z.object({
  wordId: id,
  text: z.string().max(500),
  textStart: z.number().int().nonnegative().nullable(),
  textEnd: z.number().int().nonnegative().nullable(),
  startMs: timeMs.nullable(),
  endMs: timeMs.nullable(),
  confidence: z.number().finite().min(0).max(1).nullable(),
  timingOrigin: z.enum(["native", "forced_alignment", "unavailable"]),
}).strict().superRefine((value, ctx) => {
  if (value.text.trim().length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["text"], message: "word text must not be empty" });
  }
  if ((value.startMs === null) !== (value.endMs === null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endMs"], message: "word timing must contain both startMs and endMs" });
  }
  if ((value.textStart === null) !== (value.textEnd === null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["textEnd"], message: "text offsets must contain both textStart and textEnd" });
  }
  if (value.startMs !== null && value.endMs !== null && value.endMs <= value.startMs) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endMs"], message: "word endMs must be greater than startMs" });
  }
  if (value.textStart !== null && value.textEnd !== null && value.textEnd <= value.textStart) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["textEnd"], message: "textEnd must be greater than textStart" });
  }
  if (value.timingOrigin === "unavailable" && (value.startMs !== null || value.endMs !== null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["timingOrigin"], message: "unavailable timing cannot contain timestamps" });
  }
});
export type TranscriptWord = z.infer<typeof transcriptWordSchema>;

export const transcriptSpeakerTurnSchema = z.object({
  speakerId: id,
  startMs: timeMs,
  endMs: timeMs,
  confidence: z.number().finite().min(0).max(1).nullable(),
}).strict().superRefine((value, ctx) => {
  if (value.endMs <= value.startMs) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endMs"], message: "speaker turn must have positive duration" });
});

export const transcriptSegmentSchema = z.object({
  cueId: id,
  startMs: timeMs,
  endMs: timeMs,
  text: z.string().max(4000),
  speakerId: id.nullable(),
  confidence: z.number().finite().min(0).max(1).nullable(),
  words: z.array(transcriptWordSchema).max(4000),
}).strict().superRefine((value, ctx) => {
  if (value.endMs <= value.startMs) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endMs"], message: "segment must have positive duration" });
  if (value.text.trim().length === 0) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["text"], message: "segment text must not be empty" });
  for (const [index, word] of value.words.entries()) {
    if (word.textStart !== null && word.textStart > value.text.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["words", index, "textStart"], message: "textStart exceeds segment text length" });
    }
    if (word.textEnd !== null && word.textEnd > value.text.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["words", index, "textEnd"], message: "textEnd exceeds segment text length" });
    }
    if (word.startMs !== null && (word.startMs < value.startMs || word.startMs >= value.endMs)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["words", index, "startMs"], message: "word startMs must be inside its segment" });
    }
    if (word.endMs !== null && (word.endMs > value.endMs || word.endMs <= value.startMs)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["words", index, "endMs"], message: "word endMs must be inside its segment" });
    }
  }
});
export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>;

export const audioTranscriptSchema = z.object({
  schemaVersion: z.literal(AUDIO_TRANSCRIPT_SCHEMA_VERSION),
  artifactId: id,
  sourceArtifactId: id,
  sourceChecksum: checksum,
  sourceRevision: id,
  durationMs: timeMs.nullable(),
  language: locale.or(z.literal("auto")),
  profile: z.enum(AUDIO_TRANSCRIPTION_PROFILES),
  modelRevision: id,
  runtimeRevision: id,
  normalizerRevision: id,
  timingOrigin: z.enum(["native", "forced_alignment", "segment_only"]),
  segments: z.array(transcriptSegmentSchema).max(100_000),
  speakerTurns: z.array(transcriptSpeakerTurnSchema).max(100_000),
  achievedGranularity: z.enum(["segment", "word"]),
  wordTimingCoverage: z.number().finite().min(0).max(1),
  warnings: z.array(id).max(64),
  status: z.enum(["ready", "empty", "needs_review"]),
}).strict().superRefine((value, ctx) => {
  if (value.artifactId === value.sourceArtifactId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["artifactId"], message: "transcript artifact must differ from source artifact" });
  }
  const cueIds = new Set<string>();
  const wordIds = new Set<string>();
  for (const [segmentIndex, segment] of value.segments.entries()) {
    if (cueIds.has(segment.cueId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["segments", segmentIndex, "cueId"], message: "cueId must be unique within a transcript" });
    }
    cueIds.add(segment.cueId);
    for (const [wordIndex, word] of segment.words.entries()) {
      if (wordIds.has(word.wordId)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["segments", segmentIndex, "words", wordIndex, "wordId"], message: "wordId must be unique within a transcript" });
      }
      wordIds.add(word.wordId);
    }
  }
  const words = value.segments.flatMap((segment) => segment.words);
  const timedWords = words.filter((word) => word.startMs !== null && word.endMs !== null && word.timingOrigin !== "unavailable");
  const expectedCoverage = words.length === 0 ? 0 : timedWords.length / words.length;
  if (Math.abs(value.wordTimingCoverage - expectedCoverage) > 0.000001) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["wordTimingCoverage"], message: "wordTimingCoverage does not match word evidence" });
  }
  if (value.achievedGranularity === "word" && (words.length === 0 || timedWords.length !== words.length)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["achievedGranularity"], message: "word granularity requires timestamps for every word" });
  }
  if (value.timingOrigin === "native" && timedWords.length !== words.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["timingOrigin"], message: "native timing requires complete word evidence" });
  }
  if (value.status === "empty" && value.segments.length > 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["segments"], message: "empty transcript cannot contain segments" });
  }
  if (value.status !== "empty" && value.segments.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["status"], message: "non-empty transcript status requires at least one segment" });
  }
  if (value.durationMs !== null) {
    value.segments.forEach((segment, index) => {
      if (segment.endMs > value.durationMs!) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["segments", index, "endMs"], message: "segment exceeds source duration" });
      }
    });
    value.speakerTurns.forEach((turn, index) => {
      if (turn.endMs > value.durationMs!) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["speakerTurns", index, "endMs"], message: "speaker turn exceeds source duration" });
      }
    });
  }
});
export type AudioTranscript = z.infer<typeof audioTranscriptSchema>;

export const audioTranscriptionRequestSchema = z.object({
  schemaVersion: z.literal(AUDIO_TRANSCRIPT_SCHEMA_VERSION),
  type: z.literal("audio.transcribe"),
  requestId: id,
  idempotencyKey: id.max(128),
  sourceArtifactId: id,
  sourceChecksum: checksum,
  sourceRevision: id,
  language: locale.or(z.literal("auto")),
  profile: z.enum(AUDIO_TRANSCRIPTION_PROFILES),
  wordTimestamps: z.boolean(),
  diarization: z.enum(["off", "native", "pyannote", "existing_artifact"]),
  outputs: z.array(z.enum(["json", "srt", "vtt", "ass"])).min(1).max(4),
  executionTarget: z.enum(["worker_local", "server_cloud"]),
  allowFallback: z.boolean().default(false),
  runtimeGate: z.enum(["signed_ready", "unavailable"]).default("unavailable"),
  modelRevision: id.optional(),
  selectedAudioStreamIndex: z.number().int().nonnegative().optional(),
  selectedRangeMs: z.object({ startMs: timeMs, endMs: timeMs }).strict().optional(),
  sourceTimelineTransformRef: id.nullable().optional(),
  executionPolicy: executionPolicySchema.optional(),
}).strict().superRefine((value, ctx) => {
  if (value.profile === "cloud" && value.executionTarget !== "server_cloud") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["executionTarget"], message: "cloud profile must execute through server_cloud" });
  }
  if (value.profile !== "cloud" && value.executionTarget !== "worker_local") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["executionTarget"], message: "local profile must execute through worker_local" });
  }
  if (new Set(value.outputs).size !== value.outputs.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["outputs"], message: "outputs must be unique" });
  }
  if (value.selectedRangeMs && value.selectedRangeMs.endMs <= value.selectedRangeMs.startMs) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["selectedRangeMs", "endMs"], message: "selected range must be positive" });
  }
  if (value.executionPolicy) {
    const expectedMode = value.executionTarget === "server_cloud" ? ["cloud_only", "prefer_cloud"] : ["local_only", "prefer_local"];
    if (!expectedMode.includes(value.executionPolicy.mode)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["executionPolicy", "mode"], message: "execution policy conflicts with executionTarget" });
    }
  }
});
export type AudioTranscriptionRequest = z.infer<typeof audioTranscriptionRequestSchema>;

export const audioAlignmentRequestSchema = z.object({
  schemaVersion: z.literal(AUDIO_TRANSCRIPT_SCHEMA_VERSION),
  type: z.literal("audio.align"),
  requestId: id,
  idempotencyKey: id.max(128),
  sourceArtifactId: id,
  sourceChecksum: checksum,
  sourceRevision: id,
  approvedTextArtifactId: id,
  approvedTextRevision: id,
  approvedTextHash: checksum,
  language: locale,
  profile: z.enum(["whisperx", "cloud"]),
  executionTarget: z.enum(["worker_local", "server_cloud"]),
  runtimeGate: z.enum(["signed_ready", "unavailable"]).default("unavailable"),
  normalizationProfileId: id.optional(),
  sourceTimelineTransformRef: id.nullable().optional(),
  executionPolicy: executionPolicySchema.optional(),
}).strict().superRefine((value, ctx) => {
  const expectedTarget = value.profile === "cloud" ? "server_cloud" : "worker_local";
  if (value.executionTarget !== expectedTarget) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["executionTarget"], message: `${value.profile} alignment must execute through ${expectedTarget}` });
  }
  if (value.executionPolicy) {
    const expectedMode = value.executionTarget === "server_cloud" ? ["cloud_only", "prefer_cloud"] : ["local_only", "prefer_local"];
    if (!expectedMode.includes(value.executionPolicy.mode)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["executionPolicy", "mode"], message: "execution policy conflicts with executionTarget" });
    }
  }
});
export type AudioAlignmentRequest = z.infer<typeof audioAlignmentRequestSchema>;

export function transcriptWordsHaveValidEvidence(words: readonly TranscriptWord[]): boolean {
  return words.length > 0 && words.every((word) => word.timingOrigin !== "unavailable" && word.startMs !== null && word.endMs !== null);
}

/** Convert the canonical JSON to the existing Worker subtitle formatter shape. */
export function transcriptToSubtitleSegments(transcript: AudioTranscript): Array<{
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  speakerId: string | null;
  words: Array<{ word: string; startMs: number; endMs: number }>;
}> {
  return transcript.segments.map((segment) => ({
    id: segment.cueId,
    startMs: segment.startMs,
    endMs: segment.endMs,
    text: segment.text,
    speakerId: segment.speakerId,
    words: segment.words.flatMap((word) => word.startMs !== null && word.endMs !== null
      ? [{ word: word.text, startMs: word.startMs, endMs: word.endMs }]
      : []),
  }));
}
