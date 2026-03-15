import { Image } from "lucide-react";

export interface VisualContextBadgeProps {
  /** Number of images currently in the visual working set */
  count: number;
  /** Optional click handler to open the gallery panel */
  onClick?: () => void;
}

/**
 * Badge showing how many images are in the current visual working set.
 * Hidden when count is 0. Clickable to open ImageGalleryPanel.
 */
export function VisualContextBadge({ count, onClick }: VisualContextBadgeProps) {
  if (count === 0) return null;

  const label = count === 1 ? "1 image in context" : `${count} images in context`;

  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors"
      title={label}
      type="button"
    >
      <Image className="h-3 w-3" />
      <span>{label}</span>
    </button>
  );
}
