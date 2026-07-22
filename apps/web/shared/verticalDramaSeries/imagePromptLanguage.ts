import type {
  VerticalDramaMotionPromptPack,
  VerticalDramaPromptLanguage,
  VerticalDramaStartFramePlan,
} from "./contracts";

export function resolveEffectiveImagePromptLanguage(params: {
  startFramePlan?: Pick<
    VerticalDramaStartFramePlan,
    "imagePromptLanguage"
  > | null;
  motionPromptPack?: Pick<
    VerticalDramaMotionPromptPack,
    "promptLanguage"
  > | null;
}): VerticalDramaPromptLanguage {
  return (
    params.startFramePlan?.imagePromptLanguage ??
    params.motionPromptPack?.promptLanguage ??
    "en"
  );
}
