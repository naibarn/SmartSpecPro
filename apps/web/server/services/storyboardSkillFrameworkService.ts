import crypto from "node:crypto";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  characterLibraryCharacters,
  characterLibraryRevisions,
  characterLibraryLooks,
  characterLibraryAssets,
  mediaStudioStoryboardReviews,
  mediaModels,
  mediaAssets,
  verticalDramaSeries,
  verticalDramaCharacters,
  verticalDramaCharacterAssets,
  storyboardSkillProjects,
  storyboardSkillRuns,
  storyboardSkillShots,
  storyboardSkillProjectCharacters,
  workerJobs,
  workerJobEvents,
} from "../../drizzle/schema";
import {
  buildStoryboardConfirmationFingerprint,
  fingerprintStoryboardSnapshot,
  isTerminalStoryboardRunStatus,
  isReusableStoryboardImage,
  isStoryboardRunRecoverable,
  normalizeStoryboardGlobalInput,
  isRepairableStoryboardShot,
  redactStoryboardValue,
  STORYBOARD_RECOVERY_INDEX_EXCLUDED_STATUSES,
  storyboardCanonicalSkillResponseSchema,
  type StoryboardGlobalInput,
} from "./storyboardSkillFrameworkContracts";
import {
  assertStoryboardSkillInputs,
  getStoryboardSkillSchema,
  assertModelSelection,
  normalizeModelCapability,
} from "./storyboardSkillRegistry";
import {
  planStoryboardShots,
  runStoryboardPromptPipeline,
} from "./storyboardSkillFrameworkPipeline";
import { buildStoryboardReviewProjection } from "./storyboardSkillFrameworkProjection";
import { createControlPlaneJob } from "./jobControlPlaneGateway";
import {
  createJobControlPlane,
  type JobMutationScope,
} from "./jobControlPlane";
import { JobControlPlaneError } from "./jobControlPlaneTypes";

function requireTenant(tenantId: string | null | undefined): string {
  if (!tenantId) throw new Error("Tenant context is required");
  return tenantId;
}

const CONTROL_PLANE_TERMINAL_STATUSES = new Set([
  "succeeded",
  "failed",
  "cancelled",
  "expired",
]);

async function cancelStoryboardWorkerJobIfActive(input: {
  controlPlane: ReturnType<typeof createJobControlPlane>;
  jobId: string;
  reason: string;
  actionId: string;
  actorId: number;
  scope: JobMutationScope;
}): Promise<void> {
  const status = await input.controlPlane.getStatus(input.jobId, input.scope);
  if (!status || CONTROL_PLANE_TERMINAL_STATUSES.has(status.status)) return;

  try {
    await input.controlPlane.cancel(
      input.jobId,
      input.reason,
      input.actionId,
      input.actorId,
      input.scope
    );
  } catch (error) {
    if (
      !(error instanceof JobControlPlaneError) ||
      error.code !== "JOB_STATE_CONFLICT"
    ) {
      throw error;
    }

    // The worker may have completed between getStatus and cancel. Treat that
    // race as an already-settled cancellation instead of surfacing a modal to
    // the user. Re-throw only if the job is still active and needs attention.
    const current = await input.controlPlane.getStatus(
      input.jobId,
      input.scope
    );
    if (
      !current ||
      current.status === "cancel_requested" ||
      CONTROL_PLANE_TERMINAL_STATUSES.has(current.status)
    ) {
      return;
    }
    throw error;
  }
}

function storyboardManagedAssetUrl(
  storageKey: string | null | undefined
): string | null {
  return storageKey
    ? `/api/storage/files/${encodeURIComponent(storageKey)}`
    : null;
}

function storyboardRepairActionId(
  runId: string,
  attempt: number,
  shotNumbers: number[]
): string {
  const digest = crypto
    .createHash("sha256")
    .update(
      `storyboard-review:${runId}:${attempt}:${[...shotNumbers].sort((a, b) => a - b).join(",")}`,
      "utf8"
    )
    .digest("hex")
    .slice(0, 32);
  return `storyboard-review:${digest}`;
}

function assertStoryboardIdempotencyMatch(
  existingFingerprint: string,
  requestedFingerprint: string
): void {
  if (existingFingerprint !== requestedFingerprint) {
    throw new Error("IDEMPOTENCY_CONFLICT");
  }
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    String((error as { code?: unknown }).code) === "23505"
  );
}

async function enrichStoryboardCharacterReferences(
  db: { select: (...args: any[]) => any },
  normalized: StoryboardGlobalInput,
  tenantId: string,
  userId: number
): Promise<StoryboardGlobalInput> {
  if (normalized.characterIds.length === 0) return normalized;
  const portraits = await db
    .select({
      characterId: characterLibraryAssets.characterId,
      mediaAssetId: characterLibraryAssets.mediaAssetId,
    })
    .from(characterLibraryAssets)
    .innerJoin(
      characterLibraryCharacters,
      and(
        eq(characterLibraryCharacters.id, characterLibraryAssets.characterId),
        eq(characterLibraryCharacters.tenantId, tenantId),
        eq(characterLibraryCharacters.userId, userId),
        eq(characterLibraryCharacters.status, "active")
      )
    )
    .innerJoin(
      mediaAssets,
      and(
        eq(mediaAssets.id, characterLibraryAssets.mediaAssetId),
        eq(mediaAssets.tenantId, tenantId),
        eq(mediaAssets.userId, userId),
        ne(mediaAssets.status, "expired")
      )
    )
    .where(
      and(
        inArray(characterLibraryCharacters.id, normalized.characterIds),
        eq(characterLibraryAssets.tenantId, tenantId),
        eq(characterLibraryAssets.role, "portrait")
      )
    )
    .orderBy(
      desc(characterLibraryAssets.revision),
      desc(characterLibraryAssets.createdAt)
    );

  const requestedLookEntries = Object.entries(
    normalized.characterLookIds
  ).filter(([characterId]) => normalized.characterIds.includes(characterId));
  const requestedLookIds = requestedLookEntries.map(([, lookId]) => lookId);
  const looks =
    requestedLookIds.length > 0
      ? await db
          .select({
            id: characterLibraryLooks.id,
            characterId: characterLibraryLooks.characterId,
            lookJson: characterLibraryLooks.lookJson,
          })
          .from(characterLibraryLooks)
          .innerJoin(
            characterLibraryCharacters,
            and(
              eq(
                characterLibraryCharacters.id,
                characterLibraryLooks.characterId
              ),
              eq(characterLibraryCharacters.tenantId, tenantId),
              eq(characterLibraryCharacters.userId, userId),
              eq(characterLibraryCharacters.status, "active")
            )
          )
          .where(
            and(
              inArray(characterLibraryLooks.id, requestedLookIds),
              eq(characterLibraryLooks.tenantId, tenantId),
              eq(characterLibraryLooks.status, "active")
            )
          )
      : [];
  const lookAssetIds = looks
    .map(look => Number(look.lookJson?.mediaAssetId))
    .filter((id): id is number => Number.isSafeInteger(id) && id > 0);
  const lookAssets =
    lookAssetIds.length > 0
      ? await db
          .select({
            characterId: characterLibraryLooks.characterId,
            mediaAssetId: characterLibraryAssets.mediaAssetId,
          })
          .from(characterLibraryLooks)
          .innerJoin(
            characterLibraryCharacters,
            and(
              eq(
                characterLibraryCharacters.id,
                characterLibraryLooks.characterId
              ),
              eq(characterLibraryCharacters.tenantId, tenantId),
              eq(characterLibraryCharacters.userId, userId),
              eq(characterLibraryCharacters.status, "active")
            )
          )
          .innerJoin(
            characterLibraryAssets,
            and(
              eq(
                characterLibraryAssets.characterId,
                characterLibraryLooks.characterId
              ),
              eq(characterLibraryAssets.tenantId, tenantId),
              eq(characterLibraryAssets.role, "look"),
              inArray(characterLibraryAssets.mediaAssetId, lookAssetIds)
            )
          )
          .innerJoin(
            mediaAssets,
            and(
              eq(mediaAssets.id, characterLibraryAssets.mediaAssetId),
              eq(mediaAssets.tenantId, tenantId),
              eq(mediaAssets.userId, userId),
              ne(mediaAssets.status, "expired")
            )
          )
          .where(
            and(
              inArray(
                characterLibraryLooks.characterId,
                normalized.characterIds
              ),
              eq(characterLibraryLooks.tenantId, tenantId),
              eq(characterLibraryLooks.status, "active")
            )
          )
      : [];
  const lookAssetById = new Map(
    looks
      .map(look => {
        const mediaAssetId = Number(look.lookJson?.mediaAssetId);
        const asset = lookAssets.find(
          candidate =>
            candidate.characterId === look.characterId &&
            candidate.mediaAssetId === mediaAssetId
        );
        return asset
          ? ([String(look.id), { ...asset, lookId: look.id }] as const)
          : null;
      })
      .filter(
        (
          value
        ): value is readonly [
          string,
          { characterId: string; mediaAssetId: number; lookId: string },
        ] => value !== null
      )
  );

  const existing = Array.isArray(
    normalized.skillInputs.character_reference_images
  )
    ? normalized.skillInputs.character_reference_images
    : [];
  const references: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  for (const value of existing) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const assetId = String(
      (value as Record<string, unknown>).asset_id ??
        (value as Record<string, unknown>).assetId ??
        ""
    ).trim();
    if (!assetId || seen.has(assetId)) continue;
    seen.add(assetId);
    references.push(value as Record<string, unknown>);
  }
  const portraitByCharacter = new Map<
    number | string,
    (typeof portraits)[number]
  >();
  for (const portrait of portraits) {
    if (
      portrait.mediaAssetId == null ||
      portraitByCharacter.has(portrait.characterId)
    )
      continue;
    portraitByCharacter.set(portrait.characterId, portrait);
  }
  for (const characterId of normalized.characterIds) {
    const requestedLookId = normalized.characterLookIds[characterId];
    const selectedLook = requestedLookId
      ? lookAssetById.get(requestedLookId)
      : undefined;
    const portrait =
      selectedLook && String(selectedLook.characterId) === characterId
        ? selectedLook
        : portraitByCharacter.get(characterId);
    if (!portrait?.mediaAssetId) {
      throw new Error("Character reference image is not available");
    }
    const assetId = String(portrait.mediaAssetId);
    if (seen.has(assetId)) continue;
    seen.add(assetId);
    references.push({ asset_id: assetId, role: "identity_reference" });
    if (references.length >= 5) break;
  }
  if (references.length === 0) return normalized;
  return {
    ...normalized,
    skillInputs: {
      ...normalized.skillInputs,
      character_reference_images: references.slice(0, 5),
    },
  };
}

async function assertStoryboardModelSelections(
  db: { select: (...args: any[]) => any },
  input: StoryboardGlobalInput
) {
  for (const [mediaType, selection] of [
    ["image", input.imageModelSelection],
    ["video", input.videoModelSelection],
  ] as const) {
    const [model] = await db
      .select({
        id: mediaModels.modelId,
        type: mediaModels.modelType,
        provider: mediaModels.provider,
        configJson: mediaModels.configJson,
        aspectRatios: mediaModels.aspectRatios,
      })
      .from(mediaModels)
      .where(
        and(
          eq(mediaModels.modelId, selection.modelId),
          eq(mediaModels.modelType, mediaType),
          eq(mediaModels.isEnabled, true)
        )
      )
      .limit(1);
    if (!model) throw new Error(`Selected ${mediaType} model is unavailable`);
    const config =
      model.configJson && typeof model.configJson === "object"
        ? (model.configJson as Record<string, unknown>)
        : {};
    const capability = normalizeModelCapability({
      id: model.id,
      type: model.type,
      providerId: model.provider,
      configJson: {
        ...config,
        aspectRatios: model.aspectRatios ?? config.aspectRatios,
      },
    });
    assertModelSelection(capability, selection);
  }
}

async function ensureStoryboardControlPlaneJob(input: {
  runId: string;
  tenantId: string;
  userId: number;
  workerJobId?: string | null;
}) {
  if (input.workerJobId) return input.workerJobId;
  const job = await createControlPlaneJob({
    context: {
      tenantId: input.tenantId,
      actorType: "user",
      actorId: input.userId,
      authorizationScope: "storyboard:generate",
      correlationId: `storyboard-skill-run:${input.runId}`,
      idempotencyKey: `storyboard-skill-run:${input.runId}`,
    },
    definition: {
      contractVersion: "feature-186-v1",
      jobType: "storyboard.skill.run",
      executionClass: "long",
      input: { runId: input.runId },
      retryPolicy: {
        // The coordinator gates the canonical Shot 1 image, then publishes
        // idempotent per-shot jobs for the continuation shots. A bounded
        // repair budget keeps both stages resumable without an unbounded loop.
        maxAttempts: 12,
        baseDelayMs: 5_000,
        maxDelayMs: 120_000,
        jitter: "bounded",
        deadlineMs: 7 * 24 * 60 * 60 * 1000,
        allowedErrorClasses: ["retryable", "timeout", "unavailable"],
      },
      timeoutPolicy: {
        softTimeoutMs: 30 * 60_000,
        hardTimeoutMs: 24 * 60 * 60_000,
      },
    },
    createOptions: {
      // Provider capacity controls when this job is submitted, not whether
      // the canonical storyboard request is accepted into PostgreSQL.
      admissionMode: "durable_queue",
    },
  });
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db
    .update(storyboardSkillRuns)
    .set({ workerJobId: job.jobId, updatedAt: new Date() })
    .where(
      and(
        eq(storyboardSkillRuns.id, input.runId),
        eq(storyboardSkillRuns.tenantId, input.tenantId),
        eq(storyboardSkillRuns.userId, input.userId)
      )
    );
  return job.jobId;
}

async function enqueueStoryboardRepairJobs(input: {
  runId: string;
  tenantId: string;
  userId: number;
  shotNumbers: number[];
  attemptByShot: Map<number, number>;
}) {
  await Promise.all(
    input.shotNumbers.map(shotNumber =>
      createControlPlaneJob({
        context: {
          tenantId: input.tenantId,
          actorType: "user",
          actorId: input.userId,
          authorizationScope: "storyboard:generate",
          correlationId: `storyboard-skill-run:${input.runId}:repair:${shotNumber}`,
          idempotencyKey: `storyboard-skill-shot:${input.runId}:${shotNumber}:attempt:${input.attemptByShot.get(shotNumber) ?? 1}`,
        },
        definition: {
          contractVersion: "feature-186-v1",
          jobType: "storyboard.skill.run",
          executionClass: "long",
          input: { runId: input.runId, shotNumber },
          retryPolicy: {
            maxAttempts: 12,
            baseDelayMs: 5_000,
            maxDelayMs: 120_000,
            jitter: "bounded",
            deadlineMs: 7 * 24 * 60 * 60 * 1000,
            allowedErrorClasses: ["retryable", "timeout", "unavailable"],
          },
          timeoutPolicy: {
            softTimeoutMs: 30 * 60_000,
            hardTimeoutMs: 24 * 60 * 60_000,
          },
        },
        createOptions: { admissionMode: "durable_queue" },
      })
    )
  );
}

