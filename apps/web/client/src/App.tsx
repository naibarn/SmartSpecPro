import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GlobalAlerts } from "@/components/GlobalAlerts";
import { Route, Switch, Redirect, useLocation } from "wouter";
import { HelmetProvider } from "react-helmet-async";
import { lazy, Suspense, useEffect, useRef } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { getPostHog } from "@/lib/posthog";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { TenantProvider } from "./contexts/TenantContext";
import { I18nProvider } from "@/lib/i18n";
import { cleanupLegacyAuth } from "@/lib/cleanupLegacyAuth";

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
const AdminSkills = lazy(() => import("./pages/AdminSkills"));
const AdminSkillRepositories = lazy(() => import("./pages/AdminSkillRepositories"));
const AdminTenants = lazy(() => import("./pages/AdminTenants"));
const AdminServices = lazy(() => import("./pages/AdminServices"));
const AdminSettings = lazy(() => import("./pages/AdminSettings"));
const AdminQueueDashboard = lazy(() => import("./pages/AdminQueueDashboard"));
const AdminQueueLLM = lazy(() => import("./pages/AdminQueueLLM"));
const AdminQueueMedia = lazy(() => import("./pages/AdminQueueMedia"));
const AdminAlertRules = lazy(() => import("./pages/AdminAlertRules"));
const AdminAuditLogs = lazy(() => import("./pages/AdminAuditLogs"));
const AdminOrchestrationLogs = lazy(() => import("./pages/AdminOrchestrationLogs"));
const AdminAPIKeys = lazy(() => import("./pages/AdminAPIKeys"));
const AdminOpsDashboard = lazy(() => import("./pages/Admin/AdminOpsDashboard"));
const AdminOverviewDashboard = lazy(() => import("./pages/Admin/AdminOverviewDashboard"));
const AdminFunnelDashboard = lazy(() => import("./pages/AdminFunnelDashboard"));
const AdminSandbox = lazy(() => import("./pages/AdminSandbox"));
const DomainAdmin = lazy(() => import("./pages/DomainAdmin"));
const DomainThemeEditor = lazy(() => import("./pages/DomainThemeEditor"));
const DomainAdminContent = lazy(() => import("./pages/DomainAdminContent"));
const DomainUsers = lazy(() => import("./pages/DomainUsers"));
const TenantSettings = lazy(() => import("./pages/TenantSettings"));
const Chat = lazy(() => import("./pages/Chat"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Generate = lazy(() => import("./pages/Generate"));
const MediaStudio = lazy(() => import("./pages/MediaStudio"));
const Credits = lazy(() => import("./pages/Credits"));
const MediaHistory = lazy(() => import("./pages/MediaHistory"));
const DocumentManagement = lazy(() => import("./pages/DocumentManagement"));
const GroupManagement = lazy(() => import("./pages/GroupManagement"));
const GroupDiscovery = lazy(() => import("./pages/GroupDiscovery"));
const GroupDetailPanel = lazy(() => import("./components/groups/GroupDetailPanel"));
const Settings = lazy(() => import("./pages/Settings"));
const SkillBrowser = lazy(() => import("./pages/SkillBrowser"));
const DockerRedirect = lazy(() => import("./pages/DockerRedirect"));
const GoogleDriveCallback = lazy(() => import("./pages/GoogleDriveCallback"));
const OneDriveCallback = lazy(() => import("./pages/OneDriveCallback"));
const DocPage = lazy(() => import("./pages/DocPage"));
const About = lazy(() => import("./pages/About"));
const Changelog = lazy(() => import("./pages/Changelog"));
const Careers = lazy(() => import("./pages/Careers"));
const Community = lazy(() => import("./pages/Community"));
const Support = lazy(() => import("./pages/Support"));
const Status = lazy(() => import("./pages/Status"));
const Security = lazy(() => import("./pages/Security"));
const BlogPost = lazy(() => import("./pages/BlogPost"));
const DomainBlogAdmin = lazy(() => import("./pages/DomainBlogAdmin"));
const UsageAnalytics = lazy(() => import("./pages/UsageAnalytics"));
const TaskQueueMonitor = lazy(() => import("./pages/TaskQueueMonitor"));
const Teams = lazy(() => import("./pages/Teams"));
const AgencyBrowser = lazy(() => import("./pages/AgencyBrowser"));
const AgencyChat = lazy(() => import("./pages/AgencyChat"));
const AgencyBuilder = lazy(() => import("./pages/AgencyBuilder"));
const AgencyTemplates = lazy(() => import("./pages/AgencyTemplates"));
const AgencyMarketplace = lazy(() => import("./pages/AgencyMarketplace"));
const PersonaSettings = lazy(() => import("./pages/PersonaSettings"));
const AdminPersonas = lazy(() => import("./pages/AdminPersonas"));
const Workflows = lazy(() => import("./pages/Workflows"));
const WorkflowEditor = lazy(() => import("./pages/WorkflowEditor"));
const WorkflowGallery = lazy(() => import("./pages/WorkflowGallery"));
const WebhookTriggers = lazy(() => import("./pages/WebhookTriggers"));
const AdminChannelRouter = lazy(() => import("./pages/AdminChannelRouter"));
const AdminSystemGuardian = lazy(() => import("./pages/AdminSystemGuardian"));
const AdminFeedbackHub = lazy(() => import("./pages/AdminFeedbackHub"));
const MyFeedback = lazy(() => import("./pages/MyFeedback"));
const ContentQualityDashboard = lazy(() => import("./pages/ContentQualityDashboard"));
const HelpPage = lazy(() => import("./pages/Help"));
import { SystemHealthBanner } from "./components/guardian/SystemHealthBanner";
import { FeedbackButton } from "./components/guardian/FeedbackButton";
const HelpTopicPage = lazy(() => import("./pages/HelpTopic"));

/**
 * Route-level guard for /admin/* routes.
 * Redirects unauthenticated users to /login and non-admins to /dashboard.
 * Renders nothing while auth is still loading to avoid a flash.
 */
function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
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
 * Renders nothing while auth is still loading to avoid a flash.
 */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <Redirect to="/login" />;
  return <>{children}</>;
}

function RequireDomainAdmin({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <Redirect to="/login" />;
  if (user.role !== "admin" && user.role !== "domain_admin")
    return <Redirect to="/dashboard" />;
  return <>{children}</>;
}

function PostHogPageViewTracker() {
  const [location] = useLocation();
  const prevPath = useRef<string | null>(null);

  useEffect(() => {
    if (location !== prevPath.current) {
      prevPath.current = location;
      getPostHog()?.capture("$pageview", { $current_url: window.location.href });
    }
  }, [location]);

  return null;
}

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <>
    <PostHogPageViewTracker />
    <Suspense fallback={null}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/pricing" component={Pricing} />
        <Route path="/features" component={Features} />
        <Route path="/docs" component={Docs} />
        <Route path="/docs/:slug+" component={DocPage} />
        <Route path="/help" component={HelpPage} />
        <Route path="/help/:slug+" component={HelpTopicPage} />
        <Route path="/contact" component={Contact} />
        <Route path="/about" component={About} />
        <Route path="/changelog" component={Changelog} />
        <Route path="/careers" component={Careers} />
        <Route path="/community" component={Community} />
        <Route path="/support" component={Support} />
        <Route path="/status" component={Status} />
        <Route path="/security" component={Security} />
        <Route path="/blog" component={Blog} />
        <Route path="/blog/:slug" component={BlogPost} />
        <Route path="/marketplace" component={Marketplace} />
        <Route path="/marketplace/:slug" component={Marketplace} />
        <Route path="/gallery" component={Gallery} />
        <Route path="/admin/gallery">
          <RequireAdmin><AdminGallery /></RequireAdmin>
        </Route>
        <Route path="/admin/users">
          <RequireAdmin><AdminUsers /></RequireAdmin>
        </Route>
        <Route path="/admin/packages">
          <RequireAdmin><AdminPackages /></RequireAdmin>
        </Route>
        <Route path="/admin/llm-providers">
          <RequireAdmin><AdminLLMProviders /></RequireAdmin>
        </Route>
        <Route path="/admin/llm-models">
          <RequireAdmin><AdminLLMModels /></RequireAdmin>
        </Route>
        <Route path="/admin/media-providers">
          <RequireAdmin><AdminMediaProviders /></RequireAdmin>
        </Route>
        <Route path="/admin/media-models">
          <RequireAdmin><AdminMediaModels /></RequireAdmin>
        </Route>
        <Route path="/admin/skills">
          <RequireAdmin><AdminSkills /></RequireAdmin>
        </Route>
        <Route path="/admin/personas">
          <RequireAdmin><AdminPersonas /></RequireAdmin>
        </Route>
        <Route path="/admin/agencies">
          <RequireAdmin><AdminAgencies /></RequireAdmin>
        </Route>
        <Route path="/admin/approvals">
          <RequireAdmin><AdminApprovals /></RequireAdmin>
        </Route>
        <Route path="/admin/skill-repositories">
          <RequireAdmin><AdminSkillRepositories /></RequireAdmin>
        </Route>
        <Route path="/admin/storage-settings">
          <Redirect to="/admin/settings" />
        </Route>
        <Route path="/admin/services">
          <RequireAdmin><AdminServices /></RequireAdmin>
        </Route>
        <Route path="/admin/settings">
          <RequireAdmin><AdminSettings /></RequireAdmin>
        </Route>
        <Route path="/admin/queues">
          <RequireAdmin><AdminQueueDashboard /></RequireAdmin>
        </Route>
        <Route path="/admin/queues/llm">
          <RequireAdmin><AdminQueueLLM /></RequireAdmin>
        </Route>
        <Route path="/admin/queues/media">
          <RequireAdmin><AdminQueueMedia /></RequireAdmin>
        </Route>
        <Route path="/admin/alert-rules">
          <RequireAdmin><AdminAlertRules /></RequireAdmin>
        </Route>
        <Route path="/admin/audit-logs">
          <RequireAdmin><AdminAuditLogs /></RequireAdmin>
        </Route>
        <Route path="/admin/orchestration-logs">
          <RequireAdmin><AdminOrchestrationLogs /></RequireAdmin>
        </Route>
        <Route path="/admin/api-keys">
          <RequireAdmin><AdminAPIKeys /></RequireAdmin>
        </Route>
        <Route path="/admin/ops">
          <RequireAdmin><AdminOpsDashboard /></RequireAdmin>
        </Route>
        <Route path="/admin/dashboard">
          <RequireAdmin><AdminOverviewDashboard /></RequireAdmin>
        </Route>
        <Route path="/admin/funnel">
          <RequireAdmin><AdminFunnelDashboard /></RequireAdmin>
        </Route>
        <Route path="/admin/channel-router">
          <RequireAdmin><AdminChannelRouter /></RequireAdmin>
        </Route>
        <Route path="/admin/sandbox">
          <RequireAdmin><AdminSandbox /></RequireAdmin>
        </Route>
        <Route path="/admin/content-quality">
          <RequireAdmin><ContentQualityDashboard /></RequireAdmin>
        </Route>
        <Route path="/admin/system-guardian">
          <RequireAdmin><AdminSystemGuardian /></RequireAdmin>
        </Route>
        <Route path="/admin/feedback-hub">
          <RequireAdmin><AdminFeedbackHub /></RequireAdmin>
        </Route>
        <Route path="/admin/tenants">
          <RequireAdmin><AdminTenants /></RequireAdmin>
        </Route>
        <Route path="/domain-admin">
          <RequireDomainAdmin><DomainAdmin /></RequireDomainAdmin>
        </Route>
        <Route path="/domain-admin/theme">
          <RequireDomainAdmin><DomainThemeEditor /></RequireDomainAdmin>
        </Route>
        <Route path="/domain-admin/content">
          <RequireDomainAdmin><DomainAdminContent /></RequireDomainAdmin>
        </Route>
        <Route path="/domain-admin/users">
          <RequireDomainAdmin><DomainUsers /></RequireDomainAdmin>
        </Route>
        <Route path="/domain-admin/settings">
          <RequireDomainAdmin><TenantSettings /></RequireDomainAdmin>
        </Route>
        <Route path="/domain-admin/blog">
          <RequireDomainAdmin><DomainBlogAdmin /></RequireDomainAdmin>
        </Route>
        <Route path="/login" component={Login} />
        <Route path="/signup" component={Signup} />
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/chat"><RequireAuth><Chat /></RequireAuth></Route>
        <Route path="/automation"><RequireAuth><AutomationPage /></RequireAuth></Route>
        <Route path="/automation/live/:sessionId"><RequireAuth><AutomationPage /></RequireAuth></Route>
        <Route path="/teams"><RequireAuth><Teams /></RequireAuth></Route>
        <Route path="/teams/:teamId"><RequireAuth><Teams /></RequireAuth></Route>
        <Route path="/agencies"><RequireAuth><AgencyBrowser /></RequireAuth></Route>
        <Route path="/agencies/templates"><RequireAuth><AgencyTemplates /></RequireAuth></Route>
        <Route path="/agencies/marketplace"><RequireAuth><AgencyMarketplace /></RequireAuth></Route>
        <Route path="/agencies/:id/edit"><RequireAuth><AgencyBuilder /></RequireAuth></Route>
        <Route path="/agencies/:id"><RequireAuth><AgencyChat /></RequireAuth></Route>
        <Route path="/workflows"><RequireAuth><Workflows /></RequireAuth></Route>
        <Route path="/workflows/editor"><RequireAuth><WorkflowEditor /></RequireAuth></Route>
        <Route path="/workflows/gallery"><RequireAuth><WorkflowGallery /></RequireAuth></Route>
        <Route path="/workflows/editor/:id"><RequireAuth><WorkflowEditor /></RequireAuth></Route>
        <Route path="/webhook-triggers"><RequireAuth><WebhookTriggers /></RequireAuth></Route>
        <Route path="/dashboard"><RequireAuth><Dashboard /></RequireAuth></Route>
        <Route path="/notifications"><RequireAuth><Notifications /></RequireAuth></Route>
        <Route path="/generate/:type?"><RequireAuth><Generate /></RequireAuth></Route>
        <Route path="/media-studio"><RequireAuth><MediaStudio /></RequireAuth></Route>
        <Route path="/credits"><RequireAuth><Credits /></RequireAuth></Route>
        <Route path="/usage"><RequireAuth><UsageAnalytics /></RequireAuth></Route>
        <Route path="/tasks"><RequireAuth><TaskQueueMonitor /></RequireAuth></Route>
        <Route path="/media-history"><RequireAuth><MediaHistory /></RequireAuth></Route>
        <Route path="/groups"><RequireAuth><GroupManagement /></RequireAuth></Route>
        <Route path="/groups/discover"><RequireAuth><GroupDiscovery /></RequireAuth></Route>
        <Route path="/groups/:groupId"><RequireAuth><GroupDetailPanel /></RequireAuth></Route>
        <Route path="/document-management"><RequireAuth><DocumentManagement /></RequireAuth></Route>
        <Route path="/settings"><RequireAuth><Settings /></RequireAuth></Route>
        <Route path="/settings/personas"><RequireAuth><PersonaSettings /></RequireAuth></Route>
        <Route path="/settings/skills"><RequireAuth><SkillBrowser /></RequireAuth></Route>
        <Route path="/my-feedback"><RequireAuth><MyFeedback /></RequireAuth></Route>
        <Route path="/profile"><RequireAuth><Profile /></RequireAuth></Route>
        <Route path="/video-editor"><RequireAuth><VideoEditorPage /></RequireAuth></Route>
        <Route path="/presentations"><RequireAuth><PresentationLibrary /></RequireAuth></Route>
        <Route path="/presentation-editor/:docId"><RequireAuth><PresentationEditor /></RequireAuth></Route>
        <Route path="/terms" component={Terms} />
        <Route path="/privacy" component={Privacy} />
        <Route path="/verify-email" component={VerifyEmail} />
        <Route path="/auth/callback/google-drive" component={GoogleDriveCallback} />
        <Route path="/auth/callback/onedrive" component={OneDriveCallback} />
        <Route path="/auth/callback/:provider" component={AuthCallback} />
        <Route path="/auth/device" component={DeviceAuth} />
        <Route path="/factory"><RequireAuth><Factory /></RequireAuth></Route>
        <Route path="/terminal"><RequireAuth><TerminalPage /></RequireAuth></Route>
        <Route path="/kilo"><RequireAuth><CLIPage /></RequireAuth></Route>
        <Route path="/docker"><RequireAuth><DockerPage /></RequireAuth></Route>
        <Route path="/presentation/:itemId/play" component={PresentationPlayMode} />
        <Route path="/docker-redirect" component={DockerRedirect} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
    </>
  );
}

function App() {
  useEffect(() => { cleanupLegacyAuth(); }, []);

  return (
    <ErrorBoundary>
      <HelmetProvider>
        <I18nProvider>
        <ThemeProvider defaultTheme="light">
          <AuthProvider>
            <TenantProvider>
              <TooltipProvider>
                <Toaster />
                <GlobalAlerts />
                <SystemHealthBanner />
                <Router />
                <FeedbackButton />
              </TooltipProvider>
            </TenantProvider>
          </AuthProvider>
        </ThemeProvider>
        </I18nProvider>
      </HelmetProvider>
    </ErrorBoundary>
  );
}

export default App;
