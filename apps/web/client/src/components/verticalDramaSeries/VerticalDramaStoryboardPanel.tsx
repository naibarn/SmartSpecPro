/**
 * VerticalDramaStoryboardPanel (spec feature 131, section-01/section-06).
 *
 * Rich storyboard-list view of the `storyboard_shotgrid` stage's real,
 * LLM-generated 9-shot storyboard (`episode.storyboard`), joined by shot
 * number against `startFramePlan` (start-frame image + prompt) and
 * `motionPromptPack` (video-generation prompt per clip) — matches the
 * Storyboard Review page's per-shot card treatment (image, editable prompt,
 * repair/regenerate action) so the user sees this the moment
 * `storyboard_shotgrid` succeeds, without waiting for the rest of the
 * pipeline (start frames, motion prompts, video render, handoff project
 * creation) to finish. "Change image" opens the caller-provided
 * Media History/Library picker for that specific shot instead of requiring
 * a full regenerate.
 *
 * Covers the State Matrix (loading / empty / error / success) and
 * Accessibility Acceptance: warnings/labels are text-visible (never
 * color-only), the credit-confirm gate is keyboard reachable.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, Clapperboard, Expand, ImageOff, Loader2, Pencil, Sparkles, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ImageLightbox } from "@/components/chat/media/ImageLightbox";
import { splitImage } from "@/lib/imageGridSplitter";
import { getDraggedImageUrl } from "@/components/media/ImageSourcePicker";

type Lang = "th" | "en";
const t = (lang: Lang, th: string, en: string) => (lang === "th" ? th : en);

interface StoryboardShotView {
  shot_number?: number;
  visual_description?: string;
  action?: string;
  camera?: {
    shot_type?: string;
    angle?: string;
    movement?: string;
  };
  characters?: string[];
  required_character_refs?: string[];
  duration_seconds?: number;
}

export interface VerticalDramaStoryboardView {
  storyboard_summary?: {
    episode_title?: string;
    core_emotion?: string;
    visual_promise?: string;
  };
  canonical_style_bible?: {
    overall_style?: string;
  };
  shots?: StoryboardShotView[];
}

export interface VerticalDramaStartFramePlanFrame {
  shotNumber: number;
  imagePrompt: string;
  negativePrompt?: string;
  requiredCharacterRefs?: string[];
  productReferenceAssetIds?: string[];
  approvedMediaAssetId?: string;
}

export interface VerticalDramaStartFramePlanView {
  mode?: string;
  selectedImageModelId?: string;
  frames?: VerticalDramaStartFramePlanFrame[];
}

export interface VerticalDramaMotionPromptClipView {
  clipNumber: number;
  sourceShotNumbers?: number[];
  prompt: string;
  negativeMotionPrompt?: string;
  startFrameAssetId?: string;
  endFrameAssetId?: string;
  durationSeconds?: number;
  parentShotNumber?: number;
  subShotNumber?: number;
}

export interface VerticalDramaMotionPromptPackView {
  selectedVideoModelId?: string;
  motionMode?: string;
  clips?: VerticalDramaMotionPromptClipView[];
}

export type VerticalDramaAssetUrlMap = Record<
  string,
  { url: string; thumbnailUrl: string | null }
>;

export type VerticalDramaCharacterPortraitMap = Record<
  string,
  { characterId: string; name: string; portraitUrl: string | null }
>;

interface VerticalDramaStoryboardPanelProps {
  locale?: Lang;
  storyboard?: VerticalDramaStoryboardView | null;
  startFramePlan?: VerticalDramaStartFramePlanView | null;
  motionPromptPack?: VerticalDramaMotionPromptPackView | null;
  assetUrls?: VerticalDramaAssetUrlMap;
  /** Every series character's current approved portrait, keyed by character
   *  key — joined per-shot against `shot.required_character_refs` so each
   *  shot card shows exactly the character(s) it needs (never all of them),
   *  as the concrete identity-lock reference the generation call will use. */
  characterPortraits?: VerticalDramaCharacterPortraitMap;
  loading?: boolean;
  error?: string | null;
  /** True while the real-generation mutation is in flight. */
  generating?: boolean;
  /** Called only after the user confirms the credit-spend warning. */
  onGenerateReal?: () => void;
  /** Opens the repair dialog for `video_motion_prompt_pack`, prefilled with the current prompt as an editable template. */
  onEditVideoPrompt?: (shotNumber: number, currentPrompt: string) => void;
  /** Opens the Media History/Library picker scoped to this shot's start frame. */
  onChangeStartFrame?: (shotNumber: number) => void;
  /** Opens the Media History/Library picker scoped to a specific character's global portrait (updates that character everywhere, not just this shot). */
  onChangeCharacterReference?: (characterId: string) => void;
  /** Dragging an image (Library/History/grid-cutter tile, same unified drag contract used across the app) directly onto a shot's character chip replaces that character's reference image immediately — no need to open the swap panel first. */
  onDropCharacterReference?: (characterId: string, url: string) => void;
  /** Dragging an image directly onto a shot's start-frame slot replaces it immediately, same as `onDropCharacterReference`. */
  onDropStartFrame?: (shotNumber: number, url: string) => void;
  /** Runs `start_frame_render_plan` for real (mode "full", spends credits) — generates every shot's image prompt at once. Shown only while no plan exists yet. */
  onGenerateStartFramePlan?: () => void;
  generatingStartFramePlan?: boolean;
  /** Opens the repair dialog for `start_frame_render_plan`, prefilled with the current image prompt as an editable template. */
  onEditStartFramePrompt?: (shotNumber: number, currentPrompt: string) => void;
  /** Renders a real AI image for this shot from its approved prompt (spends credits). */
  onGenerateStartFrameImage?: (shotNumber: number) => void;
  /** Shot number currently rendering, if any. */
  generatingStartFrameImageForShot?: number | null;
  /** Submits a 3x3 multi-angle-variations grid render for this shot; resolves to a 9-candidate picker (see `onPickAngleVariationCandidate`). */
  onGenerateAngleVariations?: (shotNumber: number) => void;
  generatingAngleVariationsForShot?: number | null;
  /** The completed grid image URL to split into 9 candidates client-side, keyed by shot number — cleared once the user picks or dismisses. */
  angleVariationGridUrlByShot?: Record<number, string>;
  /** User picked one of the 9 split candidates (as a data URL) for this shot. */
  onPickAngleVariationCandidate?: (shotNumber: number, candidateDataUrl: string) => void;
  onDismissAngleVariations?: (shotNumber: number) => void;
  className?: string;
}

