import { Activity, AlertTriangle, BadgeCheck, Clock3, Coins, TrendingUp } from "lucide-react";
import { DashboardKpiCard } from "@/components/dashboard";

type WorkpackMetricCardsProps = {
  metrics: {
    completionRate: number;
    successRate?: number;
    interventionRate: number;
    exceptionRate: number;
    rollbackRate?: number;
    throughputPerDay: number;
    averageCostPerRun: number;
    estimatedTimeSavedMinutes: number;
    policyBlockFrequency?: number;
    promotionVelocity?: number;
  };
};

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function WorkpackMetricCards({ metrics }: WorkpackMetricCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <DashboardKpiCard icon={BadgeCheck} label="Completion rate" value={percent(metrics.completionRate)} />
      {typeof metrics.successRate === "number" ? (
        <DashboardKpiCard icon={BadgeCheck} label="Success rate" value={percent(metrics.successRate)} />
      ) : null}
      <DashboardKpiCard icon={AlertTriangle} label="Intervention rate" value={percent(metrics.interventionRate)} />
      <DashboardKpiCard icon={Activity} label="Exception rate" value={percent(metrics.exceptionRate)} />
      {typeof metrics.rollbackRate === "number" ? (
        <DashboardKpiCard icon={AlertTriangle} label="Rollback rate" value={percent(metrics.rollbackRate)} />
      ) : null}
      <DashboardKpiCard icon={TrendingUp} label="Throughput/day" value={metrics.throughputPerDay.toFixed(0)} />
      <DashboardKpiCard icon={Coins} label="Cost / run" value={metrics.averageCostPerRun.toFixed(2)} />
      <DashboardKpiCard icon={Clock3} label="Time saved" value={`${metrics.estimatedTimeSavedMinutes.toFixed(0)} min`} />
      {typeof metrics.policyBlockFrequency === "number" ? (
        <DashboardKpiCard icon={Activity} label="Policy block freq" value={percent(metrics.policyBlockFrequency)} />
      ) : null}
    </div>
  );
}
