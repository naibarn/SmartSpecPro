import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConfirmProvider } from "@/components/ui/confirm/ConfirmProvider";
import { GlobalAlerts } from "@/components/GlobalAlerts";
import { Route, Switch, Redirect, useLocation } from "wouter";
import { HelmetProvider } from "react-helmet-async";
import {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type AnchorHTMLAttributes,
  type MouseEvent,
} from "react";
import { Theme as AstryxTheme } from "@astryxdesign/core/theme";
import { LinkProvider } from "@astryxdesign/core/Link";
import ErrorBoundary from "./components/ErrorBoundary";
import { TenantPublicRoute } from "@/components/TenantPublicRoute";
import { getPostHog } from "@/lib/posthog";
import { getSafePublicPageViewPath } from "@/lib/publicUrlPrivacy";
import {
  ThemeProvider,
  useTheme as useAppTheme,
} from "./contexts/ThemeContext";
import {
  AstryxPaletteProvider,
  useAstryxPalette,
} from "./contexts/AstryxPaletteContext";
// All non-neutral Astryx palette CSS is imported once, at root, so runtime
// palette switching only needs to swap the `theme` prop passed to
// <AstryxTheme> — every palette's @scope'd CSS is already on the page and
// keyed off the theme's `data-astryx-theme` attribute. `neutral`'s CSS is
// imported in main.tsx alongside the core Astryx stylesheet.
import "@/themes/butter/butter.css";
import "@/themes/chocolate/chocolate.css";
import "@/themes/gothic/gothic.css";
import "@/themes/matcha/matcha.css";
import "@/themes/stone/stone.css";
import "@/themes/y2k/y2k.css";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { TenantProvider, useTenant } from "./contexts/TenantContext";
import { I18nextProvider } from "react-i18next";
import { i18n } from "@/i18n";
import { useNamespacePreloader } from "@/i18n/useNamespacePreloader";
import {
  RouteLoadingError,
  RouteLoadingSkeleton,
  RouteServiceRecovery,
} from "@/components/RouteLoadingSkeleton";
import { useLanguageSync } from "@/hooks/useLanguageSync";
import { useDocumentLanguage } from "@/hooks/useDocumentLanguage";
import { removePrerenderedSeoHeadMetadata } from "@/components/Seo";
import { cleanupLegacyAuth } from "@/lib/cleanupLegacyAuth";
import { trpc } from "@/lib/trpc";
import { useTenantFeatureFlagStatus } from "@/hooks/useTenantFeatureFlag";
import { useTenantServiceRecovery } from "@/hooks/useTenantServiceRecovery";
import { WelcomeLanguagePicker } from "@/components/WelcomeLanguagePicker";
import { RuntimePerformanceOverlay } from "@/components/diagnostics/RuntimePerformanceOverlay";
import {
  applyAstryxCompatibilityTokens,
  resolveAstryxCompatibilityTokens,
} from "@/lib/astryxThemeCompatibility";
import { getCanonicalWorkerJobsPath } from "@/lib/workerJobsRoute";
import { isRetiredRoute } from "@/lib/retiredRouteGuard";
import { SPEC260_PAGE_ROUTES } from "@smartspec/shared/src/emergencyRouteManifest";
import { isSmartAIHubPublicSite } from "@/lib/publicSiteTenant";
import {
  applyPublicThemeBoundary,
  isPlatformLightOnlyPublicRoute,
  resolvePublicThemeMode,
} from "@/lib/publicTheme";

function AstryxWouterLink({
  href,
  onClick,
  target,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const [, setLocation] = useLocation();

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      target ||
      href.startsWith("http") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:")
    ) {
      return;
    }

    event.preventDefault();
    setLocation(href);
  };

  return <a href={href} target={target} onClick={handleClick} {...props} />;
}

