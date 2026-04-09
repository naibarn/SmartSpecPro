import { Activity, AlertTriangle, BadgeCheck, Clock3, Coins, TrendingUp } from "lucide-react";
import { DashboardKpiCard } from "@/components/dashboard";

type WorkpackMetricCardsProps = {
  metrics: {
    completionRate: number;
    interventionRate: number;
    exceptionRate: number;
    throughputPerDay: number;
    averageCostPerRun: number;
    estimatedTimeSavedMinutes: number;
    promotionVelocity?: number;
  };
};

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function WorkpackMetricCards({ metrics }: WorkpackMetricCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <DashboardKpiCard icon={BadgeCheck} label="Completion rate" value={percent(metrics.completionRate)} />
      <DashboardKpiCard icon={AlertTriangle} label="Intervention rate" value={percent(metrics.interventionRate)} />
      <DashboardKpiCard icon={Activity} label="Exception rate" value={percent(metrics.exceptionRate)} />
      <DashboardKpiCard icon={TrendingUp} label="Throughput/day" value={metrics.throughputPerDay.toFixed(0)} />
      <DashboardKpiCard icon={Coins} label="Cost / run" value={metrics.averageCostPerRun.toFixed(2)} />
      <DashboardKpiCard icon={Clock3} label="Time saved" value={`${metrics.estimatedTimeSavedMinutes.toFixed(0)} min`} />
    </div>
  );
}
