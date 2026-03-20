export type { JSONContent } from "@tiptap/core";

export type EditorMode = "view" | "edit" | "source";

export type SaveStatus =
  | "clean"
  | "dirty"
  | "saving"
  | "saved"
  | "error"
  | "conflict";

export interface UnifiedDocumentSurfaceProps {
  initialContent: string;
  updatedAt?: string;
  onContentChange?: (markdown: string) => void;
  onSave?: (markdown: string) => void;
  onVersionRestore?: () => void;
  onEnterEditMode?: () => void;
  isSaving?: boolean;
  errorMessage?: string;
  documentId?: number;
}
