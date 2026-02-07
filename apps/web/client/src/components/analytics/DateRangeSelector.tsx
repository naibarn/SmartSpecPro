import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { label: "7d", value: 7 },
  { label: "30d", value: 30 },
  { label: "90d", value: 90 },
] as const;

interface DateRangeSelectorProps {
  value: number;
  onChange: (days: number) => void;
}

export function DateRangeSelector({ value, onChange }: DateRangeSelectorProps) {
  return (
    <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
      {OPTIONS.map((opt) => (
        <Button
          key={opt.value}
          variant={value === opt.value ? "default" : "ghost"}
          size="sm"
          className={cn("h-7 px-3 text-xs", value !== opt.value && "text-muted-foreground")}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}
