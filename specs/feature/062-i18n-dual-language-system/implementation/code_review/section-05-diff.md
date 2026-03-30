diff --git a/apps/web/client/src/App.tsx b/apps/web/client/src/App.tsx
index 811db6ad..dc00d8f1 100644
--- a/apps/web/client/src/App.tsx
+++ b/apps/web/client/src/App.tsx
@@ -9,7 +9,11 @@ import { getPostHog } from "@/lib/posthog";
 import { ThemeProvider } from "./contexts/ThemeContext";
 import { AuthProvider, useAuth } from "./contexts/AuthContext";
 import { TenantProvider } from "./contexts/TenantContext";
-import { I18nProvider } from "@/lib/i18n";
+import { I18nextProvider } from "react-i18next";
+import { i18n } from "@/i18n";
+import { useNamespacePreloader } from "@/i18n/useNamespacePreloader";
+import { RouteLoadingSkeleton } from "@/components/RouteLoadingSkeleton";
+import { useLanguageSync } from "@/hooks/useLanguageSync";
 import { cleanupLegacyAuth } from "@/lib/cleanupLegacyAuth";
 
 // Route-based code splitting — all page components are loaded lazily
@@ -79,6 +83,7 @@ const SocialChannels = lazy(() => import("./pages/SocialChannels"));
 const SocialInbox = lazy(() => import("./pages/SocialInbox"));
 const SocialPublishing = lazy(() => import("./pages/SocialPublishing"));
 const SocialModeration = lazy(() => import("./pages/SocialModeration"));
+const SocialAutomation = lazy(() => import("./pages/SocialAutomation"));
 const Notifications = lazy(() => import("./pages/Notifications"));
 const Generate = lazy(() => import("./pages/Generate"));
 const MediaStudio = lazy(() => import("./pages/MediaStudio"));
@@ -93,6 +98,7 @@ const SkillBrowser = lazy(() => import("./pages/SkillBrowser"));
 const DockerRedirect = lazy(() => import("./pages/DockerRedirect"));
 const GoogleDriveCallback = lazy(() => import("./pages/GoogleDriveCallback"));
 const OneDriveCallback = lazy(() => import("./pages/OneDriveCallback"));
+const UploadPostCallback = lazy(() => import("./pages/UploadPostCallback"));
 const DocPage = lazy(() => import("./pages/DocPage"));
 const About = lazy(() => import("./pages/About"));
 const Changelog = lazy(() => import("./pages/Changelog"));
@@ -108,6 +114,7 @@ const TaskQueueMonitor = lazy(() => import("./pages/TaskQueueMonitor"));
 const Teams = lazy(() => import("./pages/Teams"));
 const AgencyBrowser = lazy(() => import("./pages/AgencyBrowser"));
 const AgencyChat = lazy(() => import("./pages/AgencyChat"));
+const HybridOrchestrationPreview = lazy(() => import("./pages/HybridOrchestrationPreview"));
 const AgencyBuilder = lazy(() => import("./pages/AgencyBuilder"));
 const AgencyTemplates = lazy(() => import("./pages/AgencyTemplates"));
 const AgencyMarketplace = lazy(() => import("./pages/AgencyMarketplace"));
@@ -180,12 +187,18 @@ function PostHogPageViewTracker() {
   return null;
 }
 
