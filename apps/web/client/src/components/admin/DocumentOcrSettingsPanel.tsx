import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { AlertTriangle, Check, ExternalLink, Eye, EyeOff, FileText, Loader2, Plus, RotateCcw, Save, Search, TestTube2, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardCard } from "@/components/dashboard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DOCUMENT_OCR_PROVIDER_IDS,
  DOCUMENT_OCR_PAYIN_SLIP_PARSER_MODES,
  getDocumentOcrPayinSlipParserModeDescription,
  getDocumentOcrPayinSlipParserModeLabel,
  getDocumentOcrProviderLabel,
  getDocumentOcrProviderOptions,
  type DocumentOcrPayinSlipParserMode,
  type DocumentOcrProviderId,
} from "../../../../shared/documentOcrRouting";
import {
  DEFAULT_FINANCE_SLIP_MAPPING_PRESETS,
  financeSlipMappingPresetCollectionSchema,
  type FinanceSlipMappingPreset,
} from "../../../../shared/finance";

const TYPHOON_OCR_DOCS_URL = "https://docs.opentyphoon.ai/en/ocr/";
const TYPHOON_OCR_RATE_LIMIT_PER_MINUTE = 20;

type DocumentOcrSettingsRow = {
  key: string;
  value?: string | null;
  valueJson?: unknown | null;
  isConfigured?: boolean;
  isSensitive?: boolean | null;
};

type DocumentOcrTestResult = {
  success: boolean;
  message: string;
  elapsedMs?: number | null;
  rateLimitNote?: string | null;
};

type DocumentOcrTestProviderId = Exclude<DocumentOcrProviderId, typeof DOCUMENT_OCR_PROVIDER_IDS.legacy>;

type ProviderPricingState = {
  image: string;
  pdf: string;
};

type ProviderPricingConfig = {
  providerId: DocumentOcrProviderId;
  title: string;
  description: string;
  imageKey: string;
  pdfKey: string;
};

const PROVIDER_PRICING_CONFIGS: ProviderPricingConfig[] = [
  {
    providerId: DOCUMENT_OCR_PROVIDER_IDS.typhoonOcr15,
    title: "Typhoon OCR 1.5",
    description: "API-only OCR for Thai documents.",
    imageKey: "typhoon_ocr_image_credits",
    pdfKey: "typhoon_ocr_pdf_page_credits",
  },
  {
    providerId: DOCUMENT_OCR_PROVIDER_IDS.googleAiVision,
    title: "Google AI Vision OCR",
    description: "Gemini vision OCR for image and PDF analysis.",
    imageKey: "google_ai_vision_image_credits",
    pdfKey: "google_ai_vision_pdf_page_credits",
  },
  {
    providerId: DOCUMENT_OCR_PROVIDER_IDS.landingAiAde,
    title: "LandingAI ADE",
    description: "Existing external OCR provider for scanned documents.",
    imageKey: "landingai_ade_image_credits",
    pdfKey: "landingai_ade_pdf_page_credits",
  },
];

function getSetting(settings: DocumentOcrSettingsRow[] | undefined, key: string): DocumentOcrSettingsRow | undefined {
  return settings?.find((row) => row.key === key);
}

function parseCreditValue(raw: string | null | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, parsed);
}

function parseSlipMappingPresetsRow(row?: DocumentOcrSettingsRow | undefined): FinanceSlipMappingPreset[] {
  const raw = typeof row?.value === "string" ? row.value.trim() : "";
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const collection = financeSlipMappingPresetCollectionSchema.safeParse(parsed);
      if (collection.success && collection.data.presets.length > 0) {
        return collection.data.presets;
      }
    } catch {
      // fall back to defaults below
    }
  }

  if (row?.valueJson && typeof row.valueJson === "object") {
    const collection = financeSlipMappingPresetCollectionSchema.safeParse(row.valueJson);
    if (collection.success && collection.data.presets.length > 0) {
      return collection.data.presets;
    }
  }

  return DEFAULT_FINANCE_SLIP_MAPPING_PRESETS;
}

function parsePinnedMerchantPresetsRow(row?: DocumentOcrSettingsRow | undefined): FinanceSlipMappingPreset[] {
  const raw = typeof row?.value === "string" ? row.value.trim() : "";
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const collection = financeSlipMappingPresetCollectionSchema.safeParse(parsed);
      if (collection.success && collection.data.presets.length > 0) {
        return collection.data.presets;
      }
    } catch {
      // fall back to defaults below
    }
  }

  if (row?.valueJson && typeof row.valueJson === "object") {
    const collection = financeSlipMappingPresetCollectionSchema.safeParse(row.valueJson);
    if (collection.success && collection.data.presets.length > 0) {
      return collection.data.presets;
    }
  }

  return [];
}

