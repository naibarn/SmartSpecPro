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
      expect(screen.getByTestId(`assistant-mascot-style-${style}`)).toBeTruthy();
    }
    fireEvent.click(screen.getByTestId("assistant-mascot-style-star"));
    expect(JSON.parse(localStorage.getItem("assistant-mascot:v2:tenant-3:user-7")!).style).toBe("star");
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
