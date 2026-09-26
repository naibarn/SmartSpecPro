import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertFinalVerifyReady,
  buildBlockerLedgerEntry,
  compileRequirementClosureGraph,
} from "../spec224RequirementClosureContracts";
import { buildSpec224SpecBaseline } from "../spec224SpecBaseline";

const SPEC_PATH = resolve(
  process.cwd(),
  "../../specs/feature/224-Autonomous Development Orchestrator Runtime/spec.md"
);

function currentSpecBaseline() {
  return buildSpec224SpecBaseline({
    specId: "224",
    revision: "current",
    authorityRef: "authority:platform-engineering",
    scopeEnvelopeRef: "scope:224-current",
    sourceMarkdown: readFileSync(SPEC_PATH, "utf8"),
  });
}

function bySourceRef(
  baseline: ReturnType<typeof currentSpecBaseline>,
  sourceRef: string
) {
  const requirement = baseline.requirements.find(
    item => item.sourceRef === sourceRef
  );
  expect(requirement, `missing ${sourceRef}`).toBeDefined();
  return requirement!;
}

describe("Spec 224 multi-section baseline conformance", () => {
  it("preserves conditional, prohibition, and lowercase-SHALL source text from real sections", () => {
    const baseline = currentSpecBaseline();

    expect(bySourceRef(baseline, "spec:224@current#L552-L558").text).toBe(
      "The runtime SHALL prefer: resume existing session when context continuity is safe and compatible."
    );
    expect(bySourceRef(baseline, "spec:224@current#L560-L567").text).toContain(
      "policy requires separation of duties."
    );
    expect(bySourceRef(baseline, "spec:224@current#L2469-L2476").text).toBe(
      "Never: update state then directly call provider without durable dispatch intent, because process crash can strand the run."
    );
    expect(bySourceRef(baseline, "spec:224@current#L1062").text).toBe(
      "The Runner shall apply Spec 218 isolation levels."
    );

    expect(
      bySourceRef(baseline, "spec:224@current#L15988-L15998").text
    ).toContain("normative_requirement_set_ref");
    expect(
      bySourceRef(baseline, "spec:224@current#L16064-L16068").text
    ).toContain(
      "Change/Task → what requirement or derived obligation justifies it?"
    );
    expect(bySourceRef(baseline, "spec:224@current#L16071").text).toContain(
      "UNREQUESTED_CHANGE"
    );
  });

  it("keeps a real multi-section requirement set source-addressed and models its DAG without asserting synthetic evidence", () => {
    const baseline = currentSpecBaseline();
    const requirements = [
      bySourceRef(baseline, "spec:224@current#L15988-L15998"),
      bySourceRef(baseline, "spec:224@current#L16001-L16009"),
      bySourceRef(baseline, "spec:224@current#L16012"),
      bySourceRef(baseline, "spec:224@current#L16062"),
      bySourceRef(baseline, "spec:224@current#L16064-L16068"),
      bySourceRef(baseline, "spec:224@current#L16071"),
    ];
    const baselineRequirements = requirements.map(requirement => ({
      id: requirement.id,
      sourceRef: requirement.sourceRef,
      text: requirement.text,
    }));
    const graph = compileRequirementClosureGraph({
      baseline: {
        specId: baseline.specId,
        revision: baseline.revision,
        sourceArtifactDigest: baseline.sourceArtifactDigest,
        digest: baseline.sourceDigest,
        baselineId: baseline.baselineId,
        authorityRef: baseline.authorityRef,
        scopeEnvelopeRef: baseline.scopeEnvelopeRef,
      },
      requirements: baselineRequirements,
      planSections: [
        {
          id: "section:559",
          requirementIds: baselineRequirements.slice(0, 3).map(item => item.id),
        },
        {
          id: "section:562",
          requirementIds: baselineRequirements.slice(3).map(item => item.id),
        },
      ],
      workPackages: [
        {
          id: "wp:baseline",
          planSectionId: "section:559",
          requirementIds: baselineRequirements.slice(0, 3).map(item => item.id),
          dependsOn: [],
        },
        {
          id: "wp:traceability",
          planSectionId: "section:562",
          requirementIds: baselineRequirements.slice(3).map(item => item.id),
          dependsOn: ["wp:baseline"],
        },
      ],
    });
    const blocker = buildBlockerLedgerEntry({
      blockerId: "blocker:unrequested-change",
      runId: "run:multi-section",
      requirementRefs: [baselineRequirements.at(-1)!.id],
      classification: "UNREQUESTED_CHANGE",
      severity: "high",
    });

    expect(graph.workPackages[1]?.dependsOn).toEqual(["wp:baseline"]);
    expect(graph.reverse["wp:traceability"]).toEqual(
      baselineRequirements.slice(3).map(item => item.id)
    );
    expect(() => assertFinalVerifyReady(graph)).toThrow(
      "REQUIREMENT_NOT_TERMINAL"
    );
    expect(blocker).toMatchObject({
      status: "OPEN",
      classification: "UNREQUESTED_CHANGE",
      verificationRefs: [],
    });
  });

  it("does not turn a normative-looking code sample or contextual prose into a requirement", () => {
    const baseline = buildSpec224SpecBaseline({
      specId: "224",
      revision: "parser-fixture",
      authorityRef: "authority:platform-engineering",
      scopeEnvelopeRef: "scope:224-parser-fixture",
      sourceMarkdown: `# Parser fixture

The controller SHALL record the authoritative event.

\`\`\`text
Example only: worker MUST not be treated as a requirement.
\`\`\`

No durable controller currently exists in this historical snapshot.`,
    });

    expect(baseline.requirements).toMatchObject([
      {
        sourceRef: "spec:224@parser-fixture#L3",
        text: "The controller SHALL record the authoritative event.",
      },
    ]);
  });
});
