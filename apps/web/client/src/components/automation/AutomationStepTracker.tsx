/**
 * AutomationStepTracker — Real-time progress display during automation execution.
 */

import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Wrench,
} from "lucide-react";

export interface AutomationHealEvent {
  attempt: number;
  maxAttempts: number;
  oldSelector: string;
  newSelector: string;
}

export interface AutomationExecutionStatus {
  status: string;
  currentStep?: number;
  totalSteps?: number;
  completedActions?: string[];
  healEvent?: AutomationHealEvent;
  extractedData?: Record<string, unknown>;
  screenshots?: string[];
  error?: string;
  actualCreditsUsed?: number;
}

interface AutomationStepTrackerProps {
  status: AutomationExecutionStatus;
}

function getPhaseDisplay(status: string, currentStep?: number, totalSteps?: number) {
  if (status === "generating") {
    return { text: "Generating script...", icon: <Loader2 className="h-5 w-5 animate-spin text-blue-500" /> };
  }
  if (status === "running") {
    const stepText = currentStep && totalSteps ? ` step ${currentStep} of ${totalSteps}` : "";
    return { text: `Running${stepText}...`, icon: <Loader2 className="h-5 w-5 animate-spin text-blue-500" /> };
  }
  if (status.startsWith("healing_attempt")) {
    const match = status.match(/healing_attempt_(\d+)/);
    const attempt = match ? match[1] : "?";
    return {
      text: `Healing selector (attempt ${attempt}/3)...`,
      icon: <Wrench className="h-5 w-5 animate-pulse text-amber-500" />,
    };
  }
  if (status === "success") {
    return { text: "Automation complete", icon: <CheckCircle2 className="h-5 w-5 text-green-500" /> };
  }
  if (status === "failed") {
    return { text: "Automation failed", icon: <AlertCircle className="h-5 w-5 text-red-500" /> };
  }
  return { text: status, icon: <Loader2 className="h-5 w-5 animate-spin text-gray-400" /> };
}

export function AutomationStepTracker({ status }: AutomationStepTrackerProps) {
  const phase = getPhaseDisplay(status.status, status.currentStep, status.totalSteps);

  return (
    <div className="space-y-4">
      {/* Phase indicator */}
      <div className="flex items-center gap-2 text-sm font-medium">
        {phase.icon}
        <span>{phase.text}</span>
      </div>

      {/* Progress bar */}
      {status.currentStep != null && status.totalSteps != null && status.totalSteps > 0 && (
        <div className="h-2 w-full rounded-full bg-gray-200">
          <div
            className="h-2 rounded-full bg-blue-500 transition-all duration-300"
            style={{ width: `${Math.min(100, (status.currentStep / status.totalSteps) * 100)}%` }}
          />
        </div>
      )}

      {/* Heal event */}
      {status.healEvent && (
        <div className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm">
          <div className="flex items-center gap-1.5 font-medium text-amber-800">
            <Wrench className="h-4 w-4" />
            Healing selector (attempt {status.healEvent.attempt}/{status.healEvent.maxAttempts})
          </div>
          <div className="mt-1 text-amber-700 line-through">{status.healEvent.oldSelector}</div>
          <div className="font-medium text-amber-900">{status.healEvent.newSelector}</div>
        </div>
      )}

      {/* Completed actions */}
      {status.completedActions && status.completedActions.length > 0 && (
        <div className="max-h-40 space-y-1 overflow-y-auto">
          {status.completedActions.map((action, i) => (
            <div key={i} className="flex items-center gap-1.5 text-sm text-gray-600">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />
              {action}
            </div>
          ))}
        </div>
      )}

      {/* Screenshots */}
      {status.screenshots && status.screenshots.length > 0 && (
        <div className="flex gap-2 overflow-x-auto py-1">
          {status.screenshots.map((src, i) => (
            <img
              key={i}
              src={src.startsWith("data:") ? src : `data:image/png;base64,${src}`}
              alt={`Screenshot ${i + 1}`}
              className="h-16 w-16 shrink-0 rounded border object-cover"
            />
          ))}
        </div>
      )}

      {/* Error display */}
      {status.status === "failed" && status.error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {status.error}
        </div>
      )}

      {/* Extracted data */}
      {status.status === "success" && status.extractedData && (
        <div className="rounded-lg border bg-gray-50 p-3">
          <div className="mb-1 text-xs font-medium text-gray-500">Extracted Data</div>
          <pre className="max-h-40 overflow-auto text-xs text-gray-700">
            {JSON.stringify(status.extractedData, null, 2)}
          </pre>
        </div>
      )}

      {/* Credits used */}
      {status.status === "success" && status.actualCreditsUsed != null && (
        <div className="text-xs text-gray-500">
          Credits used: {status.actualCreditsUsed}
        </div>
      )}
    </div>
  );
}
