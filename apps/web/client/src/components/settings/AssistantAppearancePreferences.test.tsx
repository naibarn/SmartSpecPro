import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AssistantAppearancePreferences } from "./AssistantAppearancePreferences";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-7", currentTenantId: "tenant-3" } }),
}));
vi.mock("@/hooks/useTenantFeatureFlag", () => ({
  useTenantFeatureFlagStatus: () => ({ enabled: true, isResolved: true, isError: false }),
}));
vi.mock("@/lib/assistantMascotFeatureGate", () => ({
  ASSISTANT_MASCOT_GLOBAL_ALLOW: true,
  isAssistantMascotEnabled: () => true,
}));
vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({ t: (key: string) => key }),
}));

describe("AssistantAppearancePreferences", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => cleanup());

  it("renders all five selectable styles and saves the selected style to the scoped key", () => {
    render(<AssistantAppearancePreferences />);

    for (const style of ["droplet", "star", "shield", "chat", "orbit"]) {
      expect(screen.getByRole("radio", { name: `assistantAppearance.styles.${style}` })).toBeTruthy();
    }
    fireEvent.click(screen.getByRole("radio", { name: "assistantAppearance.styles.star" }));
    expect(JSON.parse(localStorage.getItem("assistant-mascot:v2:tenant-3:user-7")!).style).toBe("star");
    expect(screen.getByRole("radio", { name: "assistantAppearance.styles.star" }).getAttribute("aria-checked")).toBe("true");
  });

  it("keeps motion, reminder, onboarding, and launcher visibility as independent scoped preferences", () => {
    render(<AssistantAppearancePreferences />);
    fireEvent.change(screen.getByLabelText("assistantAppearance.motion"), { target: { value: "off" } });
    fireEvent.click(screen.getByLabelText("assistantAppearance.reminders"));
    fireEvent.click(screen.getByLabelText("assistantAppearance.onboarding"));

    const key = "assistant-mascot:v2:tenant-3:user-7";
    const saved = JSON.parse(localStorage.getItem(key)!);
    expect(saved).toMatchObject({ motion: "off", notificationReminders: false, chatOnboarding: false, enabled: true });

    fireEvent.click(screen.getByLabelText("assistantAppearance.enabled"));
    expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({ enabled: false, motion: "off", notificationReminders: false, chatOnboarding: false });
  });

  it("rejects an unsupported motion value instead of persisting it", () => {
    localStorage.setItem("assistant-mascot:v2:tenant-3:user-7", JSON.stringify({
      version: 2,
      enabled: true,
      style: "droplet",
      motion: "subtle",
      notificationReminders: true,
      chatOnboarding: true,
    }));
    render(<AssistantAppearancePreferences />);
    fireEvent.change(screen.getByLabelText("assistantAppearance.motion"), { target: { value: "continuous" } });
    const saved = JSON.parse(localStorage.getItem("assistant-mascot:v2:tenant-3:user-7")!);
    expect(saved.motion).toBe("subtle");
  });

  it("explains when the operating system temporarily overrides the saved motion choice", () => {
    const originalMatchMedia = window.matchMedia;
    const mediaQuery = {
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList;
    Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => mediaQuery) });
    try {
      render(<AssistantAppearancePreferences />);
      expect(screen.getByText("assistantAppearance.systemReducedMotion")).toBeTruthy();
      fireEvent.change(screen.getByLabelText("assistantAppearance.motion"), { target: { value: "off" } });
      expect(screen.queryByText("assistantAppearance.systemReducedMotion")).toBeNull();
      expect(JSON.parse(localStorage.getItem("assistant-mascot:v2:tenant-3:user-7")!).motion).toBe("off");
    } finally {
      Object.defineProperty(window, "matchMedia", { configurable: true, value: originalMatchMedia });
    }
  });

  it("emits a deterministic demo request without sending a notification", () => {
    const listener = vi.fn();
    window.addEventListener("smartspec:show-assistant-mascot-demo", listener);
    render(<AssistantAppearancePreferences />);
    fireEvent.click(screen.getByText("assistantAppearance.demo"));
    window.removeEventListener("smartspec:show-assistant-mascot-demo", listener);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
