import fs from "fs";
import path from "path";

async function main() {
  const content = fs.readFileSync("/tmp/claude-1000/-home-dev-projects-SmartSpecPro/fd00a71c-eee1-4167-b28d-c736c7f516c7/scratchpad/raw-response.json", "utf-8");
  const parsed = JSON.parse(content);
  const mod = await import("../server/services/verticalDramaCharacterImageGeneration");
  // Access the internal schema via a hack: re-require the module source isn't exported, so import zod schema pieces manually.
  console.log("parsed keys:", Object.keys(parsed));
  console.log("character keys:", Object.keys(parsed.characters[0]));
}
main().catch(e => { console.error(e); process.exit(1); });
