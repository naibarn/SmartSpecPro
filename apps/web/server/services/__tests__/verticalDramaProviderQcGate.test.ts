/**
 * GAP s08 — QC gate on paid job creation (`verticalDramaProvider.runProviderJob`).
 *
 * `runProviderJob` runs the routing-stage QC before creating any (paid) provider
 * job and throws PRECONDITION_FAILED when the QC blocks paid generation. This
 * test exercises the exact gate expression used by the router
 * (`!qc.passed && stageBlocksPaidGeneration(qc.issues)`) against representative
 * routing decisions, without needing a DB / tRPC provider.
 */

import { describe, it, expect } from "vitest";
import {
  runQcForStage,
  stageBlocksPaidGeneration,
} from "../verticalDramaQc";
import type { VideoRoutingDecision } from "@shared/verticalDramaSeries";

/** The gate predicate the router applies before `lifecycle.create`. */
function qcBlocksPaidJob(routing: VideoRoutingDecision): boolean {
  const qc = runQcForStage({
    stage: "provider_routing",
    seriesId: "1",
    episodeId: "2",
    runId: "3",
    aspectRatio: "9:16",
    providerRouting: routing,
  });
  return !qc.passed && stageBlocksPaidGeneration(qc.issues);
}

const blockedRouting: VideoRoutingDecision = {
  provider: "x",
  provider_caps: {} as never,
  recommended_provider_path: "manual_review",
  execution_status: "blocked",
  normalizedStatus: "blocked",
  blockingReasons: ["provider_not_in_tenant_allowlist"],
  provider_request: {
    provider: "x",
    execution_status: "blocked",
    normalizedStatus: "blocked",
  },
} as never;

const okRouting: VideoRoutingDecision = {
  provider: "x",
  provider_caps: {} as never,
  recommended_provider_path: "direct",
  execution_status: "ready",
  normalizedStatus: "ready",
  blockingReasons: [],
  provider_request: {
    provider: "x",
    execution_status: "ready",
    normalizedStatus: "ready",
  },
} as never;

describe("runProviderJob QC gate (spec §16)", () => {
  it("blocks paid job creation when the routing-stage QC has a blocking issue", () => {
    expect(qcBlocksPaidJob(blockedRouting)).toBe(true);
  });

  it("allows paid job creation when the routing-stage QC passes", () => {
    expect(qcBlocksPaidJob(okRouting)).toBe(false);
  });
});
