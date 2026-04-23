import type { Editor, Range } from "@tiptap/core";

export interface SlashCommandItem {
  id: string;
  label: string;
  icon: string;
  category: "text" | "list" | "block" | "media" | "attachment" | "table";
  command: (props: { editor: Editor; range: Range }) => void;
}

export function getSlashCommandItems(
  onMediaInsert?: (type: "image" | "video" | "audio") => void,
  onFileInsert?: () => void,
): SlashCommandItem[] {
  return [
    {
      id: "heading1",
      label: "Heading 1",
      icon: "Heading1",
      category: "text",
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleHeading({ level: 1 }).run(),
    },
    {
      id: "heading2",
      label: "Heading 2",
      icon: "Heading2",
      category: "text",
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleHeading({ level: 2 }).run(),
    },
    {
      id: "heading3",
      label: "Heading 3",
      icon: "Heading3",
      category: "text",
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleHeading({ level: 3 }).run(),
    },
    {
      id: "heading4",
      label: "Heading 4",
      icon: "Heading4",
      category: "text",
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleHeading({ level: 4 }).run(),
    },
    {
      id: "bulletList",
      label: "Bullet List",
      icon: "List",
      category: "list",
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleBulletList().run(),
    },
    {
      id: "orderedList",
      label: "Ordered List",
      icon: "ListOrdered",
      category: "list",
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
    },
    {
      id: "quote",
      label: "Quote",
      icon: "Quote",
      category: "block",
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
    },
    {
      id: "codeBlock",
      label: "Code Block",
      icon: "Code",
      category: "block",
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
    },
    {
      id: "divider",
      label: "Divider",
      icon: "Minus",
      category: "block",
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
    },
    {
      id: "wiki-link",
      label: "Knowledge Link",
      icon: "Link2",
      category: "text",
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).insertContent("[[").run(),
    },
    {
      id: "image",
      label: "Image",
      icon: "ImagePlus",
      category: "media",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).run();
        onMediaInsert?.("image");
      },
    },
    {
      id: "video",
      label: "Video",
      icon: "Video",
      category: "media",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).run();
        onMediaInsert?.("video");
      },
    },
    {
      id: "audio",
      label: "Audio",
      icon: "Music2",
      category: "media",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).run();
        onMediaInsert?.("audio");
      },
    },
    {
      id: "file",
      label: "File",
      icon: "FileUp",
      category: "attachment",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).run();
        onFileInsert?.();
      },
    },
    {
      id: "table",
      label: "Table",
      icon: "Table",
      category: "table",
      command: ({ editor, range }) =>
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run(),
    },
  ];
}

export function filterSlashItems(
  items: SlashCommandItem[],
  query: string,
): SlashCommandItem[] {
  if (!query) return items;
  const lower = query.toLowerCase();
  return items.filter((item) => item.label.toLowerCase().includes(lower));
}
