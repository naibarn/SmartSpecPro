export const VIDEO_STORYBOARD_TO_PROMPTS_SKILL_ID = "video-storyboard-to-prompts";

export function isNewsNarrationPromptPackage(
  skillId: string,
  userInputs: Record<string, any>,
): boolean {
  return (
    skillId === VIDEO_STORYBOARD_TO_PROMPTS_SKILL_ID
    && String(userInputs.contentMode ?? "").trim() === "news_narration"
  );
}

export function isAudioFirstStoryboardPromptPackage(
  skillId: string,
  userInputs: Record<string, any>,
): boolean {
  const workflow = String(userInputs.videoAudioWorkflow ?? "").trim();
  const durationSeconds = Number(userInputs.storyboardAudioDurationSeconds);
  const promptCount = Number(userInputs.storyboardAudioPromptCount);
  return (
    skillId === VIDEO_STORYBOARD_TO_PROMPTS_SKILL_ID
    && (workflow === "separate_voice" || workflow === "separate_voice_music")
    && Number.isFinite(durationSeconds)
    && durationSeconds > 0
    && Number.isFinite(promptCount)
    && promptCount > 1
  );
}

export function prepareSkillExecutionInputsForPromptPackage(
  skillId: string,
  userInputs: Record<string, any>,
): {
  userInputs: Record<string, any>;
  suppressPromptLengthPlan: boolean;
  promptPackageMode: "news_narration" | "audio_first_storyboard" | null;
} {
  const promptPackageMode = isNewsNarrationPromptPackage(skillId, userInputs)
    ? "news_narration"
    : isAudioFirstStoryboardPromptPackage(skillId, userInputs)
      ? "audio_first_storyboard"
      : null;
  const suppressPromptLengthPlan = promptPackageMode !== null;
  if (!suppressPromptLengthPlan) {
    return { userInputs, suppressPromptLengthPlan, promptPackageMode };
  }

  const nextInputs = { ...userInputs };
  delete nextInputs.maxPromptLength;
  return {
    userInputs: nextInputs,
    suppressPromptLengthPlan,
    promptPackageMode,
  };
}
