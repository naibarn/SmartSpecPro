import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "../verticalDramaEpisodes.ts"), "utf8");

describe("Feature 137 motion-contract persistence wiring", () => {
  it("persists request-gated status in all three generated clip literals", () => {
    expect(source.match(/\.\.\.\((?:result|speakerSwitchGeneration)\.motionContractStatus/g)).toHaveLength(3);
    expect(source.match(/motionProfile: (?:result|speakerSwitchGeneration)\.motionProfile/g)).toHaveLength(3);
    expect(
      source.match(/effectiveRisk: (?:result|speakerSwitchGeneration)\.effectiveRisk/g)?.length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("omits profile and risk when only missing/invalid status is available", () => {
    expect(source.match(/\? \{\s*motionProfile:/g)).toHaveLength(3);
    expect(source).toContain('eventType: "vd_motion_contract_generated"');
    expect(source).toContain("contractStatus:");
    expect(source).toContain("contractPresent:");
  });
});
