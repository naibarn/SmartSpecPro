import {
  filterModelsByMcpProviderAccess,
  getModelsByTypeAsync,
  type ModelDefinition,
} from "./modelRegistry";
import type {
  SpecialModelSnapshot,
  SpecialTieInDurationSeconds,
} from "../../shared/verticalDramaSeries/specialTieInContracts";

function snapshot(
  model: ModelDefinition,
  durations: number[]
): SpecialModelSnapshot {
  return {
    modelId: model.id,
    label: model.name ?? model.id,
    provider: model.provider,
    providerModel: model.id,
    catalogVersion: "media-models-v1",
    supportedDurationsSeconds: durations,
    supportedAspectRatios: model.aspectRatios?.length
      ? model.aspectRatios
      : ["9:16"],
    supportsReferenceConditioning: (model.maxReferenceImages ?? 0) > 0,
    maxReferenceImages: model.maxReferenceImages,
    supportsDialogueAudio: model.nativeAudioDialogue === true,
  };
}

export async function listSpecialTieInModels(input: {
  durationSeconds: SpecialTieInDurationSeconds;
  aspectRatio?: "9:16";
  dialogueMode: "none" | "character_dialogue";
  referenceType?: "product" | "location" | "store" | "mixed";
  referenceImageCount?: number;
  connectedMcpProviderKeys: ReadonlySet<string>;
}) {
  const [images, videos] = await Promise.all([
    getModelsByTypeAsync("image"),
    getModelsByTypeAsync("video"),
  ]);
  const referenceImageCount = input.referenceImageCount ?? 1;
  const aspectRatio = input.aspectRatio ?? "9:16";
  const imageModels = filterModelsByMcpProviderAccess(
    images,
    input.connectedMcpProviderKeys,
  )
    .filter(
      model =>
        model.isEnabled !== false &&
        (!model.aspectRatios?.length ||
          model.aspectRatios.includes(aspectRatio)) &&
        (model.maxReferenceImages ?? 1) >= referenceImageCount
    )
    .map(model => snapshot(model, model.durations ?? []));
  const compatibleVideos = filterModelsByMcpProviderAccess(
    videos,
    input.connectedMcpProviderKeys,
  )
    .filter(
      model =>
        model.isEnabled !== false &&
        model.supportsStartFrame !== false &&
        (!model.aspectRatios?.length ||
          model.aspectRatios.includes(aspectRatio)) &&
        (!model.durations?.length ||
          model.durations.includes(input.durationSeconds)) &&
        (model.maxReferenceImages === undefined ||
          model.maxReferenceImages >= referenceImageCount) &&
        (input.dialogueMode === "none" || model.nativeAudioDialogue === true)
    )
    .map(model => snapshot(model, model.durations ?? [input.durationSeconds]));
  const availableVideoDurations = Array.from(
    new Set(
      filterModelsByMcpProviderAccess(
        videos,
        input.connectedMcpProviderKeys,
      )
        .filter(model => model.isEnabled !== false && model.supportsStartFrame !== false)
        .flatMap(model => model.durations ?? [])
        .filter((duration): duration is number => Number.isFinite(duration))
    )
  ).sort((a, b) => a - b);
  return {
    imageModels,
    videoModels: compatibleVideos,
    availableVideoDurations,
    fallbackVideoDurationSeconds:
      compatibleVideos.length === 0
        ? availableVideoDurations.find(duration => duration >= input.durationSeconds) ?? availableVideoDurations[availableVideoDurations.length - 1]
        : undefined,
  };
}
