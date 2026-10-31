import { CLOUDFLARE_CONTAINER_ON_DEMAND, isCloudflareMediaProbeImage } from "../../../packages/shared/src/cloudflareMediaProbe";
import { parseCloudflarePublicOrigins } from "../../../packages/shared/src/cloudflareOrigin";
import { validateApplicationHttpProfilePair, type ApplicationHttpProfile } from "./applicationHttpContainer";
import { REQUIRED_BINDING_NAMES, type CloudflareEnvironment, type RequiredBindingName } from "./contracts";

const APPLICATION_HTTP_ORIGINS = {
  production: "https://smartaihub.app",
} as const;

export type ApplicationIngressReadiness = {
  enabled: boolean;
  ready: boolean;
  missing: string[];
  reason?: "APPLICATION_HTTP_PROFILE_MISSING" | "APPLICATION_HTTP_PROFILE_EXPIRED" | "APPLICATION_HTTP_PROFILE_INVALID";
};

export type BindingReadiness = {
  activation: "disabled" | "enabled" | "invalid";
  environment: string;
  required: Record<RequiredBindingName, boolean>;
  missing: RequiredBindingName[];
  ready: boolean;
  transport: "all" | "workflows" | "queues" | "retention" | "invalid";
  selectedMissing: RequiredBindingName[];
  /** Full application traffic is a separate gate from background-job transport readiness. */
  applicationIngress: ApplicationIngressReadiness;
};

function hasFunction(value: unknown, method: string): boolean {
  return Boolean(value && typeof value === "object" && typeof (value as Record<string, unknown>)[method] === "function");
}

function isUsableBinding(env: CloudflareEnvironment, name: RequiredBindingName): boolean {
  switch (name) {
    case "HYPERDRIVE":
      return typeof env.HYPERDRIVE?.connectionString === "string" && env.HYPERDRIVE.connectionString.trim().length > 0;
    case "JOB_QUEUE":
      return hasFunction(env.JOB_QUEUE, "send");
    case "JOB_WORKFLOW":
      return hasFunction(env.JOB_WORKFLOW, "get") && hasFunction(env.JOB_WORKFLOW, "create");
    case "JOB_CONTAINERS":
      return hasFunction(env.JOB_CONTAINERS, "start") && (!env.CLOUDFLARE_MEDIA_PROBE ||
        (hasFunction(env.JOB_CONTAINERS, "probeMedia") && hasFunction(env.JOB_CONTAINERS, "stop") &&
          isCloudflareMediaProbeImage(env.CLOUDFLARE_RUNNER_IMAGE_REF)));
    case "WORKER_APP":
      return hasFunction(env.WORKER_APP, "dispatch");
    case "MEDIA_BUCKET":
      return (!env.CLOUDFLARE_MEDIA_PROBE || hasFunction(env.MEDIA_BUCKET, "get")) && hasFunction(env.MEDIA_BUCKET, "put") && hasFunction(env.MEDIA_BUCKET, "head") && hasFunction(env.MEDIA_BUCKET, "delete");
    case "VECTOR_INDEX":
      return hasFunction(env.VECTOR_INDEX, "upsert") && hasFunction(env.VECTOR_INDEX, "query") && hasFunction(env.VECTOR_INDEX, "getByIds") && hasFunction(env.VECTOR_INDEX, "deleteByIds");
  }
}

function inspectApplicationIngressReadiness(env: CloudflareEnvironment): ApplicationIngressReadiness {
  const environment = env.CLOUDFLARE_ENVIRONMENT?.trim();
  const expectedTraffic = environment === "staging" ? "staging-full-http-v1" :
    environment === "production" ? "production-full-http-v1" : null;
  const missing: string[] = [];
  if (!expectedTraffic || env.CLOUDFLARE_APPLICATION_HTTP_TRAFFIC !== expectedTraffic) {
    missing.push("CLOUDFLARE_APPLICATION_HTTP_TRAFFIC");
  }
  if (env.CLOUDFLARE_CONTAINER_POLICY !== CLOUDFLARE_CONTAINER_ON_DEMAND) missing.push("CLOUDFLARE_CONTAINER_POLICY");
  for (const binding of ["NODE_HTTP", "PYTHON_HTTP"] as const) {
    const namespace = env[binding];
    if (!namespace || typeof namespace.idFromName !== "function" || typeof namespace.get !== "function") missing.push(binding);
  }
  let profilesValid = false;
  let profileReason: ApplicationIngressReadiness["reason"];
  try {
    const nodeValue = env.CLOUDFLARE_NODE_HTTP_PROFILE;
    const pythonValue = env.CLOUDFLARE_PYTHON_HTTP_PROFILE;
    if (!nodeValue || !pythonValue) profileReason = "APPLICATION_HTTP_PROFILE_MISSING";
    else {
      const node = JSON.parse(nodeValue) as ApplicationHttpProfile;
      const python = JSON.parse(pythonValue) as ApplicationHttpProfile;
      const nodeExpiry = Date.parse(node.expiresAt), pythonExpiry = Date.parse(python.expiresAt);
      if (!Number.isFinite(nodeExpiry) || !Number.isFinite(pythonExpiry)) profileReason = "APPLICATION_HTTP_PROFILE_INVALID";
      else if (nodeExpiry <= Date.now() || pythonExpiry <= Date.now()) profileReason = "APPLICATION_HTTP_PROFILE_EXPIRED";
      else {
        validateApplicationHttpProfilePair(node, python);
        const expectedTarget = environment === "staging" ? "smartspec-cloudflare-staging" : "smartspec-cloudflare-runtime";
        profilesValid = node.targetId === expectedTarget && python.targetId === expectedTarget;
        if (!profilesValid) profileReason = "APPLICATION_HTTP_PROFILE_INVALID";
      }
    }
  } catch { profileReason = "APPLICATION_HTTP_PROFILE_INVALID"; }
  if (!profilesValid) missing.push("CLOUDFLARE_NODE_HTTP_PROFILE", "CLOUDFLARE_PYTHON_HTTP_PROFILE");
  const token = env.AUTH_ORIGIN_TOKEN?.trim() ?? "";
  if (token.length < 32 || token.length > 4096 || !/^[\x21-\x7e]+$/.test(token)) missing.push("AUTH_ORIGIN_TOKEN");
  const allowedOrigins = parseCloudflarePublicOrigins(env.AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS);
  // Staging deployment binds the exact Worker-specific workers.dev origin after
  // resolving the account subdomain. Requiring a fixed staging.smartaihub.app
  // hostname here contradicted that provider-verified deployment contract and
  // made a valid isolated staging origin appear unready. Requests still require
  // an exact origin match against this parsed allowlist in the ingress handler.
  const originConfigured = environment === "production"
    ? allowedOrigins?.includes(APPLICATION_HTTP_ORIGINS.production)
    : environment === "staging" ? Boolean(allowedOrigins?.length) : false;
  if (!originConfigured) missing.push("AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS");
  const uniqueMissing = [...new Set(missing)];
  return { enabled: env.CLOUDFLARE_APPLICATION_HTTP_TRAFFIC === expectedTraffic && expectedTraffic !== null,
    ready: uniqueMissing.length === 0, missing: uniqueMissing, ...(profileReason ? { reason: profileReason } : {}) };
}

