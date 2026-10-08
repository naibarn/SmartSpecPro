import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  completeDevelopmentWorkUnit,
  createDevelopmentWorkUnit,
  recordCanonicalCheckpoint,
} from "./developmentLifecycleContracts";
import { MINI_APP_FACTORY_STATE_KEY, parseMiniAppFactoryDurableState } from "./miniAppFactoryDurableState";
import { executeMiniAppFactoryStages } from "./miniAppFactoryRunExecutor";
import type { MiniAppFactoryPipeline } from "./miniAppFactoryPipeline";
import { buildDevelopmentRun } from "./spec224DevelopmentRunContracts";

const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const pipeline: MiniAppFactoryPipeline = {
  schemaVersion: "mini-app-factory-pipeline.v1",
  pipelineId: "mini-app-factory-v1",
  stages: [
    { id: "SPEC", dependsOn: [] },
    { id: "SCAFFOLD", dependsOn: ["SPEC"] },
    { id: "IMPLEMENT", dependsOn: ["SCAFFOLD"] },
    { id: "TEST", dependsOn: ["IMPLEMENT"] },
    { id: "PACKAGE", dependsOn: ["TEST"] },
  ],
};

describe("Project Wiki reuse through the Mini App Factory", () => {
  it("executes SPEC → SCAFFOLD → IMPLEMENT → TEST → PACKAGE through the shared stage executor", () => {
    const appRoot = resolve(process.cwd(), "mini-apps/project-wiki-pages");
    const packageRoot = join(appRoot, "package");
    const manifest = readFileSync(join(packageRoot, "app.manifest.yaml"), "utf8");
    const workUnit = createDevelopmentWorkUnit({
      workId: "work:project-wiki-factory-reuse",
      projectId: "project-wiki-factory-reuse",
      repositoryId: "smartspecpro",
      source: { type: "feature", ref: "program:AUTONOMOUS_MINI_APP_FACTORY_PROGRAM" },
      objective: "Prove Project Wiki can traverse the shared Mini App Factory to PACKAGE.",
      ownership: { actor: "vitest", session: "project-wiki-factory-pipeline", harness: "vitest" },
      canonicalTarget: { kind: "git", locator: "refs/remotes/origin/main" },
      baseRevision: `git:${sourceSha}`,
    });
    workUnit.progress.remainingScope = pipeline.stages.map(stage => stage.id);
    let run = buildDevelopmentRun({
      runId: "project-wiki-factory-reuse-run",
      tenantId: "project-wiki-factory-tenant",
      actorId: 1,
      goal: "Execute Project Wiki through the shared Factory stages.",
      repositoryRef: "repo:smartspecpro",
      baseRevision: `git:${sourceSha}`,
      contextPackHash: "f".repeat(64),
      workspaceId: "project-wiki-factory-workspace",
      workUnit,
    });
    let revision = 0;
    const service = {
      get: async () => ({ run, revision, events: [] }),
      recordCanonicalCheckpoint: async (input: any) => {
        run = {
          ...run,
          workUnit: recordCanonicalCheckpoint(run.workUnit!, input.checkpoint),
          metadata: { ...run.metadata, ...input.checkpoint.runMetadata },
        };
        revision += 1;
        return { accepted: true, run, revision, event: null };
      },
      recordImplementationCompletion: async (input: any) => {
        run = {
          ...run,
          workUnit: completeDevelopmentWorkUnit(run.workUnit!, input.completion),
          metadata: { ...run.metadata, ...input.completion.runMetadata },
        };
        revision += 1;
        return { accepted: true, run, revision, event: null };
      },
    };
    const executed: string[] = [];

    const result = executeMiniAppFactoryStages({
      pipeline,
      service: service as any,
      run: { runId: run.runId, tenantId: run.tenantId, actorId: run.actorId },
      factoryIdentity: { programId: "AUTONOMOUS_MINI_APP_FACTORY_PROGRAM", miniAppId: "app_project_wiki_pages" },
      maxStages: 5,
      executeStage: async stageId => {
        executed.push(stageId);
        if (stageId === "SPEC") {
          expect(manifest).toContain("id: app_project_wiki_pages");
          expect(manifest).toContain("name: Project Wiki Pages");
          return { artifacts: ["factory-evidence:project-wiki:spec"] };
        }
        if (stageId === "SCAFFOLD") {
          for (const file of ["app.manifest.yaml", "ui.json", "actions.json", "README.md"]) {
            expect(() => readFileSync(join(packageRoot, file))).not.toThrow();
          }
          return { artifacts: ["factory-evidence:project-wiki:scaffold"] };
        }
        if (stageId === "IMPLEMENT") {
          for (const file of [
            "server/services/projectWikiPagesService.ts",
            "server/routers/projectWikiPages.ts",
            "client/src/pages/ProjectWikiPagesPage.tsx",
            "drizzle/0394_project_wiki_pages_mini_app.sql",
          ]) expect(() => readFileSync(resolve(process.cwd(), file))).not.toThrow();
          return { artifacts: ["factory-evidence:project-wiki:implementation"] };
        }
        if (stageId === "TEST") {
          execFileSync("pnpm", ["exec", "vitest", "run", "server/services/projectWikiPagesService.test.ts", "server/routers/projectWikiPages.test.ts", "client/src/pages/__tests__/ProjectWikiPagesPage.test.tsx"], {
            cwd: process.cwd(),
            env: { ...process.env, CI: "1" },
            stdio: "pipe",
          });
          return { artifacts: ["factory-evidence:project-wiki:focused-tests-passed"] };
        }
        const outputDir = mkdtempSync(join(tmpdir(), "project-wiki-factory-package-"));
        try {
          const stdout = execFileSync("pnpm", ["exec", "tsx", "scripts/build-mini-app-package.ts", "--package-root", packageRoot, "--output-dir", outputDir], {
            cwd: process.cwd(),
            env: { ...process.env, CI: "1" },
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
          });
          const report = JSON.parse(stdout.trim()) as { packageBuild: string; digest: string };
          expect(report.packageBuild).toBe("BUILT");
          expect(report.digest).toMatch(/^spaas-package-v1:sha256:[a-f0-9]{64}$/);
          return { artifacts: [`package-digest:${report.digest}`, "factory-evidence:project-wiki:package-built"] };
        } finally {
          rmSync(outputDir, { recursive: true, force: true });
        }
      },
    });

    return result.then(factoryResult => {
      expect(executed).toEqual(["SPEC", "SCAFFOLD", "IMPLEMENT", "TEST", "PACKAGE"]);
      expect(factoryResult.state).toBe("IMPLEMENTATION_SCOPE_COMPLETE");
      const state = parseMiniAppFactoryDurableState(run.metadata?.[MINI_APP_FACTORY_STATE_KEY]);
      expect(state).toMatchObject({
        programId: "AUTONOMOUS_MINI_APP_FACTORY_PROGRAM",
        miniAppId: "app_project_wiki_pages",
        completedStages: ["SPEC", "SCAFFOLD", "IMPLEMENT", "TEST", "PACKAGE"],
        nextEligibleStages: [],
      });
      expect(state.packageDigest).toMatch(/^spaas-package-v1:sha256:[a-f0-9]{64}$/);
      expect(run.workUnit?.progress.completedScope).toEqual(executed);
    });
  });
});
