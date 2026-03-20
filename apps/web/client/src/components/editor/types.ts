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
  /** Called when user clicks "Overwrite" — save without version check */
  onSaveForce?: (markdown: string) => void;
  /** Called when user clicks "Reload" — refetch latest content */
  onReloadContent?: () => void;
  onVersionRestore?: () => void;
  onEnterEditMode?: () => void;
  isSaving?: boolean;
  errorMessage?: string;
  /** When true, the conflict resolution dialog is shown */
  hasConflict?: boolean;
  documentId?: number;
  documentTitle?: string;
}
