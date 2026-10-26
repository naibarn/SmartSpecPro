import { createHash } from "node:crypto";
import { assertHttpImageProvisionReceipt, httpApplicationNamespace, validateHttpApplicationSettings,
  type HttpApplicationSettings } from "./cloudflareHttpApplicationBindings";

type Scope = { tenantId: string; projectId: string; accountRef: string; actorUserId: number; environment: "production" };
type ImageReceipt = Parameters<typeof assertHttpImageProvisionReceipt>[2];

export function httpCandidateWorkerName(scope: Pick<Scope, "tenantId" | "projectId">) {
  return `${httpApplicationNamespace(scope.tenantId, scope.projectId, "production")}-candidate`;
}

/** A deployment manifest is neither an approval nor a provider receipt. The
 * canonical executor must still validate its live grant and fenced lease.
 * No zone/DNS/route inventory is required to package a workers.dev candidate. */
export function createHttpCandidateConfiguration(input: {
  scope: Scope; settings: HttpApplicationSettings;
  receipts: { node: ImageReceipt; python: ImageReceipt };
}) {
  const { scope, settings, receipts } = input;
  if (scope.environment !== "production") throw Error("HTTP_CANDIDATE_ENVIRONMENT_DENIED");
  validateHttpApplicationSettings(settings, scope);
  if (settings.traffic || settings.realtime || settings.maxStarts > 2 || settings.maxComputeSeconds > 1200 ||
      Date.parse(settings.expiresAt) - Date.parse(settings.issuedAt) > 3_600_000)
    throw Error("HTTP_CANDIDATE_BUDGET_DENIED");
  for (const runtime of ["node", "python"] as const) assertHttpImageProvisionReceipt(settings, runtime, receipts[runtime], scope);
  const classes = ["ProductionNodeHttpContainer", "ProductionPythonHttpContainer"];
  const config = {
    name: httpCandidateWorkerName(scope), account_id: scope.accountRef,
    main: "src/applicationHttpCandidateEntrypoint.ts", compatibility_date: "2026-10-17",
    compatibility_flags: ["nodejs_compat"], workers_dev: true, preview_urls: false, routes: [],
    vars: { CLOUDFLARE_ENVIRONMENT: "production", CLOUDFLARE_ACTIVATION: "disabled", CLOUDFLARE_CONTAINER_POLICY: "on-demand" },
    durable_objects: { bindings: classes.map((class_name, index) => ({ name: index === 0 ? "NODE_HTTP" : "PYTHON_HTTP", class_name })) },
    migrations: [{ tag: "native-candidate-v1", new_sqlite_classes: classes }],
    containers: (["node", "python"] as const).map((runtime, index) => ({
      name: `${settings.namespace}-${runtime}-http`, class_name: classes[index], scheduling_policy: "durable_object",
      images: { [runtime]: settings[runtime].image }, observability: { logs: { enabled: true } },
    })),
  };
  return { config, manifestDigest: createHash("sha256").update(JSON.stringify(config)).digest("hex"),
    imageSourceSha: settings.sourceSha, trafficMutation: false as const, dnsMutation: false as const,
    // Runtime secrets/profiles are intentionally not in a portable manifest.
    // An unconfigured deployment remains hidden and cannot start a Container.
    runtimeConfigured: false as const };
}
