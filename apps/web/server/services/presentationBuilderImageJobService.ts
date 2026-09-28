import crypto from "node:crypto";
import { and, asc, count, eq, inArray, lte } from "drizzle-orm";

import { presentationBuilderImageJobs } from "../../drizzle/schema";
import { signBearerToken } from "../_core/tokens";
import { getDb } from "../db";
import { getUnifiedMediaTask } from "./mediaTaskPollingService";
import { ensurePresentationTaskResultDurable } from "./presentationMediaAssetService";

export const PRESENTATION_BUILDER_IMAGE_JOB_STATUSES = [
  "processing",
  "completed",
  "failed",
] as const;

export type PresentationBuilderImageJobStatus =
  (typeof PRESENTATION_BUILDER_IMAGE_JOB_STATUSES)[number];

export type RegisterPresentationBuilderImageJobInput = {
  tenantId: string;
  userId: number;
  deckId: number;
  slotId: string;
  pageNumber: number;
  imageIndex: number;
  placementRole: "hero" | "supporting" | "detail";
  shortLabel: string;
  prompt: string;
  model?: string;
  canvasRatio?: string;
  mediaTaskId: string;
};

export type PresentationBuilderImageJobView = {
  id: string;
  deckId: number;
  slotId: string;
  pageNumber: number;
  imageIndex: number;
  placementRole: "hero" | "supporting" | "detail";
  shortLabel: string;
  prompt: string;
  model: string | null;
  canvasRatio: string | null;
  mediaTaskId: string;
  status: PresentationBuilderImageJobStatus;
  resultUrl: string | null;
  errorMessage: string | null;
  attemptCount: number;
  lastCheckedAt: string | null;
  completedAt: string | null;
};

function normalizeStatus(value: string): PresentationBuilderImageJobStatus {
  if (value === "completed" || value === "failed") return value;
  return "processing";
}

