import { buildProductionStableHash } from "../../shared/mediaProduction";

export type StagedAudioPlan = {
  text: string;
  language: string;
  model: string;
  provider: string;
  estimatedCredits: number;
};

export function buildStagedAudioPlan(input: StagedAudioPlan): StagedAudioPlan {
  return {
    text: input.text.trim(),
    language: input.language.trim() || "th",
    model: input.model.trim(),
    provider: input.provider.trim(),
    estimatedCredits: Math.max(0, input.estimatedCredits),
  };
}
export function buildStagedFinalAssemblyHash(input: unknown) {
  return buildProductionStableHash(input);
}

export function stagedAudioPlanRequiresApproval(strategy: string) {
  return strategy === "separate_tts_voiceover";
}
