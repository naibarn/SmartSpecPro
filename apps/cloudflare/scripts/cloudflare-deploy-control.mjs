#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { appendFile } from "node:fs/promises";

const API = "https://api.cloudflare.com/client/v4";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseDeploymentList(payload) {
  if (payload?.success !== true || !Array.isArray(payload?.result?.deployments)) {
    throw new Error("CF_DEPLOYMENT_INVENTORY_INVALID");
  }
  const deployment = payload.result.deployments[0];
  if (!deployment || !UUID.test(deployment.id) || !Array.isArray(deployment.versions) || !deployment.versions.length) {
    throw new Error("CF_DEPLOYMENT_BASELINE_MISSING");
  }
  const versions = deployment.versions.map(({ version_id, percentage }) => ({ version_id, percentage }));
  if (versions.some(version => !UUID.test(version.version_id) || !Number.isFinite(version.percentage) ||
      version.percentage <= 0 || version.percentage > 100) ||
      new Set(versions.map(version => version.version_id)).size !== versions.length ||
      Math.abs(versions.reduce((sum, version) => sum + version.percentage, 0) - 100) > 0.0001) {
    throw new Error("CF_DEPLOYMENT_WEIGHTS_INVALID");
  }
  return { deploymentId: deployment.id, versions };
}

export function sameVersionWeights(left, right) {
  const normalize = versions => [...versions].map(({ version_id, percentage }) => `${version_id}:${percentage}`).sort();
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

export function parseUploadedVersion(output) {
  const matches = [...output.matchAll(/version(?:\s+id)?\s*[:=]\s*([0-9a-f-]{36})/gi)].map(match => match[1]);
  const unique = [...new Set(matches)];
  if (unique.length !== 1 || !UUID.test(unique[0])) throw new Error("CF_UPLOADED_VERSION_ID_UNAVAILABLE");
  return unique[0];
}

async function providerRequest(path, init = {}) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !/^[0-9a-f]{32}$/i.test(accountId) || !token) throw new Error("CF_DEPLOY_CREDENTIALS_MISSING");
  const response = await fetch(`${API}${path.replaceAll("{account}", accountId)}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers },
  });
  let payload;
  try { payload = await response.json(); } catch { throw new Error(`CF_API_INVALID_JSON_${response.status}`); }
  if (!response.ok || payload?.success !== true) {
    const code = Number(payload?.errors?.[0]?.code);
    throw new Error(Number.isInteger(code) ? `CF_API_REJECTED_${response.status}_${code}` : `CF_API_REJECTED_${response.status}`);
  }
  return payload;
}

function workerName() {
  const name = process.env.CLOUDFLARE_WORKER_NAME?.trim();
  if (!name || !/^[a-z0-9-]{1,63}$/.test(name)) throw new Error("CF_WORKER_NAME_INVALID");
  return name;
}

async function checkIdentity() {
  const verify = await providerRequest("/user/tokens/verify");
  if (verify.result?.status !== "active") throw new Error("CF_TOKEN_INACTIVE");
  const account = await providerRequest("/accounts/{account}");
  if (account.result?.id !== process.env.CLOUDFLARE_ACCOUNT_ID) throw new Error("CF_ACCOUNT_ID_MISMATCH");
  const script = await providerRequest(`/accounts/{account}/workers/scripts/${encodeURIComponent(workerName())}`);
  if (!script.result || script.result.id !== workerName()) throw new Error("CF_WORKER_IDENTITY_MISMATCH");
  console.log(`Cloudflare identity verified for configured Worker ${workerName()}.`);
}

async function getCurrentDeployment() {
  const payload = await providerRequest(`/accounts/{account}/workers/scripts/${encodeURIComponent(workerName())}/deployments?per_page=1`);
  return parseDeploymentList(payload);
}

async function snapshotBaseline(path) {
  const current = await getCurrentDeployment();
  const expected = process.env.CLOUDFLARE_EXPECTED_BASELINE_DEPLOYMENT_ID?.trim();
  if (!expected || !UUID.test(expected)) throw new Error("CF_BASELINE_DEPLOYMENT_ID_REQUIRED");
  if (current.deploymentId !== expected) throw new Error("CF_ACTIVE_BASELINE_CHANGED");
  await writeFile(path, `${JSON.stringify(current)}\n`, { mode: 0o600 });
  console.log(`Baseline deployment verified: ${current.deploymentId}; ${current.versions.length} active version(s).`);
}

async function inspectTarget(summaryPath) {
  await checkIdentity();
  const current = await getCurrentDeployment();
  let workersDev = "unavailable";
  try { workersDev = (await providerRequest("/accounts/{account}/workers/subdomain")).result?.subdomain ?? "unavailable"; }
  catch { /* Production may not use workers.dev. */ }
  const lines = [
    `## Read-only Cloudflare target inspection`,
    `- Worker: ${workerName()}`,
    `- Active deployment: ${current.deploymentId}`,
    `- Active traffic weights: ${current.versions.map(version => `${version.version_id}=${version.percentage}%`).join(", ")}`,
    `- Account workers.dev subdomain: ${workersDev}`,
    `- No Worker version, route, or resource was changed.`,
  ];
  await appendFile(summaryPath, `${lines.join("\n")}\n`);
  console.log(`Read-only deployment baseline recorded: ${current.deploymentId}.`);
}