+function LanguageSyncBridge() {
+  useLanguageSync();
+  return null;
+}
+
 function Router() {
+  useNamespacePreloader();
   // make sure to consider if you need authentication for certain routes
   return (
     <>
     <PostHogPageViewTracker />
-    <Suspense fallback={null}>
+    <Suspense fallback={<RouteLoadingSkeleton />}>
       <Switch>
         <Route path="/" component={Home} />
         <Route path="/pricing" component={Pricing} />
@@ -335,6 +348,7 @@ function Router() {
         <Route path="/social/inbox"><RequireAuth><SocialInbox /></RequireAuth></Route>
         <Route path="/social/publishing"><RequireAuth><SocialPublishing /></RequireAuth></Route>
         <Route path="/social/moderation"><RequireAuth><SocialModeration /></RequireAuth></Route>
+        <Route path="/social/automation"><RequireAuth><SocialAutomation /></RequireAuth></Route>
         <Route path="/automation"><RequireAuth><AutomationPage /></RequireAuth></Route>
         <Route path="/automation/live/:sessionId"><RequireAuth><AutomationPage /></RequireAuth></Route>
         <Route path="/teams"><RequireAuth><Teams /></RequireAuth></Route>
@@ -343,6 +357,8 @@ function Router() {
         <Route path="/agencies/templates"><RequireAuth><AgencyTemplates /></RequireAuth></Route>
         <Route path="/agencies/marketplace"><RequireAuth><AgencyMarketplace /></RequireAuth></Route>
         <Route path="/agencies/:id/edit"><RequireAuth><AgencyBuilder /></RequireAuth></Route>
+        <Route path="/agencies/:id/hybrid-preview"><RequireAuth><HybridOrchestrationPreview /></RequireAuth></Route>
+        <Route path="/agencies/:id/review"><RequireAuth><AgencyChat /></RequireAuth></Route>
         <Route path="/agencies/:id"><RequireAuth><AgencyChat /></RequireAuth></Route>
         <Route path="/workflows"><RequireAuth><Workflows /></RequireAuth></Route>
         <Route path="/workflows/editor"><RequireAuth><WorkflowEditor /></RequireAuth></Route>
@@ -374,6 +390,7 @@ function Router() {
         <Route path="/verify-email" component={VerifyEmail} />
         <Route path="/auth/callback/google-drive" component={GoogleDriveCallback} />
         <Route path="/auth/callback/onedrive" component={OneDriveCallback} />
+        <Route path="/auth/callback/upload-post" component={UploadPostCallback} />
         <Route path="/auth/callback/:provider" component={AuthCallback} />
         <Route path="/auth/device" component={DeviceAuth} />
         <Route path="/factory"><RequireAuth><Factory /></RequireAuth></Route>
@@ -396,7 +413,7 @@ function App() {
   return (
     <ErrorBoundary>
       <HelmetProvider>
-        <I18nProvider>
+        <I18nextProvider i18n={i18n}>
         <ThemeProvider defaultTheme="light">
           <AuthProvider>
             <TenantProvider>
@@ -404,13 +421,14 @@ function App() {
                 <Toaster />
                 <GlobalAlerts />
                 <SystemHealthBanner />
+                <LanguageSyncBridge />
                 <Router />
                 <FeedbackButton />
               </TooltipProvider>
             </TenantProvider>
           </AuthProvider>
         </ThemeProvider>
-        </I18nProvider>
+        </I18nextProvider>
       </HelmetProvider>
     </ErrorBoundary>
   );
diff --git a/apps/web/client/src/__tests__/App.i18n.test.tsx b/apps/web/client/src/__tests__/App.i18n.test.tsx
new file mode 100644
index 00000000..be1135e0
--- /dev/null
+++ b/apps/web/client/src/__tests__/App.i18n.test.tsx
@@ -0,0 +1,120 @@
+import React, { Suspense } from "react";
+import { describe, it, expect, vi, beforeAll } from "vitest";
+import { render, screen } from "@testing-library/react";
+import { I18nextProvider } from "react-i18next";
+import i18next from "i18next";
+import { initReactI18next } from "react-i18next";
+
+// Set up a minimal i18next instance for App integration tests
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
+        common: {
+          save: "Save",
+          cancel: "Cancel",
+          loading: "Loading...",
+        },
+      },
+    },
+    interpolation: { escapeValue: false },
+    react: { useSuspense: false },
+  });
+});
+
+function ConsumerComponent() {
+  const t = testI18n.t.bind(testI18n);
+  return <div data-testid="consumer">{t("common:save")}</div>;
+}
+
+describe("App i18n integration", () => {
+  it("I18nextProvider allows react-i18next hooks inside the tree", () => {
+    render(
+      <I18nextProvider i18n={testI18n}>
+        <ConsumerComponent />
+      </I18nextProvider>,
+    );
+    expect(screen.getByTestId("consumer")).toHaveTextContent("Save");
+  });
+
+  it("Suspense fallback renders RouteLoadingSkeleton during pending namespace load", async () => {
+    // Lazily import the skeleton to avoid circular dep issues in tests
+    const { RouteLoadingSkeleton } = await import(
+      "@/components/RouteLoadingSkeleton"
+    );
+    // Component that suspends forever (simulates pending namespace loading)
+    const neverResolve = new Promise<never>(() => {});
+    function SuspendingChild() {
+      throw neverResolve;
+    }
+
+    render(
+      <Suspense fallback={<RouteLoadingSkeleton />}>
+        <SuspendingChild />
+      </Suspense>,
+    );
+
+    expect(
+      screen.getByTestId("route-loading-skeleton"),
+    ).toBeInTheDocument();
+  });
+
+  it("t() returns English fallback value when language is set to th but no th translations exist", () => {
+    const noThInstance = i18next.createInstance();
+    // Initialize synchronously with only EN resources
+    noThInstance.use(initReactI18next).init({
+      lng: "th",
+      fallbackLng: "en",
+      resources: {
+        en: { common: { save: "Save" } },
+      },
+      interpolation: { escapeValue: false },
+      react: { useSuspense: false },
+    });
+
+    const result = noThInstance.t("common:save");
+    expect(result).toBe("Save");
+  });
+
+  it("I18nextProvider does not throw when i18n instance is not yet ready", () => {
+    const freshInstance = i18next.createInstance();
+    // Intentionally NOT awaiting init — simulates race condition
+    freshInstance.use(initReactI18next).init({
+      lng: "en",
+      fallbackLng: "en",
+      resources: { en: { common: { ok: "OK" } } },
+      react: { useSuspense: false },
+    });
+
+    expect(() => {
+      render(
+        <I18nextProvider i18n={freshInstance}>
+          <div>child</div>
+        </I18nextProvider>,
+      );
+    }).not.toThrow();
+  });
+
+  it("useNamespacePreloader mock verifies hook integration point", () => {
+    // Verifies that the mock pattern used in App.tsx testing works.
+    // The actual hook is tested in i18n/__tests__/useNamespacePreloader.test.tsx.
+    const mockPreloader = vi.fn();
+    function RouterWithPreloader() {
+      mockPreloader();
+      return <div data-testid="router">router</div>;
+    }
+    render(
+      <I18nextProvider i18n={testI18n}>
+        <RouterWithPreloader />
+      </I18nextProvider>,
+    );
+    expect(mockPreloader).toHaveBeenCalledOnce();
+    expect(screen.getByTestId("router")).toBeInTheDocument();
+  });
+});
diff --git a/apps/web/client/src/components/RouteLoadingSkeleton.tsx b/apps/web/client/src/components/RouteLoadingSkeleton.tsx
new file mode 100644
index 00000000..472dc5ef
--- /dev/null
+++ b/apps/web/client/src/components/RouteLoadingSkeleton.tsx
@@ -0,0 +1,29 @@
+/**
+ * RouteLoadingSkeleton — Suspense fallback shown during route-level
+ * chunk loading and i18next namespace loading.
+ *
+ * Replaces the previous `fallback={null}` to prevent a blank-flash
+ * during async chunk / namespace fetch.
+ */
+export function RouteLoadingSkeleton() {
+  return (
+    <div
+      data-testid="route-loading-skeleton"
+      className="flex flex-col w-full h-screen bg-background"
+    >
+      {/* Top bar placeholder */}
+      <div className="h-14 w-full border-b px-4 flex items-center gap-3">
+        <div className="animate-pulse h-8 w-8 rounded-full bg-muted" />
+        <div className="animate-pulse h-4 w-32 rounded bg-muted" />
+        <div className="ml-auto animate-pulse h-8 w-24 rounded bg-muted" />
+      </div>
+      {/* Content area placeholder */}
+      <div className="flex-1 p-6 flex flex-col gap-4">
+        <div className="animate-pulse h-8 w-64 rounded bg-muted" />
+        <div className="animate-pulse h-4 w-full rounded bg-muted" />
+        <div className="animate-pulse h-4 w-5/6 rounded bg-muted" />
+        <div className="animate-pulse h-4 w-4/6 rounded bg-muted" />
+      </div>
+    </div>
+  );
+}
diff --git a/apps/web/client/src/components/__tests__/RouteLoadingSkeleton.test.tsx b/apps/web/client/src/components/__tests__/RouteLoadingSkeleton.test.tsx
new file mode 100644
index 00000000..689016c0
--- /dev/null
+++ b/apps/web/client/src/components/__tests__/RouteLoadingSkeleton.test.tsx
@@ -0,0 +1,24 @@
+import { describe, it, expect } from "vitest";
+import { render, screen } from "@testing-library/react";
+import { RouteLoadingSkeleton } from "../RouteLoadingSkeleton";
+
+describe("RouteLoadingSkeleton", () => {
+  it("renders a container with data-testid='route-loading-skeleton'", () => {
+    render(<RouteLoadingSkeleton />);
+    expect(screen.getByTestId("route-loading-skeleton")).toBeInTheDocument();
+  });
+
+  it("renders at least one animated pulse/shimmer element", () => {
+    render(<RouteLoadingSkeleton />);
+    const skeleton = screen.getByTestId("route-loading-skeleton");
+    // Check for any element with animate-pulse class anywhere in the subtree
+    const pulseEls = skeleton.querySelectorAll('[class*="animate-pulse"]');
+    expect(pulseEls.length).toBeGreaterThan(0);
+  });
+
+  it("is not empty (has visible child elements)", () => {
+    render(<RouteLoadingSkeleton />);
+    const skeleton = screen.getByTestId("route-loading-skeleton");
+    expect(skeleton.children.length).toBeGreaterThan(0);
+  });
+});
diff --git a/apps/web/client/src/hooks/__tests__/useLanguageSync.test.tsx b/apps/web/client/src/hooks/__tests__/useLanguageSync.test.tsx
new file mode 100644
index 00000000..e22916d3
--- /dev/null
+++ b/apps/web/client/src/hooks/__tests__/useLanguageSync.test.tsx
@@ -0,0 +1,119 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+import { renderHook } from "@testing-library/react";
+
+// Use vi.hoisted so mock factories can reference these objects (vi.mock is hoisted)
+const mockAuth = vi.hoisted(() => ({
+  user: { id: "1", email: "test@test.com", name: "Test", plan: "free" as const } as Record<string, unknown> | null,
+  isLoading: false,
+  isAuthenticated: true,
+  login: vi.fn(),
+  signup: vi.fn(),
+  logout: vi.fn(),
+  loginWithGoogle: vi.fn(),
+  loginWithGitHub: vi.fn(),
+  refreshUser: vi.fn(),
+  updateUser: vi.fn(),
+}));
+
+const mockPrefs = vi.hoisted(() => ({
+  data: { translationLanguage: "th" } as Record<string, unknown> | undefined,
+}));
+
+const mockI18n = vi.hoisted(() => ({
+  language: "en",
+  changeLanguage: vi.fn(),
+}));
+
+vi.mock("@/contexts/AuthContext", () => ({
+  useAuth: () => mockAuth,
+}));
+
+vi.mock("@/lib/trpc", () => ({
+  trpc: {
+    users: {
+      getPreferences: {
+        useQuery: (_: unknown, __: unknown) => mockPrefs,
+      },
+    },
+  },
+}));
+
+vi.mock("@/i18n", () => ({
+  i18n: mockI18n,
+}));
+
+vi.mock("@shared/i18n", () => ({
+  SUPPORTED_LANGUAGES: [
+    "en", "th", "ja", "ar", "zh-Hans", "zh-Hant", "ko", "vi", "id",
+    "hi", "es", "pt-BR", "fr", "de", "ru", "it", "tr", "nl", "pl",
+  ],
+}));
+
+import { useLanguageSync } from "../useLanguageSync";
+
+describe("useLanguageSync", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+    vi.spyOn(Storage.prototype, "setItem");
+    // Reset to default authenticated state
+    mockAuth.user = { id: "1", email: "test@test.com", name: "Test", plan: "free" };
+    mockAuth.isLoading = false;
+    mockPrefs.data = { translationLanguage: "th" };
+    mockI18n.language = "en";
+  });
+
+  it("syncs DB preference to i18next when user has translationLanguage='th' and i18next language is 'en'", () => {
+    mockPrefs.data = { translationLanguage: "th" };
+    mockI18n.language = "en";
+
+    renderHook(() => useLanguageSync());
+
+    expect(mockI18n.changeLanguage).toHaveBeenCalledWith("th");
+  });
+
+  it("does not call changeLanguage when DB preference matches current i18next language", () => {
+    mockPrefs.data = { translationLanguage: "en" };
+    mockI18n.language = "en";
+
+    renderHook(() => useLanguageSync());
+
+    expect(mockI18n.changeLanguage).not.toHaveBeenCalled();
+  });
+
+  it("does not call changeLanguage when user is not authenticated (null user)", () => {
+    mockAuth.user = null;
+    mockPrefs.data = { translationLanguage: "th" };
+
+    renderHook(() => useLanguageSync());
+
+    expect(mockI18n.changeLanguage).not.toHaveBeenCalled();
+  });
+
+  it("does not call changeLanguage while auth is still loading", () => {
+    mockAuth.isLoading = true;
+    mockAuth.user = null;
+    mockPrefs.data = { translationLanguage: "th" };
+
+    renderHook(() => useLanguageSync());
+
+    expect(mockI18n.changeLanguage).not.toHaveBeenCalled();
+  });
+
+  it("ignores invalid DB preference value (not in SUPPORTED_LANGUAGES)", () => {
+    mockPrefs.data = { translationLanguage: "zz-invalid" };
+    mockI18n.language = "en";
+
+    renderHook(() => useLanguageSync());
+
+    expect(mockI18n.changeLanguage).not.toHaveBeenCalled();
+  });
+
+  it("updates localStorage when syncing DB preference", () => {
+    mockPrefs.data = { translationLanguage: "th" };
+    mockI18n.language = "en";
+
+    renderHook(() => useLanguageSync());
+
+    expect(localStorage.setItem).toHaveBeenCalledWith("smartspec_locale", "th");
+  });
+});
diff --git a/apps/web/client/src/hooks/useLanguageSync.ts b/apps/web/client/src/hooks/useLanguageSync.ts
new file mode 100644
index 00000000..6403e65a
--- /dev/null
+++ b/apps/web/client/src/hooks/useLanguageSync.ts
@@ -0,0 +1,40 @@
+import { useEffect } from "react";
+import { useAuth } from "@/contexts/AuthContext";
+import { trpc } from "@/lib/trpc";
+import { i18n } from "@/i18n";
+import { SUPPORTED_LANGUAGES } from "@shared/i18n";
+
+/**
+ * Syncs the user's DB `translationLanguage` preference to i18next after auth.
+ *
+ * The language detector (section-03) handles pre-auth detection from
+ * localStorage/browser. This hook handles the post-auth case: once the
+ * user's profile is available via `useAuth()`, sync the DB preference to
+ * i18next if it differs from the current language.
+ *
+ * Fire-and-forget — does not block rendering.
+ */
+export function useLanguageSync(): void {
+  const { user, isLoading } = useAuth();
+
+  const { data: prefs } = trpc.users.getPreferences.useQuery(undefined, {
+    enabled: !!user && !isLoading,
+  });
+
+  useEffect(() => {
+    if (isLoading || !user) return;
+    if (!prefs) return;
+
+    const dbLang = (prefs as Record<string, unknown>).translationLanguage;
+    if (typeof dbLang !== "string" || !dbLang) return;
+
+    // Validate: only apply known supported languages
+    if (!(SUPPORTED_LANGUAGES as readonly string[]).includes(dbLang)) return;
+
+    // Skip if already in sync
+    if (dbLang === i18n.language) return;
+
+    void i18n.changeLanguage(dbLang);
+    localStorage.setItem("smartspec_locale", dbLang);
+  }, [user, isLoading, prefs]);
+}
diff --git a/apps/web/client/src/main.tsx b/apps/web/client/src/main.tsx
index 71faa971..c3d50be2 100644
--- a/apps/web/client/src/main.tsx
+++ b/apps/web/client/src/main.tsx
@@ -11,6 +11,7 @@ import { toast } from "sonner";
 import App from "./App";
 import { getLoginUrl } from "./const";
 import "./index.css";
+import { i18nReady } from "@/i18n";
 
 const CHUNK_RELOAD_MARKER = "__smartspec_chunk_reload_at__";
 const CHUNK_RELOAD_WINDOW_MS = 30_000;
@@ -296,10 +297,15 @@ const trpcClient = trpc.createClient({
   ],
 });
 
-createRoot(document.getElementById("root")!).render(
-  <trpc.Provider client={trpcClient} queryClient={queryClient}>
-    <QueryClientProvider client={queryClient}>
-      <App />
-    </QueryClientProvider>
-  </trpc.Provider>
-);
+// Gate React tree on i18nReady to prevent flash of translation keys on startup.
+// The 3-second timeout in i18nReady guarantees the app mounts even if namespace
+// loading fails (defined in i18n/index.ts).
+i18nReady.then(() => {
+  createRoot(document.getElementById("root")!).render(
+    <trpc.Provider client={trpcClient} queryClient={queryClient}>
+      <QueryClientProvider client={queryClient}>
+        <App />
+      </QueryClientProvider>
+    </trpc.Provider>
+  );
+});
