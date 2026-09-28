/**
 * Marketplace text-plan review gate (planning/marketplace-storyboard-text-
 * gate) — MANDATORY for every Auto Review run, no opt-out. After
 * `prompt_plan` completes and BEFORE `image_generation` reserves any image
 * credit, the run holds in `awaiting_plan_review` until the user approves
 * the text plan or requests an AI redraft.
 *
 * Covers:
 *  - `marketplaceAutoReviewPlanReviewGateStageUpsertInputForTest` — the pure
 *    stage-upsert-input builder (exact `statusDetail`/`stageCompletionEvidence`
 *    shape the frontend + `advanceMarketplaceAutoReviewRun` both key off of).
 *  - `redraftNotesDirectiveForTest` — the "ให้ AI ร่างใหม่" notes directive.
 *  - `advanceMarketplaceAutoReviewRun` (real, unmocked, DB-backed) — repeated
 *    advancement ticks on a held run never advance past the gate and never
 *    write anything (proves (a)/(b): zero-credit + idempotent-across-ticks
 *    by construction, reusing the EXISTING generic blocked-stage short-
 *    circuit with zero new branches there).
 *  - `approveMarketplaceAutoReviewPlanReview` — releases the hold (DB-backed).
 *  - `requestMarketplaceAutoReviewPlanRedraft` — precondition guard (DB-
 *    backed; the full LLM re-authoring path is intentionally NOT exercised
 *    with a live/mocked gateway here — see the file-level convention note in
 *    marketplaceAutoReview.evidenceGuard.test.ts, "service tests exercise
 *    exported ...ForTest helpers (no DB, pure fixtures)"; the concept_story/
 *    prompt_plan re-authoring call chain (`runMarketplaceMediaProductionAgent`)
 *    is a same-file private function, not mockable via `vi.mock`, exactly
 *    like `startMarketplaceAutoReviewRun`'s own concept-authoring path, which
 *    no existing test in this file exercises end-to-end either).
 *  - `updateMarketplaceAutoReviewPlanShotDialogue` (DB-backed) — inline
 *    per-shot dialogue correction while the gate holds: edits
 *    `sequentialStoryboard.shots[shotId-1].dialogue` in place, stamps the
 *    `planReview.editedShots[shotId]` breadcrumb, leaves every other shot
 *    byte-identical, rejects once `planReview` is no longer `"awaiting"`,
 *    rejects a shotId beyond the authored pack length, and rejects a
 *    non-sequential run (no `sequentialStoryboard.shots` at all). A
 *    companion `approveMarketplaceAutoReviewPlanReview` test proves an edit
 *    survives approval untouched (approve only ever releases the hold).
 *  - Structural wiring proof (grep-guard, mirrors
 *    marketplaceAutoReview.sequentialGate.test.ts's own technique) that both
 *    `startMarketplaceAutoReviewRun` and `requestMarketplaceAutoReviewPlanRedraft`
 *    call the shared hold helper, and that `advanceMarketplaceAutoReviewRun`
 *    itself is untouched (still the same generic blocked-stage short-circuit
 *    the gate rides on).
 */
import fs from "fs";
import path from "path";
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../db", () => ({ getDb: vi.fn() }));

import { getDb } from "../../db";
import {
  marketplaceAutoReviewRuns,
  marketplaceAutoReviewStages,
} from "../../../drizzle/schema";
import {
  advanceMarketplaceAutoReviewRun,
  approveMarketplaceAutoReviewPlanReview,
  marketplaceAutoReviewPlanReviewGateStageUpsertInputForTest,
  redraftNotesDirectiveForTest,
  requestMarketplaceAutoReviewPlanRedraft,
  updateMarketplaceAutoReviewPlanShotDialogue,
} from "../marketplaceAutoReviewService";

const mockGetDb = vi.mocked(getDb);

