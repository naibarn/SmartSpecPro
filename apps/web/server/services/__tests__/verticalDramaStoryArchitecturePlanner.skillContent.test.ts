import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertStoryArchitecturePlannerSkillSupportsContract,
  normalizeVerticalDramaStoryArchitectureTransport,
} from "../verticalDramaStoryArchitecturePlanner";

describe("vertical-drama-story-architecture-planner skill contract", () => {
  it("contains the required architecture markers and schemas", () => {
    const skillDir = path.resolve(
      process.cwd(),
      "skills/vertical-drama-story-architecture-planner"
    );
    const skill = fs.readFileSync(path.join(skillDir, "SKILL.md"), "utf8");
    const inputSchema = JSON.parse(
      fs.readFileSync(path.join(skillDir, "input.schema.json"), "utf8")
    ) as { type: string };
    const outputSchema = JSON.parse(
      fs.readFileSync(path.join(skillDir, "output.schema.json"), "utf8")
    ) as { type: string };

    expect(() =>
      assertStoryArchitecturePlannerSkillSupportsContract(skill)
    ).not.toThrow();
    expect(skill).toContain("season endpoint");
    expect(skill).toContain("long-term destination");
    expect(skill).toContain("real-world failure");
    expect(inputSchema.type).toBe("object");
    expect(outputSchema.type).toBe("object");
  });

  it("unwraps only transport envelopes and normalizes a version string", () => {
    expect(
      normalizeVerticalDramaStoryArchitectureTransport({
        data: { contractVersion: "v1", premiseAnchor: "premise" },
      })
    ).toEqual({ contractVersion: 1, premiseAnchor: "premise" });

    expect(
      normalizeVerticalDramaStoryArchitectureTransport({
        contractVersion: 1,
        premiseAnchor: "authoritative",
        data: { contractVersion: "v1", premiseAnchor: "not used" },
      })
    ).toEqual({
      contractVersion: 1,
      premiseAnchor: "authoritative",
      data: { contractVersion: "v1", premiseAnchor: "not used" },
    });

    const normalized = normalizeVerticalDramaStoryArchitectureTransport({
      contract_version: "1",
      premise_anchor: "snake case premise",
      primary_engine: {
        statement: "engine",
        repeatable_episode_mechanism: "repeat",
        escalation_ladder: [],
      },
    }) as Record<string, any>;
    expect(normalized.contractVersion).toBe(1);
    expect(normalized.premiseAnchor).toBe("snake case premise");
    expect(normalized.primaryEngine.repeatableEpisodeMechanism).toBe("repeat");
    expect(normalized.primaryEngine.escalationLadder).toEqual([]);
  });
});
