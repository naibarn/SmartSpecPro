import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { createDevelopmentWorkUnit } from "./developmentLifecycleContracts";
import { createMiniAppFactoryDurableState, MINI_APP_FACTORY_STATE_KEY } from "./miniAppFactoryDurableState";
import type { MiniAppFactoryPipeline } from "./miniAppFactoryPipeline";
import { buildDevelopmentRun } from "./spec224DevelopmentRunContracts";
import { createMiniAppFactoryRunnerStage } from "./miniAppFactoryRunnerStageAdapter";

const pipeline: MiniAppFactoryPipeline = {
  schemaVersion: "mini-app-factory-pipeline.v1",
  pipelineId: "factory-adapter-test",
  stages: [{ id: "SPEC", dependsOn: [], inputs: ["requirements"], outputs: ["appSpec"], gate: "authoritative source" }],
};

function makeParent() {
  const sha = "a".repeat(40);
  const workUnit = createDevelopmentWorkUnit({
    workId: "factory-adapter-parent-work",
    projectId: "factory-project",
    repositoryId: "smartspecpro",
    source: { type: "feature", ref: "program:AUTONOMOUS_MINI_APP_FACTORY_PROGRAM" },
    objective: "Continue the Research Notes Factory program",
    ownership: { actor: "42", session: "session-ref", harness: "development-control" },
    canonicalTarget: { kind: "git", locator: "refs/heads/main" },
    baseRevision: sha,
  });
  workUnit.progress.remainingScope = ["SPEC"];
  workUnit.progress.immediatelyRunnableScope = ["SPEC"];
  const run = buildDevelopmentRun({
    runId: "factory-parent-run",
    tenantId: "tenant-real-ref",
    actorId: 42,
    goal: "Continue Research Notes",
    repositoryRef: "repo:smartspecpro",
    baseRevision: `git:${sha}`,
    contextPackHash: "b".repeat(64),
    workspaceId: "workspace-real-ref",
    workPackageId: "work-package-real-ref",
    workUnit,
    metadata: {
      [MINI_APP_FACTORY_STATE_KEY]: createMiniAppFactoryDurableState({
        programId: "AUTONOMOUS_MINI_APP_FACTORY_PROGRAM",
        miniAppId: "app_research_notes",
        sourceSha: sha,
      }),
    },
  });
  run.workerJobId = "parent-job-id";
  return run;
}

function parentManifest() {
  return {
    taskId: "authorized-parent-task",
    tenantId: "tenant-real-ref",
    actorId: 42,
    provider: "codex",
    runtime: "local_runner",
    workspaceId: "workspace-real-ref",
    workPackageId: "work-package-real-ref",
    planId: "approved-plan-ref",
    planRevision: 7,
    skillIds: ["approved-skill-ref"],
    requestedCapabilities: ["codex"],
    spec224Execution: { sourceFingerprint: "c".repeat(64), mode: "work_package", allowedWriteSet: ["apps/web/server/services/researchNotes/**"] },
  };
}

