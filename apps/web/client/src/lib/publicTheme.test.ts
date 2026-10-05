import { describe, expect, it } from "vitest";
import {
  applyPublicThemeBoundary,
  isPlatformLightOnlyPublicRoute,
  isSmartAIHubLightOnlyPublicPath,
  resolvePublicThemeMode,
} from "./publicTheme";

describe("SmartAIHub public theme boundary", () => {
  const cases: Array<[string, boolean]> = [
    ["/", true],
    ["/features?source=nav", true],
    ["/pricing/", true],
    ["/privacy", true],
    ["/terms", true],
    ["/docs/seo/accessibility", true],
    ["/blog/launch-notes", true],
    ["/marketplace/skill-name", true],
    ["/dashboard", false],
    ["/login", false],
    ["/disaster/map", false],
  ];

  it.each(cases)("classifies %s as light-only public: %s", (path, expected) => {
    expect(isSmartAIHubLightOnlyPublicPath(path)).toBe(expected);
  });

  it("keeps the platform public site light without overwriting a dark preference", () => {
    const root = document.documentElement;
    root.classList.add("dark");

    applyPublicThemeBoundary(root, "dark", true);

    expect(root.dataset.smartaihubPublicTheme).toBe("light");
    expect(root.classList.contains("dark")).toBe(false);
  });

  it("restores the saved dark theme when leaving platform marketing routes", () => {
    const root = document.documentElement;
    root.dataset.smartaihubPublicTheme = "light";

    applyPublicThemeBoundary(root, "dark", false);

    expect(root.dataset.smartaihubPublicTheme).toBeUndefined();
    expect(root.classList.contains("dark")).toBe(true);
  });

  it("preserves a custom tenant's selected theme on public routes", () => {
    const root = document.documentElement;

    applyPublicThemeBoundary(root, "dark", false);

    expect(root.dataset.smartaihubPublicTheme).toBeUndefined();
    expect(root.classList.contains("dark")).toBe(true);
  });

  it("uses light palette tokens for platform marketing even when dark is persisted", () => {
    const platformTenant = { primaryDomain: "smartaihub.app" };
    const customTenantServedFromPlatformHost = { primaryDomain: "studio.example" };
    const platformMarketing = isPlatformLightOnlyPublicRoute(platformTenant, "/features");

    expect(platformMarketing).toBe(true);
    expect(resolvePublicThemeMode("dark", platformMarketing)).toBe("light");
    expect(
      resolvePublicThemeMode(
        "dark",
        isPlatformLightOnlyPublicRoute(platformTenant, "/dashboard"),
      ),
    ).toBe("dark");

    const customTenantRoute = isPlatformLightOnlyPublicRoute(
      customTenantServedFromPlatformHost,
      "/features",
    );
    expect(customTenantRoute).toBe(false);
    expect(resolvePublicThemeMode("dark", customTenantRoute)).toBe("dark");
  });
});
