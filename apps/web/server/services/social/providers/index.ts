export type { SocialProviderLifecycle, SocialProviderScaffold } from "./types";
export { META_SOCIAL_PROVIDER_ADAPTER } from "./meta";
export { TIKTOK_SOCIAL_PROVIDER_SCAFFOLD } from "./tiktok";
export { TIKTOK_SOCIAL_PROVIDER_ADAPTER } from "./tiktok";
export { YOUTUBE_SOCIAL_PROVIDER_SCAFFOLD } from "./youtube";
export { YOUTUBE_SOCIAL_PROVIDER_ADAPTER } from "./youtube";

import { registerSocialProvider } from "../providerRegistry";
import { META_SOCIAL_PROVIDER_ADAPTER } from "./meta";
import { TIKTOK_SOCIAL_PROVIDER_ADAPTER } from "./tiktok";
import { YOUTUBE_SOCIAL_PROVIDER_ADAPTER } from "./youtube";

export function registerDefaultSocialProviders(): void {
  registerSocialProvider(META_SOCIAL_PROVIDER_ADAPTER);
  registerSocialProvider(TIKTOK_SOCIAL_PROVIDER_ADAPTER);
  registerSocialProvider(YOUTUBE_SOCIAL_PROVIDER_ADAPTER);
}
