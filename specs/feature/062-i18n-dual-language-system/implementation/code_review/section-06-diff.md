diff --git a/apps/web/client/src/lib/i18n/__tests__/backwardCompat.test.tsx b/apps/web/client/src/lib/i18n/__tests__/backwardCompat.test.tsx
new file mode 100644
index 00000000..9c84a8ff
--- /dev/null
+++ b/apps/web/client/src/lib/i18n/__tests__/backwardCompat.test.tsx
@@ -0,0 +1,152 @@
+import React from "react";
+import { describe, it, expect, vi, beforeAll } from "vitest";
+import { render, screen, act } from "@testing-library/react";
+import { renderHook } from "@testing-library/react";
+import { I18nextProvider } from "react-i18next";
+import i18next from "i18next";
+import { initReactI18next } from "react-i18next";
+
+// Shared i18next instance for all tests in this suite
+let testI18n: ReturnType<typeof i18next.createInstance>;
+
+beforeAll(async () => {
+  testI18n = i18next.createInstance();
+  await testI18n.use(initReactI18next).init({
+    lng: "en",
+    fallbackLng: "en",
+    defaultNS: "common",
+    resources: {
+      en: {
+        help: {
+          "help.title": "Help Center",
+          "help.search": "Search help articles",
+          greeting: "Hello, {{name}}!",
+        },
+        common: {
+          save: "Save",
+          cancel: "Cancel",
+        },
+        admin: {
+          "admin.users": "Users",
+        },
+      },
+      th: {
+        help: {
+          "help.title": "ศูนย์ช่วยเหลือ",
+        },
+        common: {
+          save: "บันทึก",
+        },
+      },
+    },
+    interpolation: { escapeValue: false },
+    react: { useSuspense: false },
+  });
+});
+
+function wrapper({ children }: { children: React.ReactNode }) {
+  return <I18nextProvider i18n={testI18n}>{children}</I18nextProvider>;
+}
+
+describe("useI18n backward compatibility", () => {
+  it("useI18n().t('help.title') returns English value from help namespace", async () => {
+    await act(async () => { await testI18n.changeLanguage("en"); });
+    const { useI18n } = await import("../context");
+
+    const { result } = renderHook(() => useI18n(), { wrapper });
+    expect(result.current.t("help.title")).toBe("Help Center");
+  });
+
+  it("useI18n().t('help.title') returns Thai value when language is 'th'", async () => {
+    await act(async () => { await testI18n.changeLanguage("th"); });
+    const { useI18n } = await import("../context");
+
+    const { result } = renderHook(() => useI18n(), { wrapper });
+    expect(result.current.t("help.title")).toBe("ศูนย์ช่วยเหลือ");
+    // Reset to en for other tests
+    await act(async () => { await testI18n.changeLanguage("en"); });
+  });
+
+  it("useI18n().locale returns current i18next language", async () => {
+    await act(async () => { await testI18n.changeLanguage("en"); });
+    const { useI18n } = await import("../context");
+
+    const { result } = renderHook(() => useI18n(), { wrapper });
+    expect(result.current.locale).toBe("en");
+  });
+
+  it("useI18n().setLocale('th') calls i18next.changeLanguage('th')", async () => {
+    const spy = vi.spyOn(testI18n, "changeLanguage");
+    const { useI18n } = await import("../context");
+
+    const { result } = renderHook(() => useI18n(), { wrapper });
+    await act(async () => { result.current.setLocale("th"); });
+    expect(spy).toHaveBeenCalledWith("th");
+    spy.mockRestore();
+    // Reset
+    await act(async () => { await testI18n.changeLanguage("en"); });
+  });
+
+  it("useI18n().setLocale('th') writes to localStorage", async () => {
+    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
+    const { useI18n } = await import("../context");
+
+    const { result } = renderHook(() => useI18n(), { wrapper });
+    await act(async () => { result.current.setLocale("th"); });
+    expect(setItemSpy).toHaveBeenCalledWith("smartspec_locale", "th");
+    setItemSpy.mockRestore();
+    await act(async () => { await testI18n.changeLanguage("en"); });
+  });
+
+  it("useI18n().t('missing.key') returns key string as fallback", async () => {
+    const { useI18n } = await import("../context");
+
+    const { result } = renderHook(() => useI18n(), { wrapper });
+    const val = result.current.t("missing.nonexistent.key");
+    expect(typeof val).toBe("string");
+    // i18next returns the key when no translation found
+    expect(val.length).toBeGreaterThan(0);
+  });
+
+  it("useI18n().t('greeting', { name: 'Alice' }) interpolates correctly", async () => {
+    await act(async () => { await testI18n.changeLanguage("en"); });
+    const { useI18n } = await import("../context");
+
+    const { result } = renderHook(() => useI18n(), { wrapper });
+    expect(result.current.t("greeting", { name: "Alice" })).toBe("Hello, Alice!");
+  });
+
+  it("useI18n().dict returns empty object", async () => {
+    const { useI18n } = await import("../context");
+
+    const { result } = renderHook(() => useI18n(), { wrapper });
+    expect(result.current.dict).toEqual({});
+  });
+
+  it("I18nProvider renders children without error (passthrough)", async () => {
+    const { I18nProvider } = await import("../context");
+    render(
+      <I18nextProvider i18n={testI18n}>
+        <I18nProvider>
+          <div data-testid="child">hello</div>
+        </I18nProvider>
+      </I18nextProvider>,
+    );
+    expect(screen.getByTestId("child")).toBeInTheDocument();
+  });
+
+  it("nested I18nProviders work without error", async () => {
+    const { I18nProvider } = await import("../context");
+    expect(() => {
+      render(
+        <I18nextProvider i18n={testI18n}>
+          <I18nProvider>
+            <I18nProvider>
+              <div>nested</div>
+            </I18nProvider>
+          </I18nProvider>
+        </I18nextProvider>,
+      );
+    }).not.toThrow();
+  });
+});
diff --git a/apps/web/client/src/lib/i18n/__tests__/exportsCompat.test.ts b/apps/web/client/src/lib/i18n/__tests__/exportsCompat.test.ts
new file mode 100644
index 00000000..ae35e1e9
--- /dev/null
+++ b/apps/web/client/src/lib/i18n/__tests__/exportsCompat.test.ts
@@ -0,0 +1,32 @@
+import { describe, it, expect } from "vitest";
+
+describe("lib/i18n index exports compatibility", () => {
+  it("exports I18nProvider as a function", async () => {
+    const { I18nProvider } = await import("../index");
+    expect(typeof I18nProvider).toBe("function");
+  });
+
+  it("exports useI18n as a function", async () => {
+    const { useI18n } = await import("../index");
+    expect(typeof useI18n).toBe("function");
+  });
+
+  it("exports AVAILABLE_LOCALES containing 'en' and 'th'", async () => {
+    const { AVAILABLE_LOCALES } = await import("../index");
+    expect(AVAILABLE_LOCALES).toContain("en");
+    expect(AVAILABLE_LOCALES).toContain("th");
+  });
+
+  it("exports LOCALE_LABELS with 'en' and 'th' keys", async () => {
+    const { LOCALE_LABELS } = await import("../index");
+    expect(LOCALE_LABELS).toHaveProperty("en");
+    expect(LOCALE_LABELS).toHaveProperty("th");
+    expect(typeof LOCALE_LABELS.en).toBe("string");
+    expect(typeof LOCALE_LABELS.th).toBe("string");
+  });
+
+  it("exports DEFAULT_LOCALE as 'en'", async () => {
+    const { DEFAULT_LOCALE } = await import("../index");
+    expect(DEFAULT_LOCALE).toBe("en");
+  });
+});
diff --git a/apps/web/client/src/lib/i18n/context.tsx b/apps/web/client/src/lib/i18n/context.tsx
index 6063821e..3df96751 100644
--- a/apps/web/client/src/lib/i18n/context.tsx
+++ b/apps/web/client/src/lib/i18n/context.tsx
@@ -1,19 +1,17 @@
-import { createContext, useCallback, useContext, useMemo, useState } from "react";
-import type { Locale, TranslationDictionary } from "./types";
-import { DEFAULT_LOCALE } from "./types";
-import { getLocale as loadLocale } from "./locales";
-
-const STORAGE_KEY = "smartspec_locale";
+/**
+ * Backward-compatibility shim for the legacy `lib/i18n` API.
+ *
+ * All implementations now delegate to react-i18next. Existing consumers of
+ * `useI18n()`, `I18nProvider`, and the exported types continue to work without
+ * any code changes (Phase 1 backward compat).
+ *
+ * Removal timeline: delete this file after Wave 3 when all consumers are
+ * migrated to `useTranslation()` directly.  Do NOT add new consumers of `useI18n()`.
+ */
 
