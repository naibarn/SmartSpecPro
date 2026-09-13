import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { getDb } from "../db";
import { workerArtifacts, workerJobs } from "../../drizzle/schema";
import {
  AUDIO_TRANSCRIPT_SCHEMA_VERSION,
  audioAlignmentRequestSchema,
  audioTranscriptSchema,
  audioTranscriptionRequestSchema,
  transcriptToSubtitleSegments,
  type AudioAlignmentRequest,
  type AudioTranscript,
  type AudioTranscriptionRequest,
} from "../../shared/verticalDramaMedia/audioTranscription";
import { queueUnifiedAudioWorkerJob } from "./workerSchedulerService";
import { cancelQueuedUserWorkerJob, getUserWorkerJobDetail } from "./workerJobMonitorService";
import { storageReadBuffer } from "../storage";

type Actor = { tenantId: string; userId: number };

const AUDIO_JOB_TYPES = ["audio_transcribe", "audio_align"] as const;
const EXPORT_FORMATS = ["json", "srt", "vtt", "ass"] as const;

function assertAudioJob(jobType: string): asserts jobType is (typeof AUDIO_JOB_TYPES)[number] {
  if (!AUDIO_JOB_TYPES.includes(jobType as (typeof AUDIO_JOB_TYPES)[number])) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Audio run not found" });
  }
}

function srtTime(ms: number): string {
  const safe = Math.max(0, Math.trunc(ms));
  const hours = Math.floor(safe / 3_600_000);
  const minutes = Math.floor((safe % 3_600_000) / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1_000);
  const millis = safe % 1_000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}

function vttTime(ms: number): string {
  return srtTime(ms).replace(",", ".");
}

function assTime(ms: number): string {
  const safe = Math.max(0, Math.trunc(ms));
  const hours = Math.floor(safe / 3_600_000);
  const minutes = Math.floor((safe % 3_600_000) / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1_000);
  const centiseconds = Math.floor((safe % 1_000) / 10);
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
}

function escapeAss(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\{/g, "\\{").replace(/\}/g, "\\}").replace(/\r?\n/g, "\\N");
}

function renderExports(transcript: AudioTranscript, formats: readonly string[]): Record<string, unknown> {
  const segments = transcriptToSubtitleSegments(transcript);
  const srt = segments.map((segment, index) => `${index + 1}\n${srtTime(segment.startMs)} --> ${srtTime(segment.endMs)}\n${segment.text}\n`).join("\n");
  const vtt = `WEBVTT\n\n${segments.map((segment) => `${vttTime(segment.startMs)} --> ${vttTime(segment.endMs)}\n${segment.text}\n`).join("\n")}`;
  const ass = `[Script Info]\nScriptType: v4.00+\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Prompt,42,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,0,2,30,30,40,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${segments.map((segment) => `Dialogue: 0,${assTime(segment.startMs)},${assTime(segment.endMs)},Default,,0,0,0,,${escapeAss(segment.text)}`).join("\n")}`;
  const result: Record<string, unknown> = {};
  if (formats.includes("json")) result.json = transcript;
  if (formats.includes("srt")) result.srt = srt;
  if (formats.includes("vtt")) result.vtt = vtt;
  if (formats.includes("ass")) result.ass = ass;
  return result;
}

export class UnifiedAudioTranscriptionService {
  listCapabilities() {
    return {
      schemaVersion: AUDIO_TRANSCRIPT_SCHEMA_VERSION,
      profiles: [
        { profile: "whisper.cpp", executionTarget: "worker_local", status: "unknown", reason: "worker_capability_probe_required" },
        { profile: "faster-whisper", executionTarget: "worker_local", status: "unknown", reason: "signed_runtime_probe_required" },
        { profile: "vibevoice-asr", executionTarget: "worker_local", status: "unknown", reason: "gpu_and_license_probe_required" },
        { profile: "cloud", executionTarget: "server_cloud", status: "unavailable", reason: "cloud_adapter_not_registered" },
      ],
    } as const;
  }

