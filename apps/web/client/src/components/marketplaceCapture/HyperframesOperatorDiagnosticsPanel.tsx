import { skipToken } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  Shield,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { getMarketplaceHyperframesUiCopy } from "./hyperframesUiCopy";

interface HyperframesOperatorDiagnosticsPanelProps {
  renderJobId?: string | null;
  productId?: string | null;
  runId?: string | null;
  currentCompositionInputHash?: string | null;
  enabled?: boolean;
  locale?: string | null;
  className?: string;
}

function getOperatorCopy(locale?: string | null) {
  const base = getMarketplaceHyperframesUiCopy(locale);
  return base.locale === "th"
    ? {
        ariaLabel: "เครื่องมือวินิจฉัย HyperFrames สำหรับ operator",
        title: "HyperFrames operator",
        subtitle: "Marketplace Capture / Storyboard review auto",
        renderJobId: "Render job ID",
        productId: "Product ID",
        runId: "Run ID",
        inputHash: "Composition hash",
        replayReason: "เหตุผล replay",
        defaultReplayReason: (id: string) =>
          `operator replay from sanitized diagnostics for ${id || "render job"}`,
        inspect: "ตรวจ",
        refresh: "รีเฟรช",
        cancel: "ยกเลิก",
        replay: "Replay",
        cancelQueued: "ส่งคำขอยกเลิกแล้ว",
        replayQueued: "ส่งงาน replay แล้ว",
        status: "สถานะ",
        redaction: "Redaction",
        diagnostics: "Diagnostics",
        applied: "Applied",
        pending: "Pending",
        loading: "กำลังโหลด",
        unknown: "Unknown",
        empty: "ใส่ Render job ID เพื่อโหลด diagnostics",
        replayTokenReady: "Replay token",
        ready: "Ready",
        notReady: "Not ready",
      }
    : {
        ariaLabel: "HyperFrames operator diagnostics",
        title: "HyperFrames operator",
        subtitle: "Marketplace Capture / Storyboard review auto",
        renderJobId: "Render job ID",
        productId: "Product ID",
        runId: "Run ID",
        inputHash: "Composition hash",
        replayReason: "Replay reason",
        defaultReplayReason: (id: string) =>
          `operator replay from sanitized diagnostics for ${id || "render job"}`,
        inspect: "Inspect",
        refresh: "Refresh",
        cancel: "Cancel",
        replay: "Replay",
        cancelQueued: "Cancellation requested",
        replayQueued: "Replay queued",
        status: "Status",
        redaction: "Redaction",
        diagnostics: "Diagnostics",
        applied: "Applied",
        pending: "Pending",
        loading: "Loading",
        unknown: "Unknown",
        empty: "Enter a Render job ID to load diagnostics.",
        replayTokenReady: "Replay token",
        ready: "Ready",
        notReady: "Not ready",
      };
}

