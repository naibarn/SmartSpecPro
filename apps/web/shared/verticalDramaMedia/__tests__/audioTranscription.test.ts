import { describe, expect, it } from "vitest";
import { audioAlignmentRequestSchema, audioTranscriptSchema, audioTranscriptionRequestSchema, transcriptToSubtitleSegments, transcriptWordsHaveValidEvidence } from "../audioTranscription";

const checksum = "a".repeat(64);

describe("audio transcription contracts", () => {
  it("accepts the three local profiles and explicit output policy", () => {
    for (const profile of ["whisper.cpp", "faster-whisper", "vibevoice-asr"] as const) {
      expect(audioTranscriptionRequestSchema.parse({
        schemaVersion: "audio-transcript.v1", type: "audio.transcribe", requestId: `req-${profile}`, idempotencyKey: `idem-${profile}`,
        sourceArtifactId: "artifact-1", sourceChecksum: checksum, sourceRevision: "rev-1", language: "th-TH", profile,
        wordTimestamps: true, diarization: "off", outputs: ["json", "srt", "vtt"], executionTarget: "worker_local",
      }).profile).toBe(profile);
    }
  });

  it("rejects fabricated or partial word timestamps", () => {
    expect(() => audioTranscriptSchema.parse({
      schemaVersion: "audio-transcript.v1", artifactId: "a-1", sourceArtifactId: "s-1", sourceChecksum: checksum,
      sourceRevision: "r-1", durationMs: 1000, language: "th-TH", profile: "whisper.cpp", modelRevision: "m-1", runtimeRevision: "rt-1", normalizerRevision: "worker-normalizer-v2",
      timingOrigin: "native", achievedGranularity: "word", wordTimingCoverage: 1, warnings: [], status: "ready", speakerTurns: [],
      segments: [{ cueId: "cue-1", startMs: 0, endMs: 900, text: "สวัสดี", speakerId: null, confidence: null, words: [{ wordId: "w-1", text: "สวัสดี", textStart: 0, textEnd: 6, startMs: 100, endMs: null, confidence: null, timingOrigin: "native" }] }],
    })).toThrow();
    expect(() => audioTranscriptSchema.parse({
      schemaVersion: "audio-transcript.v1", artifactId: "a-1", sourceArtifactId: "s-1", sourceChecksum: checksum,
      sourceRevision: "r-1", durationMs: 1000, language: "th-TH", profile: "whisper.cpp", modelRevision: "m-1", runtimeRevision: "rt-1", normalizerRevision: "worker-normalizer-v2",
      timingOrigin: "native", achievedGranularity: "word", wordTimingCoverage: 1, warnings: [], status: "ready", speakerTurns: [],
      segments: [{ cueId: "cue-1", startMs: 0, endMs: 900, text: "สวัสดี", speakerId: null, confidence: null, words: [{ wordId: "w-1", text: "สวัสดี", textStart: 0, textEnd: null, startMs: 100, endMs: 200, confidence: null, timingOrigin: "native" }] }],
    })).toThrow();
    expect(() => audioTranscriptSchema.parse({
      schemaVersion: "audio-transcript.v1", artifactId: "a-1", sourceArtifactId: "s-1", sourceChecksum: checksum,
      sourceRevision: "r-1", durationMs: 1000, language: "th-TH", profile: "whisper.cpp", modelRevision: "m-1", runtimeRevision: "rt-1", normalizerRevision: "worker-normalizer-v2",
      timingOrigin: "native", achievedGranularity: "word", wordTimingCoverage: 1, warnings: [], status: "ready", speakerTurns: [],
      segments: [{ cueId: "cue-1", startMs: 0, endMs: 900, text: "สวัสดี", speakerId: null, confidence: null, words: [{ wordId: "w-1", text: "สวัสดี", textStart: 0, textEnd: 99, startMs: 100, endMs: 200, confidence: null, timingOrigin: "native" }] }],
    })).toThrow();
    expect(() => audioTranscriptSchema.parse({
      schemaVersion: "audio-transcript.v1", artifactId: "a-1", sourceArtifactId: "s-1", sourceChecksum: checksum,
      sourceRevision: "r-1", durationMs: 1000, language: "th-TH", profile: "whisper.cpp", modelRevision: "m-1", runtimeRevision: "rt-1", normalizerRevision: "worker-normalizer-v2",
      timingOrigin: "native", achievedGranularity: "word", wordTimingCoverage: 1, warnings: [], status: "ready", speakerTurns: [],
      segments: [{ cueId: "cue-1", startMs: 0, endMs: 900, text: "", speakerId: null, confidence: null, words: [] }],
    })).toThrow();
    expect(() => audioTranscriptSchema.parse({
      schemaVersion: "audio-transcript.v1", artifactId: "a-1", sourceArtifactId: "s-1", sourceChecksum: checksum,
      sourceRevision: "r-1", durationMs: 1000, language: "th-TH", profile: "whisper.cpp", modelRevision: "m-1", runtimeRevision: "rt-1", normalizerRevision: "worker-normalizer-v2",
      timingOrigin: "native", achievedGranularity: "segment", wordTimingCoverage: 0, warnings: [], status: "ready", speakerTurns: [],
      segments: [{ cueId: "cue-1", startMs: 0, endMs: 1100, text: "เกินเวลา", speakerId: null, confidence: null, words: [] }],
    })).toThrow();
  });

  it("keeps unavailable word evidence out of subtitle word cues", () => {
    const transcript = audioTranscriptSchema.parse({
      schemaVersion: "audio-transcript.v1", artifactId: "a-1", sourceArtifactId: "s-1", sourceChecksum: checksum,
      sourceRevision: "r-1", durationMs: 1000, language: "th-TH", profile: "vibevoice-asr", modelRevision: "m-1", runtimeRevision: "rt-1", normalizerRevision: "worker-normalizer-v2",
      timingOrigin: "segment_only", achievedGranularity: "segment", wordTimingCoverage: 0, warnings: ["word_timestamps_unavailable"], status: "needs_review", speakerTurns: [],
      segments: [{ cueId: "cue-1", startMs: 0, endMs: 900, text: "สวัสดีครับ", speakerId: "speaker-1", confidence: null, words: [{ wordId: "w-1", text: "สวัสดีครับ", textStart: null, textEnd: null, startMs: null, endMs: null, confidence: null, timingOrigin: "unavailable" }] }],
    });
    expect(transcriptWordsHaveValidEvidence(transcript.segments[0].words)).toBe(false);
    expect(transcriptToSubtitleSegments(transcript)[0].words).toEqual([]);
  });

  it("accepts a bounded native word-timed segment", () => {
    const transcript = audioTranscriptSchema.parse({
      schemaVersion: "audio-transcript.v1", artifactId: "a-1", sourceArtifactId: "s-1", sourceChecksum: checksum,
      sourceRevision: "r-1", durationMs: 1000, language: "th-TH", profile: "whisper.cpp", modelRevision: "m-1", runtimeRevision: "rt-1", normalizerRevision: "worker-normalizer-v2",
      timingOrigin: "native", achievedGranularity: "word", wordTimingCoverage: 1, warnings: [], status: "ready", speakerTurns: [],
      segments: [{ cueId: "cue-1", startMs: 0, endMs: 900, text: "สวัสดี", speakerId: null, confidence: null, words: [{ wordId: "w-1", text: "สวัสดี", textStart: 0, textEnd: 6, startMs: 100, endMs: 800, confidence: 0.9, timingOrigin: "native" }] }],
    });
    expect(transcriptToSubtitleSegments(transcript)[0].words[0]).toEqual({ word: "สวัสดี", startMs: 100, endMs: 800 });
  });

  it("requires approved text lineage for script alignment", () => {
    expect(() => audioAlignmentRequestSchema.parse({
      schemaVersion: "audio-transcript.v1", type: "audio.align", requestId: "req-1", idempotencyKey: "idem-1",
      sourceArtifactId: "audio-1", sourceChecksum: checksum, sourceRevision: "rev-1", approvedTextArtifactId: "text-1",
      approvedTextRevision: "rev-2", approvedTextHash: checksum, language: "th-TH", profile: "whisperx", executionTarget: "worker_local",
    })).not.toThrow();
    expect(() => audioTranscriptionRequestSchema.parse({
      schemaVersion: "audio-transcript.v1", type: "audio.transcribe", requestId: "req-cloud", idempotencyKey: "idem-cloud",
      sourceArtifactId: "audio-1", sourceChecksum: checksum, sourceRevision: "rev-1", language: "th-TH", profile: "cloud",
      wordTimestamps: true, diarization: "native", outputs: ["json"], executionTarget: "worker_local",
    })).toThrow();
  });

  it("rejects empty word evidence and duplicate output formats", () => {
    expect(() => audioTranscriptSchema.parse({
      schemaVersion: "audio-transcript.v1", artifactId: "a-1", sourceArtifactId: "s-1", sourceChecksum: checksum,
      sourceRevision: "r-1", durationMs: 1000, language: "th-TH", profile: "whisper.cpp", modelRevision: "m-1", runtimeRevision: "rt-1", normalizerRevision: "worker-normalizer-v2",
      timingOrigin: "native", achievedGranularity: "word", wordTimingCoverage: 1, warnings: [], status: "ready", speakerTurns: [],
      segments: [{ cueId: "cue-1", startMs: 0, endMs: 900, text: "สวัสดี", speakerId: null, confidence: null, words: [{ wordId: "w-1", text: "   ", textStart: null, textEnd: null, startMs: 100, endMs: 200, confidence: null, timingOrigin: "native" }] }],
    })).toThrow();
    expect(() => audioTranscriptionRequestSchema.parse({
      schemaVersion: "audio-transcript.v1", type: "audio.transcribe", requestId: "req-dup", idempotencyKey: "idem-dup",
      sourceArtifactId: "audio-1", sourceChecksum: checksum, sourceRevision: "rev-1", language: "th-TH", profile: "whisper.cpp",
      wordTimestamps: true, diarization: "off", outputs: ["json", "json"], executionTarget: "worker_local",
    })).toThrow();
    expect(() => audioTranscriptSchema.parse({
      schemaVersion: "audio-transcript.v1", artifactId: "a-1", sourceArtifactId: "s-1", sourceChecksum: checksum,
      sourceRevision: "r-1", durationMs: 1000, language: "th-TH", profile: "whisper.cpp", modelRevision: "m-1", runtimeRevision: "rt-1", normalizerRevision: "worker-normalizer-v2",
      timingOrigin: "segment_only", achievedGranularity: "segment", wordTimingCoverage: 0, warnings: [], status: "ready", speakerTurns: [], segments: [],
    })).toThrow();
  });

  it("requires stable unique cue and word identifiers", () => {
    const word = { wordId: "w-1", text: "หนึ่ง", textStart: 0, textEnd: 5, startMs: 100, endMs: 200, confidence: null, timingOrigin: "native" as const };
    expect(() => audioTranscriptSchema.parse({
      schemaVersion: "audio-transcript.v1", artifactId: "a-1", sourceArtifactId: "s-1", sourceChecksum: checksum,
      sourceRevision: "r-1", durationMs: 1000, language: "th-TH", profile: "whisper.cpp", modelRevision: "m-1", runtimeRevision: "rt-1", normalizerRevision: "worker-normalizer-v2",
      timingOrigin: "native", achievedGranularity: "word", wordTimingCoverage: 1, warnings: [], status: "ready", speakerTurns: [],
      segments: [
        { cueId: "cue-1", startMs: 0, endMs: 400, text: "หนึ่ง", speakerId: null, confidence: null, words: [word] },
        { cueId: "cue-1", startMs: 400, endMs: 800, text: "หนึ่ง", speakerId: null, confidence: null, words: [word] },
      ],
    })).toThrow();
  });
});
