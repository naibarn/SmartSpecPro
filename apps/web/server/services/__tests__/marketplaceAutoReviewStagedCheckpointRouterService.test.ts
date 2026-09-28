import { describe, expect, it } from "vitest";

import {
  buildStagedCheckpoint,
  buildStagedPlanView,
  buildStagedStoryArcPlan,
} from "../marketplaceAutoReviewStoryArcPlanner";
import {
  buildStagedSingleShotRefreshInputForTest,
  classifyStagedDemonstrationTypeForTest,
  computeRetryStagedAutoReviewFinalAssemblyMetadata,
} from "../marketplaceAutoReviewStagedCheckpointRouterService";
import { buildSequentialSingleShotRefreshContractForTest } from "../productReviewSequentialStoryboardSkillRunner";

function planFixture() {
  return buildStagedStoryArcPlan({
    runId: "run-141",
    product: {
      productId: "product-1",
      productName: "แก้วน้ำตัวอย่าง",
      description: "สินค้าสำหรับทดสอบ",
      imageUrls: ["https://example.test/product.png"],
    },
    referenceManifestHash: "refs-1",
  });
}

/** Mirrors the fixture pattern used by
 *  marketplaceAutoReviewStagedPipeline.selfHealPersist.test.ts — a plain
 *  in-memory run + metadata object satisfying the shape
 *  `buildStagedSingleShotRefreshInput` actually reads from, without needing
 *  DB mocking (this module never touches the DB itself). */
function fixture(input: {
  plan: ReturnType<typeof planFixture>;
  shotOverrides?: Record<number, { dialogue?: string; storySummary?: string }>;
}) {
  const { plan } = input;
  const storyCheckpoint = buildStagedCheckpoint({
    checkpointId: `story-plan:run-141:r${plan.planRevision}`,
    kind: "story_plan",
    revision: plan.planRevision,
    contentHash: plan.storyPlanHash,
    model: "story-arc",
    provider: "internal-bounded",
    estimatedCredits: 0,
    referenceManifestHash: plan.referenceManifestHash,
  });
  const shots = plan.shots.map(shot => {
    const override = input.shotOverrides?.[shot.shotId];
    return {
      shotId: shot.shotId,
      revision: plan.planRevision,
      state: "story_awaiting" as const,
      storySummary: override?.storySummary ?? shot.storySummary,
      dialogue: override?.dialogue ?? shot.dialogue,
      imagePromptHash: null,
      imageArtifactHash: null,
      videoPromptHash: null,
      videoArtifactHash: null,
    };
  });
  const planWithOverrides = {
    ...plan,
    shots: plan.shots.map(shot => {
      const override = input.shotOverrides?.[shot.shotId];
      return override
        ? {
            ...shot,
            dialogue: override.dialogue ?? shot.dialogue,
            storySummary: override.storySummary ?? shot.storySummary,
          }
        : shot;
    }),
  };
  const metadata = {
    planningArchitecture: "staged_two_skill_v2" as const,
    planningArchitectureVersion: 1 as const,
    humanApprovalPolicy: "all_checkpoints_required" as const,
    planReview: {
      required: true as const,
      status: "approved" as const,
      planRevision: plan.planRevision,
      approvedRevision: plan.planRevision,
      redraftCount: 0,
      lastOperationId: null,
    },
    stagedSequentialStoryboard: {
      storyPlanStatus: "approved" as const,
      planRevision: plan.planRevision,
      storyPlanHash: plan.storyPlanHash,
      referenceManifestHash: plan.referenceManifestHash,
      shots,
      reviewCheckpoints: [storyCheckpoint],
    },
    stagedPipeline: {
      plan: planWithOverrides,
      planView: buildStagedPlanView(planWithOverrides),
      tasks: {},
      audioPlan: null,
      finalAssembly: null,
    },
  };
  const run = {
    id: "run-141",
    userId: 42,
    tenantId: "tenant-1",
    productId: "product-1",
  };
  return { run: run as any, metadata: metadata as any };
}