  preflight(input: unknown) {
    const request = audioTranscriptionRequestSchema.parse(input);
    const cloudBlocked = request.executionTarget === "server_cloud" || request.profile === "cloud";
    const runtimeBlocked = request.runtimeGate !== "signed_ready";
    return {
      schemaVersion: AUDIO_TRANSCRIPT_SCHEMA_VERSION,
      requestId: request.requestId,
      ready: !cloudBlocked && !runtimeBlocked,
      status: cloudBlocked ? "cloud_adapter_unavailable" : runtimeBlocked ? "runtime_unavailable" : "ready",
      reasons: cloudBlocked ? ["cloud_adapter_not_registered"] : runtimeBlocked ? ["signed_runtime_gate_required"] : [],
    } as const;
  }

  async queueTranscription(actor: Actor, input: unknown) {
    const request = audioTranscriptionRequestSchema.parse(input);
    const queued = await queueUnifiedAudioWorkerJob({
      tenantId: actor.tenantId,
      requestedByUserId: actor.userId,
      jobType: "audio_transcribe",
      inputJson: request,
      idempotencyKey: request.idempotencyKey,
      capabilityFamilies: [`asr-profile:${request.profile}`],
      requiredClaimCapability: `asr-profile:${request.profile}`,
      resourceProfile: request.profile === "vibevoice-asr" ? "gpu_required" : "cpu_heavy",
      reservedCredits: request.executionPolicy?.maxCostCredits ?? null,
      timeoutSeconds: request.executionPolicy ? Math.ceil(request.executionPolicy.maxRuntimeMs / 1000) : 3600,
    });
    return { created: queued.created, jobId: queued.job.id, request };
  }

  async queueAlignment(actor: Actor, input: unknown) {
    const request = audioAlignmentRequestSchema.parse(input);
    const queued = await queueUnifiedAudioWorkerJob({
      tenantId: actor.tenantId,
      requestedByUserId: actor.userId,
      jobType: "audio_align",
      inputJson: request,
      idempotencyKey: request.idempotencyKey,
      capabilityFamilies: [`alignment-profile:${request.profile}`],
      requiredClaimCapability: `alignment-profile:${request.profile}`,
      resourceProfile: request.profile === "cloud" ? "cpu_light" : "gpu_required",
      reservedCredits: request.executionPolicy?.maxCostCredits ?? null,
      timeoutSeconds: request.executionPolicy ? Math.ceil(request.executionPolicy.maxRuntimeMs / 1000) : 3600,
    });
    return { created: queued.created, jobId: queued.job.id, request };
  }

  async getRun(actor: Actor, jobId: string) {
    const detail = await getUserWorkerJobDetail({ auth: actor, jobId });
    assertAudioJob(detail.jobType);
    return detail;
  }

  async cancelRun(actor: Actor, jobId: string) {
    await this.getRun(actor, jobId);
    return cancelQueuedUserWorkerJob({ auth: actor, jobId });
  }

  async exportTranscript(actor: Actor, input: { transcriptArtifactId: string; formats: string[]; expectedRevision?: string }) {
    const [artifact] = await getDb().select({ storageRef: workerArtifacts.storageRef, metadataJson: workerArtifacts.metadataJson, jobId: workerArtifacts.workerJobId })
      .from(workerArtifacts)
      .innerJoin(workerJobs, eq(workerJobs.id, workerArtifacts.workerJobId))
      .where(and(eq(workerArtifacts.id, input.transcriptArtifactId), eq(workerJobs.tenantId, actor.tenantId), eq(workerJobs.requestedByUserId, actor.userId), eq(workerJobs.status, "completed")))
      .limit(1);
    if (!artifact) throw new TRPCError({ code: "NOT_FOUND", message: "Transcript artifact not found" });
    const bytes = await storageReadBuffer(artifact.storageRef);
    if (!bytes) throw new TRPCError({ code: "NOT_FOUND", message: "Transcript artifact is unavailable" });
    const parsed = audioTranscriptSchema.parse(JSON.parse(bytes.toString("utf8")));
    if (input.expectedRevision && input.expectedRevision !== parsed.sourceRevision) {
      throw new TRPCError({ code: "CONFLICT", message: "Transcript revision is stale" });
    }
    return { artifactId: input.transcriptArtifactId, revision: parsed.sourceRevision, exports: renderExports(parsed, input.formats) };
  }
}

export const unifiedAudioTranscriptionService = new UnifiedAudioTranscriptionService();

export const transcriptExportFormatValues = EXPORT_FORMATS;