export function VerticalDramaStoryboardPanel({
  locale = "th",
  storyboard,
  startFramePlan,
  motionPromptPack,
  assetUrls = {},
  characterPortraits = {},
  loading = false,
  error = null,
  generating = false,
  onGenerateReal,
  onEditVideoPrompt,
  onChangeStartFrame,
  onChangeCharacterReference,
  onDropCharacterReference,
  onDropStartFrame,
  onGenerateStartFramePlan,
  generatingStartFramePlan = false,
  onEditStartFramePrompt,
  onGenerateStartFrameImage,
  generatingStartFrameImageForShot = null,
  onGenerateAngleVariations,
  generatingAngleVariationsForShot = null,
  angleVariationGridUrlByShot = {},
  onPickAngleVariationCandidate,
  onDismissAngleVariations,
  className,
}: VerticalDramaStoryboardPanelProps) {
  const [confirming, setConfirming] = useState(false);
  const [confirmingStartFramePlan, setConfirmingStartFramePlan] = useState(false);
  const [confirmingImageForShot, setConfirmingImageForShot] = useState<number | null>(null);
  const [confirmingAngleVariationsForShot, setConfirmingAngleVariationsForShot] = useState<number | null>(null);
  const [lightboxShot, setLightboxShot] = useState<number | null>(null);
  const [angleCandidatesByShot, setAngleCandidatesByShot] = useState<Record<number, string[]>>({});
  const [splittingShot, setSplittingShot] = useState<number | null>(null);

  // Split a completed multi-angle grid image into 9 candidates client-side
  // (reuses the same `imageGridSplitter` tool the character-reference
  // grid-cutter already uses) as soon as its URL shows up.
  useEffect(() => {
    for (const [shotKey, gridUrl] of Object.entries(angleVariationGridUrlByShot)) {
      const shotNumber = Number(shotKey);
      if (angleCandidatesByShot[shotNumber] || splittingShot === shotNumber) continue;
      setSplittingShot(shotNumber);
      splitImage(gridUrl, 3, 3, "image/jpeg", 0.92)
        .then(results => {
          setAngleCandidatesByShot(prev => ({
            ...prev,
            [shotNumber]: results.map(r => r.dataUrl),
          }));
        })
        .catch(() => {
          setAngleCandidatesByShot(prev => ({ ...prev, [shotNumber]: [] }));
        })
        .finally(() => setSplittingShot(null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [angleVariationGridUrlByShot]);

  if (loading) {
    return (
      <section
        aria-label="Storyboard"
        aria-busy="true"
        className={cn(
          "rounded-lg border border-border p-4 text-sm text-muted-foreground",
          className
        )}
      >
        <p>{t(locale, "กำลังโหลดสตอรีบอร์ด…", "Loading storyboard…")}</p>
      </section>
    );
  }

  if (error) {
    return (
      <section
        aria-label="Storyboard"
        className={cn(
          "rounded-lg border border-destructive/50 p-4 text-sm",
          className
        )}
      >
        <p className="flex items-center gap-2 font-medium text-destructive">
          <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span>{t(locale, "สตอรีบอร์ดผิดพลาด: ", "Storyboard error: ")}{error}</span>
        </p>
      </section>
    );
  }

  const shots = storyboard?.shots ?? [];

  if (shots.length === 0) {
    return (
      <section
        aria-label="Storyboard"
        className={cn(
          "rounded-lg border border-dashed border-border p-4 text-sm",
          className
        )}
      >
        <p className="text-muted-foreground">
          {storyboard
            ? t(locale, "สตอรีบอร์ดยังไม่มี shot (dry-run placeholder)", "Storyboard has no shots yet (dry-run placeholder).")
            : t(locale, "ยังไม่มีสตอรีบอร์ด", "No storyboard yet.")}
        </p>
        {onGenerateReal && (
          <div className="mt-3 flex flex-col items-start gap-2">
            {confirming ? (
              <div className="rounded-md border border-amber-400/50 bg-amber-50 p-3 dark:bg-amber-950/30">
                <p className="font-medium">
                  {t(locale, "การทำงานนี้ใช้ AI จริงและใช้เครดิต", "This uses real AI generation and spends credits.")}
                </p>
                <p className="text-muted-foreground">
                  {t(
                    locale,
                    "ดำเนินการต่อเฉพาะเมื่อต้องการสตอรีบอร์ด 9 ช็อตจริง ไม่ใช่ placeholder ฟรี",
                    "Continue only if you want the actual 9-shot storyboard, not the free placeholder."
                  )}
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    className="rounded-md border border-border px-3 py-1.5 font-medium hover:bg-muted"
                    disabled={generating}
                  >
                    {t(locale, "ยกเลิก", "Cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirming(false);
                      onGenerateReal();
                    }}
                    className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                    disabled={generating}
                    data-testid="vd-storyboard-confirm-generate"
                  >
                    {generating ? (
                      <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
                    )}
                    {t(locale, "สร้างสตอรีบอร์ดจริง", "Generate real storyboard")}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                disabled={generating}
                className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 font-medium hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
                data-testid="vd-storyboard-generate-real"
              >
                {generating ? (
                  <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
                )}
                {t(locale, "สร้างสตอรีบอร์ดจริง", "Generate real storyboard")}
              </button>
            )}
          </div>
        )}
      </section>
    );
  }

  const summary = storyboard?.storyboard_summary;
  const frameByShot = new Map<number, VerticalDramaStartFramePlanFrame>();
  for (const frame of startFramePlan?.frames ?? []) {
    if (typeof frame?.shotNumber === "number") frameByShot.set(frame.shotNumber, frame);
  }
  const clipByShot = new Map<number, VerticalDramaMotionPromptClipView>();
  for (const clip of motionPromptPack?.clips ?? []) {
    const shotNumbers =
      clip.sourceShotNumbers && clip.sourceShotNumbers.length > 0
        ? clip.sourceShotNumbers
        : clip.parentShotNumber != null
          ? [clip.parentShotNumber]
          : [];
    for (const shotNumber of shotNumbers) {
      if (!clipByShot.has(shotNumber)) clipByShot.set(shotNumber, clip);
    }
  }

  return (
    <section
      aria-label="Storyboard"
      className={cn("flex flex-col gap-4 rounded-lg border border-border p-4 text-sm", className)}
    >
      <header className="flex flex-col gap-1">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Clapperboard aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span>{t(locale, `สตอรีบอร์ด — ${shots.length} ช็อต`, `Storyboard — ${shots.length} shots`)}</span>
        </h3>
        {summary?.core_emotion || summary?.visual_promise ? (
          <p className="text-muted-foreground">
            {summary?.core_emotion ? (
              <>
                <span className="font-medium text-foreground">
                  {t(locale, "อารมณ์หลัก: ", "Core emotion: ")}
                </span>
                {summary.core_emotion}
                {summary?.visual_promise ? " — " : ""}
              </>
            ) : null}
            {summary?.visual_promise}
          </p>
        ) : null}
        {storyboard?.canonical_style_bible?.overall_style ? (
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">{t(locale, "สไตล์: ", "Style: ")}</span>
            {storyboard.canonical_style_bible.overall_style}
          </p>
        ) : null}
      </header>

      {!startFramePlan?.frames?.length && onGenerateStartFramePlan ? (
        <div>
          {confirmingStartFramePlan ? (
            <div className="rounded-md border border-amber-400/50 bg-amber-50 p-3 dark:bg-amber-950/30">
              <p className="font-medium">
                {t(locale, "การทำงานนี้ใช้ AI จริงและใช้เครดิต", "This uses real AI generation and spends credits.")}
              </p>
              <p className="text-muted-foreground">
                {t(
                  locale,
                  "ดำเนินการต่อเฉพาะเมื่อต้องการ prompt ภาพเริ่มต้นจริงของทุกช็อต",
                  "Continue only if you want real start-frame image prompts for every shot."
                )}
              </p>
              <div className="mt-2 flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setConfirmingStartFramePlan(false)} disabled={generatingStartFramePlan}>
                  {t(locale, "ยกเลิก", "Cancel")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setConfirmingStartFramePlan(false);
                    onGenerateStartFramePlan();
                  }}
                  disabled={generatingStartFramePlan}
                  data-testid="vd-confirm-generate-start-frame-plan"
                >
                  {generatingStartFramePlan
                    ? t(locale, "กำลังสร้าง…", "Generating…")
                    : t(locale, "สร้าง prompt ภาพเริ่มต้น (มีค่าใช้จ่าย)", "Generate start-frame prompts (paid)")}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setConfirmingStartFramePlan(true)}
              disabled={generatingStartFramePlan}
              data-testid="vd-generate-start-frame-plan"
            >
              {generatingStartFramePlan
                ? t(locale, "กำลังสร้าง…", "Generating…")
                : t(locale, "สร้าง prompt ภาพเริ่มต้น (มีค่าใช้จ่าย)", "Generate start-frame prompts (paid)")}
            </Button>
          )}
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        {shots.map((shot, i) => {
          const shotNumber = shot.shot_number ?? i + 1;
          const frame = frameByShot.get(shotNumber);
          const clip = clipByShot.get(shotNumber);
          const assetId = frame?.approvedMediaAssetId;
          const asset = assetId ? assetUrls[assetId] : undefined;

          return (
            <div
              key={shotNumber}
              className="flex flex-col gap-3 rounded-md border border-border p-3"
              data-testid={`vd-storyboard-shot-${shotNumber}`}
            >
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="flex w-full shrink-0 flex-col gap-2 sm:w-40">
                <div
                  className={cn(
                    "relative aspect-[9/16] w-full overflow-hidden rounded-md border border-border bg-muted",
                    (asset?.thumbnailUrl || asset?.url) && "cursor-zoom-in"
                  )}
                  onClick={() => {
                    if (asset?.url) setLightboxShot(shotNumber);
                  }}
                  role={asset?.url ? "button" : undefined}
                  tabIndex={asset?.url ? 0 : undefined}
                  onKeyDown={e => {
                    if (asset?.url && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      setLightboxShot(shotNumber);
                    }
                  }}
                  onDragOver={e => {
                    if (onDropStartFrame) e.preventDefault();
                  }}
                  onDrop={e => {
                    if (!onDropStartFrame) return;
                    e.preventDefault();
                    const url = getDraggedImageUrl(e.dataTransfer);
                    if (url) onDropStartFrame(shotNumber, url);
                  }}
                >
                  {asset?.thumbnailUrl || asset?.url ? (
                    <>
                      <img
                        src={asset.thumbnailUrl ?? asset.url}
                        alt={t(locale, `เฟรมเริ่มต้น ช็อต ${shotNumber}`, `Start frame, shot ${shotNumber}`)}
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute bottom-1 right-1 rounded bg-black/50 p-1">
                        <Expand aria-hidden="true" className="h-3 w-3 text-white" />
                      </div>
                    </>
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
                      <ImageOff aria-hidden="true" className="h-5 w-5" />
                      <span className="px-1 text-center text-[11px]">
                        {t(locale, "ยังไม่มีภาพ", "No image yet")}
                      </span>
                    </div>
                  )}
                </div>
                {onChangeStartFrame ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="w-full text-xs"
                    onClick={() => onChangeStartFrame(shotNumber)}
                    data-testid={`vd-storyboard-change-image-${shotNumber}`}
                  >
                    {t(locale, "เปลี่ยนภาพ", "Change image")}
                  </Button>
                ) : null}
                {onGenerateStartFrameImage && frame?.imagePrompt ? (
                  confirmingImageForShot === shotNumber ? (
                    <div className="rounded-md border border-amber-400/50 bg-amber-50 p-2 text-[11px] dark:bg-amber-950/30">
                      <p className="font-medium">
                        {t(locale, "ใช้ AI จริง มีค่าใช้จ่าย", "Uses real AI, spends credits.")}
                      </p>
                      <div className="mt-1.5 flex gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[11px]"
                          onClick={() => setConfirmingImageForShot(null)}
                          disabled={generatingStartFrameImageForShot === shotNumber}
                        >
                          {t(locale, "ยกเลิก", "Cancel")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="h-6 px-2 text-[11px]"
                          onClick={() => {
                            setConfirmingImageForShot(null);
                            onGenerateStartFrameImage(shotNumber);
                          }}
                          disabled={generatingStartFrameImageForShot === shotNumber}
                          data-testid={`vd-confirm-generate-image-${shotNumber}`}
                        >
                          {generatingStartFrameImageForShot === shotNumber ? (
                            <>
                              <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
                              {t(locale, "กำลังสร้าง…", "Generating…")}
                            </>
                          ) : (
                            t(locale, "ยืนยัน", "Confirm")
                          )}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="w-full gap-1 text-xs"
                      onClick={() => setConfirmingImageForShot(shotNumber)}
                      disabled={generatingStartFrameImageForShot === shotNumber}
                      data-testid={`vd-generate-image-${shotNumber}`}
                    >
                      {generatingStartFrameImageForShot === shotNumber ? (
                        <>
                          <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
                          {t(locale, "กำลังสร้าง…", "Generating…")}
                        </>
                      ) : (
                        <>
                          <Sparkles aria-hidden="true" className="h-3 w-3" />
                          {t(locale, "สร้างภาพ (AI)", "Generate image (AI)")}
                        </>
                      )}
                    </Button>
                  )
                ) : null}
                {onGenerateAngleVariations && frame?.imagePrompt ? (
                  confirmingAngleVariationsForShot === shotNumber ? (
                    <div className="rounded-md border border-amber-400/50 bg-amber-50 p-2 text-[11px] dark:bg-amber-950/30">
                      <p className="font-medium">
                        {t(
                          locale,
                          "สร้างภาพเดียว 9 มุมกล้อง ใช้ AI จริง มีค่าใช้จ่ายสูงกว่าปกติ",
                          "One image with 9 camera angles — uses real AI, costs more than a single render."
                        )}
                      </p>
                      <div className="mt-1.5 flex gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[11px]"
                          onClick={() => setConfirmingAngleVariationsForShot(null)}
                          disabled={generatingAngleVariationsForShot === shotNumber}
                        >
                          {t(locale, "ยกเลิก", "Cancel")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="h-6 px-2 text-[11px]"
                          onClick={() => {
                            setConfirmingAngleVariationsForShot(null);
                            onGenerateAngleVariations(shotNumber);
                          }}
                          disabled={generatingAngleVariationsForShot === shotNumber}
                          data-testid={`vd-confirm-generate-angles-${shotNumber}`}
                        >
                          {generatingAngleVariationsForShot === shotNumber
                            ? t(locale, "กำลังสร้าง…", "Generating…")
                            : t(locale, "ยืนยัน", "Confirm")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="w-full gap-1 text-xs"
                      onClick={() => setConfirmingAngleVariationsForShot(shotNumber)}
                      disabled={
                        generatingAngleVariationsForShot === shotNumber || splittingShot === shotNumber
                      }
                      data-testid={`vd-generate-angles-${shotNumber}`}
                    >
                      <Sparkles aria-hidden="true" className="h-3 w-3" />
                      {generatingAngleVariationsForShot === shotNumber
                        ? t(locale, "กำลังสร้าง…", "Generating…")
                        : splittingShot === shotNumber
                          ? t(locale, "กำลังตัดภาพ…", "Splitting…")
                          : t(locale, "สร้างหลายมุมกล้อง (3x3)", "Generate multi-angle (3x3)")}
                    </Button>
                  )
                ) : null}
              </div>

              <div className="flex flex-1 flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {t(locale, `ช็อต ${shotNumber}`, `Shot ${shotNumber}`)}
                  </span>
                  {shot.duration_seconds ? (
                    <span className="text-xs text-muted-foreground">{shot.duration_seconds}s</span>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  {shot.visual_description || shot.action || "—"}
                </p>
                {shot.camera?.shot_type ? (
                  <p className="text-xs text-muted-foreground">
                    {[shot.camera.shot_type, shot.camera.angle, shot.camera.movement]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                ) : null}
                {(() => {
                  // `required_character_refs` is the identity-lock key list
                  // generation actually uses — prefer it over `characters`
                  // (a looser display list) so what's shown here always
                  // matches what the render call will reference. Only the
                  // character(s) THIS shot needs, never the full roster.
                  const keys =
                    shot.required_character_refs?.length
                      ? shot.required_character_refs
                      : shot.characters ?? [];
                  if (keys.length === 0) return null;
                  return (
                    <div className="flex flex-wrap items-center gap-2">
                      <Users aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
                      {keys.map(key => {
                        const portrait = characterPortraits[key];
                        return (
                          <button
                            key={key}
                            type="button"
                            className="group flex items-center gap-1.5 rounded-full border border-border bg-muted/40 py-0.5 pl-0.5 pr-2 text-xs hover:bg-muted disabled:cursor-default disabled:opacity-100 data-[dragover=true]:ring-2 data-[dragover=true]:ring-primary"
                            onClick={() =>
                              portrait?.characterId &&
                              onChangeCharacterReference?.(portrait.characterId)
                            }
                            disabled={!portrait || !onChangeCharacterReference}
                            title={
                              onChangeCharacterReference
                                ? t(locale, "เปลี่ยนภาพอ้างอิงตัวละครนี้ (หรือลากภาพมาวางที่นี่)", "Change this character's reference image (or drop an image here)")
                                : undefined
                            }
                            onDragOver={e => {
                              if (portrait?.characterId && onDropCharacterReference) e.preventDefault();
                            }}
                            onDrop={e => {
                              if (!portrait?.characterId || !onDropCharacterReference) return;
                              e.preventDefault();
                              const url = getDraggedImageUrl(e.dataTransfer);
                              if (url) onDropCharacterReference(portrait.characterId, url);
                            }}
                            data-testid={`vd-storyboard-character-chip-${shotNumber}-${key}`}
                          >
                            {portrait?.portraitUrl ? (
                              <img
                                src={portrait.portraitUrl}
                                alt={portrait.name}
                                className="h-5 w-5 rounded-full object-cover"
                              />
                            ) : (
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[9px] text-muted-foreground">
                                ?
                              </span>
                            )}
                            <span>{portrait?.name ?? key}</span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}

                {frame || onEditStartFramePrompt ? (
                  <div className="mt-1 flex flex-col gap-1 rounded-md bg-muted/50 p-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-foreground">
                        {t(locale, "พรอมต์ภาพเริ่มต้น", "Start-frame image prompt")}
                      </span>
                      {onEditStartFramePrompt ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-6 gap-1 px-2 text-xs"
                          onClick={() => onEditStartFramePrompt(shotNumber, frame?.imagePrompt ?? "")}
                          data-testid={`vd-storyboard-edit-image-prompt-${shotNumber}`}
                        >
                          <Pencil aria-hidden="true" className="h-3 w-3" />
                          {t(locale, "แก้ไข", "Edit")}
                        </Button>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {frame?.imagePrompt || t(locale, "ยังไม่มีพรอมต์ภาพ", "No image prompt yet.")}
                    </p>
                  </div>
                ) : null}

                <div className="mt-1 flex flex-col gap-1 rounded-md bg-muted/50 p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-foreground">
                      {t(locale, "พรอมต์วิดีโอ", "Video prompt")}
                    </span>
                    {onEditVideoPrompt ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-6 gap-1 px-2 text-xs"
                        onClick={() => onEditVideoPrompt(shotNumber, clip?.prompt ?? "")}
                        data-testid={`vd-storyboard-edit-prompt-${shotNumber}`}
                      >
                        <Pencil aria-hidden="true" className="h-3 w-3" />
                        {t(locale, "แก้ไข", "Edit")}
                      </Button>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {clip?.prompt || t(locale, "ยังไม่มีพรอมต์วิดีโอ", "No video prompt yet.")}
                  </p>
                </div>
              </div>
            </div>

              {angleCandidatesByShot[shotNumber] ? (
                <div className="w-full rounded-md border border-border bg-muted/30 p-2">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium">
                      {t(locale, "เลือกมุมกล้องที่ดีที่สุด", "Pick the best angle")}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs"
                      onClick={() => {
                        setAngleCandidatesByShot(prev => {
                          const next = { ...prev };
                          delete next[shotNumber];
                          return next;
                        });
                        onDismissAngleVariations?.(shotNumber);
                      }}
                    >
                      {t(locale, "ปิด", "Dismiss")}
                    </Button>
                  </div>
                  {angleCandidatesByShot[shotNumber].length === 0 ? (
                    <p className="text-xs text-destructive">
                      {t(locale, "ตัดภาพไม่สำเร็จ ลองใหม่อีกครั้ง", "Failed to split the image — try again.")}
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 gap-1.5">
                      {angleCandidatesByShot[shotNumber].map((dataUrl, idx) => (
                        <button
                          key={idx}
                          type="button"
                          className="aspect-[9/16] overflow-hidden rounded border border-border hover:ring-2 hover:ring-primary"
                          onClick={() => {
                            onPickAngleVariationCandidate?.(shotNumber, dataUrl);
                            setAngleCandidatesByShot(prev => {
                              const next = { ...prev };
                              delete next[shotNumber];
                              return next;
                            });
                          }}
                          data-testid={`vd-angle-candidate-${shotNumber}-${idx}`}
                        >
                          <img src={dataUrl} alt={`Angle ${idx + 1}`} className="h-full w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {lightboxShot != null ? (
        <ImageLightbox
          images={(() => {
            const frame = frameByShot.get(lightboxShot);
            const asset = frame?.approvedMediaAssetId ? assetUrls[frame.approvedMediaAssetId] : undefined;
            return asset?.url ? [{ src: asset.url, alt: `Shot ${lightboxShot}` }] : [];
          })()}
          open={lightboxShot != null}
          onClose={() => setLightboxShot(null)}
        />
      ) : null}
    </section>
  );
}

export default VerticalDramaStoryboardPanel;