export async function createStoryboardSkillDraft(input: {
  userId: number;
  tenantId: string | null | undefined;
  idempotencyKey: string;
  draft: unknown;
}) {
  const tenantId = requireTenant(input.tenantId);
  const normalized = normalizeStoryboardGlobalInput(input.draft);
  const skill = getStoryboardSkillSchema(normalized.selectedSkillId);
  if (skill.version !== normalized.selectedSkillVersion)
    throw new Error("Selected skill version is unavailable");
  assertStoryboardSkillInputs(skill, normalized.skillInputs);
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await assertStoryboardModelSelections(db, normalized);

  try {
    return await db.transaction(async tx => {
      const enriched = await enrichStoryboardCharacterReferences(
        tx,
        normalized,
        tenantId,
        input.userId
      );
      const requestedFingerprint = buildStoryboardConfirmationFingerprint(
        enriched,
        skill
      );
      const [existing] = await tx
        .select({ project: storyboardSkillProjects, run: storyboardSkillRuns })
        .from(storyboardSkillRuns)
        .innerJoin(
          storyboardSkillProjects,
          eq(storyboardSkillProjects.id, storyboardSkillRuns.projectId)
        )
        .where(
          and(
            eq(storyboardSkillRuns.tenantId, tenantId),
            eq(storyboardSkillRuns.userId, input.userId),
            eq(storyboardSkillRuns.idempotencyKey, input.idempotencyKey)
          )
        )
        .limit(1);
      if (existing) {
        assertStoryboardIdempotencyMatch(
          existing.run.confirmationFingerprint,
          requestedFingerprint
        );
        return {
          projectId: existing.project.id,
          runId: existing.run.id,
          status: existing.run.status,
          normalizedSnapshot: existing.run.normalizedSnapshot,
          confirmationFingerprint: existing.run.confirmationFingerprint,
        };
      }
      const enrichedFingerprint = buildStoryboardConfirmationFingerprint(
        enriched,
        skill
      );
      const projectId = crypto.randomUUID();
      const runId = crypto.randomUUID();
      await tx.insert(storyboardSkillProjects).values({
        id: projectId,
        tenantId,
        userId: input.userId,
        projectKey: `skill-${projectId}`,
        title: normalized.title,
        status: "draft",
        activeRunId: runId,
      });
      await tx.insert(storyboardSkillRuns).values({
        id: runId,
        projectId,
        tenantId,
        userId: input.userId,
        idempotencyKey: input.idempotencyKey,
        confirmationFingerprint: enrichedFingerprint,
        status: "awaiting_confirmation",
        candidateHistory: [
          { version: 1, idea: normalized.idea, source: "original" },
        ],
        normalizedSnapshot: enriched as unknown as Record<string, unknown>,
        skillSnapshot: skill as unknown as Record<string, unknown>,
        modelSnapshot: {
          image: normalized.imageModelSelection,
          video: normalized.videoModelSelection,
        },
      });
      const planned = planStoryboardShots(enriched);
      await tx.insert(storyboardSkillShots).values(
        planned.map(shot => ({
          runId,
          tenantId,
          shotNumber: shot.shotNumber,
          beat: shot.beat,
          context: shot.context,
          skillInput: {
            ...enriched.skillInputs,
            idea: enriched.idea,
            aspect_ratio: enriched.outputAspectRatio,
          },
        }))
      );
      for (const characterId of normalized.characterIds) {
        const [character] = await tx
          .select({
            id: characterLibraryCharacters.id,
            name: characterLibraryCharacters.name,
            currentRevision: characterLibraryCharacters.currentRevision,
          })
          .from(characterLibraryCharacters)
          .where(
            and(
              eq(characterLibraryCharacters.id, characterId),
              eq(characterLibraryCharacters.tenantId, tenantId),
              eq(characterLibraryCharacters.userId, input.userId),
              eq(characterLibraryCharacters.status, "active")
            )
          )
          .for("update")
          .limit(1);
        if (!character) throw new Error("Character not found");
        const selectedLookId = normalized.characterLookIds[character.id];
        let selectedLook: {
          id: string;
          name: string;
          mediaAssetId: number;
        } | null = null;
        if (selectedLookId) {
          const [look] = await tx
            .select({
              id: characterLibraryLooks.id,
              name: characterLibraryLooks.name,
              lookJson: characterLibraryLooks.lookJson,
            })
            .from(characterLibraryLooks)
            .where(
              and(
                eq(characterLibraryLooks.id, selectedLookId),
                eq(characterLibraryLooks.characterId, character.id),
                eq(characterLibraryLooks.tenantId, tenantId),
                eq(characterLibraryLooks.status, "active")
              )
            )
            .limit(1);
          const mediaAssetId = Number(look?.lookJson?.mediaAssetId);
          if (!look || !Number.isSafeInteger(mediaAssetId) || mediaAssetId <= 0)
            throw new Error("Character look image is not available");
          const [lookAsset] = await tx
            .select({ id: characterLibraryAssets.id })
            .from(characterLibraryAssets)
            .innerJoin(
              mediaAssets,
              and(
                eq(mediaAssets.id, characterLibraryAssets.mediaAssetId),
                eq(mediaAssets.tenantId, tenantId),
                eq(mediaAssets.userId, input.userId),
                ne(mediaAssets.status, "expired")
              )
            )
            .where(
              and(
                eq(characterLibraryAssets.characterId, character.id),
                eq(characterLibraryAssets.tenantId, tenantId),
                eq(characterLibraryAssets.mediaAssetId, mediaAssetId),
                eq(characterLibraryAssets.role, "look")
              )
            )
            .limit(1);
          if (!lookAsset)
            throw new Error("Character look image is not available");
          selectedLook = { id: look.id, name: look.name, mediaAssetId };
        }
        const [revision] = await tx
          .select({
            profileJson: characterLibraryRevisions.profileJson,
            skillSnapshot: characterLibraryRevisions.skillSnapshot,
          })
          .from(characterLibraryRevisions)
          .where(
            and(
              eq(characterLibraryRevisions.characterId, character.id),
              eq(characterLibraryRevisions.revision, character.currentRevision),
              eq(characterLibraryRevisions.tenantId, tenantId)
            )
          )
          .limit(1);
        await tx.insert(storyboardSkillProjectCharacters).values({
          projectId,
          characterId: character.id,
          tenantId,
          revision: character.currentRevision,
          nameSnapshot: character.name,
          snapshotJson: {
            name: character.name,
            revision: character.currentRevision,
            profile: revision?.profileJson ?? {},
            skill: revision?.skillSnapshot ?? {},
            ...(selectedLook ? { look: selectedLook } : {}),
          },
          lookId: selectedLook?.id ?? null,
        });
      }
      return {
        projectId,
        runId,
        status: "awaiting_confirmation" as const,
        normalizedSnapshot: enriched,
        confirmationFingerprint: enrichedFingerprint,
      };
    });
  } catch (error) {
    // Two browser tabs may pass the pre-insert lookup concurrently. The
    // database uniqueness constraint is the final arbiter; recover its loser
    // path as an idempotent read instead of surfacing a generic 500.
    if (!isUniqueViolation(error)) throw error;
    const enriched = await enrichStoryboardCharacterReferences(
      db,
      normalized,
      tenantId,
      input.userId
    );
    const requestedFingerprint = buildStoryboardConfirmationFingerprint(
      enriched,
      skill
    );
    const [existing] = await db
      .select({ project: storyboardSkillProjects, run: storyboardSkillRuns })
      .from(storyboardSkillRuns)
      .innerJoin(
        storyboardSkillProjects,
        eq(storyboardSkillProjects.id, storyboardSkillRuns.projectId)
      )
      .where(
        and(
          eq(storyboardSkillRuns.tenantId, tenantId),
          eq(storyboardSkillRuns.userId, input.userId),
          eq(storyboardSkillRuns.idempotencyKey, input.idempotencyKey)
        )
      )
      .limit(1);
    if (!existing) throw error;
    assertStoryboardIdempotencyMatch(
      existing.run.confirmationFingerprint,
      requestedFingerprint
    );
    return {
      projectId: existing.project.id,
      runId: existing.run.id,
      status: existing.run.status,
      normalizedSnapshot: existing.run.normalizedSnapshot,
      confirmationFingerprint: existing.run.confirmationFingerprint,
    };
  }
}

export async function createStoryboardSkillRunFromProject(input: {
  userId: number;
  tenantId: string | null | undefined;
  projectId: string;
  idempotencyKey: string;
  draft?: unknown;
}) {
  const tenantId = requireTenant(input.tenantId);
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  try {
    return await db.transaction(async tx => {
      const [project] = await tx
        .select()
        .from(storyboardSkillProjects)
        .where(
          and(
            eq(storyboardSkillProjects.id, input.projectId),
            eq(storyboardSkillProjects.tenantId, tenantId),
            eq(storyboardSkillProjects.userId, input.userId)
          )
        )
        .for("update")
        .limit(1);
      if (!project) throw new Error("Storyboard project not found");
      if (project.status === "archived") {
        throw new Error("Archived storyboard projects cannot create a new run");
      }

      const [existing] = await tx
        .select()
        .from(storyboardSkillRuns)
        .where(
          and(
            eq(storyboardSkillRuns.tenantId, tenantId),
            eq(storyboardSkillRuns.userId, input.userId),
            eq(storyboardSkillRuns.idempotencyKey, input.idempotencyKey)
          )
        )
        .limit(1);
      if (existing) {
        if (existing.projectId !== project.id) {
          throw new Error("IDEMPOTENCY_CONFLICT");
        }
        if (input.draft !== undefined) {
          const requested = normalizeStoryboardGlobalInput(input.draft);
          const requestedSkill = getStoryboardSkillSchema(
            requested.selectedSkillId
          );
          if (requestedSkill.version !== requested.selectedSkillVersion) {
            throw new Error("Selected skill version is unavailable");
          }
          assertStoryboardSkillInputs(requestedSkill, requested.skillInputs);
          const requestedEnriched = await enrichStoryboardCharacterReferences(
            tx,
            requested,
            tenantId,
            input.userId
          );
          assertStoryboardIdempotencyMatch(
            existing.confirmationFingerprint,
            buildStoryboardConfirmationFingerprint(
              requestedEnriched,
              requestedSkill
            )
          );
        }
        return {
          projectId: existing.projectId,
          runId: existing.id,
          status: existing.status,
          normalizedSnapshot: existing.normalizedSnapshot,
          confirmationFingerprint: existing.confirmationFingerprint,
          idempotent: true,
        };
      }

      const [previousRun] = await tx
        .select()
        .from(storyboardSkillRuns)
        .where(
          and(
            eq(storyboardSkillRuns.id, project.activeRunId ?? ""),
            eq(storyboardSkillRuns.projectId, project.id),
            eq(storyboardSkillRuns.tenantId, tenantId),
            eq(storyboardSkillRuns.userId, input.userId)
          )
        )
        .limit(1);
      if (previousRun && !isTerminalStoryboardRunStatus(previousRun.status))
        throw new Error(
          "The active storyboard run must finish before creating a new run"
        );

      const sourceSnapshot = input.draft ?? previousRun?.normalizedSnapshot;
      if (!sourceSnapshot) throw new Error("A project snapshot is required");
      const normalized = normalizeStoryboardGlobalInput(sourceSnapshot);
      const skill = getStoryboardSkillSchema(normalized.selectedSkillId);
      if (skill.version !== normalized.selectedSkillVersion)
        throw new Error("Selected skill version is unavailable");
      await assertStoryboardModelSelections(tx, normalized);
      const enriched = await enrichStoryboardCharacterReferences(
        tx,
        normalized,
        tenantId,
        input.userId
      );
      assertStoryboardSkillInputs(skill, enriched.skillInputs);

      const runId = crypto.randomUUID();
      const fingerprint = buildStoryboardConfirmationFingerprint(
        enriched,
        skill
      );
      await tx.insert(storyboardSkillRuns).values({
        id: runId,
        projectId: project.id,
        tenantId,
        userId: input.userId,
        idempotencyKey: input.idempotencyKey,
        confirmationFingerprint: fingerprint,
        status: "awaiting_confirmation",
        candidateHistory: [
          { version: 1, idea: normalized.idea, source: "original" },
        ],
        normalizedSnapshot: enriched as unknown as Record<string, unknown>,
        skillSnapshot: skill as unknown as Record<string, unknown>,
        modelSnapshot: {
          image: normalized.imageModelSelection,
          video: normalized.videoModelSelection,
        },
      });
      const planned = planStoryboardShots(enriched);
      await tx.insert(storyboardSkillShots).values(
        planned.map(shot => ({
          runId,
          tenantId,
          shotNumber: shot.shotNumber,
          beat: shot.beat,
          context: shot.context,
          skillInput: {
            ...enriched.skillInputs,
            idea: enriched.idea,
            aspect_ratio: enriched.outputAspectRatio,
          },
        }))
      );
      await tx
        .update(storyboardSkillProjects)
        .set({ activeRunId: runId, status: "draft", updatedAt: new Date() })
        .where(
          and(
            eq(storyboardSkillProjects.id, project.id),
            eq(storyboardSkillProjects.tenantId, tenantId),
            eq(storyboardSkillProjects.userId, input.userId)
          )
        );
      return {
        projectId: project.id,
        runId,
        status: "awaiting_confirmation" as const,
        normalizedSnapshot: enriched,
        confirmationFingerprint: fingerprint,
      };
    });
  } catch (error) {
    // Two browser tabs can pass the preflight lookup before the unique
    // idempotency constraint serializes their inserts. Resolve the loser to
    // the already-created canonical run instead of leaking a raw 23505.
    if (!isUniqueViolation(error)) throw error;
    const [existing] = await db
      .select()
      .from(storyboardSkillRuns)
      .where(
        and(
          eq(storyboardSkillRuns.tenantId, tenantId),
          eq(storyboardSkillRuns.userId, input.userId),
          eq(storyboardSkillRuns.idempotencyKey, input.idempotencyKey)
        )
      )
      .limit(1);
    if (!existing) throw error;
    if (existing.projectId !== input.projectId) {
      throw new Error("IDEMPOTENCY_CONFLICT");
    }
    if (input.draft !== undefined) {
      const requested = normalizeStoryboardGlobalInput(input.draft);
      const requestedSkill = getStoryboardSkillSchema(
        requested.selectedSkillId
      );
      if (requestedSkill.version !== requested.selectedSkillVersion) {
        throw new Error("Selected skill version is unavailable");
      }
      assertStoryboardSkillInputs(requestedSkill, requested.skillInputs);
      const requestedEnriched = await db.transaction(tx =>
        enrichStoryboardCharacterReferences(
          tx,
          requested,
          tenantId,
          input.userId
        )
      );
      assertStoryboardIdempotencyMatch(
        existing.confirmationFingerprint,
        buildStoryboardConfirmationFingerprint(
          requestedEnriched,
          requestedSkill
        )
      );
    }
    return {
      projectId: existing.projectId,
      runId: existing.id,
      status: existing.status,
      normalizedSnapshot: existing.normalizedSnapshot,
      confirmationFingerprint: existing.confirmationFingerprint,
      idempotent: true,
    };
  }
}

