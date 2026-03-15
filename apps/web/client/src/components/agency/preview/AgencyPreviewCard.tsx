import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  FileText,
  Film,
  Presentation,
  ReceiptText,
  Ticket,
  Hotel,
  ListChecks,
  ExternalLink,
  MapPin,
  X,
} from "lucide-react";
import { PreviewCommitButton } from "./PreviewCommitButton";
import { ResearchPreviewContent } from "./ResearchPreviewContent";
import { StoryboardPreviewContent } from "./StoryboardPreviewContent";
import { DeckPreviewContent } from "./DeckPreviewContent";
import type { AgencyComparisonPayload } from "@shared/agencyComparison";

/**
 * Minimal client-side mirror of `AgencyPreview` from agencyPreviewService.ts.
 * We only use the fields the UI actually needs.
 */
export interface AgencyPreviewProps {
  previewType: "research" | "storyboard" | "deck" | "comparison";
  artifactId: string;
  intent: string;
  lifecycleState:
    | "preview_generated"
    | "expired_preview"
    | "commit_pending"
    | "committed"
    | "commit_failed";
  summaryText: string;
  provenance: Array<{
    documentId: string | null;
    title: string | null;
    url: string | null;
  }>;
  commit: {
    status: string;
    token: string;
    available: boolean;
    supported: boolean;
    targetType: string | null;
    targetId: string | null;
  };
  data: unknown;
}

interface AgencyPreviewCardProps {
  preview: AgencyPreviewProps;
  agencyId: string;
  runId: string;
  onCommitted?: (result: { targetType: string; targetId: string }) => void;
  onDismiss?: () => void;
}

const typeConfig = {
  research: {
    icon: FileText,
    label: "Research Report",
    borderColor: "border-emerald-200",
    bgColor: "bg-emerald-50/40",
    iconBg: "bg-emerald-100 text-emerald-700",
  },
  storyboard: {
    icon: Film,
    label: "Storyboard",
    borderColor: "border-violet-200",
    bgColor: "bg-violet-50/40",
    iconBg: "bg-violet-100 text-violet-700",
  },
  deck: {
    icon: Presentation,
    label: "Presentation Deck",
    borderColor: "border-indigo-200",
    bgColor: "bg-indigo-50/40",
    iconBg: "bg-indigo-100 text-indigo-700",
  },
  comparison: {
    icon: ReceiptText,
    label: "Comparison",
    borderColor: "border-sky-200",
    bgColor: "bg-sky-50/40",
    iconBg: "bg-sky-100 text-sky-700",
  },
} as const;

const comparisonKindIcons = {
  ticket: Ticket,
  hotel: Hotel,
  shortlist: ListChecks,
  research: ReceiptText,
} as const;

const comparisonKindLabels = {
  research: "Research",
  ticket: "Ticket Compare",
  hotel: "Hotel Compare",
  shortlist: "Shortlist",
} as const;

function lifecycleBadge(state: string) {
  switch (state) {
    case "committed":
      return <Badge variant="default">Committed</Badge>;
    case "commit_pending":
      return <Badge variant="secondary">Saving...</Badge>;
    case "commit_failed":
      return (
        <Badge variant="destructive" className="text-xs">
          Save Failed
        </Badge>
      );
    case "expired_preview":
      return (
        <Badge variant="outline" className="text-amber-600">
          Expired
        </Badge>
      );
    default:
      return <Badge variant="outline">Preview Ready</Badge>;
  }
}

