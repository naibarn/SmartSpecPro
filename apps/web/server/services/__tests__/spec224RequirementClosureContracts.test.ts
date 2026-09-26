import { describe, expect, it } from "vitest";

import {
  assertFinalVerifyReady,
  buildBlockerLedgerEntry,
  buildWorkPackageEvidenceBinding,
  buildSourceChangeInventory,
  compileRequirementClosureGraph,
  digestSourceManifest,
  deriveDerivedRequirementId,
  validateRequirementClosureGraph,
  closeBlocker,
  Spec224ClosureError,
} from "../spec224RequirementClosureContracts";
import { deriveSpec224RequirementId } from "../spec224SpecBaseline";
import { makeReadyClosureFixture } from "./spec224ClosureReadyFixture";

const sourceArtifactDigest = "c".repeat(64);
const digest = "a".repeat(64);
const requirement = (line: number, text: string) => ({
  id: deriveSpec224RequirementId({
    specId: "224",
    revision: "20",
    sourceArtifactDigest,
    sourceDigest: digest,
    line,
    text,
  }),
  sourceRef: `spec:224@20#L${line}`,
  text,
});

const baseInput = {
  baseline: {
    specId: "224",
    revision: "20",
    sourceArtifactDigest,
    digest,
    baselineId: "baseline:224-r20",
    authorityRef: "authority:platform-engineering",
    scopeEnvelopeRef: "scope:224-r20",
  },
  requirements: [
    requirement(561, "Track every required requirement"),
    requirement(562, "Support reverse traceability"),
  ],
  planSections: [
    {
      id: "section:closure",
      requirementIds: [
        requirement(561, "Track every required requirement").id,
        requirement(562, "Support reverse traceability").id,
      ],
    },
  ],
  workPackages: [
    {
      id: "wp:closure",
      planSectionId: "section:closure",
      requirementIds: [
        requirement(561, "Track every required requirement").id,
        requirement(562, "Support reverse traceability").id,
      ],
      dependsOn: [],
    },
  ],
};

