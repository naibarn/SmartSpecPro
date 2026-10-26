import { z } from "zod";

const uuid = z.string().uuid(), resourceId = z.string().regex(/^[a-f0-9]{32}$/);
export const httpCandidateReceiptSchema = z.object({
  schemaVersion: z.literal("cloudflare-production-native-preparation-receipt-v1"),
  workerName: z.string().regex(/^smartspec-production-[a-f0-9]{12}-candidate$/), accountRef: resourceId,
  deploymentId: uuid, versionId: uuid, workerSourceSha: z.string().regex(/^[a-f0-9]{40}$/),
  imageSourceSha: z.string().regex(/^[a-f0-9]{40}$/), manifestDigest: z.string().regex(/^[a-f0-9]{64}$/),
  applications: z.array(z.object({ applicationId: resourceId, namespaceId: resourceId, name: z.string(),
    images: z.record(z.string(), z.string()) }).strict()).length(2),
  containerStarts: z.literal(0), runtimeConfigured: z.literal(false), runtimeAcceptance: z.literal(false),
  dnsMutation: z.literal(false), trafficMutation: z.literal(false), m2Preserved: z.literal(true),
}).strict();
export type HttpCandidateReceipt = z.infer<typeof httpCandidateReceiptSchema>;

/** Verify the deployed metadata against the exact successful canonical
 * receipt, not another same-name application. These GETs never start a VM. */
export async function verifyHttpCandidateProviderReceipt(input: { receipt: HttpCandidateReceipt; accountRef: string;
  token: string; fetchImpl?: typeof fetch;
  /** Trusted service supplies this only from a scoped canonical runtime
   * compensation receipt. Rollback creates a NEW deployment of the SAME
   * immutable baseline version; never rewrite the preparation receipt. */
  restoredBaseline?: { deploymentId: string; versionId: string } }) {
  const receipt = httpCandidateReceiptSchema.parse(input.receipt);
  if (receipt.accountRef !== input.accountRef) throw Error("HTTP_CANDIDATE_READBACK_ACCOUNT_DENIED");
  if (input.restoredBaseline && (!uuid.safeParse(input.restoredBaseline.deploymentId).success || input.restoredBaseline.versionId !== receipt.versionId))
    throw Error("HTTP_CANDIDATE_RESTORED_BASELINE_DENIED");
  const request = async (path: string) => {
    const res = await (input.fetchImpl ?? fetch)(`https://api.cloudflare.com/client/v4${path}`, {
      method: "GET", headers: { authorization: `Bearer ${input.token}` }, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(12_000),
    });
    const body = await res.json();
    if (!res.ok || body.success !== true || (body.result_info?.total_pages ?? 1) > 1) throw Error(`HTTP_CANDIDATE_READBACK_HTTP_${res.status}`);
    return body.result;
  };
  const root = `/accounts/${receipt.accountRef}`, script = `${root}/workers/scripts/${receipt.workerName}`;
  const [deployments, version, apps, routes] = await Promise.all([
    request(`${script}/deployments`), request(`${script}/versions/${receipt.versionId}`),
    request(`${root}/containers/applications?per_page=100`), request("/zones/9acd8fe46851607de0919f2b6a462911/workers/routes"),
  ]);
  const active = deployments?.deployments?.[0];
  if (active?.id !== (input.restoredBaseline?.deploymentId ?? receipt.deploymentId) || active.versions?.length !== 1 || active.versions[0].version_id !== receipt.versionId ||
      active.versions[0].percentage !== 100 || version?.id !== receipt.versionId) throw Error("HTTP_CANDIDATE_DEPLOYMENT_CHANGED");
  const bindings = version?.resources?.bindings, metadata = version?.resources?.script_runtime?.containers;
  if (!Array.isArray(bindings) || !Array.isArray(metadata) || !Array.isArray(apps)) throw Error("HTTP_CANDIDATE_READBACK_INCOMPLETE");
  const applications = receipt.applications.map((expected, index) => {
    const runtime = index === 0 ? "node" : "python", className = index === 0 ? "ProductionNodeHttpContainer" : "ProductionPythonHttpContainer";
    const image = expected.images[runtime], suffix = /production-([a-f0-9]{12})-candidate$/.exec(receipt.workerName)?.[1];
    if (expected.name !== `smartspec-production-${suffix}-${runtime}-http` || Object.keys(expected.images).length !== 1 ||
        !new RegExp(`^registry\\.cloudflare\\.com/${receipt.accountRef}/smartspec-staging-${suffix}-${runtime}-http@sha256:[a-f0-9]{64}$`).test(image ?? ""))
      throw Error("HTTP_CANDIDATE_IMAGE_RECEIPT_DENIED");
    const matched = apps.filter(a => a.id === expected.applicationId && a.name === expected.name);
    const bound = bindings.filter(b => b.type === "durable_object_namespace" && b.name === `${runtime.toUpperCase()}_HTTP` && b.class_name === className &&
      b.namespace_id === expected.namespaceId && (!b.script_name || b.script_name === receipt.workerName));
    const containers = metadata.filter(m => m.class_name === className && m.images?.[runtime] === image && Object.keys(m.images).length === 1);
    if (matched.length !== 1 || matched[0].scheduling_policy !== "durable_object" || matched[0].durable_objects?.namespace_id !== expected.namespaceId ||
        bound.length !== 1 || containers.length !== 1) throw Error("HTTP_CANDIDATE_APPLICATION_READBACK_MISMATCH");
    return { ...expected, runtime, verified: true as const };
  });
  const baseline = Array.isArray(routes) ? routes.filter(r => r.pattern === "smartaihub.app/*") : [];
  if (baseline.length !== 1 || baseline[0].script !== "smartspec-cloudflare-runtime") throw Error("HTTP_CANDIDATE_M2_BASELINE_CHANGED");
  return { verified: true as const, workerName: receipt.workerName, deploymentId: active.id, versionId: receipt.versionId,
    applications, m2RouteId: baseline[0].id, m2Preserved: true as const,
    runtimeBindingsConfigured: ["CLOUDFLARE_NODE_HTTP_PROFILE", "CLOUDFLARE_PYTHON_HTTP_PROFILE", "CLOUDFLARE_NODE_HTTP_SECRETS",
      "CLOUDFLARE_PYTHON_HTTP_SECRETS", "CLOUDFLARE_APPLICATION_CANARY_TOKEN"].every(name => bindings.some(b => b.name === name)),
    runtimeAcceptance: false as const, providerMutations: 0 as const };
}
