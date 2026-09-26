import { describe, expect, it } from "vitest";

import {
  assertFinalVerifyReady,
  buildBlockerLedgerEntry,
  compileRequirementClosureGraph,
  closeBlocker,
  Spec224ClosureError,
} from "../spec224RequirementClosureContracts";

const baseInput = {
  baseline: {
    specId: "224",
    revision: "20",
    digest: "a".repeat(64),
    baselineId: "baseline:224-r20",
    authorityRef: "authority:platform-engineering",
    scopeEnvelopeRef: "scope:224-r20",
  },
  requirements: [
    {
      id: "REQ-1",
      sourceRef: "spec:224#561",
      text: "Track every required requirement",
    },
    {
      id: "REQ-2",
      sourceRef: "spec:224#562",
      text: "Support reverse traceability",
    },
  ],
  planSections: [{ id: "section:closure", requirementIds: ["REQ-1", "REQ-2"] }],
  workPackages: [
    {
      id: "wp:closure",
      planSectionId: "section:closure",
      requirementIds: ["REQ-1", "REQ-2"],
      dependsOn: [],
    },
  ],
};

describe("Spec 224 requirement closure compiler", () => {
  it("compiles deterministic forward and reverse requirement traceability", () => {
    const graph = compileRequirementClosureGraph(baseInput);
    expect(graph.baseline.baselineId).toBe("baseline:224-r20");
    expect(graph.requirements[0]).toMatchObject({
      id: "REQ-1",
      state: "PLANNED",
      workPackageIds: ["wp:closure"],
    });
    expect(graph.reverse["wp:closure"]).toEqual(["REQ-1", "REQ-2"]);
  });

  it("rejects unmapped requirements, duplicate ownership and dependency cycles", () => {
    expect(() =>
      compileRequirementClosureGraph({
        ...baseInput,
        workPackages: [
          { ...baseInput.workPackages[0], requirementIds: ["REQ-1"] },
        ],
      })
    ).toThrow("REQUIREMENT_UNMAPPED");
    expect(() =>
      compileRequirementClosureGraph({
        ...baseInput,
        workPackages: [
          baseInput.workPackages[0],
          {
            id: "wp:duplicate",
            planSectionId: "section:closure",
            requirementIds: ["REQ-1"],
            dependsOn: [],
          },
        ],
      })
    ).toThrow("REQUIREMENT_MULTIPLE_OWNER");
    expect(() =>
      compileRequirementClosureGraph({
        ...baseInput,
        workPackages: [
          { ...baseInput.workPackages[0], dependsOn: ["wp:closure"] },
        ],
      })
    ).toThrow("WORK_PACKAGE_CYCLE");
    expect(() =>
      compileRequirementClosureGraph({
        ...baseInput,
        planSections: [
          { id: "section:closure", requirementIds: ["REQ-1"] },
          { id: "section:other", requirementIds: ["REQ-2"] },
        ],
        workPackages: [
          {
            id: "wp:closure",
            planSectionId: "section:closure",
            requirementIds: ["REQ-1", "REQ-2"],
            dependsOn: [],
          },
        ],
      })
    ).toThrow("WORK_PACKAGE_SECTION_MISMATCH");
  });

  it("keeps Final Verify closed until all required requirements and blockers have current evidence", () => {
    const graph = compileRequirementClosureGraph(baseInput);
    expect(() => assertFinalVerifyReady(graph)).toThrow(
      "REQUIREMENT_NOT_TERMINAL"
    );
    const verified = {
      ...graph,
      requirements: graph.requirements.map(requirement => ({
        ...requirement,
        state: "VERIFIED_PASS" as const,
        evidenceRefs: [`evidence:${requirement.id.toLowerCase()}`],
      })),
    };
    const blocker = buildBlockerLedgerEntry({
      blockerId: "blocker:1",
      runId: "run:224-1",
      requirementRefs: ["REQ-1"],
      classification: "IMPLEMENTATION_DEFECT",
      severity: "high",
    });
    expect(() =>
      assertFinalVerifyReady({ ...verified, blockers: [blocker] })
    ).toThrow("BLOCKER_OPEN");
    const closed = closeBlocker(blocker, ["evidence:blocker-1"]);
    expect(assertFinalVerifyReady({ ...verified, blockers: [closed] })).toBe(
      true
    );
  });

  it("rejects malformed closure input instead of treating agent completion as closure", () => {
    expect(() =>
      compileRequirementClosureGraph({
        ...baseInput,
        requirements: [
          { ...baseInput.requirements[0], id: "REQ-1", text: "" },
          baseInput.requirements[1],
        ],
      })
    ).toThrow(Spec224ClosureError);
    expect(() =>
      buildBlockerLedgerEntry({
        blockerId: "blocker:invalid",
        runId: "run:224-1",
        requirementRefs: ["REQ-1"],
        classification: "IMPLEMENTATION_DEFECT",
        severity: "unknown" as "high",
      })
    ).toThrow("BLOCKER_SEVERITY_INVALID");
  });
});
