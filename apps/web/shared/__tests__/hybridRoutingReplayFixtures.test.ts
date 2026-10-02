import { describe, expect, it } from "vitest";

import { classifyHybridRoutingIntent } from "../chatSkillRouting";
import { HYBRID_RUNTIME_CONTRACT_VERSION } from "../orchestration/hybridOrchestration";
import { hybridRoutingReplayFixtures } from "../__fixtures__/hybridRoutingReplayFixtures";

describe("hybridRoutingReplayFixtures", () => {
  it("keeps direct negatives direct and Hybrid positives explicit", () => {
    for (const fixture of hybridRoutingReplayFixtures) {
      const decision = classifyHybridRoutingIntent(fixture.input);
      expect(decision.route, fixture.id).toBe(fixture.expectedRoute);
      expect(decision.reasonCodes, fixture.id).toContain(fixture.expectedReason);
      expect(fixture.expectedContractVersion).toBe(HYBRID_RUNTIME_CONTRACT_VERSION);
    }
  });

  it("covers release-gate fixture groups", () => {
    expect(new Set(hybridRoutingReplayFixtures.map((fixture) => fixture.group))).toEqual(new Set([
      "direct_media_negative",
      "prompt_enhancement_negative",
      "direct_skill_negative",
      "hybrid_positive_thai",
      "hybrid_positive_english",
      "ambiguous",
    ]));
  });
});
