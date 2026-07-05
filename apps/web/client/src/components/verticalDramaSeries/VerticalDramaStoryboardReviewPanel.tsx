/**
 * VerticalDramaStoryboardReviewPanel (spec feature 131, section-06 · §8.5).
 *
 * Presentational metadata panel for a Vertical Drama Storyboard Review handoff.
 * It renders — read-only unless a callback is supplied — the full review
 * lineage a creator needs BEFORE paid video generation:
 *
 *   - Series › Episode › Storyboard Review breadcrumb + back link.
 *   - Episode summary (motion mode, voice casting, subtitle safe-area, tie-in).
 *   - Per shot: image-side prompts (contact-sheet / per-cell / negative) and
 *     candidate lineage, kept VISUALLY SEPARATE from the editable video prompt.
 *   - Editable video/motion prompt with an append-only edit-history view.
 *   - Grouped sub-shot breakdown under each decomposed parent shot.
 *   - Formatted (labelled key/value, collapsible) provider payload preview.
 *   - QC repair queue as clickable, prefilled repair buttons.
 *   - Read-only "prompts used" for completed runs/tasks.
 *
 * Copy is bilingual (Thai/English) and inline (no shared-file edits). This
 * component owns display only; persistence (append-only edits, repair route
 * calls) is delegated to the callbacks.
 */

