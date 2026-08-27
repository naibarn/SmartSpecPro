import { backfillFreePlanAssignments } from "../server/services/freePlanService";

try {
  const result = await backfillFreePlanAssignments();
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error("Free plan backfill failed:", error);
  process.exitCode = 1;
}
