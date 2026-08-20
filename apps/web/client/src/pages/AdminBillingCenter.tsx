import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  BadgeDollarSign,
  Download,
  ExternalLink,
  FileText,
  ImageIcon,
  Loader2,
  Maximize2,
  Mail,
  Package,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  ShieldAlert,
  Ticket,
  Trash2,
  UserRound,
  Wallet,
  X,
} from "lucide-react";

import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { DashboardCard, DashboardKpiCard } from "@/components/dashboard";

function formatMoney(value: unknown, currency = "THB") {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatDateTime(value: unknown) {
  if (!value) return "-";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function formatDateInputValue(value: string | Date | null | undefined, fallback: string): string {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? fallback
    : date.toISOString().slice(0, 10);
}

function toDateMillis(value: string | Date | null | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

function statusClass(status: string | null | undefined) {
  switch (status) {
    case "paid":
    case "sent":
    case "fixed":
      return "bg-emerald-100 text-emerald-800";
    case "payment_pending":
    case "issued":
    case "pending":
    case "pending_provider_creation":
      return "bg-amber-100 text-amber-800";
    case "canceled_overdue":
    case "manual_review_required":
    case "failed":
    case "suppressed":
      return "bg-rose-100 text-rose-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function formatQuantity(value: unknown) {
  const quantity = Number(value ?? 0);
  return Number.isFinite(quantity)
    ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(quantity)
    : String(value ?? "-");
}

function formatFileSize(value: unknown) {
  const bytes = Number(value ?? 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getAuditActionLabel(action: string) {
  const labels: Record<string, string> = {
    promptpay_direct_order_created: "สร้างรายการ PromptPay",
    promptpay_slip_submitted: "อัปโหลดสลิป",
    promptpay_payment_approved: "อนุมัติการชำระเงิน",
    promptpay_slip_rejected: "ปฏิเสธสลิป",
    payment_status_changed: "เปลี่ยนสถานะการชำระเงิน",
    invoice_status_changed: "เปลี่ยนสถานะ Invoice",
  };
  return labels[action] ?? action.replaceAll("_", " ");
}

function getAuditPaymentId(afterJson: unknown) {
  if (!afterJson || typeof afterJson !== "object") return null;
  const paymentId = (afterJson as Record<string, unknown>).paymentId;
  return typeof paymentId === "number" ? paymentId : null;
}

function getSourceUsdAmount(invoice: { totalsSnapshotJson?: unknown }, payments: Array<{ sourceAmountUsd?: unknown }>) {
  const paymentSource = payments.find((payment) => payment.sourceAmountUsd != null)?.sourceAmountUsd;
  if (paymentSource != null) return paymentSource;
  if (invoice.totalsSnapshotJson && typeof invoice.totalsSnapshotJson === "object") {
    return (invoice.totalsSnapshotJson as Record<string, unknown>).sourceAmountUsd ?? null;
  }
  return null;
}

function getLineItemMetaLabel(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const metadata = value as Record<string, unknown>;
  return [metadata.packageCode, metadata.credits ? `${metadata.credits} credits` : null, metadata.planCode]
    .filter(Boolean)
    .join(" · ") || null;
}

function renderJsonSummary(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) {
    return null;
  }
  return (
    <div className="mt-2 space-y-2">
      {entries.map(([key, nextValue]) => (
        <div key={key} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{key}</div>
          <pre className="mt-1 overflow-auto text-xs text-slate-700">{JSON.stringify(nextValue, null, 2)}</pre>
        </div>
      ))}
    </div>
  );
}

type SellerProfileForm = {
  entityNameTh: string;
  entityNameEn: string;
  taxId: string;
  phone: string;
  email: string;
  addressLine1: string;
  addressLine2: string;
  subdistrict: string;
  district: string;
  province: string;
  postalCode: string;
  country: string;
  signerName: string;
  signerTitle: string;
  branchType: string;
  footerNoteTh: string;
  footerNoteEn: string;
  autoGeneratedDocumentNoteTh: string;
  autoGeneratedDocumentNoteEn: string;
  logoUrl: string;
};

type TaxPolicyForm = {
  taxName: string;
  taxRatePercent: string;
  isEnabled: boolean;
  effectiveFrom: string;
  roundingPolicy: string;
};

type BeamProviderForm = {
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
};

type BillingRuntimeForm = {
  PAYMENT_RECONCILIATION_ENABLED: boolean;
  FINAL_RECONCILIATION_BEFORE_DOWNGRADE: boolean;
  ADMIN_MANUAL_MARK_PAID_ENABLED: boolean;
  ADMIN_DOWNGRADE_REVERSAL_ENABLED: boolean;
  SUPPORT_RECOVERY_CASES_ENABLED: boolean;
  DOCUMENT_RECOVERY_ENABLED: boolean;
  INVOICE_HEADER_SYNC_ENABLED: boolean;
  PAID_INVOICE_REISSUE_ENABLED: boolean;
  AUTO_DOWNGRADE_AFTER_7_DAYS: boolean;
  BEAM_PAYMENT_LINK_FALLBACK: boolean;
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
  BILLING_TOPUP_PENDING_RETENTION_DAYS: string;
  BILLING_NOTIFICATION_REMINDER_FIRST_THRESHOLD_DAYS: string;
  BILLING_NOTIFICATION_REMINDER_FINAL_THRESHOLD_DAYS: string;
  BILLING_NOTIFICATION_COOLDOWN_REMINDER_HOURS: string;
  BILLING_NOTIFICATION_COOLDOWN_SUCCESS_HOURS: string;
  BILLING_NOTIFICATION_COOLDOWN_DEFAULT_HOURS: string;
  BILLING_SUBSCRIPTION_CUTOVER_READY: boolean;
  BILLING_PUBLIC_URL: string;
  BILLING_PHASE2_STEP_UP_SECRET: string;
  PROMPTPAY_DIRECT_ENABLED: boolean;
  PROMPTPAY_DIRECT_RECIPIENT_ID: string;
  PROMPTPAY_DIRECT_RECIPIENT_TYPE: "phone" | "national_id" | "tax_id" | "ewallet";
  PROMPTPAY_DIRECT_ACCOUNT_DISPLAY_NAME: string;
  PROMPTPAY_DIRECT_ORDER_EXPIRY_MINUTES: string;
  PROMPTPAY_DIRECT_FX_PROVIDER: "frankfurter_daily";
  PROMPTPAY_DIRECT_FX_MAX_RATE_AGE_HOURS: string;
  PROMPTPAY_DIRECT_FX_SELL_SPREAD_BPS: string;
  PROMPTPAY_DIRECT_FX_RISK_BUFFER_BPS: string;
  PROMPTPAY_DIRECT_FX_ROUNDING_UNIT_THB: "1";
  PROMPTPAY_DIRECT_FX_SANITY_MIN_RATE: string;
  PROMPTPAY_DIRECT_FX_SANITY_MAX_RATE: string;
  PROMPTPAY_DIRECT_SLIP_MAX_BYTES: string;
  PROMPTPAY_DIRECT_SLIP_ALLOWED_TYPES: string;
};

type AdminBillingTaxPolicy = {
  id: number | null;
  stream: string;
  taxName: string | null;
  taxRatePercent: string | number | null;
  isEnabled: boolean;
  effectiveFrom: string | Date | null;
  effectiveTo: string | Date | null;
  roundingPolicy: string | null;
};

const EMPTY_SELLER_FORM: SellerProfileForm = {
  entityNameTh: "",
  entityNameEn: "",
  taxId: "",
  phone: "",
  email: "",
  addressLine1: "",
  addressLine2: "",
  subdistrict: "",
  district: "",
  province: "",
  postalCode: "",
  country: "Thailand",
  signerName: "",
  signerTitle: "",
  branchType: "สำนักงานใหญ่",
  footerNoteTh: "",
  footerNoteEn: "",
  autoGeneratedDocumentNoteTh: "",
  autoGeneratedDocumentNoteEn: "",
  logoUrl: "",
};

const EMPTY_TAX_FORM: TaxPolicyForm = {
  taxName: "VAT",
  taxRatePercent: "0",
  isEnabled: false,
  effectiveFrom: new Date().toISOString().slice(0, 10),
  roundingPolicy: "half_up_2dp",
};

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

const EMPTY_BILLING_RUNTIME_FORM: BillingRuntimeForm = {
  PAYMENT_RECONCILIATION_ENABLED: true,
  FINAL_RECONCILIATION_BEFORE_DOWNGRADE: true,
  ADMIN_MANUAL_MARK_PAID_ENABLED: true,
  ADMIN_DOWNGRADE_REVERSAL_ENABLED: true,
  SUPPORT_RECOVERY_CASES_ENABLED: true,
  DOCUMENT_RECOVERY_ENABLED: true,
  INVOICE_HEADER_SYNC_ENABLED: true,
  PAID_INVOICE_REISSUE_ENABLED: true,
  AUTO_DOWNGRADE_AFTER_7_DAYS: true,
  BEAM_PAYMENT_LINK_FALLBACK: true,
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
  BILLING_TOPUP_PENDING_RETENTION_DAYS: "15",
  BILLING_NOTIFICATION_REMINDER_FIRST_THRESHOLD_DAYS: "4",
  BILLING_NOTIFICATION_REMINDER_FINAL_THRESHOLD_DAYS: "1",
  BILLING_NOTIFICATION_COOLDOWN_REMINDER_HOURS: "12",
  BILLING_NOTIFICATION_COOLDOWN_SUCCESS_HOURS: "24",
  BILLING_NOTIFICATION_COOLDOWN_DEFAULT_HOURS: "1",
  BILLING_SUBSCRIPTION_CUTOVER_READY: false,
  BILLING_PUBLIC_URL: "https://smartaihub.app",
  BILLING_PHASE2_STEP_UP_SECRET: "",
  PROMPTPAY_DIRECT_ENABLED: false,
  PROMPTPAY_DIRECT_RECIPIENT_ID: "",
  PROMPTPAY_DIRECT_RECIPIENT_TYPE: "phone",
  PROMPTPAY_DIRECT_ACCOUNT_DISPLAY_NAME: "",
  PROMPTPAY_DIRECT_ORDER_EXPIRY_MINUTES: "60",
  PROMPTPAY_DIRECT_FX_PROVIDER: "frankfurter_daily",
  PROMPTPAY_DIRECT_FX_MAX_RATE_AGE_HOURS: "72",
  PROMPTPAY_DIRECT_FX_SELL_SPREAD_BPS: "200",
  PROMPTPAY_DIRECT_FX_RISK_BUFFER_BPS: "300",
  PROMPTPAY_DIRECT_FX_ROUNDING_UNIT_THB: "1",
  PROMPTPAY_DIRECT_FX_SANITY_MIN_RATE: "20",
  PROMPTPAY_DIRECT_FX_SANITY_MAX_RATE: "60",
  PROMPTPAY_DIRECT_SLIP_MAX_BYTES: "10485760",
  PROMPTPAY_DIRECT_SLIP_ALLOWED_TYPES: "application/pdf,image/png,image/jpeg,image/webp",
};

async function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export default function AdminBillingCenter() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("operations");
  const [search, setSearch] = useState("");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);
  const [manualPaidReason, setManualPaidReason] = useState("");
  const [recoveryReason, setRecoveryReason] = useState("");
  const [recoveryIssueType, setRecoveryIssueType] = useState("payment_not_applied");
  const [recoveryEvidenceNote, setRecoveryEvidenceNote] = useState("");
  const [notificationType, setNotificationType] = useState("invoice_due_reminder");
  const [documentLanguage, setDocumentLanguage] = useState<"th" | "en" | "bilingual">("th");
  const [syncScope, setSyncScope] = useState<"seller" | "buyer" | "both">("both");
  const [selectedRecoveryCaseId, setSelectedRecoveryCaseId] = useState<number | null>(null);
  const [sellerForm, setSellerForm] = useState<SellerProfileForm>(EMPTY_SELLER_FORM);
  const [domesticTaxForm, setDomesticTaxForm] = useState<TaxPolicyForm>({ ...EMPTY_TAX_FORM, taxRatePercent: "7" });
  const [internationalTaxForm, setInternationalTaxForm] = useState<TaxPolicyForm>({ ...EMPTY_TAX_FORM, taxName: "International Tax" });
  const [beamProviderForm, setBeamProviderForm] = useState<BeamProviderForm>(EMPTY_BEAM_PROVIDER_FORM);
  const [billingRuntimeForm, setBillingRuntimeForm] = useState<BillingRuntimeForm>(EMPTY_BILLING_RUNTIME_FORM);
  const [selectedPromptPayPaymentId, setSelectedPromptPayPaymentId] = useState<number | null>(null);
  const [promptPayPreviewSlipId, setPromptPayPreviewSlipId] = useState<number | null>(null);
  const [promptPayPreview, setPromptPayPreview] = useState<{
    url: string;
    mimeType: string;
    fileName: string;
  } | null>(null);
  const [promptPayPreviewLoading, setPromptPayPreviewLoading] = useState(false);
  const [promptPayFullscreen, setPromptPayFullscreen] = useState(false);
  const [promptPayRejectReason, setPromptPayRejectReason] = useState("");
  const [invoiceSlipPreview, setInvoiceSlipPreview] = useState<{
    slipId: number;
    url: string;
    mimeType: string;
    fileName: string;
  } | null>(null);
  const [invoiceSlipPreviewLoading, setInvoiceSlipPreviewLoading] = useState(false);
  const [renewalForm, setRenewalForm] = useState({
    subscriptionId: "",
    basePriceOverride: "",
    cycleStart: "",
    cycleEnd: "",
  });
  const utils = trpc.useUtils();

  const invoiceListQuery = trpc.adminBilling.listInvoices.useQuery({
    query: search || null,
    limit: 200,
  });
  const recoveryCasesQuery = trpc.adminBilling.listRecoveryCases.useQuery({
    invoiceId: selectedInvoiceId ?? null,
    limit: 20,
  });
  const selectedInvoiceQuery = trpc.adminBilling.getInvoiceAuditDetails.useQuery(
    { invoiceId: selectedInvoiceId ?? 0 },
    { enabled: !!selectedInvoiceId },
  );
  const documentsQuery = trpc.adminBilling.listInvoiceDocuments.useQuery(
    { invoiceId: selectedInvoiceId ?? 0 },
    { enabled: !!selectedInvoiceId },
  );
  const notificationDispatchesQuery = trpc.adminBilling.listNotificationDispatches.useQuery(
    { invoiceId: selectedInvoiceId ?? 0 },
    { enabled: !!selectedInvoiceId },
  );
  const paymentTimelineQuery = trpc.adminBilling.listInvoicePayments.useQuery(
    { invoiceId: selectedInvoiceId ?? 0 },
    { enabled: !!selectedInvoiceId },
  );
  const auditLogsQuery = trpc.adminBilling.listInvoiceAuditLogs.useQuery(
    { invoiceId: selectedInvoiceId ?? 0, limit: 50 },
    { enabled: !!selectedInvoiceId },
  );
  const reconciliationRunsQuery = trpc.adminBilling.listInvoiceReconciliationRuns.useQuery(
    { invoiceId: selectedInvoiceId ?? 0, limit: 50 },
    { enabled: !!selectedInvoiceId },
  );
  const webhookEventsQuery = trpc.adminBilling.listInvoiceWebhookEvents.useQuery(
    { invoiceId: selectedInvoiceId ?? 0, limit: 50 },
    { enabled: !!selectedInvoiceId },
  );

  const sellerProfileQuery = trpc.adminBilling.getSellerProfile.useQuery({});
  const sellerProfileRevisionsQuery = trpc.adminBilling.listSellerProfileRevisions.useQuery({ limit: 20 });
  const taxPoliciesQuery = trpc.adminBilling.listTaxPolicies.useQuery({});
  const beamProviderSettingsQuery = trpc.adminBilling.getBeamProviderSettings.useQuery();
  const beamProviderHealthQuery = trpc.adminBilling.testBeamProviderSettings.useQuery();
  const billingRuntimeSettingsQuery = trpc.adminBilling.getBillingRuntimeSettings.useQuery();
  const promptPayReviewQueueQuery = trpc.adminBilling.listPromptPayReviewQueue.useQuery({ tenantId: null, limit: 100 });
  const promptPayReviewQuery = trpc.adminBilling.getPromptPayReview.useQuery(
    { paymentId: selectedPromptPayPaymentId ?? 0, tenantId: null },
    { enabled: !!selectedPromptPayPaymentId },
  );
  const promptPaySlips = promptPayReviewQuery.data?.slips ?? [];
  const promptPayPreviewSlip = promptPaySlips.find((slip) => slip.id === promptPayPreviewSlipId) ?? promptPaySlips[0] ?? null;
  const domesticPreviewQuery = trpc.adminBilling.previewInvoiceNumber.useQuery({ stream: "domestic" });
  const internationalPreviewQuery = trpc.adminBilling.previewInvoiceNumber.useQuery({ stream: "international" });
  const selectedInvoicePaymentMethodsQuery = trpc.adminBilling.listPaymentMethods.useQuery(
    { userId: selectedInvoiceQuery.data?.invoice.userId ?? null },
    { enabled: !!selectedInvoiceQuery.data?.invoice.userId },
  );
  const selectedSubscriptionSettingsQuery = trpc.adminBilling.getSubscriptionPaymentSettings.useQuery(
    { subscriptionId: selectedInvoiceQuery.data?.invoice.subscriptionId ?? 0 },
    { enabled: !!selectedInvoiceQuery.data?.invoice.subscriptionId },
  );
  const renewalAttemptsQuery = trpc.adminBilling.listRenewalAttempts.useQuery(
    { subscriptionId: selectedInvoiceQuery.data?.invoice.subscriptionId ?? 0, limit: 20 },
    { enabled: !!selectedInvoiceQuery.data?.invoice.subscriptionId },
  );
  const phase2MetricsQuery = trpc.adminBilling.getPhase2Metrics.useQuery({});
  const updateBeamProviderSettingsMutation = trpc.adminBilling.updateBeamProviderSettings.useMutation({
    onSuccess: async () => {
      toast.success("Beam provider settings saved");
      await Promise.all([
        beamProviderSettingsQuery.refetch(),
        beamProviderHealthQuery.refetch(),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });
  const updateBillingRuntimeSettingsMutation = trpc.adminBilling.updateBillingRuntimeSettings.useMutation({
    onSuccess: async () => {
      toast.success("Billing runtime settings saved");
      await Promise.all([
        billingRuntimeSettingsQuery.refetch(),
        phase2MetricsQuery.refetch(),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });
  const approvePromptPayPaymentMutation = trpc.adminBilling.approvePromptPayPayment.useMutation({
    onSuccess: async () => {
      toast.success("PromptPay payment approved and credits applied");
      await Promise.all([promptPayReviewQueueQuery.refetch(), promptPayReviewQuery.refetch(), invoiceListQuery.refetch()]);
    },
    onError: (error) => toast.error(error.message),
  });
  const rejectPromptPayPaymentMutation = trpc.adminBilling.rejectPromptPayPayment.useMutation({
    onSuccess: async () => {
      toast.success("PromptPay slip rejected");
      setPromptPayRejectReason("");
      await Promise.all([promptPayReviewQueueQuery.refetch(), promptPayReviewQuery.refetch()]);
    },
    onError: (error) => toast.error(error.message),
  });
  const clearStaleTopupInvoicesMutation = trpc.adminBilling.clearStaleTopupInvoices.useMutation({
    onSuccess: async (result) => {
      toast.success(`Cleared ${result.clearedCount} stale top-up invoice(s)`);
      await Promise.all([invoiceListQuery.refetch(), selectedInvoiceQuery.refetch(), promptPayReviewQueueQuery.refetch()]);
    },
    onError: (error) => toast.error(error.message),
  });

  const requestReconciliationMutation = trpc.adminBilling.requestReconciliation.useMutation({
    onSuccess: async () => {
      toast.success("Reconciliation requested");
      await Promise.all([
        selectedInvoiceQuery.refetch(),
        recoveryCasesQuery.refetch(),
        reconciliationRunsQuery.refetch(),
        paymentTimelineQuery.refetch(),
        webhookEventsQuery.refetch(),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });
  const manualMarkPaidMutation = trpc.adminBilling.manualMarkPaid.useMutation({
    onSuccess: async () => {
      toast.success("Invoice marked as paid");
      await Promise.all([
        invoiceListQuery.refetch(),
        selectedInvoiceQuery.refetch(),
        paymentTimelineQuery.refetch(),
        auditLogsQuery.refetch(),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });
  const reverseWrongDowngradeMutation = trpc.adminBilling.reverseWrongDowngrade.useMutation({
    onSuccess: async () => {
      toast.success("Downgrade reversed");
      await Promise.all([
        selectedInvoiceQuery.refetch(),
        recoveryCasesQuery.refetch(),
        auditLogsQuery.refetch(),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });
  const sendNotificationMutation = trpc.adminBilling.sendInvoiceNotification.useMutation({
    onSuccess: async () => {
      toast.success("Notification dispatched");
      await notificationDispatchesQuery.refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  const createRecoveryCaseMutation = trpc.adminBilling.createSupportRecoveryCase.useMutation({
    onSuccess: async () => {
      toast.success("Recovery case created");
      setRecoveryReason("");
      await recoveryCasesQuery.refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  const uploadRecoveryEvidenceMutation = trpc.adminBilling.uploadRecoveryEvidence.useMutation({
    onSuccess: async () => {
      toast.success("Evidence uploaded");
      setRecoveryEvidenceNote("");
      await Promise.all([recoveryCasesQuery.refetch(), auditLogsQuery.refetch()]);
    },
    onError: (error) => toast.error(error.message),
  });
  const regenerateDocumentMutation = trpc.adminBilling.regenerateInvoiceDocument.useMutation({
    onSuccess: async () => {
      toast.success("Invoice document regenerated");
      await Promise.all([documentsQuery.refetch(), auditLogsQuery.refetch()]);
    },
    onError: (error) => toast.error(error.message),
  });
  const syncHeaderMutation = trpc.adminBilling.syncHeader.useMutation({
    onSuccess: async () => {
      toast.success("Invoice header synced");
      await Promise.all([
        selectedInvoiceQuery.refetch(),
        documentsQuery.refetch(),
        auditLogsQuery.refetch(),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });
  const replacePaidInvoiceMutation = trpc.adminBilling.replacePaidInvoice.useMutation({
    onSuccess: async (replacement) => {
      toast.success(`Replacement invoice created: ${replacement.invoiceNumber ?? `#${replacement.id}`}`);
      await Promise.all([
        invoiceListQuery.refetch(),
        auditLogsQuery.refetch(),
      ]);
      setSelectedInvoiceId(replacement.id);
    },
    onError: (error) => toast.error(error.message),
  });
  const cancelInvoiceMutation = trpc.adminBilling.cancelInvoice.useMutation({
    onSuccess: async () => {
      toast.success("Invoice canceled");
      await Promise.all([invoiceListQuery.refetch(), selectedInvoiceQuery.refetch(), paymentTimelineQuery.refetch(), auditLogsQuery.refetch()]);
    },
    onError: (error) => toast.error(error.message),
  });
  const reopenInvoiceMutation = trpc.adminBilling.reopenInvoice.useMutation({
    onSuccess: async () => {
      toast.success("Invoice reopened");
      await Promise.all([invoiceListQuery.refetch(), selectedInvoiceQuery.refetch(), paymentTimelineQuery.refetch(), auditLogsQuery.refetch()]);
    },
    onError: (error) => toast.error(error.message),
  });
  const cancelStalePaymentAttemptMutation = trpc.adminBilling.cancelStalePaymentAttempt.useMutation({
    onSuccess: async () => {
      toast.success("Payment attempt canceled");
      await Promise.all([selectedInvoiceQuery.refetch(), paymentTimelineQuery.refetch(), auditLogsQuery.refetch()]);
    },
    onError: (error) => toast.error(error.message),
  });
  const regeneratePaymentAttemptMutation = trpc.adminBilling.regeneratePaymentAttempt.useMutation({
    onSuccess: async () => {
      toast.success("New payment attempt generated");
      await Promise.all([selectedInvoiceQuery.refetch(), paymentTimelineQuery.refetch(), auditLogsQuery.refetch()]);
    },
    onError: (error) => toast.error(error.message),
  });
  const applyMissingCreditsMutation = trpc.adminBilling.applyMissingCredits.useMutation({
    onSuccess: async () => {
      toast.success("Missing credits applied");
      await Promise.all([selectedInvoiceQuery.refetch(), paymentTimelineQuery.refetch(), auditLogsQuery.refetch()]);
    },
    onError: (error) => toast.error(error.message),
  });
  const applyMissingSubscriptionRenewalMutation = trpc.adminBilling.applyMissingSubscriptionRenewal.useMutation({
    onSuccess: async () => {
      toast.success("Missing renewal applied");
      await Promise.all([selectedInvoiceQuery.refetch(), paymentTimelineQuery.refetch(), auditLogsQuery.refetch()]);
    },
    onError: (error) => toast.error(error.message),
  });
  const upsertSellerProfileMutation = trpc.adminBilling.upsertSellerProfile.useMutation({
    onSuccess: async () => {
      toast.success("Seller profile updated");
      await Promise.all([sellerProfileQuery.refetch(), sellerProfileRevisionsQuery.refetch()]);
    },
    onError: (error) => toast.error(error.message),
  });
  const upsertTaxPolicyMutation = trpc.adminBilling.upsertTaxPolicy.useMutation({
    onSuccess: async () => {
      toast.success("Tax policy saved");
      await Promise.all([
        taxPoliciesQuery.refetch(),
        domesticPreviewQuery.refetch(),
        internationalPreviewQuery.refetch(),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });
  const reserveInvoiceNumberMutation = trpc.adminBilling.reserveInvoiceNumber.useMutation({
    onSuccess: async (result) => {
      toast.success(`Reserved ${result.invoiceNumber}`);
      await Promise.all([domesticPreviewQuery.refetch(), internationalPreviewQuery.refetch()]);
    },
    onError: (error) => toast.error(error.message),
  });
  const createRenewalInvoiceMutation = trpc.adminBilling.createRenewalInvoice.useMutation({
    onSuccess: async (result) => {
      const invoice = result.invoice;
      toast.success(invoice
        ? `Renewal invoice ready: ${invoice.invoiceNumber ?? `#${invoice.id}`}`
        : "Renewal invoice ready");
      await invoiceListQuery.refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  const pauseRenewalDunningMutation = trpc.adminBilling.pauseRenewalDunning.useMutation({
    onSuccess: async () => {
      toast.success("Renewal dunning paused");
      await renewalAttemptsQuery.refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  const resumeRenewalDunningMutation = trpc.adminBilling.resumeRenewalDunning.useMutation({
    onSuccess: async () => {
      toast.success("Renewal dunning resumed");
      await renewalAttemptsQuery.refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  const fallbackToManualCollectionMutation = trpc.adminBilling.fallbackInvoiceToManualCollection.useMutation({
    onSuccess: async () => {
      toast.success("Renewal switched to manual collection");
      await Promise.all([renewalAttemptsQuery.refetch(), selectedInvoiceQuery.refetch(), paymentTimelineQuery.refetch()]);
    },
    onError: (error) => toast.error(error.message),
  });
  const forceRetryRenewalAttemptMutation = trpc.adminBilling.forceRetryRenewalAttempt.useMutation({
    onSuccess: async () => {
      toast.success("Renewal retry triggered");
      await Promise.all([renewalAttemptsQuery.refetch(), paymentTimelineQuery.refetch(), auditLogsQuery.refetch()]);
    },
    onError: (error) => toast.error(error.message),
  });
  const revokePaymentMethodMutation = trpc.adminBilling.revokePaymentMethod.useMutation({
    onSuccess: async () => {
      toast.success("Payment method revoked");
      await Promise.all([selectedInvoicePaymentMethodsQuery.refetch(), selectedSubscriptionSettingsQuery.refetch()]);
    },
    onError: (error) => toast.error(error.message),
  });
  const forceDisableAutoRenewMutation = trpc.adminBilling.forceDisableAutoRenew.useMutation({
    onSuccess: async () => {
      toast.success("Auto-renew disabled for subscription");
      await Promise.all([selectedSubscriptionSettingsQuery.refetch(), renewalAttemptsQuery.refetch()]);
    },
    onError: (error) => toast.error(error.message),
  });

  useEffect(() => {
    const invoices = invoiceListQuery.data ?? [];
    if (!selectedInvoiceId && invoices.length > 0) {
      setSelectedInvoiceId(invoices[0].id);
    }
  }, [invoiceListQuery.data, selectedInvoiceId]);

  useEffect(() => {
    const cases = recoveryCasesQuery.data ?? [];
    if (!selectedRecoveryCaseId && cases.length > 0) {
      setSelectedRecoveryCaseId(cases[0].id);
      return;
    }
    if (selectedRecoveryCaseId && !cases.some((item) => item.id === selectedRecoveryCaseId)) {
      setSelectedRecoveryCaseId(cases[0]?.id ?? null);
    }
  }, [recoveryCasesQuery.data, selectedRecoveryCaseId]);

  useEffect(() => {
    const profile = sellerProfileQuery.data;
    if (!profile) return;
    setSellerForm({
      entityNameTh: profile.entityNameTh ?? "",
      entityNameEn: profile.entityNameEn ?? "",
      taxId: profile.taxId ?? "",
      phone: profile.phone ?? "",
      email: profile.email ?? "",
      addressLine1: profile.addressLine1 ?? "",
      addressLine2: profile.addressLine2 ?? "",
      subdistrict: profile.subdistrict ?? "",
      district: profile.district ?? "",
      province: profile.province ?? "",
      postalCode: profile.postalCode ?? "",
      country: profile.country ?? "Thailand",
      signerName: profile.signerName ?? "",
      signerTitle: profile.signerTitle ?? "",
      branchType: profile.branchType ?? "สำนักงานใหญ่",
      footerNoteTh: profile.footerNoteTh ?? "",
      footerNoteEn: profile.footerNoteEn ?? "",
      autoGeneratedDocumentNoteTh: profile.autoGeneratedDocumentNoteTh ?? "",
      autoGeneratedDocumentNoteEn: profile.autoGeneratedDocumentNoteEn ?? "",
      logoUrl: profile.logoUrl ?? "",
    });
  }, [sellerProfileQuery.data]);

  const taxPolicies = useMemo(
    () => (taxPoliciesQuery.data ?? []) as AdminBillingTaxPolicy[],
    [taxPoliciesQuery.data],
  );

  useEffect(() => {
    const domestic = taxPolicies.find((policy) => policy.stream === "domestic");
    const international = taxPolicies.find((policy) => policy.stream === "international");

    if (domestic) {
      setDomesticTaxForm({
        taxName: domestic.taxName ?? "VAT",
        taxRatePercent: String(domestic.taxRatePercent ?? "0"),
        isEnabled: Boolean(domestic.isEnabled),
        effectiveFrom: formatDateInputValue(domestic.effectiveFrom, EMPTY_TAX_FORM.effectiveFrom),
        roundingPolicy: domestic.roundingPolicy ?? "half_up_2dp",
      });
    }

    if (international) {
      setInternationalTaxForm({
        taxName: international.taxName ?? "International Tax",
        taxRatePercent: String(international.taxRatePercent ?? "0"),
        isEnabled: Boolean(international.isEnabled),
        effectiveFrom: formatDateInputValue(international.effectiveFrom, EMPTY_TAX_FORM.effectiveFrom),
        roundingPolicy: international.roundingPolicy ?? "half_up_2dp",
      });
    }
  }, [taxPolicies]);

  useEffect(() => {
    if (!beamProviderSettingsQuery.data) return;
    setBeamProviderForm((prev) => {
      const next = {
        ...prev,
        apiBaseUrl: beamProviderSettingsQuery.data.apiBaseUrl ?? "",
        apiKey: "",
        chargesPath: beamProviderSettingsQuery.data.chargesPath ?? prev.chargesPath,
        paymentLinksPath: beamProviderSettingsQuery.data.paymentLinksPath ?? prev.paymentLinksPath,
        chargeStatusPathTemplate: beamProviderSettingsQuery.data.chargeStatusPathTemplate ?? prev.chargeStatusPathTemplate,
        paymentLinkStatusPathTemplate: beamProviderSettingsQuery.data.paymentLinkStatusPathTemplate ?? prev.paymentLinkStatusPathTemplate,
        cancelPathSuffix: beamProviderSettingsQuery.data.cancelPathSuffix ?? prev.cancelPathSuffix,
        webhookSecretCurrent: "",
        webhookSecretPrevious: "",
        paymentMethodSetupPath: beamProviderSettingsQuery.data.paymentMethodSetupPath ?? "",
        paymentMethodSetupHostedUrlTemplate: beamProviderSettingsQuery.data.paymentMethodSetupHostedUrlTemplate ?? "",
        paymentMethodSetupReturnUrl: beamProviderSettingsQuery.data.paymentMethodSetupReturnUrl ?? "",
        paymentMethodSetupCallbackSecretCurrent: "",
        paymentMethodSetupCallbackSecretPrevious: "",
      };
      return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
    });
  }, [beamProviderSettingsQuery.data]);

  useEffect(() => {
    if (!billingRuntimeSettingsQuery.data) return;
    setBillingRuntimeForm((prev) => {
      const next: BillingRuntimeForm = {
        ...prev,
        PAYMENT_RECONCILIATION_ENABLED: Boolean(billingRuntimeSettingsQuery.data.PAYMENT_RECONCILIATION_ENABLED),
        FINAL_RECONCILIATION_BEFORE_DOWNGRADE: Boolean(billingRuntimeSettingsQuery.data.FINAL_RECONCILIATION_BEFORE_DOWNGRADE),
        ADMIN_MANUAL_MARK_PAID_ENABLED: Boolean(billingRuntimeSettingsQuery.data.ADMIN_MANUAL_MARK_PAID_ENABLED),
        ADMIN_DOWNGRADE_REVERSAL_ENABLED: Boolean(billingRuntimeSettingsQuery.data.ADMIN_DOWNGRADE_REVERSAL_ENABLED),
        SUPPORT_RECOVERY_CASES_ENABLED: Boolean(billingRuntimeSettingsQuery.data.SUPPORT_RECOVERY_CASES_ENABLED),
        DOCUMENT_RECOVERY_ENABLED: Boolean(billingRuntimeSettingsQuery.data.DOCUMENT_RECOVERY_ENABLED),
        INVOICE_HEADER_SYNC_ENABLED: Boolean(billingRuntimeSettingsQuery.data.INVOICE_HEADER_SYNC_ENABLED),
        PAID_INVOICE_REISSUE_ENABLED: Boolean(billingRuntimeSettingsQuery.data.PAID_INVOICE_REISSUE_ENABLED),
        AUTO_DOWNGRADE_AFTER_7_DAYS: Boolean(billingRuntimeSettingsQuery.data.AUTO_DOWNGRADE_AFTER_7_DAYS),
        BEAM_PAYMENT_LINK_FALLBACK: Boolean(billingRuntimeSettingsQuery.data.BEAM_PAYMENT_LINK_FALLBACK),
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
        BILLING_TOPUP_PENDING_RETENTION_DAYS: billingRuntimeSettingsQuery.data.BILLING_TOPUP_PENDING_RETENTION_DAYS ?? "15",
        BILLING_NOTIFICATION_REMINDER_FIRST_THRESHOLD_DAYS: billingRuntimeSettingsQuery.data.BILLING_NOTIFICATION_REMINDER_FIRST_THRESHOLD_DAYS ?? "4",
        BILLING_NOTIFICATION_REMINDER_FINAL_THRESHOLD_DAYS: billingRuntimeSettingsQuery.data.BILLING_NOTIFICATION_REMINDER_FINAL_THRESHOLD_DAYS ?? "1",
        BILLING_NOTIFICATION_COOLDOWN_REMINDER_HOURS: billingRuntimeSettingsQuery.data.BILLING_NOTIFICATION_COOLDOWN_REMINDER_HOURS ?? "12",
        BILLING_NOTIFICATION_COOLDOWN_SUCCESS_HOURS: billingRuntimeSettingsQuery.data.BILLING_NOTIFICATION_COOLDOWN_SUCCESS_HOURS ?? "24",
        BILLING_NOTIFICATION_COOLDOWN_DEFAULT_HOURS: billingRuntimeSettingsQuery.data.BILLING_NOTIFICATION_COOLDOWN_DEFAULT_HOURS ?? "1",
        BILLING_SUBSCRIPTION_CUTOVER_READY: Boolean(billingRuntimeSettingsQuery.data.BILLING_SUBSCRIPTION_CUTOVER_READY),
        BILLING_PUBLIC_URL: billingRuntimeSettingsQuery.data.BILLING_PUBLIC_URL ?? "https://smartaihub.app",
        BILLING_PHASE2_STEP_UP_SECRET: "",
        PROMPTPAY_DIRECT_ENABLED: Boolean(billingRuntimeSettingsQuery.data.PROMPTPAY_DIRECT_ENABLED),
        PROMPTPAY_DIRECT_RECIPIENT_ID: "",
        PROMPTPAY_DIRECT_RECIPIENT_TYPE: (billingRuntimeSettingsQuery.data.PROMPTPAY_DIRECT_RECIPIENT_TYPE ?? "phone") as BillingRuntimeForm["PROMPTPAY_DIRECT_RECIPIENT_TYPE"],
        PROMPTPAY_DIRECT_ACCOUNT_DISPLAY_NAME: billingRuntimeSettingsQuery.data.PROMPTPAY_DIRECT_ACCOUNT_DISPLAY_NAME ?? "",
        PROMPTPAY_DIRECT_ORDER_EXPIRY_MINUTES: billingRuntimeSettingsQuery.data.PROMPTPAY_DIRECT_ORDER_EXPIRY_MINUTES ?? "60",
        PROMPTPAY_DIRECT_FX_PROVIDER: "frankfurter_daily" as const,
        PROMPTPAY_DIRECT_FX_MAX_RATE_AGE_HOURS: billingRuntimeSettingsQuery.data.PROMPTPAY_DIRECT_FX_MAX_RATE_AGE_HOURS ?? "72",
        PROMPTPAY_DIRECT_FX_SELL_SPREAD_BPS: billingRuntimeSettingsQuery.data.PROMPTPAY_DIRECT_FX_SELL_SPREAD_BPS ?? "200",
        PROMPTPAY_DIRECT_FX_RISK_BUFFER_BPS: billingRuntimeSettingsQuery.data.PROMPTPAY_DIRECT_FX_RISK_BUFFER_BPS ?? "300",
        PROMPTPAY_DIRECT_FX_ROUNDING_UNIT_THB: "1",
        PROMPTPAY_DIRECT_FX_SANITY_MIN_RATE: billingRuntimeSettingsQuery.data.PROMPTPAY_DIRECT_FX_SANITY_MIN_RATE ?? "20",
        PROMPTPAY_DIRECT_FX_SANITY_MAX_RATE: billingRuntimeSettingsQuery.data.PROMPTPAY_DIRECT_FX_SANITY_MAX_RATE ?? "60",
        PROMPTPAY_DIRECT_SLIP_MAX_BYTES: billingRuntimeSettingsQuery.data.PROMPTPAY_DIRECT_SLIP_MAX_BYTES ?? "10485760",
        PROMPTPAY_DIRECT_SLIP_ALLOWED_TYPES: billingRuntimeSettingsQuery.data.PROMPTPAY_DIRECT_SLIP_ALLOWED_TYPES ?? "application/pdf,image/png,image/jpeg,image/webp",
      };
      return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
    });
  }, [billingRuntimeSettingsQuery.data]);

  const stats = useMemo(() => {
    const invoices = invoiceListQuery.data ?? [];
    return [
      { label: "Invoices loaded", value: String(invoices.length), icon: FileText },
      { label: "Pending", value: String(invoices.filter((invoice) => ["issued", "payment_pending"].includes(invoice.status)).length), icon: RefreshCw },
      { label: "Manual review", value: String(invoices.filter((invoice) => String(invoice.status) === "manual_review_required").length), icon: ShieldAlert },
      { label: "Recovery cases", value: String((recoveryCasesQuery.data ?? []).length), icon: Ticket },
    ];
  }, [invoiceListQuery.data, recoveryCasesQuery.data]);

  async function handleDownloadDocument(invoiceId: number, documentId: number) {
    try {
      const access = await utils.adminBilling.getInvoiceDocumentAccess.fetch({
        invoiceId,
        documentId,
      });
      if (access?.url) {
        window.open(access.url, "_blank", "noopener,noreferrer");
      } else {
        toast.error("Document is not ready yet");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to open document");
    }
  }

  async function handleInvoiceSlipPreview(slip: { id: number; mimeType: string; originalFileName: string }) {
    setInvoiceSlipPreviewLoading(true);
    try {
      const access = await utils.adminBilling.getPromptPaySlipAccess.fetch({
        slipId: slip.id,
        tenantId: null,
        ttlSeconds: 3600,
      });
      if (!access?.url) {
        toast.error("Slip is not ready to view");
        return;
      }
      setInvoiceSlipPreview({
        slipId: slip.id,
        url: access.url,
        mimeType: slip.mimeType,
        fileName: slip.originalFileName,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to open slip");
    } finally {
      setInvoiceSlipPreviewLoading(false);
    }
  }

  useEffect(() => {
    setPromptPayPreviewSlipId(promptPaySlips[0]?.id ?? null);
    setPromptPayPreview(null);
    setPromptPayFullscreen(false);
  }, [selectedPromptPayPaymentId]);

  useEffect(() => {
    setInvoiceSlipPreview(null);
  }, [selectedInvoiceId]);

  useEffect(() => {
    if (!promptPayPreviewSlip) {
      setPromptPayPreview(null);
      setPromptPayPreviewLoading(false);
      return;
    }

    let active = true;
    setPromptPayPreviewLoading(true);
    void utils.adminBilling.getPromptPaySlipAccess.fetch({
      slipId: promptPayPreviewSlip.id,
      tenantId: null,
      ttlSeconds: 3600,
    }).then((access) => {
      if (!active) return;
      setPromptPayPreview(access?.url ? {
        url: access.url,
        mimeType: promptPayPreviewSlip.mimeType,
        fileName: promptPayPreviewSlip.originalFileName,
      } : null);
    }).catch(() => {
      if (active) setPromptPayPreview(null);
    }).finally(() => {
      if (active) setPromptPayPreviewLoading(false);
    });

    return () => {
      active = false;
    };
  }, [promptPayPreviewSlip, utils]);

  function saveTaxPolicy(stream: "domestic" | "international") {
    const form = stream === "domestic" ? domesticTaxForm : internationalTaxForm;
    upsertTaxPolicyMutation.mutate({
      stream,
      taxName: form.taxName,
      taxRatePercent: form.taxRatePercent,
      isEnabled: form.isEnabled,
      effectiveFrom: new Date(`${form.effectiveFrom}T00:00:00.000Z`),
      roundingPolicy: form.roundingPolicy,
    });
  }

  const invoiceAuditDetails = selectedInvoiceQuery.data ?? null;
  const selectedInvoice = invoiceAuditDetails?.invoice ?? null;
  const selectedInvoiceCustomer = invoiceAuditDetails?.customer ?? null;
  const selectedInvoiceLineItems = invoiceAuditDetails?.lineItems ?? [];
  const selectedInvoicePayments = invoiceAuditDetails?.payments ?? [];
  const selectedInvoiceAuditLogs = invoiceAuditDetails?.auditLogs ?? [];
  const invoices = invoiceListQuery.data ?? [];
  const recoveryCases = recoveryCasesQuery.data ?? [];
  const notificationDispatches = notificationDispatchesQuery.data ?? [];
  const documents = documentsQuery.data ?? [];
  const payments = paymentTimelineQuery.data ?? [];
  const auditLogs = auditLogsQuery.data ?? [];
  const reconciliationRuns = reconciliationRunsQuery.data ?? [];
  const webhookEvents = webhookEventsQuery.data ?? [];
  const selectedRecoveryCase = recoveryCases.find((item) => item.id === selectedRecoveryCaseId) ?? null;
  const sellerProfileRevisions = sellerProfileRevisionsQuery.data ?? [];
  const selectedInvoicePaymentMethods = selectedInvoicePaymentMethodsQuery.data ?? [];
  const renewalAttempts = renewalAttemptsQuery.data ?? [];
  const selectedRecoveryAttachments = Array.isArray(selectedRecoveryCase?.evidenceJson?.attachments)
    ? selectedRecoveryCase.evidenceJson.attachments
    : [];
  const canManualMarkPaid = Boolean(
    selectedInvoice
    && manualPaidReason.trim().length >= 3
    && selectedRecoveryAttachments.length > 0,
  );
  const sellerHeaderPreviewLines = [
    sellerForm.entityNameTh || sellerForm.entityNameEn || "Unnamed seller profile",
    sellerForm.addressLine1,
    sellerForm.addressLine2,
    [sellerForm.subdistrict, sellerForm.district, sellerForm.province, sellerForm.postalCode].filter(Boolean).join(" "),
    sellerForm.country,
    sellerForm.taxId ? `Tax ID: ${sellerForm.taxId}` : "",
    sellerForm.email,
    sellerForm.phone,
  ].filter(Boolean);
  const taxCalculationPreview = (basePrice: string, rate: string) => {
    const subtotal = Number(basePrice || 0);
    const taxRate = Number(rate || 0);
    const taxAmount = subtotal * (taxRate / 100);
    return {
      subtotal,
      taxAmount,
      total: subtotal + taxAmount,
    };
  };
  const domesticTaxPreview = taxCalculationPreview("1000", domesticTaxForm.taxRatePercent);
  const internationalTaxPreview = taxCalculationPreview("1000", internationalTaxForm.taxRatePercent);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-cyan-50/30 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/admin/settings")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Admin settings
            </Button>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Admin Billing</div>
              <h1 className="text-2xl font-semibold text-slate-900">Invoices, recovery, and document operations</h1>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {stats.map((item) => (
            <DashboardKpiCard
              key={item.label}
              icon={item.icon}
              label={item.label}
              value={item.value}
              iconContainerClassName="bg-cyan-50 text-cyan-700"
            />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <DashboardKpiCard label="Setup sessions" value={String(phase2MetricsQuery.data?.setupSessionsCreated ?? 0)} icon={Wallet} iconContainerClassName="bg-slate-50 text-slate-700" />
          <DashboardKpiCard label="Auto-renew attempts" value={String(phase2MetricsQuery.data?.autoRenewAttemptsCreated ?? 0)} icon={RefreshCw} iconContainerClassName="bg-slate-50 text-slate-700" />
          <DashboardKpiCard label="Settled" value={String(phase2MetricsQuery.data?.autoRenewSettled ?? 0)} icon={BadgeDollarSign} iconContainerClassName="bg-slate-50 text-slate-700" />
          <DashboardKpiCard label="Retries" value={String(phase2MetricsQuery.data?.autoRenewRetryScheduled ?? 0)} icon={RotateCcw} iconContainerClassName="bg-slate-50 text-slate-700" />
          <DashboardKpiCard label="Manual fallback" value={String(phase2MetricsQuery.data?.autoRenewManualFallbacks ?? 0)} icon={ShieldAlert} iconContainerClassName="bg-slate-50 text-slate-700" />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="flex h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
            <TabsTrigger value="operations">Operations</TabsTrigger>
            <TabsTrigger value="settings">Billing Settings</TabsTrigger>
            <TabsTrigger value="renewals">Renewals</TabsTrigger>
          </TabsList>

          <TabsContent value="operations" className="space-y-6">
            <DashboardCard
              eyebrow="Invoice retention"
              title="Clear stale unpaid top-up invoices"
              description={`ใบแจ้งหนี้ top-up ที่ยังไม่ชำระและไม่มีสลิปตรวจสอบ จะถูกเปลี่ยนเป็น canceled_overdue หลังเก็บไว้ ${billingRuntimeSettingsQuery.data?.BILLING_TOPUP_PENDING_RETENTION_DAYS ?? "15"} วัน โดยไม่ลบ invoice หรือ audit trail`}
              leading={<Trash2 className="h-5 w-5 text-amber-600" />}
            >
              <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-medium">Retention policy: {billingRuntimeSettingsQuery.data?.BILLING_TOPUP_PENDING_RETENTION_DAYS ?? "15"} days</div>
                  <div className="mt-1 text-amber-800">การเคลียร์จะยกเลิก payment ที่ค้าง ปล่อยเลข satang ที่จองไว้ และบันทึกเหตุผลไว้ใน audit log</div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => clearStaleTopupInvoicesMutation.mutate({ tenantId: null })}
                  disabled={clearStaleTopupInvoicesMutation.isPending}
                >
                  {clearStaleTopupInvoicesMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                  Clear now
                </Button>
              </div>
            </DashboardCard>
            <DashboardCard
              eyebrow="PromptPay Direct"
              title="Manual slip approval queue"
              description="ตรวจสอบสลิปก่อนอนุมัติ ระบบจะเพิ่มเครดิตให้ผู้ใช้แบบ atomic และกันการอนุมัติซ้ำ"
              leading={<Wallet className="h-5 w-5 text-cyan-600" />}
            >
              <div className="grid gap-5 xl:grid-cols-[1fr_1.1fr]">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-slate-600">รายการรอตรวจ {promptPayReviewQueueQuery.data?.length ?? 0} รายการ</div>
                    <Button variant="outline" size="sm" onClick={() => promptPayReviewQueueQuery.refetch()} disabled={promptPayReviewQueueQuery.isFetching}>
                      <RefreshCw className="mr-2 h-4 w-4" /> Refresh
                    </Button>
                  </div>
                  {(promptPayReviewQueueQuery.data ?? []).map((item) => (
                    <button
                      type="button"
                      key={item.payment.id}
                      onClick={() => setSelectedPromptPayPaymentId(item.payment.id)}
                      className={`w-full rounded-xl border p-3 text-left transition ${selectedPromptPayPaymentId === item.payment.id ? "border-cyan-500 bg-cyan-50" : "border-slate-200 bg-white hover:border-cyan-300"}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-slate-900">{item.invoice.invoiceNumber ?? `Invoice #${item.invoice.id}`}</span>
                        <Badge className={statusClass(item.payment.status)}>{item.payment.status}</Badge>
                      </div>
                      <div className="mt-1 text-sm text-slate-600">{item.user.email ?? `User #${item.invoice.userId}`}</div>
                      <div className="mt-1 text-sm font-semibold text-slate-900">{formatMoney(item.payment.expectedAmount, "THB")}</div>
                    </button>
                  ))}
                  {(promptPayReviewQueueQuery.data ?? []).length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">ไม่มีรายการรอตรวจ</div> : null}
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  {!promptPayReviewQuery.data ? (
                    <div className="text-sm text-slate-500">เลือก payment จากคิวเพื่อดูสลิปและรายละเอียด</div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid gap-3 md:grid-cols-2 text-sm">
                        <div><span className="text-slate-500">Invoice:</span> <span className="font-medium">{promptPayReviewQuery.data.invoice.invoiceNumber ?? promptPayReviewQuery.data.invoice.id}</span></div>
                        <div><span className="text-slate-500">ยอดโอน:</span> <span className="font-semibold">{formatMoney(promptPayReviewQuery.data.payment.expectedAmount, "THB")}</span></div>
                        <div><span className="text-slate-500">ผู้ใช้:</span> {promptPayReviewQuery.data.user.email ?? promptPayReviewQuery.data.invoice.userId}</div>
                        <div><span className="text-slate-500">Satang:</span> {promptPayReviewQuery.data.payment.randomSatang == null ? "-" : String(promptPayReviewQuery.data.payment.randomSatang).padStart(2, "0")}</div>
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-medium text-slate-900">Slip preview</div>
                          {promptPayPreview && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setPromptPayFullscreen(true)}
                            >
                              <Maximize2 className="mr-2 h-4 w-4" /> Full screen
                            </Button>
                          )}
                        </div>
                        <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-900">
                          {promptPayPreviewLoading ? (
                            <div className="flex min-h-56 items-center justify-center text-sm text-slate-300">
                              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading slip preview…
                            </div>
                          ) : promptPayPreview?.url ? (
                            <div
                              role="button"
                              tabIndex={0}
                              aria-label="Open slip preview full screen"
                              className="relative cursor-zoom-in outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-inset"
                              onClick={() => setPromptPayFullscreen(true)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  setPromptPayFullscreen(true);
                                }
                              }}
                            >
                              {promptPayPreview.mimeType === "application/pdf" ? (
                                <iframe
                                  title={`Slip preview: ${promptPayPreview.fileName}`}
                                  src={promptPayPreview.url}
                                  className="h-80 w-full bg-white"
                                />
                              ) : (
                                <img
                                  src={promptPayPreview.url}
                                  alt={`Slip preview: ${promptPayPreview.fileName}`}
                                  className="mx-auto max-h-80 w-full object-contain"
                                />
                              )}
                              <span className="pointer-events-none absolute bottom-3 right-3 rounded-lg bg-slate-950/75 px-3 py-2 text-xs font-medium text-white">
                                <Maximize2 className="mr-1 inline h-3.5 w-3.5" /> Click to expand
                              </span>
                            </div>
                          ) : (
                            <div className="flex min-h-56 items-center justify-center px-6 text-center text-sm text-slate-300">
                              Preview is unavailable for this slip. The file may have been removed or expired.
                            </div>
                          )}
                        </div>
                        <div className="space-y-2">
                          <div className="text-sm font-medium text-slate-900">Uploaded slips</div>
                          {promptPaySlips.map((slip) => (
                            <button
                              type="button"
                              key={slip.id}
                              onClick={() => setPromptPayPreviewSlipId(slip.id)}
                              className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left text-sm transition ${promptPayPreviewSlip?.id === slip.id ? "border-cyan-500 bg-cyan-50" : "border-slate-200 bg-white hover:border-cyan-300"}`}
                            >
                              <span>
                                <span className="block font-medium text-slate-900">{slip.originalFileName}</span>
                                <span className="block text-slate-500">{slip.status} · {formatDateTime(slip.uploadedAt)}</span>
                              </span>
                              <Maximize2 className="h-4 w-4 flex-shrink-0 text-slate-400" />
                            </button>
                          ))}
                        </div>
                      </div>
                      <Textarea value={promptPayRejectReason} onChange={(e) => setPromptPayRejectReason(e.target.value)} placeholder="เหตุผลเมื่อ reject สลิป" />
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          variant="outline"
                          className="text-rose-700"
                          disabled={rejectPromptPayPaymentMutation.isPending || promptPayRejectReason.trim().length < 3}
                          onClick={() => rejectPromptPayPaymentMutation.mutate({ paymentId: promptPayReviewQuery.data.payment.id, tenantId: null, reason: promptPayRejectReason.trim() })}
                        >Reject slip</Button>
                        <Button
                          disabled={approvePromptPayPaymentMutation.isPending}
                          onClick={() => approvePromptPayPaymentMutation.mutate({ paymentId: promptPayReviewQuery.data.payment.id, tenantId: null })}
                        >Approve & add credits</Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </DashboardCard>
            {promptPayFullscreen && promptPayPreview?.url ? (
              <div
                role="dialog"
                aria-modal="true"
                aria-label={`Full-screen slip preview: ${promptPayPreview.fileName}`}
                className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 p-4"
                onClick={() => setPromptPayFullscreen(false)}
              >
                <div
                  className="flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-slate-900 shadow-2xl"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 text-white">
                    <div className="min-w-0 truncate text-sm font-medium">{promptPayPreview.fileName}</div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
                      onClick={() => setPromptPayFullscreen(false)}
                      aria-label="Close full-screen slip preview"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex min-h-0 flex-1 items-center justify-center p-4">
                    {promptPayPreview.mimeType === "application/pdf" ? (
                      <iframe
                        title={`Full-screen slip preview: ${promptPayPreview.fileName}`}
                        src={promptPayPreview.url}
                        className="h-full w-full rounded-lg bg-white"
                      />
                    ) : (
                      <img
                        src={promptPayPreview.url}
                        alt={`Full-screen slip preview: ${promptPayPreview.fileName}`}
                        className="max-h-full max-w-full object-contain"
                      />
                    )}
                  </div>
                </div>
              </div>
            ) : null}
            <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-6">
                <DashboardCard
                  eyebrow="Search"
                  title="All invoices"
                  description="แสดง invoice ล่าสุดไม่เกิน 200 รายการ และค้นหา invoice เก่าด้วยเลข invoice, order, user id, payment id หรือ provider reference ได้"
                >
                  <div className="mb-4 flex gap-2">
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search invoice / order / user / payment / provider ref"
                    />
                    <Button variant="outline" onClick={() => invoiceListQuery.refetch()}>
                      <Search className="mr-2 h-4 w-4" />
                      Search
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {invoices.map((invoice) => (
                      <div key={invoice.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:flex-row md:items-center md:justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <div className="font-medium text-slate-900">{invoice.invoiceNumber ?? `Invoice #${invoice.id}`}</div>
                            <Badge className={statusClass(invoice.status)}>{invoice.status}</Badge>
                          </div>
                          <div className="mt-1 text-sm text-slate-500">
                            {invoice.invoiceType} · {formatMoney(invoice.totalAmount, invoice.currency)}
                          </div>
                        </div>
                        <Button
                          variant={selectedInvoiceId === invoice.id ? "default" : "outline"}
                          size="sm"
                          onClick={() => setSelectedInvoiceId(invoice.id)}
                        >
                          <FileText className="mr-2 h-4 w-4" />
                          Inspect
                        </Button>
                      </div>
                    ))}
                  </div>
                </DashboardCard>

                <DashboardCard
                  eyebrow="Recovery"
                  title="Support recovery cases"
                  description="Open a support case tied to the selected invoice for reconciliation and follow-up."
                >
                  <div className="grid gap-3 md:grid-cols-[0.8fr_1.2fr]">
                    <div>
                      <Label>Issue type</Label>
                      <Select value={recoveryIssueType} onValueChange={setRecoveryIssueType}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="payment_not_applied">Payment not applied</SelectItem>
                          <SelectItem value="wrong_downgrade">Wrong downgrade</SelectItem>
                          <SelectItem value="amount_mismatch">Amount mismatch</SelectItem>
                          <SelectItem value="missing_document">Missing document</SelectItem>
                          <SelectItem value="duplicate_charge_review">Duplicate charge review</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Case note</Label>
                      <Textarea value={recoveryReason} onChange={(e) => setRecoveryReason(e.target.value)} />
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <Button
                      disabled={!selectedInvoiceId || createRecoveryCaseMutation.isPending}
                      onClick={() =>
                        selectedInvoiceId && createRecoveryCaseMutation.mutate({
                          invoiceId: selectedInvoiceId,
                          issueType: recoveryIssueType as "payment_not_applied" | "wrong_downgrade" | "amount_mismatch" | "missing_document" | "duplicate_charge_review" | "other",
                          resolutionNote: recoveryReason || null,
                        })
                      }
                    >
                      {createRecoveryCaseMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldAlert className="mr-2 h-4 w-4" />}
                      Create recovery case
                    </Button>
                  </div>
                  <div className="mt-4 space-y-2">
                    {recoveryCases.map((item) => (
                      <div key={item.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-medium text-slate-900">{item.issueType}</div>
                          <Badge className={statusClass(item.status)}>{item.status}</Badge>
                        </div>
                        <div className="mt-1 text-slate-500">
                          Reported {formatDateTime(item.customerReportedAt)}
                        </div>
                        {item.resolutionNote ? <div className="mt-2 whitespace-pre-wrap text-slate-700">{item.resolutionNote}</div> : null}
                        {item.evidenceJson ? (
                          <div className="mt-2 space-y-2">
                            <pre className="overflow-auto rounded-lg bg-slate-950/95 p-3 text-xs text-slate-100">
                              {JSON.stringify(item.evidenceJson, null, 2)}
                            </pre>
                            {Array.isArray((item.evidenceJson as any)?.attachments) ? (
                              <div className="space-y-2">
                                {((item.evidenceJson as any)?.attachments ?? []).map((attachment: any, index: number) => (
                                  <div key={`${item.id}-${index}`} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-2">
                                    <div className="min-w-0">
                                      <div className="truncate text-sm font-medium text-slate-900">{attachment.name ?? `Attachment ${index + 1}`}</div>
                                      <div className="text-xs text-slate-500">{attachment.contentType ?? "-"} · {attachment.sizeBytes ?? "-"} bytes</div>
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={async () => {
                                        try {
                                          const access = await utils.adminBilling.getRecoveryEvidenceAccess.fetch({
                                            recoveryCaseId: item.id,
                                            attachmentIndex: index,
                                          });
                                          if (access?.url) {
                                            window.open(access.url, "_blank", "noopener,noreferrer");
                                          } else {
                                            toast.error("Evidence file is not ready");
                                          }
                                        } catch (error) {
                                          toast.error(error instanceof Error ? error.message : "Failed to open evidence");
                                        }
                                      }}
                                    >
                                      <Download className="mr-2 h-4 w-4" />
                                      Open evidence
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                        <div className="mt-3">
                          <Button
                            size="sm"
                            variant={selectedRecoveryCaseId === item.id ? "default" : "outline"}
                            onClick={() => setSelectedRecoveryCaseId(item.id)}
                          >
                            Select for evidence upload
                          </Button>
                        </div>
                      </div>
                    ))}
                    {selectedInvoiceId && recoveryCases.length === 0 ? (
                      <div className="text-sm text-slate-500">No recovery cases for this invoice yet.</div>
                    ) : null}
                  </div>
                  <div className="mt-4 rounded-2xl border border-dashed border-slate-300 p-4">
                    <div className="text-sm font-medium text-slate-900">Attach support evidence</div>
                    <div className="mt-1 text-sm text-slate-500">
                      Selected case: {selectedRecoveryCase ? `#${selectedRecoveryCase.id} ${selectedRecoveryCase.issueType}` : "none"}
                    </div>
                    <div className="mt-3">
                      <Label>Attachment note</Label>
                      <Textarea value={recoveryEvidenceNote} onChange={(e) => setRecoveryEvidenceNote(e.target.value)} />
                    </div>
                    <div className="mt-3">
                      <Input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.webp,.txt"
                        disabled={!selectedRecoveryCase || uploadRecoveryEvidenceMutation.isPending}
                        onChange={async (event) => {
                          const file = event.target.files?.[0];
                          if (!file || !selectedRecoveryCase) return;
                          try {
                            const base64Content = await readFileAsBase64(file);
                            uploadRecoveryEvidenceMutation.mutate({
                              recoveryCaseId: selectedRecoveryCase.id,
                              fileName: file.name,
                              contentType: file.type || "application/octet-stream",
                              base64Content,
                              note: recoveryEvidenceNote || null,
                            });
                          } catch (error) {
                            toast.error(error instanceof Error ? error.message : "Failed to read attachment");
                          } finally {
                            event.currentTarget.value = "";
                          }
                        }}
                      />
                    </div>
                  </div>
                </DashboardCard>

                <DashboardCard
                  eyebrow="Timeline"
                  title="Payments, reconciliation, and audit trail"
                  description="Read sanitized provider responses, recent reconciliation runs, and invoice audit entries."
                >
                  <div className="space-y-4">
                    <div>
                      <div className="mb-2 text-sm font-medium text-slate-900">Payments</div>
                      <div className="space-y-2">
                        {payments.map((payment) => (
                          <div key={payment.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                            <div className="flex items-center justify-between gap-3">
                              <div className="font-medium text-slate-900">{payment.providerPaymentId ?? `Payment #${payment.id}`}</div>
                              <Badge className={statusClass(payment.status)}>{payment.status}</Badge>
                            </div>
                            <div className="mt-1 text-slate-500">
                              {formatMoney(payment.amount, payment.currency)} · match {payment.amountMatchStatus} · {payment.providerPaymentType}
                            </div>
                            {payment.rawResponseJson ? (
                              <pre className="mt-2 overflow-auto rounded-lg bg-slate-950/95 p-3 text-xs text-slate-100">
                                {JSON.stringify(payment.rawResponseJson, null, 2)}
                              </pre>
                            ) : null}
                          </div>
                        ))}
                        {selectedInvoiceId && payments.length === 0 ? (
                          <div className="text-sm text-slate-500">No payment timeline for this invoice yet.</div>
                        ) : null}
                      </div>
                    </div>

                    <div>
                      <div className="mb-2 text-sm font-medium text-slate-900">Reconciliation runs</div>
                      <div className="space-y-2">
                        {reconciliationRuns.map((run) => (
                          <div key={run.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                            <div className="flex items-center justify-between gap-3">
                              <div className="font-medium text-slate-900">{run.entityType} #{run.entityId}</div>
                              <Badge className={statusClass(run.result)}>{run.result}</Badge>
                            </div>
                            <div className="mt-1 text-slate-500">
                              {run.triggerType} · {formatDateTime(run.createdAt)}
                            </div>
                            {run.notes ? <div className="mt-2 text-slate-700">{run.notes}</div> : null}
                          </div>
                        ))}
                        {selectedInvoiceId && reconciliationRuns.length === 0 ? (
                          <div className="text-sm text-slate-500">No reconciliation runs recorded yet.</div>
                        ) : null}
                      </div>
                    </div>

                    <div>
                      <div className="mb-2 text-sm font-medium text-slate-900">Webhook events</div>
                      <div className="space-y-2">
                        {webhookEvents.map((event) => (
                          <div key={event.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                            <div className="flex items-center justify-between gap-3">
                              <div className="font-medium text-slate-900">{event.eventType}</div>
                              <Badge className={statusClass(event.processingStatus)}>{event.processingStatus}</Badge>
                            </div>
                            <div className="mt-1 text-slate-500">
                              {event.eventId ?? "no-event-id"} · signature {event.signatureValid ? "valid" : "invalid"} · {formatDateTime(event.createdAt)}
                            </div>
                            {event.errorMessage ? <div className="mt-2 text-rose-700">{event.errorMessage}</div> : null}
                            {event.payloadJson ? (
                              <pre className="mt-2 overflow-auto rounded-lg bg-slate-950/95 p-3 text-xs text-slate-100">
                                {JSON.stringify(event.payloadJson, null, 2)}
                              </pre>
                            ) : null}
                          </div>
                        ))}
                        {selectedInvoiceId && webhookEvents.length === 0 ? (
                          <div className="text-sm text-slate-500">No webhook events matched this invoice yet.</div>
                        ) : null}
                      </div>
                    </div>

                    <div>
                      <div className="mb-2 text-sm font-medium text-slate-900">Audit logs</div>
                      <div className="space-y-2">
                        {auditLogs.map((log) => (
                          <div key={log.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                            <div className="flex items-center justify-between gap-3">
                              <div className="font-medium text-slate-900">{log.action}</div>
                              <div className="text-slate-500">{formatDateTime(log.createdAt)}</div>
                            </div>
                            {log.reason ? <div className="mt-1 text-slate-700">{log.reason}</div> : null}
                            {log.beforeJson ? (
                              <div className="mt-2">
                                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Before</div>
                                {renderJsonSummary(log.beforeJson)}
                              </div>
                            ) : null}
                            {log.afterJson ? (
                              <div className="mt-2">
                                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">After</div>
                                {renderJsonSummary(log.afterJson)}
                              </div>
                            ) : null}
                          </div>
                        ))}
                        {selectedInvoiceId && auditLogs.length === 0 ? (
                          <div className="text-sm text-slate-500">No audit log entries recorded yet.</div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </DashboardCard>
              </div>

              <div className="space-y-6">
                <DashboardCard
                  eyebrow="Selected Invoice"
                  title={selectedInvoice ? selectedInvoice.invoiceNumber ?? `Invoice #${selectedInvoice.id}` : "Choose an invoice"}
                  description="ตรวจสอบประวัติ Invoice ลูกค้า รายการสั่งซื้อ การชำระเงิน และหลักฐานการอนุมัติได้ในจุดเดียว"
                >
                  {selectedInvoice ? (
                    <div className="space-y-4">
                      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-5 text-white shadow-xl shadow-slate-900/10">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200">Invoice audit record</div>
                            <div className="mt-2 text-xl font-semibold tracking-tight">{selectedInvoice.invoiceNumber ?? `Invoice #${selectedInvoice.id}`}</div>
                            <div className="mt-1 text-sm text-slate-300">{selectedInvoice.invoiceType} · issued {formatDateTime(selectedInvoice.issuedAt ?? selectedInvoice.createdAt)}</div>
                          </div>
                          <Badge className={statusClass(selectedInvoice.status)}>{selectedInvoice.status}</Badge>
                        </div>
                        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          <div className="rounded-xl bg-white/10 p-3">
                            <div className="text-xs uppercase tracking-[0.16em] text-slate-300">Invoice total</div>
                            <div className="mt-1 text-lg font-semibold">{formatMoney(selectedInvoice.totalAmount, selectedInvoice.currency)}</div>
                          </div>
                          <div className="rounded-xl bg-white/10 p-3">
                            <div className="text-xs uppercase tracking-[0.16em] text-slate-300">Source amount (USD)</div>
                            <div className="mt-1 text-lg font-semibold">{getSourceUsdAmount(selectedInvoice, selectedInvoicePayments) != null ? formatMoney(getSourceUsdAmount(selectedInvoice, selectedInvoicePayments), "USD") : "-"}</div>
                          </div>
                          <div className="rounded-xl bg-white/10 p-3">
                            <div className="text-xs uppercase tracking-[0.16em] text-slate-300">Issued</div>
                            <div className="mt-1 text-sm font-medium">{formatDateTime(selectedInvoice.issuedAt ?? selectedInvoice.createdAt)}</div>
                          </div>
                          <div className="rounded-xl bg-white/10 p-3">
                            <div className="text-xs uppercase tracking-[0.16em] text-slate-300">Due</div>
                            <div className="mt-1 text-sm font-medium">{formatDateTime(selectedInvoice.dueAt)}</div>
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="flex items-center gap-2">
                            <UserRound className="h-4 w-4 text-cyan-700" />
                            <div className="text-sm font-semibold text-slate-900">Customer & invoice</div>
                          </div>
                          <div className="mt-3 space-y-1 text-sm">
                            <div className="font-medium text-slate-900">{selectedInvoiceCustomer?.name ?? "-"}</div>
                            <div className="break-all text-slate-600">{selectedInvoiceCustomer?.email ?? "ไม่พบอีเมลลูกค้า"}</div>
                            <div className="pt-2 text-xs text-slate-500">Order ID: {selectedInvoice.orderId ?? "-"} · Header v{selectedInvoice.headerVersion}</div>
                          </div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="flex items-center gap-2">
                            <ReceiptText className="h-4 w-4 text-cyan-700" />
                            <div className="text-sm font-semibold text-slate-900">Document settings</div>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                            <div><div className="text-xs text-slate-500">Language</div><div className="font-medium text-slate-900">{selectedInvoice.defaultDocumentLanguage}</div></div>
                            <div><div className="text-xs text-slate-500">Currency</div><div className="font-medium text-slate-900">{selectedInvoice.currency}</div></div>
                            <div><div className="text-xs text-slate-500">Created</div><div className="font-medium text-slate-900">{formatDateTime(selectedInvoice.createdAt)}</div></div>
                            <div><div className="text-xs text-slate-500">Paid</div><div className="font-medium text-slate-900">{formatDateTime(selectedInvoice.paidAt)}</div></div>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
                          <Package className="h-4 w-4 text-cyan-700" />
                          <div>
                            <div className="text-sm font-semibold text-slate-900">Ordered line items</div>
                            <div className="text-xs text-slate-500">แสดงรายการทั้งหมดจาก Invoice ฉบับนี้</div>
                          </div>
                        </div>
                        <div className="hidden grid-cols-[minmax(0,1fr)_auto_auto] gap-4 border-b border-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 sm:grid">
                          <div>Item</div><div>Qty</div><div className="text-right">Amount</div>
                        </div>
                        <div className="divide-y divide-slate-100">
                          {selectedInvoiceLineItems.map((lineItem) => (
                            <div key={lineItem.id} className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-4">
                              <div className="min-w-0">
                                <div className="font-medium text-slate-900">{lineItem.description || lineItem.itemType}</div>
                                <div className="text-xs text-slate-500">{lineItem.itemType}{getLineItemMetaLabel(lineItem.metadataJson) ? ` · ${getLineItemMetaLabel(lineItem.metadataJson)}` : ""}</div>
                              </div>
                              <div className="text-slate-600">Qty {formatQuantity(lineItem.quantity)}</div>
                              <div className="text-left font-medium text-slate-900 sm:text-right">{formatMoney(lineItem.amount, selectedInvoice.currency)}</div>
                            </div>
                          ))}
                          {selectedInvoiceLineItems.length === 0 ? <div className="px-4 py-5 text-sm text-slate-500">ไม่พบรายการสินค้าใน Invoice นี้</div> : null}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
                          <Wallet className="h-4 w-4 text-cyan-700" />
                          <div>
                            <div className="text-sm font-semibold text-slate-900">Payment & approval evidence</div>
                            <div className="text-xs text-slate-500">ยอดชำระ สลิป และวันเวลาที่ผู้ดูแลอนุมัติ</div>
                          </div>
                        </div>
                        <div className="space-y-4 p-4">
                          {selectedInvoicePayments.map((payment) => {
                            const approvalLog = selectedInvoiceAuditLogs.find((log) => log.action === "promptpay_payment_approved" && getAuditPaymentId(log.afterJson) === payment.id);
                            return (
                              <div key={payment.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                                      <span>Payment #{payment.id}</span>
                                      <Badge className={statusClass(payment.status)}>{payment.status}</Badge>
                                    </div>
                                    <div className="mt-1 text-xs text-slate-500">{payment.paymentChannel} · created {formatDateTime(payment.createdAt)}</div>
                                  </div>
                                  <div className="text-right text-sm">
                                    <div className="font-semibold text-slate-900">{formatMoney(payment.amount, payment.currency)}</div>
                                    <div className="text-xs text-slate-500">Expected {formatMoney(payment.expectedAmount, payment.expectedCurrency ?? "THB")}</div>
                                  </div>
                                </div>
                                <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-3">
                                  <div><span className="text-slate-500">Source USD:</span> {payment.sourceAmountUsd != null ? formatMoney(payment.sourceAmountUsd, "USD") : "-"}</div>
                                  <div><span className="text-slate-500">Paid at:</span> {formatDateTime(payment.paidAt)}</div>
                                  <div><span className="text-slate-500">Business effect:</span> {payment.businessEffectStatus ?? "-"}</div>
                                </div>
                                <div className={`mt-3 rounded-xl border p-3 ${approvalLog ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
                                  <div className="flex items-start gap-2">
                                    {approvalLog ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" /> : <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />}
                                    <div className="min-w-0 text-sm">
                                      <div className={`font-semibold ${approvalLog ? "text-emerald-900" : "text-amber-900"}`}>
                                        {approvalLog ? "Approved" : "ยังไม่มีหลักฐานการอนุมัติ"}
                                      </div>
                                      {approvalLog ? (
                                        <div className="mt-1 text-xs text-emerald-800">
                                          <div>{formatDateTime(approvalLog.createdAt)} · {approvalLog.actor?.name ?? approvalLog.actor?.email ?? "ระบบ/ผู้ดูแล"}</div>
                                          {approvalLog.actor?.email ? <div>ผู้อนุมัติ: {approvalLog.actor.email}</div> : null}
                                        </div>
                                      ) : <div className="mt-1 text-xs text-amber-800">สถานะปัจจุบันยังรอตรวจสอบหรือยังไม่มี audit log การ approve</div>}
                                    </div>
                                  </div>
                                </div>
                                <div className="mt-3 space-y-2">
                                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Uploaded slips</div>
                                  {payment.slips.length > 0 ? payment.slips.map((slip) => (
                                    <div key={slip.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm">
                                      <div className="flex min-w-0 items-center gap-3">
                                        <ImageIcon className="h-4 w-4 shrink-0 text-slate-500" />
                                        <div className="min-w-0">
                                          <div className="truncate font-medium text-slate-900">{slip.originalFileName}</div>
                                          <div className="text-xs text-slate-500">{slip.status} · uploaded {formatDateTime(slip.uploadedAt)} · {formatFileSize(slip.fileSizeBytes)}</div>
                                          <div className="text-xs text-slate-500">Reviewed {formatDateTime(slip.reviewedAt)} · {slip.reviewer?.name ?? slip.reviewer?.email ?? "ยังไม่มีผู้ตรวจสอบ"}{slip.reviewer?.email && slip.reviewer.name ? ` · ${slip.reviewer.email}` : ""}</div>
                                          {slip.rejectionReason ? <div className="mt-1 text-xs text-rose-700">เหตุผล: {slip.rejectionReason}</div> : null}
                                        </div>
                                      </div>
                                      <Button variant="outline" size="sm" onClick={() => void handleInvoiceSlipPreview(slip)} disabled={invoiceSlipPreviewLoading}>
                                        {invoiceSlipPreviewLoading && invoiceSlipPreview?.slipId === slip.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
                                        View slip
                                      </Button>
                                    </div>
                                  )) : <div className="rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-500">ยังไม่มีสลิปที่อัปโหลด</div>}
                                  {invoiceSlipPreview && payment.slips.some((slip) => slip.id === invoiceSlipPreview.slipId) ? (
                                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                                      <div className="mb-2 flex items-center justify-between gap-3 text-xs font-medium text-slate-600">
                                        <span className="truncate">{invoiceSlipPreview.fileName}</span>
                                        <Button variant="ghost" size="sm" onClick={() => setInvoiceSlipPreview(null)}><X className="h-4 w-4" /></Button>
                                      </div>
                                      {invoiceSlipPreview.mimeType.startsWith("image/") ? (
                                        <img src={invoiceSlipPreview.url} alt={invoiceSlipPreview.fileName} className="max-h-80 w-full rounded-lg object-contain" />
                                      ) : (
                                        <iframe title={invoiceSlipPreview.fileName} src={invoiceSlipPreview.url} className="h-80 w-full rounded-lg border border-slate-200" />
                                      )}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                          {selectedInvoicePayments.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">ยังไม่มีข้อมูลการชำระเงิน</div> : null}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex items-center gap-2">
                          <Clock3 className="h-4 w-4 text-cyan-700" />
                          <div className="text-sm font-semibold text-slate-900">Activity timeline</div>
                        </div>
                        <div className="mt-4 space-y-3">
                          {selectedInvoiceAuditLogs.length > 0 ? selectedInvoiceAuditLogs.slice().reverse().map((log) => (
                            <div key={log.id} className="relative flex gap-3 pl-1">
                              <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-cyan-600 ring-4 ring-cyan-50" />
                              <div className="min-w-0 flex-1 border-b border-slate-100 pb-3 last:border-0">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div className="text-sm font-medium text-slate-900">{getAuditActionLabel(log.action)}</div>
                                  <div className="text-xs text-slate-500">{formatDateTime(log.createdAt)}</div>
                                </div>
                                <div className="mt-1 text-xs text-slate-500">{log.actor?.name ?? log.actor?.email ?? "ระบบ"}{log.actor?.email && log.actor.name ? ` · ${log.actor.email}` : ""}</div>
                                {log.reason ? <div className="mt-1 text-xs text-slate-600">{log.reason}</div> : null}
                              </div>
                            </div>
                          )) : <div className="text-sm text-slate-500">ยังไม่มีประวัติการเปลี่ยนแปลง</div>}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          onClick={() => requestReconciliationMutation.mutate({ invoiceId: selectedInvoice.id })}
                          disabled={requestReconciliationMutation.isPending}
                        >
                          {requestReconciliationMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                          Sync transaction
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => regenerateDocumentMutation.mutate({ invoiceId: selectedInvoice.id, language: documentLanguage, reason: "manual_regeneration" })}
                          disabled={regenerateDocumentMutation.isPending}
                        >
                          {regenerateDocumentMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                          Regenerate PDF
                        </Button>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <div>
                          <Label>Document language</Label>
                          <Select value={documentLanguage} onValueChange={(value) => setDocumentLanguage(value as "th" | "en" | "bilingual")}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="th">Thai</SelectItem>
                              <SelectItem value="en">English</SelectItem>
                              <SelectItem value="bilingual">Bilingual</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Sync scope</Label>
                          <Select value={syncScope} onValueChange={(value) => setSyncScope(value as "seller" | "buyer" | "both")}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="seller">Seller only</SelectItem>
                              <SelectItem value="buyer">Buyer only</SelectItem>
                              <SelectItem value="both">Both headers</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Button
                            variant="outline"
                            className="mt-6 w-full"
                            onClick={() => syncHeaderMutation.mutate({
                              invoiceId: selectedInvoice.id,
                              scope: syncScope,
                              reason: `admin_sync_${syncScope}_header`,
                            })}
                            disabled={syncHeaderMutation.isPending || !["draft", "issued", "payment_pending"].includes(selectedInvoice.status)}
                          >
                            {syncHeaderMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                            Sync header
                          </Button>
                        </div>
                        <div>
                          <Label>Notification type</Label>
                          <Select value={notificationType} onValueChange={setNotificationType}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="invoice_issued">Invoice issued</SelectItem>
                              <SelectItem value="qr_ready">QR ready</SelectItem>
                              <SelectItem value="payment_success">Payment success</SelectItem>
                              <SelectItem value="invoice_due_reminder">Due reminder</SelectItem>
                              <SelectItem value="invoice_overdue_downgraded">Overdue downgraded</SelectItem>
                              <SelectItem value="invoice_reissued">Invoice reissued</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <Button
                        variant="outline"
                        onClick={() => sendNotificationMutation.mutate({
                          invoiceId: selectedInvoice.id,
                          notificationType: notificationType as "invoice_issued" | "qr_ready" | "payment_success" | "invoice_due_reminder" | "invoice_overdue_downgraded" | "invoice_reissued",
                        })}
                        disabled={sendNotificationMutation.isPending}
                      >
                        <Mail className="mr-2 h-4 w-4" />
                        Send notification
                      </Button>

                      <div className="rounded-2xl bg-slate-50 p-4">
                        <Label>Manual mark paid / reversal reason</Label>
                        <Textarea value={manualPaidReason} onChange={(e) => setManualPaidReason(e.target.value)} />
                        <div className="mt-2 text-xs text-slate-500">
                          Manual mark paid requires a recovery case with at least one uploaded evidence attachment.
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            onClick={() =>
                              manualMarkPaidMutation.mutate({
                                invoiceId: selectedInvoice.id,
                                reason: manualPaidReason || "Manual recovery verification",
                                evidenceJson: {
                                  recoveryCaseId: selectedRecoveryCase?.id ?? null,
                                  attachmentCount: selectedRecoveryAttachments.length,
                                },
                              })
                            }
                            disabled={manualMarkPaidMutation.isPending || !canManualMarkPaid}
                          >
                            {manualMarkPaidMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BadgeDollarSign className="mr-2 h-4 w-4" />}
                            Manual mark paid
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() =>
                              reverseWrongDowngradeMutation.mutate({
                                invoiceId: selectedInvoice.id,
                                reason: manualPaidReason || "Recovered valid payment after downgrade",
                              })
                            }
                            disabled={reverseWrongDowngradeMutation.isPending}
                          >
                            <RotateCcw className="mr-2 h-4 w-4" />
                            Reverse wrong downgrade
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() =>
                              replacePaidInvoiceMutation.mutate({
                                invoiceId: selectedInvoice.id,
                                reason: manualPaidReason || "Correct header data after payment",
                              })
                            }
                            disabled={replacePaidInvoiceMutation.isPending || selectedInvoice.status !== "paid"}
                          >
                            {replacePaidInvoiceMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                            Replace paid invoice
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() =>
                              cancelInvoiceMutation.mutate({
                                invoiceId: selectedInvoice.id,
                                reason: manualPaidReason || "Admin canceled invoice",
                              })
                            }
                            disabled={cancelInvoiceMutation.isPending || selectedInvoice.status === "paid"}
                          >
                            Cancel invoice
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() =>
                              reopenInvoiceMutation.mutate({
                                invoiceId: selectedInvoice.id,
                                reason: manualPaidReason || "Admin reopened invoice",
                              })
                            }
                            disabled={reopenInvoiceMutation.isPending || ["paid", "replaced"].includes(selectedInvoice.status)}
                          >
                            Reopen invoice
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() =>
                              cancelStalePaymentAttemptMutation.mutate({
                                invoiceId: selectedInvoice.id,
                                reason: manualPaidReason || "Canceled stale attempt",
                              })
                            }
                            disabled={cancelStalePaymentAttemptMutation.isPending}
                          >
                            Cancel stale attempt
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() =>
                              regeneratePaymentAttemptMutation.mutate({
                                invoiceId: selectedInvoice.id,
                                reason: manualPaidReason || "Generate new payment attempt",
                              })
                            }
                            disabled={regeneratePaymentAttemptMutation.isPending || ["paid", "replaced"].includes(selectedInvoice.status)}
                          >
                            New payment attempt
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() =>
                              applyMissingCreditsMutation.mutate({
                                invoiceId: selectedInvoice.id,
                                reason: manualPaidReason || "Apply missing credits",
                              })
                            }
                            disabled={applyMissingCreditsMutation.isPending}
                          >
                            Apply missing credits
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() =>
                              applyMissingSubscriptionRenewalMutation.mutate({
                                invoiceId: selectedInvoice.id,
                                reason: manualPaidReason || "Apply missing subscription renewal",
                              })
                            }
                            disabled={applyMissingSubscriptionRenewalMutation.isPending}
                          >
                            Apply missing renewal
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-slate-500">Pick an invoice from the left to manage recovery and documents.</div>
                  )}
                </DashboardCard>

                <DashboardCard
                  eyebrow="Documents"
                  title="Invoice documents"
                  description="Latest PDF variants and render history for the selected invoice."
                >
                  <div className="space-y-2">
                    {documents.map((document) => (
                      <div key={document.id} className="flex items-center justify-between rounded-xl border border-slate-200 p-3 text-sm">
                        <div>
                          <div className="font-medium text-slate-900">{document.documentLanguage} v{document.documentVersion}</div>
                          <div className="text-slate-500">{document.renderReason}</div>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => handleDownloadDocument(document.invoiceId, document.id)}>
                          <Download className="mr-2 h-4 w-4" />
                          Open
                        </Button>
                      </div>
                    ))}
                    {selectedInvoiceId && documents.length === 0 ? (
                      <div className="text-sm text-slate-500">No document variants available yet.</div>
                    ) : null}
                  </div>
                </DashboardCard>

                <DashboardCard
                  eyebrow="Notifications"
                  title="Dispatch history"
                  description="Dedupe-aware notification records created for this invoice."
                >
                  <div className="space-y-2">
                    {notificationDispatches.map((dispatch) => (
                      <div key={dispatch.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-medium text-slate-900">{dispatch.notificationType}</div>
                          <Badge className={statusClass(dispatch.status)}>{dispatch.status}</Badge>
                        </div>
                        <div className="mt-1 text-slate-500">{dispatch.channel} · {dispatch.dedupeKey}</div>
                      </div>
                    ))}
                    {selectedInvoiceId && notificationDispatches.length === 0 ? (
                      <div className="text-sm text-slate-500">No notification dispatches recorded yet.</div>
                    ) : null}
                  </div>
                </DashboardCard>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
              <DashboardCard
                eyebrow="Seller Header"
                title="Document header and footer"
                description="Configure the company identity used in billing documents and automatic notes."
                leading={<Settings2 className="h-5 w-5 text-cyan-600" />}
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>Entity name (TH)</Label>
                    <Input value={sellerForm.entityNameTh} onChange={(e) => setSellerForm((prev) => ({ ...prev, entityNameTh: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Entity name (EN)</Label>
                    <Input value={sellerForm.entityNameEn} onChange={(e) => setSellerForm((prev) => ({ ...prev, entityNameEn: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Tax ID</Label>
                    <Input value={sellerForm.taxId} onChange={(e) => setSellerForm((prev) => ({ ...prev, taxId: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Phone</Label>
                    <Input value={sellerForm.phone} onChange={(e) => setSellerForm((prev) => ({ ...prev, phone: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input value={sellerForm.email} onChange={(e) => setSellerForm((prev) => ({ ...prev, email: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Country</Label>
                    <Input value={sellerForm.country} onChange={(e) => setSellerForm((prev) => ({ ...prev, country: e.target.value }))} />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Address line 1</Label>
                    <Input value={sellerForm.addressLine1} onChange={(e) => setSellerForm((prev) => ({ ...prev, addressLine1: e.target.value }))} />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Address line 2</Label>
                    <Input value={sellerForm.addressLine2} onChange={(e) => setSellerForm((prev) => ({ ...prev, addressLine2: e.target.value }))} />
                  </div>
                  <div>
                    <Label>District</Label>
                    <Input value={sellerForm.district} onChange={(e) => setSellerForm((prev) => ({ ...prev, district: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Province</Label>
                    <Input value={sellerForm.province} onChange={(e) => setSellerForm((prev) => ({ ...prev, province: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Postal code</Label>
                    <Input value={sellerForm.postalCode} onChange={(e) => setSellerForm((prev) => ({ ...prev, postalCode: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Branch type</Label>
                    <Input value={sellerForm.branchType} onChange={(e) => setSellerForm((prev) => ({ ...prev, branchType: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Signer name</Label>
                    <Input value={sellerForm.signerName} onChange={(e) => setSellerForm((prev) => ({ ...prev, signerName: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Signer title</Label>
                    <Input value={sellerForm.signerTitle} onChange={(e) => setSellerForm((prev) => ({ ...prev, signerTitle: e.target.value }))} />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Logo URL</Label>
                    <Input value={sellerForm.logoUrl} onChange={(e) => setSellerForm((prev) => ({ ...prev, logoUrl: e.target.value }))} />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Thai footer note</Label>
                    <Textarea value={sellerForm.footerNoteTh} onChange={(e) => setSellerForm((prev) => ({ ...prev, footerNoteTh: e.target.value }))} />
                  </div>
                  <div className="md:col-span-2">
                    <Label>English footer note</Label>
                    <Textarea value={sellerForm.footerNoteEn} onChange={(e) => setSellerForm((prev) => ({ ...prev, footerNoteEn: e.target.value }))} />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Thai auto-generated note</Label>
                    <Textarea value={sellerForm.autoGeneratedDocumentNoteTh} onChange={(e) => setSellerForm((prev) => ({ ...prev, autoGeneratedDocumentNoteTh: e.target.value }))} />
                  </div>
                  <div className="md:col-span-2">
                    <Label>English auto-generated note</Label>
                    <Textarea value={sellerForm.autoGeneratedDocumentNoteEn} onChange={(e) => setSellerForm((prev) => ({ ...prev, autoGeneratedDocumentNoteEn: e.target.value }))} />
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <Button onClick={() => upsertSellerProfileMutation.mutate(sellerForm)} disabled={upsertSellerProfileMutation.isPending}>
                    {upsertSellerProfileMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Save seller profile
                  </Button>
                </div>
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  <div className="font-medium text-slate-900">Header revision snapshot</div>
                  <div className="mt-2">Current seller profile revision: {sellerProfileQuery.data?.revision ?? 0}</div>
                  <div>Last updated at: {formatDateTime(sellerProfileQuery.data?.updatedAt)}</div>
                </div>
                <div className="mt-4 rounded-2xl border border-cyan-100 bg-cyan-50/70 p-4 text-sm text-slate-700">
                  <div className="font-medium text-slate-900">Header preview</div>
                  <div className="mt-2 space-y-1">
                    {sellerHeaderPreviewLines.map((line) => (
                      <div key={line}>{line}</div>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!selectedInvoiceId || regenerateDocumentMutation.isPending}
                      onClick={() =>
                        selectedInvoiceId && regenerateDocumentMutation.mutate({
                          invoiceId: selectedInvoiceId,
                          language: documentLanguage,
                          reason: "manual_regeneration",
                        })
                      }
                    >
                      Render sample invoice
                    </Button>
                    <div className="text-xs text-slate-500">
                      Uses the currently selected invoice as sample context.
                    </div>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <div className="text-sm font-medium text-slate-900">Seller profile revision history</div>
                  {sellerProfileRevisions.map((revision) => (
                    <div key={revision.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium text-slate-900">Revision {revision.revision}</div>
                        <div className="text-slate-500">{formatDateTime(revision.createdAt)}</div>
                      </div>
                      {revision.diffJson ? renderJsonSummary(revision.diffJson) : null}
                    </div>
                  ))}
                  {sellerProfileRevisions.length === 0 ? (
                    <div className="text-sm text-slate-500">No seller profile revisions recorded yet.</div>
                  ) : null}
                </div>
              </DashboardCard>

              <div className="space-y-6">
                <DashboardCard
                  eyebrow="Beam Provider"
                  title="Gateway keys and callback secrets"
                  description="Configure the Beam API, webhook verification, payment-link paths, and card-setup callback secrets used by billing runtime."
                  leading={<ShieldAlert className="h-5 w-5 text-cyan-600" />}
                >
                  <div className="mb-4 grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                      <div className="font-medium text-slate-900">Runtime health</div>
                      <div className="mt-2">API configured: {beamProviderHealthQuery.data?.configured ? "Yes" : "No"}</div>
                      <div>Webhook configured: {beamProviderHealthQuery.data?.webhookConfigured ? "Yes" : "No"}</div>
                      <div>Hosted setup configured: {beamProviderHealthQuery.data?.setupHostedConfigured ? "Yes" : "No"}</div>
                      <div>Setup API configured: {beamProviderHealthQuery.data?.setupApiConfigured ? "Yes" : "No"}</div>
                      <div>Payment Link configured: {beamProviderHealthQuery.data?.paymentLinkConfigured ? "Yes" : "No"}</div>
                      {(beamProviderHealthQuery.data?.missing?.length ?? 0) > 0 ? (
                        <div className="mt-2 text-rose-700">Missing: {(beamProviderHealthQuery.data?.missing ?? []).join(", ")}</div>
                      ) : null}
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                      <div className="font-medium text-slate-900">Configured secrets</div>
                      <div className="mt-2">API key: {beamProviderSettingsQuery.data?.apiKeyConfigured ? beamProviderSettingsQuery.data?.apiKeyMasked : "not configured"}</div>
                      <div>Webhook current: {beamProviderSettingsQuery.data?.webhookSecretCurrentConfigured ? beamProviderSettingsQuery.data?.webhookSecretCurrentMasked : "not configured"}</div>
                      <div>Webhook previous: {beamProviderSettingsQuery.data?.webhookSecretPreviousConfigured ? beamProviderSettingsQuery.data?.webhookSecretPreviousMasked : "not configured"}</div>
                      <div>Setup callback current: {beamProviderSettingsQuery.data?.paymentMethodSetupCallbackSecretCurrentConfigured ? beamProviderSettingsQuery.data?.paymentMethodSetupCallbackSecretCurrentMasked : "not configured"}</div>
                      <div>Setup callback previous: {beamProviderSettingsQuery.data?.paymentMethodSetupCallbackSecretPreviousConfigured ? beamProviderSettingsQuery.data?.paymentMethodSetupCallbackSecretPreviousMasked : "not configured"}</div>
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label>API base URL</Label>
                      <Input value={beamProviderForm.apiBaseUrl} onChange={(e) => setBeamProviderForm((prev) => ({ ...prev, apiBaseUrl: e.target.value }))} placeholder="https://api.beam.example" />
                    </div>
                    <div>
                      <Label>API key</Label>
                      <Input value={beamProviderForm.apiKey} onChange={(e) => setBeamProviderForm((prev) => ({ ...prev, apiKey: e.target.value }))} placeholder={beamProviderSettingsQuery.data?.apiKeyConfigured ? "Leave blank to keep existing key" : "Enter API key"} />
                    </div>
                    <div>
                      <Label>Charges path</Label>
                      <Input value={beamProviderForm.chargesPath} onChange={(e) => setBeamProviderForm((prev) => ({ ...prev, chargesPath: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Payment Links path</Label>
                      <Input value={beamProviderForm.paymentLinksPath} onChange={(e) => setBeamProviderForm((prev) => ({ ...prev, paymentLinksPath: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Charge status path template</Label>
                      <Input value={beamProviderForm.chargeStatusPathTemplate} onChange={(e) => setBeamProviderForm((prev) => ({ ...prev, chargeStatusPathTemplate: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Payment Link status path template</Label>
                      <Input value={beamProviderForm.paymentLinkStatusPathTemplate} onChange={(e) => setBeamProviderForm((prev) => ({ ...prev, paymentLinkStatusPathTemplate: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Cancel path suffix</Label>
                      <Input value={beamProviderForm.cancelPathSuffix} onChange={(e) => setBeamProviderForm((prev) => ({ ...prev, cancelPathSuffix: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Setup API path</Label>
                      <Input value={beamProviderForm.paymentMethodSetupPath} onChange={(e) => setBeamProviderForm((prev) => ({ ...prev, paymentMethodSetupPath: e.target.value }))} />
                    </div>
                    <div className="md:col-span-2">
                      <Label>Hosted setup URL template</Label>
                      <Input value={beamProviderForm.paymentMethodSetupHostedUrlTemplate} onChange={(e) => setBeamProviderForm((prev) => ({ ...prev, paymentMethodSetupHostedUrlTemplate: e.target.value }))} placeholder="https://beam.example/setup?session={sessionId}&return={returnUrl}" />
                    </div>
                    <div className="md:col-span-2">
                      <Label>Setup return URL</Label>
                      <Input value={beamProviderForm.paymentMethodSetupReturnUrl} onChange={(e) => setBeamProviderForm((prev) => ({ ...prev, paymentMethodSetupReturnUrl: e.target.value }))} placeholder="https://app.example/billing" />
                    </div>
                    <div>
                      <Label>Webhook secret current</Label>
                      <Input value={beamProviderForm.webhookSecretCurrent} onChange={(e) => setBeamProviderForm((prev) => ({ ...prev, webhookSecretCurrent: e.target.value }))} placeholder={beamProviderSettingsQuery.data?.webhookSecretCurrentConfigured ? "Leave blank to keep existing secret" : "Enter webhook secret"} />
                    </div>
                    <div>
                      <Label>Webhook secret previous</Label>
                      <Input value={beamProviderForm.webhookSecretPrevious} onChange={(e) => setBeamProviderForm((prev) => ({ ...prev, webhookSecretPrevious: e.target.value }))} placeholder={beamProviderSettingsQuery.data?.webhookSecretPreviousConfigured ? "Leave blank to keep previous secret" : "Optional"} />
                    </div>
                    <div>
                      <Label>Setup callback secret current</Label>
                      <Input value={beamProviderForm.paymentMethodSetupCallbackSecretCurrent} onChange={(e) => setBeamProviderForm((prev) => ({ ...prev, paymentMethodSetupCallbackSecretCurrent: e.target.value }))} placeholder={beamProviderSettingsQuery.data?.paymentMethodSetupCallbackSecretCurrentConfigured ? "Leave blank to keep existing secret" : "Enter callback secret"} />
                    </div>
                    <div>
                      <Label>Setup callback secret previous</Label>
                      <Input value={beamProviderForm.paymentMethodSetupCallbackSecretPrevious} onChange={(e) => setBeamProviderForm((prev) => ({ ...prev, paymentMethodSetupCallbackSecretPrevious: e.target.value }))} placeholder={beamProviderSettingsQuery.data?.paymentMethodSetupCallbackSecretPreviousConfigured ? "Leave blank to keep previous secret" : "Optional"} />
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    <Button variant="outline" onClick={() => beamProviderHealthQuery.refetch()} disabled={beamProviderHealthQuery.isFetching}>
                      Refresh health
                    </Button>
                    <Button onClick={() => updateBeamProviderSettingsMutation.mutate(beamProviderForm)} disabled={updateBeamProviderSettingsMutation.isPending}>
                      {updateBeamProviderSettingsMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Save Beam settings
                    </Button>
                  </div>
                </DashboardCard>

                <DashboardCard
                  eyebrow="Billing Runtime"
                  title="Flags, rollout, and delivery policy"
                  description="Move billing runtime behavior out of file config and manage it directly from admin UI."
                  leading={<BadgeDollarSign className="h-5 w-5 text-cyan-600" />}
                >
                  <div className="grid gap-3 md:grid-cols-2">
                    {[
                      ["PAYMENT_RECONCILIATION_ENABLED", "Payment reconciliation"],
                      ["FINAL_RECONCILIATION_BEFORE_DOWNGRADE", "Final reconciliation before downgrade"],
                      ["ADMIN_MANUAL_MARK_PAID_ENABLED", "Manual mark paid"],
                      ["ADMIN_DOWNGRADE_REVERSAL_ENABLED", "Downgrade reversal"],
                      ["SUPPORT_RECOVERY_CASES_ENABLED", "Support recovery cases"],
                      ["DOCUMENT_RECOVERY_ENABLED", "Document recovery"],
                      ["INVOICE_HEADER_SYNC_ENABLED", "Invoice header sync"],
                      ["PAID_INVOICE_REISSUE_ENABLED", "Paid invoice reissue"],
                      ["AUTO_DOWNGRADE_AFTER_7_DAYS", "Auto downgrade after 7 days"],
                      ["BEAM_PAYMENT_LINK_FALLBACK", "Payment Link fallback"],
                      ["BILLING_PHASE2_SAVED_CARDS_ENABLED", "Saved cards"],
                      ["BILLING_PHASE2_AUTO_RENEW_ENABLED", "Auto renew"],
                      ["BILLING_PHASE2_DUNNING_ENABLED", "Dunning"],
                      ["BILLING_PHASE2_CARD_SETUP_ENABLED", "Card setup"],
                      ["BILLING_PHASE2_FORCE_MANUAL_FALLBACK_ENABLED", "Manual fallback actions"],
                      ["BILLING_EMAIL_NOTIFICATIONS_ENABLED", "Billing email notifications"],
                      ["BILLING_PHASE2_REQUIRE_STEP_UP", "Require step-up auth"],
                      ["BILLING_SUBSCRIPTION_CUTOVER_READY", "Subscription cutover ready"],
                    ].map(([key, label]) => (
                      <div key={key} className="flex items-center justify-between rounded-xl border border-slate-200 p-3">
                        <div className="pr-3">
                          <div className="text-sm font-medium text-slate-900">{label}</div>
                          <div className="text-xs text-slate-500">{key}</div>
                        </div>
                        <Switch
                          checked={Boolean(billingRuntimeForm[key as keyof BillingRuntimeForm])}
                          onCheckedChange={(checked) => setBillingRuntimeForm((prev) => ({ ...prev, [key]: checked }))}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div>
                      <Label>Allowed rollout cohorts</Label>
                      <Input value={billingRuntimeForm.BILLING_PHASE2_ALLOWED_COHORTS} onChange={(e) => setBillingRuntimeForm((prev) => ({ ...prev, BILLING_PHASE2_ALLOWED_COHORTS: e.target.value }))} placeholder="pilot-a,pilot-b" />
                    </div>
                    <div>
                      <Label>Default rollout cohort</Label>
                      <Input value={billingRuntimeForm.BILLING_PHASE2_DEFAULT_COHORT} onChange={(e) => setBillingRuntimeForm((prev) => ({ ...prev, BILLING_PHASE2_DEFAULT_COHORT: e.target.value }))} placeholder="pilot-a" />
                    </div>
                    <div>
                      <Label>Setup callback tolerance seconds</Label>
                      <Input value={billingRuntimeForm.BILLING_PHASE2_SETUP_CALLBACK_TOLERANCE_SECONDS} onChange={(e) => setBillingRuntimeForm((prev) => ({ ...prev, BILLING_PHASE2_SETUP_CALLBACK_TOLERANCE_SECONDS: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Webhook tolerance seconds</Label>
                      <Input value={billingRuntimeForm.BILLING_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS} onChange={(e) => setBillingRuntimeForm((prev) => ({ ...prev, BILLING_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Payment method setup expiry minutes</Label>
                      <Input value={billingRuntimeForm.BILLING_PAYMENT_METHOD_SETUP_EXPIRY_MINUTES} onChange={(e) => setBillingRuntimeForm((prev) => ({ ...prev, BILLING_PAYMENT_METHOD_SETUP_EXPIRY_MINUTES: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Step-up auth window minutes</Label>
                      <Input value={billingRuntimeForm.BILLING_PHASE2_STEP_UP_WINDOW_MINUTES} onChange={(e) => setBillingRuntimeForm((prev) => ({ ...prev, BILLING_PHASE2_STEP_UP_WINDOW_MINUTES: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Evidence retention days</Label>
                      <Input value={billingRuntimeForm.BILLING_EVIDENCE_RETENTION_DAYS} onChange={(e) => setBillingRuntimeForm((prev) => ({ ...prev, BILLING_EVIDENCE_RETENTION_DAYS: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Overdue downgrade days</Label>
                      <Input value={billingRuntimeForm.BILLING_OVERDUE_DAYS} onChange={(e) => setBillingRuntimeForm((prev) => ({ ...prev, BILLING_OVERDUE_DAYS: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Subscription due days</Label>
                      <Input value={billingRuntimeForm.BILLING_SUBSCRIPTION_RENEWAL_DUE_DAYS} onChange={(e) => setBillingRuntimeForm((prev) => ({ ...prev, BILLING_SUBSCRIPTION_RENEWAL_DUE_DAYS: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Top-up due days</Label>
                      <Input value={billingRuntimeForm.BILLING_TOPUP_DUE_DAYS} onChange={(e) => setBillingRuntimeForm((prev) => ({ ...prev, BILLING_TOPUP_DUE_DAYS: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Top-up pending retention days</Label>
                      <Input value={billingRuntimeForm.BILLING_TOPUP_PENDING_RETENTION_DAYS} onChange={(e) => setBillingRuntimeForm((prev) => ({ ...prev, BILLING_TOPUP_PENDING_RETENTION_DAYS: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Reminder threshold days</Label>
                      <Input value={billingRuntimeForm.BILLING_NOTIFICATION_REMINDER_FIRST_THRESHOLD_DAYS} onChange={(e) => setBillingRuntimeForm((prev) => ({ ...prev, BILLING_NOTIFICATION_REMINDER_FIRST_THRESHOLD_DAYS: e.target.value }))} placeholder="4" />
                    </div>
                    <div>
                      <Label>Final reminder threshold days</Label>
                      <Input value={billingRuntimeForm.BILLING_NOTIFICATION_REMINDER_FINAL_THRESHOLD_DAYS} onChange={(e) => setBillingRuntimeForm((prev) => ({ ...prev, BILLING_NOTIFICATION_REMINDER_FINAL_THRESHOLD_DAYS: e.target.value }))} placeholder="1" />
                    </div>
                    <div>
                      <Label>Reminder cooldown hours</Label>
                      <Input value={billingRuntimeForm.BILLING_NOTIFICATION_COOLDOWN_REMINDER_HOURS} onChange={(e) => setBillingRuntimeForm((prev) => ({ ...prev, BILLING_NOTIFICATION_COOLDOWN_REMINDER_HOURS: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Success/overdue cooldown hours</Label>
                      <Input value={billingRuntimeForm.BILLING_NOTIFICATION_COOLDOWN_SUCCESS_HOURS} onChange={(e) => setBillingRuntimeForm((prev) => ({ ...prev, BILLING_NOTIFICATION_COOLDOWN_SUCCESS_HOURS: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Default notification cooldown hours</Label>
                      <Input value={billingRuntimeForm.BILLING_NOTIFICATION_COOLDOWN_DEFAULT_HOURS} onChange={(e) => setBillingRuntimeForm((prev) => ({ ...prev, BILLING_NOTIFICATION_COOLDOWN_DEFAULT_HOURS: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Billing public URL</Label>
                      <Input value={billingRuntimeForm.BILLING_PUBLIC_URL} onChange={(e) => setBillingRuntimeForm((prev) => ({ ...prev, BILLING_PUBLIC_URL: e.target.value }))} placeholder="https://app.example" />
                    </div>
                    <div className="md:col-span-2">
                      <Label>Step-up signing secret</Label>
                      <Input value={billingRuntimeForm.BILLING_PHASE2_STEP_UP_SECRET} onChange={(e) => setBillingRuntimeForm((prev) => ({ ...prev, BILLING_PHASE2_STEP_UP_SECRET: e.target.value }))} placeholder={billingRuntimeSettingsQuery.data?.BILLING_PHASE2_STEP_UP_SECRETConfigured ? "Leave blank to keep existing secret" : "Enter step-up signing secret"} />
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <Button onClick={() => updateBillingRuntimeSettingsMutation.mutate(billingRuntimeForm)} disabled={updateBillingRuntimeSettingsMutation.isPending}>
                      {updateBillingRuntimeSettingsMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Save runtime settings
                    </Button>
                  </div>
                </DashboardCard>

                <DashboardCard
                  eyebrow="PromptPay Direct"
                  title="Direct payment and FX policy"
                  description="เปิดรับ PromptPay โดยตรง ระบุบัญชีรับเงิน และกำหนดอัตราขายที่รวม spread กับ buffer กันความเสี่ยงอัตราแลกเปลี่ยน"
                  leading={<Wallet className="h-5 w-5 text-emerald-600" />}
                >
                  <div className="mb-4 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div>
                      <div className="font-medium text-slate-900">Enable PromptPay Direct</div>
                      <div className="text-xs text-slate-500">ต้องบันทึกบัญชีรับเงินและชื่อบัญชีก่อนจึงจะเปิดให้ลูกค้าเห็น</div>
                    </div>
                    <Switch checked={billingRuntimeForm.PROMPTPAY_DIRECT_ENABLED} onCheckedChange={(checked) => setBillingRuntimeForm((prev) => ({ ...prev, PROMPTPAY_DIRECT_ENABLED: checked }))} />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label>PromptPay recipient ID</Label>
                      <Input type="password" value={billingRuntimeForm.PROMPTPAY_DIRECT_RECIPIENT_ID} onChange={(e) => setBillingRuntimeForm((prev) => ({ ...prev, PROMPTPAY_DIRECT_RECIPIENT_ID: e.target.value }))} placeholder={billingRuntimeSettingsQuery.data?.PROMPTPAY_DIRECT_RECIPIENT_IDConfigured ? "Leave blank to keep existing ID" : "0xxxxxxxxx"} />
                    </div>
                    <div>
                      <Label>Account display name</Label>
                      <Input value={billingRuntimeForm.PROMPTPAY_DIRECT_ACCOUNT_DISPLAY_NAME} onChange={(e) => setBillingRuntimeForm((prev) => ({ ...prev, PROMPTPAY_DIRECT_ACCOUNT_DISPLAY_NAME: e.target.value }))} placeholder="SmartAIHub" />
                    </div>
                    <div>
                      <Label>Recipient type</Label>
                      <Select value={billingRuntimeForm.PROMPTPAY_DIRECT_RECIPIENT_TYPE} onValueChange={(value) => setBillingRuntimeForm((prev) => ({ ...prev, PROMPTPAY_DIRECT_RECIPIENT_TYPE: value as BillingRuntimeForm["PROMPTPAY_DIRECT_RECIPIENT_TYPE"] }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="phone">Thai phone</SelectItem>
                          <SelectItem value="national_id">National ID</SelectItem>
                          <SelectItem value="tax_id">Tax ID</SelectItem>
                          <SelectItem value="ewallet">E-wallet ID</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Order expiry minutes</Label>
                      <Input value={billingRuntimeForm.PROMPTPAY_DIRECT_ORDER_EXPIRY_MINUTES} onChange={(e) => setBillingRuntimeForm((prev) => ({ ...prev, PROMPTPAY_DIRECT_ORDER_EXPIRY_MINUTES: e.target.value }))} />
                    </div>
                    <div>
                      <Label>FX source</Label>
                      <Input value="Frankfurter daily USD/THB" readOnly />
                    </div>
                    <div>
                      <Label>Max FX rate age (hours)</Label>
                      <Input value={billingRuntimeForm.PROMPTPAY_DIRECT_FX_MAX_RATE_AGE_HOURS} onChange={(e) => setBillingRuntimeForm((prev) => ({ ...prev, PROMPTPAY_DIRECT_FX_MAX_RATE_AGE_HOURS: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Sell spread (bps)</Label>
                      <Input value={billingRuntimeForm.PROMPTPAY_DIRECT_FX_SELL_SPREAD_BPS} onChange={(e) => setBillingRuntimeForm((prev) => ({ ...prev, PROMPTPAY_DIRECT_FX_SELL_SPREAD_BPS: e.target.value }))} />
                    </div>
                    <div>
                      <Label>FX risk buffer (bps)</Label>
                      <Input value={billingRuntimeForm.PROMPTPAY_DIRECT_FX_RISK_BUFFER_BPS} onChange={(e) => setBillingRuntimeForm((prev) => ({ ...prev, PROMPTPAY_DIRECT_FX_RISK_BUFFER_BPS: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Minimum sanity rate</Label>
                      <Input value={billingRuntimeForm.PROMPTPAY_DIRECT_FX_SANITY_MIN_RATE} onChange={(e) => setBillingRuntimeForm((prev) => ({ ...prev, PROMPTPAY_DIRECT_FX_SANITY_MIN_RATE: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Maximum sanity rate</Label>
                      <Input value={billingRuntimeForm.PROMPTPAY_DIRECT_FX_SANITY_MAX_RATE} onChange={(e) => setBillingRuntimeForm((prev) => ({ ...prev, PROMPTPAY_DIRECT_FX_SANITY_MAX_RATE: e.target.value }))} />
                    </div>
                    <div className="md:col-span-2">
                      <Label>Allowed slip MIME types</Label>
                      <Input value={billingRuntimeForm.PROMPTPAY_DIRECT_SLIP_ALLOWED_TYPES} onChange={(e) => setBillingRuntimeForm((prev) => ({ ...prev, PROMPTPAY_DIRECT_SLIP_ALLOWED_TYPES: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Max slip size (bytes)</Label>
                      <Input value={billingRuntimeForm.PROMPTPAY_DIRECT_SLIP_MAX_BYTES} onChange={(e) => setBillingRuntimeForm((prev) => ({ ...prev, PROMPTPAY_DIRECT_SLIP_MAX_BYTES: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Rounding unit (THB)</Label>
                      <Input value="1" readOnly />
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <Button onClick={() => updateBillingRuntimeSettingsMutation.mutate(billingRuntimeForm)} disabled={updateBillingRuntimeSettingsMutation.isPending}>
                      Save PromptPay settings
                    </Button>
                  </div>
                </DashboardCard>

                <DashboardCard
                  eyebrow="Tax & Numbering"
                  title="Invoice streams"
                  description="Manage domestic and international tax rules and preview the next document numbers."
                  leading={<Wallet className="h-5 w-5 text-cyan-600" />}
                >
                  <div className="mb-4 grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                      <div className="font-medium text-slate-900">Domestic tax calculation preview</div>
                      <div className="mt-2">Base price 1000.00</div>
                      <div>Tax {formatMoney(domesticTaxPreview.taxAmount)}</div>
                      <div>Total {formatMoney(domesticTaxPreview.total)}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                      <div className="font-medium text-slate-900">International tax calculation preview</div>
                      <div className="mt-2">Base price 1000.00</div>
                      <div>Tax {formatMoney(internationalTaxPreview.taxAmount)}</div>
                      <div>Total {formatMoney(internationalTaxPreview.total)}</div>
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 p-4">
                      <div className="text-sm font-semibold text-slate-900">Domestic</div>
                      <div className="mt-1 text-sm text-slate-500">Next number: {domesticPreviewQuery.data?.invoiceNumber ?? "-"}</div>
                      <div className="mt-4 space-y-3">
                        <div>
                          <Label>Tax name</Label>
                          <Input value={domesticTaxForm.taxName} onChange={(e) => setDomesticTaxForm((prev) => ({ ...prev, taxName: e.target.value }))} />
                        </div>
                        <div>
                          <Label>Tax rate %</Label>
                          <Input value={domesticTaxForm.taxRatePercent} onChange={(e) => setDomesticTaxForm((prev) => ({ ...prev, taxRatePercent: e.target.value }))} />
                        </div>
                        <div>
                          <Label>Effective from</Label>
                          <Input type="date" value={domesticTaxForm.effectiveFrom} onChange={(e) => setDomesticTaxForm((prev) => ({ ...prev, effectiveFrom: e.target.value }))} />
                        </div>
                        <div className="flex items-center justify-between rounded-xl border border-slate-200 p-3">
                          <div>
                            <div className="text-sm font-medium text-slate-900">Enable policy</div>
                            <div className="text-xs text-slate-500">Use this stream when issuing domestic invoices.</div>
                          </div>
                          <Switch checked={domesticTaxForm.isEnabled} onCheckedChange={(checked) => setDomesticTaxForm((prev) => ({ ...prev, isEnabled: checked }))} />
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => saveTaxPolicy("domestic")} disabled={upsertTaxPolicyMutation.isPending}>Save domestic</Button>
                        <Button size="sm" variant="outline" onClick={() => reserveInvoiceNumberMutation.mutate({ stream: "domestic" })} disabled={reserveInvoiceNumberMutation.isPending}>Reserve next</Button>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 p-4">
                      <div className="text-sm font-semibold text-slate-900">International</div>
                      <div className="mt-1 text-sm text-slate-500">Next number: {internationalPreviewQuery.data?.invoiceNumber ?? "-"}</div>
                      <div className="mt-4 space-y-3">
                        <div>
                          <Label>Tax name</Label>
                          <Input value={internationalTaxForm.taxName} onChange={(e) => setInternationalTaxForm((prev) => ({ ...prev, taxName: e.target.value }))} />
                        </div>
                        <div>
                          <Label>Tax rate %</Label>
                          <Input value={internationalTaxForm.taxRatePercent} onChange={(e) => setInternationalTaxForm((prev) => ({ ...prev, taxRatePercent: e.target.value }))} />
                        </div>
                        <div>
                          <Label>Effective from</Label>
                          <Input type="date" value={internationalTaxForm.effectiveFrom} onChange={(e) => setInternationalTaxForm((prev) => ({ ...prev, effectiveFrom: e.target.value }))} />
                        </div>
                        <div className="flex items-center justify-between rounded-xl border border-slate-200 p-3">
                          <div>
                            <div className="text-sm font-medium text-slate-900">Enable policy</div>
                            <div className="text-xs text-slate-500">Use this stream when issuing international invoices.</div>
                          </div>
                          <Switch checked={internationalTaxForm.isEnabled} onCheckedChange={(checked) => setInternationalTaxForm((prev) => ({ ...prev, isEnabled: checked }))} />
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => saveTaxPolicy("international")} disabled={upsertTaxPolicyMutation.isPending}>Save international</Button>
                        <Button size="sm" variant="outline" onClick={() => reserveInvoiceNumberMutation.mutate({ stream: "international" })} disabled={reserveInvoiceNumberMutation.isPending}>Reserve next</Button>
                      </div>
                    </div>
                  </div>
                </DashboardCard>

                <DashboardCard
                  eyebrow="Revision History"
                  title="Tax policy timeline"
                  description="Review active and historical policy rows kept for issuance snapshots."
                >
                  <div className="space-y-2">
                    {taxPolicies.map((policy) => (
                      <div key={policy.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-medium text-slate-900">{policy.stream} · {policy.taxName}</div>
                          <Badge className={policy.isEnabled ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}>
                            {policy.isEnabled ? "enabled" : "disabled"}
                          </Badge>
                        </div>
                        <div className="mt-1 text-slate-500">
                          {policy.taxRatePercent}% · effective {formatDateTime(policy.effectiveFrom)}
                          {policy.effectiveTo ? ` to ${formatDateTime(policy.effectiveTo)}` : ""}
                        </div>
                        {(() => {
                          const previousPolicy = taxPolicies
                            .filter((candidate) => candidate.stream === policy.stream && candidate.id !== policy.id)
                            .sort((left, right) => toDateMillis(right.effectiveFrom) - toDateMillis(left.effectiveFrom))
                            .find((candidate) => toDateMillis(candidate.effectiveFrom) < toDateMillis(policy.effectiveFrom));
                          if (!previousPolicy) return null;
                          const diff = {
                            taxRatePercent: previousPolicy.taxRatePercent !== policy.taxRatePercent
                              ? { before: previousPolicy.taxRatePercent, after: policy.taxRatePercent }
                              : undefined,
                            isEnabled: previousPolicy.isEnabled !== policy.isEnabled
                              ? { before: previousPolicy.isEnabled, after: policy.isEnabled }
                              : undefined,
                            roundingPolicy: previousPolicy.roundingPolicy !== policy.roundingPolicy
                              ? { before: previousPolicy.roundingPolicy, after: policy.roundingPolicy }
                              : undefined,
                          };
                          const filtered = Object.fromEntries(Object.entries(diff).filter(([, value]) => value));
                          return Object.keys(filtered).length > 0 ? renderJsonSummary(filtered) : null;
                        })()}
                      </div>
                    ))}
                    {taxPolicies.length === 0 ? (
                      <div className="text-sm text-slate-500">No tax policy revisions recorded yet.</div>
                    ) : null}
                  </div>
                </DashboardCard>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="renewals" className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
              <div className="space-y-6">
                <DashboardCard
                  eyebrow="Scheduler Support"
                  title="Create or reopen a renewal invoice"
                  description="Manual admin tool for generating a renewal invoice when support needs to kick off a billing cycle."
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label>Subscription ID</Label>
                      <Input value={renewalForm.subscriptionId} onChange={(e) => setRenewalForm((prev) => ({ ...prev, subscriptionId: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Base price override</Label>
                      <Input value={renewalForm.basePriceOverride} onChange={(e) => setRenewalForm((prev) => ({ ...prev, basePriceOverride: e.target.value }))} placeholder="Optional" />
                    </div>
                    <div>
                      <Label>Cycle start</Label>
                      <Input type="date" value={renewalForm.cycleStart} onChange={(e) => setRenewalForm((prev) => ({ ...prev, cycleStart: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Cycle end</Label>
                      <Input type="date" value={renewalForm.cycleEnd} onChange={(e) => setRenewalForm((prev) => ({ ...prev, cycleEnd: e.target.value }))} />
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <Button
                      onClick={() =>
                        createRenewalInvoiceMutation.mutate({
                          subscriptionId: Number(renewalForm.subscriptionId),
                          basePriceOverride: renewalForm.basePriceOverride ? Number(renewalForm.basePriceOverride) : null,
                          cycleStart: renewalForm.cycleStart ? new Date(`${renewalForm.cycleStart}T00:00:00.000Z`) : null,
                          cycleEnd: renewalForm.cycleEnd ? new Date(`${renewalForm.cycleEnd}T00:00:00.000Z`) : null,
                        })
                      }
                      disabled={createRenewalInvoiceMutation.isPending || !renewalForm.subscriptionId}
                    >
                      {createRenewalInvoiceMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                      Create renewal invoice
                    </Button>
                  </div>
                </DashboardCard>

                <DashboardCard
                  eyebrow="Saved Methods"
                  title="Payment methods and auto-renew settings"
                  description="Inspect the payment method references and subscription renewal mode for the selected invoice."
                >
                  {selectedInvoice?.subscriptionId ? (
                    <div className="space-y-4 text-sm text-slate-700">
                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                      <div className="font-medium text-slate-900">Subscription payment settings</div>
                      <div className="mt-2 grid gap-2 md:grid-cols-2">
                          <div>Renewal mode: {selectedSubscriptionSettingsQuery.data?.settings?.renewalMode ?? "manual_invoice"}</div>
                          <div>Auto-renew enabled: {selectedSubscriptionSettingsQuery.data?.settings?.autoRenewEnabled ? "Yes" : "No"}</div>
                          <div>Default method: {selectedSubscriptionSettingsQuery.data?.settings?.defaultPaymentMethodId ?? "-"}</div>
                          <div>Consent withdrawn: {formatDateTime(selectedSubscriptionSettingsQuery.data?.settings?.consentWithdrawnAt)}</div>
                      </div>
                      <div className="mt-2 grid gap-2 md:grid-cols-2">
                        <div>Rollout cohort: {selectedSubscriptionSettingsQuery.data?.settings?.rolloutCohort ?? "-"}</div>
                        <div>Subscription ID: {selectedInvoice.subscriptionId ?? "-"}</div>
                      </div>
                      <div className="mt-3">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => selectedInvoice.subscriptionId && forceDisableAutoRenewMutation.mutate({
                            subscriptionId: selectedInvoice.subscriptionId,
                            reason: manualPaidReason || "Admin force-disabled auto-renew",
                          })}
                          disabled={forceDisableAutoRenewMutation.isPending || !selectedInvoice.subscriptionId}
                        >
                          Force disable auto-renew
                        </Button>
                      </div>
                    </div>
                      <div className="space-y-2">
                        {selectedInvoicePaymentMethods.map((method) => (
                          <div key={method.id} className="rounded-xl border border-slate-200 bg-white p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="font-medium text-slate-900">
                                  {method.brand || "Card"} {method.last4 ? `•••• ${method.last4}` : ""}
                                  {method.isDefault ? " · default" : ""}
                                </div>
                                <div className="text-slate-500">
                                  Status: {method.status} · Eligible: {method.autoRenewEligible ? "Yes" : "No"} · Expires {method.expMonth ?? "--"}/{method.expYear ?? "--"}
                                </div>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => revokePaymentMethodMutation.mutate({
                                  paymentMethodId: method.id,
                                  reason: manualPaidReason || "Admin revoked payment method",
                                })}
                                disabled={revokePaymentMethodMutation.isPending}
                              >
                                Revoke
                              </Button>
                            </div>
                          </div>
                        ))}
                        {selectedInvoicePaymentMethods.length === 0 ? (
                          <div className="text-sm text-slate-500">No saved payment methods found for this subscription owner.</div>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-slate-500">Pick an invoice with a subscription to inspect payment methods here.</div>
                  )}
                </DashboardCard>
              </div>

              <DashboardCard
                eyebrow="Selected Invoice"
                title="Document and subscription context"
                description="Quick operator view for support work around invoice stream, billing cycle, and snapshots."
              >
                {selectedInvoice ? (
                  <div className="space-y-4 text-sm text-slate-700">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-slate-200 p-3">
                        <div className="font-medium text-slate-900">Invoice metadata</div>
                        <div className="mt-2 space-y-1 text-slate-500">
                          <div>Stream: {selectedInvoice.invoiceStream}</div>
                          <div>Type: {selectedInvoice.invoiceType}</div>
                          <div>Cycle start: {formatDateTime(selectedInvoice.billingCycleStart)}</div>
                          <div>Cycle end: {formatDateTime(selectedInvoice.billingCycleEnd)}</div>
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-200 p-3">
                        <div className="font-medium text-slate-900">Buyer snapshot</div>
                        <pre className="mt-2 overflow-auto rounded-lg bg-slate-950/95 p-3 text-xs text-slate-100">
                          {JSON.stringify(selectedInvoice.buyerSnapshotJson ?? {}, null, 2)}
                        </pre>
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 p-3">
                      <div className="font-medium text-slate-900">Seller snapshot</div>
                      <pre className="mt-2 overflow-auto rounded-lg bg-slate-950/95 p-3 text-xs text-slate-100">
                        {JSON.stringify(selectedInvoice.sellerSnapshotJson ?? {}, null, 2)}
                      </pre>
                    </div>
                    <div className="rounded-xl border border-slate-200 p-3">
                      <div className="font-medium text-slate-900">Renewal attempts</div>
                      <div className="mt-3 space-y-3">
                        {renewalAttempts.map((attempt) => (
                          <div key={attempt.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="font-medium text-slate-900">Attempt #{attempt.attemptNo}</div>
                                <div className="text-slate-500">
                                  {attempt.status} · Scheduled {formatDateTime(attempt.scheduledAt)} · Next retry {formatDateTime(attempt.nextRetryAt)}
                                </div>
                              </div>
                              <Badge className={statusClass(attempt.status)}>{attempt.status}</Badge>
                            </div>
                            {attempt.failureMessage ? <div className="mt-2 text-slate-700">{attempt.failureMessage}</div> : null}
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => pauseRenewalDunningMutation.mutate({
                                  renewalAttemptId: attempt.id,
                                  reason: manualPaidReason || "Pause dunning for investigation",
                                })}
                                disabled={pauseRenewalDunningMutation.isPending}
                              >
                                Pause dunning
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => resumeRenewalDunningMutation.mutate({
                                  renewalAttemptId: attempt.id,
                                  nextRetryAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
                                })}
                                disabled={resumeRenewalDunningMutation.isPending}
                              >
                                Resume dunning
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => forceRetryRenewalAttemptMutation.mutate({
                                  renewalAttemptId: attempt.id,
                                  reason: manualPaidReason || "Force retry renewal attempt",
                                })}
                                disabled={forceRetryRenewalAttemptMutation.isPending}
                              >
                                Force retry
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => fallbackToManualCollectionMutation.mutate({
                                  invoiceId: selectedInvoice.id,
                                  reason: manualPaidReason || "Fallback to manual collection",
                                })}
                                disabled={fallbackToManualCollectionMutation.isPending}
                              >
                                Fallback to manual
                              </Button>
                            </div>
                          </div>
                        ))}
                        {renewalAttempts.length === 0 ? (
                          <div className="text-sm text-slate-500">No renewal attempts recorded for this subscription yet.</div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-slate-500">Pick an invoice in Operations to inspect its renewal context here.</div>
                )}
              </DashboardCard>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