import { useMemo, useState } from "react";
import {
  ChevronRight,
  Image as ImageIcon,
  Film,
  Wand2,
  Wrench,
  History,
  AlertTriangle,
  Layers,
  Mic,
  Captions,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* Local prop types (mirror the server reviewData; no shared-file import).    */
/* -------------------------------------------------------------------------- */

type FrameRole = "start" | "stop" | "character" | "product" | "style";
type SubShotTransition = "cut" | "match_cut" | "smash_cut" | "continuous";

export interface PanelReferenceImage {
  url: string;
  assetId?: string;
  role: FrameRole;
}

export interface PanelImagePromptLineage {
  shotNumber: number;
  contactSheetPrompt?: string;
  cellPrompts?: string[];
  negativePrompt?: string;
  contactSheetIds: string[];
  candidateFrameAssetIds: string[];
  selectedStartFrameCandidateId?: string;
  promptSetId?: string;
}

export interface PanelPromptEdit {
  editedByUserId: number;
  editedAt: number;
  original: string;
}

export interface PanelTaskExtraParams {
  source: "vertical_drama_series";
  shotNumber: number;
  clipNumber?: number;
  parentShotNumber?: number;
  subShotNumber?: number;
  subShotCount?: number;
  subShotTransitionIn?: SubShotTransition;
  characterReferenceAssetIds?: string[];
  productReferenceAssetIds?: string[];
  continuityWarnings?: string[];
  assemblyManifestId?: string;
  [key: string]: unknown;
}

export interface PanelTask {
  id: string;
  prompt: string;
  durationSeconds: number;
  status: string;
  storyboardContext: {
    referenceImages: PanelReferenceImage[];
    referenceFrameRoles: FrameRole[];
    imagePrompts?: PanelImagePromptLineage;
  };
  videoSegmentState?: {
    staleTaskIds?: string[];
    staleReason?: string | null;
  };
  extraParams: PanelTaskExtraParams;
  voiceoverFullScript?: string | null;
  promptEditHistory: PanelPromptEdit[];
}

export interface PanelRecommendedRepair {
  action: string;
  instruction: string;
  shotNumber?: number;
  clipNumber?: number;
  artifactId?: string;
  /** The originating QC stage (`QcRepair.stage`), when present in the
   *  persisted repair-queue entry. Callers should resolve this to a pipeline
   *  stage via the shared `VERTICAL_DRAMA_QC_TO_PIPELINE_STAGE` map — do not
   *  guess the pipeline stage from `action` alone, since the same action can
   *  be recommended from more than one QC stage. */
  qcStage?: string;
}

export interface PanelSubShotBreakdown {
  parentShotNumber: number;
  subShotCount: number;
  subShots: Array<{
    subShotNumber: number;
    cameraSetup?: string;
    durationSeconds: number;
    transitionIn: SubShotTransition;
    prompt: string;
  }>;
}

export interface VerticalDramaReviewMetadata {
  source: "vertical_drama_series";
  seriesId: string;
  episodeId: string;
  episodeNumber: number;
  motionMode:
    | "first_last_frame_bridge"
    | "first_frame_to_video"
    | "image_to_video"
    | "text_to_video"
    | "reference_to_video"
    | "prompt_only";
  seriesTitle?: string;
  backlink: { seriesId: string; episodeId: string; episodeNumber: number };
  imagePromptsByShot: PanelImagePromptLineage[];
  subShotBreakdownByShot: PanelSubShotBreakdown[];
  providerPayloadPreview: Record<string, unknown>;
  qcRecommendedRepairs: PanelRecommendedRepair[];
  voiceCasting?: unknown;
  subtitleSafeArea?: unknown;
  audioStrategy?: string | null;
  continuityWarnings: string[];
  tasks: PanelTask[];
}

export type PanelLang = "th" | "en";

export interface VerticalDramaStoryboardReviewPanelProps {
  /** Normalized vertical-drama metadata (from `reviewData`). */
  metadata: VerticalDramaReviewMetadata | null | undefined;
  lang?: PanelLang;
  /** Loading / error states from the caller's query. */
  isLoading?: boolean;
  error?: string | null;
  /** Whether the source run is completed (renders read-only "prompts used"). */
  completed?: boolean;
  /** Route builders for the breadcrumb + back link. */
  routes?: {
    seriesList: () => string;
    seriesDetail: (seriesId: string) => string;
    episode: (seriesId: string, episodeId: string) => string;
  };
  /** Append-only edit of a task's video/motion prompt. */
  onEditVideoPrompt?: (taskId: string, prompt: string) => void;
  /** Open a repair dialog PRE-FILLED with the entry's action/instruction/target. */
  onRepair?: (repair: PanelRecommendedRepair) => void;
  className?: string;
}

/* -------------------------------------------------------------------------- */
/* Inline bilingual copy.                                                     */
/* -------------------------------------------------------------------------- */

const COPY = {
  panelTitle: { th: "รีวิวสตอรีบอร์ด (ซีรีย์แนวตั้ง)", en: "Storyboard Review (Vertical Drama)" },
  crumbSeries: { th: "ซีรีย์", en: "Series" },
  crumbEpisode: { th: "ตอน", en: "Episode" },
  crumbReview: { th: "รีวิวสตอรีบอร์ด", en: "Storyboard Review" },
  back: { th: "กลับไปที่เวิร์กสเปซซีรีย์", en: "Back to series workspace" },
  loading: { th: "กำลังโหลดข้อมูลรีวิว…", en: "Loading review metadata…" },
  errorTitle: { th: "โหลดข้อมูลไม่สำเร็จ", en: "Failed to load" },
  emptyTitle: { th: "ไม่พบข้อมูลซีรีย์แนวตั้ง", en: "No vertical-drama metadata" },
  emptyBody: {
    th: "รีวิวนี้ไม่มีข้อมูลลิเนจของซีรีย์แนวตั้ง — เปิดใหม่จากตอนที่อนุมัติแล้วเพื่อกู้คืน",
    en: "This review has no vertical-drama lineage — re-open it from the approved episode to recover.",
  },
  episodeSummary: { th: "สรุปตอน", en: "Episode summary" },
  motionMode: { th: "โหมดการเคลื่อนไหว", en: "Motion mode" },
  voiceCasting: { th: "การแคสต์เสียง", en: "Voice casting" },
  subtitleSafeArea: { th: "พื้นที่ปลอดภัยของซับไตเติล", en: "Subtitle safe-area" },
  audioStrategy: { th: "กลยุทธ์เสียง", en: "Audio strategy" },
  continuityWarnings: { th: "คำเตือนความต่อเนื่อง", en: "Continuity warnings" },
  shot: { th: "ช็อต", en: "Shot" },
  clip: { th: "คลิป", en: "Clip" },
  duration: { th: "ความยาว", en: "Duration" },
  frameRoles: { th: "บทบาทเฟรม", en: "Frame roles" },
  imagePrompts: { th: "พรอมป์ภาพ (อ่านอย่างเดียว)", en: "Image prompts (read-only)" },
  contactSheetPrompt: { th: "พรอมป์คอนแทกต์ชีต", en: "Contact-sheet prompt" },
  cellPrompts: { th: "พรอมป์รายเซลล์", en: "Per-cell prompts" },
  negativePrompt: { th: "พรอมป์เชิงลบ", en: "Negative prompt" },
  candidateLineage: { th: "ลิเนจของเฟรมที่เลือก", en: "Selected-candidate lineage" },
  promptSet: { th: "ชุดพรอมป์", en: "Prompt set" },
  videoPrompt: { th: "พรอมป์วิดีโอ/การเคลื่อนไหว (แก้ไขได้)", en: "Video / motion prompt (editable)" },
  videoPromptUsed: { th: "พรอมป์วิดีโอที่ใช้จริง (อ่านอย่างเดียว)", en: "Video prompt used (read-only)" },
  editHistory: { th: "ประวัติการแก้ไข", en: "Edit history" },
  originalPrompt: { th: "พรอมป์เดิม", en: "Original prompt" },
  save: { th: "บันทึกการแก้ไข", en: "Save edit" },
  cancel: { th: "ยกเลิก", en: "Cancel" },
  edit: { th: "แก้ไขพรอมป์", en: "Edit prompt" },
  staleNotice: {
    th: "การแก้ไขนี้ทำให้ต้องยืนยันการสร้างที่มีค่าใช้จ่ายอีกครั้ง",
    en: "This edit marks paid generation stale until re-confirmed.",
  },
  payloadPreview: { th: "ตัวอย่างเพย์โหลดผู้ให้บริการ", en: "Provider payload preview" },
  subShotBreakdown: { th: "การแบ่งซับช็อต", en: "Sub-shot breakdown" },
  subShot: { th: "ซับช็อต", en: "Sub-shot" },
  transition: { th: "การเปลี่ยนภาพ", en: "Transition" },
  cameraSetup: { th: "การตั้งกล้อง", en: "Camera setup" },
  repairQueue: { th: "คิวการซ่อมแซม (QC)", en: "Repair queue (QC)" },
  repair: { th: "ซ่อมแซม", en: "Repair" },
  target: { th: "เป้าหมาย", en: "Target" },
  none: { th: "ไม่มี", en: "None" },
  promptsUsed: { th: "พรอมป์ที่ใช้ (รันที่เสร็จแล้ว)", en: "Prompts used (completed run)" },
  characterRefs: { th: "อ้างอิงตัวละคร", en: "Character references" },
  productRefs: { th: "อ้างอิงสินค้า", en: "Product references" },
} as const;

const MOTION_MODE_LABEL: Record<VerticalDramaReviewMetadata["motionMode"], { th: string; en: string }> = {
  first_last_frame_bridge: { th: "บริดจ์เฟรมแรก/สุดท้าย", en: "First/last-frame bridge" },
  first_frame_to_video: { th: "เฟรมแรกเท่านั้น", en: "First-frame only" },
  image_to_video: { th: "ภาพเป็นวิดีโอ", en: "Image to video" },
  text_to_video: { th: "ข้อความเป็นวิดีโอ", en: "Text to video" },
  reference_to_video: { th: "อ้างอิงเป็นวิดีโอ", en: "Reference to video" },
  prompt_only: { th: "พรอมป์อย่างเดียว", en: "Prompt only" },
};

/* -------------------------------------------------------------------------- */
/* Small presentational helpers.                                              */
/* -------------------------------------------------------------------------- */

function useT(lang: PanelLang) {
  return (entry: { th: string; en: string }) => (lang === "th" ? entry.th : entry.en);
}

function SectionHeading({ icon: Icon, children }: { icon?: React.ElementType; children: React.ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
      {Icon ? <Icon aria-hidden="true" className="h-4 w-4 opacity-70" /> : null}
      {children}
    </h3>
  );
}

function KeyValueRows({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data ?? {});
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">—</p>;
  return (
    <dl className="grid grid-cols-1 gap-1 sm:grid-cols-[minmax(0,10rem)_1fr]">
      {entries.map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="truncate text-xs font-medium text-muted-foreground">{key}</dt>
          <dd className="break-words font-mono text-xs text-foreground">
            {typeof value === "object" ? JSON.stringify(value) : String(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function summarizeUnknown(value: unknown, fallback: string): string {
  if (value == null) return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

/* -------------------------------------------------------------------------- */
/* Editable video/motion prompt control.                                      */
/* -------------------------------------------------------------------------- */

function VideoPromptControl({
  task,
  lang,
  completed,
  onEdit,
}: {
  task: PanelTask;
  lang: PanelLang;
  completed?: boolean;
  onEdit?: (taskId: string, prompt: string) => void;
}) {
  const t = useT(lang);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.prompt);
  const isStale = task.videoSegmentState?.staleTaskIds?.includes(task.id) ?? false;
  const editable = !completed && Boolean(onEdit);
  const fieldId = `vd-video-prompt-${task.id}`;

  return (
    <div className="space-y-2">
      <SectionHeading icon={Film}>{completed ? t(COPY.videoPromptUsed) : t(COPY.videoPrompt)}</SectionHeading>
      {editable && editing ? (
        <div className="space-y-2">
          <label htmlFor={fieldId} className="sr-only">
            {t(COPY.videoPrompt)}
          </label>
          <textarea
            id={fieldId}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            className="w-full resize-y rounded border border-input bg-background p-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          />
          <p className="text-xs text-amber-600 dark:text-amber-400">{t(COPY.staleNotice)}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                onEdit?.(task.id, draft);
                setEditing(false);
              }}
              className="rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {t(COPY.save)}
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(task.prompt);
                setEditing(false);
              }}
              className="rounded border border-input px-3 py-1 text-xs font-medium hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {t(COPY.cancel)}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="whitespace-pre-wrap rounded bg-muted/50 p-2 text-sm text-foreground">
            {task.prompt || "—"}
          </p>
          {editable ? (
            <button
              type="button"
              onClick={() => {
                setDraft(task.prompt);
                setEditing(true);
              }}
              className="inline-flex items-center gap-1 rounded border border-input px-2 py-1 text-xs font-medium hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <Wand2 aria-hidden="true" className="h-3.5 w-3.5" />
              {t(COPY.edit)}
            </button>
          ) : null}
          {isStale ? (
            <p className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" />
              {t(COPY.staleNotice)}
            </p>
          ) : null}
        </div>
      )}

      {task.promptEditHistory.length > 0 ? (
        <details className="rounded border border-border/60 p-2 text-xs">
          <summary className="flex cursor-pointer items-center gap-1 font-medium">
            <History aria-hidden="true" className="h-3.5 w-3.5" />
            {t(COPY.editHistory)} ({task.promptEditHistory.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {task.promptEditHistory.map((edit, i) => (
              <li key={i} className="rounded bg-muted/40 p-2">
                <div className="text-muted-foreground">
                  #{edit.editedByUserId} · {new Date(edit.editedAt).toLocaleString()}
                </div>
                <div className="mt-1">
                  <span className="font-medium">{t(COPY.originalPrompt)}: </span>
                  <span className="whitespace-pre-wrap">{edit.original}</span>
                </div>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Image-side prompts (read-only, separated from the video prompt).           */
/* -------------------------------------------------------------------------- */

function ImagePromptBlock({ lineage, lang }: { lineage?: PanelImagePromptLineage; lang: PanelLang }) {
  const t = useT(lang);
  if (!lineage) return null;
  return (
    <div className="space-y-2 rounded border border-dashed border-border/70 p-2">
      <SectionHeading icon={ImageIcon}>{t(COPY.imagePrompts)}</SectionHeading>
      {lineage.contactSheetPrompt ? (
        <p className="text-sm">
          <span className="font-medium text-muted-foreground">{t(COPY.contactSheetPrompt)}: </span>
          {lineage.contactSheetPrompt}
        </p>
      ) : null}
      {lineage.cellPrompts && lineage.cellPrompts.length > 0 ? (
        <div className="text-sm">
          <span className="font-medium text-muted-foreground">{t(COPY.cellPrompts)}:</span>
          <ol className="ml-4 list-decimal space-y-0.5">
            {lineage.cellPrompts.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ol>
        </div>
      ) : null}
      {lineage.negativePrompt ? (
        <p className="text-sm">
          <span className="font-medium text-muted-foreground">{t(COPY.negativePrompt)}: </span>
          {lineage.negativePrompt}
        </p>
      ) : null}
      <div className="text-xs text-muted-foreground">
        <span className="font-medium">{t(COPY.candidateLineage)}: </span>
        {lineage.selectedStartFrameCandidateId ?? "—"}
        {lineage.promptSetId ? ` · ${t(COPY.promptSet)}: ${lineage.promptSetId}` : ""}
        {lineage.candidateFrameAssetIds.length
          ? ` · ${lineage.candidateFrameAssetIds.length} candidate(s)`
          : ""}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Main panel.                                                                */
/* -------------------------------------------------------------------------- */

export function VerticalDramaStoryboardReviewPanel({
  metadata,
  lang = "en",
  isLoading,
  error,
  completed,
  routes,
  onEditVideoPrompt,
  onRepair,
  className,
}: VerticalDramaStoryboardReviewPanelProps) {
  const t = useT(lang);

  const subShotByParent = useMemo(() => {
    const map = new Map<number, PanelSubShotBreakdown>();
    for (const entry of metadata?.subShotBreakdownByShot ?? []) {
      map.set(entry.parentShotNumber, entry);
    }
    return map;
  }, [metadata]);

  if (isLoading) {
    return (
      <div className={cn("p-4 text-sm text-muted-foreground", className)} role="status" aria-live="polite">
        {t(COPY.loading)}
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("space-y-1 p-4", className)} role="alert">
        <SectionHeading icon={AlertTriangle}>{t(COPY.errorTitle)}</SectionHeading>
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (!metadata || metadata.source !== "vertical_drama_series") {
    return (
      <div className={cn("space-y-1 rounded border border-amber-400/60 bg-amber-50/40 p-4 dark:bg-amber-950/20", className)} role="status">
        <SectionHeading icon={AlertTriangle}>{t(COPY.emptyTitle)}</SectionHeading>
        <p className="text-sm text-muted-foreground">{t(COPY.emptyBody)}</p>
      </div>
    );
  }

  const seriesLabel = metadata.seriesTitle ?? `${t(COPY.crumbSeries)} ${metadata.seriesId}`;
  const episodeLabel = `${t(COPY.crumbEpisode)} ${metadata.episodeNumber}`;

  return (
    <section className={cn("space-y-6", className)} aria-label={t(COPY.panelTitle)}>
      {/* Breadcrumb + back link */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav aria-label="Series › Episode › Storyboard Review" className="flex items-center text-sm text-muted-foreground">
          <ol className="flex flex-wrap items-center gap-1">
            <li className="flex items-center gap-1">
              {routes ? (
                <a
                  href={routes.seriesDetail(metadata.seriesId)}
                  className="rounded px-1 font-medium text-foreground/80 underline-offset-2 hover:text-foreground hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  {seriesLabel}
                </a>
              ) : (
                <span className="px-1 font-medium">{seriesLabel}</span>
              )}
              <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 opacity-60" />
            </li>
            <li className="flex items-center gap-1">
              {routes ? (
                <a
                  href={routes.episode(metadata.seriesId, metadata.episodeId)}
                  className="rounded px-1 font-medium text-foreground/80 underline-offset-2 hover:text-foreground hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  {episodeLabel}
                </a>
              ) : (
                <span className="px-1 font-medium">{episodeLabel}</span>
              )}
              <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 opacity-60" />
            </li>
            <li>
              <span aria-current="page" className="px-1 font-semibold text-foreground">
                {t(COPY.crumbReview)}
              </span>
            </li>
          </ol>
        </nav>
        {routes ? (
          <a
            href={routes.episode(metadata.seriesId, metadata.episodeId)}
            className="rounded px-2 py-1 text-sm font-medium text-foreground/80 underline-offset-2 hover:text-foreground hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            ← {t(COPY.back)}
          </a>
        ) : null}
      </div>

      {/* Episode summary */}
      <div className="space-y-2 rounded border border-border p-3">
        <SectionHeading icon={Layers}>{t(COPY.episodeSummary)}</SectionHeading>
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-muted-foreground">{t(COPY.motionMode)}</dt>
            <dd className="text-sm">{t(MOTION_MODE_LABEL[metadata.motionMode])}</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <Mic aria-hidden="true" className="h-3 w-3" /> {t(COPY.voiceCasting)}
            </dt>
            <dd className="break-words text-sm">{summarizeUnknown(metadata.voiceCasting, t(COPY.none))}</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <Captions aria-hidden="true" className="h-3 w-3" /> {t(COPY.subtitleSafeArea)}
            </dt>
            <dd className="break-words text-sm">{summarizeUnknown(metadata.subtitleSafeArea, t(COPY.none))}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">{t(COPY.audioStrategy)}</dt>
            <dd className="text-sm">{metadata.audioStrategy ?? t(COPY.none)}</dd>
          </div>
        </dl>
        {metadata.continuityWarnings.length > 0 ? (
          <div className="rounded bg-amber-50 p-2 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
            <span className="font-medium">{t(COPY.continuityWarnings)}: </span>
            {metadata.continuityWarnings.join("; ")}
          </div>
        ) : null}
      </div>

      {/* Provider payload preview (formatted, collapsible — never raw JSON blob) */}
      <details className="rounded border border-border p-3">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
          <Film aria-hidden="true" className="h-4 w-4 opacity-70" />
          {t(COPY.payloadPreview)}
        </summary>
        <div className="mt-2">
          <KeyValueRows data={metadata.providerPayloadPreview} />
        </div>
      </details>

      {/* Per-task detail */}
      <div className="space-y-4">
        {metadata.tasks.map((task) => {
          const shotNumber = task.extraParams.parentShotNumber ?? task.extraParams.shotNumber;
          const subGroup = subShotByParent.get(shotNumber);
          const isSubShot = task.extraParams.subShotNumber != null;
          const heading = isSubShot
            ? `${t(COPY.shot)} ${shotNumber} · ${t(COPY.subShot)} ${task.extraParams.subShotNumber}/${task.extraParams.subShotCount ?? "?"}`
            : `${t(COPY.shot)} ${shotNumber}${task.extraParams.clipNumber ? ` · ${t(COPY.clip)} ${task.extraParams.clipNumber}` : ""}`;
          return (
            <article key={task.id} className="space-y-3 rounded border border-border p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-bold text-foreground">{heading}</h2>
                <div className="text-xs text-muted-foreground">
                  {t(COPY.duration)}: {task.durationSeconds}s · {t(COPY.frameRoles)}:{" "}
                  {task.storyboardContext.referenceFrameRoles.join(", ") || "—"}
                </div>
              </div>

              {/* Character / product refs (kept separate from scene frames) */}
              {(task.extraParams.characterReferenceAssetIds?.length ||
                task.extraParams.productReferenceAssetIds?.length) ? (
                <div className="text-xs text-muted-foreground">
                  {task.extraParams.characterReferenceAssetIds?.length ? (
                    <span className="mr-3">
                      {t(COPY.characterRefs)}: {task.extraParams.characterReferenceAssetIds.length}
                    </span>
                  ) : null}
                  {task.extraParams.productReferenceAssetIds?.length ? (
                    <span>
                      {t(COPY.productRefs)}: {task.extraParams.productReferenceAssetIds.length}
                    </span>
                  ) : null}
                </div>
              ) : null}

              {/* Image-side prompts (read-only, separated) */}
              <ImagePromptBlock lineage={task.storyboardContext.imagePrompts} lang={lang} />

              {/* Editable video/motion prompt + append-only history */}
              <VideoPromptControl task={task} lang={lang} completed={completed} onEdit={onEditVideoPrompt} />

              {/* Sub-shot breakdown grouped under this parent shot */}
              {!isSubShot && subGroup ? (
                <div className="space-y-2 rounded bg-muted/30 p-2">
                  <SectionHeading icon={Layers}>
                    {t(COPY.subShotBreakdown)} ({subGroup.subShotCount})
                  </SectionHeading>
                  <ol className="space-y-2">
                    {subGroup.subShots.map((sub) => (
                      <li key={sub.subShotNumber} className="rounded border border-border/60 p-2 text-sm">
                        <div className="font-medium">
                          {t(COPY.subShot)} {sub.subShotNumber} · {t(COPY.duration)}: {sub.durationSeconds}s ·{" "}
                          {t(COPY.transition)}: {sub.transitionIn}
                        </div>
                        {sub.cameraSetup ? (
                          <div className="text-xs text-muted-foreground">
                            {t(COPY.cameraSetup)}: {sub.cameraSetup}
                          </div>
                        ) : null}
                        <div className="mt-1 whitespace-pre-wrap">{sub.prompt}</div>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      {/* Repair queue — clickable, prefilled */}
      <div className="space-y-2 rounded border border-border p-3">
        <SectionHeading icon={Wrench}>{t(COPY.repairQueue)}</SectionHeading>
        {metadata.qcRecommendedRepairs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t(COPY.none)}</p>
        ) : (
          <ul className="space-y-2">
            {metadata.qcRecommendedRepairs.map((repair, i) => {
              const target =
                repair.shotNumber != null
                  ? `${t(COPY.shot)} ${repair.shotNumber}`
                  : repair.clipNumber != null
                    ? `${t(COPY.clip)} ${repair.clipNumber}`
                    : repair.artifactId ?? "—";
              return (
                <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded bg-muted/40 p-2">
                  <div className="text-sm">
                    <span className="font-medium">{repair.action}</span> — {repair.instruction}
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({t(COPY.target)}: {target})
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={!onRepair}
                    onClick={() => onRepair?.(repair)}
                    aria-label={`${t(COPY.repair)}: ${repair.action} — ${target}`}
                    className="inline-flex items-center gap-1 rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
                  >
                    <Wrench aria-hidden="true" className="h-3.5 w-3.5" />
                    {t(COPY.repair)}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

export default VerticalDramaStoryboardReviewPanel;
