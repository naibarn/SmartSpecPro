/**
 * InfrastructureSettingsPanel
 *
 * Admin panel for GCP configuration, Celery/Cloud Tasks toggle,
 * Cloud Tasks queue status dashboard, Redis/cache provider configuration,
 * and monitoring/observability settings (Sentry, PostHog, system health).
 */

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { trpc } from "../../lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DashboardCard } from "@/components/dashboard";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { toast } from "sonner";
import HermesInfrastructureSettingsCard from "./HermesInfrastructureSettingsCard";
import VerticalDramaEnhancedRuntimeSettingsPanel from "./VerticalDramaEnhancedRuntimeSettingsPanel";
import {
  Server,
  Save,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Activity,
  Cloud,
  Info,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  BookOpen,
  Database,
  Zap,
  Wifi,
  WifiOff,
  TestTube,
  Eye,
  EyeOff,
  Shield,
  BarChart3,
  Heart,
  Cpu,
  HardDrive,
  MemoryStick,
  Users,
  Gauge,
  Globe,
} from "lucide-react";

// ============================================================
// Types
// ============================================================

interface GcpConfigField {
  value: string;
  source: "db" | "env" | "none";
}

type GcpConfig = Record<string, GcpConfigField>;

interface GcpForm {
  gcp_project_id: string;
  gcp_region: string;
  cloud_run_python_url: string;
  cloud_run_node_url: string;
  cloud_run_sa_email: string;
}

interface QueueMetric {
  queueName: string;
  taskCount: number;
  oldestTaskAge: number | null;
  dispatchRate: number;
}

interface FailedTask {
  id: number;
  taskId: string;
  queueName: string;
  status: string;
  attemptCount: number;
  errorMessage: string | null;
  createdAt: string;
}

interface RedisConfigField {
  value: string;
  maskedValue: string;
  source: "db" | "env" | "none";
}

type RedisConfig = Record<string, RedisConfigField>;

interface RedisForm {
  redis_provider: string;
  redis_local_url: string;
  redis_upstash_url: string;
  redis_cloud_url: string;
  redis_memorystore_url: string;
  redis_password: string;
}

interface MonitoringConfigField {
  value: string;
  maskedValue: string;
  source: "db" | "env" | "none";
}

interface MonitoringForm {
  sentry_dsn_node: string;
  sentry_dsn_python: string;
  analytics_provider: string;
  posthog_api_key_node: string;
  posthog_api_key_python: string;
  posthog_host: string;
  ga4_measurement_id: string;
  ga4_api_secret: string;
  firebase_api_key: string;
  firebase_project_id: string;
  log_level: string;
  sentry_traces_sample_rate: string;
  sentry_environment: string;
}

interface AppRuntimeConfigField {
  value: string;
  maskedValue: string;
  source: "db" | "env" | "none";
}

interface AppRuntimeForm {
  python_backend_url: string;
  smartspec_proxy_token: string;
  smartspec_web_gateway_token: string;
  smartspec_mcp_token: string;
  smartspec_internal_url: string;
  node_server_internal_url: string;
  upload_post_api_base_url: string;
  public_url: string;
  app_public_url: string;
  app_url: string;
  s3_endpoint: string;
  r2_public_url: string;
  oauth_server_url: string;
  forge_api_url: string;
  forge_api_key: string;
  llm_gateway_service_account_id: string;
}

interface McpRuntimeForm {
  modern_protocol_enabled: boolean;
  oauth_inbound_enabled: boolean;
  oauth_protected_resource_enabled: boolean;
  oauth_authorization_server_enabled: boolean;
  oauth_dynamic_registration_enabled: boolean;
  public_base_url: string;
  oauth_issuer: string;
  oauth_resource: string;
  oauth_jwks_uri: string;
  oauth_audience: string;
  oauth_authorization_servers: string;
  oauth_scopes_supported: string;
  cors_allowed_origins: string;
  session_allowed_origins: string;
  session_ttl_seconds: number;
  workspace_root: string;
  workspace_write_enabled: boolean;
  max_read_bytes: number;
  max_write_bytes: number;
  extension_allowlist: string;
  mcp_rpm: number;
}

function buildRecommendedMcpRuntimeForm(
  scopes: readonly string[],
  publicBaseUrl = "https://smartaihub.app",
): McpRuntimeForm {
  const normalizedBaseUrl = publicBaseUrl.trim().replace(/\/$/, "") || "https://smartaihub.app";
  return {
    modern_protocol_enabled: true,
    oauth_inbound_enabled: true,
    oauth_protected_resource_enabled: true,
    oauth_authorization_server_enabled: true,
    // Hermes CLI and other native MCP clients use RFC 7591 registration to
    // obtain a client_id before starting the browser-based PKCE flow. The
    // registration endpoint remains safe because the server only accepts
    // HTTPS or explicit loopback redirect URIs and applies a rate limit.
    oauth_dynamic_registration_enabled: true,
    public_base_url: normalizedBaseUrl,
    oauth_issuer: normalizedBaseUrl,
    oauth_resource: `${normalizedBaseUrl}/v1/mcp`,
    oauth_jwks_uri: `${normalizedBaseUrl}/.well-known/jwks.json`,
    oauth_audience: "smartaihub-mcp",
    oauth_authorization_servers: normalizedBaseUrl,
    oauth_scopes_supported: scopes.join("\n"),
    cors_allowed_origins: normalizedBaseUrl,
    session_allowed_origins: normalizedBaseUrl,
    session_ttl_seconds: 1800,
    workspace_root: "",
    workspace_write_enabled: false,
    max_read_bytes: 1_048_576,
    max_write_bytes: 1_048_576,
    extension_allowlist: ".md,.txt,.json,.yaml,.yml,.ts,.tsx,.js,.py,.css,.html",
    mcp_rpm: 240,
  };
}

function getBrowserPublicBaseUrl(): string {
  if (typeof window !== "undefined" && window.location.origin.startsWith("https://")) {
    return window.location.origin.replace(/\/$/, "");
  }
  return "https://smartaihub.app";
}

// ============================================================
// Constants
// ============================================================

const GCP_REGIONS = [
  "asia-southeast1",
  "asia-east1",
  "asia-northeast1",
  "us-central1",
  "us-east1",
  "us-west1",
  "europe-west1",
  "europe-west3",
  "australia-southeast1",
];

const QUEUE_LABELS: Record<string, string> = {
  "media-jobs": "Media Jobs",
  "video-jobs-short": "Video (Short)",
  "video-jobs-long": "Video (Long)",
  "workflow-tasks": "Workflow",
  "polling-tasks": "Polling",
  "periodic-tasks": "Periodic",
};

const EMPTY_FORM: GcpForm = {
  gcp_project_id: "",
  gcp_region: "",
  cloud_run_python_url: "",
  cloud_run_node_url: "",
  cloud_run_sa_email: "",
};

// ============================================================
// Component
// ============================================================

