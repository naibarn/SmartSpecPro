import type { CloudflareOriginDescriptor } from "./cloudflareOriginVersionBindings";
import type { CloudflareOriginVersionBindings } from "./cloudflareOriginVersionBindings";
import { privateDatabaseRole } from "./cloudflarePrivateDatabaseContract";

type OriginSecrets = CloudflareOriginVersionBindings["secrets"];

/** Safe Admin projection of the existing Staging config. It never returns
 * secret material. Container startup and read-only probes do not depend on
 * Staging database write authority; database acceptance remains separately
 * unverified until the runtime proves its actual connection and safe writes. */
export function getStagingApplicationPreparation(descriptor: CloudflareOriginDescriptor, secrets: OriginSecrets, configurationRef: string) {
  const application = descriptor.applicationHttp;
  const namespaceOnly = descriptor.applicationHttpPhase === "namespace-only";
  const fullHttp = Boolean(application && !namespaceOnly && application.traffic === "staging-full-http-v1");
  const privateDatabase = descriptor.nativeResources?.privateDatabase;
  const applicationSecretsConfigured = Boolean(secrets.applicationHttp);
  const ingressBindingsGenerated = Boolean(application && !namespaceOnly);
  const missingRuntimeFields = [
    ...(!application ? ["verified Node/Python image receipts"] : []),
    ...(!ingressBindingsGenerated ? ["CLOUDFLARE_CONTAINER_POLICY", "NODE_HTTP", "PYTHON_HTTP",
      "CLOUDFLARE_NODE_HTTP_PROFILE", "CLOUDFLARE_PYTHON_HTTP_PROFILE", "AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS"] : []),
    ...(!fullHttp ? ["CLOUDFLARE_APPLICATION_HTTP_TRAFFIC"] : []),
    ...(!applicationSecretsConfigured ? ["encrypted Node/Python application secrets"] : []),
  ];
  return {
    phase: !application ? "NOT_CONFIGURED" as const : namespaceOnly ? "NAMESPACE_ONLY" as const
      : fullHttp ? "FULL_HTTP" as const : "PRIVATE_CANARY" as const,
    sourceConfigurationRef: configurationRef,
    candidateStatus: (missingRuntimeFields.length === 0 ? "RUNTIME_CONFIGURED" : "BLOCKED") as "RUNTIME_CONFIGURED" | "BLOCKED",
    missingRuntimeFields,
    imageReceipts: application ? "VERIFIED" as const : "MISSING" as const,
    encryptedApplicationSecrets: applicationSecretsConfigured ? "STORED" as const : "MISSING" as const,
    containerBindings: application && !namespaceOnly ? "GENERATED_FROM_IMMUTABLE_CONFIGURATION" as const : "NOT_GENERATED" as const,
    databaseAuthority: {
      status: "NOT_VERIFIED" as const,
      code: "STAGING_DB_WRITE_ACCEPTANCE_NOT_VERIFIED" as const,
      existingRoleAccess: privateDatabase ? "READ_ONLY_PROBE_ONLY" as const : "NO_VERIFIED_BINDING" as const,
      ...(privateDatabase ? { host: privateDatabase.plan.hostname, databaseName: privateDatabase.plan.databaseName,
        readOnlyProbeRole: privateDatabaseRole(privateDatabase.plan.namespace) } : {}),
      requiredPermissions: ["Verify actual database identity and read access before database-dependent acceptance", "Verify reviewed write paths in an isolated test environment before accepting writes"],
      excludedPermissions: ["No writes to an unverified target", "DDL", "OWNERSHIP", "ROLE ADMIN", "RLS BYPASS"],
    },
    deploymentAuthorized: false as const,
  };
}
