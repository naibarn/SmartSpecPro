import { and, eq, sql } from "drizzle-orm";

import {
  workerCallbackMetadataSchema,
  type WorkerCallbackMetadata,
} from "../../shared/workerOpenClawPayloads";
import { getDb } from "../db";
import { teamRooms, teamRuns, workerJobEvents, workerJobs } from "../../drizzle/schema";
import { createRateLimiter } from "./rateLimiter";
import { publishWorkerArtifacts } from "./workerArtifactService";
import { sendMessage } from "./roomService";
import { recordEvent } from "./monitoringService";
import { createNotification } from "./notificationService";
import { auditLogger } from "./auditLogger";

type WorkerJobRecord = Record<string, any>;
type WorkerJobEventRecord = Record<string, any>;

const MAX_SUMMARY_LENGTH = 4_000;
const MAX_LINKS = 10;
const LIBRARY_ROUTE = "/library";
const CALLBACK_RATE_LIMITER = createRateLimiter("worker-callback-publish", {
  windowMs: 10 * 60 * 1000,
  maxRequests: 10,
  blockDurationMs: 10 * 60 * 1000,
});

export type WorkerCallbackChannel = "room_update" | "workflow_update" | "user_notification";

export interface WorkerCallbackLinkInput {
  label?: string;
  url: string;
  kind?: "artifact" | "dashboard" | "result" | "library" | "external";
}

export interface WorkerCallbackPayload {
  summary: string;
  links?: WorkerCallbackLinkInput[];
  publishArtifacts?: boolean;
  metadataJson?: WorkerCallbackMetadata;
}

export interface WorkerCallbackResult {
  accepted: boolean;
  replayed: boolean;
  channel: WorkerCallbackChannel;
  publishedArtifactCount: number;
  roomMessageId?: string | null;
  workflowEventRecorded?: boolean;
  notificationId?: number | null;
}

export class WorkerCallbackError extends Error {
  code: string;
  statusCode: number;
  type: string;

  constructor(code: string, statusCode: number, message: string, type = "invalid_request_error") {
    super(message);
    this.name = "WorkerCallbackError";
    this.code = code;
    this.statusCode = statusCode;
    this.type = type;
  }
}

