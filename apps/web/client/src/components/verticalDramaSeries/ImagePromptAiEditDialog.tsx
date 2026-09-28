/**
 * ImagePromptAiEditDialog — dialog สำหรับ "ให้ AI ปรับ" พรอมต์ภาพเริ่มต้น (Start-Frame Image Prompt)
 * โดยเฉพาะ (แยกจาก VideoPromptAiEditDialog และ RepairDialog ทั่วไป)
 *
 * - ถาม user ว่าต้องการให้ LLM ปรับพรอมต์ภาพเริ่มต้นอย่างไร
 * - มี example chips ที่เหมาะกับองค์ประกอบภาพ (Composition, Lighting, Wardrobe, Framing) ให้คลิก append
 * - แนบภาพ start frame ของช็อตนั้นให้อัตโนมัติ พร้อมตัวเลือกให้ติ๊กเลือกว่าจะแนบหรือไม่แนบภาพให้ AI วิเคราะห์ (Vision Context)
 * - ส่ง instruction + attachShotImage กลับไปยัง caller ผ่าน onSubmit
 */

import { useEffect, useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Sparkles, ImageIcon, CheckCircle2 } from "lucide-react";
import { AuthenticatedMediaImage } from "@/components/media/AuthenticatedMediaImage";
import { type VdLocale } from "./verticalDramaWorkspaceCopy";

/* ---- Copy text ------------------------------------------------------------ */

const COPY = {
  th: {
    title: "ให้ AI ปรับพรอมต์ภาพเริ่มต้น",
    description:
      "บอก AI ว่าต้องการแก้ไขพรอมต์ภาพเริ่มต้น (Start Frame) นี้อย่างไร — AI จะปรับปรุงองค์ประกอบ การจัดแสง มุมกล้อง หรือรายละเอียดตัวละครตามคำสั่งของคุณ",
    instructionLabel: "คำสั่ง / สิ่งที่ต้องการปรับ",
    instructionPlaceholder:
      "เช่น ปรับองค์ประกอบภาพให้เป็นมุมกว้างขึ้น เพิ่มมิติแสงและเงา...",
    examplesLabel: "ตัวอย่าง (คลิกเพื่อใส่)",
    examples: [
      "ปรับองค์ประกอบภาพ (Composition) ให้ดูเป็นภาพยนตร์ (Cinematic) มากขึ้น และจัดวางตัวละครตามความสำคัญ",
      "แก้ไขการจัดแสง (Lighting) ให้เข้ากับอารมณ์ของฉากและเพิ่มมิติของเงา (Dramatic Lighting)",
      "ปรับรายละเอียดสีหน้า ท่าทาง และแววตาของตัวละครให้สื่ออารมณ์ชัดเจนขึ้น",
      "เพิ่มรายละเอียดเครื่องแต่งกาย (Wardrobe) และฉากหลัง (Environment/Set Design) ให้สมจริงตามยุคสมัย",
      "ปรับมุมกล้องของภาพนิ่ง เช่น เปลี่ยนเป็น Medium Close-up หรือ Wide Shot ให้สอดคล้องกับเรื่องราว",
      "แก้ไขโทนสี (Color Grading) ให้เข้ากับบรรยากาศหลักของซีรีส์",
    ],
    attachShotImageLabel: "แนบภาพ Start Frame ปัจจุบันของช็อตนี้ให้ AI วิเคราะห์ประกอบการปรับแก้ (Vision Context)",
    attachShotImageHintActive: "AI จะดูภาพปัจจุบันประกอบคำสั่ง เพื่อปรับปรุงรายละเอียดให้แม่นยำและสอดคล้องกับภาพจริงยิ่งขึ้น",
    attachShotImageHintInactive: "AI จะปรับแก้พรอมต์โดยใช้ข้อความคำสั่งเท่านั้น ไม่ใช้โทเคนภาพ (เหมาะสำหรับการปรับแก้เฉพาะคำอธิบายหรือข้อความ)",
    noShotImageHint: "ช็อตนี้ยังไม่มีภาพ Start Frame AI จะปรับแก้จากข้อความเท่านั้น",
    submit: "ให้ AI ปรับ",
    submitting: "กำลังปรับ…",
    cancel: "ยกเลิก",
    successNote: "ปรับ prompt สำเร็จ",
    errorPrefix: "เกิดข้อผิดพลาด",
    charCount: (n: number, max: number) => `${n.toLocaleString()} / ${max.toLocaleString()}`,
  },
  en: {
    title: "AI-adjust start-frame image prompt",
    description:
      "Tell AI how to refine this start-frame image prompt — AI will enhance composition, lighting, framing, or character details based on your instruction.",
    instructionLabel: "Instruction / what to change",
    instructionPlaceholder:
      "e.g. Adjust composition to a wider cinematic framing with dramatic shadow depth...",
    examplesLabel: "Examples (click to insert)",
    examples: [
      "Refine composition and framing for a more cinematic, professional look",
      "Adjust lighting to dramatic high-contrast atmosphere suitable for the scene tension",
      "Enhance facial expressions, body language, and eye contact details",
      "Add rich environment, prop, and wardrobe textures true to the scene context",
      "Change still camera angle to Medium Close-up or Wide Shot with distinct depth of field",
      "Adjust color grading and tone to match the series aesthetic",
    ],
    attachShotImageLabel: "Attach this shot's image for AI vision analysis (Start Frame)",
    attachShotImageHintActive: "AI will inspect this image alongside your instructions to accurately refine composition, lighting, and character details.",
    attachShotImageHintInactive: "AI will rewrite using text instructions only without consuming vision tokens (ideal for text-only edits).",
    noShotImageHint: "This shot doesn't have a start frame yet. AI will adjust based on text only.",
    submit: "AI adjust",
    submitting: "Adjusting…",
    cancel: "Cancel",
    successNote: "Prompt adjusted",
    errorPrefix: "Error",
    charCount: (n: number, max: number) => `${n.toLocaleString()} / ${max.toLocaleString()}`,
  },
} as const satisfies Record<VdLocale, unknown>;

