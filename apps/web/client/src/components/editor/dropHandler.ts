import type { EditorView } from "@tiptap/pm/view";
import type { Slice } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/core";
import { toast } from "sonner";
import {
  uploadMedia,
  classifyMediaType,
  validateAttachmentFile,
} from "./uploadMedia";

/**
 * Tiptap editorProps.handleDrop handler.
 * Intercepts file drag-and-drop events, uploads media files,
 * and inserts appropriate nodes at the drop position.
 */
export function handleDrop(
  view: EditorView,
  event: DragEvent,
  _slice: Slice,
  moved: boolean,
  editor: Editor,
  options?: {
    uploadMetadata?: Record<string, unknown>;
    onInserted?: (editor: Editor) => void;
  },
): boolean {
  // Internal drag-and-drop is handled by ProseMirror
  if (moved) return false;

  const files = event.dataTransfer?.files;
  if (!files || files.length === 0) return false;

  // Filter to supported editor uploads
  const mediaFiles: { file: File; type: "image" | "video" | "audio" | "file" }[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const mediaType = classifyMediaType(file.type);
    if (mediaType) {
      mediaFiles.push({ file, type: mediaType });
      continue;
    }
    if (validateAttachmentFile(file) === null) {
      mediaFiles.push({ file, type: "file" });
    }
  }

  if (mediaFiles.length === 0) return false;

  event.preventDefault();

  // Determine drop position
  const coords = view.posAtCoords({
    left: event.clientX,
    top: event.clientY,
  });
  const pos = coords?.pos ?? view.state.selection.from;

  // Upload each file sequentially to preserve insertion order
  (async () => {
    let insertPos = pos;
    for (const { file, type } of mediaFiles) {
      try {
        const uploaded = await uploadMedia(file, {
          metadata: options?.uploadMetadata,
        });
        if (editor.isDestroyed) return;

        if (type === "image") {
          editor.chain().focus().insertContentAt(insertPos, {
            type,
            attrs: { src: uploaded.url, alt: file.name, assetId: uploaded.assetId },
          }).run();
        } else if (type === "video") {
          editor.chain().focus().insertContentAt(insertPos, {
            type,
            attrs: { src: uploaded.url, caption: file.name, assetId: uploaded.assetId },
          }).run();
        } else if (type === "audio") {
          editor.chain().focus().insertContentAt(insertPos, {
            type,
            attrs: { src: uploaded.url, caption: file.name, assetId: uploaded.assetId },
          }).run();
        } else {
          editor.chain().focus().insertContentAt(insertPos, {
            type: "attachment",
            attrs: {
              src: uploaded.url,
              title: file.name,
              fileName: file.name,
              mimeType: uploaded.mimeType,
              assetId: uploaded.assetId,
            },
          }).run();
        }

        options?.onInserted?.(editor);

        // Advance position past the inserted node for next file
        insertPos = editor.state.selection.to;
      } catch {
        toast.error(`Failed to upload ${file.name}`);
      }
    }
  })();

  return true;
}
