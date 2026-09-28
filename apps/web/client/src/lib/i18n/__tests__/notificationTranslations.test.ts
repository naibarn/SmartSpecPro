import { describe, it, expect } from "vitest";
import en from "../locales/en";
import th from "../locales/th";

describe("Notification i18n translations", () => {
  const REQUIRED_KEYS = [
    "notifications.category.system_health",
    "notifications.category.credits",
    "notifications.category.media_jobs",
    "notifications.category.workflow",
    "notifications.category.skill",
    "notifications.category.feedback",
    "notifications.category.agency",
    "notifications.category.follow",
    "notifications.category.scheduled",
    "notifications.category.security",
    "notifications.category.business",
    "notifications.settings.title",
    "notifications.settings.inApp",
    "notifications.settings.email",
    "notifications.settings.telegram",
    "notifications.settings.minSeverity",
    "notifications.settings.mute",
    "notifications.settings.save",
    "notifications.alertRules.title",
    "notifications.alertRules.name",
    "notifications.alertRules.metric",
    "notifications.alertRules.operator",
    "notifications.alertRules.threshold",
    "notifications.alertRules.cooldown",
    "notifications.alertRules.enabled",
    "notifications.alertRules.create",
    "notifications.escalation.title",
    "notifications.escalation.triggerSeverity",
    "notifications.escalation.triggerMinutes",
    "notifications.escalation.target",
    "notifications.webhooks.title",
    "notifications.webhooks.name",
    "notifications.webhooks.url",
    "notifications.webhooks.secret",
    "notifications.webhooks.categories",
    "notifications.webhooks.test",
    "notifications.webhooks.create",
    "notifications.admin.title",
    "notifications.admin.total",
    "notifications.admin.unread",
    "notifications.admin.critical",
    "notifications.admin.today",
    "notifications.group.expand",
    "notifications.group.occurrences",
    "notifications.group.latest",
  ];

  it("all notification keys exist in EN locale with non-empty string values", () => {
    for (const key of REQUIRED_KEYS) {
      const value = (en as Record<string, string>)[key];
      expect(value, `EN missing key: ${key}`).toBeDefined();
      expect(typeof value, `EN key ${key} is not a string`).toBe("string");
      expect(value.length, `EN key ${key} is empty`).toBeGreaterThan(0);
    }
  });

  it("all notification keys exist in TH locale with non-empty string values", () => {
    for (const key of REQUIRED_KEYS) {
      const value = (th as Record<string, string>)[key];
      expect(value, `TH missing key: ${key}`).toBeDefined();
      expect(typeof value, `TH key ${key} is not a string`).toBe("string");
      expect(value.length, `TH key ${key} is empty`).toBeGreaterThan(0);
    }
  });
});
