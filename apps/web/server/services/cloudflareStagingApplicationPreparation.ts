import type { CloudflareOriginDescriptor } from "./cloudflareOriginVersionBindings";
import type { CloudflareOriginVersionBindings } from "./cloudflareOriginVersionBindings";
import { privateDatabaseRole } from "./cloudflarePrivateDatabaseContract";

type OriginSecrets = CloudflareOriginVersionBindings["secrets"];

/** Safe Admin projection of the existing Staging config. It never returns
 * secret material and deliberately does not imply a deployable candidate. */
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
    candidateStatus: "BLOCKED" as const,
    missingRuntimeFields,
    imageReceipts: application ? "VERIFIED" as const : "MISSING" as const,
    encryptedApplicationSecrets: applicationSecretsConfigured ? "STORED" as const : "MISSING" as const,
    containerBindings: application && !namespaceOnly ? "GENERATED_FROM_IMMUTABLE_CONFIGURATION" as const : "NOT_GENERATED" as const,
    databaseAuthority: {
      status: "MISSING" as const,
      code: "STAGING_DB_AUTHORITY_MISSING" as const,
      existingRoleAccess: privateDatabase ? "READ_ONLY_PROBE_ONLY" as const : "NO_VERIFIED_BINDING" as const,
      ...(privateDatabase ? { host: privateDatabase.plan.hostname, databaseName: privateDatabase.plan.databaseName,
        readOnlyProbeRole: privateDatabaseRole(privateDatabase.plan.namespace) } : {}),
      requiredPermissions: ["CONNECT", "SELECT/INSERT/UPDATE/DELETE on reviewed application tables", "USAGE/SELECT on required sequences"],
      excludedPermissions: ["DDL", "OWNERSHIP", "ROLE ADMIN", "RLS BYPASS", "Production database access"],
    },
    deploymentAuthorized: false as const,
  };
}
