/**
 * Video Studio workspace stage rail (Feature 133, section-08 §10.2).
 * A horizontal step-nav: Brief -> Scenes -> Narration -> Motion -> Captions
 * -> QA -> Render. Every stage stays clickable/visible at all times (Guided
 * mode still needs unwired stages visible per the task's authoritative
 * instructions) — this component never hides a stage, it only marks the
 * current one.
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
import { pickCopy, videoStudioCopy, type VideoStudioLang } from "./videoStudioCopy";

export const VIDEO_STUDIO_STAGES = [
  "brief",
  "scenes",
  "narration",
  "motion",
  "captions",
  "qa",
  "render",
] as const;

export type VideoStudioStage = (typeof VIDEO_STUDIO_STAGES)[number];

const STAGE_LABEL_KEY: Record<VideoStudioStage, keyof typeof videoStudioCopy> = {
  brief: "stageBrief",
  scenes: "stageScenes",
  narration: "stageNarration",
  motion: "stageMotion",
  captions: "stageCaptions",
  qa: "stageQa",
  render: "stageRender",
};

export function StageRail({
  lang,
  active,
  onSelect,
}: {
  lang: VideoStudioLang;
  active: VideoStudioStage;
  onSelect: (stage: VideoStudioStage) => void;
}) {
  return (
    <nav
      aria-label={pickCopy(lang, { th: "ขั้นตอนโปรเจกต์", en: "Project stages" })}
      data-testid="video-studio-stage-rail"
      className="flex flex-wrap gap-1.5 rounded-lg border border-border/60 bg-muted/30 p-2"
    >
      {VIDEO_STUDIO_STAGES.map((stage) => {
        const isActive = stage === active;
        return (
          <Button
            key={stage}
            type="button"
            size="sm"
            variant={isActive ? "primary" : "secondary"}
            data-testid={`video-studio-stage-${stage}`}
            aria-current={isActive ? "step" : undefined}
            label={pickCopy(lang, videoStudioCopy[STAGE_LABEL_KEY[stage]])}
            onClick={() => onSelect(stage)}
          />
        );
      })}
    </nav>
  );
}