export async function getStoryboardSkillRun(input: {
  userId: number;
  tenantId: string | null | undefined;
  runId: string;
}) {
  const tenantId = requireTenant(input.tenantId);
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [run] = await db
    .select()
    .from(storyboardSkillRuns)
    .where(
      and(
        eq(storyboardSkillRuns.id, input.runId),
        eq(storyboardSkillRuns.tenantId, tenantId),
        eq(storyboardSkillRuns.userId, input.userId)
      )
    )
    .limit(1);
  if (!run) return null;
  const [project] = await db
    .select({ reviewId: storyboardSkillProjects.reviewId })
    .from(storyboardSkillProjects)
    .where(
      and(
        eq(storyboardSkillProjects.id, run.projectId),
        eq(storyboardSkillProjects.tenantId, tenantId),
        eq(storyboardSkillProjects.userId, input.userId)
      )
    )
    .limit(1);
  const shots = await db
    .select()
    .from(storyboardSkillShots)
    .where(
      and(
        eq(storyboardSkillShots.runId, run.id),
        eq(storyboardSkillShots.tenantId, tenantId)
      )
    )
    .orderBy(storyboardSkillShots.shotNumber);
  const assetIds = shots
    .map(shot => shot.imageAssetId)
    .filter((id): id is number => Number.isSafeInteger(id));
  const assets =
    assetIds.length > 0
      ? await db
          .select({ id: mediaAssets.id, storageKey: mediaAssets.storageKey })
          .from(mediaAssets)
          .where(
            and(
              eq(mediaAssets.tenantId, tenantId),
              eq(mediaAssets.userId, input.userId),
              inArray(mediaAssets.id, assetIds)
            )
          )
      : [];
  const assetUrlById = new Map(
    assets.map(asset => [asset.id, storyboardManagedAssetUrl(asset.storageKey)])
  );
  const controlPlaneJob = run.workerJobId
    ? ((
        await db
          .select({
            status: workerJobs.status,
            attempt: workerJobs.attempt,
            maxAttempts: workerJobs.maxAttempts,
            nextRetryAt: workerJobs.nextRetryAt,
            statusReason: workerJobs.statusReason,
            operatorReviewRequired: workerJobs.operatorReviewRequired,
            operatorReviewReason: workerJobs.operatorReviewReason,
            errorCode: workerJobs.errorCode,
            errorMessage: workerJobs.errorMessage,
            progressJson: workerJobs.progressJson,
            heartbeatAt: workerJobs.heartbeatAt,
            leaseExpiresAt: workerJobs.leaseExpiresAt,
          })
          .from(workerJobs)
          .where(
            and(
              eq(workerJobs.id, run.workerJobId),
              eq(workerJobs.tenantId, tenantId),
              eq(workerJobs.requestedByUserId, input.userId)
            )
          )
          .limit(1)
      )[0] ?? null)
    : null;
  const controlPlaneEvents = run.workerJobId
    ? (
        await db
          .select({
            eventType: workerJobEvents.eventType,
            eventSequence: workerJobEvents.eventSequence,
            attemptId: workerJobEvents.attemptId,
            payloadJson: workerJobEvents.payloadJson,
            createdAt: workerJobEvents.createdAt,
          })
          .from(workerJobEvents)
          .where(eq(workerJobEvents.workerJobId, run.workerJobId))
          .orderBy(
            desc(workerJobEvents.eventSequence),
            desc(workerJobEvents.createdAt)
          )
          .limit(50)
      )
        .reverse()
        .map(event => ({
          ...event,
          payloadJson: redactStoryboardValue(event.payloadJson) as Record<
            string,
            unknown
          >,
        }))
    : [];
  const redactRecord = (value: unknown): Record<string, unknown> => {
    const redacted = redactStoryboardValue(value);
    return redacted && typeof redacted === "object" && !Array.isArray(redacted)
      ? (redacted as Record<string, unknown>)
      : {};
  };
  return {
    ...run,
    reviewId: project?.reviewId ?? null,
    candidateHistory: redactStoryboardValue(
      run.candidateHistory
    ) as typeof run.candidateHistory,
    normalizedSnapshot: redactRecord(run.normalizedSnapshot),
    skillSnapshot: redactRecord(run.skillSnapshot),
    modelSnapshot: redactRecord(run.modelSnapshot),
    error: run.error ? redactRecord(run.error) : null,
    controlPlaneJob,
    controlPlaneEvents,
    shots: shots.map(shot => ({
      ...shot,
      skillInput: redactRecord(shot.skillInput),
      skillResponse: shot.skillResponse
        ? redactRecord(shot.skillResponse)
        : null,
      generationRequest: shot.generationRequest
        ? redactRecord(shot.generationRequest)
        : null,
      effectiveGenerationRequest: shot.effectiveGenerationRequest
        ? redactRecord(shot.effectiveGenerationRequest)
        : null,
      error: shot.error ? redactRecord(shot.error) : null,
      imageUrl: shot.imageAssetId
        ? (assetUrlById.get(shot.imageAssetId) ?? null)
        : null,
    })),
  };
}

/**
 * Refresh-safe recovery index. The database is authoritative; the client only
 * stores a run locator so a browser refresh cannot discard an active job.
 */
export async function listStoryboardSkillRuns(input: {
  userId: number;
  tenantId: string | null | undefined;
  limit?: number;
}) {
  const tenantId = requireTenant(input.tenantId);
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
  const rows = await db
    .select({
      run: storyboardSkillRuns,
      projectTitle: storyboardSkillProjects.title,
    })
    .from(storyboardSkillRuns)
    .innerJoin(
      storyboardSkillProjects,
      eq(storyboardSkillProjects.id, storyboardSkillRuns.projectId)
    )
    .where(
      and(
        eq(storyboardSkillRuns.tenantId, tenantId),
        eq(storyboardSkillRuns.userId, input.userId),
        // This is the recovery index, not an all-history query. Cancelled runs
        // are terminal and must not keep appearing as unfinished work after the
        // user has explicitly stopped them. Failed/partial runs remain visible
        // because they may still have an explicit, evidence-gated repair path.
        and(
          ...STORYBOARD_RECOVERY_INDEX_EXCLUDED_STATUSES.map(status =>
            ne(storyboardSkillRuns.status, status)
          )
        )
      )
    )
    .orderBy(desc(storyboardSkillRuns.updatedAt))
    .limit(limit);
  if (rows.length === 0) return [];

  const runIds = rows.map(row => row.run.id);
  const shots =
    runIds.length > 0
      ? await db
          .select({
            runId: storyboardSkillShots.runId,
            status: storyboardSkillShots.status,
            imageAssetId: storyboardSkillShots.imageAssetId,
          })
          .from(storyboardSkillShots)
          .where(
            and(
              inArray(storyboardSkillShots.runId, runIds),
              eq(storyboardSkillShots.tenantId, tenantId)
            )
          )
      : [];
  const workerJobIds = rows
    .map(row => row.run.workerJobId)
    .filter((id): id is string => Boolean(id));
  const jobs =
    workerJobIds.length > 0
      ? await db
          .select({
            id: workerJobs.id,
            status: workerJobs.status,
            operatorReviewRequired: workerJobs.operatorReviewRequired,
          })
          .from(workerJobs)
          .where(
            and(
              inArray(workerJobs.id, workerJobIds),
              eq(workerJobs.tenantId, tenantId),
              eq(workerJobs.requestedByUserId, input.userId)
            )
          )
      : [];
  const jobById = new Map(jobs.map(job => [job.id, job]));
  const summary = new Map<
    string,
    { total: number; completed: number; remaining: number }
  >();
  for (const shot of shots) {
    const current = summary.get(shot.runId) ?? {
      total: 0,
      completed: 0,
      remaining: 0,
    };
    current.total += 1;
    if (isReusableStoryboardImage(shot)) current.completed += 1;
    else current.remaining += 1;
    summary.set(shot.runId, current);
  }
  // A cancelled control-plane job is terminal even if an older domain row was
  // left queued/running by a pre-fix cancellation path. Do not resurrect it
  // in the recovery panel; the canonical job state wins this read projection.
  const recoverableRows = rows.filter(row => {
    const jobStatus = row.run.workerJobId
      ? jobById.get(row.run.workerJobId)?.status
      : null;
    return isStoryboardRunRecoverable({
      runStatus: row.run.status,
      controlPlaneStatus: jobStatus,
    });
  });
  return recoverableRows.map(row => ({
    runId: row.run.id,
    projectId: row.run.projectId,
    projectTitle: row.projectTitle,
    status: row.run.status,
    workerJobId: row.run.workerJobId,
    job: row.run.workerJobId
      ? (jobById.get(row.run.workerJobId) ?? null)
      : null,
    confirmationFingerprint: row.run.confirmationFingerprint,
    error: row.run.error ? redactStoryboardValue(row.run.error) : null,
    createdAt: row.run.createdAt,
    updatedAt: row.run.updatedAt,
    shots: summary.get(row.run.id) ?? { total: 0, completed: 0, remaining: 0 },
  }));
}

export async function confirmStoryboardSkillRun(input: {
  userId: number;
  tenantId: string | null | undefined;
  runId: string;
  confirmationFingerprint: string;
}) {
  const tenantId = requireTenant(input.tenantId);
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [run] = await db
    .select()
    .from(storyboardSkillRuns)
    .where(
      and(
        eq(storyboardSkillRuns.id, input.runId),
        eq(storyboardSkillRuns.tenantId, tenantId),
        eq(storyboardSkillRuns.userId, input.userId)
      )
    )
    .limit(1);
  if (!run) throw new Error("Storyboard run not found");
  if (run.confirmationFingerprint !== input.confirmationFingerprint)
    throw new Error(
      "Storyboard draft changed; refresh the estimate before confirming"
    );
  if (
    run.status === "queued" ||
    run.status === "running" ||
    run.status === "succeeded"
  ) {
    const workerJobId =
      run.status === "queued"
        ? await ensureStoryboardControlPlaneJob({
            runId: run.id,
            tenantId,
            userId: input.userId,
            workerJobId: run.workerJobId,
          })
        : run.workerJobId;
    return { runId: run.id, status: run.status, workerJobId, idempotent: true };
  }
  if (run.status !== "awaiting_confirmation")
    throw new Error("Storyboard run cannot be confirmed in its current state");

  // Prompt planning is deterministic and provider-free. Materialize every
  // canonical skill response before the paid image queue is allowed to pick
  // up the run, so a worker restart cannot lose prompt-stage progress.
  const normalized = normalizeStoryboardGlobalInput(run.normalizedSnapshot);
  await assertStoryboardModelSelections(db, normalized);
  const bindings = await db
    .select({ snapshotJson: storyboardSkillProjectCharacters.snapshotJson })
    .from(storyboardSkillProjectCharacters)
    .where(
      and(
        eq(storyboardSkillProjectCharacters.projectId, run.projectId),
        eq(storyboardSkillProjectCharacters.tenantId, tenantId)
      )
    );
  const characterContext = bindings
    .map(binding => JSON.stringify(binding.snapshotJson))
    .join("\n")
    .slice(0, 6000);
  const effectiveNormalized = characterContext
    ? normalizeStoryboardGlobalInput({
        ...normalized,
        skillInputs: {
          ...normalized.skillInputs,
          custom_notes:
            `${String(normalized.skillInputs.custom_notes ?? "")} Bound character snapshots: ${characterContext}`.trim(),
        },
      })
    : normalized;
  const promptResults = await runStoryboardPromptPipeline(effectiveNormalized);
  const confirmed = await db.transaction(async tx => {
    const [project] = await tx
      .select({ id: storyboardSkillProjects.id })
      .from(storyboardSkillProjects)
      .where(
        and(
          eq(storyboardSkillProjects.id, run.projectId),
          eq(storyboardSkillProjects.tenantId, tenantId),
          eq(storyboardSkillProjects.userId, input.userId)
        )
      )
      .for("update")
      .limit(1);
    if (!project) throw new Error("Storyboard project not found");
    const [updatedRun] = await tx
      .update(storyboardSkillRuns)
      .set({
        status: "queued",
        normalizedSnapshot: effectiveNormalized as unknown as Record<
          string,
          unknown
        >,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(storyboardSkillRuns.id, run.id),
          eq(storyboardSkillRuns.tenantId, tenantId),
          eq(storyboardSkillRuns.userId, input.userId),
          eq(storyboardSkillRuns.status, "awaiting_confirmation"),
          eq(
            storyboardSkillRuns.confirmationFingerprint,
            input.confirmationFingerprint
          )
        )
      )
      .returning({ id: storyboardSkillRuns.id });
    if (!updatedRun) return false;
    for (const item of promptResults) {
      await tx
        .update(storyboardSkillShots)
        .set({
          status: "prompt_ready",
          skillResponse: redactStoryboardValue(item.response) as Record<
            string,
            unknown
          >,
          generationPrompt: item.response.result.generation_prompt,
          generationRequest: item.response.result
            .generation_request as unknown as Record<string, unknown>,
          videoModelId: effectiveNormalized.videoModelSelection.modelId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(storyboardSkillShots.runId, run.id),
            eq(storyboardSkillShots.tenantId, tenantId),
            eq(storyboardSkillShots.shotNumber, item.shot.shotNumber)
          )
        );
    }
    await tx
      .update(storyboardSkillProjects)
      .set({ status: "queued", updatedAt: new Date() })
      .where(
        and(
          eq(storyboardSkillProjects.id, run.projectId),
          eq(storyboardSkillProjects.tenantId, tenantId),
          eq(storyboardSkillProjects.userId, input.userId)
        )
      );
    return true;
  });
  if (!confirmed) {
    const [current] = await db
      .select({
        status: storyboardSkillRuns.status,
        workerJobId: storyboardSkillRuns.workerJobId,
      })
      .from(storyboardSkillRuns)
      .where(
        and(
          eq(storyboardSkillRuns.id, run.id),
          eq(storyboardSkillRuns.tenantId, tenantId),
          eq(storyboardSkillRuns.userId, input.userId)
        )
      )
      .limit(1);
    if (current?.status === "awaiting_confirmation") {
      throw new Error(
        "Storyboard draft changed; refresh the estimate before confirming"
      );
    }
    if (
      current &&
      ["queued", "running", "succeeded"].includes(current.status)
    ) {
      const workerJobId =
        current.status === "queued"
          ? await ensureStoryboardControlPlaneJob({
              runId: run.id,
              tenantId,
              userId: input.userId,
              workerJobId: current.workerJobId,
            })
          : current.workerJobId;
      return {
        runId: run.id,
        status: current.status,
        workerJobId,
        idempotent: true,
      };
    }
    throw new Error("Storyboard run changed while confirming");
  }
  const workerJobId = await ensureStoryboardControlPlaneJob({
    runId: run.id,
    tenantId,
    userId: input.userId,
    workerJobId: run.workerJobId,
  });
  return {
    runId: run.id,
    status: "queued" as const,
    workerJobId,
    idempotent: false,
  };
}

/** Pause is resumable: it never terminalizes the canonical job or deletes work. */
export async function pauseStoryboardSkillRun(input: {
  userId: number;
  tenantId: string | null | undefined;
  runId: string;
}) {
  const tenantId = requireTenant(input.tenantId);
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.transaction(async tx => {
    const [existing] = await tx
      .select()
      .from(storyboardSkillRuns)
      .where(
        and(
          eq(storyboardSkillRuns.id, input.runId),
          eq(storyboardSkillRuns.tenantId, tenantId),
          eq(storyboardSkillRuns.userId, input.userId)
        )
      )
      .limit(1);
    if (!existing) throw new Error("Storyboard run not found");
    if (isTerminalStoryboardRunStatus(existing.status))
      return { run: existing, idempotent: true };
    if (existing.status === "cancel_requested") {
      throw new Error("Cancelled storyboard runs cannot be paused");
    }
    if (existing.status === "paused")
      return { run: existing, idempotent: true };
    const [project] = await tx
      .select({ id: storyboardSkillProjects.id })
      .from(storyboardSkillProjects)
      .where(
        and(
          eq(storyboardSkillProjects.id, existing.projectId),
          eq(storyboardSkillProjects.tenantId, tenantId),
          eq(storyboardSkillProjects.userId, input.userId)
        )
      )
      .for("update")
      .limit(1);
    if (!project) throw new Error("Storyboard project not found");
    const [run] = await tx
      .update(storyboardSkillRuns)
      .set({
        status: "paused",
        error: {
          code: "PAUSED_BY_USER",
          message: "Generation paused by the user.",
        },
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(storyboardSkillRuns.id, existing.id),
          eq(storyboardSkillRuns.tenantId, tenantId),
          eq(storyboardSkillRuns.userId, input.userId),
          inArray(storyboardSkillRuns.status, [
            "awaiting_confirmation",
            "queued",
            "running",
            "partial",
          ])
        )
      )
      .returning();
    if (!run) throw new Error("Storyboard run changed while pausing");
    await tx
      .update(storyboardSkillProjects)
      .set({ status: "paused", updatedAt: new Date() })
      .where(
        and(
          eq(storyboardSkillProjects.id, run.projectId),
          eq(storyboardSkillProjects.tenantId, tenantId),
          eq(storyboardSkillProjects.userId, input.userId)
        )
      );
    return { run, idempotent: false };
  });
  const { run, idempotent } = result;
  // The domain row may have committed before the control-plane hold (or
  // before its outbox cancellation) succeeded. Repeat the idempotent hold so
  // a retried pause repairs that cross-ledger boundary.
  if (run.workerJobId && (run.status === "paused" || run.status === "queued")) {
    await createJobControlPlane().holdQueued(
      run.workerJobId,
      `storyboard.pause:${run.id}`,
      "storyboard_paused_by_user"
    );
  }
  return { ...run, idempotent };
}

