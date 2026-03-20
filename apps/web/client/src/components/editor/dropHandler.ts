import type { EditorView } from "@tiptap/pm/view";
import type { Slice } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/core";
import { toast } from "sonner";
import { uploadMedia, classifyMediaType } from "./uploadMedia";

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
): boolean {
  // Internal drag-and-drop is handled by ProseMirror
  if (moved) return false;

  const files = event.dataTransfer?.files;
  if (!files || files.length === 0) return false;

  // Filter to supported media files
  const mediaFiles: { file: File; type: "image" | "video" | "audio" }[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const mediaType = classifyMediaType(file.type);
    if (mediaType) {
      mediaFiles.push({ file, type: mediaType });
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
        const url = await uploadMedia(file);
        if (editor.isDestroyed) return;

        const attrs: Record<string, string> = { src: url };
        if (type === "image") attrs.alt = file.name;

        editor
          .chain()
          .focus()
          .insertContentAt(insertPos, { type, attrs })
          .run();

        // Advance position past the inserted node for next file
        insertPos = editor.state.selection.to;
      } catch {
        toast.error(`Failed to upload ${file.name}`);
      }
    }
  })();

  return true;
}
