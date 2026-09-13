import crypto from "node:crypto";
import { and, desc, eq, ne } from "drizzle-orm";
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
} from "../../drizzle/schema";
import {
  buildStoryboardConfirmationFingerprint,
  fingerprintStoryboardSnapshot,
  isRetryableStoryboardShotStatus,
  isTerminalStoryboardRunStatus,
  normalizeStoryboardGlobalInput,
  redactStoryboardValue,
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

function requireTenant(tenantId: string | null | undefined): string {
  if (!tenantId) throw new Error("Tenant context is required");
  return tenantId;
}

async function assertStoryboardModelSelections(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
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
  const fingerprint = buildStoryboardConfirmationFingerprint(normalized, skill);
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await assertStoryboardModelSelections(db, normalized);

  return db.transaction(async tx => {
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
    if (existing)
      return {
        projectId: existing.project.id,
        runId: existing.run.id,
        status: existing.run.status,
        normalizedSnapshot: existing.run.normalizedSnapshot,
        confirmationFingerprint: existing.run.confirmationFingerprint,
      };

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
      confirmationFingerprint: fingerprint,
      status: "awaiting_confirmation",
      normalizedSnapshot: normalized as unknown as Record<string, unknown>,
      skillSnapshot: skill as unknown as Record<string, unknown>,
      modelSnapshot: {
        image: normalized.imageModelSelection,
        video: normalized.videoModelSelection,
      },
    });
    const planned = planStoryboardShots(normalized);
    await tx.insert(storyboardSkillShots).values(
      planned.map(shot => ({
        runId,
        tenantId,
        shotNumber: shot.shotNumber,
        beat: shot.beat,
        context: shot.context,
        skillInput: {
          ...normalized.skillInputs,
          idea: normalized.idea,
          aspect_ratio: normalized.outputAspectRatio,
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
        .limit(1);
      if (!character) throw new Error("Character not found");
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
        },
      });
    }
    return {
      projectId,
      runId,
      status: "awaiting_confirmation" as const,
      normalizedSnapshot: normalized,
      confirmationFingerprint: fingerprint,
    };
  });
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

  return db.transaction(async tx => {
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
      .limit(1);
    if (!project) throw new Error("Storyboard project not found");

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
    if (existing)
      return {
        projectId: existing.projectId,
        runId: existing.id,
        status: existing.status,
        normalizedSnapshot: existing.normalizedSnapshot,
        confirmationFingerprint: existing.confirmationFingerprint,
        idempotent: true,
      };

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
    assertStoryboardSkillInputs(skill, normalized.skillInputs);
    await assertStoryboardModelSelections(db, normalized);

    const runId = crypto.randomUUID();
    const fingerprint = buildStoryboardConfirmationFingerprint(
      normalized,
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
      normalizedSnapshot: normalized as unknown as Record<string, unknown>,
      skillSnapshot: skill as unknown as Record<string, unknown>,
      modelSnapshot: {
        image: normalized.imageModelSelection,
        video: normalized.videoModelSelection,
      },
    });
    const planned = planStoryboardShots(normalized);
    await tx.insert(storyboardSkillShots).values(
      planned.map(shot => ({
        runId,
        tenantId,
        shotNumber: shot.shotNumber,
        beat: shot.beat,
        context: shot.context,
        skillInput: {
          ...normalized.skillInputs,
          idea: normalized.idea,
          aspect_ratio: normalized.outputAspectRatio,
        },
      }))
    );
    await tx
      .update(storyboardSkillProjects)
      .set({ activeRunId: runId, status: "draft", updatedAt: new Date() })
      .where(eq(storyboardSkillProjects.id, project.id));
    return {
      projectId: project.id,
      runId,
      status: "awaiting_confirmation" as const,
      normalizedSnapshot: normalized,
      confirmationFingerprint: fingerprint,
    };
  });
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
  const shots = await db
    .select()
    .from(storyboardSkillShots)
    .where(eq(storyboardSkillShots.runId, run.id))
    .orderBy(storyboardSkillShots.shotNumber);
  return { ...run, shots };
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
  )
    return { runId: run.id, status: run.status, idempotent: true };
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
  await db.transaction(async tx => {
    await tx
      .update(storyboardSkillRuns)
      .set({
        status: "queued",
        normalizedSnapshot: effectiveNormalized as unknown as Record<
          string,
          unknown
        >,
        updatedAt: new Date(),
      })
      .where(eq(storyboardSkillRuns.id, run.id));
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
            eq(storyboardSkillShots.shotNumber, item.shot.shotNumber)
          )
        );
    }
    await tx
      .update(storyboardSkillProjects)
      .set({ status: "queued", updatedAt: new Date() })
      .where(eq(storyboardSkillProjects.id, run.projectId));
  });
  return { runId: run.id, status: "queued" as const, idempotent: false };
}

