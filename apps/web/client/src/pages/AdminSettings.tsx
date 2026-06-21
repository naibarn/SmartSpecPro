/**
 * Admin Settings Page
 * Manage platform configuration: Stripe, Invoice, etc.
 */

import { useState, useEffect, Fragment } from "react";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { pickEnabledModelId } from "@/lib/enabledModelSelection";
import InviteCodeManager from "@/components/admin/InviteCodeManager";
import InviteCodeDashboard from "@/components/admin/InviteCodeDashboard";
import { LocaleToggle } from "@/components/LocaleToggle";
import { useTranslation } from "react-i18next";
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
  CheckSquare,
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
  FileText,
  Cable,
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
import DocumentOcrSettingsPanel from "@/components/admin/DocumentOcrSettingsPanel";
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

interface BeamProviderForm {
  apiBaseUrl: string;
  apiKey: string;
  chargesPath: string;
  paymentLinksPath: string;
  chargeStatusPathTemplate: string;
  paymentLinkStatusPathTemplate: string;
  cancelPathSuffix: string;
  webhookSecretCurrent: string;
  webhookSecretPrevious: string;
  paymentMethodSetupPath: string;
  paymentMethodSetupHostedUrlTemplate: string;
  paymentMethodSetupReturnUrl: string;
  paymentMethodSetupCallbackSecretCurrent: string;
  paymentMethodSetupCallbackSecretPrevious: string;
}

interface PaymentProviderForm {
  BILLING_ACTIVE_PROVIDER: "stripe" | "beam";
  BILLING_STRIPE_ENABLED: boolean;
  BILLING_BEAM_ENABLED: boolean;
  BEAM_PAYMENT_LINK_FALLBACK: boolean;
}

interface BeamRuntimeForm {
  PAYMENT_RECONCILIATION_ENABLED: boolean;
  FINAL_RECONCILIATION_BEFORE_DOWNGRADE: boolean;
  ADMIN_MANUAL_MARK_PAID_ENABLED: boolean;
  ADMIN_DOWNGRADE_REVERSAL_ENABLED: boolean;
  SUPPORT_RECOVERY_CASES_ENABLED: boolean;
  DOCUMENT_RECOVERY_ENABLED: boolean;
  INVOICE_HEADER_SYNC_ENABLED: boolean;
  PAID_INVOICE_REISSUE_ENABLED: boolean;
  AUTO_DOWNGRADE_AFTER_7_DAYS: boolean;
  BILLING_PHASE2_SAVED_CARDS_ENABLED: boolean;
  BILLING_PHASE2_AUTO_RENEW_ENABLED: boolean;
  BILLING_PHASE2_DUNNING_ENABLED: boolean;
  BILLING_PHASE2_CARD_SETUP_ENABLED: boolean;
  BILLING_PHASE2_FORCE_MANUAL_FALLBACK_ENABLED: boolean;
  BILLING_EMAIL_NOTIFICATIONS_ENABLED: boolean;
  BILLING_PHASE2_REQUIRE_STEP_UP: boolean;
  BILLING_PHASE2_ALLOWED_COHORTS: string;
  BILLING_PHASE2_DEFAULT_COHORT: string;
  BILLING_PHASE2_SETUP_CALLBACK_TOLERANCE_SECONDS: string;
  BILLING_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS: string;
  BILLING_PAYMENT_METHOD_SETUP_EXPIRY_MINUTES: string;
  BILLING_PHASE2_STEP_UP_WINDOW_MINUTES: string;
  BILLING_EVIDENCE_RETENTION_DAYS: string;
  BILLING_OVERDUE_DAYS: string;
  BILLING_SUBSCRIPTION_RENEWAL_DUE_DAYS: string;
  BILLING_TOPUP_DUE_DAYS: string;
  BILLING_NOTIFICATION_REMINDER_FIRST_THRESHOLD_DAYS: string;
  BILLING_NOTIFICATION_REMINDER_FINAL_THRESHOLD_DAYS: string;
  BILLING_NOTIFICATION_COOLDOWN_REMINDER_HOURS: string;
  BILLING_NOTIFICATION_COOLDOWN_SUCCESS_HOURS: string;
  BILLING_NOTIFICATION_COOLDOWN_DEFAULT_HOURS: string;
  BILLING_SUBSCRIPTION_CUTOVER_READY: boolean;
  BILLING_PUBLIC_URL: string;
  BILLING_PHASE2_STEP_UP_SECRET: string;
}

const EMPTY_BEAM_PROVIDER_FORM: BeamProviderForm = {
  apiBaseUrl: "",
  apiKey: "",
  chargesPath: "/v1/charges",
  paymentLinksPath: "/v1/payment_links",
  chargeStatusPathTemplate: "/v1/charges/{id}",
  paymentLinkStatusPathTemplate: "/v1/payment_links/{id}",
  cancelPathSuffix: "/cancel",
  webhookSecretCurrent: "",
  webhookSecretPrevious: "",
  paymentMethodSetupPath: "",
  paymentMethodSetupHostedUrlTemplate: "",
  paymentMethodSetupReturnUrl: "",
  paymentMethodSetupCallbackSecretCurrent: "",
  paymentMethodSetupCallbackSecretPrevious: "",
};

const EMPTY_BEAM_RUNTIME_FORM: BeamRuntimeForm = {
  PAYMENT_RECONCILIATION_ENABLED: true,
  FINAL_RECONCILIATION_BEFORE_DOWNGRADE: true,
  ADMIN_MANUAL_MARK_PAID_ENABLED: true,
  ADMIN_DOWNGRADE_REVERSAL_ENABLED: true,
  SUPPORT_RECOVERY_CASES_ENABLED: true,
  DOCUMENT_RECOVERY_ENABLED: true,
  INVOICE_HEADER_SYNC_ENABLED: true,
  PAID_INVOICE_REISSUE_ENABLED: true,
  AUTO_DOWNGRADE_AFTER_7_DAYS: true,
  BILLING_PHASE2_SAVED_CARDS_ENABLED: true,
  BILLING_PHASE2_AUTO_RENEW_ENABLED: true,
  BILLING_PHASE2_DUNNING_ENABLED: true,
  BILLING_PHASE2_CARD_SETUP_ENABLED: true,
  BILLING_PHASE2_FORCE_MANUAL_FALLBACK_ENABLED: true,
  BILLING_EMAIL_NOTIFICATIONS_ENABLED: false,
  BILLING_PHASE2_REQUIRE_STEP_UP: false,
  BILLING_PHASE2_ALLOWED_COHORTS: "",
  BILLING_PHASE2_DEFAULT_COHORT: "",
  BILLING_PHASE2_SETUP_CALLBACK_TOLERANCE_SECONDS: "300",
  BILLING_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS: "300",
  BILLING_PAYMENT_METHOD_SETUP_EXPIRY_MINUTES: "60",
  BILLING_PHASE2_STEP_UP_WINDOW_MINUTES: "15",
  BILLING_EVIDENCE_RETENTION_DAYS: "180",
  BILLING_OVERDUE_DAYS: "7",
  BILLING_SUBSCRIPTION_RENEWAL_DUE_DAYS: "7",
  BILLING_TOPUP_DUE_DAYS: "1",
  BILLING_NOTIFICATION_REMINDER_FIRST_THRESHOLD_DAYS: "4",
  BILLING_NOTIFICATION_REMINDER_FINAL_THRESHOLD_DAYS: "1",
  BILLING_NOTIFICATION_COOLDOWN_REMINDER_HOURS: "12",
  BILLING_NOTIFICATION_COOLDOWN_SUCCESS_HOURS: "24",
  BILLING_NOTIFICATION_COOLDOWN_DEFAULT_HOURS: "1",
  BILLING_SUBSCRIPTION_CUTOVER_READY: false,
  BILLING_PUBLIC_URL: "https://smartaihub.app",
  BILLING_PHASE2_STEP_UP_SECRET: "",
};

const BEAM_LIGHTHOUSE_URL = "https://my.beamcheckout.com";
const BEAM_WEBHOOK_GUIDE_URL = "https://docs.beamcheckout.com/webhook/webhook";
const BEAM_PAYMENT_LINK_GUIDE_URL = "https://docs.beamcheckout.com/payment-links/payment-links";
const BEAM_PAYMENT_LINK_API_GUIDE_URL = "https://docs.beamcheckout.com/payment-links/payment-links-api";

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