/** Resume keeps valid completed shots and queues the missing shots independently. */
export async function resumeStoryboardSkillRun(input: {
  userId: number;
  tenantId: string | null | undefined;
  runId: string;
}) {
  const tenantId = requireTenant(input.tenantId);
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [run] = await db
    .select()
    .from(storyboardSkillRuns)
    .where(
      and(
        eq(storyboardSkillRuns.id, input.runId),
        eq(storyboardSkillRuns.tenantId, tenantId),
        eq(storyboardSkillRuns.userId, input.userId)
      )
    )
    .limit(1);
  if (!run) throw new Error("Storyboard run not found");
  if (isTerminalStoryboardRunStatus(run.status))
    throw new Error("Completed storyboard runs cannot be resumed");
  if (run.status === "cancel_requested") {
    throw new Error("Cancelled storyboard runs cannot be resumed");
  }
  if (run.status !== "paused" && run.status !== "partial") {
    return {
      runId: run.id,
      status: run.status,
      workerJobId: run.workerJobId,
      idempotent: true,
    };
  }
  const controlPlane = run.workerJobId ? createJobControlPlane() : null;
  const controlStatus = run.workerJobId
    ? await controlPlane!.getStatus(run.workerJobId, {
        tenantId,
        requestedByUserId: input.userId,
        authorizationScope: "storyboard",
      })
    : null;
  const coordinatorIsTerminal = Boolean(
    controlStatus &&
    ["succeeded", "cancelled", "expired"].includes(controlStatus.status)
  );
  if (controlStatus?.status === "failed") {
    throw new Error(
      controlStatus.operatorReviewRequired
        ? "Provider or control-plane evidence requires operator repair before resume"
        : "Storyboard control-plane retry must be scheduled before resume"
    );
  }
  const transition = await db.transaction(async tx => {
    const [current] = await tx
      .select()
      .from(storyboardSkillRuns)
      .where(
        and(
          eq(storyboardSkillRuns.id, input.runId),
          eq(storyboardSkillRuns.tenantId, tenantId),
          eq(storyboardSkillRuns.userId, input.userId)
        )
      )
      .limit(1);
    if (!current) throw new Error("Storyboard run not found");
    if (isTerminalStoryboardRunStatus(current.status)) {
      throw new Error("Completed storyboard runs cannot be resumed");
    }
    if (current.status === "cancel_requested") {
      throw new Error("Cancelled storyboard runs cannot be resumed");
    }
    if (current.status !== "paused" && current.status !== "partial") {
      return { run: current, changed: false };
    }
    const [project] = await tx
      .select({ id: storyboardSkillProjects.id })
      .from(storyboardSkillProjects)
      .where(
        and(
          eq(storyboardSkillProjects.id, current.projectId),
          eq(storyboardSkillProjects.tenantId, tenantId),
          eq(storyboardSkillProjects.userId, input.userId)
        )
      )
      .for("update")
      .limit(1);
    if (!project) throw new Error("Storyboard project not found");
    const shots = await tx
      .select()
      .from(storyboardSkillShots)
      .where(
        and(
          eq(storyboardSkillShots.runId, current.id),
          eq(storyboardSkillShots.tenantId, tenantId)
        )
      );
    if (
      current.error?.class === "unknown" ||
      shots.some(shot => shot.error?.class === "unknown")
    ) {
      throw new Error("Provider result requires operator review before resume");
    }
    for (const shot of shots) {
      if (shot.status === "paused" || shot.status === "suppressed") {
        await tx
          .update(storyboardSkillShots)
          .set({
            status: shot.generationPrompt ? "prompt_ready" : "pending",
            suppressedResult: false,
            error: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(storyboardSkillShots.id, shot.id),
              eq(storyboardSkillShots.runId, current.id),
              eq(storyboardSkillShots.tenantId, tenantId)
            )
          );
      }
    }
    const [updated] = await tx
      .update(storyboardSkillRuns)
      .set({ status: "queued", error: null, updatedAt: new Date() })
      .where(
        and(
          eq(storyboardSkillRuns.id, current.id),
          eq(storyboardSkillRuns.tenantId, tenantId),
          eq(storyboardSkillRuns.userId, input.userId),
          inArray(storyboardSkillRuns.status, ["paused", "partial"])
        )
      )
      .returning();
    if (!updated) return { run: current, changed: false };
    await tx
      .update(storyboardSkillProjects)
      .set({ status: "queued", updatedAt: new Date() })
      .where(
        and(
          eq(storyboardSkillProjects.id, current.projectId),
          eq(storyboardSkillProjects.tenantId, tenantId),
          eq(storyboardSkillProjects.userId, input.userId)
        )
      );
    return { run: updated, changed: true };
  });
  if (!transition.changed) {
    return {
      runId: transition.run.id,
      status: transition.run.status,
      workerJobId: transition.run.workerJobId,
      idempotent: true,
    };
  }
  const workerJobId = await ensureStoryboardControlPlaneJob({
    runId: transition.run.id,
    tenantId,
    userId: input.userId,
    workerJobId: transition.run.workerJobId,
  });
  if (transition.run.workerJobId && controlPlane) {
    if (controlStatus?.status === "waiting_external") {
      await controlPlane.resumeExternal(
        transition.run.workerJobId,
        "storyboard-resume",
        "postgres-pull",
        undefined,
        `resume:${transition.run.id}`,
        true
      );
    }
  }
  if (transition.run.workerJobId && coordinatorIsTerminal) {
    const staleChildJobs = await db
      .select({ id: workerJobs.id })
      .from(workerJobs)
      .where(
        and(
          eq(workerJobs.tenantId, tenantId),
          eq(workerJobs.requestedByUserId, input.userId),
          eq(workerJobs.jobType, "storyboard.skill.run"),
          sql`${workerJobs.inputJson}->>'runId' = ${run.id}`,
          sql`${workerJobs.inputJson}->>'shotNumber' IS NOT NULL`,
          inArray(workerJobs.status, [
            "queued",
            "leased",
            "running",
            "waiting_external",
            "retry_scheduled",
          ] as any)
        )
      );
    if (staleChildJobs.length > 0) {
      const repairControlPlane = createJobControlPlane();
      await Promise.all(
        staleChildJobs.map(job =>
          repairControlPlane.cancel(
            job.id,
            "storyboard_resume_replaced_child",
            `storyboard-resume:${run.id}:child:${job.id}`,
            input.userId,
            {
              tenantId,
              requestedByUserId: input.userId,
              authorizationScope: "storyboard",
            }
          )
        )
      );
    }
    const anchor = run.shots.find(shot => shot.shotNumber === 1);
    const queueableShots = run.shots.filter(
      shot =>
        !isReusableStoryboardImage(shot) &&
        (shot.status === "pending" ||
          shot.status === "prompt_ready" ||
          shot.status === "paused" ||
          shot.status === "suppressed" ||
          isRepairableStoryboardShot(shot.status, shot.error))
    );
    const shotsToQueue =
      anchor && isReusableStoryboardImage(anchor)
        ? queueableShots.filter(shot => shot.shotNumber > 1)
        : queueableShots.filter(shot => shot.shotNumber === 1);
    if (shotsToQueue.length > 0) {
      await enqueueStoryboardRepairJobs({
        runId: run.id,
        tenantId,
        userId: input.userId,
        shotNumbers: shotsToQueue.map(shot => shot.shotNumber),
        attemptByShot: new Map(
          run.shots.map(shot => [shot.shotNumber, shot.attempt + 1])
        ),
      });
    }
  }
  return {
    runId: transition.run.id,
    status: "queued" as const,
    workerJobId,
    idempotent: false,
  };
}

export async function cancelStoryboardSkillRun(input: {
  userId: number;
  tenantId: string | null | undefined;
  runId: string;
}) {
  const tenantId = requireTenant(input.tenantId);
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const requested = await db.transaction(async tx => {
    const [existing] = await tx
      .select({
        id: storyboardSkillRuns.id,
        projectId: storyboardSkillRuns.projectId,
        status: storyboardSkillRuns.status,
        workerJobId: storyboardSkillRuns.workerJobId,
      })
      .from(storyboardSkillRuns)
      .where(
        and(
          eq(storyboardSkillRuns.id, input.runId),
          eq(storyboardSkillRuns.tenantId, tenantId),
          eq(storyboardSkillRuns.userId, input.userId)
        )
      )
      .limit(1);
    if (!existing) throw new Error("Storyboard run not found");
    if (isTerminalStoryboardRunStatus(existing.status))
      return { run: existing, changed: false };
    if (existing.status === "cancel_requested")
      return { run: existing, changed: false };
    const [project] = await tx
      .select({ id: storyboardSkillProjects.id })
      .from(storyboardSkillProjects)
      .where(
        and(
          eq(storyboardSkillProjects.id, existing.projectId),
          eq(storyboardSkillProjects.tenantId, tenantId),
          eq(storyboardSkillProjects.userId, input.userId)
        )
      )
      .for("update")
      .limit(1);
    if (!project) throw new Error("Storyboard project not found");
    const [run] = await tx
      .update(storyboardSkillRuns)
      .set({ status: "cancel_requested", updatedAt: new Date() })
      .where(
        and(
          eq(storyboardSkillRuns.id, existing.id),
          eq(storyboardSkillRuns.tenantId, tenantId),
          eq(storyboardSkillRuns.userId, input.userId),
          inArray(storyboardSkillRuns.status, [
            "awaiting_confirmation",
            "queued",
            "running",
            "paused",
            "partial",
          ])
        )
      )
      .returning({
        id: storyboardSkillRuns.id,
        projectId: storyboardSkillRuns.projectId,
        status: storyboardSkillRuns.status,
        workerJobId: storyboardSkillRuns.workerJobId,
      });
    if (!run) throw new Error("Storyboard run changed while cancelling");
    await tx
      .update(storyboardSkillProjects)
      .set({ status: "cancel_requested", updatedAt: new Date() })
      .where(
        and(
          eq(storyboardSkillProjects.id, run.projectId),
          eq(storyboardSkillProjects.tenantId, tenantId),
          eq(storyboardSkillProjects.userId, input.userId)
        )
      );
    return { run, changed: true };
  });

  if (!requested.changed && requested.run.status !== "cancel_requested") {
    if (requested.run.status === "cancelled") {
      const projection = await rebuildStoryboardSkillReviewProjection({
        userId: input.userId,
        tenantId,
        runId: requested.run.id,
      });
      return {
        ...requested.run,
        idempotent: true,
        reviewId:
          projection.projectionStatus === "ready" ? projection.reviewId : null,
        projectionStatus: projection.projectionStatus,
      };
    }
    return { ...requested.run, idempotent: true };
  }
  const scope = {
    tenantId,
    requestedByUserId: input.userId,
    authorizationScope: "storyboard" as const,
  };
  if (requested.run.workerJobId) {
    const controlPlane = createJobControlPlane();
    await cancelStoryboardWorkerJobIfActive({
      controlPlane,
      jobId: requested.run.workerJobId,
      reason: "storyboard_cancelled",
      actionId: `storyboard-cancel:${requested.run.id}`,
      actorId: input.userId,
      scope,
    });
  }
  const continuationJobs = await db
    .select({ id: workerJobs.id, status: workerJobs.status })
    .from(workerJobs)
    .where(
      and(
        eq(workerJobs.tenantId, tenantId),
        eq(workerJobs.requestedByUserId, input.userId),
        eq(workerJobs.jobType, "storyboard.skill.run"),
        sql`${workerJobs.inputJson}->>'runId' = ${requested.run.id}`,
        inArray(workerJobs.status, [
          "queued",
          "leased",
          "running",
          "waiting_external",
          "retry_scheduled",
        ] as any)
      )
    );
  if (continuationJobs.length > 0) {
    const controlPlane = createJobControlPlane();
    await Promise.all(
      continuationJobs.map(job =>
        cancelStoryboardWorkerJobIfActive({
          controlPlane,
          jobId: job.id,
          reason: "storyboard_cancelled",
          actionId: `storyboard-cancel:${requested.run.id}:shot:${job.id}`,
          actorId: input.userId,
          scope,
        })
      )
    );
  }

  const run = await db.transaction(async tx => {
    const [project] = await tx
      .select({ id: storyboardSkillProjects.id })
      .from(storyboardSkillProjects)
      .where(
        and(
          eq(storyboardSkillProjects.id, requested.run.projectId),
          eq(storyboardSkillProjects.tenantId, tenantId),
          eq(storyboardSkillProjects.userId, input.userId)
        )
      )
      .for("update")
      .limit(1);
    if (!project) throw new Error("Storyboard project not found");
    const [cancelledRun] = await tx
      .update(storyboardSkillRuns)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(
        and(
          eq(storyboardSkillRuns.id, requested.run.id),
          eq(storyboardSkillRuns.tenantId, tenantId),
          eq(storyboardSkillRuns.userId, input.userId),
          eq(storyboardSkillRuns.status, "cancel_requested")
        )
      )
      .returning();
    if (!cancelledRun) return null;
    await tx
      .update(storyboardSkillProjects)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(
        and(
          eq(storyboardSkillProjects.id, cancelledRun.projectId),
          eq(storyboardSkillProjects.tenantId, tenantId),
          eq(storyboardSkillProjects.userId, input.userId)
        )
      );
    return cancelledRun;
  });
  if (!run) {
    const [current] = await db
      .select()
      .from(storyboardSkillRuns)
      .where(
        and(
          eq(storyboardSkillRuns.id, requested.run.id),
          eq(storyboardSkillRuns.tenantId, tenantId),
          eq(storyboardSkillRuns.userId, input.userId)
        )
      )
      .limit(1);
    if (!current) throw new Error("Storyboard run not found");
    return { ...current, idempotent: true };
  }
  let projectionStatus: "ready" | "projection_pending" = "projection_pending";
  let reviewId: number | null = null;
  try {
    const projection = await rebuildStoryboardSkillReviewProjection({
      userId: input.userId,
      tenantId,
      runId: run.id,
    });
    projectionStatus = projection.projectionStatus;
    reviewId =
      projection.projectionStatus === "ready" ? projection.reviewId : null;
  } catch {
    // Cancellation is already durable. The reconciler or a later idempotent
    // cancel request can repair the partial Storyboard review projection.
  }
  return { ...run, idempotent: !requested.changed, reviewId, projectionStatus };
}

