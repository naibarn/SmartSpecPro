import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { getCloudflareLocalContractReadiness } from "../server/services/cloudflareJobAdapters";
import { REQUIRED_VECTOR_SOURCE_NAMES } from "./verify-cloudflare-target-readiness";

const root = join(import.meta.dirname, "..", "..", "..");
const manifestPath = join(root, "ops/feature-188/cloudflare-adapter-contract.yaml");
const manifest = existsSync(manifestPath) ? readFileSync(manifestPath, "utf8") : "";
const localHandoffManifestPath = join(root, "ops/feature-187/local-readiness-manifest.yaml");
const compatibilityManifestPath = join(root, "ops/feature-186/compatibility-drain-manifest.yaml");
const vectorizeManifestPath = join(root, "ops/feature-187/vectorize-readiness-manifest.yaml");
const vectorizeManifest = existsSync(vectorizeManifestPath) ? readFileSync(vectorizeManifestPath, "utf8") : "";
const manifestSources = [
  manifest,
  existsSync(localHandoffManifestPath) ? readFileSync(localHandoffManifestPath, "utf8") : "",
  existsSync(compatibilityManifestPath) ? readFileSync(compatibilityManifestPath, "utf8") : "",
  vectorizeManifest,
].join("\n");
const requiredFiles = [
  "apps/cloudflare/package.json",
  "apps/cloudflare/tsconfig.json",
  "apps/cloudflare/wrangler.jsonc",
  "apps/cloudflare/src/index.ts",
  "apps/cloudflare/src/contracts.ts",
  "apps/cloudflare/src/bindings.ts",
  "apps/cloudflare/src/hyperdrive.ts",
  "apps/cloudflare/src/queueConsumer.ts",
  "apps/cloudflare/src/artifacts.ts",
  "apps/cloudflare/src/nativeAdapters.ts",
  "apps/cloudflare/src/recoveryHarness.ts",
  "apps/cloudflare/README.md",
  "ops/feature-186/compatibility-drain-manifest.yaml",
  "ops/feature-187/local-readiness-manifest.yaml",
  "ops/feature-188/cloudflare-target-evidence.schema.json",
  "ops/feature-187/vectorize-readiness-manifest.yaml",
  "apps/cloudflare/src/contracts.test.ts",
  "apps/web/server/services/cloudflareJobAdapters.ts",
  "apps/web/server/services/__tests__/cloudflareJobAdapters.test.ts",
  "apps/web/scripts/verify-cloudflare-local-readiness.ts",
];
const missingFiles = requiredFiles.filter(file => !existsSync(join(root, file)));
const readiness = getCloudflareLocalContractReadiness();
const missingComponents = Object.entries(readiness.components)
  .filter(([, implemented]) => !implemented)
  .map(([component]) => component);
const requiredManifestMarkers = [
  "CloudflareQueuesJobTransportAdapter",
  "CloudflareWorkflowsJobTransportAdapter",
  "CloudflareContainersJobTransportAdapter",
  "CloudflareCronSchedulerAdapter",
  "CloudflareWorkerAppJobTransportAdapter",
  "CLOUDFLARE_ACTIVATION",
  "HYPERDRIVE",
  "JOB_QUEUE",
  "MEDIA_BUCKET",
  "VECTOR_INDEX",
  "local_contract_ready",
  "cutover_candidate: false",
  "legacy_transport_boundary",
  "target_evidence_schema_version",
  "target_account_binding_and_capability_probe",
  "hyperdrive_connectivity_cache_and_pool_probe",
  "vectorize_index_schema_and_rebuild_evidence",
];
const missingManifestMarkers = requiredManifestMarkers.filter(marker => !manifestSources.includes(marker));
const vectorizeSourceNames = [...vectorizeManifest.matchAll(/^    - name:\s*([A-Za-z0-9_-]+)\s*$/gm)].map(match => match[1]);
const vectorizeSourceInventoryReady = vectorizeSourceNames.length === REQUIRED_VECTOR_SOURCE_NAMES.length
  && new Set(vectorizeSourceNames).size === REQUIRED_VECTOR_SOURCE_NAMES.length
  && REQUIRED_VECTOR_SOURCE_NAMES.every(name => vectorizeSourceNames.includes(name));
const invalidActivation = !/^activation:\s+disabled$/m.test(manifest)
  || !/^production_proof:\s+false$/m.test(manifest)
  || !/^target_account_proof:\s+false$/m.test(manifest);

if (missingFiles.length || missingComponents.length || missingManifestMarkers.length || invalidActivation || !vectorizeSourceInventoryReady) {
  console.error(JSON.stringify({ ok: false, missingFiles, missingComponents, missingManifestMarkers, invalidActivation, vectorizeSourceInventoryReady, vectorizeSourceNames }));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  localContractReady: readiness.localContractReady,
  productionProof: readiness.productionProof,
  targetAccountProof: readiness.targetAccountProof,
  missingFiles,
  missingManifestMarkers,
  components: readiness.components,
  vectorizeSourceInventoryReady,
  vectorizeSourceCount: vectorizeSourceNames.length,
  externalGates: [
    "target_account_binding_and_capability_probe",
    "hyperdrive_connectivity_cache_and_pool_probe",
    "deployment_rollback_and_restart_evidence",
    "provider_recovery_and_pitr_restore_rehearsal",
    "vectorize_index_schema_and_rebuild_evidence",
  ],
}));
