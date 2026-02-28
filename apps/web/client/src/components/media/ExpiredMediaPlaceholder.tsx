/**
 * ExpiredMediaPlaceholder - Shows a clear visual indicator when media links have expired.
 * Used in MediaStudio and MediaHistory pages.
 */

import { ImageOff, VideoOff, VolumeX, LinkIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type MediaType = "image" | "video" | "audio";

interface ExpiredMediaPlaceholderProps {
  mediaType: MediaType;
  className?: string;
  /** Compact mode for small thumbnails (e.g. table cells, history grid) */
  compact?: boolean;
}

const iconMap: Record<MediaType, React.ElementType> = {
  image: ImageOff,
  video: VideoOff,
  audio: VolumeX,
};

export default function ExpiredMediaPlaceholder({
  mediaType,
  className,
  compact = false,
}: ExpiredMediaPlaceholderProps) {
  const Icon = iconMap[mediaType];

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 border border-dashed border-gray-300 rounded-lg",
        compact ? "gap-0.5 p-1" : "gap-1.5 p-3",
        className,
      )}
      title="This media link has expired"
    >
      <div
        className={cn(
          "rounded-full bg-gray-300/60 flex items-center justify-center",
          compact ? "w-6 h-6" : "w-10 h-10",
        )}
      >
        <Icon
          className={cn(
            "text-gray-500",
            compact ? "w-3.5 h-3.5" : "w-5 h-5",
          )}
        />
      </div>
      {!compact && (
        <>
          <div className="flex items-center gap-1 text-gray-500">
            <LinkIcon className="w-3 h-3" />
            <span className="text-xs font-medium">Link Expired</span>
          </div>
          <span className="text-[10px] text-gray-400 text-center leading-tight">
            This media is no longer available
          </span>
        </>
      )}
      {compact && (
        <span className="text-[9px] text-gray-400 font-medium leading-none">
          Expired
        </span>
      )}
    </div>
  );
}
