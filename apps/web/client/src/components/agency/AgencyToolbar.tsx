import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Save,
  Upload,
  LayoutGrid,
  Play,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AgencyToolbarProps {
  agencyName: string;
  agencyStatus: "draft" | "published" | "archived";
  isSaving: boolean;
  onSave: () => void;
  onPublish: () => void;
  onAutoLayout: () => void;
  onTest: () => void;
  onBack: () => void;
  onNameChange?: (name: string) => void;
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
  onSave,
  onPublish,
  onAutoLayout,
  onTest,
  onBack,
  onNameChange,
}: AgencyToolbarProps) {
  return (
    <div className="flex h-12 items-center justify-between border-b bg-background px-4">
      {/* Left side */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        {onNameChange ? (
          <input
            type="text"
            value={agencyName}
            onChange={(e) => onNameChange(e.target.value)}
            className="border-none bg-transparent text-sm font-semibold outline-none focus:ring-1 focus:ring-primary rounded px-1"
            placeholder="Untitled Agency"
          />
        ) : (
          <span className="text-sm font-semibold">{agencyName || "Untitled Agency"}</span>
        )}
        <Badge
          variant="secondary"
          className={cn("text-xs", STATUS_STYLES[agencyStatus] ?? "")}
        >
          {agencyStatus}
        </Badge>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onAutoLayout}>
          <LayoutGrid className="mr-1.5 h-3.5 w-3.5" />
          Auto Layout
        </Button>
        <Button variant="outline" size="sm" onClick={onTest}>
          <Play className="mr-1.5 h-3.5 w-3.5" />
          Test
        </Button>
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
      </div>
    </div>
  );
}
