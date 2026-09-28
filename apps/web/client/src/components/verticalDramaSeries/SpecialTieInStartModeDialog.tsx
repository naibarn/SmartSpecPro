import { History, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SpecialTieInStartMode } from "@/lib/specialTieInUi";

export function SpecialTieInStartModeDialog({
  lang,
  open,
  onOpenChange,
  onSelect,
}: {
  lang: "th" | "en";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (mode: SpecialTieInStartMode) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[calc(100%-2rem)] max-w-lg"
        data-testid="vd-special-tie-in-start-dialog"
      >
        <DialogHeader>
          <DialogTitle>
            {lang === "th" ? "เลือกวิธีเริ่มต้น" : "Choose how to start"}
          </DialogTitle>
          <DialogDescription>
            {lang === "th"
              ? "เลือกว่าจะเริ่มตอนพิเศษใหม่ หรือกลับไปทำงานที่บันทึกไว้ก่อนหน้า"
              : "Choose whether to start a new special episode or resume saved work."}
          </DialogDescription>
        </DialogHeader>

        <section
          className="grid gap-3 sm:grid-cols-2"
          aria-label={
            lang === "th"
              ? "วิธีเริ่มต้นตอนพิเศษ"
              : "Special episode start modes"
          }
        >
          <Button
            type="button"
            variant="default"
            className="h-auto min-h-32 flex-col items-start justify-start gap-2 whitespace-normal p-4 text-left"
            data-testid="vd-special-tie-in-fresh"
            onClick={() => onSelect("fresh")}
          >
            <span className="flex items-center gap-2 text-base font-semibold">
              <Plus className="h-4 w-4" aria-hidden="true" />
              {lang === "th" ? "สร้างตอนใหม่" : "Create new episode"}
            </span>
            <span className="text-sm font-normal opacity-90">
              {lang === "th"
                ? "ล้างข้อมูลตอนเดิมทั้งหมด และไม่โหลดงานก่อนหน้ามาปะปน"
                : "Clear the previous episode data and do not load old work."}
            </span>
          </Button>

          <Button
            type="button"
            variant="outline"
            className="h-auto min-h-32 flex-col items-start justify-start gap-2 whitespace-normal p-4 text-left"
            data-testid="vd-special-tie-in-resume"
            onClick={() => onSelect("resume")}
          >
            <span className="flex items-center gap-2 text-base font-semibold">
              <History className="h-4 w-4" aria-hidden="true" />
              {lang === "th" ? "โหลดงานเดิม" : "Load previous work"}
            </span>
            <span className="text-sm font-normal text-muted-foreground">
              {lang === "th"
                ? "โหลดชุดงานล่าสุดที่บันทึกไว้ เพื่อทำต่อจากเดิม"
                : "Load the latest saved work and continue from it."}
            </span>
          </Button>
        </section>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            data-testid="vd-special-tie-in-start-cancel"
            onClick={() => onOpenChange(false)}
          >
            {lang === "th" ? "ยกเลิก" : "Cancel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
