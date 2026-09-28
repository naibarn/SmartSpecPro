import { getModelsByTypeAsync } from "../server/services/modelRegistry";
(async () => {
  const models = await getModelsByTypeAsync("image");
  const hit = models.find((m) => m.id === "higgsfield/gpt_image_2");
  console.log("TOTAL image models in registry:", models.length);
  console.log("higgsfield/gpt_image_2:", hit ? `FOUND enabled=${hit.isEnabled}` : "NOT FOUND");
  console.log("first 8 ids:", models.slice(0, 8).map((m) => m.id).join(", "));
  process.exit(0);
})().catch((e) => {
  console.error("ERR", e?.message);
  process.exit(1);
});
