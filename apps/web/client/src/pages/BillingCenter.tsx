import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowLeft,
  CreditCard,
  Download,
  FileText,
  Loader2,
  RefreshCw,
  Receipt,
  Save,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { DashboardCard, DashboardKpiCard } from "@/components/dashboard";
import { Switch } from "@/components/ui/switch";

function formatMoney(value: unknown, currency = "THB") {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function badgeClassForStatus(status: string | null | undefined) {
  switch (status) {
    case "paid":
      return "bg-emerald-100 text-emerald-800";
    case "payment_pending":
    case "issued":
      return "bg-amber-100 text-amber-800";
    case "canceled_overdue":
    case "expired":
    case "canceled":
      return "bg-rose-100 text-rose-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function formatDateTime(value: unknown) {
  if (!value) return "-";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function formatCountdown(target: unknown) {
  if (!target) return null;
  const diffMs = new Date(String(target)).getTime() - Date.now();
  if (!Number.isFinite(diffMs)) return null;
  if (diffMs <= 0) return "Expired";
  const totalMinutes = Math.ceil(diffMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) {
    return `${minutes}m remaining`;
  }
  return `${hours}h ${minutes}m remaining`;
}

const PROMPTPAY_SLIP_ACCEPT = "image/png,image/jpeg,image/webp,application/pdf";
const PROMPTPAY_SLIP_TYPES = new Set(PROMPTPAY_SLIP_ACCEPT.split(","));
const PROMPTPAY_SLIP_MAX_BYTES = 10 * 1024 * 1024;

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function BillingCenter() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [, invoiceRouteParams] = useRoute("/billing/invoices/:invoiceId");
  const selectedInvoiceIdFromRoute = Number(invoiceRouteParams?.invoiceId ?? 0) || null;
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(selectedInvoiceIdFromRoute);
  const [profileForm, setProfileForm] = useState({
    legalNameTh: "",
    legalNameEn: "",
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
    contactName: "",
    invoiceNote: "",
  });
  const [paymentMethodForm, setPaymentMethodForm] = useState({
    providerPaymentMethodId: "",
    providerCustomerId: "",
    brand: "",
    last4: "",
    expMonth: "",
    expYear: "",
    cardholderName: "",
  });
  const [autoRenewConsentEnabled, setAutoRenewConsentEnabled] = useState(false);
  const [autoRenewMethodId, setAutoRenewMethodId] = useState<number | null>(null);
  const [promptPaySlipFile, setPromptPaySlipFile] = useState<File | null>(null);
  const [promptPaySlipPreviewUrl, setPromptPaySlipPreviewUrl] = useState<string | null>(null);
  const [promptPaySlipDragActive, setPromptPaySlipDragActive] = useState(false);
  const promptPaySlipInputRef = useRef<HTMLInputElement | null>(null);

  const utils = trpc.useUtils();
  const profileQuery = trpc.billing.getProfile.useQuery(undefined, { enabled: !!user });
  const invoicesQuery = trpc.billing.listInvoices.useQuery(undefined, { enabled: !!user });
  const subscriptionQuery = trpc.billing.getCurrentSubscription.useQuery(undefined, { enabled: !!user });
  const paymentMethodsQuery = trpc.billing.listPaymentMethods.useQuery(undefined, { enabled: !!user });
  const paymentSettingsQuery = trpc.billing.getSubscriptionPaymentSettings.useQuery(undefined, { enabled: !!user });
  const paymentCapabilitiesQuery = trpc.billing.getPaymentMethodCapabilities.useQuery(undefined, { enabled: !!user });
  const renewalAttemptsQuery = trpc.billing.listRenewalAttempts.useQuery(undefined, { enabled: !!user });
  const selectedInvoiceQuery = trpc.billing.getInvoice.useQuery(
    { invoiceId: selectedInvoiceId ?? 0 },
    { enabled: !!selectedInvoiceId },
  );
  const documentsQuery = trpc.billing.listDocuments.useQuery(
    { invoiceId: selectedInvoiceId ?? 0 },
    { enabled: !!selectedInvoiceId },
  );
  const recoveryCasesQuery = trpc.billing.listRecoveryCases.useQuery(
    { invoiceId: selectedInvoiceId ?? null, limit: 20 },
    { enabled: !!user },
  );

  const updateProfileMutation = trpc.billing.upsertProfile.useMutation({
    onSuccess: async () => {
      toast.success("Billing profile updated");
      await profileQuery.refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  const refreshInvoiceMutation = trpc.billing.refreshInvoiceStatus.useMutation({
    onSuccess: async () => {
      toast.success("Invoice status refreshed");
      await Promise.all([selectedInvoiceQuery.refetch(), invoicesQuery.refetch()]);
    },
    onError: (error) => toast.error(error.message),
  });
  const createSetupIntentMutation = trpc.billing.createPaymentMethodSetupIntent.useMutation({
    onSuccess: (result) => {
      toast.success("Card setup started");
      if (result.hostedUrl) {
        window.open(result.hostedUrl, "_blank", "noopener,noreferrer");
      }
    },
    onError: (error) => toast.error(error.message),
  });
  const confirmSetupMutation = trpc.billing.confirmPaymentMethodSetup.useMutation({
    onSuccess: async () => {
      toast.success("Payment method saved");
      setPaymentMethodForm({
        providerPaymentMethodId: "",
        providerCustomerId: "",
        brand: "",
        last4: "",
        expMonth: "",
        expYear: "",
        cardholderName: "",
      });
      await Promise.all([paymentMethodsQuery.refetch(), paymentSettingsQuery.refetch()]);
    },
    onError: (error) => toast.error(error.message),
  });
  const setDefaultPaymentMethodMutation = trpc.billing.setDefaultPaymentMethod.useMutation({
    onSuccess: async () => {
      toast.success("Default payment method updated");
      await Promise.all([paymentMethodsQuery.refetch(), paymentSettingsQuery.refetch()]);
    },
    onError: (error) => toast.error(error.message),
  });
  const removePaymentMethodMutation = trpc.billing.removePaymentMethod.useMutation({
    onSuccess: async () => {
      toast.success("Payment method removed");
      await Promise.all([paymentMethodsQuery.refetch(), paymentSettingsQuery.refetch()]);
    },
    onError: (error) => toast.error(error.message),
  });
  const enableAutoRenewMutation = trpc.billing.enableAutoRenew.useMutation({
    onSuccess: async () => {
      toast.success("Auto-renew enabled");
      await Promise.all([paymentSettingsQuery.refetch(), paymentMethodsQuery.refetch(), subscriptionQuery.refetch()]);
    },
    onError: (error) => toast.error(error.message),
  });
  const disableAutoRenewMutation = trpc.billing.disableAutoRenew.useMutation({
    onSuccess: async () => {
      toast.success("Auto-renew disabled");
      await Promise.all([paymentSettingsQuery.refetch(), paymentMethodsQuery.refetch(), subscriptionQuery.refetch()]);
    },
    onError: (error) => toast.error(error.message),
  });

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [isAuthenticated, isLoading, setLocation]);

  useEffect(() => {
    if (profileQuery.data) {
      setProfileForm({
        legalNameTh: profileQuery.data.legalNameTh ?? "",
        legalNameEn: profileQuery.data.legalNameEn ?? "",
        taxId: profileQuery.data.taxId ?? "",
        phone: profileQuery.data.phone ?? "",
        email: profileQuery.data.email ?? "",
        addressLine1: profileQuery.data.addressLine1 ?? "",
        addressLine2: profileQuery.data.addressLine2 ?? "",
        subdistrict: profileQuery.data.subdistrict ?? "",
        district: profileQuery.data.district ?? "",
        province: profileQuery.data.province ?? "",
        postalCode: profileQuery.data.postalCode ?? "",
        country: profileQuery.data.country ?? "Thailand",
        contactName: profileQuery.data.contactName ?? "",
        invoiceNote: profileQuery.data.invoiceNote ?? "",
      });
    }
  }, [profileQuery.data]);

  useEffect(() => {
    if (selectedInvoiceIdFromRoute) {
      setSelectedInvoiceId(selectedInvoiceIdFromRoute);
    }
  }, [selectedInvoiceIdFromRoute]);

  useEffect(() => {
    if (!promptPaySlipFile) {
      setPromptPaySlipPreviewUrl(null);
      return;
    }
    const previewUrl = URL.createObjectURL(promptPaySlipFile);
    setPromptPaySlipPreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [promptPaySlipFile]);

  useEffect(() => {
    setPromptPaySlipFile(null);
    setPromptPaySlipDragActive(false);
  }, [selectedInvoiceId]);

  const selectedInvoice = selectedInvoiceQuery.data ?? null;
  const routeSearchParams = useMemo(
    () => (typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search)),
    [selectedInvoiceId, selectedInvoiceIdFromRoute],
  );
  const pendingTopupContext = useMemo(() => {
    const credits = routeSearchParams.get("credits");
    const basePrice = routeSearchParams.get("basePrice");
    const packageCode = routeSearchParams.get("packageCode");
    const description = routeSearchParams.get("description");
    const packageLabel = routeSearchParams.get("packageLabel");
    return {
      credits: credits ? Number(credits) : null,
      basePrice: basePrice ? Number(basePrice) : null,
      packageCode: packageCode || null,
      description: description || null,
      packageLabel: packageLabel || null,
      paymentChannel: routeSearchParams.get("paymentChannel") || (routeSearchParams.get("paymentMethod") === "card" ? "beam_card" : "beam_promptpay"),
      topupView: routeSearchParams.get("view") === "topup",
    };
  }, [routeSearchParams]);
  const latestDocument = useMemo(() => {
    const docs = documentsQuery.data ?? [];
    return docs.find((doc) => doc.isLatestForLanguage) ?? docs[0] ?? null;
  }, [documentsQuery.data]);
  const nextInvoiceHeaderLines = useMemo(() => {
    return [
      profileForm.legalNameTh || profileForm.legalNameEn || "Unnamed billing profile",
      profileForm.addressLine1,
      profileForm.addressLine2,
      [profileForm.subdistrict, profileForm.district, profileForm.province, profileForm.postalCode].filter(Boolean).join(" "),
      profileForm.country,
      profileForm.taxId ? `Tax ID: ${profileForm.taxId}` : "",
      profileForm.email,
      profileForm.phone,
    ].filter(Boolean);
  }, [profileForm]);
  const paymentMethods = paymentMethodsQuery.data ?? [];
  const selectedAutoRenewMethodId = autoRenewMethodId
    ?? paymentSettingsQuery.data?.settings?.defaultPaymentMethodId
    ?? paymentMethods.find((method) => method.isDefault)?.id
    ?? null;
  const renewalAttempts = renewalAttemptsQuery.data ?? [];
  const paymentMethodWarnings = paymentMethods.filter((method) => ["expired", "revoked", "requires_verification"].includes(method.status));
  const criticalRenewalAttempt = renewalAttempts.find((attempt) => ["requires_new_card", "manual_fallback_active", "manual_review_required"].includes(attempt.status));

  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-cyan-50/40">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-600" />
      </div>
    );
  }

  const recentInvoices = invoicesQuery.data ?? [];
  const recoveryCases = recoveryCasesQuery.data ?? [];
  const manualReviewInvoices = recentInvoices.filter((invoice) =>
    ["manual_review_required", "provider_pending_unknown"].includes(invoice.status),
  );
  const recentTopupInvoices = recentInvoices.filter((invoice) => invoice.invoiceType === "topup");
  const recentSubscriptionInvoices = recentInvoices.filter((invoice) => invoice.invoiceType !== "topup");
  const topupFocused = selectedInvoice?.invoiceType === "topup" || pendingTopupContext.topupView;
  const subscriptionFocused = !topupFocused;
  const selectedTopupInvoice = selectedInvoice?.invoiceType === "topup" ? selectedInvoice : recentTopupInvoices[0] ?? null;
  const selectedTopupPayment = selectedInvoice?.invoiceType === "topup"
    ? selectedInvoice.activePayment ?? null
    : null;
  const isDirectTopup = selectedTopupPayment?.paymentChannel === "promptpay_direct_manual";
  const directPaymentQuery = trpc.billing.getPromptPayDirectPayment.useQuery(
    { invoiceId: selectedInvoiceId ?? 0 },
    { enabled: !!selectedInvoiceId && pendingTopupContext.paymentChannel === "promptpay_direct_manual" },
  );
  const uploadPromptPaySlipMutation = trpc.billing.uploadPromptPaySlip.useMutation({
    onSuccess: async () => {
      toast.success("ส่งสลิปสำเร็จ รอทีมงานตรวจสอบ");
      setPromptPaySlipFile(null);
      setPromptPaySlipDragActive(false);
      if (promptPaySlipInputRef.current) promptPaySlipInputRef.current.value = "";
      await Promise.all([selectedInvoiceQuery.refetch(), directPaymentQuery.refetch(), invoicesQuery.refetch()]);
    },
    onError: (error) => toast.error(error.message),
  });

  const handlePromptPaySlipFileSelected = (file: File | undefined) => {
    if (!file) return;
    if (!PROMPTPAY_SLIP_TYPES.has(file.type)) {
      toast.error("รองรับเฉพาะไฟล์ PNG, JPEG, WEBP หรือ PDF");
      return;
    }
    if (file.size > PROMPTPAY_SLIP_MAX_BYTES) {
      toast.error("ไฟล์สลิปต้องมีขนาดไม่เกิน 10 MB");
      return;
    }
    setPromptPaySlipFile(file);
  };

  const handlePromptPaySlipUpload = async () => {
    if (!promptPaySlipFile) {
      toast.error("กรุณาเลือกไฟล์สลิปก่อน");
      return;
    }
    const paymentId = directPaymentQuery.data?.payment.id ?? selectedTopupPayment?.id;
    if (!paymentId) {
      toast.error("ยังไม่พบรายการชำระเงินสำหรับอัปโหลดสลิป");
      return;
    }
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const value = String(reader.result ?? "");
          resolve(value.includes(",") ? value.slice(value.indexOf(",") + 1) : value);
        };
        reader.onerror = () => reject(reader.error ?? new Error("Unable to read slip"));
        reader.readAsDataURL(promptPaySlipFile);
      });
      uploadPromptPaySlipMutation.mutate({
        paymentId,
        fileName: promptPaySlipFile.name,
        contentType: promptPaySlipFile.type,
        base64Content: base64,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ไม่สามารถอ่านไฟล์สลิปได้");
    }
  };
  const stats = [
    { label: "Current plan", value: subscriptionQuery.data?.planCode ?? user.plan, icon: Sparkles },
    { label: "Subscription", value: subscriptionQuery.data?.status ?? "free", icon: CreditCard },
    { label: "Invoices", value: String(recentInvoices.length), icon: Receipt },
    { label: "Need review", value: String(manualReviewInvoices.length), icon: RefreshCw },
  ];

  async function handleDownload(invoiceId: number) {
    try {
      const docs = await utils.billing.listDocuments.fetch({ invoiceId });
      const latest = docs.find((doc) => doc.isLatestForLanguage) ?? docs[0];
      if (!latest) {
        toast.error("No PDF available yet");
        return;
      }
      const access = await utils.billing.getDocumentAccess.fetch({
        invoiceId,
        documentId: latest.id,
      });
      if (access?.url) {
        window.open(access.url, "_blank", "noopener,noreferrer");
      } else {
        toast.error("Document is still being prepared");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to open PDF");
    }
  }

  useEffect(() => {
    if (!pendingTopupContext.topupView) return;
    if (selectedInvoiceId) return;
    const latestTopupInvoiceId = recentTopupInvoices[0]?.id;
    if (!latestTopupInvoiceId) return;
    setSelectedInvoiceId(latestTopupInvoiceId);
  }, [pendingTopupContext.topupView, recentTopupInvoices, selectedInvoiceId]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-cyan-50/40 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/settings?tab=billing")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Settings
            </Button>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Billing Center</div>
              <h1 className="text-2xl font-semibold text-slate-900">
                {topupFocused ? "Credit top-up payment" : "Invoices, profile, and Beam checkout"}
              </h1>
            </div>
          </div>
          <Button variant="outline" onClick={() => setLocation("/credits")}>
            Credits
          </Button>
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

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <DashboardCard
              eyebrow="Profile"
              title="Billing profile"
              description="This profile is snapshotted into future invoices before they are issued."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Legal name (TH)</Label>
                  <Input value={profileForm.legalNameTh} onChange={(e) => setProfileForm((prev) => ({ ...prev, legalNameTh: e.target.value }))} />
                </div>
                <div>
                  <Label>Legal name (EN)</Label>
                  <Input value={profileForm.legalNameEn} onChange={(e) => setProfileForm((prev) => ({ ...prev, legalNameEn: e.target.value }))} />
                </div>
                <div>
                  <Label>Tax ID</Label>
                  <Input value={profileForm.taxId} onChange={(e) => setProfileForm((prev) => ({ ...prev, taxId: e.target.value }))} />
                </div>
                <div>
                  <Label>Contact name</Label>
                  <Input value={profileForm.contactName} onChange={(e) => setProfileForm((prev) => ({ ...prev, contactName: e.target.value }))} />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input value={profileForm.email} onChange={(e) => setProfileForm((prev) => ({ ...prev, email: e.target.value }))} />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input value={profileForm.phone} onChange={(e) => setProfileForm((prev) => ({ ...prev, phone: e.target.value }))} />
                </div>
                <div className="md:col-span-2">
                  <Label>Address line 1</Label>
                  <Input value={profileForm.addressLine1} onChange={(e) => setProfileForm((prev) => ({ ...prev, addressLine1: e.target.value }))} />
                </div>
                <div className="md:col-span-2">
                  <Label>Address line 2</Label>
                  <Input value={profileForm.addressLine2} onChange={(e) => setProfileForm((prev) => ({ ...prev, addressLine2: e.target.value }))} />
                </div>
                <div>
                  <Label>District</Label>
                  <Input value={profileForm.district} onChange={(e) => setProfileForm((prev) => ({ ...prev, district: e.target.value }))} />
                </div>
                <div>
                  <Label>Province</Label>
                  <Input value={profileForm.province} onChange={(e) => setProfileForm((prev) => ({ ...prev, province: e.target.value }))} />
                </div>
                <div>
                  <Label>Postal code</Label>
                  <Input value={profileForm.postalCode} onChange={(e) => setProfileForm((prev) => ({ ...prev, postalCode: e.target.value }))} />
                </div>
                <div>
                  <Label>Country</Label>
                  <Input value={profileForm.country} onChange={(e) => setProfileForm((prev) => ({ ...prev, country: e.target.value }))} />
                </div>
                <div className="md:col-span-2">
                  <Label>Invoice note</Label>
                  <Textarea value={profileForm.invoiceNote} onChange={(e) => setProfileForm((prev) => ({ ...prev, invoiceNote: e.target.value }))} />
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <Button
                  onClick={() => updateProfileMutation.mutate(profileForm)}
                  disabled={updateProfileMutation.isPending}
                >
                  {updateProfileMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save billing profile
                </Button>
              </div>
              <div className="mt-4 rounded-2xl border border-cyan-100 bg-cyan-50/70 p-4 text-sm text-slate-700">
                <div className="font-medium text-slate-900">Next invoice header preview</div>
                <div className="mt-1 text-slate-500">This billing profile will be used for the next invoice that has not been issued yet.</div>
                <div className="mt-3 space-y-1">
                  {nextInvoiceHeaderLines.map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                </div>
              </div>
            </DashboardCard>

            {subscriptionFocused ? (
              <DashboardCard
                eyebrow="Subscription"
                title="Current billing subscription"
                description="Track renewal timing, downgrade state, and whether billing is under review."
              >
              <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                <div>
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Status</div>
                  <div className="mt-1 font-medium text-slate-900">{subscriptionQuery.data?.status ?? "free"}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Plan</div>
                  <div className="mt-1 font-medium text-slate-900">{subscriptionQuery.data?.planCode ?? user.plan}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Current period</div>
                  <div className="mt-1">{formatDateTime(subscriptionQuery.data?.currentPeriodStart)} to {formatDateTime(subscriptionQuery.data?.currentPeriodEnd)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Next invoice</div>
                  <div className="mt-1">{formatDateTime(subscriptionQuery.data?.nextInvoiceAt)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Downgraded at</div>
                  <div className="mt-1">{formatDateTime(subscriptionQuery.data?.downgradedAt)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Downgrade reason</div>
                  <div className="mt-1">{subscriptionQuery.data?.downgradeReason ?? "-"}</div>
                </div>
              </div>
              {manualReviewInvoices.length > 0 ? (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  {manualReviewInvoices.length} invoice{manualReviewInvoices.length > 1 ? "s are" : " is"} currently waiting for reconciliation or manual review.
                </div>
              ) : null}
              </DashboardCard>
            ) : (
              <DashboardCard
                eyebrow="One-time top-up"
                title="Selected credit purchase"
                description="This invoice is only for a one-time credit top-up. It does not change your subscription plan or renewal settings."
              >
                <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                  <div>
                    <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Package</div>
                    <div className="mt-1 font-medium text-slate-900">
                      {pendingTopupContext.packageLabel ?? pendingTopupContext.description ?? "Credit top-up"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Credits</div>
                    <div className="mt-1 font-medium text-slate-900">
                      {pendingTopupContext.credits?.toLocaleString() ?? "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Base price</div>
                    <div className="mt-1 font-medium text-slate-900">
                      {pendingTopupContext.basePrice != null ? formatMoney(pendingTopupContext.basePrice, "USD") : "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Package code</div>
                    <div className="mt-1 font-medium text-slate-900">{pendingTopupContext.packageCode ?? "-"}</div>
                  </div>
                </div>
                <div className="mt-4 rounded-2xl border border-cyan-100 bg-cyan-50/70 p-4 text-sm text-slate-700">
                  The amount and package were already chosen on the Credits page. If you want a different package, go back and choose another one there instead of editing values here.
                </div>
                <div className="mt-4">
                  <Button variant="outline" onClick={() => setLocation("/credits")}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to credit packages
                  </Button>
                </div>
              </DashboardCard>
            )}

            <DashboardCard
              eyebrow="Invoices"
              title={topupFocused ? "Recent credit top-up invoices" : "Recent invoices"}
              description={
                topupFocused
                  ? "Review one-time credit purchase invoices and open the latest PDF."
                  : "Open invoice detail, refresh payment status, or download the latest PDF."
              }
            >
              <div className="space-y-3">
                {(topupFocused ? recentTopupInvoices : recentInvoices).map((invoice) => (
                  <div key={invoice.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="font-medium text-slate-900">{invoice.invoiceNumber ?? `Invoice #${invoice.id}`}</div>
                        <Badge className={badgeClassForStatus(invoice.status)}>{invoice.status}</Badge>
                      </div>
                      <div className="mt-1 text-sm text-slate-500">
                        {invoice.invoiceType} · {formatMoney(invoice.totalAmount, invoice.currency)}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedInvoiceId(invoice.id);
                          setLocation(`/billing/invoices/${invoice.id}`);
                        }}
                      >
                        <FileText className="mr-2 h-4 w-4" />
                        View
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleDownload(invoice.id)}>
                        <Download className="mr-2 h-4 w-4" />
                        PDF
                      </Button>
                    </div>
                  </div>
                ))}
                {(topupFocused ? recentTopupInvoices.length === 0 : recentInvoices.length === 0) ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
                    {topupFocused
                      ? "No top-up invoices yet. Go back to Credits and choose a package to create a one-time Beam payment."
                      : "No invoices yet. Go back to Credits for one-time top-ups or use subscription billing when available."}
                  </div>
                ) : null}
                {subscriptionFocused && recentTopupInvoices.length > 0 && recentSubscriptionInvoices.length > 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-600">
                    Recent list includes both one-time top-ups and subscription renewals. Open an invoice to see its exact payment type.
                  </div>
                ) : null}
              </div>
            </DashboardCard>
          </div>

          <div className="space-y-6">
            {!topupFocused ? (
            <DashboardCard
              eyebrow="Cards & Auto-Renew"
              title="Saved payment methods"
              description="Store a Beam-backed card reference, set the default method, and control off-session renewal."
            >
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-700">
                <div className="font-medium text-slate-900">Provider capability</div>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <div>Setup enabled: {paymentCapabilitiesQuery.data?.setupEnabled ? "Yes" : "No"}</div>
                  <div>Hosted flow: {paymentCapabilitiesQuery.data?.hostedSetupTemplateConfigured ? "Configured" : "Not configured"}</div>
                  <div>Provider API setup: {paymentCapabilitiesQuery.data?.apiSetupConfigured ? "Configured" : "Not configured"}</div>
                  <div>Off-session charges: {paymentCapabilitiesQuery.data?.offSessionChargeEnabled ? "Enabled" : "Disabled"}</div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => createSetupIntentMutation.mutate({ returnUrl: typeof window !== "undefined" ? `${window.location.origin}/billing` : null })}
                  disabled={createSetupIntentMutation.isPending}
                >
                  {createSetupIntentMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
                  Start Beam card setup
                </Button>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Provider payment method ID</Label>
                  <Input value={paymentMethodForm.providerPaymentMethodId} onChange={(e) => setPaymentMethodForm((prev) => ({ ...prev, providerPaymentMethodId: e.target.value }))} />
                </div>
                <div>
                  <Label>Provider customer ID</Label>
                  <Input value={paymentMethodForm.providerCustomerId} onChange={(e) => setPaymentMethodForm((prev) => ({ ...prev, providerCustomerId: e.target.value }))} />
                </div>
                <div>
                  <Label>Brand</Label>
                  <Input value={paymentMethodForm.brand} onChange={(e) => setPaymentMethodForm((prev) => ({ ...prev, brand: e.target.value }))} />
                </div>
                <div>
                  <Label>Last 4 digits</Label>
                  <Input value={paymentMethodForm.last4} onChange={(e) => setPaymentMethodForm((prev) => ({ ...prev, last4: e.target.value }))} />
                </div>
                <div>
                  <Label>Expiry month</Label>
                  <Input value={paymentMethodForm.expMonth} onChange={(e) => setPaymentMethodForm((prev) => ({ ...prev, expMonth: e.target.value }))} />
                </div>
                <div>
                  <Label>Expiry year</Label>
                  <Input value={paymentMethodForm.expYear} onChange={(e) => setPaymentMethodForm((prev) => ({ ...prev, expYear: e.target.value }))} />
                </div>
                <div className="md:col-span-2">
                  <Label>Cardholder name</Label>
                  <Input value={paymentMethodForm.cardholderName} onChange={(e) => setPaymentMethodForm((prev) => ({ ...prev, cardholderName: e.target.value }))} />
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <Button
                  onClick={() => confirmSetupMutation.mutate({
                    providerPaymentMethodId: paymentMethodForm.providerPaymentMethodId,
                    providerCustomerId: paymentMethodForm.providerCustomerId || null,
                    brand: paymentMethodForm.brand || null,
                    last4: paymentMethodForm.last4 || null,
                    expMonth: paymentMethodForm.expMonth ? Number(paymentMethodForm.expMonth) : null,
                    expYear: paymentMethodForm.expYear ? Number(paymentMethodForm.expYear) : null,
                    cardholderName: paymentMethodForm.cardholderName || null,
                    setAsDefault: true,
                    autoRenewEligible: true,
                    consentVersion: autoRenewConsentEnabled ? "phase2-autorenew-v1" : null,
                    consentSnapshot: autoRenewConsentEnabled
                      ? {
                        consentText: "I authorize SmartAIHub to charge this saved payment method for future subscription renewals.",
                        locale: "en",
                        enrollmentSource: "billing_center",
                        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
                      }
                      : null,
                  })}
                  disabled={confirmSetupMutation.isPending || !paymentMethodForm.providerPaymentMethodId.trim()}
                >
                  {confirmSetupMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save payment method
                </Button>
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium text-slate-900">Auto-renew</div>
                    <div className="text-sm text-slate-500">
                      Renewal mode: {paymentSettingsQuery.data?.settings?.renewalMode ?? subscriptionQuery.data?.renewalMode ?? "manual_invoice"}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch checked={autoRenewConsentEnabled} onCheckedChange={setAutoRenewConsentEnabled} />
                    <span className="text-sm text-slate-600">Consent captured</span>
                  </div>
                </div>
                <div className="mt-3 text-sm text-slate-500">
                  Next auto-charge date: {formatDateTime(subscriptionQuery.data?.nextInvoiceAt)} · Next retry: {formatDateTime(subscriptionQuery.data?.nextRetryAt)}
                </div>
                {criticalRenewalAttempt ? (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    Renewal attention needed: {criticalRenewalAttempt.status}. Update your default card or switch back to manual invoices before the grace window ends.
                  </div>
                ) : null}
                {paymentMethodWarnings.length > 0 ? (
                  <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                    {paymentMethodWarnings.length} saved payment method{paymentMethodWarnings.length > 1 ? "s need" : " needs"} attention. Expired, revoked, or verification-required cards will not be used for future off-session renewals.
                  </div>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    onClick={() => selectedAutoRenewMethodId && enableAutoRenewMutation.mutate({
                      paymentMethodId: selectedAutoRenewMethodId,
                      consentVersion: "phase2-autorenew-v1",
                      consentSnapshot: {
                        consentText: "I authorize SmartAIHub to charge this saved payment method for future subscription renewals.",
                        locale: "en",
                        enrollmentSource: "billing_center",
                        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
                      },
                    })}
                    disabled={enableAutoRenewMutation.isPending || !selectedAutoRenewMethodId || !autoRenewConsentEnabled}
                  >
                    {enableAutoRenewMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
                    Enable auto-renew
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => disableAutoRenewMutation.mutate({ reason: "user_disabled_autorenew" })}
                    disabled={disableAutoRenewMutation.isPending || !paymentSettingsQuery.data?.settings?.autoRenewEnabled}
                  >
                    {disableAutoRenewMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    Switch back to manual invoices
                  </Button>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {paymentMethods.map((method) => (
                  <div key={method.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-medium text-slate-900">
                          {method.brand || "Card"} {method.last4 ? `•••• ${method.last4}` : ""}
                          {method.isDefault ? " · default" : ""}
                        </div>
                        <div className="text-sm text-slate-500">
                          Status: {method.status} · Expires {method.expMonth ?? "--"}/{method.expYear ?? "--"}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setAutoRenewMethodId(method.id);
                            setDefaultPaymentMethodMutation.mutate({ paymentMethodId: method.id });
                          }}
                          disabled={setDefaultPaymentMethodMutation.isPending || method.isDefault}
                        >
                          Default
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => removePaymentMethodMutation.mutate({ paymentMethodId: method.id })}
                          disabled={removePaymentMethodMutation.isPending}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
                {paymentMethods.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
                    No saved payment methods yet. Start the Beam setup flow above, then confirm the returned payment method reference here.
                  </div>
                ) : null}
              </div>
            </DashboardCard>
            ) : null}

            <DashboardCard
              eyebrow="Top-up"
              title={topupFocused ? "One-time credit payment" : "Credit top-ups start from Credits"}
              description={
                topupFocused
                  ? "The package and amount come from the Credits page, so you do not need to type any numbers here."
                  : "Choose a credit package on the Credits page first. Billing Center is used to review the generated invoice, payment status, and PDF."
              }
            >
              {topupFocused ? (
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Chosen package</div>
                      <div className="mt-2 text-lg font-semibold text-slate-900">
                        {pendingTopupContext.packageLabel ?? pendingTopupContext.description ?? "Credit top-up"}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Amount to pay</div>
                      <div className="mt-2 text-lg font-semibold text-slate-900">
                        {selectedInvoice
                          ? formatMoney(selectedInvoice.totalAmount, selectedInvoice.currency)
                          : pendingTopupContext.basePrice != null
                            ? pendingTopupContext.paymentChannel === "promptpay_direct_manual"
                              ? "คำนวณยอด THB หลังสร้างรายการ"
                              : formatMoney(pendingTopupContext.basePrice, "USD")
                            : "-"}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Credits you selected</div>
                      <div className="mt-2 text-lg font-semibold text-slate-900">
                        {pendingTopupContext.credits?.toLocaleString() ?? "-"}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Payment type</div>
                      <div className="mt-2 text-lg font-semibold text-slate-900">One-time top-up</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 md:col-span-2">
                      <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Chosen payment method</div>
                      <div className="mt-2 text-lg font-semibold text-slate-900">
                        {pendingTopupContext.paymentChannel === "beam_card"
                          ? "Card payment via Beam checkout"
                          : pendingTopupContext.paymentChannel === "promptpay_direct_manual"
                            ? "PromptPay โอนตรง + ส่งสลิป"
                            : "PromptPay QR"}
                      </div>
                      <div className="mt-1 text-sm text-slate-500">
                        {pendingTopupContext.paymentChannel === "beam_card"
                          ? "You will be redirected to Beam checkout to complete card payment."
                          : pendingTopupContext.paymentChannel === "promptpay_direct_manual"
                            ? "โอนตามยอด THB ที่แสดง แล้วอัปโหลดสลิปเพื่อรอการตรวจสอบ"
                            : "A Beam PromptPay QR will be generated for this one-time payment."}
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-cyan-100 bg-cyan-50/70 p-4 text-sm text-slate-700">
                    This flow is only for a one-time credit purchase. It is separate from subscription billing and does not require manual amount entry.
                  </div>
                  {selectedTopupInvoice ? (
                    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Current payment</div>
                          <div className="mt-1 text-lg font-semibold text-slate-900">
                            {selectedTopupInvoice.invoiceNumber ?? `Invoice #${selectedTopupInvoice.id}`}
                          </div>
                        </div>
                        <Badge className={badgeClassForStatus(selectedTopupInvoice.status)}>{selectedTopupInvoice.status}</Badge>
                      </div>

                      <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                        <div>Total: {formatMoney(selectedTopupInvoice.totalAmount, selectedTopupInvoice.currency)}</div>
                        <div>
                          Payment method: {isDirectTopup ? "PromptPay Direct + manual slip" : selectedTopupPayment?.providerPaymentType === "payment_link" ? "Card payment" : "PromptPay QR"}
                        </div>
                        <div>Issued: {formatDateTime(selectedTopupInvoice.issuedAt)}</div>
                        <div>Due: {formatDateTime(selectedTopupInvoice.dueAt)}</div>
                        <div>Countdown: {formatCountdown(selectedTopupInvoice.dueAt) ?? "-"}</div>
                        <div>Invoice type: one-time top-up</div>
                      </div>

                      <div className="rounded-2xl border border-cyan-100 bg-cyan-50/70 p-4 text-sm text-slate-700">
                        {isDirectTopup
                          ? "โอนเงินตามยอดที่ระบุเท่านั้น ระบบจะเพิ่มเครดิตหลัง Admin ตรวจสอบและอนุมัติสลิป"
                          : selectedTopupPayment?.providerPaymentType === "payment_link"
                          ? "You selected card payment. Click Pay now to continue on Beam checkout."
                          : "You selected PromptPay QR. Scan the QR below or open the Beam payment page to complete this one-time top-up."}
                      </div>

                      {isDirectTopup ? (
                        <div className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                          <div className="grid gap-3 text-sm text-slate-700 md:grid-cols-2">
                            <div><span className="font-medium">ราคาแพ็กเกจ USD:</span> {formatMoney(selectedTopupPayment?.sourceAmountUsd, "USD")}</div>
                            <div><span className="font-medium">ยอดโอน:</span> {formatMoney(selectedTopupPayment?.promptpayAmountThb ?? selectedTopupInvoice.totalAmount, "THB")}</div>
                            <div><span className="font-medium">เลขสตางค์:</span> {String(selectedTopupPayment?.randomSatang ?? 0).padStart(2, "0")}</div>
                            <div><span className="font-medium">ผู้รับเงิน:</span> {String(selectedTopupPayment?.promptpayRecipientSnapshotJson?.displayName ?? "-")}</div>
                            <div><span className="font-medium">อัตราอ้างอิง USD/THB:</span> {String(selectedTopupPayment?.fxRate ?? "-")} ({formatDateTime(selectedTopupPayment?.fxRateDate)})</div>
                            <div><span className="font-medium">อัตราหลังปรับ:</span> {String(selectedTopupPayment?.fxEffectiveRate ?? "-")}</div>
                            <div><span className="font-medium">Sell spread:</span> {selectedTopupPayment?.fxSellSpreadBps == null ? "-" : `${selectedTopupPayment.fxSellSpreadBps} bps`}</div>
                            <div><span className="font-medium">FX risk buffer:</span> {selectedTopupPayment?.fxRiskBufferBps == null ? "-" : `${selectedTopupPayment.fxRiskBufferBps} bps`}</div>
                            <div><span className="font-medium">ดึงอัตราเมื่อ:</span> {formatDateTime(selectedTopupPayment?.fxFetchedAt)}</div>
                          </div>
                          {selectedTopupPayment?.qrPayload ? (
                            <div className="flex justify-center rounded-2xl border border-emerald-200 bg-white p-4">
                              <QRCodeSVG value={String(selectedTopupPayment.qrPayload)} size={260} includeMargin />
                            </div>
                          ) : null}
                          <div className="text-sm text-slate-700">เมื่อโอนสำเร็จ ให้อัปโหลดสลิปเพื่อให้ทีมงานตรวจสอบ</div>
                          {selectedTopupPayment.status === "payment_pending" || directPaymentQuery.data?.payment.status === "payment_pending" ? (
                            <div className="space-y-3">
                              <div
                                className={`rounded-2xl border-2 border-dashed p-4 transition-colors ${promptPaySlipDragActive ? "border-emerald-500 bg-emerald-100/80" : "border-emerald-300 bg-white/80 hover:border-emerald-400"}`}
                                onDragEnter={(event) => {
                                  event.preventDefault();
                                  setPromptPaySlipDragActive(true);
                                }}
                                onDragOver={(event) => event.preventDefault()}
                                onDragLeave={(event) => {
                                  event.preventDefault();
                                  setPromptPaySlipDragActive(false);
                                }}
                                onDrop={(event) => {
                                  event.preventDefault();
                                  setPromptPaySlipDragActive(false);
                                  handlePromptPaySlipFileSelected(event.dataTransfer.files?.[0]);
                                }}
                                aria-label="พื้นที่อัปโหลดสลิป รองรับการลากไฟล์มาวาง"
                              >
                                <input
                                  ref={promptPaySlipInputRef}
                                  type="file"
                                  accept={PROMPTPAY_SLIP_ACCEPT}
                                  className="sr-only"
                                  disabled={uploadPromptPaySlipMutation.isPending}
                                  onChange={(event) => {
                                    handlePromptPaySlipFileSelected(event.target.files?.[0]);
                                    event.currentTarget.value = "";
                                  }}
                                />
                                {promptPaySlipFile && promptPaySlipPreviewUrl ? (
                                  <div className="space-y-3">
                                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-950/5">
                                      {promptPaySlipFile.type === "application/pdf" ? (
                                        <iframe
                                          src={promptPaySlipPreviewUrl}
                                          title="ตัวอย่างไฟล์สลิป PDF"
                                          className="h-72 w-full bg-white"
                                        />
                                      ) : (
                                        <img
                                          src={promptPaySlipPreviewUrl}
                                          alt="ตัวอย่างสลิปที่จะส่งตรวจสอบ"
                                          className="max-h-72 w-full object-contain bg-white"
                                        />
                                      )}
                                    </div>
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                      <div className="min-w-0">
                                        <div className="truncate text-sm font-semibold text-slate-900">{promptPaySlipFile.name}</div>
                                        <div className="text-xs text-slate-500">{formatFileSize(promptPaySlipFile.size)} · พร้อมส่งให้ทีมงานตรวจสอบ</div>
                                      </div>
                                      <div className="flex flex-wrap gap-2">
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          onClick={() => promptPaySlipInputRef.current?.click()}
                                          disabled={uploadPromptPaySlipMutation.isPending}
                                        >
                                          เปลี่ยนไฟล์
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => setPromptPaySlipFile(null)}
                                          disabled={uploadPromptPaySlipMutation.isPending}
                                          aria-label="ล้างไฟล์สลิปที่เลือก"
                                        >
                                          <X className="mr-1 h-4 w-4" />
                                          ล้าง
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
                                    <div className="rounded-full bg-emerald-100 p-3 text-emerald-700">
                                      <UploadCloud className="h-6 w-6" />
                                    </div>
                                    <div className="text-sm font-semibold text-slate-900">
                                      {promptPaySlipDragActive ? "ปล่อยไฟล์ที่นี่ได้เลย" : "ลากไฟล์สลิปมาวางที่นี่"}
                                    </div>
                                    <div className="text-xs text-slate-500">หรือเลือกไฟล์จากเครื่องของคุณ</div>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => promptPaySlipInputRef.current?.click()}
                                      disabled={uploadPromptPaySlipMutation.isPending}
                                    >
                                      เลือกไฟล์สลิป
                                    </Button>
                                    <div className="text-xs text-slate-400">PNG, JPEG, WEBP หรือ PDF · สูงสุด 10 MB</div>
                                  </div>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="text-xs text-slate-500" aria-live="polite">
                                  {promptPaySlipFile ? "ตรวจสอบตัวอย่างไฟล์แล้ว หากถูกต้องกดส่งสลิปได้เลย" : "เลือกไฟล์หรือลากไฟล์เข้าพื้นที่ด้านบนเพื่อดูตัวอย่างก่อนส่ง"}
                                </div>
                                <Button
                                  type="button"
                                  onClick={() => void handlePromptPaySlipUpload()}
                                  disabled={!promptPaySlipFile || uploadPromptPaySlipMutation.isPending}
                                >
                                  {uploadPromptPaySlipMutation.isPending ? "กำลังส่งสลิป..." : "ส่งสลิปให้ตรวจสอบ"}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="text-sm font-medium text-amber-800">{selectedTopupPayment.status === "manual_review_required" ? "ส่งสลิปแล้ว รอ Admin ตรวจสอบ" : "รายการนี้ดำเนินการแล้ว"}</div>
                          )}
                        </div>
                      ) : null}

                      {!isDirectTopup && selectedTopupPayment?.status === "provider_pending_unknown" ? (
                        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
                          Beam payment was not created successfully yet, so no QR code or payment button is available for this invoice.
                          Please check Platform Settings &gt; Payments &gt; Beam and make sure API Base URL, API Key, Charges path, and webhook secrets are configured.
                        </div>
                      ) : null}

                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => setLocation("/credits")}>
                          <ArrowLeft className="mr-2 h-4 w-4" />
                          Choose another package
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => refreshInvoiceMutation.mutate({ invoiceId: selectedTopupInvoice.id })}
                          disabled={refreshInvoiceMutation.isPending}
                        >
                          {refreshInvoiceMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                          Refresh payment status
                        </Button>
                        {!isDirectTopup && selectedTopupPayment?.paymentUrl ? (
                          <Button asChild>
                            <a href={String(selectedTopupPayment.paymentUrl)} target="_blank" rel="noreferrer">
                              <CreditCard className="mr-2 h-4 w-4" />
                              Pay now
                            </a>
                          </Button>
                        ) : null}
                        {latestDocument ? (
                          <Button variant="outline" onClick={() => handleDownload(selectedTopupInvoice.id)}>
                            <Download className="mr-2 h-4 w-4" />
                            Download invoice PDF
                          </Button>
                        ) : null}
                      </div>

                      {!isDirectTopup && selectedTopupPayment?.qrCodeUrl ? (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="text-sm font-medium text-slate-900">PromptPay QR</div>
                          <div className="mt-2 text-sm text-slate-500">
                            Scan this QR code with your banking app to pay for the selected credit package.
                          </div>
                          <div className="mt-4 flex justify-center rounded-2xl border border-slate-200 bg-white p-4">
                            <img
                              src={String(selectedTopupPayment.qrCodeUrl)}
                              alt="PromptPay QR"
                              className="h-64 w-64 rounded-xl object-contain"
                            />
                          </div>
                        </div>
                      ) : !isDirectTopup && pendingTopupContext.paymentChannel === "beam_promptpay" ? (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                          QR code has not been returned by Beam yet. Click Refresh payment status once, and if it still does not appear, check Beam gateway configuration in Payments.
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                      We are still loading the latest top-up invoice for this purchase. If nothing appears in a moment, click Refresh payment status after the invoice is created.
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
                  To buy credits, go to the Credits page, select a package, and the invoice will be created automatically with the correct amount. You should not need to type credits or price manually in Billing Center.
                </div>
              )}
            </DashboardCard>

            {!topupFocused ? (
            <DashboardCard
              eyebrow={selectedInvoice?.invoiceType === "topup" ? "Top-up invoice" : "Selection"}
              title={selectedInvoice ? selectedInvoice.invoiceNumber ?? `Invoice #${selectedInvoice.id}` : "Invoice detail"}
              description={
                selectedInvoice?.invoiceType === "topup"
                  ? "Review your one-time credit purchase invoice and confirm its payment status."
                  : "Inspect the currently selected invoice, latest document, and refresh status from Beam."
              }
            >
              {selectedInvoice ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Badge className={badgeClassForStatus(selectedInvoice.status)}>{selectedInvoice.status}</Badge>
                    <span className="text-sm text-slate-500">{selectedInvoice.invoiceType}</span>
                  </div>
                  <div className="grid gap-3 text-sm text-slate-600">
                    <div>Total: {formatMoney(selectedInvoice.totalAmount, selectedInvoice.currency)}</div>
                    {selectedInvoice.invoiceType === "topup" ? (
                      <div>
                        Payment method: {selectedInvoice.activePayment?.providerPaymentType === "payment_link" ? "Card payment" : "PromptPay QR"}
                      </div>
                    ) : null}
                    <div>Issued: {formatDateTime(selectedInvoice.issuedAt)}</div>
                    <div>Due: {formatDateTime(selectedInvoice.dueAt)}</div>
                    <div>Countdown: {formatCountdown(selectedInvoice.dueAt) ?? "-"}</div>
                    <div>Header version: {selectedInvoice.headerVersion}</div>
                    <div>Document language: {selectedInvoice.defaultDocumentLanguage}</div>
                  </div>
                  {selectedInvoice.invoiceType === "topup" ? (
                    <div className="rounded-2xl border border-cyan-100 bg-cyan-50/70 p-4 text-sm text-slate-700">
                      {selectedInvoice.activePayment?.providerPaymentType === "payment_link"
                        ? "Use the card payment button below to continue on Beam checkout."
                        : "Scan the PromptPay QR below or open the Beam payment page to complete this one-time top-up."}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() => refreshInvoiceMutation.mutate({ invoiceId: selectedInvoice.id })}
                      disabled={refreshInvoiceMutation.isPending}
                    >
                      {refreshInvoiceMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                      Refresh status
                    </Button>
                    {latestDocument ? (
                      <Button variant="outline" onClick={() => handleDownload(selectedInvoice.id)}>
                        <Download className="mr-2 h-4 w-4" />
                        Download latest PDF
                      </Button>
                    ) : null}
                    {selectedInvoice.invoiceType === "topup" && selectedInvoice.activePayment?.paymentUrl ? (
                      <Button asChild>
                        <a href={String(selectedInvoice.activePayment.paymentUrl)} target="_blank" rel="noreferrer">
                          <CreditCard className="mr-2 h-4 w-4" />
                          Pay now
                        </a>
                      </Button>
                    ) : null}
                  </div>
                  {selectedInvoice.invoiceType === "topup" && selectedInvoice.activePayment?.qrCodeUrl ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="text-sm font-medium text-slate-900">PromptPay QR</div>
                      <div className="mt-2 text-sm text-slate-500">
                        สแกน QR นี้เพื่อชำระเงินสำหรับเครดิตแพ็กเกจที่คุณเลือก
                      </div>
                      <div className="mt-4 flex justify-center rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <img
                          src={String(selectedInvoice.activePayment.qrCodeUrl)}
                          alt="PromptPay QR"
                          className="h-64 w-64 rounded-xl object-contain"
                        />
                      </div>
                    </div>
                  ) : null}
                  {selectedInvoice.invoiceType !== "topup" ? (
                    <>
                      <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                        <div className="text-sm font-medium text-slate-900">Document variants</div>
                        {(documentsQuery.data ?? []).length > 0 ? (
                          <div className="space-y-2">
                            {(documentsQuery.data ?? []).map((document) => (
                              <div key={document.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm">
                                <div>
                                  <div className="font-medium text-slate-900">
                                    {document.documentLanguage} v{document.documentVersion}
                                    {document.isLatestForLanguage ? " · latest" : ""}
                                  </div>
                                  <div className="text-slate-500">{document.renderReason} · {formatDateTime(document.createdAt)}</div>
                                </div>
                                <Button variant="outline" size="sm" onClick={() => handleDownload(selectedInvoice.id)}>
                                  <Download className="mr-2 h-4 w-4" />
                                  Open
                                </Button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-sm text-slate-500">No document variants have been rendered yet.</div>
                        )}
                      </div>
                      <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                        <div className="text-sm font-medium text-slate-900">Recovery and investigation status</div>
                        {recoveryCases.length > 0 ? (
                          <div className="space-y-2">
                            {recoveryCases.map((item) => (
                              <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="font-medium text-slate-900">{item.issueType}</div>
                                  <Badge className={badgeClassForStatus(item.status)}>{item.status}</Badge>
                                </div>
                                <div className="mt-1 text-slate-500">Opened {formatDateTime(item.customerReportedAt)}</div>
                                {item.resolutionNote ? (
                                  <div className="mt-2 whitespace-pre-wrap text-slate-700">{item.resolutionNote}</div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-sm text-slate-500">No recovery cases are open for this invoice.</div>
                        )}
                      </div>
                    </>
                  ) : null}
                  {selectedInvoice.invoiceType !== "topup" ? (
                    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                      <div className="text-sm font-medium text-slate-900">Renewal attempts</div>
                      {renewalAttempts.length > 0 ? (
                        <div className="space-y-2">
                          {renewalAttempts.map((attempt) => (
                            <div key={attempt.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                              <div className="flex items-center justify-between gap-3">
                                <div className="font-medium text-slate-900">Attempt #{attempt.attemptNo}</div>
                                <Badge className={badgeClassForStatus(attempt.status)}>{attempt.status}</Badge>
                              </div>
                              <div className="mt-1 text-slate-500">
                                Scheduled {formatDateTime(attempt.scheduledAt)} · Next retry {formatDateTime(attempt.nextRetryAt)}
                              </div>
                              {attempt.failureMessage ? <div className="mt-2 text-slate-700">{attempt.failureMessage}</div> : null}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-slate-500">No renewal attempts recorded for the current subscription yet.</div>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="text-sm text-slate-500">Choose an invoice from the list to inspect it here.</div>
              )}
            </DashboardCard>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
