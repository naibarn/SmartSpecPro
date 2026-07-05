import "dotenv/config";
import { getDb } from "../server/db";
import { mediaGenerationService } from "../server/services/mediaGenerationService";
import { signBearerToken } from "../server/_core/tokens";

async function main() {
  getDb();
  const taskId = process.argv[2];
  const userId = 1;
  const userToken = signBearerToken(
    { sub: String(userId), type: "access", scopes: ["media:generate"], jti: `test_poll_${Date.now()}` },
    "15m"
  );
  for (let i = 0; i < 80; i++) {
    const polled = await mediaGenerationService.getTask(taskId, userToken, { userId, source: "test-poll2", stage: "poll" });
    console.log(`Poll ${i}: status=${polled?.status}`);
    if (polled?.status === "completed") {
      console.log("COMPLETED. resultUrl:", polled.resultUrl);
      break;
    }
    if (polled?.status === "failed") {
      console.log("FAILED:", polled.errorMessage);
      break;
    }
    await new Promise(r => setTimeout(r, 4000));
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
