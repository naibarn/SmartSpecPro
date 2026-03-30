import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ExternalLink, MapPin, ReceiptText, Ticket, Hotel, ListChecks } from "lucide-react";
import type { AgencyComparisonPayload } from "@shared/agencyComparison";
import { DashboardCard } from "@/components/dashboard";

interface ComparisonPreviewCardProps {
  preview: {
    lifecycleState: "preview_generated" | "expired_preview" | "commit_pending" | "committed" | "commit_failed";
    summaryText: string;
    data: AgencyComparisonPayload;
  };
}

const kindLabels: Record<AgencyComparisonPayload["comparisonKind"], string> = {
  research: "Research",
  ticket: "Ticket Compare",
  hotel: "Hotel Compare",
  shortlist: "Shortlist",
};

const kindIcons = {
  research: ReceiptText,
  ticket: Ticket,
  hotel: Hotel,
  shortlist: ListChecks,
} satisfies Record<AgencyComparisonPayload["comparisonKind"], typeof ReceiptText>;

function formatPrice(option: AgencyComparisonPayload["options"][number]): string | null {
  if (option.priceLabel) return option.priceLabel;
  if (option.price == null) return null;
  return [option.currency, option.price].filter(Boolean).join(" ");
}

function formatDistance(option: AgencyComparisonPayload["options"][number]): string | null {
  if (option.distanceLabel) return option.distanceLabel;
  if (option.distance == null) return null;
  return `${option.distance}${option.distanceUnit ? ` ${option.distanceUnit}` : ""}`;
}

function formatRefundable(refundable: boolean | null | undefined): string | null {
  if (refundable == null) return null;
  return refundable ? "Refundable" : "Non-refundable";
}

export function ComparisonPreviewCard({ preview }: ComparisonPreviewCardProps) {
  const Icon = kindIcons[preview.data.comparisonKind];

  return (
    <DashboardCard
      className="border-sky-200 bg-sky-50/40"
      leading={
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-100 text-sky-700">
          <Icon className="h-4 w-4" />
        </div>
      }
      title={preview.data.title}
      titleClassName="text-base font-semibold text-slate-900"
      description={preview.summaryText}
      trailing={
        preview.data.locationSummary ? (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            <span>{preview.data.locationSummary}</span>
          </div>
        ) : null
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{kindLabels[preview.data.comparisonKind]}</Badge>
          <Badge variant="outline">{preview.data.options.length} options</Badge>
          <Badge variant="outline">
            {preview.lifecycleState === "expired_preview" ? "Expired Preview" : "Preview Ready"}
          </Badge>
        </div>

        {preview.data.summary ? (
          <p className="text-sm leading-relaxed text-foreground/90">{preview.data.summary}</p>
        ) : null}

        {preview.data.recommendations.length > 0 ? (
          <div className="rounded-lg border bg-background/70 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Recommendations
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {preview.data.recommendations.map((recommendation, index) => (
                <li key={`${recommendation}-${index}`}>• {recommendation}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="space-y-3">
          {preview.data.options.map((option, index) => {
            const price = formatPrice(option);
            const distance = formatDistance(option);
            const refundable = formatRefundable(option.refundable);

            return (
              <div
                key={option.optionId ?? `${option.vendor}-${option.optionTitle}-${index}`}
                className="rounded-xl border bg-background p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold">{option.optionTitle}</div>
                    <div className="text-xs text-muted-foreground">{option.vendor}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {price ? <Badge variant="outline">{price}</Badge> : null}
                    {distance ? <Badge variant="outline">{distance}</Badge> : null}
                    {option.availabilityState !== "unknown" ? (
                      <Badge variant="secondary">{option.availabilityState.replace(/_/g, " ")}</Badge>
                    ) : null}
                    {refundable ? <Badge variant="secondary">{refundable}</Badge> : null}
                  </div>
                </div>

                {(option.locationSummary || option.notes) ? (
                  <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                    {option.locationSummary ? <p>{option.locationSummary}</p> : null}
                    {option.notes ? <p>{option.notes}</p> : null}
                  </div>
                ) : null}

                {option.evidence.length > 0 ? (
                  <>
                    <Separator className="my-3" />
                    <div className="space-y-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Evidence
                      </p>
                      <div className="space-y-2">
                        {option.evidence.map((evidence, evidenceIndex) => (
                          <div
                            key={`${evidence.label}-${evidenceIndex}`}
                            className="rounded-lg bg-muted/40 p-2 text-xs"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium">{evidence.label}</span>
                              {evidence.url ? (
                                <a
                                  href={evidence.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-sky-700 hover:underline"
                                >
                                  Open
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              ) : null}
                            </div>
                            {evidence.snippet ? (
                              <p className="mt-1 text-muted-foreground">{evidence.snippet}</p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : null}
            </div>
          );
        })}
      </div>
      </div>
    </DashboardCard>
  );
}
