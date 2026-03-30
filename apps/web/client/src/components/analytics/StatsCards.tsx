import type { LucideIcon } from "lucide-react";
import { DashboardKpiCard } from "@/components/dashboard";

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
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <DashboardKpiCard
            key={item.label}
            icon={Icon}
            label={item.label}
            value={item.value}
            iconClassName={item.color}
          />
        );
      })}
    </div>
  );
}
