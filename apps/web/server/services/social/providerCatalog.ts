import type { SocialProviderScaffold } from "./providers/types";
import { TIKTOK_SOCIAL_PROVIDER_SCAFFOLD } from "./providers/tiktok";
import { YOUTUBE_SOCIAL_PROVIDER_SCAFFOLD } from "./providers/youtube";

const PLANNED_SOCIAL_PROVIDER_SCAFFOLDS: SocialProviderScaffold[] = [
  TIKTOK_SOCIAL_PROVIDER_SCAFFOLD,
  YOUTUBE_SOCIAL_PROVIDER_SCAFFOLD,
];

export function listPlannedSocialProviderScaffolds(): SocialProviderScaffold[] {
  return PLANNED_SOCIAL_PROVIDER_SCAFFOLDS.map((provider) => ({
    ...provider,
    actions: [...provider.actions],
  }));
}
