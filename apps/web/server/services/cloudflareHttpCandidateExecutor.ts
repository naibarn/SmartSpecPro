import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { JobExecutor } from "./jobExecutor";
import { getDb } from "../db";
import { withCloudflareStagingLeaseHeartbeat } from "./cloudflareStagingLeaseHeartbeat";
import { runHttpImageOperatorCommand } from "./cloudflareHttpImageBuildOperator";
import { resolveCloudflareStagingModules } from "./cloudflareStagingArtifactAuthority";
import { withCloudflareDeploymentCredential } from "./cloudflareCredentialCenter";
import { CANDIDATE_MODULE, HTTP_CANDIDATE_CONTRACT, HTTP_CANDIDATE_JOB, httpCandidateJobSchema } from "./cloudflareHttpCandidateContract";
import { assertHttpCandidateOwner, readHttpCandidateIntent, resolveHttpCandidatePackage } from "./cloudflareHttpCandidatePreparation";
import { classifyHttpCandidateWranglerFailure } from "./cloudflareHttpCandidateDiagnostics";
import { probeHttpCandidateProvider } from "./cloudflareHttpCandidateProvider";

function fail(code: string): never { const diagnosticCode = `HTTP_CANDIDATE_${code}`;
  throw Object.assign(Error(diagnosticCode), { diagnosticCode, class: "permanent" }); }

