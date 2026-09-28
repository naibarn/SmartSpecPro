import { useEffect, useRef, useState } from "react";
import { Archive, Clock3, Loader2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import type { VerticalDramaLang } from "./verticalDramaCopy";

export type VerticalDramaStaleDraftDays = 7 | 10;

export interface VerticalDramaStaleDraftCounts {
  7: number;
  10: number;
}

/** Draft recovery is an index-page concern; keep detail/episode routes cold. */
export function isVerticalDramaSeriesIndexPath(path: string): boolean {
  const pathname = path.split(/[?#]/, 1)[0].replace(/\/+$/, "");
  return pathname === "/drama-series";
}

export function defaultVerticalDramaStaleDraftDays(
  counts: VerticalDramaStaleDraftCounts
): VerticalDramaStaleDraftDays | null {
  if (counts[10] > 0) return 10;
  if (counts[7] > 0) return 7;
  return null;
}

export function verticalDramaStaleDraftCleanupSignature(
  counts: VerticalDramaStaleDraftCounts
): string {
  return `7:${counts[7]}|10:${counts[10]}`;
}

export function useVerticalDramaStaleDraftCleanupOffer(input: {
  enabled: boolean;
  isLoaded: boolean;
  counts: VerticalDramaStaleDraftCounts;
}) {
  const [open, setOpen] = useState(false);
  const [selectedDays, setSelectedDays] =
    useState<VerticalDramaStaleDraftDays>(10);
  const lastSummarySignature = useRef<string | null>(null);

  useEffect(() => {
    if (!input.enabled) {
      setOpen(false);
      lastSummarySignature.current = null;
      return;
    }
    if (!input.isLoaded) return;

    const defaultDays = defaultVerticalDramaStaleDraftDays(input.counts);
    const signature = verticalDramaStaleDraftCleanupSignature(input.counts);
    if (signature !== lastSummarySignature.current) {
      lastSummarySignature.current = signature;
      if (defaultDays != null) setSelectedDays(defaultDays);
    }
  }, [input.enabled, input.isLoaded, input.counts[7], input.counts[10]]);

  return {
    open,
    setOpen,
    openCleanupDialog: () => setOpen(true),
    hasEligibleJobs: defaultVerticalDramaStaleDraftDays(input.counts) != null,
    selectedDays,
    setSelectedDays,
  };
}

export function useVerticalDramaStaleDraftCleanupMutation(input: {
  lang: VerticalDramaLang;
  onCompleted: () => void;
}) {
  return trpc.verticalDramaSeries.archiveStaleDraftJobs.useMutation({
    onSuccess: data => {
      toast.success(
        data.archivedCount > 0
          ? input.lang === "th"
            ? `เก็บงาน Draft ${data.archivedCount} งานเข้าประวัติแล้ว`
            : `Archived ${data.archivedCount} Draft jobs to history.`
          : input.lang === "th"
            ? "ไม่มีงาน Draft ที่ยังเข้าเงื่อนไข งานอาจมีการอัปเดตไปแล้ว"
            : "No Draft jobs are still eligible; they may have been updated."
      );
      input.onCompleted();
    },
    onError: () => {
      toast.error(
        input.lang === "th"
          ? "เก็บงาน Draft เข้าประวัติไม่สำเร็จ กรุณาลองใหม่"
          : "Could not archive Draft jobs. Please try again."
      );
    },
  });
}

function copy(lang: VerticalDramaLang, th: string, en: string): string {
  return lang === "th" ? th : en;
}

const DAY_OPTIONS = [7, 10] as const;

export function VerticalDramaStaleDraftCleanupDialog(props: {
  lang: VerticalDramaLang;
  open: boolean;
  counts: VerticalDramaStaleDraftCounts;
  selectedDays: VerticalDramaStaleDraftDays;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectedDaysChange: (days: VerticalDramaStaleDraftDays) => void;
  onConfirm: () => void;
}) {
  const selectedCount = props.counts[props.selectedDays];

  return (
    <AlertDialog
      open={props.open}
      onOpenChange={open => {
        if (!props.isPending) props.onOpenChange(open);
      }}
    >
      <AlertDialogContent className="sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Clock3 className="h-5 w-5 text-amber-600" aria-hidden="true" />
            {copy(
              props.lang,
              "จัดการงาน Draft ที่ไม่มีการเคลื่อนไหว",
              "Manage inactive Draft jobs"
            )}
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <span className="block">
              {copy(
                props.lang,
                "พบงาน Draft ที่ไม่มีการเคลื่อนไหวตั้งแต่ 7 วันขึ้นไป เลือกช่วงเวลาเพื่อเก็บออกจากรายการหลักและลดภาระการโหลด",
                "Some Draft jobs have been inactive for at least 7 days. Choose an age threshold to archive them from the active inbox and reduce loading work."
              )}
            </span>
            <span className="block font-medium text-foreground">
              {copy(
                props.lang,
                "เก็บเฉพาะงาน Draft ที่หยุดทำงานแล้ว ประวัติและ version เดิมยังอยู่ และไม่กระทบซีรีส์ที่สร้างแล้ว",
                "Only inactive Draft jobs are archived. History and versions are retained, and created series are not affected."
              )}
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <fieldset disabled={props.isPending} className="space-y-2 py-2">
          <legend className="mb-2 text-sm font-medium text-foreground">
            {copy(
              props.lang,
              "เลือกอายุงานที่ไม่มีการเคลื่อนไหว",
              "Choose inactivity age"
            )}
          </legend>
          <RadioGroup
            value={String(props.selectedDays)}
            onValueChange={value =>
              props.onSelectedDaysChange(
                Number(value) as VerticalDramaStaleDraftDays
              )
            }
            className="grid gap-2"
          >
            {DAY_OPTIONS.map(days => {
              const count = props.counts[days];
              const id = `vd-stale-draft-days-${days}`;
              return (
                <Label
                  key={days}
                  htmlFor={id}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2 font-normal has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50"
                >
                  <span className="flex items-center gap-2">
                    <RadioGroupItem
                      id={id}
                      value={String(days)}
                      disabled={count === 0}
                    />
                    <span>
                      {copy(
                        props.lang,
                        `ไม่มีการเคลื่อนไหวเกิน ${days} วัน`,
                        `Inactive for more than ${days} days`
                      )}
                    </span>
                  </span>
                  <span className="text-sm font-medium text-muted-foreground">
                    {copy(props.lang, `${count} งาน`, `${count} jobs`)}
                  </span>
                </Label>
              );
            })}
          </RadioGroup>
        </fieldset>

        <AlertDialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={props.isPending}
            onClick={() => props.onOpenChange(false)}
          >
            {copy(props.lang, "เก็บไว้ก่อน", "Keep for now")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="gap-2"
            disabled={props.isPending || selectedCount === 0}
            onClick={props.onConfirm}
          >
            {props.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Archive className="h-4 w-4" aria-hidden="true" />
            )}
            {copy(props.lang, "เก็บเข้าประวัติ", "Archive to history")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