beforeEach(() => {
  vi.clearAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Fixtures (copied locally, not shared with sibling test files — matches     */
/* this service's own section-08 test convention)                            */
/* -------------------------------------------------------------------------- */

function baseRunFixture(overrides: Record<string, unknown> = {}): any {
  return {
    id: "mar_1",
    tenantId: "tenant_1",
    userId: 7,
    productId: "mp_1",
    productionRunId: "prod_1",
    outputMode: "storyboard_images",
    frameStrategy: "storyboard_3x3_split",
    status: "running",
    currentStage: "image_generation",
    stageIndex: 5,
    stageCount: 6,
    selectedConceptId: "concept-1",
    storyboardReviewId: null,
    videoEditorProjectId: null,
    renderJobId: null,
    resultLibraryItemId: null,
    resultJson: {},
    metadataJson: {},
    errorMessage: null,
    idempotencyKey: "marketplace-auto-review:test",
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    completedAt: null,
    ...overrides,
  };
}

/** The `image_generation` stage row while the gate is holding — exactly what
 *  `holdMarketplaceAutoReviewRunAtImageGeneration` persists. */
function awaitingPlanReviewStageFixture(
  overrides: Record<string, unknown> = {}
): any {
  const { output, stageCompletionEvidence } =
    marketplaceAutoReviewPlanReviewGateStageUpsertInputForTest("mar_1");
  return {
    id: 1,
    runId: "mar_1",
    stageKey: "image_generation",
    stageOrder: 5,
    status: "blocked_needs_user",
    providerTaskIdsJson: [],
    outputJson: {
      ...output,
      completionEvidenceId: `stage-evidence:mar_1:image_generation:test`,
      completionEvidence: { ...stageCompletionEvidence, evidenceId: "x" },
    },
    errorMessage: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    ...overrides,
  };
}

function awaitingPlanReviewMetadataFixture(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    concept: { conceptId: "concept-1", shots: [] },
    planReview: {
      required: true,
      status: "awaiting",
      heldAt: "2026-07-23T00:00:00.000Z",
      redraftCount: 0,
      lastNotes: null,
    },
    ...overrides,
  };
}

/** One `sequentialStoryboard.shots[]` pack entry — copied locally (not
 *  imported from marketplaceAutoReview.sequentialShotRegen.test.ts), per
 *  this service's own section-08 test convention. Field shape matches
 *  `SequentialStoryboardShot` in productReviewSequentialStoryboardSkillRunner.ts. */
function makeSequentialShot(
  shotId: number,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    shot_id: shotId,
    purpose: `beat_${shotId}`,
    duration_seconds: 5,
    demonstration_type: "usage_demo",
    depicts_minor: false,
    guardian_required: false,
    transition_from_previous: "",
    visual_summary: `shot ${shotId} visual summary`,
    dialogue: `บทพูดช็อตที่ ${shotId}`,
    estimated_speech_seconds: 1,
    start_frame_image_prompt: `Clean generic product shot for shot ${shotId}.`,
    image_prompt_character_count: 40,
    video_prompt: `Shot ${shotId} video action.`,
    video_prompt_character_count: 20,
    claim_trace: [],
    qc: {},
    ...overrides,
  };
}

/** `awaitingPlanReviewMetadataFixture` plus a complete 9-shot sequential
 *  pack — the shape `updateMarketplaceAutoReviewPlanShotDialogue` requires. */
function sequentialAwaitingPlanReviewMetadataFixture(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return awaitingPlanReviewMetadataFixture({
    sequentialStoryboard: {
      shots: Array.from({ length: 9 }, (_, i) => makeSequentialShot(i + 1)),
    },
    ...overrides,
  });
}

/** Mock covering the query shapes this gate's code paths issue:
 *  `.where().limit()` on the runs table (reloadRun), `.where().limit()` on
 *  the stages table (the gate's own `image_generation` row lookup AND
 *  `advanceMarketplaceAutoReviewRun`'s blocked-stage lookup — both are
 *  single-row `.limit()` queries), `.where().orderBy()` on the stages table
 *  (the full stage list — `getMarketplaceAutoReviewRun`'s trailing re-fetch),
 *  `update().set()` on the runs table, and `insert().values().onConflictDo
 *  Update()` on the stages table (`upsertRunStage`). `update`/`onConflictDo
 *  Update` mutate `params.run`/`params.imageGenerationStage` in place so a
 *  later `.select()` in the SAME test observes the write (same technique as
 *  marketplaceAutoReview.sequentialShotAlternates.test.ts's `buildDbMock`). */
function buildDbMock(params: {
  run: Record<string, unknown>;
  imageGenerationStage?: Record<string, unknown> | null;
  stages?: Record<string, unknown>[];
  updateRunSpy?: (setObj: Record<string, unknown>) => void;
  upsertStageSpy?: (input: {
    values: Record<string, unknown>;
    set: Record<string, unknown>;
  }) => void;
}) {
  return {
    select: (_cols?: unknown) => ({
      from: (table: unknown) => ({
        where: (..._args: unknown[]) => ({
          limit: async () => {
            if (table === marketplaceAutoReviewRuns) return [params.run];
            if (table === marketplaceAutoReviewStages) {
              return params.imageGenerationStage
                ? [params.imageGenerationStage]
                : [];
            }
            return [];
          },
          orderBy: async () => {
            if (table === marketplaceAutoReviewStages)
              return params.stages ?? [];
            return [];
          },
        }),
      }),
    }),
    update: (table: unknown) => ({
      set: (setObj: Record<string, unknown>) => {
        if (table === marketplaceAutoReviewRuns) {
          params.updateRunSpy?.(setObj);
          params.run = { ...params.run, ...setObj };
        }
        return { where: () => ({ returning: async () => [params.run] }) };
      },
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => ({
        onConflictDoUpdate: async (opts: { set: Record<string, unknown> }) => {
          params.upsertStageSpy?.({ values, set: opts.set });
          if (table === marketplaceAutoReviewStages) {
            params.imageGenerationStage = {
              ...(params.imageGenerationStage ?? {}),
              ...values,
              ...opts.set,
            };
          }
          return undefined;
        },
      }),
    }),
  } as any;
}

const AUTH = { userId: 7, tenantId: "tenant_1" };

/* -------------------------------------------------------------------------- */
/* marketplaceAutoReviewPlanReviewGateStageUpsertInputForTest — pure          */
/* -------------------------------------------------------------------------- */

describe("marketplaceAutoReviewPlanReviewGateStageUpsertInputForTest", () => {
  it("returns the exact statusDetail shape the frontend and advanceMarketplaceAutoReviewRun key off of", () => {
    const { output, stageCompletionEvidence } =
      marketplaceAutoReviewPlanReviewGateStageUpsertInputForTest("mar_42");
    expect(output.statusDetail).toEqual({
      state: "awaiting_plan_review",
      severity: "blocked",
      stageKey: "image_generation",
      reasonCodes: ["mandatory_text_plan_review"],
      safeMessage:
        "ตรวจและยืนยันสตอรีบอร์ดข้อความก่อน ระบบจึงจะเริ่มสร้างภาพและตัดเครดิต",
      nextAction:
        'เปิดหน้าตรวจสตอรีบอร์ดข้อความ อ่าน storyboard/บทพูดให้ครบ แล้วกด "ยืนยัน สร้างภาพ" หรือ "ให้ AI ร่างใหม่"',
      userActionRequired: true,
      retryable: true,
    });
    expect(stageCompletionEvidence.status).toBe("user_blocked");
    expect(stageCompletionEvidence.artifactRefs).toEqual(["run:mar_42"]);
  });
});

describe("redraftNotesDirectiveForTest", () => {
  it("returns '' for empty/whitespace/undefined notes (no-op for an ordinary first pass)", () => {
    expect(redraftNotesDirectiveForTest(undefined)).toBe("");
    expect(redraftNotesDirectiveForTest(null)).toBe("");
    expect(redraftNotesDirectiveForTest("   ")).toBe("");
  });

  it("wraps real notes as a high-priority correction directive", () => {
    const directive = redraftNotesDirectiveForTest(
      "วัสดุเป็นพลาสติก ไม่ใช่ผ้า"
    );
    expect(directive).toContain("USER REDRAFT CORRECTION NOTES");
    expect(directive).toContain("วัสดุเป็นพลาสติก ไม่ใช่ผ้า");
    expect(directive).toContain("HIGHEST-PRIORITY correction");
  });
});

/* -------------------------------------------------------------------------- */
/* advanceMarketplaceAutoReviewRun — the hold, exercised for real             */
/* -------------------------------------------------------------------------- */

describe("advanceMarketplaceAutoReviewRun while awaiting_plan_review", () => {
  it("does not advance, and performs zero writes (no image credit reservation reached)", async () => {
    const run = baseRunFixture({
      metadataJson: awaitingPlanReviewMetadataFixture(),
    });
    const imageGenerationStage = awaitingPlanReviewStageFixture();
    const updateRunSpy = vi.fn();
    const upsertStageSpy = vi.fn();
    mockGetDb.mockResolvedValue(
      buildDbMock({
        run,
        imageGenerationStage,
        stages: [imageGenerationStage],
        updateRunSpy,
        upsertStageSpy,
      })
    );

    const result = await advanceMarketplaceAutoReviewRun("mar_1", AUTH);

    expect(updateRunSpy).not.toHaveBeenCalled();
    expect(upsertStageSpy).not.toHaveBeenCalled();
    expect((result as any).status).toBe("running");
    expect((result as any).currentStage).toBe("image_generation");
  });

  it("repeated advancement ticks stay held every time (idempotent) and never write", async () => {
    const run = baseRunFixture({
      metadataJson: awaitingPlanReviewMetadataFixture(),
    });
    const imageGenerationStage = awaitingPlanReviewStageFixture();
    const updateRunSpy = vi.fn();
    const upsertStageSpy = vi.fn();
    mockGetDb.mockResolvedValue(
      buildDbMock({
        run,
        imageGenerationStage,
        stages: [imageGenerationStage],
        updateRunSpy,
        upsertStageSpy,
      })
    );

    for (let tick = 0; tick < 5; tick += 1) {
      // eslint-disable-next-line no-await-in-loop
      await advanceMarketplaceAutoReviewRun("mar_1", AUTH);
    }

    expect(updateRunSpy).not.toHaveBeenCalled();
    expect(upsertStageSpy).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* approveMarketplaceAutoReviewPlanReview                                     */
/* -------------------------------------------------------------------------- */

describe("approveMarketplaceAutoReviewPlanReview", () => {
  it("releases the hold: resets image_generation to queued and marks planReview approved, with a single lean metadata write", async () => {
    const run = baseRunFixture({
      metadataJson: awaitingPlanReviewMetadataFixture(),
    });
    const imageGenerationStage = awaitingPlanReviewStageFixture();
    const updateRunSpy = vi.fn();
    const upsertStageSpy = vi.fn();
    mockGetDb.mockResolvedValue(
      buildDbMock({
        run,
        imageGenerationStage,
        stages: [imageGenerationStage],
        updateRunSpy,
        upsertStageSpy,
      })
    );

    const result = await approveMarketplaceAutoReviewPlanReview(
      { runId: "mar_1" },
      AUTH
    );

    expect(upsertStageSpy).toHaveBeenCalledTimes(1);
    const [{ set: stageSet }] = upsertStageSpy.mock.calls[0] as [
      { values: Record<string, any>; set: Record<string, any> },
    ];
    expect(stageSet.status).toBe("queued");
    // Zero extra credit cost: releasing the hold must not stamp any credit
    // or provider-task field onto the stage row.
    expect(stageSet.outputJson).toEqual({});

    expect(updateRunSpy).toHaveBeenCalledTimes(1);
    const [runSet] = updateRunSpy.mock.calls[0] as [Record<string, any>];
    expect(Object.keys(runSet).sort()).toEqual(
      ["errorMessage", "metadataJson", "updatedAt"].sort()
    );
    expect(runSet.metadataJson.planReview).toMatchObject({
      required: true,
      status: "approved",
    });
    expect(runSet.metadataJson.planReview.approvedAt).toEqual(
      expect.any(String)
    );

    expect((result as any).metadataJson.planReview.status).toBe("approved");
  });

  it("throws BAD_REQUEST and performs zero writes when the run is not awaiting review", async () => {
    const run = baseRunFixture({
      metadataJson: { planReview: { required: true, status: "approved" } },
    });
    const completedImageGenerationStage = awaitingPlanReviewStageFixture({
      status: "completed",
      outputJson: { statusDetail: { state: "completed" } },
    });
    const updateRunSpy = vi.fn();
    const upsertStageSpy = vi.fn();
    mockGetDb.mockResolvedValue(
      buildDbMock({
        run,
        imageGenerationStage: completedImageGenerationStage,
        updateRunSpy,
        upsertStageSpy,
      })
    );

    await expect(
      approveMarketplaceAutoReviewPlanReview({ runId: "mar_1" }, AUTH)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(updateRunSpy).not.toHaveBeenCalled();
    expect(upsertStageSpy).not.toHaveBeenCalled();
  });

  it("throws BAD_REQUEST when metadata.planReview says awaiting but the stage row disagrees (drift fails closed)", async () => {
    const run = baseRunFixture({
      metadataJson: awaitingPlanReviewMetadataFixture(),
    });
    const updateRunSpy = vi.fn();
    const upsertStageSpy = vi.fn();
    mockGetDb.mockResolvedValue(
      buildDbMock({
        run,
        imageGenerationStage: null,
        updateRunSpy,
        upsertStageSpy,
      })
    );

    await expect(
      approveMarketplaceAutoReviewPlanReview({ runId: "mar_1" }, AUTH)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(updateRunSpy).not.toHaveBeenCalled();
    expect(upsertStageSpy).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when the run does not belong to this user/tenant; no write happens", async () => {
    const updateRunSpy = vi.fn();
    mockGetDb.mockResolvedValue({
      select: () => ({
        from: () => ({
          where: () => ({ limit: async () => [], orderBy: async () => [] }),
        }),
      }),
      update: () => ({
        set: (setObj: Record<string, unknown>) => {
          updateRunSpy(setObj);
          return { where: () => ({ returning: async () => [] }) };
        },
      }),
    } as any);

    await expect(
      approveMarketplaceAutoReviewPlanReview({ runId: "mar_missing" }, AUTH)
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(updateRunSpy).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* approveMarketplaceAutoReviewPlanReview content gate (degraded pack /       */
/* zero-dialogue pack) — field evidence                                      */
/* mar_76cb03fe0f29a20ec6422480f5a6840b, 2026-07-24                           */
/* -------------------------------------------------------------------------- */

describe("approveMarketplaceAutoReviewPlanReview content gate", () => {
  it("throws BAD_REQUEST and performs zero writes when sequentialStoryboard.degraded is true", async () => {
    const metadata = sequentialAwaitingPlanReviewMetadataFixture({
      sequentialStoryboard: {
        degraded: true,
        skillVersion: "1.0.0",
        shots: Array.from({ length: 9 }, (_, i) =>
          makeSequentialShot(i + 1, { dialogue: "" })
        ),
      },
    });
    const run = baseRunFixture({ metadataJson: metadata });
    const imageGenerationStage = awaitingPlanReviewStageFixture();
    const updateRunSpy = vi.fn();
    const upsertStageSpy = vi.fn();
    mockGetDb.mockResolvedValue(
      buildDbMock({
        run,
        imageGenerationStage,
        stages: [imageGenerationStage],
        updateRunSpy,
        upsertStageSpy,
      })
    );

    await expect(
      approveMarketplaceAutoReviewPlanReview({ runId: "mar_1" }, AUTH)
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining('ให้ AI ร่างใหม่'),
    });
    expect(updateRunSpy).not.toHaveBeenCalled();
    expect(upsertStageSpy).not.toHaveBeenCalled();
  });

  // 2026-07-24 field follow-up (mar_76cb03fe0f29a20ec6422480f5a6840b): a
  // FAILED draft (every authoring round died structurally) now holds with
  // `draftFailure` set and ZERO shots — the pre-existing `shots.length === 0
  // -> return null` early return (meant for a non-sequential run) must never
  // let this slip through and approve into image credits.
  it("throws BAD_REQUEST and performs zero writes when sequentialStoryboard.draftFailure is set with zero shots (a failed draft, not a 'no sequential pack' no-op)", async () => {
    const metadata = awaitingPlanReviewMetadataFixture({
      sequentialStoryboard: {
        degraded: true,
        degradedRetryHistory: [
          {
            round: 1,
            status: "invocation_failed",
            error: "invocation_failed: https://openrouter.ai/keys detail",
          },
        ],
        draftFailure: {
          reasonCode: "model_bad_output",
          failedAt: "2026-07-24T00:00:00.000Z",
          roundsAttempted: 1,
        },
      },
    });
    expect(
      (metadata as any).sequentialStoryboard.shots
    ).toBeUndefined();
    const run = baseRunFixture({ metadataJson: metadata });
    const imageGenerationStage = awaitingPlanReviewStageFixture();
    const updateRunSpy = vi.fn();
    const upsertStageSpy = vi.fn();
    mockGetDb.mockResolvedValue(
      buildDbMock({
        run,
        imageGenerationStage,
        stages: [imageGenerationStage],
        updateRunSpy,
        upsertStageSpy,
      })
    );

    await expect(
      approveMarketplaceAutoReviewPlanReview({ runId: "mar_1" }, AUTH)
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining('ให้ AI ร่างใหม่'),
    });
    expect(updateRunSpy).not.toHaveBeenCalled();
    expect(upsertStageSpy).not.toHaveBeenCalled();
  });

  it('throws BAD_REQUEST when skillVersion contains "degraded" even without an explicit degraded flag (mirrors the client\'s isAutoReviewPlanReviewDegradedPlan OR condition)', async () => {
    const metadata = sequentialAwaitingPlanReviewMetadataFixture({
      sequentialStoryboard: {
        skillVersion: "1.0.0-degraded",
        shots: Array.from({ length: 9 }, (_, i) => makeSequentialShot(i + 1)),
      },
    });
    const run = baseRunFixture({ metadataJson: metadata });
    const imageGenerationStage = awaitingPlanReviewStageFixture();
    const updateRunSpy = vi.fn();
    const upsertStageSpy = vi.fn();
    mockGetDb.mockResolvedValue(
      buildDbMock({
        run,
        imageGenerationStage,
        stages: [imageGenerationStage],
        updateRunSpy,
        upsertStageSpy,
      })
    );

    await expect(
      approveMarketplaceAutoReviewPlanReview({ runId: "mar_1" }, AUTH)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(updateRunSpy).not.toHaveBeenCalled();
    expect(upsertStageSpy).not.toHaveBeenCalled();
  });

  it("throws BAD_REQUEST when the pack has dialogue on zero shots and the run's resolved audio strategy is not silent, and never echoes raw provider error text", async () => {
    const metadata = sequentialAwaitingPlanReviewMetadataFixture({
      resolvedAudioStrategy: "native_video_audio",
      sequentialStoryboard: {
        shots: Array.from({ length: 9 }, (_, i) =>
          makeSequentialShot(i + 1, { dialogue: "" })
        ),
      },
      // A real stored error would contain an openrouter.ai key-management
      // URL (field evidence) — proves the rejection message never echoes it.
      errorMessage: "invocation_failed: https://openrouter.ai/keys detail",
    });
    const run = baseRunFixture({ metadataJson: metadata });
    const imageGenerationStage = awaitingPlanReviewStageFixture();
    const updateRunSpy = vi.fn();
    const upsertStageSpy = vi.fn();
    mockGetDb.mockResolvedValue(
      buildDbMock({
        run,
        imageGenerationStage,
        stages: [imageGenerationStage],
        updateRunSpy,
        upsertStageSpy,
      })
    );

    await expect(
      approveMarketplaceAutoReviewPlanReview({ runId: "mar_1" }, AUTH)
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.not.stringContaining("openrouter"),
    });
    expect(updateRunSpy).not.toHaveBeenCalled();
    expect(upsertStageSpy).not.toHaveBeenCalled();
  });

  it("throws BAD_REQUEST when the pack has dialogue on zero shots (whitespace-only) and resolvedAudioStrategy is absent (defaults to non-silent, fails closed)", async () => {
    const metadata = sequentialAwaitingPlanReviewMetadataFixture({
      sequentialStoryboard: {
        shots: Array.from({ length: 9 }, (_, i) =>
          makeSequentialShot(i + 1, { dialogue: "   " })
        ),
      },
    });
    const run = baseRunFixture({ metadataJson: metadata });
    const imageGenerationStage = awaitingPlanReviewStageFixture();
    const updateRunSpy = vi.fn();
    const upsertStageSpy = vi.fn();
    mockGetDb.mockResolvedValue(
      buildDbMock({
        run,
        imageGenerationStage,
        stages: [imageGenerationStage],
        updateRunSpy,
        upsertStageSpy,
      })
    );

    await expect(
      approveMarketplaceAutoReviewPlanReview({ runId: "mar_1" }, AUTH)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(updateRunSpy).not.toHaveBeenCalled();
    expect(upsertStageSpy).not.toHaveBeenCalled();
  });

  it("approves normally when the pack has dialogue on zero shots but the run's resolved audio strategy is silent", async () => {
    const metadata = sequentialAwaitingPlanReviewMetadataFixture({
      resolvedAudioStrategy: "silent",
      sequentialStoryboard: {
        shots: Array.from({ length: 9 }, (_, i) =>
          makeSequentialShot(i + 1, { dialogue: "" })
        ),
      },
    });
    const run = baseRunFixture({ metadataJson: metadata });
    const imageGenerationStage = awaitingPlanReviewStageFixture();
    const updateRunSpy = vi.fn();
    const upsertStageSpy = vi.fn();
    mockGetDb.mockResolvedValue(
      buildDbMock({
        run,
        imageGenerationStage,
        stages: [imageGenerationStage],
        updateRunSpy,
        upsertStageSpy,
      })
    );

    const result = await approveMarketplaceAutoReviewPlanReview(
      { runId: "mar_1" },
      AUTH
    );

    expect(upsertStageSpy).toHaveBeenCalledTimes(1);
    expect(updateRunSpy).toHaveBeenCalledTimes(1);
    expect((result as any).metadataJson.planReview.status).toBe("approved");
  });

  it("approves normally for a healthy (non-degraded) sequential pack with dialogue present on every shot", async () => {
    const metadata = sequentialAwaitingPlanReviewMetadataFixture();
    const run = baseRunFixture({ metadataJson: metadata });
    const imageGenerationStage = awaitingPlanReviewStageFixture();
    const updateRunSpy = vi.fn();
    const upsertStageSpy = vi.fn();
    mockGetDb.mockResolvedValue(
      buildDbMock({
        run,
        imageGenerationStage,
        stages: [imageGenerationStage],
        updateRunSpy,
        upsertStageSpy,
      })
    );

    const result = await approveMarketplaceAutoReviewPlanReview(
      { runId: "mar_1" },
      AUTH
    );

    expect(upsertStageSpy).toHaveBeenCalledTimes(1);
    expect(updateRunSpy).toHaveBeenCalledTimes(1);
    expect((result as any).metadataJson.planReview.status).toBe("approved");
  });

  it("approves normally for a non-sequential run with no sequentialStoryboard.shots at all (3x3/video_shot_start_stop runs are untouched by this content gate)", async () => {
    const metadata = awaitingPlanReviewMetadataFixture();
    expect((metadata as any).sequentialStoryboard).toBeUndefined();
    const run = baseRunFixture({ metadataJson: metadata });
    const imageGenerationStage = awaitingPlanReviewStageFixture();
    const updateRunSpy = vi.fn();
    const upsertStageSpy = vi.fn();
    mockGetDb.mockResolvedValue(
      buildDbMock({
        run,
        imageGenerationStage,
        stages: [imageGenerationStage],
        updateRunSpy,
        upsertStageSpy,
      })
    );

    const result = await approveMarketplaceAutoReviewPlanReview(
      { runId: "mar_1" },
      AUTH
    );

    expect(upsertStageSpy).toHaveBeenCalledTimes(1);
    expect(updateRunSpy).toHaveBeenCalledTimes(1);
    expect((result as any).metadataJson.planReview.status).toBe("approved");
  });
});

/* -------------------------------------------------------------------------- */
/* requestMarketplaceAutoReviewPlanRedraft — precondition guard               */
/* -------------------------------------------------------------------------- */

describe("requestMarketplaceAutoReviewPlanRedraft precondition guard", () => {
  it("throws BAD_REQUEST and re-authors nothing when the run is not awaiting review (zero image AND zero text-authoring writes)", async () => {
    const run = baseRunFixture({
      metadataJson: { planReview: { required: true, status: "approved" } },
    });
    const completedImageGenerationStage = awaitingPlanReviewStageFixture({
      status: "completed",
      outputJson: { statusDetail: { state: "completed" } },
    });
    const updateRunSpy = vi.fn();
    const upsertStageSpy = vi.fn();
    mockGetDb.mockResolvedValue(
      buildDbMock({
        run,
        imageGenerationStage: completedImageGenerationStage,
        updateRunSpy,
        upsertStageSpy,
      })
    );

    await expect(
      requestMarketplaceAutoReviewPlanRedraft(
        { runId: "mar_1", notes: "ผิด" },
        AUTH
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(updateRunSpy).not.toHaveBeenCalled();
    expect(upsertStageSpy).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when the run does not belong to this user/tenant; no write happens", async () => {
    mockGetDb.mockResolvedValue({
      select: () => ({
        from: () => ({
          where: () => ({ limit: async () => [], orderBy: async () => [] }),
        }),
      }),
      update: () => ({
        set: () => ({ where: () => ({ returning: async () => [] }) }),
      }),
    } as any);

    await expect(
      requestMarketplaceAutoReviewPlanRedraft({ runId: "mar_missing" }, AUTH)
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

/* -------------------------------------------------------------------------- */
/* updateMarketplaceAutoReviewPlanShotDialogue                                */
/* -------------------------------------------------------------------------- */

describe("updateMarketplaceAutoReviewPlanShotDialogue", () => {
  it("edits shot 4's dialogue while awaiting review, stamps the editedShots breadcrumb, and leaves every other shot byte-identical (single lean metadata write)", async () => {
    const metadata = sequentialAwaitingPlanReviewMetadataFixture();
    const run = baseRunFixture({ metadataJson: metadata });
    const imageGenerationStage = awaitingPlanReviewStageFixture();
    const updateRunSpy = vi.fn();
    const upsertStageSpy = vi.fn();
    mockGetDb.mockResolvedValue(
      buildDbMock({
        run,
        imageGenerationStage,
        stages: [imageGenerationStage],
        updateRunSpy,
        upsertStageSpy,
      })
    );

    const result = await updateMarketplaceAutoReviewPlanShotDialogue(
      { runId: "mar_1", shotId: 4, dialogue: "  บทพูดใหม่ช็อต 4  " },
      AUTH
    );

    // Zero stage writes: this never touches image_generation.
    expect(upsertStageSpy).not.toHaveBeenCalled();

    expect(updateRunSpy).toHaveBeenCalledTimes(1);
    const [runSet] = updateRunSpy.mock.calls[0] as [Record<string, any>];
    expect(Object.keys(runSet).sort()).toEqual(
      ["metadataJson", "updatedAt"].sort()
    );

    const nextShots = runSet.metadataJson.sequentialStoryboard.shots;
    // Trimmed at the service boundary even though this test bypasses the
    // router's own `.trim()`.
    expect(nextShots[3].dialogue).toBe("บทพูดใหม่ช็อต 4");
    const originalShots = (metadata.sequentialStoryboard as any).shots;
    for (const i of [0, 1, 2, 4, 5, 6, 7, 8]) {
      expect(nextShots[i]).toEqual(originalShots[i]);
    }

    expect(runSet.metadataJson.planReview.editedShots).toEqual({
      "4": { editedAt: expect.any(String) },
    });
    // An edit never flips planReview.status by itself.
    expect(runSet.metadataJson.planReview.status).toBe("awaiting");

    expect(
      (result as any).metadataJson.sequentialStoryboard.shots[3].dialogue
    ).toBe("บทพูดใหม่ช็อต 4");
  });

  it("accepts an empty dialogue string to silence a shot", async () => {
    const metadata = sequentialAwaitingPlanReviewMetadataFixture();
    const run = baseRunFixture({ metadataJson: metadata });
    const imageGenerationStage = awaitingPlanReviewStageFixture();
    const updateRunSpy = vi.fn();
    mockGetDb.mockResolvedValue(
      buildDbMock({
        run,
        imageGenerationStage,
        stages: [imageGenerationStage],
        updateRunSpy,
      })
    );

    await updateMarketplaceAutoReviewPlanShotDialogue(
      { runId: "mar_1", shotId: 2, dialogue: "   " },
      AUTH
    );

    const [runSet] = updateRunSpy.mock.calls[0] as [Record<string, any>];
    expect(runSet.metadataJson.sequentialStoryboard.shots[1].dialogue).toBe(
      ""
    );
  });

  it("preserves an EXISTING editedShots breadcrumb for a different shot (additive, not a replace)", async () => {
    const metadata = sequentialAwaitingPlanReviewMetadataFixture({
      planReview: {
        required: true,
        status: "awaiting",
        heldAt: "2026-07-23T00:00:00.000Z",
        redraftCount: 0,
        lastNotes: null,
        editedShots: { "2": { editedAt: "2026-07-23T00:01:00.000Z" } },
      },
    });
    const run = baseRunFixture({ metadataJson: metadata });
    const imageGenerationStage = awaitingPlanReviewStageFixture();
    const updateRunSpy = vi.fn();
    mockGetDb.mockResolvedValue(
      buildDbMock({
        run,
        imageGenerationStage,
        stages: [imageGenerationStage],
        updateRunSpy,
      })
    );

    await updateMarketplaceAutoReviewPlanShotDialogue(
      { runId: "mar_1", shotId: 5, dialogue: "new line" },
      AUTH
    );

    const [runSet] = updateRunSpy.mock.calls[0] as [Record<string, any>];
    expect(runSet.metadataJson.planReview.editedShots).toEqual({
      "2": { editedAt: "2026-07-23T00:01:00.000Z" },
      "5": { editedAt: expect.any(String) },
    });
  });

  it("throws BAD_REQUEST and performs zero writes once the plan has already been approved", async () => {
    const metadata = sequentialAwaitingPlanReviewMetadataFixture({
      planReview: { required: true, status: "approved" },
    });
    const run = baseRunFixture({ metadataJson: metadata });
    const completedImageGenerationStage = awaitingPlanReviewStageFixture({
      status: "completed",
      outputJson: { statusDetail: { state: "completed" } },
    });
    const updateRunSpy = vi.fn();
    mockGetDb.mockResolvedValue(
      buildDbMock({
        run,
        imageGenerationStage: completedImageGenerationStage,
        updateRunSpy,
      })
    );

    await expect(
      updateMarketplaceAutoReviewPlanShotDialogue(
        { runId: "mar_1", shotId: 4, dialogue: "too late" },
        AUTH
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(updateRunSpy).not.toHaveBeenCalled();
  });

  it("throws BAD_REQUEST when metadata.planReview says awaiting but the stage row disagrees (drift fails closed)", async () => {
    const metadata = sequentialAwaitingPlanReviewMetadataFixture();
    const run = baseRunFixture({ metadataJson: metadata });
    const updateRunSpy = vi.fn();
    mockGetDb.mockResolvedValue(
      buildDbMock({ run, imageGenerationStage: null, updateRunSpy })
    );

    await expect(
      updateMarketplaceAutoReviewPlanShotDialogue(
        { runId: "mar_1", shotId: 1, dialogue: "x" },
        AUTH
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(updateRunSpy).not.toHaveBeenCalled();
  });

  it("throws BAD_REQUEST for a shotId beyond the authored pack length, and zero writes happen", async () => {
    const metadata = sequentialAwaitingPlanReviewMetadataFixture({
      sequentialStoryboard: {
        shots: Array.from({ length: 6 }, (_, i) => makeSequentialShot(i + 1)),
      },
    });
    const run = baseRunFixture({ metadataJson: metadata });
    const imageGenerationStage = awaitingPlanReviewStageFixture();
    const updateRunSpy = vi.fn();
    mockGetDb.mockResolvedValue(
      buildDbMock({
        run,
        imageGenerationStage,
        stages: [imageGenerationStage],
        updateRunSpy,
      })
    );

    await expect(
      updateMarketplaceAutoReviewPlanShotDialogue(
        { runId: "mar_1", shotId: 9, dialogue: "x" },
        AUTH
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(updateRunSpy).not.toHaveBeenCalled();
  });

  it("throws BAD_REQUEST for a non-sequential run (no sequentialStoryboard.shots at all)", async () => {
    const metadata = awaitingPlanReviewMetadataFixture();
    const run = baseRunFixture({ metadataJson: metadata });
    const imageGenerationStage = awaitingPlanReviewStageFixture();
    const updateRunSpy = vi.fn();
    mockGetDb.mockResolvedValue(
      buildDbMock({
        run,
        imageGenerationStage,
        stages: [imageGenerationStage],
        updateRunSpy,
      })
    );

    await expect(
      updateMarketplaceAutoReviewPlanShotDialogue(
        { runId: "mar_1", shotId: 1, dialogue: "x" },
        AUTH
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(updateRunSpy).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when the run does not belong to this user/tenant; no write happens", async () => {
    const updateRunSpy = vi.fn();
    mockGetDb.mockResolvedValue({
      select: () => ({
        from: () => ({
          where: () => ({ limit: async () => [], orderBy: async () => [] }),
        }),
      }),
      update: () => ({
        set: (setObj: Record<string, unknown>) => {
          updateRunSpy(setObj);
          return { where: () => ({ returning: async () => [] }) };
        },
      }),
    } as any);

    await expect(
      updateMarketplaceAutoReviewPlanShotDialogue(
        { runId: "mar_missing", shotId: 1, dialogue: "x" },
        AUTH
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(updateRunSpy).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* approveMarketplaceAutoReviewPlanReview must not re-author an edited shot   */
/* -------------------------------------------------------------------------- */

describe("approveMarketplaceAutoReviewPlanReview preserves a prior dialogue edit", () => {
  it("carries the edited dialogue and the editedShots breadcrumb through approval unchanged (approve only releases the hold)", async () => {
    const metadata = sequentialAwaitingPlanReviewMetadataFixture({
      planReview: {
        required: true,
        status: "awaiting",
        heldAt: "2026-07-23T00:00:00.000Z",
        redraftCount: 0,
        lastNotes: null,
        editedShots: { "4": { editedAt: "2026-07-23T00:05:00.000Z" } },
      },
    });
    (metadata.sequentialStoryboard as any).shots[3].dialogue =
      "บทพูดใหม่ช็อต 4";
    const run = baseRunFixture({ metadataJson: metadata });
    const imageGenerationStage = awaitingPlanReviewStageFixture();
    const updateRunSpy = vi.fn();
    const upsertStageSpy = vi.fn();
    mockGetDb.mockResolvedValue(
      buildDbMock({
        run,
        imageGenerationStage,
        stages: [imageGenerationStage],
        updateRunSpy,
        upsertStageSpy,
      })
    );

    const result = await approveMarketplaceAutoReviewPlanReview(
      { runId: "mar_1" },
      AUTH
    );

    const [runSet] = updateRunSpy.mock.calls[0] as [Record<string, any>];
    expect(runSet.metadataJson.sequentialStoryboard.shots[3].dialogue).toBe(
      "บทพูดใหม่ช็อต 4"
    );
    expect(runSet.metadataJson.planReview.editedShots).toEqual({
      "4": { editedAt: "2026-07-23T00:05:00.000Z" },
    });
    expect(runSet.metadataJson.planReview.status).toBe("approved");
    expect(
      (result as any).metadataJson.sequentialStoryboard.shots[3].dialogue
    ).toBe("บทพูดใหม่ช็อต 4");
  });
});

/* -------------------------------------------------------------------------- */
/* Structural wiring proof (grep-guard — mirrors                              */
/* marketplaceAutoReview.sequentialGate.test.ts's own technique)              */
/* -------------------------------------------------------------------------- */

describe("Marketplace text-plan review gate — wiring grep-guard", () => {
  function extractFunctionBody(content: string, signature: RegExp): string {
    const match = signature.exec(content);
    expect(match, `signature ${signature} not found`).not.toBeNull();
    const startIndex = match!.index;
    const rest = content.slice(startIndex + match![0].length);
    const nextTopLevel =
      /\n(?:export\s+)?(?:async\s+)?function\s+\w+|\nexport\s+(?:const|class|interface|type)\s+\w+/.exec(
        rest
      );
    const endIndex = nextTopLevel
      ? startIndex + match![0].length + nextTopLevel.index
      : content.length;
    return content.slice(startIndex, endIndex);
  }

  const filePath = path.resolve(
    import.meta.dirname,
    "../marketplaceAutoReviewService.ts"
  );
  const content = fs.readFileSync(filePath, "utf-8");

  it("startMarketplaceAutoReviewRun holds the run at the gate before handing off to image_generation", () => {
    const body = extractFunctionBody(
      content,
      /export async function startMarketplaceAutoReviewRun\(/
    );
    expect(body).toContain("holdMarketplaceAutoReviewRunAtImageGeneration(");
    // The hold must be written (via the SAME updateRun call) alongside the
    // currentStage transition to image_generation, not before concept_story/
    // prompt_plan are marked completed.
    const holdIndex = body.indexOf(
      "holdMarketplaceAutoReviewRunAtImageGeneration("
    );
    const promptPlanIndex = body.indexOf('stageKey: "prompt_plan"');
    expect(promptPlanIndex).toBeGreaterThan(-1);
    expect(holdIndex).toBeGreaterThan(promptPlanIndex);
  });

  it("requestMarketplaceAutoReviewPlanRedraft re-authors concept_story + prompt_plan and re-enters the same hold", () => {
    const body = extractFunctionBody(
      content,
      /export async function requestMarketplaceAutoReviewPlanRedraft\(/
    );
    expect(body).toContain("buildGatewayCreativeAutoReviewPlan(");
    expect(body).toContain("rewriteMarketplaceAutoReviewPlanVoiceoverWithSkill(");
    expect(body).toContain("runSequentialPromptPlanStage(");
    expect(body).toContain("holdMarketplaceAutoReviewRunAtImageGeneration(");
    expect(body).toContain("redraftNotes:");
    // Never touches image_generation credit scheduling.
    expect(body).not.toContain("scheduleImageAttempt(");
  });

  it("advanceMarketplaceAutoReviewRun is untouched: still the same generic blocked-stage short-circuit the gate rides on, with zero new branches for awaiting_plan_review", () => {
    const body = extractFunctionBody(
      content,
      /export async function advanceMarketplaceAutoReviewRun\(/
    );
    expect(body).toContain("clearResolvedMarketplaceAutoReviewInputChangeBlock(");
    expect(body).not.toContain("awaiting_plan_review");
    expect(body).not.toContain("planReview");
  });
});
