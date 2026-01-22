import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import { HelmetProvider } from "react-helmet-async";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider } from "./contexts/AuthContext";
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
import DeviceAuth from "./pages/DeviceAuth";
import AdminGallery from "./pages/AdminGallery";
import AdminUsers from "./pages/AdminUsers";
import AdminPackages from "./pages/AdminPackages";
import AdminLLMProviders from "./pages/AdminLLMProviders";
import AdminSkills from "./pages/AdminSkills";
import AdminTenants from "./pages/AdminTenants";
import AdminServices from "./pages/AdminServices";
import DomainAdmin from "./pages/DomainAdmin";
import DomainThemeEditor from "./pages/DomainThemeEditor";
import DomainAdminContent from "./pages/DomainAdminContent";
import Chat from "./pages/Chat";
import Generate from "./pages/Generate";
import Credits from "./pages/Credits";
import Settings from "./pages/Settings";
import DockerRedirect from "./pages/DockerRedirect";

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/pricing" component={Pricing} />
      <Route path="/features" component={Features} />
      <Route path="/docs" component={Docs} />
      <Route path="/contact" component={Contact} />
      <Route path="/blog" component={Blog} />
      <Route path="/gallery" component={Gallery} />
      <Route path="/admin/gallery" component={AdminGallery} />
      <Route path="/admin/users" component={AdminUsers} />
      <Route path="/admin/packages" component={AdminPackages} />
      <Route path="/admin/llm-providers" component={AdminLLMProviders} />
      <Route path="/admin/skills" component={AdminSkills} />
      <Route path="/admin/services" component={AdminServices} />
      <Route path="/admin/tenants" component={AdminTenants} />
      <Route path="/domain-admin" component={DomainAdmin} />
      <Route path="/domain-admin/theme" component={DomainThemeEditor} />
      <Route path="/domain-admin/content" component={DomainAdminContent} />
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/chat" component={Chat} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/generate/:type?" component={Generate} />
      <Route path="/credits" component={Credits} />
      <Route path="/settings" component={Settings} />
      <Route path="/profile" component={Profile} />
      <Route path="/terms" component={Terms} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/verify-email" component={VerifyEmail} />
      <Route path="/auth/callback/:provider" component={AuthCallback} />
      <Route path="/auth/device" component={DeviceAuth} />
      <Route path="/docker-redirect" component={DockerRedirect} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <HelmetProvider>
        <ThemeProvider defaultTheme="light">
          <AuthProvider>
            <TooltipProvider>
              <Toaster />
              <Router />
            </TooltipProvider>
          </AuthProvider>
        </ThemeProvider>
      </HelmetProvider>
    </ErrorBoundary>
  );
}

export default App;
