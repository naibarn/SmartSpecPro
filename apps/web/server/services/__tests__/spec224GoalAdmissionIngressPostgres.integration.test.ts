import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { provisionSpec224EconomicTestBudget } from "./helpers/spec224EconomicTestProvisioning";

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "true";
process.env.JWT_SECRET ??= "spec224-goal-ingress-test-secret-only-000000000000";
const previousControlPlaneApiKey = process.env.CONTROL_PLANE_API_KEY;
process.env.CONTROL_PLANE_API_KEY = "spec224-ingress-test-control-plane-key-0001";
const databaseUrl = process.env.DATABASE_URL ?? "postgresql://localhost/spec224_skipped_test";
const target = new URL(databaseUrl);
if (enabled && (!/^(localhost|127\.0\.0\.1)$/.test(target.hostname) || !/^spec224_[a-z0-9_-]*_test$/i.test(target.pathname.slice(1))))
  throw new Error("SPEC224_DISPOSABLE_DATABASE_REQUIRED");
process.env.DATABASE_URL = databaseUrl;
const sql = postgres(databaseUrl, { max: 8 });
const suite = enabled ? describe : describe.skip;
const execFileAsync = promisify(execFile);
const leaseWorkspaces: string[] = [];
const previousWorkspaceAuthorityRepository = process.env.SMARTSPEC_WORKSPACE_AUTHORITY_REPOSITORY;
async function createExecutionAuthorityWorkspace() {
  const root = await mkdtemp(join(tmpdir(), "spec224-ingress-authority-"));
  leaseWorkspaces.push(root);
  await execFileAsync("git", ["init", "--initial-branch=main", root]);
  await execFileAsync("git", ["-C", root, "config", "user.name", "SPEC-224 integration"]);
  await execFileAsync("git", ["-C", root, "config", "user.email", "spec224-test@example.invalid"]);
  await execFileAsync("git", ["-C", root, "remote", "add", "origin", "https://example.invalid/test/repository.git"]);
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src", "seed.js"), "export const seed = true;\n");
  await writeFile(join(root, ".development-repository.toml"), `[repository]\nproject_id = "project-test"\nrepository_id = "repo-test"\nremote = "origin"\ncanonical_ref = "refs/heads/main"\n`);
  await execFileAsync("git", ["-C", root, "add", "src/seed.js", ".development-repository.toml"]);
  await execFileAsync("git", ["-C", root, "commit", "-m", "seed disposable execution workspace"]);
  const lifecycleRoot = resolve(process.cwd(), "../../scripts/development-lifecycle");
  const target = join(root, "scripts", "development-lifecycle");
  await mkdir(target, { recursive: true });
  for (const file of ["workspace_authority.py", "canonical_source.py", "convergence_contract.py", "portable_file_lock.py"])
    await cp(join(lifecycleRoot, file), join(target, file));
  const registerScript = `import json, sys\nfrom pathlib import Path\nsys.path.insert(0, str(Path.cwd() / "scripts" / "development-lifecycle"))\nimport workspace_authority as authority\nworkspace = authority.register_workspace(Path.cwd(), Path.cwd() / ".development-repository.toml", Path.cwd(), role="CANONICAL_USER_WORKSPACE")\nhead, fingerprint, dirty = authority._execution_source_facts(Path.cwd())\nprint(json.dumps({"workspaceId": workspace["workspace_id"], "sourceSha": head, "sourceFingerprint": fingerprint, "dirtyPaths": dirty}))`;
  const { stdout } = await execFileAsync("python3", ["-c", registerScript], { cwd: root });
  process.env.SMARTSPEC_WORKSPACE_AUTHORITY_REPOSITORY = root;
  return JSON.parse(stdout.trim()) as { workspaceId: string; sourceSha: string; sourceFingerprint: string; dirtyPaths: string[] };
}

