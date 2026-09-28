/**
 * Video Studio workspace stage rail (Feature 133, section-08 §10.2).
 * A horizontal step-nav: Brief -> Scenes -> Narration -> Motion -> B-roll
 * -> Captions -> Layout & timeline (Feature 143 §2.1 D1, optional) -> QA -> Render.
 * Every stage stays clickable/visible at all times (Guided
 * mode still needs unwired stages visible per the task's authoritative
 * instructions) — this component never hides a stage, it only marks the
 * current one.
 *
 * `stageState` (this task) is an OPTIONAL per-stage progress indicator — a
 * small dot rendered on each button. This component stays purely
 * presentational: the state map is derived entirely by the caller (see
 * `stageRailState.ts`, called from `VideoStudioWorkspacePage`), never here.
 *
 * NOTE — Astryx exception: this file imports `@astryxdesign/core/*`
 * components directly, which `AppPage.tsx`'s docstring says should never
 * happen outside that one file. This is a deliberate, explicit,
 * twice-confirmed user decision to migrate Video Studio off shadcn/ui onto
 * native Astryx components (see
 * `planning/video-studio-astryx-migration/plan.md`) — not an accidental
 * violation of that rule.
 */
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/Layout";
import type { StageRailStatus } from "./stageRailState";
import {
  pickCopy,
  videoStudioCopy,
  type VideoStudioLang,
} from "./videoStudioCopy";

export const VIDEO_STUDIO_STAGES = [
  "brief",
  "scenes",
  "narration",
  "motion",
  "broll",
  "captions",
  // Feature 143 §2.1 D1 — 8th, explicitly optional stage between captions
  // and QA (the subtitle track is a projection of caption cues, so the
  // timeline is only truthful once captions exist; QA/Render must see its
  // output).
  "compose",
  "qa",
  "render",
] as const;

export type VideoStudioStage = (typeof VIDEO_STUDIO_STAGES)[number];

const STAGE_LABEL_KEY: Record<VideoStudioStage, keyof typeof videoStudioCopy> =
  {
    brief: "stageBrief",
    scenes: "stageScenes",
    narration: "stageNarration",
    motion: "stageMotion",
    broll: "stageBroll",
    captions: "stageCaptions",
    compose: "stageCompose",
    qa: "stageQa",
    render: "stageRender",
  };

const STAGE_STATE_LABEL_KEY: Record<
  StageRailStatus,
  keyof typeof videoStudioCopy
> = {
  empty: "stageStateEmpty",
  drafted: "stageStateDrafted",
  running: "stageStateRunning",
  error: "stageStateError",
  done: "stageStateDone",
};

/** Small colored dot, not a full `Badge` — the rail is meant to stay compact
 *  with 7 stages side by side. Color follows the same semantic mapping the
 *  rest of Video Studio uses for status (error = red, done = green, running
 *  = blue, drafted = amber, empty = neutral gray). */
const STAGE_STATE_DOT_CLASS: Record<StageRailStatus, string> = {
  empty: "bg-muted-foreground/40",
  drafted: "bg-amber-500",
  running: "bg-blue-500 animate-pulse",
  error: "bg-red-500",
  done: "bg-emerald-500",
};

export function StageRail({
  lang,
  active,
  onSelect,
  stageState,
}: {
  lang: VideoStudioLang;
  active: VideoStudioStage;
  onSelect: (stage: VideoStudioStage) => void;
  /** Per-stage progress indicator (this task). Optional — callers that
   *  don't derive it yet still render a plain, dot-less rail. */
  stageState?: Record<VideoStudioStage, StageRailStatus>;
}) {
  return (
    <nav
      aria-label={pickCopy(lang, {
        th: "ขั้นตอนโปรเจกต์",
        en: "Project stages",
      })}
      data-testid="video-studio-stage-rail"
      className="flex flex-wrap gap-1.5 rounded-lg border border-border/60 bg-muted/30 p-2"
    >
      {VIDEO_STUDIO_STAGES.map(stage => {
        const isActive = stage === active;
        const state = stageState?.[stage];
        return (
          <HStack key={stage} gap={1} align="center">
            <Button
              type="button"
              size="sm"
              variant={isActive ? "primary" : "secondary"}
              data-testid={`video-studio-stage-${stage}`}
              aria-current={isActive ? "step" : undefined}
              label={pickCopy(lang, videoStudioCopy[STAGE_LABEL_KEY[stage]])}
              onClick={() => onSelect(stage)}
            />
            {state ? (
              <span
                data-testid="stage-rail-state"
                data-stage={stage}
                data-state={state}
                title={pickCopy(
                  lang,
                  videoStudioCopy[STAGE_STATE_LABEL_KEY[state]]
                )}
                aria-label={pickCopy(
                  lang,
                  videoStudioCopy[STAGE_STATE_LABEL_KEY[state]]
                )}
                className={`inline-block h-2 w-2 rounded-full ${STAGE_STATE_DOT_CLASS[state]}`}
              />
            ) : null}
          </HStack>
        );
      })}
    </nav>
  );
}
