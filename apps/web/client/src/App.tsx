import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GlobalAlerts } from "@/components/GlobalAlerts";
import NotFound from "@/pages/NotFound";
import DockerPage from "@/pages/DockerPage";
import TerminalPage from "@/pages/TerminalPage";
import CLIPage from "@/pages/CLIPage";
import Factory from "@/pages/Factory";
import VideoEditorPage from "@/pages/VideoEditorPage";
import PresentationEditor from "@/pages/PresentationEditor";
import { Route, Switch, Redirect, useLocation } from "wouter";
import { HelmetProvider } from "react-helmet-async";
import { useEffect, useRef } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { getPostHog } from "@/lib/posthog";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider } from "./contexts/AuthContext";
import { TenantProvider } from "./contexts/TenantContext";
import Home from "./pages/Home";
import Pricing from "./pages/Pricing";
import Features from "./pages/Features";
import Docs from "./pages/Docs";
import Contact from "./pages/Contact";
import Blog from "./pages/Blog";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import AuthCallback from "./pages/AuthCallback";
import ForgotPassword from "./pages/ForgotPassword";
import Profile from "./pages/Profile";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import VerifyEmail from "./pages/VerifyEmail";
import Gallery from "./pages/Gallery";
import Marketplace from "./pages/Marketplace";
import DeviceAuth from "./pages/DeviceAuth";
import AdminGallery from "./pages/AdminGallery";
import AdminUsers from "./pages/AdminUsers";
import AdminPackages from "./pages/AdminPackages";
import AdminLLMProviders from "./pages/AdminLLMProviders";
import AdminMediaProviders from "./pages/AdminMediaProviders";
import AdminMediaModels from "./pages/AdminMediaModels";
import AdminSkills from "./pages/AdminSkills";
import AdminSkillRepositories from "./pages/AdminSkillRepositories";
import AdminTenants from "./pages/AdminTenants";
import AdminServices from "./pages/AdminServices";
import AdminSettings from "./pages/AdminSettings";
import AdminQueueDashboard from "./pages/AdminQueueDashboard";
import AdminQueueLLM from "./pages/AdminQueueLLM";
import AdminQueueMedia from "./pages/AdminQueueMedia";
import AdminOpsDashboard from "./pages/Admin/AdminOpsDashboard";
import AdminOverviewDashboard from "./pages/Admin/AdminOverviewDashboard";
import AdminFunnelDashboard from "./pages/AdminFunnelDashboard";
import DomainAdmin from "./pages/DomainAdmin";
import DomainThemeEditor from "./pages/DomainThemeEditor";
import DomainAdminContent from "./pages/DomainAdminContent";
import DomainUsers from "./pages/DomainUsers";
import TenantSettings from "./pages/TenantSettings";
import Chat from "./pages/Chat";
import Generate from "./pages/Generate";
import MediaStudio from "./pages/MediaStudio";
import Credits from "./pages/Credits";
import MediaHistory from "./pages/MediaHistory";
import DocumentManagement from "./pages/DocumentManagement";
import GroupManagement from "./pages/GroupManagement";
import GroupDiscovery from "./pages/GroupDiscovery";
import GroupDetailPanel from "./components/groups/GroupDetailPanel";
import Settings from "./pages/Settings";
import SkillBrowser from "./pages/SkillBrowser";
import DockerRedirect from "./pages/DockerRedirect";
import GoogleDriveCallback from "./pages/GoogleDriveCallback";
import OneDriveCallback from "./pages/OneDriveCallback";
import DocPage from "./pages/DocPage";
import About from "./pages/About";
import Changelog from "./pages/Changelog";
import Careers from "./pages/Careers";
import Community from "./pages/Community";
import Support from "./pages/Support";
import Status from "./pages/Status";
import Security from "./pages/Security";
import BlogPost from "./pages/BlogPost";
import DomainBlogAdmin from "./pages/DomainBlogAdmin";
import UsageAnalytics from "./pages/UsageAnalytics";
import TaskQueueMonitor from "./pages/TaskQueueMonitor";
import Workflows from "./pages/Workflows";
import WorkflowEditor from "./pages/WorkflowEditor";
import WorkflowGallery from "./pages/WorkflowGallery";

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
      <Route path="/presentation-editor/:docId" component={PresentationEditor} />
      <Route path="/docker-redirect" component={DockerRedirect} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
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
