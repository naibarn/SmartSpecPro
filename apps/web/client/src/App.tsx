import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GlobalAlerts } from "@/components/GlobalAlerts";
import { Route, Switch, Redirect, useLocation } from "wouter";
import { HelmetProvider } from "react-helmet-async";
import { lazy, Suspense, useEffect, useRef } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { getPostHog } from "@/lib/posthog";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider } from "./contexts/AuthContext";
import { TenantProvider } from "./contexts/TenantContext";

// Route-based code splitting — all page components are loaded lazily
const NotFound = lazy(() => import("@/pages/NotFound"));
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
const AdminGallery = lazy(() => import("./pages/AdminGallery"));
const AdminUsers = lazy(() => import("./pages/AdminUsers"));
const AdminPackages = lazy(() => import("./pages/AdminPackages"));
const AdminLLMProviders = lazy(() => import("./pages/AdminLLMProviders"));
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
const AgencyBrowser = lazy(() => import("./pages/AgencyBrowser"));
const AgencyChat = lazy(() => import("./pages/AgencyChat"));
const AgencyBuilder = lazy(() => import("./pages/AgencyBuilder"));
const Workflows = lazy(() => import("./pages/Workflows"));
const WorkflowEditor = lazy(() => import("./pages/WorkflowEditor"));
const WorkflowGallery = lazy(() => import("./pages/WorkflowGallery"));

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
        <Route path="/admin/gallery" component={AdminGallery} />
        <Route path="/admin/users" component={AdminUsers} />
        <Route path="/admin/packages" component={AdminPackages} />
        <Route path="/admin/llm-providers" component={AdminLLMProviders} />
        <Route path="/admin/media-providers" component={AdminMediaProviders} />
        <Route path="/admin/media-models" component={AdminMediaModels} />
        <Route path="/admin/skills" component={AdminSkills} />
        <Route path="/admin/skill-repositories" component={AdminSkillRepositories} />
        <Route path="/admin/storage-settings"><Redirect to="/admin/settings" /></Route>
        <Route path="/admin/services" component={AdminServices} />
        <Route path="/admin/settings" component={AdminSettings} />
        <Route path="/admin/queues" component={AdminQueueDashboard} />
        <Route path="/admin/queues/llm" component={AdminQueueLLM} />
        <Route path="/admin/queues/media" component={AdminQueueMedia} />
        <Route path="/admin/ops" component={AdminOpsDashboard} />
        <Route path="/admin/dashboard" component={AdminOverviewDashboard} />
        <Route path="/admin/funnel" component={AdminFunnelDashboard} />
        <Route path="/admin/sandbox" component={AdminSandbox} />
        <Route path="/admin/tenants" component={AdminTenants} />
        <Route path="/domain-admin" component={DomainAdmin} />
        <Route path="/domain-admin/theme" component={DomainThemeEditor} />
        <Route path="/domain-admin/content" component={DomainAdminContent} />
        <Route path="/domain-admin/users" component={DomainUsers} />
        <Route path="/domain-admin/settings" component={TenantSettings} />
        <Route path="/domain-admin/blog" component={DomainBlogAdmin} />
        <Route path="/login" component={Login} />
        <Route path="/signup" component={Signup} />
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/chat" component={Chat} />
        <Route path="/agencies" component={AgencyBrowser} />
        <Route path="/agencies/:id/edit" component={AgencyBuilder} />
        <Route path="/agencies/:id" component={AgencyChat} />
        <Route path="/workflows" component={Workflows} />
        <Route path="/workflows/editor" component={WorkflowEditor} />
        <Route path="/workflows/gallery" component={WorkflowGallery} />
        <Route path="/workflows/editor/:id" component={WorkflowEditor} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/generate/:type?" component={Generate} />
        <Route path="/media-studio" component={MediaStudio} />
        <Route path="/credits" component={Credits} />
        <Route path="/usage" component={UsageAnalytics} />
        <Route path="/tasks" component={TaskQueueMonitor} />
        <Route path="/media-history" component={MediaHistory} />
        <Route path="/groups" component={GroupManagement} />
        <Route path="/groups/discover" component={GroupDiscovery} />
        <Route path="/groups/:groupId" component={GroupDetailPanel} />
        <Route path="/document-management" component={DocumentManagement} />
        <Route path="/settings" component={Settings} />
        <Route path="/settings/skills" component={SkillBrowser} />
        <Route path="/profile" component={Profile} />
        <Route path="/terms" component={Terms} />
        <Route path="/privacy" component={Privacy} />
        <Route path="/verify-email" component={VerifyEmail} />
        <Route path="/auth/callback/google-drive" component={GoogleDriveCallback} />
        <Route path="/auth/callback/onedrive" component={OneDriveCallback} />
        <Route path="/auth/callback/:provider" component={AuthCallback} />
        <Route path="/auth/device" component={DeviceAuth} />
        <Route path="/factory" component={Factory} />
        <Route path="/terminal" component={TerminalPage} />
        <Route path="/kilo" component={CLIPage} />
        <Route path="/docker" component={DockerPage} />
        <Route path="/video-editor" component={VideoEditorPage} />
        <Route path="/presentations" component={PresentationLibrary} />
        <Route path="/presentation-editor/:docId" component={PresentationEditor} />
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
  return (
    <ErrorBoundary>
      <HelmetProvider>
        <ThemeProvider defaultTheme="light">
          <AuthProvider>
            <TenantProvider>
              <TooltipProvider>
                <Toaster />
                <GlobalAlerts />
                <Router />
              </TooltipProvider>
            </TenantProvider>
          </AuthProvider>
        </ThemeProvider>
      </HelmetProvider>
    </ErrorBoundary>
  );
}

export default App;
