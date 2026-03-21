import { describe, it, expect } from "vitest";
import { defaultMenuItems } from "@smartspec/shared";

describe("Notification menu entries", () => {
  it("has admin-notifications menu item at /admin/notifications with admin role", () => {
    const item = defaultMenuItems.find((m) => m.id === "admin-notifications");
    expect(item).toBeDefined();
    expect(item!.path).toBe("/admin/notifications");
    expect(item!.roles).toContain("admin");
  });

  it("has admin-alert-rules menu item at /admin/alert-rules with admin role", () => {
    const item = defaultMenuItems.find((m) => m.id === "admin-alert-rules");
    expect(item).toBeDefined();
    expect(item!.path).toBe("/admin/alert-rules");
    expect(item!.roles).toContain("admin");
  });

  it("admin-notifications requires feature notificationUnifiedCenter", () => {
    const item = defaultMenuItems.find((m) => m.id === "admin-notifications");
    expect(item!.requiresFeature).toBe("notificationUnifiedCenter");
  });

  it("admin-alert-rules requires feature notificationPreferencesEnabled", () => {
    const item = defaultMenuItems.find((m) => m.id === "admin-alert-rules");
    expect(item!.requiresFeature).toBe("notificationPreferencesEnabled");
  });
});
