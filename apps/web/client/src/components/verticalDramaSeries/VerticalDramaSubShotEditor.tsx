/**
 * VerticalDramaSubShotEditor (spec feature 131, section-03 + section-04 · §7.4).
 *
 * Flag-gated (`verticalDramaSeriesSubShots`) editor for the video-motion step.
 * Sub-shots subdivide a single main shot's screen time into 2-5 ordered cuts
 * whose durations SUM to the parent main-shot duration — they never change the
 * 9-shot storyboard or the 60-second episode total. The editor is shown BEFORE
 * any paid generation so the user can:
 *   - pick a target sub-shot count per shot (auto aims 2-3, raise up to 4-5,
 *     hard cap 5),
 *   - edit each sub-shot's camera setup, motion prompt, duration, and transition,
 *   - preview the resulting cut sequence.
 *
 * PROGRESSIVE DISCLOSURE: when the `verticalDramaSeriesSubShots` flag is off the
 * component renders nothing (returns null), so behaviour is unchanged.
 *
 * Purely presentational + prop-driven (data + callbacks are injected) so it is
 * testable without a tRPC/react-query provider. Covers the State Matrix
 * (loading / empty / error / success) and Accessibility Acceptance:
 *  - every control is labelled (aria-label / <label>),
 *  - validation + warnings are text-visible (icon + text), never colour-only,
 *  - bilingual (Thai/English) inline copy.
 */

import { AlertTriangle, Clapperboard, Scissors, Film } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  VERTICAL_DRAMA_SUB_SHOT_MAX_PER_SHOT,
  VERTICAL_DRAMA_SUB_SHOT_POLICY_DEFAULT,
  computeAutoSubShotCount,
  validateSubShotsForParent,
  type VerticalDramaSubShot,
  type VerticalDramaSubShotPolicy,
} from "@shared/verticalDramaSeries/subShots";
import { pickCopy, type VerticalDramaLang } from "./verticalDramaCopy";

/** A parent storyboard shot together with its planned sub-shots. */
export interface SubShotEditorParentShot {
  parentShotNumber: number;
  mainShotDurationSeconds: number;
  subShots: VerticalDramaSubShot[];
  /** Currently-selected target sub-shot count (defaults to the auto count). */
  targetSubShotCount?: number;
}

/** Editable fields per sub-shot (spec §7.4 video-motion step). */
export type EditableSubShotField = Pick<
  VerticalDramaSubShot,
  "cameraSetup" | "prompt" | "durationSeconds" | "transitionIn"
>;

export interface VerticalDramaSubShotEditorProps {
  /**
   * Gate: only render when the `verticalDramaSeriesSubShots` flag is on. Callers
   * pass `useTenantFeatureFlag(VERTICAL_DRAMA_SUB_SHOTS_FLAG)`.
   */
  flagEnabled: boolean;
  shots: SubShotEditorParentShot[];
  policy?: VerticalDramaSubShotPolicy;
  loading?: boolean;
  error?: string | null;
  lang?: VerticalDramaLang;
  /** Change the target sub-shot count for a parent shot (auto 2-3 → up to cap 5). */
  onTargetCountChange?: (parentShotNumber: number, count: number) => void;
  /** Patch a single sub-shot field (camera setup / motion prompt / duration / transition). */
  onSubShotChange?: (
    parentShotNumber: number,
    subShotNumber: number,
    patch: Partial<EditableSubShotField>,
  ) => void;
  className?: string;
}

const TRANSITIONS: VerticalDramaSubShot["transitionIn"][] = [
  "cut",
  "match_cut",
  "smash_cut",
  "continuous",
];

const COPY = {
  heading: { th: "ตัวแก้ไขซับช็อต (การตัดภายในช็อต)", en: "Sub-shot editor (intra-shot cuts)" },
  planningNote: {
    th: "โหมดวางแผน — ปรับก่อนการสร้างสื่อที่มีค่าใช้จ่าย",
    en: "Planning mode — adjust before any paid generation",
  },
  loading: { th: "กำลังวางแผนซับช็อต…", en: "Planning sub-shots…" },
  errorPrefix: { th: "แก้ไขซับช็อตผิดพลาด", en: "Sub-shot editor error" },
  empty: {
    th: "ยังไม่มีช็อตให้แบ่งเป็นซับช็อต",
    en: "No shots available to split into sub-shots yet.",
  },
  shot: { th: "ช็อต", en: "Shot" },
  parentDuration: { th: "ความยาวช็อตหลัก", en: "Main-shot duration" },
  targetCount: { th: "จำนวนซับช็อตเป้าหมาย", en: "Target sub-shot count" },
  autoHint: { th: "อัตโนมัติ 2-3 เพิ่มได้ถึง 5", en: "Auto 2-3, raise up to 5" },
  subShot: { th: "ซับช็อต", en: "Sub-shot" },
  camera: { th: "การจัดกล้อง", en: "Camera setup" },
  motion: { th: "คำสั่งการเคลื่อนไหว", en: "Motion prompt" },
  duration: { th: "ความยาว (วินาที)", en: "Duration (seconds)" },
  transition: { th: "การเปลี่ยนภาพ", en: "Transition in" },
  cutSequence: { th: "ลำดับการตัด", en: "Cut sequence" },
  sumOk: { th: "ผลรวมซับช็อตตรงกับช็อตหลัก", en: "Sub-shot durations sum to the main shot" },
} as const;

