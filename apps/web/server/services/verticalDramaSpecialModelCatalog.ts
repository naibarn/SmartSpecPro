import { getModelsByTypeAsync, type ModelDefinition } from "./modelRegistry";
import type { SpecialModelSnapshot, SpecialTieInDurationSeconds } from "../../shared/verticalDramaSeries/specialTieInContracts";

function snapshot(model: ModelDefinition, durations: number[]): SpecialModelSnapshot {
  return { modelId: model.id, provider: model.provider, providerModel: model.id, catalogVersion: "media-models-v1", supportedDurationsSeconds: durations, supportedAspectRatios: model.aspectRatios?.length ? model.aspectRatios : ["9:16"], supportsReferenceConditioning: (model.maxReferenceImages ?? 0) > 0, supportsDialogueAudio: model.nativeAudioDialogue === true };
}

export async function listSpecialTieInModels(input: { durationSeconds: SpecialTieInDurationSeconds; dialogueMode: "none" | "character_dialogue" }) {
  const [images, videos] = await Promise.all([getModelsByTypeAsync("image"), getModelsByTypeAsync("video")]);
  const imageModels = images.filter(model => model.isEnabled !== false && (!model.aspectRatios?.length || model.aspectRatios.includes("9:16")) && (model.maxReferenceImages ?? 1) > 0).map(model => snapshot(model, model.durations ?? []));
  const videoModels = videos.filter(model => model.isEnabled !== false && (!model.aspectRatios?.length || model.aspectRatios.includes("9:16")) && (!model.durations?.length || model.durations.includes(input.durationSeconds)) && (input.dialogueMode === "none" || model.nativeAudioDialogue === true)).map(model => snapshot(model, model.durations ?? [input.durationSeconds]));
  return { imageModels, videoModels };
}
