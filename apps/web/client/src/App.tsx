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
  useRef,
  type AnchorHTMLAttributes,
  type MouseEvent,
} from "react";
import { Theme as AstryxTheme } from "@astryxdesign/core/theme";
import { LinkProvider } from "@astryxdesign/core/Link";
import ErrorBoundary from "./components/ErrorBoundary";
import { getPostHog } from "@/lib/posthog";
import { ThemeProvider } from "./contexts/ThemeContext";
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
import { TenantProvider } from "./contexts/TenantContext";
import { I18nextProvider } from "react-i18next";
import { i18n } from "@/i18n";
import { useNamespacePreloader } from "@/i18n/useNamespacePreloader";
import {
  RouteLoadingError,
  RouteLoadingSkeleton,
} from "@/components/RouteLoadingSkeleton";
import { useLanguageSync } from "@/hooks/useLanguageSync";
import { cleanupLegacyAuth } from "@/lib/cleanupLegacyAuth";
import { trpc } from "@/lib/trpc";
import { useTenantFeatureFlagStatus } from "@/hooks/useTenantFeatureFlag";
import { WelcomeLanguagePicker } from "@/components/WelcomeLanguagePicker";
import { RuntimePerformanceOverlay } from "@/components/diagnostics/RuntimePerformanceOverlay";

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
const DockerPage = lazy(() => import("@/pages/DockerPage"));
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
const Contact = lazy(() => import("./pages/Contact"));
const Blog = lazy(() => import("./pages/Blog"));
const Login = lazy(() => import("./pages/Login"));
const Signup = lazy(() => import("./pages/Signup"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const Profile = lazy(() => import("./pages/Profile"));
const Terms = lazy(() => import("./pages/Terms"));
const Privacy = lazy(() => import("./pages/Privacy"));
const VerifyEmail = lazy(() => import("./pages/VerifyEmail"));
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
const AdminAgentExperiencePreview = lazy(
  () => import("./pages/AdminAgentExperiencePreview")
);
const DeviceAuth = lazy(() => import("./pages/DeviceAuth"));
const AdminAgencies = lazy(() => import("./pages/AdminAgencies"));
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
const AdminLegacyUpgradeRunDetail = lazy(
  () => import("./pages/AdminLegacyUpgradeRunDetail")
);
const AdminSkillRepositories = lazy(
  () => import("./pages/AdminSkillRepositories")
);
const AdminTenants = lazy(() => import("./pages/AdminTenants"));
const AdminServices = lazy(() => import("./pages/AdminServices"));
const AdminSettings = lazy(() => import("./pages/AdminSettings"));
const AdminFinanceRules = lazy(() => import("./pages/AdminFinanceRules"));
const AdminBillingCenter = lazy(() => import("./pages/AdminBillingCenter"));
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
const AdminSandbox = lazy(() => import("./pages/AdminSandbox"));
const McpServerManager = lazy(() => import("./pages/McpServerManager"));
const DomainAdmin = lazy(() => import("./pages/DomainAdmin"));
const DomainThemeEditor = lazy(() => import("./pages/DomainThemeEditor"));
const DomainAdminContent = lazy(() => import("./pages/DomainAdminContent"));
const DomainUsers = lazy(() => import("./pages/DomainUsers"));
const TenantSettings = lazy(() => import("./pages/TenantSettings"));
const Chat = lazy(() => import("./pages/Chat"));
const Finance = lazy(() => import("./pages/Finance"));
const FinanceReports = lazy(() => import("./pages/FinanceReports"));
const SocialChannels = lazy(() => import("./pages/SocialChannels"));
const SocialInbox = lazy(() => import("./pages/SocialInbox"));
const SocialPublishing = lazy(() => import("./pages/SocialPublishing"));
const SocialModeration = lazy(() => import("./pages/SocialModeration"));
const SocialAutomation = lazy(() => import("./pages/SocialAutomation"));
const AutonomousTeamMonitor = lazy(
  () => import("./pages/AutonomousTeamMonitor")
);
const RoleAgentDetail = lazy(() => import("./pages/RoleAgentDetail"));
const RoleMissionPlanner = lazy(() => import("./pages/RoleMissionPlanner"));
const RoleRoutineScheduler = lazy(() => import("./pages/RoleRoutineScheduler"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Generate = lazy(() => import("./pages/Generate"));
const MediaStudio = lazy(() => import("./pages/MediaStudio"));
const ContentComposer = lazy(() => import("./pages/ContentComposer"));
const StoryboardReviewPage = lazy(() => import("./pages/StoryboardReviewPage"));
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
const DockerRedirect = lazy(() => import("./pages/DockerRedirect"));
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
const AgencyBrowser = lazy(() => import("./pages/AgencyBrowser"));
const AgencyChat = lazy(() => import("./pages/AgencyChat"));
const HybridOrchestrationPreview = lazy(
  () => import("./pages/HybridOrchestrationPreview")
);
const AgencyBuilder = lazy(() => import("./pages/AgencyBuilder"));
const AgencyTemplates = lazy(() => import("./pages/AgencyTemplates"));
const AgencyMarketplace = lazy(() => import("./pages/AgencyMarketplace"));
const PersonaSettings = lazy(() => import("./pages/PersonaSettings"));
const AdminPersonas = lazy(() => import("./pages/AdminPersonas"));
const Workflows = lazy(() => import("./pages/Workflows"));
const WorkflowEditor = lazy(() => import("./pages/WorkflowEditor"));
const WorkflowGallery = lazy(() => import("./pages/WorkflowGallery"));
const WorkpackIntakeStudio = lazy(() => import("./pages/WorkpackIntakeStudio"));
const WorkpackDetail = lazy(() => import("./pages/WorkpackDetail"));
const WorkpackReplayLab = lazy(() => import("./pages/WorkpackReplayLab"));
const WorkpackExceptionInbox = lazy(
  () => import("./pages/WorkpackExceptionInbox")
);
const WorkpackConnectorStudio = lazy(
  () => import("./pages/WorkpackConnectorStudio")
);
const WorkpackRoiDashboard = lazy(() => import("./pages/WorkpackRoiDashboard"));
const WorkpackDiscovery = lazy(() => import("./pages/WorkpackDiscovery"));
const WebhookTriggers = lazy(() => import("./pages/WebhookTriggers"));
const AdminChannelRouter = lazy(() => import("./pages/AdminChannelRouter"));
const AdminSystemGuardian = lazy(() => import("./pages/AdminSystemGuardian"));
const AdminMonitoring = lazy(() => import("./pages/AdminMonitoring"));
const AdminOcrUsage = lazy(() => import("./pages/AdminOcrUsage"));
const AdminWorkOsDashboard = lazy(() => import("./pages/AdminWorkOsDashboard"));
const AdminFeedbackHub = lazy(() => import("./pages/AdminFeedbackHub"));
const WorkRequest = lazy(() => import("./pages/WorkRequest"));
const MyRequests = lazy(() => import("./pages/MyRequests"));
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
  const { enabled, isResolved, isError, retry } = useTenantFeatureFlagStatus(
    "verticalDramaSeries"
  );
  if (isError) {
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
  const { enabled, isResolved, isError, retry } = useTenantFeatureFlagStatus(
    "videoIntelligencePlatformEnabled"
  );
  if (isError) {
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

/**
 * Share-link tokens are bearer secrets that live in the URL path
 * (`/share/vd/:token` and the library's `/share/:token`) — sending the raw
 * href to PostHog would hand the secret to a third party (security review
 * 2026-07-09, finding #2). Redact the token segment before capture; the
 * redacted form still distinguishes the two share surfaces for analytics.
 */
export function redactShareTokenFromUrl(href: string): string {
  return href
    .replace(/(\/share\/vd\/)[^/?#]+/, "$1[redacted]")
    .replace(/(\/share\/)(?!vd\/)[^/?#]+/, "$1[redacted]");
}

function PostHogPageViewTracker() {
  const [location] = useLocation();
  const prevPath = useRef<string | null>(null);

  useEffect(() => {
    if (location !== prevPath.current) {
      prevPath.current = location;
      getPostHog()?.capture("$pageview", {
        $current_url: redactShareTokenFromUrl(window.location.href),
      });
    }
  }, [location]);

  return null;
}

function LanguageSyncBridge() {
  useLanguageSync();
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
  return <AstryxTheme theme={activePalette.theme}>{children}</AstryxTheme>;
}

function Router() {
  useNamespacePreloader();
  // make sure to consider if you need authentication for certain routes
  return (
    <>
      <PostHogPageViewTracker />
      <Suspense fallback={<RouteLoadingSkeleton />}>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/pricing" component={Pricing} />
          <Route path="/features" component={Features} />
          <Route path="/docs" component={Docs} />
          <Route path="/docs/:slug+" component={DocPage} />
          <Route path="/help" component={HelpPage} />
          <Route path="/help/:slug+" component={HelpTopicPage} />
          <Route path="/desktop/open" component={DesktopOpen} />
          <Route path="/desktop/view" component={DesktopView} />
          <Route path="/contact" component={Contact} />
          <Route path="/about" component={About} />
          <Route path="/changelog" component={Changelog} />
          <Route path="/careers" component={Careers} />
          <Route path="/community" component={Community} />
          <Route path="/support" component={Support} />
          <Route path="/resources" component={Resources} />
          <Route path="/status" component={Status} />
          <Route path="/security" component={Security} />
          <Route path="/blog" component={Blog} />
          <Route path="/blog/:slug" component={BlogPost} />
          <Route path="/marketplace" component={Marketplace} />
          <Route path="/marketplace/:slug" component={Marketplace} />
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
          <Route path="/gallery" component={Gallery} />
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
          <Route path="/admin/personas">
            <RequireAdmin>
              <AdminPersonas />
            </RequireAdmin>
          </Route>
          <Route path="/admin/agencies">
            <RequireAdmin>
              <AdminAgencies />
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
          <Route path="/admin/agent-experience-preview">
            <RequireAdmin>
              <AdminAgentExperiencePreview />
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
          <Route path="/admin/channel-router">
            <RequireAdmin>
              <AdminChannelRouter />
            </RequireAdmin>
          </Route>
          <Route path="/admin/sandbox">
            <RequireAdmin>
              <AdminSandbox />
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
          <Route path="/admin/ocr-usage">
            <RequireAdmin>
              <AdminOcrUsage />
            </RequireAdmin>
          </Route>
          <Route path="/admin/work-os">
            <RequireDomainAdmin>
              <AdminWorkOsDashboard />
            </RequireDomainAdmin>
          </Route>
          <Route path="/work/request">
            <RequireAuth>
              <WorkRequest />
            </RequireAuth>
          </Route>
          <Route path="/work/requests">
            <RequireAuth>
              <MyRequests />
            </RequireAuth>
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
          <Route path="/role-monitor">
            <RequireAuth>
              <AutonomousTeamMonitor />
            </RequireAuth>
          </Route>
          <Route path="/role-monitor/:roleId/mission">
            <RequireAuth>
              <RoleMissionPlanner />
            </RequireAuth>
          </Route>
          <Route path="/role-monitor/:roleId/routines">
            <RequireAuth>
              <RoleRoutineScheduler />
            </RequireAuth>
          </Route>
          <Route path="/role-monitor/:roleId">
            <RequireAuth>
              <RoleAgentDetail />
            </RequireAuth>
          </Route>
          <Route path="/agencies">
            <RequireAuth>
              <AgencyBrowser />
            </RequireAuth>
          </Route>
          <Route path="/agencies/templates">
            <RequireAuth>
              <AgencyTemplates />
            </RequireAuth>
          </Route>
          <Route path="/agencies/marketplace">
            <RequireAuth>
              <AgencyMarketplace />
            </RequireAuth>
          </Route>
          <Route path="/agencies/:id/edit">
            <RequireAuth>
              <AgencyBuilder />
            </RequireAuth>
          </Route>
          <Route path="/agencies/:id/hybrid-preview">
            <RequireAuth>
              <HybridOrchestrationPreview />
            </RequireAuth>
          </Route>
          <Route path="/agencies/:id/review">
            <RequireAuth>
              <AgencyChat />
            </RequireAuth>
          </Route>
          <Route path="/agencies/:id">
            <RequireAuth>
              <AgencyChat />
            </RequireAuth>
          </Route>
          <Route path="/workflows">
            <RequireAuth>
              <Workflows />
            </RequireAuth>
          </Route>
          <Route path="/workflows/editor">
            <RequireAuth>
              <WorkflowEditor />
            </RequireAuth>
          </Route>
          <Route path="/workflows/gallery">
            <RequireAuth>
              <WorkflowGallery />
            </RequireAuth>
          </Route>
          <Route path="/workflows/editor/:id">
            <RequireAuth>
              <WorkflowEditor />
            </RequireAuth>
          </Route>
          <Route path="/workpacks/intake">
            <RequireAuth>
              <WorkpackIntakeStudio />
            </RequireAuth>
          </Route>
          <Route path="/workpacks/exceptions">
            <RequireAuth>
              <WorkpackExceptionInbox />
            </RequireAuth>
          </Route>
          <Route path="/workpacks/roi">
            <RequireAuth>
              <WorkpackRoiDashboard />
            </RequireAuth>
          </Route>
          <Route path="/workpacks/discovery">
            <RequireAuth>
              <WorkpackDiscovery />
            </RequireAuth>
          </Route>
          <Route path="/workpacks/:workpackId/replay">
            <RequireAuth>
              <WorkpackReplayLab />
            </RequireAuth>
          </Route>
          <Route path="/workpacks/:workpackId/connectors">
            <RequireAuth>
              <WorkpackConnectorStudio />
            </RequireAuth>
          </Route>
          <Route path="/workpacks/:workpackId">
            <RequireAuth>
              <WorkpackDetail />
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
          <Route path="/content-composer">
            <RequireAuth>
              <ContentComposer />
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
          <Route path="/render-jobs">
            <RequireAuth>
              <RenderJobsPage />
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
          <Route path="/terms" component={Terms} />
          <Route path="/privacy" component={Privacy} />
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
          <Route path="/workers/connect">
            <RequireAuth>
              <WorkerAppConnect />
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
          <Route path="/docker">
            <RequireAuth>
              <DockerPage />
            </RequireAuth>
          </Route>
          <Route
            path="/presentation/:itemId/play"
            component={PresentationPlayMode}
          />
          <Route path="/docker-redirect" component={DockerRedirect} />
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
            <AstryxPaletteApplier>
              <LinkProvider component={AstryxWouterLink}>
                <ThemeProvider defaultTheme="light" switchable>
                  <AuthProvider>
                    <TenantProvider>
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
                    </TenantProvider>
                  </AuthProvider>
                </ThemeProvider>
              </LinkProvider>
            </AstryxPaletteApplier>
          </AstryxPaletteProvider>
        </I18nextProvider>
      </HelmetProvider>
    </ErrorBoundary>
  );
}

export default App;