describe("computeRetryStagedAutoReviewFinalAssemblyMetadata — retry clears dead render refs", () => {
  function metadataWithFinalAssemblyCheckpoint() {
    const finalAssemblyCheckpoint = buildStagedCheckpoint({
      checkpointId: "final_assembly:run-1:r1",
      kind: "final_assembly",
      revision: 1,
      contentHash: "hash-1",
      model: "internal",
      provider: "internal-bounded",
      estimatedCredits: 0,
      referenceManifestHash: "refs-1",
    });
    return {
      planningArchitecture: "staged_two_skill_v2" as const,
      planningArchitectureVersion: 1 as const,
      humanApprovalPolicy: "all_checkpoints_required" as const,
      planReview: {
        required: true as const,
        status: "approved" as const,
        planRevision: 1,
        approvedRevision: 1,
        redraftCount: 0,
        lastOperationId: null,
      },
      stagedSequentialStoryboard: {
        storyPlanStatus: "approved" as const,
        planRevision: 1,
        storyPlanHash: "hash-1",
        referenceManifestHash: "refs-1",
        shots: [],
        reviewCheckpoints: [finalAssemblyCheckpoint],
      },
      stagedPipeline: { finalAssembly: { status: "failed" } },
      // Top-level render refs left behind by a failed Remotion render —
      // this is exactly the bug (F-final-render-retry-loop): retrying
      // MUST clear these or the next advance re-polls the same dead job.
      renderJobId: "job-dead-123",
      renderEngine: "remotion_queue",
      renderSubmittedAt: 1700000000000,
    } as any;
  }

  it("clears renderJobId/renderEngine/renderSubmittedAt from the returned metadata", () => {
    const metadata = metadataWithFinalAssemblyCheckpoint();
    const result = computeRetryStagedAutoReviewFinalAssemblyMetadata(metadata);
    expect((result.metadata as any).renderJobId).toBeUndefined();
    expect((result.metadata as any).renderEngine).toBeUndefined();
    expect((result.metadata as any).renderSubmittedAt).toBeUndefined();
    expect(!("renderJobId" in (result.metadata as any))).toBe(true);
  });

  it("still clears stagedPipeline.finalAssembly and supersedes the checkpoint", () => {
    const metadata = metadataWithFinalAssemblyCheckpoint();
    const result = computeRetryStagedAutoReviewFinalAssemblyMetadata(metadata);
    expect((result.metadata as any).stagedPipeline.finalAssembly).toBeNull();
    const checkpoint = result.metadata.stagedSequentialStoryboard.reviewCheckpoints[0];
    expect(checkpoint.state).toBe("superseded");
  });

  it("throws BAD_REQUEST when there is no non-superseded final_assembly checkpoint", () => {
    const metadata = metadataWithFinalAssemblyCheckpoint();
    metadata.stagedSequentialStoryboard.reviewCheckpoints = [];
    expect(() => computeRetryStagedAutoReviewFinalAssemblyMetadata(metadata)).toThrow();
  });
});

describe("Fix B — demonstration_type dispatch heuristic (marketplace auto-review shot sentiment)", () => {
  it("classifies clearly negative/problem dialogue as problem_solution", () => {
    expect(
      classifyStagedDemonstrationTypeForTest(
        "เฮ้อ! เบื่อจริงกับของเล่นลูกที่ซื้อมาแป๊บเดียวก็แตก แถมขอบยังคมกริบ อันตรายไปหมด"
      )
    ).toBe("problem_solution");
    expect(
      classifyStagedDemonstrationTypeForTest("This chair broke after one week, quite dangerous")
    ).toBe("problem_solution");
  });

  it("keeps neutral dialogue as usage_demo", () => {
    expect(
      classifyStagedDemonstrationTypeForTest(
        "ช็อตนี้พาไปดูฟังก์ชันหลักของแก้วน้ำ ใช้งานง่ายและสวยงาม"
      )
    ).toBe("usage_demo");
    expect(
      classifyStagedDemonstrationTypeForTest("This shot shows the main feature in daily use")
    ).toBe("usage_demo");
  });
});

describe("buildStagedSingleShotRefreshInput — staged single-shot regenerate contract", () => {
  it("selects problem_solution for a shot with problem/defect dialogue and usage_demo for a neutral shot", () => {
    const plan = planFixture();
    const { run, metadata } = fixture({
      plan,
      shotOverrides: {
        1: {
          dialogue:
            "เฮ้อ! เบื่อจริงกับของเล่นลูกที่ซื้อมาแป๊บเดียวก็แตก แถมขอบยังคมกริบ อันตรายไปหมด",
        },
      },
    });

    const problemShotInput = buildStagedSingleShotRefreshInputForTest({
      run,
      metadata,
      shotId: 1,
    });
    expect(problemShotInput.shotContract.demonstration_type).toBe(
      "problem_solution"
    );

    const neutralShotInput = buildStagedSingleShotRefreshInputForTest({
      run,
      metadata,
      shotId: 2,
    });
    expect(neutralShotInput.shotContract.demonstration_type).toBe(
      "usage_demo"
    );
  });

  it("includes the plan shot's storySummary in the contract sent to the skill (Fix C)", () => {
    const plan = planFixture();
    const { run, metadata } = fixture({
      plan,
      shotOverrides: {
        1: { storySummary: "เรื่องราวช็อตที่ผู้ใช้แก้ไขเอง: ทดสอบ Fix C" },
      },
    });

    const refreshInput = buildStagedSingleShotRefreshInputForTest({
      run,
      metadata,
      shotId: 1,
    });
    expect(refreshInput.shotContract.story_summary).toBe(
      "เรื่องราวช็อตที่ผู้ใช้แก้ไขเอง: ทดสอบ Fix C"
    );
  });

  it("threads a supplied free-text instruction into userInstruction, and omits it when absent", () => {
    const plan = planFixture();
    const { run, metadata } = fixture({ plan });

    const withInstruction = buildStagedSingleShotRefreshInputForTest({
      run,
      metadata,
      shotId: 1,
      instruction: "มีเด็กชาวไทยอายุ 8 เดือนในฉาก",
    });
    expect(withInstruction.userInstruction).toBe(
      "มีเด็กชาวไทยอายุ 8 เดือนในฉาก"
    );

    const withoutInstruction = buildStagedSingleShotRefreshInputForTest({
      run,
      metadata,
      shotId: 1,
    });
    expect(withoutInstruction.userInstruction).toBeNull();
  });

  it("ends up in the actual system-prompt contract sent to the skill runner", () => {
    const plan = planFixture();
    const { run, metadata } = fixture({ plan });

    const refreshInput = buildStagedSingleShotRefreshInputForTest({
      run,
      metadata,
      shotId: 1,
      instruction: "มีเด็กชาวไทยอายุ 8 เดือนในฉาก",
    });
    const contract = buildSequentialSingleShotRefreshContractForTest(
      refreshInput as any
    );
    expect(contract).toContain("## User-Requested Adjustment");
    expect(contract).toContain("มีเด็กชาวไทยอายุ 8 เดือนในฉาก");

    const refreshInputNoInstruction = buildStagedSingleShotRefreshInputForTest({
      run,
      metadata,
      shotId: 1,
    });
    const contractNoInstruction = buildSequentialSingleShotRefreshContractForTest(
      refreshInputNoInstruction as any
    );
    expect(contractNoInstruction).not.toContain("## User-Requested Adjustment");
  });
});

