import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@smartspec/ui/src/components/ui/button";
import {
  clampFeedbackLightboxZoom,
  FEEDBACK_LIGHTBOX_ZOOM_MAX,
  FEEDBACK_LIGHTBOX_ZOOM_MIN,
  FEEDBACK_LIGHTBOX_ZOOM_STEP,
  getFeedbackLightboxZoomPercent,
} from "./feedbackHubZoom";

type FeedbackLightboxZoomControlsProps = {
  scale: number;
  onScaleChange: (scale: number) => void;
};

export function FeedbackLightboxZoomControls({
  scale,
  onScaleChange,
}: FeedbackLightboxZoomControlsProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center">
      <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-white/20 bg-black/70 p-1 text-white shadow-lg">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-white hover:bg-white/20 hover:text-white"
          onClick={() =>
            onScaleChange(
              clampFeedbackLightboxZoom(scale - FEEDBACK_LIGHTBOX_ZOOM_STEP)
            )
          }
          disabled={scale <= FEEDBACK_LIGHTBOX_ZOOM_MIN}
          aria-label="ย่อภาพ"
          title="ย่อภาพ"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span
          className="min-w-14 px-2 text-center text-xs font-medium"
          aria-live="polite"
        >
          {getFeedbackLightboxZoomPercent(scale)}%
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-white hover:bg-white/20 hover:text-white"
          onClick={() =>
            onScaleChange(
              clampFeedbackLightboxZoom(scale + FEEDBACK_LIGHTBOX_ZOOM_STEP)
            )
          }
          disabled={scale >= FEEDBACK_LIGHTBOX_ZOOM_MAX}
          aria-label="ขยายภาพ"
          title="ขยายภาพ"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-9 px-2 text-xs text-white hover:bg-white/20 hover:text-white"
          onClick={() => onScaleChange(FEEDBACK_LIGHTBOX_ZOOM_MIN)}
          disabled={scale === FEEDBACK_LIGHTBOX_ZOOM_MIN}
          aria-label="รีเซ็ตขนาด"
          title="รีเซ็ตขนาด"
        >
          <RotateCcw className="mr-1 h-3.5 w-3.5" />
          รีเซ็ต
        </Button>
      </div>
    </div>
  );
}