const TRANSITION_LABEL: Record<VerticalDramaSubShot["transitionIn"], { th: string; en: string }> = {
  cut: { th: "ตัด", en: "Cut" },
  match_cut: { th: "แมตช์คัต", en: "Match cut" },
  smash_cut: { th: "สแมชคัต", en: "Smash cut" },
  continuous: { th: "ต่อเนื่อง", en: "Continuous" },
};

export function VerticalDramaSubShotEditor({
  flagEnabled,
  shots,
  policy = VERTICAL_DRAMA_SUB_SHOT_POLICY_DEFAULT,
  loading = false,
  error = null,
  lang = "en",
  onTargetCountChange,
  onSubShotChange,
  className,
}: VerticalDramaSubShotEditorProps) {
  // Progressive disclosure: nothing renders unless the flag is on.
  if (!flagEnabled) {
    return null;
  }

  const t = (v: { th: string; en: string }) => pickCopy(lang, v);
  const maxPerShot = Math.min(policy.maxPerShot, VERTICAL_DRAMA_SUB_SHOT_MAX_PER_SHOT);

  if (loading) {
    return (
      <section
        aria-label={t(COPY.heading)}
        aria-busy="true"
        className={cn("rounded-lg border border-border p-4 text-sm text-muted-foreground", className)}
      >
        <p>{t(COPY.loading)}</p>
      </section>
    );
  }

  if (error) {
    return (
      <section
        aria-label={t(COPY.heading)}
        className={cn("rounded-lg border border-destructive/50 p-4 text-sm", className)}
      >
        <p className="flex items-center gap-2 font-medium text-destructive">
          <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span>
            {t(COPY.errorPrefix)}: {error}
          </span>
        </p>
      </section>
    );
  }

  if (shots.length === 0) {
    return (
      <section
        aria-label={t(COPY.heading)}
        className={cn("rounded-lg border border-dashed border-border p-4 text-sm", className)}
      >
        <p className="text-muted-foreground">{t(COPY.empty)}</p>
      </section>
    );
  }

  return (
    <section
      aria-label={t(COPY.heading)}
      className={cn("flex flex-col gap-4 rounded-lg border border-border p-4 text-sm", className)}
    >
      <header className="flex flex-col gap-1">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Clapperboard aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span>{t(COPY.heading)}</span>
        </h3>
        <p className="text-muted-foreground">{t(COPY.planningNote)}</p>
      </header>

      <ol className="flex flex-col gap-4">
        {shots.map((shot) => {
          const autoCount = computeAutoSubShotCount(shot.mainShotDurationSeconds, {
            targetPerShot: policy.targetPerShot,
            maxPerShot,
            minSubShotSeconds: policy.minSubShotSeconds,
          });
          const targetCount = shot.targetSubShotCount ?? autoCount;
          const validation = validateSubShotsForParent(
            shot.mainShotDurationSeconds,
            shot.subShots.map((s) => ({
              durationSeconds: s.durationSeconds,
              parentShotNumber: s.parentShotNumber,
            })),
            { maxPerShot, minSubShotSeconds: policy.minSubShotSeconds },
          );
          const countId = `vds-subshot-count-${shot.parentShotNumber}`;

          return (
            <li
              key={shot.parentShotNumber}
              className="flex flex-col gap-3 rounded-md border border-border/70 p-3"
            >
              {/* Parent shot header + target-count selector */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-medium">
                  {t(COPY.shot)} {shot.parentShotNumber}
                  <span className="ml-2 font-normal text-muted-foreground">
                    {t(COPY.parentDuration)}: {shot.mainShotDurationSeconds.toFixed(1)}s
                  </span>
                </h4>
                <div className="flex items-center gap-2">
                  <label htmlFor={countId} className="font-medium">
                    {t(COPY.targetCount)}
                  </label>
                  <select
                    id={countId}
                    value={targetCount}
                    onChange={(e) =>
                      onTargetCountChange?.(shot.parentShotNumber, Number(e.target.value))
                    }
                    className="rounded-md border border-border bg-background px-2 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                    aria-describedby={`${countId}-hint`}
                  >
                    {Array.from({ length: maxPerShot }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <span id={`${countId}-hint`} className="text-xs text-muted-foreground">
                    {t(COPY.autoHint)}
                  </span>
                </div>
              </div>

              {/* Per sub-shot fields */}
              <ol className="flex flex-col gap-3">
                {shot.subShots.map((ss) => {
                  const idBase = `vds-subshot-${shot.parentShotNumber}-${ss.subShotNumber}`;
                  return (
                    <li
                      key={ss.subShotNumber}
                      className="grid grid-cols-1 gap-2 rounded-md bg-muted/40 p-2 sm:grid-cols-2"
                    >
                      <div className="sm:col-span-2 font-medium">
                        {t(COPY.subShot)} {ss.subShotNumber}
                      </div>

                      <div className="flex flex-col gap-1">
                        <label htmlFor={`${idBase}-camera`} className="text-xs font-medium">
                          {t(COPY.camera)}
                        </label>
                        <input
                          id={`${idBase}-camera`}
                          type="text"
                          value={ss.cameraSetup}
                          onChange={(e) =>
                            onSubShotChange?.(shot.parentShotNumber, ss.subShotNumber, {
                              cameraSetup: e.target.value,
                            })
                          }
                          className="rounded-md border border-border bg-background px-2 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <label htmlFor={`${idBase}-duration`} className="text-xs font-medium">
                          {t(COPY.duration)}
                        </label>
                        <input
                          id={`${idBase}-duration`}
                          type="number"
                          min={policy.minSubShotSeconds}
                          step={0.1}
                          value={ss.durationSeconds}
                          onChange={(e) =>
                            onSubShotChange?.(shot.parentShotNumber, ss.subShotNumber, {
                              durationSeconds: Number(e.target.value),
                            })
                          }
                          className="rounded-md border border-border bg-background px-2 py-1 tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                        />
                      </div>

                      <div className="flex flex-col gap-1 sm:col-span-2">
                        <label htmlFor={`${idBase}-motion`} className="text-xs font-medium">
                          {t(COPY.motion)}
                        </label>
                        <textarea
                          id={`${idBase}-motion`}
                          rows={2}
                          value={ss.prompt}
                          onChange={(e) =>
                            onSubShotChange?.(shot.parentShotNumber, ss.subShotNumber, {
                              prompt: e.target.value,
                            })
                          }
                          className="rounded-md border border-border bg-background px-2 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <label htmlFor={`${idBase}-transition`} className="text-xs font-medium">
                          {t(COPY.transition)}
                        </label>
                        <select
                          id={`${idBase}-transition`}
                          value={ss.transitionIn}
                          onChange={(e) =>
                            onSubShotChange?.(shot.parentShotNumber, ss.subShotNumber, {
                              transitionIn: e.target.value as VerticalDramaSubShot["transitionIn"],
                            })
                          }
                          className="rounded-md border border-border bg-background px-2 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                        >
                          {TRANSITIONS.map((tr) => (
                            <option key={tr} value={tr}>
                              {t(TRANSITION_LABEL[tr])}
                            </option>
                          ))}
                        </select>
                      </div>
                    </li>
                  );
                })}
              </ol>

              {/* Cut-sequence preview */}
              <div>
                <h5 className="mb-1 flex items-center gap-2 text-xs font-medium">
                  <Film aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                  <span>{t(COPY.cutSequence)}</span>
                </h5>
                <div className="flex flex-wrap items-center gap-1 text-xs">
                  {shot.subShots.map((ss, idx) => (
                    <span key={ss.subShotNumber} className="flex items-center gap-1">
                      {idx > 0 && (
                        <span className="flex items-center gap-0.5 text-muted-foreground">
                          <Scissors aria-hidden="true" className="h-3 w-3 shrink-0" />
                          {t(TRANSITION_LABEL[ss.transitionIn])}
                        </span>
                      )}
                      <span className="rounded bg-background px-2 py-0.5 tabular-nums">
                        {ss.subShotNumber} · {ss.durationSeconds.toFixed(1)}s
                      </span>
                    </span>
                  ))}
                </div>
              </div>

              {/* Validation (text-visible, not colour-only) */}
              {validation.valid ? (
                <p className="text-xs text-muted-foreground">{t(COPY.sumOk)}</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {validation.errors.map((err, i) => (
                    <li key={`${shot.parentShotNumber}-err-${i}`} className="flex items-start gap-2 text-xs">
                      <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{err}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export default VerticalDramaSubShotEditor;
