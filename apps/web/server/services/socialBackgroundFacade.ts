/**
 * Provider-neutral background orchestration for social actions.
 *
 * This facade stays intentionally thin: registry/state lives in
 * `providerRegistry.ts`, provider implementations live under
 * `services/social/providers/`, and this file only re-exports the public
 * execution surface plus bootstraps the default provider set.
 */

import {
  SOCIAL_ACTIONS,
  SocialBackgroundError,
  type SocialAction,
  type SocialBackgroundActionInput,
  type SocialProviderAdapter,
  type SocialProviderCapability,
  type SocialProviderId,
  executeSocialAction,
  listSocialProviders,
  registerSocialProvider,
} from "./social/providerRegistry";
import { registerDefaultSocialProviders } from "./social/providers";

registerDefaultSocialProviders();

export {
  SOCIAL_ACTIONS,
  SocialBackgroundError,
  executeSocialAction,
  listSocialProviders,
  registerSocialProvider,
};

export type {
  SocialAction,
  SocialBackgroundActionInput,
  SocialProviderAdapter,
  SocialProviderCapability,
  SocialProviderId,
};
