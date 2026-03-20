import { useEffect, useRef } from "react";
import {
  Trash2,
  ImageIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Type,
  Replace,
} from "lucide-react";

interface MediaSelectionOverlayProps {
  visible: boolean;
  onRemove: () => void;
  onEditCaption?: () => void;
  onEditAlt?: () => void;
  onReplace?: () => void;
  onAlignChange?: (align: string) => void;
  onDismiss: () => void;
}

export default function MediaSelectionOverlay({
  visible,
  onRemove,
  onEditCaption,
  onEditAlt,
  onReplace,
  onAlignChange,
  onDismiss,
}: MediaSelectionOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onDismiss();
      }
    }
    function handleClickOutside(e: MouseEvent) {
      if (
        overlayRef.current &&
        !overlayRef.current.contains(e.target as Node)
      ) {
        onDismiss();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside, true);
    };
  }, [visible, onDismiss]);

  if (!visible) return null;

  const btnClass =
    "p-1.5 rounded bg-white/90 hover:bg-white shadow-sm text-gray-700 hover:text-gray-900 transition-colors";

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 bg-black/20 flex items-start justify-end p-2 gap-1 z-10 rounded"
      data-testid="media-selection-overlay"
    >
      {onReplace && (
        <button
          type="button"
          className={btnClass}
          onClick={(e) => {
            e.stopPropagation();
            onReplace();
          }}
          aria-label="Replace"
        >
          <Replace className="w-4 h-4" />
        </button>
      )}
      {onEditAlt && (
        <button
          type="button"
          className={btnClass}
          onClick={(e) => {
            e.stopPropagation();
            onEditAlt();
          }}
          aria-label="Edit Alt"
          data-testid="edit-alt-btn"
        >
          <Type className="w-4 h-4" />
        </button>
      )}
      {onEditCaption && (
        <button
          type="button"
          className={btnClass}
          onClick={(e) => {
            e.stopPropagation();
            onEditCaption();
          }}
          aria-label="Edit caption"
        >
          <ImageIcon className="w-4 h-4" />
        </button>
      )}
      {onAlignChange && (
        <>
          <button
            type="button"
            className={btnClass}
            onClick={(e) => {
              e.stopPropagation();
              onAlignChange("left");
            }}
            aria-label="Align left"
          >
            <AlignLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            className={btnClass}
            onClick={(e) => {
              e.stopPropagation();
              onAlignChange("center");
            }}
            aria-label="Align center"
          >
            <AlignCenter className="w-4 h-4" />
          </button>
          <button
            type="button"
            className={btnClass}
            onClick={(e) => {
              e.stopPropagation();
              onAlignChange("right");
            }}
            aria-label="Align right"
          >
            <AlignRight className="w-4 h-4" />
          </button>
        </>
      )}
      <button
        type="button"
        className={`${btnClass} hover:text-red-600`}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        aria-label="Remove"
        data-testid="remove-btn"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

export { MediaSelectionOverlay };
export type { MediaSelectionOverlayProps };
