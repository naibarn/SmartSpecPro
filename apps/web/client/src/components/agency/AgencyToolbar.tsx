import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Save,
  Upload,
  LayoutGrid,
  Play,
  Loader2,
  Coins,
  Undo2,
  Redo2,
  History,
  Sparkles,
  Brain,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ModelPicker } from "./ModelPicker";

interface AgencyToolbarProps {
  agencyName: string;
  agencyStatus: "draft" | "published" | "archived";
  isSaving: boolean;
  defaultModel?: string;
  onDefaultModelChange?: (model: string) => void;
  creatorFeeCredits?: number;
  onCreatorFeeChange?: (fee: number) => void;
  onSave: () => void;
  onPublish: () => void;
  onAutoLayout: () => void;
  onTest: () => void;
  onBack: () => void;
  onNameChange?: (name: string) => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onHistory?: () => void;
  onAutoCreate?: () => void;
  readOnly?: boolean;
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  published: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  archived: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};

export function AgencyToolbar({
  agencyName,
  agencyStatus,
  isSaving,
  defaultModel = "",
  onDefaultModelChange,
  creatorFeeCredits = 0,
  onCreatorFeeChange,
  onSave,
  onPublish,
  onAutoLayout,
  onTest,
  onBack,
  onNameChange,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  onHistory,
  onAutoCreate,
  readOnly = false,
}: AgencyToolbarProps) {
  return (
    <div className="flex h-12 items-center justify-between border-b bg-background px-4 gap-2">
      {/* Left side */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        {onNameChange && !readOnly ? (
          <input
            type="text"
            value={agencyName}
            onChange={(e) => onNameChange(e.target.value)}
            className="border-none bg-transparent text-sm font-semibold outline-none focus:ring-1 focus:ring-primary rounded px-1 min-w-0 max-w-48"
            placeholder="Untitled Agency"
          />
        ) : (
          <span className="text-sm font-semibold">{agencyName || "Untitled Agency"}</span>
        )}
        <Badge
          variant="secondary"
          className={cn("text-xs shrink-0", STATUS_STYLES[agencyStatus] ?? "")}
        >
          {agencyStatus}
        </Badge>
        {readOnly && (
          <Badge variant="outline" className="text-xs shrink-0 text-orange-600 border-orange-300">
            Read Only
          </Badge>
        )}
      </div>

      {/* Undo / Redo */}
      {(onUndo || onRedo) && (
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
          >
            <Redo2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Default Model Picker */}
      {onDefaultModelChange && (
        <div className="flex items-center gap-1.5 rounded-md border bg-muted/50 px-2 py-1">
          <Brain className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
          <span className="text-xs text-muted-foreground shrink-0">Model:</span>
          <div className="w-40">
            <ModelPicker
              value={defaultModel}
              onChange={onDefaultModelChange}
              compact
            />
          </div>
        </div>
      )}

      {/* Creator Fee */}
      {onCreatorFeeChange && (
        <div className="flex items-center gap-1.5 rounded-md border bg-muted/50 px-2 py-1">
          <Coins className="h-3.5 w-3.5 text-amber-500" />
          <span className="text-xs text-muted-foreground">Fee:</span>
          <input
            type="number"
            min={0}
            max={1000}
            value={creatorFeeCredits}
            onChange={(e) => onCreatorFeeChange(Math.max(0, Math.min(1000, parseInt(e.target.value) || 0)))}
            className="w-14 border-none bg-transparent text-xs font-medium outline-none text-right"
          />
          <span className="text-xs text-muted-foreground">credits/run</span>
        </div>
      )}

      {/* Right side */}
      <div className="flex items-center gap-1.5 ml-auto">
        {onAutoCreate && (
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-purple-600 hover:text-purple-700 hover:bg-purple-50" onClick={onAutoCreate} title="AI Agency Creator">
            <Sparkles className="h-3.5 w-3.5" />
            AI Creator
          </Button>
        )}
        {onHistory && (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onHistory} title="Version history">
            <History className="h-4 w-4" />
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={onAutoLayout}>
          <LayoutGrid className="mr-1.5 h-3.5 w-3.5" />
          Layout
        </Button>
        <Button variant="outline" size="sm" onClick={onTest}>
          <Play className="mr-1.5 h-3.5 w-3.5" />
          Test
        </Button>
        {!readOnly && (
          <>
            <Button variant="outline" size="sm" onClick={onSave} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-1.5 h-3.5 w-3.5" />
              )}
              Save
            </Button>
            <Button size="sm" onClick={onPublish} disabled={isSaving}>
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              Publish
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
