import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";

interface ImageLightboxProps {
  images: Array<{ src: string; alt?: string }>;
  initialIndex?: number;
  open: boolean;
  onClose: () => void;
}

export function ImageLightbox({ images, initialIndex = 0, open, onClose }: ImageLightboxProps) {
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    setIndex(initialIndex);
  }, [initialIndex, open]);

  const prev = useCallback(() => setIndex((i) => (i > 0 ? i - 1 : images.length - 1)), [images.length]);
  const next = useCallback(() => setIndex((i) => (i < images.length - 1 ? i + 1 : 0)), [images.length]);

  const handleDownload = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    const current = images[index];
    if (!current?.src) return;
    try {
      const res = await fetch(current.src);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = current.alt || `image-${index + 1}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      window.open(current.src, "_blank", "noopener,noreferrer");
    }
  }, [images, index]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, prev, next]);

  if (!open || images.length === 0) return null;

  const current = images[index];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        <button
          onClick={handleDownload}
          className="text-white hover:text-gray-300 bg-black/40 rounded-full p-2"
          title="Download"
        >
          <Download className="h-5 w-5" />
        </button>
        <button
          onClick={onClose}
          className="text-white hover:text-gray-300 bg-black/40 rounded-full p-2"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {images.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); prev(); }}
            className="absolute left-4 z-10 text-white hover:text-gray-300 bg-black/40 rounded-full p-2"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); next(); }}
            className="absolute right-4 z-10 text-white hover:text-gray-300 bg-black/40 rounded-full p-2"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      )}

      <img
        src={current?.src}
        alt={current?.alt || "Image"}
        className="h-[90vh] max-h-[90vh] w-auto max-w-[95vw] object-contain sm:h-[85vh] sm:max-w-[92vw]"
        onClick={(e) => e.stopPropagation()}
      />

      {images.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm bg-black/50 px-3 py-1 rounded-full">
          {index + 1} / {images.length}
        </div>
      )}
    </div>
  );
}