export async function cancelStoryboardSkillRun(input: {
  userId: number;
  tenantId: string | null | undefined;
  runId: string;
}) {
  const tenantId = requireTenant(input.tenantId);
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [existing] = await db
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
  if (!existing) throw new Error("Storyboard run not found");
  if (isTerminalStoryboardRunStatus(existing.status))
    return { ...existing, idempotent: true };
  if (existing.status === "cancel_requested")
    return { ...existing, idempotent: true };
  const [run] = await db
    .update(storyboardSkillRuns)
    .set({ status: "cancel_requested", updatedAt: new Date() })
    .where(
      and(
        eq(storyboardSkillRuns.id, input.runId),
        eq(storyboardSkillRuns.tenantId, tenantId),
        eq(storyboardSkillRuns.userId, input.userId)
      )
    )
    .returning({
      id: storyboardSkillRuns.id,
      projectId: storyboardSkillRuns.projectId,
      status: storyboardSkillRuns.status,
    });
  if (!run) throw new Error("Storyboard run not found");
  await db
    .update(storyboardSkillProjects)
    .set({ status: "cancel_requested", updatedAt: new Date() })
    .where(eq(storyboardSkillProjects.id, run.projectId));
  return { ...run, idempotent: false };
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
  const allowed = new Set(
    input.shotNumbers ?? run.shots.map(shot => shot.shotNumber)
  );
  for (const shot of run.shots) {
    if (
      allowed.has(shot.shotNumber) &&
      isRetryableStoryboardShotStatus(shot.status)
    ) {
      await db
        .update(storyboardSkillShots)
        .set({ status: "pending", error: null, updatedAt: new Date() })
        .where(eq(storyboardSkillShots.id, shot.id));
    }
  }
  const retryableShots = run.shots.filter(
    shot =>
      allowed.has(shot.shotNumber) &&
      isRetryableStoryboardShotStatus(shot.status)
  );
  if (retryableShots.length === 0)
    throw new Error("No failed or partial shots are available to retry");
  await db
    .update(storyboardSkillRuns)
    .set({ status: "queued", updatedAt: new Date() })
    .where(eq(storyboardSkillRuns.id, input.runId));
  await db
    .update(storyboardSkillProjects)
    .set({ status: "queued", updatedAt: new Date() })
    .where(eq(storyboardSkillProjects.id, run.projectId));
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
  const fingerprint = buildStoryboardConfirmationFingerprint(normalized, skill);
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await assertStoryboardModelSelections(db, normalized);
  const [run] = await db
    .update(storyboardSkillRuns)
    .set({
      confirmationFingerprint: fingerprint,
      normalizedSnapshot: normalized as unknown as Record<string, unknown>,
      skillSnapshot: skill as unknown as Record<string, unknown>,
      modelSnapshot: {
        image: normalized.imageModelSelection,
        video: normalized.videoModelSelection,
      },
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(storyboardSkillRuns.projectId, input.projectId),
        eq(storyboardSkillRuns.tenantId, tenantId),
        eq(storyboardSkillRuns.userId, input.userId),
        eq(storyboardSkillRuns.status, "awaiting_confirmation")
      )
    )
    .returning({ id: storyboardSkillRuns.id });
  if (!run)
    throw new Error("Only an awaiting-confirmation draft can be edited");
  await db
    .update(storyboardSkillProjects)
    .set({ title: normalized.title, updatedAt: new Date() })
    .where(eq(storyboardSkillProjects.id, input.projectId));
  return {
    projectId: input.projectId,
    runId: run.id,
    confirmationFingerprint: fingerprint,
    normalizedSnapshot: normalized,
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
        imageUrl: stored?.imageAssetId ? null : null,
        videoPrompt: stored?.videoPrompt ?? null,
      };
    }),
  });
  const now = new Date();
  const reviewData = projection as unknown as Record<string, unknown>;
  let reviewId = project.reviewId;
  if (reviewId) {
    const [updated] = await db
      .update(mediaStudioStoryboardReviews)
      .set({
        name: project.title,
        reviewData,
        clipCount: projection.tasks.length,
        updatedAt: now,
      })
      .where(
        and(
          eq(mediaStudioStoryboardReviews.id, reviewId),
          eq(mediaStudioStoryboardReviews.userId, input.userId)
        )
      )
      .returning({ id: mediaStudioStoryboardReviews.id });
    if (!updated) reviewId = null;
  }
  if (!reviewId) {
    const [created] = await db
      .insert(mediaStudioStoryboardReviews)
      .values({
        userId: input.userId,
        name: project.title,
        reviewData,
        clipCount: projection.tasks.length,
        completedClipCount: 0,
        status: "active",
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: mediaStudioStoryboardReviews.id });
    reviewId = created.id;
  }
  await db
    .update(storyboardSkillProjects)
    .set({ reviewId, updatedAt: now })
    .where(eq(storyboardSkillProjects.id, project.id));
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
  return db.transaction(async tx => {
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
      .limit(1);
    if (!project) throw new Error("Storyboard project not found");

    let runStatus: string | undefined;
    if (project.activeRunId) {
      const [run] = await tx
        .select({
          id: storyboardSkillRuns.id,
          status: storyboardSkillRuns.status,
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
        .limit(1);
      if (run && !isTerminalStoryboardRunStatus(run.status)) {
        runStatus =
          run.status === "awaiting_confirmation"
            ? "cancelled"
            : "cancel_requested";
        await tx
          .update(storyboardSkillRuns)
          .set({ status: runStatus, updatedAt: new Date() })
          .where(eq(storyboardSkillRuns.id, run.id));
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
      .where(eq(storyboardSkillProjects.id, project.id))
      .returning({ id: storyboardSkillProjects.id });
    return { ...row, runStatus };
  });
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
      thumbnailUrl: mediaAssets.thumbnailUrl,
      originalUrl: mediaAssets.originalUrl,
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
  const portraitByCharacter = new Map(
    portraitRows.map(row => [row.characterId, row])
  );
  const withPortraits = characters.map(character => ({
    ...character,
    portraitAssetId: portraitByCharacter.get(character.id)?.mediaAssetId ?? null,
    portraitUrl:
      portraitByCharacter.get(character.id)?.thumbnailUrl ??
      portraitByCharacter.get(character.id)?.originalUrl ??
      null,
  }));
  if (!input.projectId) return withPortraits;
  const bindings = await db
    .select({ characterId: storyboardSkillProjectCharacters.characterId })
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
        thumbnailUrl: mediaAssets.thumbnailUrl,
        originalUrl: mediaAssets.originalUrl,
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
      .orderBy(desc(verticalDramaCharacterAssets.approved), desc(verticalDramaCharacterAssets.updatedAt)),
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
          portraitUrl: portrait?.thumbnailUrl ?? portrait?.originalUrl ?? null,
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

  return db.transaction(async tx => {
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
        thumbnailUrl: mediaAssets.thumbnailUrl,
        originalUrl: mediaAssets.originalUrl,
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
          thumbnailUrl: mediaAssets.thumbnailUrl,
          originalUrl: mediaAssets.originalUrl,
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
        .orderBy(desc(characterLibraryAssets.revision), desc(characterLibraryAssets.createdAt))
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
        portraitAssetId: resolvedPortrait?.mediaAssetId != null ? String(resolvedPortrait.mediaAssetId) : null,
        portraitUrl: resolvedPortrait?.thumbnailUrl ?? resolvedPortrait?.originalUrl ?? null,
        source: { seriesId: String(source.seriesId), characterId: String(source.characterId) },
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
      portraitAssetId: portrait?.mediaAssetId != null ? String(portrait.mediaAssetId) : null,
      portraitUrl: portrait?.thumbnailUrl ?? portrait?.originalUrl ?? null,
      source: { seriesId: String(source.seriesId), characterId: String(source.characterId) },
      idempotent: false,
    };
  });
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
  const [character] = await db
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
    .limit(1);
  if (!character) throw new Error("Character not found");
  const [latest] = await db
    .select()
    .from(characterLibraryRevisions)
    .where(eq(characterLibraryRevisions.characterId, character.id))
    .orderBy(desc(characterLibraryRevisions.revision))
    .limit(1);
  const nextRevision = character.currentRevision + 1;
  const profileJson = latest?.profileJson ?? {};
  const skillSnapshot = latest?.skillSnapshot ?? {
    skillId: "cute_child_image_generator",
    version: "3.0.0",
  };
  await db.transaction(async tx => {
    await tx
      .update(characterLibraryCharacters)
      .set({ name, currentRevision: nextRevision, updatedAt: new Date() })
      .where(eq(characterLibraryCharacters.id, character.id));
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
  });
  return { id: character.id, name, revision: nextRevision };
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

async function updateDraftCharacterIds(input: {
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
  projectId: string;
  tenantId: string;
  userId: number;
  characterIds: string[];
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
    .limit(1);
  if (!run || run.status !== "awaiting_confirmation")
    throw new Error("Characters can only be changed before confirmation");
  const normalized = normalizeStoryboardGlobalInput({
    ...run.normalizedSnapshot,
    characterIds: input.characterIds,
  });
  const skill = getStoryboardSkillSchema(normalized.selectedSkillId);
  await input.db
    .update(storyboardSkillRuns)
    .set({
      normalizedSnapshot: normalized as unknown as Record<string, unknown>,
      confirmationFingerprint: buildStoryboardConfirmationFingerprint(
        normalized,
        skill
      ),
      updatedAt: new Date(),
    })
    .where(eq(storyboardSkillRuns.id, run.id));
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
  const [character] = await db
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
  if (input.lookId) {
    const [look] = await db
      .select({ id: characterLibraryLooks.id })
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
  }
  const current = await getStoryboardSkillProject({
    userId: input.userId,
    tenantId,
    projectId: input.projectId,
  });
  if (!current) throw new Error("Storyboard project not found");
  if (current.run && current.run.status !== "awaiting_confirmation")
    throw new Error("Characters can only be changed before confirmation");
  const [project] = await db
    .select({ id: storyboardSkillProjects.id })
    .from(storyboardSkillProjects)
    .where(
      and(
        eq(storyboardSkillProjects.id, input.projectId),
        eq(storyboardSkillProjects.tenantId, tenantId),
        eq(storyboardSkillProjects.userId, input.userId)
      )
    )
    .limit(1);
  if (!project) throw new Error("Storyboard project not found");
  const [existing] = await db
    .select({ id: storyboardSkillProjectCharacters.id })
    .from(storyboardSkillProjectCharacters)
    .where(
      and(
        eq(storyboardSkillProjectCharacters.projectId, input.projectId),
        eq(storyboardSkillProjectCharacters.characterId, character.id),
        eq(storyboardSkillProjectCharacters.tenantId, tenantId)
      )
    )
    .limit(1);
  if (existing) return { ...existing, idempotent: true };
  const [revision] = await db
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
  await db.insert(storyboardSkillProjectCharacters).values({
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
    },
    lookId: input.lookId,
  });
  const currentIds = current?.run
    ? normalizeStoryboardGlobalInput(current.run.normalizedSnapshot)
        .characterIds
    : [];
  await updateDraftCharacterIds({
    db,
    projectId: input.projectId,
    tenantId,
    userId: input.userId,
    characterIds: [...new Set([...currentIds, character.id])],
  });
  return {
    projectId: input.projectId,
    characterId: character.id,
    idempotent: false,
  };
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
  const current = await getStoryboardSkillProject({
    userId: input.userId,
    tenantId,
    projectId: input.projectId,
  });
  if (!current) throw new Error("Storyboard project not found");
  const [binding] = await db
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
  if (!binding)
    return {
      projectId: input.projectId,
      characterId: input.characterId,
      removed: false,
    };
  await updateDraftCharacterIds({
    db,
    projectId: input.projectId,
    tenantId,
    userId: input.userId,
    characterIds: current.run
      ? normalizeStoryboardGlobalInput(
          current.run.normalizedSnapshot
        ).characterIds.filter(id => id !== input.characterId)
      : [],
  });
  const [removed] = await db
    .delete(storyboardSkillProjectCharacters)
    .where(
      and(
        eq(storyboardSkillProjectCharacters.projectId, input.projectId),
        eq(storyboardSkillProjectCharacters.characterId, input.characterId),
        eq(storyboardSkillProjectCharacters.tenantId, tenantId)
      )
    )
    .returning({ id: storyboardSkillProjectCharacters.id });
  return {
    projectId: input.projectId,
    characterId: input.characterId,
    removed: Boolean(removed),
  };
}
