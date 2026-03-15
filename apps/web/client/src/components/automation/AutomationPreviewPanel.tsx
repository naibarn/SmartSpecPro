/**
 * AutomationPreviewPanel — Displays the automation plan before execution.
 */

import {
  Clock,
  FileOutput,
  Globe,
  ListChecks,
  MousePointerClick,
  TextCursorInput,
} from "lucide-react";

export interface AutomationPlanStep {
  description: string;
  actionType: string;
  url?: string;
  selectorConfidence: number;
}

export interface AutomationPlanSummary {
  steps: AutomationPlanStep[];
  estimatedCredits: number;
  estimatedDurationSeconds: number;
}

interface AutomationPreviewPanelProps {
  planSummary: AutomationPlanSummary;
  onConfirm: () => void;
  onCancel: () => void;
  onConfirmLiveMode?: () => void;
}

const ACTION_ICONS: Record<string, React.ReactNode> = {
  click: <MousePointerClick className="h-4 w-4" />,
  fill: <TextCursorInput className="h-4 w-4" />,
  extract_data: <FileOutput className="h-4 w-4" />,
  navigate: <Globe className="h-4 w-4" />,
  wait: <Clock className="h-4 w-4" />,
  select: <ListChecks className="h-4 w-4" />,
};

function getConfidenceClasses(confidence: number): string {
  if (confidence >= 0.8) return "bg-green-100 text-green-800";
  if (confidence >= 0.6) return "bg-yellow-100 text-yellow-800";
  return "bg-red-100 text-red-800";
}

export function AutomationPreviewPanel({
  planSummary,
  onConfirm,
  onCancel,
  onConfirmLiveMode,
}: AutomationPreviewPanelProps) {
  return (
    <div className="space-y-4">
      {/* Step list */}
      <div className="divide-y rounded-lg border">
        {planSummary.steps.map((step, i) => (
          <div key={i} className="flex items-start gap-3 p-3">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600">
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {ACTION_ICONS[step.actionType] ?? <Globe className="h-4 w-4" />}
                <span className="text-sm">{step.description}</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                  {step.actionType}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${getConfidenceClasses(step.selectorConfidence)}`}
                >
                  {Math.round(step.selectorConfidence * 100)}%
                </span>
                {step.url && (
                  <span className="truncate text-xs text-gray-400" title={step.url}>
                    {step.url}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-sm text-gray-500">
        <div className="flex gap-4">
          <span>~{planSummary.estimatedCredits} credits</span>
          <span>~{planSummary.estimatedDurationSeconds}s</span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
          {onConfirmLiveMode ? (
            <button
              type="button"
              onClick={onConfirmLiveMode}
              className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
            >
              Run in Live Mode
            </button>
          ) : null}
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Run Automation
          </button>
        </div>
      </div>
    </div>
  );
}
