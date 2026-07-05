import "dotenv/config";
import { getDb } from "../server/db";
import { mediaGenerationService } from "../server/services/mediaGenerationService";
import { signBearerToken } from "../server/_core/tokens";

async function main() {
  getDb();
  const userToken = signBearerToken(
    { sub: "1", type: "access", scopes: ["media:generate"], jti: `check_${Date.now()}` },
    "15m"
  );
  const taskId = process.argv[2];
  const polled = await mediaGenerationService.getTask(taskId, userToken, { userId: 1, source: "check", stage: "poll" });
  console.log(JSON.stringify({ status: polled?.status, resultUrl: polled?.resultUrl, errorMessage: polled?.errorMessage }, null, 2));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