async function publishTraffic(versions, message) {
  const payload = await providerRequest(`/accounts/{account}/workers/scripts/${encodeURIComponent(workerName())}/deployments`, {
    method: "POST",
    body: JSON.stringify({ versions, annotations: { "workers/message": message, "workers/triggered_by": "github-actions" } }),
  });
  const created = payload.result;
  if (!created?.id || !Array.isArray(created.versions) || !sameVersionWeights(created.versions, versions)) {
    throw new Error("CF_DEPLOYMENT_READBACK_MISMATCH");
  }
  const readback = await getCurrentDeployment();
  if (!sameVersionWeights(readback.versions, versions)) throw new Error("CF_ACTIVE_DEPLOYMENT_READBACK_MISMATCH");
  console.log(`Deployment receipt verified: ${readback.deploymentId}; ${versions.length} version(s).`);
}

async function deployVersion(versionId, message) {
  if (!UUID.test(versionId)) throw new Error("CF_UPLOADED_VERSION_ID_INVALID");
  await publishTraffic([{ version_id: versionId, percentage: 100 }], message);
}

async function rollback(path) {
  const baseline = JSON.parse(await readFile(path, "utf8"));
  const current = parseDeploymentList({ success: true, result: { deployments: [{ id: baseline.deploymentId, versions: baseline.versions }] } });
  await publishTraffic(current.versions, `Automatic rollback to ${current.deploymentId}`);
  console.log(`Rollback restored the captured ${current.versions.length}-version traffic split.`);
}

async function rollbackDeployment(deploymentId) {
  if (!UUID.test(deploymentId)) throw new Error("CF_ROLLBACK_DEPLOYMENT_ID_INVALID");
  const payload = await providerRequest(`/accounts/{account}/workers/scripts/${encodeURIComponent(workerName())}/deployments/${deploymentId}`);
  const target = parseDeploymentList({ success: true, result: { deployments: [payload.result] } });
  const current = await getCurrentDeployment();
  if (current.deploymentId === target.deploymentId) throw new Error("CF_ROLLBACK_TARGET_ALREADY_ACTIVE");
  await publishTraffic(target.versions, `Explicit rollback to ${target.deploymentId}`);
  console.log(`Rollback restored deployment ${target.deploymentId}.`);
}

async function workerUrl(outputPath) {
  const worker = workerName();
  const payload = await providerRequest("/accounts/{account}/workers/subdomain");
  const subdomain = payload.result?.subdomain;
  if (typeof subdomain !== "string" || !/^[a-z0-9-]+$/.test(subdomain)) throw new Error("CF_WORKERS_DEV_SUBDOMAIN_UNAVAILABLE");
  const url = `https://${worker}.${subdomain}.workers.dev`;
  await appendFile(outputPath, `worker_url=${url}\n`);
  console.log(`Staging Worker URL resolved from authenticated account metadata.`);
}

export async function smokeTest(baseUrl, fetchImpl = fetch) {
  const origin = new URL(baseUrl);
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.search || origin.hash) {
    throw new Error("CF_SMOKE_URL_INVALID");
  }
  const get = async path => {
    let response;
    try { response = await fetchImpl(new URL(path, origin), { redirect: "manual", signal: AbortSignal.timeout(15_000) }); }
    catch { throw new Error(`CF_SMOKE_NETWORK_${path}`); }
    return response;
  };
  const health = await get("/healthz");
  if (health.status !== 200 || (await health.json().catch(() => null))?.ok !== true) throw new Error("CF_SMOKE_HEALTH_FAILED");
  const ready = await get("/readyz");
  if (ready.status !== 200 || (await ready.json().catch(() => null))?.ok !== true) throw new Error("CF_SMOKE_RUNTIME_NOT_READY");
  const keys = await get("/.well-known/smartaihub-evidence-keys.json");
  const keyDocument = await keys.json().catch(() => null);
  if (keys.status !== 200 || keyDocument?.format !== "sah-evidence-keys-v1" || !Array.isArray(keyDocument.keys)) {
    throw new Error("CF_SMOKE_PUBLIC_METADATA_FAILED");
  }
  const session = await get("/api/auth/session");
  if (![200, 401].includes(session.status) || session.headers.get("x-smartaihub-ingress") !== "cloudflare-worker" ||
      session.headers.get("x-smartaihub-application-runtime") !== "cloudflare-container") {
    throw new Error("CF_SMOKE_APPLICATION_CONTAINER_SESSION_FAILED");
  }
  return { health: "PASS", readiness: "PASS", publicMetadata: "PASS", anonymousSessionRoute: "PASS", applicationRuntime: "cloudflare-container" };
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "identity") return checkIdentity();
  if (command === "snapshot") return snapshotBaseline(args[0]);
  if (command === "inspect") return inspectTarget(args[0]);
  if (command === "deploy") return deployVersion(args[0], args[1] ?? "SmartAIHub Cloudflare deployment");
  if (command === "rollback") return rollback(args[0]);
  if (command === "rollback-deployment") return rollbackDeployment(args[0]);
  if (command === "worker-url") return workerUrl(args[0]);
  if (command === "smoke") return console.log(JSON.stringify(await smokeTest(args[0])));
  if (command === "uploaded-version") {
    const versionId = parseUploadedVersion(await readFile(args[0], "utf8"));
    await appendFile(args[1], `version_id=${versionId}\n`);
    console.log(`Uploaded immutable version recorded: ${versionId}`);
    return;
  }
  throw new Error("CF_DEPLOY_COMMAND_INVALID");
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : "CF_DEPLOY_FAILED");
    process.exitCode = 1;
  });
}