export default function DocumentOcrSettingsPanel() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { data: settings, refetch } = trpc.systemSettings.getSettingsByCategory.useQuery(
    { category: "document_ocr" as any },
    { enabled: !!user && user.role === "admin" },
  );
  const { data: googleAiSettings, refetch: refetchGoogleAi } = trpc.systemSettings.getGoogleAiSettings.useQuery(
    undefined,
    { enabled: !!user && user.role === "admin" },
  );
  const { data: financeSettings, refetch: refetchFinanceSettings } = trpc.systemSettings.getSettingsByCategory.useQuery(
    { category: "finance" as any },
    { enabled: !!user && user.role === "admin" },
  );
  const updateSettingMutation = trpc.systemSettings.updateSetting.useMutation({
    onError: (err: any) => toast.error(err.message),
  });
  const updateGoogleAiMutation = trpc.systemSettings.updateGoogleAiSettings.useMutation({
    onSuccess: () => {
      toast.success("Google AI key saved securely");
      refetchGoogleAi();
      setGoogleAiApiKey("");
    },
    onError: (err: any) => toast.error(err.message),
  });
  const testGoogleAiMutation = trpc.systemSettings.testGoogleAiConnection.useMutation({
    onSuccess: (data) => {
      data.success ? toast.success(data.message) : toast.error(data.message);
    },
    onError: (err: any) => toast.error(err.message),
  });
  const testConnectionMutation = trpc.systemSettings.testDocumentOcrConnection.useMutation();

  const [imageProvider, setImageProvider] = useState("legacy");
  const [pdfProvider, setPdfProvider] = useState("legacy");
  const [payinSlipParserMode, setPayinSlipParserMode] = useState<DocumentOcrPayinSlipParserMode>(
    DOCUMENT_OCR_PAYIN_SLIP_PARSER_MODES.ocr,
  );
  const [googleAiApiKey, setGoogleAiApiKey] = useState("");
  const [showGoogleAiApiKey, setShowGoogleAiApiKey] = useState(false);
  const [landingAiApiKey, setLandingAiApiKey] = useState("");
  const [typhoonOcrApiKey, setTyphoonOcrApiKey] = useState("");
  const [providerPricing, setProviderPricing] = useState<Record<DocumentOcrProviderId, ProviderPricingState>>({
    [DOCUMENT_OCR_PROVIDER_IDS.legacy]: { image: "0", pdf: "1" },
    [DOCUMENT_OCR_PROVIDER_IDS.typhoonOcr15]: { image: "1", pdf: "1" },
    [DOCUMENT_OCR_PROVIDER_IDS.googleAiVision]: { image: "1", pdf: "1" },
    [DOCUMENT_OCR_PROVIDER_IDS.landingAiAde]: { image: "1", pdf: "1" },
  });
  const [ocrCreditsPerPage, setOcrCreditsPerPage] = useState(1);
  const [ocrCreditsPerPageInput, setOcrCreditsPerPageInput] = useState("1");
  const [showLandingAiApiKey, setShowLandingAiApiKey] = useState(false);
  const [showTyphoonOcrApiKey, setShowTyphoonOcrApiKey] = useState(false);
  const [landingAiKeyConfigured, setLandingAiKeyConfigured] = useState(false);
  const [typhoonOcrKeyConfigured, setTyphoonOcrKeyConfigured] = useState(false);
  const [slipMappingPresets, setSlipMappingPresets] = useState<FinanceSlipMappingPreset[]>(DEFAULT_FINANCE_SLIP_MAPPING_PRESETS);
  const [pinnedMerchantPresets, setPinnedMerchantPresets] = useState<FinanceSlipMappingPreset[]>([]);
  const [savingSettingKey, setSavingSettingKey] = useState<string | null>(null);
  const [savingPricingProviderId, setSavingPricingProviderId] = useState<DocumentOcrProviderId | null>(null);
  const [testingProviderId, setTestingProviderId] = useState<DocumentOcrProviderId | null>(null);
  const [testResults, setTestResults] = useState<Partial<Record<DocumentOcrTestProviderId, DocumentOcrTestResult>>>({});
  const googleAiKeyConfiguredNow = Boolean(googleAiSettings?.apiKeyConfigured);

  useEffect(() => {
    if (!settings) return;
    const imageRow = getSetting(settings, "image_ocr_provider");
    const pdfRow = getSetting(settings, "pdf_ocr_provider");
    const landingRow = getSetting(settings, "landingai_ade_api_key");
    const typhoonRow = getSetting(settings, "typhoon_ocr_api_key");
    const parserModeRow = getSetting(settings, "payin_slip_parser_mode");
    const creditsRow = getSetting(settings, "ocr_credits_per_page");
    const legacyFallback = parseCreditValue(creditsRow?.value, 1);

    setImageProvider(String(imageRow?.value ?? "legacy"));
    setPdfProvider(String(pdfRow?.value ?? "legacy"));
    setLandingAiApiKey("");
    setTyphoonOcrApiKey("");
    setPayinSlipParserMode(
      String(parserModeRow?.value ?? DOCUMENT_OCR_PAYIN_SLIP_PARSER_MODES.ocr) === DOCUMENT_OCR_PAYIN_SLIP_PARSER_MODES.unifiedLlmParser
        ? DOCUMENT_OCR_PAYIN_SLIP_PARSER_MODES.unifiedLlmParser
        : DOCUMENT_OCR_PAYIN_SLIP_PARSER_MODES.ocr,
    );
    setLandingAiKeyConfigured(Boolean(landingRow?.isConfigured || landingRow?.value));
    setTyphoonOcrKeyConfigured(Boolean(typhoonRow?.isConfigured || typhoonRow?.value));

    setOcrCreditsPerPage(legacyFallback);
    setOcrCreditsPerPageInput(String(legacyFallback));

    setProviderPricing({
      [DOCUMENT_OCR_PROVIDER_IDS.legacy]: {
        image: String(parseCreditValue(getSetting(settings, "native_ocr_image_credits")?.value, 0)),
        pdf: String(parseCreditValue(getSetting(settings, "native_ocr_pdf_page_credits")?.value, legacyFallback)),
      },
      [DOCUMENT_OCR_PROVIDER_IDS.typhoonOcr15]: {
        image: String(parseCreditValue(getSetting(settings, "typhoon_ocr_image_credits")?.value, legacyFallback)),
        pdf: String(parseCreditValue(getSetting(settings, "typhoon_ocr_pdf_page_credits")?.value, legacyFallback)),
      },
      [DOCUMENT_OCR_PROVIDER_IDS.googleAiVision]: {
        image: String(parseCreditValue(getSetting(settings, "google_ai_vision_image_credits")?.value, legacyFallback)),
        pdf: String(parseCreditValue(getSetting(settings, "google_ai_vision_pdf_page_credits")?.value, legacyFallback)),
      },
      [DOCUMENT_OCR_PROVIDER_IDS.landingAiAde]: {
        image: String(parseCreditValue(getSetting(settings, "landingai_ade_image_credits")?.value, legacyFallback)),
        pdf: String(parseCreditValue(getSetting(settings, "landingai_ade_pdf_page_credits")?.value, legacyFallback)),
      },
    });
  }, [settings]);

  useEffect(() => {
    if (!financeSettings) return;
    const presetRow = getSetting(financeSettings, "slip_mapping_presets");
    const pinnedRow = getSetting(financeSettings, "pinned_merchant_presets");
    setSlipMappingPresets(parseSlipMappingPresetsRow(presetRow));
    setPinnedMerchantPresets(parsePinnedMerchantPresetsRow(pinnedRow));
  }, [financeSettings]);

  const imageRouteReady =
    imageProvider === DOCUMENT_OCR_PROVIDER_IDS.legacy
    || (
      imageProvider === DOCUMENT_OCR_PROVIDER_IDS.typhoonOcr15
        ? typhoonOcrKeyConfigured
        : imageProvider === DOCUMENT_OCR_PROVIDER_IDS.googleAiVision
          ? googleAiKeyConfiguredNow
          : landingAiKeyConfigured
    );
  const pdfRouteReady =
    pdfProvider === DOCUMENT_OCR_PROVIDER_IDS.legacy
    || (
      pdfProvider === DOCUMENT_OCR_PROVIDER_IDS.typhoonOcr15
        ? typhoonOcrKeyConfigured
        : pdfProvider === DOCUMENT_OCR_PROVIDER_IDS.googleAiVision
          ? googleAiKeyConfiguredNow
          : landingAiKeyConfigured
    );

  const isSaving = (key: string) => savingSettingKey === key;

  const clearTestResult = (providerId: DocumentOcrTestProviderId) => {
    setTestResults((current) => {
      if (!current[providerId]) return current;
      const next = { ...current };
      delete next[providerId];
      return next;
    });
  };

  const updateProviderPricing = (
    providerId: DocumentOcrProviderId,
    field: keyof ProviderPricingState,
    value: string,
  ) => {
    setProviderPricing((current) => ({
      ...current,
      [providerId]: {
        ...current[providerId],
        [field]: value,
      },
    }));
  };

  const normalizePresetRow = (preset: FinanceSlipMappingPreset, index: number): FinanceSlipMappingPreset => ({
    ...preset,
    id: preset.id.trim() || `preset-${index + 1}`,
    label: preset.label.trim() || `Preset ${index + 1}`,
    matchText: preset.matchText.trim(),
    categoryCode: preset.categoryCode.trim() || "other.misc",
    counterpartyName: preset.counterpartyName?.trim() || null,
    merchantName: preset.merchantName?.trim() || null,
    note: preset.note?.trim() || null,
    priority: Number.isFinite(preset.priority) ? Math.max(0, Math.floor(preset.priority)) : 0,
    enabled: Boolean(preset.enabled),
    transactionType: preset.transactionType,
  });

  const normalizePinnedMerchantPresetRow = (preset: FinanceSlipMappingPreset, index: number): FinanceSlipMappingPreset => {
    const merchantName = preset.merchantName?.trim() || preset.counterpartyName?.trim() || preset.label.trim() || `Merchant ${index + 1}`;
    const matchText = preset.matchText.trim() || merchantName || preset.label.trim() || `Merchant ${index + 1}`;
    return {
      ...preset,
      id: preset.id.trim() || `merchant-pin-${index + 1}`,
      label: preset.label.trim() || merchantName,
      matchText,
      transactionType: preset.transactionType,
      categoryCode: preset.categoryCode.trim() || "other.misc",
      counterpartyName: preset.counterpartyName?.trim() || null,
      merchantName,
      note: preset.note?.trim() || null,
      priority: Number.isFinite(preset.priority) ? Math.max(0, Math.floor(preset.priority)) : 0,
      enabled: Boolean(preset.enabled),
    };
  };

  const updateSlipPreset = <K extends keyof FinanceSlipMappingPreset>(
    index: number,
    key: K,
    value: FinanceSlipMappingPreset[K],
  ) => {
    setSlipMappingPresets((current) => current.map((preset, presetIndex) => (
      presetIndex === index
        ? { ...preset, [key]: value }
        : preset
    )));
  };

  const updatePinnedMerchantPreset = <K extends keyof FinanceSlipMappingPreset>(
    index: number,
    key: K,
    value: FinanceSlipMappingPreset[K],
  ) => {
    setPinnedMerchantPresets((current) => current.map((preset, presetIndex) => (
      presetIndex === index
        ? { ...preset, [key]: value }
        : preset
    )));
  };

  const addSlipPreset = () => {
    setSlipMappingPresets((current) => [
      ...current,
      {
        id: `custom-${Date.now()}`,
        enabled: true,
        label: "Custom preset",
        matchText: "",
        transactionType: "expense",
        categoryCode: "other.misc",
        counterpartyName: null,
        merchantName: null,
        note: null,
        priority: current.length > 0 ? Math.max(...current.map((preset) => preset.priority)) + 10 : 0,
      },
    ]);
  };

  const addPinnedMerchantPreset = () => {
    setPinnedMerchantPresets((current) => [
      ...current,
      {
        id: `merchant-pin-${Date.now()}`,
        enabled: true,
        label: "Pinned merchant",
        matchText: "",
        transactionType: "expense",
        categoryCode: "other.misc",
        counterpartyName: null,
        merchantName: "",
        note: null,
        priority: current.length > 0 ? Math.max(...current.map((preset) => preset.priority)) + 10 : 0,
      },
    ]);
  };

  const resetSlipPresets = () => {
    setSlipMappingPresets(DEFAULT_FINANCE_SLIP_MAPPING_PRESETS);
  };

  const resetPinnedMerchantPresets = () => {
    setPinnedMerchantPresets([]);
  };

  const removeSlipPreset = (index: number) => {
    setSlipMappingPresets((current) => current.filter((_, presetIndex) => presetIndex !== index));
  };

  const removePinnedMerchantPreset = (index: number) => {
    setPinnedMerchantPresets((current) => current.filter((_, presetIndex) => presetIndex !== index));
  };

  async function saveProviderPricing(config: ProviderPricingConfig) {
    setSavingPricingProviderId(config.providerId);
    try {
      const current = providerPricing[config.providerId];
      await updateSettingMutation.mutateAsync({
        category: "document_ocr" as any,
        key: config.imageKey,
        value: String(parseCreditValue(current.image, 0)),
        description: `${config.title} OCR credits per image`,
      });
      await updateSettingMutation.mutateAsync({
        category: "document_ocr" as any,
        key: config.pdfKey,
        value: String(parseCreditValue(current.pdf, ocrCreditsPerPage)),
        description: `${config.title} OCR credits per PDF page`,
      });
      await refetch();
      toast.success(`${config.title} pricing saved`);
    } finally {
      setSavingPricingProviderId((current) => (current === config.providerId ? null : current));
    }
  }

  async function saveSlipMappingPresets() {
    setSavingSettingKey("slip_mapping_presets");
    try {
      const normalized = slipMappingPresets
        .map((preset, index) => normalizePresetRow(preset, index))
        .filter((preset) => preset.label.trim().length > 0 && preset.matchText.trim().length > 0);

      await updateSettingMutation.mutateAsync({
        category: "finance" as any,
        key: "slip_mapping_presets",
        value: JSON.stringify({
          version: 1,
          presets: normalized,
        }),
        description: "Finance slip mapping presets for common income and expense categories",
      });
      await refetchFinanceSettings();
      toast.success("Finance slip presets saved");
    } finally {
      setSavingSettingKey((current) => (current === "slip_mapping_presets" ? null : current));
    }
  }

  async function savePinnedMerchantPresets() {
    setSavingSettingKey("pinned_merchant_presets");
    try {
      const normalized = pinnedMerchantPresets
        .map((preset, index) => normalizePinnedMerchantPresetRow(preset, index))
        .filter((preset) => preset.label.trim().length > 0 && preset.merchantName.trim().length > 0);

      await updateSettingMutation.mutateAsync({
        category: "finance" as any,
        key: "pinned_merchant_presets",
        value: JSON.stringify({
          version: 1,
          presets: normalized,
        }),
        description: "Pinned merchant presets for frequent merchants",
      });
      await refetchFinanceSettings();
      toast.success("Pinned merchant presets saved");
    } finally {
      setSavingSettingKey((current) => (current === "pinned_merchant_presets" ? null : current));
    }
  }

  async function testConnection(providerId: DocumentOcrTestProviderId, apiKey: string | undefined) {
    setTestingProviderId(providerId);
    try {
      const result = await testConnectionMutation.mutateAsync({
        providerId,
        apiKey: apiKey?.trim() || undefined,
      }) as DocumentOcrTestResult;

      setTestResults((current) => ({
        ...current,
        [providerId]: {
          success: result.success,
          message: result.message,
          elapsedMs: result.elapsedMs ?? null,
          rateLimitNote: result.rateLimitNote ?? null,
        },
      }));

      if (result.success) {
        toast.success(result.message || "Document OCR connection succeeded");
      } else {
        toast.error(result.message || "Document OCR connection failed");
      }
    } catch (error: any) {
      const message = error?.message || "Document OCR connection failed";
      setTestResults((current) => ({
        ...current,
        [providerId]: {
          success: false,
          message,
          elapsedMs: null,
          rateLimitNote: null,
        },
      }));
      toast.error(message);
    } finally {
      setTestingProviderId((current) => (current === providerId ? null : current));
    }
  }

  function renderTestResult(providerId: DocumentOcrTestProviderId) {
    const result = testResults[providerId];
    if (!result) return null;

    return (
      <div className={`flex items-start gap-2 rounded-2xl border p-3 text-xs ${
        result.success ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"
      }`}>
        {result.success ? (
          <Check className="mt-0.5 h-4 w-4 shrink-0" />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        )}
        <div className="space-y-0.5">
          <div className="font-medium">
            {result.success ? "Connection successful" : "Connection failed"}
            {typeof result.elapsedMs === "number" && result.elapsedMs >= 0 ? ` · ${result.elapsedMs}ms` : ""}
          </div>
          <div className={result.success ? "text-emerald-900/80" : "text-red-900/80"}>
            {result.message}
          </div>
          {result.rateLimitNote ? (
            <div className="mt-1 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
              {result.rateLimitNote}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  async function saveSetting(input: {
    key: string;
    value?: string;
    isSensitive?: boolean;
    description: string;
    clear?: boolean;
  }) {
    setSavingSettingKey(input.key);
    try {
      await updateSettingMutation.mutateAsync({
        category: "document_ocr" as any,
        key: input.key,
        value: input.value,
        isSensitive: input.isSensitive,
        description: input.description,
        clear: input.clear,
      });
      if (input.clear) {
        if (input.key === "typhoon_ocr_api_key") {
          clearTestResult(DOCUMENT_OCR_PROVIDER_IDS.typhoonOcr15);
        }
        if (input.key === "landingai_ade_api_key") {
          clearTestResult(DOCUMENT_OCR_PROVIDER_IDS.landingAiAde);
        }
      }
      await refetch();
      toast.success("Document OCR settings saved");
    } finally {
      setSavingSettingKey(null);
    }
  }

  const providerOptions = getDocumentOcrProviderOptions();
  const showFinanceRulesInline = false;

  return (
    <DashboardCard
      className="overflow-hidden"
      leading={<FileText className="w-5 h-5 text-blue-600" />}
      title="Document OCR Settings"
      description="Configure deployment-wide OCR routing for images and PDFs, and keep OCR API credentials server-side."
      bodyClassName="space-y-8 p-6"
    >
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600 shadow-sm">
        <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
          Deployment-wide
        </Badge>
        <span>These settings apply to all admins and all uploads in this deployment.</span>
        <a
          href={TYPHOON_OCR_DOCS_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-sky-700 underline-offset-4 hover:underline"
        >
          Typhoon OCR docs
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sky-900">
        <Check className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="space-y-1 text-sm">
          <div className="font-medium">Runtime note</div>
          <div className="text-xs text-sky-900/80">
            Upload-time policy gates still apply in the backend. This panel configures deployment-wide OCR routing and API keys only.
          </div>
        </div>
      </div>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">Routing overview</div>
            <div className="text-xs text-muted-foreground">
              Snapshot of the effective OCR mapping before fallback decisions are applied.
            </div>
          </div>
          <Badge variant="outline" className="rounded-full border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700">
            API-backed OCR
          </Badge>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Image uploads</div>
            <div className="mt-2 text-sm font-semibold text-slate-900">{getDocumentOcrProviderLabel(imageProvider)}</div>
            <div className="mt-1 text-xs text-muted-foreground">JPG, PNG, WebP, GIF, HEIC, HEIF</div>
            <div className="mt-3">
              <Badge
                variant="outline"
                className={imageRouteReady ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}
              >
                {imageRouteReady ? "Ready" : "Will fall back to native extraction"}
              </Badge>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">PDF uploads</div>
            <div className="mt-2 text-sm font-semibold text-slate-900">{getDocumentOcrProviderLabel(pdfProvider)}</div>
            <div className="mt-1 text-xs text-muted-foreground">application/pdf</div>
            <div className="mt-3">
              <Badge
                variant="outline"
                className={pdfRouteReady ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}
              >
                {pdfRouteReady ? "Ready" : "Will fall back to native extraction"}
              </Badge>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Native extraction</div>
            <div className="mt-2 text-sm font-semibold text-slate-900">Parser-based fallback stack</div>
            <div className="mt-1 text-xs text-muted-foreground">UTF-8, PyPDF2, python-docx, python-pptx, openpyxl</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Typhoon key</div>
            <div className="mt-2 text-sm font-semibold text-slate-900">
              {typhoonOcrKeyConfigured ? "Configured" : "Not configured"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">Used only by backend API calls</div>
            <div className="mt-3 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800">
              System cap: {TYPHOON_OCR_RATE_LIMIT_PER_MINUTE} requests/minute
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">LandingAI key</div>
            <div className="mt-2 text-sm font-semibold text-slate-900">
              {landingAiKeyConfigured ? "Configured" : "Not configured"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">Legacy fallback provider</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Credits / page</div>
            <div className="mt-2 text-sm font-semibold text-slate-900">{ocrCreditsPerPage}</div>
            <div className="mt-1 text-xs text-muted-foreground">Charged per OCR page</div>
          </div>
        </div>
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 p-4 text-xs text-slate-600">
          <div className="font-medium text-slate-800">Routing rules</div>
          <ul className="mt-2 space-y-1">
            <li>• JPG, PNG, WebP, GIF, HEIC, and HEIF use the selected image OCR provider.</li>
            <li>• PDFs use the selected PDF OCR provider.</li>
            <li>• Image-based transfer slips use the separate Transfer slip parsing section below. Choose one flow for that slip class, not both. Other image uploads still follow the selected image OCR provider.</li>
            <li>• Typhoon OCR runs through the backend API only.</li>
            <li>• Typhoon OCR is capped at {TYPHOON_OCR_RATE_LIMIT_PER_MINUTE} requests per minute system-wide.</li>
            <li>• Google AI Vision OCR uses the Google AI key configured below.</li>
            <li>• Native extraction means the parser stack for that file class: UTF-8 text decode, PyPDF2 for PDF text layers, python-docx, python-pptx, openpyxl, and the existing PDF OCR fallback for scanned pages. It is not an LLM vision model.</li>
            <li>• If a selected provider key is missing, the backend falls back to the native extraction path.</li>
          </ul>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">Transfer slip parsing</div>
            <div className="text-xs text-muted-foreground">
              Choose how image-based transfer slips are parsed before finance draft mapping. This is separate from generic image and PDF routing.
            </div>
          </div>
          <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
            {getDocumentOcrPayinSlipParserModeLabel(payinSlipParserMode)}
          </Badge>
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto]">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Transfer slip parser mode</div>
            <div className="text-sm font-semibold text-slate-900">
              {payinSlipParserMode === DOCUMENT_OCR_PAYIN_SLIP_PARSER_MODES.unifiedLlmParser
                ? "Transfer slip parser (installed skill)"
                : "OCR extraction"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {getDocumentOcrPayinSlipParserModeDescription(payinSlipParserMode)}
            </div>
            <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
              <span className="font-medium text-slate-800">Use one flow for transfer-slip images only:</span>
              {" "}
              {payinSlipParserMode === DOCUMENT_OCR_PAYIN_SLIP_PARSER_MODES.unifiedLlmParser
                ? "Transfer slip parser replaces OCR for image-based transfer slips. It does not change the provider routing used for PDFs or other document classes."
                : "OCR handles image-based transfer slips before finance draft parsing. It does not change the provider routing used for PDFs or other document classes."}
            </div>
          </div>
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm">
            <Select
              value={payinSlipParserMode}
              onValueChange={(value) => setPayinSlipParserMode(
                value === DOCUMENT_OCR_PAYIN_SLIP_PARSER_MODES.unifiedLlmParser
                  ? DOCUMENT_OCR_PAYIN_SLIP_PARSER_MODES.unifiedLlmParser
                  : DOCUMENT_OCR_PAYIN_SLIP_PARSER_MODES.ocr,
              )}
            >
              <SelectTrigger className="h-9 w-full rounded-full">
                <SelectValue placeholder="Select mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DOCUMENT_OCR_PAYIN_SLIP_PARSER_MODES.ocr}>OCR extraction for transfer slips</SelectItem>
                <SelectItem value={DOCUMENT_OCR_PAYIN_SLIP_PARSER_MODES.unifiedLlmParser}>Transfer slip parser (replaces OCR for transfer slips)</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              onClick={() => saveSetting({
                key: "payin_slip_parser_mode",
                value: payinSlipParserMode,
                description: "Transfer slip parser mode for image uploads",
              })}
              disabled={updateSettingMutation.isPending || !!savingSettingKey}
              className="gap-2"
            >
              {isSaving("payin_slip_parser_mode") ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save parser mode
            </Button>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <div className="text-sm font-semibold text-slate-900">Routing targets</div>
          <div className="text-xs text-muted-foreground">
            Choose the provider used for generic image and PDF uploads independently. Transfer-slip images are controlled by the parser mode above and do not use these selectors.
          </div>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
            <div className="space-y-1">
              <Label htmlFor="imageOcrProvider">Generic image OCR provider</Label>
              <p className="text-xs text-muted-foreground">
                Route JPG, PNG, WebP, GIF, HEIC, and HEIF uploads through the configured provider. Transfer-slip images follow the parser mode above instead.
              </p>
            </div>
            <Select value={imageProvider} onValueChange={setImageProvider}>
              <SelectTrigger id="imageOcrProvider" className="max-w-xl">
                <SelectValue placeholder="Select image OCR provider" />
              </SelectTrigger>
              <SelectContent>
                {providerOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="space-y-0.5">
                      <div>{option.label}</div>
                      <div className="text-xs text-muted-foreground">{option.description}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Selected: {getDocumentOcrProviderLabel(imageProvider)}</Badge>
            </div>
            <Button
              type="button"
              onClick={() => saveSetting({
                key: "image_ocr_provider",
                value: imageProvider,
                description: "OCR provider for image uploads",
              })}
              disabled={updateSettingMutation.isPending || !!savingSettingKey}
              className="gap-2"
            >
              {isSaving("image_ocr_provider") ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save image provider
            </Button>
          </div>

          <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
            <div className="space-y-1">
              <Label htmlFor="pdfOcrProvider">Generic PDF OCR provider</Label>
              <p className="text-xs text-muted-foreground">
                Route PDF uploads through the configured provider. Typhoon OCR 1.5 is API-only and uses the backend API key stored below.
              </p>
            </div>
            <Select value={pdfProvider} onValueChange={setPdfProvider}>
              <SelectTrigger id="pdfOcrProvider" className="max-w-xl">
                <SelectValue placeholder="Select PDF OCR provider" />
              </SelectTrigger>
              <SelectContent>
                {providerOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="space-y-0.5">
                      <div>{option.label}</div>
                      <div className="text-xs text-muted-foreground">{option.description}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Selected: {getDocumentOcrProviderLabel(pdfProvider)}</Badge>
            </div>
            <Button
              type="button"
              onClick={() => saveSetting({
                key: "pdf_ocr_provider",
                value: pdfProvider,
                description: "OCR provider for PDF uploads",
              })}
              disabled={updateSettingMutation.isPending || !!savingSettingKey}
              className="gap-2"
            >
              {isSaving("pdf_ocr_provider") ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save PDF provider
            </Button>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <div className="text-sm font-semibold text-slate-900">Provider keys</div>
          <div className="text-xs text-muted-foreground">
            Keep OCR keys grouped here so routing and credentials are easy to scan separately.
          </div>
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
            <div className="space-y-1">
              <Label htmlFor="googleAiApiKey">Google AI OCR key</Label>
              <p className="text-xs text-muted-foreground">
                Powers Google AI Vision OCR for image analysis and OCR requests that explicitly select this provider.
              </p>
            </div>
            <div className="space-y-2">
              <div className="relative max-w-xl">
                <Input
                  id="googleAiApiKey"
                  type={showGoogleAiApiKey ? "text" : "password"}
                  value={googleAiApiKey}
                  onChange={(e) => {
                    setGoogleAiApiKey(e.target.value);
                  }}
                  placeholder={googleAiKeyConfiguredNow ? "AIza••••••••" : "AIza..."}
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
                {googleAiKeyConfiguredNow ? (
                  <Badge variant="outline" className="text-green-600">
                    <Check className="mr-1 h-3 w-3" />
                    Key configured
                  </Badge>
                ) : (
                  <Badge variant="secondary">Not configured</Badge>
                )}
                <Badge
                  variant="outline"
                  className={googleAiKeyConfiguredNow ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}
                >
                  {googleAiKeyConfiguredNow ? "Ready" : "Will fall back to native extraction"}
                </Badge>
                {googleAiSettings?.source ? <Badge variant="outline">Source: {googleAiSettings.source}</Badge> : null}
              </div>
              <p className="text-xs text-muted-foreground">
                The key is encrypted before it is stored in the database and is never shown again after saving.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => updateGoogleAiMutation.mutate({ apiKey: googleAiApiKey || undefined })}
                disabled={updateGoogleAiMutation.isPending || !googleAiApiKey.trim()}
                className="gap-2"
              >
                {updateGoogleAiMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save Google AI key
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => testGoogleAiMutation.mutate()}
                disabled={testGoogleAiMutation.isPending || !googleAiKeyConfiguredNow}
                className="gap-2"
              >
                {testGoogleAiMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <TestTube2 className="h-4 w-4" />
                )}
                Test Google vision connection
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Leave the key blank to test the saved Google AI key already stored in Admin Settings.
            </p>
          </div>

          <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
            <div className="space-y-1">
              <Label htmlFor="typhoonOcrApiKey">Typhoon OCR API key</Label>
              <p className="text-xs text-muted-foreground">
                Stored encrypted in the database and sent only from the backend when Typhoon OCR 1.5 is selected.
              </p>
            </div>
            <div className="space-y-2">
              <div className="relative max-w-xl">
                <Input
                  id="typhoonOcrApiKey"
                  type={showTyphoonOcrApiKey ? "text" : "password"}
                  value={typhoonOcrApiKey}
                  onChange={(e) => {
                    setTyphoonOcrApiKey(e.target.value);
                    clearTestResult(DOCUMENT_OCR_PROVIDER_IDS.typhoonOcr15);
                  }}
                  placeholder={typhoonOcrKeyConfigured ? "ty_••••••••" : "ty_..."}
                  className="pr-10 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowTyphoonOcrApiKey(!showTyphoonOcrApiKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showTyphoonOcrApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {typhoonOcrKeyConfigured ? (
                  <Badge variant="outline" className="text-green-600">
                    <Check className="mr-1 h-3 w-3" />
                    Key configured
                  </Badge>
                ) : (
                  <Badge variant="secondary">Not configured</Badge>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => saveSetting({
                  key: "typhoon_ocr_api_key",
                  value: typhoonOcrApiKey,
                  isSensitive: true,
                  description: "Typhoon OCR 1.5 API key",
                })}
                disabled={updateSettingMutation.isPending || !!savingSettingKey || !typhoonOcrApiKey.trim()}
                className="gap-2"
              >
                {isSaving("typhoon_ocr_api_key") ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Typhoon key
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => saveSetting({
                  key: "typhoon_ocr_api_key",
                  description: "Typhoon OCR 1.5 API key",
                  clear: true,
                })}
                disabled={updateSettingMutation.isPending || !!savingSettingKey || !typhoonOcrKeyConfigured}
              >
                Clear Typhoon key
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => testConnection(
                  DOCUMENT_OCR_PROVIDER_IDS.typhoonOcr15,
                  typhoonOcrApiKey.trim() || undefined,
                )}
                disabled={updateSettingMutation.isPending || !!savingSettingKey || testingProviderId === DOCUMENT_OCR_PROVIDER_IDS.typhoonOcr15}
                className="gap-2"
              >
                {testingProviderId === DOCUMENT_OCR_PROVIDER_IDS.typhoonOcr15 ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube2 className="h-4 w-4" />}
                Test Typhoon connection
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Leave the key blank to test the saved Typhoon key already stored in Admin Settings.
            </p>
            {renderTestResult(DOCUMENT_OCR_PROVIDER_IDS.typhoonOcr15)}
          </div>

          <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
            <div className="space-y-1">
              <Label htmlFor="landingAiApiKey">LandingAI ADE API key</Label>
              <p className="text-xs text-muted-foreground">
                Native fallback key kept for deployments that still use LandingAI OCR.
              </p>
            </div>
            <div className="space-y-2">
              <div className="relative max-w-xl">
                <Input
                  id="landingAiApiKey"
                  type={showLandingAiApiKey ? "text" : "password"}
                  value={landingAiApiKey}
                  onChange={(e) => {
                    setLandingAiApiKey(e.target.value);
                    clearTestResult(DOCUMENT_OCR_PROVIDER_IDS.landingAiAde);
                  }}
                  placeholder={landingAiKeyConfigured ? "la_••••••••" : "la_..."}
                  className="pr-10 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowLandingAiApiKey(!showLandingAiApiKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showLandingAiApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {landingAiKeyConfigured ? (
                  <Badge variant="outline" className="text-green-600">
                    <Check className="mr-1 h-3 w-3" />
                    Key configured
                  </Badge>
                ) : (
                  <Badge variant="secondary">Not configured</Badge>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => saveSetting({
                  key: "landingai_ade_api_key",
                  value: landingAiApiKey,
                  isSensitive: true,
                  description: "LandingAI ADE API key",
                })}
                disabled={updateSettingMutation.isPending || !!savingSettingKey || !landingAiApiKey.trim()}
                className="gap-2"
              >
                {isSaving("landingai_ade_api_key") ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save LandingAI key
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => saveSetting({
                  key: "landingai_ade_api_key",
                  description: "LandingAI ADE API key",
                  clear: true,
                })}
                disabled={updateSettingMutation.isPending || !!savingSettingKey || !landingAiKeyConfigured}
              >
                Clear LandingAI key
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => testConnection(
                  DOCUMENT_OCR_PROVIDER_IDS.landingAiAde,
                  landingAiApiKey.trim() || undefined,
                )}
                disabled={updateSettingMutation.isPending || !!savingSettingKey || testingProviderId === DOCUMENT_OCR_PROVIDER_IDS.landingAiAde}
                className="gap-2"
              >
                {testingProviderId === DOCUMENT_OCR_PROVIDER_IDS.landingAiAde ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube2 className="h-4 w-4" />}
                Test LandingAI connection
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Leave the key blank to test the saved LandingAI key already stored in Admin Settings.
            </p>
            {renderTestResult(DOCUMENT_OCR_PROVIDER_IDS.landingAiAde)}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <div className="text-sm font-semibold text-slate-900">Pricing</div>
          <div className="text-xs text-muted-foreground">
            Bill OCR separately by provider and unit. Native text parsing stays free; OCR fallback uses the legacy default below.
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="space-y-1">
            <Label htmlFor="ocrCreditsPerPage">Legacy OCR fallback credits per page</Label>
            <p className="text-xs text-muted-foreground">
              Used as the default PDF page rate when a provider-specific value is missing, and as the fallback OCR charge bucket.
            </p>
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <Input
              id="ocrCreditsPerPage"
              type="number"
              min={0}
              step={1}
              value={ocrCreditsPerPageInput}
              onChange={(e) => {
                const next = e.target.value;
                setOcrCreditsPerPageInput(next);
                const parsed = Number.parseInt(next, 10);
                if (Number.isFinite(parsed)) {
                  setOcrCreditsPerPage(Math.max(0, parsed));
                }
              }}
              className="max-w-xs"
            />
            <Button
              type="button"
              onClick={() => saveSetting({
                key: "ocr_credits_per_page",
                value: String(ocrCreditsPerPage),
                description: "Legacy OCR fallback credits per page",
              })}
              disabled={updateSettingMutation.isPending || !!savingSettingKey}
              className="gap-2"
            >
              {isSaving("ocr_credits_per_page") ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save fallback rate
            </Button>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:col-span-2 xl:col-span-1">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Native extraction</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">Parser-only, no OCR charge</div>
              <div className="mt-1 text-xs text-muted-foreground">
                If OCR fallback runs under the legacy bucket, the page charge follows the fallback rate above.
              </div>
              <div className="mt-3 space-y-1 text-sm text-slate-700">
                <div>Image: 0 credits per image</div>
                <div>PDF: {ocrCreditsPerPage} credits per page</div>
              </div>
            </div>
            {PROVIDER_PRICING_CONFIGS.map((config) => {
              const providerState = providerPricing[config.providerId];
              const saving = savingPricingProviderId === config.providerId;
              return (
                <div key={config.providerId} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="space-y-1">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">OCR provider</div>
                    <div className="text-sm font-semibold text-slate-900">{config.title}</div>
                    <div className="text-xs text-muted-foreground">{config.description}</div>
                  </div>
                  <div className="mt-4 space-y-3">
                    <div className="space-y-1">
                      <Label htmlFor={`${config.providerId}-image-credits`}>Credits / image</Label>
                      <Input
                        id={`${config.providerId}-image-credits`}
                        type="number"
                        min={0}
                        step={1}
                        value={providerState.image}
                        onChange={(e) => updateProviderPricing(config.providerId, "image", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`${config.providerId}-pdf-credits`}>Credits / PDF page</Label>
                      <Input
                        id={`${config.providerId}-pdf-credits`}
                        type="number"
                        min={0}
                        step={1}
                        value={providerState.pdf}
                        onChange={(e) => updateProviderPricing(config.providerId, "pdf", e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      onClick={() => saveProviderPricing(config)}
                      disabled={updateSettingMutation.isPending || !!savingSettingKey || saving}
                      className="gap-2"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Save pricing
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white/80 p-4 text-xs text-slate-600">
            <div className="font-medium text-slate-800">Billing rules</div>
            <ul className="mt-2 space-y-1">
              <li>• Image OCR charges apply per uploaded image.</li>
              <li>• PDF OCR charges apply per extracted page.</li>
              <li>• Native extraction is parser-based and does not charge unless OCR fallback is used.</li>
              <li>• If a provider-specific price is missing, the backend falls back to the legacy OCR rate above.</li>
            </ul>
          </div>
        </div>
      </section>

      {showFinanceRulesInline ? (
        <>
      <section className="space-y-4">
        <div>
          <div className="text-sm font-semibold text-slate-900">Pinned merchant presets</div>
          <div className="text-xs text-muted-foreground">
            Pin a small set of merchants that Finance should suggest first when the same store, service, or payer appears again.
            Keep this list short so the suggestion stays fast and obvious.
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Merchant-first suggestions</Badge>
            <Badge variant="outline">
              {pinnedMerchantPresets.length} pin{pinnedMerchantPresets.length === 1 ? "" : "s"}
            </Badge>
            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
              Shown before generic presets
            </Badge>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" onClick={addPinnedMerchantPreset} className="gap-2">
              <Plus className="h-4 w-4" />
              Add merchant pin
            </Button>
            <Button type="button" variant="outline" onClick={resetPinnedMerchantPresets} className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Reset pins
            </Button>
            <Button
              type="button"
              onClick={savePinnedMerchantPresets}
              disabled={updateSettingMutation.isPending || !!savingSettingKey}
              className="gap-2"
            >
              {isSaving("pinned_merchant_presets") ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save merchant pins
            </Button>
          </div>

          {pinnedMerchantPresets.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-4 text-sm text-slate-600">
              No merchant pins yet. Add only the merchants that are important enough to deserve a one-click suggestion.
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              {pinnedMerchantPresets.map((preset, index) => (
                <div key={preset.id || `${index}`} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Pinned merchant {index + 1}</div>
                      <Input
                        value={preset.label}
                        onChange={(event) => updatePinnedMerchantPreset(index, "label", event.target.value)}
                        placeholder="Pinned merchant label"
                        className="max-w-xl"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className={preset.enabled ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"}
                      >
                        {preset.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1.5 text-slate-500"
                        onClick={() => updatePinnedMerchantPreset(index, "enabled", !preset.enabled)}
                      >
                        {preset.enabled ? "Disable" : "Enable"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1.5 text-slate-500"
                        onClick={() => removePinnedMerchantPreset(index)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label>Merchant name</Label>
                      <Input
                        value={preset.merchantName ?? ""}
                        onChange={(event) => updatePinnedMerchantPreset(index, "merchantName", event.target.value || null)}
                        placeholder="SCB / Starbucks / 7-Eleven"
                      />
                      <p className="text-xs text-muted-foreground">This is the merchant name Finance tries to match first.</p>
                    </div>
                    <div className="space-y-1">
                      <Label>Match text / aliases</Label>
                      <Input
                        value={preset.matchText}
                        onChange={(event) => updatePinnedMerchantPreset(index, "matchText", event.target.value)}
                        placeholder="aliases, store codes, or slip keywords"
                      />
                      <p className="text-xs text-muted-foreground">Use pipes, commas, or line breaks to separate aliases.</p>
                    </div>
                    <div className="space-y-1">
                      <Label>Transaction type</Label>
                      <Select
                        value={preset.transactionType}
                        onValueChange={(value) => updatePinnedMerchantPreset(
                          index,
                          "transactionType",
                          value === "income" || value === "transfer" ? value : "expense",
                        )}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="income">Income</SelectItem>
                          <SelectItem value="expense">Expense</SelectItem>
                          <SelectItem value="transfer">Transfer</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Category code</Label>
                      <Input
                        value={preset.categoryCode}
                        onChange={(event) => updatePinnedMerchantPreset(index, "categoryCode", event.target.value)}
                        placeholder="food / transport / income.freelance"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Priority</Label>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        value={preset.priority}
                        onChange={(event) => updatePinnedMerchantPreset(index, "priority", Number.parseInt(event.target.value, 10) || 0)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Counterparty name</Label>
                      <Input
                        value={preset.counterpartyName ?? ""}
                        onChange={(event) => updatePinnedMerchantPreset(index, "counterpartyName", event.target.value || null)}
                        placeholder="Optional display name"
                      />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <Label>Note</Label>
                      <Input
                        value={preset.note ?? ""}
                        onChange={(event) => updatePinnedMerchantPreset(index, "note", event.target.value || null)}
                        placeholder="Why this merchant is pinned"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <div className="text-sm font-semibold text-slate-900">Slip mapping presets</div>
          <div className="text-xs text-muted-foreground">
            Match parsed slip text against reusable rules so common merchants, income sources, and expense categories are filled in automatically.
            In Finance, users will see the best matching preset first, with only a couple of fallback options hidden behind one extra click.
            Frequently used merchants from transaction history can appear as an even faster one-click suggestion.
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Matched after OCR / LLM parsing</Badge>
            <Badge variant="outline">
              {slipMappingPresets.length} preset{slipMappingPresets.length === 1 ? "" : "s"}
            </Badge>
            <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
              Applies to income, expense, and transfer slips
            </Badge>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" onClick={addSlipPreset} className="gap-2">
              <Plus className="h-4 w-4" />
              Add preset
            </Button>
            <Button type="button" variant="outline" onClick={resetSlipPresets} className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Reset to defaults
            </Button>
            <Button
              type="button"
              onClick={saveSlipMappingPresets}
              disabled={updateSettingMutation.isPending || !!savingSettingKey}
              className="gap-2"
            >
              {isSaving("slip_mapping_presets") ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save slip presets
            </Button>
          </div>

          <div className="mt-5 space-y-4">
            {slipMappingPresets.map((preset, index) => (
              <div key={preset.id || `${index}`} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Preset {index + 1}</div>
                    <Input
                      value={preset.label}
                      onChange={(event) => updateSlipPreset(index, "label", event.target.value)}
                      placeholder="Preset label"
                      className="max-w-xl"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={preset.enabled ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"}
                    >
                      {preset.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 text-slate-500"
                      onClick={() => updateSlipPreset(index, "enabled", !preset.enabled)}
                    >
                      {preset.enabled ? "Disable" : "Enable"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 text-slate-500"
                      onClick={() => removeSlipPreset(index)}
                      disabled={slipMappingPresets.length <= 1}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove
                    </Button>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Match text / aliases</Label>
                    <Input
                      value={preset.matchText}
                      onChange={(event) => updateSlipPreset(index, "matchText", event.target.value)}
                      placeholder="grab | bolt | taxi"
                    />
                    <p className="text-xs text-muted-foreground">Separate aliases with pipes, commas, or line breaks.</p>
                  </div>
                  <div className="space-y-1">
                    <Label>Transaction type</Label>
                    <Select
                      value={preset.transactionType}
                      onValueChange={(value) => updateSlipPreset(
                        index,
                        "transactionType",
                        value === "income" || value === "transfer" ? value : "expense",
                      )}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="income">Income</SelectItem>
                        <SelectItem value="expense">Expense</SelectItem>
                        <SelectItem value="transfer">Transfer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Category code</Label>
                    <Input
                      value={preset.categoryCode}
                      onChange={(event) => updateSlipPreset(index, "categoryCode", event.target.value)}
                      placeholder="transport / food / income.salary"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Priority</Label>
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      value={preset.priority}
                      onChange={(event) => updateSlipPreset(index, "priority", Number.parseInt(event.target.value, 10) || 0)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Counterparty name</Label>
                    <Input
                      value={preset.counterpartyName ?? ""}
                      onChange={(event) => updateSlipPreset(index, "counterpartyName", event.target.value || null)}
                      placeholder="Employer / Merchant / Cafe name"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Merchant name</Label>
                    <Input
                      value={preset.merchantName ?? ""}
                      onChange={(event) => updateSlipPreset(index, "merchantName", event.target.value || null)}
                      placeholder="Optional merchant name"
                    />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label>Note</Label>
                    <Input
                      value={preset.note ?? ""}
                      onChange={(event) => updateSlipPreset(index, "note", event.target.value || null)}
                      placeholder="Short note to attach to the draft"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white/80 p-4 text-xs text-slate-600">
            <div className="font-medium text-slate-800">How it works</div>
            <ul className="mt-2 space-y-1">
              <li>• OCR or the LLM slip parser reads the slip first.</li>
              <li>• These presets then normalize the transaction type, category, and common merchant labels.</li>
              <li>• Higher priority rules win when multiple presets match the same slip text.</li>
            </ul>
          </div>
        </div>
      </section>
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-4 text-sm text-slate-600">
          <div>Finance slip mapping and merchant pin rules now live on a separate Finance Rules page so OCR routing stays focused on providers and keys.</div>
          <Button type="button" variant="outline" className="mt-3 gap-2" onClick={() => setLocation("/admin/finance-rules")}>
            <Search className="h-4 w-4" />
            Open Finance Rules page
          </Button>
        </div>
      )}
    </DashboardCard>
  );
}
