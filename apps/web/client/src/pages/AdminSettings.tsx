/**
 * Admin Settings Page
 * Manage platform configuration: Stripe, Invoice, etc.
 */

import { useState, useEffect, Fragment } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "../lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Settings,
  CreditCard,
  Key,
  Check,
  X,
  Save,
  TestTube,
  Loader2,
  ChevronLeft,
  Eye,
  EyeOff,
  Globe,
  Mail,
  Trash2,
  Users,
  Shield,
  MessageSquare,
  UserPlus,
  Lock,
  Mic,
  ExternalLink,
  TestTube2,
  Menu,
} from "lucide-react";
import { defaultMenuItems, type MenuItem as SharedMenuItem, type UserRole } from "@smartspec/shared";

interface StripeSettings {
  secretKey?: string;
  secretKeyConfigured?: string;
  publishableKey?: string;
  webhookSecret?: string;
  webhookSecretConfigured?: string;
  currency?: string;
}

export default function AdminSettings() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("stripe");

  // Stripe settings state
  const [stripeForm, setStripeForm] = useState<StripeSettings>({
    currency: "usd",
  });
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);

  // Registration settings state
  const [regForm, setRegForm] = useState({
    signupBonusCredits: 100,
    firstUserBonusCredits: 10000,
    autoAssignTenant: true,
  });

  // SMTP settings state
  const [smtpForm, setSmtpForm] = useState({
    host: "", port: 587, secure: false, user: "", pass: "", fromName: "SmartSpec Pro", fromEmail: "",
  });
  const [showSmtpPass, setShowSmtpPass] = useState(false);

  // OAuth settings state
  const [oauthForm, setOauthForm] = useState<{
    googleClientId?: string;
    googleClientSecret?: string;
    googleRedirectUri?: string;
    githubClientId?: string;
    githubClientSecret?: string;
    githubRedirectUri?: string;
  }>({});
  const [showGoogleSecret, setShowGoogleSecret] = useState(false);
  const [showGithubSecret, setShowGithubSecret] = useState(false);
  const [googleSecretConfigured, setGoogleSecretConfigured] = useState(false);
  const [githubSecretConfigured, setGithubSecretConfigured] = useState(false);

  // Queries
  const { data: stripeSettings, isLoading: stripeLoading, refetch: refetchStripe } =
    trpc.systemSettings.getStripeSettings.useQuery(undefined, {
      enabled: !!user && user.role === "admin",
    });

  // Mutations
  const updateStripeMutation = trpc.systemSettings.updateStripeSettings.useMutation({
    onSuccess: () => {
      toast.success("Stripe settings saved successfully");
      refetchStripe();
    },
    onError: (err) => {
      toast.error(`Failed to save Stripe settings: ${err.message}`);
    },
  });

  const testStripeMutation = trpc.systemSettings.testStripeConnection.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(data.message);
      } else {
        toast.error(data.message);
      }
    },
    onError: (err) => {
      toast.error(`Test failed: ${err.message}`);
    },
  });

  // OAuth queries & mutations
  const { data: oauthSettings, isLoading: oauthLoading, refetch: refetchOAuth } =
    trpc.systemSettings.getOAuthSettings.useQuery(undefined, {
      enabled: !!user && user.role === "admin",
    });

  const updateOAuthMutation = trpc.systemSettings.updateOAuthSettings.useMutation({
    onSuccess: () => {
      toast.success("OAuth settings saved successfully");
      refetchOAuth();
      setOauthForm((prev) => ({ ...prev, googleClientSecret: undefined, githubClientSecret: undefined }));
    },
    onError: (err) => {
      toast.error(`Failed to save OAuth settings: ${err.message}`);
    },
  });

  // Registration settings query & mutation
  const { data: regSettings, refetch: refetchReg } =
    trpc.systemSettings.getRegistrationSettings.useQuery(undefined, {
      enabled: !!user && user.role === "admin",
    });

  const updateRegMutation = trpc.systemSettings.updateRegistrationSettings.useMutation({
    onSuccess: () => {
      toast.success("Registration settings saved successfully");
      refetchReg();
    },
    onError: (err: any) => {
      toast.error(`Failed to save: ${err.message}`);
    },
  });

  // Load registration settings
  useEffect(() => {
    if (regSettings) {
      setRegForm({
        signupBonusCredits: regSettings.signupBonusCredits,
        firstUserBonusCredits: regSettings.firstUserBonusCredits,
        autoAssignTenant: regSettings.autoAssignTenant,
      });
    }
  }, [regSettings]);

  // SMTP settings query & mutations
  const { data: smtpSettings, refetch: refetchSmtp } =
    trpc.systemSettings.getSmtpSettings.useQuery(undefined, {
      enabled: !!user && user.role === "admin",
    });

  const updateSmtpMutation = trpc.systemSettings.updateSmtpSettings.useMutation({
    onSuccess: () => { toast.success("SMTP settings saved"); refetchSmtp(); },
    onError: (err: any) => { toast.error(`Failed: ${err.message}`); },
  });

  const testSmtpMutation = trpc.systemSettings.testSmtpConnection.useMutation({
    onSuccess: (data) => { data.success ? toast.success(data.message) : toast.error(data.message); },
    onError: (err: any) => { toast.error(`Test failed: ${err.message}`); },
  });

  useEffect(() => {
    if (smtpSettings) {
      setSmtpForm((prev) => ({
        ...prev,
        host: smtpSettings.host,
        port: smtpSettings.port,
        secure: smtpSettings.secure,
        user: smtpSettings.user,
        fromName: smtpSettings.fromName,
        fromEmail: smtpSettings.fromEmail,
      }));
    }
  }, [smtpSettings]);

  // SMS settings query & mutations
  const [smsForm, setSmsForm] = useState({ provider: "twilio" as "twilio" | "vonage", accountSid: "", authToken: "", fromNumber: "", testNumber: "" });
  const { data: smsSettings, refetch: refetchSms } =
    trpc.systemSettings.getSmsSettings.useQuery(undefined, { enabled: !!user && user.role === "admin" });

  const updateSmsMutation = trpc.systemSettings.updateSmsSettings.useMutation({
    onSuccess: () => { toast.success("SMS settings saved"); refetchSms(); },
    onError: (err: any) => { toast.error(`Failed: ${err.message}`); },
  });

  const testSmsMutation = trpc.systemSettings.testSms.useMutation({
    onSuccess: (data) => { data.success ? toast.success(data.message) : toast.error(data.message); },
    onError: (err: any) => { toast.error(`Test failed: ${err.message}`); },
  });

  useEffect(() => {
    if (smsSettings) {
      setSmsForm((prev) => ({
        ...prev,
        provider: (smsSettings.provider as "twilio" | "vonage") || "twilio",
        accountSid: smsSettings.accountSid || "",
        fromNumber: smsSettings.fromNumber || "",
      }));
    }
  }, [smsSettings]);

  // 2FA settings
  const [twoFaForm, setTwoFaForm] = useState({ enabled: true, enforced: false, issuer: "SmartSpec Pro", backupCodesCount: 10 });
  const { data: twoFaSettings, refetch: refetchTwoFa } =
    trpc.systemSettings.getTwoFaSettings.useQuery(undefined, { enabled: !!user && user.role === "admin" });
  const updateTwoFaMutation = trpc.systemSettings.updateTwoFaSettings.useMutation({
    onSuccess: () => { toast.success("2FA settings saved"); refetchTwoFa(); },
    onError: (err: any) => { toast.error(`Failed: ${err.message}`); },
  });
  useEffect(() => {
    if (twoFaSettings) {
      setTwoFaForm({
        enabled: twoFaSettings.enabled ?? true,
        enforced: twoFaSettings.enforced ?? false,
        issuer: twoFaSettings.issuer || "SmartSpec Pro",
        backupCodesCount: twoFaSettings.backupCodesCount || 10,
      });
    }
  }, [twoFaSettings]);

  // STT Providers state & queries
  const [sttEditId, setSttEditId] = useState<number | null>(null);
  const [sttApiKey, setSttApiKey] = useState("");
  const [showSttApiKey, setShowSttApiKey] = useState(false);

  const { data: sttProviders, refetch: refetchStt } = trpc.sttProviders.list.useQuery(undefined, {
    enabled: !!user && user.role === "admin",
  });
  const { data: sttTemplates } = trpc.sttProviders.templates.useQuery(undefined, {
    enabled: !!user && user.role === "admin",
  });

  const sttUpsertMutation = trpc.sttProviders.upsert.useMutation({
    onSuccess: () => { toast.success("STT provider saved"); refetchStt(); setSttEditId(null); setSttApiKey(""); },
    onError: (err: any) => toast.error(err.message),
  });
  const sttDeleteMutation = trpc.sttProviders.delete.useMutation({
    onSuccess: () => { toast.success("STT provider removed"); refetchStt(); },
    onError: (err: any) => toast.error(err.message),
  });
  const sttToggleMutation = trpc.sttProviders.toggleEnabled.useMutation({
    onSuccess: () => refetchStt(),
    onError: (err: any) => toast.error(err.message),
  });
  const sttTestMutation = trpc.sttProviders.testConnection.useMutation({
    onSuccess: (data) => { data.success ? toast.success(data.message) : toast.error(data.message); },
    onError: (err: any) => toast.error(err.message),
  });

  // Load settings into form
  useEffect(() => {
    if (stripeSettings) {
      setStripeForm({
        publishableKey: stripeSettings.publishableKey || "",
        currency: stripeSettings.currency || "usd",
        secretKeyConfigured: stripeSettings.secretKeyConfigured,
        webhookSecretConfigured: stripeSettings.webhookSecretConfigured,
      });
    }
  }, [stripeSettings]);

  useEffect(() => {
    if (oauthSettings) {
      setOauthForm({
        googleClientId: (oauthSettings.googleClientId as string) || "",
        googleRedirectUri: (oauthSettings.googleRedirectUri as string) || "",
        githubClientId: (oauthSettings.githubClientId as string) || "",
        githubRedirectUri: (oauthSettings.githubRedirectUri as string) || "",
      });
      setGoogleSecretConfigured(!!oauthSettings.googleClientSecretConfigured);
      setGithubSecretConfigured(!!oauthSettings.githubClientSecretConfigured);
    }
  }, [oauthSettings]);

  const isAdmin = user?.role === "admin";

  // Redirect if not admin
  useEffect(() => {
    if (!authLoading && !isAdmin) {
      setLocation("/");
    }
  }, [user, authLoading, setLocation, isAdmin]);

  if (authLoading || !user || !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

  const handleSaveStripe = () => {
    updateStripeMutation.mutate({
      secretKey: stripeForm.secretKey,
      publishableKey: stripeForm.publishableKey,
      webhookSecret: stripeForm.webhookSecret,
      currency: stripeForm.currency,
    });
  };

  const handleSaveOAuth = () => {
    updateOAuthMutation.mutate({
      googleClientId: oauthForm.googleClientId,
      googleClientSecret: oauthForm.googleClientSecret,
      googleRedirectUri: oauthForm.googleRedirectUri,
      githubClientId: oauthForm.githubClientId,
      githubClientSecret: oauthForm.githubClientSecret,
      githubRedirectUri: oauthForm.githubRedirectUri,
    });
  };

  const navItems = [
    { key: "stripe", label: "Payments", sublabel: "Stripe API Keys", icon: CreditCard },
    { key: "oauth", label: "OAuth", sublabel: "Social Login", icon: Globe },
    { key: "registration", label: "Registration", sublabel: "Signup & Credits", icon: UserPlus },
    { key: "smtp", label: "Email", sublabel: "SMTP Settings", icon: Mail },
    { key: "sms", label: "SMS", sublabel: "Provider Config", icon: MessageSquare },
    { key: "2fa", label: "2FA", sublabel: "Authenticator", icon: Shield },
    { key: "stt", label: "STT", sublabel: "Speech-to-Text", icon: Mic },
    { key: "menu", label: "Main Menu", sublabel: "Visibility Control", icon: Menu },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50/30">
      {/* Top Header */}
      <div className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="px-4 sm:px-6 lg:px-8 py-4 flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/dashboard")}
            className="text-gray-500 hover:text-gray-900 -ml-2"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Dashboard
          </Button>
          <div className="h-5 w-px bg-gray-200" />
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-md shadow-purple-200/50">
              <Settings className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Platform Settings</h1>
              <p className="text-xs text-gray-500">Configure integrations and security</p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex gap-6">
          {/* Sidebar Navigation */}
          <nav className="w-56 flex-shrink-0">
            <div className="sticky top-24 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => setActiveTab(item.key)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150 ${
                      isActive
                        ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-md shadow-purple-200/50"
                        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                    }`}
                  >
                    <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-white/90" : "text-gray-400"}`} />
                    <div className="min-w-0">
                      <div className={`text-sm font-medium truncate ${isActive ? "text-white" : ""}`}>{item.label}</div>
                      <div className={`text-xs truncate ${isActive ? "text-white/70" : "text-gray-400"}`}>{item.sublabel}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </nav>

          {/* Main Content */}
          <div className="flex-1 min-w-0">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="hidden"></TabsList>

          {/* Stripe Settings Tab */}
          <TabsContent value="stripe">
            <Card className="border-0 shadow-sm shadow-gray-200/50 rounded-2xl overflow-hidden">
              <CardHeader className="border-b bg-gradient-to-r from-purple-50/50 to-pink-50/30 pb-5">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CreditCard className="w-5 h-5 text-purple-500" />
                  Stripe Configuration
                </CardTitle>
                <CardDescription>
                  Configure your Stripe API keys for payment processing. Get your keys from the{" "}
                  <a
                    href="https://dashboard.stripe.com/apikeys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-600 hover:underline"
                  >
                    Stripe Dashboard
                  </a>
                  .
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Publishable Key */}
                <div>
                  <Label htmlFor="publishableKey">Publishable Key</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      id="publishableKey"
                      placeholder="pk_test_..."
                      value={stripeForm.publishableKey || ""}
                      onChange={(e) =>
                        setStripeForm((prev) => ({ ...prev, publishableKey: e.target.value }))
                      }
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Used in the frontend for Stripe.js integration
                  </p>
                </div>

                {/* Secret Key */}
                <div>
                  <Label htmlFor="secretKey">
                    Secret Key
                    {stripeForm.secretKeyConfigured && (
                      <Badge variant="outline" className="ml-2 text-green-600 border-green-600">
                        <Check className="w-3 h-3 mr-1" />
                        Configured
                      </Badge>
                    )}
                  </Label>
                  <div className="flex gap-2 mt-1">
                    <div className="relative flex-1">
                      <Input
                        id="secretKey"
                        type={showSecretKey ? "text" : "password"}
                        placeholder={stripeForm.secretKeyConfigured ? "Enter new key to update..." : "sk_test_..."}
                        value={stripeForm.secretKey || ""}
                        onChange={(e) =>
                          setStripeForm((prev) => ({ ...prev, secretKey: e.target.value }))
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-1 top-1/2 -translate-y-1/2"
                        onClick={() => setShowSecretKey(!showSecretKey)}
                      >
                        {showSecretKey ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Keep this secret. Never expose in frontend code.
                  </p>
                </div>

                {/* Webhook Secret */}
                <div>
                  <Label htmlFor="webhookSecret">
                    Webhook Secret
                    {stripeForm.webhookSecretConfigured && (
                      <Badge variant="outline" className="ml-2 text-green-600 border-green-600">
                        <Check className="w-3 h-3 mr-1" />
                        Configured
                      </Badge>
                    )}
                  </Label>
                  <div className="flex gap-2 mt-1">
                    <div className="relative flex-1">
                      <Input
                        id="webhookSecret"
                        type={showWebhookSecret ? "text" : "password"}
                        placeholder={stripeForm.webhookSecretConfigured ? "Enter new secret to update..." : "whsec_..."}
                        value={stripeForm.webhookSecret || ""}
                        onChange={(e) =>
                          setStripeForm((prev) => ({ ...prev, webhookSecret: e.target.value }))
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-1 top-1/2 -translate-y-1/2"
                        onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                      >
                        {showWebhookSecret ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Required for receiving Stripe webhook events
                  </p>
                </div>

                {/* Currency */}
                <div>
                  <Label htmlFor="currency">Currency</Label>
                  <Select
                    value={stripeForm.currency || "usd"}
                    onValueChange={(value) =>
                      setStripeForm((prev) => ({ ...prev, currency: value }))
                    }
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="usd">USD - US Dollar</SelectItem>
                      <SelectItem value="eur">EUR - Euro</SelectItem>
                      <SelectItem value="gbp">GBP - British Pound</SelectItem>
                      <SelectItem value="thb">THB - Thai Baht</SelectItem>
                      <SelectItem value="jpy">JPY - Japanese Yen</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-4 border-t">
                  <Button
                    onClick={handleSaveStripe}
                    disabled={updateStripeMutation.isPending}
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    {updateStripeMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    Save Settings
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => testStripeMutation.mutate()}
                    disabled={testStripeMutation.isPending}
                  >
                    {testStripeMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <TestTube className="w-4 h-4 mr-2" />
                    )}
                    Test Connection
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* OAuth Settings Tab */}
          <TabsContent value="oauth">
            <Card className="border-0 shadow-sm shadow-gray-200/50 rounded-2xl overflow-hidden">
              <CardHeader className="border-b bg-gradient-to-r from-purple-50/50 to-pink-50/30 pb-5">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Globe className="w-5 h-5 text-purple-500" />
                  OAuth / Social Login Configuration
                </CardTitle>
                <CardDescription>
                  Configure Google and GitHub OAuth credentials for social login.
                  Users will be able to sign in with these providers once configured.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-8">
                {/* Google OAuth */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Globe className="w-5 h-5" />
                    Google OAuth
                  </h3>
                  <div>
                    <Label htmlFor="googleClientId">Client ID</Label>
                    <Input
                      id="googleClientId"
                      placeholder="xxxxx.apps.googleusercontent.com"
                      value={oauthForm.googleClientId || ""}
                      onChange={(e) =>
                        setOauthForm((prev) => ({ ...prev, googleClientId: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="googleClientSecret">
                      Client Secret
                      {googleSecretConfigured && (
                        <Badge variant="outline" className="ml-2 text-green-600 border-green-600">
                          <Check className="w-3 h-3 mr-1" />
                          Configured
                        </Badge>
                      )}
                    </Label>
                    <div className="relative">
                      <Input
                        id="googleClientSecret"
                        type={showGoogleSecret ? "text" : "password"}
                        placeholder={googleSecretConfigured ? "Enter new secret to update..." : "GOCSPX-..."}
                        value={oauthForm.googleClientSecret || ""}
                        onChange={(e) =>
                          setOauthForm((prev) => ({ ...prev, googleClientSecret: e.target.value }))
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-1 top-1/2 -translate-y-1/2"
                        onClick={() => setShowGoogleSecret(!showGoogleSecret)}
                      >
                        {showGoogleSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="googleRedirectUri">Redirect URI</Label>
                    <Input
                      id="googleRedirectUri"
                      placeholder="http://localhost:3000/auth/callback/google"
                      value={oauthForm.googleRedirectUri || ""}
                      onChange={(e) =>
                        setOauthForm((prev) => ({ ...prev, googleRedirectUri: e.target.value }))
                      }
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Must match the authorized redirect URI in Google Cloud Console
                    </p>
                  </div>
                </div>

                {/* GitHub OAuth */}
                <div className="space-y-4 pt-6 border-t">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Key className="w-5 h-5" />
                    GitHub OAuth
                  </h3>
                  <div>
                    <Label htmlFor="githubClientId">Client ID</Label>
                    <Input
                      id="githubClientId"
                      placeholder="Iv1.xxxxxxxxxxxxxxxx"
                      value={oauthForm.githubClientId || ""}
                      onChange={(e) =>
                        setOauthForm((prev) => ({ ...prev, githubClientId: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="githubClientSecret">
                      Client Secret
                      {githubSecretConfigured && (
                        <Badge variant="outline" className="ml-2 text-green-600 border-green-600">
                          <Check className="w-3 h-3 mr-1" />
                          Configured
                        </Badge>
                      )}
                    </Label>
                    <div className="relative">
                      <Input
                        id="githubClientSecret"
                        type={showGithubSecret ? "text" : "password"}
                        placeholder={githubSecretConfigured ? "Enter new secret to update..." : "Enter GitHub client secret"}
                        value={oauthForm.githubClientSecret || ""}
                        onChange={(e) =>
                          setOauthForm((prev) => ({ ...prev, githubClientSecret: e.target.value }))
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-1 top-1/2 -translate-y-1/2"
                        onClick={() => setShowGithubSecret(!showGithubSecret)}
                      >
                        {showGithubSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="githubRedirectUri">Redirect URI</Label>
                    <Input
                      id="githubRedirectUri"
                      placeholder="http://localhost:3000/auth/callback/github"
                      value={oauthForm.githubRedirectUri || ""}
                      onChange={(e) =>
                        setOauthForm((prev) => ({ ...prev, githubRedirectUri: e.target.value }))
                      }
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Must match the authorization callback URL in GitHub OAuth App settings
                    </p>
                  </div>
                </div>

                {/* Save Button */}
                <div className="flex gap-3 pt-4 border-t">
                  <Button
                    onClick={handleSaveOAuth}
                    disabled={updateOAuthMutation.isPending}
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    {updateOAuthMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    Save OAuth Settings
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          {/* SMTP Settings Tab */}
          <TabsContent value="smtp">
            <Card className="border-0 shadow-sm shadow-gray-200/50 rounded-2xl overflow-hidden">
              <CardHeader className="border-b bg-gradient-to-r from-purple-50/50 to-pink-50/30 pb-5">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Mail className="w-5 h-5 text-purple-500" />
                  Email / SMTP Settings
                </CardTitle>
                <CardDescription>
                  Configure SMTP to send verification and password reset emails. Without SMTP, codes are logged to server console only.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {smtpSettings?.configured && (
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    <Check className="w-3 h-3 mr-1" /> SMTP Configured
                  </Badge>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>SMTP Host</Label>
                    <Input
                      placeholder="smtp.gmail.com"
                      value={smtpForm.host}
                      onChange={(e) => setSmtpForm((p) => ({ ...p, host: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Port</Label>
                    <Input
                      type="number"
                      value={smtpForm.port}
                      onChange={(e) => setSmtpForm((p) => ({ ...p, port: parseInt(e.target.value) || 587 }))}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Username / Email</Label>
                    <Input
                      placeholder="you@gmail.com"
                      value={smtpForm.user}
                      onChange={(e) => setSmtpForm((p) => ({ ...p, user: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Password / App Password</Label>
                    <div className="relative mt-1">
                      <Input
                        type={showSmtpPass ? "text" : "password"}
                        placeholder={smtpSettings?.configured ? "••••••••  (leave blank to keep)" : "Enter password"}
                        value={smtpForm.pass}
                        onChange={(e) => setSmtpForm((p) => ({ ...p, pass: e.target.value }))}
                      />
                      <button
                        type="button"
                        onClick={() => setShowSmtpPass(!showSmtpPass)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                      >
                        {showSmtpPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <Label>From Name</Label>
                    <Input
                      placeholder="SmartSpec Pro"
                      value={smtpForm.fromName}
                      onChange={(e) => setSmtpForm((p) => ({ ...p, fromName: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>From Email</Label>
                    <Input
                      placeholder="noreply@example.com"
                      value={smtpForm.fromEmail}
                      onChange={(e) => setSmtpForm((p) => ({ ...p, fromEmail: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    id="smtpSecure"
                    type="checkbox"
                    checked={smtpForm.secure}
                    onChange={(e) => setSmtpForm((p) => ({ ...p, secure: e.target.checked }))}
                    className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                  />
                  <Label htmlFor="smtpSecure">Use SSL/TLS (port 465)</Label>
                </div>

                {/* Gmail SMTP guide */}
                <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 text-sm space-y-3">
                  <p className="font-semibold text-blue-800">Gmail SMTP Guide (smtp.gmail.com)</p>
                  <p className="text-blue-700">
                    ต้องใช้ <strong>App Password</strong> (ไม่ใช่รหัส Gmail ปกติ) — สร้างได้ที่{' '}
                    <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" className="underline font-medium">
                      myaccount.google.com/apppasswords
                    </a>{' '}
                    (ต้องเปิด 2-Step Verification ก่อน)
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-md border border-blue-200 bg-white p-3">
                      <p className="font-semibold text-blue-900 mb-1">Option A — STARTTLS</p>
                      <ul className="text-blue-700 space-y-0.5 text-xs">
                        <li>Port: <code className="bg-blue-100 px-1 rounded">587</code></li>
                        <li>SSL/TLS: <strong>ปิด</strong> (unchecked)</li>
                        <li className="text-blue-500 italic">เข้ารหัสอัตโนมัติผ่าน STARTTLS</li>
                      </ul>
                    </div>
                    <div className="rounded-md border border-blue-200 bg-white p-3">
                      <p className="font-semibold text-blue-900 mb-1">Option B — Direct SSL</p>
                      <ul className="text-blue-700 space-y-0.5 text-xs">
                        <li>Port: <code className="bg-blue-100 px-1 rounded">465</code></li>
                        <li>SSL/TLS: <strong>เปิด</strong> (checked)</li>
                        <li className="text-blue-500 italic">เชื่อมต่อ SSL/TLS โดยตรง</li>
                      </ul>
                    </div>
                  </div>
                  <p className="text-blue-600 text-xs">
                    ขีดจำกัด: Gmail ฟรี ~500 email/วัน • Google Workspace ~2,000/วัน • From Email ต้องเป็น Gmail address เดียวกับ Username
                  </p>
                </div>

                <div className="flex gap-3 justify-end">
                  <Button
                    variant="outline"
                    onClick={() => testSmtpMutation.mutate()}
                    disabled={testSmtpMutation.isPending}
                  >
                    {testSmtpMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Testing...</>
                    ) : (
                      <><TestTube className="w-4 h-4 mr-2" /> Test Connection</>
                    )}
                  </Button>
                  <Button
                    onClick={() => updateSmtpMutation.mutate({
                      host: smtpForm.host,
                      port: smtpForm.port,
                      secure: smtpForm.secure,
                      user: smtpForm.user,
                      pass: smtpForm.pass || undefined,
                      fromName: smtpForm.fromName,
                      fromEmail: smtpForm.fromEmail,
                    })}
                    disabled={updateSmtpMutation.isPending}
                    className="bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600"
                  >
                    {updateSmtpMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
                    ) : (
                      <><Save className="w-4 h-4 mr-2" /> Save SMTP Settings</>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* SMS Provider Settings Tab */}
          <TabsContent value="sms">
            <Card className="border-0 shadow-sm shadow-gray-200/50 rounded-2xl overflow-hidden">
              <CardHeader className="border-b bg-gradient-to-r from-purple-50/50 to-pink-50/30 pb-5">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <MessageSquare className="w-5 h-5 text-purple-500" />
                  SMS Provider Settings
                </CardTitle>
                <CardDescription>
                  Configure SMS provider for phone verification and password reset via SMS. Without SMS config, codes are logged to server console only.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {smsSettings?.configured && (
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    <Check className="w-3 h-3 mr-1" /> SMS Configured
                  </Badge>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Provider</Label>
                    <select
                      value={smsForm.provider}
                      onChange={(e) => setSmsForm((p) => ({ ...p, provider: e.target.value as "twilio" | "vonage" }))}
                      className="mt-1 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:border-purple-400 focus:ring-purple-400"
                    >
                      <option value="twilio">Twilio</option>
                      <option value="vonage">Vonage (Nexmo)</option>
                    </select>
                  </div>
                  <div>
                    <Label>{smsForm.provider === "twilio" ? "Account SID" : "API Key"}</Label>
                    <Input
                      placeholder={smsForm.provider === "twilio" ? "ACxxxxxxxxxxxxxxxx" : "API Key"}
                      value={smsForm.accountSid}
                      onChange={(e) => setSmsForm((p) => ({ ...p, accountSid: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>{smsForm.provider === "twilio" ? "Auth Token" : "API Secret"}</Label>
                    <Input
                      type="password"
                      placeholder={smsSettings?.configured ? "••••••••  (leave blank to keep)" : "Enter token/secret"}
                      value={smsForm.authToken}
                      onChange={(e) => setSmsForm((p) => ({ ...p, authToken: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>From Number</Label>
                    <Input
                      placeholder="+1234567890"
                      value={smsForm.fromNumber}
                      onChange={(e) => setSmsForm((p) => ({ ...p, fromNumber: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                </div>

                {/* Test SMS */}
                <div className="rounded-lg border border-gray-200 p-4">
                  <Label className="mb-2 block">Send Test SMS</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="+66812345678"
                      value={smsForm.testNumber}
                      onChange={(e) => setSmsForm((p) => ({ ...p, testNumber: e.target.value }))}
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      onClick={() => testSmsMutation.mutate({ testNumber: smsForm.testNumber })}
                      disabled={testSmsMutation.isPending || !smsForm.testNumber}
                    >
                      {testSmsMutation.isPending ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending...</>
                      ) : (
                        <><TestTube className="w-4 h-4 mr-2" /> Send Test</>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Provider guide */}
                <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 text-sm space-y-2">
                  <p className="font-semibold text-blue-800">
                    {smsForm.provider === "twilio" ? "Twilio Setup" : "Vonage Setup"}
                  </p>
                  {smsForm.provider === "twilio" ? (
                    <ul className="text-blue-700 space-y-1 text-xs list-disc pl-4">
                      <li>สมัครที่ <a href="https://www.twilio.com/console" target="_blank" rel="noopener noreferrer" className="underline font-medium">twilio.com/console</a></li>
                      <li>คัดลอก Account SID และ Auth Token จาก Dashboard</li>
                      <li>ซื้อเบอร์โทร (Phone Number) สำหรับส่ง SMS</li>
                      <li>Trial account ส่งได้เฉพาะเบอร์ที่ verify แล้ว</li>
                    </ul>
                  ) : (
                    <ul className="text-blue-700 space-y-1 text-xs list-disc pl-4">
                      <li>สมัครที่ <a href="https://dashboard.nexmo.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">dashboard.nexmo.com</a></li>
                      <li>คัดลอก API Key และ API Secret</li>
                      <li>From Number ใส่ชื่อผู้ส่ง (alphanumeric) หรือเบอร์โทร</li>
                    </ul>
                  )}
                </div>

                <div className="flex gap-3 justify-end">
                  <Button
                    onClick={() => updateSmsMutation.mutate({
                      provider: smsForm.provider,
                      accountSid: smsForm.accountSid,
                      authToken: smsForm.authToken || undefined,
                      fromNumber: smsForm.fromNumber,
                    })}
                    disabled={updateSmsMutation.isPending}
                    className="bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600"
                  >
                    {updateSmsMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
                    ) : (
                      <><Save className="w-4 h-4 mr-2" /> Save SMS Settings</>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Registration Settings Tab */}
          <TabsContent value="registration">
            <Card className="border-0 shadow-sm shadow-gray-200/50 rounded-2xl overflow-hidden">
              <CardHeader className="border-b bg-gradient-to-r from-purple-50/50 to-pink-50/30 pb-5">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <UserPlus className="w-5 h-5 text-purple-500" />
                  Registration Settings
                </CardTitle>
                <CardDescription>
                  Configure new user signup credits and tenant assignment
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label htmlFor="signupBonus">Signup Bonus Credits (New Users)</Label>
                    <Input
                      id="signupBonus"
                      type="number"
                      min={0}
                      value={regForm.signupBonusCredits}
                      onChange={(e) => setRegForm((prev) => ({ ...prev, signupBonusCredits: parseInt(e.target.value) || 0 }))}
                      className="mt-1"
                    />
                    <p className="text-xs text-gray-500 mt-1">Credits given to new users on registration</p>
                  </div>
                  <div>
                    <Label htmlFor="firstUserBonus">First User (Admin) Bonus Credits</Label>
                    <Input
                      id="firstUserBonus"
                      type="number"
                      min={0}
                      value={regForm.firstUserBonusCredits}
                      onChange={(e) => setRegForm((prev) => ({ ...prev, firstUserBonusCredits: parseInt(e.target.value) || 0 }))}
                      className="mt-1"
                    />
                    <p className="text-xs text-gray-500 mt-1">Credits given to the very first user (admin)</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    id="autoTenant"
                    type="checkbox"
                    checked={regForm.autoAssignTenant}
                    onChange={(e) => setRegForm((prev) => ({ ...prev, autoAssignTenant: e.target.checked }))}
                    className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                  />
                  <div>
                    <Label htmlFor="autoTenant">Auto-assign tenant by domain</Label>
                    <p className="text-xs text-gray-500">Automatically assign users to the tenant matching their registration domain</p>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    onClick={() => updateRegMutation.mutate(regForm)}
                    disabled={updateRegMutation.isPending}
                    className="bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600"
                  >
                    {updateRegMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
                    ) : (
                      <><Save className="w-4 h-4 mr-2" /> Save Registration Settings</>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 2FA Settings Tab */}
          <TabsContent value="2fa">
            <Card className="border-0 shadow-sm shadow-gray-200/50 rounded-2xl overflow-hidden">
              <CardHeader className="border-b bg-gradient-to-r from-purple-50/50 to-pink-50/30 pb-5">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Shield className="w-5 h-5 text-purple-500" />
                  Two-Factor Authentication Settings
                </CardTitle>
                <CardDescription>
                  Configure TOTP-based two-factor authentication for user accounts
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">

                {/* Enable/Disable 2FA */}
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div>
                    <div className="font-medium text-gray-900">Allow 2FA</div>
                    <div className="text-sm text-gray-500">Users can enable TOTP authenticator from their Security settings</div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={twoFaForm.enabled}
                      onChange={(e) => setTwoFaForm((p) => ({ ...p, enabled: e.target.checked }))}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                  </label>
                </div>

                {/* Enforce 2FA */}
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div>
                    <div className="font-medium text-gray-900">Enforce 2FA for all users</div>
                    <div className="text-sm text-gray-500">Require all users to set up 2FA before accessing the platform</div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={twoFaForm.enforced}
                      onChange={(e) => setTwoFaForm((p) => ({ ...p, enforced: e.target.checked }))}
                      className="sr-only peer"
                      disabled={!twoFaForm.enabled}
                    />
                    <div className={`w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600 ${!twoFaForm.enabled ? 'opacity-50' : ''}`}></div>
                  </label>
                </div>

                {/* Issuer Name */}
                <div>
                  <Label>Issuer Name (shown in authenticator app)</Label>
                  <Input
                    value={twoFaForm.issuer}
                    onChange={(e) => setTwoFaForm((p) => ({ ...p, issuer: e.target.value }))}
                    placeholder="SmartSpec Pro"
                    className="mt-1"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    This name appears in Google Authenticator, Authy, etc. as the account label.
                  </p>
                </div>

                {/* Backup Codes Count */}
                <div>
                  <Label>Recovery Codes per user</Label>
                  <Input
                    type="number"
                    min={5}
                    max={50}
                    value={twoFaForm.backupCodesCount}
                    onChange={(e) => setTwoFaForm((p) => ({ ...p, backupCodesCount: parseInt(e.target.value) || 10 }))}
                    className="mt-1 w-32"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    One-time recovery codes generated when user enables 2FA (5-50)
                  </p>
                </div>

                {/* Info Box */}
                <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 text-sm space-y-2">
                  <p className="font-semibold text-blue-800">How 2FA Works</p>
                  <ul className="text-blue-700 space-y-1 text-xs list-disc pl-4">
                    <li>Users enable 2FA from <strong>Settings &gt; Security &gt; Two-Factor Authentication</strong></li>
                    <li>They scan a QR code with Google Authenticator, Authy, or any TOTP app</li>
                    <li>On login, after password, they must enter a 6-digit TOTP code</li>
                    <li>Recovery codes (one-time use) let users sign in if they lose their authenticator</li>
                    <li>Users with verified backup email or phone can also reset 2FA via those channels</li>
                    <li>TOTP uses HMAC-SHA1 with 30-second time window (RFC 6238 standard)</li>
                  </ul>
                </div>

                {/* Save */}
                <div className="flex justify-end">
                  <Button
                    onClick={() => updateTwoFaMutation.mutate(twoFaForm)}
                    disabled={updateTwoFaMutation.isPending}
                    className="bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600"
                  >
                    {updateTwoFaMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
                    ) : (
                      <><Save className="w-4 h-4 mr-2" /> Save 2FA Settings</>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* STT Providers Tab */}
          <TabsContent value="stt">
            <Card className="border-0 shadow-sm shadow-gray-200/50 rounded-2xl overflow-hidden">
              <CardHeader className="border-b bg-gradient-to-r from-purple-50/50 to-pink-50/30 pb-5">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Mic className="w-5 h-5 text-purple-500" />
                  Speech-to-Text Providers
                </CardTitle>
                <CardDescription>
                  Configure STT providers for voice transcription in Chat
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 pt-6">
                {(sttTemplates || []).map((tpl) => {
                  const configured = sttProviders?.find((p) => p.providerName === tpl.providerName);
                  const isEditing = sttEditId === (configured?.id ?? -1);

                  return (
                    <div key={tpl.providerName} className="rounded-xl border border-gray-200 p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            configured?.hasApiKey ? "bg-green-100" : "bg-gray-100"
                          }`}>
                            <Mic className={`w-5 h-5 ${configured?.hasApiKey ? "text-green-600" : "text-gray-400"}`} />
                          </div>
                          <div>
                            <div className="font-semibold text-gray-900">{tpl.displayName}</div>
                            <div className="text-xs text-gray-500">{tpl.description}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {configured?.hasApiKey && (
                            <Badge variant="outline" className="text-green-600 border-green-600">
                              <Check className="w-3 h-3 mr-1" /> Configured
                            </Badge>
                          )}
                          {configured && (
                            <button
                              onClick={() => sttToggleMutation.mutate({ id: configured.id })}
                              className={`relative w-11 h-6 rounded-full transition-colors ${
                                configured.isEnabled ? "bg-green-500" : "bg-gray-300"
                              }`}
                            >
                              <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                                configured.isEnabled ? "translate-x-5" : "translate-x-0"
                              }`} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Info */}
                      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
                        <span>
                          Model: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-700">{tpl.defaultModel}</code>
                        </span>
                        <span>
                          Cost: <strong className={tpl.creditCostPerMinute === 0 ? "text-green-600" : "text-gray-700"}>
                            {tpl.creditCostPerMinute === 0 ? "Free" : `${tpl.creditCostPerMinute} credits/min`}
                          </strong>
                        </span>
                        <a href={tpl.signupUrl} target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:underline flex items-center gap-1">
                          Get API Key <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>

                      {/* Edit / Actions */}
                      {isEditing ? (
                        <div className="space-y-3 border-t border-gray-200 pt-4">
                          <div>
                            <Label className="text-sm">API Key</Label>
                            <div className="relative mt-1">
                              <Input
                                type={showSttApiKey ? "text" : "password"}
                                placeholder="Enter API key..."
                                value={sttApiKey}
                                onChange={(e) => setSttApiKey(e.target.value)}
                              />
                              <button
                                type="button"
                                onClick={() => setShowSttApiKey(!showSttApiKey)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                              >
                                {showSttApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => {
                                sttUpsertMutation.mutate({
                                  id: configured?.id,
                                  providerName: tpl.providerName,
                                  displayName: tpl.displayName,
                                  description: tpl.description,
                                  baseUrl: tpl.baseUrl,
                                  defaultModel: tpl.defaultModel,
                                  apiKey: sttApiKey || undefined,
                                  isEnabled: true,
                                  configJson: { signupUrl: tpl.signupUrl, creditCostPerMinute: tpl.creditCostPerMinute },
                                });
                              }}
                              disabled={sttUpsertMutation.isPending}
                              className="bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600"
                            >
                              {sttUpsertMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                              Save
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => { setSttEditId(null); setSttApiKey(""); }}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2 border-t border-gray-200 pt-4">
                          <Button size="sm" variant="outline" onClick={() => { setSttEditId(configured?.id ?? -1); setSttApiKey(""); }}>
                            {configured?.hasApiKey ? "Update Key" : "Configure"}
                          </Button>
                          {configured?.hasApiKey && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => sttTestMutation.mutate({ id: configured.id })}
                                disabled={sttTestMutation.isPending}
                              >
                                {sttTestMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <TestTube2 className="w-4 h-4 mr-1" />}
                                Test
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-500 hover:text-red-700"
                                onClick={() => sttDeleteMutation.mutate({ id: configured.id })}
                                disabled={sttDeleteMutation.isPending}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Info box */}
                <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 text-sm space-y-2">
                  <p className="font-semibold text-blue-800">How STT Works</p>
                  <ul className="text-blue-700 space-y-1 text-xs list-disc pl-4">
                    <li>Configure at least one STT provider above</li>
                    <li>Users can press the microphone button in Chat to dictate</li>
                    <li>Audio is sent to the first enabled provider for transcription</li>
                    <li>Credits are deducted based on the provider's cost per minute</li>
                    <li>Groq offers free Whisper transcription — recommended to start</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Main Menu Settings Tab */}
          <TabsContent value="menu">
            <MenuOverridesPanel />
          </TabsContent>
        </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Menu Overrides Panel
// ============================================================

interface MenuOverrideEntry {
  menuItemId: string;
  web_admin: boolean;
  web_domain_admin: boolean;
  web_user: boolean;
  desktop_admin: boolean;
  desktop_domain_admin: boolean;
  desktop_user: boolean;
}

const PLATFORMS = ["web", "desktop"] as const;
const ROLES: { key: string; label: string }[] = [
  { key: "admin", label: "Admin" },
  { key: "domain_admin", label: "DomAdm" },
  { key: "user", label: "User" },
];

function buildDefaultOverrides(): MenuOverrideEntry[] {
  return defaultMenuItems.map((item) => {
    const entry: MenuOverrideEntry = {
      menuItemId: item.id,
      web_admin: item.platforms.includes("web") && (!item.roles || item.roles.includes("admin")),
      web_domain_admin: item.platforms.includes("web") && (!item.roles || item.roles.includes("domain_admin")),
      web_user: item.platforms.includes("web") && (!item.roles || item.roles.includes("user")),
      desktop_admin: item.platforms.includes("desktop") && (!item.roles || item.roles.includes("admin")),
      desktop_domain_admin: item.platforms.includes("desktop") && (!item.roles || item.roles.includes("domain_admin")),
      desktop_user: item.platforms.includes("desktop") && (!item.roles || item.roles.includes("user")),
    };
    return entry;
  });
}

function MenuOverridesPanel() {
  const { data: savedOverrides, isLoading } = trpc.systemSettings.getMenuOverrides.useQuery();
  const updateMutation = trpc.systemSettings.updateMenuOverrides.useMutation({
    onSuccess: () => toast.success("Menu settings saved"),
    onError: (e) => toast.error(e.message),
  });

  const [overrides, setOverrides] = useState<MenuOverrideEntry[]>([]);

  useEffect(() => {
    const defaults = buildDefaultOverrides();
    if (savedOverrides && savedOverrides.length > 0) {
      const map = new Map(savedOverrides.map((o: MenuOverrideEntry) => [o.menuItemId, o]));
      setOverrides(defaults.map((d) => map.get(d.menuItemId) ?? d));
    } else {
      setOverrides(defaults);
    }
  }, [savedOverrides]);

  const toggle = (menuItemId: string, col: keyof MenuOverrideEntry) => {
    setOverrides((prev) =>
      prev.map((o) =>
        o.menuItemId === menuItemId ? { ...o, [col]: !o[col] } : o
      )
    );
  };

  const isAvailable = (item: SharedMenuItem, platform: string, role: string): boolean => {
    if (!item.platforms.includes(platform as any)) return false;
    if (item.roles && !item.roles.includes(role as UserRole)) return false;
    return true;
  };

  const groups = [
    { key: "main", label: "Main Menu" },
    { key: "admin", label: "Admin Menu" },
    { key: "domain-admin", label: "Domain Admin Menu" },
  ];

  if (isLoading) {
    return (
      <Card className="border-0 shadow-sm rounded-2xl">
        <CardContent className="py-12 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-sm shadow-gray-200/50 rounded-2xl overflow-hidden">
      <CardHeader className="border-b bg-gradient-to-r from-purple-50/50 to-pink-50/30 pb-5">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Menu className="w-5 h-5 text-purple-500" />
          Main Menu Settings
        </CardTitle>
        <CardDescription>
          Control which menu items are visible per platform and role. Unchecked items will be hidden.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50/50">
                <th className="text-left px-4 py-3 font-medium text-gray-500 w-48">Menu Item</th>
                {PLATFORMS.map((p) =>
                  ROLES.map((r) => (
                    <th key={`${p}_${r.key}`} className="text-center px-2 py-3 font-medium text-gray-500 text-xs">
                      <div>{p === "web" ? "Web" : "Desktop"}</div>
                      <div className="text-gray-400 font-normal">{r.label}</div>
                    </th>
                  ))
                )}
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => {
                const items = defaultMenuItems.filter((m) => m.group === group.key);
                if (items.length === 0) return null;
                return (
                  <Fragment key={group.key}>
                    <tr>
                      <td colSpan={7} className="px-4 py-2 bg-gray-100/60 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        {group.label}
                      </td>
                    </tr>
                    {items.map((item) => {
                      const override = overrides.find((o) => o.menuItemId === item.id);
                      if (!override) return null;
                      return (
                        <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                          <td className="px-4 py-2.5 font-medium text-gray-700">{item.label}</td>
                          {PLATFORMS.map((p) =>
                            ROLES.map((r) => {
                              const col = `${p}_${r.key}` as keyof MenuOverrideEntry;
                              const available = isAvailable(item, p, r.key);
                              const checked = override[col] as boolean;
                              return (
                                <td key={`${item.id}_${col}`} className="text-center px-2 py-2.5">
                                  {available ? (
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => toggle(item.id, col)}
                                      className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                                    />
                                  ) : (
                                    <span className="text-gray-300">—</span>
                                  )}
                                </td>
                              );
                            })
                          )}
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t flex justify-end">
          <Button
            onClick={() => updateMutation.mutate(overrides)}
            disabled={updateMutation.isPending}
            className="gap-2"
          >
            {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Menu Settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
