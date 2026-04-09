import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Loader2,
  Eye,
  ChevronDown,
  ChevronRight,
  Clock,
  Cpu,
  DollarSign,
  CreditCard,
  ArrowUpRight,
  ArrowDownLeft,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Zap,
  Calculator,
} from "lucide-react";
import {
  formatCurrency,
  formatLatency,
  formatTokenCount,
} from "@/lib/formatters";

interface TransactionDetailDialogProps {
  traceId?: string | null;
  txId?: number;
  txType?: "llm" | "media";
  date?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > 0 ? compact : null;
}

function pickText(...values: unknown[]): string | null {
  for (const value of values) {
    const text = normalizeText(value);
    if (text) return text;
  }
  return null;
}

function compactText(value: string, max = 220): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

function extractPromptPreview(requestPayload: unknown): string | null {
  const request = asRecord(requestPayload);
  if (!request) return null;

  const payload = asRecord(request.payload);
  const direct = pickText(
    request.prompt,
    request.userPrompt,
    request.text,
    payload?.prompt,
    payload?.text
  );
  if (direct) return compactText(direct, 280);

  if (!Array.isArray(request.messages)) return null;

  const lastUserMessage = [...request.messages].reverse().find(message => {
    const item = asRecord(message);
    if (!item) return false;
    return item.role === "user";
  });
  const entry = asRecord(lastUserMessage);
  const content = pickText(entry?.content);
  return content ? compactText(content, 280) : null;
}