function McpProviderConfigPanel() {
  const utils = trpc.useUtils();
  const configQuery = trpc.mcpConnections.getProviderConfig.useQuery();
  const saveConfig = trpc.mcpConnections.saveProviderConfig.useMutation({
    onSuccess: async () => {
      toast.success("MCP provider settings saved");
      await utils.mcpConnections.getProviderConfig.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const [form, setForm] = useState({
    callbackBaseUrl: "",
    redirectAllowlist: "",
    timeoutMs: 30000,
    retryCount: 1,
    schemaCacheTtlSeconds: 3600,
    magnificClientId: "",
    magnificClientSecret: "",
    magnificAuthorizationUrl: "",
    magnificTokenUrl: "",
    magnificEnabled: false,
    higgsfieldClientId: "",
    higgsfieldClientSecret: "",
    higgsfieldAuthorizationUrl: "",
    higgsfieldTokenUrl: "",
    higgsfieldEnabled: false,
  });

  useEffect(() => {
    const data = configQuery.data;
    if (!data) return;
    setForm((prev) => ({
      ...prev,
      callbackBaseUrl: data.callbackBaseUrl,
      redirectAllowlist: data.redirectAllowlist.join("\n"),
      timeoutMs: data.timeoutMs,
      retryCount: data.retryCount,
      schemaCacheTtlSeconds: data.schemaCacheTtlSeconds,
      magnificClientId: data.providers.magnific.clientId,
      magnificAuthorizationUrl: data.providers.magnific.authorizationUrl,
      magnificTokenUrl: data.providers.magnific.tokenUrl,
      magnificEnabled: data.providers.magnific.enabled,
      higgsfieldClientId: data.providers.higgsfield.clientId,
      higgsfieldAuthorizationUrl: data.providers.higgsfield.authorizationUrl,
      higgsfieldTokenUrl: data.providers.higgsfield.tokenUrl,
      higgsfieldEnabled: data.providers.higgsfield.enabled,
    }));
  }, [configQuery.data]);

  const save = () => {
    saveConfig.mutate({
      callbackBaseUrl: form.callbackBaseUrl || undefined,
      redirectAllowlist: form.redirectAllowlist.split("\n").map((item) => item.trim()).filter(Boolean),
      timeoutMs: form.timeoutMs,
      retryCount: form.retryCount,
      schemaCacheTtlSeconds: form.schemaCacheTtlSeconds,
      providers: {
        magnific: {
          clientId: form.magnificClientId || undefined,
          clientSecret: form.magnificClientSecret || undefined,
          authorizationUrl: form.magnificAuthorizationUrl || undefined,
          tokenUrl: form.magnificTokenUrl || undefined,
          enabled: form.magnificEnabled,
        },
        higgsfield: {
          clientId: form.higgsfieldClientId || undefined,
          clientSecret: form.higgsfieldClientSecret || undefined,
          authorizationUrl: form.higgsfieldAuthorizationUrl || undefined,
          tokenUrl: form.higgsfieldTokenUrl || undefined,
          enabled: form.higgsfieldEnabled,
        },
      },
    });
  };

  const providerBlock = (key: "magnific" | "higgsfield", label: string) => {
    const prefix = key === "magnific" ? "magnific" : "higgsfield";
    const configured = configQuery.data?.providers[key]?.clientSecretConfigured;
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-950">{label}</h3>
            <p className="text-sm text-slate-500">{configured ? "Configured" : "Not configured"}</p>
          </div>
          <Switch
            checked={form[`${prefix}Enabled` as const] as boolean}
            onCheckedChange={(checked) => setForm((prev) => ({ ...prev, [`${prefix}Enabled`]: checked }))}
          />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>Client ID</Label>
            <Input value={form[`${prefix}ClientId` as const] as string} onChange={(event) => setForm((prev) => ({ ...prev, [`${prefix}ClientId`]: event.target.value }))} />
          </div>
          <div>
            <Label>Client secret</Label>
            <Input type="password" placeholder={configured ? "Leave blank to keep existing secret" : "Enter client secret"} value={form[`${prefix}ClientSecret` as const] as string} onChange={(event) => setForm((prev) => ({ ...prev, [`${prefix}ClientSecret`]: event.target.value }))} />
          </div>
          <div>
            <Label>Authorization URL</Label>
            <Input value={form[`${prefix}AuthorizationUrl` as const] as string} onChange={(event) => setForm((prev) => ({ ...prev, [`${prefix}AuthorizationUrl`]: event.target.value }))} />
          </div>
          <div>
            <Label>Token URL</Label>
            <Input value={form[`${prefix}TokenUrl` as const] as string} onChange={(event) => setForm((prev) => ({ ...prev, [`${prefix}TokenUrl`]: event.target.value }))} />
          </div>
        </div>
      </div>
    );
  };

  return (
    <DashboardCard
      leading={<Cable className="h-5 w-5 text-blue-600" />}
      title="MCP Connect provider configuration"
      description="Configure callback URL, redirect allowlist, provider OAuth metadata, and masked client secrets through UI only."
      bodyClassName="space-y-5"
    >
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <Label>Callback URL</Label>
          <Input value={form.callbackBaseUrl} onChange={(event) => setForm((prev) => ({ ...prev, callbackBaseUrl: event.target.value }))} placeholder="https://app.example.com" />
        </div>
        <div>
          <Label>Provider timeout (ms)</Label>
          <Input type="number" value={form.timeoutMs} onChange={(event) => setForm((prev) => ({ ...prev, timeoutMs: Number(event.target.value) }))} />
        </div>
        <div>
          <Label>Schema cache TTL (seconds)</Label>
          <Input type="number" value={form.schemaCacheTtlSeconds} onChange={(event) => setForm((prev) => ({ ...prev, schemaCacheTtlSeconds: Number(event.target.value) }))} />
        </div>
      </div>
      <div>
        <Label>Redirect allowlist</Label>
        <Textarea rows={3} value={form.redirectAllowlist} onChange={(event) => setForm((prev) => ({ ...prev, redirectAllowlist: event.target.value }))} placeholder="One allowed origin per line" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {providerBlock("magnific", "Magnific")}
        {providerBlock("higgsfield", "Higgsfield")}
      </div>
      <Button onClick={save} disabled={saveConfig.isPending}>
        {saveConfig.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        Save provider settings
      </Button>
    </DashboardCard>
  );
}

export default function AdminSettings() {
  const { i18n } = useTranslation();
  const { user, isLoading: authLoading } = useAuth();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState(() => new URLSearchParams(search).get("tab") || "stripe");
  const isThai = i18n.resolvedLanguage?.startsWith("th") || i18n.language?.startsWith("th");

  useEffect(() => {
    const tab = new URLSearchParams(search).get("tab");
    if (tab) setActiveTab(tab);
  }, [search]);

  const copy = {
    dashboard: isThai ? "แดชบอร์ด" : "Dashboard",
    platformSettings: isThai ? "ตั้งค่าแพลตฟอร์ม" : "Platform Settings",
    platformSubtitle: isThai ? "จัดการ integrations ความปลอดภัย และการเชื่อมต่อระบบ" : "Configure integrations and security",
    languageLabel: isThai ? "ภาษา" : "Language",
    languageHelp: isThai ? "สลับภาษาได้ทันทีในหน้านี้" : "Switch this page instantly",
    billingConsole: isThai ? "คอนโซลบิลลิ่ง" : "Billing Console",
    providerSwitch: {
      title: isThai ? "เกตเวย์การชำระเงิน" : "Payment Gateways",
      description: isThai ? "เลือกผู้ให้บริการ checkout หลัก และจัดการ Stripe กับ Beam ในที่เดียว" : "Choose the active checkout provider and manage Stripe and Beam in one place.",
      activePaymentProvider: isThai ? "ผู้ให้บริการชำระเงินหลัก" : "Active payment provider",
      save: isThai ? "บันทึกการสลับผู้ให้บริการ" : "Save Provider Switch",
      summaryTitle: isThai ? "สรุปการตั้งค่าใช้งานปัจจุบัน" : "Current runtime summary",
      activeProvider: isThai ? "ผู้ให้บริการที่ใช้งานอยู่" : "Active provider",
      enabled: isThai ? "เปิดใช้งาน" : "enabled",
      disabled: isThai ? "ปิดใช้งาน" : "disabled",
      stripeEnabled: isThai ? "เปิดใช้งาน Stripe" : "Stripe enabled",
      stripeDesc: isThai ? "ให้ Stripe ยังเป็นตัวเลือกการชำระเงินได้" : "Keep Stripe available as a provider.",
      beamEnabled: isThai ? "เปิดใช้งาน Beam" : "Beam enabled",
      beamDesc: isThai ? "เปิดใช้ Beam checkout, PromptPay QR และระบบบิลลิ่งของ Beam" : "Enable Beam checkout, QR PromptPay, and Beam billing runtime.",
      beamFallback: isThai ? "ใช้ Beam payment link เป็น fallback" : "Beam payment link fallback",
      beamFallbackDesc: isThai ? "ให้ใช้ Beam payment link ได้เมื่อ charge flow ปกติใช้งานไม่ได้" : "Allow Beam payment links as fallback when charge flow is unavailable.",
      runtimeNote: isThai ? "การตั้งค่า Beam billing runtime, checkout QR, payment links, webhook verification และ card setup อยู่ด้านล่าง" : "Beam billing runtime, checkout QR, payment links, webhook verification, and card-setup config are managed below.",
      stripeLabel: isThai ? "Stripe" : "Stripe",
      beamLabel: isThai ? "Beam" : "Beam",
    },
    stripe: {
      title: isThai ? "ตั้งค่า Stripe" : "Stripe Configuration",
      descPrefix: isThai ? "ตั้งค่า Stripe API keys สำหรับการชำระเงิน รับคีย์ได้จาก" : "Configure your Stripe API keys for payment processing. Get your keys from the",
      descLink: isThai ? "Stripe Dashboard" : "Stripe Dashboard",
      currently: isThai ? "สถานะ Stripe ตอนนี้" : "Stripe is currently",
      publishableKey: isThai ? "Publishable Key" : "Publishable Key",
      publishableHint: isThai ? "ใช้ในฝั่ง frontend สำหรับ Stripe.js integration" : "Used in the frontend for Stripe.js integration",
      secretKey: isThai ? "Secret Key" : "Secret Key",
      configured: isThai ? "ตั้งค่าแล้ว" : "Configured",
      secretPlaceholderKeep: isThai ? "เว้นว่างเพื่อคงคีย์เดิมไว้" : "Enter new key to update...",
      secretPlaceholderNew: isThai ? "sk_test_..." : "sk_test_...",
      secretHint: isThai ? "เก็บเป็นความลับ ห้ามเปิดเผยใน frontend" : "Keep this secret. Never expose in frontend code.",
      webhookSecret: isThai ? "Webhook Secret" : "Webhook Secret",
      webhookPlaceholderKeep: isThai ? "เว้นว่างเพื่อคง secret เดิมไว้" : "Enter new secret to update...",
      webhookPlaceholderNew: isThai ? "whsec_..." : "whsec_...",
      webhookHint: isThai ? "จำเป็นสำหรับรับ Stripe webhook events" : "Required for receiving Stripe webhook events",
      currency: isThai ? "สกุลเงิน" : "Currency",
      selectCurrency: isThai ? "เลือกสกุลเงิน" : "Select currency",
      save: isThai ? "บันทึกการตั้งค่า Stripe" : "Save Stripe Settings",
      test: isThai ? "ทดสอบ Stripe" : "Test Stripe",
    },
    sms: {
      title: isThai ? "ตั้งค่า SMS Provider" : "SMS Provider Settings",
      description: isThai
        ? "ตั้งค่า SMS provider สำหรับการยืนยันเบอร์โทรและรีเซ็ตรหัสผ่านผ่าน SMS หากยังไม่ตั้งค่า ระบบจะ log รหัสไว้ที่ server console เท่านั้น"
        : "Configure an SMS provider for phone verification and password reset via SMS. Without SMS config, codes are logged to the server console only.",
      configured: isThai ? "ตั้งค่า SMS แล้ว" : "SMS Configured",
      provider: isThai ? "ผู้ให้บริการ" : "Provider",
      twilio: "Twilio",
      vonage: "Vonage (Nexmo)",
      accountSid: isThai ? "Account SID" : "Account SID",
      apiKey: isThai ? "API Key" : "API Key",
      authToken: isThai ? "Auth Token" : "Auth Token",
      apiSecret: isThai ? "API Secret" : "API Secret",
      secretPlaceholderKeep: isThai ? "•••••••• (เว้นว่างเพื่อคงค่าเดิม)" : "•••••••• (leave blank to keep)",
      secretPlaceholderNew: isThai ? "กรอก token หรือ secret" : "Enter token/secret",
      fromLabel: isThai ? "From Number / Sender ID" : "From Number / Sender ID",
      fromPlaceholder: isThai ? "SMARTSPEC หรือ +1234567890" : "SMARTSPEC or +1234567890",
      fromHint: isThai
        ? "กรอกเบอร์ที่ใช้ส่ง หรือ Sender ID ที่ลงทะเบียนและได้รับอนุมัติแล้วจากผู้ให้บริการ"
        : "Enter a sending number or the registered Sender ID approved by your provider.",
      testLabel: isThai ? "ส่ง SMS ทดสอบ" : "Send Test SMS",
      sending: isThai ? "กำลังส่ง..." : "Sending...",
      sendTest: isThai ? "ส่งทดสอบ" : "Send Test",
      saving: isThai ? "กำลังบันทึก..." : "Saving...",
      save: isThai ? "บันทึกการตั้งค่า SMS" : "Save SMS Settings",
      recommendedTitle: isThai ? "Twilio เป็นผู้ให้บริการที่แนะนำ" : "Twilio is the recommended provider",
      recommendedBody: isThai
        ? "หากต้องส่ง SMS เข้าไทยหรือปลายทางที่มีข้อกำกับเรื่องชื่อผู้ส่ง แนะนำให้ใช้ Twilio และเตรียมการสมัครบัญชีกับการลงทะเบียน Sender ID ให้พร้อมก่อนเปิดใช้งานจริง"
        : "If you plan to send SMS into Thailand or destinations with sender-name rules, Twilio is the recommended provider and you should complete account signup plus Sender ID registration before going live.",
      twilioGuideTitle: isThai ? "Twilio Setup และ Sender ID" : "Twilio Setup and Sender ID",
      twilioGuideIntro: isThai
        ? "สำหรับประเทศไทยและบางประเทศ การใช้ Sender ID แบบ alphanumeric มักต้องลงทะเบียนก่อน จึงจะส่งข้อความใช้งานจริงได้"
        : "For Thailand and some destinations, alphanumeric Sender IDs typically must be registered before production SMS can be delivered.",
      twilioConsole: isThai ? "เปิด Twilio Console" : "Open Twilio Console",
      docsTitle: isThai ? "ฟอร์ม/เอกสารหลัก (ตัวอย่างประเทศไทย)" : "Core forms/documents (Thailand example)",
      docsItems: isThai
        ? [
            "Thailand Letter of Authorisations จำนวน 3 ฉบับ หรือ 3 templates",
            "Form to Register the Sender ID Name",
            "Thailand URL registration form เฉพาะกรณีที่ข้อความมี URL และต้องลงทะเบียน URL ไปพร้อมกัน",
          ]
        : [
            "Thailand Letter of Authorisations in 3 copies or 3 templates",
            "Form to Register the Sender ID Name",
            "Thailand URL registration form when your SMS includes a URL and that URL must be registered together with the Sender ID",
          ],
      requestTitle: isThai ? "ข้อมูลที่ต้องใส่ในคำขอ" : "Information required in the request",
      requestItems: isThai
        ? [
            "หัวกระดาษบริษัท (letterhead) หรือ Company Logo",
            "Website URL ของบริษัท",
            "ชื่อ Alphanumeric Sender ID ที่ต้องการ",
            "ตัวอย่างข้อความ SMS (sample message template)",
          ]
        : [
            "Company letterhead or company logo",
            "Company website URL",
            "Desired alphanumeric Sender ID",
            "Sample SMS message template",
          ],
      conditionsTitle: isThai ? "เงื่อนไขเพิ่มเติมที่ควรรู้" : "Important additional conditions",
      conditionsItems: isThai
        ? [
            "ถ้าข้อความมี URL ต้องส่ง full-length URL ไปลงทะเบียนหรือ allowlist กับ Sender ID ด้วย และ shortened URL ใช้ไม่ได้ในไทย",
            "ถ้าเป็นข้อความเกี่ยวกับสินเชื่อหรือเงินกู้ ผู้ให้บริการอาจขอใบอนุญาตจาก Bank of Thailand เพิ่มเติม",
            "ชื่อ Sender ID แบบ alphanumeric ของ Twilio ต้องยาวไม่เกิน 11 ตัวอักษร และต้องมีตัวอักษรอย่างน้อย 1 ตัว โดยใช้ตัวอักษรอังกฤษ ตัวเลข และเว้นวรรคได้",
          ]
        : [
            "If the message contains a URL, you must register or allowlist the full-length URL with the Sender ID. Shortened URLs are not accepted in Thailand.",
            "For loan-related content, the provider may request additional Bank of Thailand licensing documents.",
            "Twilio alphanumeric Sender IDs must be no longer than 11 characters, include at least one letter, and may use English letters, numbers, and spaces.",
          ],
      checklistTitle: isThai ? "เช็กลิสต์ก่อนยื่นคำขอ" : "Practical pre-submission checklist",
      checklistItems: isThai
        ? [
            "ชื่อแบรนด์ที่จะใช้เป็น Sender ID",
            "โลโก้หรือหัวกระดาษบริษัท",
            "เว็บไซต์บริษัท",
            "ตัวอย่าง SMS 1-3 แบบ",
            "รายการ URL จริงที่จะใส่ใน SMS",
            "เอกสารหรือสิทธิ์พิเศษ ถ้าเป็นธุรกิจการเงินหรือสินเชื่อ",
          ]
        : [
            "Brand name you want to use as the Sender ID",
            "Company logo or letterhead",
            "Company website",
            "1-3 real SMS samples",
            "The exact URLs that will appear in your SMS",
            "Extra approvals or documents for finance or lending use cases",
          ],
      vonageGuideTitle: isThai ? "Vonage Setup" : "Vonage Setup",
      vonageGuideItems: isThai
        ? [
            "สมัครที่ dashboard.nexmo.com",
            "คัดลอก API Key และ API Secret",
            "ช่อง From Number / Sender ID ใส่ชื่อผู้ส่งหรือเบอร์โทรตามที่ Vonage รองรับ",
            "ถ้าต้องส่งเข้าไทยหรือปลายทางที่มีกฎ Sender ID เข้มงวด แนะนำพิจารณาใช้ Twilio พร้อมขั้นตอน registration ด้านบน",
          ]
        : [
            "Sign up at dashboard.nexmo.com",
            "Copy the API Key and API Secret",
            "Use the From Number / Sender ID field for the sender name or phone number supported by Vonage",
            "If you need Thailand delivery or stricter Sender ID compliance, prefer Twilio and follow the registration checklist above",
          ],
    },
    beam: {
      title: isThai ? "ตั้งค่า Beam Gateway" : "Beam Gateway Configuration",
      description: isThai ? "ตั้งค่า Beam checkout, PromptPay QR, payment links, webhook verification และ card setup จากหน้า Payments นี้" : "Configure Beam checkout, PromptPay QR, payment links, webhook verification, and card setup from the main Payments page.",
      step1Title: isThai ? "1. เปิด Beam Lighthouse" : "1. Open Beam Lighthouse",
      step1Body: isThai ? "ใช้ merchant console ของ Beam เพื่อคัดลอก API credentials, ตั้งค่า webhook endpoint และจัดการ hosted checkout" : "Use your Beam merchant console to copy API credentials, configure webhook endpoints, and manage hosted checkout settings.",
      step1Button: isThai ? "เปิด Beam Lighthouse" : "Open Beam Lighthouse",
      step2Title: isThai ? "2. คู่มือตั้งค่า Webhook" : "2. Webhook setup guide",
      step2Body: isThai ? "ลงทะเบียน webhook endpoint ใน Beam แล้วคัดลอก signing secret มากรอกด้านล่าง" : "Register your webhook endpoint in Beam and copy the signing secret into the fields below.",
      step2Button: isThai ? "เปิดคู่มือ Webhook" : "Open Webhook Guide",
      step3Title: isThai ? "3. คู่มือ Payment Links" : "3. Payment Links guide",
      step3Body: isThai ? "ใช้ตอนเปิด Beam-hosted checkout fallback หรือใช้ตรวจสอบ path templates ของ payment links" : "Use this when enabling Beam-hosted checkout fallback or validating path templates for payment links.",
      overview: isThai ? "ภาพรวม" : "Overview",
      apiGuide: isThai ? "คู่มือ API" : "API Guide",
      runtimeHealth: isThai ? "สถานะการทำงาน Beam" : "Beam runtime health",
      configuredSecrets: isThai ? "Secrets ที่ตั้งค่าไว้" : "Configured secrets",
      yes: isThai ? "ใช่" : "Yes",
      no: isThai ? "ไม่" : "No",
      notConfigured: isThai ? "ยังไม่ตั้งค่า" : "not configured",
      missing: isThai ? "ยังขาด" : "Missing",
      gatewayNotice: isThai ? "การตั้งค่า Beam gateway อยู่ในหน้า Payments แล้ว ส่วน Billing Console ใช้เฉพาะ invoice, recovery และงานปฏิบัติการ" : "Beam gateway setup now lives in Payments. Billing Console remains only for invoice, recovery, and operational workflows.",
      hideSecrets: isThai ? "ซ่อน secrets" : "Hide secrets",
      showSecrets: isThai ? "แสดง secrets" : "Show secrets",
      saveGateway: isThai ? "บันทึก Beam Gateway" : "Save Beam Gateway",
      refreshHealth: isThai ? "รีเฟรชสถานะ Beam" : "Refresh Beam Health",
      runtimeTitle: isThai ? "Beam Billing Runtime" : "Beam Billing Runtime",
      runtimeDesc: isThai ? "จัดการนโยบายบิลลิ่งของ Beam, recovery toggles, QR/card setup flow, reminders และ rollout controls จากหน้า Payments" : "Manage Beam-specific billing policies, recovery toggles, QR/card setup flow, reminders, and rollout controls from the Payments page.",
      runtimeSummary: isThai ? "สรุปการตั้งค่า Beam runtime" : "Beam runtime summary",
      openBillingConsole: isThai ? "เปิดคอนโซลบิลลิ่ง" : "Open Billing Console",
      field: {
        apiBaseUrl: isThai ? "API base URL" : "API base URL",
        apiBaseUrlHint: isThai ? "ปลายทางหลักของ Beam API ตัวอย่าง production คือ https://api.beamcheckout.com และ sandbox คือ https://playground.api.beamcheckout.com" : "Beam API base endpoint. Example: `https://api.beamcheckout.com` for production or `https://playground.api.beamcheckout.com` for sandbox.",
        apiKey: isThai ? "API key" : "API key",
        apiKeyKeep: isThai ? "เว้นว่างเพื่อคง API key เดิมไว้" : "Leave blank to keep existing key",
        apiKeyEnter: isThai ? "กรอก API key" : "Enter API key",
        apiKeyHint: isThai ? "คัดลอกมาจาก developer credentials ใน Beam Lighthouse ถ้าไม่ต้องการเปลี่ยนคีย์เดิมให้เว้นว่างไว้" : "Copy this from Beam Lighthouse developer credentials. Leave blank if you only want to keep the existing saved key.",
        chargesPath: isThai ? "Charges path" : "Charges path",
        chargesPathHint: isThai ? "relative path สำหรับสร้าง direct charge เช่น /v1/charges" : "Relative path used to create direct charges. Example: `/v1/charges`.",
        paymentLinksPath: isThai ? "Payment Links path" : "Payment Links path",
        paymentLinksPathHint: isThai ? "relative path สำหรับสร้าง Beam-hosted payment links เช่น /api/v1/payment-links" : "Relative path used to create Beam-hosted payment links. Example: `/api/v1/payment-links` or your Beam environment’s equivalent path.",
        chargeStatusPathTemplate: isThai ? "Charge status path template" : "Charge status path template",
        chargeStatusPathTemplateHint: isThai ? "template สำหรับดึง charge ตาม id โดยใช้ placeholder {id}" : "Template for retrieving a charge by id. Use `{id}` placeholder. Example: `/v1/charges/{id}`.",
        paymentLinkStatusPathTemplate: isThai ? "Payment Link status path template" : "Payment Link status path template",
        paymentLinkStatusPathTemplateHint: isThai ? "template สำหรับดึง payment link ตาม id โดยใช้ placeholder {id}" : "Template for retrieving a payment link by id. Use `{id}` placeholder. Example: `/api/v1/payment-links/{id}`.",
        cancelPathSuffix: isThai ? "Cancel path suffix" : "Cancel path suffix",
        cancelPathSuffixHint: isThai ? "suffix ที่ต่อท้ายเวลายกเลิกหรือปิด Beam object เช่น /cancel" : "Suffix appended when canceling or disabling a Beam object. Example: `/cancel`.",
        setupApiPath: isThai ? "Setup API path" : "Setup API path",
        setupApiPathHint: isThai ? "path สำหรับสร้าง session setup/authorization ของบัตรที่บันทึกไว้ ใช้เมื่อบัญชี Beam รองรับ card setup" : "API path used to create card setup or authorization sessions for saved-card enrollment. Fill this only if your Beam account supports card setup.",
        hostedSetupUrlTemplate: isThai ? "Hosted setup URL template" : "Hosted setup URL template",
        hostedSetupUrlTemplateHint: isThai ? "URL template ของ Beam hosted card setup ต้องมี {sessionId} และมักมี {returnUrl}" : "Beam-hosted card setup page URL template. Must include placeholders like `{sessionId}` and usually `{returnUrl}`.",
        setupReturnUrl: isThai ? "Setup return URL" : "Setup return URL",
        setupReturnUrlHint: isThai ? "URL ที่ Beam จะพาผู้ใช้กลับมาหลังทำ hosted card setup เสร็จ เช่นหน้าบิลลิ่งหรือหน้ากลับจาก checkout" : "Where Beam should redirect the user after completing hosted card setup. Example: your billing settings or checkout return page.",
        webhookSecretCurrent: isThai ? "Webhook secret ปัจจุบัน" : "Webhook secret current",
        webhookSecretCurrentKeep: isThai ? "เว้นว่างเพื่อคง secret เดิมไว้" : "Leave blank to keep existing secret",
        webhookSecretCurrentEnter: isThai ? "กรอก webhook secret" : "Enter webhook secret",
        webhookSecretCurrentHint: isThai ? "HMAC signing secret ปัจจุบันจากการตั้งค่า Beam webhook ให้วาง secret ล่าสุดที่ใช้งานอยู่" : "Current HMAC signing secret from Beam webhook configuration. Paste the newest active secret here.",
        webhookSecretPrevious: isThai ? "Webhook secret ก่อนหน้า" : "Webhook secret previous",
        webhookSecretPreviousKeep: isThai ? "เว้นว่างเพื่อคง secret เดิมไว้" : "Leave blank to keep previous secret",
        optional: isThai ? "ไม่บังคับ" : "Optional",
        webhookSecretPreviousHint: isThai ? "ใช้ชั่วคราวตอน rotate secret เพื่อให้ webhook retry เก่าตรวจสอบผ่านได้" : "Optional previous secret used during secret rotation so older retries can still validate.",
        setupCallbackSecretCurrent: isThai ? "Setup callback secret ปัจจุบัน" : "Setup callback secret current",
        setupCallbackSecretCurrentKeep: isThai ? "เว้นว่างเพื่อคง secret เดิมไว้" : "Leave blank to keep existing secret",
        setupCallbackSecretCurrentEnter: isThai ? "กรอก callback secret" : "Enter callback secret",
        setupCallbackSecretCurrentHint: isThai ? "secret สำหรับตรวจสอบ Beam hosted setup callbacks ควรแยกจาก webhook secret ปกติหาก Beam ออก secret เฉพาะมาให้" : "Secret used to verify Beam hosted setup callbacks. Keep it separate from the normal webhook secret if Beam provides a dedicated callback secret.",
        setupCallbackSecretPrevious: isThai ? "Setup callback secret ก่อนหน้า" : "Setup callback secret previous",
        setupCallbackSecretPreviousKeep: isThai ? "เว้นว่างเพื่อคง secret เดิมไว้" : "Leave blank to keep previous secret",
        setupCallbackSecretPreviousHint: isThai ? "ใช้ชั่วคราวเฉพาะช่วงที่กำลัง rotate setup callback verification" : "Optional previous callback secret used only while rotating setup callback verification.",
      },
      runtimeLabels: {
        PAYMENT_RECONCILIATION_ENABLED: isThai ? "กระทบยอดการชำระเงิน" : "Payment reconciliation",
        FINAL_RECONCILIATION_BEFORE_DOWNGRADE: isThai ? "กระทบยอดรอบสุดท้ายก่อน downgrade" : "Final reconciliation before downgrade",
        AUTO_DOWNGRADE_AFTER_7_DAYS: isThai ? "downgrade อัตโนมัติหลัง 7 วัน" : "Auto downgrade after 7 days",
        INVOICE_HEADER_SYNC_ENABLED: isThai ? "ซิงก์หัวใบแจ้งหนี้" : "Invoice header sync",
        PAID_INVOICE_REISSUE_ENABLED: isThai ? "ออก paid invoice ใหม่ได้" : "Paid invoice reissue",
        BILLING_PHASE2_SAVED_CARDS_ENABLED: isThai ? "บันทึกบัตร" : "Saved cards",
        BILLING_PHASE2_AUTO_RENEW_ENABLED: isThai ? "ต่ออายุอัตโนมัติ" : "Auto renew",
        BILLING_PHASE2_DUNNING_ENABLED: isThai ? "Dunning" : "Dunning",
        BILLING_PHASE2_CARD_SETUP_ENABLED: isThai ? "ตั้งค่าบัตร" : "Card setup",
        BILLING_PHASE2_FORCE_MANUAL_FALLBACK_ENABLED: isThai ? "สั่ง fallback เป็น manual" : "Manual fallback actions",
        BILLING_EMAIL_NOTIFICATIONS_ENABLED: isThai ? "อีเมลแจ้งเตือนบิลลิ่ง" : "Billing email notifications",
        BILLING_PHASE2_REQUIRE_STEP_UP: isThai ? "บังคับ step-up auth" : "Require step-up auth",
        SUPPORT_RECOVERY_CASES_ENABLED: isThai ? "เคส recovery ของ support" : "Support recovery cases",
        DOCUMENT_RECOVERY_ENABLED: isThai ? "กู้คืนเอกสาร" : "Document recovery",
        BILLING_SUBSCRIPTION_CUTOVER_READY: isThai ? "พร้อม cutover subscription" : "Subscription cutover ready",
      },
      runtimeFields: {
        allowedCohorts: isThai ? "cohort ที่อนุญาตให้ rollout" : "Allowed rollout cohorts",
        defaultCohort: isThai ? "cohort เริ่มต้น" : "Default rollout cohort",
        billingPublicUrl: isThai ? "Billing public URL" : "Billing public URL",
        stepUpSharedSecret: isThai ? "Step-up shared secret" : "Step-up shared secret",
        stepUpSharedSecretKeep: isThai ? "เว้นว่างเพื่อคง secret เดิมไว้" : "Leave blank to keep existing secret",
        stepUpSharedSecretEnter: isThai ? "กรอก step-up secret" : "Enter step-up secret",
        setupCallbackToleranceSeconds: isThai ? "วินาทีที่ยอมรับ setup callback ได้" : "Setup callback tolerance seconds",
        webhookTimestampToleranceSeconds: isThai ? "วินาทีที่ยอมรับ webhook timestamp ได้" : "Webhook timestamp tolerance seconds",
        paymentMethodSetupExpiryMinutes: isThai ? "อายุ setup payment method (นาที)" : "Payment method setup expiry minutes",
        stepUpWindowMinutes: isThai ? "หน้าต่างเวลา step-up (นาที)" : "Step-up window minutes",
        evidenceRetentionDays: isThai ? "อายุเก็บ evidence (วัน)" : "Evidence retention days",
        overdueDays: isThai ? "จำนวนวันค้างชำระ" : "Overdue days",
        subscriptionRenewalDueDays: isThai ? "วันครบกำหนด renewal subscription" : "Subscription renewal due days",
        topupDueDays: isThai ? "วันครบกำหนด top-up" : "Top-up due days",
        reminderFirstThresholdDays: isThai ? "วันเตือนครั้งแรก" : "Reminder first threshold days",
        reminderFinalThresholdDays: isThai ? "วันเตือนครั้งสุดท้าย" : "Reminder final threshold days",
        reminderCooldownHours: isThai ? "คูลดาวน์การเตือน (ชั่วโมง)" : "Reminder cooldown hours",
        successCooldownHours: isThai ? "คูลดาวน์หลังจ่ายสำเร็จ (ชั่วโมง)" : "Success cooldown hours",
        defaultCooldownHours: isThai ? "คูลดาวน์เริ่มต้น (ชั่วโมง)" : "Default cooldown hours",
      },
      runtimeValues: {
        savedCards: isThai ? "บันทึกบัตร" : "Saved cards",
        autoRenew: isThai ? "ต่ออายุอัตโนมัติ" : "Auto renew",
        dunning: isThai ? "Dunning" : "Dunning",
        cardSetup: isThai ? "ตั้งค่าบัตร" : "Card setup",
        supportRecovery: isThai ? "Support recovery" : "Support recovery",
      },
      saveRuntime: isThai ? "บันทึก Beam Runtime" : "Save Beam Runtime",
    },
    nav: {
      payments: { label: isThai ? "การชำระเงิน" : "Payments", sublabel: isThai ? "Stripe / Beam" : "Stripe / Beam" },
      oauth: { label: "OAuth", sublabel: isThai ? "เข้าสู่ระบบโซเชียล" : "Social Login" },
      registration: { label: isThai ? "การสมัครสมาชิก" : "Registration", sublabel: isThai ? "สมัครใช้งาน / เครดิต" : "Signup & Credits" },
      smtp: { label: isThai ? "อีเมล" : "Email", sublabel: isThai ? "ตั้งค่า SMTP" : "SMTP Settings" },
      sms: { label: "SMS", sublabel: isThai ? "ตั้งค่าผู้ให้บริการ" : "Provider Config" },
      telegram: { label: isThai ? "บอท Telegram" : "Telegram Bot", sublabel: isThai ? "แจ้งเตือน" : "Alert Notifications" },
      twoFA: { label: "2FA", sublabel: isThai ? "ตัวพิสูจน์ตัวตน" : "Authenticator" },
      stt: { label: "STT", sublabel: isThai ? "แปลงเสียงเป็นข้อความ" : "Speech-to-Text" },
      ai: { label: isThai ? "AI / หน่วยความจำ" : "AI / Memory", sublabel: isThai ? "โมเดลสรุปผล" : "Summary Model" },
      documentOcr: { label: isThai ? "OCR" : "OCR", sublabel: isThai ? "เส้นทาง / keys" : "Routing / keys" },
      financeRules: { label: isThai ? "Rules" : "Rules", sublabel: isThai ? "merchant pins / slips" : "Merchant pins / slips" },
      vectordb: { label: isThai ? "ฐานข้อมูลเวกเตอร์" : "Vector Database", sublabel: isThai ? "RAG / Embeddings" : "RAG & Embeddings" },
      storage: { label: isThai ? "พื้นที่จัดเก็บ" : "Storage", sublabel: isThai ? "Local / R2 / S3" : "Local / R2 / S3" },
      infrastructure: { label: isThai ? "โครงสร้างพื้นฐาน" : "Infrastructure", sublabel: isThai ? "GCP / Redis / Tasks" : "GCP / Redis / Tasks" },
      agencies: { label: isThai ? "เอเจนซี" : "Agencies", sublabel: isThai ? "Multi-Agent Swarm" : "Multi-Agent Swarm" },
      automation: { label: isThai ? "อัตโนมัติ" : "Automation", sublabel: isThai ? "ตั้งค่า Copilot" : "Copilot Settings" },
      menu: { label: isThai ? "เมนูหลัก" : "Main Menu", sublabel: isThai ? "การมองเห็นเมนู" : "Visibility Control" },
    },
  } as const;

  // Stripe settings state
  const [stripeForm, setStripeForm] = useState<StripeSettings>({
    currency: "usd",
  });
  const [paymentsSubTab, setPaymentsSubTab] = useState("provider");
  const [beamProviderForm, setBeamProviderForm] = useState<BeamProviderForm>(EMPTY_BEAM_PROVIDER_FORM);
  const [paymentProviderForm, setPaymentProviderForm] = useState<PaymentProviderForm>({
    BILLING_ACTIVE_PROVIDER: "beam",
    BILLING_STRIPE_ENABLED: false,
    BILLING_BEAM_ENABLED: true,
    BEAM_PAYMENT_LINK_FALLBACK: true,
  });
  const [beamRuntimeForm, setBeamRuntimeForm] = useState<BeamRuntimeForm>(EMPTY_BEAM_RUNTIME_FORM);
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [showBeamSecrets, setShowBeamSecrets] = useState(false);

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

  const beamProviderSettingsQuery = trpc.adminBilling.getBeamProviderSettings.useQuery(undefined, {
    enabled: !!user && user.role === "admin",
  });
  const beamProviderHealthQuery = trpc.adminBilling.testBeamProviderSettings.useQuery(undefined, {
    enabled: !!user && user.role === "admin",
  });
  const billingRuntimeSettingsQuery = trpc.adminBilling.getBillingRuntimeSettings.useQuery(undefined, {
    enabled: !!user && user.role === "admin",
  });

  const updateBeamProviderSettingsMutation = trpc.adminBilling.updateBeamProviderSettings.useMutation({
    onSuccess: () => {
      toast.success("Beam settings saved successfully");
      beamProviderSettingsQuery.refetch();
      beamProviderHealthQuery.refetch();
    },
    onError: (err) => {
      toast.error(`Failed to save Beam settings: ${err.message}`);
    },
  });

  const updateBillingProviderMutation = trpc.adminBilling.updateBillingRuntimeSettings.useMutation({
    onSuccess: () => {
      toast.success("Payment provider settings saved");
      billingRuntimeSettingsQuery.refetch();
    },
    onError: (err) => {
      toast.error(`Failed to save provider settings: ${err.message}`);
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
  const { data: aiSettings, refetch: refetchAi } = trpc.systemSettings.getSettingsByCategory.useQuery(
    { category: "ai" as any },
    { enabled: !!user && user.role === "admin" }
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
    if (!beamProviderSettingsQuery.data) return;
    setBeamProviderForm((prev) => ({
      ...prev,
      apiBaseUrl: beamProviderSettingsQuery.data.apiBaseUrl ?? "",
      chargesPath: beamProviderSettingsQuery.data.chargesPath ?? prev.chargesPath,
      paymentLinksPath: beamProviderSettingsQuery.data.paymentLinksPath ?? prev.paymentLinksPath,
      chargeStatusPathTemplate: beamProviderSettingsQuery.data.chargeStatusPathTemplate ?? prev.chargeStatusPathTemplate,
      paymentLinkStatusPathTemplate: beamProviderSettingsQuery.data.paymentLinkStatusPathTemplate ?? prev.paymentLinkStatusPathTemplate,
      cancelPathSuffix: beamProviderSettingsQuery.data.cancelPathSuffix ?? prev.cancelPathSuffix,
      apiKey: "",
      webhookSecretCurrent: "",
      webhookSecretPrevious: "",
      paymentMethodSetupPath: beamProviderSettingsQuery.data.paymentMethodSetupPath ?? "",
      paymentMethodSetupHostedUrlTemplate: beamProviderSettingsQuery.data.paymentMethodSetupHostedUrlTemplate ?? "",
      paymentMethodSetupReturnUrl: beamProviderSettingsQuery.data.paymentMethodSetupReturnUrl ?? "",
      paymentMethodSetupCallbackSecretCurrent: "",
      paymentMethodSetupCallbackSecretPrevious: "",
    }));
  }, [beamProviderSettingsQuery.data]);

  useEffect(() => {
    if (!billingRuntimeSettingsQuery.data) return;
    setPaymentProviderForm({
      BILLING_ACTIVE_PROVIDER:
        billingRuntimeSettingsQuery.data.BILLING_ACTIVE_PROVIDER === "stripe" ? "stripe" : "beam",
      BILLING_STRIPE_ENABLED: Boolean(billingRuntimeSettingsQuery.data.BILLING_STRIPE_ENABLED),
      BILLING_BEAM_ENABLED: Boolean(billingRuntimeSettingsQuery.data.BILLING_BEAM_ENABLED),
      BEAM_PAYMENT_LINK_FALLBACK: Boolean(billingRuntimeSettingsQuery.data.BEAM_PAYMENT_LINK_FALLBACK),
    });
    setBeamRuntimeForm({
      PAYMENT_RECONCILIATION_ENABLED: Boolean(billingRuntimeSettingsQuery.data.PAYMENT_RECONCILIATION_ENABLED),
      FINAL_RECONCILIATION_BEFORE_DOWNGRADE: Boolean(billingRuntimeSettingsQuery.data.FINAL_RECONCILIATION_BEFORE_DOWNGRADE),
      ADMIN_MANUAL_MARK_PAID_ENABLED: Boolean(billingRuntimeSettingsQuery.data.ADMIN_MANUAL_MARK_PAID_ENABLED),
      ADMIN_DOWNGRADE_REVERSAL_ENABLED: Boolean(billingRuntimeSettingsQuery.data.ADMIN_DOWNGRADE_REVERSAL_ENABLED),
      SUPPORT_RECOVERY_CASES_ENABLED: Boolean(billingRuntimeSettingsQuery.data.SUPPORT_RECOVERY_CASES_ENABLED),
      DOCUMENT_RECOVERY_ENABLED: Boolean(billingRuntimeSettingsQuery.data.DOCUMENT_RECOVERY_ENABLED),
      INVOICE_HEADER_SYNC_ENABLED: Boolean(billingRuntimeSettingsQuery.data.INVOICE_HEADER_SYNC_ENABLED),
      PAID_INVOICE_REISSUE_ENABLED: Boolean(billingRuntimeSettingsQuery.data.PAID_INVOICE_REISSUE_ENABLED),
      AUTO_DOWNGRADE_AFTER_7_DAYS: Boolean(billingRuntimeSettingsQuery.data.AUTO_DOWNGRADE_AFTER_7_DAYS),
      BILLING_PHASE2_SAVED_CARDS_ENABLED: Boolean(billingRuntimeSettingsQuery.data.BILLING_PHASE2_SAVED_CARDS_ENABLED),
      BILLING_PHASE2_AUTO_RENEW_ENABLED: Boolean(billingRuntimeSettingsQuery.data.BILLING_PHASE2_AUTO_RENEW_ENABLED),
      BILLING_PHASE2_DUNNING_ENABLED: Boolean(billingRuntimeSettingsQuery.data.BILLING_PHASE2_DUNNING_ENABLED),
      BILLING_PHASE2_CARD_SETUP_ENABLED: Boolean(billingRuntimeSettingsQuery.data.BILLING_PHASE2_CARD_SETUP_ENABLED),
      BILLING_PHASE2_FORCE_MANUAL_FALLBACK_ENABLED: Boolean(billingRuntimeSettingsQuery.data.BILLING_PHASE2_FORCE_MANUAL_FALLBACK_ENABLED),
      BILLING_EMAIL_NOTIFICATIONS_ENABLED: Boolean(billingRuntimeSettingsQuery.data.BILLING_EMAIL_NOTIFICATIONS_ENABLED),
      BILLING_PHASE2_REQUIRE_STEP_UP: Boolean(billingRuntimeSettingsQuery.data.BILLING_PHASE2_REQUIRE_STEP_UP),
      BILLING_PHASE2_ALLOWED_COHORTS: billingRuntimeSettingsQuery.data.BILLING_PHASE2_ALLOWED_COHORTS ?? "",
      BILLING_PHASE2_DEFAULT_COHORT: billingRuntimeSettingsQuery.data.BILLING_PHASE2_DEFAULT_COHORT ?? "",
      BILLING_PHASE2_SETUP_CALLBACK_TOLERANCE_SECONDS: billingRuntimeSettingsQuery.data.BILLING_PHASE2_SETUP_CALLBACK_TOLERANCE_SECONDS ?? "300",
      BILLING_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS: billingRuntimeSettingsQuery.data.BILLING_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS ?? "300",
      BILLING_PAYMENT_METHOD_SETUP_EXPIRY_MINUTES: billingRuntimeSettingsQuery.data.BILLING_PAYMENT_METHOD_SETUP_EXPIRY_MINUTES ?? "60",
      BILLING_PHASE2_STEP_UP_WINDOW_MINUTES: billingRuntimeSettingsQuery.data.BILLING_PHASE2_STEP_UP_WINDOW_MINUTES ?? "15",
      BILLING_EVIDENCE_RETENTION_DAYS: billingRuntimeSettingsQuery.data.BILLING_EVIDENCE_RETENTION_DAYS ?? "180",
      BILLING_OVERDUE_DAYS: billingRuntimeSettingsQuery.data.BILLING_OVERDUE_DAYS ?? "7",
      BILLING_SUBSCRIPTION_RENEWAL_DUE_DAYS: billingRuntimeSettingsQuery.data.BILLING_SUBSCRIPTION_RENEWAL_DUE_DAYS ?? "7",
      BILLING_TOPUP_DUE_DAYS: billingRuntimeSettingsQuery.data.BILLING_TOPUP_DUE_DAYS ?? "1",
      BILLING_NOTIFICATION_REMINDER_FIRST_THRESHOLD_DAYS: billingRuntimeSettingsQuery.data.BILLING_NOTIFICATION_REMINDER_FIRST_THRESHOLD_DAYS ?? "4",
      BILLING_NOTIFICATION_REMINDER_FINAL_THRESHOLD_DAYS: billingRuntimeSettingsQuery.data.BILLING_NOTIFICATION_REMINDER_FINAL_THRESHOLD_DAYS ?? "1",
      BILLING_NOTIFICATION_COOLDOWN_REMINDER_HOURS: billingRuntimeSettingsQuery.data.BILLING_NOTIFICATION_COOLDOWN_REMINDER_HOURS ?? "12",
      BILLING_NOTIFICATION_COOLDOWN_SUCCESS_HOURS: billingRuntimeSettingsQuery.data.BILLING_NOTIFICATION_COOLDOWN_SUCCESS_HOURS ?? "24",
      BILLING_NOTIFICATION_COOLDOWN_DEFAULT_HOURS: billingRuntimeSettingsQuery.data.BILLING_NOTIFICATION_COOLDOWN_DEFAULT_HOURS ?? "1",
      BILLING_SUBSCRIPTION_CUTOVER_READY: Boolean(billingRuntimeSettingsQuery.data.BILLING_SUBSCRIPTION_CUTOVER_READY),
      BILLING_PUBLIC_URL: billingRuntimeSettingsQuery.data.BILLING_PUBLIC_URL ?? "",
      BILLING_PHASE2_STEP_UP_SECRET: "",
    });
  }, [billingRuntimeSettingsQuery.data]);

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

  const handleSaveBeam = () => {
    updateBeamProviderSettingsMutation.mutate(beamProviderForm);
  };

  const handleSavePaymentProvider = () => {
    updateBillingProviderMutation.mutate(paymentProviderForm);
  };

  const handleSaveBeamRuntime = () => {
    updateBillingProviderMutation.mutate({
      ...paymentProviderForm,
      ...beamRuntimeForm,
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

  const hasConfiguredValue = (value?: string) => !!value?.trim();
  const googleSecretReady = googleSecretConfigured || hasConfiguredValue(oauthForm.googleClientSecret);
  const googleLoginReady = hasConfiguredValue(oauthForm.googleClientId) && googleSecretReady && hasConfiguredValue(oauthForm.googleRedirectUri);
  const googleDriveReady = hasConfiguredValue(oauthForm.googleClientId) && googleSecretReady && hasConfiguredValue(oauthForm.googleDriveRedirectUri);
  const twoFaWebReady = twoFaForm.enabled;
  const twoFaDesktopBrowserReady = twoFaForm.enabled;

  const navItems = [
    { key: "stripe", label: copy.nav.payments.label, sublabel: copy.nav.payments.sublabel, icon: CreditCard },
    { key: "oauth", label: copy.nav.oauth.label, sublabel: copy.nav.oauth.sublabel, icon: Globe },
    { key: "registration", label: copy.nav.registration.label, sublabel: copy.nav.registration.sublabel, icon: UserPlus },
    { key: "smtp", label: copy.nav.smtp.label, sublabel: copy.nav.smtp.sublabel, icon: Mail },
    { key: "sms", label: copy.nav.sms.label, sublabel: copy.nav.sms.sublabel, icon: MessageSquare },
    { key: "telegram", label: copy.nav.telegram.label, sublabel: copy.nav.telegram.sublabel, icon: Send },
    { key: "2FA", label: copy.nav.twoFA.label, sublabel: copy.nav.twoFA.sublabel, icon: Shield },
    { key: "stt", label: copy.nav.stt.label, sublabel: copy.nav.stt.sublabel, icon: Mic },
    { key: "ai", label: copy.nav.ai.label, sublabel: copy.nav.ai.sublabel, icon: Brain },
    { key: "document_ocr", label: copy.nav.documentOcr.label, sublabel: copy.nav.documentOcr.sublabel, icon: FileText },
    { key: "mcp_connect", label: "MCP Connect", sublabel: "Provider config", icon: Cable },
    { key: "finance_rules", label: copy.nav.financeRules.label, sublabel: copy.nav.financeRules.sublabel, icon: CheckSquare },
    { key: "vectordb", label: copy.nav.vectordb.label, sublabel: copy.nav.vectordb.sublabel, icon: Database },
    { key: "storage", label: copy.nav.storage.label, sublabel: copy.nav.storage.sublabel, icon: Cloud },
    { key: "infrastructure", label: copy.nav.infrastructure.label, sublabel: copy.nav.infrastructure.sublabel, icon: Server },
    { key: "agencies", label: copy.nav.agencies.label, sublabel: copy.nav.agencies.sublabel, icon: Zap },
    { key: "automation", label: copy.nav.automation.label, sublabel: copy.nav.automation.sublabel, icon: Bot },
    { key: "menu", label: copy.nav.menu.label, sublabel: copy.nav.menu.sublabel, icon: Menu },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
      {/* Top Header */}
      <div className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="px-4 sm:px-6 lg:px-8 py-4 flex flex-wrap items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/dashboard")}
            className="text-gray-500 hover:text-gray-900 -ml-2"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            {copy.dashboard}
          </Button>
          <div className="h-5 w-px bg-gray-200" />
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-md shadow-blue-200/50">
              <Settings className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">{copy.platformSettings}</h1>
              <p className="text-xs text-gray-500">{copy.platformSubtitle}</p>
            </div>
            <HelpButton page="/admin/settings" variant="ghost" size="sm" />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-2 shadow-sm">
              <div className="hidden sm:flex items-center gap-2 text-slate-600">
                <Globe className="h-4 w-4" />
                <div className="leading-tight">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {copy.languageLabel}
                  </div>
                  <div className="text-xs text-slate-500">{copy.languageHelp}</div>
                </div>
              </div>
              <LocaleToggle className="shrink-0" />
            </div>
            <Button variant="outline" size="sm" onClick={() => setLocation("/admin/billing")}>
              <CreditCard className="mr-2 h-4 w-4" />
              {copy.billingConsole}
            </Button>
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
            <div className="space-y-6">
              <DashboardCard
                className="overflow-hidden"
                leading={<CreditCard className="w-5 h-5 text-blue-500" />}
                title={copy.providerSwitch.title}
                description={copy.providerSwitch.description}
                bodyClassName="space-y-6"
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-sm font-medium text-slate-900">{copy.providerSwitch.activePaymentProvider}</div>
                    <div className="mt-2">
                      <Select
                        value={paymentProviderForm.BILLING_ACTIVE_PROVIDER}
                        onValueChange={(value) =>
                          setPaymentProviderForm((prev) => ({
                            ...prev,
                            BILLING_ACTIVE_PROVIDER: value as "stripe" | "beam",
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="stripe">Stripe</SelectItem>
                          <SelectItem value="beam">Beam</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="mt-3 space-y-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-medium text-slate-900">{copy.providerSwitch.stripeEnabled}</div>
                          <div className="text-xs text-slate-500">{copy.providerSwitch.stripeDesc}</div>
                        </div>
                        <Switch
                          checked={paymentProviderForm.BILLING_STRIPE_ENABLED}
                          onCheckedChange={(checked) =>
                            setPaymentProviderForm((prev) => ({
                              ...prev,
                              BILLING_STRIPE_ENABLED: checked,
                              BILLING_ACTIVE_PROVIDER:
                                !checked && prev.BILLING_ACTIVE_PROVIDER === "stripe" ? "beam" : prev.BILLING_ACTIVE_PROVIDER,
                            }))
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-medium text-slate-900">{copy.providerSwitch.beamEnabled}</div>
                          <div className="text-xs text-slate-500">{copy.providerSwitch.beamDesc}</div>
                        </div>
                        <Switch
                          checked={paymentProviderForm.BILLING_BEAM_ENABLED}
                          onCheckedChange={(checked) =>
                            setPaymentProviderForm((prev) => ({
                              ...prev,
                              BILLING_BEAM_ENABLED: checked,
                              BILLING_ACTIVE_PROVIDER:
                                !checked && prev.BILLING_ACTIVE_PROVIDER === "beam" ? "stripe" : prev.BILLING_ACTIVE_PROVIDER,
                            }))
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-medium text-slate-900">{copy.providerSwitch.beamFallback}</div>
                          <div className="text-xs text-slate-500">{copy.providerSwitch.beamFallbackDesc}</div>
                        </div>
                        <Switch
                          checked={paymentProviderForm.BEAM_PAYMENT_LINK_FALLBACK}
                          onCheckedChange={(checked) =>
                            setPaymentProviderForm((prev) => ({ ...prev, BEAM_PAYMENT_LINK_FALLBACK: checked }))
                          }
                        />
                      </div>
                    </div>
                    <div className="mt-4 flex justify-end">
                      <Button onClick={handleSavePaymentProvider} disabled={updateBillingProviderMutation.isPending}>
                        {updateBillingProviderMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                        {copy.providerSwitch.save}
                      </Button>
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                    <div className="font-medium text-slate-900">{copy.providerSwitch.summaryTitle}</div>
                    <div className="mt-2">{copy.providerSwitch.activeProvider}: <span className="font-medium uppercase">{paymentProviderForm.BILLING_ACTIVE_PROVIDER}</span></div>
                    <div>Stripe: {paymentProviderForm.BILLING_STRIPE_ENABLED ? copy.providerSwitch.enabled : copy.providerSwitch.disabled}</div>
                    <div>Beam: {paymentProviderForm.BILLING_BEAM_ENABLED ? copy.providerSwitch.enabled : copy.providerSwitch.disabled}</div>
                    <div>Beam fallback: {paymentProviderForm.BEAM_PAYMENT_LINK_FALLBACK ? copy.providerSwitch.enabled : copy.providerSwitch.disabled}</div>
                    <div className="mt-3 text-xs text-slate-500">
                      {copy.providerSwitch.runtimeNote}
                    </div>
                  </div>
                </div>
              </DashboardCard>

              <Tabs value={paymentsSubTab} onValueChange={setPaymentsSubTab}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="stripe">{copy.providerSwitch.stripeLabel}</TabsTrigger>
                  <TabsTrigger value="beam">{copy.providerSwitch.beamLabel}</TabsTrigger>
                </TabsList>

                <TabsContent value="stripe">
                  <DashboardCard
                    className="overflow-hidden"
                    leading={<CreditCard className="w-5 h-5 text-blue-500" />}
                    title={copy.stripe.title}
                    description={<>
                      {copy.stripe.descPrefix}{" "}
                      <a
                        href="https://dashboard.stripe.com/apikeys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        {copy.stripe.descLink}
                      </a>
                      .
                    </>}
                    bodyClassName="space-y-6"
                  >
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                      {copy.stripe.currently} <span className="font-medium">{paymentProviderForm.BILLING_STRIPE_ENABLED ? copy.providerSwitch.enabled : copy.providerSwitch.disabled}</span>.
                    </div>
                    <div>
                      <Label htmlFor="publishableKey">{copy.stripe.publishableKey}</Label>
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
                        {copy.stripe.publishableHint}
                      </p>
                    </div>

                    <div>
                      <Label htmlFor="secretKey">
                        {copy.stripe.secretKey}
                        {stripeForm.secretKeyConfigured && (
                          <Badge variant="outline" className="ml-2 text-green-600 border-green-600">
                            <Check className="w-3 h-3 mr-1" />
                            {copy.stripe.configured}
                          </Badge>
                        )}
                      </Label>
                      <div className="flex gap-2 mt-1">
                        <div className="relative flex-1">
                          <Input
                            id="secretKey"
                            type={showSecretKey ? "text" : "password"}
                            placeholder={stripeForm.secretKeyConfigured ? copy.stripe.secretPlaceholderKeep : copy.stripe.secretPlaceholderNew}
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
                        {copy.stripe.secretHint}
                      </p>
                    </div>

                    <div>
                      <Label htmlFor="webhookSecret">
                        {copy.stripe.webhookSecret}
                        {stripeForm.webhookSecretConfigured && (
                          <Badge variant="outline" className="ml-2 text-green-600 border-green-600">
                            <Check className="w-3 h-3 mr-1" />
                            {copy.stripe.configured}
                          </Badge>
                        )}
                      </Label>
                      <div className="flex gap-2 mt-1">
                        <div className="relative flex-1">
                          <Input
                            id="webhookSecret"
                            type={showWebhookSecret ? "text" : "password"}
                            placeholder={stripeForm.webhookSecretConfigured ? copy.stripe.webhookPlaceholderKeep : copy.stripe.webhookPlaceholderNew}
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
                        {copy.stripe.webhookHint}
                      </p>
                    </div>

                    <div>
                      <Label htmlFor="currency">{copy.stripe.currency}</Label>
                      <Select
                        value={stripeForm.currency || "usd"}
                        onValueChange={(value) =>
                          setStripeForm((prev) => ({ ...prev, currency: value }))
                        }
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder={copy.stripe.selectCurrency} />
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
                        {copy.stripe.save}
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
                        {copy.stripe.test}
                      </Button>
                    </div>
                  </DashboardCard>
                </TabsContent>

                <TabsContent value="beam">
                  <div className="space-y-6">
                    <DashboardCard
                      className="overflow-hidden"
                      leading={<Shield className="w-5 h-5 text-cyan-600" />}
                      title={copy.beam.title}
                      description={copy.beam.description}
                      bodyClassName="space-y-6"
                    >
                      <div className="grid gap-4 md:grid-cols-3">
                        <div className="rounded-xl border border-cyan-200 bg-cyan-50/70 p-4 text-sm text-slate-700">
                          <div className="font-medium text-slate-900">{copy.beam.step1Title}</div>
                          <p className="mt-2 text-xs leading-5 text-slate-600">
                            {copy.beam.step1Body}
                          </p>
                          <Button asChild variant="outline" size="sm" className="mt-3">
                            <a href={BEAM_LIGHTHOUSE_URL} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="mr-2 h-4 w-4" />
                              {copy.beam.step1Button}
                            </a>
                          </Button>
                        </div>
                        <div className="rounded-xl border border-cyan-200 bg-cyan-50/70 p-4 text-sm text-slate-700">
                          <div className="font-medium text-slate-900">{copy.beam.step2Title}</div>
                          <p className="mt-2 text-xs leading-5 text-slate-600">
                            {copy.beam.step2Body}
                          </p>
                          <Button asChild variant="outline" size="sm" className="mt-3">
                            <a href={BEAM_WEBHOOK_GUIDE_URL} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="mr-2 h-4 w-4" />
                              {copy.beam.step2Button}
                            </a>
                          </Button>
                        </div>
                        <div className="rounded-xl border border-cyan-200 bg-cyan-50/70 p-4 text-sm text-slate-700">
                          <div className="font-medium text-slate-900">{copy.beam.step3Title}</div>
                          <p className="mt-2 text-xs leading-5 text-slate-600">
                            {copy.beam.step3Body}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button asChild variant="outline" size="sm">
                              <a href={BEAM_PAYMENT_LINK_GUIDE_URL} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="mr-2 h-4 w-4" />
                                {copy.beam.overview}
                              </a>
                            </Button>
                            <Button asChild variant="outline" size="sm">
                              <a href={BEAM_PAYMENT_LINK_API_GUIDE_URL} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="mr-2 h-4 w-4" />
                                {copy.beam.apiGuide}
                              </a>
                            </Button>
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                          <div className="font-medium text-slate-900">{copy.beam.runtimeHealth}</div>
                          <div className="mt-2">Beam enabled: {paymentProviderForm.BILLING_BEAM_ENABLED ? copy.beam.yes : copy.beam.no}</div>
                          <div>{copy.providerSwitch.activeProvider}: {paymentProviderForm.BILLING_ACTIVE_PROVIDER.toUpperCase()}</div>
                          <div>API configured: {beamProviderHealthQuery.data?.configured ? copy.beam.yes : copy.beam.no}</div>
                          <div>Webhook configured: {beamProviderHealthQuery.data?.webhookConfigured ? copy.beam.yes : copy.beam.no}</div>
                          <div>Hosted setup configured: {beamProviderHealthQuery.data?.setupHostedConfigured ? copy.beam.yes : copy.beam.no}</div>
                          <div>Setup API configured: {beamProviderHealthQuery.data?.setupApiConfigured ? copy.beam.yes : copy.beam.no}</div>
                          <div>Payment Link configured: {beamProviderHealthQuery.data?.paymentLinkConfigured ? copy.beam.yes : copy.beam.no}</div>
                          {(beamProviderHealthQuery.data?.missing?.length ?? 0) > 0 ? (
                            <div className="mt-2 text-rose-700">{copy.beam.missing}: {(beamProviderHealthQuery.data?.missing ?? []).join(", ")}</div>
                          ) : null}
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                          <div className="font-medium text-slate-900">{copy.beam.configuredSecrets}</div>
                          <div className="mt-2">API key: {beamProviderSettingsQuery.data?.apiKeyConfigured ? beamProviderSettingsQuery.data?.apiKeyMasked : copy.beam.notConfigured}</div>
                          <div>Webhook current: {beamProviderSettingsQuery.data?.webhookSecretCurrentConfigured ? beamProviderSettingsQuery.data?.webhookSecretCurrentMasked : copy.beam.notConfigured}</div>
                          <div>Webhook previous: {beamProviderSettingsQuery.data?.webhookSecretPreviousConfigured ? beamProviderSettingsQuery.data?.webhookSecretPreviousMasked : copy.beam.notConfigured}</div>
                          <div>Setup callback current: {beamProviderSettingsQuery.data?.paymentMethodSetupCallbackSecretCurrentConfigured ? beamProviderSettingsQuery.data?.paymentMethodSetupCallbackSecretCurrentMasked : copy.beam.notConfigured}</div>
                          <div>Setup callback previous: {beamProviderSettingsQuery.data?.paymentMethodSetupCallbackSecretPreviousConfigured ? beamProviderSettingsQuery.data?.paymentMethodSetupCallbackSecretPreviousMasked : copy.beam.notConfigured}</div>
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <Label>{copy.beam.field.apiBaseUrl}</Label>
                          <Input value={beamProviderForm.apiBaseUrl} onChange={(e) => setBeamProviderForm((prev) => ({ ...prev, apiBaseUrl: e.target.value }))} placeholder="https://api.beam.example" />
                          <p className="mt-1 text-xs text-slate-500">
                            {copy.beam.field.apiBaseUrlHint}
                          </p>
                        </div>
                        <div>
                          <Label>{copy.beam.field.apiKey}</Label>
                          <div className="relative">
                            <Input type={showBeamSecrets ? "text" : "password"} value={beamProviderForm.apiKey} onChange={(e) => setBeamProviderForm((prev) => ({ ...prev, apiKey: e.target.value }))} placeholder={beamProviderSettingsQuery.data?.apiKeyConfigured ? copy.beam.field.apiKeyKeep : copy.beam.field.apiKeyEnter} />
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            {copy.beam.field.apiKeyHint}
                          </p>
                        </div>
                        <div>
                          <Label>{copy.beam.field.chargesPath}</Label>
                          <Input value={beamProviderForm.chargesPath} onChange={(e) => setBeamProviderForm((prev) => ({ ...prev, chargesPath: e.target.value }))} />
                          <p className="mt-1 text-xs text-slate-500">
                            {copy.beam.field.chargesPathHint}
                          </p>
                        </div>
                        <div>
                          <Label>{copy.beam.field.paymentLinksPath}</Label>
                          <Input value={beamProviderForm.paymentLinksPath} onChange={(e) => setBeamProviderForm((prev) => ({ ...prev, paymentLinksPath: e.target.value }))} />
                          <p className="mt-1 text-xs text-slate-500">
                            {copy.beam.field.paymentLinksPathHint}
                          </p>
                        </div>
                        <div>
                          <Label>{copy.beam.field.chargeStatusPathTemplate}</Label>
                          <Input value={beamProviderForm.chargeStatusPathTemplate} onChange={(e) => setBeamProviderForm((prev) => ({ ...prev, chargeStatusPathTemplate: e.target.value }))} />
                          <p className="mt-1 text-xs text-slate-500">
                            {copy.beam.field.chargeStatusPathTemplateHint}
                          </p>
                        </div>
                        <div>
                          <Label>{copy.beam.field.paymentLinkStatusPathTemplate}</Label>
                          <Input value={beamProviderForm.paymentLinkStatusPathTemplate} onChange={(e) => setBeamProviderForm((prev) => ({ ...prev, paymentLinkStatusPathTemplate: e.target.value }))} />
                          <p className="mt-1 text-xs text-slate-500">
                            {copy.beam.field.paymentLinkStatusPathTemplateHint}
                          </p>
                        </div>
                        <div>
                          <Label>{copy.beam.field.cancelPathSuffix}</Label>
                          <Input value={beamProviderForm.cancelPathSuffix} onChange={(e) => setBeamProviderForm((prev) => ({ ...prev, cancelPathSuffix: e.target.value }))} />
                          <p className="mt-1 text-xs text-slate-500">
                            {copy.beam.field.cancelPathSuffixHint}
                          </p>
                        </div>
                        <div>
                          <Label>{copy.beam.field.setupApiPath}</Label>
                          <Input value={beamProviderForm.paymentMethodSetupPath} onChange={(e) => setBeamProviderForm((prev) => ({ ...prev, paymentMethodSetupPath: e.target.value }))} />
                          <p className="mt-1 text-xs text-slate-500">
                            {copy.beam.field.setupApiPathHint}
                          </p>
                        </div>
                        <div className="md:col-span-2">
                          <Label>{copy.beam.field.hostedSetupUrlTemplate}</Label>
                          <Input value={beamProviderForm.paymentMethodSetupHostedUrlTemplate} onChange={(e) => setBeamProviderForm((prev) => ({ ...prev, paymentMethodSetupHostedUrlTemplate: e.target.value }))} placeholder="https://beam.example/setup?session={sessionId}&return={returnUrl}" />
                          <p className="mt-1 text-xs text-slate-500">
                            {copy.beam.field.hostedSetupUrlTemplateHint}
                          </p>
                        </div>
                        <div className="md:col-span-2">
                          <Label>{copy.beam.field.setupReturnUrl}</Label>
                          <Input value={beamProviderForm.paymentMethodSetupReturnUrl} onChange={(e) => setBeamProviderForm((prev) => ({ ...prev, paymentMethodSetupReturnUrl: e.target.value }))} placeholder="https://app.example/billing" />
                          <p className="mt-1 text-xs text-slate-500">
                            {copy.beam.field.setupReturnUrlHint}
                          </p>
                        </div>
                        <div>
                          <Label>{copy.beam.field.webhookSecretCurrent}</Label>
                          <Input type={showBeamSecrets ? "text" : "password"} value={beamProviderForm.webhookSecretCurrent} onChange={(e) => setBeamProviderForm((prev) => ({ ...prev, webhookSecretCurrent: e.target.value }))} placeholder={beamProviderSettingsQuery.data?.webhookSecretCurrentConfigured ? copy.beam.field.webhookSecretCurrentKeep : copy.beam.field.webhookSecretCurrentEnter} />
                          <p className="mt-1 text-xs text-slate-500">
                            {copy.beam.field.webhookSecretCurrentHint}
                          </p>
                        </div>
                        <div>
                          <Label>{copy.beam.field.webhookSecretPrevious}</Label>
                          <Input type={showBeamSecrets ? "text" : "password"} value={beamProviderForm.webhookSecretPrevious} onChange={(e) => setBeamProviderForm((prev) => ({ ...prev, webhookSecretPrevious: e.target.value }))} placeholder={beamProviderSettingsQuery.data?.webhookSecretPreviousConfigured ? copy.beam.field.webhookSecretPreviousKeep : copy.beam.field.optional} />
                          <p className="mt-1 text-xs text-slate-500">
                            {copy.beam.field.webhookSecretPreviousHint}
                          </p>
                        </div>
                        <div>
                          <Label>{copy.beam.field.setupCallbackSecretCurrent}</Label>
                          <Input type={showBeamSecrets ? "text" : "password"} value={beamProviderForm.paymentMethodSetupCallbackSecretCurrent} onChange={(e) => setBeamProviderForm((prev) => ({ ...prev, paymentMethodSetupCallbackSecretCurrent: e.target.value }))} placeholder={beamProviderSettingsQuery.data?.paymentMethodSetupCallbackSecretCurrentConfigured ? copy.beam.field.setupCallbackSecretCurrentKeep : copy.beam.field.setupCallbackSecretCurrentEnter} />
                          <p className="mt-1 text-xs text-slate-500">
                            {copy.beam.field.setupCallbackSecretCurrentHint}
                          </p>
                        </div>
                        <div>
                          <Label>{copy.beam.field.setupCallbackSecretPrevious}</Label>
                          <Input type={showBeamSecrets ? "text" : "password"} value={beamProviderForm.paymentMethodSetupCallbackSecretPrevious} onChange={(e) => setBeamProviderForm((prev) => ({ ...prev, paymentMethodSetupCallbackSecretPrevious: e.target.value }))} placeholder={beamProviderSettingsQuery.data?.paymentMethodSetupCallbackSecretPreviousConfigured ? copy.beam.field.setupCallbackSecretPreviousKeep : copy.beam.field.optional} />
                          <p className="mt-1 text-xs text-slate-500">
                            {copy.beam.field.setupCallbackSecretPreviousHint}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <div className="text-sm text-slate-600">
                          {copy.beam.gatewayNotice}
                        </div>
                        <Button type="button" variant="outline" onClick={() => setShowBeamSecrets((v) => !v)}>
                          {showBeamSecrets ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
                          {showBeamSecrets ? copy.beam.hideSecrets : copy.beam.showSecrets}
                        </Button>
                      </div>

                      <div className="flex gap-3 pt-4 border-t">
                        <Button onClick={handleSaveBeam} disabled={updateBeamProviderSettingsMutation.isPending}>
                          {updateBeamProviderSettingsMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                          {copy.beam.saveGateway}
                        </Button>
                        <Button variant="outline" onClick={() => beamProviderHealthQuery.refetch()} disabled={beamProviderHealthQuery.isFetching}>
                          {beamProviderHealthQuery.isFetching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <TestTube className="w-4 h-4 mr-2" />}
                          {copy.beam.refreshHealth}
                        </Button>
                      </div>
                    </DashboardCard>

                    <DashboardCard
                      className="overflow-hidden"
                      leading={<Zap className="w-5 h-5 text-cyan-600" />}
                      title={copy.beam.runtimeTitle}
                      description={copy.beam.runtimeDesc}
                      bodyClassName="space-y-6"
                    >
                      <div className="grid gap-3 md:grid-cols-2">
                        {[
                          "PAYMENT_RECONCILIATION_ENABLED",
                          "FINAL_RECONCILIATION_BEFORE_DOWNGRADE",
                          "AUTO_DOWNGRADE_AFTER_7_DAYS",
                          "INVOICE_HEADER_SYNC_ENABLED",
                          "PAID_INVOICE_REISSUE_ENABLED",
                          "BILLING_PHASE2_SAVED_CARDS_ENABLED",
                          "BILLING_PHASE2_AUTO_RENEW_ENABLED",
                          "BILLING_PHASE2_DUNNING_ENABLED",
                          "BILLING_PHASE2_CARD_SETUP_ENABLED",
                          "BILLING_PHASE2_FORCE_MANUAL_FALLBACK_ENABLED",
                          "BILLING_EMAIL_NOTIFICATIONS_ENABLED",
                          "BILLING_PHASE2_REQUIRE_STEP_UP",
                          "SUPPORT_RECOVERY_CASES_ENABLED",
                          "DOCUMENT_RECOVERY_ENABLED",
                          "BILLING_SUBSCRIPTION_CUTOVER_READY",
                        ].map((key) => (
                          <div key={key} className="flex items-center justify-between rounded-xl border border-slate-200 p-3">
                            <div className="pr-3">
                              <div className="text-sm font-medium text-slate-900">{copy.beam.runtimeLabels[key as keyof typeof copy.beam.runtimeLabels]}</div>
                              <div className="text-xs text-slate-500">{key}</div>
                            </div>
                            <Switch
                              checked={Boolean(beamRuntimeForm[key as keyof BeamRuntimeForm])}
                              onCheckedChange={(checked) =>
                                setBeamRuntimeForm((prev) => ({ ...prev, [key]: checked }))
                              }
                            />
                          </div>
                        ))}
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <Label>{copy.beam.runtimeFields.allowedCohorts}</Label>
                          <Input value={beamRuntimeForm.BILLING_PHASE2_ALLOWED_COHORTS} onChange={(e) => setBeamRuntimeForm((prev) => ({ ...prev, BILLING_PHASE2_ALLOWED_COHORTS: e.target.value }))} placeholder="pilot-a,pilot-b" />
                        </div>
                        <div>
                          <Label>{copy.beam.runtimeFields.defaultCohort}</Label>
                          <Input value={beamRuntimeForm.BILLING_PHASE2_DEFAULT_COHORT} onChange={(e) => setBeamRuntimeForm((prev) => ({ ...prev, BILLING_PHASE2_DEFAULT_COHORT: e.target.value }))} placeholder="pilot-a" />
                        </div>
                        <div>
                          <Label>{copy.beam.runtimeFields.billingPublicUrl}</Label>
                          <Input value={beamRuntimeForm.BILLING_PUBLIC_URL} onChange={(e) => setBeamRuntimeForm((prev) => ({ ...prev, BILLING_PUBLIC_URL: e.target.value }))} placeholder="https://app.example" />
                        </div>
                        <div>
                          <Label>{copy.beam.runtimeFields.stepUpSharedSecret}</Label>
                          <Input type={showBeamSecrets ? "text" : "password"} value={beamRuntimeForm.BILLING_PHASE2_STEP_UP_SECRET} onChange={(e) => setBeamRuntimeForm((prev) => ({ ...prev, BILLING_PHASE2_STEP_UP_SECRET: e.target.value }))} placeholder={billingRuntimeSettingsQuery.data?.BILLING_PHASE2_STEP_UP_SECRETConfigured ? copy.beam.runtimeFields.stepUpSharedSecretKeep : copy.beam.runtimeFields.stepUpSharedSecretEnter} />
                        </div>
                        <div>
                          <Label>{copy.beam.runtimeFields.setupCallbackToleranceSeconds}</Label>
                          <Input value={beamRuntimeForm.BILLING_PHASE2_SETUP_CALLBACK_TOLERANCE_SECONDS} onChange={(e) => setBeamRuntimeForm((prev) => ({ ...prev, BILLING_PHASE2_SETUP_CALLBACK_TOLERANCE_SECONDS: e.target.value }))} />
                        </div>
                        <div>
                          <Label>{copy.beam.runtimeFields.webhookTimestampToleranceSeconds}</Label>
                          <Input value={beamRuntimeForm.BILLING_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS} onChange={(e) => setBeamRuntimeForm((prev) => ({ ...prev, BILLING_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS: e.target.value }))} />
                        </div>
                        <div>
                          <Label>{copy.beam.runtimeFields.paymentMethodSetupExpiryMinutes}</Label>
                          <Input value={beamRuntimeForm.BILLING_PAYMENT_METHOD_SETUP_EXPIRY_MINUTES} onChange={(e) => setBeamRuntimeForm((prev) => ({ ...prev, BILLING_PAYMENT_METHOD_SETUP_EXPIRY_MINUTES: e.target.value }))} />
                        </div>
                        <div>
                          <Label>{copy.beam.runtimeFields.stepUpWindowMinutes}</Label>
                          <Input value={beamRuntimeForm.BILLING_PHASE2_STEP_UP_WINDOW_MINUTES} onChange={(e) => setBeamRuntimeForm((prev) => ({ ...prev, BILLING_PHASE2_STEP_UP_WINDOW_MINUTES: e.target.value }))} />
                        </div>
                        <div>
                          <Label>{copy.beam.runtimeFields.evidenceRetentionDays}</Label>
                          <Input value={beamRuntimeForm.BILLING_EVIDENCE_RETENTION_DAYS} onChange={(e) => setBeamRuntimeForm((prev) => ({ ...prev, BILLING_EVIDENCE_RETENTION_DAYS: e.target.value }))} />
                        </div>
                        <div>
                          <Label>{copy.beam.runtimeFields.overdueDays}</Label>
                          <Input value={beamRuntimeForm.BILLING_OVERDUE_DAYS} onChange={(e) => setBeamRuntimeForm((prev) => ({ ...prev, BILLING_OVERDUE_DAYS: e.target.value }))} />
                        </div>
                        <div>
                          <Label>{copy.beam.runtimeFields.subscriptionRenewalDueDays}</Label>
                          <Input value={beamRuntimeForm.BILLING_SUBSCRIPTION_RENEWAL_DUE_DAYS} onChange={(e) => setBeamRuntimeForm((prev) => ({ ...prev, BILLING_SUBSCRIPTION_RENEWAL_DUE_DAYS: e.target.value }))} />
                        </div>
                        <div>
                          <Label>{copy.beam.runtimeFields.topupDueDays}</Label>
                          <Input value={beamRuntimeForm.BILLING_TOPUP_DUE_DAYS} onChange={(e) => setBeamRuntimeForm((prev) => ({ ...prev, BILLING_TOPUP_DUE_DAYS: e.target.value }))} />
                        </div>
                        <div>
                          <Label>{copy.beam.runtimeFields.reminderFirstThresholdDays}</Label>
                          <Input value={beamRuntimeForm.BILLING_NOTIFICATION_REMINDER_FIRST_THRESHOLD_DAYS} onChange={(e) => setBeamRuntimeForm((prev) => ({ ...prev, BILLING_NOTIFICATION_REMINDER_FIRST_THRESHOLD_DAYS: e.target.value }))} />
                        </div>
                        <div>
                          <Label>{copy.beam.runtimeFields.reminderFinalThresholdDays}</Label>
                          <Input value={beamRuntimeForm.BILLING_NOTIFICATION_REMINDER_FINAL_THRESHOLD_DAYS} onChange={(e) => setBeamRuntimeForm((prev) => ({ ...prev, BILLING_NOTIFICATION_REMINDER_FINAL_THRESHOLD_DAYS: e.target.value }))} />
                        </div>
                        <div>
                          <Label>{copy.beam.runtimeFields.reminderCooldownHours}</Label>
                          <Input value={beamRuntimeForm.BILLING_NOTIFICATION_COOLDOWN_REMINDER_HOURS} onChange={(e) => setBeamRuntimeForm((prev) => ({ ...prev, BILLING_NOTIFICATION_COOLDOWN_REMINDER_HOURS: e.target.value }))} />
                        </div>
                        <div>
                          <Label>{copy.beam.runtimeFields.successCooldownHours}</Label>
                          <Input value={beamRuntimeForm.BILLING_NOTIFICATION_COOLDOWN_SUCCESS_HOURS} onChange={(e) => setBeamRuntimeForm((prev) => ({ ...prev, BILLING_NOTIFICATION_COOLDOWN_SUCCESS_HOURS: e.target.value }))} />
                        </div>
                        <div>
                          <Label>{copy.beam.runtimeFields.defaultCooldownHours}</Label>
                          <Input value={beamRuntimeForm.BILLING_NOTIFICATION_COOLDOWN_DEFAULT_HOURS} onChange={(e) => setBeamRuntimeForm((prev) => ({ ...prev, BILLING_NOTIFICATION_COOLDOWN_DEFAULT_HOURS: e.target.value }))} />
                        </div>
                      </div>

                      <div className="rounded-xl border border-cyan-100 bg-cyan-50/70 p-4 text-sm text-slate-700">
                        <div className="font-medium text-slate-900">{copy.beam.runtimeSummary}</div>
                        <div className="mt-2">{copy.beam.runtimeValues.savedCards}: {beamRuntimeForm.BILLING_PHASE2_SAVED_CARDS_ENABLED ? copy.providerSwitch.enabled : copy.providerSwitch.disabled}</div>
                        <div>{copy.beam.runtimeValues.autoRenew}: {beamRuntimeForm.BILLING_PHASE2_AUTO_RENEW_ENABLED ? copy.providerSwitch.enabled : copy.providerSwitch.disabled}</div>
                        <div>{copy.beam.runtimeValues.dunning}: {beamRuntimeForm.BILLING_PHASE2_DUNNING_ENABLED ? copy.providerSwitch.enabled : copy.providerSwitch.disabled}</div>
                        <div>{copy.beam.runtimeValues.cardSetup}: {beamRuntimeForm.BILLING_PHASE2_CARD_SETUP_ENABLED ? copy.providerSwitch.enabled : copy.providerSwitch.disabled}</div>
                        <div>{copy.beam.runtimeValues.supportRecovery}: {beamRuntimeForm.SUPPORT_RECOVERY_CASES_ENABLED ? copy.providerSwitch.enabled : copy.providerSwitch.disabled}</div>
                      </div>

                      <div className="flex gap-3 pt-4 border-t">
                        <Button onClick={handleSaveBeamRuntime} disabled={updateBillingProviderMutation.isPending}>
                          {updateBillingProviderMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                          {copy.beam.saveRuntime}
                        </Button>
                        <Button variant="outline" onClick={() => setLocation("/admin/billing")}>
                          {copy.beam.openBillingConsole}
                        </Button>
                      </div>
                    </DashboardCard>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
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

                  <div className="grid gap-3 md:grid-cols-3">
                    {[
                      {
                        title: "Web sign-in",
                        ready: googleLoginReady,
                        description: googleLoginReady
                          ? "Ready for Sign in with Google on the web login page."
                          : "Requires Client ID, Client Secret, and Login Redirect URI.",
                      },
                      {
                        title: "Desktop via browser",
                        ready: googleLoginReady,
                        description: googleLoginReady
                          ? "Ready. Desktop users can choose Sign in via browser and finish Google sign-in in the web flow."
                          : "Not ready until web Google sign-in is fully configured.",
                      },
                      {
                        title: "Desktop direct login",
                        ready: false,
                        description: "Not supported for Google social-login accounts. Keep this disabled and instruct users to use browser sign-in.",
                      },
                    ].map((item) => (
                      <div key={item.title} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                          <Badge
                            variant="outline"
                            className={item.ready
                              ? "border-emerald-200 bg-white text-emerald-700"
                              : "border-amber-200 bg-white text-amber-700"}
                          >
                            {item.ready ? "Ready" : "Not ready"}
                          </Badge>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-slate-600">{item.description}</p>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    <p className="font-semibold">Admin rollout notes</p>
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-amber-800">
                      <li>Web sign-in and desktop browser sign-in share the same Google Client ID and Client Secret.</li>
                      <li>Desktop direct login must stay disabled for Google accounts. Tell users to choose <strong>Sign in via browser</strong>.</li>
                      <li>{googleDriveReady ? "Google Drive redirect is configured for Drive/Docs integration." : "Google Drive features stay disabled until the Google Drive Redirect URI is also configured."}</li>
                      <li>If your OAuth consent screen is still in Testing, add every admin/test user email before validating the flow.</li>
                    </ul>
                  </div>

                  <details className="mt-4 group">
                    <summary className="cursor-pointer flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-100 transition-colors">
                      <Info className="w-4 h-4" />
                      Setup Guide: How to create Google OAuth credentials
                      <ChevronLeft className="w-4 h-4 transition-transform group-open:-rotate-90" />
                    </summary>
                    <div className="mt-3 p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <div className="text-sm text-blue-900 dark:text-blue-100 space-y-4">
                        <div className="p-3 rounded-md bg-blue-100/50 dark:bg-blue-900/30">
                          <p className="font-semibold">What this enables</p>
                          <ul className="mt-1 list-disc space-y-1 pl-4 text-blue-700 dark:text-blue-300">
                            <li><strong>Web sign-in</strong> for Google login on the standard login page.</li>
                            <li><strong>Desktop browser sign-in</strong> because desktop authorization reuses the same web Google flow.</li>
                            <li><strong>Google Drive / Docs / Sheets / Slides integration</strong> when the Drive redirect URI is also configured.</li>
                          </ul>
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
                            In your project, go to <strong>APIs & Services &gt; Library</strong> and enable the APIs you plan to use:
                          </p>
                          <ul className="list-disc list-inside mt-1 space-y-0.5 text-blue-700 dark:text-blue-300 ml-2">
                            <li><strong>Google Drive API</strong> for Drive integration</li>
                            <li><strong>Google Docs API</strong> for document editing</li>
                            <li><strong>Google Sheets API</strong> for spreadsheet editing</li>
                            <li><strong>Google Slides API</strong> for presentation editing</li>
                          </ul>
                          <p className="text-blue-600 dark:text-blue-400 text-xs mt-1">
                            For login-only setups, the Drive/Docs/Sheets/Slides APIs can be skipped.
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
                            <li>Add scopes: <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded text-xs">openid</code>, <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded text-xs">email</code>, <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded text-xs">profile</code> for sign-in, and <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded text-xs">drive.readonly</code> plus <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded text-xs">drive.file</code> for Drive integration.</li>
                            <li>Add test users if in Testing status. Desktop browser sign-in uses the same consent screen as the web flow.</li>
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
                            <li>Authorized JavaScript origins: your production web origin, for example <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded text-xs font-mono">https://smartaihub.app</code></li>
                            <li>
                              Authorized redirect URIs &mdash; add these exact URLs:
                              <div className="ml-4 mt-1 space-y-1">
                                <div className="flex items-start gap-2">
                                  <code className="block bg-blue-100 dark:bg-blue-900 px-2 py-1 rounded text-xs font-mono">
                                    {oauthForm.googleRedirectUri || "https://smartaihub.app/auth/callback/google"}
                                  </code>
                                  <span className="text-xs text-blue-600 dark:text-blue-400 mt-0.5 whitespace-nowrap">&larr; web sign-in + desktop browser sign-in</span>
                                </div>
                                <div className="flex items-start gap-2">
                                  <code className="block bg-blue-100 dark:bg-blue-900 px-2 py-1 rounded text-xs font-mono">
                                    {oauthForm.googleDriveRedirectUri || "https://smartaihub.app/auth/callback/google-drive"}
                                  </code>
                                  <span className="text-xs text-blue-600 dark:text-blue-400 mt-0.5 whitespace-nowrap">&larr; Google Drive integration</span>
                                </div>
                              </div>
                            </li>
                          </ul>
                        </div>

                        {/* Step 5 */}
                        <div>
                          <p className="font-semibold">Step 5: Copy credentials here</p>
                          <p className="text-blue-700 dark:text-blue-300 mt-1">
                            Copy the <strong>Client ID</strong> and <strong>Client Secret</strong> from Google Cloud Console and paste them in the fields above. Then click <strong>Save OAuth Settings</strong>.
                          </p>
                        </div>

                        <div>
                          <p className="font-semibold">Step 6: Validate both web and desktop browser flows</p>
                          <ul className="list-disc list-inside mt-1 space-y-0.5 text-blue-700 dark:text-blue-300 ml-2">
                            <li>Click <strong>Test Google Connection</strong> below after saving.</li>
                            <li>Open the web login page and confirm the Google button is enabled.</li>
                            <li>If you support desktop users, confirm the desktop app uses <strong>Sign in via browser</strong> for Google accounts.</li>
                            <li>If Google returns <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded text-xs">redirect_uri_mismatch</code>, compare the URI in Google Cloud Console with the exact URI shown in this page.</li>
                          </ul>
                        </div>

                        <div className="pt-2 border-t border-blue-200 dark:border-blue-700 space-y-1">
                          <p className="text-blue-600 dark:text-blue-400 text-xs flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            Client Secret is encrypted before storage. It will not be shown after saving.
                          </p>
                          <p className="text-blue-600 dark:text-blue-400 text-xs flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            Desktop direct login should remain disabled for Google social accounts; only the browser/device-code path is supported.
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
              title={copy.sms.title}
              description={copy.sms.description}
              bodyClassName="space-y-6"
            >
                {smsSettings?.configured && (
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    <Check className="w-3 h-3 mr-1" /> {copy.sms.configured}
                  </Badge>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>{copy.sms.provider}</Label>
                    <select
                      value={smsForm.provider}
                      onChange={(e) => setSmsForm((p) => ({ ...p, provider: e.target.value as "twilio" | "vonage" }))}
                      className="mt-1 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:ring-blue-400"
                    >
                      <option value="twilio">{copy.sms.twilio}</option>
                      <option value="vonage">{copy.sms.vonage}</option>
                    </select>
                  </div>
                  <div>
                    <Label>{smsForm.provider === "twilio" ? copy.sms.accountSid : copy.sms.apiKey}</Label>
                    <Input
                      placeholder={smsForm.provider === "twilio" ? "ACxxxxxxxxxxxxxxxx" : "API Key"}
                      value={smsForm.accountSid}
                      onChange={(e) => setSmsForm((p) => ({ ...p, accountSid: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>{smsForm.provider === "twilio" ? copy.sms.authToken : copy.sms.apiSecret}</Label>
                    <Input
                      type="password"
                      placeholder={smsSettings?.configured ? copy.sms.secretPlaceholderKeep : copy.sms.secretPlaceholderNew}
                      value={smsForm.authToken}
                      onChange={(e) => setSmsForm((p) => ({ ...p, authToken: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>{copy.sms.fromLabel}</Label>
                    <Input
                      placeholder={copy.sms.fromPlaceholder}
                      value={smsForm.fromNumber}
                      onChange={(e) => setSmsForm((p) => ({ ...p, fromNumber: e.target.value }))}
                      className="mt-1"
                    />
                    <p className="mt-2 text-xs text-gray-500">{copy.sms.fromHint}</p>
                  </div>
                </div>

                {/* Test SMS */}
                <div className="rounded-lg border border-gray-200 p-4">
                  <Label className="mb-2 block">{copy.sms.testLabel}</Label>
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
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {copy.sms.sending}</>
                      ) : (
                        <><TestTube className="w-4 h-4 mr-2" /> {copy.sms.sendTest}</>
                      )}
                    </Button>
                  </div>
                </div>

                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="mt-0.5 h-4 w-4 text-amber-700" />
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-amber-900">{copy.sms.recommendedTitle}</p>
                      <p className="text-sm text-amber-800">{copy.sms.recommendedBody}</p>
                    </div>
                  </div>
                </div>

                {/* Provider guide */}
                <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 text-sm space-y-4">
                  <div className="space-y-2">
                    <p className="font-semibold text-blue-800">
                      {smsForm.provider === "twilio" ? copy.sms.twilioGuideTitle : copy.sms.vonageGuideTitle}
                    </p>
                    {smsForm.provider === "twilio" && (
                      <div className="space-y-3">
                        <p className="text-sm text-blue-800">{copy.sms.twilioGuideIntro}</p>
                        <a
                          href="https://www.twilio.com/console"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 rounded-md border border-blue-300 bg-white px-3 py-2 text-xs font-medium text-blue-700 transition hover:bg-blue-100"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          {copy.sms.twilioConsole}
                        </a>
                      </div>
                    )}
                  </div>
                  {smsForm.provider === "twilio" ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <p className="font-medium text-blue-900">{copy.sms.docsTitle}</p>
                        <ul className="mt-2 text-blue-700 space-y-1 text-xs list-disc pl-4">
                          {copy.sms.docsItems.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="font-medium text-blue-900">{copy.sms.requestTitle}</p>
                        <ul className="mt-2 text-blue-700 space-y-1 text-xs list-disc pl-4">
                          {copy.sms.requestItems.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="font-medium text-blue-900">{copy.sms.conditionsTitle}</p>
                        <ul className="mt-2 text-blue-700 space-y-1 text-xs list-disc pl-4">
                          {copy.sms.conditionsItems.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="font-medium text-blue-900">{copy.sms.checklistTitle}</p>
                        <ul className="mt-2 text-blue-700 space-y-1 text-xs list-disc pl-4">
                          {copy.sms.checklistItems.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ) : (
                    <ul className="text-blue-700 space-y-1 text-xs list-disc pl-4">
                      {copy.sms.vonageGuideItems.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
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
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {copy.sms.saving}</>
                    ) : (
                      <><Save className="w-4 h-4 mr-2" /> {copy.sms.save}</>
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

                <div className="grid gap-3 md:grid-cols-3">
                  {[
                    {
                      title: "Web sign-in",
                      ready: twoFaWebReady,
                      description: twoFaWebReady
                        ? "Ready. Users can complete password or Google/GitHub sign-in and then enter a TOTP code."
                        : "Disabled until Allow 2FA is turned on.",
                    },
                    {
                      title: "Desktop via browser",
                      ready: twoFaDesktopBrowserReady,
                      description: twoFaDesktopBrowserReady
                        ? "Ready. Desktop authorization finishes in the browser, so the same 2FA prompt is supported."
                        : "Disabled until web 2FA is enabled.",
                    },
                    {
                      title: "Desktop direct login",
                      ready: false,
                      description: "Not supported for 2FA accounts. Users must choose Sign in via browser in the desktop app.",
                    },
                  ].map((item) => (
                    <div key={item.title} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                        <Badge
                          variant="outline"
                          className={item.ready
                            ? "border-emerald-200 bg-white text-emerald-700"
                            : "border-amber-200 bg-white text-amber-700"}
                        >
                          {item.ready ? "Ready" : "Not ready"}
                        </Badge>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-slate-600">{item.description}</p>
                    </div>
                  ))}
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

                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <p className="font-semibold">Recommended admin procedure</p>
                  <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-amber-800">
                    <li>Turn on <strong>Allow 2FA</strong> first and test with one internal account on the web login page.</li>
                    <li>Confirm recovery email or SMS is configured before you enforce 2FA broadly.</li>
                    <li>If you use Google sign-in, test an account end-to-end to confirm the OAuth flow redirects into the 2FA prompt correctly.</li>
                    <li>Tell desktop users that <strong>Sign in via browser</strong> is the required path for any account protected by 2FA.</li>
                    <li>Only then enable <strong>Enforce 2FA for all users</strong>.</li>
                  </ol>
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

          {/* Document OCR Settings Tab */}
          <TabsContent value="document_ocr">
            <DocumentOcrSettingsPanel />
          </TabsContent>

          <TabsContent value="mcp_connect">
            <McpProviderConfigPanel />
          </TabsContent>

          {/* Finance Rules Settings Tab */}
          <TabsContent value="finance_rules">
            <DashboardCard
              className="overflow-hidden"
              leading={<CheckSquare className="w-5 h-5 text-blue-600" />}
              title="Finance Rules"
              description="Merchant pins and slip presets are managed on a separate page so you can search existing merchants without mixing the flow into OCR routing."
              bodyClassName="space-y-4 p-6"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-semibold text-slate-900">Merchant pins</div>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    Pin important merchants from the system merchant list, then let Finance suggest them first.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-semibold text-slate-900">Slip mapping presets</div>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    Reuse rules for common income, expense, and transfer slips after OCR or LLM parsing.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
                  Search existing merchants
                </Badge>
                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                  One-click pins
                </Badge>
                <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                  Separate from OCR routing
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button className="gap-2" onClick={() => setLocation("/admin/finance-rules")}>
                  <CheckSquare className="h-4 w-4" />
                  Open full page
                </Button>
              </div>
              <div className="rounded-xl border border-dashed border-slate-300 bg-white/80 p-4 text-xs text-slate-600">
                OCR routing stays on the Document OCR tab. This page is just for merchant pin search and slip mapping rules.
              </div>
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
