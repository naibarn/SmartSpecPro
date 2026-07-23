// Diagnostic (2026-07-23): trigger the plan-review redraft for a held run to
// capture the sequential pack's real validation-failure reasons (or deliver
// the first real pack). Run: npx tsx scripts/diag-plan-redraft.ts <runId>
import { requestMarketplaceAutoReviewPlanRedraft } from "../server/services/marketplaceAutoReviewService";
import { signBearerToken } from "../server/_core/tokens";

async function main() {
  const runId = process.argv[2];
  if (!runId) throw new Error("usage: tsx scripts/diag-plan-redraft.ts <runId>");
  const userId = 1;
  const tenantId = "tenant-ZCSKEM9s";
  const runtime = {
    userToken: signBearerToken(
      { sub: "1", type: "access", userId, tenantId, scopes: ["media:generate"], jti: `diag_${Math.random().toString(36).slice(2)}` },
      "1h"
    ),
    publicUrl: "https://smartaihub.app",
    externalOperationalRecoveryEvidence: null,
  };
  const res = await requestMarketplaceAutoReviewPlanRedraft(
    { runId },
    { userId, tenantId } as any,
    runtime as any
  );
  const seq = (res as any)?.metadataJson?.sequentialStoryboard ?? {};
  console.log("REDRAFT_DONE pack=", seq.skillVersion, "degraded=", seq.degraded === true);
  console.log("RETRY_HISTORY=", JSON.stringify(seq.degradedRetryHistory ?? []));
  const shots = Array.isArray(seq.shots) ? seq.shots : [];
  console.log("SHOT1_DIALOGUE=", JSON.stringify(shots[0]?.dialogue ?? null));
  process.exit(0);
}
main().catch(e => { console.error("REDRAFT_FAILED", e?.message ?? e); process.exit(1); });
