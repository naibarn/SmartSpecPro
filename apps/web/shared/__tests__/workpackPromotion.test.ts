/**
 * @vitest-environment node
 */

import { describe, expect, it } from "vitest";

import {
  benchmarkPackSchema,
  getMostRestrictiveTrustTag,
  improvementProposalSchema,
  isBenchmarkShareableOutsideTenant,
} from "../workpackPromotion";

describe("workpackPromotion", () => {
  it("validates improvement proposals", () => {
    const parsed = improvementProposalSchema.parse({
      id: "prop_1",
      workpackId: "wp_1",
      versionId: "wpv_1",
      actionType: "skill_improvement",
      risk: "low",
      sourceRunId: "run_1",
      sourceExceptionIds: [],
      summary: "Tighten prompt",
      evidenceSummary: "Repeated approval-free success",
      trustTags: ["verified"],
      autoApplicable: true,
      createdAt: "2026-04-10T00:00:00.000Z",
    });

    expect(parsed.autoApplicable).toBe(true);
  });

  it("keeps benchmark publication tenant-local until de-identified", () => {
    const parsed = benchmarkPackSchema.parse({
      id: "bench_1",
      sourceWorkpackId: "wp_1",
      sourceVersionId: "wpv_1",
      title: "AP benchmark",
      clonedFromBenchmarkId: null,
      lineage: [],
      fixtureIds: ["fix_1"],
      evaluationRules: ["must match totals"],
      trustTags: ["tenant_local_only"],
      publicationScope: "tenant_local",
      publicationStatus: "published",
      fixturesDeidentified: false,
      outputsDeidentified: false,
      publishedAt: "2026-04-10T00:00:00.000Z",
    });

    expect(isBenchmarkShareableOutsideTenant(parsed)).toBe(false);
    expect(getMostRestrictiveTrustTag(parsed.trustTags)).toBe("tenant_local_only");
  });
});
