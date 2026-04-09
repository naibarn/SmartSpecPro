import { Badge } from "@/components/ui/badge";

type WorkpackStatusRailProps = {
  lifecycleState: string;
  autonomyMode: string;
  gateResult?: string | null;
  promotionState?: string | null;
};

export function WorkpackStatusRail({
  lifecycleState,
  autonomyMode,
  gateResult,
  promotionState,
}: WorkpackStatusRailProps) {
  return (
    <div className="flex flex-wrap gap-2" data-testid="workpack-status-rail">
      <Badge variant="outline">Lifecycle: {lifecycleState}</Badge>
      <Badge variant="outline">Mode: {autonomyMode}</Badge>
      {gateResult ? <Badge variant="outline">Gate: {gateResult}</Badge> : null}
      {promotionState ? <Badge variant="outline">Promotion: {promotionState}</Badge> : null}
    </div>
  );
}
