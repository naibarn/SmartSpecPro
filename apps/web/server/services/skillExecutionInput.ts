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

export function prepareSkillExecutionInputsForPromptPackage(
  skillId: string,
  userInputs: Record<string, any>,
): {
  userInputs: Record<string, any>;
  suppressPromptLengthPlan: boolean;
} {
  const suppressPromptLengthPlan = isNewsNarrationPromptPackage(skillId, userInputs);
  if (!suppressPromptLengthPlan) {
    return { userInputs, suppressPromptLengthPlan };
  }

  const nextInputs = { ...userInputs };
  delete nextInputs.maxPromptLength;
  return {
    userInputs: nextInputs,
    suppressPromptLengthPlan,
  };
}
