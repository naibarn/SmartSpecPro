import { useState, useCallback } from "react";
import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { isSafeMediaUrl, sanitizeMediaUrl } from "./mediaUrlValidator";
import MediaSelectionOverlay from "./MediaSelectionOverlay";

const ALIGNMENT_CLASSES: Record<string, string> = {
  left: "text-left",
  center: "text-center mx-auto",
  right: "text-right ml-auto",
};

export default function ImageNodeView({
  node,
  updateAttributes,
  deleteNode,
  editor,
  selected,
}: NodeViewProps) {
  const [showOverlay, setShowOverlay] = useState(false);
  const [editingAlt, setEditingAlt] = useState(false);
  const [editingCaption, setEditingCaption] = useState(false);
  const [altDraft, setAltDraft] = useState("");
  const [captionDraft, setCaptionDraft] = useState("");

  const { src, alt, caption, alignment, width } = node.attrs;
  const safeSrc = sanitizeMediaUrl(src || "");
  const isEditable = editor.isEditable;

  const handleClick = useCallback(() => {
    if (isEditable) {
      setShowOverlay(true);
    }
  }, [isEditable]);

  const handleDismiss = useCallback(() => {
    setShowOverlay(false);
  }, []);

  const handleEditAlt = useCallback(() => {
    setAltDraft(alt || "");
    setEditingAlt(true);
    setShowOverlay(false);
  }, [alt]);

  const handleAltConfirm = useCallback(() => {
    updateAttributes({ alt: altDraft });
    setEditingAlt(false);
  }, [altDraft, updateAttributes]);

  const handleEditCaption = useCallback(() => {
    setCaptionDraft(caption || "");
    setEditingCaption(true);
    setShowOverlay(false);
  }, [caption]);

  const handleCaptionConfirm = useCallback(() => {
    updateAttributes({ caption: captionDraft || null });
    setEditingCaption(false);
  }, [captionDraft, updateAttributes]);

  const handleAlignChange = useCallback(
    (align: string) => {
      updateAttributes({ alignment: align });
    },
    [updateAttributes],
  );

  const alignClass = ALIGNMENT_CLASSES[alignment || "center"] || ALIGNMENT_CLASSES.center;

  return (
    <NodeViewWrapper
      as="figure"
      className={`relative group my-4 ${alignClass} ${selected ? "ring-2 ring-blue-500 rounded" : ""}`}
      data-testid="image-node-view"
    >
      <div className="relative inline-block" onClick={handleClick}>
        {isSafeMediaUrl(src) ? (
          <img
            src={safeSrc}
            alt={alt || ""}
            className="max-h-[75vh] w-full max-w-full h-auto rounded object-contain"
            style={width ? { width } : undefined}
            draggable={false}
          />
        ) : (
          <div className="p-4 bg-red-50 text-red-600 rounded text-sm">
            Unsafe URL blocked
          </div>
        )}

        {isEditable && (
          <MediaSelectionOverlay
            visible={showOverlay}
            onRemove={deleteNode}
            onEditAlt={handleEditAlt}
            onEditCaption={handleEditCaption}
            onAlignChange={handleAlignChange}
            onDismiss={handleDismiss}
          />
        )}
      </div>

      {editingAlt && (
        <div className="mt-1" data-testid="alt-editor">
          <input
            type="text"
            className="w-full text-sm border rounded px-2 py-1"
            value={altDraft}
            onChange={(e) => setAltDraft(e.target.value)}
            onBlur={handleAltConfirm}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            placeholder="Alt text"
            autoFocus
          />
        </div>
      )}

      {editingCaption ? (
        <figcaption className="mt-1">
          <input
            type="text"
            className="w-full text-sm text-center border rounded px-2 py-1 text-muted-foreground"
            value={captionDraft}
            onChange={(e) => setCaptionDraft(e.target.value)}
            onBlur={handleCaptionConfirm}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            placeholder="Caption"
            autoFocus
          />
        </figcaption>
      ) : caption ? (
        <figcaption className="text-sm text-muted-foreground text-center mt-1">
          {caption}
        </figcaption>
      ) : null}
    </NodeViewWrapper>
  );
}

export { ImageNodeView };
