import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  createDevelopmentWorkUnit,
  type DevelopmentDependencyContract,
} from "../developmentLifecycleContracts";
import { registerDevelopmentLifecyclePredicate } from "../developmentLifecyclePredicateRegistry";
import {
  DEVELOPMENT_RUN_ELIGIBILITY_SCHEMA,
  evaluateDevelopmentRunEligibility,
  type DevelopmentRunEligibilityInput,
  type VerifiedDevelopmentEligibilityEvidence,
  type VerifiedDevelopmentOwnershipEvidence,
} from "../developmentRunEligibility";

const NOW = "2026-10-09T12:00:00.000Z";
const SOURCE = "a".repeat(40);
const TENANT = "tenant-1";
const RUN_ID = "run-1";
const WORK_ID = "work-1";

function dependency(
  overrides: Partial<DevelopmentDependencyContract> = {}
): DevelopmentDependencyContract {
  return {
    dependencyId: "dep-1",
    consumerWorkId: WORK_ID,
    projectId: "project-1",
    requirement: { type: "api-contract", locator: "api:v1" },
    satisfaction: {
      predicateId: "test:api-v1",
      evidenceSource: "worker_job_events",
    },
    waitPolicy: {
      eventFirst: true,
      pollingFallback: true,
      timeoutIsTerminal: false,
    },
    wake: {
      resumeWorkId: WORK_ID,
      resumeFrom: "IMPLEMENT",
      eventTypes: ["DEVELOPMENT_EVIDENCE"],
    },
    fallback: {
      rediscoverProducer: true,
      alternateRouteAllowed: true,
      continueIndependentWork: true,
    },
    blockedScope: ["IMPLEMENT"],
    state: "SATISFIED",
    watcher: {
      watcherId: "watch-1",
      status: "ACTIVE",
      registeredAt: "2026-10-09T11:00:00.000Z",
      lastCheckedAt: "2026-10-09T11:55:00.000Z",
      lastEvidenceRef: "event:dep-1",
    },
    ...overrides,
  };
}

function makeWorkUnit(dependencies: DevelopmentDependencyContract[] = []) {
  return {
    ...createDevelopmentWorkUnit({
      workId: WORK_ID,
      projectId: "project-1",
      repositoryId: "repo-1",
      source: { type: "feature", ref: "spec:224" },
      objective: "Continue an authorized DevelopmentRun",
      ownership: { actor: "owner-7", session: "session-1", harness: "codex" },
      canonicalTarget: { kind: "git", locator: "refs/heads/main" },
      baseRevision: SOURCE,
      createdAt: "2026-10-09T10:00:00.000Z",
    }),
    dependencies,
  };
}

function ownership(
  overrides: Partial<VerifiedDevelopmentOwnershipEvidence> = {}
): VerifiedDevelopmentOwnershipEvidence {
  return {
    schemaVersion: "development-lifecycle-ownership.v1",
    tenantId: TENANT,
    developmentRunId: RUN_ID,
    workUnitId: WORK_ID,
    ownerId: "owner-7",
    resolverId: "project-owner-registry",
    evidenceRef: "ownership:owner-7:work-1",
    sourceRevision: SOURCE,
    verifiedAt: "2026-10-09T11:50:00.000Z",
    validUntil: "2026-10-09T12:10:00.000Z",
    conflictRefs: [],
    ...overrides,
  };
}

function dependencyEvidence(
  dependencyId = "dep-1",
  overrides: Partial<VerifiedDevelopmentEligibilityEvidence> = {}
): VerifiedDevelopmentEligibilityEvidence {
  return {
    dependencyId,
    tenantId: TENANT,
    developmentRunId: RUN_ID,
    workUnitId: WORK_ID,
    sourceRevision: SOURCE,
    verifiedAt: "2026-10-09T11:55:00.000Z",
    validUntil: "2026-10-09T12:05:00.000Z",
    evidence: {
      source: "worker_job_events",
      reference: "event:dep-1",
      projectId: "project-1",
      requirementType: "api-contract",
      locator: "api:v1",
      revision: "api-revision:1",
      satisfiesMinimumRevision: true,
      observedAt: "2026-10-09T11:54:00.000Z",
    },
    ...overrides,
  };
}

function input(
  overrides: Partial<DevelopmentRunEligibilityInput> = {}
): DevelopmentRunEligibilityInput {
  return {
    tenantId: TENANT,
    developmentRunId: RUN_ID,
    sourceRevision: SOURCE,
    evaluatedAt: NOW,
    run: {
      runId: RUN_ID,
      tenantId: TENANT,
      state: "IMPLEMENT",
      workUnit: makeWorkUnit(),
    },
    ownership: ownership(),
    dependencyEvidence: [],
    ...overrides,
  };
}

