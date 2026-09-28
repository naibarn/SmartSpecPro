import { REQUIRED_BINDING_NAMES, type CloudflareEnvironment, type RequiredBindingName } from "./contracts";

export type BindingReadiness = {
  activation: "disabled" | "enabled" | "invalid";
  environment: string;
  required: Record<RequiredBindingName, boolean>;
  missing: RequiredBindingName[];
  ready: boolean;
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
      return hasFunction(env.JOB_CONTAINERS, "start");
    case "WORKER_APP":
      return hasFunction(env.WORKER_APP, "dispatch");
    case "MEDIA_BUCKET":
      return hasFunction(env.MEDIA_BUCKET, "put") && hasFunction(env.MEDIA_BUCKET, "head") && hasFunction(env.MEDIA_BUCKET, "delete");
    case "VECTOR_INDEX":
      return hasFunction(env.VECTOR_INDEX, "upsert") && hasFunction(env.VECTOR_INDEX, "query") && hasFunction(env.VECTOR_INDEX, "getByIds") && hasFunction(env.VECTOR_INDEX, "deleteByIds");
  }
}

export function inspectBindingReadiness(env: CloudflareEnvironment): BindingReadiness {
  const rawActivation = env.CLOUDFLARE_ACTIVATION?.trim().toLowerCase() || "disabled";
  const activation = rawActivation === "enabled" || rawActivation === "disabled" ? rawActivation : "invalid";
  const required = Object.fromEntries(
    REQUIRED_BINDING_NAMES.map(name => [name, isUsableBinding(env, name)]),
  ) as Record<RequiredBindingName, boolean>;
  const missing = REQUIRED_BINDING_NAMES.filter(name => !required[name]);
  return {
    activation,
    environment: env.CLOUDFLARE_ENVIRONMENT?.trim() || "unknown",
    required,
    missing,
    ready: activation === "enabled" && missing.length === 0,
  };
}

export function assertBindingSubset(env: CloudflareEnvironment, names: readonly RequiredBindingName[]): void {
  const readiness = inspectBindingReadiness(env);
  const missing = names.filter(name => !readiness.required[name]);
  if (readiness.activation !== "enabled" || missing.length > 0) {
    throw new Error(`CLOUDFLARE_BINDINGS_NOT_READY:${readiness.activation}:${missing.join(",")}`);
  }
}

export function assertBindingReadiness(env: CloudflareEnvironment): BindingReadiness {
  const readiness = inspectBindingReadiness(env);
  if (!readiness.ready) {
    throw new Error(`CLOUDFLARE_BINDINGS_NOT_READY:${readiness.activation}:${readiness.missing.join(",")}`);
  }
  return readiness;
}
