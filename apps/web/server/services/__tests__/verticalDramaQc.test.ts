import { describe, it, expect } from "vitest";
import {
  runQcForStage,
  evaluateCheck,
  computeQcScore,
  qcPassed,
  buildPrefilledRepair,
  repairEntryPointSection,
  repairRequiresCreditConfirmation,
  stagesMadeStaleByRepair,
  VERTICAL_DRAMA_QC_STAGE_CHECKS,
  VERTICAL_DRAMA_REPAIR_REACHABILITY,
  type QcEvaluationInput,
} from "../verticalDramaQc";

function base(stage: QcEvaluationInput["stage"], extra: Partial<QcEvaluationInput> = {}): QcEvaluationInput {
  return { stage, seriesId: "1", episodeId: "2", runId: "3", ...extra };
}

describe("QC report score + passed", () => {
  it("passes cleanly with a perfect score when no issues", () => {
    const r = runQcForStage(base("storyboard", { aspectRatio: "9:16", clipDurationsSeconds: [8, 8, 8, 8, 8, 8, 8, 4], expectedTotalSeconds: 60 }));
    expect(r.passed).toBe(true);
    expect(r.score).toBe(1);
  });

  it("exposes score + passed and fails on a blocking issue", () => {
    const r = runQcForStage(base("storyboard", { aspectRatio: "16:9" }));
    expect(r.passed).toBe(false);
    expect(r.score).toBeLessThan(1);
    expect(r.issues.some((i) => i.severity === "blocking")).toBe(true);
  });
});

describe("required checks per stage", () => {
  it("provider_routing evaluates provider capability + sub-shot checks", () => {
    expect(VERTICAL_DRAMA_QC_STAGE_CHECKS.provider_routing).toContain("provider_capability_policy");
    expect(VERTICAL_DRAMA_QC_STAGE_CHECKS.provider_routing).toContain("sub_shot_decomposition");
  });

  it("runs series-continuity + product-tie-in as distinct stages", () => {
    expect(VERTICAL_DRAMA_QC_STAGE_CHECKS.episode_memory_update).toContain("relationship_plot_continuity");
    expect(VERTICAL_DRAMA_QC_STAGE_CHECKS.product_tie_in).toContain("no_forced_product_claim");
  });
});

describe("sub-shot QC", () => {
  it("catches bad duration sum, below-floor cut, over-count, and choppy rhythm", () => {
    const r = runQcForStage(
      base("video_prompt", {
        subShots: {
          flagOn: true,
          maxPerShot: 3,
          minSubShotSeconds: 1.2,
          shots: [
            {
              parentShotNumber: 1,
              mainShotDurationSeconds: 8,
              subShots: [{ durationSeconds: 3 }, { durationSeconds: 0.5 }, { durationSeconds: 2 }, { durationSeconds: 1 }],
              cutRhythmOk: false,
            },
          ],
        },
      }),
    );
    const codes = r.recommendedRepairs.map((x) => x.action);
    expect(codes).toContain("adjust_sub_shot_timing");
    expect(codes).toContain("repair_sub_shot");
  });
});

describe("interactive repair queue + reachability", () => {
  it("builds a prefilled, reachable repair descriptor", () => {
    const r = runQcForStage(base("provider_routing", { providerRouting: { provider: "x", provider_caps: {} as any, recommended_provider_path: "manual_review", execution_status: "blocked", normalizedStatus: "blocked", blockingReasons: ["provider_not_in_tenant_allowlist"], provider_request: { provider: "x", execution_status: "blocked", normalizedStatus: "blocked" } } }));
    expect(r.recommendedRepairs.length).toBeGreaterThan(0);
    const prefilled = buildPrefilledRepair(r.recommendedRepairs[0], { shot: 2 });
    expect(prefilled.action).toBe("reroute_provider");
    expect(prefilled.targetSection).toBe("section-06-clip-generation-motion");
    expect(prefilled.target.shot).toBe(2);
  });

  it("maps every repair action to a reachable per-target section", () => {
    for (const [action, section] of Object.entries(VERTICAL_DRAMA_REPAIR_REACHABILITY)) {
      expect(repairEntryPointSection(action as any)).toBe(section);
    }
    expect(repairEntryPointSection("regenerate_start_frame")).toBe("section-05-character-stock-and-start-frames");
    expect(repairEntryPointSection("rewrite_script")).toBe("section-04-series-memory-and-episode-pipeline");
    expect(repairEntryPointSection("repair_sub_shot")).toBe("section-06-clip-generation-motion");
    expect(repairEntryPointSection("repair_assembly")).toBe("section-09-assembly-export");
  });

  it("distinguishes free vs paid repair for credit confirmation", () => {
    expect(repairRequiresCreditConfirmation("regenerate_clip")).toBe(true);
    expect(repairRequiresCreditConfirmation("regenerate_start_frame")).toBe(true);
    expect(repairRequiresCreditConfirmation("adjust_sub_shot_timing")).toBe(false);
    expect(repairRequiresCreditConfirmation("reroute_provider")).toBe(false);
  });
});

describe("repair staleness propagation", () => {
  it("marks downstream pipeline stages stale for a repair at a QC stage", () => {
    const stale = stagesMadeStaleByRepair("storyboard");
    expect(stale).toContain("start_frame_render_plan");
    expect(stale).toContain("render_or_import_video_clips");
    expect(stale).not.toContain("storyboard_shotgrid");
  });
});

describe("evaluateCheck primitives", () => {
  it("flags provider capability policy not honored", () => {
    const r = evaluateCheck("provider_capability_policy", base("provider_routing", {
      providerRouting: { provider: "x", provider_caps: {} as any, recommended_provider_path: "manual_review", execution_status: "blocked", normalizedStatus: "blocked", blockingReasons: ["aspect_ratio_unsupported:16:9"], provider_request: { provider: "x", execution_status: "blocked", normalizedStatus: "blocked" } },
    }));
    expect(r.issues[0].severity).toBe("blocking");
    expect(r.repairs[0].action).toBe("reroute_provider");
  });

  it("score helper penalizes by severity", () => {
    expect(computeQcScore([{ issueId: "a", severity: "warning", targetType: "clip", message: "" }])).toBeCloseTo(0.9, 6);
    expect(qcPassed([{ issueId: "a", severity: "warning", targetType: "clip", message: "" }])).toBe(true);
    expect(qcPassed([{ issueId: "a", severity: "error", targetType: "clip", message: "" }])).toBe(false);
  });
});