export interface WorkerCallbackRepository {
  getJobById: (tenantId: string, jobId: string) => Promise<WorkerJobRecord | null>;
  getRunContext: (tenantId: string, runId: string) => Promise<{ id: string; roomId: string; teamId: string } | null>;
  findCallbackEvent: (
    workerJobId: string,
    channel: WorkerCallbackChannel,
    idempotencyKey: string,
  ) => Promise<WorkerJobEventRecord | null>;
  insertCallbackEvent: (
    workerJobId: string,
    channel: WorkerCallbackChannel,
    payloadJson: Record<string, unknown>,
  ) => Promise<WorkerJobEventRecord>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseAllowedDomains(): Set<string> {
  return new Set(
    String(process.env.WORKER_CALLBACK_ALLOWED_DOMAINS || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

function normalizeSummary(summary: string): string {
  const normalized = summary.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    throw new WorkerCallbackError("invalid_request", 400, "Callback summary is required");
  }
  if (normalized.length > MAX_SUMMARY_LENGTH) {
    throw new WorkerCallbackError(
      "callback_payload_too_large",
      400,
      `Callback summary must be ${MAX_SUMMARY_LENGTH} characters or fewer`,
    );
  }
  return normalized;
}

function normalizeLinks(links: WorkerCallbackLinkInput[] | undefined): Array<Required<WorkerCallbackLinkInput>> {
  const input = Array.isArray(links) ? links : [];
  if (input.length > MAX_LINKS) {
    throw new WorkerCallbackError(
      "callback_too_many_links",
      400,
      `Callback payloads may include at most ${MAX_LINKS} links`,
    );
  }

  const allowlistedDomains = parseAllowedDomains();

  return input.map((link, index) => {
    const label = typeof link.label === "string" && link.label.trim()
      ? link.label.trim().slice(0, 120)
      : `Link ${index + 1}`;
    const rawUrl = typeof link.url === "string" ? link.url.trim() : "";
    if (!rawUrl) {
      throw new WorkerCallbackError("invalid_request", 400, "Callback links require a URL");
    }

    if (rawUrl.startsWith("/")) {
      return {
        label,
        url: rawUrl,
        kind: link.kind ?? "result",
      };
    }

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new WorkerCallbackError("invalid_request", 400, `Invalid callback URL: ${rawUrl}`);
    }

    if (parsed.protocol !== "https:") {
      throw new WorkerCallbackError("invalid_request", 400, "Callback URLs must use HTTPS");
    }

    if (!allowlistedDomains.has(parsed.hostname.toLowerCase())) {
      throw new WorkerCallbackError(
        "callback_url_not_allowed",
        400,
        `External callback domain ${parsed.hostname} is not allowlisted`,
      );
    }

    return {
      label,
      url: parsed.toString(),
      kind: link.kind ?? "external",
    };
  });
}

function normalizeMetadata(
  metadata: WorkerCallbackMetadata | Record<string, unknown> | undefined,
): WorkerCallbackMetadata {
  const result = workerCallbackMetadataSchema.safeParse(metadata ?? {});
  if (result.success) {
    return result.data;
  }

  throw new WorkerCallbackError(
    "invalid_request",
    400,
    result.error.issues.map((issue) => issue.message).join("; ") || "Invalid callback metadata",
  );
}

function callbackEventType(channel: WorkerCallbackChannel): string {
  return `worker_callback_${channel}`;
}

function readContextString(source: unknown, key: string): string | null {
  if (!isPlainObject(source)) {
    return null;
  }
  const value = source[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function extractJobContext(job: WorkerJobRecord): {
  roomId: string | null;
  runId: string | null;
  teamId: string | null;
} {
  const inputJson = isPlainObject(job.inputJson) ? job.inputJson : {};
  return {
    roomId: readContextString(inputJson, "roomId"),
    runId: readContextString(inputJson, "runId") ?? (typeof job.workflowRunId === "string" ? job.workflowRunId : null),
    teamId: readContextString(inputJson, "teamId") ?? (typeof job.teamId === "string" ? job.teamId : null),
  };
}

function readCallbackEventPayload(event: WorkerJobEventRecord | null): Record<string, unknown> {
  if (!event || !isPlainObject(event.payloadJson)) {
    return {};
  }
  return event.payloadJson;
}

function buildMessageBody(summary: string, links: Array<Required<WorkerCallbackLinkInput>>): string {
  if (!links.length) {
    return summary;
  }

  const formattedLinks = links.map((link) => `- ${link.label}: ${link.url}`).join("\n");
  return `${summary}\n\n${formattedLinks}`;
}

const defaultRepo: WorkerCallbackRepository = {
  async getJobById(tenantId, jobId) {
    const db = await getDb();
    const [job] = await db
      .select()
      .from(workerJobs)
      .where(and(eq(workerJobs.tenantId, tenantId), eq(workerJobs.id, jobId)))
      .limit(1);
    return job ?? null;
  },
  async getRunContext(tenantId, runId) {
    const db = await getDb();
    const [run] = await db
      .select({
        id: teamRuns.id,
        roomId: teamRuns.roomId,
        teamId: teamRuns.teamId,
      })
      .from(teamRuns)
      .innerJoin(teamRooms, eq(teamRooms.id, teamRuns.roomId))
      .where(and(eq(teamRuns.id, runId), eq(teamRooms.tenantId, tenantId)))
      .limit(1);
    return run ?? null;
  },
  async findCallbackEvent(workerJobId, channel, idempotencyKey) {
    const db = await getDb();
    const [event] = await db
      .select()
      .from(workerJobEvents)
      .where(
        and(
          eq(workerJobEvents.workerJobId, workerJobId),
          eq(workerJobEvents.eventType, callbackEventType(channel)),
          sql`${workerJobEvents.payloadJson} ->> 'idempotencyKey' = ${idempotencyKey}`,
        ),
      )
      .limit(1);
    return event ?? null;
  },
  async insertCallbackEvent(workerJobId, channel, payloadJson) {
    const db = await getDb();
    const [event] = await db
      .insert(workerJobEvents)
      .values({
        workerJobId,
        eventType: callbackEventType(channel),
        payloadJson,
      } as any)
      .returning();
    return event;
  },
};

async function buildPublishedArtifactLinks(job: WorkerJobRecord): Promise<Array<Required<WorkerCallbackLinkInput>>> {
  const results = await publishWorkerArtifacts({
    tenantId: String(job.tenantId),
    jobId: String(job.id),
    actorUserId: job.requestedByUserId ?? null,
  });

  return results.map((result, index) => ({
    label: `Published artifact ${index + 1}`,
    url: `${LIBRARY_ROUTE}?itemId=${result.publishedItemId}`,
    kind: "library",
  }));
}

async function publishRoomUpdate(
  job: WorkerJobRecord,
  summary: string,
  links: Array<Required<WorkerCallbackLinkInput>>,
  metadata: WorkerCallbackMetadata,
): Promise<string> {
  const context = extractJobContext(job);
  if (!context.roomId) {
    throw new WorkerCallbackError(
      "callback_target_unavailable",
      409,
      "This worker job does not have an originating room target",
    );
  }

  const message = await sendMessage({
    roomId: context.roomId,
    tenantId: String(job.tenantId),
    senderType: "system",
    recipientType: "all",
    runId: context.runId ?? undefined,
    turnType: "summary",
    visibility: "summary_only",
    content: buildMessageBody(summary, links),
    summaryContent: summary,
    artifactRefsJson: links,
    metadataJson: {
      source: "worker_callback",
      workerJobId: job.id,
      workerId: job.workerId,
      callbackMetadata: metadata,
    },
  });

  return message.id;
}

async function publishWorkflowUpdate(
  job: WorkerJobRecord,
  summary: string,
  links: Array<Required<WorkerCallbackLinkInput>>,
  metadata: WorkerCallbackMetadata,
  repo: WorkerCallbackRepository,
): Promise<void> {
  const context = extractJobContext(job);
  if (!context.runId) {
    throw new WorkerCallbackError(
      "callback_target_unavailable",
      409,
      "This worker job does not have an originating workflow target",
    );
  }

  const runContext = await repo.getRunContext(String(job.tenantId), context.runId);
  if (!runContext) {
    throw new WorkerCallbackError("callback_target_unavailable", 409, "Workflow target is no longer available");
  }

  await recordEvent({
    tenantId: String(job.tenantId),
    teamId: runContext.teamId,
    roomId: runContext.roomId,
    runId: runContext.id,
    eventType: "worker_result_published",
    eventCategory: "artifact_op",
    visibility: "summary_only",
    summary,
    detailJson: {
      source: "worker_callback",
      workerJobId: job.id,
      workerId: job.workerId,
      links,
      callbackMetadata: metadata,
    },
  });
}

async function publishUserNotification(
  job: WorkerJobRecord,
  summary: string,
  links: Array<Required<WorkerCallbackLinkInput>>,
  metadata: WorkerCallbackMetadata,
): Promise<number | null> {
  if (!job.requestedByUserId) {
    throw new WorkerCallbackError(
      "callback_target_unavailable",
      409,
      "This worker job does not have an owning user notification target",
    );
  }

  const db = await getDb();
  const firstActionUrl = links.find((link) => link.url.startsWith("/") || link.kind === "library")?.url;
  const result = await createNotification({
    db,
    userId: Number(job.requestedByUserId),
    type: "system",
    title: "Worker finished an assigned task",
    content: summary,
    priority: "normal",
    relatedResourceType: "team_run",
    relatedResourceId: extractJobContext(job).runId ?? String(job.id),
    actionUrl: firstActionUrl,
    actionLabel: firstActionUrl ? "Open result" : undefined,
    metadata: {
      source: "worker_callback",
      relatedItems: links.reduce<Record<string, string>>((acc, link, index) => {
        acc[`link_${index + 1}`] = link.url;
        return acc;
      }, {}),
      callbackMetadata: metadata,
    } as any,
  });

  return result?.notificationId ?? null;
}

export async function publishWorkerCallback(
  input: {
    tenantId: string;
    jobId: string;
    channel: WorkerCallbackChannel;
    idempotencyKey: string;
    payload: WorkerCallbackPayload;
  },
  deps: { repo?: WorkerCallbackRepository } = {},
): Promise<WorkerCallbackResult> {
  const repo = deps.repo ?? defaultRepo;
  const job = await repo.getJobById(input.tenantId, input.jobId);
  if (!job) {
    throw new WorkerCallbackError("job_not_found", 404, `Worker job ${input.jobId} was not found`, "not_found_error");
  }

  if (!input.idempotencyKey.trim()) {
    throw new WorkerCallbackError("idempotency_required", 400, "Idempotency-Key header is required");
  }

  const deduped = await repo.findCallbackEvent(job.id, input.channel, input.idempotencyKey);
  if (deduped) {
    const eventPayload = readCallbackEventPayload(deduped);
    return {
      accepted: false,
      replayed: true,
      channel: input.channel,
      publishedArtifactCount: Number(eventPayload.publishedArtifactCount ?? 0),
      roomMessageId: typeof eventPayload.roomMessageId === "string" ? eventPayload.roomMessageId : null,
      workflowEventRecorded: Boolean(eventPayload.workflowEventRecorded),
      notificationId: typeof eventPayload.notificationId === "number" ? eventPayload.notificationId : null,
    };
  }

  if (!CALLBACK_RATE_LIMITER.isAllowed(job.id)) {
    throw new WorkerCallbackError(
      "callback_rate_limited",
      429,
      "This worker job has reached the callback publish rate limit",
      "rate_limit_error",
    );
  }

  const summary = normalizeSummary(input.payload.summary);
  const links = normalizeLinks(input.payload.links);
  const metadata = normalizeMetadata(input.payload.metadataJson);
  const artifactLinks = input.payload.publishArtifacts ? await buildPublishedArtifactLinks(job) : [];
  const mergedLinks = [...links, ...artifactLinks].slice(0, MAX_LINKS);

  let roomMessageId: string | null = null;
  let workflowEventRecorded = false;
  let notificationId: number | null = null;

  if (input.channel === "room_update") {
    roomMessageId = await publishRoomUpdate(job, summary, mergedLinks, metadata);
  } else if (input.channel === "workflow_update") {
    await publishWorkflowUpdate(job, summary, mergedLinks, metadata, repo);
    workflowEventRecorded = true;
  } else {
    notificationId = await publishUserNotification(job, summary, mergedLinks, metadata);
  }

  await repo.insertCallbackEvent(job.id, input.channel, {
    idempotencyKey: input.idempotencyKey,
    summary,
    links: mergedLinks,
    publishedArtifactCount: artifactLinks.length,
    roomMessageId,
    workflowEventRecorded,
    notificationId,
    metadataJson: metadata,
  });

  auditLogger.log({
    eventType: "worker_callback_published",
    userId: job.requestedByUserId ?? null,
    metadata: {
      tenantId: job.tenantId,
      workerId: job.workerId,
      workerJobId: job.id,
      channel: input.channel,
      publishedArtifactCount: artifactLinks.length,
      idempotencyKey: input.idempotencyKey,
    },
  });

  return {
    accepted: true,
    replayed: false,
    channel: input.channel,
    publishedArtifactCount: artifactLinks.length,
    roomMessageId,
    workflowEventRecorded,
    notificationId,
  };
}
