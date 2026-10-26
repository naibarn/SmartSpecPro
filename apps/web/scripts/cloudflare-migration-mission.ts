/** CLI continuation over existing migration submission/job authorities.
 * This tool cannot issue grants, change attempts, or mutate provider resources. */
import { parseArgs } from "node:util";
import { getDb, closeDb } from "../server/db";
import { getCloudflareMigrationMission, recordMigrationContinuation } from "../server/services/cloudflareMigrationLifecycle";

const { values } = parseArgs({ options: {
  tenant: { type: "string" }, project: { type: "string" },
  "agent-capacity": { type: "string" },
}, strict: true });
if (!values.tenant || !values.project) throw new Error("Exact --tenant and --project are required");
const scope = { tenantId: values.tenant, projectId: values.project };
try {
  const db = getDb();
  const existing = await getCloudflareMigrationMission(db, scope);
  if (values["agent-capacity"]) {
    if (!["AVAILABLE", "WAITING_AGENT_CAPACITY"].includes(values["agent-capacity"])) throw new Error("Invalid agent capacity");
    if (existing.migrationMode !== "FIRST_MIGRATION" || !existing.handoffRef) throw new Error("Existing FIRST_MIGRATION continuation is required");
    await recordMigrationContinuation(db, scope, {
      migrationMode: "FIRST_MIGRATION", architecture: "HYBRID_INGRESS",
      agentCapacity: values["agent-capacity"] as "AVAILABLE" | "WAITING_AGENT_CAPACITY",
      engineeringCheckpoint: existing.engineeringCheckpoint, handoffRef: existing.handoffRef,
    });
  }
  console.log(JSON.stringify(await getCloudflareMigrationMission(db, scope), null, 2));
} finally { await closeDb(); }