/** Collapsible JSON section */
function PayloadSection({
  title,
  icon,
  data,
  defaultOpen = false,
}: {
  title: string;
  icon: React.ReactNode;
  data: unknown;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (data == null) return null;
  if (typeof data === "string" && data.trim().length === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex items-center gap-2 w-full text-left px-3 py-2 rounded-md hover:bg-muted/50 transition-colors">
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          )}
          {icon}
          <span className="text-sm font-medium">{title}</span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="text-xs bg-muted/50 border rounded-md p-3 mx-3 mb-3 overflow-x-auto max-h-[300px] overflow-y-auto whitespace-pre-wrap break-words">
          {typeof data === "string" ? data : JSON.stringify(data, null, 2)}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function TransactionDetailDialog({
  traceId,
  txId,
  txType,
  date,
}: TransactionDetailDialogProps) {
  const { t } = useScopedTranslation("billing");
  const [open, setOpen] = useState(false);

  const payload = trpc.usage.getTransactionPayload.useQuery(
    {
      ...(traceId ? { traceId } : {}),
      ...(txId ? { txId } : {}),
      ...(txType ? { txType } : {}),
      date,
    },
    { enabled: open }
  );

  const summary = payload.data?.summary;
  const entries = payload.data?.entries || [];
  const authorized = payload.data?.authorized;

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-xs"
        onClick={() => setOpen(true)}
      >
        <Eye className="h-3 w-3 mr-1" />
        {t("transactionDetail.view")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              {t("transactionDetail.title")}
              {traceId && (
                <Badge variant="outline" className="font-mono text-xs">
                  {traceId}
                </Badge>
              )}
              {!traceId && txId && (
                <Badge variant="outline" className="font-mono text-xs">
                  #{txId} ({txType})
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {payload.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !authorized ? (
            <div className="text-center py-12 text-muted-foreground">
              {t("transactionDetail.notAuthorized")}
            </div>
          ) : (
            <div className="space-y-4">
              {/* ── Structured Summary (from DB — always available) ── */}
              {summary && (
                <div className="border rounded-lg overflow-hidden">
                  {/* Summary header */}
                  <div className="bg-muted/30 px-4 py-2.5 flex items-center justify-between border-b">
                    <div className="flex items-center gap-2">
                      <Badge
                        className={
                          summary.source === "llm"
                            ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                            : "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300"
                        }
                      >
                        {summary.source === "llm"
                          ? t("transactionDetail.source.llm")
                          : t("transactionDetail.source.media")}
                      </Badge>
                      {summary.model && (
                        <span className="font-mono text-sm font-medium">
                          {summary.model}
                        </span>
                      )}
                      {"requestType" in summary && summary.requestType && (
                        <Badge variant="outline" className="text-xs">
                          {summary.requestType}
                        </Badge>
                      )}
                      {"mediaType" in summary && summary.mediaType && (
                        <Badge variant="outline" className="text-xs">
                          {summary.mediaType}
                        </Badge>
                      )}
                      {"skillSlug" in summary && summary.skillSlug && (
                        <Badge variant="secondary" className="text-xs">
                          {t("transactionDetail.badges.skill", {
                            skill: summary.skillSlug,
                          })}
                        </Badge>
                      )}
                    </div>
                    <div>
                      {summary.errorMessage ||
                      ("errorType" in summary && summary.errorType) ? (
                        <XCircle className="h-4 w-4 text-red-500" />
                      ) : (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      )}
                    </div>
                  </div>

                  {/* Summary metrics grid */}
                  <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="flex items-center gap-2">
                      <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                          {t("transactionDetail.summary.provider")}
                        </div>
                        <div className="text-sm font-medium">
                          {summary.provider || "-"}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                          {t("transactionDetail.summary.latency")}
                        </div>
                        <div className="text-sm font-medium">
                          {summary.responseTimeMs != null
                            ? formatLatency(summary.responseTimeMs)
                            : "-"}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                          {t("transactionDetail.summary.credits")}
                        </div>
                        <div className="text-sm font-medium">
                          {summary.creditsCharged ?? 0}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                          {t("transactionDetail.summary.cost")}
                        </div>
                        <div className="text-sm font-medium">
                          {summary.costUsd != null
                            ? formatCurrency(summary.costUsd)
                            : "-"}
                        </div>
                      </div>
                    </div>

                    {/* LLM-specific: token counts */}
                    {summary.source === "llm" && "inputTokens" in summary && (
                      <>
                        <div className="flex items-center gap-2">
                          <ArrowUpRight className="h-3.5 w-3.5 text-blue-500" />
                          <div>
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                              {t("transactionDetail.summary.inputTokens")}
                            </div>
                            <div className="text-sm font-medium">
                              {formatTokenCount(summary.inputTokens ?? 0)}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <ArrowDownLeft className="h-3.5 w-3.5 text-green-500" />
                          <div>
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                              {t("transactionDetail.summary.outputTokens")}
                            </div>
                            <div className="text-sm font-medium">
                              {formatTokenCount(summary.outputTokens ?? 0)}
                            </div>
                          </div>
                        </div>
                      </>
                    )}

                    {/* Fallback indicator with provider chain */}
                    {"wasFallback" in summary && summary.wasFallback && (
                      <div className="flex items-center gap-2">
                        <Zap className="h-3.5 w-3.5 text-yellow-500" />
                        <div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                            {t("transactionDetail.summary.fallback")}
                          </div>
                          <div className="text-sm font-medium text-yellow-600">
                            {"fallbackFromProviderName" in summary &&
                            summary.fallbackFromProviderName
                              ? t("transactionDetail.summary.fallbackFrom", {
                                  provider: summary.fallbackFromProviderName,
                                })
                              : t("transactionDetail.summary.fallbackYes")}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Cost Calculation Method */}
                    {"costCalculationMethod" in summary &&
                      summary.costCalculationMethod && (
                        <div className="flex items-center gap-2">
                          <Calculator className="h-3.5 w-3.5 text-emerald-500" />
                          <div>
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                              {t("transactionDetail.summary.costMethod")}
                            </div>
                            <div className="text-sm font-medium">
                              {summary.costCalculationMethod ===
                              "provider_reported"
                                ? t(
                                    "transactionDetail.summary.costMethod.providerReported"
                                  )
                                : summary.costCalculationMethod ===
                                    "model_lookup"
                                  ? t(
                                      "transactionDetail.summary.costMethod.modelPricing"
                                    )
                                  : t(
                                      "transactionDetail.summary.costMethod.defaultRate"
                                    )}
                            </div>
                          </div>
                        </div>
                      )}
                  </div>

                  {/* Error message */}
                  {summary.errorMessage && (
                    <div className="mx-4 mb-3 flex items-start gap-2 p-2.5 bg-red-50 dark:bg-red-950/30 rounded-md border border-red-200 dark:border-red-900">
                      <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                      <div>
                        {"errorType" in summary && summary.errorType && (
                          <div className="text-xs font-medium text-red-700 dark:text-red-400 mb-0.5">
                            {summary.errorType}
                          </div>
                        )}
                        <div className="text-xs text-red-600 dark:text-red-400">
                          {summary.errorMessage}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Timestamp */}
                  <div className="px-4 pb-3 text-xs text-muted-foreground">
                    {summary.createdAt
                      ? new Date(summary.createdAt).toLocaleString()
                      : "-"}
                  </div>
                </div>
              )}

              {/* ── Request / Response Payloads (from JSONL audit log) ── */}
              {entries.length > 0 ? (
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-muted/30 px-4 py-2.5 border-b">
                    <span className="text-sm font-medium">
                      {t("transactionDetail.sections.requestResponse")}
                    </span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {t("transactionDetail.sections.eventCount", {
                        count: entries.length,
                      })}
                    </span>
                  </div>

                  <div className="divide-y">
                    {entries.map((entry: any, i: number) => (
                      <div key={i} className="py-1">
                        {(() => {
                          const requestPayload = asRecord(entry.requestPayload);
                          const responsePayload = asRecord(
                            entry.responsePayload
                          );
                          const metadata = asRecord(entry.metadata);
                          const requestInnerPayload = asRecord(
                            requestPayload?.payload
                          );
                          const stage = pickText(
                            metadata?.stage,
                            requestPayload?.stage,
                            responsePayload?.stage
                          );
                          const source = pickText(
                            metadata?.source,
                            requestPayload?.source
                          );
                          const provider = pickText(
                            entry.providerName,
                            entry.provider,
                            requestPayload?.provider
                          );
                          const endpoint = pickText(
                            entry.endpoint,
                            requestPayload?.endpoint
                          );
                          const requestType = pickText(entry.requestType);
                          const mediaTaskId = pickText(
                            entry.mediaTaskId,
                            requestPayload?.mediaTaskId,
                            responsePayload?.mediaTaskId
                          );
                          const promptPreview = extractPromptPreview(
                            entry.requestPayload
                          );
                          const statusCode =
                            typeof entry.statusCode === "number"
                              ? entry.statusCode
                              : null;
                          const isError =
                            Boolean(entry.errorMessage) ||
                            Boolean(entry.errorType) ||
                            (statusCode != null && statusCode >= 400);

                          return (
                            <>
                              {/* Event header */}
                              <div className="flex flex-wrap items-center gap-2 px-3 py-1.5">
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] font-mono"
                                >
                                  {entry.eventType}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {new Date(
                                    entry.timestamp
                                  ).toLocaleTimeString()}
                                </span>
                                {requestType && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] font-mono"
                                  >
                                    {requestType}
                                  </Badge>
                                )}
                                {statusCode != null && (
                                  <Badge
                                    variant="outline"
                                    className={`text-[10px] font-mono ${
                                      statusCode >= 400
                                        ? "border-red-300 text-red-700 dark:border-red-800 dark:text-red-300"
                                        : "border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300"
                                    }`}
                                  >
                                    HTTP {statusCode}
                                  </Badge>
                                )}
                                {entry.model && (
                                  <span className="text-xs text-blue-600 font-mono">
                                    {entry.model}
                                  </span>
                                )}
                                {provider && (
                                  <span className="text-xs text-muted-foreground">
                                    {provider}
                                  </span>
                                )}
                                {entry.timing?.totalMs != null && (
                                  <span className="text-xs text-muted-foreground">
                                    {formatLatency(entry.timing.totalMs)}
                                  </span>
                                )}
                                {entry.timing &&
                                  (entry.timing.networkMs != null ||
                                    entry.timing.parseMs != null) && (
                                    <span className="text-[10px] text-muted-foreground/70">
                                      (
                                      {[
                                        entry.timing.networkMs != null &&
                                          `net: ${entry.timing.networkMs}ms`,
                                        entry.timing.parseMs != null &&
                                          `parse: ${entry.timing.parseMs}ms`,
                                      ]
                                        .filter(Boolean)
                                        .join(", ")}
                                      )
                                    </span>
                                  )}
                                {entry.costCalculationMethod && (
                                  <Badge
                                    variant="outline"
                                    className="text-[9px] px-1 py-0"
                                  >
                                    {entry.costCalculationMethod ===
                                    "provider_reported"
                                      ? t(
                                          "transactionDetail.summary.costMethod.providerReported"
                                        )
                                      : entry.costCalculationMethod ===
                                          "model_lookup"
                                        ? t(
                                            "transactionDetail.summary.costMethod.modelPricing"
                                          )
                                        : t(
                                            "transactionDetail.summary.costMethod.defaultRate"
                                          )}
                                  </Badge>
                                )}
                              </div>

                              {/* Context row */}
                              <div className="px-3 pb-2 flex flex-wrap gap-1.5">
                                {stage && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] font-mono"
                                  >
                                    {t("transactionDetail.labels.stage", {
                                      value: stage,
                                    })}
                                  </Badge>
                                )}
                                {source && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] font-mono"
                                  >
                                    {t("transactionDetail.labels.source", {
                                      value: source,
                                    })}
                                  </Badge>
                                )}
                                {endpoint && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] font-mono"
                                  >
                                    {t("transactionDetail.labels.endpoint", {
                                      value: endpoint,
                                    })}
                                  </Badge>
                                )}
                                {mediaTaskId && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] font-mono"
                                  >
                                    {t("transactionDetail.labels.task", {
                                      value: mediaTaskId,
                                    })}
                                  </Badge>
                                )}
                                {Boolean(requestInnerPayload?.api_config) && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] font-mono"
                                  >
                                    {t("transactionDetail.labels.apiConfig")}
                                  </Badge>
                                )}
                              </div>

                              {promptPreview && (
                                <div className="mx-3 mb-2 text-xs text-muted-foreground border rounded-md bg-muted/30 px-2.5 py-1.5">
                                  <span className="font-medium text-foreground">
                                    {t("transactionDetail.labels.prompt")}:
                                  </span>{" "}
                                  {promptPreview}
                                </div>
                              )}

                              {/* Collapsible payloads */}
                              <PayloadSection
                                title={t(
                                  "transactionDetail.sections.requestPayload"
                                )}
                                icon={
                                  <ArrowUpRight className="h-3.5 w-3.5 text-blue-500" />
                                }
                                data={entry.requestPayload}
                                defaultOpen={entries.length === 1 || i === 0}
                              />
                              <PayloadSection
                                title={t(
                                  "transactionDetail.sections.responsePayload"
                                )}
                                icon={
                                  <ArrowDownLeft className="h-3.5 w-3.5 text-green-500" />
                                }
                                data={entry.responsePayload}
                                defaultOpen={entries.length === 1 || i === 0}
                              />
                              <PayloadSection
                                title={t("transactionDetail.sections.metadata")}
                                icon={
                                  <Cpu className="h-3.5 w-3.5 text-indigo-500" />
                                }
                                data={entry.metadata}
                                defaultOpen={isError}
                              />

                              {entry.errorMessage && (
                                <div className="mx-3 mb-2 text-xs text-red-600 flex items-center gap-1">
                                  <AlertTriangle className="h-3 w-3" />
                                  {entry.errorType
                                    ? `[${entry.errorType}] `
                                    : ""}
                                  {entry.errorMessage}
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    ))}
                  </div>
                </div>
              ) : summary ? (
                <div className="border rounded-lg px-4 py-6 text-center text-muted-foreground text-sm">
                  <p>{t("transactionDetail.unavailable.title")}</p>
                  <p className="text-xs mt-1">
                    {t("transactionDetail.unavailable.description")}
                  </p>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  {t("transactionDetail.noData")}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
