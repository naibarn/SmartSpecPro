import { ReceiptText, Wallet, BarChart3, Clock3, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type FinanceActivityKind = "draft" | "receipt" | "transaction" | "summary" | "recurring";

export interface FinanceActivityMetadata {
  finance?: {
    kind: FinanceActivityKind;
    title?: string;
    summary?: string;
    type?: string | null;
    amountMinor?: number | null;
    currency?: string | null;
    categoryCode?: string | null;
    merchantName?: string | null;
    counterpartyName?: string | null;
    status?: string | null;
    confidence?: number | null;
    draftId?: number | null;
    transactionId?: number | null;
    libraryItemId?: number | null;
    source?: string | null;
    projectId?: string | null;
    occurredAt?: string | null;
  };
}

export interface FinanceActivityCardProps {
  title?: string;
  content: string | string[];
  metadata: FinanceActivityMetadata;
  onOpenFinancePanel?: () => void;
  className?: string;
}

function formatMoneyMinor(amountMinor?: number | null, currency = "THB"): string | null {
  if (typeof amountMinor !== "number" || !Number.isFinite(amountMinor)) {
    return null;
  }

  const amount = amountMinor / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function getKindIcon(kind: FinanceActivityKind) {
  switch (kind) {
    case "draft":
      return ReceiptText;
    case "receipt":
      return ReceiptText;
    case "transaction":
      return Wallet;
    case "summary":
      return BarChart3;
    case "recurring":
      return Clock3;
    default:
      return ReceiptText;
  }
}

function getKindTone(kind: FinanceActivityKind) {
  switch (kind) {
    case "draft":
      return "border-amber-200 bg-amber-50/90 text-amber-950";
    case "receipt":
      return "border-emerald-200 bg-emerald-50/90 text-emerald-950";
    case "transaction":
      return "border-sky-200 bg-sky-50/90 text-sky-950";
    case "summary":
      return "border-indigo-200 bg-indigo-50/90 text-indigo-950";
    case "recurring":
      return "border-violet-200 bg-violet-50/90 text-violet-950";
    default:
      return "border-slate-200 bg-slate-50/90 text-slate-950";
  }
}

export function FinanceActivityCard({
  title,
  content,
  metadata,
  onOpenFinancePanel,
  className,
}: FinanceActivityCardProps) {
  const finance = metadata.finance;
  if (!finance) {
    return null;
  }

  const kind = finance.kind;
  const Icon = getKindIcon(kind);
  const summary = typeof finance.summary === "string" && finance.summary.trim().length > 0
    ? finance.summary.trim()
    : Array.isArray(content)
      ? content.filter(Boolean).join(" · ")
      : content;
  const amountLabel = formatMoneyMinor(finance.amountMinor ?? null, finance.currency ?? "THB");
  const detailParts = [
    finance.counterpartyName ?? finance.merchantName,
    finance.categoryCode,
    finance.type,
    finance.source,
  ].filter((part): part is string => Boolean(part));

  return (
    <div className={cn("mt-3 rounded-2xl border p-4 shadow-sm", getKindTone(kind), className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4" />
            <p className="text-sm font-semibold">{title ?? finance.title ?? "Finance activity"}</p>
            <Badge variant="outline" className="border-white/70 bg-white/80 text-[10px] uppercase tracking-[0.2em]">
              {kind}
            </Badge>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-700">{summary}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
            {amountLabel ? <span>{amountLabel}</span> : null}
            {finance.status ? <span>{finance.status}</span> : null}
            {typeof finance.confidence === "number" ? <span>{finance.confidence.toFixed(2)}</span> : null}
            {finance.occurredAt ? <span>{new Date(finance.occurredAt).toLocaleString()}</span> : null}
          </div>
          {detailParts.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
              {detailParts.map((part) => (
                <span key={part} className="rounded-full border border-white/70 bg-white/80 px-2 py-1">
                  {part}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        {onOpenFinancePanel ? (
          <Button size="sm" variant="secondary" className="shrink-0 gap-2" onClick={onOpenFinancePanel}>
            <ExternalLink className="h-3.5 w-3.5" />
            Open Finance Panel
          </Button>
        ) : null}
      </div>
    </div>
  );
}