// Route-based code splitting — all page components are loaded lazily
const NotFound = lazy(() => import("@/pages/NotFound"));
const AutomationPage = lazy(() => import("@/pages/AutomationPage"));
const WorkflowStudioPage = lazy(() => import("@/pages/WorkflowStudioPage"));
const TerminalPage = lazy(() => import("@/pages/TerminalPage"));
const CLIPage = lazy(() => import("@/pages/CLIPage"));
const Factory = lazy(() => import("@/pages/Factory"));
const VideoEditorPage = lazy(() => import("@/pages/VideoEditorPage"));
const PresentationEditor = lazy(() => import("@/pages/PresentationEditor"));
const PresentationLibrary = lazy(() => import("@/pages/PresentationLibrary"));
const PresentationPlayMode = lazy(() => import("@/pages/PresentationPlayMode"));
const PublicDocumentShare = lazy(() => import("@/pages/PublicDocumentShare"));
const Home = lazy(() => import("./pages/Home"));
const Pricing = lazy(() => import("./pages/Pricing"));
const Features = lazy(() => import("./pages/Features"));
const Docs = lazy(() => import("./pages/Docs"));
const WorkerAppMacBuildGuide = lazy(
  () => import("./pages/WorkerAppMacBuildGuide")
);
const Contact = lazy(() => import("./pages/Contact"));
const Blog = lazy(() => import("./pages/Blog"));
const Login = lazy(() => import("./pages/Login"));
const Signup = lazy(() => import("./pages/Signup"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const DecisionIntelligencePage = lazy(() => import("@/pages/DecisionIntelligencePage"));
const EmergencyRoutePage = lazy(() => import("./pages/EmergencyRoutePage"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const Profile = lazy(() => import("./pages/Profile"));
const Terms = lazy(() => import("./pages/Terms"));
const Privacy = lazy(() => import("./pages/Privacy"));
const VerifyEmail = lazy(() => import("./pages/VerifyEmail"));
const VerifyEmailChange = lazy(() => import("./pages/VerifyEmailChange"));
const Gallery = lazy(() => import("./pages/Gallery"));
const Marketplace = lazy(() => import("./pages/Marketplace"));
const MarketplaceCaptureConnect = lazy(
  () => import("./pages/MarketplaceCaptureConnect")
);
const MarketplaceIntelligence = lazy(
  () => import("./pages/MarketplaceIntelligence")
);
const MarketplaceConnectorConnect = lazy(
  () => import("./pages/MarketplaceConnectorConnect")
);
const MarketplaceConnectorLab = lazy(
  () => import("./pages/MarketplaceConnectorLab")
);
const WorkerAppConnect = lazy(() => import("./pages/WorkerAppConnect"));
const RunnerConnect = lazy(() => import("./pages/RunnerConnect"));
const P213CertificationFixture = lazy(() => import("./pages/P213CertificationFixture"));
const McpAgentPairingApprove = lazy(
  () => import("./pages/McpAgentPairingApprove")
);
const MarketplaceCapturePreview = lazy(
  () => import("./pages/MarketplaceCapturePreview")
);
const MarketplaceCaptureProducts = lazy(
  () => import("./pages/MarketplaceCaptureProducts")
);
const MarketplaceCaptureProductDetail = lazy(
  () => import("./pages/MarketplaceCaptureProductDetail")
);
const MarketplaceAutoReviewWorkflowPage = lazy(
  () => import("./pages/MarketplaceAutoReviewWorkflowPage")
);
const MarketplaceCaptureCandidateBatch = lazy(
  () => import("./pages/MarketplaceCaptureCandidateBatch")
);
const MarketplaceCaptureInsight = lazy(
  () => import("./pages/MarketplaceCaptureInsight")
);
const AdminMarketplaceCapture = lazy(
  () => import("./pages/AdminMarketplaceCapture")
);
const DeviceAuth = lazy(() => import("./pages/DeviceAuth"));
const AdminApprovals = lazy(() => import("./pages/AdminApprovals"));
const AdminGallery = lazy(() => import("./pages/AdminGallery"));
const AdminUsers = lazy(() => import("./pages/AdminUsers"));
const AdminPackages = lazy(() => import("./pages/AdminPackages"));
const AdminLLMProviders = lazy(() => import("./pages/AdminLLMProviders"));
const AdminLLMModels = lazy(() => import("./pages/AdminLLMModels"));
const AdminMediaProviders = lazy(() => import("./pages/AdminMediaProviders"));
const AdminMediaModels = lazy(() => import("./pages/AdminMediaModels"));
const AdminVoiceAgents = lazy(() => import("./pages/AdminVoiceAgents"));
const AdminSkills = lazy(() => import("./pages/AdminSkills"));
const SkillRevenueReport = lazy(() => import("./pages/SkillRevenueReport"));
const AdminLegacyUpgradeRunDetail = lazy(
  () => import("./pages/AdminLegacyUpgradeRunDetail")
);
const AdminSkillRepositories = lazy(
  () => import("./pages/AdminSkillRepositories")
);
const AdminTenants = lazy(() => import("./pages/AdminTenants"));
const AdminServices = lazy(() => import("./pages/AdminServices"));
const AdminSettings = lazy(() => import("./pages/AdminSettings"));
const AdminIntelligenceRegistry = lazy(() => import("./pages/Admin/AdminIntelligenceRegistry"));
const AdminPlatformOperations = lazy(
  () => import("./pages/AdminPlatformOperations")
);
const AdminFinanceRules = lazy(() => import("./pages/AdminFinanceRules"));
const AdminBillingCenter = lazy(() => import("./pages/AdminBillingCenter"));
const AdminDatabaseBackups = lazy(() => import("./pages/AdminDatabaseBackups"));
const AdminQueueDashboard = lazy(() => import("./pages/AdminQueueDashboard"));
const AdminQueueLLM = lazy(() => import("./pages/AdminQueueLLM"));
const AdminQueueMedia = lazy(() => import("./pages/AdminQueueMedia"));
const AdminScheduledJobs = lazy(() => import("./pages/AdminScheduledJobs"));
const AdminAlertRules = lazy(() => import("./pages/AdminAlertRules"));
const AdminAuditLogs = lazy(() => import("./pages/AdminAuditLogs"));
const AdminOrchestrationLogs = lazy(
  () => import("./pages/AdminOrchestrationLogs")
);
const AdminNotifications = lazy(() => import("./pages/AdminNotifications"));
const AdminAPIKeys = lazy(() => import("./pages/AdminAPIKeys"));
const AdminOpsDashboard = lazy(() => import("./pages/Admin/AdminOpsDashboard"));
const AdminCommandCenter = lazy(
  () => import("./pages/Admin/AdminCommandCenter")
);
const AdminFunnelDashboard = lazy(() => import("./pages/AdminFunnelDashboard"));
const McpServerManager = lazy(() => import("./pages/McpServerManager"));
const DomainAdmin = lazy(() => import("./pages/DomainAdmin"));
const DomainThemeEditor = lazy(() => import("./pages/DomainThemeEditor"));
const DomainAdminContent = lazy(() => import("./pages/DomainAdminContent"));
const DomainUsers = lazy(() => import("./pages/DomainUsers"));
const TenantSettings = lazy(() => import("./pages/TenantSettings"));
const TenantDataTransfer = lazy(() => import("./pages/TenantDataTransfer"));
const Chat = lazy(() => import("./pages/Chat"));
const Finance = lazy(() => import("./pages/Finance"));
const FinanceReports = lazy(() => import("./pages/FinanceReports"));
const SocialChannels = lazy(() => import("./pages/SocialChannels"));
const SocialInbox = lazy(() => import("./pages/SocialInbox"));
const SocialPublishing = lazy(() => import("./pages/SocialPublishing"));
const SocialModeration = lazy(() => import("./pages/SocialModeration"));
const SocialAutomation = lazy(() => import("./pages/SocialAutomation"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Generate = lazy(() => import("./pages/Generate"));
const MediaStudio = lazy(() => import("./pages/MediaStudio"));
const ContentProtection = lazy(() => import("./pages/content-protection/ContentProtectionPage"));
const EvidenceReviewPage = lazy(() => import("./pages/content-protection/EvidenceReviewPage"));
const ContentComposer = lazy(() => import("./pages/ContentComposer"));
const StoryboardReviewPage = lazy(() => import("./pages/StoryboardReviewPage"));
const StoryboardSkillFrameworkPage = lazy(
  () => import("./pages/StoryboardSkillFrameworkPage")
);
const VerticalDramaSeriesPage = lazy(
  () => import("./pages/VerticalDramaSeriesPage")
);
const VerticalDramaSeriesDetailPage = lazy(
  () => import("./pages/VerticalDramaSeriesDetailPage")
);
const VerticalDramaEpisodePage = lazy(
  () => import("./pages/VerticalDramaEpisodePage")
);
const VerticalDramaSharedSeriesPage = lazy(
  () => import("./pages/VerticalDramaSharedSeriesPage")
);
const VideoStudioListPage = lazy(() => import("./pages/VideoStudioListPage"));
const VideoStudioWorkspacePage = lazy(
  () => import("./pages/VideoStudioWorkspacePage")
);
const RenderJobsPage = lazy(() => import("./pages/RenderJobsPage"));
const Credits = lazy(() => import("./pages/Credits"));
const BillingCenter = lazy(() => import("./pages/BillingCenter"));
const MediaHistory = lazy(() => import("./pages/MediaHistory"));
const DocumentManagement = lazy(() => import("./pages/DocumentManagement"));
const GroupManagement = lazy(() => import("./pages/GroupManagement"));
const GroupDiscovery = lazy(() => import("./pages/GroupDiscovery"));
const GroupDetailPanel = lazy(
  () => import("./components/groups/GroupDetailPanel")
);
const Settings = lazy(() => import("./pages/Settings"));
const AdminDesktopHost = lazy(() => import("./pages/AdminDesktopHost"));
const DesktopHostGovernance = lazy(
  () => import("./pages/DesktopHostGovernance")
);
const DesktopOpen = lazy(() => import("./pages/DesktopOpen"));
const DesktopView = lazy(() => import("./pages/DesktopView"));
const SkillBrowser = lazy(() => import("./pages/SkillBrowser"));
const GoogleDriveCallback = lazy(() => import("./pages/GoogleDriveCallback"));
const McpConnectCallback = lazy(() => import("./pages/McpConnectCallback"));
const OneDriveCallback = lazy(() => import("./pages/OneDriveCallback"));
const UploadPostCallback = lazy(() => import("./pages/UploadPostCallback"));
const DocPage = lazy(() => import("./pages/DocPage"));
const About = lazy(() => import("./pages/About"));
const Changelog = lazy(() => import("./pages/Changelog"));
const Careers = lazy(() => import("./pages/Careers"));
const Community = lazy(() => import("./pages/Community"));
const Support = lazy(() => import("./pages/Support"));
const Resources = lazy(() => import("./pages/Resources"));
const Status = lazy(() => import("./pages/Status"));
const Security = lazy(() => import("./pages/Security"));
const BlogPost = lazy(() => import("./pages/BlogPost"));
const DomainBlogAdmin = lazy(() => import("./pages/DomainBlogAdmin"));
const DomainDocsAdmin = lazy(() => import("./pages/DomainDocsAdmin"));
const UsageAnalytics = lazy(() => import("./pages/UsageAnalytics"));
const TaskQueueMonitor = lazy(() => import("./pages/TaskQueueMonitor"));
const Teams = lazy(() => import("./pages/Teams"));
const PersonaSettings = lazy(() => import("./pages/PersonaSettings"));
const AdminPersonas = lazy(() => import("./pages/AdminPersonas"));
const WebhookTriggers = lazy(() => import("./pages/WebhookTriggers"));
const AdminSystemGuardian = lazy(() => import("./pages/AdminSystemGuardian"));
const AdminMonitoring = lazy(() => import("./pages/AdminMonitoring"));
const AdminCapacityAdvisor = lazy(() => import("./pages/AdminCapacityAdvisor"));
const AdminOcrUsage = lazy(() => import("./pages/AdminOcrUsage"));
const AdminFeedbackHub = lazy(() => import("./pages/AdminFeedbackHub"));
const MyFeedback = lazy(() => import("./pages/MyFeedback"));
const ContentQualityDashboard = lazy(
  () => import("./pages/ContentQualityDashboard")
);
const HelpPage = lazy(() => import("./pages/Help"));
import { SystemHealthBanner } from "./components/guardian/SystemHealthBanner";
import { FeedbackButton } from "./components/guardian/FeedbackButton";
const HelpTopicPage = lazy(() => import("./pages/HelpTopic"));

/**
 * Route-level guard for /admin/* routes.
 * Redirects unauthenticated users to /login and non-admins to /dashboard.
 * Renders a visible skeleton while auth is loading and a retry state when the
 * bootstrap request fails.
 */
function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, isLoading, authError, retryAuth } = useAuth();
  if (isLoading) return <RouteLoadingSkeleton />;
  if (authError) {
    return (
      <RouteLoadingError
        description="Authentication is temporarily unavailable. Please try again."
        onRetry={retryAuth}
      />
    );
  }
  if (!user) return <Redirect to="/login" />;
  if (user.role !== "admin") return <Redirect to="/dashboard" />;
  return <>{children}</>;
}

/**
 * Route-level guard for /domain-admin/* routes.
 * Redirects unauthenticated users to /login and users without admin or
 * domain_admin role to /dashboard.
 */
/**
 * Route-level guard for authenticated-only routes.
 * Redirects unauthenticated users to /login.
 * Renders a visible skeleton while auth is loading and a retry state when the
 * bootstrap request fails.
 */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading, authError, retryAuth } = useAuth();
  const [location] = useLocation();
  const safetyProfileStatus =
    trpc.users.getSafetyProfileCompletionStatus.useQuery(undefined, {
      enabled: Boolean(user),
      staleTime: 60_000,
      retry: false,
    });
  if (isLoading) return <RouteLoadingSkeleton />;
  if (authError) {
    return (
      <RouteLoadingError
        description="Authentication is temporarily unavailable. Please try again."
        onRetry={retryAuth}
      />
    );
  }
  if (!user) return <Redirect to="/login" />;
  const path = location.split("?")[0];
  const exemptFromSafetyProfileGate =
    path === "/settings" ||
    path === "/support" ||
    path === "/privacy" ||
    path === "/terms" ||
    path === "/login" ||
    path === "/forgot-password";
  if (
    safetyProfileStatus.data?.gateRequired &&
    safetyProfileStatus.data.complete === false &&
    !exemptFromSafetyProfileGate
  ) {
    return (
      <Redirect
        to={`/settings?section=security&returnTo=${encodeURIComponent(location)}`}
      />
    );
  }
  return <>{children}</>;
}

/**
 * Route-level guard for the feature-flagged Vertical Drama Series workspace.
 * Requires the `verticalDramaSeries` tenant flag (fail-closed). When disabled it
 * renders an announced (role="alert") text notice rather than silently 404-ing,
 * satisfying the section-03 accessibility acceptance ("feature-denied states are
 * announced with text"). Must be nested inside <RequireAuth>.
 *
 * The tenant flag query must DEFINITIVELY resolve (`isResolved`) before the
 * denial renders — otherwise a still-loading query, or a transient backend
 * outage (e.g. a 502 while smartspec-web.service restarts), would resolve
 * to the fail-closed default and flash this denial even though the tenant
 * genuinely has the flag enabled. While unresolved, show the same fallback
 * used for lazy route chunks (<RouteLoadingSkeleton />) instead.
 */
function RequireVerticalDramaSeries({
  children,
}: {
  children: React.ReactNode;
}) {
  const { enabled, isResolved, isError, isTransientError, retry } =
    useTenantFeatureFlagStatus("verticalDramaSeries");
  const autoRefreshPending = useTenantServiceRecovery(isTransientError);
  if (isError) {
    if (isTransientError) {
      return (
        <RouteServiceRecovery
          autoRefreshPending={autoRefreshPending}
          onRetry={() => void retry()}
        />
      );
    }
    return (
      <RouteLoadingError
        description="Tenant settings could not be loaded. Please try again."
        onRetry={() => void retry()}
      />
    );
  }
  if (!isResolved) {
    return <RouteLoadingSkeleton />;
  }
  if (!enabled) {
    return (
      <main className="min-h-screen bg-background text-foreground">
        <div
          role="alert"
          className="mx-auto flex max-w-lg flex-col items-center gap-3 px-6 py-24 text-center"
        >
          <h1 className="text-lg font-semibold">
            This feature is not available
          </h1>
          <p className="text-sm text-muted-foreground">
            Vertical Drama Series is not enabled for your account.
            <br />
            ซีรีย์แนวตั้งยังไม่เปิดใช้งานสำหรับบัญชีของคุณ
          </p>
        </div>
      </main>
    );
  }
  return <>{children}</>;
}

/**
 * Route-level guard for the feature-flagged Video Intelligence Platform
 * workspace (Feature 133). Requires the `videoIntelligencePlatformEnabled`
 * tenant flag (F133A, fail-closed). Mirrors `RequireVerticalDramaSeries`'s
 * announced (role="alert") text-notice convention rather than silently
 * 404-ing. Must be nested inside <RequireAuth>. Per-studio flags
 * (F133C/F133-motion) are enforced separately, inside the pages themselves
 * (they gate individual create actions/menu entries, not the whole route).
 *
 * Also mirrors `RequireVerticalDramaSeries`'s resolve-before-deny guard: the
 * denial only renders once the tenant flag query has DEFINITIVELY resolved
 * (`isResolved`), so a still-loading query or a transient backend outage
 * (e.g. a restart-time 502) shows the shared route-loading fallback instead
 * of flashing a false "not available" denial.
 */
function RequireVideoIntelligence({ children }: { children: React.ReactNode }) {
  const { enabled, isResolved, isError, isTransientError, retry } =
    useTenantFeatureFlagStatus("videoIntelligencePlatformEnabled");
  const autoRefreshPending = useTenantServiceRecovery(isTransientError);
  if (isError) {
    if (isTransientError) {
      return (
        <RouteServiceRecovery
          autoRefreshPending={autoRefreshPending}
          onRetry={() => void retry()}
        />
      );
    }
    return (
      <RouteLoadingError
        description="Tenant settings could not be loaded. Please try again."
        onRetry={() => void retry()}
      />
    );
  }
  if (!isResolved) {
    return <RouteLoadingSkeleton />;
  }
  if (!enabled) {
    return (
      <main className="min-h-screen bg-background text-foreground">
        <div
          role="alert"
          className="mx-auto flex max-w-lg flex-col items-center gap-3 px-6 py-24 text-center"
        >
          <h1 className="text-lg font-semibold">
            This feature is not available
          </h1>
          <p className="text-sm text-muted-foreground">
            Video Studio is not enabled for your account.
            <br />
            สตูดิโอวิดีโอยังไม่เปิดใช้งานสำหรับบัญชีของคุณ
          </p>
        </div>
      </main>
    );
  }
  return <>{children}</>;
}

function RequireDomainAdmin({ children }: { children: React.ReactNode }) {
  const { user, isLoading, authError, retryAuth } = useAuth();
  if (isLoading) return <RouteLoadingSkeleton />;
  if (authError) {
    return (
      <RouteLoadingError
        description="Authentication is temporarily unavailable. Please try again."
        onRetry={retryAuth}
      />
    );
  }
  if (!user) return <Redirect to="/login" />;
  if (user.role !== "admin" && user.role !== "domain_admin")
    return <Redirect to="/dashboard" />;
  return <>{children}</>;
}

function LegacyWorkerJobsRedirect() {
  const search = typeof window === "undefined" ? "" : window.location.search;
  const target = getCanonicalWorkerJobsPath(search, { legacyAlias: true });
  useEffect(() => {
    getPostHog()?.capture("worker_jobs_legacy_alias_hit", {
      legacy_route: "/render-jobs",
      has_query: Boolean(search),
      alias: "render-jobs",
    });
  }, [search]);
  return <Redirect to={target} />;
}

/**
 * Share-link tokens are bearer secrets that live in the URL path
 * (`/share/vd/:token` and the library's `/share/:token`) — sending the raw
 * href to PostHog would hand the secret to a third party (security review
 * 2026-07-09, finding #2). Redact the token segment before capture; the
 * redacted form still distinguishes the two share surfaces for analytics.
 */
function PostHogPageViewTracker() {
  const [location] = useLocation();
  const prevPath = useRef<string | null>(null);

  useEffect(() => {
    if (location !== prevPath.current) {
      prevPath.current = location;
      const safePath = getSafePublicPageViewPath(window.location.href);
      if (safePath) {
        getPostHog()?.capture("$pageview", { $current_url: safePath });
      }
    }
  }, [location]);

  return null;
}

function LanguageSyncBridge() {
  useLanguageSync();
  useDocumentLanguage();
  useEffect(() => {
    removePrerenderedSeoHeadMetadata();
  }, []);
  return null;
}

/**
 * Reads the user's selected Astryx palette from AstryxPaletteContext and
 * applies it as the active <AstryxTheme>. Must render inside
 * <AstryxPaletteProvider> and wrap everything that should reflect the
 * chosen palette.
 */
function AstryxPaletteApplier({ children }: { children: React.ReactNode }) {
  const { activePalette } = useAstryxPalette();
  const { theme: appTheme } = useAppTheme();
  const { tenant, isLoading: tenantLoading } = useTenant();
  const [location] = useLocation();
  const platformSite = !tenantLoading && isSmartAIHubPublicSite(tenant);
  const publicThemeMode = resolvePublicThemeMode(
    appTheme,
    isPlatformLightOnlyPublicRoute(tenant, location),
  );
  const colorTokens = useMemo(
    () =>
      resolveAstryxCompatibilityTokens(
        activePalette.theme,
        publicThemeMode,
        platformSite,
      ),
    [activePalette.theme, platformSite, publicThemeMode]
  );

  useLayoutEffect(() => {
    if (typeof document === "undefined") return;

    const themeRoot = document.documentElement.querySelector<HTMLElement>(
      "[data-astryx-theme]"
    );
    const targets = [document.documentElement, themeRoot].filter(
      (target, index, all): target is HTMLElement =>
        target !== null && all.indexOf(target) === index
    );
    return applyAstryxCompatibilityTokens(targets, colorTokens);
  }, [colorTokens]);

  return (
    <AstryxTheme theme={activePalette.theme} mode={publicThemeMode}>
      {children}
    </AstryxTheme>
  );
}

function Router() {
  useNamespacePreloader();
  const [location] = useLocation();

  if (isRetiredRoute(location)) {
    return <Redirect to="/404" />;
  }

  // make sure to consider if you need authentication for certain routes
  return (
    <>
      <PostHogPageViewTracker />
      <Suspense fallback={<RouteLoadingSkeleton />}>
        <Switch>
          {SPEC260_PAGE_ROUTES.map(route => (
            <Route key={route.id} path={route.path}>
              {route.access === "public" ? (
                <EmergencyRoutePage />
              ) : (
                <RequireAuth>
                  <EmergencyRoutePage />
                </RequireAuth>
              )}
            </Route>
          ))}
          <Route path="/" component={Home} />
          <Route path="/__p213/certification/approval-required" component={P213CertificationFixture} />
          <Route path="/pricing">
            <TenantPublicRoute pageKey="pricing"><Pricing /></TenantPublicRoute>
          </Route>
          <Route path="/features">
            <TenantPublicRoute pageKey="features"><Features /></TenantPublicRoute>
          </Route>
          <Route path="/docs">
            <TenantPublicRoute pageKey="docs"><Docs /></TenantPublicRoute>
          </Route>
          <Route path="/docs/worker-app-macos-build">
            <TenantPublicRoute pageKey="docs-worker-app-macos-build">
              <WorkerAppMacBuildGuide />
            </TenantPublicRoute>
          </Route>
          <Route path="/docs/:slug+">
            <TenantPublicRoute
              pageKey={(path) =>
                `docs-${path.split("?")[0].slice("/docs/".length).replace(/\//g, "-")}`
              }
            >
              <DocPage />
            </TenantPublicRoute>
          </Route>
          <Route path="/help">
            <TenantPublicRoute pageKey="help"><HelpPage /></TenantPublicRoute>
          </Route>
          <Route path="/help/:slug+">
            <TenantPublicRoute
              pageKey={(path) =>
                `help-${path.split("?")[0].slice("/help/".length).replace(/\//g, "-")}`
              }
            >
              <HelpTopicPage />
            </TenantPublicRoute>
          </Route>
          <Route path="/desktop/open" component={DesktopOpen} />
          <Route path="/desktop/view" component={DesktopView} />
          <Route path="/contact">
            <TenantPublicRoute pageKey="contact"><Contact /></TenantPublicRoute>
          </Route>
          <Route path="/about">
            <TenantPublicRoute pageKey="about"><About /></TenantPublicRoute>
          </Route>
          <Route path="/changelog">
            <TenantPublicRoute pageKey="changelog"><Changelog /></TenantPublicRoute>
          </Route>
          <Route path="/careers">
            <TenantPublicRoute pageKey="careers"><Careers /></TenantPublicRoute>
          </Route>
          <Route path="/community">
            <TenantPublicRoute pageKey="community"><Community /></TenantPublicRoute>
          </Route>
          <Route path="/support">
            <TenantPublicRoute pageKey="support"><Support /></TenantPublicRoute>
          </Route>
          <Route path="/resources">
            <TenantPublicRoute pageKey="resources"><Resources /></TenantPublicRoute>
          </Route>
          <Route path="/status">
            <TenantPublicRoute pageKey="status"><Status /></TenantPublicRoute>
          </Route>
          <Route path="/security">
            <TenantPublicRoute pageKey="security"><Security /></TenantPublicRoute>
          </Route>
          <Route path="/blog">
            <TenantPublicRoute pageKey="blog"><Blog /></TenantPublicRoute>
          </Route>
          <Route path="/blog/:slug">
            <TenantPublicRoute
              pageKey={(path) => `blog-${path.split("?")[0].slice("/blog/".length)}`}
            >
              <BlogPost />
            </TenantPublicRoute>
          </Route>
          <Route path="/marketplace">
            <TenantPublicRoute pageKey="marketplace"><Marketplace /></TenantPublicRoute>
          </Route>
          <Route path="/marketplace/:slug">
            <TenantPublicRoute
              pageKey={(path) => `marketplace-${path.split("?")[0].slice("/marketplace/".length)}`}
            >
              <Marketplace />
            </TenantPublicRoute>
          </Route>
          <Route path="/decision-intelligence">
            <RequireAuth>
              <DecisionIntelligencePage />
            </RequireAuth>
          </Route>
          <Route path="/marketplace-capture/intelligence/connect/authorize">
            <RequireAuth>
              <MarketplaceConnectorConnect />
            </RequireAuth>
          </Route>
          <Route path="/marketplace-capture/intelligence/connect/shopee">
            <RequireAuth>
              <MarketplaceConnectorConnect />
            </RequireAuth>
          </Route>
          <Route path="/marketplace-capture/intelligence/connector-lab">
            <RequireAuth>
              <MarketplaceConnectorLab />
            </RequireAuth>
          </Route>
          <Route path="/marketplace-capture/intelligence/:section+">
            <RequireAuth>
              <MarketplaceIntelligence />
            </RequireAuth>
          </Route>
          <Route path="/marketplace-capture/intelligence">
            <RequireAuth>
              <MarketplaceIntelligence />
            </RequireAuth>
          </Route>
          <Route path="/marketplace-capture/connect">
            <RequireAuth>
              <MarketplaceCaptureConnect />
            </RequireAuth>
          </Route>
          <Route path="/marketplace-capture/insights/:insightId">
            <RequireAuth>
              <MarketplaceCaptureInsight />
            </RequireAuth>
          </Route>
          <Route path="/marketplace-capture/captures/:captureId/preview">
            <RequireAuth>
              <MarketplaceCapturePreview />
            </RequireAuth>
          </Route>
          <Route path="/marketplace-capture/candidates/:batchId">
            <RequireAuth>
              <MarketplaceCaptureCandidateBatch />
            </RequireAuth>
          </Route>
          <Route path="/marketplace/auto-review/new/:productId">
            <RequireAuth>
              <MarketplaceCaptureProductDetail />
            </RequireAuth>
          </Route>
          <Route path="/marketplace/auto-review/:runId">
            <RequireAuth>
              <MarketplaceAutoReviewWorkflowPage />
            </RequireAuth>
          </Route>
          <Route path="/marketplace-capture/products/:productId">
            <RequireAuth>
              <MarketplaceCaptureProductDetail />
            </RequireAuth>
          </Route>
          <Route path="/marketplace-capture">
            <RequireAuth>
              <MarketplaceCaptureProducts />
            </RequireAuth>
          </Route>
          <Route path="/gallery">
            <TenantPublicRoute pageKey="gallery"><Gallery /></TenantPublicRoute>
          </Route>
          <Route path="/admin/gallery">
            <RequireAdmin>
              <AdminGallery />
            </RequireAdmin>
          </Route>
          <Route path="/admin/users">
            <RequireAdmin>
              <AdminUsers />
            </RequireAdmin>
          </Route>
          <Route path="/admin/packages">
            <RequireAdmin>
              <AdminPackages />
            </RequireAdmin>
          </Route>
          <Route path="/admin/llm-providers">
            <RequireAdmin>
              <AdminLLMProviders />
            </RequireAdmin>
          </Route>
          <Route path="/admin/llm-models">
            <RequireAdmin>
              <AdminLLMModels />
            </RequireAdmin>
          </Route>
          <Route path="/admin/media-providers">
            <RequireAdmin>
              <AdminMediaProviders />
            </RequireAdmin>
          </Route>
          <Route path="/admin/media-models">
            <RequireAdmin>
              <AdminMediaModels />
            </RequireAdmin>
          </Route>
          <Route path="/admin/voice-agents">
            <RequireAdmin>
              <AdminVoiceAgents />
            </RequireAdmin>
          </Route>
          <Route path="/admin/skills/runs/:runId">
            <RequireAdmin>
              <AdminLegacyUpgradeRunDetail />
            </RequireAdmin>
          </Route>
          <Route path="/admin/skills">
            <RequireAdmin>
              <AdminSkills />
            </RequireAdmin>
          </Route>
          <Route path="/admin/skill-revenue">
            <RequireDomainAdmin>
              <SkillRevenueReport />
            </RequireDomainAdmin>
          </Route>
          <Route path="/domain-admin/skill-revenue">
            <RequireDomainAdmin>
              <SkillRevenueReport />
            </RequireDomainAdmin>
          </Route>
          <Route path="/admin/personas">
            <RequireAdmin>
              <AdminPersonas />
            </RequireAdmin>
          </Route>
          <Route path="/admin/approvals">
            <RequireAdmin>
              <AdminApprovals />
            </RequireAdmin>
          </Route>
          <Route path="/admin/skill-repositories">
            <RequireAdmin>
              <AdminSkillRepositories />
            </RequireAdmin>
          </Route>
          <Route path="/admin/storage-settings">
            <Redirect to="/admin/settings" />
          </Route>
          <Route path="/admin/services">
            <RequireAdmin>
              <AdminServices />
            </RequireAdmin>
          </Route>
          <Route path="/admin/settings">
            <RequireAdmin>
              <AdminSettings />
            </RequireAdmin>
          </Route>
          <Route path="/admin/intelligence-registry">
            <RequireAdmin>
              <AdminIntelligenceRegistry />
            </RequireAdmin>
          </Route>
          <Route path="/admin/platform-operations">
            <RequireAdmin>
              <AdminPlatformOperations />
            </RequireAdmin>
          </Route>
          <Route path="/admin/finance-rules">
            <RequireAdmin>
              <AdminFinanceRules />
            </RequireAdmin>
          </Route>
          <Route path="/admin/desktop-host">
            <RequireAdmin>
              <AdminDesktopHost />
            </RequireAdmin>
          </Route>
          <Route path="/admin/desktop-host/governance">
            <RequireAdmin>
              <DesktopHostGovernance />
            </RequireAdmin>
          </Route>
          <Route path="/desktop-host">
            <RequireDomainAdmin>
              <AdminDesktopHost />
            </RequireDomainAdmin>
          </Route>
          <Route path="/admin/billing">
            <RequireAdmin>
              <AdminBillingCenter />
            </RequireAdmin>
          </Route>
          <Route path="/admin/database-backups">
            <RequireAdmin>
              <AdminDatabaseBackups />
            </RequireAdmin>
          </Route>
          <Route path="/admin/queues">
            <RequireAdmin>
              <AdminQueueDashboard />
            </RequireAdmin>
          </Route>
          <Route path="/admin/queues/llm">
            <RequireAdmin>
              <AdminQueueLLM />
            </RequireAdmin>
          </Route>
          <Route path="/admin/queues/media">
            <RequireAdmin>
              <AdminQueueMedia />
            </RequireAdmin>
          </Route>
          <Route path="/admin/scheduled-jobs">
            <RequireAdmin>
              <AdminScheduledJobs />
            </RequireAdmin>
          </Route>
          <Route path="/admin/alert-rules">
            <RequireAdmin>
              <AdminAlertRules />
            </RequireAdmin>
          </Route>
          <Route path="/admin/audit-logs">
            <RequireAdmin>
              <AdminAuditLogs />
            </RequireAdmin>
          </Route>
          <Route path="/admin/orchestration-logs">
            <RequireAdmin>
              <AdminOrchestrationLogs />
            </RequireAdmin>
          </Route>
          <Route path="/admin/notifications">
            <RequireAdmin>
              <AdminNotifications />
            </RequireAdmin>
          </Route>
          <Route path="/admin/api-keys">
            <RequireAdmin>
              <AdminAPIKeys />
            </RequireAdmin>
          </Route>
          <Route path="/admin/ops">
            <RequireAdmin>
              <AdminOpsDashboard />
            </RequireAdmin>
          </Route>
          <Route path="/admin/marketplace-capture">
            <RequireAdmin>
              <AdminMarketplaceCapture />
            </RequireAdmin>
          </Route>
          <Route path="/admin/dashboard">
            <RequireAdmin>
              <AdminCommandCenter />
            </RequireAdmin>
          </Route>
          <Route path="/admin/funnel">
            <RequireAdmin>
              <AdminFunnelDashboard />
            </RequireAdmin>
          </Route>
          <Route path="/admin/mcp-servers">
            <RequireAdmin>
              <McpServerManager />
            </RequireAdmin>
          </Route>
          <Route path="/admin/content-quality">
            <RequireAdmin>
              <ContentQualityDashboard />
            </RequireAdmin>
          </Route>
          <Route path="/admin/system-guardian">
            <RequireAdmin>
              <AdminSystemGuardian />
            </RequireAdmin>
          </Route>
          <Route path="/admin/monitoring">
            <RequireAdmin>
              <AdminMonitoring />
            </RequireAdmin>
          </Route>
          <Route path="/admin/capacity-advisor">
            <RequireAdmin>
              <AdminCapacityAdvisor />
            </RequireAdmin>
          </Route>
          <Route path="/admin/ocr-usage">
            <RequireAdmin>
              <AdminOcrUsage />
            </RequireAdmin>
          </Route>
          <Route path="/admin/feedback-hub">
            <RequireAdmin>
              <AdminFeedbackHub />
            </RequireAdmin>
          </Route>
          <Route path="/admin/tenants">
            <RequireAdmin>
              <AdminTenants />
            </RequireAdmin>
          </Route>
          <Route path="/domain-admin">
            <RequireDomainAdmin>
              <DomainAdmin />
            </RequireDomainAdmin>
          </Route>
          <Route path="/domain-admin/theme">
            <RequireDomainAdmin>
              <DomainThemeEditor />
            </RequireDomainAdmin>
          </Route>
          <Route path="/domain-admin/content">
            <RequireDomainAdmin>
              <DomainAdminContent />
            </RequireDomainAdmin>
          </Route>
          <Route path="/domain-admin/users">
            <RequireDomainAdmin>
              <DomainUsers />
            </RequireDomainAdmin>
          </Route>
          <Route path="/domain-admin/settings">
            <RequireDomainAdmin>
              <TenantSettings />
            </RequireDomainAdmin>
          </Route>
          <Route path="/domain-admin/data-transfer">
            <RequireDomainAdmin>
              <TenantDataTransfer />
            </RequireDomainAdmin>
          </Route>
          <Route path="/domain-admin/desktop-host">
            <RequireDomainAdmin>
              <AdminDesktopHost />
            </RequireDomainAdmin>
          </Route>
          <Route path="/domain-admin/desktop-host/governance">
            <RequireDomainAdmin>
              <DesktopHostGovernance />
            </RequireDomainAdmin>
          </Route>
          <Route path="/domain-admin/blog">
            <RequireDomainAdmin>
              <DomainBlogAdmin />
            </RequireDomainAdmin>
          </Route>
          <Route path="/domain-admin/docs">
            <RequireDomainAdmin>
              <DomainDocsAdmin />
            </RequireDomainAdmin>
          </Route>
          <Route path="/login" component={Login} />
          <Route path="/signup" component={Signup} />
          <Route path="/forgot-password" component={ForgotPassword} />
          <Route path="/chat">
            <RequireAuth>
              <Chat />
            </RequireAuth>
          </Route>
          <Route path="/finance/reports">
            <RequireAuth>
              <FinanceReports />
            </RequireAuth>
          </Route>
          <Route path="/finance">
            <RequireAuth>
              <Finance />
            </RequireAuth>
          </Route>
          <Route path="/social/channels">
            <RequireAuth>
              <SocialChannels />
            </RequireAuth>
          </Route>
          <Route path="/social/inbox">
            <RequireAuth>
              <SocialInbox />
            </RequireAuth>
          </Route>
          <Route path="/social/publishing">
            <RequireAuth>
              <SocialPublishing />
            </RequireAuth>
          </Route>
          <Route path="/social/moderation">
            <RequireAuth>
              <SocialModeration />
            </RequireAuth>
          </Route>
          <Route path="/social/automation">
            <RequireAuth>
              <SocialAutomation />
            </RequireAuth>
          </Route>
          <Route path="/automation">
            <RequireAuth>
              <AutomationPage />
            </RequireAuth>
          </Route>
          <Route path="/studio/workflow/run">
            <RequireAuth>
              <WorkflowStudioPage />
            </RequireAuth>
          </Route>
          <Route path="/studio/workflow">
            <RequireAuth>
              <WorkflowStudioPage />
            </RequireAuth>
          </Route>
          <Route path="/automation/live/:sessionId">
            <RequireAuth>
              <AutomationPage />
            </RequireAuth>
          </Route>
          <Route path="/teams">
            <RequireAuth>
              <Teams />
            </RequireAuth>
          </Route>
          <Route path="/teams/:teamId">
            <RequireAuth>
              <Teams />
            </RequireAuth>
          </Route>
          <Route path="/webhook-triggers">
            <RequireAuth>
              <WebhookTriggers />
            </RequireAuth>
          </Route>
          <Route path="/drama-series/:seriesId/episodes/:episodeId/runs/:runId">
            <RequireAuth>
              <RequireVerticalDramaSeries>
                <VerticalDramaEpisodePage />
              </RequireVerticalDramaSeries>
            </RequireAuth>
          </Route>
          <Route path="/drama-series/:seriesId/episodes/:episodeId">
            <RequireAuth>
              <RequireVerticalDramaSeries>
                <VerticalDramaEpisodePage />
              </RequireVerticalDramaSeries>
            </RequireAuth>
          </Route>
          <Route path="/drama-series/:seriesId">
            <RequireAuth>
              <RequireVerticalDramaSeries>
                <VerticalDramaSeriesDetailPage />
              </RequireVerticalDramaSeries>
            </RequireAuth>
          </Route>
          <Route path="/drama-series">
            <RequireAuth>
              <RequireVerticalDramaSeries>
                <VerticalDramaSeriesPage />
              </RequireVerticalDramaSeries>
            </RequireAuth>
          </Route>
          {/* Task #32 (Collab-lite L1, F131AA) — PUBLIC read-only share link viewer.
            Deliberately OUTSIDE RequireAuth/RequireVerticalDramaSeries: no account,
            no login, no tenant flag check on this route itself (see
            routers/verticalDramaShare.ts's own doc comment for why) — same
            "component={...}, no wrapper" convention as /login, /signup below. */}
          <Route
            path="/share/vd/:token"
            component={VerticalDramaSharedSeriesPage}
          />
          <Route
            path="/evidence-review/:publicCaseId"
            component={EvidenceReviewPage}
          />
          {/* Legacy path redirects — the /dashboard prefix was dropped after initial launch. */}
          <Route path="/dashboard/vertical-drama/:seriesId/episodes/:episodeId/runs/:runId">
            {params => (
              <Redirect
                to={`/drama-series/${params.seriesId}/episodes/${params.episodeId}/runs/${params.runId}`}
              />
            )}
          </Route>
          <Route path="/dashboard/vertical-drama/:seriesId/episodes/:episodeId">
            {params => (
              <Redirect
                to={`/drama-series/${params.seriesId}/episodes/${params.episodeId}`}
              />
            )}
          </Route>
          <Route path="/dashboard/vertical-drama/:seriesId">
            {params => <Redirect to={`/drama-series/${params.seriesId}`} />}
          </Route>
          <Route path="/dashboard/vertical-drama">
            <Redirect to="/drama-series" />
          </Route>
          <Route path="/dashboard">
            <RequireAuth>
              <Dashboard />
            </RequireAuth>
          </Route>
          <Route path="/notifications">
            <RequireAuth>
              <Notifications />
            </RequireAuth>
          </Route>
          <Route path="/generate/:type?">
            <RequireAuth>
              <Generate />
            </RequireAuth>
          </Route>
          <Route path="/media-studio">
            <RequireAuth>
              <MediaStudio />
            </RequireAuth>
          </Route>
          <Route path="/content-protection">
            <RequireAuth>
              <ContentProtection />
            </RequireAuth>
          </Route>
          <Route path="/content-protection/assets/:assetId/rights">
            <RequireAuth>
              <ContentProtection initialSection="rights" />
            </RequireAuth>
          </Route>
          <Route path="/content-protection/assets/:assetId/certificate">
            <RequireAuth>
              <ContentProtection initialSection="certificate" />
            </RequireAuth>
          </Route>
          <Route path="/content-protection/cases/:caseId">
            <RequireAuth>
              <ContentProtection initialSection="cases" />
            </RequireAuth>
          </Route>
          <Route path="/content-protection/:section">
            <RequireAuth>
              <ContentProtection />
            </RequireAuth>
          </Route>
          <Route path="/content-protection/:section/:assetId">
            <RequireAuth>
              <ContentProtection />
            </RequireAuth>
          </Route>
          <Route path="/content-composer">
            <RequireAuth>
              <ContentComposer />
            </RequireAuth>
          </Route>
          <Route path="/storyboard-review/new/skill-framework">
            <RequireAuth>
              <StoryboardSkillFrameworkPage />
            </RequireAuth>
          </Route>
          <Route path="/storyboard-review/:reviewId">
            <RequireAuth>
              <StoryboardReviewPage />
            </RequireAuth>
          </Route>
          <Route path="/storyboard-review">
            <RequireAuth>
              <StoryboardReviewPage />
            </RequireAuth>
          </Route>
          <Route path="/worker-jobs">
            <RequireAuth>
              <RenderJobsPage />
            </RequireAuth>
          </Route>
          <Route path="/render-jobs">
            <RequireAuth>
              <LegacyWorkerJobsRedirect />
            </RequireAuth>
          </Route>
          <Route path="/video-studio/:id">
            <RequireAuth>
              <RequireVideoIntelligence>
                <VideoStudioWorkspacePage />
              </RequireVideoIntelligence>
            </RequireAuth>
          </Route>
          <Route path="/video-studio">
            <RequireAuth>
              <RequireVideoIntelligence>
                <VideoStudioListPage />
              </RequireVideoIntelligence>
            </RequireAuth>
          </Route>
          <Route path="/credits">
            <RequireAuth>
              <Credits />
            </RequireAuth>
          </Route>
          <Route path="/billing/invoices/:invoiceId">
            <RequireAuth>
              <BillingCenter />
            </RequireAuth>
          </Route>
          <Route path="/billing">
            <RequireAuth>
              <BillingCenter />
            </RequireAuth>
          </Route>
          <Route path="/usage">
            <RequireAuth>
              <UsageAnalytics />
            </RequireAuth>
          </Route>
          <Route path="/tasks">
            <RequireAuth>
              <TaskQueueMonitor />
            </RequireAuth>
          </Route>
          <Route path="/media-history">
            <RequireAuth>
              <MediaHistory />
            </RequireAuth>
          </Route>
          <Route path="/groups">
            <RequireAuth>
              <GroupManagement />
            </RequireAuth>
          </Route>
          <Route path="/groups/discover">
            <RequireAuth>
              <GroupDiscovery />
            </RequireAuth>
          </Route>
          <Route path="/groups/:groupId">
            <RequireAuth>
              <GroupDetailPanel />
            </RequireAuth>
          </Route>
          <Route path="/document-management">
            <RequireAuth>
              <DocumentManagement />
            </RequireAuth>
          </Route>
          <Route path="/share/:token" component={PublicDocumentShare} />
          <Route path="/settings">
            <RequireAuth>
              <Settings />
            </RequireAuth>
          </Route>
          <Route path="/settings/personas">
            <RequireAuth>
              <PersonaSettings />
            </RequireAuth>
          </Route>
          <Route path="/settings/skills">
            <RequireAuth>
              <SkillBrowser />
            </RequireAuth>
          </Route>
          <Route path="/my-feedback">
            <RequireAuth>
              <MyFeedback />
            </RequireAuth>
          </Route>
          <Route path="/profile">
            <RequireAuth>
              <Profile />
            </RequireAuth>
          </Route>
          <Route path="/video-editor">
            <RequireAuth>
              <VideoEditorPage />
            </RequireAuth>
          </Route>
          <Route path="/presentations">
            <RequireAuth>
              <PresentationLibrary />
            </RequireAuth>
          </Route>
          <Route path="/presentation-editor/:docId">
            <RequireAuth>
              <PresentationEditor />
            </RequireAuth>
          </Route>
          <Route path="/terms">
            <TenantPublicRoute pageKey="terms"><Terms /></TenantPublicRoute>
          </Route>
          <Route path="/privacy">
            <TenantPublicRoute pageKey="privacy"><Privacy /></TenantPublicRoute>
          </Route>
          <Route path="/verify-email" component={VerifyEmail} />
          <Route
            path="/auth/callback/mcp-connect"
            component={McpConnectCallback}
          />
          <Route
            path="/auth/callback/google-drive"
            component={GoogleDriveCallback}
          />
          <Route path="/auth/callback/onedrive" component={OneDriveCallback} />
          <Route
            path="/auth/callback/upload-post"
            component={UploadPostCallback}
          />
          <Route path="/auth/callback/:provider" component={AuthCallback} />
          <Route path="/verify-email-change" component={VerifyEmailChange} />
          <Route path="/workers/connect">
            <RequireAuth>
              <WorkerAppConnect />
            </RequireAuth>
          </Route>
          <Route path="/runners/connect">
            <RequireAuth>
              <RunnerConnect />
            </RequireAuth>
          </Route>
          <Route path="/mcp/pairing/approve">
            <RequireAuth>
              <McpAgentPairingApprove />
            </RequireAuth>
          </Route>
          <Route path="/auth/device" component={DeviceAuth} />
          <Route path="/factory">
            <RequireAuth>
              <Factory />
            </RequireAuth>
          </Route>
          <Route path="/terminal">
            <RequireAuth>
              <TerminalPage />
            </RequireAuth>
          </Route>
          <Route path="/kilo">
            <RequireAuth>
              <CLIPage />
            </RequireAuth>
          </Route>
          <Route
            path="/presentation/:itemId/play"
            component={PresentationPlayMode}
          />
          <Route path="/404" component={NotFound} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </>
  );
}

function App() {
  useEffect(() => {
    cleanupLegacyAuth();
  }, []);

  return (
    <ErrorBoundary>
      <HelmetProvider>
        <I18nextProvider i18n={i18n}>
          <AstryxPaletteProvider>
            <ThemeProvider defaultTheme="light" switchable>
              <AuthProvider>
                <TenantProvider>
                  <AstryxPaletteApplier>
                    <LinkProvider component={AstryxWouterLink}>
                      <PublicThemePreferenceBoundary />
                      <TooltipProvider>
                        <ConfirmProvider>
                          <Toaster />
                          <GlobalAlerts />
                          <SystemHealthBanner />
                          <LanguageSyncBridge />
                          <WelcomeLanguagePicker />
                          <Router />
                          <FeedbackButton />
                          <RuntimePerformanceOverlay />
                        </ConfirmProvider>
                      </TooltipProvider>
                      </LinkProvider>
                    </AstryxPaletteApplier>
                  </TenantProvider>
                </AuthProvider>
            </ThemeProvider>
          </AstryxPaletteProvider>
        </I18nextProvider>
      </HelmetProvider>
    </ErrorBoundary>
  );
}

function PublicThemePreferenceBoundary() {
  const [location] = useLocation();
  const { tenant } = useTenant();
  const { theme } = useAppTheme();
  const platformPublicLightOnly = isPlatformLightOnlyPublicRoute(tenant, location);

  useLayoutEffect(() => {
    applyPublicThemeBoundary(document.documentElement, theme, platformPublicLightOnly);
  }, [platformPublicLightOnly, theme]);

  return null;
}

export default App;
