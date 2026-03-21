import { describe, it, expect } from "vitest";
import {
  type TenantFeatureFlags,
  ALLOWED_FEATURE_FLAGS,
  FEATURE_FLAG_DEFAULTS,
} from "../featureFlags";

describe("Notification feature flags", () => {
  const NOTIFICATION_FLAGS: (keyof TenantFeatureFlags)[] = [
    "notificationDedupEnabled",
    "notificationPreferencesEnabled",
    "notificationEscalationEnabled",
    "notificationUnifiedCenter",
    "notificationEmailDelivery",
    "notificationWebhookDelivery",
  ];

  it("all 6 notification flags exist in FEATURE_FLAG_DEFAULTS", () => {
    for (const flag of NOTIFICATION_FLAGS) {
      expect(FEATURE_FLAG_DEFAULTS).toHaveProperty(flag);
    }
  });

  it("all 6 notification flags default to false", () => {
    for (const flag of NOTIFICATION_FLAGS) {
      expect(FEATURE_FLAG_DEFAULTS[flag]).toBe(false);
    }
  });

  it("all 6 notification flags are in ALLOWED_FEATURE_FLAGS set", () => {
    for (const flag of NOTIFICATION_FLAGS) {
      expect(ALLOWED_FEATURE_FLAGS.has(flag)).toBe(true);
    }
  });
});
