import { createHash } from "node:crypto";
import type { DrizzleDB } from "../db";
import { withCloudflareDeploymentCredential } from "./cloudflareCredentialCenter";
import { authorizeDeploymentTarget, type DeploymentTargetIdentity } from "./providerDeploymentTargetAuthority";

const API = "https://api.cloudflare.com/client/v4";
const RUNTIME_MARKER = "smartaihub-miniapp-runtime/v1";
type Fetch = (url: string, init: RequestInit) => Promise<Response>;

// This isolated runtime intentionally reports BUILDING until the artifact
// delivery and signed viewer bridge are activated by the hosted Mini-App path.
// It has no route, workers.dev exposure, or access to platform data.
const runtimeModule = `// ${RUNTIME_MARKER}\nexport default { async fetch(request, env) { const url = new URL(request.url); if (url.pathname === "/healthz") return new Response(JSON.stringify({ ok: true, runtime: "miniapp-preview-v1" }), { headers: { "content-type": "application/json", "cache-control": "no-store" } }); if (url.pathname.startsWith("/miniapp/")) return new Response(JSON.stringify({ status: "BUILDING" }), { status: 503, headers: { "content-type": "application/json", "cache-control": "no-store" } }); return new Response("Not Found", { status: 404 }); } };\n`;

export type MiniAppProvisionResult = {
  status: "PROVISIONED";
  bucketName: string;
  workerName: string;
  workerExposure: "DISABLED";
  runtimeStatus: "BUILDING";
};

function resourceNames(targetId: string) {
  const digest = createHash("sha256").update(targetId).digest("hex").slice(0, 20);
  return { bucketName: `smartspec-miniapp-preview-${digest}`, workerName: `smartspec-miniapp-preview-${digest}` };
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return await response.json().catch(() => ({})) as Record<string, unknown>;
}

async function assertCloudflareSuccess(response: Response, operation: string) {
  const body = await readJson(response);
  if (!response.ok || body.success !== true) {
    const code = response.status === 401 || response.status === 403 ? "CLOUDFLARE_PERMISSION_DENIED" : `CLOUDFLARE_${operation}_FAILED`;
    throw new Error(code);
  }
  return body;
}

/** Provision only deterministic, isolated preview resources under an existing authorized target. */
export async function provisionMiniAppCloudflareTarget(input: {
  db: DrizzleDB;
  target: {
    id: string;
    tenantId: string;
    projectId: string;
    environment: string;
    provider: string;
    accountRef: string | null;
    credentialRef: string;
    deploymentTargetId: string;
    enabled: boolean;
  };
  fetchImpl?: Fetch;
}): Promise<MiniAppProvisionResult> {
  const target = input.target;
  const identity: DeploymentTargetIdentity = { tenantId: target.tenantId, projectId: target.projectId, environment: target.environment, provider: target.provider };
  if (!target.enabled || target.provider !== "cloudflare" || !["preview", "staging"].includes(target.environment) ||
      !target.accountRef || !/^[a-f0-9]{32}$/i.test(target.accountRef) || !target.deploymentTargetId.trim() ||
      authorizeDeploymentTarget({ target: { ...target, id: target.id } as never, callerTenantId: target.tenantId,
        projectId: target.projectId, environment: target.environment, provider: "cloudflare", credentialRef: target.credentialRef }) !== "AUTHORIZED") {
    throw new Error("MINI_APP_TARGET_NOT_AUTHORIZED");
  }
  const { bucketName, workerName } = resourceNames(target.id);
  const account = encodeURIComponent(target.accountRef);
  const fetchImpl = input.fetchImpl ?? fetch;
  const provision = async (token: string): Promise<MiniAppProvisionResult> => {
    const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
    let bucketExists = false;
    let cursor = "";
    for (let page = 0; page < 10 && !bucketExists; page += 1) {
      const query = new URLSearchParams({ name_contains: bucketName, per_page: "1000", ...(cursor ? { cursor } : {}) });
      const bucketListResponse = await fetchImpl(`${API}/accounts/${account}/r2/buckets?${query}`, { headers, signal: AbortSignal.timeout(15_000) });
      const bucketList = await assertCloudflareSuccess(bucketListResponse, "R2_LIST");
      const result = bucketList.result as Record<string, unknown> | undefined;
      if (!result || !Array.isArray(result.buckets)) throw new Error("CLOUDFLARE_R2_LIST_INVALID_RESPONSE");
      bucketExists = (result.buckets as Array<Record<string, unknown>>).some(bucket => bucket.name === bucketName);
      const resultInfo = bucketList.result_info as Record<string, unknown> | undefined;
      cursor = typeof resultInfo?.cursor === "string" ? resultInfo.cursor : "";
      if (!cursor) break;
    }
    if (!bucketExists) {
      await assertCloudflareSuccess(await fetchImpl(`${API}/accounts/${account}/r2/buckets`, {
        method: "POST", headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ name: bucketName }), signal: AbortSignal.timeout(15_000),
      }), "R2_CREATE");
    }

    const scriptUrl = `${API}/accounts/${account}/workers/scripts/${encodeURIComponent(workerName)}`;
    const existingResponse = await fetchImpl(scriptUrl, { headers, signal: AbortSignal.timeout(15_000) });
    if (existingResponse.status !== 404) {
      if (!existingResponse.ok) throw new Error(existingResponse.status === 401 || existingResponse.status === 403 ? "CLOUDFLARE_PERMISSION_DENIED" : "CLOUDFLARE_WORKER_INSPECTION_FAILED");
      const existingSource = await existingResponse.text();
      if (!existingSource.includes(RUNTIME_MARKER)) throw new Error("MINI_APP_WORKER_NAME_CONFLICT");
    }

    const metadata = {
      main_module: "runtime.mjs",
      compatibility_date: "2026-09-14",
      bindings: [{ type: "r2_bucket", name: "MINIAPP_ARTIFACTS", bucket_name: bucketName }],
    };
    const form = new FormData();
    form.set("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    form.set("runtime.mjs", new Blob([runtimeModule], { type: "application/javascript+module" }), "runtime.mjs");
    await assertCloudflareSuccess(await fetchImpl(scriptUrl, {
      method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: form, signal: AbortSignal.timeout(30_000),
    }), "WORKER_UPLOAD");
    const exposureResponse = await fetchImpl(`${scriptUrl}/subdomain`, {
      method: "POST", headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ enabled: false, previews_enabled: false }), signal: AbortSignal.timeout(15_000),
    });
    const exposure = await assertCloudflareSuccess(exposureResponse, "WORKER_EXPOSURE_LOCK");
    const exposureResult = exposure.result as Record<string, unknown> | undefined;
    if (exposureResult?.enabled !== false || exposureResult.previews_enabled !== false) throw new Error("MINI_APP_WORKER_EXPOSURE_NOT_DISABLED");
    return { status: "PROVISIONED", bucketName, workerName, workerExposure: "DISABLED", runtimeStatus: "BUILDING" };
  };
  const result = await withCloudflareDeploymentCredential(input.db, { identity, credentialRef: target.credentialRef }, provision);
  if (result.status !== "CONFIGURED" || !result.value) throw new Error(`MINI_APP_CREDENTIAL_${result.status}`);
  return result.value;
}

export function miniAppRuntimeResourceNamesForTarget(targetId: string) {
  if (!targetId.trim()) throw new Error("MINI_APP_TARGET_ID_INVALID");
  return resourceNames(targetId);
}
