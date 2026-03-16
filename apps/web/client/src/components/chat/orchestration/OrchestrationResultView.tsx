/**
 * OrchestrationResultView — renders multi-skill orchestration results.
 *
 * Part of Feature 045: Hybrid Skill Orchestrator (Section 11).
 */

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp } from "lucide-react";

interface ResultSection {
  skillId: string;
  skillName?: string;
  type: "text" | "image" | "video" | "audio" | "error";
  content?: string;
  urls?: string[];
  creditsUsed: number;
  durationMs: number;
}

export interface OrchestrationResultViewProps {
  result: {
    sections: ResultSection[];
    summary?: string;
    totalCreditsUsed: number;
    totalDurationMs: number;
    orchestrationLevel: "simple" | "compound" | "complex";
    traceId: string;
  };
  pipelineProgress?: {
    completed: number;
    total: number;
    currentSkill?: string;
  };
}

export function OrchestrationResultView({
  result,
  pipelineProgress,
}: OrchestrationResultViewProps) {
  const [showDetails, setShowDetails] = useState(false);
  const isMulti = result.sections.length > 1;

  return (
    <div className="space-y-3">
      {/* Summary */}
      {isMulti && result.summary && (
        <div className="text-sm text-muted-foreground italic">
          {result.summary}
        </div>
      )}

      {/* Sections */}
      {result.sections.map((section, idx) => (
        <div key={idx} className="space-y-1">
          {isMulti && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium">
                {section.skillName || section.skillId}
              </span>
              <Badge variant="outline" className="text-xs py-0">
                {section.type}
              </Badge>
            </div>
          )}

          {section.type === "text" && section.content && (
            <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
              {section.content}
            </div>
          )}

          {section.type === "image" && section.urls && (
            <div className="flex flex-wrap gap-2">
              {section.urls.map((url, i) => (
                <img
                  key={i}
                  src={url}
                  alt={`Generated image ${i + 1}`}
                  className="rounded-md max-h-64 object-cover"
                />
              ))}
            </div>
          )}

          {(section.type === "video" || section.type === "audio") &&
            section.urls && (
              <div className="space-y-1">
                {section.urls.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary underline"
                  >
                    {section.type === "video" ? "View video" : "Play audio"}{" "}
                    {section.urls!.length > 1 ? `(${i + 1})` : ""}
                  </a>
                ))}
              </div>
            )}

          {section.type === "error" && (
            <div className="text-sm text-destructive">
              {section.content || "An error occurred"}
            </div>
          )}
        </div>
      ))}

      {/* Pipeline Progress */}
      {pipelineProgress && (
        <div className="text-xs text-muted-foreground">
          Running: {pipelineProgress.currentSkill} ({pipelineProgress.completed}
          /{pipelineProgress.total})
        </div>
      )}

      {/* Collapsible Details */}
      {isMulti && (
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {showDetails ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
          Orchestration details
        </button>
      )}

      {showDetails && (
        <div className="text-xs text-muted-foreground space-y-1 pl-4 border-l-2 border-border">
          <div className="flex gap-2">
            <Badge variant="outline" className="text-xs py-0">
              {result.orchestrationLevel.toUpperCase()}
            </Badge>
            <span>{result.totalCreditsUsed} credits</span>
            <span>{(result.totalDurationMs / 1000).toFixed(1)}s</span>
          </div>
          <table className="w-full text-left">
            <thead>
              <tr>
                <th className="font-medium">Skill</th>
                <th className="font-medium">Credits</th>
                <th className="font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {result.sections.map((s, i) => (
                <tr key={i}>
                  <td>{s.skillName || s.skillId}</td>
                  <td>{s.creditsUsed}</td>
                  <td>{(s.durationMs / 1000).toFixed(1)}s</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="font-mono text-[10px] opacity-50">
            trace: {result.traceId}
          </div>
        </div>
      )}
    </div>
  );
}
