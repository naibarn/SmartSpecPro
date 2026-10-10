import { closeDb } from "../server/db";
import {
  initializeAutoTeamRecoveryScanJob,
  shutdownAutoTeamRecoveryScanJob,
} from "../server/jobs/autoTeamRecoveryScanJob";

if (!process.env.DATABASE_URL || !process.env.FEATURE_186_SYSTEM_TENANT_ID) {
  throw new Error("SPEC277_SCHEDULER_CHILD_CONTEXT_REQUIRED");
}

initializeAutoTeamRecoveryScanJob();
await new Promise(resolve => setTimeout(resolve, 1_000));
shutdownAutoTeamRecoveryScanJob();
await closeDb();
