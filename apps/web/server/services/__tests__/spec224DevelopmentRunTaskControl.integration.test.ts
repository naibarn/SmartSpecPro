import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { promisify } from "node:util";

import postgres from "postgres";
import { afterEach, describe, expect, it } from "vitest";

import { closeDb } from "../../db";
import { createSpec277DisposablePostgres } from "./support/spec277DisposablePostgres";
import { installSpec277AutoTeamRuntimeSchema } from "./support/spec277AutoTeamRuntimeSchema";

const execFileAsync = promisify(execFile);

describe("Spec 224 DevelopmentRun synthetic implementation and Task Control — PostgreSQL", () => {
  afterEach(async () => closeDb());

  it("executes the persisted phase lifecycle through bounded repair and refuses Final Verify without workspace receipts", async () => {
    if (process.env.DATABASE_URL)
      throw new Error("SPEC224_REFUSES_INHERITED_DATABASE_URL");

    const fixture = await createSpec277DisposablePostgres();
    const client = postgres(fixture.databaseUrl, { max: 3, connect_timeout: 3 });
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const priorPg = {
      PGHOST: process.env.PGHOST,
      PGPORT: process.env.PGPORT,
      PGUSER: process.env.PGUSER,
      PGPASSWORD: process.env.PGPASSWORD,
    };

    try {
      await fixture.assertOwned();
      await client.unsafe("CREATE EXTENSION IF NOT EXISTS pgcrypto");
      await installSpec277AutoTeamRuntimeSchema(client);
      await client.unsafe("CREATE TABLE users (id integer PRIMARY KEY)");
      await client.unsafe("INSERT INTO users (id) VALUES (22401)");
      await client.unsafe(`CREATE TABLE tenant_data_transfer_plans (
        "operationId" varchar(36), "tenantId" varchar(36), "sourceUserId" integer
      )`);
      await client.unsafe(`CREATE TABLE tenant_identity_actions (
        id varchar(36) PRIMARY KEY, "userId" integer, "sourceTenantId" varchar(36), phase varchar(40)
      )`);
      process.env.DATABASE_URL = fixture.databaseUrl;
      delete process.env.PGHOST;
      delete process.env.PGPORT;
      delete process.env.PGUSER;
      delete process.env.PGPASSWORD;

      const [
        { createJobControlPlane },
        { createDevelopmentRunService, createPersistedDevelopmentRun, defaultDevelopmentRunPersistenceAdapter },
        { buildDevelopmentRun },
        { createDevelopmentWorkUnit },
        { defaultJobExecutorRegistry },
        { getUserWorkerJobDetail },
      ] = await Promise.all([
        import("../jobControlPlane"),
        import("../spec224DevelopmentRunPersistence"),
        import("../spec224DevelopmentRunContracts"),
        import("../developmentLifecycleContracts"),
        import("../jobExecutorRegistry"),
        import("../workerJobMonitorService"),
      ]);
      const controlPlane = createJobControlPlane();
      const runId = randomUUID();
      const tenantId = randomUUID();
      const actorId = 22401;
      const run = buildDevelopmentRun({
        runId,
        tenantId,
        actorId,
        goal: "Expose persisted DevelopmentRun stage in Task Control",
        repositoryRef: "repo:r9-task-control-test",
        baseRevision: "git:r9-task-control-base",
        contextPackHash: "a".repeat(64),
        workspaceId: `workspace-${runId}`,
        workUnit: createDevelopmentWorkUnit({
          workId: `work-${runId}`,
          projectId: "project:r9-test",
          repositoryId: "repo:r9-task-control-test",
          source: { type: "feature", ref: "spec:224" },
          objective: "Project durable progress to Task Control",
          ownership: {
            actor: `user:${actorId}`,
            session: "synthetic-r9-session",
            harness: "deterministic-test-executor",
          },
          canonicalTarget: { kind: "git", locator: "repo:r9-task-control-test" },
          baseRevision: "git:r9-task-control-base",
        }),
      });
      const createInput = {
        run,
        provider: "codex" as const,
        runtime: "local_runner" as const,
        planId: `plan-${runId}`,
        planRevision: 1,
        skillIds: [],
        requestedCapabilities: ["workspace.edit"],
        authorizationScope: "spec224.development.run",
        persistence: defaultDevelopmentRunPersistenceAdapter,
        controlPlane,
        executorRegistry: defaultJobExecutorRegistry,
      };
      const first = await createPersistedDevelopmentRun(createInput);
      const duplicate = await createPersistedDevelopmentRun(createInput);
      expect(first.jobRef).toMatchObject({ created: true });
      expect(duplicate.jobRef).toMatchObject({
        jobId: first.jobRef.jobId,
        created: false,
      });

      const lease = await controlPlane.claim({
        jobId: first.jobRef.jobId,
        runnerId: `r9-synthetic-runner-${runId}`,
        adapter: "test",
      });
      if (!lease) throw new Error("SPEC224_SYNTHETIC_JOB_NOT_CLAIMED");
      await controlPlane.start(lease);
      await controlPlane.complete(lease, {
        resultRef: `evidence:phase-${runId}`,
        output: { evidenceRefs: [`evidence:phase-${runId}`] },
      });
      await expect(
        controlPlane.complete(lease, {
          resultRef: `evidence:spec224-conflicting-result-${runId}`,
          output: { evidenceRefs: [`evidence:conflicting-${runId}`] },
        })
      ).rejects.toThrow();

      const childScript = `
        import postgres from "postgres";
        const [{ createJobControlPlane }, { createDevelopmentRunService, defaultDevelopmentRunPersistenceAdapter },
          { reconcileAndContinueNextPhase }, { defaultJobExecutorRegistry }, { closeDb }] = await Promise.all([
          import("./server/services/jobControlPlane.ts"),
          import("./server/services/spec224DevelopmentRunPersistence.ts"),
          import("./server/services/spec224PhaseController.ts"),
          import("./server/services/jobExecutorRegistry.ts"),
          import("./server/db.ts"),
        ]);
        const runId = process.env.TEST_RUN_ID;
        const tenantId = process.env.TEST_TENANT_ID;
        const actorId = Number(process.env.TEST_ACTOR_ID);
        const result = await reconcileAndContinueNextPhase({
          runId, tenantId, actorId,
          expectedRevision: 0,
          expectedFencingVersion: Number(process.env.TEST_FENCING_VERSION),
          idempotencyKey: \`r9-task-control-continue:\${runId}\`,
          provider: "codex", runtime: "local_runner", planId: \`plan-\${runId}\`,
          planRevision: 2, skillIds: [], requestedCapabilities: ["workspace.edit"],
          authorizationScope: "spec224.development.run",
          persistence: defaultDevelopmentRunPersistenceAdapter,
          controlPlane: createJobControlPlane(), executorRegistry: defaultJobExecutorRegistry,
        });
        const retry = await reconcileAndContinueNextPhase({
          runId, tenantId, actorId,
          expectedRevision: 1,
          expectedFencingVersion: Number(process.env.TEST_FENCING_VERSION) + 2,
          idempotencyKey: \`r9-task-control-continue:\${runId}\`,
          provider: "codex", runtime: "local_runner", planId: \`plan-\${runId}\`,
          planRevision: 2, skillIds: [], requestedCapabilities: ["workspace.edit"],
          authorizationScope: "spec224.development.run",
          persistence: defaultDevelopmentRunPersistenceAdapter,
          controlPlane: createJobControlPlane(), executorRegistry: defaultJobExecutorRegistry,
        });
        const persisted = await createDevelopmentRunService(defaultDevelopmentRunPersistenceAdapter).get({runId, tenantId, actorId});
        const sql = postgres(process.env.DATABASE_URL, { max: 1 });
        const [job] = await sql.unsafe('SELECT "progressJson", "outputJson" FROM worker_jobs WHERE id = $1', [process.env.TEST_INITIAL_JOB_ID]);
        process.stdout.write("R9_RESULT:" + JSON.stringify({
          action: result.reconcile.action, reason: result.reconcile.reason,
          retry: { action: retry.reconcile.action, reason: retry.reconcile.reason, continuation: retry.continuation },
          state: persisted.run.state, workerJobId: persisted.run.workerJobId,
          events: persisted.events.map(event => event.type),
          continuation: result.continuation && { accepted: result.continuation.accepted, jobRef: result.continuation.jobRef },
          progressJson: job?.progressJson ?? null,
          initialOutput: job?.outputJson ?? null,
        }) + "\\n");
        await sql.end();
        await closeDb();
      `;
      const child = await execFileAsync(
        process.execPath,
        ["--import", "tsx", "--input-type=module", "--eval", childScript],
        {
          cwd: process.cwd().endsWith(`${path.sep}apps${path.sep}web`)
            ? process.cwd()
            : path.join(process.cwd(), "apps", "web"),
          env: {
            ...process.env,
            DATABASE_URL: fixture.databaseUrl,
            TEST_RUN_ID: runId,
            TEST_TENANT_ID: tenantId,
            TEST_ACTOR_ID: String(actorId),
            TEST_FENCING_VERSION: String(first.run.fencingVersion),
            TEST_INITIAL_JOB_ID: first.jobRef.jobId,
          },
          timeout: 20_000,
          maxBuffer: 24 * 1024,
        }
      );
      const resultLine = child.stdout.split(/\r?\n/).find(line => line.startsWith("R9_RESULT:"));
      if (!resultLine) throw new Error(`SPEC224_RESTART_RESULT_MISSING:${child.stdout.slice(-500)}`);
      const phase = JSON.parse(resultLine.slice("R9_RESULT:".length));
      expect(phase).toMatchObject({
        action: "CONTINUE",
        reason: "phase_succeeded",
        state: "PLANNING",
        events: expect.arrayContaining(["RUN_CREATED", "PHASE_COMPLETED", "PHASE_STARTED"]),
      });
      expect(phase.continuation).toMatchObject({
        accepted: true,
        jobRef: { created: true },
      });
      expect(phase.retry).toMatchObject({
        action: "WAIT",
        reason: "worker_job_not_terminal",
        continuation: null,
      });
      const planningJobId = phase.continuation.jobRef.jobId as string;
      expect(phase.workerJobId).toBe(planningJobId);
      expect(planningJobId).not.toBe(first.jobRef.jobId);
      expect(phase.progressJson).toMatchObject({
        spec224: { runId, workerJobId: planningJobId, state: "PLANNING" },
        developmentLifecycle: { workUnit: { workId: `work-${runId}` } },
      });
      const [settledJob] = await client.unsafe(
        `SELECT status, "resultRef", "outputJson" FROM worker_jobs WHERE id = $1`,
        [first.jobRef.jobId]
      );
      expect(settledJob).toMatchObject({
        status: "succeeded",
        resultRef: `evidence:phase-${runId}`,
        outputJson: { evidenceRefs: [`evidence:phase-${runId}`] },
      });
      const [terminalCounts] = await client.unsafe(
        `SELECT COUNT(*) FILTER (WHERE "eventType" = 'SETTLEMENT_RECORDED')::int AS settlements,
          COUNT(*) FILTER (WHERE "eventType" = 'COMPLETED')::int AS completions
         FROM worker_job_events WHERE "workerJobId" = $1`,
        [first.jobRef.jobId]
      );
      expect(terminalCounts).toEqual({ settlements: 1, completions: 1 });
      const [runJobCount] = await client.unsafe(
        `SELECT COUNT(*)::int AS count FROM worker_jobs
         WHERE "tenantId" = $1 AND "requestedByUserId" = $2
           AND "inputJson"->'spec224Run'->>'runId' = $3`,
        [tenantId, actorId, runId]
      );
      expect(runJobCount.count).toBe(2);

      const [job] = await client.unsafe(
        `SELECT id, "tenantId", "requestedByUserId", "runtimeType", "workflowRunId",
          "jobType", status, "statusReason", "resourceProfile", "outputJson",
          "failureReason", "errorCode", "errorMessage", "operatorReviewRequired",
          "operatorReviewReason", "progressJson", "createdAt", "startedAt", "finishedAt"
         FROM worker_jobs WHERE id = $1`,
        [planningJobId]
      );
      const taskControl = await getUserWorkerJobDetail(
        { auth: { tenantId, userId: actorId }, jobId: planningJobId },
        {
          repo: {
            getUserJob: async () => ({ ...job, workerId: null, worker: null }),
            listUserJobs: async () => [],
            listEvents: async jobIds => await client.unsafe(
              `SELECT id, "workerJobId", "eventSequence", "eventType", "payloadJson", "createdAt"
               FROM worker_job_events WHERE "workerJobId" = ANY($1::text[])`,
              [jobIds]
            ),
            listArtifacts: async () => [],
          },
        }
      );
      expect(taskControl).toMatchObject({
        id: planningJobId,
        status: "queued",
        progressPhase: "PLANNING",
        progressPercent: null,
      });
      const persisted = await createDevelopmentRunService(defaultDevelopmentRunPersistenceAdapter).get({ runId, tenantId, actorId });
      expect(persisted?.run).toMatchObject({
        runId,
        state: "PLANNING",
        workerJobId: planningJobId,
      });
      if (!persisted) throw new Error("SPEC224_RUN_NOT_PERSISTED_AFTER_RESTART");

      const { createAndBindNextPhase } = await import("../spec224PhaseController");
      const { runSpec224DisposableGitAcceptance } = await import("./support/spec224DisposableGitAcceptance");
      let current = persisted;
      let currentPhase = current.run.state;
      let nextPlanRevision = 3;
      let acceptance: Awaited<ReturnType<typeof runSpec224DisposableGitAcceptance>> | null = null;
      let firstTestFailure = true;
      const exercisedPhases = ["DISCOVERY"];

      while (currentPhase && currentPhase !== "FINAL_VERIFY") {
        const jobId = current.run.workerJobId;
        if (!jobId) throw new Error("SPEC224_PHASE_JOB_UNBOUND");
        const currentLease = await controlPlane.claim({
          jobId,
          runnerId: `r10-synthetic-${currentPhase}-${runId}`,
          adapter: "test",
        });
        if (!currentLease) throw new Error(`SPEC224_PHASE_NOT_CLAIMED:${currentPhase}`);
        await controlPlane.start(currentLease);
        exercisedPhases.push(currentPhase);
        const expectedTestFailure = currentPhase === "TEST" && firstTestFailure;

        if (currentPhase === "IMPLEMENT") {
          acceptance = await runSpec224DisposableGitAcceptance({ runId, tenantId, actorId, workUnitId: `work-${runId}` });
          expect(acceptance).toMatchObject({
            mode: "SYNTHETIC",
            scope: { runId, tenantId, actorId, workUnitId: `work-${runId}` },
            repairAttempts: 2,
            repairedTestExitCode: 0,
            candidateSha: acceptance.retryCandidateSha,
            verifierSourceSha: acceptance.candidateSha,
          });
          expect(acceptance.initialTestExitCode).not.toBe(0);
          expect(acceptance.failedCandidateSha).not.toBe(acceptance.candidateSha);
          expect(acceptance.verifierPid).not.toBe(process.pid);
          expect(acceptance.artifactRefs).toHaveLength(4);
          await controlPlane.complete(currentLease, {
            resultRef: `evidence:spec224-disposable:${runId}:candidate`,
            output: { evidenceRefs: acceptance.artifactRefs, syntheticAcceptance: acceptance },
          });
        } else if (expectedTestFailure) {
          if (!acceptance) throw new Error("SPEC224_SYNTHETIC_IMPLEMENTATION_MISSING");
          firstTestFailure = false;
          await controlPlane.fail(currentLease, {
            code: "FUNCTIONAL_TEST_FAILURE",
            message: "Initial disposable candidate failed the acceptance tests",
            class: "permanent",
            metadata: { candidateSha: acceptance.failedCandidateSha, evidenceRefs: acceptance.artifactRefs },
          });
        } else {
          await controlPlane.complete(currentLease, {
            resultRef: `evidence:phase-${currentPhase}-${runId}`,
            output: {
              evidenceRefs: currentPhase === "DEBUG_REPAIR" || currentPhase === "TEST"
                ? acceptance?.artifactRefs ?? []
                : [`evidence:phase-${currentPhase}-${runId}`],
              ...(currentPhase === "DEBUG_REPAIR" && acceptance ? { repairedCandidateSha: acceptance.candidateSha } : {}),
              ...(currentPhase === "TEST" && acceptance ? { independentVerifierPid: acceptance.verifierPid, sourceSha: acceptance.verifierSourceSha } : {}),
            },
          });
        }

        let reconciled;
        try {
          reconciled = await createDevelopmentRunService(defaultDevelopmentRunPersistenceAdapter).reconcile({
            runId, tenantId, actorId,
          });
        } catch (error) {
          throw new Error(`SPEC224_RECONCILE_FAILED:${currentPhase}:${jobId}:${error instanceof Error ? error.message : String(error)}`);
        }
        if (expectedTestFailure && reconciled.action !== "RECOVER") {
          throw new Error(`SPEC224_TEST_FAILURE_NOT_ROUTED_TO_REPAIR:${reconciled.reason}:${reconciled.run.state}`);
        }
        if (!expectedTestFailure && reconciled.action !== "CONTINUE") {
          throw new Error(`SPEC224_PHASE_DID_NOT_CONTINUE:${currentPhase}:${reconciled.reason}`);
        }
        const admitted = await createAndBindNextPhase({
          runId,
          tenantId,
          actorId,
          expectedRevision: reconciled.revision,
          expectedFencingVersion: reconciled.run.fencingVersion,
          idempotencyKey: `r10-continue:${runId}:${reconciled.run.state}:${nextPlanRevision}`,
          provider: "codex",
          runtime: "local_runner",
          planId: `plan-${runId}`,
          planRevision: nextPlanRevision++,
          skillIds: [],
          requestedCapabilities: ["workspace.edit"],
          authorizationScope: "spec224.development.run",
          persistence: defaultDevelopmentRunPersistenceAdapter,
          controlPlane,
          executorRegistry: defaultJobExecutorRegistry,
        });
        current = await createDevelopmentRunService(defaultDevelopmentRunPersistenceAdapter).get({ runId, tenantId, actorId });
        if (!current || current.run.workerJobId !== admitted.jobRef.jobId) throw new Error("SPEC224_NEXT_PHASE_BIND_MISMATCH");
        currentPhase = current.run.state;
      }

      if (!acceptance || !current || currentPhase !== "FINAL_VERIFY") throw new Error("SPEC224_FINAL_VERIFY_NOT_REACHED");
      expect(exercisedPhases).toEqual([
        "DISCOVERY", "PLANNING", "PLAN_VERIFY", "IMPLEMENT", "BUILD", "TEST",
        "DEBUG_REPAIR", "TEST", "REVIEW", "VERIFY", "REGRESSION",
      ]);
      const finalLease = await controlPlane.claim({
        jobId: current.run.workerJobId!, runnerId: `r10-final-verify-${runId}`, adapter: "test",
      });
      if (!finalLease) throw new Error("SPEC224_FINAL_VERIFY_NOT_CLAIMED");
      await controlPlane.start(finalLease);
      await controlPlane.complete(finalLease, {
        resultRef: `evidence:final-${runId}`,
        output: {
          evidenceRefs: [`evidence:final-${runId}`, ...acceptance.artifactRefs],
          syntheticAcceptance: acceptance,
        },
      });
      const finalGate = await createDevelopmentRunService(defaultDevelopmentRunPersistenceAdapter).reconcile({
        runId, tenantId, actorId,
      });
      expect(finalGate).toMatchObject({
        action: "WAIT",
        reason: "workspace_convergence_or_retirement_evidence_missing",
        run: { state: "WAITING_HUMAN_DECISION" },
      });
      if (process.env.SPEC224_EMIT_EVIDENCE === "1") {
        process.stdout.write("SPEC224_R10_ACCEPTANCE:" + JSON.stringify({
          mode: acceptance.mode,
          scope: acceptance.scope,
          baseSha: acceptance.baseSha,
          failedCandidateSha: acceptance.failedCandidateSha,
          candidateSha: acceptance.candidateSha,
          repairAttempts: acceptance.repairAttempts,
          initialTestExitCode: acceptance.initialTestExitCode,
          repairedTestExitCode: acceptance.repairedTestExitCode,
          initialTestStdoutDigest: acceptance.initialTestStdoutDigest,
          initialTestStderrDigest: acceptance.initialTestStderrDigest,
          repairedTestStdoutDigest: acceptance.repairedTestStdoutDigest,
          repairedTestStderrDigest: acceptance.repairedTestStderrDigest,
          diffDigest: acceptance.diffDigest,
          evidenceDigest: acceptance.evidenceDigest,
          artifactRefs: acceptance.artifactRefs,
          artifactDigests: acceptance.artifactDigests,
          verifierPid: acceptance.verifierPid,
          verifierProfile: acceptance.verifierProfile,
          verifierSourceSha: acceptance.verifierSourceSha,
          finalGate: { action: finalGate.action, reason: finalGate.reason, state: finalGate.run.state },
          stateAfterFreshProcess: "WAITING_HUMAN_DECISION",
        }) + "\n");
      }
      expect(acceptance.verifierSourceSha).toBe(acceptance.candidateSha);
      const [implementationEvidence] = await client.unsafe(
        `SELECT "outputJson" FROM worker_jobs WHERE "resultRef" = $1`,
        [`evidence:spec224-disposable:${runId}:candidate`]
      );
      expect(implementationEvidence?.outputJson).toMatchObject({
        syntheticAcceptance: {
          mode: "SYNTHETIC",
          candidateSha: acceptance.candidateSha,
          evidenceDigest: acceptance.evidenceDigest,
        },
      });
      const afterFinalVerify = await createDevelopmentRunService(defaultDevelopmentRunPersistenceAdapter).get({ runId, tenantId, actorId });
      expect(afterFinalVerify?.events.filter(event => event.type === "RUN_COMPLETED")).toHaveLength(0);
      const restartScript = `
        import { createHash } from "node:crypto";
        import postgres from "postgres";
        const [{ createDevelopmentRunService, defaultDevelopmentRunPersistenceAdapter }, { closeDb }] = await Promise.all([
          import("./server/services/spec224DevelopmentRunPersistence.ts"),
          import("./server/db.ts"),
        ]);
        const runId = process.env.TEST_RUN_ID;
        const scope = { runId, tenantId: process.env.TEST_TENANT_ID, actorId: Number(process.env.TEST_ACTOR_ID) };
        const run = await createDevelopmentRunService(defaultDevelopmentRunPersistenceAdapter).get(scope);
        const sql = postgres(process.env.DATABASE_URL, { max: 1 });
        const [job] = await sql.unsafe('SELECT "outputJson" FROM worker_jobs WHERE "resultRef" = $1', [process.env.TEST_IMPLEMENTATION_RESULT_REF]);
        const acceptance = job?.outputJson?.syntheticAcceptance;
        const artifacts = acceptance?.evidenceArtifacts ?? [];
        const actualDigest = createHash("sha256").update(JSON.stringify(artifacts.map(({ ref, sha256 }) => ({ ref, sha256 })))).digest("hex");
        const artifactBytesValid = artifacts.every(({ contentBase64, sha256 }) => createHash("sha256").update(Buffer.from(contentBase64, "base64")).digest("hex") === sha256);
        process.stdout.write("R10_RESTART:" + JSON.stringify({
          state: run?.run.state,
          workerJobId: run?.run.workerJobId,
          completedEvents: run?.events.filter(event => event.type === "RUN_COMPLETED").length,
          evidenceDigest: acceptance?.evidenceDigest,
          actualDigest,
          artifactCount: artifacts.length,
          artifactBytesValid,
          verifierSourceSha: acceptance?.verifierSourceSha,
          candidateSha: acceptance?.candidateSha,
        }) + "\\n");
        await sql.end();
        await closeDb();
      `;
      const restartedChild = await execFileAsync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", restartScript], {
        cwd: process.cwd().endsWith(`${path.sep}apps${path.sep}web`)
          ? process.cwd()
          : path.join(process.cwd(), "apps", "web"),
        env: {
          ...process.env,
          DATABASE_URL: fixture.databaseUrl,
          TEST_RUN_ID: runId,
          TEST_TENANT_ID: tenantId,
          TEST_ACTOR_ID: String(actorId),
          TEST_IMPLEMENTATION_RESULT_REF: `evidence:spec224-disposable:${runId}:candidate`,
        },
        timeout: 20_000,
        maxBuffer: 24 * 1024,
      });
      const restartedLine = restartedChild.stdout.split(/\r?\n/).find(line => line.startsWith("R10_RESTART:"));
      if (!restartedLine) throw new Error(`SPEC224_FINAL_RESTART_RESULT_MISSING:${restartedChild.stdout.slice(-500)}`);
      expect(JSON.parse(restartedLine.slice("R10_RESTART:".length))).toMatchObject({
        state: "WAITING_HUMAN_DECISION",
        completedEvents: 0,
        evidenceDigest: acceptance.evidenceDigest,
        actualDigest: acceptance.evidenceDigest,
        artifactCount: 4,
        artifactBytesValid: true,
        verifierSourceSha: acceptance.candidateSha,
        candidateSha: acceptance.candidateSha,
      });
    } finally {
      await closeDb();
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabaseUrl;
      for (const [key, value] of Object.entries(priorPg)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      await client.end({ timeout: 2 });
      await fixture.close();
    }
  }, 60_000);
});
