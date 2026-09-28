/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) —
 * section 11 §6.5. One per-shot card: view + edit + regenerate. Character
 * counts recompute from the LOCAL edited text for display only (never
 * client-side truncation or rewriting — spec §5.4). Errors render inside
 * the affected card with the blocker id shown as a code chip and the
 * server message as the body; `getSequentialShotBlockerHint` may add an
 * optional "what to fix" line (fallback = server message alone).
 *
 * Marketplace spare-image repair (2026-07-23, extracted the same day into
 * `SequentialShotAlternatesStrip` once the primary placement moved to the
 * Storyboard Review clip list per direct user feedback on b661284a6) — when
 * `shot.alternates` has more than one entry, a compact thumbnail strip
 * renders under the image so a bad shot (e.g. wrong product material) can
 * be repaired by swapping in an already-generated, already-paid-for frame
 * at zero extra credit. Renders nothing for 0 or 1 alternates — the common
 * single-wave case gets no layout shift.
 */
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { AuthenticatedMediaImage } from "@/components/media/AuthenticatedMediaImage";
import type {
  SequentialCameraBeatModel,
  SequentialShotCardModel,
} from "@/lib/marketplaceSequentialStoryboardUi";
import { SequentialShotAlternatesStrip } from "./SequentialShotAlternatesStrip";
import {
  getMarketplaceHyperframesUiCopy,
  getSequentialShotBlockerHint,
  type MarketplaceHyperframesUiLocale,
} from "./hyperframesUiCopy";

export interface SequentialShotEditorCardShotError {
  shotId: number;
  blockerId: string;
  message: string;
}

export interface SequentialShotEditorCardSaveInput {
  shotId: number;
  storySummary: string;
  dialogue: string;
  imagePrompt: string;
  videoPrompt: string;
  cameraBeats?: SequentialCameraBeatModel[];
}

export interface SequentialShotEditorCardProps {
  shot: SequentialShotCardModel;
  imageMaxChars: number;
  videoMaxChars: number;
  busy?: boolean;
  saving?: boolean;
  /** True while this shot's spare-image swap mutation is in flight. Follows
   *  the same per-card boolean convention as `busy`/`saving`. */
  swappingAlternate?: boolean;
  error?: SequentialShotEditorCardShotError;
  onRegenerate: (shotId: number) => void;
  onSaveEdits: (input: SequentialShotEditorCardSaveInput) => void;
  onGeneratePrompt?: (input: {
    shotId: number;
    stage: "image" | "video";
  }) => void;
  onGenerateContent?: (input: {
    shotId: number;
    stage: "summary" | "dialogue";
  }) => void;
  generatingPromptStage?: "image" | "video" | "summary" | "dialogue" | null;
  languagePlan?: {
    summaryLanguage: "th" | "en";
    dialogueLanguage: "th" | "en";
    promptLanguage: "th" | "en";
  };
  /** Marketplace spare-image repair — swap this shot's live frame to an
   *  already-generated, already-paid-for alternate. Never charges credits. */
  onSelectAlternate: (input: { shotId: number; attempt: number }) => void;
  onEditImage?: (input: { shotId: number; instruction: string }) => void;
  onAcceptEditedImage?: (shotId: number) => void;
  onDiscardEditedImage?: (shotId: number) => void;
  onPollEditedImage?: (shotId: number) => void;
  imageEditSubmitting?: boolean;
  imageEditResult?: { beforeUrl: string; afterUrl: string } | null;
  locale?: MarketplaceHyperframesUiLocale | string;
}