describe("Spec 224 requirement closure compiler", () => {
  it("compiles deterministic forward and reverse requirement traceability", () => {
    const graph = compileRequirementClosureGraph(baseInput);
    expect(graph.baseline.baselineId).toBe("baseline:224-r20");
    expect(graph.requirements[0]).toMatchObject({
      id: requirement(561, "Track every required requirement").id,
      state: "PLANNED",
      workPackageIds: ["wp:closure"],
    });
    expect(graph.reverse["wp:closure"]).toEqual(
      baseInput.requirements.map(item => item.id)
    );
  });

  it("rejects unmapped requirements, duplicate ownership and dependency cycles", () => {
    expect(() =>
      compileRequirementClosureGraph({
        ...baseInput,
        workPackages: [
          {
            ...baseInput.workPackages[0],
            requirementIds: [baseInput.requirements[0]!.id],
          },
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
            requirementIds: [baseInput.requirements[0]!.id],
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
          {
            id: "section:closure",
            requirementIds: [baseInput.requirements[0]!.id],
          },
          {
            id: "section:other",
            requirementIds: [baseInput.requirements[1]!.id],
          },
        ],
        workPackages: [
          {
            id: "wp:closure",
            planSectionId: "section:closure",
            requirementIds: baseInput.requirements.map(item => item.id),
            dependsOn: [],
          },
        ],
      })
    ).toThrow("WORK_PACKAGE_SECTION_MISMATCH");
  });

  it("binds requirement identity to exact source and canonicalizes plan input ordering", () => {
    const graph = compileRequirementClosureGraph(baseInput);
    const reordered = compileRequirementClosureGraph({
      ...baseInput,
      requirements: [...baseInput.requirements].reverse(),
      planSections: [...baseInput.planSections].reverse(),
      workPackages: [...baseInput.workPackages].reverse(),
    });
    expect(reordered).toEqual(graph);
    expect(() =>
      compileRequirementClosureGraph({
        ...baseInput,
        requirements: baseInput.requirements.map((item, index) =>
          index === 0 ? { ...item, sourceRef: "spec:200@20#L561" } : item
        ),
      })
    ).toThrow("REQUIREMENT_SOURCE_BASELINE_MISMATCH");
    expect(() =>
      validateRequirementClosureGraph({
        ...graph,
        requirements: graph.requirements.map(requirement => ({
          ...requirement,
          id: "forged-requirement",
          state: "VERIFIED_PASS",
          evidenceRefs: ["evidence:invented"],
        })),
      } as typeof graph)
    ).toThrow("REQUIREMENT_ID_SOURCE_MISMATCH");
  });

  it("records PlanSection and WorkPackage admission gaps instead of inventing missing execution contracts", () => {
    const graph = compileRequirementClosureGraph(baseInput);
    expect(graph.planSections[0]).toMatchObject({
      id: "section:closure",
      title: "",
      sourceSpecRefs: baseInput.requirements.map(item => item.sourceRef),
      status: "NOT_STARTED",
    });
    expect(graph.workPackages[0]).toMatchObject({
      id: "wp:closure",
      owner: "",
      allowedWriteSet: [],
      tddApplicability: "TDD_REQUIRED",
      status: "NOT_STARTED",
      evidence: [],
    });
    expect(graph.admissionGaps).toContain("PLAN_SECTION_TITLE_MISSING");
    expect(graph.admissionGaps).toContain("WORK_PACKAGE_OWNER_MISSING");
  });

  it("derives the changed-path set from complete manifests and fails closed on omitted paths", () => {
    const specPath = "specs/feature/224/spec.md";
    const baselineFiles = [
      { path: specPath, digest: sourceArtifactDigest },
      { path: "apps/web/source.ts", digest: "d".repeat(64) },
    ];
    const candidateFiles = [
      { path: specPath, digest: sourceArtifactDigest },
      { path: "apps/web/source.ts", digest: "e".repeat(64) },
    ];
    const inventoryInput = {
      baseline: baseInput.baseline,
      baselineRevision: "git:base",
      candidateRevision: "git:candidate",
      baselineManifestDigest: digestSourceManifest(baselineFiles),
      candidateManifestDigest: digestSourceManifest(candidateFiles),
      scannerRef: "scanner:trusted-source-inventory",
      manifestEvidenceRef: "evidence:manifest",
      coverage: {
        repositoryRef: "repo:smartspecpro",
        baselineRevision: "git:base",
        candidateRevision: "git:candidate",
        inclusionRoots: ["**"],
        excludedPaths: [".git/**", "node_modules/**"],
        recursive: true,
        includesUntracked: true,
        attestationEvidenceRef: "evidence:manifest",
      },
      specArtifactPath: specPath,
      baselineFiles,
      candidateFiles,
      scannedAt: "2026-09-26T00:00:00.000Z",
      changes: [
        {
          path: "apps/web/source.ts",
          beforeDigest: "d".repeat(64),
          afterDigest: "e".repeat(64),
          requirementIds: [],
          derivedRequirementIds: [],
          evidenceRef: "evidence:source-change",
        },
      ],
      requirementIds: baseInput.requirements.map(item => item.id),
      derivedRequirements: [],
    };
    expect(buildSourceChangeInventory(inventoryInput).changes[0]).toMatchObject(
      {
        path: "apps/web/source.ts",
        classification: "UNREQUESTED_CHANGE",
      }
    );
    const deletedCandidateFiles = [candidateFiles[0]!];
    const deletedFileInventory = buildSourceChangeInventory({
      ...inventoryInput,
      candidateFiles: deletedCandidateFiles,
      candidateManifestDigest: digestSourceManifest(deletedCandidateFiles),
      changes: [{ ...inventoryInput.changes[0]!, afterDigest: null }],
    });
    expect(deletedFileInventory.changes[0]).toMatchObject({
      path: "apps/web/source.ts",
      afterDigest: null,
      classification: "UNREQUESTED_CHANGE",
    });
    expect(() =>
      buildSourceChangeInventory({
        ...inventoryInput,
        changes: [],
      })
    ).toThrow("SOURCE_CHANGE_MANIFEST_MISMATCH");
    expect(() =>
      buildSourceChangeInventory({
        ...inventoryInput,
        coverage: {
          ...inventoryInput.coverage,
          inclusionRoots: ["packages"],
        },
      })
    ).toThrow("SOURCE_MANIFEST_SCOPE_MISMATCH");
  });

  it("rejects active requirement evidence whose implementation manifest is stale", () => {
    const ready = makeReadyClosureFixture(
      compileRequirementClosureGraph(baseInput),
      { baseRevision: "git:fixture-base", prefix: "stale-evidence" }
    ).graph;
    const requirement = ready.requirements[0]!;
    expect(() =>
      validateRequirementClosureGraph({
        ...ready,
        requirements: ready.requirements.map(item =>
          item.id === requirement.id
            ? {
                ...item,
                evidence: item.evidence.map(evidence => ({
                  ...evidence,
                  implementationDigest: "b".repeat(64),
                })),
              }
            : item
        ),
      })
    ).toThrow("REQUIREMENT_EVIDENCE_STALE_NOT_INVALIDATED");
  });

  it("requires current WorkPackage evidence for every accepted derived verification obligation", () => {
    const derivation = {
      originFindingId: "finding:derived-check",
      originCampaignRef: "campaign:spec224",
      parentRequirementRef: baseInput.requirements[0]!.id,
      classification: "IMPLEMENTATION_DEFECT",
      reason:
        "A derived safety check is needed to close the parent requirement.",
      severity: "high" as const,
      requiredVerification: ["test:derived-check"],
      introducedAt: "2026-09-26T00:00:00.000Z",
      specAmendmentRef: null,
      status: "ACCEPTED" as const,
      decisionRef: "evidence:derived-decision",
    };
    const derivedId = deriveDerivedRequirementId(
      baseInput.baseline,
      derivation
    );
    const graph = compileRequirementClosureGraph({
      ...baseInput,
      planSections: baseInput.planSections.map(section => ({
        ...section,
        derivedRequirementIds: [derivedId],
      })),
      workPackages: baseInput.workPackages.map(workPackage => ({
        ...workPackage,
        derivedRequirementIds: [derivedId],
      })),
      derivedRequirements: [
        { ...derivation, id: derivedId, workPackageIds: [] },
      ],
    });
    const ready = makeReadyClosureFixture(graph, {
      baseRevision: "git:fixture-base",
      prefix: "derived-verification",
    }).graph;
    expect(() => assertFinalVerifyReady(ready)).toThrow(
      "DERIVED_REQUIREMENT_EVIDENCE_INCOMPLETE"
    );
    const packageRecord = ready.workPackages[0]!;
    const evidence = buildWorkPackageEvidenceBinding({
      graph: ready,
      workPackageId: packageRecord.id,
      evidenceRef: "evidence:derived-verification",
      verificationMethod: "test:derived-check",
      verifierRef: "reviewer:spec224-test",
      verifiedAt: "2026-09-26T00:00:00.000Z",
    });
    const withDerivedEvidence = {
      ...ready,
      workPackages: ready.workPackages.map(workPackage =>
        workPackage.id === packageRecord.id
          ? {
              ...workPackage,
              evidence: [...workPackage.evidence, evidence],
              evidenceRefs: [
                ...workPackage.evidenceRefs,
                evidence.evidenceRef,
              ].sort(),
            }
          : workPackage
      ),
    };
    expect(assertFinalVerifyReady(withDerivedEvidence)).toBe(true);
  });

  it("keeps Final Verify closed until all required requirements and blockers have current evidence", () => {
    const graph = compileRequirementClosureGraph(baseInput);
    expect(() => assertFinalVerifyReady(graph)).toThrow(
      "REQUIREMENT_NOT_TERMINAL"
    );
    const verified = makeReadyClosureFixture(graph, {
      baseRevision: "git:fixture-base",
      prefix: "closure-contracts",
    }).graph;
    const blocker = buildBlockerLedgerEntry({
      blockerId: "blocker:1",
      runId: "run:224-1",
      requirementRefs: [baseInput.requirements[0]!.id],
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
          { ...baseInput.requirements[0]!, text: "" },
          baseInput.requirements[1],
        ],
      })
    ).toThrow(Spec224ClosureError);
    expect(() =>
      buildBlockerLedgerEntry({
        blockerId: "blocker:invalid",
        runId: "run:224-1",
        requirementRefs: [baseInput.requirements[0]!.id],
        classification: "IMPLEMENTATION_DEFECT",
        severity: "unknown" as "high",
      })
    ).toThrow("BLOCKER_SEVERITY_INVALID");
  });
});