function toView(
  row: typeof presentationBuilderImageJobs.$inferSelect
): PresentationBuilderImageJobView {
  return {
    id: row.id,
    deckId: row.deckId,
    slotId: row.slotId,
    pageNumber: row.pageNumber,
    imageIndex: row.imageIndex,
    placementRole:
      row.placementRole as PresentationBuilderImageJobView["placementRole"],
    shortLabel: row.shortLabel,
    prompt: row.prompt,
    model: row.model,
    canvasRatio: row.canvasRatio,
    mediaTaskId: row.mediaTaskId,
    status: normalizeStatus(row.status),
    resultUrl: row.resultUrl,
    errorMessage: row.errorMessage,
    attemptCount: row.attemptCount,
    lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

export async function registerPresentationBuilderImageJob(
  input: RegisterPresentationBuilderImageJobInput
): Promise<PresentationBuilderImageJobView> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [row] = await db
    .insert(presentationBuilderImageJobs)
    .values({
      id: `pbj_${crypto.randomUUID()}`,
      tenantId: input.tenantId,
      userId: input.userId,
      deckId: input.deckId,
      slotId: input.slotId,
      pageNumber: input.pageNumber,
      imageIndex: input.imageIndex,
      placementRole: input.placementRole,
      shortLabel: input.shortLabel,
      prompt: input.prompt,
      model: input.model,
      canvasRatio: input.canvasRatio,
      mediaTaskId: input.mediaTaskId,
      status: "processing",
      resultUrl: null,
      errorMessage: null,
      attemptCount: 0,
      nextPollAt: new Date(),
      lastCheckedAt: null,
      completedAt: null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        presentationBuilderImageJobs.tenantId,
        presentationBuilderImageJobs.userId,
        presentationBuilderImageJobs.deckId,
        presentationBuilderImageJobs.slotId,
      ],
      set: {
        pageNumber: input.pageNumber,
        imageIndex: input.imageIndex,
        placementRole: input.placementRole,
        shortLabel: input.shortLabel,
        prompt: input.prompt,
        model: input.model,
        canvasRatio: input.canvasRatio,
        mediaTaskId: input.mediaTaskId,
        status: "processing",
        resultUrl: null,
        errorMessage: null,
        attemptCount: 0,
        nextPollAt: new Date(),
        lastCheckedAt: null,
        completedAt: null,
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!row)
    throw new Error("Failed to register Presentation Builder image job");
  return toView(row);
}

export async function listPresentationBuilderImageJobs(input: {
  tenantId: string;
  userId: number;
  deckId: number;
}): Promise<PresentationBuilderImageJobView[]> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select()
    .from(presentationBuilderImageJobs)
    .where(
      and(
        eq(presentationBuilderImageJobs.tenantId, input.tenantId),
        eq(presentationBuilderImageJobs.userId, input.userId),
        eq(presentationBuilderImageJobs.deckId, input.deckId)
      )
    )
    .orderBy(
      asc(presentationBuilderImageJobs.pageNumber),
      asc(presentationBuilderImageJobs.imageIndex)
    );
  return rows.map(toView);
}

function nextPollDelayMs(attemptCount: number): number {
  return Math.min(
    30 * 60_000,
    15_000 * 2 ** Math.min(6, Math.max(0, attemptCount))
  );
}

function errorText(error: unknown): string {
  return (
    error instanceof Error ? error.message : String(error ?? "Unknown error")
  )
    .replace(/https?:\/\/\S+/gi, "[provider-url]")
    .slice(0, 500);
}

/** A missing provider task cannot become available by polling again. */
export function isMissingPresentationMediaTaskError(error: unknown): boolean {
  return /\btask\b[\s\S]{0,120}\bnot found\b/i.test(errorText(error));
}

export async function reconcilePresentationBuilderImageJobs(
  input: {
    limit?: number;
  } = {}
): Promise<{
  checked: number;
  completed: number;
  failed: number;
  remaining: number;
}> {
  const db = await getDb();
  if (!db) return { checked: 0, completed: 0, failed: 0, remaining: 0 };

  const now = new Date();
  const rows = await db
    .select()
    .from(presentationBuilderImageJobs)
    .where(
      and(
        inArray(presentationBuilderImageJobs.status, ["processing"]),
        lte(presentationBuilderImageJobs.nextPollAt, now)
      )
    )
    .orderBy(asc(presentationBuilderImageJobs.nextPollAt))
    .limit(Math.max(1, Math.min(200, Math.round(input.limit ?? 50))));

  let completed = 0;
  let failed = 0;
  for (const row of rows) {
    const checkedAt = new Date();
    try {
      const userToken = signBearerToken(
        {
          sub: String(row.userId),
          type: "access",
          scopes: ["media:generate"],
          jti: `presentation_builder_${Date.now()}_${crypto.randomUUID()}`,
        },
        "5m"
      );
      const task = await getUnifiedMediaTask({
        taskId: row.mediaTaskId,
        userId: row.userId,
        userToken,
        tenantId: row.tenantId,
        auditContext: {
          userId: row.userId,
          tenantId: row.tenantId,
          source: "presentationBuilderImageJobService",
          stage: "background_poll",
          deckId: row.deckId,
        },
      });

      if (task.status === "completed") {
        const durable = await ensurePresentationTaskResultDurable({
          tenantId: row.tenantId,
          userId: row.userId,
          deckId: row.deckId,
          task,
          mediaType: "image",
          slotId: row.slotId,
        });
        if (!durable) {
          throw new Error(
            "งานสร้างภาพเสร็จแล้วแต่ยังไม่พบไฟล์ผลลัพธ์สำหรับจัดเก็บ"
          );
        }
        await db
          .update(presentationBuilderImageJobs)
          .set({
            status: "completed",
            resultUrl: durable.durableUrl,
            errorMessage: null,
            lastCheckedAt: checkedAt,
            completedAt: checkedAt,
            updatedAt: checkedAt,
          })
          .where(eq(presentationBuilderImageJobs.id, row.id));
        completed += 1;
        continue;
      }

      if (task.status === "failed" || task.status === "cancelled") {
        await db
          .update(presentationBuilderImageJobs)
          .set({
            status: "failed",
            errorMessage: (task.errorMessage || `task_${task.status}`).slice(
              0,
              500
            ),
            lastCheckedAt: checkedAt,
            updatedAt: checkedAt,
          })
          .where(eq(presentationBuilderImageJobs.id, row.id));
        failed += 1;
        continue;
      }

      await db
        .update(presentationBuilderImageJobs)
        .set({
          status: "processing",
          errorMessage: null,
          attemptCount: row.attemptCount + 1,
          nextPollAt: new Date(
            checkedAt.getTime() + nextPollDelayMs(row.attemptCount)
          ),
          lastCheckedAt: checkedAt,
          updatedAt: checkedAt,
        })
        .where(eq(presentationBuilderImageJobs.id, row.id));
    } catch (error) {
      const attemptCount = row.attemptCount + 1;
      const missingTask = isMissingPresentationMediaTaskError(error);
      await db
        .update(presentationBuilderImageJobs)
        .set({
          status: missingTask ? "failed" : "processing",
          errorMessage: missingTask
            ? "งานสร้างภาพต้นทางไม่พบแล้ว กรุณาสร้างภาพใหม่"
            : errorText(error),
          attemptCount,
          ...(missingTask
            ? { nextPollAt: checkedAt }
            : {
                nextPollAt: new Date(
                  checkedAt.getTime() + nextPollDelayMs(attemptCount)
                ),
              }),
          lastCheckedAt: checkedAt,
          updatedAt: checkedAt,
        })
        .where(eq(presentationBuilderImageJobs.id, row.id));
      if (missingTask) failed += 1;
    }
  }

  const [remainingRow] = await db
    .select({ count: count(presentationBuilderImageJobs.id) })
    .from(presentationBuilderImageJobs)
    .where(eq(presentationBuilderImageJobs.status, "processing"));

  return {
    checked: rows.length,
    completed,
    failed,
    remaining: Number(remainingRow?.count ?? 0),
  };
}

const PRESENTATION_BUILDER_IMAGE_POLL_INTERVAL_MS = 30_000;
let presentationBuilderImageSchedulerTimer: ReturnType<
  typeof setInterval
> | null = null;
let presentationBuilderImageSchedulerRunning = false;

async function runPresentationBuilderImageSchedulerTick(): Promise<void> {
  if (presentationBuilderImageSchedulerRunning) return;
  presentationBuilderImageSchedulerRunning = true;
  try {
    await reconcilePresentationBuilderImageJobs({ limit: 50 });
  } catch (error) {
    console.error(
      "[PresentationBuilderImageScheduler] Tick failed",
      error instanceof Error ? error.message : String(error)
    );
  } finally {
    presentationBuilderImageSchedulerRunning = false;
  }
}

export function startPresentationBuilderImageJobScheduler(): void {
  if (presentationBuilderImageSchedulerTimer) return;
  console.log(
    `[PresentationBuilderImageScheduler] Started (interval=${PRESENTATION_BUILDER_IMAGE_POLL_INTERVAL_MS}ms)`
  );
  presentationBuilderImageSchedulerTimer = setInterval(() => {
    void runPresentationBuilderImageSchedulerTick();
  }, PRESENTATION_BUILDER_IMAGE_POLL_INTERVAL_MS);
  setTimeout(() => {
    void runPresentationBuilderImageSchedulerTick();
  }, 5_000);
}

export function stopPresentationBuilderImageJobScheduler(): void {
  if (!presentationBuilderImageSchedulerTimer) return;
  clearInterval(presentationBuilderImageSchedulerTimer);
  presentationBuilderImageSchedulerTimer = null;
  presentationBuilderImageSchedulerRunning = false;
  console.log("[PresentationBuilderImageScheduler] Stopped");
}
