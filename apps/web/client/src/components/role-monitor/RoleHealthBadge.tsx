import { cn } from "@/lib/utils";

interface RoleHealthBadgeProps {
  label: string;
  tone?: "healthy" | "warning" | "danger" | "muted";
}

const toneClasses: Record<NonNullable<RoleHealthBadgeProps["tone"]>, string> = {
  healthy: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  danger: "border-rose-200 bg-rose-50 text-rose-700",
  muted: "border-slate-200 bg-slate-50 text-slate-600",
};

export function RoleHealthBadge({ label, tone = "muted" }: RoleHealthBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
        toneClasses[tone],
      )}
    >
      {label}
    </span>
  );
}
