import { Ban, Brain, Code, FileJson, Globe, Pencil, Ruler, ShieldAlert, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Guardrail, GuardrailStrategy } from "./types";
import { STRATEGY_META } from "./types";

const STRATEGY_ICONS: Record<GuardrailStrategy, React.ReactNode> = {
  keyword_block: <Ban className="h-4 w-4" />,
  regex_match: <Code className="h-4 w-4" />,
  llm_classify: <Brain className="h-4 w-4" />,
  json_schema: <FileJson className="h-4 w-4" />,
  max_length: <Ruler className="h-4 w-4" />,
  pii_detection: <ShieldAlert className="h-4 w-4" />,
  custom_endpoint: <Globe className="h-4 w-4" />,
};

interface Props {
  guardrail: Guardrail;
  onEdit: () => void;
  onDelete: () => void;
  onToggleEnabled: (enabled: boolean) => void;
  assigned?: boolean;
  onToggleAssign?: (assign: boolean) => void;
}

export function GuardrailCard({ guardrail, onEdit, onDelete, onToggleEnabled, assigned, onToggleAssign }: Props) {
  const meta = STRATEGY_META[guardrail.strategy];

  return (
    <div className={cn(
      "flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/50",
      !guardrail.isEnabled && "opacity-50",
    )}>
      <div className={cn("flex-shrink-0", meta.color)}>
        {STRATEGY_ICONS[guardrail.strategy]}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{guardrail.name}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="rounded bg-muted px-1 py-0.5 text-[10px] font-medium">{meta.label}</span>
          <span className={cn(
            "rounded px-1 py-0.5 text-[10px] font-medium",
            guardrail.type === "input"
              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
              : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
          )}>
            {guardrail.type}
          </span>
          <span className={cn(
            "rounded px-1 py-0.5 text-[10px] font-medium",
            guardrail.mode === "strict"
              ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
              : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
          )}>
            {guardrail.mode}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <label className="relative inline-flex cursor-pointer items-center">
          <input
            type="checkbox"
            checked={guardrail.isEnabled}
            onChange={(e) => onToggleEnabled(e.target.checked)}
            className="peer sr-only"
          />
          <div className="peer h-5 w-9 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white dark:border-gray-600 dark:bg-gray-700" />
        </label>
        <button onClick={onEdit} className="rounded p-1 hover:bg-accent" title="Edit">
          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        <button onClick={onDelete} className="rounded p-1 hover:bg-accent" title="Delete">
          <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-red-500" />
        </button>
        {onToggleAssign && (
          <label className="relative inline-flex cursor-pointer items-center ml-1">
            <input
              type="checkbox"
              checked={assigned}
              onChange={(e) => onToggleAssign(e.target.checked)}
              className="peer sr-only"
            />
            <div className="peer h-5 w-9 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-green-600 peer-checked:after:translate-x-full peer-checked:after:border-white dark:border-gray-600 dark:bg-gray-700" />
            <span className="ml-1 text-[10px] text-muted-foreground">{assigned ? "Assigned" : "Assign"}</span>
          </label>
        )}
      </div>
    </div>
  );
}
