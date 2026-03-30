/**
 * Admin Settings Page
 * Manage platform configuration: Stripe, Invoice, etc.
 */

import { useState, useEffect, Fragment } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { pickEnabledModelId } from "@/lib/enabledModelSelection";
import InviteCodeManager from "@/components/admin/InviteCodeManager";
import InviteCodeDashboard from "@/components/admin/InviteCodeDashboard";
import { trpc } from "../lib/trpc";
import { Button } from "@/components/ui/button";
import { HelpButton } from "@/components/help";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
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
  Send,
  UserPlus,
  Lock,
  Mic,
  ExternalLink,
  TestTube2,
  Menu,
  Brain,
  Search,
  Database,
  HardDrive,
  Info,
  AlertCircle,
  Cloud,
  RefreshCw,
  AlertTriangle,
  Server,
  Zap,
  Bot,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { defaultMenuItems, type MenuItem as SharedMenuItem, type UserRole } from "@smartspec/shared";
import StorageSettingsPanel from "@/components/admin/StorageSettingsPanel";
import InfrastructureSettingsPanel from "@/components/admin/InfrastructureSettingsPanel";
import AgencyAdminPanel from "@/components/admin/AgencyAdminPanel";
import TelegramConnectionsPanel from "@/components/admin/TelegramConnectionsPanel";
import { TenantAutomationPolicyPanel } from "@/components/settings/TenantAutomationPolicyPanel";
import { DashboardCard, DashboardKpiCard } from "@/components/dashboard";

interface StripeSettings {
  secretKey?: string;
  secretKeyConfigured?: string;
  publishableKey?: string;
  webhookSecret?: string;
  webhookSecretConfigured?: string;
  currency?: string;
}

const DEFAULT_VECTOR_DB_HEALTH = {
  provider_status: {
    current_read_provider: "unknown",
    target_provider: null as string | null,
    switch_status: "unknown",
    mirror_writes: false,
  },
  queue_status: {
    lag_minutes: 0,
    lag_threshold_minutes: 0,
    lag_window_minutes: 0,
  },
  campaign_progress: {
    campaign_id: null as number | null,
    status: "idle",
    domain: "library",
    queued: 0,
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
  },
  latency_status: {
    current_p95_ms: 0,
    baseline_p95_ms: 0,
    current_sample_count: 0,
    baseline_sample_count: 0,
    insufficient_baseline: true,
  },
  connection_health: {
    healthy: false,
    status: "unknown",
    message: "Health data not available yet",
    checked_at: "",
  },
  provider_capabilities: {} as Record<string, unknown>,
  recent_failures: [] as Array<{
    job_id: number;
    tenant_id: string | null;
    library_item_id: number;
    error: string;
    failed_at: string | null;
  }>,
  tenant_id: null as string | null,
  timestamp: "",
};

