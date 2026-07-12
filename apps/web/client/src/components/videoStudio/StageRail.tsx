/**
 * Video Studio workspace stage rail (Feature 133, section-08 §10.2).
 * A horizontal step-nav: Brief -> Scenes -> Narration -> Motion -> Captions
 * -> QA -> Render. Every stage stays clickable/visible at all times (Guided
 * mode still needs unwired stages visible per the task's authoritative
 * instructions) — this component never hides a stage, it only marks the
 * current one.
 */
import { cn } from "@/lib/utils";
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
          <button
            key={stage}
            type="button"
            data-testid={`video-studio-stage-${stage}`}
            aria-current={isActive ? "step" : undefined}
            onClick={() => onSelect(stage)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
              isActive
                ? "border-primary bg-primary text-primary-foreground shadow-xs"
                : "border-input bg-background text-muted-foreground hover:border-primary/40 hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {pickCopy(lang, videoStudioCopy[STAGE_LABEL_KEY[stage]])}
          </button>
        );
      })}
    </nav>
  );
}
