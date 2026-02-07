import { Card, CardContent } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

export interface StatItem {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color?: string;
}

interface StatsCardsProps {
  items: StatItem[];
}

export function StatsCards({ items }: StatsCardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Card key={item.label}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Icon className={`h-4 w-4 ${item.color || ""}`} />
                {item.label}
              </div>
              <div className="text-2xl font-bold">{item.value}</div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