export async function retryStoryboardSkillShots(input: {
  userId: number;
  tenantId: string | null | undefined;
  runId: string;
  shotNumbers?: number[];
}) {
  const tenantId = requireTenant(input.tenantId);
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const run = await getStoryboardSkillRun({
    userId: input.userId,
    tenantId,
    runId: input.runId,
  });
  if (!run) throw new Error("Storyboard run not found");
  if (isTerminalStoryboardRunStatus(run.status))
    throw new Error("Only an active or partially failed run can be retried");
  if (run.status === "cancel_requested") {
    throw new Error("Cancelled storyboard runs cannot be retried");
  }
  const allowed = new Set(
    input.shotNumbers ?? run.shots.map(shot => shot.shotNumber)
  );
  const retryableShots = run.shots.filter(
    shot =>
      allowed.has(shot.shotNumber) &&
      isRepairableStoryboardShot(shot.status, shot.error)
  );
  if (retryableShots.length === 0)
    throw new Error("No failed or partial shots are available to retry");
  const retryAnchor = retryableShots.some(shot => shot.shotNumber === 1);
  const scope = {
    tenantId,
    requestedByUserId: input.userId,
    authorizationScope: "storyboard" as const,
  };
  const controlPlane = run.workerJobId ? createJobControlPlane() : null;
  const controlStatus = run.workerJobId
    ? await controlPlane!.getStatus(run.workerJobId, scope)
    : null;
  if (
    controlStatus?.status === "failed" &&
    controlStatus.operatorReviewRequired
  ) {
    const unresolvedProviderOperation = retryableShots.some(shot => {
      const error =
        shot.error &&
        typeof shot.error === "object" &&
        !Array.isArray(shot.error)
          ? (shot.error as Record<string, unknown>)
          : {};
      // Missing evidence is fail-closed for historical rows written before
      // this boundary existed. Only an explicit false proves that no provider
      // request started and that a new attempt cannot duplicate paid work.
      return error.providerSubmissionStarted !== false;
    });
    if (unresolvedProviderOperation) {
      throw new Error(
        "Provider operation requires reconciliation before storyboard repair"
      );
    }
  }
  const actionId = run.workerJobId
    ? storyboardRepairActionId(run.id, controlStatus?.attempt ?? 0, [
        ...allowed,
      ])
    : null;
  let reviewRecoveryAccepted = false;
  // Recover the canonical ledger before changing domain rows. If the control
  // plane rejects the action, the domain checkpoint remains untouched.
  if (
    run.workerJobId &&
    controlPlane &&
    actionId &&
    controlStatus?.status === "failed" &&
    controlStatus.operatorReviewRequired
  ) {
    reviewRecoveryAccepted = await controlPlane.recoverReviewGatedJob(
      run.workerJobId,
      actionId,
      "storyboard_user_repair",
      { disposition: "pre_submission_failure" },
      input.userId,
      scope
    );
    if (!reviewRecoveryAccepted)
      throw new Error(
        "Storyboard control-plane review recovery was not accepted"
      );
  }
  // Clear domain failure markers only after the control-plane/provider guard
  // above has accepted the recovery path. A rejected ambiguous operation must
  // leave both ledgers unchanged and visible for reconciliation.
  const domainRepairAccepted = await db.transaction(async tx => {
    const [currentRun] = await tx
      .select({
        id: storyboardSkillRuns.id,
        projectId: storyboardSkillRuns.projectId,
        status: storyboardSkillRuns.status,
      })
      .from(storyboardSkillRuns)
      .where(
        and(
          eq(storyboardSkillRuns.id, input.runId),
          eq(storyboardSkillRuns.tenantId, tenantId),
          eq(storyboardSkillRuns.userId, input.userId)
        )
      )
      .limit(1);
    if (!currentRun) throw new Error("Storyboard run not found");
    if (currentRun.status !== "paused" && currentRun.status !== "partial") {
      return false;
    }
    const [project] = await tx
      .select({ id: storyboardSkillProjects.id })
      .from(storyboardSkillProjects)
      .where(
        and(
          eq(storyboardSkillProjects.id, currentRun.projectId),
          eq(storyboardSkillProjects.tenantId, tenantId),
          eq(storyboardSkillProjects.userId, input.userId)
        )
      )
      .for("update")
      .limit(1);
    if (!project) throw new Error("Storyboard project not found");
    const currentShots = await tx
      .select({
        id: storyboardSkillShots.id,
        shotNumber: storyboardSkillShots.shotNumber,
        status: storyboardSkillShots.status,
        error: storyboardSkillShots.error,
      })
      .from(storyboardSkillShots)
      .where(
        and(
          eq(storyboardSkillShots.runId, currentRun.id),
          eq(storyboardSkillShots.tenantId, tenantId)
        )
      );
    for (const shot of currentShots) {
      const shouldReset =
        retryAnchor && shot.shotNumber > 1
          ? true
          : allowed.has(shot.shotNumber) &&
            isRepairableStoryboardShot(shot.status, shot.error);
      if (shouldReset) {
        await tx
          .update(storyboardSkillShots)
          .set({ status: "pending", error: null, updatedAt: new Date() })
          .where(
            and(
              eq(storyboardSkillShots.id, shot.id),
              eq(storyboardSkillShots.runId, currentRun.id),
              eq(storyboardSkillShots.tenantId, tenantId)
            )
          );
      }
    }
    await tx
      .update(storyboardSkillRuns)
      .set({ status: "queued", error: null, updatedAt: new Date() })
      .where(
        and(
          eq(storyboardSkillRuns.id, currentRun.id),
          eq(storyboardSkillRuns.tenantId, tenantId),
          eq(storyboardSkillRuns.userId, input.userId),
          inArray(storyboardSkillRuns.status, ["paused", "partial"])
        )
      );
    await tx
      .update(storyboardSkillProjects)
      .set({ status: "queued", updatedAt: new Date() })
      .where(
        and(
          eq(storyboardSkillProjects.id, currentRun.projectId),
          eq(storyboardSkillProjects.tenantId, tenantId),
          eq(storyboardSkillProjects.userId, input.userId)
        )
      );
    return true;
  });
  if (!domainRepairAccepted) {
    return { runId: input.runId, status: "queued" as const, idempotent: true };
  }
  if (run.workerJobId && controlPlane) {
    if (controlStatus?.status === "waiting_external") {
      await controlPlane.resumeExternal(
        run.workerJobId,
        "storyboard-retry",
        "postgres-pull",
        undefined,
        `retry:${run.id}:${[...allowed].sort((a, b) => a - b).join(",")}`,
        true
      );
    } else if (controlStatus?.status === "retry_scheduled") {
      const requeued = await controlPlane.makeRetryDue(
        run.workerJobId,
        actionId ?? undefined,
        input.userId,
        "storyboard_user_repair",
        scope
      );
      if (!requeued)
        throw new Error("Storyboard control-plane retry was not accepted");
    }
    if (reviewRecoveryAccepted) {
      // A worker may claim the new attempt between the control-plane recovery
      // and domain checkpoint update. If it released that attempt while it
      // observed the old failed shot, resume the same attempt; do not consume
      // another business retry just because the UI raced the worker.
      const refreshed = await controlPlane.getStatus(run.workerJobId, scope);
      if (refreshed?.status === "waiting_external") {
        await controlPlane.resumeExternal(
          run.workerJobId,
          "storyboard-retry",
          "postgres-pull",
          undefined,
          `repair:${run.id}:${[...allowed].sort((a, b) => a - b).join(",")}`,
          false
        );
      }
    }
  }
  if (run.workerJobId) {
    const repairShotNumbers = retryAnchor
      ? [1]
      : retryableShots.map(shot => shot.shotNumber);
    await enqueueStoryboardRepairJobs({
      runId: run.id,
      tenantId,
      userId: input.userId,
      shotNumbers: repairShotNumbers,
      attemptByShot: new Map(
        run.shots.map(shot => [shot.shotNumber, shot.attempt + 1])
      ),
    });
  }
  return { runId: input.runId, status: "queued" as const };
}

export async function updateStoryboardSkillDraft(input: {
  userId: number;
  tenantId: string | null | undefined;
  projectId: string;
  draft: unknown;
}) {
  const tenantId = requireTenant(input.tenantId);
  const normalized = normalizeStoryboardGlobalInput(input.draft);
  const skill = getStoryboardSkillSchema(normalized.selectedSkillId);
  if (skill.version !== normalized.selectedSkillVersion)
    throw new Error("Selected skill version is unavailable");
  assertStoryboardSkillInputs(skill, normalized.skillInputs);
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await assertStoryboardModelSelections(db, normalized);
  const enriched = await db.transaction(async tx => {
    const [project] = await tx
      .select({ id: storyboardSkillProjects.id })
      .from(storyboardSkillProjects)
      .where(
        and(
          eq(storyboardSkillProjects.id, input.projectId),
          eq(storyboardSkillProjects.tenantId, tenantId),
          eq(storyboardSkillProjects.userId, input.userId)
        )
      )
      .for("update")
      .limit(1);
    if (!project) throw new Error("Storyboard project not found");
    const [existingRun] = await tx
      .select({
        id: storyboardSkillRuns.id,
        normalizedSnapshot: storyboardSkillRuns.normalizedSnapshot,
      })
      .from(storyboardSkillRuns)
      .where(
        and(
          eq(storyboardSkillRuns.projectId, input.projectId),
          eq(storyboardSkillRuns.tenantId, tenantId),
          eq(storyboardSkillRuns.userId, input.userId),
          eq(storyboardSkillRuns.status, "awaiting_confirmation")
        )
      )
      .for("update")
      .limit(1);
    if (!existingRun)
      throw new Error("Only an awaiting-confirmation draft can be edited");
    const previousNormalized = normalizeStoryboardGlobalInput(
      existingRun.normalizedSnapshot
    );
    if (
      JSON.stringify(previousNormalized.characterIds) !==
      JSON.stringify(normalized.characterIds)
    ) {
      throw new Error(
        "Character bindings cannot be changed after draft creation"
      );
    }
    const resolved = await enrichStoryboardCharacterReferences(
      tx,
      normalized,
      tenantId,
      input.userId
    );
    const resolvedFingerprint = buildStoryboardConfirmationFingerprint(
      resolved,
      skill
    );
    const [run] = await tx
      .update(storyboardSkillRuns)
      .set({
        confirmationFingerprint: resolvedFingerprint,
        normalizedSnapshot: resolved as unknown as Record<string, unknown>,
        skillSnapshot: skill as unknown as Record<string, unknown>,
        modelSnapshot: {
          image: resolved.imageModelSelection,
          video: resolved.videoModelSelection,
        },
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(storyboardSkillRuns.id, existingRun.id),
          eq(storyboardSkillRuns.tenantId, tenantId),
          eq(storyboardSkillRuns.userId, input.userId),
          eq(storyboardSkillRuns.status, "awaiting_confirmation")
        )
      )
      .returning({ id: storyboardSkillRuns.id });
    if (!run) throw new Error("Storyboard draft changed while editing");
    await tx
      .delete(storyboardSkillShots)
      .where(
        and(
          eq(storyboardSkillShots.runId, run.id),
          eq(storyboardSkillShots.tenantId, tenantId)
        )
      );
    const planned = planStoryboardShots(resolved);
    await tx.insert(storyboardSkillShots).values(
      planned.map(shot => ({
        runId: run.id,
        tenantId,
        shotNumber: shot.shotNumber,
        beat: shot.beat,
        context: shot.context,
        skillInput: {
          ...resolved.skillInputs,
          idea: resolved.idea,
          aspect_ratio: resolved.outputAspectRatio,
        },
      }))
    );
    await tx
      .update(storyboardSkillProjects)
      .set({ title: resolved.title, updatedAt: new Date() })
      .where(
        and(
          eq(storyboardSkillProjects.id, input.projectId),
          eq(storyboardSkillProjects.tenantId, tenantId),
          eq(storyboardSkillProjects.userId, input.userId)
        )
      );
    return { runId: run.id, resolved, resolvedFingerprint };
  });
  return {
    projectId: input.projectId,
    runId: enriched.runId,
    confirmationFingerprint: enriched.resolvedFingerprint,
    normalizedSnapshot: enriched.resolved,
  };
}

export async function getStoryboardSkillProject(input: {
  userId: number;
  tenantId: string | null | undefined;
  projectId: string;
}) {
  const tenantId = requireTenant(input.tenantId);
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [project] = await db
    .select()
    .from(storyboardSkillProjects)
    .where(
      and(
        eq(storyboardSkillProjects.id, input.projectId),
        eq(storyboardSkillProjects.tenantId, tenantId),
        eq(storyboardSkillProjects.userId, input.userId)
      )
    )
    .limit(1);
  if (!project) return null;
  const run = project.activeRunId
    ? await getStoryboardSkillRun({
        userId: input.userId,
        tenantId,
        runId: project.activeRunId,
      })
    : null;
  return { project, run };
}

export async function rebuildStoryboardSkillReviewProjection(input: {
  userId: number;
  tenantId: string | null | undefined;
  runId: string;
}) {
  const tenantId = requireTenant(input.tenantId);
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const run = await getStoryboardSkillRun({
    userId: input.userId,
    tenantId,
    runId: input.runId,
  });
  if (!run) throw new Error("Storyboard run not found");
  const [project] = await db
    .select()
    .from(storyboardSkillProjects)
    .where(
      and(
        eq(storyboardSkillProjects.id, run.projectId),
        eq(storyboardSkillProjects.tenantId, tenantId),
        eq(storyboardSkillProjects.userId, input.userId)
      )
    )
    .limit(1);
  if (!project) throw new Error("Storyboard project not found");
  const global = normalizeStoryboardGlobalInput(run.normalizedSnapshot);
  const planned = planStoryboardShots(global);
  const responseByShot = new Map(
    run.shots
      .filter(shot => shot.generationRequest && shot.generationPrompt)
      .map(shot => [
        shot.shotNumber,
        storyboardCanonicalSkillResponseSchema.parse({
          success: true,
          result: {
            resolved: {},
            generation_prompt: shot.generationPrompt,
            generation_request: shot.generationRequest,
            prompt_debug: { restoredFromPersistence: true },
          },
        }),
      ])
  );
  const missing = planned.filter(shot => !responseByShot.has(shot.shotNumber));
  if (missing.length > 0)
    return {
      runId: run.id,
      projectionStatus: "projection_pending" as const,
      shotCount: run.shots.length,
      missingShotNumbers: missing.map(shot => shot.shotNumber),
    };
  const projection = buildStoryboardReviewProjection({
    projectId: project.id,
    runId: run.id,
    projectName: project.title,
    global,
    shots: planned.map(shot => {
      const stored = run.shots.find(row => row.shotNumber === shot.shotNumber);
      const response = responseByShot.get(shot.shotNumber)!;
      return {
        shot,
        response,
        imageUrl: stored?.imageUrl ?? null,
        videoPrompt: stored?.videoPrompt ?? null,
        imageEffectiveModelId:
          typeof stored?.effectiveGenerationRequest?.model === "string"
            ? stored.effectiveGenerationRequest.model
            : null,
      };
    }),
  });
  const now = new Date();
  const reviewData = projection as unknown as Record<string, unknown>;
  const completedClipCount = projection.tasks.filter(task =>
    Boolean(task.url)
  ).length;
  const reviewId = await db.transaction(async tx => {
    // Serialize the reviewId read with the projection write. Without this lock,
    // two completion/reconciliation workers can both observe NULL and create
    // duplicate legacy review rows before either updates the project backlink.
    const [lockedProject] = await tx
      .select({
        id: storyboardSkillProjects.id,
        title: storyboardSkillProjects.title,
        reviewId: storyboardSkillProjects.reviewId,
      })
      .from(storyboardSkillProjects)
      .where(
        and(
          eq(storyboardSkillProjects.id, project.id),
          eq(storyboardSkillProjects.tenantId, tenantId),
          eq(storyboardSkillProjects.userId, input.userId)
        )
      )
      .for("update")
      .limit(1);
    if (!lockedProject) throw new Error("Storyboard project not found");

    let resolvedReviewId = lockedProject.reviewId;
    if (resolvedReviewId) {
      const [updated] = await tx
        .update(mediaStudioStoryboardReviews)
        .set({
          name: lockedProject.title,
          reviewData,
          clipCount: projection.tasks.length,
          completedClipCount,
          updatedAt: now,
        })
        .where(
          and(
            eq(mediaStudioStoryboardReviews.id, resolvedReviewId),
            eq(mediaStudioStoryboardReviews.userId, input.userId)
          )
        )
        .returning({ id: mediaStudioStoryboardReviews.id });
      if (!updated) resolvedReviewId = null;
    }
    if (!resolvedReviewId) {
      const [created] = await tx
        .insert(mediaStudioStoryboardReviews)
        .values({
          userId: input.userId,
          name: lockedProject.title,
          reviewData,
          clipCount: projection.tasks.length,
          completedClipCount,
          status: "active",
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: mediaStudioStoryboardReviews.id });
      resolvedReviewId = created.id;
    }
    await tx
      .update(storyboardSkillProjects)
      .set({ reviewId: resolvedReviewId, updatedAt: now })
      .where(
        and(
          eq(storyboardSkillProjects.id, lockedProject.id),
          eq(storyboardSkillProjects.tenantId, tenantId),
          eq(storyboardSkillProjects.userId, input.userId)
        )
      );
    return resolvedReviewId;
  });
  return {
    runId: run.id,
    reviewId,
    projectionStatus: "ready" as const,
    shotCount: projection.tasks.length,
  };
}

