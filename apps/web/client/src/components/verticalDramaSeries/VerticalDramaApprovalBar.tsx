/**
 * VerticalDramaApprovalBar — approve / reject / repair actions for a stage's
 * approval checkpoint (spec §04 UI/UX Contract).
 *
 * States: approve-in-progress (busy, non-reentrant), approved-success, and
 * rejected (with reason + resulting repair next action). Controls are keyboard
 * reachable; the busy state uses a static label under `prefers-reduced-motion`.
 */

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { vdCopy, type VdLocale } from "./verticalDramaWorkspaceCopy";

export type VerticalDramaApprovalBarState =
  | "idle"
  | "approving"
  | "approved"
  | "rejected";

export interface VerticalDramaApprovalBarProps {
  locale?: VdLocale;
  state: VerticalDramaApprovalBarState;
  /** Shown when `state === "rejected"`. */
  rejectionReason?: string;
  /** Disable paid/repair actions until policy passes (disabled/focus state). */
  disabled?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
  onRepair?: () => void;
  className?: string;
}

export function VerticalDramaApprovalBar({
  locale = "en",
  state,
  rejectionReason,
  disabled = false,
  onApprove,
  onReject,
  onRepair,
  className,
}: VerticalDramaApprovalBarProps) {
  const t = useMemo(() => vdCopy(locale), [locale]);
  const busy = state === "approving";

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3",
        className,
      )}
      role="group"
      aria-label={t.approve}
      data-state={state}
    >
      {state === "approved" ? (
        <Badge variant="secondary" className="gap-1">
          <span aria-hidden>✓</span>
          {t.approved}
        </Badge>
      ) : state === "rejected" ? (
        <div className="flex flex-col gap-1">
          <Badge variant="destructive">{t.rejected}</Badge>
          {rejectionReason ? (
            <p className="text-xs text-muted-foreground">
              {t.rejectionReason}: {rejectionReason}
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <Button
            type="button"
            size="sm"
            onClick={onApprove}
            disabled={busy || disabled}
            aria-busy={busy}
            data-testid="vd-approval-approve"
          >
            {busy ? (
              // Reduced-motion safe: static label, no spinner animation required.
              <span className="motion-reduce:animate-none">{t.approving}</span>
            ) : (
              t.approve
            )}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onReject}
            disabled={busy}
            data-testid="vd-approval-reject"
          >
            {t.reject}
          </Button>
        </>
      )}

      {/* Repair entry point stays available (secondary action). */}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={onRepair}
        disabled={busy}
        data-testid="vd-approval-repair"
      >
        {t.repair}
      </Button>
    </div>
  );
}

export default VerticalDramaApprovalBar;