function optionalValue(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function HyperframesOperatorDiagnosticsPanel({
  renderJobId,
  productId,
  runId,
  currentCompositionInputHash,
  enabled = true,
  locale,
  className,
}: HyperframesOperatorDiagnosticsPanelProps) {
  const copy = useMemo(() => getOperatorCopy(locale), [locale]);
  const [renderJobIdDraft, setRenderJobIdDraft] = useState(renderJobId ?? "");
  const [productIdDraft, setProductIdDraft] = useState(productId ?? "");
  const [runIdDraft, setRunIdDraft] = useState(runId ?? "");
  const [compositionHashDraft, setCompositionHashDraft] = useState(
    currentCompositionInputHash ?? ""
  );
  const [replayReasonDraft, setReplayReasonDraft] = useState("");

  useEffect(() => {
    if (renderJobId) setRenderJobIdDraft(renderJobId);
  }, [renderJobId]);
  useEffect(() => {
    if (productId) setProductIdDraft(productId);
  }, [productId]);
  useEffect(() => {
    if (runId) setRunIdDraft(runId);
  }, [runId]);
  useEffect(() => {
    if (currentCompositionInputHash) {
      setCompositionHashDraft(currentCompositionInputHash);
    }
  }, [currentCompositionInputHash]);

  const activeRenderJobId = renderJobIdDraft.trim();
  const activeProductId = optionalValue(productIdDraft);
  const activeRunId = optionalValue(runIdDraft);
  const queryInput =
    enabled && activeRenderJobId
      ? {
          renderJobId: activeRenderJobId,
          productId: activeProductId,
          runId: activeRunId,
        }
      : skipToken;
  const diagnosticsQuery =
    trpc.marketplaceCapture.inspectHyperframesRenderDiagnostics.useQuery(
      queryInput
    );
  const render = diagnosticsQuery.data?.render;

  useEffect(() => {
    const hash = render?.compositionInputHash;
    if (hash && !compositionHashDraft.trim()) {
      setCompositionHashDraft(hash);
    }
  }, [compositionHashDraft, render?.compositionInputHash]);

  const cancelMutation =
    trpc.marketplaceCapture.cancelHyperframesRenderJobAsOperator.useMutation({
      onSuccess: () => {
        toast.success(copy.cancelQueued);
        void diagnosticsQuery.refetch();
      },
      onError: error => toast.error(error.message),
    });
  const replayMutation =
    trpc.marketplaceCapture.replayHyperframesDeadLetter.useMutation({
      onSuccess: () => {
        toast.success(copy.replayQueued);
        void diagnosticsQuery.refetch();
      },
      onError: error => toast.error(error.message),
    });

  if (!enabled) return null;

  const diagnostics: string[] = Array.isArray(diagnosticsQuery.data?.diagnostics)
    ? diagnosticsQuery.data.diagnostics.filter(
        (item: unknown): item is string => typeof item === "string"
      )
    : [];
  const active =
    render?.status &&
    ![
      "completed",
      "saved_to_library",
      "cancelled",
      "failed",
      "failed_permanent",
      "dead_lettered",
      "template_disabled",
      "stale_input_hash",
    ].includes(render.status);
  const activeCompositionInputHash =
    compositionHashDraft.trim() || render?.compositionInputHash || "";
  const operatorReplayToken = diagnosticsQuery.data?.operatorReplayToken ?? "";
  const replayReason =
    replayReasonDraft.trim() || copy.defaultReplayReason(activeRenderJobId);
  const replayable =
    render?.status === "dead_lettered" &&
    Boolean(activeCompositionInputHash) &&
    Boolean(operatorReplayToken);

  return (
    <section
      className={cn(
        "rounded-lg border bg-white p-4 text-slate-950 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100",
        className
      )}
      aria-label={copy.ariaLabel}
      data-testid="hyperframes-operator-diagnostics-panel"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 text-sm font-semibold">
            <Shield className="h-4 w-4 text-sky-600" aria-hidden="true" />
            {copy.title}
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {copy.subtitle}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void diagnosticsQuery.refetch()}
            disabled={!activeRenderJobId || diagnosticsQuery.isFetching}
          >
            {diagnosticsQuery.isFetching ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : render ? (
              <RefreshCw className="mr-2 h-4 w-4" />
            ) : (
              <Search className="mr-2 h-4 w-4" />
            )}
            {render ? copy.refresh : copy.inspect}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              cancelMutation.mutate({
                renderJobId: activeRenderJobId,
                productId: activeProductId,
                runId: activeRunId,
                reason: `operator cancellation for ${activeRenderJobId}`,
              })
            }
            disabled={!activeRenderJobId || !active || cancelMutation.isPending}
          >
            {cancelMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <XCircle className="mr-2 h-4 w-4" />
            )}
            {copy.cancel}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() =>
              replayMutation.mutate({
                renderJobId: activeRenderJobId,
                productId: activeProductId,
                runId: activeRunId,
                currentCompositionInputHash: activeCompositionInputHash,
                replayToken: operatorReplayToken,
                reason: replayReason,
              })
            }
            disabled={!replayable || replayMutation.isPending}
          >
            {replayMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="mr-2 h-4 w-4" />
            )}
            {copy.replay}
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-1.5">
          <Label htmlFor="hyperframes-operator-render-job-id">
            {copy.renderJobId}
          </Label>
          <Input
            id="hyperframes-operator-render-job-id"
            value={renderJobIdDraft}
            onChange={event => setRenderJobIdDraft(event.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="hyperframes-operator-product-id">
            {copy.productId}
          </Label>
          <Input
            id="hyperframes-operator-product-id"
            value={productIdDraft}
            onChange={event => setProductIdDraft(event.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="hyperframes-operator-run-id">{copy.runId}</Label>
          <Input
            id="hyperframes-operator-run-id"
            value={runIdDraft}
            onChange={event => setRunIdDraft(event.target.value)}
            autoComplete="off"
          />
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="space-y-1.5">
          <Label htmlFor="hyperframes-operator-input-hash">
            {copy.inputHash}
          </Label>
          <Input
            id="hyperframes-operator-input-hash"
            value={compositionHashDraft || render?.compositionInputHash || ""}
            onChange={event => setCompositionHashDraft(event.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="hyperframes-operator-replay-reason">
            {copy.replayReason}
          </Label>
          <Textarea
            id="hyperframes-operator-replay-reason"
            value={replayReasonDraft}
            onChange={event => setReplayReasonDraft(event.target.value)}
            placeholder={copy.defaultReplayReason(activeRenderJobId)}
            className="min-h-10"
          />
        </div>
      </div>

      {!activeRenderJobId ? (
        <p className="mt-4 rounded-md border border-dashed border-slate-200 p-3 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {copy.empty}
        </p>
      ) : null}

      {diagnosticsQuery.error ? (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {diagnosticsQuery.error.message}
        </p>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <div className="rounded-md border border-slate-200 p-3 dark:border-slate-700">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {copy.status}
          </p>
          <p className="mt-1 text-sm font-semibold">
            {diagnosticsQuery.isLoading
              ? copy.loading
              : render?.status ?? copy.unknown}
          </p>
        </div>
        <div className="rounded-md border border-slate-200 p-3 dark:border-slate-700">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {copy.redaction}
          </p>
          <p className="mt-1 inline-flex items-center gap-2 text-sm font-semibold">
            {diagnosticsQuery.data?.redacted ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            )}
            {diagnosticsQuery.data?.redacted ? copy.applied : copy.pending}
          </p>
        </div>
        <div className="rounded-md border border-slate-200 p-3 dark:border-slate-700">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {copy.diagnostics}
          </p>
          <p className="mt-1 text-sm font-semibold">{diagnostics.length}</p>
        </div>
        <div className="rounded-md border border-slate-200 p-3 dark:border-slate-700">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {copy.replayTokenReady}
          </p>
          <p className="mt-1 text-sm font-semibold">
            {operatorReplayToken ? copy.ready : copy.notReady}
          </p>
        </div>
      </div>

      {diagnostics.length ? (
        <div className="mt-3 rounded-md bg-slate-50 p-3 text-xs leading-5 text-slate-600 dark:bg-slate-950 dark:text-slate-300">
          {diagnostics.slice(0, 5).map(item => (
            <p className="break-words" key={item}>
              {item}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}