export async function archiveStoryboardSkillProject(input: {
  userId: number;
  tenantId: string | null | undefined;
  projectId: string;
}) {
  const tenantId = requireTenant(input.tenantId);
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const archived = await db.transaction(async tx => {
    const [project] = await tx
      .select({
        id: storyboardSkillProjects.id,
        activeRunId: storyboardSkillProjects.activeRunId,
      })
      .from(storyboardSkillProjects)
      .where(
        and(
          eq(storyboardSkillProjects.id, input.projectId),
          eq(storyboardSkillProjects.tenantId, tenantId),
          eq(storyboardSkillProjects.userId, input.userId)
        )
      )
      .for("update")
      .limit(1);
    if (!project) throw new Error("Storyboard project not found");

    let runStatus: string | undefined;
    let workerJobId: string | null = null;
    if (project.activeRunId) {
      const [run] = await tx
        .select({
          id: storyboardSkillRuns.id,
          status: storyboardSkillRuns.status,
          workerJobId: storyboardSkillRuns.workerJobId,
        })
        .from(storyboardSkillRuns)
        .where(
          and(
            eq(storyboardSkillRuns.id, project.activeRunId),
            eq(storyboardSkillRuns.projectId, project.id),
            eq(storyboardSkillRuns.tenantId, tenantId),
            eq(storyboardSkillRuns.userId, input.userId)
          )
        )
        .for("update")
        .limit(1);
      if (run && !isTerminalStoryboardRunStatus(run.status)) {
        workerJobId = run.workerJobId;
        runStatus =
          run.status === "awaiting_confirmation"
            ? "cancelled"
            : "cancel_requested";
        await tx
          .update(storyboardSkillRuns)
          .set({ status: runStatus, updatedAt: new Date() })
          .where(
            and(
              eq(storyboardSkillRuns.id, run.id),
              eq(storyboardSkillRuns.tenantId, tenantId),
              eq(storyboardSkillRuns.userId, input.userId)
            )
          );
      } else {
        runStatus = run?.status;
      }
    }
    const [row] = await tx
      .update(storyboardSkillProjects)
      .set({
        status: "archived",
        archivedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(storyboardSkillProjects.id, project.id),
          eq(storyboardSkillProjects.tenantId, tenantId),
          eq(storyboardSkillProjects.userId, input.userId)
        )
      )
      .returning({ id: storyboardSkillProjects.id });
    return { ...row, runStatus, workerJobId };
  });
  if (archived.workerJobId && archived.runStatus === "cancel_requested") {
    const controlPlane = createJobControlPlane();
    const scope = {
      tenantId,
      requestedByUserId: input.userId,
      authorizationScope: "storyboard" as const,
    };
    const status = await controlPlane.getStatus(archived.workerJobId, scope);
    if (
      status &&
      !["cancelled", "succeeded", "failed", "expired"].includes(status.status)
    ) {
      await controlPlane.cancel(
        archived.workerJobId,
        "storyboard_project_archived",
        `storyboard-archive:${input.projectId}`,
        input.userId,
        scope
      );
    }
  }
  return archived;
}

export async function listStoryboardCharacters(input: {
  userId: number;
  tenantId: string | null | undefined;
  projectId?: string;
}) {
  const tenantId = requireTenant(input.tenantId);
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const characters = await db
    .select()
    .from(characterLibraryCharacters)
    .where(
      and(
        eq(characterLibraryCharacters.tenantId, tenantId),
        eq(characterLibraryCharacters.userId, input.userId),
        eq(characterLibraryCharacters.status, "active")
      )
    )
    .orderBy(desc(characterLibraryCharacters.updatedAt));
  const portraitRows = await db
    .select({
      characterId: characterLibraryAssets.characterId,
      mediaAssetId: characterLibraryAssets.mediaAssetId,
      storageKey: mediaAssets.storageKey,
    })
    .from(characterLibraryAssets)
    .innerJoin(
      characterLibraryCharacters,
      eq(characterLibraryCharacters.id, characterLibraryAssets.characterId)
    )
    .innerJoin(
      mediaAssets,
      and(
        eq(mediaAssets.id, characterLibraryAssets.mediaAssetId),
        eq(mediaAssets.tenantId, tenantId),
        eq(mediaAssets.userId, input.userId),
        ne(mediaAssets.status, "expired")
      )
    )
    .where(
      and(
        eq(characterLibraryAssets.tenantId, tenantId),
        eq(characterLibraryAssets.role, "portrait"),
        eq(characterLibraryCharacters.tenantId, tenantId),
        eq(characterLibraryCharacters.userId, input.userId),
        eq(characterLibraryCharacters.status, "active")
      )
    )
    .orderBy(desc(characterLibraryAssets.createdAt));
  const portraitByCharacter = new Map<string, (typeof portraitRows)[number]>();
  for (const row of portraitRows) {
    // Rows are newest-first; preserve the first row instead of letting an
    // older portrait overwrite the current asset in the Map constructor.
    if (!portraitByCharacter.has(row.characterId))
      portraitByCharacter.set(row.characterId, row);
  }
  const lookRows = await db
    .select({
      characterId: characterLibraryLooks.characterId,
      lookId: characterLibraryLooks.id,
      name: characterLibraryLooks.name,
      lookJson: characterLibraryLooks.lookJson,
    })
    .from(characterLibraryLooks)
    .innerJoin(
      characterLibraryCharacters,
      and(
        eq(characterLibraryCharacters.id, characterLibraryLooks.characterId),
        eq(characterLibraryCharacters.tenantId, tenantId),
        eq(characterLibraryCharacters.userId, input.userId),
        eq(characterLibraryCharacters.status, "active")
      )
    )
    .where(
      and(
        eq(characterLibraryLooks.tenantId, tenantId),
        eq(characterLibraryLooks.status, "active")
      )
    )
    .orderBy(desc(characterLibraryLooks.updatedAt));
  const lookMediaAssetIds = lookRows
    .map(look => Number(look.lookJson?.mediaAssetId))
    .filter((id): id is number => Number.isSafeInteger(id) && id > 0);
  const lookMediaAssets =
    lookMediaAssetIds.length > 0
      ? await db
          .select({
            characterId: characterLibraryAssets.characterId,
            id: mediaAssets.id,
            storageKey: mediaAssets.storageKey,
          })
          .from(characterLibraryAssets)
          .innerJoin(
            mediaAssets,
            and(
              eq(mediaAssets.id, characterLibraryAssets.mediaAssetId),
              eq(mediaAssets.tenantId, tenantId),
              eq(mediaAssets.userId, input.userId),
              ne(mediaAssets.status, "expired")
            )
          )
          .where(
            and(
              inArray(characterLibraryAssets.mediaAssetId, lookMediaAssetIds),
              eq(characterLibraryAssets.tenantId, tenantId),
              eq(characterLibraryAssets.role, "look")
            )
          )
      : [];
  const lookMediaAssetByCharacterAndId = new Map(
    lookMediaAssets.map(asset => [`${asset.characterId}:${asset.id}`, asset])
  );
  const looksByCharacter = new Map<
    string,
    Array<{
      id: string;
      name: string;
      mediaAssetId: number | null;
      url: string | null;
    }>
  >();
  for (const look of lookRows) {
    const mediaAssetId = Number(look.lookJson?.mediaAssetId);
    const mediaAsset = lookMediaAssetByCharacterAndId.get(
      `${look.characterId}:${mediaAssetId}`
    );
    const values = looksByCharacter.get(look.characterId) ?? [];
    values.push({
      id: look.lookId,
      name: look.name,
      mediaAssetId: mediaAsset?.id ?? null,
      url: storyboardManagedAssetUrl(mediaAsset?.storageKey),
    });
    looksByCharacter.set(look.characterId, values);
  }
  const withPortraits = characters.map(character => ({
    ...character,
    portraitAssetId:
      portraitByCharacter.get(character.id)?.mediaAssetId ?? null,
    portraitUrl: storyboardManagedAssetUrl(
      portraitByCharacter.get(character.id)?.storageKey
    ),
    looks: looksByCharacter.get(character.id) ?? [],
  }));
  if (!input.projectId) return withPortraits;
  const bindings = await db
    .select({
      characterId: storyboardSkillProjectCharacters.characterId,
      lookId: storyboardSkillProjectCharacters.lookId,
    })
    .from(storyboardSkillProjectCharacters)
    .innerJoin(
      storyboardSkillProjects,
      eq(storyboardSkillProjects.id, storyboardSkillProjectCharacters.projectId)
    )
    .where(
      and(
        eq(storyboardSkillProjectCharacters.projectId, input.projectId),
        eq(storyboardSkillProjectCharacters.tenantId, tenantId),
        eq(storyboardSkillProjects.userId, input.userId),
        eq(storyboardSkillProjects.tenantId, tenantId)
      )
    );
  const boundIds = new Set(bindings.map(binding => binding.characterId));
  return withPortraits.map(character => ({
    ...character,
    isBoundToProject: boundIds.has(character.id),
    boundLookId:
      bindings.find(binding => binding.characterId === character.id)?.lookId ??
      null,
  }));
}

export async function listDramaCharacterSources(input: {
  userId: number;
  tenantId: string | null | undefined;
}) {
  const tenantId = requireTenant(input.tenantId);
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [series, characters, portraits] = await Promise.all([
    db
      .select({ id: verticalDramaSeries.id, title: verticalDramaSeries.title })
      .from(verticalDramaSeries)
      .where(
        and(
          eq(verticalDramaSeries.tenantId, tenantId),
          eq(verticalDramaSeries.userId, input.userId)
        )
      )
      .orderBy(desc(verticalDramaSeries.updatedAt)),
    db
      .select({
        id: verticalDramaCharacters.id,
        seriesId: verticalDramaCharacters.seriesId,
        name: verticalDramaCharacters.name,
        characterKey: verticalDramaCharacters.characterKey,
      })
      .from(verticalDramaCharacters)
      .where(
        and(
          eq(verticalDramaCharacters.tenantId, tenantId),
          eq(verticalDramaCharacters.userId, input.userId)
        )
      ),
    db
      .select({
        characterId: verticalDramaCharacterAssets.characterId,
        mediaAssetId: verticalDramaCharacterAssets.mediaAssetId,
        storageKey: mediaAssets.storageKey,
        approved: verticalDramaCharacterAssets.approved,
        updatedAt: verticalDramaCharacterAssets.updatedAt,
      })
      .from(verticalDramaCharacterAssets)
      .innerJoin(
        mediaAssets,
        and(
          eq(mediaAssets.id, verticalDramaCharacterAssets.mediaAssetId),
          eq(mediaAssets.tenantId, tenantId),
          eq(mediaAssets.userId, input.userId),
          ne(mediaAssets.status, "expired")
        )
      )
      .where(
        and(
          eq(verticalDramaCharacterAssets.tenantId, tenantId),
          eq(verticalDramaCharacterAssets.userId, input.userId),
          eq(verticalDramaCharacterAssets.role, "primary_portrait")
        )
      )
      .orderBy(
        desc(verticalDramaCharacterAssets.approved),
        desc(verticalDramaCharacterAssets.updatedAt)
      ),
  ]);
  const portraitByCharacter = new Map<number, (typeof portraits)[number]>();
  for (const portrait of portraits) {
    if (portrait.characterId == null || portrait.mediaAssetId == null) continue;
    if (!portraitByCharacter.has(portrait.characterId))
      portraitByCharacter.set(portrait.characterId, portrait);
  }
  return series.map(seriesRow => ({
    seriesId: String(seriesRow.id),
    title: seriesRow.title,
    characters: characters
      .filter(character => character.seriesId === seriesRow.id)
      .map(character => {
        const portrait = portraitByCharacter.get(character.id);
        return {
          characterId: String(character.id),
          name: character.name,
          characterKey: character.characterKey,
          portraitAssetId:
            portrait?.mediaAssetId != null
              ? String(portrait.mediaAssetId)
              : null,
          portraitUrl: storyboardManagedAssetUrl(portrait?.storageKey),
        };
      }),
  }));
}

export async function importDramaCharacterToStoryboardLibrary(input: {
  userId: number;
  tenantId: string | null | undefined;
  seriesId: string;
  characterId: string;
}) {
  const tenantId = requireTenant(input.tenantId);
  const seriesId = Number(input.seriesId);
  const characterId = Number(input.characterId);
  if (!Number.isSafeInteger(seriesId) || !Number.isSafeInteger(characterId))
    throw new Error("Drama character source is invalid");
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  try {
    return await db.transaction(async tx => {
      const [source] = await tx
        .select({
          seriesId: verticalDramaSeries.id,
          seriesTitle: verticalDramaSeries.title,
          characterId: verticalDramaCharacters.id,
          name: verticalDramaCharacters.name,
          characterKey: verticalDramaCharacters.characterKey,
          role: verticalDramaCharacters.role,
          narrativeRole: verticalDramaCharacters.narrativeRole,
          data: verticalDramaCharacters.data,
        })
        .from(verticalDramaCharacters)
        .innerJoin(
          verticalDramaSeries,
          eq(verticalDramaSeries.id, verticalDramaCharacters.seriesId)
        )
        .where(
          and(
            eq(verticalDramaCharacters.id, characterId),
            eq(verticalDramaCharacters.seriesId, seriesId),
            eq(verticalDramaCharacters.tenantId, tenantId),
            eq(verticalDramaCharacters.userId, input.userId),
            eq(verticalDramaSeries.tenantId, tenantId),
            eq(verticalDramaSeries.userId, input.userId)
          )
        )
        .limit(1);
      if (!source) throw new Error("Drama character not found");

      const [portrait] = await tx
        .select({
          mediaAssetId: verticalDramaCharacterAssets.mediaAssetId,
          storageKey: mediaAssets.storageKey,
        })
        .from(verticalDramaCharacterAssets)
        .innerJoin(
          mediaAssets,
          and(
            eq(mediaAssets.id, verticalDramaCharacterAssets.mediaAssetId),
            eq(mediaAssets.tenantId, tenantId),
            eq(mediaAssets.userId, input.userId),
            ne(mediaAssets.status, "expired")
          )
        )
        .where(
          and(
            eq(verticalDramaCharacterAssets.characterId, source.characterId),
            eq(verticalDramaCharacterAssets.seriesId, source.seriesId),
            eq(verticalDramaCharacterAssets.tenantId, tenantId),
            eq(verticalDramaCharacterAssets.userId, input.userId),
            eq(verticalDramaCharacterAssets.role, "primary_portrait")
          )
        )
        .orderBy(
          desc(verticalDramaCharacterAssets.approved),
          desc(verticalDramaCharacterAssets.updatedAt)
        )
        .limit(1);

      const characterKey = `drama-${source.seriesId}-${source.characterId}`;
      const [existing] = await tx
        .select()
        .from(characterLibraryCharacters)
        .where(
          and(
            eq(characterLibraryCharacters.tenantId, tenantId),
            eq(characterLibraryCharacters.userId, input.userId),
            eq(characterLibraryCharacters.characterKey, characterKey)
          )
        )
        .limit(1);
      if (existing) {
        const [existingPortrait] = await tx
          .select({
            mediaAssetId: characterLibraryAssets.mediaAssetId,
            storageKey: mediaAssets.storageKey,
          })
          .from(characterLibraryAssets)
          .innerJoin(
            mediaAssets,
            and(
              eq(mediaAssets.id, characterLibraryAssets.mediaAssetId),
              eq(mediaAssets.tenantId, tenantId),
              eq(mediaAssets.userId, input.userId),
              ne(mediaAssets.status, "expired")
            )
          )
          .where(
            and(
              eq(characterLibraryAssets.characterId, existing.id),
              eq(characterLibraryAssets.tenantId, tenantId),
              eq(characterLibraryAssets.role, "portrait")
            )
          )
          .orderBy(
            desc(characterLibraryAssets.revision),
            desc(characterLibraryAssets.createdAt)
          )
          .limit(1);
        if (existing.status !== "active")
          await tx
            .update(characterLibraryCharacters)
            .set({ status: "active", archivedAt: null, updatedAt: new Date() })
            .where(eq(characterLibraryCharacters.id, existing.id));
        if (!existingPortrait && portrait?.mediaAssetId != null)
          await tx.insert(characterLibraryAssets).values({
            characterId: existing.id,
            tenantId,
            mediaAssetId: portrait.mediaAssetId,
            role: "portrait",
            revision: existing.currentRevision,
          });
        const resolvedPortrait = existingPortrait ?? portrait;
        return {
          id: existing.id,
          characterKey: existing.characterKey,
          name: existing.name,
          revision: existing.currentRevision,
          portraitAssetId:
            resolvedPortrait?.mediaAssetId != null
              ? String(resolvedPortrait.mediaAssetId)
              : null,
          portraitUrl: storyboardManagedAssetUrl(resolvedPortrait?.storageKey),
          source: {
            seriesId: String(source.seriesId),
            characterId: String(source.characterId),
          },
          idempotent: true,
        };
      }

      const libraryCharacterId = crypto.randomUUID();
      const profile = redactStoryboardValue({
        role: source.role,
        narrativeRole: source.narrativeRole,
        data: source.data,
        source: {
          surface: "drama_series",
          seriesId: String(source.seriesId),
          seriesTitle: source.seriesTitle,
          characterId: String(source.characterId),
          characterKey: source.characterKey,
        },
      }) as Record<string, unknown>;
      const skillSnapshot = {
        sourceSurface: "drama_series",
        sourceSeriesId: String(source.seriesId),
        sourceCharacterId: String(source.characterId),
        sourceCharacterKey: source.characterKey,
        sourceSkillId: "vertical_drama_character",
      };
      await tx.insert(characterLibraryCharacters).values({
        id: libraryCharacterId,
        tenantId,
        userId: input.userId,
        characterKey,
        name: source.name,
        currentRevision: 1,
      });
      await tx.insert(characterLibraryRevisions).values({
        characterId: libraryCharacterId,
        tenantId,
        revision: 1,
        profileJson: profile,
        skillSnapshot,
        contentHash: fingerprintStoryboardSnapshot({ profile, skillSnapshot }),
        createdByUserId: input.userId,
      });
      if (portrait?.mediaAssetId != null)
        await tx.insert(characterLibraryAssets).values({
          characterId: libraryCharacterId,
          tenantId,
          mediaAssetId: portrait.mediaAssetId,
          role: "portrait",
          revision: 1,
        });
      return {
        id: libraryCharacterId,
        characterKey,
        name: source.name,
        revision: 1,
        portraitAssetId:
          portrait?.mediaAssetId != null ? String(portrait.mediaAssetId) : null,
        portraitUrl: storyboardManagedAssetUrl(portrait?.storageKey),
        source: {
          seriesId: String(source.seriesId),
          characterId: String(source.characterId),
        },
        idempotent: false,
      };
    });
  } catch (error) {
    // Two requests can both pass the pre-insert lookup. The tenant-scoped
    // characterKey constraint is the final arbiter; convert that race into
    // the same idempotent response as the already-existing branch.
    if (!isUniqueViolation(error)) throw error;
    const characterKey = `drama-${seriesId}-${characterId}`;
    const [existing] = await db
      .select()
      .from(characterLibraryCharacters)
      .where(
        and(
          eq(characterLibraryCharacters.tenantId, tenantId),
          eq(characterLibraryCharacters.userId, input.userId),
          eq(characterLibraryCharacters.characterKey, characterKey)
        )
      )
      .limit(1);
    if (!existing) throw error;
    const [portrait] = await db
      .select({
        mediaAssetId: characterLibraryAssets.mediaAssetId,
        storageKey: mediaAssets.storageKey,
      })
      .from(characterLibraryAssets)
      .innerJoin(
        mediaAssets,
        and(
          eq(mediaAssets.id, characterLibraryAssets.mediaAssetId),
          eq(mediaAssets.tenantId, tenantId),
          eq(mediaAssets.userId, input.userId),
          ne(mediaAssets.status, "expired")
        )
      )
      .where(
        and(
          eq(characterLibraryAssets.characterId, existing.id),
          eq(characterLibraryAssets.tenantId, tenantId),
          eq(characterLibraryAssets.role, "portrait")
        )
      )
      .orderBy(
        desc(characterLibraryAssets.revision),
        desc(characterLibraryAssets.createdAt)
      )
      .limit(1);
    return {
      id: existing.id,
      characterKey: existing.characterKey,
      name: existing.name,
      revision: existing.currentRevision,
      portraitAssetId:
        portrait?.mediaAssetId != null ? String(portrait.mediaAssetId) : null,
      portraitUrl: storyboardManagedAssetUrl(portrait?.storageKey),
      source: { seriesId: String(seriesId), characterId: String(characterId) },
      idempotent: true,
    };
  }
}