export default function InfrastructureSettingsPanel() {
  const { i18n } = useTranslation();
  const isThai = i18n.resolvedLanguage?.startsWith("th") || i18n.language?.startsWith("th");
  const copy = {
    tabs: {
      gcp: isThai ? "GCP" : "GCP",
      runtime: isThai ? "รันไทม์" : "Runtime",
      tasks: isThai ? "งาน" : "Tasks",
      queues: isThai ? "คิว" : "Queues",
      redis: isThai ? "Redis" : "Redis",
      monitoring: isThai ? "มอนิเตอร์" : "Monitoring",
      scaleTier: isThai ? "ระดับการสเกล" : "Scale Tier",
      mcp: isThai ? "MCP/OAuth" : "MCP/OAuth",
    },
    gcp: {
      title: isThai ? "ตั้งค่า GCP" : "GCP Configuration",
      description: isThai ? "ตั้งค่า Google Cloud Platform สำหรับ Cloud Run และ Cloud Tasks" : "Google Cloud Platform project settings for Cloud Run and Cloud Tasks.",
      guideTitle: isThai ? "คู่มือการตั้งค่า — วิธีตั้งค่า GCP สำหรับ Cloud Tasks" : "Setup Guide — How to configure GCP for Cloud Tasks",
      projectId: isThai ? "Project ID" : "Project ID",
      region: isThai ? "รีเจียน" : "Region",
      selectRegion: isThai ? "เลือกรีเจียน" : "Select region",
      pythonServiceUrl: isThai ? "Python Service URL" : "Python Service URL",
      nodeServiceUrl: isThai ? "Node Service URL" : "Node Service URL",
      serviceAccountEmail: isThai ? "อีเมล Service Account" : "Service Account Email",
      save: isThai ? "บันทึกการตั้งค่า GCP" : "Save GCP Configuration",
      env: isThai ? "มาจาก env" : "from env",
    },
    runtime: {
      title: isThai ? "ปลายทางและโทเคนของ App Runtime" : "App Runtime Endpoints & Tokens",
      hideSecrets: isThai ? "ซ่อน secrets" : "Hide secrets",
      showSecrets: isThai ? "แสดง secrets" : "Show secrets",
    },
    mcp: {
      title: isThai ? "MCP และ OAuth" : "MCP & OAuth",
      description: isThai ? "ตั้งค่า MCP สำหรับ Hermes, Claude และ Codex ผ่านฐานข้อมูล ไม่ต้องแก้ env บน production" : "Configure MCP for Hermes, Claude, and Codex through the database; no production env editing is required.",
      source: isThai ? "แหล่งค่าปัจจุบัน" : "Current source",
      database: isThai ? "ฐานข้อมูล (UI)" : "Database (UI)",
      none: isThai ? "ยังไม่ได้ตั้งค่า" : "Not configured",
      save: isThai ? "บันทึก MCP/OAuth" : "Save MCP/OAuth",
      keyReady: isThai ? "มี signing key แล้ว" : "Signing key configured",
      keyMissing: isThai ? "ยังไม่มี signing key" : "Signing key missing",
      keyAutomatic: isThai ? "ระบบจะสร้าง signing key อัตโนมัติเมื่อเปิด OAuth Authorization Server" : "The server creates the signing key automatically when OAuth Authorization Server is enabled.",
      productionNote: isThai ? "Production จะอ่านค่าจาก UI/ฐานข้อมูลเท่านั้น บันทึกแล้ว refresh runtime ทันที ไม่ต้องใส่ค่า MCP_* ใน env" : "Production reads MCP settings from the UI/database only. Saving refreshes the runtime immediately; MCP_* env values are not required.",
      modern: isThai ? "เปิด Modern MCP protocol" : "Enable Modern MCP protocol",
      inbound: isThai ? "รับและตรวจสอบ OAuth bearer token" : "Accept and verify OAuth bearer tokens",
      protectedResource: isThai ? "เปิด OAuth Protected Resource Metadata" : "Publish OAuth Protected Resource Metadata",
      authorizationServer: isThai ? "เปิด OAuth Authorization Server" : "Enable OAuth Authorization Server",
      dynamicRegistration: isThai ? "อนุญาต dynamic client registration (จำเป็นสำหรับ CLI ครั้งแรก)" : "Allow dynamic client registration (required for first-time CLI setup)",
      publicBaseUrl: isThai ? "Public base URL" : "Public base URL",
      issuer: isThai ? "OAuth issuer" : "OAuth issuer",
      resource: isThai ? "MCP resource" : "MCP resource",
      jwks: isThai ? "JWKS URL" : "JWKS URL",
      audience: isThai ? "Audience" : "Audience",
      authServers: isThai ? "Authorization servers (บรรทัดละหนึ่งรายการ)" : "Authorization servers (one per line)",
      scopes: isThai ? "Scopes ที่อนุญาต (บรรทัดละหนึ่งรายการ)" : "Allowed scopes (one per line)",
      cors: isThai ? "CORS origins (บรรทัดละหนึ่งรายการ)" : "CORS origins (one per line)",
      sessionOrigins: isThai ? "Session origins (บรรทัดละหนึ่งรายการ)" : "Session origins (one per line)",
      sessionTtl: isThai ? "อายุ session (วินาที)" : "Session TTL (seconds)",
    },
    renderWorker: {
      title: isThai ? "Render Worker ในเครื่องนี้" : "In-Server Render Worker",
      label: isThai
        ? "ให้เซิร์ฟเวอร์เรนเดอร์วิดีโอ (ffmpeg) เอง"
        : "Server also acts as an ffmpeg render worker",
      helper: isThai
        ? "เมื่อเปิด เซิร์ฟเวอร์นี้จะดึงงาน ffmpeg จากคิว Render Jobs มาเรนเดอร์เอง (ทำงานเหมือน worker หนึ่งตัว, เฉพาะงาน ffmpeg ไม่รวม Remotion/Hyperframes). เมื่อปิด งานจะรอในคิวจนกว่าจะมี worker มารับ"
        : "When on, this server claims and renders ffmpeg video-assembly jobs from the Render Jobs queue (acts like one worker; ffmpeg-only, not Remotion/Hyperframes). When off, jobs wait in the queue until another worker claims them.",
    },
  } as const;
  const [activeTab, setActiveTab] = useState("gcp");
  const [gcpForm, setGcpForm] = useState<GcpForm>(EMPTY_FORM);
  const [selectedMode, setSelectedMode] = useState<"celery" | "cloud_tasks">("celery");
  const [showFailedTasks, setShowFailedTasks] = useState(false);
  const [showGcpGuide, setShowGcpGuide] = useState(false);
  const [showRedisGuide, setShowRedisGuide] = useState(false);
  const [showRedisPasswords, setShowRedisPasswords] = useState(false);
  const [redisForm, setRedisForm] = useState<RedisForm>({
    redis_provider: "local",
    redis_local_url: "",
    redis_upstash_url: "",
    redis_cloud_url: "",
    redis_memorystore_url: "",
    redis_password: "",
  });
  const [testUrl, setTestUrl] = useState("");
  const [showMonitoringGuide, setShowMonitoringGuide] = useState(false);
  const [showMonitoringSecrets, setShowMonitoringSecrets] = useState(false);
  const [showAppRuntimeSecrets, setShowAppRuntimeSecrets] = useState(false);
  const [monitoringForm, setMonitoringForm] = useState<MonitoringForm>({
    sentry_dsn_node: "",
    sentry_dsn_python: "",
    analytics_provider: "posthog",
    posthog_api_key_node: "",
    posthog_api_key_python: "",
    posthog_host: "",
    ga4_measurement_id: "",
    ga4_api_secret: "",
    firebase_api_key: "",
    firebase_project_id: "",
    log_level: "info",
    sentry_traces_sample_rate: "0.05",
    sentry_environment: "development",
  });
  const [appRuntimeForm, setAppRuntimeForm] = useState<AppRuntimeForm>({
    python_backend_url: "",
    smartspec_proxy_token: "",
    smartspec_web_gateway_token: "",
    smartspec_mcp_token: "",
    smartspec_internal_url: "",
    node_server_internal_url: "",
    upload_post_api_base_url: "",
    public_url: "",
    app_public_url: "",
    app_url: "",
    s3_endpoint: "",
    r2_public_url: "",
    oauth_server_url: "",
    forge_api_url: "",
    forge_api_key: "",
    llm_gateway_service_account_id: "",
  });
  const [mcpRuntimeForm, setMcpRuntimeForm] = useState<McpRuntimeForm>({
    modern_protocol_enabled: false,
    oauth_inbound_enabled: false,
    oauth_protected_resource_enabled: false,
    oauth_authorization_server_enabled: false,
    oauth_dynamic_registration_enabled: false,
    public_base_url: "",
    oauth_issuer: "",
    oauth_resource: "",
    oauth_jwks_uri: "",
    oauth_audience: "smartaihub-mcp",
    oauth_authorization_servers: "",
    oauth_scopes_supported: "",
    cors_allowed_origins: "",
    session_allowed_origins: "",
    session_ttl_seconds: 1800,
    workspace_root: "",
    workspace_write_enabled: false,
    max_read_bytes: 1_048_576,
    max_write_bytes: 1_048_576,
    extension_allowlist: ".md,.txt,.json,.yaml,.yml,.ts,.tsx,.js,.py,.css,.html",
    mcp_rpm: 240,
  });
  const [webProcessRenderWorkerEnabled, setWebProcessRenderWorkerEnabled] = useState(false);
  const [confirmServerFfmpegWorker, setConfirmServerFfmpegWorker] = useState(false);

  const [selectedTier, setSelectedTier] = useState<"starter" | "growth" | "pro" | "business" | "enterprise">("starter");
  const [selectedDeployMode, setSelectedDeployMode] = useState<"localhost" | "cloudrun">("localhost");
  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const [applyResults, setApplyResults] = useState<any[] | null>(null);
  const [, setLocation] = useLocation();

  // --- Queries ---
  const {
    data: gcpConfig,
    isLoading: gcpLoading,
    refetch: refetchGcp,
  } = trpc.infrastructure.getGcpConfig.useQuery();

  const {
    data: modeData,
    isLoading: modeLoading,
    refetch: refetchMode,
  } = trpc.infrastructure.getTaskProcessingMode.useQuery();

  const {
    data: dashboard,
    isLoading: dashboardLoading,
    refetch: refetchDashboard,
  } = trpc.infrastructure.getQueueDashboard.useQuery(undefined, {
    refetchInterval: activeTab === "queues" ? 30_000 : false,
  });

  const {
    data: redisConfig,
    isLoading: redisLoading,
    refetch: refetchRedis,
  } = trpc.infrastructure.getRedisConfig.useQuery();

  const {
    data: redisHealth,
    isLoading: redisHealthLoading,
    refetch: refetchRedisHealth,
  } = trpc.infrastructure.getRedisHealth.useQuery(undefined, {
    refetchInterval: activeTab === "redis" ? 30_000 : false,
  });

  const {
    data: monitoringConfig,
    isLoading: monitoringConfigLoading,
    refetch: refetchMonitoringConfig,
  } = trpc.infrastructure.getMonitoringConfig.useQuery();

  const {
    data: appRuntimeConfig,
    isLoading: appRuntimeLoading,
    refetch: refetchAppRuntime,
  } = trpc.infrastructure.getAppRuntimeConfig.useQuery();

  const {
    data: mcpRuntimeConfig,
    isLoading: mcpRuntimeLoading,
    refetch: refetchMcpRuntime,
  } = trpc.infrastructure.getMcpRuntimeConfig.useQuery();

  const {
    data: monitoringStatus,
    refetch: refetchMonitoringStatus,
  } = trpc.infrastructure.getMonitoringStatus.useQuery();

  const {
    data: systemHealth,
    isLoading: systemHealthLoading,
    refetch: refetchSystemHealth,
  } = trpc.infrastructure.getSystemHealth.useQuery(undefined, {
    refetchInterval: activeTab === "monitoring" ? 30_000 : false,
  });

  const {
    data: scaleTierData,
    refetch: refetchScaleTier,
  } = trpc.infrastructure.getScaleTier.useQuery();

  const { data: deployModeInfo, isLoading: deployModeLoading, refetch: refetchDeployMode } =
    trpc.infrastructure.getDeployModeInfo.useQuery();

  const {
    data: infrastructureSettings,
    refetch: refetchInfrastructureSettings,
  } = trpc.systemSettings.getSettingsByCategory.useQuery({
    category: "infrastructure" as any,
  });

  useEffect(() => {
    const renderWorkerSetting = infrastructureSettings?.find(
      (s: any) => s.key === "web_process_render_worker_enabled",
    );
    setWebProcessRenderWorkerEnabled(renderWorkerSetting?.value === "true");
  }, [infrastructureSettings]);

  const setDeployModeMutation = trpc.infrastructure.setDeployModeInfo.useMutation({
    onSuccess: (data) => {
      toast.success(`Deploy mode switched to ${data.mode === "cloudrun" ? "Cloud Run" : "Localhost"}`);
      refetchDeployMode();
      refetchScaleTier();
    },
    onError: (err: any) => toast.error(`Failed to switch: ${err.message}`),
  });

  // --- Mutations ---
  const updateRedisMutation = trpc.infrastructure.updateRedisConfig.useMutation({
    onSuccess: () => {
      toast.success("Redis configuration saved. Restart services to apply changes.");
      refetchRedis();
      refetchRedisHealth();
    },
    onError: (err) => toast.error(`Failed to save: ${err.message}`),
  });

  const testRedisMutation = trpc.infrastructure.testRedisConnection.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Connected! Redis ${data.version}, Memory: ${data.memory}`);
      } else {
        toast.error(`Connection failed: ${data.error}`);
      }
    },
    onError: (err) => toast.error(`Test failed: ${err.message}`),
  });

  const updateMonitoringMutation = trpc.infrastructure.updateMonitoringConfig.useMutation({
    onSuccess: () => {
      toast.success("Monitoring configuration saved. Restart services to apply changes.");
      refetchMonitoringConfig();
      refetchMonitoringStatus();
    },
    onError: (err) => toast.error(`Failed to save: ${err.message}`),
  });

  const updateAppRuntimeMutation = trpc.infrastructure.updateAppRuntimeConfig.useMutation({
    onSuccess: () => {
      toast.success("App runtime configuration saved. Restart services to apply changes.");
      refetchAppRuntime();
    },
    onError: (err) => toast.error(`Failed to save: ${err.message}`),
  });

  const updateMcpRuntimeMutation = trpc.infrastructure.updateMcpRuntimeConfig.useMutation({
    onSuccess: () => {
      toast.success(isThai ? "บันทึก MCP/OAuth สำเร็จ และ refresh runtime แล้ว" : "MCP/OAuth saved and runtime refreshed");
      refetchMcpRuntime();
    },
    onError: (err) => toast.error(`Failed to save MCP/OAuth: ${err.message}`),
  });

  const generateMcpOAuthSigningKeyMutation = trpc.infrastructure.generateMcpOAuthSigningKey.useMutation({
    onSuccess: (data) => {
      toast.success(isThai
        ? `สร้าง signing key สำเร็จ (${data.kid})`
        : `Signing key created (${data.kid})`);
      refetchMcpRuntime();
    },
    onError: (err) => toast.error(isThai
      ? `สร้าง signing key ไม่สำเร็จ: ${err.message}`
      : `Failed to create signing key: ${err.message}`),
  });

  const updateGcpMutation = trpc.infrastructure.updateGcpConfig.useMutation({
    onSuccess: () => {
      toast.success("GCP configuration saved");
      refetchGcp();
    },
    onError: (err) => toast.error(`Failed to save: ${err.message}`),
  });

  const updateRenderWorkerSettingMutation = trpc.systemSettings.updateSetting.useMutation({
    onSuccess: () => refetchInfrastructureSettings(),
    onError: (err: any) => toast.error(`Failed to save: ${err.message}`),
  });
  const applyRenderWorkerSetting = (checked: boolean) => {
    const previousValue = webProcessRenderWorkerEnabled;
    setWebProcessRenderWorkerEnabled(checked);
    updateRenderWorkerSettingMutation.mutate(
      {
        category: "infrastructure" as any,
        key: "web_process_render_worker_enabled",
        value: checked ? "true" : "false",
        description:
          "Web server process also claims and renders ffmpeg video-assembly jobs from the render queue",
      },
      {
        onError: () => setWebProcessRenderWorkerEnabled(previousValue),
      },
    );
  };


  const setModeMutation = trpc.infrastructure.setTaskProcessingMode.useMutation({
    onSuccess: (data) => {
      toast.success(
        `Task processing switched to ${data.mode === "cloud_tasks" ? "Cloud Tasks" : "Celery"}`,
      );
      refetchMode();
      refetchDashboard();
    },
    onError: (err) => toast.error(`Failed to switch: ${err.message}`),
  });

  const applyScaleTierMutation = trpc.infrastructure.applyScaleTier.useMutation({
    onSuccess: (data) => {
      setApplyResults(data.results);
      const errors = data.results.filter((r: any) => r.status === "error");
      if (errors.length === 0) {
        toast.success("Scale tier applied successfully! Services restarted.");
      } else {
        toast.warning(`Scale tier applied with ${errors.length} issue(s). Check results below.`);
      }
      refetchScaleTier();
      setShowApplyDialog(false);
    },
    onError: (err) => toast.error(`Failed to apply: ${err.message}`),
  });

  // --- Populate form from query data ---
  useEffect(() => {
    if (gcpConfig) {
      setGcpForm({
        gcp_project_id: gcpConfig.gcp_project_id?.value ?? "",
        gcp_region: gcpConfig.gcp_region?.value ?? "",
        cloud_run_python_url: gcpConfig.cloud_run_python_url?.value ?? "",
        cloud_run_node_url: gcpConfig.cloud_run_node_url?.value ?? "",
        cloud_run_sa_email: gcpConfig.cloud_run_sa_email?.value ?? "",
      });
    }
  }, [gcpConfig]);

  useEffect(() => {
    if (modeData) {
      setSelectedMode(modeData.mode as "celery" | "cloud_tasks");
    }
  }, [modeData]);

  useEffect(() => {
    if (redisConfig) {
      setRedisForm({
        redis_provider: redisConfig.redis_provider?.value || "local",
        redis_local_url: redisConfig.redis_local_url?.value || "",
        redis_upstash_url: redisConfig.redis_upstash_url?.value || "",
        redis_cloud_url: redisConfig.redis_cloud_url?.value || "",
        redis_memorystore_url: redisConfig.redis_memorystore_url?.value || "",
        redis_password: redisConfig.redis_password?.value || "",
      });
    }
  }, [redisConfig]);

  useEffect(() => {
    if (monitoringConfig) {
      setMonitoringForm({
        sentry_dsn_node: monitoringConfig.sentry_dsn_node?.value || "",
        sentry_dsn_python: monitoringConfig.sentry_dsn_python?.value || "",
        analytics_provider: monitoringConfig.analytics_provider?.value || "posthog",
        posthog_api_key_node: monitoringConfig.posthog_api_key_node?.value || "",
        posthog_api_key_python: monitoringConfig.posthog_api_key_python?.value || "",
        posthog_host: monitoringConfig.posthog_host?.value || "",
        ga4_measurement_id: monitoringConfig.ga4_measurement_id?.value || "",
        ga4_api_secret: monitoringConfig.ga4_api_secret?.value || "",
        firebase_api_key: monitoringConfig.firebase_api_key?.value || "",
        firebase_project_id: monitoringConfig.firebase_project_id?.value || "",
        log_level: monitoringConfig.log_level?.value || "info",
        sentry_traces_sample_rate: monitoringConfig.sentry_traces_sample_rate?.value || "0.05",
        sentry_environment: monitoringConfig.sentry_environment?.value || "development",
      });
    }
  }, [monitoringConfig]);

  useEffect(() => {
    if (appRuntimeConfig) {
      setAppRuntimeForm({
        python_backend_url: appRuntimeConfig.python_backend_url?.value || "",
        smartspec_proxy_token: appRuntimeConfig.smartspec_proxy_token?.value || "",
        smartspec_web_gateway_token: appRuntimeConfig.smartspec_web_gateway_token?.value || "",
        smartspec_mcp_token: appRuntimeConfig.smartspec_mcp_token?.value || "",
        smartspec_internal_url: appRuntimeConfig.smartspec_internal_url?.value || "",
        node_server_internal_url: appRuntimeConfig.node_server_internal_url?.value || "",
        upload_post_api_base_url: appRuntimeConfig.upload_post_api_base_url?.value || "",
        public_url: appRuntimeConfig.public_url?.value || "",
        app_public_url: appRuntimeConfig.app_public_url?.value || "",
        app_url: appRuntimeConfig.app_url?.value || "",
        s3_endpoint: appRuntimeConfig.s3_endpoint?.value || "",
        r2_public_url: appRuntimeConfig.r2_public_url?.value || "",
        oauth_server_url: appRuntimeConfig.oauth_server_url?.value || "",
        forge_api_url: appRuntimeConfig.forge_api_url?.value || "",
        forge_api_key: appRuntimeConfig.forge_api_key?.value || "",
        llm_gateway_service_account_id: appRuntimeConfig.llm_gateway_service_account_id?.value || "",
      });
    }
  }, [appRuntimeConfig]);

  useEffect(() => {
    const config = mcpRuntimeConfig?.config;
    if (!config) return;
    // Empty URL values are rendered as placeholders by the browser and are
    // easy to mistake for real values. Seed only missing fields from the
    // current HTTPS origin so the first production save is actionable.
    const defaults = buildRecommendedMcpRuntimeForm(
      mcpRuntimeConfig?.defaults?.scopesSupported ?? [],
      getBrowserPublicBaseUrl(),
    );
    setMcpRuntimeForm({
      modern_protocol_enabled: config.modernProtocolEnabled,
      oauth_inbound_enabled: config.oauthInboundEnabled,
      oauth_protected_resource_enabled: config.oauthProtectedResourceEnabled,
      oauth_authorization_server_enabled: config.oauthAuthorizationServerEnabled,
      oauth_dynamic_registration_enabled: config.oauthDynamicRegistrationEnabled,
      public_base_url: config.publicBaseUrl || defaults.public_base_url,
      oauth_issuer: config.oauthIssuer || defaults.oauth_issuer,
      oauth_resource: config.oauthResource || defaults.oauth_resource,
      oauth_jwks_uri: config.oauthJwksUri || defaults.oauth_jwks_uri,
      oauth_audience: config.oauthAudience,
      oauth_authorization_servers: config.oauthAuthorizationServers.join("\n") || defaults.oauth_authorization_servers,
      oauth_scopes_supported: config.oauthScopesSupported.join("\n") || defaults.oauth_scopes_supported,
      cors_allowed_origins: config.corsAllowedOrigins.join("\n") || defaults.cors_allowed_origins,
      session_allowed_origins: config.sessionAllowedOrigins.join("\n") || defaults.session_allowed_origins,
      session_ttl_seconds: config.sessionTtlSeconds,
      workspace_root: config.workspaceRoot,
      workspace_write_enabled: config.workspaceWriteEnabled,
      max_read_bytes: config.maxReadBytes,
      max_write_bytes: config.maxWriteBytes,
      extension_allowlist: config.extensionAllowlist.join(","),
      mcp_rpm: config.mcpRpm,
    });
  }, [mcpRuntimeConfig]);

  useEffect(() => {
    if (scaleTierData?.tier) {
      setSelectedTier(scaleTierData.tier);
    }
  }, [scaleTierData]);

  // Sync deploy mode — deployModeInfo is the authoritative source
  useEffect(() => {
    if (deployModeInfo?.mode) {
      setSelectedDeployMode(deployModeInfo.mode as "localhost" | "cloudrun");
    } else if (scaleTierData?.deployMode) {
      setSelectedDeployMode(scaleTierData.deployMode as "localhost" | "cloudrun");
    }
  }, [deployModeInfo, scaleTierData]);

  // --- Handlers ---
  const handleSaveGcp = () => {
    updateGcpMutation.mutate(gcpForm);
  };

  const handleSaveMode = () => {
    setModeMutation.mutate({ mode: selectedMode });
  };

  const handleSaveRedis = () => {
    updateRedisMutation.mutate(redisForm as any);
  };

  const handleTestRedis = () => {
    let url = testUrl;
    if (!url) {
      const providerUrlMap: Record<string, string> = {
        upstash: redisForm.redis_upstash_url,
        redis_cloud: redisForm.redis_cloud_url,
        memorystore: redisForm.redis_memorystore_url,
        local: redisForm.redis_local_url,
      };
      url = providerUrlMap[redisForm.redis_provider] || redisForm.redis_local_url;
    }
    if (!url) {
      toast.error("Enter a Redis URL to test");
      return;
    }
    testRedisMutation.mutate({ url });
  };

  const handleSaveMonitoring = () => {
    updateMonitoringMutation.mutate(monitoringForm as any);
  };

  const handleSaveAppRuntime = () => {
    updateAppRuntimeMutation.mutate(appRuntimeForm as any);
  };

  const handleSaveMcpRuntime = () => {
    const urlFields = [
      ["Public base URL", mcpRuntimeForm.public_base_url],
      ["OAuth issuer", mcpRuntimeForm.oauth_issuer],
      ["MCP resource", mcpRuntimeForm.oauth_resource],
      ["JWKS URL", mcpRuntimeForm.oauth_jwks_uri],
    ] as const;
    const invalidField = urlFields.find(([, value]) => {
      try {
        const parsed = new URL(value.trim());
        return parsed.protocol !== "https:" || !parsed.hostname;
      } catch {
        return true;
      }
    });
    if (invalidField) {
      toast.error(isThai
        ? `กรุณากรอก ${invalidField[0]} เป็น HTTPS URL ที่ถูกต้อง หรือกด “ใช้ค่ามาตรฐาน production”`
        : `${invalidField[0]} must be a valid HTTPS URL. Use “Use production defaults” to fill it automatically.`);
      return;
    }
    updateMcpRuntimeMutation.mutate({
      ...mcpRuntimeForm,
      public_base_url: mcpRuntimeForm.public_base_url.trim(),
      oauth_issuer: mcpRuntimeForm.oauth_issuer.trim(),
      oauth_resource: mcpRuntimeForm.oauth_resource.trim(),
      oauth_jwks_uri: mcpRuntimeForm.oauth_jwks_uri.trim(),
    });
  };

  const applyRecommendedMcpRuntime = () => {
    const scopes = mcpRuntimeConfig?.defaults?.scopesSupported
      ?? mcpRuntimeConfig?.config?.oauthScopesSupported
      ?? [];
    setMcpRuntimeForm(buildRecommendedMcpRuntimeForm(scopes));
    toast.info(isThai
      ? "ใส่ค่ามาตรฐาน production แล้ว กดบันทึกเพื่อเปิดใช้งาน"
      : "Production-safe MCP defaults loaded. Save to apply them.");
  };

  const hasGcpConfig = !!(gcpForm.gcp_project_id && gcpForm.gcp_region);

  // --- Loading state ---
  if (gcpLoading && modeLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <VerticalDramaEnhancedRuntimeSettingsPanel />
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 md:grid-cols-8">
          <TabsTrigger value="gcp" className="flex items-center gap-1">
            <Cloud className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{copy.tabs.gcp}</span>
          </TabsTrigger>
          <TabsTrigger value="app-runtime" className="flex items-center gap-1">
            <Globe className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{copy.tabs.runtime}</span>
          </TabsTrigger>
          <TabsTrigger value="mcp" className="flex items-center gap-1">
            <Shield className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{copy.tabs.mcp}</span>
          </TabsTrigger>
          <TabsTrigger value="tasks" className="flex items-center gap-1">
            <Server className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{copy.tabs.tasks}</span>
          </TabsTrigger>
          <TabsTrigger value="queues" className="flex items-center gap-1">
            <Activity className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{copy.tabs.queues}</span>
          </TabsTrigger>
          <TabsTrigger value="redis" className="flex items-center gap-1">
            <Database className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{copy.tabs.redis}</span>
          </TabsTrigger>
          <TabsTrigger value="monitoring" className="flex items-center gap-1">
            <Shield className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{copy.tabs.monitoring}</span>
          </TabsTrigger>
          <TabsTrigger value="scale-tier" className="flex items-center gap-1">
            <Gauge className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{copy.tabs.scaleTier}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="gcp">
      {/* ============================================ */}
      {/* CARD 1: GCP Configuration                   */}
      {/* ============================================ */}
      <DashboardCard className="border-0 shadow-sm shadow-gray-200/50 rounded-2xl overflow-hidden">
        <div className="border-b bg-gradient-to-r from-purple-50/50 to-pink-50/30 pb-5">
          <h3 className="flex items-center gap-2 text-lg">
            <Cloud className="w-5 h-5 text-purple-500" />
            {copy.gcp.title}
          </h3>
          <p>
            {copy.gcp.description}
          </p>
        </div>
        <div className="space-y-5 pt-6">
          {/* Setup Guide (collapsible) */}
          <div className="rounded-xl border border-blue-200 bg-blue-50/50 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowGcpGuide(!showGcpGuide)}
              className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium text-blue-700 hover:bg-blue-100/50 transition-colors"
            >
              <span className="flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                {copy.gcp.guideTitle}
              </span>
              {showGcpGuide ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
            {showGcpGuide && (
              <div className="px-4 pb-4 text-sm text-blue-800 space-y-4 border-t border-blue-200">
                {/* Step 1 */}
                <div className="pt-3">
                  <p className="font-semibold mb-1">Step 1: Create GCP Project</p>
                  <ol className="list-decimal ml-5 space-y-1 text-blue-700">
                    <li>
                      Go to{" "}
                      <a
                        href="https://console.cloud.google.com/projectcreate"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline inline-flex items-center gap-0.5"
                      >
                        GCP Console → Create Project
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </li>
                    <li>Enter a project name (e.g. <code className="bg-blue-100 px-1 rounded">smartaihub-mvp</code>)</li>
                    <li>Copy the <strong>Project ID</strong> and paste it in the field below</li>
                  </ol>
                </div>

                {/* Step 2 */}
                <div>
                  <p className="font-semibold mb-1">Step 2: Enable Required APIs</p>
                  <p className="text-blue-700 mb-1">Run these commands in Google Cloud Shell or local gcloud CLI:</p>
                  <pre className="bg-blue-100/70 rounded-lg p-3 text-xs font-mono overflow-x-auto whitespace-pre">
{`gcloud services enable \\
  run.googleapis.com \\
  cloudtasks.googleapis.com \\
  cloudbuild.googleapis.com \\
  artifactregistry.googleapis.com \\
  --project=YOUR_PROJECT_ID`}
                  </pre>
                </div>

                {/* Step 3 */}
                <div>
                  <p className="font-semibold mb-1">Step 3: Create Service Account</p>
                  <pre className="bg-blue-100/70 rounded-lg p-3 text-xs font-mono overflow-x-auto whitespace-pre">
{`# Create the service account
gcloud iam service-accounts create cloud-run-api \\
  --display-name="Cloud Run API" \\
  --project=YOUR_PROJECT_ID

# Grant Cloud Tasks permissions
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \\
  --member="serviceAccount:cloud-run-api@YOUR_PROJECT_ID.iam.gserviceaccount.com" \\
  --role="roles/cloudtasks.enqueuer"

# Grant Cloud Run invoker (for OIDC auth)
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \\
  --member="serviceAccount:cloud-run-api@YOUR_PROJECT_ID.iam.gserviceaccount.com" \\
  --role="roles/run.invoker"`}
                  </pre>
                </div>

                {/* Step 4 */}
                <div>
                  <p className="font-semibold mb-1">Step 4: Create Cloud Tasks Queues</p>
                  <pre className="bg-blue-100/70 rounded-lg p-3 text-xs font-mono overflow-x-auto whitespace-pre">
{`# Create all 6 queues (adjust region as needed)
for QUEUE in media-jobs video-jobs-short video-jobs-long \\
             workflow-tasks polling-tasks periodic-tasks; do
  gcloud tasks queues create $QUEUE \\
    --location=YOUR_REGION \\
    --project=YOUR_PROJECT_ID
done`}
                  </pre>
                </div>

                {/* Step 5 */}
                <div>
                  <p className="font-semibold mb-1">Step 5: Deploy Cloud Run Services</p>
                  <p className="text-blue-700">
                    After deploying your services to Cloud Run, copy the service URLs
                    from the{" "}
                    <a
                      href="https://console.cloud.google.com/run"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline inline-flex items-center gap-0.5"
                    >
                      Cloud Run Console
                      <ExternalLink className="h-3 w-3" />
                    </a>{" "}
                    and paste them in the Python/Node Service URL fields below.
                  </p>
                </div>

                {/* Step 6 */}
                <div>
                  <p className="font-semibold mb-1">Step 6: Fill in the form below</p>
                  <ul className="list-disc ml-5 space-y-1 text-blue-700">
                    <li><strong>Project ID</strong> — Your GCP project ID</li>
                    <li><strong>Region</strong> — Where queues and services are deployed</li>
                    <li><strong>Python Service URL</strong> — Cloud Run URL for the Python backend</li>
                    <li><strong>Node Service URL</strong> — Cloud Run URL for the Node.js API</li>
                    <li>
                      <strong>Service Account Email</strong> — Format:{" "}
                      <code className="bg-blue-100 px-1 rounded text-xs">
                        cloud-run-api@PROJECT_ID.iam.gserviceaccount.com
                      </code>
                    </li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* Project ID */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Label htmlFor="gcp_project_id">{copy.gcp.projectId}</Label>
              {gcpConfig?.gcp_project_id?.source === "env" && (
                <Badge variant="outline" className="text-xs">{copy.gcp.env}</Badge>
              )}
            </div>
            <Input
              id="gcp_project_id"
              value={gcpForm.gcp_project_id}
              onChange={(e) =>
                setGcpForm({ ...gcpForm, gcp_project_id: e.target.value })
              }
              placeholder="e.g. smartaihub-mvp"
            />
          </div>

          {/* Region */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Label htmlFor="gcp_region">{copy.gcp.region}</Label>
              {gcpConfig?.gcp_region?.source === "env" && (
                <Badge variant="outline" className="text-xs">{copy.gcp.env}</Badge>
              )}
            </div>
            <Select
              value={gcpForm.gcp_region}
              onValueChange={(val) => setGcpForm({ ...gcpForm, gcp_region: val })}
            >
              <SelectTrigger id="gcp_region">
                <SelectValue placeholder={copy.gcp.selectRegion} />
              </SelectTrigger>
              <SelectContent>
                {GCP_REGIONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Python Service URL */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Label htmlFor="cloud_run_python_url">{copy.gcp.pythonServiceUrl}</Label>
              {gcpConfig?.cloud_run_python_url?.source === "env" && (
                <Badge variant="outline" className="text-xs">{copy.gcp.env}</Badge>
              )}
            </div>
            <Input
              id="cloud_run_python_url"
              type="url"
              value={gcpForm.cloud_run_python_url}
              onChange={(e) =>
                setGcpForm({ ...gcpForm, cloud_run_python_url: e.target.value })
              }
              placeholder="https://python-orchestrator-xxx.run.app"
            />
          </div>

          {/* Node Service URL */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Label htmlFor="cloud_run_node_url">{copy.gcp.nodeServiceUrl}</Label>
              {gcpConfig?.cloud_run_node_url?.source === "env" && (
                <Badge variant="outline" className="text-xs">{copy.gcp.env}</Badge>
              )}
            </div>
            <Input
              id="cloud_run_node_url"
              type="url"
              value={gcpForm.cloud_run_node_url}
              onChange={(e) =>
                setGcpForm({ ...gcpForm, cloud_run_node_url: e.target.value })
              }
              placeholder="https://node-api-xxx.run.app"
            />
          </div>

          {/* Service Account Email */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Label htmlFor="cloud_run_sa_email">{copy.gcp.serviceAccountEmail}</Label>
              {gcpConfig?.cloud_run_sa_email?.source === "env" && (
                <Badge variant="outline" className="text-xs">{copy.gcp.env}</Badge>
              )}
            </div>
            <Input
              id="cloud_run_sa_email"
              type="email"
              value={gcpForm.cloud_run_sa_email}
              onChange={(e) =>
                setGcpForm({ ...gcpForm, cloud_run_sa_email: e.target.value })
              }
              placeholder="cloud-run-api@project.iam.gserviceaccount.com"
            />
          </div>

          {/* Info notice */}
          <div className="flex items-start gap-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              Changes to service URLs take effect on new task dispatches.
              Running services may need a restart to pick up URL changes.
            </span>
          </div>

          <Button
            onClick={handleSaveGcp}
            disabled={updateGcpMutation.isPending}
          >
            {updateGcpMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {copy.gcp.save}
          </Button>
        </div>
      </DashboardCard>
        </TabsContent>

        <TabsContent value="app-runtime">
          <DashboardCard className="border-0 shadow-sm shadow-gray-200/50 rounded-2xl overflow-hidden">
            <div className="border-b bg-gradient-to-r from-cyan-50/50 to-sky-50/30 pb-5">
              <h3 className="flex items-center gap-2 text-lg">
                <Globe className="w-5 h-5 text-cyan-600" />
                {copy.runtime.title}
              </h3>
              <p>
                Configure Python backend URLs and internal service tokens from the UI instead of file-based env config.
              </p>
            </div>
            <div className="space-y-5 pt-6">
              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-600">
                  Values saved here should become the primary source for app-to-app requests after service restart.
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => refetchAppRuntime()} disabled={appRuntimeLoading}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Refresh
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowAppRuntimeSecrets((v) => !v)}>
                    {showAppRuntimeSecrets ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                    {showAppRuntimeSecrets ? copy.runtime.hideSecrets : copy.runtime.showSecrets}
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="python_backend_url">Python backend URL</Label>
                  <Input id="python_backend_url" value={appRuntimeForm.python_backend_url} onChange={(e) => setAppRuntimeForm((prev) => ({ ...prev, python_backend_url: e.target.value }))} placeholder="https://python.example" />
                  <div className="mt-1 text-xs text-slate-500">Used by STT, TTS, PDF render, social actions, and internal workflow bridges.</div>
                </div>
                <div>
                  <Label htmlFor="upload_post_api_base_url">Upload Post API base URL</Label>
                  <Input id="upload_post_api_base_url" value={appRuntimeForm.upload_post_api_base_url} onChange={(e) => setAppRuntimeForm((prev) => ({ ...prev, upload_post_api_base_url: e.target.value }))} placeholder="https://python.example" />
                </div>
                <div>
                  <Label htmlFor="public_url">Public URL</Label>
                  <Input id="public_url" value={appRuntimeForm.public_url} onChange={(e) => setAppRuntimeForm((prev) => ({ ...prev, public_url: e.target.value }))} placeholder="https://app.example" />
                </div>
                <div>
                  <Label htmlFor="app_public_url">App public URL</Label>
                  <Input id="app_public_url" value={appRuntimeForm.app_public_url} onChange={(e) => setAppRuntimeForm((prev) => ({ ...prev, app_public_url: e.target.value }))} placeholder="https://app.example" />
                </div>
                <div>
                  <Label htmlFor="app_url">App URL</Label>
                  <Input id="app_url" value={appRuntimeForm.app_url} onChange={(e) => setAppRuntimeForm((prev) => ({ ...prev, app_url: e.target.value }))} placeholder="https://app.example" />
                </div>
                <div>
                  <Label htmlFor="smartspec_internal_url">SmartSpec internal URL</Label>
                  <Input id="smartspec_internal_url" value={appRuntimeForm.smartspec_internal_url} onChange={(e) => setAppRuntimeForm((prev) => ({ ...prev, smartspec_internal_url: e.target.value }))} placeholder="http://node.internal:3000" />
                </div>
                <div>
                  <Label htmlFor="node_server_internal_url">Node server internal URL</Label>
                  <Input id="node_server_internal_url" value={appRuntimeForm.node_server_internal_url} onChange={(e) => setAppRuntimeForm((prev) => ({ ...prev, node_server_internal_url: e.target.value }))} placeholder="http://node.internal:3000" />
                </div>
                <div>
                  <Label htmlFor="smartspec_proxy_token">Proxy token</Label>
                  <Input id="smartspec_proxy_token" type={showAppRuntimeSecrets ? "text" : "password"} value={appRuntimeForm.smartspec_proxy_token} onChange={(e) => setAppRuntimeForm((prev) => ({ ...prev, smartspec_proxy_token: e.target.value }))} placeholder={appRuntimeConfig?.smartspec_proxy_token?.source === "db" ? "Leave blank to keep existing secret" : "Enter proxy token"} />
                  <div className="mt-1 text-xs text-slate-500">Source: {appRuntimeConfig?.smartspec_proxy_token?.source ?? "none"}</div>
                </div>
                <div>
                  <Label htmlFor="smartspec_web_gateway_token">Web gateway token</Label>
                  <Input id="smartspec_web_gateway_token" type={showAppRuntimeSecrets ? "text" : "password"} value={appRuntimeForm.smartspec_web_gateway_token} onChange={(e) => setAppRuntimeForm((prev) => ({ ...prev, smartspec_web_gateway_token: e.target.value }))} placeholder={appRuntimeConfig?.smartspec_web_gateway_token?.source === "db" ? "Leave blank to keep existing secret" : "Enter gateway token"} />
                  <div className="mt-1 text-xs text-slate-500">Source: {appRuntimeConfig?.smartspec_web_gateway_token?.source ?? "none"}</div>
                </div>
                <div>
                  <Label htmlFor="smartspec_mcp_token">MCP server token</Label>
                  <Input id="smartspec_mcp_token" type={showAppRuntimeSecrets ? "text" : "password"} value={appRuntimeForm.smartspec_mcp_token} onChange={(e) => setAppRuntimeForm((prev) => ({ ...prev, smartspec_mcp_token: e.target.value }))} placeholder={appRuntimeConfig?.smartspec_mcp_token?.source === "db" ? "Leave blank to keep existing secret" : "Enter MCP token"} />
                  <div className="mt-1 text-xs text-slate-500">Source: {appRuntimeConfig?.smartspec_mcp_token?.source ?? "none"}</div>
                </div>
                <div>
                  <Label htmlFor="s3_endpoint">S3 endpoint</Label>
                  <Input id="s3_endpoint" value={appRuntimeForm.s3_endpoint} onChange={(e) => setAppRuntimeForm((prev) => ({ ...prev, s3_endpoint: e.target.value }))} placeholder="https://s3.example" />
                </div>
                <div>
                  <Label htmlFor="r2_public_url">R2 public URL</Label>
                  <Input id="r2_public_url" value={appRuntimeForm.r2_public_url} onChange={(e) => setAppRuntimeForm((prev) => ({ ...prev, r2_public_url: e.target.value }))} placeholder="https://cdn.example" />
                </div>
                <div>
                  <Label htmlFor="oauth_server_url">OAuth server URL</Label>
                  <Input id="oauth_server_url" value={appRuntimeForm.oauth_server_url} onChange={(e) => setAppRuntimeForm((prev) => ({ ...prev, oauth_server_url: e.target.value }))} placeholder="https://oauth.example" />
                </div>
                <div>
                  <Label htmlFor="forge_api_url">Forge API URL</Label>
                  <Input id="forge_api_url" value={appRuntimeForm.forge_api_url} onChange={(e) => setAppRuntimeForm((prev) => ({ ...prev, forge_api_url: e.target.value }))} placeholder="https://forge.example" />
                </div>
                <div>
                  <Label htmlFor="forge_api_key">Forge API key</Label>
                  <Input id="forge_api_key" type={showAppRuntimeSecrets ? "text" : "password"} value={appRuntimeForm.forge_api_key} onChange={(e) => setAppRuntimeForm((prev) => ({ ...prev, forge_api_key: e.target.value }))} placeholder={appRuntimeConfig?.forge_api_key?.source === "db" ? "Leave blank to keep existing secret" : "Enter Forge API key"} />
                  <div className="mt-1 text-xs text-slate-500">Source: {appRuntimeConfig?.forge_api_key?.source ?? "none"}</div>
                </div>
                <div>
                  <Label htmlFor="llm_gateway_service_account_id">LLM gateway service account ID</Label>
                  <Input id="llm_gateway_service_account_id" value={appRuntimeForm.llm_gateway_service_account_id} onChange={(e) => setAppRuntimeForm((prev) => ({ ...prev, llm_gateway_service_account_id: e.target.value }))} placeholder="1" />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                {[
                  ["python_backend_url", appRuntimeConfig?.python_backend_url?.source],
                  ["public_url", appRuntimeConfig?.public_url?.source],
                  ["app_public_url", appRuntimeConfig?.app_public_url?.source],
                  ["app_url", appRuntimeConfig?.app_url?.source],
                  ["smartspec_internal_url", appRuntimeConfig?.smartspec_internal_url?.source],
                  ["node_server_internal_url", appRuntimeConfig?.node_server_internal_url?.source],
                  ["upload_post_api_base_url", appRuntimeConfig?.upload_post_api_base_url?.source],
                  ["smartspec_proxy_token", appRuntimeConfig?.smartspec_proxy_token?.source],
                  ["smartspec_web_gateway_token", appRuntimeConfig?.smartspec_web_gateway_token?.source],
                  ["smartspec_mcp_token", appRuntimeConfig?.smartspec_mcp_token?.source],
                  ["s3_endpoint", appRuntimeConfig?.s3_endpoint?.source],
                  ["r2_public_url", appRuntimeConfig?.r2_public_url?.source],
                  ["oauth_server_url", appRuntimeConfig?.oauth_server_url?.source],
                  ["forge_api_url", appRuntimeConfig?.forge_api_url?.source],
                  ["forge_api_key", appRuntimeConfig?.forge_api_key?.source],
                  ["llm_gateway_service_account_id", appRuntimeConfig?.llm_gateway_service_account_id?.source],
                ].map(([label, source]) => (
                  <div key={label} className="rounded-xl border border-slate-200 p-3 text-sm">
                    <div className="font-medium text-slate-900">{label}</div>
                    <div className="mt-1 text-xs text-slate-500">Source: {source ?? "none"}</div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSaveAppRuntime} disabled={updateAppRuntimeMutation.isPending}>
                  {updateAppRuntimeMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save App Runtime Configuration
                </Button>
              </div>
            </div>
          </DashboardCard>
        </TabsContent>

        <TabsContent value="mcp">
          <DashboardCard className="border-0 shadow-sm shadow-gray-200/50 rounded-2xl overflow-hidden">
            <div className="border-b bg-gradient-to-r from-emerald-50/60 to-cyan-50/40 pb-5">
              <h3 className="flex items-center gap-2 text-lg"><Shield className="w-5 h-5 text-emerald-600" />{copy.mcp.title}</h3>
              <p>{copy.mcp.description}</p>
            </div>
            <div className="space-y-5 pt-6">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-200 bg-cyan-50/70 p-4 text-sm text-cyan-950">
                <div>
                  <div className="font-semibold">{isThai ? "เปิดใช้งาน production แบบแนะนำ" : "Enable the recommended production profile"}</div>
                  <div className="mt-1 text-xs text-cyan-800">
                    {isThai
                      ? "เปิด Modern MCP, OAuth inbound, PRM, Authorization Server, dynamic registration สำหรับ Hermes/Claude Code/Codex CLI และสร้าง signing key อัตโนมัติเมื่อกดบันทึก โดยไม่เปิด workspace write"
                      : "Enables Modern MCP, inbound OAuth, PRM, the Authorization Server, and controlled dynamic registration for Hermes/Claude Code/Codex CLI. Saving also provisions the signing key; workspace writes stay off."}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => refetchMcpRuntime()} disabled={mcpRuntimeLoading}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {isThai ? "ตรวจสอบค่าปัจจุบัน" : "Refresh status"}
                  </Button>
                  <Button type="button" size="sm" onClick={applyRecommendedMcpRuntime}>
                    <Shield className="mr-2 h-4 w-4" />
                    {isThai ? "ใช้ค่ามาตรฐาน production" : "Use production defaults"}
                  </Button>
                </div>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-sm text-emerald-900">
                <div className="font-semibold">{copy.mcp.productionNote}</div>
                <div className="mt-2">{copy.mcp.source}: <Badge variant="outline">{mcpRuntimeConfig?.source === "db" ? copy.mcp.database : mcpRuntimeConfig?.source === "env" ? "development fallback" : copy.mcp.none}</Badge></div>
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  {mcpRuntimeConfig?.keyConfigured ? (
                    <span className="text-emerald-700">✓ {copy.mcp.keyReady}</span>
                  ) : (
                    <>
                      <span className="text-amber-700">⚠ {copy.mcp.keyMissing}</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="border-amber-300 bg-white text-amber-900 hover:bg-amber-50"
                        disabled={generateMcpOAuthSigningKeyMutation.isPending}
                        onClick={() => generateMcpOAuthSigningKeyMutation.mutate()}
                      >
                        {generateMcpOAuthSigningKeyMutation.isPending
                          ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          : <Shield className="mr-2 h-4 w-4" />}
                        {isThai ? "สร้าง signing key" : "Create signing key"}
                      </Button>
                      <span className="text-xs text-amber-800">{copy.mcp.keyAutomatic}</span>
                    </>
                  )}
                </div>
                <div className="mt-2 grid gap-2 text-xs sm:grid-cols-3">
                  <span>POST {mcpRuntimeForm.oauth_resource || "https://smartaihub.app/v1/mcp"}</span>
                  <span>PRM {mcpRuntimeForm.oauth_protected_resource_enabled ? "enabled" : "off"}</span>
                  <span>JWKS {mcpRuntimeForm.oauth_jwks_uri || "not configured"}</span>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {([
                  ["modern_protocol_enabled", copy.mcp.modern],
                  ["oauth_inbound_enabled", copy.mcp.inbound],
                  ["oauth_protected_resource_enabled", copy.mcp.protectedResource],
                  ["oauth_authorization_server_enabled", copy.mcp.authorizationServer],
                  ["oauth_dynamic_registration_enabled", copy.mcp.dynamicRegistration],
                ] as const).map(([key, label]) => (
                  <label key={key} className="flex items-center justify-between rounded-xl border p-3 text-sm">
                    <span>{label}</span>
                    <Switch checked={mcpRuntimeForm[key]} onCheckedChange={(checked) => setMcpRuntimeForm((prev) => ({ ...prev, [key]: checked }))} />
                  </label>
                ))}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div><Label htmlFor="mcp_public_base_url">{copy.mcp.publicBaseUrl}</Label><Input id="mcp_public_base_url" type="url" value={mcpRuntimeForm.public_base_url} onChange={(e) => setMcpRuntimeForm((p) => ({ ...p, public_base_url: e.target.value }))} placeholder="https://smartaihub.app" /></div>
                <div><Label htmlFor="mcp_oauth_issuer">{copy.mcp.issuer}</Label><Input id="mcp_oauth_issuer" type="url" value={mcpRuntimeForm.oauth_issuer} onChange={(e) => setMcpRuntimeForm((p) => ({ ...p, oauth_issuer: e.target.value }))} placeholder="https://smartaihub.app" /></div>
                <div><Label htmlFor="mcp_oauth_resource">{copy.mcp.resource}</Label><Input id="mcp_oauth_resource" type="url" value={mcpRuntimeForm.oauth_resource} onChange={(e) => setMcpRuntimeForm((p) => ({ ...p, oauth_resource: e.target.value }))} placeholder="https://smartaihub.app/v1/mcp" /></div>
                <div><Label htmlFor="mcp_oauth_jwks_uri">{copy.mcp.jwks}</Label><Input id="mcp_oauth_jwks_uri" type="url" value={mcpRuntimeForm.oauth_jwks_uri} onChange={(e) => setMcpRuntimeForm((p) => ({ ...p, oauth_jwks_uri: e.target.value }))} placeholder="https://smartaihub.app/.well-known/jwks.json" /></div>
                <div><Label htmlFor="mcp_oauth_audience">{copy.mcp.audience}</Label><Input id="mcp_oauth_audience" value={mcpRuntimeForm.oauth_audience} onChange={(e) => setMcpRuntimeForm((p) => ({ ...p, oauth_audience: e.target.value }))} /></div>
                <div><Label htmlFor="mcp_session_ttl">{copy.mcp.sessionTtl}</Label><Input id="mcp_session_ttl" type="number" min={300} max={86400} value={mcpRuntimeForm.session_ttl_seconds} onChange={(e) => setMcpRuntimeForm((p) => ({ ...p, session_ttl_seconds: Number(e.target.value) }))} /></div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {([
                  ["oauth_authorization_servers", copy.mcp.authServers],
                  ["oauth_scopes_supported", copy.mcp.scopes],
                  ["cors_allowed_origins", copy.mcp.cors],
                  ["session_allowed_origins", copy.mcp.sessionOrigins],
                ] as const).map(([key, label]) => (
                  <div key={key}><Label htmlFor={`mcp_${key}`}>{label}</Label><textarea id={`mcp_${key}`} rows={key === "oauth_scopes_supported" ? 8 : 4} value={mcpRuntimeForm[key]} onChange={(e) => setMcpRuntimeForm((p) => ({ ...p, [key]: e.target.value }))} className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm" /></div>
                ))}
              </div>

              <div className="rounded-xl border border-slate-200 p-4 space-y-4">
                <div className="font-medium">Legacy workspace MCP compatibility</div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div><Label htmlFor="mcp_workspace_root">Workspace root</Label><Input id="mcp_workspace_root" value={mcpRuntimeForm.workspace_root} onChange={(e) => setMcpRuntimeForm((p) => ({ ...p, workspace_root: e.target.value }))} placeholder="/srv/smartaihub/workspace" /></div>
                  <div><Label htmlFor="mcp_rpm">Legacy MCP requests per minute</Label><Input id="mcp_rpm" type="number" min={10} max={10000} value={mcpRuntimeForm.mcp_rpm} onChange={(e) => setMcpRuntimeForm((p) => ({ ...p, mcp_rpm: Number(e.target.value) }))} /></div>
                  <div><Label htmlFor="mcp_max_read_bytes">Maximum read bytes</Label><Input id="mcp_max_read_bytes" type="number" value={mcpRuntimeForm.max_read_bytes} onChange={(e) => setMcpRuntimeForm((p) => ({ ...p, max_read_bytes: Number(e.target.value) }))} /></div>
                  <div><Label htmlFor="mcp_max_write_bytes">Maximum write bytes</Label><Input id="mcp_max_write_bytes" type="number" value={mcpRuntimeForm.max_write_bytes} onChange={(e) => setMcpRuntimeForm((p) => ({ ...p, max_write_bytes: Number(e.target.value) }))} /></div>
                </div>
                <div><Label htmlFor="mcp_extension_allowlist">Allowed file extensions</Label><Input id="mcp_extension_allowlist" value={mcpRuntimeForm.extension_allowlist} onChange={(e) => setMcpRuntimeForm((p) => ({ ...p, extension_allowlist: e.target.value }))} /></div>
                <label className="flex items-center justify-between rounded-xl border p-3 text-sm"><span>Allow legacy workspace writes</span><Switch checked={mcpRuntimeForm.workspace_write_enabled} onCheckedChange={(checked) => setMcpRuntimeForm((p) => ({ ...p, workspace_write_enabled: checked }))} /></label>
                <div className="text-xs text-slate-500">Workspace writes require the OAuth `mcp:write` scope. An existing legacy token remains a compatibility fallback but is never shown or requested in this UI.</div>
              </div>

              <div className="flex flex-wrap justify-end gap-3">
                <Button onClick={handleSaveMcpRuntime} disabled={mcpRuntimeLoading || updateMcpRuntimeMutation.isPending}>
                  {updateMcpRuntimeMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}{copy.mcp.save}
                </Button>
              </div>
            </div>
          </DashboardCard>
        </TabsContent>

        <TabsContent value="tasks">
      {/* ============================================ */}
      {/* CARD 2: Task Processing Backend              */}
      {/* ============================================ */}
      <DashboardCard className="border-0 shadow-sm shadow-gray-200/50 rounded-2xl overflow-hidden">
        <div className="border-b bg-gradient-to-r from-purple-50/50 to-pink-50/30 pb-5">
          <h3 className="flex items-center gap-2 text-lg">
            <Server className="w-5 h-5 text-purple-500" />
            Task Processing Backend
          </h3>
          <p>
            Choose which system processes background tasks (media generation, workflows, periodic jobs).
          </p>
        </div>
        <div className="space-y-5 pt-6">
          {/* Mode selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Celery option */}
            <button
              type="button"
              onClick={() => setSelectedMode("celery")}
              className={`relative rounded-xl border-2 p-4 text-left transition-all ${
                selectedMode === "celery"
                  ? "border-purple-500 bg-purple-50/50 ring-1 ring-purple-200"
                  : "border-gray-200 hover:border-gray-300 bg-white"
              }`}
            >
              {selectedMode === "celery" && (
                <CheckCircle2 className="absolute top-3 right-3 h-5 w-5 text-purple-500" />
              )}
              <div className="font-semibold text-base mb-1">Celery</div>
              <p className="text-sm text-muted-foreground">
                Redis-based task queue. Requires Celery workers running
                (celery-media, celery-video, celery-beat).
              </p>
            </button>

            {/* Cloud Tasks option */}
            <button
              type="button"
              onClick={() => setSelectedMode("cloud_tasks")}
              className={`relative rounded-xl border-2 p-4 text-left transition-all ${
                selectedMode === "cloud_tasks"
                  ? "border-purple-500 bg-purple-50/50 ring-1 ring-purple-200"
                  : "border-gray-200 hover:border-gray-300 bg-white"
              }`}
            >
              {selectedMode === "cloud_tasks" && (
                <CheckCircle2 className="absolute top-3 right-3 h-5 w-5 text-purple-500" />
              )}
              <div className="font-semibold text-base mb-1">Cloud Tasks</div>
              <p className="text-sm text-muted-foreground">
                Google Cloud managed queue with OIDC auth. Requires GCP
                configuration above.
              </p>
            </button>
          </div>

          {/* Source indicator */}
          {modeData && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Current source:</span>
              <Badge variant="outline" className="text-xs">
                {modeData.source}
              </Badge>
            </div>
          )}

          {/* Warning if switching to Cloud Tasks without GCP config */}
          {selectedMode === "cloud_tasks" && !hasGcpConfig && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                GCP Project ID and Region must be configured before enabling
                Cloud Tasks. Save GCP configuration first.
              </span>
            </div>
          )}

          <Button
            onClick={handleSaveMode}
            disabled={
              setModeMutation.isPending ||
              modeData?.mode === selectedMode
            }
          >
            {setModeMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {modeData?.mode === selectedMode
              ? "No changes"
              : `Switch to ${selectedMode === "cloud_tasks" ? "Cloud Tasks" : "Celery"}`}
          </Button>
        </div>
      </DashboardCard>

      {/* ============================================ */}
      {/* CARD: In-Server Render Worker (ffmpeg video-assembly queue) */}
      {/* ============================================ */}
      <DashboardCard className="border-0 shadow-sm shadow-gray-200/50 rounded-2xl overflow-hidden mt-6">
        <div className="border-b bg-gradient-to-r from-purple-50/50 to-pink-50/30 pb-5">
          <h3 className="flex items-center gap-2 text-lg">
            <Server className="w-5 h-5 text-purple-500" />
            {copy.renderWorker.title}
          </h3>
        </div>
        <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 mt-6">
          <div className="space-y-1">
            <Label className="text-sm font-medium">{copy.renderWorker.label}</Label>
            <p className="text-xs text-muted-foreground">{copy.renderWorker.helper}</p>
          </div>
          <Switch
            checked={webProcessRenderWorkerEnabled}
            onCheckedChange={(checked) => {
              // Turning this ON is the ONE switch in the whole system that lets
              // ffmpeg render inside the web server process. It is CPU- and
              // memory-heavy and degrades the app for every tenant, so it must
              // never flip from a single stray click (user policy 2026-07-31).
              // Turning it OFF is always safe and needs no confirmation.
              if (checked) {
                setConfirmServerFfmpegWorker(true);
                return;
              }
              applyRenderWorkerSetting(false);
            }}
            disabled={updateRenderWorkerSettingMutation.isPending}
          />
        </div>
        <AlertDialog
          open={confirmServerFfmpegWorker}
          onOpenChange={setConfirmServerFfmpegWorker}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                เปิดให้เซิร์ฟเวอร์เว็บ render ด้วย ffmpeg?
              </AlertDialogTitle>
              <AlertDialogDescription>
                สวิตช์นี้ทำให้ process ของเว็บรับงาน render แล้วเรียก ffmpeg
                ในเครื่องเดียวกับที่ให้บริการผู้ใช้ — กิน CPU และหน่วยความจำหนักมาก
                และกระทบผู้ใช้ทุก tenant พร้อมกัน แนวทางหลักของระบบคือให้ Remotion
                ทำงานบนเครื่อง Worker แทน เปิดเฉพาะกรณีจำเป็นจริง ๆ และควรปิดกลับทันทีเมื่อเสร็จ
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="server-ffmpeg-worker-cancel">
                ยกเลิก
              </AlertDialogCancel>
              <AlertDialogAction
                data-testid="server-ffmpeg-worker-accept"
                onClick={() => applyRenderWorkerSetting(true)}
              >
                ยืนยันเปิด
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DashboardCard>

      {/* ============================================ */}
      {/* CARD: Hermes Media Worker (Feature 135 — Grok media worker) */}
      {/* ============================================ */}
      <HermesInfrastructureSettingsCard
        infrastructureSettings={infrastructureSettings as any}
        onSettingsChanged={refetchInfrastructureSettings}
      />
        </TabsContent>

        <TabsContent value="queues">
      {/* ============================================ */}
      {/* CARD 3: Queue Status Dashboard               */}
      {/* ============================================ */}
      <DashboardCard className="border-0 shadow-sm shadow-gray-200/50 rounded-2xl overflow-hidden">
        <div className="border-b bg-gradient-to-r from-purple-50/50 to-pink-50/30 pb-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="flex items-center gap-2 text-lg">
                <Activity className="w-5 h-5 text-purple-500" />
                Queue Status
              </h3>
              <p className="mt-1">
                Cloud Tasks queue metrics (auto-refreshes every 30s).
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchDashboard()}
              disabled={dashboardLoading}
            >
              <RefreshCw
                className={`h-4 w-4 mr-1 ${dashboardLoading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>
        </div>
        <div className="pt-6">
          {dashboardLoading && !dashboard ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Queue grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {(dashboard?.queues ?? []).map((q: QueueMetric) => (
                  <div
                    key={q.queueName}
                    className="rounded-xl border border-gray-200 p-4 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">
                        {QUEUE_LABELS[q.queueName] ?? q.queueName}
                      </span>
                      <Badge
                        variant={q.taskCount > 0 ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {q.taskCount} tasks
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <div>
                        <span className="block text-gray-400">Oldest Task</span>
                        <span className="font-mono">
                          {q.oldestTaskAge !== null
                            ? formatAge(q.oldestTaskAge)
                            : "—"}
                        </span>
                      </div>
                      <div>
                        <span className="block text-gray-400">Dispatch Rate</span>
                        <span className="font-mono">{q.dispatchRate}/sec</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Dead letter summary */}
              <div className="flex items-center gap-3 rounded-xl border border-gray-200 p-4">
                <span className="text-sm font-medium">Dead Letters</span>
                <Badge
                  variant={
                    (dashboard?.deadLetterCount ?? 0) > 0
                      ? "destructive"
                      : "secondary"
                  }
                >
                  {dashboard?.deadLetterCount ?? 0}
                </Badge>
                {(dashboard?.failedTasks?.length ?? 0) > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto text-xs"
                    onClick={() => setShowFailedTasks(!showFailedTasks)}
                  >
                    {showFailedTasks ? "Hide" : "Show"} recent failures
                  </Button>
                )}
              </div>

              {/* Failed tasks table */}
              {showFailedTasks &&
                (dashboard?.failedTasks?.length ?? 0) > 0 && (
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-left text-xs text-gray-500">
                        <tr>
                          <th className="px-3 py-2">Queue</th>
                          <th className="px-3 py-2">Task ID</th>
                          <th className="px-3 py-2">Attempts</th>
                          <th className="px-3 py-2">Error</th>
                          <th className="px-3 py-2">Time</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {(dashboard?.failedTasks ?? []).map((t: FailedTask) => (
                          <tr key={t.id} className="text-xs">
                            <td className="px-3 py-2 font-medium">
                              {QUEUE_LABELS[t.queueName] ?? t.queueName}
                            </td>
                            <td className="px-3 py-2 font-mono max-w-[120px] truncate">
                              {t.taskId}
                            </td>
                            <td className="px-3 py-2">{t.attemptCount}</td>
                            <td className="px-3 py-2 max-w-[200px] truncate text-red-600">
                              {t.errorMessage ?? "—"}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {t.createdAt
                                ? new Date(t.createdAt).toLocaleString()
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

              {/* Task management quick links (Queue Status card) */}
              <div className="rounded-xl border border-gray-200 p-4 space-y-3">
                <p className="text-sm font-medium">Task Management</p>
                <p className="text-xs text-muted-foreground">
                  View pending tasks, cancel stuck jobs, or manage queue rate limiters from the dedicated dashboards.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLocation("/tasks")}
                  >
                    <Activity className="h-3.5 w-3.5 mr-1.5" />
                    Task Monitor
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLocation("/admin/queues")}
                  >
                    <Server className="h-3.5 w-3.5 mr-1.5" />
                    Queue Dashboard
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLocation("/admin/queues/llm")}
                  >
                    LLM Queues
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLocation("/admin/queues/media")}
                  >
                    Media Queues
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground space-y-1 pt-1">
                  <p><strong>/tasks</strong> — View all tasks, cancel pending/stuck tasks, delete completed tasks</p>
                  <p><strong>/admin/queues</strong> — System overview, failed job alerts, queue health</p>
                  <p><strong>/admin/queues/llm</strong> — LLM rate limiters, reset queues, clear waiting jobs</p>
                  <p><strong>/admin/queues/media</strong> — Media provider rate limiters and statistics</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </DashboardCard>
        </TabsContent>

        <TabsContent value="redis">
      {/* ============================================ */}
      {/* CARD 4: Cache / Redis Configuration          */}
      {/* ============================================ */}
      <DashboardCard className="border-0 shadow-sm shadow-gray-200/50 rounded-2xl overflow-hidden">
        <div className="border-b bg-gradient-to-r from-purple-50/50 to-pink-50/30 pb-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="flex items-center gap-2 text-lg">
                <Database className="w-5 h-5 text-purple-500" />
                Cache / Redis
              </h3>
              <p className="mt-1">
                Configure Redis provider for caching, rate limiting, feature flags, and pub/sub.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { refetchRedis(); refetchRedisHealth(); }}
              disabled={redisLoading || redisHealthLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${redisLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>
        <div className="space-y-5 pt-6">
          {/* Health Status */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-gray-200 p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Cache Client</span>
                {redisHealth?.cache.healthy ? (
                  <Badge className="bg-green-100 text-green-700 text-xs">
                    <Wifi className="h-3 w-3 mr-1" /> Connected
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs">
                    <WifiOff className="h-3 w-3 mr-1" /> Disconnected
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {redisHealth?.cache.provider === "upstash" ? "Upstash" : redisHealth?.cache.provider === "redis_cloud" ? "Redis Cloud" : "Local Redis"}
              </p>
              {redisHealth?.cache.url && (
                <p className="text-xs font-mono text-gray-400 truncate">{redisHealth.cache.url}</p>
              )}
            </div>
            <div className="rounded-xl border border-gray-200 p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Realtime Client</span>
                {redisHealth?.realtime.healthy ? (
                  <Badge className="bg-green-100 text-green-700 text-xs">
                    <Wifi className="h-3 w-3 mr-1" /> Connected
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs">
                    <WifiOff className="h-3 w-3 mr-1" /> Disconnected
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {redisHealth?.realtime.provider === "memorystore" ? "Memorystore" : "Local Redis"}
              </p>
              {redisHealth?.realtime.url && (
                <p className="text-xs font-mono text-gray-400 truncate">{redisHealth.realtime.url}</p>
              )}
            </div>
            <div className="rounded-xl border border-gray-200 p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Legacy Client</span>
                {redisHealth?.legacy.healthy ? (
                  <Badge className="bg-green-100 text-green-700 text-xs">
                    <Wifi className="h-3 w-3 mr-1" /> Connected
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs">
                    <WifiOff className="h-3 w-3 mr-1" /> Disconnected
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate">BullMQ / Bottleneck</p>
              {redisHealth?.legacy.url && (
                <p className="text-xs font-mono text-gray-400 truncate">{redisHealth.legacy.url}</p>
              )}
            </div>
          </div>

          {/* Setup Guide (collapsible) */}
          <div className="rounded-xl border border-blue-200 bg-blue-50/50 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowRedisGuide(!showRedisGuide)}
              className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium text-blue-700 hover:bg-blue-100/50 transition-colors"
            >
              <span className="flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                Setup Guide — Redis Provider Configuration
              </span>
              {showRedisGuide ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
            {showRedisGuide && (
              <div className="px-4 pb-4 text-sm text-blue-800 space-y-4 border-t border-blue-200">
                {/* Architecture overview */}
                <div className="pt-3">
                  <p className="font-semibold mb-1">Architecture: Split Redis</p>
                  <p className="text-blue-700 mb-2">
                    This system uses a <strong>split Redis architecture</strong> with two client types:
                  </p>
                  <ul className="list-disc ml-5 space-y-1 text-blue-700">
                    <li><strong>Cache Client</strong> — Stateless operations: rate limiting, locks, dedup, feature flags. Can use Upstash (serverless) or local Redis.</li>
                    <li><strong>Realtime Client</strong> — Connection-oriented: pub/sub, concurrency sets, Bottleneck state. Requires persistent TCP (Memorystore or local Redis).</li>
                  </ul>
                </div>

                {/* Option A: Local Redis */}
                <div>
                  <p className="font-semibold mb-1">Option A: Local Redis (Development / Self-Hosted)</p>
                  <p className="text-blue-700 mb-1">Both clients use a single local Redis instance.</p>
                  <pre className="bg-blue-100/70 rounded-lg p-3 text-xs font-mono overflow-x-auto whitespace-pre">
{`# .env configuration
REDIS_URL=redis://localhost:6379
# Optional: password-protected
REDIS_URL=redis://:your-password@localhost:6379
REDIS_PASSWORD=your-password

# Install Redis (Ubuntu/Debian)
sudo apt-get install redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server

# Verify
redis-cli ping
# → PONG`}
                  </pre>
                </div>

                {/* Option B: Upstash */}
                <div>
                  <p className="font-semibold mb-1">Option B: Upstash (Serverless / Cloud)</p>
                  <ol className="list-decimal ml-5 space-y-1 text-blue-700">
                    <li>
                      Go to{" "}
                      <a
                        href="https://console.upstash.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline inline-flex items-center gap-0.5"
                      >
                        Upstash Console
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </li>
                    <li>Create a new Redis database (choose region closest to your server)</li>
                    <li>Enable <strong>TLS</strong> (required for <code className="bg-blue-100 px-1 rounded">rediss://</code> protocol)</li>
                    <li>Copy the connection string (format: <code className="bg-blue-100 px-1 rounded text-xs">rediss://default:token@host:port</code>)</li>
                  </ol>
                  <pre className="bg-blue-100/70 rounded-lg p-3 text-xs font-mono overflow-x-auto whitespace-pre mt-2">
{`# .env configuration for Upstash
REDIS_UPSTASH_URL=rediss://default:AXxx...@us1-xxx.upstash.io:6379

# Still need local/Memorystore for realtime (pub/sub)
REDIS_URL=redis://localhost:6379
# OR for Cloud Run:
REDIS_MEMORYSTORE_URL=redis://10.0.0.3:6379`}
                  </pre>
                </div>

                {/* Cloud Run / Production */}
                <div>
                  <p className="font-semibold mb-1">Cloud Run Production Setup</p>
                  <pre className="bg-blue-100/70 rounded-lg p-3 text-xs font-mono overflow-x-auto whitespace-pre">
{`# Recommended production configuration:
# Cache → Upstash (global, serverless, TLS)
REDIS_UPSTASH_URL=rediss://default:token@host:6379

# Realtime → Memorystore (low-latency, VPC, persistent)
REDIS_MEMORYSTORE_URL=redis://10.0.0.3:6379

# Legacy fallback (BullMQ/Bottleneck)
REDIS_URL=redis://10.0.0.3:6379`}
                  </pre>
                </div>

                {/* Redis usage categories */}
                <div>
                  <p className="font-semibold mb-1">What Uses Redis</p>
                  <div className="grid grid-cols-2 gap-2 text-xs text-blue-700">
                    <div className="bg-blue-100/50 rounded p-2">
                      <span className="font-medium">Cache Client:</span>
                      <ul className="list-disc ml-4 mt-1 space-y-0.5">
                        <li>Feature flags</li>
                        <li>Rate limiting (middleware)</li>
                        <li>Deduplication locks</li>
                        <li>Session caching</li>
                      </ul>
                    </div>
                    <div className="bg-blue-100/50 rounded p-2">
                      <span className="font-medium">Realtime Client:</span>
                      <ul className="list-disc ml-4 mt-1 space-y-0.5">
                        <li>Pub/Sub notifications</li>
                        <li>Bottleneck rate limiters</li>
                        <li>BullMQ task queues</li>
                        <li>Concurrency sets</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Provider Selector */}
          <div className="space-y-1.5">
            <Label>Cache Provider</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRedisForm({ ...redisForm, redis_provider: "local" })}
                className={`relative rounded-xl border-2 p-3 text-left transition-all ${
                  redisForm.redis_provider === "local"
                    ? "border-purple-500 bg-purple-50/50 ring-1 ring-purple-200"
                    : "border-gray-200 hover:border-gray-300 bg-white"
                }`}
              >
                {redisForm.redis_provider === "local" && (
                  <CheckCircle2 className="absolute top-2.5 right-2.5 h-4 w-4 text-purple-500" />
                )}
                <div className="flex items-center gap-2 font-semibold text-sm mb-0.5">
                  <Server className="h-3.5 w-3.5" />
                  Local Redis
                </div>
                <p className="text-xs text-muted-foreground">
                  Self-hosted. Good for dev and single-server.
                </p>
                {redisConfig?.redis_local_url?.source === "env" && (
                  <Badge variant="outline" className="text-xs mt-1.5">from env</Badge>
                )}
              </button>
              <button
                type="button"
                onClick={() => setRedisForm({ ...redisForm, redis_provider: "upstash" })}
                className={`relative rounded-xl border-2 p-3 text-left transition-all ${
                  redisForm.redis_provider === "upstash"
                    ? "border-purple-500 bg-purple-50/50 ring-1 ring-purple-200"
                    : "border-gray-200 hover:border-gray-300 bg-white"
                }`}
              >
                {redisForm.redis_provider === "upstash" && (
                  <CheckCircle2 className="absolute top-2.5 right-2.5 h-4 w-4 text-purple-500" />
                )}
                <div className="flex items-center gap-2 font-semibold text-sm mb-0.5">
                  <Zap className="h-3.5 w-3.5" />
                  Upstash
                </div>
                <p className="text-xs text-muted-foreground">
                  Serverless with TLS. No VPC needed.
                </p>
                {redisConfig?.redis_upstash_url?.source === "env" && (
                  <Badge variant="outline" className="text-xs mt-1.5">from env</Badge>
                )}
              </button>
              <button
                type="button"
                onClick={() => setRedisForm({ ...redisForm, redis_provider: "redis_cloud" })}
                className={`relative rounded-xl border-2 p-3 text-left transition-all ${
                  redisForm.redis_provider === "redis_cloud"
                    ? "border-purple-500 bg-purple-50/50 ring-1 ring-purple-200"
                    : "border-gray-200 hover:border-gray-300 bg-white"
                }`}
              >
                {redisForm.redis_provider === "redis_cloud" && (
                  <CheckCircle2 className="absolute top-2.5 right-2.5 h-4 w-4 text-purple-500" />
                )}
                <div className="flex items-center gap-2 font-semibold text-sm mb-0.5">
                  <Globe className="h-3.5 w-3.5" />
                  Redis Cloud
                </div>
                <p className="text-xs text-muted-foreground">
                  Managed by redis.com. Full BullMQ support.
                </p>
                {redisConfig?.redis_cloud_url?.source === "env" && (
                  <Badge variant="outline" className="text-xs mt-1.5">from env</Badge>
                )}
              </button>
              <button
                type="button"
                onClick={() => setRedisForm({ ...redisForm, redis_provider: "memorystore" })}
                className={`relative rounded-xl border-2 p-3 text-left transition-all ${
                  redisForm.redis_provider === "memorystore"
                    ? "border-purple-500 bg-purple-50/50 ring-1 ring-purple-200"
                    : "border-gray-200 hover:border-gray-300 bg-white"
                }`}
              >
                {redisForm.redis_provider === "memorystore" && (
                  <CheckCircle2 className="absolute top-2.5 right-2.5 h-4 w-4 text-purple-500" />
                )}
                <div className="flex items-center gap-2 font-semibold text-sm mb-0.5">
                  <Cloud className="h-3.5 w-3.5" />
                  Memorystore
                </div>
                <p className="text-xs text-muted-foreground">
                  GCP managed. Lowest latency via VPC.
                </p>
                {redisConfig?.redis_memorystore_url?.source === "env" && (
                  <Badge variant="outline" className="text-xs mt-1.5">from env</Badge>
                )}
              </button>
            </div>
          </div>

          {/* Source indicator */}
          {redisConfig?.redis_provider?.source && redisConfig.redis_provider.source !== "none" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Provider source:</span>
              <Badge variant="outline" className="text-xs">
                {redisConfig.redis_provider.source}
              </Badge>
            </div>
          )}

          {/* Toggle password visibility */}
          <div className="flex items-center justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowRedisPasswords(!showRedisPasswords)}
              className="text-xs"
            >
              {showRedisPasswords ? (
                <><EyeOff className="h-3.5 w-3.5 mr-1" /> Hide credentials</>
              ) : (
                <><Eye className="h-3.5 w-3.5 mr-1" /> Show credentials</>
              )}
            </Button>
          </div>

          {/* Local Redis URL */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Label htmlFor="redis_local_url">Local Redis URL</Label>
              {redisConfig?.redis_local_url?.source === "env" && (
                <Badge variant="outline" className="text-xs">from env</Badge>
              )}
            </div>
            <Input
              id="redis_local_url"
              type={showRedisPasswords ? "text" : "password"}
              value={redisForm.redis_local_url}
              onChange={(e) => setRedisForm({ ...redisForm, redis_local_url: e.target.value })}
              placeholder={redisConfig?.redis_local_url?.maskedValue || "redis://localhost:6379"}
            />
            <p className="text-xs text-muted-foreground">
              Used as <code className="bg-gray-100 px-1 rounded">REDIS_URL</code>. Required for BullMQ, Bottleneck, and Celery broker.
            </p>
          </div>

          {/* Upstash URL */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Label htmlFor="redis_upstash_url">Upstash URL</Label>
              {redisConfig?.redis_upstash_url?.source === "env" && (
                <Badge variant="outline" className="text-xs">from env</Badge>
              )}
            </div>
            <Input
              id="redis_upstash_url"
              type={showRedisPasswords ? "text" : "password"}
              value={redisForm.redis_upstash_url}
              onChange={(e) => setRedisForm({ ...redisForm, redis_upstash_url: e.target.value })}
              placeholder={redisConfig?.redis_upstash_url?.maskedValue || "rediss://default:token@host.upstash.io:6379"}
            />
            <p className="text-xs text-muted-foreground">
              Used as <code className="bg-gray-100 px-1 rounded">REDIS_UPSTASH_URL</code>. Cache client connects here when set.
            </p>
          </div>

          {/* Redis Cloud URL */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Label htmlFor="redis_cloud_url">Redis Cloud URL</Label>
              {redisConfig?.redis_cloud_url?.source === "env" && (
                <Badge variant="outline" className="text-xs">from env</Badge>
              )}
            </div>
            <Input
              id="redis_cloud_url"
              type={showRedisPasswords ? "text" : "password"}
              value={redisForm.redis_cloud_url}
              onChange={(e) => setRedisForm({ ...redisForm, redis_cloud_url: e.target.value })}
              placeholder={redisConfig?.redis_cloud_url?.maskedValue || "redis://default:password@redis-12345.c1.us-central1-1.gce.redns.redis-cloud.com:12345"}
            />
            <p className="text-xs text-muted-foreground">
              Used as <code className="bg-gray-100 px-1 rounded">REDIS_CLOUD_URL</code>. Redis Cloud Essentials (redis.com). Full BullMQ and pub/sub support.
            </p>
          </div>

          {/* Memorystore URL */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Label htmlFor="redis_memorystore_url">Memorystore / Realtime URL</Label>
              {redisConfig?.redis_memorystore_url?.source === "env" && (
                <Badge variant="outline" className="text-xs">from env</Badge>
              )}
            </div>
            <Input
              id="redis_memorystore_url"
              type={showRedisPasswords ? "text" : "password"}
              value={redisForm.redis_memorystore_url}
              onChange={(e) => setRedisForm({ ...redisForm, redis_memorystore_url: e.target.value })}
              placeholder={redisConfig?.redis_memorystore_url?.maskedValue || "redis://10.0.0.3:6379"}
            />
            <p className="text-xs text-muted-foreground">
              Used as <code className="bg-gray-100 px-1 rounded">REDIS_MEMORYSTORE_URL</code>. Realtime client for pub/sub. Falls back to Local Redis URL.
            </p>
          </div>

          {/* Redis Password */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Label htmlFor="redis_password">Redis Password (optional)</Label>
              {redisConfig?.redis_password?.source === "env" && (
                <Badge variant="outline" className="text-xs">from env</Badge>
              )}
            </div>
            <Input
              id="redis_password"
              type={showRedisPasswords ? "text" : "password"}
              value={redisForm.redis_password}
              onChange={(e) => setRedisForm({ ...redisForm, redis_password: e.target.value })}
              placeholder={redisConfig?.redis_password?.maskedValue || "Leave empty if no password"}
            />
            <p className="text-xs text-muted-foreground">
              Used as <code className="bg-gray-100 px-1 rounded">REDIS_PASSWORD</code>. Applies to local Redis connections.
            </p>
          </div>

          {/* Info notice */}
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              Redis URL changes require a <strong>service restart</strong> to take effect.
              Current running connections will not update until services are restarted.
              Credentials are encrypted before storage.
            </span>
          </div>

          {/* Connection Test */}
          <div className="rounded-xl border border-gray-200 p-4 space-y-3">
            <p className="text-sm font-medium flex items-center gap-2">
              <TestTube className="h-4 w-4" />
              Connection Test
            </p>
            <div className="flex gap-2">
              <Input
                value={testUrl}
                onChange={(e) => setTestUrl(e.target.value)}
                placeholder={
                  redisForm.redis_provider === "upstash"
                    ? "rediss://default:token@host:6379"
                    : redisForm.redis_provider === "redis_cloud"
                      ? "redis://default:pass@host.redis-cloud.com:12345"
                      : "redis://localhost:6379"
                }
                type={showRedisPasswords ? "text" : "password"}
                className="flex-1"
              />
              <Button
                variant="outline"
                onClick={handleTestRedis}
                disabled={testRedisMutation.isPending}
              >
                {testRedisMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Zap className="h-4 w-4 mr-1" />
                )}
                Test
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Enter a URL to test, or leave empty to test the active {
                { local: "Local Redis", upstash: "Upstash", redis_cloud: "Redis Cloud", memorystore: "Memorystore" }[redisForm.redis_provider] || "Redis"
              } URL from the form above.
            </p>
          </div>

          <Button
            onClick={handleSaveRedis}
            disabled={updateRedisMutation.isPending}
          >
            {updateRedisMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Redis Configuration
          </Button>
        </div>
      </DashboardCard>
        </TabsContent>

        <TabsContent value="monitoring">
      {/* ============================================ */}
      {/* CARD 5: Monitoring & Observability           */}
      {/* ============================================ */}
      <DashboardCard className="border-0 shadow-sm shadow-gray-200/50 rounded-2xl overflow-hidden">
        <div className="border-b bg-gradient-to-r from-purple-50/50 to-pink-50/30 pb-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="flex items-center gap-2 text-lg">
                <Shield className="w-5 h-5 text-purple-500" />
                Monitoring & Observability
              </h3>
              <p className="mt-1">
                Sentry error tracking, analytics (PostHog / GA4), Firebase Remote Config, system health, and logging.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { refetchMonitoringConfig(); refetchMonitoringStatus(); refetchSystemHealth(); }}
              disabled={monitoringConfigLoading || systemHealthLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${systemHealthLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>
        <div className="space-y-5 pt-6">
          {/* Status Overview */}
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="rounded-xl border border-gray-200 p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Sentry (Node)</span>
                {monitoringStatus?.sentry.nodeConfigured ? (
                  <Badge className="bg-green-100 text-green-700 text-xs">Configured</Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs">Not set</Badge>
                )}
              </div>
              {monitoringConfig?.sentry_dsn_node?.source && monitoringConfig.sentry_dsn_node.source !== "none" && (
                <p className="text-xs text-muted-foreground">Source: {monitoringConfig.sentry_dsn_node.source}</p>
              )}
            </div>
            <div className="rounded-xl border border-gray-200 p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Sentry (Python)</span>
                {monitoringStatus?.sentry.pythonConfigured ? (
                  <Badge className="bg-green-100 text-green-700 text-xs">Configured</Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs">Not set</Badge>
                )}
              </div>
              {monitoringConfig?.sentry_dsn_python?.source && monitoringConfig.sentry_dsn_python.source !== "none" && (
                <p className="text-xs text-muted-foreground">Source: {monitoringConfig.sentry_dsn_python.source}</p>
              )}
            </div>
            <div className="rounded-xl border border-gray-200 p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">PostHog</span>
                {monitoringStatus?.posthog.configured ? (
                  <Badge className="bg-green-100 text-green-700 text-xs">Configured</Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs">Not set</Badge>
                )}
              </div>
              {monitoringConfig?.posthog_api_key_node?.source && monitoringConfig.posthog_api_key_node.source !== "none" && (
                <p className="text-xs text-muted-foreground">Source: {monitoringConfig.posthog_api_key_node.source}</p>
              )}
            </div>
            <div className="rounded-xl border border-gray-200 p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">GA4</span>
                {monitoringStatus?.ga4?.configured ? (
                  <Badge className="bg-green-100 text-green-700 text-xs">Configured</Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs">Not set</Badge>
                )}
              </div>
              {monitoringStatus?.ga4?.measurementId && (
                <p className="text-xs text-muted-foreground font-mono">{monitoringStatus.ga4.measurementId}</p>
              )}
            </div>
            <div className="rounded-xl border border-gray-200 p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Firebase</span>
                {monitoringStatus?.firebase?.configured ? (
                  <Badge className="bg-green-100 text-green-700 text-xs">Configured</Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs">Not set</Badge>
                )}
              </div>
              {monitoringStatus?.firebase?.projectId && (
                <p className="text-xs text-muted-foreground font-mono">{monitoringStatus.firebase.projectId}</p>
              )}
            </div>
          </div>

          {/* Analytics Provider Selector */}
          <div className="space-y-1.5">
            <p className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Analytics Provider
            </p>
            <p className="text-xs text-muted-foreground mb-2">
              Choose which analytics platform to use for event tracking and product analytics.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {([
                { value: "posthog", label: "PostHog", desc: "Full product analytics with session replay" },
                { value: "ga4", label: "Google Analytics 4", desc: "GA4 Measurement Protocol for server-side events" },
                { value: "both", label: "Both", desc: "Send events to both PostHog and GA4 simultaneously" },
                { value: "none", label: "None", desc: "Disable analytics event tracking" },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMonitoringForm({ ...monitoringForm, analytics_provider: opt.value })}
                  className={`relative rounded-xl border-2 p-3 text-left transition-all ${
                    monitoringForm.analytics_provider === opt.value
                      ? "border-purple-500 bg-purple-50/50 ring-1 ring-purple-200"
                      : "border-gray-200 hover:border-gray-300 bg-white"
                  }`}
                >
                  {monitoringForm.analytics_provider === opt.value && (
                    <CheckCircle2 className="absolute top-2 right-2 h-4 w-4 text-purple-500" />
                  )}
                  <div className="font-semibold text-sm mb-1">{opt.label}</div>
                  <p className="text-xs text-muted-foreground">{opt.desc}</p>
                </button>
              ))}
            </div>
            {monitoringStatus?.analyticsProvider && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                <span>Active provider:</span>
                <Badge variant="outline" className="text-xs">{monitoringStatus.analyticsProvider}</Badge>
              </div>
            )}
          </div>

          {/* System Health from Python Backend */}
          <div className="rounded-xl border border-gray-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium flex items-center gap-2">
                <Heart className="h-4 w-4" />
                System Health
              </p>
              {systemHealth?.status && (
                <Badge
                  className={`text-xs ${
                    systemHealth.status === "healthy"
                      ? "bg-green-100 text-green-700"
                      : systemHealth.status === "degraded"
                        ? "bg-amber-100 text-amber-700"
                        : systemHealth.status === "unreachable"
                          ? "bg-gray-100 text-gray-500"
                          : "bg-red-100 text-red-700"
                  }`}
                >
                  {systemHealth.status}
                </Badge>
              )}
            </div>

            {systemHealth?.status === "unreachable" ? (
              <div className="flex items-start gap-2 rounded-lg bg-gray-50 p-3 text-sm text-gray-500">
                <WifiOff className="h-4 w-4 mt-0.5 shrink-0" />
                <span>Python backend is unreachable. System health data unavailable.</span>
              </div>
            ) : systemHealth?.services ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {/* Database */}
                <div className="rounded-lg bg-gray-50 p-3 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Database className="h-3.5 w-3.5 text-gray-500" />
                    <span className="text-xs font-medium">Database</span>
                  </div>
                  <Badge
                    variant="secondary"
                    className={`text-xs ${
                      systemHealth.services.database?.status === "healthy"
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {systemHealth.services.database?.status ?? "unknown"}
                  </Badge>
                  {systemHealth.services.database?.response_time_ms != null && (
                    <p className="text-xs text-muted-foreground">
                      {systemHealth.services.database.response_time_ms.toFixed(1)}ms
                    </p>
                  )}
                </div>

                {/* Redis */}
                <div className="rounded-lg bg-gray-50 p-3 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 text-gray-500" />
                    <span className="text-xs font-medium">Redis</span>
                  </div>
                  <Badge
                    variant="secondary"
                    className={`text-xs ${
                      systemHealth.services.redis?.status === "healthy"
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {systemHealth.services.redis?.status ?? "unknown"}
                  </Badge>
                  {systemHealth.services.redis?.used_memory_mb != null && (
                    <p className="text-xs text-muted-foreground">
                      {systemHealth.services.redis.used_memory_mb} MB
                    </p>
                  )}
                </div>

                {/* CPU */}
                <div className="rounded-lg bg-gray-50 p-3 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Cpu className="h-3.5 w-3.5 text-gray-500" />
                    <span className="text-xs font-medium">CPU</span>
                  </div>
                  <Badge
                    variant="secondary"
                    className={`text-xs ${
                      systemHealth.services.cpu?.status === "healthy"
                        ? "bg-green-100 text-green-700"
                        : systemHealth.services.cpu?.status === "degraded"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-red-100 text-red-700"
                    }`}
                  >
                    {systemHealth.services.cpu?.percent_used != null
                      ? `${systemHealth.services.cpu.percent_used}%`
                      : "unknown"}
                  </Badge>
                  {systemHealth.services.cpu?.cpu_count != null && (
                    <p className="text-xs text-muted-foreground">
                      {systemHealth.services.cpu.cpu_count} cores
                    </p>
                  )}
                </div>

                {/* Memory */}
                <div className="rounded-lg bg-gray-50 p-3 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <MemoryStick className="h-3.5 w-3.5 text-gray-500" />
                    <span className="text-xs font-medium">Memory</span>
                  </div>
                  <Badge
                    variant="secondary"
                    className={`text-xs ${
                      systemHealth.services.memory?.status === "healthy"
                        ? "bg-green-100 text-green-700"
                        : systemHealth.services.memory?.status === "degraded"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-red-100 text-red-700"
                    }`}
                  >
                    {systemHealth.services.memory?.percent_used != null
                      ? `${systemHealth.services.memory.percent_used}%`
                      : "unknown"}
                  </Badge>
                  {systemHealth.services.memory?.total_gb != null && (
                    <p className="text-xs text-muted-foreground">
                      {systemHealth.services.memory.used_gb}/{systemHealth.services.memory.total_gb} GB
                    </p>
                  )}
                </div>

                {/* Disk */}
                <div className="rounded-lg bg-gray-50 p-3 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <HardDrive className="h-3.5 w-3.5 text-gray-500" />
                    <span className="text-xs font-medium">Disk</span>
                  </div>
                  <Badge
                    variant="secondary"
                    className={`text-xs ${
                      systemHealth.services.disk?.status === "healthy"
                        ? "bg-green-100 text-green-700"
                        : systemHealth.services.disk?.status === "degraded"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-red-100 text-red-700"
                    }`}
                  >
                    {systemHealth.services.disk?.percent_used != null
                      ? `${systemHealth.services.disk.percent_used}%`
                      : "unknown"}
                  </Badge>
                  {systemHealth.services.disk?.total_gb != null && (
                    <p className="text-xs text-muted-foreground">
                      {systemHealth.services.disk.free_gb} GB free
                    </p>
                  )}
                </div>
              </div>
            ) : systemHealthLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : null}
          </div>

          {/* Setup Guide (collapsible) */}
          <div className="rounded-xl border border-blue-200 bg-blue-50/50 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowMonitoringGuide(!showMonitoringGuide)}
              className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium text-blue-700 hover:bg-blue-100/50 transition-colors"
            >
              <span className="flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                Setup Guide — Sentry, PostHog, GA4 & Firebase
              </span>
              {showMonitoringGuide ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
            {showMonitoringGuide && (
              <div className="px-4 pb-4 text-sm text-blue-800 space-y-4 border-t border-blue-200">
                <div className="pt-3">
                  <p className="font-semibold mb-1">Sentry — Error Tracking</p>
                  <ol className="list-decimal ml-5 space-y-1 text-blue-700">
                    <li>
                      Go to{" "}
                      <a
                        href="https://sentry.io/organizations/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline inline-flex items-center gap-0.5"
                      >
                        Sentry Dashboard
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </li>
                    <li>Create a project for Node.js (Express) and one for Python (FastAPI)</li>
                    <li>Navigate to Settings &rarr; Projects &rarr; Client Keys (DSN)</li>
                    <li>Copy each DSN and paste below</li>
                  </ol>
                  <pre className="bg-blue-100/70 rounded-lg p-3 text-xs font-mono overflow-x-auto whitespace-pre mt-2">
{`# .env configuration
SENTRY_DSN_NODE=https://abc123@o123456.ingest.sentry.io/789
SENTRY_DSN=https://def456@o123456.ingest.sentry.io/101
ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.05`}
                  </pre>
                </div>

                <div>
                  <p className="font-semibold mb-1">PostHog — Product Analytics</p>
                  <ol className="list-decimal ml-5 space-y-1 text-blue-700">
                    <li>
                      Go to{" "}
                      <a
                        href="https://app.posthog.com/project/settings"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline inline-flex items-center gap-0.5"
                      >
                        PostHog Project Settings
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </li>
                    <li>Copy your Project API Key</li>
                    <li>Note the API host (default: <code className="bg-blue-100 px-1 rounded">https://us.i.posthog.com</code>)</li>
                  </ol>
                  <pre className="bg-blue-100/70 rounded-lg p-3 text-xs font-mono overflow-x-auto whitespace-pre mt-2">
{`# .env configuration
POSTHOG_API_KEY=phc_xxxxxxxxxxxxxxxxxxxx
POSTHOG_HOST=https://us.i.posthog.com`}
                  </pre>
                </div>

                <div>
                  <p className="font-semibold mb-1">Google Analytics 4 (GA4) — Server-Side Events</p>
                  <ol className="list-decimal ml-5 space-y-1 text-blue-700">
                    <li>
                      Go to{" "}
                      <a
                        href="https://analytics.google.com/analytics/web/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline inline-flex items-center gap-0.5"
                      >
                        Google Analytics Console
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </li>
                    <li>Create a GA4 property and a Web data stream</li>
                    <li>Copy the <strong>Measurement ID</strong> (format: <code className="bg-blue-100 px-1 rounded">G-XXXXXXXXXX</code>)</li>
                    <li>Go to Admin &rarr; Data Streams &rarr; your stream &rarr; Measurement Protocol API secrets</li>
                    <li>Create an API secret and copy the value</li>
                  </ol>
                  <pre className="bg-blue-100/70 rounded-lg p-3 text-xs font-mono overflow-x-auto whitespace-pre mt-2">
{`# .env configuration
GA4_MEASUREMENT_ID=G-XXXXXXXXXX
GA4_API_SECRET=your_api_secret_here
ANALYTICS_PROVIDER=ga4  # or "both" for PostHog + GA4`}
                  </pre>
                </div>

                <div>
                  <p className="font-semibold mb-1">Firebase Remote Config — Feature Flags</p>
                  <ol className="list-decimal ml-5 space-y-1 text-blue-700">
                    <li>
                      Go to{" "}
                      <a
                        href="https://console.firebase.google.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline inline-flex items-center gap-0.5"
                      >
                        Firebase Console
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </li>
                    <li>Create or select a project (can share GCP project)</li>
                    <li>Go to Project Settings &rarr; General &rarr; Your apps &rarr; Web app</li>
                    <li>Copy the <strong>API Key</strong> and <strong>Project ID</strong></li>
                    <li>Enable Remote Config in the Firebase console sidebar</li>
                  </ol>
                  <pre className="bg-blue-100/70 rounded-lg p-3 text-xs font-mono overflow-x-auto whitespace-pre mt-2">
{`# .env configuration
FIREBASE_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXX
FIREBASE_PROJECT_ID=your-project-id`}
                  </pre>
                </div>
              </div>
            )}
          </div>

          {/* Toggle secret visibility */}
          <div className="flex items-center justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowMonitoringSecrets(!showMonitoringSecrets)}
              className="text-xs"
            >
              {showMonitoringSecrets ? (
                <><EyeOff className="h-3.5 w-3.5 mr-1" /> Hide secrets</>
              ) : (
                <><Eye className="h-3.5 w-3.5 mr-1" /> Show secrets</>
              )}
            </Button>
          </div>

          {/* Sentry Configuration */}
          <div className="space-y-4">
            <p className="text-sm font-medium flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Sentry Configuration
            </p>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label htmlFor="sentry_dsn_node">Node.js DSN</Label>
                {monitoringConfig?.sentry_dsn_node?.source && monitoringConfig.sentry_dsn_node.source !== "none" && (
                  <Badge variant="outline" className="text-xs">from {monitoringConfig.sentry_dsn_node.source}</Badge>
                )}
              </div>
              <Input
                id="sentry_dsn_node"
                type={showMonitoringSecrets ? "text" : "password"}
                value={monitoringForm.sentry_dsn_node}
                onChange={(e) => setMonitoringForm({ ...monitoringForm, sentry_dsn_node: e.target.value })}
                placeholder={monitoringConfig?.sentry_dsn_node?.maskedValue || "https://xxx@o123456.ingest.sentry.io/789"}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label htmlFor="sentry_dsn_python">Python DSN</Label>
                {monitoringConfig?.sentry_dsn_python?.source && monitoringConfig.sentry_dsn_python.source !== "none" && (
                  <Badge variant="outline" className="text-xs">from {monitoringConfig.sentry_dsn_python.source}</Badge>
                )}
              </div>
              <Input
                id="sentry_dsn_python"
                type={showMonitoringSecrets ? "text" : "password"}
                value={monitoringForm.sentry_dsn_python}
                onChange={(e) => setMonitoringForm({ ...monitoringForm, sentry_dsn_python: e.target.value })}
                placeholder={monitoringConfig?.sentry_dsn_python?.maskedValue || "https://xxx@o123456.ingest.sentry.io/101"}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="sentry_environment">Environment</Label>
                <Select
                  value={monitoringForm.sentry_environment}
                  onValueChange={(val) => setMonitoringForm({ ...monitoringForm, sentry_environment: val })}
                >
                  <SelectTrigger id="sentry_environment">
                    <SelectValue placeholder="Select environment" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="development">development</SelectItem>
                    <SelectItem value="staging">staging</SelectItem>
                    <SelectItem value="production">production</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sentry_traces_sample_rate">Traces Sample Rate</Label>
                <Input
                  id="sentry_traces_sample_rate"
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  value={monitoringForm.sentry_traces_sample_rate}
                  onChange={(e) => setMonitoringForm({ ...monitoringForm, sentry_traces_sample_rate: e.target.value })}
                  placeholder="0.05"
                />
                <p className="text-xs text-muted-foreground">0.0 = no traces, 1.0 = all traces, 0.05 = 5% (recommended)</p>
              </div>
            </div>
          </div>

          {/* PostHog Configuration */}
          <div className="space-y-4">
            <p className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              PostHog Configuration
            </p>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label htmlFor="posthog_api_key_node">Node.js API Key</Label>
                {monitoringConfig?.posthog_api_key_node?.source && monitoringConfig.posthog_api_key_node.source !== "none" && (
                  <Badge variant="outline" className="text-xs">from {monitoringConfig.posthog_api_key_node.source}</Badge>
                )}
              </div>
              <Input
                id="posthog_api_key_node"
                type={showMonitoringSecrets ? "text" : "password"}
                value={monitoringForm.posthog_api_key_node}
                onChange={(e) => setMonitoringForm({ ...monitoringForm, posthog_api_key_node: e.target.value })}
                placeholder={monitoringConfig?.posthog_api_key_node?.maskedValue || "phc_xxxxxxxxxxxxxxxxxxxx"}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label htmlFor="posthog_api_key_python">Python API Key</Label>
                {monitoringConfig?.posthog_api_key_python?.source && monitoringConfig.posthog_api_key_python.source !== "none" && (
                  <Badge variant="outline" className="text-xs">from {monitoringConfig.posthog_api_key_python.source}</Badge>
                )}
              </div>
              <Input
                id="posthog_api_key_python"
                type={showMonitoringSecrets ? "text" : "password"}
                value={monitoringForm.posthog_api_key_python}
                onChange={(e) => setMonitoringForm({ ...monitoringForm, posthog_api_key_python: e.target.value })}
                placeholder={monitoringConfig?.posthog_api_key_python?.maskedValue || "phc_xxxxxxxxxxxxxxxxxxxx"}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label htmlFor="posthog_host">PostHog Host</Label>
                {monitoringConfig?.posthog_host?.source && monitoringConfig.posthog_host.source !== "none" && (
                  <Badge variant="outline" className="text-xs">from {monitoringConfig.posthog_host.source}</Badge>
                )}
              </div>
              <Input
                id="posthog_host"
                value={monitoringForm.posthog_host}
                onChange={(e) => setMonitoringForm({ ...monitoringForm, posthog_host: e.target.value })}
                placeholder="https://us.i.posthog.com"
              />
            </div>
          </div>

          {/* GA4 Configuration */}
          {(monitoringForm.analytics_provider === "ga4" || monitoringForm.analytics_provider === "both") && (
            <div className="space-y-4">
              <p className="text-sm font-medium flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Google Analytics 4 Configuration
              </p>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Label htmlFor="ga4_measurement_id">Measurement ID</Label>
                  {monitoringConfig?.ga4_measurement_id?.source && monitoringConfig.ga4_measurement_id.source !== "none" && (
                    <Badge variant="outline" className="text-xs">from {monitoringConfig.ga4_measurement_id.source}</Badge>
                  )}
                </div>
                <Input
                  id="ga4_measurement_id"
                  value={monitoringForm.ga4_measurement_id}
                  onChange={(e) => setMonitoringForm({ ...monitoringForm, ga4_measurement_id: e.target.value })}
                  placeholder="G-XXXXXXXXXX"
                />
                <p className="text-xs text-muted-foreground">
                  Found in GA4 Admin &rarr; Data Streams &rarr; Web stream details
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Label htmlFor="ga4_api_secret">API Secret</Label>
                  {monitoringConfig?.ga4_api_secret?.source && monitoringConfig.ga4_api_secret.source !== "none" && (
                    <Badge variant="outline" className="text-xs">from {monitoringConfig.ga4_api_secret.source}</Badge>
                  )}
                </div>
                <Input
                  id="ga4_api_secret"
                  type={showMonitoringSecrets ? "text" : "password"}
                  value={monitoringForm.ga4_api_secret}
                  onChange={(e) => setMonitoringForm({ ...monitoringForm, ga4_api_secret: e.target.value })}
                  placeholder={monitoringConfig?.ga4_api_secret?.maskedValue || "Measurement Protocol API secret"}
                />
                <p className="text-xs text-muted-foreground">
                  Admin &rarr; Data Streams &rarr; Measurement Protocol API secrets &rarr; Create
                </p>
              </div>
            </div>
          )}

          {/* Firebase Configuration */}
          <div className="space-y-4">
            <p className="text-sm font-medium flex items-center gap-2">
              <Cloud className="h-4 w-4" />
              Firebase Remote Config
            </p>
            <p className="text-xs text-muted-foreground">
              Optional. Used for feature flags and remote configuration management.
            </p>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label htmlFor="firebase_api_key">Firebase API Key</Label>
                {monitoringConfig?.firebase_api_key?.source && monitoringConfig.firebase_api_key.source !== "none" && (
                  <Badge variant="outline" className="text-xs">from {monitoringConfig.firebase_api_key.source}</Badge>
                )}
              </div>
              <Input
                id="firebase_api_key"
                type={showMonitoringSecrets ? "text" : "password"}
                value={monitoringForm.firebase_api_key}
                onChange={(e) => setMonitoringForm({ ...monitoringForm, firebase_api_key: e.target.value })}
                placeholder={monitoringConfig?.firebase_api_key?.maskedValue || "AIzaSyXXXXXXXXXXXXXXXXXXXXX"}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label htmlFor="firebase_project_id">Firebase Project ID</Label>
                {monitoringConfig?.firebase_project_id?.source && monitoringConfig.firebase_project_id.source !== "none" && (
                  <Badge variant="outline" className="text-xs">from {monitoringConfig.firebase_project_id.source}</Badge>
                )}
              </div>
              <Input
                id="firebase_project_id"
                value={monitoringForm.firebase_project_id}
                onChange={(e) => setMonitoringForm({ ...monitoringForm, firebase_project_id: e.target.value })}
                placeholder="your-project-id"
              />
              <p className="text-xs text-muted-foreground">
                Same as GCP Project ID if Firebase is linked to your GCP project
              </p>
            </div>
          </div>

          {/* Logging */}
          <div className="space-y-1.5">
            <p className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Logging
            </p>
            <Label htmlFor="log_level">Log Level</Label>
            <Select
              value={monitoringForm.log_level}
              onValueChange={(val) => setMonitoringForm({ ...monitoringForm, log_level: val })}
            >
              <SelectTrigger id="log_level">
                <SelectValue placeholder="Select log level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="debug">debug</SelectItem>
                <SelectItem value="info">info</SelectItem>
                <SelectItem value="warn">warn</SelectItem>
                <SelectItem value="error">error</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Restart warning */}
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              Monitoring settings are read at <strong>startup</strong>. Saved values are stored
              for reference. Restart services to apply changes to Sentry/PostHog initialization.
            </span>
          </div>

          <Button
            onClick={handleSaveMonitoring}
            disabled={updateMonitoringMutation.isPending}
          >
            {updateMonitoringMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Monitoring Configuration
          </Button>
        </div>
      </DashboardCard>
        </TabsContent>

        <TabsContent value="scale-tier">
      {/* ============================================ */}
      {/* CARD 6: Scale Tier Configuration             */}
      {/* ============================================ */}
      <DashboardCard className="border-0 shadow-sm shadow-gray-200/50 rounded-2xl overflow-hidden">
        <div className="border-b bg-gradient-to-r from-purple-50/50 to-pink-50/30 pb-5">
          <h3 className="flex items-center gap-2 text-lg">
            <Gauge className="w-5 h-5 text-purple-500" />
            Scale Tier Configuration
          </h3>
          <p>
            Select a scaling preset to configure connection pools, rate limits, worker counts, and resource allocations across all services.
          </p>
        </div>
        <div className="space-y-5 pt-6">
          {/* Current tier indicator */}
          {scaleTierData?.tier && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Active tier:</span>
              <Badge className="bg-purple-100 text-purple-700 text-xs capitalize">
                {scaleTierData.tier}
              </Badge>
              {scaleTierData.appliedAt && (
                <span className="text-xs text-gray-400">
                  applied {new Date(scaleTierData.appliedAt).toLocaleString()}
                </span>
              )}
            </div>
          )}

          {/* Deploy Mode Toggle */}
          <div className="rounded-xl border border-gray-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium flex items-center gap-2">
                <Server className="h-4 w-4" />
                Deploy Mode
              </p>
              {deployModeLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              ) : deployModeInfo ? (
                <Badge variant="outline" className="text-xs">
                  source: {deployModeInfo.source}
                </Badge>
              ) : null}
            </div>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              <button
                type="button"
                onClick={() => setSelectedDeployMode("localhost")}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-r ${
                  selectedDeployMode === "localhost"
                    ? "bg-purple-100 text-purple-700 border-purple-200"
                    : "bg-white text-gray-600 hover:bg-gray-50 border-gray-200"
                }`}
              >
                <Server className="h-4 w-4" />
                Localhost (Self-hosted)
              </button>
              <button
                type="button"
                onClick={() => setSelectedDeployMode("cloudrun")}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                  selectedDeployMode === "cloudrun"
                    ? "bg-purple-100 text-purple-700"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                <Cloud className="h-4 w-4" />
                Cloud Run (GCP)
              </button>
            </div>
            {selectedDeployMode === "cloudrun" && deployModeInfo && !deployModeInfo.gcpConfigured && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  GCP is not configured. Please fill in the <strong>GCP Configuration</strong> section above
                  before applying Cloud Run mode.
                </span>
              </div>
            )}
            {!deployModeLoading && selectedDeployMode !== (deployModeInfo?.mode ?? "localhost") && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDeployModeMutation.mutate({ mode: selectedDeployMode })}
                disabled={
                  setDeployModeMutation.isPending ||
                  (selectedDeployMode === "cloudrun" && deployModeInfo !== undefined && !deployModeInfo.gcpConfigured)
                }
              >
                {setDeployModeMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                )}
                Save Deploy Mode
              </Button>
            )}
          </div>

          {/* Tier Selector Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {(scaleTierData?.allTiers ?? [
              { id: "starter", label: "Starter", description: "Small team or development use", targetUsers: 50, recommendedCpu: 4, recommendedRamGb: 8 },
              { id: "growth", label: "Growth", description: "Growing team with moderate AI usage", targetUsers: 100, recommendedCpu: 8, recommendedRamGb: 16 },
              { id: "pro", label: "Pro", description: "Heavy AI and media workloads", targetUsers: 200, recommendedCpu: 12, recommendedRamGb: 32 },
              { id: "business", label: "Business", description: "Large-scale production deployment", targetUsers: 500, recommendedCpu: 16, recommendedRamGb: 48 },
              { id: "enterprise", label: "Enterprise", description: "Maximum scale for 1000+ concurrent users", targetUsers: 1000, recommendedCpu: 32, recommendedRamGb: 64 },
            ]).map((tier: any) => (
              <button
                key={tier.id}
                type="button"
                onClick={() => {
                  setSelectedTier(tier.id);
                  setApplyResults(null);
                }}
                className={`relative rounded-xl border-2 p-4 text-left transition-all ${
                  selectedTier === tier.id
                    ? "border-purple-500 bg-purple-50/50 ring-1 ring-purple-200"
                    : "border-gray-200 hover:border-gray-300 bg-white"
                }`}
              >
                {selectedTier === tier.id && (
                  <CheckCircle2 className="absolute top-3 right-3 h-5 w-5 text-purple-500" />
                )}
                <div className="font-semibold text-base mb-1">{tier.label}</div>
                <div className="flex items-center gap-1.5 text-sm text-purple-600 mb-2">
                  <Users className="h-3.5 w-3.5" />
                  <span>{tier.targetUsers} users</span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  {tier.description}
                </p>
                <div className="grid grid-cols-2 gap-1.5 text-xs text-gray-500">
                  <div className="flex items-center gap-1">
                    <Cpu className="h-3 w-3" />
                    <span>{tier.recommendedCpu} CPU</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <MemoryStick className="h-3 w-3" />
                    <span>{tier.recommendedRamGb} GB</span>
                  </div>
                </div>
                {scaleTierData?.tier === tier.id && (
                  <Badge className="mt-2 bg-green-100 text-green-700 text-xs">Active</Badge>
                )}
              </button>
            ))}
          </div>

          {/* Configuration Preview */}
          {scaleTierData?.config && selectedTier && (
            <div className="rounded-xl border border-gray-200 p-4 space-y-3">
              <p className="text-sm font-medium flex items-center gap-2">
                <Info className="h-4 w-4" />
                Configuration Preview — {(scaleTierData.allTiers ?? []).find((t: any) => t.id === selectedTier)?.label ?? selectedTier}
                <Badge variant="outline" className="text-xs ml-auto">
                  {selectedDeployMode === "cloudrun" ? "Cloud Run" : "Localhost"}
                </Badge>
              </p>
              {(() => {
                const config = selectedTier === scaleTierData.tier
                  ? scaleTierData.config
                  : (scaleTierData.allTiers ?? []).find((t: any) => t.id === selectedTier);
                if (!config) return null;

                if (selectedDeployMode === "cloudrun") {
                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                      <div className="rounded-lg bg-blue-50 p-3 space-y-1">
                        <span className="text-xs text-blue-600 block">Node Instances</span>
                        <span className="text-sm font-mono font-medium">
                          {config.cloudRunNodeMinInstances ?? 0}–{config.cloudRunNodeMaxInstances ?? "—"}
                        </span>
                      </div>
                      <div className="rounded-lg bg-blue-50 p-3 space-y-1">
                        <span className="text-xs text-blue-600 block">Node CPU / Memory</span>
                        <span className="text-sm font-mono font-medium">
                          {config.cloudRunNodeCpu ?? "—"} / {config.cloudRunNodeMemory ?? "—"}
                        </span>
                      </div>
                      <div className="rounded-lg bg-blue-50 p-3 space-y-1">
                        <span className="text-xs text-blue-600 block">Node Concurrency</span>
                        <span className="text-sm font-mono font-medium">
                          {config.cloudRunNodeConcurrency ?? "—"}
                        </span>
                      </div>
                      <div className="rounded-lg bg-green-50 p-3 space-y-1">
                        <span className="text-xs text-green-600 block">Python Instances</span>
                        <span className="text-sm font-mono font-medium">
                          {config.cloudRunPythonMinInstances ?? 0}–{config.cloudRunPythonMaxInstances ?? "—"}
                        </span>
                      </div>
                      <div className="rounded-lg bg-green-50 p-3 space-y-1">
                        <span className="text-xs text-green-600 block">Python CPU / Memory</span>
                        <span className="text-sm font-mono font-medium">
                          {config.cloudRunPythonCpu ?? "—"} / {config.cloudRunPythonMemory ?? "—"}
                        </span>
                      </div>
                      <div className="rounded-lg bg-green-50 p-3 space-y-1">
                        <span className="text-xs text-green-600 block">Python Concurrency</span>
                        <span className="text-sm font-mono font-medium">
                          {config.cloudRunPythonConcurrency ?? "—"}
                        </span>
                      </div>
                      <div className="rounded-lg bg-gray-50 p-3 space-y-1">
                        <span className="text-xs text-gray-500 block">DB Pool</span>
                        <span className="text-sm font-mono font-medium">
                          {config.nodeDbPoolSize ?? "—"}
                        </span>
                      </div>
                      <div className="rounded-lg bg-gray-50 p-3 space-y-1">
                        <span className="text-xs text-gray-500 block">LLM Rate Limit</span>
                        <span className="text-sm font-mono font-medium">
                          {config.nodeLlmRpm ?? "—"} rpm
                        </span>
                      </div>
                      <div className="rounded-lg bg-purple-50 p-3 space-y-1">
                        <span className="text-xs text-purple-600 block">Media Queue</span>
                        <span className="text-sm font-mono font-medium">
                          {config.cloudRunMediaQueueConcurrency ?? "—"} concurrent
                        </span>
                      </div>
                      <div className="rounded-lg bg-purple-50 p-3 space-y-1">
                        <span className="text-xs text-purple-600 block">Workflow Queue</span>
                        <span className="text-sm font-mono font-medium">
                          {config.cloudRunWorkflowQueueConcurrency ?? "—"} concurrent
                        </span>
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    <div className="rounded-lg bg-gray-50 p-3 space-y-1">
                      <span className="text-xs text-gray-500 block">DB Pool</span>
                      <span className="text-sm font-mono font-medium">
                        {config.nodeDbPoolSize ?? config.pythonDbPoolSize ?? "—"}
                      </span>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-3 space-y-1">
                      <span className="text-xs text-gray-500 block">LLM Rate Limit</span>
                      <span className="text-sm font-mono font-medium">
                        {config.nodeLlmRpm ?? config.pythonRateLimitPerMin ?? "—"} rpm
                      </span>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-3 space-y-1">
                      <span className="text-xs text-gray-500 block">Uvicorn Workers</span>
                      <span className="text-sm font-mono font-medium">
                        {config.uvicornWorkers ?? "—"}
                      </span>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-3 space-y-1">
                      <span className="text-xs text-gray-500 block">Redis Memory</span>
                      <span className="text-sm font-mono font-medium">
                        {config.redisMaxmemoryMb ?? "—"} MB
                      </span>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-3 space-y-1">
                      <span className="text-xs text-gray-500 block">Nginx Connections</span>
                      <span className="text-sm font-mono font-medium">
                        {config.nginxWorkerConnections ?? "—"}
                      </span>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-3 space-y-1">
                      <span className="text-xs text-gray-500 block">Celery Media</span>
                      <span className="text-sm font-mono font-medium">
                        {config.celeryMediaConcurrency ?? "—"}
                      </span>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-3 space-y-1">
                      <span className="text-xs text-gray-500 block">Celery Video</span>
                      <span className="text-sm font-mono font-medium">
                        {config.celeryVideoConcurrency ?? "—"}
                      </span>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-3 space-y-1">
                      <span className="text-xs text-gray-500 block">API Rate Limit</span>
                      <span className="text-sm font-mono font-medium">
                        {config.nginxApiLimitRate ?? "—"}
                      </span>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-3 space-y-1">
                      <span className="text-xs text-gray-500 block">Max Parallel Workflows</span>
                      <span className="text-sm font-mono font-medium">
                        {config.pythonMaxParallelWorkflows ?? "—"}
                      </span>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-3 space-y-1">
                      <span className="text-xs text-gray-500 block">Nginx Keepalive</span>
                      <span className="text-sm font-mono font-medium">
                        {config.nginxKeepalive ?? "—"}
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Info notice — mode-aware */}
          {selectedDeployMode === "cloudrun" ? (
            <div className="flex items-start gap-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
              <Cloud className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                Applying will update <strong>Cloud Run service configs</strong> (instances, CPU, memory)
                and <strong>Cloud Tasks queue concurrency</strong> via <code className="bg-blue-100 px-1 rounded text-xs">gcloud</code> CLI.
                <strong> Zero-downtime</strong> rolling updates via new Cloud Run revisions.
              </span>
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                Applying a scale tier will update <strong>.env files</strong>, <strong>Nginx config</strong>,
                and <strong>Redis settings</strong>, then restart backend and web services.
                Expect <strong>10-30 seconds of downtime</strong> during the restart.
              </span>
            </div>
          )}

          {/* Apply Button */}
          <Button
            onClick={() => {
              setApplyResults(null);
              setShowApplyDialog(true);
            }}
            disabled={
              applyScaleTierMutation.isPending ||
              (scaleTierData?.tier === selectedTier && selectedDeployMode === (deployModeInfo?.mode ?? "localhost") && !applyResults) ||
              (selectedDeployMode === "cloudrun" && deployModeInfo !== undefined && !deployModeInfo.gcpConfigured)
            }
          >
            {applyScaleTierMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : selectedDeployMode === "cloudrun" ? (
              <Cloud className="h-4 w-4 mr-2" />
            ) : (
              <Zap className="h-4 w-4 mr-2" />
            )}
            {scaleTierData?.tier === selectedTier
              ? `Re-apply Current Tier (${selectedDeployMode === "cloudrun" ? "Cloud Run" : "Localhost"})`
              : `Apply ${(scaleTierData?.allTiers ?? []).find((t: any) => t.id === selectedTier)?.label ?? selectedTier} — ${selectedDeployMode === "cloudrun" ? "Cloud Run" : "Restart Services"}`}
          </Button>

          {/* Apply Results */}
          {applyResults && (
            <div className="rounded-xl border border-gray-200 p-4 space-y-3">
              <p className="text-sm font-medium flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Apply Results
                {applyResults[0]?.mode && (
                  <Badge variant="outline" className="text-xs ml-auto">
                    {applyResults[0].mode === "cloudrun" ? "Cloud Run" : "Localhost"}
                  </Badge>
                )}
              </p>
              <div className="space-y-2">
                {applyResults.map((result: any, idx: number) => (
                  <div
                    key={idx}
                    className="flex items-start gap-3 rounded-lg bg-gray-50 p-3 text-sm"
                  >
                    <Badge
                      className={`text-xs shrink-0 ${
                        result.status === "ok"
                          ? "bg-green-100 text-green-700"
                          : result.status === "skipped"
                            ? "bg-gray-100 text-gray-600"
                            : "bg-red-100 text-red-700"
                      }`}
                    >
                      {result.status}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-gray-700">{result.step}</span>
                      <p className="text-xs text-muted-foreground mt-0.5 break-all">
                        {result.message}
                      </p>
                      {result.command && (
                        <pre className="text-xs bg-gray-100 rounded px-2 py-1 mt-1 overflow-x-auto font-mono text-gray-600">
                          {result.command}
                        </pre>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DashboardCard>
        </TabsContent>
      </Tabs>

      {/* Scale Tier Apply Confirmation Dialog */}
      <AlertDialog open={showApplyDialog} onOpenChange={setShowApplyDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              Apply Scale Tier Configuration
              <Badge variant="outline" className="text-xs font-normal">
                {selectedDeployMode === "cloudrun" ? "Cloud Run" : "Localhost"}
              </Badge>
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  This will apply the <strong className="capitalize">{selectedTier}</strong> tier
                  configuration{selectedDeployMode === "cloudrun" ? " to Cloud Run services." : " and restart services."}
                </p>
                {scaleTierData?.tier && scaleTierData.tier !== selectedTier && (
                  <div className="flex items-center gap-2 text-sm">
                    <Badge variant="outline" className="capitalize">{scaleTierData.tier}</Badge>
                    <span>&rarr;</span>
                    <Badge className="bg-purple-100 text-purple-700 capitalize">{selectedTier}</Badge>
                  </div>
                )}
                {selectedDeployMode === "cloudrun" ? (
                  <>
                    <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
                      <strong>Cloud Run:</strong> Zero-downtime rolling updates via new revisions.
                      No service interruption for users.
                    </div>
                    <p className="text-sm">The following changes will be made:</p>
                    <ul className="list-disc ml-5 space-y-1 text-sm text-muted-foreground">
                      <li>Update Node API Cloud Run service (instances, CPU, memory, env vars)</li>
                      <li>Update Python Orchestrator Cloud Run service (instances, CPU, memory, env vars)</li>
                      <li>Update Cloud Tasks queue concurrency (media-jobs, workflow-tasks)</li>
                      <li>Redis: skipped (Upstash memory is per-plan)</li>
                    </ul>
                  </>
                ) : (
                  <>
                    <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
                      <strong>Warning:</strong> This will restart the backend and web services.
                      Users will experience approximately 10-30 seconds of downtime.
                    </div>
                    <p className="text-sm">The following changes will be made:</p>
                    <ul className="list-disc ml-5 space-y-1 text-sm text-muted-foreground">
                      <li>Update Node.js .env (DB pool, rate limits)</li>
                      <li>Update Python .env (DB pool, workers, rate limits)</li>
                      <li>Update systemd service (uvicorn workers)</li>
                      <li>Update Nginx config (connections, keepalive)</li>
                      <li>Set Redis maxmemory (hot-reload)</li>
                      <li>Reload Nginx (graceful)</li>
                      <li>Restart Python backend</li>
                      <li>Restart Node.js web service</li>
                    </ul>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={applyScaleTierMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                applyScaleTierMutation.mutate({ tier: selectedTier, mode: selectedDeployMode });
              }}
              disabled={applyScaleTierMutation.isPending}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {applyScaleTierMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : selectedDeployMode === "cloudrun" ? (
                <Cloud className="h-4 w-4 mr-2" />
              ) : (
                <Zap className="h-4 w-4 mr-2" />
              )}
              {applyScaleTierMutation.isPending
                ? "Applying..."
                : selectedDeployMode === "cloudrun"
                  ? "Apply to Cloud Run"
                  : "Apply & Restart"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}
