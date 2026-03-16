/**
 * PipelineProgressIndicator — step-based progress for COMPOUND pipelines.
 *
 * Part of Feature 045: Hybrid Skill Orchestrator (Section 11).
 */

import { Check, X, Loader2 } from "lucide-react";

interface PipelineStep {
  skillId: string;
  skillName: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
}

export interface PipelineProgressIndicatorProps {
  completed: number;
  total: number;
  currentSkill?: string;
  steps?: PipelineStep[];
}

export function PipelineProgressIndicator({
  completed,
  total,
  currentSkill,
  steps,
}: PipelineProgressIndicatorProps) {
  return (
    <div className="space-y-2">
      {/* Step dots */}
      <div className="flex items-center gap-1.5">
        {steps
          ? steps.map((step, i) => (
              <div
                key={i}
                className="flex items-center justify-center h-5 w-5 rounded-full"
                title={`${step.skillName}: ${step.status}`}
              >
                {step.status === "completed" && (
                  <Check className="h-3.5 w-3.5 text-green-500" />
                )}
                {step.status === "running" && (
                  <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
                )}
                {step.status === "failed" && (
                  <X className="h-3.5 w-3.5 text-destructive" />
                )}
                {step.status === "skipped" && (
                  <div className="h-2 w-2 rounded-full bg-muted" />
                )}
                {step.status === "pending" && (
                  <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                )}
              </div>
            ))
          : Array.from({ length: total }, (_, i) => (
              <div
                key={i}
                className={`h-2 w-2 rounded-full ${
                  i < completed
                    ? "bg-green-500"
                    : i === completed
                      ? "bg-primary animate-pulse"
                      : "bg-muted-foreground/30"
                }`}
              />
            ))}
      </div>

      {/* Status text */}
      <div className="text-xs text-muted-foreground">
        {currentSkill
          ? `Running ${currentSkill}... (${completed}/${total})`
          : `${completed}/${total} steps complete`}
      </div>
    </div>
  );
}
