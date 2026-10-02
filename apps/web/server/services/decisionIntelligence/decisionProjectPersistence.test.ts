import { describe, expect, it } from "vitest";

import {
  createDecisionProjectPersistence,
  type DecisionProjectPersistenceQuery,
} from "./decisionProjectPersistence";

const ownerA = { tenantId: "tenant-a", ownerPrincipalId: "owner-a" } as const;
const ownerB = { tenantId: "tenant-a", ownerPrincipalId: "owner-b" } as const;
const tenantB = { tenantId: "tenant-b", ownerPrincipalId: "owner-a" } as const;

function projectPayload(overrides: Record<string, unknown> = {}) {
  return {
    version: "decision-project-v1",
    domainRefs: ["domain:land"],
    geographyRefs: ["geo:TH-10"],
    geometryRefs: ["geometry:parcel-1"],
    goal: "Compare permitted, evidence-backed land options.",
    ...overrides,
  };
}

function runSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    version: "decision-analysis-run-v1",
    decisionTemplateVersion: "template:land-v2",
    decisionInputRef: "decision-input:project-1-v1",
    dataRequirementRefs: ["requirement:flood-risk"],
    evidenceBindingRefs: ["binding:flood-risk-v1"],
    sourceEvidenceReceiptRefs: ["evidence:receipt-1"],
    queryRefs: ["query:flood-v1"],
    geometryRefs: ["geometry:parcel-1"],
    transformationRefs: ["transform:normalization-v1"],
    calculationVersion: "calculator:land-v3",
    modelProviderVersions: ["provider:model-v1"],
    assumptionRefs: ["assumption:market-stable"],
    unresolvedConflictRefs: [],
    missingEvidenceRefs: [],
    outputArtifactRefs: ["artifact:decision-report-1"],
    costAttributionRef: "cost:run-1",
    policyContextRef: "policy:land-v1",
    analysisAsOf: "2026-10-02T00:00:00.000Z",
    ...overrides,
  };
}

type ProjectRow = {
  id: string;
  tenantId: string;
  ownerPrincipalId: string;
  title: string;
  status: string;
  projectJson: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};
type RunRow = {
  id: string;
  tenantId: string;
  projectId: string;
  runNumber: number;
  status: string;
  researchRequestId: string | null;
  snapshotJson: Record<string, unknown>;
  createdAt: Date;
};

function queryHarness(seed: { projects?: ProjectRow[]; runs?: RunRow[] } = {}) {
  const projects = [...(seed.projects ?? [])];
  const runs = [...(seed.runs ?? [])];
  let projectCounter = projects.length;
  const query: DecisionProjectPersistenceQuery = {
    async insertProject(input) {
      const row: ProjectRow = {
        id: `project-${++projectCounter}`,
        tenantId: input.tenantId,
        ownerPrincipalId: input.ownerPrincipalId,
        title: input.title,
        status: input.status,
        projectJson: structuredClone(input.projectJson),
        createdAt: new Date("2026-10-02T00:00:00.000Z"),
        updatedAt: new Date("2026-10-02T00:00:00.000Z"),
      };
      projects.push(row);
      return structuredClone(row);
    },
    async listProjects(scope) {
      return projects.filter(row => row.tenantId === scope.tenantId && row.ownerPrincipalId === scope.ownerPrincipalId)
        .map(row => structuredClone(row));
    },
    async findProject(scope) {
      const row = projects.find(item => item.id === scope.projectId && item.tenantId === scope.tenantId && item.ownerPrincipalId === scope.ownerPrincipalId);
      return row && structuredClone(row);
    },
    async updateProjectStatus(input) {
      const row = projects.find(item => item.id === input.projectId && item.tenantId === input.tenantId && item.ownerPrincipalId === input.ownerPrincipalId);
      if (!row) return undefined;
      row.status = input.status;
      row.updatedAt = new Date("2026-10-02T00:01:00.000Z");
      return structuredClone(row);
    },
    async listAnalysisRuns(scope) {
      return runs.filter(row => row.tenantId === scope.tenantId && row.projectId === scope.projectId)
        .sort((left, right) => left.runNumber - right.runNumber).map(row => structuredClone(row));
    },
    async appendAnalysisRunAtomically(input) {
      const authorizedProject = projects.find(row => row.id === input.projectId && row.tenantId === input.tenantId && row.ownerPrincipalId === input.ownerPrincipalId);
      if (!authorizedProject) return undefined;
      const existing = runs.find(row => row.id === input.analysisRunId && row.tenantId === input.tenantId && row.projectId === input.projectId);
      if (existing) {
        const same = existing.status === input.status && existing.researchRequestId === (input.researchRequestId ?? null) && JSON.stringify(existing.snapshotJson) === JSON.stringify(input.snapshotJson);
        if (!same) throw new Error("DECISION_ANALYSIS_RUN_REPLAY_CONFLICT");
        return { created: false, run: structuredClone(existing) };
      }
      const runNumber = runs.filter(row => row.projectId === input.projectId).reduce((max, row) => Math.max(max, row.runNumber), 0) + 1;
      const row: RunRow = {
        id: input.analysisRunId,
        tenantId: input.tenantId,
        projectId: input.projectId,
        runNumber,
        status: input.status,
        researchRequestId: input.researchRequestId ?? null,
        snapshotJson: structuredClone(input.snapshotJson),
        createdAt: new Date("2026-10-02T00:00:00.000Z"),
      };
      runs.push(row);
      return { created: true, run: structuredClone(row) };
    },
  };
  return { query, projects, runs };
}