describe("Mini App Factory trusted Runner stage adapter", () => {
  it("constructs a staged child DevelopmentRun and creates it through deferred canonical admission", async () => {
    const parent = makeParent();
    const manifest = parentManifest();
    const stageInput = vi.fn(async (files: Array<{ path: string; contentBase64: string }>) => {
      expect(files[0]?.path).toBe("mini-app-factory-stage.json");
      const content = Buffer.from(files[0]!.contentBase64, "base64").toString("utf8");
      expect(JSON.parse(content)).toMatchObject({ parentRunId: parent.runId, stageId: "SPEC", sourceSha: "a".repeat(40) });
      return { inputSourceRef: "runner-input-source:staged-stage", inputDigest: createHash("sha256").update(content).digest("hex"), totalBytes: Buffer.byteLength(content) };
    });
    const createRun = vi.fn(async (value: any) => ({ run: { ...value.run, workerJobId: "child-job-id" }, jobRef: { jobId: "child-job-id", created: true } }));
    const bindInput = vi.fn(async () => true);
    const result = await createMiniAppFactoryRunnerStage({
      pipeline,
      stage: pipeline.stages[0]!,
      run: { runId: parent.runId, tenantId: parent.tenantId, actorId: parent.actorId },
      service: { get: async () => ({ run: parent, revision: 4, events: [] }) } as any,
      controlPlane: { getContext: async () => ({ jobType: "external_agent_task", input: { manifest } }) } as any,
      stageInput: async (files, startRef, tenantId) => {
        expect(startRef).toMatch(/^factory-run-[a-f0-9]{40}$/);
        expect(tenantId).toBe(parent.tenantId);
        return stageInput(files);
      },
      createRun: createRun as any,
      bindInput: bindInput as any,
    });

    expect(result).toMatchObject({ jobId: "child-job-id", created: true, state: "PENDING_AUTHORIZATION" });
    const input = createRun.mock.calls[0]![0] as any;
    expect(input).toMatchObject({ provider: "codex", runtime: "local_runner", planId: "approved-plan-ref", planRevision: 7, requestedCapabilities: ["codex"], deferredAdmission: true });
    expect(input.run.workPackageId).toBe("work-package-real-ref");
    expect(input.run.metadata.miniAppFactoryStage).toMatchObject({ parentRunId: parent.runId, stageId: "SPEC", programId: "AUTONOMOUS_MINI_APP_FACTORY_PROGRAM" });
    expect(input.run.metadata.spec224Input.inputDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(input.run.metadata.spec224Execution.allowedWriteSet).toEqual(manifest.spec224Execution.allowedWriteSet);
    expect(input.policyBinding).toBeUndefined();
    expect(bindInput).toHaveBeenCalledWith(expect.objectContaining({ tenantId: parent.tenantId, workerJobId: "child-job-id" }));
  });

  it("fails closed when the existing DevelopmentRun has no work-package and write-set authority", async () => {
    const parent = makeParent();
    const manifest = { ...parentManifest(), workPackageId: undefined, spec224Execution: undefined };
    const createRun = vi.fn();
    await expect(createMiniAppFactoryRunnerStage({
      pipeline,
      stage: pipeline.stages[0]!,
      run: { runId: parent.runId, tenantId: parent.tenantId, actorId: parent.actorId },
      service: { get: async () => ({ run: parent, revision: 4, events: [] }) } as any,
      controlPlane: { getContext: async () => ({ jobType: "external_agent_task", input: { manifest } }) } as any,
      createRun: createRun as any,
    })).rejects.toThrow("FACTORY_RUNNER_PARENT_AUTHORITY_REQUIRED");
    expect(createRun).not.toHaveBeenCalled();
  });

  it("analyzes integrity-bound screenshots and stages the vision blueprint only for requirements intake", async () => {
    const parent = makeParent();
    parent.metadata = { ...parent.metadata, spec224Input: { inputSourceRef: "source-ref", inputDigest: "d".repeat(64) } };
    const imageBytes = Buffer.from("screenshot fixture");
    const imageBase64 = imageBytes.toString("base64");
    const imageDigest = createHash("sha256").update(imageBytes).digest("hex");
    const videoBytes = Buffer.from("video fixture");
    const videoBase64 = videoBytes.toString("base64");
    const videoDigest = createHash("sha256").update(videoBytes).digest("hex");
    const manifest = {
      schemaVersion: "spec224-visual-reference-manifest.v1",
      trust: "untrusted-visual-evidence",
      designPreferences: { similarityMode: "close" },
      references: [
        { id: "shot-1", filePath: "design-references/screen.png", fileName: "screen.png", mimeType: "image/png", sha256: imageDigest, pageHint: "Dashboard", stateHint: "empty", viewportHint: "desktop" },
        { id: "video-1", filePath: "design-references/flow.mp4", fileName: "flow.mp4", mimeType: "video/mp4", sha256: videoDigest, pageHint: "Dashboard", stateHint: "menu open", viewportHint: "mobile" },
      ],
    };
    const analyzeVisualReferences = vi.fn(async (input: any) => ({
      blueprint: {
        schemaVersion: "mini-app-visual-blueprint.v1",
        summary: "Dashboard layout",
        pages: [{ page: "Dashboard", referenceIds: ["shot-1"], layout: "Sidebar and main content", hierarchy: ["Title", "Table"], components: [] }],
        designTokens: [], responsiveTargets: [], confidence: 0.8,
      },
      modelId: "enabled-vision-model",
      creditsUsed: 2,
      inputDigest: "e".repeat(64),
    }));
    const stagedFiles: Array<{ path: string; contentBase64: string }> = [];
    const createRun = vi.fn(async (value: any) => ({ run: { ...value.run, workerJobId: "child-job-id" }, jobRef: { jobId: "child-job-id", created: true } }));

    await createMiniAppFactoryRunnerStage({
      pipeline,
      stage: { id: "requirements_intake", dependsOn: [], inputs: ["requirements", "visualReferences"], outputs: ["requirements", "visualBlueprint"] },
      run: { runId: parent.runId, tenantId: parent.tenantId, actorId: parent.actorId },
      service: { get: async () => ({ run: parent, revision: 4, events: [] }) } as any,
      controlPlane: { getContext: async () => ({ jobType: "external_agent_task", input: { manifest: parentManifest() } }) } as any,
      getBoundSource: vi.fn(async (input: any) => {
        expect(input).toMatchObject({ tenantId: parent.tenantId, startRef: parent.runId, workerJobId: "parent-job-id", inputSourceRef: "source-ref", inputDigest: "d".repeat(64) });
        return { files: [
          { path: "visual-reference-manifest.json", contentBase64: Buffer.from(JSON.stringify(manifest)).toString("base64") },
          { path: "design-references/screen.png", contentBase64: imageBase64 },
          { path: "design-references/flow.mp4", contentBase64: videoBase64 },
        ] };
      }) as any,
      analyzeVisualReferences: analyzeVisualReferences as any,
      stageInput: async (files) => {
        stagedFiles.push(...files);
        return { inputSourceRef: "child-source", inputDigest: "f".repeat(64), totalBytes: 100 };
      },
      createRun: createRun as any,
      bindInput: vi.fn(async () => true) as any,
    });

    expect(analyzeVisualReferences).toHaveBeenCalledWith(expect.objectContaining({ userId: 42, tenantId: parent.tenantId, runId: parent.runId, designPreferences: manifest.designPreferences }));
    expect(analyzeVisualReferences.mock.calls[0]![0].references[0]).toMatchObject({ id: "shot-1", contentBase64: imageBase64, pageHint: "Dashboard", stateHint: "empty", viewportHint: "desktop" });
    expect(stagedFiles.map(file => file.path)).toEqual(expect.arrayContaining(["mini-app-factory-stage.json", "visual-reference-manifest.json", "design-references/screen.png", "design-references/flow.mp4", "visual-blueprint.json"]));
    expect(JSON.parse(Buffer.from(stagedFiles.find(file => file.path === "mini-app-factory-stage.json")!.contentBase64, "base64").toString("utf8"))).toMatchObject({ visualBlueprintRequired: true, visualBlueprintDigest: "e".repeat(64), visualBlueprintModelId: "enabled-vision-model", visualBlueprintOutputPath: "visual-blueprint.json" });
    expect(createRun.mock.calls[0]![0].run.goal).toContain("immutable staged visual-blueprint.json");
  });

  it("adds bounded visual comparison and repair to the existing UAT stage when references exist", async () => {
    const parent = makeParent();
    parent.metadata = { ...parent.metadata, spec224Input: { inputSourceRef: "source-ref", inputDigest: "d".repeat(64) } };
    const bytes = Buffer.from("reference image");
    const base64 = bytes.toString("base64");
    const digest = createHash("sha256").update(bytes).digest("hex");
    const manifest = { schemaVersion: "spec224-visual-reference-manifest.v1", trust: "untrusted-visual-evidence", references: [{ id: "shot", filePath: "design-references/page.png", fileName: "page.png", mimeType: "image/png", sha256: digest, viewportHint: "desktop" }] };
    let stageDocument: any;
    const createRun = vi.fn(async (value: any) => ({ run: { ...value.run, workerJobId: "child-job-id" }, jobRef: { jobId: "child-job-id", created: true } }));
    await createMiniAppFactoryRunnerStage({
      pipeline,
      stage: { id: "uat", dependsOn: [], inputs: ["fixture", "references"], outputs: ["journeyEvidence", "visualComparison"] },
      run: { runId: parent.runId, tenantId: parent.tenantId, actorId: parent.actorId },
      service: { get: async () => ({ run: parent, revision: 4, events: [] }) } as any,
      controlPlane: { getContext: async () => ({ jobType: "external_agent_task", input: { manifest: parentManifest() } }) } as any,
      getBoundSource: vi.fn(async () => ({ files: [
        { path: "visual-reference-manifest.json", contentBase64: Buffer.from(JSON.stringify(manifest)).toString("base64") },
        { path: "design-references/page.png", contentBase64: base64 },
      ] })) as any,
      analyzeVisualReferences: vi.fn() as any,
      stageInput: async files => {
        stageDocument = JSON.parse(Buffer.from(files[0]!.contentBase64, "base64").toString("utf8"));
        return { inputSourceRef: "child-source", inputDigest: "f".repeat(64), totalBytes: 100 };
      },
      createRun: createRun as any,
      bindInput: vi.fn(async () => true) as any,
    });

    expect(stageDocument.visualUat).toMatchObject({ maxRepairRounds: 2, referenceManifestPath: "visual-reference-manifest.json", browser: "existing-authorized-runner-browser-capability" });
    expect(createRun.mock.calls[0]![0].run.goal).toContain("per-viewport visual comparison report");
    expect(createRun.mock.calls[0]![0].run.goal).toContain("at most two focused repair rounds");
    expect(createRun.mock.calls[0]![0].run.goal).toContain("report UNVERIFIED");
  });

  it("re-stages the same integrity-bound blueprint for downstream generation stages", async () => {
    const parent = makeParent();
    const blueprint = {
      schemaVersion: "mini-app-visual-blueprint.v1",
      summary: "Settings overview",
      pages: [{ page: "Settings", referenceIds: ["shot"], layout: "Sidebar and form", hierarchy: ["Title", "Form"], components: [] }],
      designTokens: [], responsiveTargets: [], confidence: 0.8,
    };
    const blueprintBytes = Buffer.from(JSON.stringify(blueprint));
    const blueprintBase64 = blueprintBytes.toString("base64");
    const blueprintSha = createHash("sha256").update(blueprintBytes).digest("hex");
    parent.metadata = {
      ...parent.metadata,
      spec224Input: { inputSourceRef: "source-ref", inputDigest: "d".repeat(64) },
      spec224VisualBlueprint: { schemaVersion: "mini-app-visual-blueprint.v1", sha256: blueprintSha, modelId: "enabled/vision", inputDigest: "e".repeat(64) },
    };
    const image = Buffer.from("reference image");
    const manifest = { schemaVersion: "spec224-visual-reference-manifest.v1", trust: "untrusted-visual-evidence", references: [{ id: "shot", filePath: "design-references/page.png", fileName: "page.png", mimeType: "image/png", sha256: createHash("sha256").update(image).digest("hex") }] };
    const stagedPaths: string[] = [];
    const createRun = vi.fn(async (value: any) => ({ run: { ...value.run, workerJobId: "child-job-id" }, jobRef: { jobId: "child-job-id", created: true } }));

    await createMiniAppFactoryRunnerStage({
      pipeline,
      stage: { id: "ui_implementation", dependsOn: ["spec_compile"], inputs: ["appSpec", "visualBlueprint"], outputs: ["appSource"] },
      run: { runId: parent.runId, tenantId: parent.tenantId, actorId: parent.actorId },
      service: { get: async () => ({ run: parent, revision: 4, events: [] }) } as any,
      controlPlane: { getContext: async () => ({ jobType: "external_agent_task", input: { manifest: parentManifest() } }) } as any,
      getBoundSource: vi.fn(async () => ({ files: [
        { path: "visual-reference-manifest.json", contentBase64: Buffer.from(JSON.stringify(manifest)).toString("base64") },
        { path: "design-references/page.png", contentBase64: image.toString("base64") },
        { path: "visual-blueprint.json", contentBase64: blueprintBase64 },
      ] })) as any,
      analyzeVisualReferences: vi.fn() as any,
      stageInput: async files => {
        stagedPaths.push(...files.map(file => file.path));
        const received = files.find(file => file.path === "visual-blueprint.json");
        expect(received?.contentBase64).toBe(blueprintBase64);
        return { inputSourceRef: "child-source", inputDigest: "f".repeat(64), totalBytes: 100 };
      },
      createRun: createRun as any,
      bindInput: vi.fn(async () => true) as any,
    });

    expect(stagedPaths).toContain("visual-blueprint.json");
    expect(createRun.mock.calls[0]![0].run.goal).toContain("apply the immutable staged visual-blueprint.json");
    expect(createRun.mock.calls[0]![0].run.goal).toContain("page mapping, layout, components, design tokens, and responsive targets");
    expect(createRun.mock.calls[0]![0].run.metadata.spec224VisualBlueprint).toEqual({
      schemaVersion: "mini-app-visual-blueprint.v1",
      sha256: blueprintSha,
      modelId: "enabled/vision",
      inputDigest: "e".repeat(64),
    });
  });
});
