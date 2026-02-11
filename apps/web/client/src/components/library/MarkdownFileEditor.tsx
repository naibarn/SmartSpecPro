import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SafeMarkdown } from "@/components/chat/SafeMarkdown";
import { Save } from "lucide-react";

interface MarkdownFileEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  disabled?: boolean;
  isSaving?: boolean;
  updatedAt?: string;
  errorMessage?: string;
}

export default function MarkdownFileEditor({
  value,
  onChange,
  onSave,
  disabled,
  isSaving,
  updatedAt,
  errorMessage,
}: MarkdownFileEditorProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          {updatedAt ? `Last updated: ${new Date(updatedAt).toLocaleString()}` : "Markdown file"}
        </div>
        <Button
          size="sm"
          onClick={onSave}
          disabled={disabled || isSaving}
          className="gap-2"
        >
          <Save className="h-4 w-4" />
          {isSaving ? "Saving..." : "Save to Library"}
        </Button>
      </div>

      {errorMessage ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <Textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-[320px] font-mono text-sm"
          placeholder="Write markdown content..."
          disabled={disabled}
        />
        <div className="min-h-[320px] rounded-md border bg-background p-3">
          <div className="mb-2 text-xs text-muted-foreground">Preview</div>
          <SafeMarkdown>{value || "_Empty markdown file_"}</SafeMarkdown>
        </div>
      </div>
    </div>
  );
}
