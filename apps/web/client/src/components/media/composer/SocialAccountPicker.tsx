import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface SocialAccountPickerItem {
  id: number;
  label: string;
  ready: boolean;
  issue?: string | null;
  provider: string;
}

export interface SocialAccountPickerProps {
  items: SocialAccountPickerItem[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  className?: string;
  emptyMessage?: string;
}

export function SocialAccountPicker({ items, selectedId, onSelect, className, emptyMessage = "No connected accounts found." }: SocialAccountPickerProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        items.map((item) => (
          <div key={item.id} className={cn("flex items-center justify-between gap-3 rounded-xl border p-3", selectedId === item.id && "border-cyan-400 bg-cyan-50/60")}>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{item.label}</span>
                <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                  {item.provider}
                </Badge>
              </div>
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