describe("buildStagedSingleShotRefreshInput — video-stage grounds in the approved shot image (independent video generation)", () => {
  function withShotImageArtifactUrl(
    metadata: ReturnType<typeof fixture>["metadata"],
    shotId: number,
    imageArtifactUrl: string
  ) {
    return {
      ...metadata,
      stagedSequentialStoryboard: {
        ...metadata.stagedSequentialStoryboard,
        shots: metadata.stagedSequentialStoryboard.shots.map((shot: any) =>
          shot.shotId === shotId ? { ...shot, imageArtifactUrl } : shot
        ),
      },
    };
  }

  it("stage: 'video' appends the shot's approved imageArtifactUrl to skillVisionUrls and referenceManifest", () => {
    const plan = planFixture();
    const { run, metadata } = fixture({ plan });
    const withImage = withShotImageArtifactUrl(
      metadata,
      1,
      "https://example.test/shots/shot-1-approved.png"
    );

    const refreshInput = buildStagedSingleShotRefreshInputForTest({
      run,
      metadata: withImage,
      shotId: 1,
      stage: "video",
    });

    expect(refreshInput.skillVisionUrls).toContain(
      "https://example.test/shots/shot-1-approved.png"
    );
    const approvedEntry = refreshInput.referenceManifest.find(
      entry => entry.role === "approved_shot_image"
    );
    expect(approvedEntry).toBeDefined();
    expect(approvedEntry?.url).toBe(
      "https://example.test/shots/shot-1-approved.png"
    );
  });

  it("stage: 'image' does NOT include the approved shot image, even when one already exists (image generation stays independent of video state)", () => {
    const plan = planFixture();
    const { run, metadata } = fixture({ plan });
    const withImage = withShotImageArtifactUrl(
      metadata,
      1,
      "https://example.test/shots/shot-1-approved.png"
    );

    const refreshInput = buildStagedSingleShotRefreshInputForTest({
      run,
      metadata: withImage,
      shotId: 1,
      stage: "image",
    });

    expect(refreshInput.skillVisionUrls).not.toContain(
      "https://example.test/shots/shot-1-approved.png"
    );
    expect(
      refreshInput.referenceManifest.find(
        entry => entry.role === "approved_shot_image"
      )
    ).toBeUndefined();
  });

  it("omitting stage entirely behaves exactly like stage: 'image' (no approved-image entry) — an image-stage call never requires any video-specific state", () => {
    const plan = planFixture();
    // No imageArtifactUrl set anywhere — an image-only shot must still build
    // a valid refresh input; image generation is never coupled to a prior
    // video action or any video-specific field.
    const { run, metadata } = fixture({ plan });

    const refreshInput = buildStagedSingleShotRefreshInputForTest({
      run,
      metadata,
      shotId: 1,
    });

    expect(
      refreshInput.referenceManifest.find(
        entry => entry.role === "approved_shot_image"
      )
    ).toBeUndefined();
  });

  it("stage: 'video' with no imageArtifactUrl on the shot leaves the reference manifest unchanged (never throws)", () => {
    const plan = planFixture();
    const { run, metadata } = fixture({ plan });

    const refreshInput = buildStagedSingleShotRefreshInputForTest({
      run,
      metadata,
      shotId: 1,
      stage: "video",
    });

    expect(
      refreshInput.referenceManifest.find(
        entry => entry.role === "approved_shot_image"
      )
    ).toBeUndefined();
  });
});