export function SequentialShotEditorCard({
  shot,
  imageMaxChars,
  videoMaxChars,
  busy,
  saving,
  swappingAlternate,
  error,
  onRegenerate,
  onSaveEdits,
  onGeneratePrompt,
  onGenerateContent,
  generatingPromptStage,
  languagePlan,
  onSelectAlternate,
  onEditImage,
  onAcceptEditedImage,
  onDiscardEditedImage,
  onPollEditedImage,
  imageEditSubmitting,
  imageEditResult,
  locale,
}: SequentialShotEditorCardProps) {
  const copy = getMarketplaceHyperframesUiCopy(locale);
  const thai = copy.locale === "th";
  // Local edit buffers, initialized once from the projected shot model.
  // Never reset from `error` (binding decision §3.6 / spec §5.7 — a
  // rejected save must retain exactly what the user typed).
  const [dialogue, setDialogue] = useState(shot.dialogue);
  const [storySummary, setStorySummary] = useState(shot.visualSummary);
  const [imagePrompt, setImagePrompt] = useState(shot.imagePrompt);
  const [videoPrompt, setVideoPrompt] = useState(shot.videoPrompt);
  const [cameraBeats, setCameraBeats] = useState<SequentialCameraBeatModel[]>(
    shot.cameraBeats ?? []
  );
  const [imageEditDialogOpen, setImageEditDialogOpen] = useState(false);
  const [imageEditInstruction, setImageEditInstruction] = useState("");

  const imageOverBudget = imagePrompt.length > imageMaxChars;
  const videoOverBudget = videoPrompt.length > videoMaxChars;
  const hint = error
    ? getSequentialShotBlockerHint(error.blockerId, copy.locale)
    : null;
  const selectedSummaryLanguage = languagePlan?.summaryLanguage ?? "th";
  const selectedDialogueLanguage = languagePlan?.dialogueLanguage ?? "th";
  const selectedPromptLanguage = languagePlan?.promptLanguage ?? "en";
  const persistedImageEdit = shot.imageEditCandidate;
  const persistedImageEditPending = persistedImageEdit?.status === "submitted";
  const displayedImageEdit =
    imageEditResult ??
    (persistedImageEdit?.status === "completed" && persistedImageEdit.afterUrl
      ? {
          beforeUrl: persistedImageEdit.beforeUrl,
          afterUrl: persistedImageEdit.afterUrl,
        }
      : null);
  const imageEditIsSubmitting =
    Boolean(imageEditSubmitting) || persistedImageEditPending;

  return (
    <div
      data-testid={`sequential-shot-card-${shot.shotId}`}
      className="space-y-3 rounded-lg border bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {thai ? `ช็อตที่ ${shot.shotId}` : `Shot ${shot.shotId}`}
          </span>
          {shot.purpose ? (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {shot.purpose}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {shot.qcStatus ? (
            <Badge variant="outline">{shot.qcStatus}</Badge>
          ) : null}
          {shot.demonstrationType ? (
            <Badge variant="secondary">{shot.demonstrationType}</Badge>
          ) : null}
          {shot.guardianRequired ? <Badge>{copy.guardianBadge}</Badge> : null}
        </div>
      </div>

      <section
        className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-950"
        aria-label={
          thai
            ? `ภาพที่ใช้งานอยู่ของช็อตที่ ${shot.shotId}`
            : `Active image for shot ${shot.shotId}`
        }
      >
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
          {thai ? "ภาพหลักที่ใช้งานอยู่ของช็อตนี้" : "Active shot frame"}
        </p>
        {shot.frameUrl ? (
          // Shot frames are 9:16 vertical — `aspect-[9/16]` + `object-cover`
          // keeps the full frame readable instead of squashing it into a
          // short wide strip (2026-07-23 user feedback on b661284a6).
          <AuthenticatedMediaImage
            src={shot.frameUrl}
            alt={thai ? `ภาพหลักช็อตที่ ${shot.shotId}` : `Shot ${shot.shotId} frame`}
            className="mx-auto aspect-[9/16] w-full max-w-[220px] rounded-md border object-cover dark:border-slate-700"
          />
        ) : (
          <p className="rounded-md border border-dashed border-slate-300 bg-white p-4 text-center text-xs text-slate-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-400">
            {thai
              ? "ยังไม่มีภาพที่สร้างสำหรับช็อตนี้"
              : "No generated frame for this shot yet."}
          </p>
        )}
      </section>

      {onEditImage ? (
        <section className="space-y-2 rounded-md border border-fuchsia-200 bg-fuchsia-50/60 p-2 dark:border-fuchsia-900 dark:bg-fuchsia-950/20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-fuchsia-900 dark:text-fuchsia-200">
                {thai ? "แก้ไขภาพด้วย AI · Image-to-image" : "AI image edit · Image-to-image"}
              </p>
              <p className="text-[11px] text-fuchsia-700 dark:text-fuchsia-300">
                {thai
                  ? "ใช้ภาพหลักของช็อตนี้เป็นต้นฉบับและสร้าง candidate ใหม่ โดยยังไม่เปลี่ยนภาพจริง"
                  : "Use this shot's active frame as the source. The new candidate will not replace it until approved."}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!shot.frameUrl || imageEditIsSubmitting}
              onClick={() => setImageEditDialogOpen(true)}
            >
              {imageEditIsSubmitting
                ? thai
                  ? "กำลังสร้างภาพแก้ไข…"
                  : "Creating edit…"
                : thai
                  ? "แก้ไขภาพด้วย AI"
                  : "Edit image with AI"}
            </Button>
          </div>
          {persistedImageEditPending ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-sky-200 bg-sky-50 p-2 text-[11px] text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
              <span>
                {thai
                  ? "ภาพแก้ไขกำลังรอผลจาก provider — ยังไม่เปลี่ยนภาพหลัก"
                  : "The edited image is still processing — the active frame is unchanged."}
              </span>
              {onPollEditedImage ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onPollEditedImage(shot.shotId)}
                >
                  {thai ? "ตรวจผลอีกครั้ง" : "Check result"}
                </Button>
              ) : null}
            </div>
          ) : null}
          {persistedImageEdit?.status === "failed" ? (
            <p className="rounded border border-red-200 bg-red-50 p-2 text-[11px] text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
              {persistedImageEdit.errorMessage ||
                (thai ? "การแก้ภาพไม่สำเร็จ" : "Image edit failed")}
            </p>
          ) : null}
          {displayedImageEdit ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded border bg-white p-2 dark:bg-slate-900">
                <p className="mb-1 text-[11px] font-medium text-slate-500">{thai ? "ภาพเดิม" : "Before"}</p>
                <AuthenticatedMediaImage src={displayedImageEdit.beforeUrl} alt="" className="aspect-[9/16] w-full rounded object-cover" />
              </div>
              <div className="rounded border border-fuchsia-300 bg-white p-2 dark:bg-slate-900">
                <p className="mb-1 text-[11px] font-medium text-fuchsia-700">{thai ? "ภาพใหม่ · รออนุมัติ" : "New candidate · awaiting approval"}</p>
                <AuthenticatedMediaImage src={displayedImageEdit.afterUrl} alt="" className="aspect-[9/16] w-full rounded object-cover" />
              </div>
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                {onAcceptEditedImage ? (
                  <Button type="button" size="sm" onClick={() => onAcceptEditedImage(shot.shotId)}>
                    {thai ? "ใช้ภาพใหม่" : "Use new image"}
                  </Button>
                ) : null}
                {onDiscardEditedImage ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => onDiscardEditedImage(shot.shotId)}>
                    {thai ? "เก็บภาพเดิม" : "Keep old image"}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <Dialog open={imageEditDialogOpen} onOpenChange={setImageEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{thai ? `แก้ไขภาพช็อตที่ ${shot.shotId} ด้วย AI` : `AI edit shot ${shot.shotId} image`}</DialogTitle>
            <DialogDescription>
              {thai
                ? "ระบุเฉพาะสิ่งที่ต้องการแก้ ระบบจะล็อกสินค้ากับบุคคลอ้างอิงและใช้ภาพเดิมเป็นต้นฉบับ"
                : "Describe only the change. Product and person references remain locked and the active frame is used as the source."}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={imageEditInstruction}
            onChange={event => setImageEditInstruction(event.target.value)}
            placeholder={thai ? "เช่น เปลี่ยนมุมกล้องให้ใกล้ขึ้น แต่คงสินค้าและบุคคลเดิม" : "e.g. Make the camera closer while preserving the exact product and person"}
            rows={5}
            autoFocus
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setImageEditDialogOpen(false)}>
              {thai ? "ยกเลิก" : "Cancel"}
            </Button>
            <Button
              type="button"
              disabled={!imageEditInstruction.trim() || imageEditIsSubmitting}
              onClick={() => {
                if (!imageEditInstruction.trim()) return;
                onEditImage?.({ shotId: shot.shotId, instruction: imageEditInstruction.trim() });
                setImageEditDialogOpen(false);
              }}
            >
              {thai ? "สร้าง candidate" : "Create candidate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <section
        className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-950"
        aria-label={
          thai
            ? `วิดีโอที่สร้างแล้วของช็อตที่ ${shot.shotId}`
            : `Generated video for shot ${shot.shotId}`
        }
      >
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
          {thai ? "วิดีโอที่สร้างแล้วของช็อตนี้" : "Generated shot video"}
        </p>
        {shot.videoUrl ? (
          <video
            src={shot.videoUrl}
            controls
            preload="metadata"
            className="mx-auto aspect-[9/16] w-full max-w-[220px] rounded-md border object-contain dark:border-slate-700"
            aria-label={
              thai ? `วิดีโอช็อตที่ ${shot.shotId}` : `Shot ${shot.shotId} video`
            }
          />
        ) : (
          <p className="rounded-md border border-dashed border-slate-300 bg-white p-4 text-center text-xs text-slate-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-400">
            {thai
              ? "ยังไม่มีวิดีโอที่สร้างสำหรับช็อตนี้"
              : "No generated video for this shot yet."}
          </p>
        )}
      </section>

      <SequentialShotAlternatesStrip
        shotId={shot.shotId}
        alternates={shot.alternates}
        swapping={swappingAlternate}
        onSelectAlternate={onSelectAlternate}
        locale={locale}
      />

      {error ? (
        <div className="space-y-1 rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          <p className="font-mono">{error.blockerId}</p>
          <p>{error.message}</p>
          {hint ? (
            <p className="text-red-700 dark:text-red-300">{hint}</p>
          ) : null}
        </div>
      ) : null}

      <div className="block space-y-1">
        <span className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
          <span>{thai ? "เรื่องย่อช็อต / ภาพรวมฉาก" : "Shot story / visual summary"}</span>
          {onGenerateContent ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={Boolean(generatingPromptStage)}
              onClick={() =>
                onGenerateContent({ shotId: shot.shotId, stage: "summary" })
              }
            >
              {generatingPromptStage === "summary"
                ? thai
                  ? "กำลังสร้างเรื่องย่อ…"
                  : "Generating summary…"
                : storySummary
                  ? thai
                    ? `สร้างเรื่องย่อใหม่ (${selectedSummaryLanguage === "th" ? "ไทย" : "English"})`
                    : `Regenerate summary (${selectedSummaryLanguage})`
                  : thai
                    ? `สร้างเรื่องย่อ (${selectedSummaryLanguage === "th" ? "ไทย" : "English"})`
                    : `Generate summary (${selectedSummaryLanguage})`}
            </Button>
          ) : null}
        </span>
        <Textarea
          value={storySummary}
          onChange={event => setStorySummary(event.target.value)}
          placeholder={
            thai
              ? "ยังไม่มีเรื่องย่อของช็อตนี้ — เขียนเหตุการณ์และภาพที่ต้องการให้เกิดขึ้น"
              : "No shot summary yet — describe the story beat and intended visual."
          }
          className="min-h-20"
        />
        {!storySummary ? (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            {thai
              ? "ข้อมูลเดิมไม่มีเรื่องย่อ ระบบจะไม่แต่งเนื้อหาแทนให้โดยอัตโนมัติ"
              : "The legacy job has no saved summary; the system will not invent one automatically."}
          </p>
        ) : null}
      </div>

      <label className="block space-y-1">
        <span className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
          <span>{thai ? "บทพูด" : "Dialogue"}</span>
          {onGenerateContent ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={Boolean(generatingPromptStage)}
              onClick={() =>
                onGenerateContent({ shotId: shot.shotId, stage: "dialogue" })
              }
            >
              {generatingPromptStage === "dialogue"
                ? thai
                  ? "กำลังสร้างบทพูด…"
                  : "Generating dialogue…"
                : dialogue
                  ? thai
                    ? `สร้างบทพูดใหม่ (${selectedDialogueLanguage === "th" ? "ไทย" : "English"})`
                    : `Regenerate dialogue (${selectedDialogueLanguage})`
                  : thai
                    ? `สร้างบทพูด (${selectedDialogueLanguage === "th" ? "ไทย" : "English"})`
                    : `Generate dialogue (${selectedDialogueLanguage})`}
            </Button>
          ) : null}
        </span>
        <Textarea
          value={dialogue}
          onChange={event => setDialogue(event.target.value)}
          placeholder={
            thai
              ? "ยังไม่มีบทพูดของช็อตนี้ — กรอกบทพูดก่อนบันทึก"
              : "No dialogue saved for this shot — enter it before saving."
          }
          className="min-h-12"
        />
        {!dialogue ? (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            {thai
              ? "ไม่พบบทพูดจากงานเดิม ระบบจะแสดงช่องว่างให้แก้ไขได้โดยตรง"
              : "No dialogue was saved by the legacy job; edit this field directly."}
          </p>
        ) : null}
      </label>

      <div className="block space-y-1">
        <span className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
          <span>
            {thai
              ? `Prompt ภาพเริ่มต้น (${selectedPromptLanguage === "th" ? "ไทย" : "English"})`
              : `Start-frame image prompt (${selectedPromptLanguage})`}
          </span>
          <span
            className={
              imageOverBudget ? "text-amber-700 dark:text-amber-400" : ""
            }
          >
            {copy.promptCharCount(imagePrompt.length, imageMaxChars)}
          </span>
        </span>
        {onGeneratePrompt ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={Boolean(generatingPromptStage)}
            onClick={() =>
              onGeneratePrompt({ shotId: shot.shotId, stage: "image" })
            }
          >
            {generatingPromptStage === "image"
              ? thai
                ? "กำลังสร้าง Prompt ภาพ…"
                : "Generating image prompt…"
              : imagePrompt
                ? thai
                  ? "สร้าง Prompt ภาพใหม่"
                  : "Regenerate image prompt"
                : thai
                  ? "สร้าง Prompt ภาพ"
                  : "Generate image prompt"}
          </Button>
        ) : null}
        <Textarea
          aria-label={thai ? "Prompt ภาพเริ่มต้น" : "Start-frame image prompt"}
          value={imagePrompt}
          onChange={event => setImagePrompt(event.target.value)}
          className="min-h-24"
        />
        {imageOverBudget ? (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            {copy.promptOverBudget}
          </p>
        ) : null}
      </div>

      <div className="block space-y-1">
        <span className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
          <span>
            {thai
              ? `Prompt วิดีโอ (${selectedPromptLanguage === "th" ? "ไทย" : "English"})`
              : `Video prompt (${selectedPromptLanguage})`}
          </span>
          <span
            className={
              videoOverBudget ? "text-amber-700 dark:text-amber-400" : ""
            }
          >
            {copy.promptCharCount(videoPrompt.length, videoMaxChars)}
          </span>
        </span>
        {onGeneratePrompt ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={Boolean(generatingPromptStage)}
            onClick={() =>
              onGeneratePrompt({ shotId: shot.shotId, stage: "video" })
            }
          >
            {generatingPromptStage === "video"
              ? thai
                ? "กำลังสร้าง Prompt วิดีโอ…"
                : "Generating video prompt…"
              : videoPrompt
                ? thai
                  ? "สร้าง Prompt วิดีโอใหม่"
                  : "Regenerate video prompt"
                : thai
                  ? "สร้าง Prompt วิดีโอ"
                  : "Generate video prompt"}
          </Button>
        ) : null}
        <Textarea
          aria-label={thai ? "Prompt วิดีโอ" : "Video prompt"}
          value={videoPrompt}
          onChange={event => setVideoPrompt(event.target.value)}
          className="min-h-20"
        />
        {videoOverBudget ? (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            {copy.promptOverBudget}
          </p>
        ) : null}
      </div>

      <section className="space-y-2 rounded-md border border-indigo-200 bg-indigo-50/60 p-2 dark:border-indigo-900 dark:bg-indigo-950/30">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-indigo-900 dark:text-indigo-200">
              {thai ? "Multi-shot / จังหวะกล้องของช็อตนี้" : "Multi-shot camera beats"}
            </p>
            <p className="text-[11px] text-indigo-700 dark:text-indigo-300">
              {thai
                ? "แต่ละช็อตมีจังหวะกล้องและการเคลื่อนไหวของตัวเองตามแนวทาง Drama Series"
                : "Each shot keeps its own camera beats and natural motion."}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              setCameraBeats(current => [
                ...current,
                {
                  beatId: current.length + 1,
                  durationSeconds: 1,
                  camera: "medium shot",
                  movement: "slow natural push-in",
                  action: "continue the shot action naturally",
                  transition: "cut",
                },
              ])
            }
          >
            {thai ? "เพิ่มมุมกล้อง" : "Add camera beat"}
          </Button>
        </div>
        {cameraBeats.length === 0 ? (
          <p className="rounded border border-dashed border-indigo-200 bg-white/70 p-2 text-[11px] text-indigo-700 dark:border-indigo-800 dark:bg-slate-900/60 dark:text-indigo-300">
            {thai
              ? "ยังไม่มี beat แยก ระบบจะสร้างชุด multi-shot ให้เมื่อสร้าง Prompt วิดีโอ"
              : "No beats yet. Regenerating the video prompt will author a shot-specific multi-shot plan."}
          </p>
        ) : (
          <ol className="space-y-2">
            {cameraBeats.map((beat, index) => (
              <li
                key={`${beat.beatId}-${index}`}
                className="grid gap-2 rounded border border-indigo-100 bg-white p-2 dark:border-indigo-900 dark:bg-slate-900 sm:grid-cols-2"
              >
                <label className="space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                  <span>{thai ? "กล้อง" : "Camera"}</span>
                  <Textarea
                    value={beat.camera}
                    onChange={event =>
                      setCameraBeats(current =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, camera: event.target.value }
                            : item
                        )
                      )
                    }
                    className="min-h-10 bg-white text-xs dark:bg-slate-950"
                  />
                </label>
                <label className="space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                  <span>{thai ? "การเคลื่อนไหว" : "Movement"}</span>
                  <Textarea
                    value={beat.movement}
                    onChange={event =>
                      setCameraBeats(current =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, movement: event.target.value }
                            : item
                        )
                      )
                    }
                    className="min-h-10 bg-white text-xs dark:bg-slate-950"
                  />
                </label>
                <label className="space-y-1 text-[11px] text-slate-600 dark:text-slate-300 sm:col-span-2">
                  <span>{thai ? "Action / จังหวะการแสดง" : "Action"}</span>
                  <Textarea
                    value={beat.action}
                    onChange={event =>
                      setCameraBeats(current =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, action: event.target.value }
                            : item
                        )
                      )
                    }
                    className="min-h-10 bg-white text-xs dark:bg-slate-950"
                  />
                </label>
                <div className="flex items-center justify-between sm:col-span-2">
                  <span className="text-[11px] text-slate-500">
                    {thai ? `Beat ${index + 1}` : `Beat ${index + 1}`} · {beat.durationSeconds}s · {beat.transition || "cut"}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setCameraBeats(current => current.filter((_, itemIndex) => itemIndex !== index))
                    }
                  >
                    {thai ? "ลบ" : "Remove"}
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {shot.claimSources.length > 0 ? (
        <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
          {shot.claimSources.map((claim, index) => (
            <li key={index}>
              {claim.text}{" "}
              <span className="text-slate-600 dark:text-slate-500">
                ({claim.support})
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={Boolean(saving)}
          onClick={() =>
            onSaveEdits({
              shotId: shot.shotId,
              storySummary,
              dialogue,
              imagePrompt,
              videoPrompt,
              ...(cameraBeats.length > 0 ? { cameraBeats } : {}),
            })
          }
        >
          {copy.saveShotEdits}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={Boolean(busy)}
          onClick={() => onRegenerate(shot.shotId)}
        >
          {copy.regenerateShot}
        </Button>
      </div>
    </div>
  );
}
