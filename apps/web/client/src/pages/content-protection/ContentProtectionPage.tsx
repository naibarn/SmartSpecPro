import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import {
  AlertTriangle,
  CheckCircle2,
  FileCheck2,
  Fingerprint,
  Image as ImageIcon,
  LockKeyhole,
  Music2,
  PlayCircle,
  Search,
  ShieldCheck,
  Video,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTenantFeatureFlagStatus } from "@/hooks/useTenantFeatureFlag";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { WebAssetResolver } from "@/services/webAssetResolver";

const stages = [
  "validate_contract",
  "stage_inputs",
  "create_digital_watermark",
  "self_verify_watermark",
  "fingerprint_and_c2pa",
  "quality_control",
  "publish_artifact",
] as const;

const navItems = [
  ["overview", "nav.overview"],
  ["assets", "nav.assets"],
  ["verify", "nav.verify"],
  ["verifications", "nav.verifications"],
  ["cases", "nav.cases"],
  ["rights", "nav.rights"],
  ["certificate", "nav.certificate"],
  ["settings", "nav.settings"],
] as const;

type ProtectionTranslator = (key: string, params?: string | Record<string, string | number>) => string;

const statusTranslationKeys: Record<string, string> = {
  queued: "statusQueued",
  QUEUED: "statusQueued",
  processing: "statusProcessing",
  PROCESSING: "statusProcessing",
  PROTECTED: "statusProtected",
  PROTECTED_WITH_WARNINGS: "statusProtectedWarnings",
  FAILED: "statusFailed",
  PROTECTION_REQUESTED: "statusRequested",
  UNPROTECTED_BY_USER_CHOICE: "statusUnprotected",
  INCONCLUSIVE: "statusInconclusive",
  DRAFT: "statusDraft",
  OPEN: "statusOpen",
  COMPLETED: "statusCompleted",
};

function modalityIcon(modality: string) {
  if (modality === "image") return ImageIcon;
  if (modality === "audio") return Music2;
  return Video;
}

function statusLabel(status: string, t: ProtectionTranslator): string {
  if (status === "UNPROTECTED_BY_USER_CHOICE") return t("disabledByUser");
  const translationKey = statusTranslationKeys[status];
  return translationKey ? t(translationKey) : status.replaceAll("_", " ");
}

function EvidenceNotice({ t }: { t: ProtectionTranslator }) {
  return (
    <div
      className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950"
      role="note"
    >
      <strong>{t("technicalEvidenceOnly")}</strong> {t("evidenceDisclaimer")}
    </div>
  );
}

function StageList({ active, t }: { active?: string | null; t: ProtectionTranslator }) {
  return (
    <ol
      className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
      aria-label={t("stageAria")}
    >
      {stages.map((stage, index) => {
        const reached = active
          ? stages.indexOf(active as (typeof stages)[number]) >= index
          : false;
        return (
          <li
            key={stage}
            className={cn(
              "rounded-xl border px-3 py-2 text-xs",
              reached
                ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                : "border-slate-200 bg-slate-50 text-slate-600"
            )}
          >
            <span className="mr-2 font-semibold">{index + 1}</span>
            {stage.replaceAll("_", " ")}
          </li>
        );
      })}
    </ol>
  );
}

function AssetCard({ asset, t }: { asset: any; t: ProtectionTranslator }) {
  const Icon = modalityIcon(asset.modality);
  return (
    <Link
      href={`/content-protection/assets/${asset.publicAssetId}`}
      className="group block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold capitalize text-slate-900">
              {t("assetArtifact", { modality: t(asset.modality) })}
            </p>
            <p className="truncate text-xs text-slate-500">
              {t("publicId")}: {asset.publicAssetId ?? "—"}
            </p>
          </div>
        </div>
        <Badge variant={asset.status === "PROTECTED" ? "default" : "outline"}>
          {statusLabel(asset.status, t)}
        </Badge>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">
        <span className="rounded-full bg-slate-100 px-2 py-1">
          {t("choice")}: {asset.watermarkChoice?.toUpperCase()}
        </span>
        <span className="rounded-full bg-slate-100 px-2 py-1">
          {asset.mimeType}
        </span>
        {asset.compoundPlanDigest ? (
          <span className="rounded-full bg-slate-100 px-2 py-1">
            {t("compoundBound")}
          </span>
        ) : null}
      </div>
    </Link>
  );
}

