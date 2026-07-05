import "dotenv/config";
import { getDb } from "../server/db";
import { mediaGenerationService } from "../server/services/mediaGenerationService";
import { signBearerToken } from "../server/_core/tokens";

async function main() {
  getDb();
  const userToken = signBearerToken(
    { sub: "1", type: "access", scopes: ["media:generate"], jti: `test_list_${Date.now()}` },
    "15m"
  );
  const result = await mediaGenerationService.listTasks(userToken, { mediaType: "image" as any, limit: 5 });
  console.log(JSON.stringify(result.tasks?.slice(0, 3).map((t: any) => ({ id: t.id, status: t.status, prompt: t.prompt?.slice(0, 60) })), null, 2));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