type CopyT = typeof COPY.th;

const MAX_INSTRUCTION_CHARS = 2000;

/* ---- Types ---------------------------------------------------------------- */

export type ImagePromptAiEditJobStatus =
  | "idle"
  | "submitting"
  | "succeeded"
  | "failed";

export interface ImagePromptAiEditDialogProps {
  locale?: VdLocale;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** e.g. "Shot 3" (for dialog title context) */
  shotLabel?: string;
  /** Current prompt text shown as reference below the dialog title */
  currentPrompt?: string;
  /** Automatically provided start frame image URL of the current shot */
  shotImageUrl?: string;
  /** Live job status after submit */
  jobStatus?: ImagePromptAiEditJobStatus;
  /** Failure reason when jobStatus === "failed" */
  errorReason?: string;
  /**
   * Called when user submits.
   */
  onSubmit: (args: { instruction: string; attachShotImage: boolean }) => void;
}

/* ---- Component ------------------------------------------------------------ */

export function ImagePromptAiEditDialog({
  locale = "th",
  open,
  onOpenChange,
  shotLabel,
  shotImageUrl,
  jobStatus = "idle",
  errorReason,
  onSubmit,
}: ImagePromptAiEditDialogProps) {
  const t = COPY[locale] as CopyT;

  const [instruction, setInstruction] = useState("");
  const [attachShotImage, setAttachShotImage] = useState(true);

  const busy = jobStatus === "submitting";
  const isOverLimit = instruction.length > MAX_INSTRUCTION_CHARS;
  const canSubmit =
    instruction.trim().length > 0 && !busy && !isOverLimit;

  /* Reset when (re)opened */
  useEffect(() => {
    if (open) {
      setInstruction("");
      setAttachShotImage(true);
    }
  }, [open]);

  function handleExampleClick(example: string) {
    setInstruction(prev => {
      const trimmed = prev.trimEnd();
      return trimmed ? `${trimmed} ${example}` : example;
    });
  }

  function handleSubmit() {
    if (!canSubmit) return;
    onSubmit({
      instruction: instruction.trim(),
      attachShotImage: Boolean(shotImageUrl && attachShotImage),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]"
        aria-describedby="ip-ai-edit-desc"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-500" aria-hidden="true" />
            {t.title}
          </DialogTitle>
          <DialogDescription id="ip-ai-edit-desc">
            {shotLabel ? `${shotLabel} — ` : ""}
            {t.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* ---- Instruction ---- */}
          <div className="space-y-1.5">
            <Label htmlFor="ip-ai-edit-instruction" className="text-sm font-medium">
              {t.instructionLabel}
            </Label>
            <Textarea
              id="ip-ai-edit-instruction"
              value={instruction}
              onChange={e => setInstruction(e.target.value)}
              placeholder={t.instructionPlaceholder}
              rows={3}
              disabled={busy}
              autoFocus
              data-testid="ip-ai-edit-instruction"
              className="resize-none text-sm"
            />
            <div className="flex justify-end">
              <span
                className={`text-[11px] tabular-nums ${
                  isOverLimit
                    ? "font-medium text-destructive"
                    : "text-muted-foreground"
                }`}
              >
                {t.charCount(instruction.length, MAX_INSTRUCTION_CHARS)}
              </span>
            </div>
          </div>

          {/* ---- Example chips ---- */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              {t.examplesLabel}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {t.examples.map((ex, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleExampleClick(ex)}
                  disabled={busy}
                  className="inline-flex cursor-pointer items-center rounded-full border border-dashed border-purple-300 bg-purple-50 px-2.5 py-1 text-left text-[11px] leading-snug text-purple-700 transition-colors hover:border-purple-400 hover:bg-purple-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-purple-700 dark:bg-purple-950/40 dark:text-purple-300 dark:hover:bg-purple-900/60"
                  data-testid={`ip-ai-edit-example-${i}`}
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>

          {/* ---- Shot Image Toggle & Preview (Auto-attached by system) ---- */}
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            {shotImageUrl ? (
              <div className="space-y-2.5">
                <div className="flex items-start gap-2.5">
                  <Checkbox
                    id="ip-ai-edit-attach-image"
                    checked={attachShotImage}
                    onCheckedChange={checked => setAttachShotImage(Boolean(checked))}
                    disabled={busy}
                    className="mt-0.5"
                    data-testid="ip-ai-edit-attach-image-checkbox"
                  />
                  <div className="flex-1 space-y-1">
                    <Label
                      htmlFor="ip-ai-edit-attach-image"
                      className="cursor-pointer text-xs font-medium text-foreground"
                    >
                      {t.attachShotImageLabel}
                    </Label>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      {attachShotImage
                        ? t.attachShotImageHintActive
                        : t.attachShotImageHintInactive}
                    </p>
                  </div>
                </div>

                <div
                  className={`flex items-center gap-3 rounded-md border bg-background p-2 transition-opacity ${
                    !attachShotImage ? "opacity-40" : ""
                  }`}
                >
                  <AuthenticatedMediaImage
                    src={shotImageUrl}
                    alt=""
                    className="h-14 w-14 rounded object-cover"
                    onError={e => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                      <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      {shotLabel ? `${shotLabel} Start Frame` : "Shot Start Frame"}
                      {attachShotImage && (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      )}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {shotImageUrl}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ImageIcon className="h-4 w-4 shrink-0 opacity-60" />
                <span>{t.noShotImageHint}</span>
              </div>
            )}
          </div>

          {/* ---- Job status feedback ---- */}
          <div aria-live="polite" className="min-h-[1.25rem] text-sm">
            {jobStatus === "submitting" ? (
              <span className="text-muted-foreground">{t.submitting}</span>
            ) : jobStatus === "succeeded" ? (
              <span className="text-emerald-600 dark:text-emerald-400">
                ✓ {t.successNote}
              </span>
            ) : jobStatus === "failed" ? (
              <span className="text-destructive">
                {t.errorPrefix}
                {errorReason ? `: ${errorReason}` : ""}
              </span>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            {t.cancel}
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            aria-busy={busy}
            data-testid="ip-ai-edit-submit"
            className="gap-1.5"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {busy ? t.submitting : t.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ImagePromptAiEditDialog;