export async function createStoryboardCharacter(input: {
  userId: number;
  tenantId: string | null | undefined;
  name?: string;
  profile?: Record<string, unknown>;
  skillSnapshot?: Record<string, unknown>;
}) {
  const tenantId = requireTenant(input.tenantId);
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const id = crypto.randomUUID();
  const characterKey = `character-${id}`;
  const profile = input.profile ?? {};
  const skillSnapshot = input.skillSnapshot ?? {
    skillId: "cute_child_image_generator",
    version: "3.0.0",
  };
  let name = input.name?.trim() || "";
  await db.transaction(async tx => {
    if (!name) {
      const existing = await tx
        .select({ name: characterLibraryCharacters.name })
        .from(characterLibraryCharacters)
        .where(
          and(
            eq(characterLibraryCharacters.tenantId, tenantId),
            eq(characterLibraryCharacters.userId, input.userId),
            eq(characterLibraryCharacters.status, "active")
          )
        );
      const names = new Set(existing.map(character => character.name));
      let sequence = 1;
      while (names.has(`Child Character ${String(sequence).padStart(2, "0")}`))
        sequence += 1;
      name = `Child Character ${String(sequence).padStart(2, "0")}`;
    }
    await tx.insert(characterLibraryCharacters).values({
      id,
      tenantId,
      userId: input.userId,
      characterKey,
      name,
      currentRevision: 1,
    });
    await tx.insert(characterLibraryRevisions).values({
      characterId: id,
      tenantId,
      revision: 1,
      profileJson: profile,
      skillSnapshot,
      contentHash: fingerprintStoryboardSnapshot({ profile, skillSnapshot }),
      createdByUserId: input.userId,
    });
  });
  return { id, characterKey, name, revision: 1 };
}

export async function updateStoryboardCharacterName(input: {
  userId: number;
  tenantId: string | null | undefined;
  characterId: string;
  name: string;
}) {
  const tenantId = requireTenant(input.tenantId);
  const name = input.name.trim();
  if (!name) throw new Error("Character name is required");
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.transaction(async tx => {
    // Rename and revision allocation must use the same row lock. Otherwise
    // two rapid rename requests can both allocate currentRevision + 1 and
    // one request loses its audit revision or hits the unique constraint.
    const [character] = await tx
      .select()
      .from(characterLibraryCharacters)
      .where(
        and(
          eq(characterLibraryCharacters.id, input.characterId),
          eq(characterLibraryCharacters.tenantId, tenantId),
          eq(characterLibraryCharacters.userId, input.userId),
          eq(characterLibraryCharacters.status, "active")
        )
      )
      .for("update")
      .limit(1);
    if (!character) throw new Error("Character not found");
    const [latest] = await tx
      .select()
      .from(characterLibraryRevisions)
      .where(
        and(
          eq(characterLibraryRevisions.characterId, character.id),
          eq(characterLibraryRevisions.tenantId, tenantId)
        )
      )
      .orderBy(desc(characterLibraryRevisions.revision))
      .limit(1);
    const nextRevision = character.currentRevision + 1;
    const profileJson = latest?.profileJson ?? {};
    const skillSnapshot = latest?.skillSnapshot ?? {
      skillId: "cute_child_image_generator",
      version: "3.0.0",
    };
    await tx
      .update(characterLibraryCharacters)
      .set({ name, currentRevision: nextRevision, updatedAt: new Date() })
      .where(
        and(
          eq(characterLibraryCharacters.id, character.id),
          eq(characterLibraryCharacters.tenantId, tenantId),
          eq(characterLibraryCharacters.userId, input.userId)
        )
      );
    await tx.insert(characterLibraryRevisions).values({
      characterId: character.id,
      tenantId,
      revision: nextRevision,
      profileJson,
      skillSnapshot,
      contentHash: fingerprintStoryboardSnapshot({
        profileJson,
        skillSnapshot,
        name,
      }),
      createdByUserId: input.userId,
    });
    return { id: character.id, name, revision: nextRevision };
  });
}

export async function addStoryboardCharacterLook(input: {
  userId: number;
  tenantId: string | null | undefined;
  characterId: string;
  name: string;
  look: Record<string, unknown>;
}) {
  const tenantId = requireTenant(input.tenantId);
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [character] = await db
    .select({ id: characterLibraryCharacters.id })
    .from(characterLibraryCharacters)
    .where(
      and(
        eq(characterLibraryCharacters.id, input.characterId),
        eq(characterLibraryCharacters.tenantId, tenantId),
        eq(characterLibraryCharacters.userId, input.userId),
        eq(characterLibraryCharacters.status, "active")
      )
    )
    .limit(1);
  if (!character) throw new Error("Character not found");
  const [look] = await db
    .insert(characterLibraryLooks)
    .values({
      characterId: character.id,
      tenantId,
      name: input.name.trim() || "New look",
      lookJson: input.look,
    })
    .returning({
      id: characterLibraryLooks.id,
      name: characterLibraryLooks.name,
    });
  return look;
}