export const createHttpCandidateExecutor = (): JobExecutor => withCloudflareStagingLeaseHeartbeat(async ({ context, lease, reporter }) => {
  const parsed = httpCandidateJobSchema.safeParse(context.input);
  if (!parsed.success || context.jobType !== HTTP_CANDIDATE_JOB || context.contractVersion !== HTTP_CANDIDATE_CONTRACT ||
      context.executionClass !== "long" || !context.requestedByUserId || context.jobId !== parsed.data.submissionId) fail("JOB_DENIED");
  const input = parsed.data, db = getDb(), scope = { tenantId: context.tenantId, projectId: input.projectId, actorUserId: context.requestedByUserId };
  const intentRow = await readHttpCandidateIntent(db, context.jobId), intent = intentRow?.valueJson as Record<string, any> | undefined;
  if (!intent || intentRow?.updatedBy !== scope.actorUserId || intent.tenantId !== scope.tenantId || intent.projectId !== scope.projectId ||
      intent.actorUserId !== scope.actorUserId || intent.submissionId !== context.jobId || intent.planDigest !== input.planDigest ||
      intent.containerStarts !== 0 || intent.dnsMutation !== false || intent.trafficMutation !== false) fail("AUTHORIZATION_DENIED");
  const { target, packet } = await resolveHttpCandidatePackage(db, scope);
  if (intent.plan.workerName !== packet.config.name || intent.plan.accountRef !== target.accountRef ||
      intent.plan.credentialRef !== target.credentialRef || intent.plan.manifestDigest !== packet.manifestDigest ||
      intent.plan.imageSourceSha !== packet.imageSourceSha) fail("PLAN_CHANGED");
  const assertAuthorized = async () => {
    await reporter.assertActive(lease);
    await assertHttpCandidateOwner(db, scope);
    const row = await readHttpCandidateIntent(db, context.jobId), current = row?.valueJson as Record<string, any> | undefined;
    if (row?.updatedBy !== scope.actorUserId || JSON.stringify(current) !== JSON.stringify(intent) || current?.revokedAt !== null ||
        Date.parse(current.expiresAt) <= Date.now() || !Number.isFinite(Date.parse(current.expiresAt)) ||
        current.plan.executorId !== process.env.CLOUDFLARE_PRODUCTION_EXECUTOR_ID?.trim() ||
        Date.now() - Date.parse(context.createdAt) > 10 * 60_000) fail("AUTHORIZATION_EXPIRED_OR_CHANGED");
    // Target credential changes/revocation must stop an in-flight CLI too.
    const currentPackage = await resolveHttpCandidatePackage(db, scope);
    if (currentPackage.target.credentialRef !== target.credentialRef || currentPackage.target.accountRef !== target.accountRef ||
        currentPackage.packet.manifestDigest !== packet.manifestDigest) fail("TARGET_CHANGED");
  };
  await assertAuthorized();
  const bundle = await resolveCloudflareStagingModules(intent.plan.artifactRef, intent.plan.workerSourceSha);
  if (!bundle?.moduleFiles[CANDIDATE_MODULE]) fail("CANONICAL_MODULE_REQUIRED");
  const result = await withCloudflareDeploymentCredential(db, { identity: { tenantId: scope.tenantId, projectId: scope.projectId,
    environment: "production", provider: "cloudflare" }, credentialRef: target.credentialRef }, async token => {
    let requests = 0;
    const get = async (path: string, allowAbsent = false) => {
      await assertAuthorized(); if (++requests > 16) fail("READ_BUDGET_EXCEEDED");
      const fetchPage = async (page?: number) => {
        const url = new URL(`https://api.cloudflare.com/client/v4${path}`);
        if (page !== undefined) { url.searchParams.set("page", String(page)); url.searchParams.set("per_page", "100"); }
        const response = await fetch(url, { method: "GET", headers: { authorization: `Bearer ${token}` },
        redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15_000) });
        const body = await response.json();
        if (allowAbsent && page === 1 && response.status === 404 && body.success === false) return null;
        if (!response.ok || body.success !== true) fail(`PROVIDER_HTTP_${response.status}`);
        return { result: body.result, page: body.result_info?.page, totalPages: body.result_info?.total_pages ?? 1 };
      };
      const first = await fetchPage(path.endsWith("/deployments") ? 1 : undefined);
      if (first === null) return null;
      if (!path.endsWith("/deployments")) return first.result;
      if (!Number.isInteger(first.totalPages) || first.totalPages < 1 || first.totalPages > 20 ||
          (first.page !== undefined && first.page !== 1)) fail("PROVIDER_INVENTORY_INCOMPLETE");
      const pages = [first.result];
      for (let page = 2; page <= first.totalPages; page += 1) {
        if (++requests > 16) fail("READ_BUDGET_EXCEEDED");
        const next = await fetchPage(page);
        if (next === null || next.totalPages !== first.totalPages || (next.page !== undefined && next.page !== page))
          fail("PROVIDER_INVENTORY_INCOMPLETE");
        pages.push(next.result);
      }
      return { deployments: pages.flatMap((result: any) => Array.isArray(result?.deployments) ? result.deployments : []) };
    };
    const root = `/accounts/${target.accountRef}`, script = `${root}/workers/scripts/${packet.config.name}`;
    // An existing deterministic candidate Worker may be updated only while its
    // exact account/name and active deployment still match the prepared baseline.
    const workerBaseline = await probeHttpCandidateProvider({ accountRef: target.accountRef, workerName: packet.config.name,
      applications: packet.config.containers, token,
      expectedWorkerBaseline: intent.plan.workerBaseline ?? null });
    if (!workerBaseline.readAccessVerified) fail("WORKER_BASELINE_UNVERIFIED");
    const apps = await get(`${root}/containers/applications?per_page=100`);
    if (!Array.isArray(apps)) fail("APPLICATION_INVENTORY_UNVERIFIED");
    const before = await get(`/zones/9acd8fe46851607de0919f2b6a462911/workers/routes`);
    const baseline = Array.isArray(before) ? before.filter(item => item.pattern === "smartaihub.app/*") : [];
    if (baseline.length !== 1 || baseline[0].script !== "smartspec-cloudflare-runtime") fail("M2_BASELINE_DENIED");
    const directory = await mkdtemp(join(tmpdir(), "sah-native-candidate-"));
    try {
      for (const [name, file] of Object.entries(bundle.moduleFiles)) {
        if (!/^[a-zA-Z0-9_./-]+$/.test(name) || name.split("/").some(part => !part || part === "." || part === "..")) fail("ARTIFACT_PATH_DENIED");
        const destination = join(directory, name); await mkdir(join(destination, ".."), { recursive: true });
        await writeFile(destination, file.bytes, { mode: 0o600 });
      }
      const configPath = join(directory, "wrangler.json");
      await writeFile(configPath, JSON.stringify({ ...packet.config, main: `./${CANDIDATE_MODULE}`, no_bundle: true }), { mode: 0o600 });
      const env = { PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin", HOME: process.env.HOME ?? directory,
        CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: target.accountRef, WRANGLER_SEND_METRICS: "false", CI: "true" };
      // Fixed CLI/version/config only. No job-provided command, build, shell,
      // Docker operation, ambient credential, secret file, route or VM profile.
      await runHttpImageOperatorCommand({ command: "pnpm", args: ["dlx", "wrangler@4.151.1", "deploy", "--dry-run", "--config", configPath],
        cwd: directory, env, timeoutMs: 60_000, assertAuthorized, classifyFailure: classifyHttpCandidateWranglerFailure });
      await assertAuthorized();
      await probeHttpCandidateProvider({ accountRef: target.accountRef, workerName: packet.config.name,
        applications: packet.config.containers, token, expectedWorkerBaseline: intent.plan.workerBaseline ?? null });
      await reporter.progress(lease, { progress: 20, stage: "NATIVE_CANDIDATE_PROVIDER_WRITE_INTENT",
        measured: { workerName: packet.config.name, manifestDigest: packet.manifestDigest, containerStarts: 0 } });
      await runHttpImageOperatorCommand({ command: "pnpm", args: ["dlx", "wrangler@4.151.1", "deploy", "--config", configPath,
        "--message", `canonical-native:${context.jobId}:${packet.manifestDigest}`], cwd: directory, env, timeoutMs: 8 * 60_000,
        assertAuthorized, classifyFailure: classifyHttpCandidateWranglerFailure });
    } finally { await rm(directory, { recursive: true, force: true }); }
    const deployments = await get(`${script}/deployments`), active = deployments?.deployments?.[0];
    if (!active?.id || active.versions?.length !== 1 || active.versions[0].percentage !== 100) fail("DEPLOYMENT_RECEIPT_INVALID");
    const versionId = active.versions[0].version_id, version = await get(`${script}/versions/${versionId}`);
    const bindings = version?.resources?.bindings, containers = version?.resources?.script_runtime?.containers;
    if (!Array.isArray(bindings) || !Array.isArray(containers) || bindings.some(item => !["NODE_HTTP", "PYTHON_HTTP", ...Object.keys(packet.config.vars)].includes(item.name)))
      fail("VERSION_BINDINGS_DENIED");
    const readback = await get(`${root}/containers/applications?per_page=100`);
    if (!Array.isArray(readback)) fail("APPLICATION_READBACK_INVALID");
    const receipts = packet.config.containers.map(expected => {
      const binding = bindings.filter((item: any) => item.type === "durable_object_namespace" && item.class_name === expected.class_name);
      const metadata = containers.filter((item: any) => item.class_name === expected.class_name);
      const matches = readback.filter((app: any) => app.name === expected.name);
      const images = Object.fromEntries(Object.entries(expected.images).map(([name, item]) => [name, item.image]));
      if (binding.length !== 1 || binding[0].script_name && binding[0].script_name !== packet.config.name ||
          metadata.length !== 1 || JSON.stringify(metadata[0].images) !== JSON.stringify(images) ||
          matches.length !== 1 || !matches[0].id || matches[0].scheduling_policy !== "durable_object" ||
          matches[0].durable_objects?.namespace_id !== binding[0].namespace_id) fail("APPLICATION_READBACK_MISMATCH");
      return { applicationId: matches[0].id, namespaceId: binding[0].namespace_id, name: expected.name, images };
    });
    const after = await get(`/zones/9acd8fe46851607de0919f2b6a462911/workers/routes`);
    if (!Array.isArray(after) || JSON.stringify(after.filter(item => item.pattern === "smartaihub.app/*")) !== JSON.stringify(baseline)) fail("M2_BASELINE_CHANGED");
    await assertAuthorized();
    return { schemaVersion: "cloudflare-production-native-preparation-receipt-v1", workerName: packet.config.name,
      accountRef: target.accountRef, deploymentId: active.id, versionId, applications: receipts,
      workerSourceSha: intent.plan.workerSourceSha, imageSourceSha: packet.imageSourceSha, manifestDigest: packet.manifestDigest,
      containerStarts: 0, runtimeConfigured: false, runtimeAcceptance: false, dnsMutation: false, trafficMutation: false, m2Preserved: true };
  });
  if (result.status !== "CONFIGURED" || !result.value) fail("CREDENTIAL_UNAVAILABLE");
  return { output: result.value };
});