function register(predicateId = "test:api-v1") {
  return registerDevelopmentLifecyclePredicate({
    predicateId,
    verifyEvidence: async ({ evidence }) => evidence,
    recheck: async () => null,
  });
}

describe("DevelopmentRun eligibility contract v1", () => {
  it("returns a versioned advisory READY result for a bound owner and current run", () => {
    const result = evaluateDevelopmentRunEligibility(input());
    expect(result).toMatchObject({
      schemaVersion: DEVELOPMENT_RUN_ELIGIBILITY_SCHEMA,
      state: "READY",
      advisory: true,
      sourceRevision: SOURCE,
      workUnit: {
        domain: "project-1",
        durableKind: "SPEC224_DEVELOPMENT_RUN",
        durableId: RUN_ID,
        tenantId: TENANT,
      },
      ownership: { ownerId: "owner-7", adapterId: "project-owner-registry" },
      reasonCodes: [],
    });
  });

  it("fails closed when there is no durable DevelopmentRun", () => {
    const result = evaluateDevelopmentRunEligibility(
      input({ run: null, ownership: null })
    );
    expect(result).toMatchObject({
      state: "INELIGIBLE",
      workUnit: null,
      advisory: true,
    });
    expect(result.reasonCodes).toContain("DEVELOPMENT_RUN_REQUIRED");
  });

  it("rejects tenant mismatch and non-admissible run states", () => {
    expect(
      evaluateDevelopmentRunEligibility(
        input({
          tenantId: "tenant-other",
        })
      ).reasonCodes
    ).toContain("TENANT_BINDING_MISMATCH");
    expect(
      evaluateDevelopmentRunEligibility(
        input({
          run: { ...input().run!, state: "PAUSED_POLICY" },
        })
      ).reasonCodes
    ).toContain("DEVELOPMENT_RUN_STATE_NOT_ADMISSIBLE");
  });

  it("requires an exact source revision matching the current durable work unit", () => {
    const result = evaluateDevelopmentRunEligibility(
      input({ sourceRevision: "b".repeat(40) })
    );
    expect(result.state).toBe("STALE_EVIDENCE");
    expect(result.reasonCodes).toContain("SOURCE_REVISION_MISMATCH");
  });

  it("returns OWNER_REQUIRED when there is no verified ownership evidence", () => {
    const result = evaluateDevelopmentRunEligibility(
      input({ ownership: null })
    );
    expect(result.state).toBe("OWNER_REQUIRED");
    expect(result.reasonCodes).toContain("OWNER_EVIDENCE_REQUIRED");
  });

  it("returns OWNERSHIP_CONFLICT for unresolved competing owners", () => {
    const result = evaluateDevelopmentRunEligibility(
      input({
        ownership: ownership({ conflictRefs: ["owner-record:conflict-2"] }),
      })
    );
    expect(result.state).toBe("OWNERSHIP_CONFLICT");
    expect(result.ownership?.conflictRefs).toEqual(["owner-record:conflict-2"]);
  });

  it("fails closed for malformed ownership conflict data", () => {
    const malformed = ownership({ conflictRefs: null as unknown as string[] });
    const result = evaluateDevelopmentRunEligibility(
      input({ ownership: malformed })
    );
    expect(result.state).toBe("INELIGIBLE");
    expect(result.reasonCodes).toContain("OWNER_EVIDENCE_BINDING_MISMATCH");
  });

  it("rejects ownership evidence bound to another tenant, run, or actor", () => {
    for (const mismatch of [
      { tenantId: "tenant-other" },
      { developmentRunId: "run-other" },
      { ownerId: "owner-other" },
    ]) {
      const result = evaluateDevelopmentRunEligibility(
        input({ ownership: ownership(mismatch) })
      );
      expect(result.state).toBe("INELIGIBLE");
      expect(result.reasonCodes).toContain("OWNER_EVIDENCE_BINDING_MISMATCH");
    }
    expect(
      evaluateDevelopmentRunEligibility(
        input({
          ownership: ownership({ sourceRevision: "b".repeat(40) }),
        })
      ).state
    ).toBe("STALE_EVIDENCE");
  });

  it("rejects expired or future ownership evidence", () => {
    expect(
      evaluateDevelopmentRunEligibility(
        input({
          ownership: ownership({ validUntil: "2026-10-09T11:59:59.000Z" }),
        })
      ).state
    ).toBe("STALE_EVIDENCE");
    expect(
      evaluateDevelopmentRunEligibility(
        input({
          ownership: ownership({ verifiedAt: "2026-10-09T12:01:00.000Z" }),
        })
      ).state
    ).toBe("STALE_EVIDENCE");
  });

  it("returns ADAPTER_UNAVAILABLE when a dependency predicate is missing", () => {
    const result = evaluateDevelopmentRunEligibility(
      input({
        run: { ...input().run!, workUnit: makeWorkUnit([dependency()]) },
        dependencyEvidence: [dependencyEvidence()],
      })
    );
    expect(result.state).toBe("ADAPTER_UNAVAILABLE");
    expect(result.reasonCodes).toContain("DEPENDENCY_PREDICATE_UNAVAILABLE");
  });

  it("returns WAITING_DEPENDENCY for an unsatisfied dependency with a registered active watcher", () => {
    const dispose = register();
    try {
      const result = evaluateDevelopmentRunEligibility(
        input({
          run: {
            ...input().run!,
            workUnit: makeWorkUnit([dependency({ state: "UNSATISFIED" })]),
          },
        })
      );
      expect(result.state).toBe("WAITING_DEPENDENCY");
      expect(result.reasonCodes).toContain("DEPENDENCY_UNSATISFIED");
    } finally {
      dispose();
    }
  });

  it("returns WAITING_AUTHORITY for a capability dependency with a recheckable predicate", () => {
    const dispose = register();
    try {
      const result = evaluateDevelopmentRunEligibility(
        input({
          run: {
            ...input().run!,
            workUnit: makeWorkUnit([
              dependency({
                requirement: {
                  type: "capability",
                  locator: "capability:trusted-runner",
                },
                state: "UNSATISFIED",
              }),
            ]),
          },
        })
      );
      expect(result.state).toBe("WAITING_AUTHORITY");
      expect(result.reasonCodes).toContain("AUTHORITY_UNSATISFIED");
    } finally {
      dispose();
    }
  });

  it("returns ADAPTER_UNAVAILABLE when an unsatisfied dependency lacks a watcher", () => {
    const dispose = register();
    try {
      const result = evaluateDevelopmentRunEligibility(
        input({
          run: {
            ...input().run!,
            workUnit: makeWorkUnit([
              dependency({
                state: "UNSATISFIED",
                watcher: { ...dependency().watcher, status: "MISSING" },
              }),
            ]),
          },
        })
      );
      expect(result.state).toBe("ADAPTER_UNAVAILABLE");
      expect(result.reasonCodes).toContain("DEPENDENCY_WATCHER_UNAVAILABLE");
    } finally {
      dispose();
    }
  });

  it("returns STALE_EVIDENCE when satisfied dependency evidence is stale or wrongly bound", () => {
    const dispose = register();
    try {
      const run = { ...input().run!, workUnit: makeWorkUnit([dependency()]) };
      const stale = evaluateDevelopmentRunEligibility(
        input({
          run,
          dependencyEvidence: [
            dependencyEvidence("dep-1", {
              validUntil: "2026-10-09T11:59:59.000Z",
            }),
          ],
        })
      );
      expect(stale.state).toBe("STALE_EVIDENCE");
      const mismatch = evaluateDevelopmentRunEligibility(
        input({
          run,
          dependencyEvidence: [
            dependencyEvidence("dep-1", { developmentRunId: "run-other" }),
          ],
        })
      );
      expect(mismatch.state).toBe("INELIGIBLE");
      expect(mismatch.reasonCodes).toContain(
        "DEPENDENCY_EVIDENCE_BINDING_MISMATCH"
      );
    } finally {
      dispose();
    }
  });

  it("requires current predicate-backed evidence before a satisfied dependency is READY", () => {
    const dispose = register();
    try {
      const result = evaluateDevelopmentRunEligibility(
        input({
          run: { ...input().run!, workUnit: makeWorkUnit([dependency()]) },
          dependencyEvidence: [dependencyEvidence()],
        })
      );
      expect(result.state).toBe("READY");
      expect(result.evidence.map(item => item.reference)).toEqual([
        "ownership:owner-7:work-1",
        "event:dep-1",
      ]);
    } finally {
      dispose();
    }
  });

  it("keeps SPEC-038's closed continuation recommendation ineligible without a durable run", () => {
    const manifestUrl = new URL(
      "../../../../../specs/feature/038-Citation-Gated-Content-Quality/handoff/manifest.json",
      import.meta.url
    );
    const manifest = JSON.parse(readFileSync(manifestUrl, "utf8")) as {
      continuation: { next_ready_workunit: string };
    };
    expect(manifest.continuation.next_ready_workunit).toBe(
      "NONE_CURRENT_CMS_KPI_DATA_AUTHORITY_BLOCKED"
    );
    const result = evaluateDevelopmentRunEligibility(
      input({ run: null, ownership: null })
    );
    expect(result.state).toBe("INELIGIBLE");
    expect(result.advisory).toBe(true);
    expect(result.reasonCodes).toContain("DEVELOPMENT_RUN_REQUIRED");
  });
});
