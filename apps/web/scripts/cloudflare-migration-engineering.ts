/** Authenticated canonical continuation. The bearer must be obtained through
 * the normal existing user authentication/delegation flow, never cookies. */
import { parseArgs } from "node:util";
import { createMigrationEngineeringRpc, startCloudflareMigrationEngineering } from "../server/services/cloudflareMigrationContinuation";

const { values } = parseArgs({ options: {
  endpoint: { type: "string", default: "https://smartaihub.app" },
  tenant: { type: "string" }, project: { type: "string" },
  conversation: { type: "string" }, checkpoint: { type: "string" },
  "budget-minor-units": { type: "string" },
}, strict: true });
try {
  const rpc = createMigrationEngineeringRpc(values.endpoint!, process.env.SMARTAIHUB_USER_BEARER);
  const result = await startCloudflareMigrationEngineering({
    tenantId: values.tenant!, projectId: values.project!, conversationId: Number(values.conversation),
    checkpoint: values.checkpoint as "M1_DATABASE_REPAIR" | "M3_NATIVE_RUNTIME",
    budgetCapMinorUnits: Number(values["budget-minor-units"]),
  }, rpc);
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  // Do not print request headers, token, response bodies or provider secrets.
  console.error(error instanceof Error ? error.message : "MIGRATION_ENGINEERING_FAILED");
  process.exitCode = 1;
}
