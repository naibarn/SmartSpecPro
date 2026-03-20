import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { Placeholder } from "@tiptap/extension-placeholder";
import type { Editor, Extension } from "@tiptap/core";
import { getDefaultExtensions } from "./TiptapMarkdownBridge";
import type { JSONContent } from "./types";
import "./editor.css";

interface TiptapEditorProps {
  content: JSONContent;
  editable: boolean;
  onUpdate?: (editor: Editor) => void;
  onMediaInsert?: (type: "image" | "video" | "audio") => void; // TODO: Wire in S05 (SlashCommands)
  placeholder?: string;
  className?: string;
}

export default function TiptapEditor({
  content,
  editable,
  onUpdate,
  placeholder = "",
  className,
}: TiptapEditorProps) {
  const editor = useEditor({
    extensions: [
      ...getDefaultExtensions(),
      Placeholder.configure({ placeholder }),
    ] as Extension[],
    content,
    editable,
    immediatelyRender: false,
    onUpdate: ({ editor: ed }) => {
      onUpdate?.(ed);
    },
  });

  useEffect(() => {
    if (editor) {
      editor.setEditable(editable);
    }
  }, [editor, editable]);

  return (
    <div className={`tiptap-editor${className ? ` ${className}` : ""}`}>
      <EditorContent editor={editor} />
    </div>
  );
}

export { TiptapEditor };
export type { TiptapEditorProps };