export function inspectBindingReadiness(env: CloudflareEnvironment): BindingReadiness {
  const rawActivation = env.CLOUDFLARE_ACTIVATION?.trim().toLowerCase() || "disabled";
  const activation = rawActivation === "enabled" || rawActivation === "disabled" ? rawActivation : "invalid";
  const required = Object.fromEntries(
    REQUIRED_BINDING_NAMES.map(name => [name, isUsableBinding(env, name)]),
  ) as Record<RequiredBindingName, boolean>;
  const missing = REQUIRED_BINDING_NAMES.filter(name => !required[name]);
  const transport = !env.CLOUDFLARE_JOB_TRANSPORT ? (env.CLOUDFLARE_RETENTION_SCHEDULE !== undefined ? "retention" : "all") : env.CLOUDFLARE_JOB_TRANSPORT === "workflows" ? "workflows" : env.CLOUDFLARE_JOB_TRANSPORT === "queues" ? "queues" : "invalid";
  const transportMissing = transport === "retention" ? [] : transport === "workflows"
    ? (["HYPERDRIVE", "JOB_WORKFLOW"] as const).filter(name => !required[name])
    : transport === "queues" ? (["HYPERDRIVE", "JOB_QUEUE"] as const).filter(name => !required[name]) : missing;
  const selectedMissing = [...new Set([...transportMissing, ...(env.CLOUDFLARE_MEDIA_PROBE ? (["JOB_CONTAINERS", "MEDIA_BUCKET"] as const).filter(name => !required[name]) : [])])];
  return {
    activation,
    environment: env.CLOUDFLARE_ENVIRONMENT?.trim() || "unknown",
    required,
    missing,
    transport,
    selectedMissing,
    applicationIngress: inspectApplicationIngressReadiness(env),
    ready: (!env.CLOUDFLARE_MEDIA_PROBE || (env.CLOUDFLARE_MEDIA_PROBE === "container-media-probe-v1" && env.CLOUDFLARE_CONTAINER_POLICY === CLOUDFLARE_CONTAINER_ON_DEMAND)) && activation === "enabled" && transport !== "invalid" && selectedMissing.length === 0,
  };
}

export function assertBindingSubset(env: CloudflareEnvironment, names: readonly RequiredBindingName[]): void {
  const readiness = inspectBindingReadiness(env);
  const missing = names.filter(name => !readiness.required[name]);
  if (readiness.activation !== "enabled" || missing.length > 0) {
    throw new Error(`CLOUDFLARE_BINDINGS_NOT_READY:${readiness.activation}:${missing.join(",")}`);
  }
}

/** Verifies concrete bindings without enabling general application activation.
 * Only callers with a separate, narrowly scoped transport gate may use this. */
export function assertBindingPresence(env: CloudflareEnvironment, names: readonly RequiredBindingName[]): string[] {
  const readiness = inspectBindingReadiness(env);
  const missing = names.filter(name => !readiness.required[name]);
  if (missing.length > 0) throw new Error(`CLOUDFLARE_BINDINGS_NOT_READY:${missing.join(",")}`);
  return missing;
}

export function assertBindingReadiness(env: CloudflareEnvironment): BindingReadiness {
  const readiness = inspectBindingReadiness(env);
  if (!readiness.ready) {
    throw new Error(`CLOUDFLARE_BINDINGS_NOT_READY:${readiness.activation}:${readiness.missing.join(",")}`);
  }
  return readiness;
}
