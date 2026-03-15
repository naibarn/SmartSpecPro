import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  FileText,
  Lightbulb,
  BookOpen,
  ExternalLink,
} from "lucide-react";

interface ResearchPreviewContentProps {
  data: {
    title: string;
    executiveSummary: string;
    sections: Array<{
      heading: string;
      content: string;
      sources: string[];
    }>;
    keyFindings: string[];
    recommendations: string[];
  };
}

export function ResearchPreviewContent({
  data,
}: ResearchPreviewContentProps) {
  return (
    <div className="space-y-4">
      {/* Executive Summary */}
      <div className="rounded-lg border bg-background/70 p-4">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Executive Summary
        </p>
        <p className="text-sm leading-relaxed text-foreground/90">
          {data.executiveSummary}
        </p>
      </div>

      {/* Key Findings */}
      {data.keyFindings.length > 0 && (
        <div className="rounded-lg border bg-amber-50/50 p-3">
          <div className="mb-2 flex items-center gap-1.5">
            <Lightbulb className="h-3.5 w-3.5 text-amber-600" />
            <p className="text-xs font-medium uppercase tracking-wide text-amber-700">
              Key Findings
            </p>
          </div>
          <ul className="space-y-1 text-sm">
            {data.keyFindings.map((finding, i) => (
              <li key={i}>
                <span className="mr-1.5 text-amber-600">&#8226;</span>
                {finding}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Sections */}
      {data.sections.length > 0 && (
        <div className="space-y-3">
          {data.sections.map((section, i) => (
            <div key={i} className="rounded-xl border bg-background p-4 shadow-sm">
              <div className="mb-2 flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-muted-foreground" />
                <h4 className="text-sm font-semibold">{section.heading}</h4>
              </div>
              <p className="text-sm leading-relaxed text-foreground/80">
                {section.content}
              </p>
              {section.sources.length > 0 && (
                <>
                  <Separator className="my-3" />
                  <div className="flex flex-wrap gap-1.5">
                    {section.sources.map((source, j) => (
                      <Badge
                        key={j}
                        variant="outline"
                        className="gap-1 text-xs"
                      >
                        <ExternalLink className="h-2.5 w-2.5" />
                        {source}
                      </Badge>
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Recommendations */}
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
    </div>
  );
}
