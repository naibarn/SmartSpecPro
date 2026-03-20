import { useState, useCallback } from "react";
import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { isSafeMediaUrl, sanitizeMediaUrl } from "./mediaUrlValidator";
import MediaSelectionOverlay from "./MediaSelectionOverlay";

export default function AudioNodeView({
  node,
  updateAttributes,
  deleteNode,
  editor,
  selected,
}: NodeViewProps) {
  const [showOverlay, setShowOverlay] = useState(false);
  const [editingCaption, setEditingCaption] = useState(false);
  const [captionDraft, setCaptionDraft] = useState("");

  const { src, caption, controls } = node.attrs;
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

  const handleEditCaption = useCallback(() => {
    setCaptionDraft(caption || "");
    setEditingCaption(true);
    setShowOverlay(false);
  }, [caption]);

  const handleCaptionConfirm = useCallback(() => {
    updateAttributes({ caption: captionDraft || null });
    setEditingCaption(false);
  }, [captionDraft, updateAttributes]);

  return (
    <NodeViewWrapper
      as="figure"
      className={`relative group my-4 ${selected ? "ring-2 ring-blue-500 rounded" : ""}`}
      data-testid="audio-node-view"
    >
      <div className="relative" onClick={handleClick}>
        {isSafeMediaUrl(src) ? (
          <audio
            src={safeSrc}
            controls={controls !== false}
            className="w-full"
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
            onEditCaption={handleEditCaption}
            onDismiss={handleDismiss}
          />
        )}
      </div>

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

export { AudioNodeView };
