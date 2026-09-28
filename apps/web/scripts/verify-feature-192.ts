import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { buildFeature192Inventory } from "./verify-feature-192-inventory";
import { reconcileFeature192Migrations } from "./verify-feature-192-migrations";
import { getCloudflareLocalContractReadiness } from "../server/services/cloudflareJobAdapters";
import { evaluateCloudflareTargetReadiness } from "./verify-cloudflare-target-readiness";

const root = join(import.meta.dirname, "..", "..", "..");
const manifestPath = join(root, "ops/feature-187/local-readiness-manifest.yaml");
const reviewsPath = join(root, "specs/feature/192-cloudflare-local-migration-readiness/reviews");

export function verifyFeature192LocalContract() {
  const inventory = buildFeature192Inventory();
  const migrations = reconcileFeature192Migrations();
  const readiness = getCloudflareLocalContractReadiness();
  const target = evaluateCloudflareTargetReadiness({ mode: "local" });
  const manifest = existsSync(manifestPath) ? readFileSync(manifestPath, "utf8") : "";
  const reviewFiles = existsSync(reviewsPath)
    ? readdirSync(reviewsPath).filter(file => /^round-(?:0[1-9]|10)\.md$/.test(file)).sort()
    : [];
  const reviewRoundsComplete = reviewFiles.length === 10 && reviewFiles.every(file => {
    const source = readFileSync(join(reviewsPath, file), "utf8");
    return source.includes("Checks:") && source.includes("Finding:") && source.includes("Fix:") && source.includes("Remaining:");
  });
  const blockers = [
    ...inventory.blockers,
    ...migrations.blockers,
    ...(readiness.localContractReady ? [] : ["cloudflare_local_contract_not_ready"]),
    ...(readiness.productionProof ? ["local_result_claims_production_proof"] : []),
    ...(readiness.targetAccountProof ? ["local_result_claims_target_account_proof"] : []),
    ...(target.targetAccountProof ? ["target_proof_claimed_in_local_mode"] : []),
    ...(!reviewRoundsComplete ? ["ten_round_review_incomplete"] : []),
  ];
  for (const marker of ["production_activation: false", "cutover_candidate: false", "google_oauth_and_drive: retained_product_integrations_only"]) {
    if (!manifest.includes(marker)) blockers.push(`local_manifest_missing:${marker}`);
  }
  return {
    ok: blockers.length === 0,
    state: "LOCAL_CONTRACT_READY" as const,
    productionProof: false as const,
    targetAccountProof: false as const,
    activation: "disabled" as const,
    googleRuntime: "retired_or_fail_closed" as const,
    googleOauthDrive: "product_integrations_allowed" as const,
    inventory,
    migrations,
    readiness,
    target,
    reviewRoundsComplete,
    blockers: [...new Set(blockers)],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = verifyFeature192LocalContract();
  process.stdout.write(`${JSON.stringify({
    feature: 192,
    ok: result.ok,
    state: result.state,
    activation: result.activation,
    googleRuntime: result.googleRuntime,
    googleOauthDrive: result.googleOauthDrive,
    productionProof: result.productionProof,
    targetAccountProof: result.targetAccountProof,
    inventory: {
      ok: result.inventory.ok,
      migrated: result.inventory.classification.migrated.length,
      compatibilityDrain: result.inventory.classification.compatibilityDrain.length,
      productIntegrationAllowed: result.inventory.classification.productIntegrationAllowed.length,
      operatorReview: result.inventory.classification.operatorReview.length,
      timerInventoryComplete: result.inventory.timerInventoryComplete,
    },
    migrations: {
      ok: result.migrations.ok,
      journalEntries: result.migrations.journalEntries.length,
      sqlFilesMatched: result.migrations.journalFilesPresent.length,
      unjournaledSqlFiles: result.migrations.unjournaledSqlFiles.length,
      secondGenericStatusColumns: result.migrations.secondGenericStatusColumns,
    },
    readiness: result.readiness,
    target: {
      ok: result.target.ok,
      mode: result.target.mode,
      blockedGates: result.target.blockedGates,
    },
    reviewRoundsComplete: result.reviewRoundsComplete,
    blockers: result.blockers,
  }, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}
