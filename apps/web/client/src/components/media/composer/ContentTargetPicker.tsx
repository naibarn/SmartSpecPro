import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface ContentTargetPickerItem {
  id: number;
  label: string;
  providerLabel?: string;
  ready: boolean;
  issue?: string | null;
  detail?: string | null;
}

export interface ContentTargetPickerProps {
  title: string;
  items: ContentTargetPickerItem[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  className?: string;
  emptyMessage?: string;
}

export function ContentTargetPicker({
  title,
  items,
  selectedId,
  onSelect,
  className,
  emptyMessage = "No targets found.",
}: ContentTargetPickerProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="text-sm font-medium">{title}</div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "flex items-center justify-between gap-3 rounded-xl border p-3",
              selectedId === item.id && "border-cyan-400 bg-cyan-50/60",
            )}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{item.label}</span>
                {item.providerLabel && (
                  <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                    {item.providerLabel}
                  </Badge>
                )}
                <Badge variant={item.ready ? "default" : "secondary"} className="px-1.5 py-0 text-[10px]">
                  {item.ready ? "Ready" : "Draft"}
                </Badge>
                {!item.ready && item.issue && (
                  <Badge variant="outline" className="px-1.5 py-0 text-[10px] text-amber-700">
                    {item.issue}
                  </Badge>
                )}
              </div>
              {item.detail && <p className="truncate text-xs text-muted-foreground">{item.detail}</p>}
              {!item.ready && item.issue && <p className="text-xs text-amber-700">{item.issue}</p>}
            </div>
            <Button type="button" variant={selectedId === item.id ? "secondary" : "outline"} size="sm" onClick={() => onSelect(item.id)}>
              {selectedId === item.id ? "Selected" : "Select"}
            </Button>
          </div>
        ))
      )}
    </div>
  );
}
