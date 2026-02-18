import { useMemo } from 'react';

/**
 * Feature flags configuration
 * In production, these should come from:
 * - Environment variables
 * - Remote config (e.g., PostHog, LaunchDarkly)
 * - User settings
 */
const FEATURE_FLAGS = {
  // Chat dynamic skill form feature
  'chat.dynamicSkillForm': {
    enabled: true,
    rolloutPercentage: 100, // Percentage of users (0-100)
    allowedUsers: [] as string[], // Specific user IDs to enable (empty = all)
    blockedUsers: [] as string[], // Specific user IDs to disable
  },
  // Mobile skill form bottom sheet
  'chat.mobileSkillForm': {
    enabled: true,
    rolloutPercentage: 100,
    allowedUsers: [],
    blockedUsers: [],
  },
  // Slash command shortcuts
  'chat.slashCommands': {
    enabled: false, // Still in development
    rolloutPercentage: 0,
    allowedUsers: [],
    blockedUsers: [],
  },
};

type FeatureFlagKey = keyof typeof FEATURE_FLAGS;

export interface FeatureFlagConfig {
  enabled: boolean;
  rolloutPercentage: number;
  allowedUsers: string[];
  blockedUsers: string[];
}

/**
 * Get feature flag configuration
 * In production, this could fetch from an API
 */
function getFeatureFlagConfig(key: FeatureFlagKey): FeatureFlagConfig {
  // Check for environment variable override
  const envKey = `VITE_FEATURE_${key.replace(/\./g, '_').toUpperCase()}`;
  const envValue = import.meta.env[envKey];
  
  if (envValue !== undefined) {
    try {
      const parsed = JSON.parse(envValue);
      return { ...FEATURE_FLAGS[key], ...parsed };
    } catch {
      // If not valid JSON, treat as boolean
      return { ...FEATURE_FLAGS[key], enabled: envValue === 'true' };
    }
  }

  return FEATURE_FLAGS[key];
}

/**
 * Check if user is in rollout percentage
 */
function isInRollout(userId: string, percentage: number): boolean {
  if (percentage >= 100) return true;
  if (percentage <= 0) return false;
  
  // Simple hash function for consistent user assignment
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  const normalizedHash = Math.abs(hash) % 100;
  return normalizedHash < percentage;
}

export interface UseFeatureFlagOptions {
  userId?: string;
}

/**
 * Hook to check if a feature flag is enabled
 */
export function useFeatureFlag(
  key: FeatureFlagKey,
  options: UseFeatureFlagOptions = {}
): boolean {
  const { userId } = options;

  return useMemo(() => {
    const config = getFeatureFlagConfig(key);

    // Check if explicitly blocked for this user
    if (userId && config.blockedUsers.includes(userId)) {
      return false;
    }

    // Check if explicitly allowed for this user
    if (userId && config.allowedUsers.includes(userId)) {
      return true;
    }

    // Check if feature is enabled
    if (!config.enabled) {
      return false;
    }

    // Check rollout percentage
    if (userId) {
      return isInRollout(userId, config.rolloutPercentage);
    }

    // Default to enabled if no userId and feature is enabled
    return config.rolloutPercentage > 0;
  }, [key, userId]);
}

/**
 * Hook to get all feature flags
 */
export function useFeatureFlags(options: UseFeatureFlagOptions = {}): Record<FeatureFlagKey, boolean> {
  const { userId } = options;

  return useMemo(() => {
    const flags = {} as Record<FeatureFlagKey, boolean>;
    
    for (const key of Object.keys(FEATURE_FLAGS) as FeatureFlagKey[]) {
      const config = getFeatureFlagConfig(key);

      if (userId && config.blockedUsers.includes(userId)) {
        flags[key] = false;
      } else if (userId && config.allowedUsers.includes(userId)) {
        flags[key] = true;
      } else if (!config.enabled) {
        flags[key] = false;
      } else if (userId) {
        flags[key] = isInRollout(userId, config.rolloutPercentage);
      } else {
        flags[key] = config.rolloutPercentage > 0;
      }
    }

    return flags;
  }, [userId]);
}

export { FEATURE_FLAGS };
export type { FeatureFlagKey };
