import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql, and, eq } from "drizzle-orm";
import { getDb, type DrizzleDB } from "../db";
import { systemSettings } from "../../drizzle/schema";
import type { JobExecutor } from "./jobExecutor";
import { withCloudflareStagingLeaseHeartbeat } from "./cloudflareStagingLeaseHeartbeat";
import { assertHttpCandidateOwner, resolveHttpCandidatePackage } from "./cloudflareHttpCandidatePreparation";
import { readHttpRuntimeIntent } from "./cloudflareHttpRuntimeAdmission";
import { getHttpRuntimePlan, loadHttpRuntimeEnvironments, planHttpApplicationRelations } from "./cloudflareHttpRuntimePlan";
import { HTTP_RUNTIME_JOB, HTTP_RUNTIME_CONTRACT, httpRuntimeJobSchema } from "./cloudflareHttpRuntimeContract";
import { CANDIDATE_MODULE } from "./cloudflareHttpCandidateContract";
import { prepareApplicationDatabaseRole } from "./cloudflareApplicationDatabaseRole";
import { composeHttpRuntime } from "./cloudflareHttpRuntimeComposition";
import { withCloudflareDeploymentCredential } from "./cloudflareCredentialCenter";
import { resolveCloudflareStagingModules } from "./cloudflareStagingArtifactAuthority";
import { runHttpImageOperatorCommand } from "./cloudflareHttpImageBuildOperator";
import { classifyHttpCandidateWranglerFailure } from "./cloudflareHttpCandidateDiagnostics";
import { encrypt } from "./crypto";

const CHECKPOINT = "cloudflare_production_native_runtime_checkpoints";
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function fail(code: string): never { const diagnosticCode = `HTTP_RUNTIME_${code}`;
  throw Object.assign(Error(diagnosticCode), { diagnosticCode, class: "permanent" }); }
const safeCode = (error: unknown) => error instanceof Error && /^[A-Z][A-Z0-9_]{4,120}$/.test(error.message) ? error.message : "HTTP_RUNTIME_EXECUTION_FAILED";

/** Updates only the existing isolated Candidate under a canonical Owner
 * intent. Metadata authority from its original preparation cannot enter here.
 * All checkpoints carrying credentials are encrypted and never job output. */
