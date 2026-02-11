import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { getLibraryStatusMeta } from "@/lib/libraryUi";
import { getDocumentAccessLabel, type DocumentLibraryItem } from "@/lib/documentManagementUi";
import { FileText, Loader2 } from "lucide-react";

interface DocumentGridListProps {
  items: DocumentLibraryItem[];
  selectedId?: number | null;
  isLoading?: boolean;
  emptyMessage?: string;
  onSelect: (item: DocumentLibraryItem) => void;
}

export default function DocumentGridList({
  items,
  selectedId,
  isLoading,
  emptyMessage,
  onSelect,
}: DocumentGridListProps) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-background p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading documents...
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="rounded-lg border bg-background p-6 text-sm text-muted-foreground">
        {emptyMessage || "No documents found in this view."}
      </div>
    );
  }

  return (
    <ScrollArea className="h-[64vh] rounded-lg border bg-background p-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const statusMeta = getLibraryStatusMeta(item.status);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item)}
              className={cn(
                "rounded-lg border p-3 text-left transition hover:border-slate-400",
                selectedId === item.id ? "border-primary bg-primary/5" : "border-slate-200",
              )}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium" title={item.title}>
                    {item.title}
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" />
                    <span>{item.item_type}</span>
                  </div>
                </div>
                <Badge className={statusMeta.className}>{statusMeta.label}</Badge>
              </div>

              <div className="mb-3 flex flex-wrap gap-1">
                <Badge variant="outline" className="text-xs">
                  {getDocumentAccessLabel(item.access_source)}
                </Badge>
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{new Date(item.updated_at).toLocaleString()}</span>
                <Button size="sm" variant="ghost" className="h-7 px-2">
                  Open
                </Button>
              </div>
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
}