function normalizeVectorDbHealthPayload(data: any) {
  if (!data || ("error" in data)) {
    return null;
  }

  return {
    tenant_id: typeof data.tenant_id === "string" ? data.tenant_id : DEFAULT_VECTOR_DB_HEALTH.tenant_id,
    timestamp: typeof data.timestamp === "string" ? data.timestamp : DEFAULT_VECTOR_DB_HEALTH.timestamp,
    provider_status: {
      ...DEFAULT_VECTOR_DB_HEALTH.provider_status,
      ...(data.provider_status ?? {}),
    },
    queue_status: {
      ...DEFAULT_VECTOR_DB_HEALTH.queue_status,
      ...(data.queue_status ?? {}),
    },
    campaign_progress: {
      ...DEFAULT_VECTOR_DB_HEALTH.campaign_progress,
      ...(data.campaign_progress ?? {}),
    },
    latency_status: {
      ...DEFAULT_VECTOR_DB_HEALTH.latency_status,
      ...(data.latency_status ?? {}),
    },
    connection_health: {
      ...DEFAULT_VECTOR_DB_HEALTH.connection_health,
      ...(data.connection_health ?? {}),
    },
    provider_capabilities:
      data.provider_capabilities && typeof data.provider_capabilities === "object"
        ? data.provider_capabilities
        : DEFAULT_VECTOR_DB_HEALTH.provider_capabilities,
    recent_failures: Array.isArray(data.recent_failures)
      ? data.recent_failures
      : DEFAULT_VECTOR_DB_HEALTH.recent_failures,
  };
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
    registrationMode: "open" as "open" | "invite_only",
    userInviteEnabled: false,
    userReferralBonusCredits: 50,
    allowedAuthMethods: ["email", "google", "github"] as Array<"email" | "google" | "github">,
    inviteInactiveDaysLimit: 0,
    maxRegistrationsPerDevice: 2,
  });

  // SMTP settings state
  const [smtpForm, setSmtpForm] = useState({
    host: "", port: 587, secure: false, user: "", pass: "", fromName: "SmartAIHub", fromEmail: "",
  });
  const [showSmtpPass, setShowSmtpPass] = useState(false);

  // OAuth settings state
  const [oauthForm, setOauthForm] = useState<{
    googleClientId?: string;
    googleClientSecret?: string;
    googleRedirectUri?: string;
    googleDriveRedirectUri?: string;
    githubClientId?: string;
    githubClientSecret?: string;
    githubRedirectUri?: string;
    microsoftClientId?: string;
    microsoftClientSecret?: string;
    microsoftOneDriveRedirectUri?: string;
  }>({});
  const [showGoogleSecret, setShowGoogleSecret] = useState(false);
  const [showGithubSecret, setShowGithubSecret] = useState(false);
  const [showMicrosoftSecret, setShowMicrosoftSecret] = useState(false);
  const [googleSecretConfigured, setGoogleSecretConfigured] = useState(false);
  const [githubSecretConfigured, setGithubSecretConfigured] = useState(false);
  const [microsoftSecretConfigured, setMicrosoftSecretConfigured] = useState(false);

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

  const testGoogleOAuthMutation = trpc.systemSettings.testGoogleOAuthConnection.useMutation({
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
        registrationMode: regSettings.registrationMode ?? "open",
        userInviteEnabled: regSettings.userInviteEnabled ?? false,
        userReferralBonusCredits: regSettings.userReferralBonusCredits ?? 50,
        allowedAuthMethods: (regSettings.allowedAuthMethods ?? ["email", "google", "github"]) as Array<"email" | "google" | "github">,
        inviteInactiveDaysLimit: regSettings.inviteInactiveDaysLimit ?? 0,
        maxRegistrationsPerDevice: regSettings.maxRegistrationsPerDevice ?? 2,
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

  // Telegram settings
  const [telegramForm, setTelegramForm] = useState({
    botToken: "",
    botUsername: "",
    appUrl: "",
    enabled: false,
  });
  const [showBotToken, setShowBotToken] = useState(false);
  const [botTokenConfigured, setBotTokenConfigured] = useState(false);
  const [webhookSecretConfigured, setWebhookSecretConfigured] = useState(false);

  const { data: telegramSettings, refetch: refetchTelegram } =
    trpc.telegram.getTelegramSettings.useQuery(undefined, {
      enabled: !!user && user.role === "admin",
    });

  const updateTelegramMutation = trpc.telegram.updateTelegramSettings.useMutation({
    onSuccess: () => {
      toast.success("Telegram settings saved");
      refetchTelegram();
      setTelegramForm((prev) => ({ ...prev, botToken: "" }));
    },
    onError: (err: any) => {
      toast.error(`Failed: ${err.message}`);
    },
  });

  const testTelegramMutation = trpc.telegram.testTelegramConnection.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Connected to bot: @${data.botInfo?.username || "unknown"}`);
      } else {
        toast.error(data.error || "Connection test failed");
      }
    },
    onError: (err: any) => {
      toast.error(`Test failed: ${err.message}`);
    },
  });

  const registerWebhookMutation = trpc.telegram.registerWebhook.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success("Webhook registered successfully");
      } else {
        toast.error(data.message || "Webhook registration failed");
      }
    },
    onError: (err: any) => {
      toast.error(`Webhook registration failed: ${err.message}`);
    },
  });

  // Load Telegram settings
  useEffect(() => {
    if (telegramSettings) {
      setTelegramForm((prev) => ({
        ...prev,
        botUsername: telegramSettings.botUsername || "",
        appUrl: telegramSettings.appUrl || "",
        enabled: telegramSettings.enabled || false,
      }));
      setBotTokenConfigured(!!telegramSettings.botTokenConfigured);
      setWebhookSecretConfigured(!!telegramSettings.webhookSecretConfigured);
    }
  }, [telegramSettings]);

  // 2FA settings
  const [twoFaForm, setTwoFaForm] = useState({ enabled: true, enforced: false, issuer: "SmartAIHub", backupCodesCount: 10 });
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
        issuer: twoFaSettings.issuer || "SmartAIHub",
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

  // AI / Memory settings
  const [aiSummaryModel, setAiSummaryModel] = useState("");
  const [allowUserOwnLlmApiKeys, setAllowUserOwnLlmApiKeys] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [googleAiForm, setGoogleAiForm] = useState({ apiKey: "" });
  const [showGoogleAiApiKey, setShowGoogleAiApiKey] = useState(false);
  const [googleAiKeyConfigured, setGoogleAiKeyConfigured] = useState(false);
  const { data: aiSettings, refetch: refetchAi } = trpc.systemSettings.getSettingsByCategory.useQuery(
    { category: "ai" as any },
    { enabled: !!user && user.role === "admin" }
  );
  const { data: googleAiSettings, refetch: refetchGoogleAi } = trpc.systemSettings.getGoogleAiSettings.useQuery(
    undefined,
    { enabled: !!user && user.role === "admin" },
  );
  const updateAiSettingMutation = trpc.systemSettings.updateSetting.useMutation({
    onSuccess: () => { toast.success("AI setting saved"); refetchAi(); },
    onError: (err: any) => toast.error(err.message),
  });
  const updateAiPolicyMutation = trpc.systemSettings.updateSetting.useMutation({
    onSuccess: () => {
      toast.success("LLM key policy updated");
      refetchAi();
    },
    onError: (err: any) => toast.error(err.message),
  });
  const updateGoogleAiMutation = trpc.systemSettings.updateGoogleAiSettings.useMutation({
    onSuccess: () => {
      toast.success("Google AI key saved securely");
      refetchGoogleAi();
      setGoogleAiForm({ apiKey: "" });
    },
    onError: (err: any) => toast.error(err.message),
  });
  const testGoogleAiMutation = trpc.systemSettings.testGoogleAiConnection.useMutation({
    onSuccess: (data) => {
      data.success ? toast.success(data.message) : toast.error(data.message);
    },
    onError: (err: any) => toast.error(err.message),
  });
  const { data: modelsData } = trpc.llmProviders.availableModels.useQuery(undefined, {
    enabled: !!user && user.role === "admin",
  });
  const enabledAiSummaryModelIds = (modelsData?.models ?? []).map((model: any) => model.id);
  const defaultAiSummaryModelId =
    modelsData?.models?.find((model: any) => model.isDefault)?.id ||
    modelsData?.models?.[0]?.id ||
    "";

  useEffect(() => {
    if (!aiSettings || !modelsData?.models) {
      return;
    }

    const summaryModelSetting = aiSettings.find((s: any) => s.key === "summaryModel");
    const userOwnKeysSetting = aiSettings.find((s: any) => s.key === "allowUserOwnLlmApiKeys");
    setAiSummaryModel(
      pickEnabledModelId({
        preferredId: summaryModelSetting?.value,
        allowedIds: enabledAiSummaryModelIds,
        fallbackIds: [defaultAiSummaryModelId],
      }),
    );
    setAllowUserOwnLlmApiKeys(userOwnKeysSetting?.value === "true");
  }, [aiSettings, defaultAiSummaryModelId, enabledAiSummaryModelIds, modelsData?.models]);

  useEffect(() => {
    if (!googleAiSettings) return;
    setGoogleAiKeyConfigured(!!googleAiSettings.apiKeyConfigured);
  }, [googleAiSettings]);

  const resolvedAiSummaryModel = pickEnabledModelId({
    preferredId: aiSummaryModel,
    allowedIds: enabledAiSummaryModelIds,
    fallbackIds: [defaultAiSummaryModelId],
  });

  // Vector Database settings
  type VectorDbProvider = "chromadb" | "pgvector" | "cloudflare_vectorize";
  const [vectorDbForm, setVectorDbForm] = useState({
    provider: "chromadb" as VectorDbProvider,
    embeddingModel: "all-MiniLM-L6-v2",
    embeddingDimension: 384,
    chromaPersistDir: "~/.smartaihub/chroma",
    pgvectorHost: "",
    pgvectorPort: "5432",
    pgvectorDatabase: "",
    pgvectorUser: "",
    pgvectorPassword: "",
    openaiApiKey: "",
    vectorizeAccountId: "",
    vectorizeApiToken: "",
    vectorizeIndexName: "",
  });
  const [showPgvectorPassword, setShowPgvectorPassword] = useState(false);
  const [showOpenaiApiKey, setShowOpenaiApiKey] = useState(false);
  const [showVectorizeApiToken, setShowVectorizeApiToken] = useState(false);
  const [pgvectorPasswordConfigured, setPgvectorPasswordConfigured] = useState(false);
  const [openaiApiKeyConfigured, setOpenaiApiKeyConfigured] = useState(false);
  const [vectorizeApiTokenConfigured, setVectorizeApiTokenConfigured] = useState(false);
  const [showProviderSwitchWarning, setShowProviderSwitchWarning] = useState(false);
  const [pendingProvider, setPendingProvider] = useState<VectorDbProvider | null>(null);
  const [showReindexConfirm, setShowReindexConfirm] = useState(false);
  const [isReindexing, setIsReindexing] = useState(false);

  const { data: vectorDbSettings, refetch: refetchVectorDb } = trpc.systemSettings.getVectorDbSettings.useQuery(
    undefined,
    { enabled: !!user && user.role === "admin" }
  );
  const { data: vectorDbStats, refetch: refetchVectorDbStats } = trpc.systemSettings.getVectorDbStats.useQuery(
    undefined,
    { enabled: !!user && user.role === "admin" }
  );
  const { data: vectorDbHealth, refetch: refetchVectorDbHealth } = trpc.systemSettings.getVectorDbHealth.useQuery(
    undefined,
    { enabled: !!user && user.role === "admin" }
  );
  const normalizedVectorDbHealth = normalizeVectorDbHealthPayload(vectorDbHealth);

  const updateVectorDbMutation = trpc.systemSettings.updateVectorDbSettings.useMutation({
    onSuccess: () => {
      toast.success("Vector Database settings saved");
      refetchVectorDb();
      refetchVectorDbStats();
      refetchVectorDbHealth();
      setVectorDbForm(prev => ({ ...prev, pgvectorPassword: "", openaiApiKey: "", vectorizeApiToken: "" }));
    },
    onError: (err: any) => toast.error(`Failed: ${err.message}`),
  });

  const testVectorDbMutation = trpc.systemSettings.testVectorDbConnection.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(data.message);
      } else {
        toast.error(data.message);
      }
    },
    onError: (err: any) => toast.error(`Test failed: ${err.message}`),
  });

  const triggerReindexMutation = trpc.systemSettings.triggerReindex.useMutation({
    onSuccess: (data: any) => {
      if (data.status === "started" || data.status === "already_running") {
        toast.success(data.message || "Reindex job started");
        setIsReindexing(true);
      } else {
        toast.error(data.message || "Failed to trigger reindex");
      }
    },
    onError: (err: any) => toast.error(`Reindex failed: ${err.message}`),
  });

  const { data: reindexStatus } = trpc.systemSettings.getReindexStatus.useQuery(
    undefined,
    {
      enabled: !!user && user.role === "admin",
      refetchInterval: isReindexing ? 5000 : false,
    }
  );

  const reindexResult = reindexStatus?.result as Record<string, any> | null | undefined;
  const reindexExpectedJobs = Number(
    reindexResult?.expected_enqueued_jobs
    ?? reindexResult?.enqueued_jobs
    ?? reindexResult?.total_jobs
    ?? 0
  );
  const reindexCompletedJobs = Number(reindexResult?.completed_jobs ?? 0);
  const reindexFailedJobs = Number(reindexResult?.failed_jobs ?? 0);
  const reindexActiveJobs = Number(reindexResult?.active_jobs ?? 0);
  const reindexProgressValue = reindexExpectedJobs > 0
    ? Math.min(100, Math.max(0, (reindexCompletedJobs / reindexExpectedJobs) * 100))
    : 0;

  // Stop polling when reindex completes
  useEffect(() => {
    if (!reindexStatus) return;

    if (reindexStatus.status === "running") {
      if (!isReindexing) {
        setIsReindexing(true);
      }
      return;
    }

    if (reindexStatus.status === "completed") {
      if (isReindexing) {
        toast.success("Reindex completed successfully");
      }
      refetchVectorDbStats();
      refetchVectorDbHealth();
      setIsReindexing(false);
      return;
    }

    if (reindexStatus.status === "completed_with_errors") {
      if (isReindexing) {
        toast.warning("Reindex completed with some errors — review recent failures in Vector DB Health");
      }
      refetchVectorDbStats();
      refetchVectorDbHealth();
      setIsReindexing(false);
      return;
    }

    if (reindexStatus.status === "failed") {
      if (isReindexing) {
        toast.error("Reindex failed — check server logs");
      }
      refetchVectorDbHealth();
      setIsReindexing(false);
      return;
    }

    if (reindexStatus.status === "idle") {
      setIsReindexing(false);
    }
  }, [isReindexing, reindexStatus, refetchVectorDbHealth, refetchVectorDbStats]);

  useEffect(() => {
    if (vectorDbSettings) {
      setVectorDbForm(prev => ({
        ...prev,
        provider: (vectorDbSettings.provider as VectorDbProvider) || "chromadb",
        embeddingModel: vectorDbSettings.embeddingModel || "all-MiniLM-L6-v2",
        embeddingDimension: vectorDbSettings.embeddingDimension || 384,
        chromaPersistDir: vectorDbSettings.chromaPersistDir || "~/.smartaihub/chroma",
        pgvectorHost: vectorDbSettings.pgvectorHost || "",
        pgvectorPort: vectorDbSettings.pgvectorPort || "5432",
        pgvectorDatabase: vectorDbSettings.pgvectorDatabase || "",
        pgvectorUser: vectorDbSettings.pgvectorUser || "",
        vectorizeAccountId: vectorDbSettings.vectorizeAccountId || "",
        vectorizeIndexName: vectorDbSettings.vectorizeIndexName || "",
      }));
      setPgvectorPasswordConfigured(!!vectorDbSettings.pgvectorPasswordConfigured);
      setOpenaiApiKeyConfigured(!!vectorDbSettings.openaiApiKeyConfigured);
      setVectorizeApiTokenConfigured(!!vectorDbSettings.vectorizeApiTokenConfigured);
    }
  }, [vectorDbSettings]);

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
        googleDriveRedirectUri: (oauthSettings.googleDriveRedirectUri as string) || "",
        githubClientId: (oauthSettings.githubClientId as string) || "",
        githubRedirectUri: (oauthSettings.githubRedirectUri as string) || "",
        microsoftClientId: (oauthSettings.microsoftClientId as string) || "",
        microsoftOneDriveRedirectUri: (oauthSettings.microsoftOneDriveRedirectUri as string) || "",
      });
      setGoogleSecretConfigured(!!oauthSettings.googleClientSecretConfigured);
      setGithubSecretConfigured(!!oauthSettings.githubClientSecretConfigured);
      setMicrosoftSecretConfigured(!!oauthSettings.microsoftClientSecretConfigured);
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
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
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
      googleDriveRedirectUri: oauthForm.googleDriveRedirectUri,
      githubClientId: oauthForm.githubClientId,
      githubClientSecret: oauthForm.githubClientSecret,
      githubRedirectUri: oauthForm.githubRedirectUri,
      microsoftClientId: oauthForm.microsoftClientId,
      microsoftClientSecret: oauthForm.microsoftClientSecret,
      microsoftOneDriveRedirectUri: oauthForm.microsoftOneDriveRedirectUri,
    });
  };

  const navItems = [
    { key: "stripe", label: "Payments", sublabel: "Stripe API Keys", icon: CreditCard },
    { key: "oauth", label: "OAuth", sublabel: "Social Login", icon: Globe },
    { key: "registration", label: "Registration", sublabel: "Signup & Credits", icon: UserPlus },
    { key: "smtp", label: "Email", sublabel: "SMTP Settings", icon: Mail },
    { key: "sms", label: "SMS", sublabel: "Provider Config", icon: MessageSquare },
    { key: "telegram", label: "Telegram Bot", sublabel: "Alert Notifications", icon: Send },
    { key: "2FA", label: "2FA", sublabel: "Authenticator", icon: Shield },
    { key: "stt", label: "STT", sublabel: "Speech-to-Text", icon: Mic },
    { key: "ai", label: "AI / Memory", sublabel: "Summary Model", icon: Brain },
    { key: "vectordb", label: "Vector Database", sublabel: "RAG & Embeddings", icon: Database },
    { key: "storage", label: "Storage", sublabel: "Local / R2 / S3", icon: Cloud },
    { key: "infrastructure", label: "Infrastructure", sublabel: "GCP / Redis / Tasks", icon: Server },
    { key: "agencies", label: "Agencies", sublabel: "Multi-Agent Swarm", icon: Zap },
    { key: "automation", label: "Automation", sublabel: "Copilot Settings", icon: Bot },
    { key: "menu", label: "Main Menu", sublabel: "Visibility Control", icon: Menu },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
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
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-md shadow-blue-200/50">
              <Settings className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Platform Settings</h1>
              <p className="text-xs text-gray-500">Configure integrations and security</p>
            </div>
            <HelpButton page="/admin/settings" variant="ghost" size="sm" />
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
                        ? "bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-md shadow-blue-200/50"
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
            <DashboardCard
              className="overflow-hidden"
              leading={<CreditCard className="w-5 h-5 text-blue-500" />}
              title="Stripe Configuration"
              description={<>
                Configure your Stripe API keys for payment processing. Get your keys from the{" "}
                <a
                  href="https://dashboard.stripe.com/apikeys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Stripe Dashboard
                </a>
                .
              </>}
              bodyClassName="space-y-6"
            >
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

              <div className="flex gap-3 pt-4 border-t">
                <Button
                  onClick={handleSaveStripe}
                  disabled={updateStripeMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700"
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
            </DashboardCard>
          </TabsContent>

          {/* OAuth Settings Tab */}
          <TabsContent value="oauth">
            <DashboardCard
              className="overflow-hidden"
              leading={<Globe className="w-5 h-5 text-blue-500" />}
              title="OAuth / Social Login Configuration"
              description={
                <>
                  Configure Google and GitHub OAuth credentials for social login. Users will be able to sign
                  in with these providers once configured.
                </>
              }
              bodyClassName="space-y-8"
            >
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
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="googleRedirectUri">Login Redirect URI</Label>
                      <Input
                        id="googleRedirectUri"
                        placeholder="https://smartaihub.app/auth/callback/google"
                        value={oauthForm.googleRedirectUri || ""}
                        onChange={(e) =>
                          setOauthForm((prev) => ({ ...prev, googleRedirectUri: e.target.value }))
                        }
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Used for Sign Up / Sign In with Google. Recommended: <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-xs font-mono select-all">https://smartaihub.app/auth/callback/google</code>
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="googleDriveRedirectUri">Google Drive Redirect URI</Label>
                      <Input
                        id="googleDriveRedirectUri"
                        placeholder="https://smartaihub.app/auth/callback/google-drive"
                        value={oauthForm.googleDriveRedirectUri || ""}
                        onChange={(e) =>
                          setOauthForm((prev) => ({ ...prev, googleDriveRedirectUri: e.target.value }))
                        }
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Used when users connect their Google Drive. Recommended: <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-xs font-mono select-all">https://smartaihub.app/auth/callback/google-drive</code>
                      </p>
                    </div>
                  </div>

                  {/* Google OAuth Setup Guide */}
                  <details className="mt-4 group">
                    <summary className="cursor-pointer flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-100 transition-colors">
                      <Info className="w-4 h-4" />
                      Setup Guide: How to create Google OAuth credentials
                      <ChevronLeft className="w-4 h-4 transition-transform group-open:-rotate-90" />
                    </summary>
                    <div className="mt-3 p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <div className="text-sm text-blue-900 dark:text-blue-100 space-y-4">
                        {/* Overview */}
                        <div className="p-3 bg-blue-100/50 dark:bg-blue-900/30 rounded-md">
                          <p className="font-semibold">What this enables:</p>
                          <ul className="list-disc list-inside mt-1 space-y-0.5 text-blue-700 dark:text-blue-300 ml-2">
                            <li><strong>Sign Up / Sign In with Google</strong> &mdash; users can register and log in using their Google account</li>
                            <li><strong>Google Drive integration</strong> &mdash; users can connect their Google Drive to import and export documents</li>
                          </ul>
                          <p className="text-blue-600 dark:text-blue-400 text-xs mt-2">
                            Both features share the same Client ID and Client Secret, but use different redirect URIs.
                          </p>
                        </div>

                        {/* Step 1 */}
                        <div>
                          <p className="font-semibold">Step 1: Create a Google Cloud Project</p>
                          <p className="text-blue-700 dark:text-blue-300 mt-1">
                            Go to{" "}
                            <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" className="underline inline-flex items-center gap-1">
                              Google Cloud Console <ExternalLink className="w-3 h-3" />
                            </a>
                            {" "}and create a new project (or select an existing one).
                          </p>
                        </div>

                        {/* Step 2 */}
                        <div>
                          <p className="font-semibold">Step 2: Enable required APIs</p>
                          <p className="text-blue-700 dark:text-blue-300 mt-1">
                            In your project, go to <strong>APIs & Services &gt; Library</strong> and enable these APIs:
                          </p>
                          <ul className="list-disc list-inside mt-1 space-y-0.5 text-blue-700 dark:text-blue-300 ml-2">
                            <li><strong>Google Drive API</strong> &mdash; required for Google Drive integration</li>
                            <li><strong>Google Docs API</strong> &mdash; required for reading/writing Google Docs</li>
                            <li><strong>Google Sheets API</strong> &mdash; required for spreadsheet access</li>
                            <li><strong>Google Slides API</strong> &mdash; required for presentation access</li>
                          </ul>
                          <p className="text-blue-600 dark:text-blue-400 text-xs mt-1">
                            If you only need Sign Up / Sign In (no Drive integration), you can skip this step.
                          </p>
                        </div>

                        {/* Step 3 */}
                        <div>
                          <p className="font-semibold">Step 3: Configure OAuth Consent Screen</p>
                          <p className="text-blue-700 dark:text-blue-300 mt-1">
                            Go to <strong>APIs & Services &gt; OAuth consent screen</strong>:
                          </p>
                          <ul className="list-disc list-inside mt-1 space-y-0.5 text-blue-700 dark:text-blue-300 ml-2">
                            <li>User Type: <strong>External</strong> (or Internal for Google Workspace)</li>
                            <li>Fill in App name, User support email, and Developer contact</li>
                            <li>
                              Add scopes:
                              <div className="ml-4 mt-1 space-y-0.5">
                                <p><code className="bg-blue-100 dark:bg-blue-900 px-1 rounded text-xs">openid</code> <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded text-xs">email</code> <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded text-xs">profile</code> &mdash; required for Sign Up / Sign In</p>
                                <p><code className="bg-blue-100 dark:bg-blue-900 px-1 rounded text-xs">drive.readonly</code> <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded text-xs">drive.file</code> &mdash; required for Google Drive integration</p>
                              </div>
                            </li>
                            <li>Add test users if the app is still in &quot;Testing&quot; status (max 100 test users)</li>
                          </ul>
                        </div>

                        {/* Step 4 */}
                        <div>
                          <p className="font-semibold">Step 4: Create OAuth Client ID</p>
                          <p className="text-blue-700 dark:text-blue-300 mt-1">
                            Go to <strong>APIs & Services &gt; Credentials</strong> &gt; <strong>Create Credentials</strong> &gt; <strong>OAuth client ID</strong>:
                          </p>
                          <ul className="list-disc list-inside mt-1 space-y-0.5 text-blue-700 dark:text-blue-300 ml-2">
                            <li>Application type: <strong>Web application</strong></li>
                            <li>Name: e.g. &quot;SmartAIHub Web&quot;</li>
                            <li>Authorized JavaScript origins: <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded text-xs font-mono">https://smartaihub.app</code></li>
                            <li>
                              Authorized redirect URIs &mdash; add <strong>both</strong> of these:
                              <div className="ml-4 mt-1 space-y-1">
                                <div className="flex items-start gap-2">
                                  <code className="block bg-blue-100 dark:bg-blue-900 px-2 py-1 rounded text-xs font-mono">
                                    https://smartaihub.app/auth/callback/google
                                  </code>
                                  <span className="text-xs text-blue-600 dark:text-blue-400 whitespace-nowrap mt-0.5">&larr; for Sign Up / Sign In</span>
                                </div>
                                <div className="flex items-start gap-2">
                                  <code className="block bg-blue-100 dark:bg-blue-900 px-2 py-1 rounded text-xs font-mono">
                                    https://smartaihub.app/auth/callback/google-drive
                                  </code>
                                  <span className="text-xs text-blue-600 dark:text-blue-400 whitespace-nowrap mt-0.5">&larr; for Google Drive</span>
                                </div>
                              </div>
                            </li>
                          </ul>
                        </div>

                        {/* Step 5 */}
                        <div>
                          <p className="font-semibold">Step 5: Copy credentials here</p>
                          <p className="text-blue-700 dark:text-blue-300 mt-1">
                            Copy the <strong>Client ID</strong> and <strong>Client Secret</strong> from Google Cloud Console and paste them in the fields above.
                            The redirect URIs are pre-filled with defaults &mdash; only change them if your domain is different. Then click <strong>Save OAuth Settings</strong>.
                          </p>
                        </div>

                        {/* Step 6 */}
                        <div>
                          <p className="font-semibold">Step 6: Verify</p>
                          <p className="text-blue-700 dark:text-blue-300 mt-1">
                            After saving, use the <strong>Test Google Connection</strong> button below to verify your credentials.
                            Then visit the Sign Up page to confirm the Google button appears.
                          </p>
                        </div>

                        <div className="pt-2 border-t border-blue-200 dark:border-blue-700 space-y-1">
                          <p className="text-blue-600 dark:text-blue-400 text-xs flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            Client Secret is encrypted before storage. It will not be shown after saving.
                          </p>
                          <p className="text-blue-600 dark:text-blue-400 text-xs flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            Both redirect URIs must be registered in Google Cloud Console, even if you only use one feature.
                          </p>
                        </div>
                      </div>
                    </div>
                  </details>

                  {/* Test Connection Button */}
                  <div className="mt-4">
                    <Button
                      variant="outline"
                      onClick={() => testGoogleOAuthMutation.mutate()}
                      disabled={testGoogleOAuthMutation.isPending || !oauthSettings?.googleClientId}
                    >
                      {testGoogleOAuthMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <TestTube className="w-4 h-4 mr-2" />
                      )}
                      Test Google Connection
                    </Button>
                  </div>

                  {/* Google OAuth Setup Guide */}
                  <details className="mt-4 group">
                    <summary className="cursor-pointer flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-100 transition-colors">
                      <Info className="w-4 h-4" />
                      Setup Guide: How to create Google OAuth credentials
                      <ChevronLeft className="w-4 h-4 transition-transform group-open:-rotate-90" />
                    </summary>
                    <div className="mt-3 p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <div className="text-sm text-blue-900 dark:text-blue-100 space-y-4">
                        {/* Step 1 */}
                        <div>
                          <p className="font-semibold">Step 1: Create a Google Cloud Project</p>
                          <p className="text-blue-700 dark:text-blue-300 mt-1">
                            Go to{" "}
                            <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" className="underline inline-flex items-center gap-1">
                              Google Cloud Console <ExternalLink className="w-3 h-3" />
                            </a>
                            {" "}and create a new project (or select an existing one).
                          </p>
                        </div>

                        {/* Step 2 */}
                        <div>
                          <p className="font-semibold">Step 2: Enable required APIs</p>
                          <p className="text-blue-700 dark:text-blue-300 mt-1">
                            In your project, go to <strong>APIs & Services &gt; Library</strong> and enable:
                          </p>
                          <ul className="list-disc list-inside mt-1 space-y-0.5 text-blue-700 dark:text-blue-300 ml-2">
                            <li>Google Drive API</li>
                            <li>Google Docs API</li>
                            <li>Google Sheets API</li>
                            <li>Google Slides API</li>
                          </ul>
                        </div>

                        {/* Step 3 */}
                        <div>
                          <p className="font-semibold">Step 3: Configure OAuth Consent Screen</p>
                          <p className="text-blue-700 dark:text-blue-300 mt-1">
                            Go to <strong>APIs & Services &gt; OAuth consent screen</strong>:
                          </p>
                          <ul className="list-disc list-inside mt-1 space-y-0.5 text-blue-700 dark:text-blue-300 ml-2">
                            <li>User Type: <strong>External</strong> (or Internal for Google Workspace)</li>
                            <li>Fill in App name, User support email, and Developer contact</li>
                            <li>Add scopes: <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded text-xs">openid</code>, <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded text-xs">email</code>, <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded text-xs">profile</code>, <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded text-xs">drive.readonly</code>, <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded text-xs">drive.file</code></li>
                            <li>Add test users if in Testing status</li>
                          </ul>
                        </div>

                        {/* Step 4 */}
                        <div>
                          <p className="font-semibold">Step 4: Create OAuth Client ID</p>
                          <p className="text-blue-700 dark:text-blue-300 mt-1">
                            Go to <strong>APIs & Services &gt; Credentials</strong> &gt; <strong>Create Credentials</strong> &gt; <strong>OAuth client ID</strong>:
                          </p>
                          <ul className="list-disc list-inside mt-1 space-y-0.5 text-blue-700 dark:text-blue-300 ml-2">
                            <li>Application type: <strong>Web application</strong></li>
                            <li>
                              Authorized redirect URIs &mdash; add both:
                              <div className="ml-4 mt-1 space-y-1">
                                <code className="block bg-blue-100 dark:bg-blue-900 px-2 py-1 rounded text-xs font-mono">
                                  https://smartaihub.app/auth/callback/google
                                </code>
                                <code className="block bg-blue-100 dark:bg-blue-900 px-2 py-1 rounded text-xs font-mono">
                                  https://smartaihub.app/auth/callback/google-drive
                                </code>
                              </div>
                            </li>
                          </ul>
                        </div>

                        {/* Step 5 */}
                        <div>
                          <p className="font-semibold">Step 5: Copy credentials here</p>
                          <p className="text-blue-700 dark:text-blue-300 mt-1">
                            Copy the <strong>Client ID</strong> and <strong>Client Secret</strong> from Google Cloud Console and paste them in the fields above. Then click <strong>Save Settings</strong>.
                          </p>
                        </div>

                        <div className="pt-2 border-t border-blue-200 dark:border-blue-700">
                          <p className="text-blue-600 dark:text-blue-400 text-xs flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            Client Secret is encrypted before storage. It will not be shown after saving.
                          </p>
                        </div>
                      </div>
                    </div>
                  </details>

                  {/* Test Connection Button */}
                  <div className="mt-4">
                    <Button
                      variant="outline"
                      onClick={() => testGoogleOAuthMutation.mutate()}
                      disabled={testGoogleOAuthMutation.isPending || !oauthSettings?.googleClientId}
                    >
                      {testGoogleOAuthMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <TestTube className="w-4 h-4 mr-2" />
                      )}
                      Test Google Connection
                    </Button>
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
                      placeholder="https://smartaihub.app/auth/callback/github"
                      value={oauthForm.githubRedirectUri || ""}
                      onChange={(e) =>
                        setOauthForm((prev) => ({ ...prev, githubRedirectUri: e.target.value }))
                      }
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Must match the callback URL in GitHub OAuth App settings. Recommended: <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-xs font-mono select-all">https://smartaihub.app/auth/callback/github</code>
                    </p>
                  </div>
                </div>

                {/* Microsoft / OneDrive OAuth */}
                <div className="space-y-4 pt-4 border-t">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-blue-500" viewBox="0 0 23 23" fill="currentColor">
                      <path d="M1 1h10v10H1zM12 1h10v10H12zM1 12h10v10H1zM12 12h10v10H12z" />
                    </svg>
                    <h4 className="font-medium">Microsoft / OneDrive</h4>
                  </div>
                  <div>
                    <Label htmlFor="microsoftClientId">Application (Client) ID</Label>
                    <Input
                      id="microsoftClientId"
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      value={oauthForm.microsoftClientId || ""}
                      onChange={(e) =>
                        setOauthForm((prev) => ({ ...prev, microsoftClientId: e.target.value }))
                      }
                    />
                    <p className="text-xs text-gray-500 mt-1">UUID format from Azure App Registration</p>
                  </div>
                  <div>
                    <Label htmlFor="microsoftClientSecret">
                      Client Secret
                      {microsoftSecretConfigured && (
                        <span className="ml-2 text-xs text-green-600 bg-green-50 dark:bg-green-900/30 dark:text-green-400 px-1.5 py-0.5 rounded">Configured</span>
                      )}
                    </Label>
                    <div className="relative">
                      <Input
                        id="microsoftClientSecret"
                        type={showMicrosoftSecret ? "text" : "password"}
                        placeholder={microsoftSecretConfigured ? "Leave blank to keep current secret" : "Enter Client Secret from Azure"}
                        value={oauthForm.microsoftClientSecret || ""}
                        onChange={(e) =>
                          setOauthForm((prev) => ({ ...prev, microsoftClientSecret: e.target.value }))
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-1 top-1/2 -translate-y-1/2"
                        onClick={() => setShowMicrosoftSecret(!showMicrosoftSecret)}
                      >
                        {showMicrosoftSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="microsoftOneDriveRedirectUri">OneDrive Redirect URI</Label>
                    <Input
                      id="microsoftOneDriveRedirectUri"
                      placeholder="https://smartaihub.app/auth/callback/onedrive"
                      value={oauthForm.microsoftOneDriveRedirectUri || ""}
                      onChange={(e) =>
                        setOauthForm((prev) => ({ ...prev, microsoftOneDriveRedirectUri: e.target.value }))
                      }
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Must match the Redirect URI in Azure. Recommended: <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-xs font-mono select-all">https://smartaihub.app/auth/callback/onedrive</code>
                    </p>
                  </div>
                  <details className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
                    <summary className="cursor-pointer font-medium text-gray-700 dark:text-gray-300">Azure App Registration Setup Guide</summary>
                    <ol className="mt-2 space-y-1.5 pl-5 list-decimal">
                      <li>Go to <strong>Azure Portal</strong> &gt; <strong>App registrations</strong> &gt; <strong>New registration</strong></li>
                      <li>Name: e.g. &quot;SmartAIHub OneDrive&quot;</li>
                      <li>Supported account types: <strong>&quot;Accounts in any organizational directory and personal Microsoft accounts&quot;</strong></li>
                      <li>Redirect URI: select <strong>Web</strong>, enter: <code className="bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded text-xs font-mono">https://smartaihub.app/auth/callback/onedrive</code></li>
                      <li>Go to <strong>Certificates &amp; secrets</strong> &gt; <strong>New client secret</strong> &gt; copy the Value (not the ID)</li>
                      <li>Go to <strong>API permissions</strong> &gt; <strong>Add a permission</strong> &gt; <strong>Microsoft Graph</strong> &gt; <strong>Delegated permissions</strong>:
                        <ul className="list-disc pl-5 mt-1">
                          <li><code className="text-xs font-mono">Files.Read</code></li>
                          <li><code className="text-xs font-mono">Files.ReadWrite</code></li>
                          <li><code className="text-xs font-mono">User.Read</code></li>
                          <li><code className="text-xs font-mono">offline_access</code></li>
                        </ul>
                      </li>
                      <li>Copy the <strong>Application (client) ID</strong> from the Overview page and paste above</li>
                    </ol>
                    <p className="mt-2 text-xs text-gray-500">Azure App Registration and Microsoft Graph API are free — no additional cost.</p>
                  </details>
                </div>

                {/* Save Button */}
                <div className="flex gap-3 pt-4 border-t">
                  <Button
                    onClick={handleSaveOAuth}
                    disabled={updateOAuthMutation.isPending}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {updateOAuthMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    Save OAuth Settings
                  </Button>
                </div>
            </DashboardCard>
          </TabsContent>
          {/* SMTP Settings Tab */}
          <TabsContent value="smtp">
            <DashboardCard
              className="overflow-hidden"
              leading={<Mail className="w-5 h-5 text-blue-500" />}
              title="Email / SMTP Settings"
              description="Configure SMTP to send verification and password reset emails. Without SMTP, codes are logged to server console only."
              bodyClassName="space-y-6"
            >
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
                      placeholder="SmartAIHub"
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
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <Label htmlFor="smtpSecure">Use SSL/TLS (port 465)</Label>
                </div>

                {/* Gmail App Password Warning */}
                <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-4 text-sm space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-amber-600 text-lg">⚠️</span>
                    <p className="font-bold text-amber-800">Gmail: App Password Required!</p>
                  </div>
                  <p className="text-amber-700">
                    Gmail does not support regular passwords. You must create an <strong>App Password</strong> instead.
                  </p>
                  <a
                    href="https://myaccount.google.com/apppasswords"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-md font-medium text-sm transition-colors"
                  >
                    🔑 Create App Password
                    <span className="text-amber-200">→</span>
                  </a>
                  <p className="text-amber-600 text-xs">
                    * Requires 2-Step Verification:{' '}
                    <a href="https://myaccount.google.com/signinoptions/two-step-verification" target="_blank" rel="noopener noreferrer" className="underline">
                      Enable here
                    </a>
                  </p>
                </div>

                {/* Gmail SMTP Settings guide */}
                <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 text-sm space-y-3">
                  <p className="font-semibold text-blue-800">Gmail SMTP Settings (smtp.gmail.com)</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-md border border-blue-200 bg-white p-3">
                      <p className="font-semibold text-blue-900 mb-1">Option A — STARTTLS (Recommended)</p>
                      <ul className="text-blue-700 space-y-0.5 text-xs">
                        <li>Host: <code className="bg-blue-100 px-1 rounded">smtp.gmail.com</code></li>
                        <li>Port: <code className="bg-blue-100 px-1 rounded">587</code></li>
                        <li>SSL/TLS: <strong>Off</strong> (unchecked)</li>
                      </ul>
                    </div>
                    <div className="rounded-md border border-blue-200 bg-white p-3">
                      <p className="font-semibold text-blue-900 mb-1">Option B — Direct SSL</p>
                      <ul className="text-blue-700 space-y-0.5 text-xs">
                        <li>Host: <code className="bg-blue-100 px-1 rounded">smtp.gmail.com</code></li>
                        <li>Port: <code className="bg-blue-100 px-1 rounded">465</code></li>
                        <li>SSL/TLS: <strong>On</strong> (checked)</li>
                      </ul>
                    </div>
                  </div>
                  <p className="text-blue-600 text-xs">
                    Limits: Free Gmail ~500 emails/day • Google Workspace ~2,000/day
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
                    className="bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600"
                  >
                    {updateSmtpMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
                    ) : (
                      <><Save className="w-4 h-4 mr-2" /> Save SMTP Settings</>
                    )}
                  </Button>
                </div>
            </DashboardCard>
          </TabsContent>

          {/* SMS Provider Settings Tab */}
          <TabsContent value="sms">
            <DashboardCard
              className="overflow-hidden"
              leading={<MessageSquare className="w-5 h-5 text-blue-500" />}
              title="SMS Provider Settings"
              description="Configure SMS provider for phone verification and password reset via SMS. Without SMS config, codes are logged to server console only."
              bodyClassName="space-y-6"
            >
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
                      className="mt-1 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:ring-blue-400"
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
                    className="bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600"
                  >
                    {updateSmsMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
                    ) : (
                      <><Save className="w-4 h-4 mr-2" /> Save SMS Settings</>
                    )}
                  </Button>
                </div>
            </DashboardCard>
          </TabsContent>

          {/* Telegram Bot Settings Tab */}
          <TabsContent value="telegram">
            <DashboardCard
              className="overflow-hidden"
              leading={<Send className="w-5 h-5 text-blue-500" />}
              title="Telegram Bot Settings"
              description="Configure Telegram Bot API credentials to send alert notifications to users who link their Telegram accounts."
              bodyClassName="space-y-6"
            >
                {/* Configuration Status Badge */}
                {botTokenConfigured && (
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    <Check className="w-3 h-3 mr-1" /> Bot Token Configured
                  </Badge>
                )}

                {/* Enable/Disable Toggle */}
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div>
                    <div className="font-medium text-gray-900">Enable Telegram Notifications</div>
                    <div className="text-sm text-gray-500">Master switch for all Telegram alert delivery</div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={telegramForm.enabled}
                      onChange={(e) => setTelegramForm((p) => ({ ...p, enabled: e.target.checked }))}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                {/* Bot Token */}
                <div>
                  <Label htmlFor="botToken">
                    Bot Token
                    {botTokenConfigured && (
                      <Badge variant="outline" className="ml-2 text-green-600 border-green-600">
                        <Check className="w-3 h-3 mr-1" />
                        Configured
                      </Badge>
                    )}
                  </Label>
                  <div className="relative mt-1">
                    <Input
                      id="botToken"
                      type={showBotToken ? "text" : "password"}
                      placeholder={botTokenConfigured ? "Enter new token to update..." : "1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"}
                      value={telegramForm.botToken}
                      onChange={(e) => setTelegramForm((p) => ({ ...p, botToken: e.target.value }))}
                    />
                    <button
                      type="button"
                      onClick={() => setShowBotToken(!showBotToken)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showBotToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Create a bot at <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">@BotFather</a> on Telegram
                  </p>
                </div>

                {/* Bot Username */}
                <div>
                  <Label htmlFor="botUsername">Bot Username</Label>
                  <Input
                    id="botUsername"
                    placeholder="SmartAIHubBot"
                    value={telegramForm.botUsername}
                    onChange={(e) => setTelegramForm((p) => ({ ...p, botUsername: e.target.value }))}
                    className="mt-1"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    The bot's @username (without @) — used to generate deep links for account linking
                  </p>
                </div>

                {/* App URL */}
                <div>
                  <Label htmlFor="appUrl">Application URL</Label>
                  <Input
                    id="appUrl"
                    placeholder="https://app.smartaihub.app"
                    value={telegramForm.appUrl}
                    onChange={(e) => setTelegramForm((p) => ({ ...p, appUrl: e.target.value }))}
                    className="mt-1"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Base URL for "View in SmartAIHub" inline buttons in notifications
                  </p>
                </div>

                {/* Setup Guide */}
                <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 text-sm space-y-3">
                  <p className="font-semibold text-blue-800">Setup Instructions</p>
                  <ol className="text-blue-700 space-y-1.5 text-xs list-decimal pl-4">
                    <li>Open Telegram and search for <strong>@BotFather</strong></li>
                    <li>Send <code className="bg-blue-100 px-1 rounded">/newbot</code> and follow the prompts to create a bot</li>
                    <li>Copy the bot token (format: <code className="bg-blue-100 px-1 rounded">123456:ABC-DEF...</code>)</li>
                    <li>Paste the token above and save settings</li>
                    <li>Click "Test Connection" to verify the bot is reachable</li>
                    <li>Click "Register Webhook" to enable the bot to receive verification requests</li>
                    <li>Users can then link their Telegram accounts from Settings → Telegram Notifications</li>
                  </ol>
                </div>

                {/* Webhook Status */}
                {webhookSecretConfigured && (
                  <div className="rounded-lg border border-green-200 bg-green-50/50 p-3 text-sm flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-600" />
                    <span className="text-green-700">Webhook secret is configured and secured</span>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3 justify-end border-t pt-4">
                  <Button
                    variant="outline"
                    onClick={() => testTelegramMutation.mutate()}
                    disabled={testTelegramMutation.isPending || !botTokenConfigured}
                  >
                    {testTelegramMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Testing...</>
                    ) : (
                      <><TestTube className="w-4 h-4 mr-2" /> Test Connection</>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => registerWebhookMutation.mutate()}
                    disabled={registerWebhookMutation.isPending || !botTokenConfigured}
                  >
                    {registerWebhookMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Registering...</>
                    ) : (
                      <><Key className="w-4 h-4 mr-2" /> Register Webhook</>
                    )}
                  </Button>
                  <Button
                    onClick={() => updateTelegramMutation.mutate({
                      botToken: telegramForm.botToken || undefined,
                      botUsername: telegramForm.botUsername,
                      appUrl: telegramForm.appUrl,
                      enabled: telegramForm.enabled,
                    })}
                    disabled={updateTelegramMutation.isPending}
                    className="bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600"
                  >
                    {updateTelegramMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
                    ) : (
                      <><Save className="w-4 h-4 mr-2" /> Save Settings</>
                    )}
                  </Button>
                </div>
            </DashboardCard>

            {/* Telegram Connections Management */}
            <div className="mt-6">
              <TelegramConnectionsPanel />
            </div>
          </TabsContent>

          {/* Registration Settings Tab */}
          <TabsContent value="registration">
            <div className="space-y-6">
              <DashboardCard
                className="overflow-hidden"
                leading={<UserPlus className="w-5 h-5 text-blue-500" />}
                title="Registration Settings"
                description="Configure registration mode, auth methods, credits, and security"
                bodyClassName="space-y-8 pt-6"
              >
                  {/* Section 1: Registration Mode */}
                  <div>
                    <h4 className="font-semibold text-sm text-gray-900 mb-3">Registration Mode</h4>
                    <div className="flex gap-4">
                      <label className={`flex-1 p-4 rounded-xl border-2 cursor-pointer transition-all ${regForm.registrationMode === "open" ? "border-blue-500 bg-blue-50/50" : "border-gray-200 hover:border-gray-300"}`}>
                        <input
                          type="radio"
                          name="regMode"
                          value="open"
                          checked={regForm.registrationMode === "open"}
                          onChange={() => setRegForm((prev) => ({ ...prev, registrationMode: "open" }))}
                          className="sr-only"
                        />
                        <div className="font-medium text-sm">Open Registration</div>
                        <p className="text-xs text-gray-500 mt-1">Anyone can register (invite code optional)</p>
                      </label>
                      <label className={`flex-1 p-4 rounded-xl border-2 cursor-pointer transition-all ${regForm.registrationMode === "invite_only" ? "border-blue-500 bg-blue-50/50" : "border-gray-200 hover:border-gray-300"}`}>
                        <input
                          type="radio"
                          name="regMode"
                          value="invite_only"
                          checked={regForm.registrationMode === "invite_only"}
                          onChange={() => setRegForm((prev) => ({ ...prev, registrationMode: "invite_only" }))}
                          className="sr-only"
                        />
                        <div className="font-medium text-sm">Invite Only</div>
                        <p className="text-xs text-gray-500 mt-1">Only users with a valid invite code can register</p>
                      </label>
                    </div>
                  </div>

                  {/* Section 2: Allowed Auth Methods */}
                  <div>
                    <h4 className="font-semibold text-sm text-gray-900 mb-3">Allowed Registration Methods</h4>
                    <div className="flex gap-4">
                      {(["email", "google", "github"] as const).map((method) => (
                        <label key={method} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={regForm.allowedAuthMethods.includes(method)}
                            onChange={(e) => {
                              const newMethods = e.target.checked
                                ? [...regForm.allowedAuthMethods, method]
                                : regForm.allowedAuthMethods.filter((m) => m !== method);
                              if (newMethods.length === 0) return; // at least one required
                              setRegForm((prev) => ({ ...prev, allowedAuthMethods: newMethods }));
                            }}
                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm capitalize">{method === "email" ? "Email/Password" : method}</span>
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">At least one method must be enabled</p>
                  </div>

                  {/* Section 3: Credits */}
                  <div>
                    <h4 className="font-semibold text-sm text-gray-900 mb-3">Signup Credits</h4>
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
                      </div>
                    </div>
                  </div>

                  {/* Section 4: User Referral Settings */}
                  <div>
                    <h4 className="font-semibold text-sm text-gray-900 mb-3">User Referral Program</h4>
                    <div className="flex items-center gap-3 mb-3">
                      <input
                        id="userInviteEnabled"
                        type="checkbox"
                        checked={regForm.userInviteEnabled}
                        onChange={(e) => setRegForm((prev) => ({ ...prev, userInviteEnabled: e.target.checked }))}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div>
                        <Label htmlFor="userInviteEnabled">Allow users to share invite codes</Label>
                        <p className="text-xs text-gray-500">Each user gets a unique referral code to share</p>
                      </div>
                    </div>
                    {regForm.userInviteEnabled && (
                      <div className="ml-7">
                        <Label htmlFor="referralBonus">Referral Bonus Credits (for inviter)</Label>
                        <Input
                          id="referralBonus"
                          type="number"
                          min={0}
                          value={regForm.userReferralBonusCredits}
                          onChange={(e) => setRegForm((prev) => ({ ...prev, userReferralBonusCredits: parseInt(e.target.value) || 0 }))}
                          className="mt-1 max-w-[200px]"
                        />
                        <p className="text-xs text-gray-500 mt-1">Credits given to the inviter when someone registers with their code</p>
                      </div>
                    )}
                  </div>

                  {/* Section 5: Inactive User Policy */}
                  <div>
                    <h4 className="font-semibold text-sm text-gray-900 mb-3">Inactive User Policy</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <Label htmlFor="inactiveDays">Auto-disable after days of no credit usage</Label>
                        <Input
                          id="inactiveDays"
                          type="number"
                          min={0}
                          max={365}
                          value={regForm.inviteInactiveDaysLimit}
                          onChange={(e) => setRegForm((prev) => ({ ...prev, inviteInactiveDaysLimit: parseInt(e.target.value) || 0 }))}
                          className="mt-1 max-w-[200px]"
                        />
                        <p className="text-xs text-gray-500 mt-1">0 = disabled. Only applies to users registered via admin invite codes.</p>
                      </div>
                      <div>
                        <Label htmlFor="maxDeviceReg">Max registrations per device</Label>
                        <Input
                          id="maxDeviceReg"
                          type="number"
                          min={0}
                          max={100}
                          value={regForm.maxRegistrationsPerDevice}
                          onChange={(e) => setRegForm((prev) => ({ ...prev, maxRegistrationsPerDevice: parseInt(e.target.value) || 0 }))}
                          className="mt-1 max-w-[200px]"
                        />
                        <p className="text-xs text-gray-500 mt-1">0 = disabled. Block registration when same device exceeds limit.</p>
                      </div>
                    </div>
                  </div>

                  {/* Section 6: Tenant auto-assign */}
                  <div className="flex items-center gap-3">
                    <input
                      id="autoTenant"
                      type="checkbox"
                      checked={regForm.autoAssignTenant}
                      onChange={(e) => setRegForm((prev) => ({ ...prev, autoAssignTenant: e.target.checked }))}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
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
                      className="bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600"
                    >
                      {updateRegMutation.isPending ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
                      ) : (
                        <><Save className="w-4 h-4 mr-2" /> Save Registration Settings</>
                      )}
                    </Button>
                  </div>
              </DashboardCard>

              {/* Invite Code Statistics */}
              <DashboardCard className="overflow-hidden" bodyClassName="pt-6">
                  <InviteCodeDashboard />
              </DashboardCard>

              {/* Admin Invite Codes Management */}
              <DashboardCard className="overflow-hidden" bodyClassName="pt-6">
                  <InviteCodeManager />
              </DashboardCard>
            </div>
          </TabsContent>

          {/* 2FA Settings Tab */}
          <TabsContent value="2fa">
            <DashboardCard
              className="overflow-hidden"
              leading={<Shield className="w-5 h-5 text-blue-500" />}
              title="Two-Factor Authentication Settings"
              description="Configure TOTP-based two-factor authentication for user accounts"
              bodyClassName="space-y-6"
            >

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
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
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
                    <div className={`w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 ${!twoFaForm.enabled ? 'opacity-50' : ''}`}></div>
                  </label>
                </div>

                {/* Issuer Name */}
                <div>
                  <Label>Issuer Name (shown in authenticator app)</Label>
                  <Input
                    value={twoFaForm.issuer}
                    onChange={(e) => setTwoFaForm((p) => ({ ...p, issuer: e.target.value }))}
                    placeholder="SmartAIHub"
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
                    className="bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600"
                  >
                    {updateTwoFaMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
                    ) : (
                      <><Save className="w-4 h-4 mr-2" /> Save 2FA Settings</>
                    )}
                  </Button>
                </div>
            </DashboardCard>
          </TabsContent>

          {/* STT Providers Tab */}
          <TabsContent value="stt">
            <DashboardCard
              className="overflow-hidden"
              leading={<Mic className="w-5 h-5 text-blue-500" />}
              title="Speech-to-Text Providers"
              description="Configure STT providers for voice transcription in Chat"
              bodyClassName="space-y-6 pt-6"
            >
                {(sttTemplates || []).map((tpl) => {
                  const configured = sttProviders?.find((p: any) => p.providerName === tpl.providerName);
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
                        <a href={tpl.signupUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
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
                              className="bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600"
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
            </DashboardCard>
          </TabsContent>

          {/* AI / Memory Settings Tab */}
          <TabsContent value="ai">
            <DashboardCard
              className="overflow-hidden"
              leading={<Brain className="w-5 h-5 text-blue-600" />}
              title="AI / Memory Settings"
              description="Configure LLM models used for background tasks like memory consolidation and summarization."
              bodyClassName="p-6 space-y-6"
            >
                <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Allow users to manage their own LLM API keys</label>
                    <p className="text-xs text-muted-foreground">
                      Default is disabled. When off, users cannot add or update personal provider keys in Settings.
                    </p>
                  </div>
                  <Switch
                    checked={allowUserOwnLlmApiKeys}
                    onCheckedChange={(checked) => {
                      const previousValue = allowUserOwnLlmApiKeys;
                      setAllowUserOwnLlmApiKeys(checked);
                      updateAiPolicyMutation.mutate(
                        {
                          category: "ai" as any,
                          key: "allowUserOwnLlmApiKeys",
                          value: checked ? "true" : "false",
                          description: "Allow users to manage their own LLM API keys",
                        },
                        {
                          onError: () => setAllowUserOwnLlmApiKeys(previousValue),
                        },
                      );
                    }}
                    disabled={updateAiPolicyMutation.isPending}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Summary / Consolidation Model</label>
                  <p className="text-xs text-muted-foreground">
                    Model used for auto-summarizing conversation history and consolidating memory. Use a cheaper model to save credits.
                  </p>

                  {/* Search input */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      placeholder="Search models... (e.g., gpt-4, claude, gemini)"
                      value={modelSearch}
                      onChange={(e) => setModelSearch(e.target.value)}
                      className="pl-9 max-w-md"
                    />
                  </div>

                  <Select value={aiSummaryModel || ""} onValueChange={setAiSummaryModel}>
                    <SelectTrigger className="w-full max-w-md">
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                      {modelsData?.models
                        ?.filter((m: any) =>
                          !modelSearch ||
                          m.id.toLowerCase().includes(modelSearch.toLowerCase())
                        )
                        .map((m: any) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.id}
                          </SelectItem>
                        ))}
                      {modelsData?.models &&
                       modelsData.models.length > 0 &&
                       modelsData.models.filter((m: any) =>
                         !modelSearch ||
                         m.id.toLowerCase().includes(modelSearch.toLowerCase())
                       ).length === 0 && (
                        <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                          No models found matching "{modelSearch}"
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Google AI API Key for OCR / Real-World Vision</label>
                    <p className="text-xs text-muted-foreground">
                      This key is used only for explicitly requested OCR or real-world image analysis, such as photos of paper documents. AI-generated images and videos added from Media History keep using their saved prompts for search, so this key is not spent for those cases.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="googleAiApiKey">
                      API Key {googleAiKeyConfigured ? "(leave empty to keep current)" : ""}
                    </Label>
                    <div className="relative max-w-xl">
                      <Input
                        id="googleAiApiKey"
                        type={showGoogleAiApiKey ? "text" : "password"}
                        value={googleAiForm.apiKey}
                        onChange={(e) => setGoogleAiForm({ apiKey: e.target.value })}
                        placeholder={googleAiKeyConfigured ? "AIza••••••••" : "AIza..."}
                        className="pr-10 font-mono text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowGoogleAiApiKey(!showGoogleAiApiKey)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                      >
                        {showGoogleAiApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {googleAiKeyConfigured ? (
                        <Badge variant="outline" className="text-green-600">
                          <Check className="mr-1 h-3 w-3" />
                          Key configured
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Not configured</Badge>
                      )}
                      {googleAiSettings?.source ? (
                        <Badge variant="outline">Source: {googleAiSettings.source}</Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      The key is encrypted before it is stored in the database and is never shown again after saving.
                    </p>
                  </div>

                  <DashboardCard
                    className="border-blue-200 bg-blue-50"
                    bodyClassName="space-y-3 p-4 text-sm text-blue-950"
                  >
                    <div className="font-medium">Where to create this key</div>
                    <ol className="list-decimal space-y-1 pl-5 text-xs text-blue-900">
                      <li>Open <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="font-medium underline">Google AI Studio</a> and sign in with the Google account that owns your project.</li>
                      <li>Create or choose a Google Cloud project when prompted.</li>
                      <li>Click <strong>Create API key</strong>.</li>
                      <li>Copy the generated key that starts with <code className="rounded bg-white px-1 py-0.5 font-mono text-[11px]">AIza</code>.</li>
                      <li>Paste it here, then click <strong>Save Google AI Key</strong>.</li>
                    </ol>
                    <div className="rounded-lg border border-blue-200 bg-white p-3 text-xs text-blue-900">
                      Use this key for OCR and real-world photo understanding only. For AI-generated media saved from the app, prompt-based search is already used and is usually enough.
                    </div>
                  </DashboardCard>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      onClick={() => updateGoogleAiMutation.mutate({ apiKey: googleAiForm.apiKey || undefined })}
                      disabled={updateGoogleAiMutation.isPending || !googleAiForm.apiKey.trim()}
                      className="gap-2"
                    >
                      {updateGoogleAiMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      Save Google AI Key
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => testGoogleAiMutation.mutate()}
                      disabled={testGoogleAiMutation.isPending || !googleAiKeyConfigured}
                    >
                      {testGoogleAiMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <TestTube className="mr-2 h-4 w-4" />
                      )}
                      Test Google AI Key
                    </Button>
                  </div>
                </div>

                  <Button
                    onClick={() => {
                      updateAiSettingMutation.mutate({
                        category: "ai" as any,
                        key: "summaryModel",
                        value: resolvedAiSummaryModel,
                      });
                    }}
                    disabled={updateAiSettingMutation.isPending || !resolvedAiSummaryModel}
                    className="gap-2"
                  >
                  {updateAiSettingMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Save AI Settings
                </Button>
            </DashboardCard>
          </TabsContent>

          {/* Vector Database Settings Tab */}
          <TabsContent value="vectordb">
            <DashboardCard
              className="overflow-hidden"
              leading={<Database className="w-5 h-5 text-blue-600" />}
              title="Vector Database Configuration"
              description="Configure vector database for RAG (Retrieval-Augmented Generation), semantic search, and document indexing"
              bodyClassName="p-6 space-y-6"
            >
                {/* Info Banner */}
                <DashboardCard className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30" bodyClassName="flex items-start gap-3 p-4">
                    <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                      <p className="font-medium text-blue-800 dark:text-blue-200">About Vector Databases</p>
                      <p className="text-blue-700 dark:text-blue-300 mt-1">
                        Vector databases store document embeddings for semantic search and RAG. Choose <strong>ChromaDB</strong> for development (zero-config, local storage), <strong>pgvector</strong> for production (scalable, hybrid search with PostgreSQL), or <strong>Cloudflare Vectorize</strong> for edge-native global deployment.
                      </p>
                    </div>
                </DashboardCard>

                {/* Statistics Cards */}
                {vectorDbStats && !vectorDbStats.error && (
                  <div className="grid gap-4 md:grid-cols-3">
                    <DashboardKpiCard
                      icon={Database}
                      label="Provider"
                      value={<span className="capitalize">{vectorDbStats.provider}</span>}
                      subLabel={
                        vectorDbStats.provider === "chromadb" ? (
                          <span className="text-xs text-slate-500">In-memory + Persistent</span>
                        ) : vectorDbStats.provider === "pgvector" ? (
                          <span className="text-xs text-slate-500">PostgreSQL Extension</span>
                        ) : (
                          <span className="text-xs text-slate-500">Cloudflare Edge Network</span>
                        )
                      }
                    />

                    {vectorDbStats.provider === "chromadb" && vectorDbStats.totalCollections !== undefined && (
                      <DashboardKpiCard
                        icon={HardDrive}
                        label="Collections"
                        value={vectorDbStats.totalCollections}
                        subLabel={<span className="text-xs text-slate-500">Active collections</span>}
                      />
                    )}

                    {vectorDbStats.provider === "pgvector" && vectorDbStats.totalDocuments !== undefined && (
                      <DashboardKpiCard
                        icon={HardDrive}
                        label="Indexed Items"
                        value={vectorDbStats.totalDocuments.toLocaleString()}
                        subLabel={
                          <span className="text-xs text-slate-500">
                            {vectorDbStats.totalVectors?.toLocaleString?.() ?? "—"} vectors
                            {vectorDbStats.activeItems !== undefined ? ` • ${vectorDbStats.activeItems.toLocaleString()} active items` : ""}
                          </span>
                        }
                      />
                    )}

                    {vectorDbStats.provider === "cloudflare_vectorize" && (
                      <DashboardKpiCard
                        icon={Cloud}
                        label="Vectors"
                        value={vectorDbStats.vectorCount?.toLocaleString() ?? "—"}
                        subLabel={<span className="text-xs text-slate-500">{vectorDbStats.dimensions ? `${vectorDbStats.dimensions}D • ${vectorDbStats.metric || "cosine"}` : "Index info"}</span>}
                      />
                    )}

                    <DashboardKpiCard
                      icon={HardDrive}
                      label="Storage"
                      value={<span className="text-xs font-mono truncate">{vectorDbStats.storageLocation || vectorDbStats.storageType || "N/A"}</span>}
                      subLabel={<span className="text-xs text-slate-500">Location</span>}
                    />
                  </div>
                )}

                {normalizedVectorDbHealth && (
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <DashboardKpiCard
                        icon={Database}
                        label="Active Read Provider"
                        value={<span className="capitalize">{normalizedVectorDbHealth.provider_status.current_read_provider}</span>}
                        subLabel={
                          <div className="flex flex-wrap gap-2 text-xs">
                            <Badge variant="outline">
                              switch: {normalizedVectorDbHealth.provider_status.switch_status}
                            </Badge>
                            <Badge variant={normalizedVectorDbHealth.provider_status.mirror_writes ? "default" : "secondary"}>
                              {normalizedVectorDbHealth.provider_status.mirror_writes ? "mirror writes on" : "mirror writes off"}
                            </Badge>
                          </div>
                        }
                      />

                      <DashboardKpiCard
                        icon={Database}
                        label="Cutover Target"
                        value={<span className="capitalize">{normalizedVectorDbHealth.provider_status.target_provider || "None"}</span>}
                        subLabel={<span className="text-xs text-slate-500">Current read provider stays authoritative until cutover finishes.</span>}
                      />

                      <DashboardKpiCard
                        icon={AlertCircle}
                        label="Connection Health"
                        value={<Badge variant={normalizedVectorDbHealth.connection_health.healthy ? "default" : "destructive"}>{normalizedVectorDbHealth.connection_health.status}</Badge>}
                        subLabel={<span className="text-xs text-slate-500">{normalizedVectorDbHealth.connection_health.message}</span>}
                      />

                      <DashboardKpiCard
                        icon={RefreshCw}
                        label="Queue & Search"
                        value={<span>Queue lag {normalizedVectorDbHealth.queue_status.lag_minutes.toFixed(1)} min</span>}
                        subLabel={<span className="text-xs text-slate-500">Search p95 {Math.round(normalizedVectorDbHealth.latency_status.current_p95_ms)} ms</span>}
                      />
                    </div>

                    {normalizedVectorDbHealth.recent_failures.length > 0 && (
                      <DashboardCard
                        className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20"
                        title="Recent Vector Failures"
                        description="Unsuperseded recent failures only. Completed retries are filtered out."
                        bodyClassName="space-y-2"
                      >
                          {normalizedVectorDbHealth.recent_failures.slice(0, 3).map((failure: (typeof DEFAULT_VECTOR_DB_HEALTH.recent_failures)[number]) => (
                            <div
                              key={failure.job_id}
                              className="rounded-md border border-amber-200 bg-white/70 p-3 text-xs dark:border-amber-900 dark:bg-slate-900/50"
                            >
                              <div className="font-medium">
                                Item {failure.library_item_id} • Job {failure.job_id}
                              </div>
                              <div className="mt-1 text-muted-foreground break-all">
                                {failure.error || "Unknown failure"}
                              </div>
                            </div>
                          ))}
                      </DashboardCard>
                    )}
                  </div>
                )}

                {/* Provider Selection */}
                <div className="space-y-3">
                  <Label htmlFor="provider" className="text-base font-semibold">Vector Database Provider</Label>
                  <Select
                    value={vectorDbForm.provider}
                    onValueChange={(value: VectorDbProvider) => {
                      // Show warning if switching from currently saved provider
                      if (vectorDbSettings?.provider && value !== vectorDbSettings.provider) {
                        setPendingProvider(value);
                        setShowProviderSwitchWarning(true);
                      } else {
                        setVectorDbForm({ ...vectorDbForm, provider: value });
                      }
                    }}
                  >
                    <SelectTrigger id="provider" className="max-w-md">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="chromadb">
                        <div className="flex items-center gap-2">
                          <Database className="h-4 w-4" />
                          <div>
                            <div className="font-medium">ChromaDB</div>
                            <div className="text-xs text-muted-foreground">Local, zero-config (Development)</div>
                          </div>
                        </div>
                      </SelectItem>
                      <SelectItem value="pgvector">
                        <div className="flex items-center gap-2">
                          <Database className="h-4 w-4" />
                          <div>
                            <div className="font-medium">pgvector</div>
                            <div className="text-xs text-muted-foreground">PostgreSQL extension (Production)</div>
                          </div>
                        </div>
                      </SelectItem>
                      <SelectItem value="cloudflare_vectorize">
                        <div className="flex items-center gap-2">
                          <Cloud className="h-4 w-4" />
                          <div>
                            <div className="font-medium">Cloudflare Vectorize</div>
                            <div className="text-xs text-muted-foreground">Edge-native, global (Production)</div>
                          </div>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  <DashboardCard className="border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/30" bodyClassName="p-3 space-y-2 text-sm">
                      <div className="font-medium flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        {vectorDbForm.provider === "chromadb" ? "ChromaDB" : vectorDbForm.provider === "pgvector" ? "pgvector" : "Cloudflare Vectorize"} Features:
                      </div>
                      {vectorDbForm.provider === "chromadb" ? (
                        <ul className="space-y-1 text-xs text-muted-foreground ml-6 list-disc">
                          <li>Zero configuration required</li>
                          <li>Automatic model download (all-MiniLM-L6-v2)</li>
                          <li>Fast in-memory + persistent storage</li>
                          <li>Perfect for development and small projects</li>
                          <li className="text-amber-600">Limited scalability (single machine)</li>
                        </ul>
                      ) : vectorDbForm.provider === "pgvector" ? (
                        <ul className="space-y-1 text-xs text-muted-foreground ml-6 list-disc">
                          <li>Production-ready with PostgreSQL ACID</li>
                          <li>Hybrid search (vector + full-text)</li>
                          <li>Multi-tenant support with isolation</li>
                          <li>Scalable (distributed, replication)</li>
                          <li className="text-amber-600">Requires PostgreSQL with pgvector extension</li>
                        </ul>
                      ) : (
                        <ul className="space-y-1 text-xs text-muted-foreground ml-6 list-disc">
                          <li>Edge-native vector search (Cloudflare network)</li>
                          <li>Global distribution with low latency</li>
                          <li>Managed service, zero infrastructure</li>
                          <li>Supports metadata filtering</li>
                          <li className="text-amber-600">Requires Cloudflare account with Workers plan</li>
                        </ul>
                      )}
                  </DashboardCard>
                </div>

                {/* Embedding Model Selection */}
                <div className="space-y-3">
                  <Label htmlFor="embeddingModel" className="text-base font-semibold">Embedding Model</Label>
                  <Select
                    value={vectorDbForm.embeddingModel}
                    onValueChange={(value) =>
                      setVectorDbForm({
                        ...vectorDbForm,
                        embeddingModel: value,
                        embeddingDimension: value === "all-MiniLM-L6-v2" ? 384 : 1536,
                      })
                    }
                  >
                    <SelectTrigger id="embeddingModel" className="max-w-md">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all-MiniLM-L6-v2">
                        <div>
                          <div className="font-medium">all-MiniLM-L6-v2 (384D)</div>
                          <div className="text-xs text-muted-foreground">FREE • Local • Fast</div>
                        </div>
                      </SelectItem>
                      <SelectItem value="text-embedding-ada-002">
                        <div>
                          <div className="font-medium">text-embedding-ada-002 (1536D)</div>
                          <div className="text-xs text-muted-foreground">OpenAI • ~$0.0001/1K tokens</div>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-md text-xs">
                    <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <strong>Dimension: {vectorDbForm.embeddingDimension}</strong> •{" "}
                      {vectorDbForm.embeddingModel === "all-MiniLM-L6-v2"
                        ? "MiniLM runs locally, no API key needed"
                        : "OpenAI embeddings require API key below"}
                    </div>
                  </div>
                </div>

                {/* ChromaDB Settings */}
                {vectorDbForm.provider === "chromadb" && (
                  <div className="space-y-3 border-t pt-4">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <Database className="h-4 w-4" />
                      ChromaDB Configuration
                    </h3>

                    <div className="space-y-2">
                      <Label htmlFor="chromaPersistDir">Persistence Directory</Label>
                      <Input
                        id="chromaPersistDir"
                        value={vectorDbForm.chromaPersistDir}
                        onChange={(e) =>
                          setVectorDbForm({ ...vectorDbForm, chromaPersistDir: e.target.value })
                        }
                        placeholder="~/.smartaihub/chroma"
                        className="max-w-md font-mono text-sm"
                      />
                      <p className="text-xs text-muted-foreground">
                        Path where ChromaDB stores collections. Use absolute path or ~/ for home directory.
                      </p>
                    </div>

                    <DashboardCard className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30" bodyClassName="p-3 text-xs">
                        <strong className="text-green-800 dark:text-green-200">Example:</strong>
                        <code className="block mt-1 p-2 bg-white dark:bg-slate-900 rounded border text-green-700 dark:text-green-300">
                          CHROMA_PERSIST_DIR=~/.smartaihub/chroma
                        </code>
                    </DashboardCard>
                  </div>
                )}

                {/* pgvector Settings */}
                {vectorDbForm.provider === "pgvector" && (
                  <div className="space-y-4 border-t pt-4">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <Database className="h-4 w-4" />
                      pgvector Configuration (PostgreSQL)
                    </h3>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="pgvectorHost">Host</Label>
                        <Input
                          id="pgvectorHost"
                          value={vectorDbForm.pgvectorHost}
                          onChange={(e) =>
                            setVectorDbForm({ ...vectorDbForm, pgvectorHost: e.target.value })
                          }
                          placeholder="localhost"
                          className="font-mono text-sm"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="pgvectorPort">Port</Label>
                        <Input
                          id="pgvectorPort"
                          value={vectorDbForm.pgvectorPort}
                          onChange={(e) =>
                            setVectorDbForm({ ...vectorDbForm, pgvectorPort: e.target.value })
                          }
                          placeholder="5432"
                          className="font-mono text-sm"
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="pgvectorDatabase">Database Name</Label>
                        <Input
                          id="pgvectorDatabase"
                          value={vectorDbForm.pgvectorDatabase}
                          onChange={(e) =>
                            setVectorDbForm({ ...vectorDbForm, pgvectorDatabase: e.target.value })
                          }
                          placeholder="smartaihub"
                          className="font-mono text-sm"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="pgvectorUser">Username</Label>
                        <Input
                          id="pgvectorUser"
                          value={vectorDbForm.pgvectorUser}
                          onChange={(e) =>
                            setVectorDbForm({ ...vectorDbForm, pgvectorUser: e.target.value })
                          }
                          placeholder="smartaihub"
                          className="font-mono text-sm"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="pgvectorPassword">
                        Password {pgvectorPasswordConfigured && "(leave empty to keep current)"}
                      </Label>
                      <div className="relative max-w-md">
                        <Input
                          id="pgvectorPassword"
                          type={showPgvectorPassword ? "text" : "password"}
                          value={vectorDbForm.pgvectorPassword}
                          onChange={(e) =>
                            setVectorDbForm({ ...vectorDbForm, pgvectorPassword: e.target.value })
                          }
                          placeholder={pgvectorPasswordConfigured ? "••••••••" : "Enter password"}
                          className="pr-10 font-mono text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPgvectorPassword(!showPgvectorPassword)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                        >
                          {showPgvectorPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {pgvectorPasswordConfigured && (
                        <Badge variant="outline" className="text-green-600">
                          <Check className="mr-1 h-3 w-3" />
                          Password configured
                        </Badge>
                      )}
                    </div>

                    <DashboardCard className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30" bodyClassName="p-3 text-xs space-y-2">
                        <strong className="text-green-800 dark:text-green-200">Setup pgvector:</strong>
                        <code className="block p-2 bg-white dark:bg-slate-900 rounded border text-green-700 dark:text-green-300">
                          {`-- Connect to PostgreSQL\npsql -U smartaihub -d smartaihub\n\n-- Enable pgvector extension\nCREATE EXTENSION IF NOT EXISTS vector;`}
                        </code>
                    </DashboardCard>
                  </div>
                )}

                {/* Cloudflare Vectorize Settings */}
                {vectorDbForm.provider === "cloudflare_vectorize" && (
                  <div className="space-y-4 border-t pt-4">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <Cloud className="h-4 w-4" />
                      Cloudflare Vectorize Configuration
                    </h3>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="vectorizeAccountId">Account ID</Label>
                        <Input
                          id="vectorizeAccountId"
                          value={vectorDbForm.vectorizeAccountId}
                          onChange={(e) =>
                            setVectorDbForm({ ...vectorDbForm, vectorizeAccountId: e.target.value })
                          }
                          placeholder="e.g. abc123def456"
                          className="font-mono text-sm"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="vectorizeIndexName">Index Name</Label>
                        <Input
                          id="vectorizeIndexName"
                          value={vectorDbForm.vectorizeIndexName}
                          onChange={(e) =>
                            setVectorDbForm({ ...vectorDbForm, vectorizeIndexName: e.target.value })
                          }
                          placeholder="smartaihub-library"
                          className="font-mono text-sm"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="vectorizeApiToken">
                        API Token {vectorizeApiTokenConfigured && "(leave empty to keep current)"}
                      </Label>
                      <div className="relative max-w-md">
                        <Input
                          id="vectorizeApiToken"
                          type={showVectorizeApiToken ? "text" : "password"}
                          value={vectorDbForm.vectorizeApiToken}
                          onChange={(e) =>
                            setVectorDbForm({ ...vectorDbForm, vectorizeApiToken: e.target.value })
                          }
                          placeholder={vectorizeApiTokenConfigured ? "••••••••" : "Enter API token"}
                          className="pr-10 font-mono text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => setShowVectorizeApiToken(!showVectorizeApiToken)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                        >
                          {showVectorizeApiToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {vectorizeApiTokenConfigured && (
                        <Badge variant="outline" className="text-green-600">
                          <Check className="mr-1 h-3 w-3" />
                          API token configured
                        </Badge>
                      )}
                    </div>

                    <DashboardCard className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30" bodyClassName="p-3 text-xs space-y-2">
                        <strong className="text-green-800 dark:text-green-200">Setup Cloudflare Vectorize:</strong>
                        <ol className="list-decimal ml-4 space-y-1 text-green-700 dark:text-green-300">
                          <li>Go to <a href="https://dash.cloudflare.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">Cloudflare Dashboard</a> &gt; Workers &amp; Pages &gt; Vectorize</li>
                          <li>Click "Create Index" — set name, dimension (must match your embedding model), and metric (cosine)</li>
                          <li>Copy your Account ID from the dashboard URL or Overview page</li>
                          <li>Go to My Profile &gt; API Tokens &gt; Create Token with "Vectorize: Edit" permission</li>
                          <li>Paste the Account ID, Index Name, and API Token above</li>
                        </ol>
                    </DashboardCard>
                  </div>
                )}

                {/* OpenAI API Key (if using OpenAI embeddings) */}
                {vectorDbForm.embeddingModel === "text-embedding-ada-002" && (
                  <div className="space-y-3 border-t pt-4">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <Key className="h-4 w-4" />
                      OpenAI API Key (Required for OpenAI Embeddings)
                    </h3>

                    <div className="space-y-2">
                      <Label htmlFor="openaiApiKey">
                        API Key {openaiApiKeyConfigured && "(leave empty to keep current)"}
                      </Label>
                      <div className="relative max-w-md">
                        <Input
                          id="openaiApiKey"
                          type={showOpenaiApiKey ? "text" : "password"}
                          value={vectorDbForm.openaiApiKey}
                          onChange={(e) =>
                            setVectorDbForm({ ...vectorDbForm, openaiApiKey: e.target.value })
                          }
                          placeholder={openaiApiKeyConfigured ? "sk-••••••••" : "sk-..."}
                          className="pr-10 font-mono text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => setShowOpenaiApiKey(!showOpenaiApiKey)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                        >
                          {showOpenaiApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {openaiApiKeyConfigured && (
                        <Badge variant="outline" className="text-green-600">
                          <Check className="mr-1 h-3 w-3" />
                          API key configured
                        </Badge>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Get your API key from{" "}
                        <a
                          href="https://platform.openai.com/api-keys"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          platform.openai.com/api-keys
                        </a>
                      </p>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3 border-t pt-4">
                  <Button
                    onClick={() => updateVectorDbMutation.mutate(vectorDbForm)}
                    disabled={updateVectorDbMutation.isPending}
                    className="min-w-32"
                  >
                    {updateVectorDbMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    Save Configuration
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => testVectorDbMutation.mutate()}
                    disabled={testVectorDbMutation.isPending}
                  >
                    {testVectorDbMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <TestTube className="w-4 h-4 mr-2" />
                    )}
                    Test Connection
                  </Button>
                </div>

                {/* Reindex Section */}
                <div className="space-y-3 border-t pt-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <RefreshCw className="h-4 w-4" />
                    Reindex All Documents
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Re-process all library documents and rebuild the vector index for the active provider.
                    This is required after switching providers or changing embedding models.
                  </p>

                  {(isReindexing || reindexStatus?.status === "running") && reindexStatus && (
                    <DashboardCard className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30" bodyClassName="space-y-3 p-3">
                        <div className="flex items-center gap-3">
                          <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                          <div className="text-sm">
                            <span className="font-medium text-blue-800">Reindexing in progress...</span>
                            {reindexExpectedJobs > 0 && (
                              <span className="text-blue-600 ml-2">
                                ({reindexCompletedJobs}/{reindexExpectedJobs} completed)
                              </span>
                            )}
                          </div>
                        </div>
                        {reindexExpectedJobs > 0 && (
                          <Progress value={reindexProgressValue} className="h-2" />
                        )}
                        <div className="grid gap-2 text-xs text-blue-700 md:grid-cols-4">
                          <div>Active: {reindexActiveJobs}</div>
                          <div>Completed: {reindexCompletedJobs}</div>
                          <div>Failed: {reindexFailedJobs}</div>
                          <div>Queued: {reindexExpectedJobs}</div>
                        </div>
                    </DashboardCard>
                  )}

                  <Button
                    variant="outline"
                    className="border-amber-300 text-amber-700 hover:bg-amber-50"
                    onClick={() => setShowReindexConfirm(true)}
                    disabled={isReindexing || triggerReindexMutation.isPending}
                  >
                    {triggerReindexMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <RefreshCw className="w-4 h-4 mr-2" />
                    )}
                    {isReindexing ? "Reindexing..." : "Reindex All Documents"}
                  </Button>
                </div>
            </DashboardCard>

            {/* Provider Switch Warning Dialog */}
            <AlertDialog open={showProviderSwitchWarning} onOpenChange={setShowProviderSwitchWarning}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                    Switch Vector Database Provider?
                  </AlertDialogTitle>
                  <AlertDialogDescription className="space-y-2">
                    <p>
                      Switching from <strong>{vectorDbSettings?.provider || "current provider"}</strong> to{" "}
                      <strong>{pendingProvider === "cloudflare_vectorize" ? "Cloudflare Vectorize" : pendingProvider}</strong>{" "}
                      requires reindexing all documents.
                    </p>
                    <p>
                      Your existing index data on the previous provider will be preserved but inactive.
                      After saving, use the "Reindex All Documents" button to rebuild the index on the new provider.
                    </p>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setPendingProvider(null)}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-amber-600 hover:bg-amber-700"
                    onClick={() => {
                      if (pendingProvider) {
                        setVectorDbForm({ ...vectorDbForm, provider: pendingProvider });
                      }
                      setPendingProvider(null);
                      setShowProviderSwitchWarning(false);
                    }}
                  >
                    Switch Provider
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Reindex Confirmation Dialog */}
            <AlertDialog open={showReindexConfirm} onOpenChange={setShowReindexConfirm}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <RefreshCw className="h-5 w-5 text-amber-500" />
                    Reindex All Documents?
                  </AlertDialogTitle>
                  <AlertDialogDescription className="space-y-2">
                    <p>
                      This will reindex all library documents using the currently active vector database provider
                      (<strong>{vectorDbForm.provider === "cloudflare_vectorize" ? "Cloudflare Vectorize" : vectorDbForm.provider}</strong>).
                    </p>
                    <p>
                      The process runs in the background and may take several minutes depending on the number of documents.
                      You can safely navigate away — the reindex will continue.
                    </p>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-amber-600 hover:bg-amber-700"
                    onClick={() => {
                      triggerReindexMutation.mutate();
                      setShowReindexConfirm(false);
                    }}
                  >
                    Start Reindex
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </TabsContent>

          {/* Main Menu Settings Tab */}
          <TabsContent value="storage">
            <StorageSettingsPanel />
          </TabsContent>

          <TabsContent value="infrastructure">
            <InfrastructureSettingsPanel />
          </TabsContent>

          <TabsContent value="agencies">
            <AgencyAdminPanel />
          </TabsContent>

          <TabsContent value="menu">
            <MenuOverridesPanel />
          </TabsContent>

          <TabsContent value="automation">
            <AutomationSettingsPanel />
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
      <DashboardCard className="rounded-2xl" bodyClassName="py-12 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </DashboardCard>
    );
  }

  return (
    <DashboardCard
      className="overflow-hidden"
      leading={<Menu className="w-5 h-5 text-blue-500" />}
      title="Main Menu Settings"
      description="Control which menu items are visible per platform and role. Unchecked items will be hidden."
      bodyClassName="p-0"
    >
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
                                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
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
    </DashboardCard>
  );
}

// ============================================================
// Automation Settings Panel
// ============================================================

function AutomationSettingsPanel() {
  return (
    <TenantAutomationPolicyPanel
      title="Tenant Baseline Policy"
      description="Configure the tenant-wide browser-policy baseline used by Automation Copilot and the browser tool."
    />
  );
}