export const createHttpRuntimeExecutor = (): JobExecutor => withCloudflareStagingLeaseHeartbeat(async ({ context, lease, reporter }) => {
  const parsed = httpRuntimeJobSchema.safeParse(context.input);
  if (!parsed.success || context.jobType !== HTTP_RUNTIME_JOB || context.contractVersion !== HTTP_RUNTIME_CONTRACT ||
      context.executionClass !== "long" || !context.requestedByUserId || context.jobId !== parsed.data.submissionId) fail("JOB_DENIED");
  const input = parsed.data, db = getDb(), scope = { tenantId: context.tenantId, projectId: input.projectId, actorUserId: context.requestedByUserId };
  const row = await readHttpRuntimeIntent(db, context.jobId), intent = row?.valueJson as Record<string, any> | undefined;
  if (!intent || row?.updatedBy !== scope.actorUserId || intent.actorUserId !== scope.actorUserId || intent.tenantId !== scope.tenantId ||
      intent.projectId !== scope.projectId || intent.submissionId !== context.jobId || intent.planDigest !== input.planDigest ||
      hash(intent.plan) !== input.planDigest || intent.plan.candidateJobId !== input.candidateJobId ||
      intent.authority !== "existing-candidate-bounded-runtime-test-v1" || intent.trafficMutation !== false || intent.dnsMutation !== false ||
      intent.imagePublication !== false || intent.applicationCreation !== false || intent.fixtureCreation !== false) fail("AUTHORIZATION_DENIED");
  const assertAuthorized = async () => {
    await reporter.assertActive(lease); await assertHttpCandidateOwner(db, scope);
    const current = await readHttpRuntimeIntent(db, context.jobId);
    if (current?.updatedBy !== scope.actorUserId || JSON.stringify(current.valueJson) !== JSON.stringify(intent) || intent.revokedAt !== null ||
        !Number.isFinite(Date.parse(intent.expiresAt)) || Date.parse(intent.expiresAt) <= Date.now() ||
        intent.plan.executorId !== process.env.CLOUDFLARE_PRODUCTION_EXECUTOR_ID?.trim()) fail("AUTHORIZATION_EXPIRED_OR_CHANGED");
  };
  await assertAuthorized();
  const plan = (await getHttpRuntimePlan(db, scope, input.candidateJobId, intent.plan)).plan;
  if (hash(plan) !== input.planDigest) fail("PLAN_CHANGED");
  const { target, packet, settings: originalSettings } = await resolveHttpCandidatePackage(db, scope);
  const bundle = await resolveCloudflareStagingModules(plan.artifactRef, plan.workerSourceSha);
  if (!bundle?.moduleFiles[CANDIDATE_MODULE]) fail("CANONICAL_MODULE_REQUIRED");
  const checkpointWhere = and(eq(systemSettings.category, CHECKPOINT), eq(systemSettings.key, context.jobId));
  const state: Record<string, any> = { jobId: context.jobId, ...scope, candidateJobId: input.candidateJobId, planDigest: input.planDigest, stage: "PREPARING", rolePrepared: false,
    providerWriteIntent: false, runtimeAcceptance: false, trafficMutation: false, candidateBaseline: plan.candidate };
  const persist = async (transaction: DrizzleDB = db) => {
    await reporter.assertActive(lease);
    // system_settings intentionally has no category/key unique constraint.
    // Use the existing transactional advisory-lock pattern, not ON CONFLICT
    // against an imaginary index or a schema migration for this operation.
    await transaction.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`native-runtime-checkpoint:${context.jobId}`}))`);
      const rows = await tx.select().from(systemSettings).where(checkpointWhere).limit(2);
      if (rows.length > 1 || rows[0] && (rows[0].updatedBy !== scope.actorUserId || !rows[0].isSensitive)) fail("CHECKPOINT_SCOPE_DENIED");
      const values = { isSensitive: true, value: encrypt(JSON.stringify(state)), valueJson: null, updatedBy: scope.actorUserId, updatedAt: new Date() };
      if (rows[0]) await tx.update(systemSettings).set(values).where(eq(systemSettings.id, rows[0].id));
      else await tx.insert(systemSettings).values({ ...values, category: CHECKPOINT, key: context.jobId,
        description: "Encrypted canonical native runtime execution checkpoint" });
    });
  };
  if ((await db.select({ id: systemSettings.id }).from(systemSettings).where(checkpointWhere).limit(1)).length)
    fail("CHECKPOINT_RECONCILE_REQUIRED");
  await persist();
  const access = await withCloudflareDeploymentCredential(db, { identity: { ...scope, provider: "cloudflare", environment: "production" },
    credentialRef: target.credentialRef }, async token => {
    let requestCount = 0;
    const api = async (path: string, method = "GET", body?: unknown) => {
      await assertAuthorized(); if (++requestCount > 80) fail("PROVIDER_REQUEST_BUDGET_EXCEEDED");
      const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, { method,
        headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15_000) });
      const data = await response.json();
      if (!response.ok || data.success !== true || (data.result_info?.total_pages ?? 1) > 1) {
        const code = data.errors?.find((e: any) => Number.isSafeInteger(e.code))?.code;
        fail(`PROVIDER_HTTP_${response.status}${code ? `_CF_${code}` : ""}`);
      }
      return data.result;
    };
    const root = `/accounts/${target.accountRef}`, script = `${root}/workers/scripts/${plan.candidate.workerName}`;
    const routesPath = "/zones/9acd8fe46851607de0919f2b6a462911/workers/routes";
    const m2Route = (routes: any) => Array.isArray(routes) ? routes.filter(r => r.pattern === "smartaihub.app/*") : [];
    const baseline = m2Route(await api(routesPath));
    if (baseline.length !== 1 || baseline[0].script !== "smartspec-cloudflare-runtime") fail("M2_BASELINE_DENIED");
    const m2 = await api(`${root}/workers/scripts/smartspec-cloudflare-runtime/deployments`);
    const m2Baseline = m2?.deployments?.[0]; if (!m2Baseline?.id) fail("M2_DEPLOYMENT_BASELINE_REQUIRED");
    const subdomain = await api(`${root}/workers/subdomain`);
    if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(subdomain?.subdomain ?? "")) fail("WORKERS_SUBDOMAIN_INVALID");
    const candidateOrigin = `https://${plan.candidate.workerName}.${subdomain.subdomain}.workers.dev`;
    const canaryToken = randomBytes(32).toString("hex");
    const probe = async (path: string, method = "GET") => {
      await assertAuthorized();
      const response = await fetch(`${candidateOrigin}/_ops/application-canary/${path}`, { method,
        headers: { "x-smartaihub-application-canary-token": canaryToken, accept: "application/json" },
        redirect: "error", cache: "no-store", signal: AbortSignal.timeout(160_000) });
      let json: any; try { json = await response.json(); } catch { json = null; }
      // Raw response bodies may include application detail; only assertions
      // and these narrowly selected fields leave the process.
      return { status: response.status, colo: response.headers.get("cf-ray")?.split("-").at(-1), json };
    };
    let directory: string | undefined, roleReceipt: unknown, runtimeReceipt: Record<string, any> | undefined, failure: unknown;
    const cleanup: Record<string, any> = { nodeStopped: false, pythonStopped: false, candidateRestored: false, roleLoginRevoked: false, m2Preserved: false };
    try {
      await assertAuthorized();
      const relations = await planHttpApplicationRelations(db);
      if (hash(relations) !== hash(plan.relations)) fail("DATABASE_RELATIONS_CHANGED");
      const rolePlan = { tenantId: scope.tenantId, projectId: scope.projectId, databaseName: plan.network.databaseName,
        tables: relations.tables, sequences: relations.sequences, connectionLimit: 10 as const,
        expiresAt: new Date(Math.min(Date.now() + 40 * 60_000, Date.parse(intent.expiresAt))).toISOString() };
      roleReceipt = await prepareApplicationDatabaseRole(db, { plan: rolePlan, assertAuthorized,
        saveSecret: async (tx, secret) => { Object.assign(state, { rolePrepared: true, rolePlan, roleSecret: secret, stage: "ROLE_PREPARED" }); await persist(tx); } });
      await reporter.progress(lease, { progress: 15, stage: "NATIVE_RUNTIME_ROLE_PREPARED", measured: { role: plan.role, policiesChanged: false } });
      const settings = { ...originalSettings, issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 9 * 60_000).toISOString() };
      const environments = await loadHttpRuntimeEnvironments();
      // This immutable configuration is owned by the same encrypted canonical
      // intent/checkpoint; its content digest names the exact runtime scope.
      const descriptor = { schemaVersion: "cloudflare-native-runtime-configuration-v1", ...scope, accountRef: target.accountRef,
        jobId: context.jobId, planDigest: input.planDigest, settings, network: plan.network, rolePlan };
      const configurationRef = `cf-origin:${hash(descriptor)}`;
      const composition = composeHttpRuntime({ scope: { ...scope, accountRef: target.accountRef, environment: "production" },
        configurationRef, settings, network: plan.network, rolePlan, roleSecret: state.roleSecret, ...environments, canaryToken });
      Object.assign(state, { configurationRef, descriptor, runtimeSecrets: composition.secrets, canaryToken, stage: "CONFIGURED" }); await persist();
      const vars = Object.fromEntries(composition.bindings.filter(b => b.type === "plain_text").map(b => [b.name, b.text]));
      const secrets = Object.fromEntries(composition.bindings.filter(b => b.type === "secret_text").map(b => [b.name, b.text]));
      directory = await mkdtemp(join(tmpdir(), "sah-native-runtime-"));
      for (const [name, file] of Object.entries(bundle.moduleFiles)) {
        if (!/^[a-zA-Z0-9_./-]+$/.test(name) || name.split("/").some(p => !p || p === "." || p === "..")) fail("ARTIFACT_PATH_DENIED");
        const destination = join(directory, name); await mkdir(join(destination, ".."), { recursive: true }); await writeFile(destination, file.bytes, { mode: 0o600 });
      }
      const configPath = join(directory, "wrangler.json"), secretsPath = join(directory, "runtime-secrets.json");
      // Containers already exist. No migration/new namespace or container
      // rollout is allowed; only the current DO/image bindings are retained.
      const { migrations: _migrations, ...config } = packet.config;
      await writeFile(configPath, JSON.stringify({ ...config, main: `./${CANDIDATE_MODULE}`, no_bundle: true,
        vars, vpc_networks: composition.vpcNetworks }), { mode: 0o600 });
      await writeFile(secretsPath, JSON.stringify(secrets), { mode: 0o600 });
      const env = { PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin", HOME: process.env.HOME ?? directory,
        CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: target.accountRef, WRANGLER_SEND_METRICS: "false", CI: "true" };
      const args = ["dlx", "wrangler@4.151.1", "deploy", "--config", configPath, "--secrets-file", secretsPath, "--containers-rollout", "none"];
      await runHttpImageOperatorCommand({ command: "pnpm", args: [...args, "--dry-run"], cwd: directory, env, timeoutMs: 60_000,
        assertAuthorized, classifyFailure: classifyHttpCandidateWranglerFailure });
      state.stage = "PROVIDER_WRITE_INTENT"; state.providerWriteIntent = true; await persist();
      await reporter.progress(lease, { progress: 25, stage: "NATIVE_RUNTIME_PROVIDER_WRITE_INTENT", measured: { workerName: plan.candidate.workerName } });
      await runHttpImageOperatorCommand({ command: "pnpm", args: [...args, "--message", `canonical-native-runtime:${context.jobId}:${input.planDigest}`],
        cwd: directory, env, timeoutMs: 180_000, assertAuthorized, classifyFailure: classifyHttpCandidateWranglerFailure });
      const deployment = (await api(`${script}/deployments`))?.deployments?.[0];
      if (!deployment?.id || deployment.versions?.length !== 1 || deployment.versions[0].percentage !== 100) fail("DEPLOYMENT_RECEIPT_REQUIRED");
      const versionId = deployment.versions[0].version_id, version = await api(`${script}/versions/${versionId}`);
      const bindings = version?.resources?.bindings;
      if (!Array.isArray(bindings) || !bindings.some(b => b.name === "DATABASE_NETWORK" && b.type === "vpc_network" && b.tunnel_id === plan.network.tunnelId) ||
          !composition.bindings.every(b => bindings.some(p => p.name === b.name && p.type === b.type && (b.type !== "plain_text" || p.text === b.text))))
        fail("RUNTIME_BINDINGS_READBACK_MISMATCH");
      const apps = await api(`${root}/containers/applications?per_page=100`);
      if (!Array.isArray(apps) || !plan.candidate.applications.every(expected => apps.some(a => a.id === expected.applicationId && a.name === expected.name &&
        a.durable_objects?.namespace_id === expected.namespaceId) && bindings.some(b => b.type === "durable_object_namespace" && b.namespace_id === expected.namespaceId)))
        fail("EXISTING_APPLICATION_IDS_CHANGED");
      state.deploymentId = deployment.id; state.versionId = versionId; state.stage = "DEPLOYED"; await persist();
      await reporter.progress(lease, { progress: 45, stage: "NATIVE_RUNTIME_TESTING", measured: { deploymentId: deployment.id, versionId } });
      const results: Array<{ probe: string; status: number; colo?: string }> = [];
      for (const path of ["node/health", "node/database", "python/health", "python/database", "node/auth", "python/auth"]) {
        const result = await probe(path); results.push({ probe: path, status: result.status, colo: result.colo });
        state.probes = results; await persist();
        if (path.endsWith("/auth") ? ![401, 403].includes(result.status) && !(path === "node/auth" && result.status === 200 &&
          (result.json?.result?.data?.json === null || result.json?.result?.data === null)) : result.status !== 200)
          fail(`PROBE_${path.replace("/", "_").toUpperCase()}_HTTP_${result.status}`);
      }
      const diagnostics: Record<string, any> = {};
      for (const runtime of ["node", "python"]) {
        const result = await probe(`${runtime}/status`), d = result.json;
        if (result.status !== 200 || d?.running !== true || d.configurationMatches !== true || d.starts < 1 || d.starts > 2 || d.reservedSeconds > 1200 || d.failure)
          fail(`${runtime.toUpperCase()}_RUNNING_RECEIPT_DENIED`);
        diagnostics[runtime] = { running: d.running, starts: d.starts, reservedSeconds: d.reservedSeconds, activeUntil: d.activeUntil };
      }
      runtimeReceipt = { schemaVersion: "cloudflare-native-runtime-test-receipt-v1", jobId: context.jobId, candidateJobId: input.candidateJobId,
        workerName: plan.candidate.workerName, deploymentId: deployment.id, versionId, applications: plan.candidate.applications,
        role: plan.role, databaseRoleReceipt: roleReceipt, transport: plan.network.transport, configurationRef,
        probes: results, diagnostics, runtimeBootVerified: true, authenticatedApplicationAcceptance: false, runtimeAcceptance: false,
        pending: ["authenticated-positive-and-cross-tenant-API", "Gateway-billing-jobs-recovery", "independent-native-activation"],
        trafficMutation: false, dnsMutation: false, imagePublication: false, m3Accepted: false };
    } catch (error) { failure = error; state.failure = safeCode(error); }
    finally {
      // The same bounded intent explicitly authorizes compensation. It still
      // requires a valid canonical lease/intent; expiry is not bypassed.
      if (state.providerWriteIntent) {
        for (const runtime of ["node", "python"]) {
          try { const result = await probe(`${runtime}/stop`, "POST"); cleanup[`${runtime}Stopped`] = result.status === 200 && result.json?.stopped === true; }
          catch { /* Independent hard deadlines remain active. */ }
        }
        try {
          const active = (await api(`${script}/deployments`))?.deployments?.[0];
          if (active?.id !== plan.candidate.deploymentId) {
            // Never overwrite an unrelated concurrently deployed Candidate.
            const version = active?.versions?.[0]?.version_id && await api(`${script}/versions/${active.versions[0].version_id}`);
            if (state.versionId ? active.versions?.length !== 1 || active.versions[0].version_id !== state.versionId
              : !String(version?.annotations?.["workers/message"] ?? "").includes(`canonical-native-runtime:${context.jobId}:`))
              fail("ROLLBACK_CONCURRENT_DEPLOYMENT_DENIED");
            await api(`${script}/deployments`, "POST", { strategy: "percentage", versions: [{ version_id: plan.candidate.versionId, percentage: 100 }] });
          }
          const restored = (await api(`${script}/deployments`))?.deployments?.[0];
          cleanup.candidateRestored = restored?.versions?.length === 1 && restored.versions[0].version_id === plan.candidate.versionId && restored.versions[0].percentage === 100;
          if (cleanup.candidateRestored) { cleanup.candidateDeploymentId = restored.id; cleanup.candidateVersionId = plan.candidate.versionId; }
        } catch (error) { state.rollbackFailure = safeCode(error); }
      } else cleanup.candidateRestored = true;
      if (state.rolePrepared) {
        try { await assertAuthorized();
          // Generated exact identifier, never a caller-provided role. Keep
          // grants/checkpoint for audit and recovery; disable future logins.
          if (!/^sah_cf_app_[a-f0-9]{12}$/.test(plan.role) || state.roleSecret.role !== plan.role) fail("ROLE_CLEANUP_SCOPE_DENIED");
          await db.execute(sql.raw(`ALTER ROLE "${plan.role}" NOLOGIN`));
          await db.execute(sql`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename=${plan.role} AND pid<>pg_backend_pid()`);
          cleanup.roleLoginRevoked = true;
        } catch (error) { state.roleCleanupFailure = safeCode(error); }
      } else cleanup.roleLoginRevoked = true;
      try { cleanup.m2Preserved = hash(m2Route(await api(routesPath))) === hash(baseline) &&
        hash((await api(`${root}/workers/scripts/smartspec-cloudflare-runtime/deployments`))?.deployments?.[0]) === hash(m2Baseline); }
      catch { cleanup.m2Preserved = false; }
      state.cleanup = cleanup; state.stage = failure ? "FAILED" : "TESTED_AND_COMPENSATED"; await persist();
      if (directory) await rm(directory, { recursive: true, force: true });
    }
    if (!cleanup.candidateRestored || !cleanup.roleLoginRevoked || !cleanup.m2Preserved) fail("COMPENSATION_RECONCILIATION_REQUIRED");
    if (failure) throw Object.assign(Error(safeCode(failure)), { diagnosticCode: safeCode(failure), class: "permanent" });
    if (!runtimeReceipt || !cleanup.nodeStopped || !cleanup.pythonStopped) fail("CONTAINER_STOP_READBACK_REQUIRED");
    return { ...runtimeReceipt, cleanup };
  });
  if (access.status !== "CONFIGURED" || !access.value) fail("CREDENTIAL_UNAVAILABLE");
  return { output: access.value };
});
