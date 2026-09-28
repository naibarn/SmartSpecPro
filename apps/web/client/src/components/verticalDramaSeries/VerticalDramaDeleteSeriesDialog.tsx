/**
 * VerticalDramaDeleteSeriesDialog — the destructive "delete series project"
 * confirm dialog (settings-tab Danger zone). The user must TYPE the exact
 * series title to enable the delete button, mirroring the server-side
 * `confirmName` check in `verticalDramaSeries.deleteSeries` (defense in
 * depth — a client-only check can't be trusted, so the server re-validates
 * the same string).
 *
 * On success: toast, invalidate `verticalDramaSeries.list` (sidebar + series
 * list page both consume it) and `verticalDramaSeries.get`, then navigate the
 * caller away from the now-deleted series via `onDeleted`.
 */

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import {
  pickCopy,
  verticalDramaCopy,
  type VerticalDramaLang,
} from "./verticalDramaCopy";

function normalizeSeriesNameConfirmation(value: string): string {
  return value.normalize("NFC").trim();
}

export interface VerticalDramaDeleteSeriesDialogProps {
  lang: VerticalDramaLang;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seriesId: string;
  seriesTitle: string;
  /** Called immediately before the destructive mutation starts. */
  onDeleteStarted?: () => void;
  /** Called after the series is permanently deleted (e.g. navigate to the series list). */
  onDeleted: () => void;
}

export function VerticalDramaDeleteSeriesDialog({
  lang,
  open,
  onOpenChange,
  seriesId,
  seriesTitle,
  onDeleteStarted,
  onDeleted,
}: VerticalDramaDeleteSeriesDialogProps) {
  const [confirmName, setConfirmName] = useState("");
  const utils = trpc.useUtils();

  const deleteMutation = trpc.verticalDramaSeries.deleteSeries.useMutation({
    onSuccess: async () => {
      toast.success(pickCopy(lang, verticalDramaCopy.deleteSeriesSuccess));
      // The shell/list page can remount immediately after `onDeleted`. Wait
      // for every active list query to refresh so a previous cache snapshot
      // cannot be rendered again during that navigation.
      await utils.verticalDramaSeries.list.invalidate();
      // The deleted detail query is no longer authoritative. Mark only this
      // series stale after the list synchronization barrier has completed.
      void utils.verticalDramaSeries.get.invalidate({ seriesId });
      setConfirmName("");
      onOpenChange(false);
      onDeleted();
    },
    onError: (err: { message?: string }) => {
      toast.error(
        err?.message || pickCopy(lang, verticalDramaCopy.deleteSeriesError)
      );
    },
  });

  const normalizedConfirmName = normalizeSeriesNameConfirmation(confirmName);
  const normalizedSeriesTitle = normalizeSeriesNameConfirmation(seriesTitle);
  const canDelete =
    normalizedConfirmName === normalizedSeriesTitle &&
    normalizedConfirmName.length > 0 &&
    !deleteMutation.isPending;
  const confirmationMismatch =
    normalizedConfirmName.length > 0 &&
    normalizedConfirmName !== normalizedSeriesTitle &&
    !deleteMutation.isPending;

  return (
    <AlertDialog
      open={open}
      onOpenChange={next => {
        if (!deleteMutation.isPending) {
          if (!next) setConfirmName("");
          onOpenChange(next);
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {pickCopy(lang, verticalDramaCopy.deleteSeriesDialogTitle)}
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <span className="block">
              {pickCopy(lang, verticalDramaCopy.deleteSeriesBody)}
            </span>
            <span className="block">
              {pickCopy(lang, verticalDramaCopy.deleteSeriesDialogBody)}
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="grid gap-1.5 py-2">
          <Label
            htmlFor="delete-series-confirm-name"
            className="text-xs font-medium text-muted-foreground"
          >
            {pickCopy(lang, verticalDramaCopy.deleteSeriesConfirmLabel)} —{" "}
            <strong>{seriesTitle}</strong>
          </Label>
          <Input
            id="delete-series-confirm-name"
            value={confirmName}
            onChange={e => setConfirmName(e.target.value)}
            disabled={deleteMutation.isPending}
            autoComplete="off"
            autoFocus
            aria-invalid={confirmationMismatch}
          />
          {confirmationMismatch ? (
            <p className="text-xs text-destructive" role="alert">
              {lang === "th"
                ? "ชื่อซีรีย์ยังไม่ตรงกัน กรุณาตรวจสอบช่องว่างและตัวอักษรอีกครั้ง"
                : "The series name does not match. Check the spaces and characters."}
            </p>
          ) : null}
          {deleteMutation.error ? (
            <p className="text-xs text-destructive" role="alert">
              {deleteMutation.error.message ||
                pickCopy(lang, verticalDramaCopy.deleteSeriesError)}
            </p>
          ) : null}
        </div>

        <AlertDialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setConfirmName("");
              onOpenChange(false);
            }}
            disabled={deleteMutation.isPending}
          >
            {pickCopy(lang, verticalDramaCopy.deleteSeriesCancel)}
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="gap-2"
            disabled={!canDelete}
            onClick={() => {
              onDeleteStarted?.();
              deleteMutation.mutate({
                seriesId,
                confirmName: normalizedConfirmName,
              });
            }}
          >
            {deleteMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            )}
            {pickCopy(lang, verticalDramaCopy.deleteSeriesConfirmButton)}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
