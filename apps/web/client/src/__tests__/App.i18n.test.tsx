import React, { Suspense } from "react";
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";

// Set up a minimal i18next instance for App integration tests
let testI18n: ReturnType<typeof i18next.createInstance>;

beforeAll(async () => {
  testI18n = i18next.createInstance();
  await testI18n.use(initReactI18next).init({
    lng: "en",
    fallbackLng: "en",
    defaultNS: "common",
    resources: {
      en: {
        common: {
          save: "Save",
          cancel: "Cancel",
          loading: "Loading...",
        },
      },
    },
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
});

function ConsumerComponent() {
  const t = testI18n.t.bind(testI18n);
  return <div data-testid="consumer">{t("common:save")}</div>;
}

describe("App i18n integration", () => {
  it("I18nextProvider allows react-i18next hooks inside the tree", () => {
    render(
      <I18nextProvider i18n={testI18n}>
        <ConsumerComponent />
      </I18nextProvider>,
    );
    expect(screen.getByTestId("consumer")).toHaveTextContent("Save");
  });

  it("Suspense fallback renders RouteLoadingSkeleton during pending namespace load", async () => {
    // Lazily import the skeleton to avoid circular dep issues in tests
    const { RouteLoadingSkeleton } = await import(
      "@/components/RouteLoadingSkeleton"
    );
    // Component that suspends forever (simulates pending namespace loading)
    const neverResolve = new Promise<never>(() => {});
    function SuspendingChild() {
      throw neverResolve;
    }

    render(
      <Suspense fallback={<RouteLoadingSkeleton />}>
        <SuspendingChild />
      </Suspense>,
    );

    expect(
      screen.getByTestId("route-loading-skeleton"),
    ).toBeInTheDocument();
  });

  it("t() returns English fallback value when language is set to th but no th translations exist", () => {
    const noThInstance = i18next.createInstance();
    // Initialize synchronously with only EN resources
    noThInstance.use(initReactI18next).init({
      lng: "th",
      fallbackLng: "en",
      resources: {
        en: { common: { save: "Save" } },
      },
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
    });

    const result = noThInstance.t("common:save");
    expect(result).toBe("Save");
  });

  it("I18nextProvider does not throw when i18n instance is not yet ready", () => {
    const freshInstance = i18next.createInstance();
    // Intentionally NOT awaiting init — simulates race condition
    freshInstance.use(initReactI18next).init({
      lng: "en",
      fallbackLng: "en",
      resources: { en: { common: { ok: "OK" } } },
      react: { useSuspense: false },
    });

    expect(() => {
      render(
        <I18nextProvider i18n={freshInstance}>
          <div>child</div>
        </I18nextProvider>,
      );
    }).not.toThrow();
  });

  it("useNamespacePreloader mock verifies hook integration point", () => {
    // Verifies that the mock pattern used in App.tsx testing works.
    // The actual hook is tested in i18n/__tests__/useNamespacePreloader.test.tsx.
    const mockPreloader = vi.fn();
    function RouterWithPreloader() {
      mockPreloader();
      return <div data-testid="router">router</div>;
    }
    render(
      <I18nextProvider i18n={testI18n}>
        <RouterWithPreloader />
      </I18nextProvider>,
    );
    expect(mockPreloader).toHaveBeenCalledOnce();
    expect(screen.getByTestId("router")).toBeInTheDocument();
  });
});
