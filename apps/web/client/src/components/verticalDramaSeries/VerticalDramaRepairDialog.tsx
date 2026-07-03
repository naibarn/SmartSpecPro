/**
 * VerticalDramaRepairDialog — captures a repair instruction (target + text),
 * optionally prefilled from a template, gates paid repairs behind a
 * credit-estimate confirmation, and surfaces repair job status/result
 * (spec §04 Repair Instruction Capture Wiring §8.4).
 *
 * Job status and result are text-visible and keyboard reachable. Declining the
 * credit-estimate confirmation aborts the repair and spends no credits.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { vdCopy, vdStageLabel, type VdLocale } from "./verticalDramaWorkspaceCopy";
import type { VerticalDramaPipelineStage } from "@shared/verticalDramaSeries";

export type VerticalDramaRepairJobStatus =
  | "idle"
  | "submitting"
  | "running"
  | "succeeded"
  | "failed";

export interface VerticalDramaRepairTarget {
  parentShotNumber?: number;
  subShotNumber?: number;
  clipNumber?: number;
}

export interface VerticalDramaRepairDialogProps {
  locale?: VdLocale;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stage: VerticalDramaPipelineStage;
  target?: VerticalDramaRepairTarget;
  /** Optional repair-prompt template used to prefill the instruction textarea. */
  templateInstruction?: string;
  /** When true, a credit-estimate confirmation must be accepted before submit. */
  requiresPaidConfirm?: boolean;
  creditEstimate?: number;
  /** Live job status after submit. */
  jobStatus?: VerticalDramaRepairJobStatus;
  /** New artifact/version id on success. */
  resultArtifactId?: string;
  /** Failure reason when jobStatus === "failed". */
  errorReason?: string;
  /** Called with the resolved instruction + target when the user submits. */
  onSubmit: (args: { instruction: string; target?: VerticalDramaRepairTarget }) => void;
}

export function VerticalDramaRepairDialog({
  locale = "en",
  open,
  onOpenChange,
  stage,
  target,
  templateInstruction,
  requiresPaidConfirm = false,
  creditEstimate,
  jobStatus = "idle",
  resultArtifactId,
  errorReason,
  onSubmit,
}: VerticalDramaRepairDialogProps) {
  const t = useMemo(() => vdCopy(locale), [locale]);
  const [instruction, setInstruction] = useState(templateInstruction ?? "");
  const [confirmedPaid, setConfirmedPaid] = useState(false);

  // Reset when (re)opened; prefill from the template.
  useEffect(() => {
    if (open) {
      setInstruction(templateInstruction ?? "");
      setConfirmedPaid(false);
    }
  }, [open, templateInstruction]);

  const busy = jobStatus === "submitting" || jobStatus === "running";
  const needsConfirm = requiresPaidConfirm && !confirmedPaid;
  const canSubmit = instruction.trim().length > 0 && !busy && !needsConfirm;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby="vd-repair-desc">
        <DialogHeader>
          <DialogTitle>
            {t.repair}: {vdStageLabel(stage, locale)}
          </DialogTitle>
          <DialogDescription id="vd-repair-desc">
            {target?.parentShotNumber != null
              ? `${t.repair} — shot ${target.parentShotNumber}${
                  target.subShotNumber != null ? `.${target.subShotNumber}` : ""
                }`
              : t.repairInstruction}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="block text-sm font-medium" htmlFor="vd-repair-instruction">
            {t.repairInstruction}
          </label>
          <Textarea
            id="vd-repair-instruction"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder={t.repairPlaceholder}
            rows={4}
            disabled={busy}
            data-testid="vd-repair-instruction"
          />

          {/* Paid-repair credit-estimate confirmation gate. */}
          {requiresPaidConfirm ? (
            <div className="rounded-md border border-amber-400/50 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
              <p className="font-medium">
                {t.creditEstimate}
                {creditEstimate != null ? `: ${creditEstimate}` : ""}
              </p>
              <p className="text-muted-foreground">{t.confirmPaidRepair}</p>
              {needsConfirm ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={() => setConfirmedPaid(true)}
                  data-testid="vd-repair-confirm-credit"
                >
                  {t.confirm}
                </Button>
              ) : (
                <Badge variant="secondary" className="mt-2">
                  {t.confirm} ✓
                </Badge>
              )}
            </div>
          ) : null}

          {/* Job status + result — text-visible, keyboard reachable. */}
          <div aria-live="polite" className="min-h-[1.5rem] text-sm">
            {jobStatus === "submitting" ? (
              <span className="motion-reduce:animate-none">{t.submitting}</span>
            ) : jobStatus === "running" ? (
              <span className="motion-reduce:animate-none">{t.repairRunning}</span>
            ) : jobStatus === "succeeded" ? (
              <span className="text-emerald-600 dark:text-emerald-400">
                {t.repairResult}: {t.newArtifact}
                {resultArtifactId ? ` (#${resultArtifactId})` : ""}
              </span>
            ) : jobStatus === "failed" ? (
              <span className="text-destructive">
                {t.failed}
                {errorReason ? `: ${errorReason}` : ""}
              </span>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {t.cancel}
          </Button>
          <Button
            type="button"
            onClick={() => onSubmit({ instruction: instruction.trim(), target })}
            disabled={!canSubmit}
            aria-busy={busy}
            data-testid="vd-repair-submit"
          >
            {busy ? t.submitting : t.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default VerticalDramaRepairDialog;