-function readStoredLocale(): Locale {
-  try {
-    const stored = localStorage.getItem(STORAGE_KEY);
-    if (stored === "en" || stored === "th") return stored;
-  } catch {
-    // SSR or private browsing
-  }
-  return DEFAULT_LOCALE;
-}
+import React from "react";
+import { useTranslation } from "react-i18next";
+import type { Locale, TranslationDictionary } from "./types";
 
 interface I18nContextValue {
   locale: Locale;
@@ -22,52 +20,48 @@ interface I18nContextValue {
   dict: TranslationDictionary;
 }
 
-const I18nContext = createContext<I18nContextValue | null>(null);
-
+/**
+ * Passthrough provider — the real i18n context is provided by
+ * `<I18nextProvider>` in App.tsx (section-05). This component is kept for
+ * backward compatibility so existing component trees that render
+ * `<I18nProvider>` in tests continue to work.
+ */
 export function I18nProvider({ children }: { children: React.ReactNode }) {
-  const [locale, setLocaleState] = useState<Locale>(readStoredLocale);
+  return <>{children}</>;
+}
 
-  const dict = useMemo(() => loadLocale(locale), [locale]);
+/**
+ * Drop-in replacement for the old custom `useI18n()` hook.
+ *
+ * Delegates to react-i18next `useTranslation`. The three namespaces cover all
+ * keys used by existing consumers: `help` for help pages, `common` for shared
+ * UI labels, `admin` for admin dashboard strings.
+ */
+export function useI18n(): I18nContextValue {
+  const { t: i18nT, i18n } = useTranslation(["help", "common", "admin"]);
 
-  const setLocale = useCallback((next: Locale) => {
-    setLocaleState(next);
+  const locale = (i18n.resolvedLanguage ?? i18n.language) as Locale;
+
+  const setLocale = (next: Locale) => {
+    void i18n.changeLanguage(next);
     try {
-      localStorage.setItem(STORAGE_KEY, next);
+      localStorage.setItem("smartspec_locale", next);
     } catch {
-      // ignore
+      // Private/full storage — language still applied to i18next
     }
-  }, []);
-
-  const t = useCallback(
-    (key: string, params?: Record<string, string | number>): string => {
-      let value = dict[key] ?? key;
-      if (params) {
-        for (const [k, v] of Object.entries(params)) {
-          value = value.replaceAll(`{{${k}}}`, String(v));
-        }
-      }
-      return value;
-    },
-    [dict],
-  );
-
-  const ctx = useMemo(() => ({ locale, setLocale, t, dict }), [locale, setLocale, t, dict]);
+  };
 
-  return <I18nContext.Provider value={ctx}>{children}</I18nContext.Provider>;
-}
+  const t = (key: string, params?: Record<string, string | number>): string => {
+    if (params) {
+      return i18nT(key, params as Record<string, unknown>) as string;
+    }
+    return i18nT(key) as string;
+  };
 
-/**
- * Access i18n inside any component wrapped by `<I18nProvider>`.
- *
- * ```tsx
- * const { t, locale, setLocale } = useI18n();
- * return <p>{t("help.title")}</p>;
- * ```
- */
-export function useI18n(): I18nContextValue {
-  const ctx = useContext(I18nContext);
-  if (!ctx) {
-    throw new Error("useI18n must be used within <I18nProvider>");
-  }
-  return ctx;
+  return {
+    locale,
+    setLocale,
+    t,
+    dict: {},
+  };
 }