export async function saveStoryboardShotAsCharacter(input: {
  userId: number;
  tenantId: string | null | undefined;
  runId: string;
  shotNumber: number;
  characterId?: string;
  characterName?: string;
  role: "portrait" | "look";
  lookName?: string;
}) {
  const tenantId = requireTenant(input.tenantId);
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const characterName = input.characterName?.trim() ?? "";
  const lookName = input.lookName?.trim() ?? "";
  if (!input.characterId && !characterName)
    throw new Error("Character name is required");
  if (input.role === "look" && !input.characterId)
    throw new Error("A look must be added to an existing character");
  if (input.role === "look" && !lookName)
    throw new Error("Look name is required");

  const sourceKey = `storyboard-shot:${input.runId}:${input.shotNumber}:${input.role}`;
  try {
    return await db.transaction(async tx => {
      const [source] = await tx
        .select({
          imageAssetId: storyboardSkillShots.imageAssetId,
          status: storyboardSkillShots.status,
          suppressedResult: storyboardSkillShots.suppressedResult,
        })
        .from(storyboardSkillShots)
        .innerJoin(
          storyboardSkillRuns,
          and(
            eq(storyboardSkillRuns.id, storyboardSkillShots.runId),
            eq(storyboardSkillRuns.tenantId, tenantId),
            eq(storyboardSkillRuns.userId, input.userId)
          )
        )
        .where(
          and(
            eq(storyboardSkillShots.runId, input.runId),
            eq(storyboardSkillShots.tenantId, tenantId),
            eq(storyboardSkillShots.shotNumber, input.shotNumber)
          )
        )
        .limit(1);
      if (!source || !isReusableStoryboardImage(source))
        throw new Error("STORYBOARD_IMAGE_NOT_READY");

      const [media] = await tx
        .select({ id: mediaAssets.id })
        .from(mediaAssets)
        .where(
          and(
            eq(mediaAssets.id, source.imageAssetId),
            eq(mediaAssets.tenantId, tenantId),
            eq(mediaAssets.userId, input.userId),
            ne(mediaAssets.status, "expired")
          )
        )
        .limit(1);
      if (!media) throw new Error("STORYBOARD_IMAGE_NOT_AVAILABLE");

      let character: {
        id: string;
        characterKey: string;
        name: string;
        currentRevision: number;
      } | null = null;
      if (input.characterId) {
        const [existing] = await tx
          .select({
            id: characterLibraryCharacters.id,
            characterKey: characterLibraryCharacters.characterKey,
            name: characterLibraryCharacters.name,
            currentRevision: characterLibraryCharacters.currentRevision,
            status: characterLibraryCharacters.status,
          })
          .from(characterLibraryCharacters)
          .where(
            and(
              eq(characterLibraryCharacters.id, input.characterId),
              eq(characterLibraryCharacters.tenantId, tenantId),
              eq(characterLibraryCharacters.userId, input.userId),
              eq(characterLibraryCharacters.status, "active")
            )
          )
          .for("update")
          .limit(1);
        if (!existing) throw new Error("Character not found");
        character = existing;
      } else {
        const [existing] = await tx
          .select({
            id: characterLibraryCharacters.id,
            characterKey: characterLibraryCharacters.characterKey,
            name: characterLibraryCharacters.name,
            currentRevision: characterLibraryCharacters.currentRevision,
            status: characterLibraryCharacters.status,
          })
          .from(characterLibraryCharacters)
          .where(
            and(
              eq(characterLibraryCharacters.characterKey, sourceKey),
              eq(characterLibraryCharacters.tenantId, tenantId),
              eq(characterLibraryCharacters.userId, input.userId)
            )
          )
          .limit(1);
        if (existing) {
          if (existing.status !== "active")
            throw new Error("Character is archived");
          character = existing;
        } else {
          const id = crypto.randomUUID();
          await tx.insert(characterLibraryCharacters).values({
            id,
            tenantId,
            userId: input.userId,
            characterKey: sourceKey,
            name: characterName,
            currentRevision: 1,
          });
          await tx.insert(characterLibraryRevisions).values({
            characterId: id,
            tenantId,
            revision: 1,
            profileJson: {
              source: "storyboard_shot",
              sourceRunId: input.runId,
              sourceShotNumber: input.shotNumber,
            },
            skillSnapshot: { source: "storyboard_shot" },
            contentHash: fingerprintStoryboardSnapshot({
              sourceKey,
              characterName,
            }),
            createdByUserId: input.userId,
          });
          character = {
            id,
            characterKey: sourceKey,
            name: characterName,
            currentRevision: 1,
          };
        }
      }
      if (!character) throw new Error("Character not found");

      await tx
        .insert(characterLibraryAssets)
        .values({
          characterId: character.id,
          tenantId,
          mediaAssetId: media.id,
          role: input.role,
          revision: character.currentRevision,
        })
        .onConflictDoNothing({
          target: [
            characterLibraryAssets.characterId,
            characterLibraryAssets.mediaAssetId,
            characterLibraryAssets.role,
          ],
        });

      let lookId: string | null = null;
      if (input.role === "look") {
        const existingLooks = await tx
          .select({
            id: characterLibraryLooks.id,
            lookJson: characterLibraryLooks.lookJson,
          })
          .from(characterLibraryLooks)
          .where(
            and(
              eq(characterLibraryLooks.characterId, character.id),
              eq(characterLibraryLooks.tenantId, tenantId),
              eq(characterLibraryLooks.status, "active")
            )
          );
        const existingLook = existingLooks.find(
          look =>
            look.lookJson?.sourceRunId === input.runId &&
            Number(look.lookJson?.sourceShotNumber) === input.shotNumber &&
            Number(look.lookJson?.mediaAssetId) === media.id
        );
        if (existingLook) {
          lookId = existingLook.id;
        } else {
          const [look] = await tx
            .insert(characterLibraryLooks)
            .values({
              characterId: character.id,
              tenantId,
              name: lookName,
              lookJson: {
                mediaAssetId: media.id,
                source: "storyboard_shot",
                sourceRunId: input.runId,
                sourceShotNumber: input.shotNumber,
              },
            })
            .returning({ id: characterLibraryLooks.id });
          lookId = look?.id ?? null;
        }
      }
      return {
        characterId: character.id,
        characterKey: character.characterKey,
        characterName: character.name,
        mediaAssetId: media.id,
        role: input.role,
        lookId,
        idempotent: Boolean(lookId) || Boolean(input.characterId),
      };
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const [existing] = await db
      .select({
        id: characterLibraryCharacters.id,
        characterKey: characterLibraryCharacters.characterKey,
        name: characterLibraryCharacters.name,
      })
      .from(characterLibraryCharacters)
      .where(
        and(
          eq(characterLibraryCharacters.characterKey, sourceKey),
          eq(characterLibraryCharacters.tenantId, tenantId),
          eq(characterLibraryCharacters.userId, input.userId)
        )
      )
      .limit(1);
    if (!existing) throw error;
    const [source] = await db
      .select({ imageAssetId: storyboardSkillShots.imageAssetId })
      .from(storyboardSkillShots)
      .where(
        and(
          eq(storyboardSkillShots.runId, input.runId),
          eq(storyboardSkillShots.tenantId, tenantId),
          eq(storyboardSkillShots.shotNumber, input.shotNumber)
        )
      )
      .limit(1);
    const [asset] =
      source?.imageAssetId != null
        ? await db
            .select({ mediaAssetId: characterLibraryAssets.mediaAssetId })
            .from(characterLibraryAssets)
            .where(
              and(
                eq(characterLibraryAssets.characterId, existing.id),
                eq(characterLibraryAssets.tenantId, tenantId),
                eq(characterLibraryAssets.mediaAssetId, source.imageAssetId),
                eq(characterLibraryAssets.role, input.role)
              )
            )
            .limit(1)
        : [];
    return {
      characterId: existing.id,
      characterKey: existing.characterKey,
      characterName: existing.name,
      mediaAssetId: asset?.mediaAssetId ?? source?.imageAssetId ?? null,
      role: input.role,
      idempotent: true,
    };
  }
}

async function updateDraftCharacterIds(input: {
  db: { select: (...args: any[]) => any; update: (...args: any[]) => any };
  projectId: string;
  tenantId: string;
  userId: number;
  characterIds: string[];
  characterLookIds?: Record<string, string>;
}) {
  const [project] = await input.db
    .select({ activeRunId: storyboardSkillProjects.activeRunId })
    .from(storyboardSkillProjects)
    .where(
      and(
        eq(storyboardSkillProjects.id, input.projectId),
        eq(storyboardSkillProjects.tenantId, input.tenantId),
        eq(storyboardSkillProjects.userId, input.userId)
      )
    )
    .for("update")
    .limit(1);
  if (!project) throw new Error("Storyboard project not found");
  if (!project.activeRunId) return;
  const [run] = await input.db
    .select()
    .from(storyboardSkillRuns)
    .where(
      and(
        eq(storyboardSkillRuns.id, project.activeRunId),
        eq(storyboardSkillRuns.tenantId, input.tenantId),
        eq(storyboardSkillRuns.userId, input.userId)
      )
    )
    .for("update")
    .limit(1);
  if (!run || run.status !== "awaiting_confirmation")
    throw new Error("Characters can only be changed before confirmation");
  const normalized = normalizeStoryboardGlobalInput({
    ...run.normalizedSnapshot,
    characterIds: input.characterIds,
    characterLookIds:
      input.characterLookIds ??
      normalizeStoryboardGlobalInput(run.normalizedSnapshot).characterLookIds,
  });
  const skill = getStoryboardSkillSchema(normalized.selectedSkillId);
  if (skill.version !== normalized.selectedSkillVersion)
    throw new Error("Selected skill version is unavailable");
  assertStoryboardSkillInputs(skill, normalized.skillInputs);
  const enriched = await enrichStoryboardCharacterReferences(
    input.db,
    normalized,
    input.tenantId,
    input.userId
  );
  const planned = planStoryboardShots(enriched);
  const [updated] = await input.db
    .update(storyboardSkillRuns)
    .set({
      normalizedSnapshot: enriched as unknown as Record<string, unknown>,
      confirmationFingerprint: buildStoryboardConfirmationFingerprint(
        enriched,
        skill
      ),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(storyboardSkillRuns.id, run.id),
        eq(storyboardSkillRuns.tenantId, input.tenantId),
        eq(storyboardSkillRuns.userId, input.userId),
        eq(storyboardSkillRuns.status, "awaiting_confirmation")
      )
    )
    .returning({ id: storyboardSkillRuns.id });
  if (!updated)
    throw new Error("Characters can only be changed before confirmation");
  for (const shot of planned) {
    await input.db
      .update(storyboardSkillShots)
      .set({
        beat: shot.beat,
        context: shot.context,
        skillInput: {
          ...enriched.skillInputs,
          idea: enriched.idea,
          aspect_ratio: enriched.outputAspectRatio,
        },
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(storyboardSkillShots.runId, run.id),
          eq(storyboardSkillShots.tenantId, input.tenantId),
          eq(storyboardSkillShots.shotNumber, shot.shotNumber)
        )
      );
  }
}

export async function bindStoryboardProjectCharacter(input: {
  userId: number;
  tenantId: string | null | undefined;
  projectId: string;
  characterId: string;
  lookId?: string;
}) {
  const tenantId = requireTenant(input.tenantId);
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  try {
    return await db.transaction(async tx => {
      const [character] = await tx
        .select({
          id: characterLibraryCharacters.id,
          name: characterLibraryCharacters.name,
          currentRevision: characterLibraryCharacters.currentRevision,
        })
        .from(characterLibraryCharacters)
        .where(
          and(
            eq(characterLibraryCharacters.id, input.characterId),
            eq(characterLibraryCharacters.tenantId, tenantId),
            eq(characterLibraryCharacters.userId, input.userId),
            eq(characterLibraryCharacters.status, "active")
          )
        )
        .limit(1);
      if (!character) throw new Error("Character not found");
      let selectedLook: {
        id: string;
        name: string;
        mediaAssetId: number;
      } | null = null;
      if (input.lookId) {
        const [look] = await tx
          .select({
            id: characterLibraryLooks.id,
            name: characterLibraryLooks.name,
            lookJson: characterLibraryLooks.lookJson,
          })
          .from(characterLibraryLooks)
          .where(
            and(
              eq(characterLibraryLooks.id, input.lookId),
              eq(characterLibraryLooks.characterId, character.id),
              eq(characterLibraryLooks.tenantId, tenantId),
              eq(characterLibraryLooks.status, "active")
            )
          )
          .limit(1);
        if (!look) throw new Error("Character look not found");
        const mediaAssetId = Number(look.lookJson?.mediaAssetId);
        if (!Number.isSafeInteger(mediaAssetId) || mediaAssetId <= 0)
          throw new Error("Character look image is not available");
        const [lookAsset] = await tx
          .select({ id: characterLibraryAssets.id })
          .from(characterLibraryAssets)
          .innerJoin(
            mediaAssets,
            and(
              eq(mediaAssets.id, characterLibraryAssets.mediaAssetId),
              eq(mediaAssets.tenantId, tenantId),
              eq(mediaAssets.userId, input.userId),
              ne(mediaAssets.status, "expired")
            )
          )
          .where(
            and(
              eq(characterLibraryAssets.characterId, character.id),
              eq(characterLibraryAssets.tenantId, tenantId),
              eq(characterLibraryAssets.mediaAssetId, mediaAssetId),
              eq(characterLibraryAssets.role, "look")
            )
          )
          .limit(1);
        if (!lookAsset)
          throw new Error("Character look image is not available");
        selectedLook = { id: look.id, name: look.name, mediaAssetId };
      } else {
        const [portrait] = await tx
          .select({ id: characterLibraryAssets.id })
          .from(characterLibraryAssets)
          .innerJoin(
            mediaAssets,
            and(
              eq(mediaAssets.id, characterLibraryAssets.mediaAssetId),
              eq(mediaAssets.tenantId, tenantId),
              eq(mediaAssets.userId, input.userId),
              ne(mediaAssets.status, "expired")
            )
          )
          .where(
            and(
              eq(characterLibraryAssets.characterId, character.id),
              eq(characterLibraryAssets.tenantId, tenantId),
              eq(characterLibraryAssets.role, "portrait")
            )
          )
          .limit(1);
        if (!portrait)
          throw new Error("Character portrait image is not available");
      }
      const [project] = await tx
        .select({
          activeRunId: storyboardSkillProjects.activeRunId,
          status: storyboardSkillProjects.status,
        })
        .from(storyboardSkillProjects)
        .where(
          and(
            eq(storyboardSkillProjects.id, input.projectId),
            eq(storyboardSkillProjects.tenantId, tenantId),
            eq(storyboardSkillProjects.userId, input.userId)
          )
        )
        .for("update")
        .limit(1);
      if (!project) throw new Error("Storyboard project not found");
      if (project.status === "archived")
        throw new Error("Archived storyboard projects cannot be changed");
      const [currentRun] = project.activeRunId
        ? await tx
            .select()
            .from(storyboardSkillRuns)
            .where(
              and(
                eq(storyboardSkillRuns.id, project.activeRunId),
                eq(storyboardSkillRuns.projectId, input.projectId),
                eq(storyboardSkillRuns.tenantId, tenantId),
                eq(storyboardSkillRuns.userId, input.userId)
              )
            )
            .for("update")
            .limit(1)
        : [];
      if (currentRun && currentRun.status !== "awaiting_confirmation") {
        throw new Error("Characters can only be changed before confirmation");
      }
      const [existing] = await tx
        .select({
          id: storyboardSkillProjectCharacters.id,
          lookId: storyboardSkillProjectCharacters.lookId,
          snapshotJson: storyboardSkillProjectCharacters.snapshotJson,
        })
        .from(storyboardSkillProjectCharacters)
        .where(
          and(
            eq(storyboardSkillProjectCharacters.projectId, input.projectId),
            eq(storyboardSkillProjectCharacters.characterId, character.id),
            eq(storyboardSkillProjectCharacters.tenantId, tenantId)
          )
        )
        .limit(1);
      if (existing) {
        const [revision] = await tx
          .select({
            profileJson: characterLibraryRevisions.profileJson,
            skillSnapshot: characterLibraryRevisions.skillSnapshot,
          })
          .from(characterLibraryRevisions)
          .where(
            and(
              eq(characterLibraryRevisions.characterId, character.id),
              eq(characterLibraryRevisions.revision, character.currentRevision),
              eq(characterLibraryRevisions.tenantId, tenantId)
            )
          )
          .limit(1);
        const currentSnapshot = existing.snapshotJson ?? {};
        const nextSnapshot: Record<string, unknown> = {
          ...currentSnapshot,
          name: character.name,
          revision: character.currentRevision,
          profile: revision?.profileJson ?? currentSnapshot.profile ?? {},
          skill: revision?.skillSnapshot ?? currentSnapshot.skill ?? {},
          ...(selectedLook ? { look: selectedLook } : {}),
        };
        if (!selectedLook) delete nextSnapshot.look;
        await tx
          .update(storyboardSkillProjectCharacters)
          .set({
            lookId: input.lookId ?? null,
            revision: character.currentRevision,
            nameSnapshot: character.name,
            snapshotJson: nextSnapshot,
            updatedAt: new Date(),
          })
          .where(eq(storyboardSkillProjectCharacters.id, existing.id));
        const currentIds = currentRun
          ? normalizeStoryboardGlobalInput(currentRun.normalizedSnapshot)
              .characterIds
          : [];
        const currentLookIds = currentRun
          ? normalizeStoryboardGlobalInput(currentRun.normalizedSnapshot)
              .characterLookIds
          : {};
        const nextLookIds = { ...currentLookIds };
        if (input.lookId) nextLookIds[character.id] = input.lookId;
        else delete nextLookIds[character.id];
        await updateDraftCharacterIds({
          db: tx,
          projectId: input.projectId,
          tenantId,
          userId: input.userId,
          characterIds: [...new Set([...currentIds, character.id])],
          characterLookIds: nextLookIds,
        });
        return { ...existing, idempotent: true };
      }
      const [revision] = await tx
        .select({
          profileJson: characterLibraryRevisions.profileJson,
          skillSnapshot: characterLibraryRevisions.skillSnapshot,
        })
        .from(characterLibraryRevisions)
        .where(
          and(
            eq(characterLibraryRevisions.characterId, character.id),
            eq(characterLibraryRevisions.revision, character.currentRevision),
            eq(characterLibraryRevisions.tenantId, tenantId)
          )
        )
        .limit(1);
      await tx.insert(storyboardSkillProjectCharacters).values({
        projectId: input.projectId,
        characterId: character.id,
        tenantId,
        revision: character.currentRevision,
        nameSnapshot: character.name,
        snapshotJson: {
          name: character.name,
          revision: character.currentRevision,
          profile: revision?.profileJson ?? {},
          skill: revision?.skillSnapshot ?? {},
          ...(selectedLook ? { look: selectedLook } : {}),
        },
        lookId: selectedLook?.id ?? null,
      });
      const currentIds = currentRun
        ? normalizeStoryboardGlobalInput(currentRun.normalizedSnapshot)
            .characterIds
        : [];
      await updateDraftCharacterIds({
        db: tx,
        projectId: input.projectId,
        tenantId,
        userId: input.userId,
        characterIds: [...new Set([...currentIds, character.id])],
        characterLookIds: (() => {
          const next = currentRun
            ? {
                ...normalizeStoryboardGlobalInput(currentRun.normalizedSnapshot)
                  .characterLookIds,
              }
            : {};
          if (input.lookId) next[character.id] = input.lookId;
          else delete next[character.id];
          return next;
        })(),
      });
      return {
        projectId: input.projectId,
        characterId: character.id,
        idempotent: false,
      };
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const [existing] = await db
      .select({
        id: storyboardSkillProjectCharacters.id,
        lookId: storyboardSkillProjectCharacters.lookId,
      })
      .from(storyboardSkillProjectCharacters)
      .where(
        and(
          eq(storyboardSkillProjectCharacters.projectId, input.projectId),
          eq(storyboardSkillProjectCharacters.characterId, input.characterId),
          eq(storyboardSkillProjectCharacters.tenantId, tenantId)
        )
      )
      .limit(1);
    if (!existing) throw error;
    return { ...existing, idempotent: true };
  }
}

export async function unbindStoryboardProjectCharacter(input: {
  userId: number;
  tenantId: string | null | undefined;
  projectId: string;
  characterId: string;
}) {
  const tenantId = requireTenant(input.tenantId);
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.transaction(async tx => {
    const [project] = await tx
      .select({
        activeRunId: storyboardSkillProjects.activeRunId,
        status: storyboardSkillProjects.status,
      })
      .from(storyboardSkillProjects)
      .where(
        and(
          eq(storyboardSkillProjects.id, input.projectId),
          eq(storyboardSkillProjects.tenantId, tenantId),
          eq(storyboardSkillProjects.userId, input.userId)
        )
      )
      .for("update")
      .limit(1);
    if (!project) throw new Error("Storyboard project not found");
    if (project.status === "archived")
      throw new Error("Archived storyboard projects cannot be changed");
    const [binding] = await tx
      .select({ id: storyboardSkillProjectCharacters.id })
      .from(storyboardSkillProjectCharacters)
      .where(
        and(
          eq(storyboardSkillProjectCharacters.projectId, input.projectId),
          eq(storyboardSkillProjectCharacters.characterId, input.characterId),
          eq(storyboardSkillProjectCharacters.tenantId, tenantId)
        )
      )
      .limit(1);
    if (!binding) {
      return {
        projectId: input.projectId,
        characterId: input.characterId,
        removed: false,
      };
    }
    const [currentRun] = project.activeRunId
      ? await tx
          .select()
          .from(storyboardSkillRuns)
          .where(
            and(
              eq(storyboardSkillRuns.id, project.activeRunId),
              eq(storyboardSkillRuns.projectId, input.projectId),
              eq(storyboardSkillRuns.tenantId, tenantId),
              eq(storyboardSkillRuns.userId, input.userId)
            )
          )
          .for("update")
          .limit(1)
      : [];
    await updateDraftCharacterIds({
      db: tx,
      projectId: input.projectId,
      tenantId,
      userId: input.userId,
      characterIds: currentRun
        ? normalizeStoryboardGlobalInput(
            currentRun.normalizedSnapshot
          ).characterIds.filter(id => id !== input.characterId)
        : [],
      characterLookIds: Object.fromEntries(
        Object.entries(
          currentRun
            ? normalizeStoryboardGlobalInput(currentRun.normalizedSnapshot)
                .characterLookIds
            : {}
        ).filter(([characterId]) => characterId !== input.characterId)
      ),
    });
    const [removed] = await tx
      .delete(storyboardSkillProjectCharacters)
      .where(
        and(
          eq(storyboardSkillProjectCharacters.id, binding.id),
          eq(storyboardSkillProjectCharacters.tenantId, tenantId)
        )
      )
      .returning({ id: storyboardSkillProjectCharacters.id });
    return {
      projectId: input.projectId,
      characterId: input.characterId,
      removed: Boolean(removed),
    };
  });
}