async function freePort() {
  const server = createServer();
  await new Promise<void>(resolveListen => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("TEST_PORT_UNAVAILABLE");
  const port = address.port;
  await new Promise<void>((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()));
  return port;
}

async function startApprovalAuthority(port: number) {
  const pythonRoot = resolve(process.cwd(), "../../python-backend");
  const proc = spawn("uv", ["run", "--project", pythonRoot, "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(port)], {
    cwd: pythonRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl.replace(/^postgresql:/, "postgresql+asyncpg:"), DEBUG: "false" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  proc.stderr?.on("data", chunk => { stderr = `${stderr}${chunk}`.slice(-8_000); });
  proc.stdout?.on("data", chunk => { stderr = `${stderr}${chunk}`.slice(-8_000); });
  const baseUrl = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (proc.exitCode !== null) throw new Error(`APPROVAL_AUTHORITY_START_FAILED:${stderr}`);
    try {
      const response = await fetch(`${baseUrl}/health/ready`);
      if (response.ok) return { proc, baseUrl, getStderr: () => stderr };
    } catch { /* Wait for Uvicorn startup. */ }
    await delay(250);
  }
  proc.kill("SIGTERM");
  throw new Error(`APPROVAL_AUTHORITY_START_TIMEOUT:${stderr}`);
}

const approveGoalScript = `
import asyncio, json, os, sys
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from app.services.approval_db_service import ApprovalDBService
async def main():
    approval_ref, tenant_id, approver_id = sys.argv[1], sys.argv[2], int(sys.argv[3])
    engine = create_async_engine(os.environ["DATABASE_URL"], pool_pre_ping=True)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as session:
            result = await ApprovalDBService(session).submit_decision(approval_ref, approver_id, "approved", tenant_id=tenant_id)
            print(json.dumps({"requestId": result.request_id, "decision": result.decision}))
    finally:
        await engine.dispose()
asyncio.run(main())
`;

async function approve(approvalRef: string, tenantId: string, approverId: number) {
  const pythonRoot = resolve(process.cwd(), "../../python-backend");
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const run = promisify(execFile);
  const result = await run("uv", ["run", "--project", pythonRoot, "python", "-c", approveGoalScript, approvalRef, tenantId, String(approverId)], {
    cwd: pythonRoot, env: { ...process.env, DATABASE_URL: databaseUrl.replace(/^postgresql:/, "postgresql+asyncpg:"), DEBUG: "false" }, maxBuffer: 1_000_000,
  });
  const line = result.stdout.trim().split(/\r?\n/).reverse().find(value => value.startsWith("{"));
  if (!line) throw new Error("APPROVAL_DECISION_RESPONSE_INVALID");
  return JSON.parse(line) as { requestId: string; decision: string };
}

suite("SPEC-224 actual Task Control Goal admission ingress", () => {
  afterAll(async () => {
    await sql.end();
    const { closeDb } = await import("../../db");
    await closeDb();
    if (previousControlPlaneApiKey === undefined) delete process.env.CONTROL_PLANE_API_KEY;
    else process.env.CONTROL_PLANE_API_KEY = previousControlPlaneApiKey;
    if (previousWorkspaceAuthorityRepository === undefined) delete process.env.SMARTSPEC_WORKSPACE_AUTHORITY_REPOSITORY;
    else process.env.SMARTSPEC_WORKSPACE_AUTHORITY_REPOSITORY = previousWorkspaceAuthorityRepository;
    await Promise.all(leaseWorkspaces.map(root => rm(root, { recursive: true, force: true })));
  });

  it("starts through the real tRPC handler and reaches Child 2 through the actual Approval Authority HTTP route", async () => {
    const executionAuthority = await createExecutionAuthorityWorkspace();
    const tenantId = randomUUID(), projectId = randomUUID(), runnerId = `runner-${randomUUID()}`, workspaceId = executionAuthority.workspaceId;
    const sessionId = `session-${randomUUID()}`, snapshotId = randomUUID(), revision = `revision-${randomUUID()}`;
    const expires = new Date(Date.now() + 3_600_000), observed = new Date(Date.now() - 1_000);
    const [tenant] = await sql`INSERT INTO tenants (id, slug, name, "isActive", status, plan, created_at, "createdAt", "updatedAt") VALUES (${tenantId}, ${randomUUID()}, 'SPEC-224 ingress test', true, 'ACTIVE', 'FREE', NOW(), NOW(), NOW()) RETURNING id`;
    await sql.unsafe("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS banned_until timestamptz, ADD COLUMN IF NOT EXISTS ban_reason text");
    const [actor] = await sql`INSERT INTO users ("openId", role, plan, credits, "isDisabled", "currentTenantId") VALUES (${randomUUID()}, 'user', 'free', 0, false, ${tenantId}) RETURNING id`;
    const [approver] = await sql`INSERT INTO users ("openId", role, plan, credits, "isDisabled") VALUES (${randomUUID()}, 'admin', 'free', 0, false) RETURNING id`;
    const actorId = Number(actor.id), approverId = Number(approver.id);
    await sql.unsafe(`CREATE TABLE IF NOT EXISTS tenant_users (
      id serial PRIMARY KEY, tenant_id varchar(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE, is_active boolean NOT NULL DEFAULT true
    )`);
    await sql`INSERT INTO tenant_users (tenant_id, user_id, is_active) VALUES (${tenantId}, ${actorId}, true), (${tenantId}, ${approverId}, true)`;
    // The narrow SPEC-224 disposable baseline intentionally omits chat tables;
    // provision their production-shaped subset inside this throwaway database.
    await sql.unsafe(`CREATE TABLE conversations (
      id serial PRIMARY KEY, "userId" integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title varchar(255) NOT NULL DEFAULT 'New Chat', model varchar(100) DEFAULT 'gpt-4o-mini',
      temperature numeric(3,2) DEFAULT '0.7', "systemPrompt" text,
      "skillSettings" json DEFAULT '{"autoDetect":true,"enabledSkills":[],"detectionMode":"auto"}'::json,
      "isArchived" boolean NOT NULL DEFAULT false, "isPinned" boolean NOT NULL DEFAULT false,
      "trashedAt" timestamp, "totalCreditsUsed" numeric(12,4) DEFAULT '0',
      "messageCount" integer NOT NULL DEFAULT 0, project_id varchar(100), memory_mode varchar(20) DEFAULT 'full',
      "brainstormPartnerModel" varchar(100), "brainstormMaxRounds" integer DEFAULT 3,
      "defaultChannelPolicy" varchar(20) DEFAULT 'allow_attach', "tenantId" varchar(36) REFERENCES tenants(id) ON DELETE CASCADE,
      "personaId" varchar(36), source varchar(20) DEFAULT 'web', "apiKeyId" varchar(36),
      "expiresAt" timestamp with time zone, "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
      "updatedAt" timestamp with time zone NOT NULL DEFAULT now()
    )`);
    await sql.unsafe(`CREATE TABLE spec224_conversation_workspaces (
      "conversationId" integer PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
      "tenantId" varchar(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      "actorId" integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      "runnerId" varchar(160) NOT NULL REFERENCES runner_nodes("runnerId") ON DELETE RESTRICT,
      "workspaceId" varchar(200) NOT NULL, "snapshotRevision" varchar(128) NOT NULL,
      revision integer NOT NULL DEFAULT 1, "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(), CHECK (revision > 0)
    )`);
    await sql.unsafe(`CREATE TABLE IF NOT EXISTS system_settings (
      id serial PRIMARY KEY, category varchar(64) NOT NULL, key varchar(128) NOT NULL,
      value text, "valueJson" json, "isSensitive" boolean NOT NULL DEFAULT false,
      description text, "updatedBy" integer, "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now()
    )`);
    // The narrow SPEC-224 disposable baseline intentionally excludes SPEC-293
    // canonical workspace authority. Provision its production-shaped tables so
    // the real Workspace Authority read path is exercised by this test.
    await sql.unsafe(`CREATE TABLE IF NOT EXISTS canonical_projects (
      project_id varchar(36) PRIMARY KEY, tenant_id varchar(36) NOT NULL REFERENCES tenants(id),
      project_type varchar(40) NOT NULL, title varchar(200) NOT NULL, owner_principal_id varchar(160) NOT NULL,
      aliases jsonb NOT NULL DEFAULT '[]'::jsonb, lifecycle varchar(24) NOT NULL DEFAULT 'ACTIVE',
      identity_version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (tenant_id, project_id)
    )`);
    await sql.unsafe(`CREATE TABLE IF NOT EXISTS canonical_project_memberships (
      tenant_id varchar(36) NOT NULL REFERENCES tenants(id), project_id varchar(36) NOT NULL,
      principal_id varchar(160) NOT NULL, role varchar(16) NOT NULL, lifecycle varchar(16) NOT NULL DEFAULT 'ACTIVE',
      created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz,
      PRIMARY KEY (tenant_id, project_id, principal_id),
      FOREIGN KEY (tenant_id, project_id) REFERENCES canonical_projects(tenant_id, project_id) ON DELETE CASCADE
    )`);
    await sql.unsafe(`CREATE UNIQUE INDEX IF NOT EXISTS runner_nodes_tenant_runner_unique ON runner_nodes ("tenantId", "runnerId")`);
    await sql.unsafe(`CREATE TABLE IF NOT EXISTS canonical_project_workspace_bindings (
      id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id varchar(36) NOT NULL, project_id varchar(36) NOT NULL,
      repository_id varchar(160) NOT NULL, scope varchar(32) NOT NULL, runner_id varchar(160) NOT NULL, workspace_id varchar(200) NOT NULL,
      lifecycle varchar(16) NOT NULL DEFAULT 'ACTIVE', created_by_principal_id varchar(160) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz,
      FOREIGN KEY (tenant_id, project_id) REFERENCES canonical_projects(tenant_id, project_id) ON DELETE CASCADE,
      FOREIGN KEY (tenant_id, runner_id) REFERENCES runner_nodes("tenantId", "runnerId") ON DELETE RESTRICT
    )`);
    await sql.unsafe(`CREATE TABLE spec224_workspace_spec_set_revisions (
      id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(), "tenantId" varchar(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      "actorId" integer NOT NULL REFERENCES users(id) ON DELETE CASCADE, "runnerId" varchar(160) NOT NULL,
      "workspaceId" varchar(200) NOT NULL, revision integer NOT NULL, "parentRevision" integer,
      digest varchar(64) NOT NULL, "requestDigest" varchar(64) NOT NULL, "idempotencyKey" varchar(160) NOT NULL,
      "filesJson" jsonb NOT NULL, "replacedPathsJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "requirementCount" integer NOT NULL, "runnableWorkPackageCount" integer NOT NULL,
      "blockedWorkPackageCount" integer NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now()
    )`);
    await sql.unsafe(`CREATE TABLE spec224_runner_input_sources (
      id varchar(160) PRIMARY KEY, "tenantId" varchar(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      "startRef" varchar(160) NOT NULL, "workerJobId" varchar(36) REFERENCES worker_jobs(id) ON DELETE RESTRICT,
      "inputDigest" varchar(64) NOT NULL, "totalBytes" integer NOT NULL, "filesJson" jsonb NOT NULL,
      "createdAt" timestamptz NOT NULL DEFAULT now()
    )`);
    const sourceSha = executionAuthority.sourceSha, fingerprint = executionAuthority.sourceFingerprint;
    const snapshot = {
      runnerId, tenantId, runnerSessionId: sessionId, capabilitySnapshotId: snapshotId, revision,
      observedAt: observed.toISOString(), expiresAt: expires.toISOString(), capabilities: ["agent.external_task"], workspaceIds: [workspaceId], resourceClass: "medium",
      workspaces: [{ workspaceId, projectId, repositoryId: `repo-${tenantId}`, displayName: "Disposable workspace", gitHead: sourceSha, gitBranch: "main", dirty: false, contentFingerprint: fingerprint }],
      toolInventory: [{ toolId: "codex", kind: "agent_cli", displayName: "Codex", version: "0.165.0", adapterId: "codex.v1", adapterVersion: "codex.v1", discoverySource: "runner_probe", installState: "installed", configurationState: "configured", authState: "authenticated", healthState: "healthy", availabilityState: "available", trustState: "ready", fingerprint: "ingress-test", authorizationEvidenceRef: "test-auth", versionProbeState: "passed", observedAt: observed.toISOString(), expiresAt: expires.toISOString(), reasonCodes: [], taskProbeState: "passed", taskProbeObservedAtMs: observed.getTime(), taskProbeExpiresAtMs: expires.getTime(), taskProbeEvidenceRef: "test-probe", modelCatalog: { state: "discovered", adapterId: "codex.v1", adapterVersion: "codex.v1", cliVersion: "codex-cli 0.165.0", accountProviderFingerprint: "codex-account:sha256:spec224-ingress-test", accountScopeState: "account_scoped_catalog_unverified", source: "codex_app_server_model_list", revision: "catalog:sha256:spec224-ingress-test", verificationState: "unverified_catalog_only", observedAt: observed.toISOString(), expiresAt: expires.toISOString(), models: [{ id: "test-model", displayName: "Test Model", capabilities: ["text"], reasoningEfforts: ["low", "medium"], defaultReasoningEffort: "medium", isDefault: true }] } }],
      platform: { os: "windows" },
    };
    await sql`INSERT INTO runner_nodes ("runnerId", "tenantId", "ownerUserId", "nodeKind", profile, "displayName", "trustState", status, "currentSnapshotRevision", "currentSnapshotJson", "snapshotExpiresAt", "activeSessionId") VALUES (${runnerId}, ${tenantId}, ${actorId}, 'rust_runner', 'development', 'Disposable ingress runner', 'trusted', 'online', ${revision}, ${sql.json(snapshot)}, ${expires}, ${sessionId})`;
    await sql`INSERT INTO canonical_projects (project_id, tenant_id, project_type, title, owner_principal_id) VALUES (${projectId}, ${tenantId}, 'REPOSITORY', 'Disposable SPEC-224 workspace', ${`user:${actorId}`})`;
    await sql`INSERT INTO canonical_project_memberships (tenant_id, project_id, principal_id, role) VALUES (${tenantId}, ${projectId}, ${`user:${actorId}`}, 'owner')`;
    await sql`INSERT INTO canonical_project_workspace_bindings (tenant_id, project_id, repository_id, scope, runner_id, workspace_id, created_by_principal_id) VALUES (${tenantId}, ${projectId}, ${`repo-${tenantId}`}, 'PLATFORM_ENGINEERING', ${runnerId}, ${workspaceId}, ${`user:${actorId}`})`;
    await sql`INSERT INTO runner_capability_snapshots (id, "runnerId", "tenantId", revision, "idempotencyKey", "observedAt", "expiresAt", "snapshotJson") VALUES (${snapshotId}, ${runnerId}, ${tenantId}, ${revision}, ${randomUUID()}, ${observed}, ${expires}, ${sql.json(snapshot)})`;
    const [{ getDb }, { conversations, spec224ConversationWorkspaces }, { defaultSpec224WorkspaceSpecSetService }, { refreshAppRuntimeConfigCache }, { signBearerToken }] = await Promise.all([
      import("../../db"), import("../../../drizzle/schema"), import("../spec224WorkspaceSpecSet"), import("../appRuntimeConfig"), import("../../_core/tokens"),
    ]);
    const [conversation] = await getDb().insert(conversations).values({ userId: actorId, tenantId, title: "Goal admission ingress" }).returning({ id: conversations.id });
    await getDb().insert(spec224ConversationWorkspaces).values({ conversationId: conversation.id, tenantId, actorId, runnerId, workspaceId, snapshotRevision: revision });
    const budgetAccounts = await provisionSpec224EconomicTestBudget(getDb(), { tenantId, scopeId: `ingress-${conversation.id}`, limitMinorUnits: 10_000 });
    process.env.SMARTSPEC_ECONOMIC_RESERVE_DEBIT_ACCOUNT_ID = budgetAccounts.sourceAccountId;
    process.env.SMARTSPEC_ECONOMIC_RESERVE_CREDIT_ACCOUNT_ID = budgetAccounts.targetAccountId;

    const port = await freePort();
    await sql`INSERT INTO system_settings (category, key, value, "isSensitive", description) VALUES ('infrastructure', 'python_backend_url', ${`http://127.0.0.1:${port}`}, false, 'Disposable SPEC-224 integration server')`;
    await refreshAppRuntimeConfigCache();
    const authority = await startApprovalAuthority(port);
    let webServer: import("node:http").Server | undefined;
    try {
      // Verify the production workspace service resolves the persisted tenant/user binding and live Runner snapshot.
      await expect(defaultSpec224WorkspaceSpecSetService.getConversationWorkspace({ tenantId, actorId, conversationId: conversation.id })).resolves.toMatchObject({
        workspace: { runnerId, workspaceId, snapshotRevision: revision }, availability: { status: "current" },
      });
      const token = signBearerToken({ sub: String(actorId), user_id: actorId, tenantId, type: "access", scopes: ["development:run"] }, "30m");
      const [{ createExpressMiddleware }, { createContext }, { appRouter }] = await Promise.all([
        import("@trpc/server/adapters/express"), import("../../_core/context"), import("../../routers"),
      ]);
      const app = (await import("express")).default();
      app.use((await import("express")).default.json({ limit: "2mb" }));
      app.use("/trpc", createExpressMiddleware({ router: appRouter, createContext }));
      const server = app.listen(0, "127.0.0.1");
      webServer = server;
      await new Promise<void>(resolveListen => server.once("listening", resolveListen));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("TASK_CONTROL_TRPC_SERVER_UNAVAILABLE");
      const startWorkspaceRun = async (input: Record<string, unknown>) => {
        const response = await fetch(`http://127.0.0.1:${address.port}/trpc/spec226DevelopmentControl.startWorkspaceRun`, {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ json: input }),
        });
        const body = await response.json() as { result?: { data?: { json?: any } }; error?: { json?: { message?: string } } };
        if (!response.ok || !body.result?.data?.json)
          throw new Error(`TASK_CONTROL_TRPC_START_FAILED:${response.status}:${body.error?.json?.message ?? "response_invalid"}`);
        return body.result.data.json;
      };
      const startInput = { conversationId: conversation.id, mode: "prompt" as const, prompt: "Make a bounded reversible test-only change", writeScope: ["apps/runner-app/tests/spec224-live-pilot/**"], idempotencyKey: `goal-ingress-${randomUUID()}`, budgetCapMinorUnits: 10_000, provider: "codex" as const };
      let first;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (input, init) => {
        const response = await originalFetch(input, init);
        if (String(input).includes("/spec224/goal-grants") && !response.ok)
          console.error("GOAL_APPROVAL_HTTP_FAILURE", response.status, (await response.clone().text()).slice(0, 300));
        return response;
      };
      try {
        first = await startWorkspaceRun(startInput);
      } catch (error) {
        throw new Error(`${error instanceof Error ? error.message : String(error)}\nApproval Authority log: ${authority.getStderr()}`);
      } finally {
        globalThis.fetch = originalFetch;
      }
      expect(first).toMatchObject({ dispatchStatus: "PENDING_AUTHORIZATION", goalAdmissionStatus: "GOAL_APPROVAL_PENDING", authorization: { status: "GOAL_APPROVAL_PENDING" } });
      const [persisted] = await sql`SELECT id, execution_id, payload, status FROM approval_requests WHERE tenant_id = ${tenantId} ORDER BY created_at DESC LIMIT 1`;
      const { createDevelopmentRunService, defaultDevelopmentRunPersistenceAdapter } = await import("../spec224DevelopmentRunPersistence");
      const runRow = await createDevelopmentRunService(defaultDevelopmentRunPersistenceAdapter).get({ tenantId, actorId, runId: first.runId });
      expect(persisted.status).toBe("PENDING");
      expect(persisted.execution_id).toBe(runRow.run.goalId);
      expect(runRow.run.goalId).toMatch(/^[0-9a-f-]{36}$/);
      expect((persisted.payload as any).workspaceId).toBe(workspaceId);
      expect((persisted.payload as any).provider).toBe("codex");
      expect((persisted.payload as any).sourceSha).toBe(sourceSha);
      expect((persisted.payload as any).budgetLimitMinorUnits).toBe(10_000);
      expect(runRow.run.metadata?.spec224BudgetCapMinorUnits).toBe(5_000);

      const replay = await startWorkspaceRun(startInput);
      expect(replay).toMatchObject({ runId: first.runId, jobId: first.jobId, idempotent: true, dispatchStatus: "PENDING_AUTHORIZATION" });
      const [approvalCount] = await sql`SELECT COUNT(*)::int AS count FROM approval_requests WHERE tenant_id = ${tenantId} AND payload->>'kind' = 'spec224_goal_delegation_grant'`;
      expect(approvalCount.count).toBe(1);
      expect(await approve(first.authorization.approvalRef, tenantId, approverId)).toMatchObject({ requestId: first.authorization.approvalRef, decision: "approved" });

      const { reconcileSpec224GoalAdmissions, reconcileSpec224RunnerContinuations } = await import("../spec224RunnerContinuationReconciler");
      await Promise.all([reconcileSpec224GoalAdmissions(), reconcileSpec224GoalAdmissions()]);
      const [firstOutbox] = await sql`SELECT COUNT(*)::int AS count FROM worker_job_outbox WHERE "workerJobId" = ${first.jobId}`;
      const [firstHold] = await sql`SELECT COUNT(*)::int AS count FROM economic_holds WHERE "workerJobId" = ${first.jobId}`;
      expect(firstOutbox.count).toBe(1);
      expect(firstHold.count).toBe(1);

      const { createJobControlPlane } = await import("../jobControlPlane");
      const control = createJobControlPlane();
      const lease = await control.claim({ jobId: first.jobId, runnerId: "ingress-test-worker", adapter: "postgres-direct" });
      if (!lease) throw new Error("INGRESS_CHILD_ONE_NOT_DISPATCHABLE");
      await control.start(lease);
      const commandId = randomUUID(), operationKey = `external-agent:${first.runId}:1`, leaseId = `lease:${lease.jobId}:${lease.attemptId}`;
      await control.waitForExternal(lease, { operationKey, resumeAfter: expires.toISOString(), metadata: { commandId, executionKind: "external_agent_task", runnerId, runnerSessionId: sessionId, capabilitySnapshotId: snapshotId, capabilitySnapshotRevision: revision, leaseId, fenceVersion: lease.fencingVersion } });
      const receipt = { jobId: first.jobId, commandId, eventId: randomUUID(), eventType: "EXECUTION_COMPLETED" as const, sequence: 1, runnerId, runnerSessionId: sessionId, tenantId, payload: { attempt: 1, leaseId, fenceVersion: lease.fencingVersion, capabilitySnapshotId: snapshotId, capabilitySnapshotRevision: revision, resultRef: `result:${first.runId}` } };
      expect(await control.recordRunnerReceipt(receipt)).toBe("recorded");
      expect(await control.recordRunnerReceipt(receipt)).toBe("duplicate");
      await Promise.all([reconcileSpec224RunnerContinuations(), reconcileSpec224RunnerContinuations()]);
      const jobs = await sql`SELECT id, status, "progressJson"->'spec224Authorization'->>'status' AS authorization_status, "progressJson"->'spec224Authorization'->'binding'->>'budgetReservationRef' AS hold_ref FROM worker_jobs WHERE "tenantId" = ${tenantId} AND "inputJson"->'spec224Run'->>'runId' = ${first.runId} ORDER BY "createdAt"`;
      expect(jobs).toHaveLength(2);
      expect(jobs[1].status).toBe("queued");
      expect(jobs.map(job => job.authorization_status)).toEqual(["READY_FOR_LIVE", "READY_FOR_LIVE"]);
      expect(jobs.every(job => typeof job.hold_ref === "string")).toBe(true);
      const [economics] = await sql`SELECT COUNT(DISTINCT h.id)::int AS holds, COUNT(DISTINCT h."attemptId")::int AS attempts, SUM(h."amountMinorUnits")::int AS reserved, COUNT(DISTINCT o.id)::int AS outbox FROM economic_holds h JOIN worker_job_outbox o ON o."workerJobId" = h."workerJobId" WHERE h."tenantId" = ${tenantId}`;
      expect(economics).toEqual({ holds: 2, attempts: 2, reserved: 10_000, outbox: 2 });
      const [sharedBudget] = await sql`SELECT COUNT(*)::int AS count, MAX("limitMinorUnits")::int AS limit FROM economic_budgets WHERE "tenantId" = ${tenantId} AND "scopeType" = 'spec224_goal'`;
      expect(sharedBudget).toEqual({ count: 1, limit: 10_000 });
    } finally {
      if (webServer) await new Promise<void>((resolveClose, reject) => webServer!.close(error => error ? reject(error) : resolveClose()));
      authority.proc.kill("SIGTERM");
      await Promise.race([new Promise(resolveExit => authority.proc.once("exit", resolveExit)), delay(5_000)]);
      if (authority.proc.exitCode === null) authority.proc.kill("SIGKILL");
    }
  }, 120_000);
});
