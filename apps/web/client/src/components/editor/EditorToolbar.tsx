import type { Editor } from "@tiptap/core";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  List,
  ListOrdered,
  Quote,
  CodeSquare,
  Minus,
  Undo2,
  Redo2,
  ImagePlus,
  Video,
  Music2,
  Link as LinkIcon,
  Save,
} from "lucide-react";
import type { EditorMode, SaveStatus } from "./types";

interface EditorToolbarProps {
  editor: Editor | null;
  mode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
  saveStatus: SaveStatus;
  onSave: () => void;
  onInsertMedia: (type: "image" | "video" | "audio") => void;
  onInsertLink: () => void;
  isSaving?: boolean;
}

interface ToolbarButtonProps {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  "aria-label": string;
  children: React.ReactNode;
}

function ToolbarButton({
  onClick,
  active,
  disabled,
  title,
  "aria-label": ariaLabel,
  children,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      className={`h-8 w-8 flex items-center justify-center rounded text-sm transition-colors
        ${active ? "bg-primary/20 text-primary" : "hover:bg-muted text-muted-foreground hover:text-foreground"}
        ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      {children}
    </button>
  );
}

function Separator() {
  return <div className="border-r border-border mx-1 h-6 self-center" />;
}

export default function EditorToolbar({
  editor,
  mode,
  onModeChange,
  saveStatus,
  onSave,
  onInsertMedia,
  onInsertLink,
  isSaving,
}: EditorToolbarProps) {
  const showFormatting = mode === "edit";
  const iconSize = "h-4 w-4";

  return (
    <div
      className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-muted/20 p-1.5"
      role="toolbar"
      aria-label="Editor toolbar"
    >
      {/* Mode switcher */}
      {(["view", "edit", "source"] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onModeChange(m)}
          aria-pressed={mode === m}
          data-testid={`toolbar-mode-${m}`}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            mode === m
              ? "bg-primary text-primary-foreground"
              : "border border-border hover:bg-muted"
          }`}
        >
          {m === "view" ? "View" : m === "edit" ? "Edit" : "Source"}
        </button>
      ))}

      <Separator />

      {/* Formatting buttons — only in Edit mode */}
      {showFormatting && (
        <>
          <ToolbarButton
            onClick={() => editor?.chain().focus().setParagraph().run()}
            active={editor?.isActive("paragraph") ?? false}
            disabled={!editor}
            title="Normal text"
            aria-label="Normal text"
          >
            <span className="text-[11px] font-semibold tracking-tight">Aa</span>
          </ToolbarButton>

          <ToolbarButton
            onClick={() => editor?.chain().focus().undo().run()}
            disabled={!editor?.can().chain().focus().undo().run()}
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
          >
            <Undo2 className={iconSize} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor?.chain().focus().redo().run()}
            disabled={!editor?.can().chain().focus().redo().run()}
            title="Redo (Ctrl+Shift+Z)"
            aria-label="Redo"
          >
            <Redo2 className={iconSize} />
          </ToolbarButton>

          <Separator />

          {([1, 2, 3, 4] as const).map((level) => {
            const Icon = [Heading1, Heading2, Heading3, Heading4][level - 1];
            return (
              <ToolbarButton
                key={level}
                onClick={() =>
                  editor?.chain().focus().toggleHeading({ level }).run()
                }
                active={editor?.isActive("heading", { level }) ?? false}
                disabled={!editor}
                title={`Heading ${level}`}
                aria-label={`Heading ${level}`}
              >
                <Icon className={iconSize} />
              </ToolbarButton>
            );
          })}

          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleBold().run()}
            active={editor?.isActive("bold") ?? false}
            disabled={!editor}
            title="Bold (Ctrl+B)"
            aria-label="Bold"
          >
            <Bold className={iconSize} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            active={editor?.isActive("italic") ?? false}
            disabled={!editor}
            title="Italic (Ctrl+I)"
            aria-label="Italic"
          >
            <Italic className={iconSize} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleUnderline().run()}
            active={editor?.isActive("underline") ?? false}
            disabled={!editor}
            title="Underline (Ctrl+U)"
            aria-label="Underline"
          >
            <UnderlineIcon className={iconSize} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleCode().run()}
            active={editor?.isActive("code") ?? false}
            disabled={!editor}
            title="Code"
            aria-label="Code"
          >
            <Code className={iconSize} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => onInsertLink()}
            disabled={!editor}
            title="Link"
            aria-label="Link"
          >
            <LinkIcon className={iconSize} />
          </ToolbarButton>

          <Separator />

          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
            active={editor?.isActive("bulletList") ?? false}
            disabled={!editor}
            title="Bullet List"
            aria-label="Bullet List"
          >
            <List className={iconSize} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
            active={editor?.isActive("orderedList") ?? false}
            disabled={!editor}
            title="Ordered List"
            aria-label="Ordered List"
          >
            <ListOrdered className={iconSize} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleBlockquote().run()}
            active={editor?.isActive("blockquote") ?? false}
            disabled={!editor}
            title="Blockquote"
            aria-label="Blockquote"
          >
            <Quote className={iconSize} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
            active={editor?.isActive("codeBlock") ?? false}
            disabled={!editor}
            title="Code Block"
            aria-label="Code Block"
          >
            <CodeSquare className={iconSize} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor?.chain().focus().setHorizontalRule().run()}
            disabled={!editor}
            title="Divider"
            aria-label="Horizontal Rule"
          >
            <Minus className={iconSize} />
          </ToolbarButton>

          <Separator />

          <ToolbarButton
            onClick={() => onInsertMedia("image")}
            disabled={!editor}
            title="Insert Image"
            aria-label="Insert Image"
          >
            <ImagePlus className={iconSize} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => onInsertMedia("video")}
            disabled={!editor}
            title="Insert Video"
            aria-label="Insert Video"
          >
            <Video className={iconSize} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => onInsertMedia("audio")}
            disabled={!editor}
            title="Insert Audio"
            aria-label="Insert Audio"
          >
            <Music2 className={iconSize} />
          </ToolbarButton>
        </>
      )}

      {/* Right-aligned save section */}
      <div className="ml-auto flex items-center gap-2">
        <span
          className={`text-xs ${
            saveStatus === "saving"
              ? "text-blue-500"
              : saveStatus === "dirty"
                ? "text-amber-500"
                : saveStatus === "error" || saveStatus === "conflict"
                  ? "text-destructive"
                  : saveStatus === "saved"
                    ? "text-green-500"
                    : ""
          }`}
          data-testid="toolbar-save-status"
        >
          {saveStatus === "saving"
            ? "Saving..."
            : saveStatus === "dirty"
              ? "Unsaved changes"
              : saveStatus === "saved"
                ? "Saved"
                : saveStatus === "error"
                  ? "Error"
                  : saveStatus === "conflict"
                    ? "Conflict detected"
                    : ""}
        </span>
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving}
          title="Save (Ctrl+S)"
          aria-label="Save"
          data-testid="toolbar-save-btn"
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-border hover:bg-muted disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" />
          Save
        </button>
      </div>
    </div>
  );
}

export { EditorToolbar };
export type { EditorToolbarProps };
