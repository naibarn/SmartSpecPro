import { z } from "zod";

export const HTTP_RUNTIME_JOB = "cloudflare.production.native.runtime.verify";
export const HTTP_RUNTIME_CONTRACT = "cloudflare-native-runtime-verify-v1";
export const HTTP_RUNTIME_CATEGORY = "cloudflare_production_native_runtime";
const applicationCheckNames = ["invalidLoginDenied", "primaryLogin", "primarySessionTenant", "authenticatedCreditRead", "authenticatedGatewayModelRouting", "crossTenantReadDenied", "pythonAuthenticatedUserRead", "logout", "revokedSessionDenied"] as const;
const applicationStatusNames = ["invalidLogin", "primaryLogin", "primarySession", "creditRead", "gatewayModels", "crossTenantRead", "pythonAuthenticatedRead", "logout", "gatewayModelCount", "revokedSession"] as const;
export const httpApplicationProbeSchema = z.object({
  http: z.number().int().min(0).max(599), colo: z.string().regex(/^[A-Z]{3}$/).optional(), schemaValid: z.boolean(), passed: z.boolean(),
  checks: z.object(Object.fromEntries(applicationCheckNames.map(k => [k, z.boolean().optional()])) as Record<typeof applicationCheckNames[number], z.ZodOptional<z.ZodBoolean>>),
  status: z.object(Object.fromEntries(applicationStatusNames.map(k => [k, z.number().int().min(0).max(k === "gatewayModelCount" ? 100000 : 599).optional()])) as Record<typeof applicationStatusNames[number], z.ZodOptional<z.ZodNumber>>),
  revocationHashCount: z.number().int().min(0).max(2),
});
export const httpRuntimeJobSchema = z.object({ contractVersion: z.literal(HTTP_RUNTIME_CONTRACT),
  projectId: z.string().min(1).max(36), candidateJobId: z.string().uuid(), submissionId: z.string().uuid(),
  planDigest: z.string().regex(/^[a-f0-9]{64}$/), operation: z.enum(["runtime", "application"]).optional() }).strict();


/** Narrow operational evidence only: never provider bodies, stack, env or SQL. */
export const httpRuntimeDiagnosticSchema = z.object({
  runtime: z.enum(["node", "python"]), http: z.number().int().min(0).max(599),
  running: z.boolean().optional(), starts: z.number().int().min(0).max(2).optional(),
  reservedSeconds: z.number().int().min(0).max(1200).optional(), configurationMatches: z.boolean().optional(),
  failure: z.object({ code: z.string().regex(/^APPLICATION_HTTP_[A-Z0-9_]{1,100}$/),
    kind: z.enum(["Error", "TypeError", "RangeError", "TimeoutError", "AbortError", "unknown"]),
    phase: z.enum(["initializing", "scope", "inspect", "restore-bounds", "budget", "start", "idle-bound", "readiness", "forward"]),
    at: z.number().finite(), exitCode: z.number().int().optional() }).nullable().optional(),
  containerState: z.object({ status: z.enum(["provisioning", "running", "healthy", "stopping", "stopped", "stopped_with_code", "failed", "unhealthy", "inactive", "unknown"]),
    lastChange: z.number().finite().optional(), exitCode: z.number().int().optional() }).nullable().optional(),
});
