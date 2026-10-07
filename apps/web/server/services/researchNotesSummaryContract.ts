import { createHash } from "node:crypto";
import type { JobDefinition } from "./jobControlPlaneTypes";

export const RESEARCH_NOTES_SUMMARY_JOB_TYPE = "research_notes.summarize";
export const RESEARCH_NOTES_SUMMARY_CONTRACT = "mini-app-research-v1";

export function researchNoteSourceVersionHash(title: string, content: string): string {
  return createHash("sha256").update(`${title}\0${content}`, "utf8").digest("hex");
}

export function buildResearchNotesSummaryJobDefinition(input: {
  tenantId: string;
  userId: number;
  appId: string;
  projectId: string;
  noteId: string;
  sourceVersionHash: string;
}): JobDefinition {
  const version = input.sourceVersionHash.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(version)) throw new Error("RESEARCH_NOTES_SUMMARY_VERSION_INVALID");
  const scopeHash = createHash("sha256")
    .update(`${input.tenantId}\0${input.projectId}\0${input.noteId}\0${version}`, "utf8")
    .digest("hex");
  return {
    contractVersion: RESEARCH_NOTES_SUMMARY_CONTRACT,
    tenantId: input.tenantId,
    requestedByUserId: input.userId,
    jobType: RESEARCH_NOTES_SUMMARY_JOB_TYPE,
    executionClass: "long",
    priority: 20,
    input: {
      contractVersion: RESEARCH_NOTES_SUMMARY_CONTRACT,
      appId: input.appId,
      projectId: input.projectId,
      noteId: input.noteId,
      sourceVersionHash: version,
    },
    idempotencyKey: `research-notes-summary:${scopeHash}`,
    activeDedupeKey: `research-notes-summary:${input.tenantId}:${input.projectId}:${input.noteId}`,
    retryPolicy: {
      maxAttempts: 3,
      baseDelayMs: 5_000,
      maxDelayMs: 5 * 60_000,
      jitter: "bounded",
      deadlineMs: 15 * 60_000,
      allowedErrorClasses: ["retryable", "timeout", "unavailable"],
    },
    timeoutPolicy: { softTimeoutMs: 90_000, hardTimeoutMs: 5 * 60_000 },
  };
}