export default function ContentProtectionPage({ initialSection }: { initialSection?: string } = {}) {
  const [, setLocation] = useLocation();
  const { t } = useScopedTranslation("contentProtection");
  const params = useParams<{ section?: string; assetId?: string; caseId?: string }>();
  const section = initialSection || params.section || "overview";
  const caseRef = params.caseId || (section === "cases" ? params.assetId : undefined);
  const feature = useTenantFeatureFlagStatus("contentProtectionEnabled");
  const imageFeature = useTenantFeatureFlagStatus(
    "contentProtectionImageProviderEnabled"
  );
  const [sourceAssetId, setSourceAssetId] = useState("");
  const [modality, setModality] = useState<"image" | "video" | "audio">(
    "video"
  );
  const [choice, setChoice] = useState<"on" | "off">("off");
  const [choiceTouched, setChoiceTouched] = useState(false);
  const [caseTitle, setCaseTitle] = useState("");
  const [caseSummary, setCaseSummary] = useState("");
  const [caseAssetIds, setCaseAssetIds] = useState("");
  const [reviewerAllowsPackageDownload, setReviewerAllowsPackageDownload] = useState(false);
  const [verifyUploadState, setVerifyUploadState] = useState<{
    pending: boolean;
    message?: string;
    error?: string;
  }>({ pending: false });
  const verifyFileInputRef = useRef<HTMLInputElement>(null);
  const verifyAssetResolver = useMemo(() => new WebAssetResolver(), []);
  const [rightsDisplayName, setRightsDisplayName] = useState("");
  const [rightsContactEmail, setRightsContactEmail] = useState("");
  const [rightsClaimType, setRightsClaimType] = useState("creator");
  const [legalDeclarationConfirmed, setLegalDeclarationConfirmed] =
    useState(false);
  const utils = trpc.useUtils();
  const overview = trpc.contentProtection.overview.useQuery(undefined, {
    enabled: feature.enabled && section === "overview",
  });
  const assets = trpc.contentProtection.listAssets.useQuery(
    { limit: 50 },
    { enabled: feature.enabled && ["overview", "assets"].includes(section) }
  );
  const asset = trpc.contentProtection.getAsset.useQuery(
    { assetId: params.assetId || "00000000-0000-0000-0000-000000000000" },
    {
      enabled:
        feature.enabled && section === "assets" && Boolean(params.assetId),
    }
  );
  const settings = trpc.contentProtection.getSettings.useQuery(undefined, {
    enabled: feature.enabled && ["overview", "settings"].includes(section),
  });
  useEffect(() => {
    const defaultChoice = settings.data?.defaultChoice;
    if (choiceTouched || (defaultChoice !== "on" && defaultChoice !== "off")) {
      return;
    }
    setChoice(defaultChoice);
  }, [choiceTouched, settings.data?.defaultChoice]);
  const saveSettings = trpc.contentProtection.setDefaultChoice.useMutation({
    onSuccess: () => utils.contentProtection.getSettings.invalidate(),
  });
  const protect = trpc.contentProtection.protectAsset.useMutation({
    onSuccess: () => {
      void utils.contentProtection.listAssets.invalidate();
      void utils.contentProtection.overview.invalidate();
    },
  });
  const verify = trpc.contentProtection.verifyCopy.useMutation({
    onSuccess: result =>
      setLocation(`/content-protection/verifications/${result.runId}`),
  });
  const verification = trpc.contentProtection.getVerification.useQuery(
    { runId: params.assetId || "00000000-0000-0000-0000-000000000000" },
    {
      enabled:
        feature.enabled &&
        section === "verifications" &&
        Boolean(params.assetId),
      refetchInterval: 3000,
    }
  );
  const cases = trpc.contentProtection.listCases.useQuery(undefined, {
    enabled: feature.enabled && section === "cases" && !caseRef,
  });
  const selectedCase = trpc.contentProtection.getCase.useQuery(
    { caseId: caseRef || "00000000-0000-0000-0000-000000000000" },
    {
      enabled: feature.enabled && section === "cases" && Boolean(caseRef),
    },
  );
  const rights = trpc.contentProtection.getRights.useQuery(
    { assetId: params.assetId || "00000000-0000-0000-0000-000000000000" },
    {
      enabled:
        feature.enabled && section === "rights" && Boolean(params.assetId),
    }
  );
  const certificate = trpc.contentProtection.getCertificate.useQuery(
    { assetId: params.assetId || "00000000-0000-0000-0000-000000000000" },
    {
      enabled:
        feature.enabled && section === "certificate" && Boolean(params.assetId),
    }
  );
  const createCase = trpc.contentProtection.createCase.useMutation({
    onSuccess: () => {
      setCaseTitle("");
      setCaseSummary("");
      void utils.contentProtection.listCases.invalidate();
    },
  });
  const createEvidencePackage =
    trpc.contentProtection.createEvidencePackage.useMutation();
  const createReviewerLink =
    trpc.contentProtection.createReviewerLink.useMutation();
  const createRightsClaim =
    trpc.contentProtection.createRightsClaim.useMutation({
      onSuccess: () => void utils.contentProtection.getRights.invalidate(),
    });
  const createCertificate =
    trpc.contentProtection.createCertificate.useMutation({
      onSuccess: () => void utils.contentProtection.getCertificate.invalidate(),
    });

  const sectionQueryError =
    (section === "overview" && (overview.isError || assets.isError || settings.isError)) ||
    (section === "assets" && (assets.isError || asset.isError)) ||
    (section === "verify" && verify.isError) ||
    (section === "verifications" && verification.isError) ||
    (section === "cases" && (cases.isError || selectedCase.isError)) ||
    (section === "rights" && rights.isError) ||
    (section === "certificate" && certificate.isError) ||
    (section === "settings" && settings.isError);

  const title = useMemo(
    () => {
      const key = navItems.find(([id]) => id === section)?.[1];
      return key ? t(key) : t("workspaceTitle");
    },
    [section, t]
  );

  if (!feature.isResolved)
    return (
      <main className="mx-auto max-w-7xl p-6" aria-busy="true">
        <div className="h-40 animate-pulse rounded-3xl bg-slate-100" />
      </main>
    );
  if (!feature.enabled)
    return (
      <main className="mx-auto max-w-3xl p-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <LockKeyhole className="mx-auto h-10 w-10 text-slate-400" />
          <h1 className="mt-4 text-2xl font-semibold text-slate-900">
            {t("notEnabledTitle")}
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {t("notEnabledDescription")}
          </p>
        </div>
      </main>
    );

  const submitProtection = () => {
    const numericId = Number(sourceAssetId);
    if (!Number.isSafeInteger(numericId) || numericId <= 0) return;
    protect.mutate({
      sourceAssetId: numericId,
      modality,
      perExportChoice: choice,
      idempotencyKey: `ui-${numericId}-${modality}-${Date.now()}`,
    });
  };
  const imageProtectionUnavailable =
    modality === "image" && (!imageFeature.isResolved || !imageFeature.enabled);

  const uploadSuspectedMedia = async (file: File | undefined) => {
    if (!file) return;
    const fileModality = file.type.split("/", 1)[0];
    if (fileModality !== "image" && fileModality !== "video" && fileModality !== "audio") {
      setVerifyUploadState({ pending: false, error: t("invalidMediaType") });
      return;
    }
    setVerifyUploadState({ pending: true });
    try {
      const upload = verifyAssetResolver.uploadAsset(file, undefined, {
        idempotencyKey: `content-protection-verify-${Date.now()}`,
      });
      const result = await upload.promise;
      if (!result.mediaAssetId) throw new Error(t("uploadNotRegistered"));
      setSourceAssetId(result.mediaAssetId);
      setModality(fileModality);
      setVerifyUploadState({ pending: false, message: t("uploadedChecksumPending") });
    } catch (error) {
      setVerifyUploadState({ pending: false, error: error instanceof Error ? error.message : t("uploadFailed") });
    }
  };

  return (
    <main className="min-h-screen bg-slate-50/80 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col gap-4 rounded-3xl border border-slate-200 bg-slate-950 p-6 text-white shadow-xl sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">
            {t("eyebrow")}
            </p>
            <h1 className="mt-2 text-3xl font-semibold">{title}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              {t("workspaceDescription")}
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <ShieldCheck className="h-5 w-5 text-emerald-300" /> {t("userChoice")}
          </div>
        </header>
        <nav
          className="mb-6 flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2"
          aria-label={t("navigationAria")}
        >
          {navItems.map(([id, label]) => (
            <Link
              key={id}
              href={`/content-protection/${id}`}
              aria-current={section === id ? "page" : undefined}
              className={cn(
                "whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
                section === id
                  ? "bg-slate-950 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              )}
            >
              {t(label)}
            </Link>
          ))}
        </nav>
        <EvidenceNotice t={t} />
        {sectionQueryError ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            {t("workspaceLoadError")}
          </div>
        ) : null}

        {section === "overview" ? (
          <section className="mt-6 space-y-6">
            {overview.isLoading ? (
              <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600" aria-busy="true">
                {t("loadingOverview")}
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
                {Object.entries(overview.data ?? {}).map(([key, value]) => (
                  <div
                    key={key}
                    className="rounded-2xl border border-slate-200 bg-white p-4"
                  >
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      {key}
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">
                      {String(value)}
                    </p>
                  </div>
                ))}
              </div>
            )}
            <div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
              <div className="rounded-3xl border border-slate-200 bg-white p-6">
                <div className="flex items-center gap-3">
                  <Fingerprint className="h-6 w-6 text-emerald-600" />
                  <h2 className="text-lg font-semibold">
                    {t("protectFinalTitle")}
                  </h2>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {t("protectFinalDescription")}
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <Input
                    aria-label={t("sourceAssetId")}
                    placeholder={t("mediaAssetIdPlaceholder")}
                    value={sourceAssetId}
                    onChange={e => setSourceAssetId(e.target.value)}
                  />
                  <select
                    aria-label={t("verificationModality")}
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={modality}
                    onChange={e =>
                      setModality(e.target.value as typeof modality)
                    }
                  >
                    <option value="image">{t("image")}</option>
                    <option value="video">{t("video")}</option>
                    <option value="audio">{t("audio")}</option>
                  </select>
                  <div
                    className="flex rounded-md border border-slate-200 p-1"
                    role="group"
                    aria-label={t("digitalWatermarkChoice")}
                  >
                    <button
                      type="button"
                      aria-pressed={choice === "on"}
                      className={cn(
                        "flex-1 rounded px-2 text-sm",
                        choice === "on" && "bg-emerald-600 text-white"
                      )}
                      onClick={() => {
                        setChoiceTouched(true);
                        setChoice("on");
                      }}
                    >
                      {t("on")}
                    </button>
                    <button
                      type="button"
                      aria-pressed={choice === "off"}
                      className={cn(
                        "flex-1 rounded px-2 text-sm",
                        choice === "off" && "bg-slate-200 text-slate-900"
                      )}
                      onClick={() => {
                        setChoiceTouched(true);
                        setChoice("off");
                      }}
                    >
                      {t("off")}
                    </button>
                  </div>
                </div>
                {imageProtectionUnavailable ? (
                  <p className="mt-3 text-sm text-amber-700" role="status">
                    {t("imageProtectionUnavailable")}
                  </p>
                ) : null}
                <p
                  className={cn(
                    "mt-3 text-sm",
                    choice === "on" ? "text-emerald-700" : "text-amber-700"
                  )}
                >
                  {choice === "on" ? t("onNotice") : t("offNotice")}
                </p>
                <Button
                  className="mt-4"
                  onClick={submitProtection}
                  disabled={
                    protect.isPending ||
                    !sourceAssetId ||
                    imageProtectionUnavailable
                  }
                >
                  {protect.isPending
                    ? t("queueingProtection")
                    : t("protectFinalAction")}
                </Button>
                {protect.data?.asset ? (
                  <div
                    className="mt-4 rounded-xl bg-slate-50 p-3 text-sm"
                    role="status"
                  >
                    {statusLabel(protect.data.asset.status, t)}
                    {protect.data.jobId ? ` · Job ${protect.data.jobId}` : ""}
                  </div>
                ) : null}
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-6">
                <h2 className="text-lg font-semibold">{t("whenCreatedTitle")}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {t("whenCreatedDescription")}
                </p>
                <div className="mt-4">
                  <StageList
                    t={t}
                    active={
                      protect.data?.asset?.status === "PROTECTED"
                        ? "publish_artifact"
                        : null
                    }
                  />
                </div>
              </div>
            </div>
            <div>
              <h2 className="mb-3 text-lg font-semibold text-slate-900">{t("recentAssets")}</h2>
              {assets.isLoading ? (
                <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600" aria-busy="true">
                  {t("loadingAssets")}
                </p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {(assets.data ?? []).slice(0, 6).map(assetRow => (
                    <AssetCard key={assetRow.publicAssetId} asset={assetRow} t={t} />
                  ))}
                </div>
              )}
              {!assets.isLoading && assets.data?.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                  {t("noAssets")}
                </p>
              ) : null}
            </div>
          </section>
        ) : null}

        {section === "assets" ? (
          <section className="mt-6">
            {params.assetId ? (
              <div className="space-y-6">
                {asset.isLoading ? (
                  <p aria-busy="true">{t("loadingEvidence")}</p>
                ) : asset.data ? (
                  <>
                    <div className="rounded-3xl border border-slate-200 bg-white p-6">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-slate-500">
                            {t("assetArtifact", { modality: t(asset.data.modality) })}
                          </p>
                          <h2 className="mt-1 text-2xl font-semibold">
                            {statusLabel(asset.data.status, t)}
                          </h2>
                        </div>
                        <Badge>
                          {asset.data.watermarkChoice?.toUpperCase()}
                        </Badge>
                      </div>
                      <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
                        <div>
                          <dt className="text-slate-500">{t("publicAssetId")}</dt>
                          <dd className="mt-1 break-all font-mono text-xs text-slate-900">
                            {asset.data.publicAssetId ?? "—"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">{t("sourceSha256")}</dt>
                          <dd className="mt-1 break-all font-mono text-xs text-slate-900">
                            {asset.data.sourceSha256}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">{t("protectedSha256")}</dt>
                          <dd className="mt-1 break-all font-mono text-xs text-slate-900">
                            {asset.data.protectedSha256 ?? t("pendingSelfVerification")}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">{t("compoundPlan")}</dt>
                          <dd className="mt-1 text-slate-900">
                            {asset.data.compoundPlanDigest ?? t("standaloneAsset")}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">{t("technicalSignal")}</dt>
                          <dd className="mt-1 text-slate-900">
                            {asset.data.protectedAt ? t("selfDetectedQcPassed") : t("notYetVerified")}
                          </dd>
                        </div>
                      </dl>
                      <div
                        className="mt-5 grid gap-3 sm:grid-cols-3"
                        aria-label={`${asset.data.modality} evidence`}
                      >
                        <div className="rounded-xl bg-slate-50 p-3">
                          <p className="text-xs text-slate-500">
                            {asset.data.modality === "image"
                              ? t("invisibleImageWatermark")
                              : asset.data.modality === "video"
                                ? t("videoWatermark")
                                : t("audioWatermark")}
                          </p>
                          <p className="mt-1 text-sm font-medium text-slate-900">
                            {asset.data.protectedAt
                              ? t("detectedAfterCreation")
                              : t("awaitingWorker")}
                          </p>
                        </div>
                        <div className="rounded-xl bg-slate-50 p-3">
                          <p className="text-xs text-slate-500">
                            {t("fingerprintSignal")}
                          </p>
                          <p className="mt-1 text-sm font-medium text-slate-900">
                            {asset.data.modality === "image"
                              ? t("imageFingerprint")
                              : asset.data.modality === "video"
                                ? t("videoFingerprint")
                                : t("audioFingerprint")}
                          </p>
                        </div>
                        <div className="rounded-xl bg-slate-50 p-3">
                          <p className="text-xs text-slate-500">
                            {t("dimensionsDuration")}
                          </p>
                          <p className="mt-1 text-sm font-medium text-slate-900">
                            {asset.data.modality === "image"
                              ? `${asset.data.width ?? "—"} × ${asset.data.height ?? "—"}`
                              : asset.data.durationMs
                                ? `${Math.round(asset.data.durationMs / 1000)}s`
                                : "—"}
                          </p>
                        </div>
                      </div>
                      <div className="mt-5 flex flex-wrap gap-2">
                        <Link
                          href={`/content-protection/assets/${asset.data.publicAssetId}/rights`}
                        >
                          <Button variant="outline">{t("rightsAction")}</Button>
                        </Link>
                        <Link
                          href={`/content-protection/assets/${asset.data.publicAssetId}/certificate`}
                        >
                          <Button variant="outline">
                            {t("certificateAction")}
                          </Button>
                        </Link>
                      </div>
                    </div>
                    <StageList
                      t={t}
                      active={
                        asset.data.status === "PROTECTED"
                          ? "publish_artifact"
                          : null
                      }
                    />
                  </>
                ) : (
                  <p>{t("assetNotFound")}</p>
                )}
              </div>
            ) : (
              assets.isLoading ? (
                <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600" aria-busy="true">
                  {t("loadingAssets")}
                </p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {(assets.data ?? []).map(assetRow => (
                    <AssetCard key={assetRow.publicAssetId} asset={assetRow} t={t} />
                  ))}
                </div>
              )
            )}
          </section>
        ) : null}

        {section === "verify" ? (
          <section className="mt-6 grid gap-6 lg:grid-cols-[.8fr_1.2fr]">
            <div className="rounded-3xl border border-slate-200 bg-white p-6">
              <Search className="h-7 w-7 text-emerald-600" />
              <h2 className="mt-3 text-xl font-semibold">
                {t("verifyTitle")}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {t("verifyDescription")}
              </p>
              <input
                ref={verifyFileInputRef}
                type="file"
                className="sr-only"
                accept="image/*,video/*,audio/*"
                onChange={event => {
                  void uploadSuspectedMedia(event.target.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
              <Button
                className="mt-4 w-full"
                variant="outline"
                onClick={() => verifyFileInputRef.current?.click()}
                disabled={verifyUploadState.pending}
              >
                {verifyUploadState.pending ? t("uploadingSuspected") : t("uploadSuspected")}
              </Button>
              {verifyUploadState.message ? <p className="mt-2 text-xs text-emerald-700" role="status">{verifyUploadState.message}</p> : null}
              {verifyUploadState.error ? <p className="mt-2 text-xs text-red-700" role="alert">{verifyUploadState.error}</p> : null}
              <Input
                className="mt-5"
                aria-label={t("queryAssetId")}
                placeholder={t("mediaAssetIdPlaceholder")}
                value={sourceAssetId}
                onChange={e => setSourceAssetId(e.target.value)}
              />
              <select
                aria-label={t("verificationModality")}
                className="mt-3 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={modality}
                onChange={e => setModality(e.target.value as typeof modality)}
              >
                <option value="image">{t("image")}</option>
                <option value="video">{t("video")}</option>
                <option value="audio">{t("audio")}</option>
              </select>
              <Button
                className="mt-4 w-full"
                onClick={() => {
                  const id = Number(sourceAssetId);
                  if (Number.isSafeInteger(id) && id > 0)
                    verify.mutate({ sourceAssetId: id, modality });
                }}
                disabled={verify.isPending || !sourceAssetId}
              >
                {verify.isPending
                  ? t("startingVerification")
                  : t("startVerification")}
              </Button>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-6">
              <h2 className="text-lg font-semibold">{t("signalsReviewed")}</h2>
              <ul className="mt-4 space-y-3 text-sm text-slate-700">
                <li className="flex gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" /> {t("exactSha256")}
                </li>
                <li className="flex gap-2">
                  <Fingerprint className="h-4 w-4 text-emerald-600" /> {t("watermarkRecord")}
                </li>
                <li className="flex gap-2">
                  <PlayCircle className="h-4 w-4 text-emerald-600" />{" "}
                  {t("imageDhash")}
                </li>
              </ul>
            </div>
          </section>
        ) : null}

        {section === "verifications" ? (
          <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6">
            <h2 className="text-xl font-semibold">{t("verificationResult")}</h2>
            {verification.isLoading ? (
              <p className="mt-3" aria-busy="true">
                {t("processing")}
              </p>
            ) : verification.data ? (
              <div className="mt-4 space-y-4">
                <Badge
                  variant={
                    verification.data.status === "COMPLETED"
                      ? "default"
                      : "outline"
                  }
                >
                  {statusLabel(verification.data.status, t)}
                </Badge>
                <pre className="overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">
                  {JSON.stringify(verification.data.matches, null, 2)}
                </pre>
                <p className="text-sm text-amber-800">
                  {t("technicalMatchDisclaimer")}
                </p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                {t("noVerification")}
              </p>
            )}
          </section>
        ) : null}

        {section === "settings" ? (
          <section className="mt-6 max-w-2xl rounded-3xl border border-slate-200 bg-white p-6">
            <h2 className="text-xl font-semibold">{t("defaultChoiceTitle")}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {t("defaultChoiceDescription")}
            </p>
            <div
              className="mt-5 flex gap-2"
              role="group"
              aria-label={t("defaultChoiceAria")}
            >
              <Button
                type="button"
                variant={
                  settings.data?.defaultChoice === "on" ? "default" : "outline"
                }
                aria-pressed={settings.data?.defaultChoice === "on"}
                disabled={settings.isLoading || saveSettings.isPending}
                onClick={() => saveSettings.mutate({ defaultChoice: "on" })}
              >
                {t("on")}
              </Button>
              <Button
                type="button"
                variant={
                  settings.data?.defaultChoice !== "on" ? "default" : "outline"
                }
                aria-pressed={settings.data?.defaultChoice !== "on"}
                disabled={settings.isLoading || saveSettings.isPending}
                onClick={() => saveSettings.mutate({ defaultChoice: "off" })}
              >
                {t("off")}
              </Button>
            </div>
            <p className="mt-4 text-sm text-slate-600">
              {settings.isLoading ? (
                t("loadingSettings")
              ) : (
                <>
                  {t("currentDefault")}: {" "}
                  <strong>
                    {settings.data?.defaultChoice?.toUpperCase() ?? "OFF"}
                  </strong>
                </>
              )}
            </p>
          </section>
        ) : null}

        {section === "cases" ? (
          <section className="mt-6 space-y-4">
            {caseRef ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-6">
                {selectedCase.isLoading ? <p aria-busy="true">{t("loadingCase")}</p> : selectedCase.data ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-500">{t("caseDetail")}</p>
                        <h2 className="mt-1 text-xl font-semibold">{selectedCase.data.title}</h2>
                      </div>
                      <Badge variant="outline">{statusLabel(selectedCase.data.status, t)}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{selectedCase.data.summary || t("caseSummaryFallback")}</p>
                    <p className="mt-4 break-all font-mono text-xs text-slate-500">{t("publicCaseId")}: {selectedCase.data.publicCaseId}</p>
                    <Link className="mt-4 inline-block text-sm text-emerald-700 underline" href="/content-protection/cases">{t("backToCases")}</Link>
                  </>
                ) : <p className="text-sm text-slate-600">{t("caseNotFound")}</p>}
              </div>
            ) : null}
            <div className="rounded-3xl border border-slate-200 bg-white p-6">
              <h2 className="text-xl font-semibold">{t("createCaseTitle")}</h2>
              <p className="mt-2 text-sm text-slate-600">
                {t("createCaseDescription")}
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Input
                  aria-label={t("caseTitlePlaceholder")}
                  placeholder={t("caseTitlePlaceholder")}
                  value={caseTitle}
                  onChange={e => setCaseTitle(e.target.value)}
                />
                <Input
                  aria-label={t("assetIdsPlaceholder")}
                  placeholder={t("assetIdsPlaceholder")}
                  value={caseAssetIds}
                  onChange={e => setCaseAssetIds(e.target.value)}
                />
              </div>
              <Input
                className="mt-3"
                aria-label={t("caseSummaryPlaceholder")}
                placeholder={t("caseSummaryPlaceholder")}
                value={caseSummary}
                onChange={e => setCaseSummary(e.target.value)}
              />
              <Button
                className="mt-4"
                onClick={() =>
                  createCase.mutate({
                    title: caseTitle,
                    summary: caseSummary || undefined,
                  })
                }
                disabled={createCase.isPending || !caseTitle.trim()}
              >
                {t("createCase")}
              </Button>
              {createEvidencePackage.data ? (
                <div
                  className="mt-4 rounded-xl bg-slate-50 p-3 text-sm"
                  role="status"
                >
                  {t("evidencePackageSealed")} {" "}
                  {createEvidencePackage.data.package.packageSha256}
                </div>
              ) : null}
            </div>
            {!caseRef && cases.isLoading ? (
              <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600" aria-busy="true">
                {t("loadingCases")}
              </p>
            ) : null}
            {!caseRef && !cases.isLoading ? (cases.data ?? []).map((item: any) => (
              <div
                key={item.publicCaseId}
                className="rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Link className="font-semibold text-slate-900 underline" href={`/content-protection/cases/${item.publicCaseId}`}>{item.title}</Link>
                  <Badge variant="outline">{statusLabel(item.status, t)}</Badge>
                </div>
                  <p className="mt-2 text-sm text-slate-600">
                  {item.summary || t("technicalEvidenceCase")}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      const assetIds = caseAssetIds
                        .split(",")
                        .map(value => value.trim())
                        .filter(Boolean);
                      if (assetIds.length)
                        createEvidencePackage.mutate({
                          caseId: item.publicCaseId,
                          assetIds,
                        });
                    }}
                    disabled={
                      createEvidencePackage.isPending || !caseAssetIds.trim()
                    }
                  >
                    {t("sealEvidence")}
                  </Button>
                  {createEvidencePackage.data?.package.publicCaseId === item.publicCaseId ? (
                    <>
                      <label className="flex items-center gap-2 text-xs text-slate-600">
                        <input
                          type="checkbox"
                          checked={reviewerAllowsPackageDownload}
                          onChange={event => setReviewerAllowsPackageDownload(event.target.checked)}
                        />
                        {t("allowDownload")}
                      </label>
                      <Button
                        variant="outline"
                        onClick={() =>
                          createReviewerLink.mutate({
                            packageId: createEvidencePackage.data.package.id,
                            expiresInHours: 24,
                            scope: [
                              "technical_evidence",
                              ...(reviewerAllowsPackageDownload ? ["package_download"] : []),
                            ],
                          })
                        }
                        disabled={createReviewerLink.isPending}
                      >
                        {t("createReviewerLink")}
                      </Button>
                    </>
                  ) : null}
                </div>
                {createReviewerLink.data ? (
                  <p
                    className="mt-3 break-all text-xs text-emerald-700"
                    role="status"
                  >
                    {t("reviewerUrl")} {" "}
                    <a
                      className="underline"
                      href={createReviewerLink.data.reviewPath}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {window.location.origin + createReviewerLink.data.reviewPath}
                    </a>
                  </p>
                ) : null}
              </div>
            )) : null}
            {!caseRef && !cases.isLoading && cases.data?.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                {t("noCases")}
              </p>
            ) : null}
          </section>
        ) : null}

        {section === "rights" || section === "certificate" ? (
          <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6">
            <FileCheck2 className="h-7 w-7 text-emerald-600" />
            <h2 className="mt-3 text-xl font-semibold">
              {section === "rights" ? t("rightsTitle") : t("certificateTitle")}
            </h2>
            {section === "rights" ? (
              <>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Input
                    aria-label={t("rightsHolderName")}
                    placeholder={t("rightsHolderName")}
                    value={rightsDisplayName}
                    onChange={e => setRightsDisplayName(e.target.value)}
                  />
                  <Input
                    aria-label={t("contactEmail")}
                    placeholder={t("contactEmail")}
                    value={rightsContactEmail}
                    onChange={e => setRightsContactEmail(e.target.value)}
                  />
                  <Input
                    aria-label={t("claimType")}
                    placeholder={t("claimType")}
                    value={rightsClaimType}
                    onChange={e => setRightsClaimType(e.target.value)}
                  />
                </div>
                <label className="mt-4 flex items-start gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={legalDeclarationConfirmed}
                    onChange={e =>
                      setLegalDeclarationConfirmed(e.target.checked)
                    }
                  />{" "}
                  {t("rightsDeclaration")}
                </label>
                <Button
                  className="mt-4"
                  onClick={() =>
                    params.assetId &&
                    createRightsClaim.mutate({
                      assetId: params.assetId,
                      displayName: rightsDisplayName,
                      contactEmail: rightsContactEmail || undefined,
                      claimType: rightsClaimType,
                      legalDeclarationConfirmed,
                    })
                  }
                  disabled={
                    createRightsClaim.isPending ||
                    !params.assetId ||
                    !rightsDisplayName.trim() ||
                    !legalDeclarationConfirmed
                  }
                >
                  {t("saveRightsClaim")}
                </Button>
                {rights.isLoading ? (
                  <p className="mt-5 text-sm text-slate-600" aria-busy="true">{t("loadingEvidence")}</p>
                ) : (
                  <pre className="mt-5 overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">
                    {JSON.stringify(
                      rights.data ?? { message: t("selectAssetRights") },
                      null,
                      2
                    )}
                  </pre>
                )}
              </>
            ) : (
              <>
                <Button
                  className="mt-4"
                  onClick={() =>
                    params.assetId &&
                    createCertificate.mutate({ assetId: params.assetId })
                  }
                  disabled={createCertificate.isPending || !params.assetId}
                >
                  {t("createOrLoadCertificate")}
                </Button>
                {certificate.isLoading ? (
                  <p className="mt-4 text-sm text-slate-600" aria-busy="true">{t("loadingEvidence")}</p>
                ) : (
                  <pre className="mt-4 overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">
                    {JSON.stringify(
                      certificate.data ?? { message: t("certificateRequirement") },
                      null,
                      2
                    )}
                  </pre>
                )}
              </>
            )}
          </section>
        ) : null}
      </div>
    </main>
  );
}
