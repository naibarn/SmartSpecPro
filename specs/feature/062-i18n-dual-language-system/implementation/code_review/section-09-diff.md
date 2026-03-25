diff --git a/apps/web/client/src/App.tsx b/apps/web/client/src/App.tsx
index dc00d8f1..87a589a8 100644
--- a/apps/web/client/src/App.tsx
+++ b/apps/web/client/src/App.tsx
@@ -15,6 +15,7 @@ import { useNamespacePreloader } from "@/i18n/useNamespacePreloader";
 import { RouteLoadingSkeleton } from "@/components/RouteLoadingSkeleton";
 import { useLanguageSync } from "@/hooks/useLanguageSync";
 import { cleanupLegacyAuth } from "@/lib/cleanupLegacyAuth";
+import { WelcomeLanguagePicker } from "@/components/WelcomeLanguagePicker";
 
 // Route-based code splitting — all page components are loaded lazily
 const NotFound = lazy(() => import("@/pages/NotFound"));
@@ -422,6 +423,7 @@ function App() {
                 <GlobalAlerts />
                 <SystemHealthBanner />
                 <LanguageSyncBridge />
+                <WelcomeLanguagePicker />
                 <Router />
                 <FeedbackButton />
               </TooltipProvider>
diff --git a/apps/web/client/src/components/WelcomeLanguagePicker.tsx b/apps/web/client/src/components/WelcomeLanguagePicker.tsx
new file mode 100644
index 00000000..fb862621
--- /dev/null
+++ b/apps/web/client/src/components/WelcomeLanguagePicker.tsx
@@ -0,0 +1,124 @@
+/**
+ * WelcomeLanguagePicker — one-time language selection modal for new users.
+ *
+ * Shows when:
+ *   - localStorage `smartspec_locale_chosen` is not 'true'
+ *   - User's stored `translationLanguage` preference is empty/unset
+ *
+ * On selection:
+ *   - Calls i18next.changeLanguage()
+ *   - Writes to localStorage smartspec_locale
+ *   - Persists to DB via tRPC users.updatePreferences
+ *   - Sets smartspec_locale_chosen='true' to prevent re-showing
+ *
+ * Section 09 — i18n feature 062
+ */
+
+import { useState, useEffect } from "react";
+import i18next from "i18next";
+import {
+  Dialog,
+  DialogContent,
+  DialogHeader,
+  DialogTitle,
+  DialogDescription,
+  DialogFooter,
+} from "@/components/ui/dialog";
+import { Button } from "@/components/ui/button";
+import { trpc } from "@/lib/trpc";
+import {
+  SUPPORTED_LANGUAGES,
+  LANGUAGE_LABELS,
+  LANGUAGE_COVERAGE,
+  type SupportedLanguage,
+} from "@shared/i18n";
+
+const LOCALE_CHOSEN_KEY = "smartspec_locale_chosen";
+const LOCALE_KEY = "smartspec_locale";
+const MIN_COVERAGE = 50;
+
+function safeLocalStorage() {
+  try {
+    return { get: (k: string) => localStorage.getItem(k), set: (k: string, v: string) => localStorage.setItem(k, v) };
+  } catch {
+    return { get: (_k: string) => null, set: (_k: string, _v: string) => {} };
+  }
+}
+
+export function WelcomeLanguagePicker() {
+  const storage = safeLocalStorage();
+  const alreadyChosen = storage.get(LOCALE_CHOSEN_KEY) === "true";
+
+  const { data: prefs, isSuccess, isError } = trpc.users.getPreferences.useQuery(undefined, {
+    enabled: !alreadyChosen,
+  });
+  const { mutate: updatePreferences } = trpc.users.updatePreferences.useMutation();
+
+  const [open, setOpen] = useState(false);
+
+  useEffect(() => {
+    if (alreadyChosen) return;
+    if (!isSuccess && !isError) return; // still loading
+    const hasPreference = prefs?.translationLanguage && prefs.translationLanguage !== "";
+    if (!hasPreference) setOpen(true);
+  }, [alreadyChosen, isSuccess, isError, prefs?.translationLanguage]);
+
+  // Languages with sufficient coverage (excluding English — it's the "continue" fallback)
+  const availableLanguages = SUPPORTED_LANGUAGES.filter(
+    (lang): lang is SupportedLanguage =>
+      lang !== "en" && (LANGUAGE_COVERAGE[lang as SupportedLanguage] ?? 0) >= MIN_COVERAGE
+  );
+
+  function handleSelect(lang: string) {
+    // Defense-in-depth: validate against SUPPORTED_LANGUAGES
+    if (!(SUPPORTED_LANGUAGES as readonly string[]).includes(lang)) return;
+
+    void i18next.changeLanguage(lang);
+    storage.set(LOCALE_KEY, lang);
+    storage.set(LOCALE_CHOSEN_KEY, "true");
+    updatePreferences({ translationLanguage: lang as SupportedLanguage });
+    setOpen(false);
+  }
+
+  function handleDismiss() {
+    storage.set(LOCALE_CHOSEN_KEY, "true");
+    setOpen(false);
+  }
+
+  return (
+    <Dialog open={open} onOpenChange={(v) => { if (!v) handleDismiss(); }}>
+      <DialogContent>
+        <DialogHeader>
+          <DialogTitle>Choose Your Language</DialogTitle>
+          <DialogDescription>
+            Select your preferred display language. English is always available as a fallback.
+          </DialogDescription>
+        </DialogHeader>
+
+        {availableLanguages.length > 0 && (
+          <div className="grid grid-cols-2 gap-3 my-4">
+            {availableLanguages.map((lang) => (
+              <button
+                key={lang}
+                onClick={() => handleSelect(lang)}
+                aria-label={`${LANGUAGE_LABELS[lang]} (${lang})`}
+                className="rounded-lg border p-3 text-left hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
+              >
+                <div className="font-medium">{LANGUAGE_LABELS[lang]}</div>
+                <div className="text-muted-foreground text-xs mt-1">
+                  {lang} · {LANGUAGE_COVERAGE[lang]}% translated
+                </div>
+              </button>
+            ))}
+          </div>
+        )}
+
+        <DialogFooter>
+          <Button variant="outline" onClick={handleDismiss}>
+            Continue with English
+          </Button>
+        </DialogFooter>
+      </DialogContent>
+    </Dialog>
+  );
+}
diff --git a/apps/web/client/src/components/__tests__/WelcomeLanguagePicker.test.tsx b/apps/web/client/src/components/__tests__/WelcomeLanguagePicker.test.tsx
new file mode 100644
index 00000000..34105f4b
--- /dev/null
+++ b/apps/web/client/src/components/__tests__/WelcomeLanguagePicker.test.tsx
@@ -0,0 +1,162 @@
+/**
+ * Tests for section-09: WelcomeLanguagePicker component
+ * One-time language selection modal for new users
+ */
+
+import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
+import { render, screen, fireEvent, waitFor } from "@testing-library/react";
+import { WelcomeLanguagePicker } from "../WelcomeLanguagePicker";
+
+// Mock i18next
+vi.mock("i18next", () => ({
+  default: {
+    changeLanguage: vi.fn().mockResolvedValue(undefined),
+    language: "en",
+  },
+}));
+
+// Mocks for trpc
+const mockMutate = vi.fn();
+const mockGetPreferences = vi.fn();
+
+vi.mock("@/lib/trpc", () => ({
+  trpc: {
+    users: {
+      updatePreferences: {
+        useMutation: () => ({ mutate: mockMutate }),
+      },
+      getPreferences: {
+        useQuery: () => mockGetPreferences(),
+      },
+    },
+  },
+}));
+
+// Mock localStorage
+const localStorageMock = {
+  getItem: vi.fn(),
+  setItem: vi.fn(),
+  removeItem: vi.fn(),
+};
+Object.defineProperty(window, "localStorage", { value: localStorageMock, writable: true });
+
+function setup(opts: {
+  hasChosenLocale?: boolean;
+  translationLanguage?: string;
+  prefsLoading?: boolean;
+  prefsError?: boolean;
+}) {
+  const { hasChosenLocale = false, translationLanguage = "", prefsLoading = false, prefsError = false } = opts;
+
+  localStorageMock.getItem.mockImplementation((key: string) => {
+    if (key === "smartspec_locale_chosen") return hasChosenLocale ? "true" : null;
+    return null;
+  });
+
+  if (prefsLoading) {
+    mockGetPreferences.mockReturnValue({ data: undefined, isSuccess: false, isError: false });
+  } else if (prefsError) {
+    mockGetPreferences.mockReturnValue({ data: undefined, isSuccess: false, isError: true });
+  } else {
+    mockGetPreferences.mockReturnValue({
+      data: { translationLanguage },
+      isSuccess: true,
+      isError: false,
+    });
+  }
+}
+
+beforeEach(() => {
+  vi.clearAllMocks();
+});
+
+afterEach(() => {
+  vi.restoreAllMocks();
+});
+
+describe("WelcomeLanguagePicker — visibility logic", () => {
+  it("renders modal when user has no language preference and localStorage lacks smartspec_locale_chosen", async () => {
+    setup({ hasChosenLocale: false, translationLanguage: "" });
+    render(<WelcomeLanguagePicker />);
+    await waitFor(() => {
+      expect(screen.getByRole("dialog")).toBeTruthy();
+    });
+  });
+
+  it("does not render when user already has translationLanguage set in preferences", async () => {
+    setup({ translationLanguage: "th" });
+    render(<WelcomeLanguagePicker />);
+    await waitFor(() => {
+      expect(screen.queryByRole("dialog")).toBeNull();
+    });
+  });
+
+  it("does not render when localStorage has smartspec_locale_chosen='true'", () => {
+    setup({ hasChosenLocale: true, translationLanguage: "" });
+    render(<WelcomeLanguagePicker />);
+    expect(screen.queryByRole("dialog")).toBeNull();
+  });
+
+  it("does not render while preferences are still loading", () => {
+    setup({ prefsLoading: true });
+    render(<WelcomeLanguagePicker />);
+    expect(screen.queryByRole("dialog")).toBeNull();
+  });
+});
+
+describe("WelcomeLanguagePicker — language filtering", () => {
+  it("always shows 'Continue with English' option regardless of coverage", async () => {
+    setup({ translationLanguage: "" });
+    render(<WelcomeLanguagePicker />);
+    await waitFor(() => {
+      expect(screen.getByText(/continue with english/i)).toBeTruthy();
+    });
+  });
+
+  it("does not show languages with coverage below 50", async () => {
+    setup({ translationLanguage: "" });
+    render(<WelcomeLanguagePicker />);
+    await waitFor(() => {
+      // Japanese has 0% coverage — should not appear as a language option
+      expect(screen.queryByText("日本語")).toBeNull();
+    });
+  });
+});
+
+describe("WelcomeLanguagePicker — selection behavior", () => {
+  it("sets localStorage smartspec_locale_chosen to 'true' after dismissal", async () => {
+    setup({ translationLanguage: "" });
+    render(<WelcomeLanguagePicker />);
+    const dismissBtn = await screen.findByText(/continue with english/i);
+    fireEvent.click(dismissBtn);
+    expect(localStorageMock.setItem).toHaveBeenCalledWith("smartspec_locale_chosen", "true");
+  });
+
+  it("dismissing modal sets smartspec_locale_chosen to 'true'", async () => {
+    setup({ translationLanguage: "" });
+    render(<WelcomeLanguagePicker />);
+    const dismissBtn = await screen.findByText(/continue with english/i);
+    fireEvent.click(dismissBtn);
+    expect(localStorageMock.setItem).toHaveBeenCalledWith("smartspec_locale_chosen", "true");
+  });
+});
+
+describe("WelcomeLanguagePicker — display", () => {
+  it("shows dialog title about choosing language", async () => {
+    setup({ translationLanguage: "" });
+    render(<WelcomeLanguagePicker />);
+    await waitFor(() => {
+      expect(screen.getByRole("dialog")).toBeTruthy();
+    });
+    // Title should be present
+    const title = screen.queryByText(/choose/i) || screen.queryByText(/language/i);
+    expect(title).toBeTruthy();
+  });
+
+  it("shows 'Continue with English' as a button", async () => {
+    setup({ translationLanguage: "" });
+    render(<WelcomeLanguagePicker />);
+    const btn = await screen.findByText(/continue with english/i);
+    expect(btn.tagName.toLowerCase()).not.toBe("span");
+  });
+});
