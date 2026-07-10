import { getDb } from "./server/db.ts";
getDb();
import { getModelsByTypeAsync, resolveVerticalDramaCapabilities } from "./server/services/modelRegistry.ts";

const models = await getModelsByTypeAsync("video");
const m = models.find(x => x.id === "higgsfield/grok_video");
console.log("model found:", !!m);
console.log("configJson.hasAudio:", m?.configJson?.hasAudio);
console.log("nativeAudioDialogue (from model def):", m?.nativeAudioDialogue);
const caps = resolveVerticalDramaCapabilities(m.id, { type: m.type, aspectRatios: m.aspectRatios, configJson: m.configJson });
console.log("caps.nativeAudioDialogue:", caps.nativeAudioDialogue);
process.exit(0);
