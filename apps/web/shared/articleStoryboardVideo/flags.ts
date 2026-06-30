import { ALLOWED_FEATURE_FLAGS, FEATURE_FLAG_DEFAULTS, type TenantFeatureFlags } from "../featureFlags";
import {
  ARTICLE_STORYBOARD_VIDEO_FLAG_KEYS,
  type ArticleStoryboardAudioStrategy,
  type ArticleStoryboardVideoFlagKey,
  type ArticleStoryboardVoiceProvider,
} from "./contracts";

export function getMissingArticleStoryboardVideoFlags(
  featureFlags: Partial<Pick<TenantFeatureFlags, ArticleStoryboardVideoFlagKey>> | undefined,
  requiredFlags: ArticleStoryboardVideoFlagKey[] = ["presentationArticleStoryboardVideo"],
): ArticleStoryboardVideoFlagKey[] {
  const source = featureFlags ?? {};
  return requiredFlags.filter((key) => source[key] !== true);
}

export function areArticleStoryboardVideoFlagsRegistered(): boolean {
  return ARTICLE_STORYBOARD_VIDEO_FLAG_KEYS.every(
    (key) => ALLOWED_FEATURE_FLAGS.has(key) && FEATURE_FLAG_DEFAULTS[key] === false,
  );
}

export function buildDefaultArticleStoryboardVideoFlags(): Pick<TenantFeatureFlags, ArticleStoryboardVideoFlagKey> {
  return ARTICLE_STORYBOARD_VIDEO_FLAG_KEYS.reduce((acc, key) => {
    acc[key] = FEATURE_FLAG_DEFAULTS[key];
    return acc;
  }, {} as Pick<TenantFeatureFlags, ArticleStoryboardVideoFlagKey>);
}

export function buildArticleStoryboardRequiredFeatureFlags(input: {
  audioStrategy?: ArticleStoryboardAudioStrategy;
  voiceProvider?: ArticleStoryboardVoiceProvider;
  hasCharacterReferences?: boolean;
} = {}): ArticleStoryboardVideoFlagKey[] {
  const required = new Set<ArticleStoryboardVideoFlagKey>([
    "presentationArticleStoryboardVideo",
    "presentationArticleStoryboardVideoPreview",
    "presentationArticleStoryboardVideoOverlay",
    "presentationArticleStoryboardVideoReferenceFrames",
    "presentationArticleStoryboardVideoSeedancePrompt",
    "presentationArticleStoryboardVideoVoiceScript",
  ]);

  if (input.hasCharacterReferences) {
    required.add("presentationArticleStoryboardVideoCharacterReferences");
  }

  if (input.audioStrategy === "native_video_audio") {
    required.add("presentationArticleStoryboardVideoNativeAudio");
    required.add("presentationArticleStoryboardVideoNativeAudioPromptComposer");
  } else if (input.audioStrategy !== "silent") {
    if (input.voiceProvider === "elevenlabs") {
      required.add("presentationArticleStoryboardVideoElevenLabsDialogue");
    } else {
      required.add("presentationArticleStoryboardVideoUvoiceVoiceover");
    }
  }

  return Array.from(required);
}
