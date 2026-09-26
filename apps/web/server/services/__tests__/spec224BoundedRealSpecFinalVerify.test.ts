import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertFinalVerifyReady,
  compileRequirementClosureGraph,
} from "../spec224RequirementClosureContracts";
import {
  buildSpec224SpecBaseline,
  toRequirementClosureInput,
} from "../spec224SpecBaseline";

const SPEC_PATH = resolve(
  process.cwd(),
  "../../specs/feature/224-Autonomous Development Orchestrator Runtime/spec.md"
);

function boundedSpec559(): string {
  const source = readFileSync(SPEC_PATH, "utf8");
  const start = source.indexOf("# 559. `SpecBaseline` and Scope Envelope");
  const end = source.indexOf(
    "# 560. `SpecQualityCertificate` vs `ImplementationConformanceCertificate`"
  );
  if (start < 0 || end <= start)
    throw new Error("SPEC_224_BOUNDED_SECTION_NOT_FOUND");
  return source.slice(start, end);
}

describe("Spec 224 bounded real-Spec Final Verify", () => {
  it("enumerates the real SpecBaseline section and closes every captured requirement", () => {
    const baseline = buildSpec224SpecBaseline({
      specId: "224",
      revision: "20",
      authorityRef: "authority:platform-engineering",
      scopeEnvelopeRef: "scope:224-r20",
      sourceMarkdown: boundedSpec559(),
    });
    const requirements = toRequirementClosureInput(baseline);
    expect(requirements.length).toBeGreaterThan(0);

    const graph = compileRequirementClosureGraph({
      baseline: {
        specId: baseline.specId,
        revision: baseline.revision,
        digest: baseline.sourceDigest,
        baselineId: baseline.baselineId,
        authorityRef: baseline.authorityRef,
        scopeEnvelopeRef: baseline.scopeEnvelopeRef,
      },
      requirements,
      planSections: [
        {
          id: "section:559",
          requirementIds: requirements.map(requirement => requirement.id),
        },
      ],
      workPackages: [
        {
          id: "wp:559",
          planSectionId: "section:559",
          requirementIds: requirements.map(requirement => requirement.id),
          dependsOn: [],
        },
      ],
    });
    const verified = {
      ...graph,
      requirements: graph.requirements.map(requirement => ({
        ...requirement,
        state: "VERIFIED_PASS" as const,
        evidenceRefs: [`evidence:real-spec-${requirement.id}`],
      })),
    };

    expect(assertFinalVerifyReady({ ...verified, blockers: [] })).toBe(true);
    expect(() =>
      assertFinalVerifyReady({
        ...verified,
        requirements: [
          {
            ...verified.requirements[0]!,
            state: "IMPLEMENTED_UNVERIFIED",
            evidenceRefs: [],
          },
          ...verified.requirements.slice(1),
        ],
      })
    ).toThrow("REQUIREMENT_NOT_TERMINAL");
  });
});
