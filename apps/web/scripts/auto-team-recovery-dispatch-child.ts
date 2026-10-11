import { closeDb } from "../server/db";
import { dispatchPendingAutoTeamEvaluations } from "../server/services/autoTeamRecoveryService";

if (!process.env.DATABASE_URL)
  throw new Error("SPEC277_DISPATCH_CHILD_DATABASE_REQUIRED");

try {
  const created = await dispatchPendingAutoTeamEvaluations(new Date());
  process.stdout.write(`SPEC277_DISPATCH_CREATED:${created}\n`);
} finally {
  await closeDb();
}
process.exit(0);
