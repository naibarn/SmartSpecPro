import { useMemo, useState } from "react";
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
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

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
  ["overview", "Overview"],
  ["assets", "Protected assets"],
  ["verify", "Verify a copy"],
  ["verifications", "Verification results"],
  ["cases", "Cases"],
  ["rights", "Rights & ownership"],
  ["certificate", "Certificate"],
  ["settings", "Settings"],
] as const;

function modalityIcon(modality: string) {
  if (modality === "image") return ImageIcon;
  if (modality === "audio") return Music2;
  return Video;
}

function statusLabel(status: string): string {
  return status === "UNPROTECTED_BY_USER_CHOICE"
    ? "Digital watermark: OFF — disabled by user"
    : status.replaceAll("_", " ");
}

function EvidenceNotice() {
  return (
    <div
      className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950"
      role="note"
    >
      <strong>Technical evidence only.</strong> A watermark, hash, fingerprint,
      or timestamp does not by itself establish legal ownership. Review rights,
      licences, and chain-of-title evidence before making a legal declaration.
    </div>
  );
}

function StageList({ active }: { active?: string | null }) {
  return (
    <ol
      className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
      aria-label="Digital watermark processing stages"
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

function AssetCard({ asset }: { asset: any }) {
  const Icon = modalityIcon(asset.modality);
  return (
    <Link
      href={`/content-protection/assets/${asset.id}`}
      className="group block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold capitalize text-slate-900">
              {asset.modality} artifact
            </p>
            <p className="truncate text-xs text-slate-500">
              {asset.sourceSha256}
            </p>
          </div>
        </div>
        <Badge variant={asset.status === "PROTECTED" ? "default" : "outline"}>
          {asset.status.replaceAll("_", " ")}
        </Badge>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">
        <span className="rounded-full bg-slate-100 px-2 py-1">
          Choice: {asset.watermarkChoice?.toUpperCase()}
        </span>
        <span className="rounded-full bg-slate-100 px-2 py-1">
          {asset.mimeType}
        </span>
        {asset.compoundPlanDigest ? (
          <span className="rounded-full bg-slate-100 px-2 py-1">
            Compound bound
          </span>
        ) : null}
      </div>
    </Link>
  );
}

export default function ContentProtectionPage() {
  const [, setLocation] = useLocation();
  const params = useParams<{ section?: string; assetId?: string }>();
  const section = params.section || "overview";
  const feature = useTenantFeatureFlagStatus("contentProtectionEnabled");
  const imageFeature = useTenantFeatureFlagStatus(
    "contentProtectionImageProviderEnabled"
  );
  const [sourceAssetId, setSourceAssetId] = useState("");
  const [modality, setModality] = useState<"image" | "video" | "audio">(
    "video"
  );
  const [choice, setChoice] = useState<"on" | "off">("off");
  const [caseTitle, setCaseTitle] = useState("");
  const [caseSummary, setCaseSummary] = useState("");
  const [caseAssetIds, setCaseAssetIds] = useState("");
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
    enabled: feature.enabled && section === "settings",
  });
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
    enabled: feature.enabled && section === "cases",
  });
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

  const title = useMemo(
    () => navItems.find(([id]) => id === section)?.[1] ?? "Content Protection",
    [section]
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
            Content Protection is not enabled
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Ask your tenant administrator to enable this workspace. No provider
            credentials or watermark secrets are exposed here.
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

  return (
    <main className="min-h-screen bg-slate-50/80 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col gap-4 rounded-3xl border border-slate-200 bg-slate-950 p-6 text-white shadow-xl sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">
              Content Protection
            </p>
            <h1 className="mt-2 text-3xl font-semibold">{title}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              Protect final image, audio, and video artifacts, then inspect
              reproducible technical evidence.
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <ShieldCheck className="h-5 w-5 text-emerald-300" /> User-controlled
            ON/OFF
          </div>
        </header>
        <nav
          className="mb-6 flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2"
          aria-label="Content Protection navigation"
        >
          {navItems.map(([id, label]) => (
            <Link
              key={id}
              href={`/content-protection/${id}`}
              className={cn(
                "whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
                section === id
                  ? "bg-slate-950 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
        <EvidenceNotice />

        {section === "overview" ? (
          <section className="mt-6 space-y-6">
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
            <div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
              <div className="rounded-3xl border border-slate-200 bg-white p-6">
                <div className="flex items-center gap-3">
                  <Fingerprint className="h-6 w-6 text-emerald-600" />
                  <h2 className="text-lg font-semibold">
                    Protect a final asset
                  </h2>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  The digital watermark is created only after the selected final
                  bytes are available. Intermediate clips are not treated as the
                  final protected artifact.
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <Input
                    aria-label="Source media asset ID"
                    placeholder="Media asset ID"
                    value={sourceAssetId}
                    onChange={e => setSourceAssetId(e.target.value)}
                  />
                  <select
                    aria-label="Media modality"
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={modality}
                    onChange={e =>
                      setModality(e.target.value as typeof modality)
                    }
                  >
                    <option value="image">Image</option>
                    <option value="video">Video</option>
                    <option value="audio">Audio</option>
                  </select>
                  <div
                    className="flex rounded-md border border-slate-200 p-1"
                    role="group"
                    aria-label="Digital watermark choice"
                  >
                    <button
                      type="button"
                      className={cn(
                        "flex-1 rounded px-2 text-sm",
                        choice === "on" && "bg-emerald-600 text-white"
                      )}
                      onClick={() => setChoice("on")}
                    >
                      ON
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "flex-1 rounded px-2 text-sm",
                        choice === "off" && "bg-slate-200 text-slate-900"
                      )}
                      onClick={() => setChoice("off")}
                    >
                      OFF
                    </button>
                  </div>
                </div>
                {imageProtectionUnavailable ? (
                  <p className="mt-3 text-sm text-amber-700" role="status">
                    Image protection is not enabled for this tenant yet. Ask an
                    administrator to enable the image provider rollout flag.
                  </p>
                ) : null}
                <p
                  className={cn(
                    "mt-3 text-sm",
                    choice === "on" ? "text-emerald-700" : "text-amber-700"
                  )}
                >
                  {choice === "on"
                    ? "Digital watermark: ON — final artifact will wait for self-verification."
                    : "Digital watermark: OFF — disabled by user; output is unprotected."}
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
                    ? "Queueing protection…"
                    : "Protect final artifact"}
                </Button>
                {protect.data?.asset ? (
                  <div
                    className="mt-4 rounded-xl bg-slate-50 p-3 text-sm"
                    role="status"
                  >
                    {statusLabel(protect.data.asset.status)}
                    {protect.data.jobId ? ` · Job ${protect.data.jobId}` : ""}
                  </div>
                ) : null}
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-6">
                <h2 className="text-lg font-semibold">
                  When is the watermark created?
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  After final compound/render bytes are persisted, during the
                  protection worker stages below.
                </p>
                <div className="mt-4">
                  <StageList
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
              <h2 className="mb-3 text-lg font-semibold text-slate-900">
                Recent protected assets
              </h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {(assets.data ?? []).slice(0, 6).map(assetRow => (
                  <AssetCard key={assetRow.id} asset={assetRow} />
                ))}
              </div>
              {assets.data?.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                  No protected assets yet. Choose ON above to protect a final
                  artifact.
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
                  <p aria-busy="true">Loading evidence…</p>
                ) : asset.data ? (
                  <>
                    <div className="rounded-3xl border border-slate-200 bg-white p-6">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-slate-500">
                            {asset.data.modality} final artifact
                          </p>
                          <h2 className="mt-1 text-2xl font-semibold">
                            {statusLabel(asset.data.status)}
                          </h2>
                        </div>
                        <Badge>
                          {asset.data.watermarkChoice?.toUpperCase()}
                        </Badge>
                      </div>
                      <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
                        <div>
                          <dt className="text-slate-500">Source SHA-256</dt>
                          <dd className="mt-1 break-all font-mono text-xs text-slate-900">
                            {asset.data.sourceSha256}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Protected SHA-256</dt>
                          <dd className="mt-1 break-all font-mono text-xs text-slate-900">
                            {asset.data.protectedSha256 ??
                              "Pending self-verification"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Compound plan</dt>
                          <dd className="mt-1 text-slate-900">
                            {asset.data.compoundPlanDigest ??
                              "Standalone asset"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Technical signal</dt>
                          <dd className="mt-1 text-slate-900">
                            {asset.data.protectedAt
                              ? "Self-detected and QC passed"
                              : "Not yet verified"}
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
                              ? "Invisible image watermark"
                              : asset.data.modality === "video"
                                ? "Video watermark"
                                : "Audio watermark"}
                          </p>
                          <p className="mt-1 text-sm font-medium text-slate-900">
                            {asset.data.protectedAt
                              ? "Detected after creation"
                              : "Awaiting worker result"}
                          </p>
                        </div>
                        <div className="rounded-xl bg-slate-50 p-3">
                          <p className="text-xs text-slate-500">
                            Fingerprint signal
                          </p>
                          <p className="mt-1 text-sm font-medium text-slate-900">
                            {asset.data.modality === "image"
                              ? "PDQ / crop-resize alignment"
                              : asset.data.modality === "video"
                                ? "Perceptual video fingerprint"
                                : "Audio fingerprint"}
                          </p>
                        </div>
                        <div className="rounded-xl bg-slate-50 p-3">
                          <p className="text-xs text-slate-500">
                            Dimensions / duration
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
                          href={`/content-protection/rights/${asset.data.id}`}
                        >
                          <Button variant="outline">Rights & ownership</Button>
                        </Link>
                        <Link
                          href={`/content-protection/certificate/${asset.data.id}`}
                        >
                          <Button variant="outline">
                            Creation certificate
                          </Button>
                        </Link>
                      </div>
                    </div>
                    <StageList
                      active={
                        asset.data.status === "PROTECTED"
                          ? "publish_artifact"
                          : null
                      }
                    />
                  </>
                ) : (
                  <p>Asset not found.</p>
                )}
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {(assets.data ?? []).map(assetRow => (
                  <AssetCard key={assetRow.id} asset={assetRow} />
                ))}
              </div>
            )}
          </section>
        ) : null}

        {section === "verify" ? (
          <section className="mt-6 grid gap-6 lg:grid-cols-[.8fr_1.2fr]">
            <div className="rounded-3xl border border-slate-200 bg-white p-6">
              <Search className="h-7 w-7 text-emerald-600" />
              <h2 className="mt-3 text-xl font-semibold">
                Verify a suspected copy
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Use a tenant-owned library asset. The result reports technical
                match signals, not a legal verdict.
              </p>
              <Input
                className="mt-5"
                aria-label="Query media asset ID"
                placeholder="Media asset ID"
                value={sourceAssetId}
                onChange={e => setSourceAssetId(e.target.value)}
              />
              <select
                aria-label="Verification modality"
                className="mt-3 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={modality}
                onChange={e => setModality(e.target.value as typeof modality)}
              >
                <option value="image">Image</option>
                <option value="video">Video</option>
                <option value="audio">Audio</option>
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
                  ? "Starting verification…"
                  : "Start technical verification"}
              </Button>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-6">
              <h2 className="text-lg font-semibold">Signals reviewed</h2>
              <ul className="mt-4 space-y-3 text-sm text-slate-700">
                <li className="flex gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Exact
                  SHA-256 integrity
                </li>
                <li className="flex gap-2">
                  <Fingerprint className="h-4 w-4 text-emerald-600" /> Invisible
                  watermark detection
                </li>
                <li className="flex gap-2">
                  <PlayCircle className="h-4 w-4 text-emerald-600" />{" "}
                  Modality-specific fingerprint and C2PA evidence
                </li>
              </ul>
            </div>
          </section>
        ) : null}

        {section === "verifications" ? (
          <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6">
            <h2 className="text-xl font-semibold">Verification result</h2>
            {verification.isLoading ? (
              <p className="mt-3" aria-busy="true">
                Processing…
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
                  {verification.data.status}
                </Badge>
                <pre className="overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">
                  {JSON.stringify(verification.data.matches, null, 2)}
                </pre>
                <p className="text-sm text-amber-800">
                  Technical match evidence does not by itself establish legal
                  ownership.
                </p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                No verification run found.
              </p>
            )}
          </section>
        ) : null}

        {section === "settings" ? (
          <section className="mt-6 max-w-2xl rounded-3xl border border-slate-200 bg-white p-6">
            <h2 className="text-xl font-semibold">Default protection choice</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              You control whether final exports request an invisible digital
              watermark. This does not change visible branding watermarks.
            </p>
            <div
              className="mt-5 flex gap-2"
              role="group"
              aria-label="Default digital watermark choice"
            >
              <Button
                variant={
                  settings.data?.defaultChoice === "on" ? "default" : "outline"
                }
                onClick={() => saveSettings.mutate({ defaultChoice: "on" })}
              >
                ON
              </Button>
              <Button
                variant={
                  settings.data?.defaultChoice !== "on" ? "default" : "outline"
                }
                onClick={() => saveSettings.mutate({ defaultChoice: "off" })}
              >
                OFF
              </Button>
            </div>
            <p className="mt-4 text-sm text-slate-600">
              Current default:{" "}
              <strong>
                {settings.data?.defaultChoice?.toUpperCase() ?? "OFF"}
              </strong>
            </p>
          </section>
        ) : null}

        {section === "cases" ? (
          <section className="mt-6 space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-6">
              <h2 className="text-xl font-semibold">Create an evidence case</h2>
              <p className="mt-2 text-sm text-slate-600">
                Use a case to collect technical evidence before any legal or
                external review decision.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Input
                  aria-label="Case title"
                  placeholder="Case title"
                  value={caseTitle}
                  onChange={e => setCaseTitle(e.target.value)}
                />
                <Input
                  aria-label="Asset IDs"
                  placeholder="Asset IDs (comma separated)"
                  value={caseAssetIds}
                  onChange={e => setCaseAssetIds(e.target.value)}
                />
              </div>
              <Input
                className="mt-3"
                aria-label="Case summary"
                placeholder="Case summary"
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
                Create case
              </Button>
              {createEvidencePackage.data ? (
                <div
                  className="mt-4 rounded-xl bg-slate-50 p-3 text-sm"
                  role="status"
                >
                  Evidence package sealed:{" "}
                  {createEvidencePackage.data.package.packageSha256}
                </div>
              ) : null}
            </div>
            {(cases.data ?? []).map((item: any) => (
              <div
                key={item.id}
                className="rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-semibold">{item.title}</h2>
                  <Badge variant="outline">{item.status}</Badge>
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  {item.summary || "Technical evidence case"}
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
                          caseId: item.id,
                          assetIds,
                        });
                    }}
                    disabled={
                      createEvidencePackage.isPending || !caseAssetIds.trim()
                    }
                  >
                    Seal evidence package
                  </Button>
                  {createEvidencePackage.data?.package.caseId === item.id ? (
                    <Button
                      variant="outline"
                      onClick={() =>
                        createReviewerLink.mutate({
                          packageId: createEvidencePackage.data.package.id,
                          expiresInHours: 24,
                          scope: ["technical_evidence"],
                        })
                      }
                      disabled={createReviewerLink.isPending}
                    >
                      Create 24h reviewer link
                    </Button>
                  ) : null}
                </div>
                {createReviewerLink.data ? (
                  <p
                    className="mt-3 break-all text-xs text-emerald-700"
                    role="status"
                  >
                    Reviewer token (share once): {createReviewerLink.data.token}
                  </p>
                ) : null}
              </div>
            ))}
            {cases.data?.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                No cases yet.
              </p>
            ) : null}
          </section>
        ) : null}

        {section === "rights" || section === "certificate" ? (
          <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6">
            <FileCheck2 className="h-7 w-7 text-emerald-600" />
            <h2 className="mt-3 text-xl font-semibold">
              {section === "rights"
                ? "Rights & ownership"
                : "Creation certificate"}
            </h2>
            {section === "rights" ? (
              <>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Input
                    aria-label="Rights holder display name"
                    placeholder="Rights holder name"
                    value={rightsDisplayName}
                    onChange={e => setRightsDisplayName(e.target.value)}
                  />
                  <Input
                    aria-label="Rights holder contact email"
                    placeholder="Contact email"
                    value={rightsContactEmail}
                    onChange={e => setRightsContactEmail(e.target.value)}
                  />
                  <Input
                    aria-label="Rights claim type"
                    placeholder="Claim type"
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
                  I confirm this is a user-provided declaration subject to
                  applicable law.
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
                  Save rights claim
                </Button>
                <pre className="mt-5 overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">
                  {JSON.stringify(
                    rights.data ?? {
                      message:
                        "Select a protected asset to inspect rights evidence.",
                    },
                    null,
                    2
                  )}
                </pre>
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
                  Create or load certificate
                </Button>
                <pre className="mt-4 overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">
                  {JSON.stringify(
                    certificate.data ?? {
                      message:
                        "A certificate requires a verified final protected artifact.",
                    },
                    null,
                    2
                  )}
                </pre>
              </>
            )}
          </section>
        ) : null}
      </div>
    </main>
  );
}