export function AgencyPreviewCard({
  preview,
  agencyId,
  runId,
  onCommitted,
  onDismiss,
}: AgencyPreviewCardProps) {
  const config = typeConfig[preview.previewType] ?? typeConfig.research;
  const Icon = config.icon;

  // For comparison, derive kind-specific icon
  const comparisonData =
    preview.previewType === "comparison"
      ? (preview.data as AgencyComparisonPayload)
      : null;
  const ComparisonIcon = comparisonData
    ? comparisonKindIcons[comparisonData.comparisonKind] ?? ReceiptText
    : null;
  const DisplayIcon = ComparisonIcon ?? Icon;

  const title =
    (preview.data as any)?.title ??
    config.label;

  return (
    <Card className={`${config.borderColor} ${config.bgColor}`}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full ${config.iconBg}`}
              >
                <DisplayIcon className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-base">{title}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {preview.summaryText}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {comparisonData ? (
                <Badge variant="secondary">
                  {comparisonKindLabels[comparisonData.comparisonKind] ??
                    config.label}
                </Badge>
              ) : (
                <Badge variant="secondary">{config.label}</Badge>
              )}
              {lifecycleBadge(preview.lifecycleState)}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Commit button */}
            <PreviewCommitButton
              agencyId={agencyId}
              runId={runId}
              artifactId={preview.artifactId}
              commitToken={preview.commit.token}
              commitAvailable={preview.commit.available}
              commitStatus={preview.commit.status}
              lifecycleState={preview.lifecycleState}
              previewType={preview.previewType}
              targetType={preview.commit.targetType}
              targetId={preview.commit.targetId}
              onCommitted={onCommitted}
            />
            {onDismiss && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                onClick={onDismiss}
                aria-label="Dismiss preview"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Type-specific content */}
        {preview.previewType === "research" && (
          <ResearchPreviewContent data={preview.data as any} />
        )}
        {preview.previewType === "storyboard" && (
          <StoryboardPreviewContent data={preview.data as any} />
        )}
        {preview.previewType === "deck" && (
          <DeckPreviewContent data={preview.data as any} />
        )}
        {preview.previewType === "comparison" && comparisonData && (
          <ComparisonContent data={comparisonData} />
        )}

        {/* Provenance / Sources */}
        {preview.provenance.length > 0 && (
          <>
            <Separator />
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Sources
              </p>
              <div className="flex flex-wrap gap-2">
                {preview.provenance
                  .filter((p) => p.title || p.url)
                  .map((p, i) => (
                    <Badge key={i} variant="outline" className="gap-1 text-xs">
                      {p.url ? (
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 hover:underline"
                        >
                          {p.title || "Source"}
                          <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      ) : (
                        <span>{p.title}</span>
                      )}
                    </Badge>
                  ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Inline comparison content (migrated from ComparisonPreviewCard) */
function ComparisonContent({
  data,
}: {
  data: AgencyComparisonPayload;
}) {
  return (
    <div className="space-y-4">
      {data.locationSummary && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" />
          <span>{data.locationSummary}</span>
        </div>
      )}

      {data.summary && (
        <p className="text-sm leading-relaxed text-foreground/90">
          {data.summary}
        </p>
      )}

      {data.recommendations.length > 0 && (
        <div className="rounded-lg border bg-background/70 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Recommendations
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {data.recommendations.map((rec, i) => (
              <li key={i}>&#8226; {rec}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-3">
        {data.options.map((option, i) => {
          const price = option.priceLabel ?? (
            option.price != null
              ? [option.currency, option.price].filter(Boolean).join(" ")
              : null
          );
          const distance = option.distanceLabel ?? (
            option.distance != null
              ? `${option.distance}${option.distanceUnit ? ` ${option.distanceUnit}` : ""}`
              : null
          );

          return (
            <div
              key={option.optionId ?? `${option.vendor}-${i}`}
              className="rounded-xl border bg-background p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-sm font-semibold">
                    {option.optionTitle}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {option.vendor}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {price && <Badge variant="outline">{price}</Badge>}
                  {distance && <Badge variant="outline">{distance}</Badge>}
                  {option.availabilityState !== "unknown" && (
                    <Badge variant="secondary">
                      {option.availabilityState.replace(/_/g, " ")}
                    </Badge>
                  )}
                  {option.refundable != null && (
                    <Badge variant="secondary">
                      {option.refundable ? "Refundable" : "Non-refundable"}
                    </Badge>
                  )}
                </div>
              </div>

              {(option.locationSummary || option.notes) && (
                <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                  {option.locationSummary && <p>{option.locationSummary}</p>}
                  {option.notes && <p>{option.notes}</p>}
                </div>
              )}

              {option.evidence.length > 0 && (
                <>
                  <Separator className="my-3" />
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Evidence
                    </p>
                    {option.evidence.map((ev, j) => (
                      <div
                        key={j}
                        className="rounded-lg bg-muted/40 p-2 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{ev.label}</span>
                          {ev.url && (
                            <a
                              href={ev.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-sky-700 hover:underline"
                            >
                              Open
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                        {ev.snippet && (
                          <p className="mt-1 text-muted-foreground">
                            {ev.snippet}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