describe("DecisionProject persistence", () => {
  it("rejects empty/oversized project fields and non-reference project payloads before a database write", async () => {
    const { query } = queryHarness();
    const repository = createDecisionProjectPersistence({ query });

    await expect(repository.createProject({ authority: ownerA, title: "  ", projectJson: projectPayload() }))
      .rejects.toThrow("DECISION_PROJECT_TITLE_INVALID");
    await expect(repository.createProject({ authority: ownerA, title: "x".repeat(201), projectJson: projectPayload() }))
      .rejects.toThrow("DECISION_PROJECT_TITLE_INVALID");
    await expect(repository.createProject({ authority: ownerA, title: "Valid", projectJson: projectPayload({ evidence: { claimedTruth: true } }) }))
      .rejects.toThrow("DECISION_PROJECT_PAYLOAD_INVALID");
    await expect(repository.createProject({ authority: ownerA, title: "Valid", projectJson: projectPayload({ version: "future-project-v2" }) as any }))
      .rejects.toThrow("DECISION_PROJECT_PAYLOAD_INVALID");
    await expect(repository.createProject({ authority: ownerA, title: "Valid", projectJson: projectPayload({ goal: "x".repeat(70_000) }) }))
      .rejects.toThrow("DECISION_PROJECT_PAYLOAD_TOO_LARGE");
  });

  it("keeps create/list/get/status operations tenant and owner scoped", async () => {
    const harness = queryHarness();
    const repository = createDecisionProjectPersistence({ query: harness.query });
    const project = await repository.createProject({ authority: ownerA, title: "Parcel decision", projectJson: projectPayload() });
    await repository.createProject({ authority: ownerB, title: "Other owner", projectJson: projectPayload() });

    await expect(repository.listProjects({ authority: ownerA })).resolves.toHaveLength(1);
    await expect(repository.listProjects({ authority: ownerB })).resolves.toHaveLength(1);
    await expect(repository.listProjects({ authority: tenantB })).resolves.toHaveLength(0);
    await expect(repository.getProject({ authority: ownerB, projectId: project.id })).resolves.toBeUndefined();
    await expect(repository.getProject({ authority: tenantB, projectId: project.id })).resolves.toBeUndefined();
    await expect(repository.updateProjectStatus({ authority: ownerB, projectId: project.id, status: "analyzing" }))
      .resolves.toBeUndefined();
    await expect(repository.updateProjectStatus({ authority: ownerA, projectId: project.id, status: "analyzing" }))
      .resolves.toMatchObject({ status: "analyzing" });
  });

  it("appends immutable analysis history with unique run numbers and exact tenant/project ownership", async () => {
    const harness = queryHarness();
    const repository = createDecisionProjectPersistence({ query: harness.query });
    const project = await repository.createProject({ authority: ownerA, title: "Parcel decision", projectJson: projectPayload() });

    await expect(repository.appendAnalysisRun({ authority: tenantB, projectId: project.id, analysisRunId: "analysis-run-1", status: "queued", snapshotJson: runSnapshot() }))
      .rejects.toThrow("DECISION_PROJECT_NOT_FOUND");
    await expect(repository.appendAnalysisRun({ authority: ownerB, projectId: project.id, analysisRunId: "analysis-run-1", status: "queued", snapshotJson: runSnapshot() }))
      .rejects.toThrow("DECISION_PROJECT_NOT_FOUND");
    const first = await repository.appendAnalysisRun({ authority: ownerA, projectId: project.id, analysisRunId: "analysis-run-1", status: "queued", snapshotJson: runSnapshot() });
    const second = await repository.appendAnalysisRun({ authority: ownerA, projectId: project.id, analysisRunId: "analysis-run-2", status: "completed", snapshotJson: runSnapshot({ analysisAsOf: "2026-10-02T01:00:00.000Z" }) });

    expect([first.run.runNumber, second.run.runNumber]).toEqual([1, 2]);
    expect((await repository.listAnalysisRuns({ authority: ownerA, projectId: project.id })).map(run => run.status))
      .toEqual(["queued", "completed"]);
    await expect(repository.listAnalysisRuns({ authority: ownerB, projectId: project.id })).resolves.toEqual([]);
    expect(harness.runs[0]?.snapshotJson).toEqual(runSnapshot());
    expect(Object.keys(repository).some(key => /update|delete/i.test(key) && /run/i.test(key))).toBe(false);
  });

  it("serializes concurrent append numbering and idempotently returns the same immutable run id", async () => {
    const harness = queryHarness();
    const repository = createDecisionProjectPersistence({ query: harness.query });
    const project = await repository.createProject({ authority: ownerA, title: "Parcel decision", projectJson: projectPayload() });

    const [first, second] = await Promise.all([
      repository.appendAnalysisRun({ authority: ownerA, projectId: project.id, analysisRunId: "analysis-run-a", status: "queued", snapshotJson: runSnapshot() }),
      repository.appendAnalysisRun({ authority: ownerA, projectId: project.id, analysisRunId: "analysis-run-b", status: "queued", snapshotJson: runSnapshot({ analysisAsOf: "2026-10-02T00:01:00.000Z" }) }),
    ]);
    expect([first.run.runNumber, second.run.runNumber].sort()).toEqual([1, 2]);

    const replay = await repository.appendAnalysisRun({ authority: ownerA, projectId: project.id, analysisRunId: "analysis-run-a", status: "queued", snapshotJson: runSnapshot() });
    expect(replay).toEqual({ created: false, run: first.run });
    await expect(repository.appendAnalysisRun({ authority: ownerA, projectId: project.id, analysisRunId: "analysis-run-a", status: "failed", snapshotJson: runSnapshot() }))
      .rejects.toThrow("DECISION_ANALYSIS_RUN_REPLAY_CONFLICT");
    expect(harness.runs).toHaveLength(2);
  });

  it("rejects malformed, oversized and truth-duplicating analysis snapshots", async () => {
    const harness = queryHarness();
    const repository = createDecisionProjectPersistence({ query: harness.query });
    const project = await repository.createProject({ authority: ownerA, title: "Parcel decision", projectJson: projectPayload() });

    await expect(repository.appendAnalysisRun({ authority: ownerA, projectId: project.id, analysisRunId: "analysis-run-invalid", status: "queued", snapshotJson: runSnapshot({ evidence: { raw: "claim" } }) }))
      .rejects.toThrow("DECISION_ANALYSIS_SNAPSHOT_INVALID");
    await expect(repository.appendAnalysisRun({ authority: ownerA, projectId: project.id, analysisRunId: "analysis-run-too-large", status: "queued", snapshotJson: runSnapshot({ outputArtifactRefs: ["x".repeat(270_000)] }) }))
      .rejects.toThrow("DECISION_ANALYSIS_SNAPSHOT_TOO_LARGE");
  });
});
