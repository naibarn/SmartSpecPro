diff --git a/apps/web/client/src/components/DashboardLayout.tsx b/apps/web/client/src/components/DashboardLayout.tsx
index afd6af4f..ad20744a 100644
--- a/apps/web/client/src/components/DashboardLayout.tsx
+++ b/apps/web/client/src/components/DashboardLayout.tsx
@@ -1,4 +1,5 @@
 import { useAuth } from "@/_core/hooks/useAuth";
+import { useTranslation } from 'react-i18next';
 import { useTenant } from "@/contexts/TenantContext";
 import { Avatar, AvatarFallback } from "@/components/ui/avatar";
 import {
@@ -48,6 +49,7 @@ export default function DashboardLayout({
     return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
   });
   const { loading, user } = useAuth();
+  const { t } = useTranslation('nav');
   const { isLoading: tenantLoading } = useTenant();
 
   useEffect(() => {
@@ -64,10 +66,10 @@ export default function DashboardLayout({
         <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
           <div className="flex flex-col items-center gap-6">
             <h1 className="text-2xl font-semibold tracking-tight text-center">
-              Sign in to continue
+              {t('layout.signInToContinue')}
             </h1>
             <p className="text-sm text-muted-foreground text-center max-w-sm">
-              Access to this dashboard requires authentication. Continue to launch the login flow.
+              {t('layout.authRequired')}
             </p>
           </div>
           <Button
@@ -77,7 +79,7 @@ export default function DashboardLayout({
             size="lg"
             className="w-full shadow-lg hover:shadow-xl transition-all"
           >
-            Sign in
+            {t('layout.signIn')}
           </Button>
         </div>
       </div>
diff --git a/apps/web/client/src/components/Navbar.tsx b/apps/web/client/src/components/Navbar.tsx
index 0e5d7591..c512163a 100644
--- a/apps/web/client/src/components/Navbar.tsx
+++ b/apps/web/client/src/components/Navbar.tsx
@@ -10,6 +10,7 @@ import { motion, AnimatePresence } from 'framer-motion';
 import { Button } from '@/components/ui/button';
 import { Menu, X, Sparkles, ChevronDown, Zap, Bot } from 'lucide-react';
 import { useTenant } from '@/contexts/TenantContext';
+import { useTranslation } from 'react-i18next';
 
 interface NavLink {
   href: string;
@@ -27,29 +28,6 @@ function isDropdown(item: NavItem): item is NavDropdown {
   return 'items' in item;
 }
 
-const navItems: NavItem[] = [
-  { href: '/', label: 'Home' },
-  { href: '/features', label: 'Features' },
-  { href: '/workflows/gallery', label: 'Workflows' },
-  { href: '/pricing', label: 'Pricing' },
-  { href: '/gallery', label: 'Gallery' },
-  {
-    label: 'Marketplace',
-    items: [
-      { href: '/marketplace', label: 'Skills', icon: Zap, description: 'Browse AI skills & prompts' },
-      { href: '/agencies/marketplace', label: 'Agencies', icon: Bot, description: 'Multi-agent team templates' },
-    ],
-  },
-  { href: '/docs', label: 'Docs' },
-  { href: '/blog', label: 'Blog' },
-  { href: '/contact', label: 'Contact' },
-];
-
-// Flatten for mobile menu
-const mobileLinks: NavLink[] = navItems.flatMap((item) =>
-  isDropdown(item) ? item.items.map((sub) => ({ href: sub.href, label: `${item.label} — ${sub.label}` })) : [item],
-);
-
 export function Navbar() {
   const [location] = useLocation();
   const [isScrolled, setIsScrolled] = useState(false);
@@ -57,6 +35,30 @@ export function Navbar() {
   const [openDropdown, setOpenDropdown] = useState<string | null>(null);
   const dropdownRef = useRef<HTMLDivElement>(null);
   const { tenant } = useTenant();
+  const { t } = useTranslation('nav');
+
+  const navItems: NavItem[] = [
+    { href: '/', label: t('navbar.home') },
+    { href: '/features', label: t('navbar.features') },
+    { href: '/workflows/gallery', label: t('navbar.workflows') },
+    { href: '/pricing', label: t('navbar.pricing') },
+    { href: '/gallery', label: t('navbar.gallery') },
+    {
+      label: t('navbar.marketplace'),
+      items: [
+        { href: '/marketplace', label: t('navbar.marketplaceSkills'), icon: Zap, description: 'Browse reusable skills and prompts' },
+        { href: '/agencies/marketplace', label: t('navbar.marketplaceAgencies'), icon: Bot, description: 'Swarm-ready team templates' },
+      ],
+    },
+    { href: '/docs', label: t('navbar.docs') },
+    { href: '/blog', label: t('navbar.blog') },
+    { href: '/contact', label: t('navbar.contact') },
+  ];
+
+  // Flatten for mobile menu
+  const mobileLinks: NavLink[] = navItems.flatMap((item) =>
+    isDropdown(item) ? item.items.map((sub) => ({ href: sub.href, label: `${item.label} — ${sub.label}` })) : [item],
+  );
 
   useEffect(() => {
     const handleScroll = () => {
@@ -109,7 +111,7 @@ export function Navbar() {
                 />
               ) : (
                 <>
-                  <div className="w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 rounded-xl bg-gradient-to-br from-violet-500 via-coral-400 to-teal-400 flex items-center justify-center shadow-lg shrink-0">
+                  <div className="w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 rounded-xl bg-gradient-to-br from-blue-500 via-cyan-400 to-teal-400 flex items-center justify-center shadow-lg shrink-0">
                     <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-white" />
                   </div>
                   <span className="text-lg sm:text-xl lg:text-2xl font-bold gradient-text">SmartAIHub</span>
@@ -205,15 +207,15 @@ export function Navbar() {
           <div className="hidden lg:flex items-center gap-3">
             <Link href="/login">
               <Button variant="ghost" size="sm" className="text-muted-foreground">
-                Sign In
+                {t('navbar.signIn')}
               </Button>
             </Link>
             <Link href="/signup">
               <Button
                 size="sm"
-                className="bg-gradient-to-r from-violet-500 to-teal-400 hover:from-violet-600 hover:to-teal-500 text-white shadow-lg shadow-violet-500/25"
+                className="bg-gradient-to-r from-blue-500 to-teal-400 hover:from-blue-600 hover:to-teal-500 text-white shadow-lg shadow-blue-500/25"
               >
-                Get Started Free
+                {t('navbar.getStarted')}
               </Button>
             </Link>
           </div>
@@ -266,7 +268,7 @@ export function Navbar() {
                 </Link>
                 <Link href="/signup">
                   <Button
-                    className="w-full bg-gradient-to-r from-violet-500 to-teal-400 text-white"
+                    className="w-full bg-gradient-to-r from-blue-500 to-teal-400 text-white"
                     onClick={() => setIsMobileMenuOpen(false)}
                   >
                     Get Started Free
diff --git a/apps/web/client/src/components/__tests__/Navbar.i18n.test.tsx b/apps/web/client/src/components/__tests__/Navbar.i18n.test.tsx
new file mode 100644
index 00000000..d07a12af
--- /dev/null
+++ b/apps/web/client/src/components/__tests__/Navbar.i18n.test.tsx
@@ -0,0 +1,42 @@
+/**
+ * Tests for section-12: Navbar i18n migration
+ * Verifies that Navbar uses useTranslation and t() for nav labels.
+ */
+
+import { describe, it, expect } from "vitest";
+import { readFileSync } from "fs";
+import { join } from "path";
+
+const navbarSrc = readFileSync(
+  join(import.meta.dirname, "../Navbar.tsx"),
+  "utf-8"
+);
+
+describe("Navbar i18n migration", () => {
+  it("imports useTranslation from react-i18next", () => {
+    expect(navbarSrc).toContain("useTranslation");
+  });
+
+  it("uses t('navbar.home') for Home label", () => {
+    expect(navbarSrc).toContain("t('navbar.home')");
+  });
+
+  it("uses t('navbar.features') for Features label", () => {
+    expect(navbarSrc).toContain("t('navbar.features')");
+  });
+
+  it("uses t('navbar.signIn') for Sign In button", () => {
+    expect(navbarSrc).toContain("t('navbar.signIn')");
+  });
+
+  it("uses t('navbar.getStarted') for Get Started button", () => {
+    expect(navbarSrc).toContain("t('navbar.getStarted')");
+  });
+
+  it("does not contain hardcoded 'Sign In' string (must use t())", () => {
+    // Remove JSX and check no raw text string remains
+    const withoutTranslations = navbarSrc.replace(/t\('[^']*'\)/g, "TRANSLATED");
+    // Should not have standalone 'Sign In' text in JSX (only in t() calls)
+    expect(withoutTranslations).not.toContain(">Sign In<");
+  });
+});
diff --git a/apps/web/client/src/hooks/useMenuItems.ts b/apps/web/client/src/hooks/useMenuItems.ts
index 741cb9cb..a6cadb52 100644
--- a/apps/web/client/src/hooks/useMenuItems.ts
+++ b/apps/web/client/src/hooks/useMenuItems.ts
@@ -46,6 +46,7 @@ import {
   type MenuGroup,
   type UserRole,
 } from '@smartspec/shared';
+import i18next from 'i18next';
 
 const iconMap: Record<string, LucideIcon> = {
   TrendingUp,
@@ -100,8 +101,13 @@ export function getResolvedMenuItems(
 ): ResolvedMenuItem[] {
   const platform = detectPlatform();
   const items = getMenuItemsByGroup(platform, role, group, overrides, enabledFeatures);
-  return items.map(item => ({
-    ...item,
-    IconComponent: iconMap[item.icon] || Sparkles,
-  }));
+  return items.map(item => {
+    const navKey = `nav:sidebar.${item.id}`;
+    const translatedLabel = i18next.exists(navKey) ? i18next.t(navKey) : item.label;
+    return {
+      ...item,
+      label: translatedLabel,
+      IconComponent: iconMap[item.icon] || Sparkles,
+    };
+  });
 }
diff --git a/apps/web/client/src/i18n/__tests__/wave1-nav-auth-keys.test.ts b/apps/web/client/src/i18n/__tests__/wave1-nav-auth-keys.test.ts
new file mode 100644
index 00000000..63e1a09d
--- /dev/null
+++ b/apps/web/client/src/i18n/__tests__/wave1-nav-auth-keys.test.ts
@@ -0,0 +1,189 @@
+/**
+ * Tests for section-12: Wave 1 nav and auth JSON key completeness.
+ */
+
+import { describe, it, expect } from "vitest";
+import { readFileSync, existsSync } from "fs";
+import { join } from "path";
+
+const EN_DIR = join(import.meta.dirname, "../../locales/en");
+const TH_DIR = join(import.meta.dirname, "../../locales/th");
+
+function readJson(filepath: string): Record<string, string> {
+  return JSON.parse(readFileSync(filepath, "utf-8")) as Record<string, string>;
+}
+
+function hasKey(obj: Record<string, string>, key: string): boolean {
+  return Object.prototype.hasOwnProperty.call(obj, key);
+}
+
+const REQUIRED_SIDEBAR_KEYS = [
+  "sidebar.dashboard", "sidebar.chat", "sidebar.mediaStudio", "sidebar.skills",
+  "sidebar.workflows", "sidebar.agencies", "sidebar.teams",
+  "sidebar.mediaHistory", "sidebar.library", "sidebar.presentations",
+  "sidebar.credits", "sidebar.settings",
+];
+
+const REQUIRED_NAVBAR_KEYS = [
+  "navbar.home", "navbar.features", "navbar.pricing",
+  "navbar.signIn", "navbar.getStarted",
+];
+
+const REQUIRED_HEADER_KEYS = [
+  "header.signOut", "header.profile", "header.search", "header.notifications",
+];
+
+const REQUIRED_LAYOUT_KEYS = [
+  "layout.signInToContinue", "layout.authRequired",
+];
+
+const REQUIRED_LOGIN_KEYS = [
+  "login.title", "login.emailLabel", "login.passwordLabel", "login.signIn",
+  "login.forgotPassword", "login.noAccount", "login.continueWithGoogle",
+  "login.continueWithGithub", "login.or", "login.subtitle",
+  "login.twoFa.title", "login.twoFa.enterCode", "login.twoFa.verify",
+  "login.verification.title", "login.verification.resend",
+];
+
+const REQUIRED_SIGNUP_KEYS = [
+  "signUp.title", "signUp.email", "signUp.password", "signUp.createAccount",
+  "signUp.fullName", "signUp.alreadyHaveAccount", "signUp.signIn",
+];
+
+const REQUIRED_FORGOT_KEYS = [
+  "forgot.title", "forgot.chooseMethod", "forgot.sendToEmail",
+  "forgot.backToLogin",
+];
+
+const REQUIRED_CALLBACK_KEYS = [
+  "callback.processing", "callback.success", "callback.error",
+];
+
+const REQUIRED_VERIFY_KEYS = [
+  "verify.title", "verify.verify", "verify.resend",
+];
+
+describe("en/nav.json — key completeness", () => {
+  it("is valid JSON with only string values", () => {
+    const data = readJson(join(EN_DIR, "nav.json"));
+    expect(Object.values(data).every((v) => typeof v === "string")).toBe(true);
+  });
+
+  it("contains all required sidebar keys", () => {
+    const data = readJson(join(EN_DIR, "nav.json"));
+    for (const key of REQUIRED_SIDEBAR_KEYS) {
+      expect(hasKey(data, key), `Missing: ${key}`).toBe(true);
+    }
+  });
+
+  it("contains all required navbar keys", () => {
+    const data = readJson(join(EN_DIR, "nav.json"));
+    for (const key of REQUIRED_NAVBAR_KEYS) {
+      expect(hasKey(data, key), `Missing: ${key}`).toBe(true);
+    }
+  });
+
+  it("contains required header keys", () => {
+    const data = readJson(join(EN_DIR, "nav.json"));
+    for (const key of REQUIRED_HEADER_KEYS) {
+      expect(hasKey(data, key), `Missing: ${key}`).toBe(true);
+    }
+  });
+
+  it("contains layout keys", () => {
+    const data = readJson(join(EN_DIR, "nav.json"));
+    for (const key of REQUIRED_LAYOUT_KEYS) {
+      expect(hasKey(data, key), `Missing: ${key}`).toBe(true);
+    }
+  });
+
+  it("has no empty string values", () => {
+    const data = readJson(join(EN_DIR, "nav.json"));
+    for (const [k, v] of Object.entries(data)) {
+      expect(v, `Empty value for "${k}"`).not.toBe("");
+    }
+  });
+});
+
+describe("th/nav.json — alignment", () => {
+  it("keys are a subset of en/nav.json keys", () => {
+    const en = readJson(join(EN_DIR, "nav.json"));
+    const th = readJson(join(TH_DIR, "nav.json"));
+    for (const key of Object.keys(th)) {
+      expect(hasKey(en, key), `th key "${key}" not in en`).toBe(true);
+    }
+  });
+
+  it("has no empty string values", () => {
+    const data = readJson(join(TH_DIR, "nav.json"));
+    for (const [k, v] of Object.entries(data)) {
+      expect(v, `Empty value for "${k}"`).not.toBe("");
+    }
+  });
+});
+
+describe("en/auth.json — key completeness", () => {
+  it("is valid JSON with only string values", () => {
+    const data = readJson(join(EN_DIR, "auth.json"));
+    expect(Object.values(data).every((v) => typeof v === "string")).toBe(true);
+  });
+
+  it("contains all required login keys", () => {
+    const data = readJson(join(EN_DIR, "auth.json"));
+    for (const key of REQUIRED_LOGIN_KEYS) {
+      expect(hasKey(data, key), `Missing: ${key}`).toBe(true);
+    }
+  });
+
+  it("contains all required signup keys", () => {
+    const data = readJson(join(EN_DIR, "auth.json"));
+    for (const key of REQUIRED_SIGNUP_KEYS) {
+      expect(hasKey(data, key), `Missing: ${key}`).toBe(true);
+    }
+  });
+
+  it("contains all required forgot keys", () => {
+    const data = readJson(join(EN_DIR, "auth.json"));
+    for (const key of REQUIRED_FORGOT_KEYS) {
+      expect(hasKey(data, key), `Missing: ${key}`).toBe(true);
+    }
+  });
+
+  it("contains callback keys", () => {
+    const data = readJson(join(EN_DIR, "auth.json"));
+    for (const key of REQUIRED_CALLBACK_KEYS) {
+      expect(hasKey(data, key), `Missing: ${key}`).toBe(true);
+    }
+  });
+
+  it("contains verify keys", () => {
+    const data = readJson(join(EN_DIR, "auth.json"));
+    for (const key of REQUIRED_VERIFY_KEYS) {
+      expect(hasKey(data, key), `Missing: ${key}`).toBe(true);
+    }
+  });
+
+  it("has no empty string values", () => {
+    const data = readJson(join(EN_DIR, "auth.json"));
+    for (const [k, v] of Object.entries(data)) {
+      expect(v, `Empty value for "${k}"`).not.toBe("");
+    }
+  });
+});
+
+describe("th/auth.json — alignment", () => {
+  it("keys are a subset of en/auth.json keys", () => {
+    const en = readJson(join(EN_DIR, "auth.json"));
+    const th = readJson(join(TH_DIR, "auth.json"));
+    for (const key of Object.keys(th)) {
+      expect(hasKey(en, key), `th key "${key}" not in en`).toBe(true);
+    }
+  });
+
+  it("has no empty string values", () => {
+    const data = readJson(join(TH_DIR, "auth.json"));
+    for (const [k, v] of Object.entries(data)) {
+      expect(v, `Empty value for "${k}"`).not.toBe("");
+    }
+  });
+});
diff --git a/apps/web/client/src/locales/en/auth.json b/apps/web/client/src/locales/en/auth.json
index 1dcc5371..0f964003 100644
--- a/apps/web/client/src/locales/en/auth.json
+++ b/apps/web/client/src/locales/en/auth.json
@@ -1,6 +1,61 @@
 {
   "callback.error": "Authentication failed. Please try again.",
-  "callback.processing": "Processing your sign-in…",
+  "callback.metaConnected": "Meta Pages connected!",
+  "callback.processing": "Processing authentication\u2026",
+  "callback.redirecting": "Redirecting\u2026",
+  "callback.success": "Authentication successful.",
+  "forgot.backToLogin": "Back to sign in",
+  "forgot.chooseMethod": "Choose recovery method",
+  "forgot.codeSent": "Recovery code sent.",
+  "forgot.confirmPassword": "Confirm new password",
+  "forgot.enterCode": "Enter recovery code",
+  "forgot.newPassword": "New password",
+  "forgot.resetPassword": "Reset Password",
+  "forgot.resetSuccess": "Password reset successfully.",
+  "forgot.sendToBackupEmail": "Send code to backup email",
+  "forgot.sendToEmail": "Send reset link to email",
+  "forgot.sendViaSms": "Send code via SMS",
+  "forgot.title": "Forgot Password",
+  "login.continueWithGithub": "Continue with GitHub",
+  "login.continueWithGoogle": "Continue with Google",
+  "login.emailLabel": "Email",
+  "login.emailPlaceholder": "Enter your email",
+  "login.features.aiModels": "Multiple AI models",
+  "login.features.codeGen": "AI-powered code generation",
+  "login.features.collaborate": "Real-time collaboration",
+  "login.forgotPassword": "Forgot password?",
+  "login.invalidCredentials": "Invalid email or password.",
+  "login.loginFailed": "Sign in failed. Please try again.",
+  "login.noAccount": "Don't have an account?",
+  "login.oauthNotConfigured": "{{provider}} OAuth is not configured. Please contact your administrator.",
+  "login.or": "or",
+  "login.passwordLabel": "Password",
+  "login.passwordPlaceholder": "Enter your password",
+  "login.rememberMe": "Remember me",
+  "login.signIn": "Sign In",
+  "login.signingIn": "Signing in\u2026",
+  "login.createAccount": "Create account",
+  "login.subtitle": "Sign in to continue building amazing applications with AI-powered tools.",
+  "login.successRedirecting": "Signed in successfully. Redirecting\u2026",
+  "login.title": "Welcome back to the future of development",
+  "login.twoFa.backToVerify": "Back to verification",
+  "login.twoFa.enterCode": "Enter your 2FA code",
+  "login.twoFa.enterResetCode": "Enter recovery code",
+  "login.twoFa.lostAccess": "Lost access to authenticator?",
+  "login.twoFa.noBackupMethods": "No backup methods available. Contact support.",
+  "login.twoFa.resetSubtitle": "Choose a backup verification method",
+  "login.twoFa.resetTitle": "Account Recovery",
+  "login.twoFa.sendToBackupEmail": "Send code to backup email",
+  "login.twoFa.sendViaSms": "Send code via SMS",
+  "login.twoFa.signedInWithRecovery": "Signed in. {{count}} recovery codes remaining.",
+  "login.twoFa.subtitle": "Enter the code from your authenticator app",
+  "login.twoFa.title": "Two-Factor Authentication",
+  "login.twoFa.verify": "Verify",
+  "login.verification.codeSent": "Verification code sent.",
+  "login.verification.resend": "Resend code",
+  "login.verification.resendFailed": "Failed to resend verification code.",
+  "login.verification.subtitle": "Check your email for a verification code",
+  "login.verification.title": "Verify Your Email",
   "mfa.codeLabel": "Authentication Code",
   "mfa.submitButton": "Verify",
   "mfa.title": "Two-Factor Authentication",
@@ -14,8 +69,22 @@
   "signIn.passwordLabel": "Password",
   "signIn.submitButton": "Sign In",
   "signIn.title": "Sign In",
+  "signUp.agreeTerms": "I agree to the Terms of Service and Privacy Policy",
+  "signUp.alreadyHaveAccount": "Already have an account?",
+  "signUp.confirmPassword": "Confirm Password",
   "signUp.createAccount": "Create Account",
   "signUp.email": "Email",
+  "signUp.fullName": "Full Name",
+  "signUp.inviteCode": "Invite Code (optional)",
   "signUp.password": "Password",
-  "signUp.title": "Create Account"
+  "signUp.planFree": "Free",
+  "signUp.planPro": "Pro",
+  "signUp.signIn": "Sign in",
+  "signUp.subtitle": "Start building with AI-powered tools today",
+  "signUp.title": "Create Account",
+  "verify.checkEmail": "Check your email for a verification link.",
+  "verify.codeLabel": "Verification Code",
+  "verify.resend": "Resend verification email",
+  "verify.title": "Verify Your Email",
+  "verify.verify": "Verify Email"
 }
diff --git a/apps/web/client/src/locales/en/nav.json b/apps/web/client/src/locales/en/nav.json
index 706116cc..528e17f7 100644
--- a/apps/web/client/src/locales/en/nav.json
+++ b/apps/web/client/src/locales/en/nav.json
@@ -2,20 +2,53 @@
   "header.notifications": "Notifications",
   "header.profile": "Profile",
   "header.search": "Search",
+  "header.settings": "Settings",
   "header.signOut": "Sign out",
+  "header.userMenu": "User menu",
+  "layout.authRequired": "Access to this dashboard requires authentication. Please sign in to continue.",
+  "layout.signIn": "Sign in",
+  "layout.signInToContinue": "Sign in to continue",
+  "navbar.agencies": "Agencies",
+  "navbar.blog": "Blog",
+  "navbar.contact": "Contact",
+  "navbar.docs": "Docs",
   "navbar.features": "Features",
+  "navbar.gallery": "Gallery",
   "navbar.getStarted": "Get Started",
   "navbar.home": "Home",
+  "navbar.marketplace": "Marketplace",
+  "navbar.marketplaceAgencies": "Agencies",
+  "navbar.marketplaceSkills": "Skills",
   "navbar.pricing": "Pricing",
   "navbar.signIn": "Sign In",
+  "navbar.workflows": "Workflows",
   "sidebar.agencies": "Agencies",
+  "sidebar.automationCopilot": "Automation Copilot",
   "sidebar.chat": "Chat",
+  "sidebar.cli": "CLI",
   "sidebar.credits": "Credits",
   "sidebar.dashboard": "Dashboard",
+  "sidebar.dockerSandbox": "Docker Sandbox",
+  "sidebar.groups": "Groups",
   "sidebar.library": "Library",
+  "sidebar.mediaHistory": "Media History",
   "sidebar.mediaStudio": "Media Studio",
+  "sidebar.myFeedback": "My Feedback",
   "sidebar.presentations": "Presentations",
+  "sidebar.privateFiles": "Private Files",
+  "sidebar.saasFactory": "SaaS Factory",
   "sidebar.settings": "Settings",
+  "sidebar.skills": "Skills",
+  "sidebar.socialAutomation": "Social Automation",
+  "sidebar.socialChannels": "Social Channels",
+  "sidebar.socialInbox": "Social Inbox",
+  "sidebar.socialModeration": "Social Moderation",
+  "sidebar.socialPublishing": "Social Publishing",
+  "sidebar.taskQueue": "Task Queue",
   "sidebar.teams": "Teams",
+  "sidebar.terminal": "Terminal",
+  "sidebar.usageAnalytics": "Usage Analytics",
+  "sidebar.videoEditor": "Video Editor",
+  "sidebar.webhookTriggers": "Webhook Triggers",
   "sidebar.workflows": "Workflows"
 }
diff --git a/apps/web/client/src/locales/th/auth.json b/apps/web/client/src/locales/th/auth.json
index 4fb2d137..dad9d627 100644
--- a/apps/web/client/src/locales/th/auth.json
+++ b/apps/web/client/src/locales/th/auth.json
@@ -1,6 +1,60 @@
 {
   "callback.error": "การยืนยันตัวตนล้มเหลว กรุณาลองใหม่",
-  "callback.processing": "กำลังดำเนินการลงชื่อเข้าใช้…",
+  "callback.metaConnected": "เชื่อมต่อ Meta Pages แล้ว!",
+  "callback.processing": "กำลังดำเนินการยืนยันตัวตน\u2026",
+  "callback.redirecting": "กำลังเปลี่ยนเส้นทาง\u2026",
+  "callback.success": "ยืนยันตัวตนสำเร็จ",
+  "forgot.backToLogin": "กลับสู่หน้าลงชื่อเข้าใช้",
+  "forgot.chooseMethod": "เลือกวิธีกู้คืน",
+  "forgot.codeSent": "ส่งรหัสกู้คืนแล้ว",
+  "forgot.confirmPassword": "ยืนยันรหัสผ่านใหม่",
+  "forgot.enterCode": "ใส่รหัสกู้คืน",
+  "forgot.newPassword": "รหัสผ่านใหม่",
+  "forgot.resetPassword": "รีเซ็ตรหัสผ่าน",
+  "forgot.resetSuccess": "รีเซ็ตรหัสผ่านสำเร็จ",
+  "forgot.sendToBackupEmail": "ส่งรหัสไปยังอีเมลสำรอง",
+  "forgot.sendToEmail": "ส่งลิงก์รีเซ็ตทางอีเมล",
+  "forgot.sendViaSms": "ส่งรหัสทาง SMS",
+  "forgot.title": "ลืมรหัสผ่าน",
+  "login.continueWithGithub": "ดำเนินการด้วย GitHub",
+  "login.continueWithGoogle": "ดำเนินการด้วย Google",
+  "login.emailLabel": "อีเมล",
+  "login.emailPlaceholder": "กรอกอีเมลของคุณ",
+  "login.features.aiModels": "โมเดล AI หลายตัว",
+  "login.features.codeGen": "สร้างโค้ดด้วย AI",
+  "login.features.collaborate": "ทำงานร่วมกันแบบเรียลไทม์",
+  "login.forgotPassword": "ลืมรหัสผ่าน?",
+  "login.invalidCredentials": "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
+  "login.loginFailed": "ลงชื่อเข้าใช้ไม่สำเร็จ กรุณาลองใหม่",
+  "login.noAccount": "ยังไม่มีบัญชี?",
+  "login.or": "หรือ",
+  "login.passwordLabel": "รหัสผ่าน",
+  "login.passwordPlaceholder": "กรอกรหัสผ่านของคุณ",
+  "login.rememberMe": "จดจำฉัน",
+  "login.signIn": "เข้าสู่ระบบ",
+  "login.signingIn": "กำลังเข้าสู่ระบบ\u2026",
+  "login.createAccount": "สร้างบัญชี",
+  "login.subtitle": "ลงชื่อเข้าใช้เพื่อสร้างแอปพลิเคชันด้วยเครื่องมือ AI",
+  "login.successRedirecting": "เข้าสู่ระบบสำเร็จ กำลังเปลี่ยนเส้นทาง\u2026",
+  "login.title": "ยินดีต้อนรับสู่อนาคตของการพัฒนา",
+  "login.twoFa.backToVerify": "กลับสู่การยืนยัน",
+  "login.twoFa.enterCode": "ใส่รหัส 2FA",
+  "login.twoFa.enterResetCode": "ใส่รหัสกู้คืน",
+  "login.twoFa.lostAccess": "เข้าไม่ได้ถึงแอปยืนยันตัวตน?",
+  "login.twoFa.noBackupMethods": "ไม่มีวิธีสำรอง กรุณาติดต่อฝ่ายสนับสนุน",
+  "login.twoFa.resetSubtitle": "เลือกวิธียืนยันสำรอง",
+  "login.twoFa.resetTitle": "กู้คืนบัญชี",
+  "login.twoFa.sendToBackupEmail": "ส่งรหัสไปยังอีเมลสำรอง",
+  "login.twoFa.sendViaSms": "ส่งรหัสทาง SMS",
+  "login.twoFa.signedInWithRecovery": "เข้าสู่ระบบแล้ว เหลือรหัสกู้คืน {{count}} รหัส",
+  "login.twoFa.subtitle": "ใส่รหัสจากแอปยืนยันตัวตนของคุณ",
+  "login.twoFa.title": "การยืนยันตัวตนสองขั้นตอน",
+  "login.twoFa.verify": "ยืนยัน",
+  "login.verification.codeSent": "ส่งรหัสยืนยันแล้ว",
+  "login.verification.resend": "ส่งรหัสใหม่",
+  "login.verification.resendFailed": "ส่งรหัสยืนยันไม่สำเร็จ",
+  "login.verification.subtitle": "ตรวจสอบอีเมลสำหรับรหัสยืนยัน",
+  "login.verification.title": "ยืนยันอีเมลของคุณ",
   "mfa.codeLabel": "รหัสยืนยัน",
   "mfa.submitButton": "ยืนยัน",
   "mfa.title": "การยืนยันตัวตนสองขั้นตอน",
@@ -14,8 +68,22 @@
   "signIn.passwordLabel": "รหัสผ่าน",
   "signIn.submitButton": "เข้าสู่ระบบ",
   "signIn.title": "เข้าสู่ระบบ",
+  "signUp.agreeTerms": "ฉันยอมรับข้อกำหนดการให้บริการและนโยบายความเป็นส่วนตัว",
+  "signUp.alreadyHaveAccount": "มีบัญชีอยู่แล้ว?",
+  "signUp.confirmPassword": "ยืนยันรหัสผ่าน",
   "signUp.createAccount": "สร้างบัญชี",
   "signUp.email": "อีเมล",
+  "signUp.fullName": "ชื่อเต็ม",
+  "signUp.inviteCode": "รหัสเชิญ (ไม่บังคับ)",
   "signUp.password": "รหัสผ่าน",
-  "signUp.title": "สร้างบัญชี"
+  "signUp.planFree": "ฟรี",
+  "signUp.planPro": "โปร",
+  "signUp.signIn": "เข้าสู่ระบบ",
+  "signUp.subtitle": "เริ่มต้นสร้างด้วยเครื่องมือ AI วันนี้",
+  "signUp.title": "สร้างบัญชี",
+  "verify.checkEmail": "ตรวจสอบอีเมลสำหรับลิงก์ยืนยัน",
+  "verify.codeLabel": "รหัสยืนยัน",
+  "verify.resend": "ส่งอีเมลยืนยันอีกครั้ง",
+  "verify.title": "ยืนยันอีเมลของคุณ",
+  "verify.verify": "ยืนยันอีเมล"
 }
diff --git a/apps/web/client/src/locales/th/nav.json b/apps/web/client/src/locales/th/nav.json
index f260b78b..1edfa913 100644
--- a/apps/web/client/src/locales/th/nav.json
+++ b/apps/web/client/src/locales/th/nav.json
@@ -2,20 +2,53 @@
   "header.notifications": "การแจ้งเตือน",
   "header.profile": "โปรไฟล์",
   "header.search": "ค้นหา",
+  "header.settings": "การตั้งค่า",
   "header.signOut": "ออกจากระบบ",
+  "header.userMenu": "เมนูผู้ใช้",
+  "layout.authRequired": "การเข้าถึงแดชบอร์ดนี้ต้องการการยืนยันตัวตน กรุณาลงชื่อเข้าใช้",
+  "layout.signIn": "เข้าสู่ระบบ",
+  "layout.signInToContinue": "ลงชื่อเข้าใช้เพื่อดำเนินการต่อ",
+  "navbar.agencies": "เอเจนซี",
+  "navbar.blog": "บล็อก",
+  "navbar.contact": "ติดต่อ",
+  "navbar.docs": "เอกสาร",
   "navbar.features": "ฟีเจอร์",
+  "navbar.gallery": "แกลเลอรี",
   "navbar.getStarted": "เริ่มต้นใช้งาน",
   "navbar.home": "หน้าหลัก",
+  "navbar.marketplace": "มาร์เก็ตเพลส",
+  "navbar.marketplaceAgencies": "เอเจนซี",
+  "navbar.marketplaceSkills": "ทักษะ",
   "navbar.pricing": "ราคา",
   "navbar.signIn": "เข้าสู่ระบบ",
-  "sidebar.agencies": "เอเจนซี",
-  "sidebar.chat": "แชท",
+  "navbar.workflows": "เวิร์กโฟลว์",
+  "sidebar.agencies": "เอเจนซี่",
+  "sidebar.automationCopilot": "ระบบอัตโนมัติ",
+  "sidebar.chat": "แชท AI",
+  "sidebar.cli": "CLI",
   "sidebar.credits": "เครดิต",
   "sidebar.dashboard": "แดชบอร์ด",
-  "sidebar.library": "ไลบรารี",
-  "sidebar.mediaStudio": "มีเดียสตูดิโอ",
-  "sidebar.presentations": "งานนำเสนอ",
-  "sidebar.settings": "การตั้งค่า",
-  "sidebar.teams": "ทีม",
+  "sidebar.dockerSandbox": "แซนด์บ็อกซ์",
+  "sidebar.groups": "กลุ่ม",
+  "sidebar.library": "คลังเอกสาร",
+  "sidebar.mediaHistory": "ประวัติมีเดีย",
+  "sidebar.mediaStudio": "สตูดิโอ",
+  "sidebar.myFeedback": "ข้อเสนอของฉัน",
+  "sidebar.presentations": "พรีเซนเทชัน",
+  "sidebar.privateFiles": "ไฟล์ส่วนตัว",
+  "sidebar.saasFactory": "โรงงาน",
+  "sidebar.settings": "ตั้งค่า",
+  "sidebar.skills": "ทักษะ",
+  "sidebar.socialAutomation": "โซเชียลอัตโนมัติ",
+  "sidebar.socialChannels": "ช่องทางโซเชียล",
+  "sidebar.socialInbox": "กล่องข้อความโซเชียล",
+  "sidebar.socialModeration": "การดูแลโซเชียล",
+  "sidebar.socialPublishing": "เผยแพร่โซเชียล",
+  "sidebar.taskQueue": "คิวงาน",
+  "sidebar.teams": "ทีม AI",
+  "sidebar.terminal": "เทอร์มินัล",
+  "sidebar.usageAnalytics": "สถิติการใช้งาน",
+  "sidebar.videoEditor": "ตัดต่อวีดีโอ",
+  "sidebar.webhookTriggers": "เว็บฮุก",
   "sidebar.workflows": "เวิร์กโฟลว์"
 }
diff --git a/apps/web/client/src/pages/AuthCallback.tsx b/apps/web/client/src/pages/AuthCallback.tsx
index 09c4269e..81d8c80b 100644
--- a/apps/web/client/src/pages/AuthCallback.tsx
+++ b/apps/web/client/src/pages/AuthCallback.tsx
@@ -6,12 +6,33 @@
 import { useEffect, useState } from 'react';
 import { useLocation, useRoute } from 'wouter';
 import { Sparkles, CheckCircle, XCircle, Loader2 } from 'lucide-react';
+import { trpc } from '@/lib/trpc';
+import { useTranslation } from 'react-i18next';
 
 export default function AuthCallback() {
   const [, params] = useRoute('/auth/callback/:provider');
   const [, setLocation] = useLocation();
+  const { t } = useTranslation('auth');
   const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
-  const [message, setMessage] = useState('Processing authentication...');
+  const [message, setMessage] = useState(t('callback.processing'));
+  const metaCompleteOAuth = trpc.metaChannels.completeOAuth.useMutation({
+    onSuccess: () => {
+      setStatus('success');
+      setMessage(t('callback.metaConnected') + ' ' + t('callback.redirecting'));
+
+      setTimeout(() => {
+        setLocation('/social/channels');
+      }, 1500);
+    },
+    onError: (error) => {
+      setStatus('error');
+      setMessage(error.message || 'Meta connection failed');
+
+      setTimeout(() => {
+        setLocation('/social/channels');
+      }, 3000);
+    },
+  });
 
   useEffect(() => {
     const handleCallback = async () => {
@@ -38,6 +59,11 @@ export default function AuthCallback() {
         const state = urlState || savedState || '';
         sessionStorage.removeItem('oauth_state');
 
+        if (provider === 'meta') {
+          metaCompleteOAuth.mutate({ code, state });
+          return;
+        }
+
         // Exchange code for token via OAuth endpoint
         const response = await fetch(`${API_BASE_URL}/api/oauth/${provider}/callback`, {
           method: 'POST',
diff --git a/apps/web/client/src/pages/ForgotPassword.tsx b/apps/web/client/src/pages/ForgotPassword.tsx
index 67cc1375..840e0b30 100644
--- a/apps/web/client/src/pages/ForgotPassword.tsx
+++ b/apps/web/client/src/pages/ForgotPassword.tsx
@@ -7,6 +7,7 @@
 
 import { useState } from 'react';
 import { Link } from 'wouter';
+import { useTranslation } from 'react-i18next';
 import { motion, AnimatePresence } from 'framer-motion';
 import { Button } from '@/components/ui/button';
 import { Input } from '@/components/ui/input';
@@ -28,6 +29,7 @@ type Channel = 'email' | 'backup_email' | 'sms';
 type Step = 'choose' | 'input' | 'sent' | 'reset' | 'success';
 
 export default function ForgotPassword() {
+  const { t } = useTranslation('auth');
   const [step, setStep] = useState<Step>('choose');
   const [channel, setChannel] = useState<Channel>('email');
   const [email, setEmail] = useState('');
@@ -125,11 +127,11 @@ export default function ForgotPassword() {
   return (
     <div className="min-h-screen flex">
       {/* Left Side - Branding */}
-      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400">
+      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-blue-600 via-cyan-500 to-teal-400">
         {/* Animated Background */}
         <div className="absolute inset-0">
           <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-white/20 rounded-full blur-3xl animate-pulse" />
-          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-300/30 rounded-full blur-3xl animate-pulse delay-1000" />
+          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-cyan-300/30 rounded-full blur-3xl animate-pulse delay-1000" />
         </div>
 
         {/* Content */}
@@ -180,7 +182,7 @@ export default function ForgotPassword() {
       </div>
 
       {/* Right Side - Form */}
-      <div className="flex-1 flex items-center justify-center p-8 bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20">
+      <div className="flex-1 flex items-center justify-center p-8 bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/20">
         <motion.div
           initial={{ opacity: 0, y: 20 }}
           animate={{ opacity: 1, y: 0 }}
@@ -188,7 +190,7 @@ export default function ForgotPassword() {
         >
           {/* Mobile Logo */}
           <Link href="/" className="flex items-center gap-3 mb-8 lg:hidden">
-            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
+            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
               <Sparkles className="w-5 h-5 text-white" />
             </div>
             <span className="text-xl font-bold text-gray-900">SmartAIHub</span>
@@ -200,7 +202,7 @@ export default function ForgotPassword() {
               <div key={s} className="flex items-center">
                 <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
                   step === s
-                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
+                    ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white'
                     : ['choose', 'input', 'sent', 'reset', 'success'].indexOf(step) > index
                     ? 'bg-green-500 text-white'
                     : 'bg-gray-200 text-gray-500'
@@ -223,7 +225,7 @@ export default function ForgotPassword() {
           </div>
 
           {/* Form Card */}
-          <div className="bg-white/70 backdrop-blur-xl rounded-3xl border border-white/50 shadow-xl shadow-purple-500/10 p-8">
+          <div className="bg-white/70 backdrop-blur-xl rounded-3xl border border-white/50 shadow-xl shadow-cyan-500/10 p-8">
             <AnimatePresence mode="wait">
               {/* Step 0: Choose recovery channel */}
               {step === 'choose' && (
@@ -249,10 +251,10 @@ export default function ForgotPassword() {
                       <button
                         key={opt.ch}
                         onClick={() => { setChannel(opt.ch); setStep('input'); }}
-                        className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-200 hover:border-purple-400 hover:bg-purple-50/50 transition-all text-left"
+                        className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-200 hover:border-cyan-400 hover:bg-cyan-50/50 transition-all text-left"
                       >
-                        <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
-                          <opt.icon className="w-5 h-5 text-purple-600" />
+                        <div className="w-10 h-10 rounded-lg bg-cyan-100 flex items-center justify-center shrink-0">
+                          <opt.icon className="w-5 h-5 text-cyan-600" />
                         </div>
                         <div>
                           <div className="font-medium text-gray-900">{opt.label}</div>
@@ -263,7 +265,7 @@ export default function ForgotPassword() {
                   </div>
 
                   <div className="mt-6 text-center">
-                    <Link href="/login" className="text-purple-600 hover:text-purple-700 font-medium inline-flex items-center gap-1">
+                    <Link href="/login" className="text-cyan-600 hover:text-cyan-700 font-medium inline-flex items-center gap-1">
                       <ArrowLeft className="w-4 h-4" />
                       Back to Sign In
                     </Link>
@@ -299,7 +301,7 @@ export default function ForgotPassword() {
                               placeholder="+66812345678"
                               value={phone}
                               onChange={(e) => setPhone(e.target.value)}
-                              className="pl-10 h-12 bg-white/50 border-gray-200 focus:border-purple-500 focus:ring-purple-500"
+                              className="pl-10 h-12 bg-white/50 border-gray-200 focus:border-cyan-500 focus:ring-cyan-500"
                             />
                           </div>
                         </>
@@ -314,7 +316,7 @@ export default function ForgotPassword() {
                               placeholder="you@example.com"
                               value={email}
                               onChange={(e) => setEmail(e.target.value)}
-                              className="pl-10 h-12 bg-white/50 border-gray-200 focus:border-purple-500 focus:ring-purple-500"
+                              className="pl-10 h-12 bg-white/50 border-gray-200 focus:border-cyan-500 focus:ring-cyan-500"
                             />
                           </div>
                         </>
@@ -324,7 +326,7 @@ export default function ForgotPassword() {
                     <Button
                       type="submit"
                       disabled={isLoading}
-                      className="w-full h-12 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-medium"
+                      className="w-full h-12 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-medium"
                     >
                       {isLoading ? (
                         <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Sending...</>
@@ -335,7 +337,7 @@ export default function ForgotPassword() {
                   </form>
 
                   <div className="mt-6 text-center">
-                    <button onClick={() => setStep('choose')} className="text-purple-600 hover:text-purple-700 font-medium inline-flex items-center gap-1">
+                    <button onClick={() => setStep('choose')} className="text-cyan-600 hover:text-cyan-700 font-medium inline-flex items-center gap-1">
                       <ArrowLeft className="w-4 h-4" /> Choose another method
                     </button>
                   </div>
@@ -350,8 +352,8 @@ export default function ForgotPassword() {
                   animate={{ opacity: 1, x: 0 }}
                   exit={{ opacity: 0, x: -20 }}
                 >
-                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center mx-auto mb-6">
-                    <Mail className="w-8 h-8 text-purple-600" />
+                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center mx-auto mb-6">
+                    <Mail className="w-8 h-8 text-cyan-600" />
                   </div>
 
                   <h2 className="text-2xl font-bold text-gray-900 mb-2 text-center">
@@ -371,7 +373,7 @@ export default function ForgotPassword() {
                         placeholder="000000"
                         value={code}
                         onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
-                        className="h-12 text-center text-2xl tracking-widest bg-white/50 border-gray-200 focus:border-purple-500 focus:ring-purple-500"
+                        className="h-12 text-center text-2xl tracking-widest bg-white/50 border-gray-200 focus:border-cyan-500 focus:ring-cyan-500"
                         maxLength={6}
                       />
                     </div>
@@ -379,7 +381,7 @@ export default function ForgotPassword() {
                     <Button
                       type="submit"
                       disabled={isLoading || code.length !== 6}
-                      className="w-full h-12 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-medium"
+                      className="w-full h-12 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-medium"
                     >
                       {isLoading ? (
                         <>
@@ -397,7 +399,7 @@ export default function ForgotPassword() {
                       onClick={() => setStep('input')}
                       className="text-gray-500 hover:text-gray-700 text-sm"
                     >
-                      Didn't receive the code? <span className="text-purple-600 font-medium">Resend</span>
+                      Didn't receive the code? <span className="text-cyan-600 font-medium">Resend</span>
                     </button>
                   </div>
                 </motion.div>
@@ -429,7 +431,7 @@ export default function ForgotPassword() {
                           placeholder="••••••••"
                           value={newPassword}
                           onChange={(e) => setNewPassword(e.target.value)}
-                          className="pl-10 h-12 bg-white/50 border-gray-200 focus:border-purple-500 focus:ring-purple-500"
+                          className="pl-10 h-12 bg-white/50 border-gray-200 focus:border-cyan-500 focus:ring-cyan-500"
                         />
                       </div>
                     </div>
@@ -444,7 +446,7 @@ export default function ForgotPassword() {
                           placeholder="••••••••"
                           value={confirmPassword}
                           onChange={(e) => setConfirmPassword(e.target.value)}
-                          className="pl-10 h-12 bg-white/50 border-gray-200 focus:border-purple-500 focus:ring-purple-500"
+                          className="pl-10 h-12 bg-white/50 border-gray-200 focus:border-cyan-500 focus:ring-cyan-500"
                         />
                       </div>
                     </div>
@@ -483,7 +485,7 @@ export default function ForgotPassword() {
                     <Button
                       type="submit"
                       disabled={isLoading}
-                      className="w-full h-12 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-medium"
+                      className="w-full h-12 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-medium"
                     >
                       {isLoading ? (
                         <>
@@ -518,7 +520,7 @@ export default function ForgotPassword() {
                   </p>
 
                   <Link href="/login">
-                    <Button className="w-full h-12 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-medium">
+                    <Button className="w-full h-12 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-medium">
                       Sign In Now
                     </Button>
                   </Link>
diff --git a/apps/web/client/src/pages/Login.tsx b/apps/web/client/src/pages/Login.tsx
index c4800bba..537109f3 100644
--- a/apps/web/client/src/pages/Login.tsx
+++ b/apps/web/client/src/pages/Login.tsx
@@ -6,6 +6,7 @@
 import { useState, useEffect } from 'react';
 import { motion } from 'framer-motion';
 import { Link, useLocation } from 'wouter';
+import { useTranslation } from 'react-i18next';
 import { generateFingerprint } from '@/lib/fingerprint';
 import { getPostHog } from '@/lib/posthog';
 import { useAuth } from '@/_core/hooks/useAuth';
@@ -29,6 +30,7 @@ import {
 } from 'lucide-react';
 
 export default function Login() {
+  const { t } = useTranslation('auth');
   const [, navigate] = useLocation();
   const { user, loading: authLoading } = useAuth();
 
@@ -317,10 +319,10 @@ export default function Login() {
             </Link>
 
             <h1 className="text-4xl font-bold mb-6">
-              Welcome back to the future of development
+              {t('login.title')}
             </h1>
             <p className="text-xl text-white/80 mb-8">
-              Sign in to continue building amazing applications with AI-powered tools.
+              {t('login.subtitle')}
             </p>
 
             {/* Features List */}
@@ -477,7 +479,7 @@ export default function Login() {
             ) : (
             <>
             <div className="text-center mb-8">
-              <h2 className="text-2xl font-bold text-gray-900 mb-2">Sign in to your account</h2>
+              <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('login.signIn')}</h2>
               <p className="text-gray-600">
                 Don't have an account?{' '}
                 <Link href="/signup" className="text-purple-600 hover:text-purple-700 font-medium">
diff --git a/apps/web/client/src/pages/Signup.tsx b/apps/web/client/src/pages/Signup.tsx
index 7a29cc30..41cca14d 100644
--- a/apps/web/client/src/pages/Signup.tsx
+++ b/apps/web/client/src/pages/Signup.tsx
@@ -6,6 +6,7 @@
 import { useState, useEffect, useMemo } from 'react';
 import { motion } from 'framer-motion';
 import { Link, useLocation } from 'wouter';
+import { useTranslation } from 'react-i18next';
 import { generateFingerprint } from '@/lib/fingerprint';
 import { getPostHog } from '@/lib/posthog';
 import { useAuth } from '@/_core/hooks/useAuth';
@@ -71,6 +72,7 @@ const plans: Plan[] = [
 ];
 
 export default function Signup() {
+  const { t } = useTranslation('auth');
   const [, navigate] = useLocation();
   const { user, loading: authLoading } = useAuth();
   const [step, setStep] = useState<1 | 2>(1);
diff --git a/apps/web/client/src/pages/VerifyEmail.tsx b/apps/web/client/src/pages/VerifyEmail.tsx
index b1327d22..523d7920 100644
--- a/apps/web/client/src/pages/VerifyEmail.tsx
+++ b/apps/web/client/src/pages/VerifyEmail.tsx
@@ -6,6 +6,7 @@
 import { useState, useEffect, useRef } from 'react';
 import { motion } from 'framer-motion';
 import { Link, useLocation } from 'wouter';
+import { useTranslation } from 'react-i18next';
 import { Button } from '@/components/ui/button';
 import { toast } from 'sonner';
 import {
