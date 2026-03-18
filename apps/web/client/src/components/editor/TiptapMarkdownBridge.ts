import { Editor, type Extension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Image } from "@tiptap/extension-image";
import { Link } from "@tiptap/extension-link";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { Underline } from "@tiptap/extension-underline";
import { Markdown } from "tiptap-markdown";

export type { JSONContent } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";

/**
 * Returns the standard set of Tiptap extensions for the editor.
 * This is the single source of truth for extension configuration.
 * Section 06 will add VideoExtension, AudioExtension, and extended ImageExtension.
 */
export function getDefaultExtensions(): Extension[] {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4] },
      // Disable extensions we configure separately
      link: false,
      underline: false,
    }),
    Image,
    Link.configure({ openOnClick: false }),
    Table.configure({ resizable: true }),
    TableRow,
    TableCell,
    TableHeader,
    Underline,
    Markdown.configure({
      html: true,
      transformPastedText: true,
    }),
  ] as Extension[];
}

function createHeadlessEditor(extensions: Extension[]): Editor {
  return new Editor({
    extensions,
    content: "",
  });
}

/**
 * Parse a markdown string into a Tiptap JSONContent document.
 */
export function parse(
  markdown: string,
  extensions?: Extension[],
): JSONContent {
  const md = markdown ?? "";
  const exts = extensions ?? getDefaultExtensions();
  const editor = createHeadlessEditor(exts);
  try {
    // tiptap-markdown overrides setContent to auto-parse markdown
    editor.commands.setContent(md);
    return editor.getJSON();
  } finally {
    editor.destroy();
  }
}

/**
 * Serialize a Tiptap JSONContent document to a markdown string.
 */
export function serialize(
  doc: JSONContent,
  extensions?: Extension[],
): string {
  const exts = extensions ?? getDefaultExtensions();
  const editor = createHeadlessEditor(exts);
  try {
    // Set JSON content directly (bypass tiptap-markdown's markdown parsing)
    editor.commands.setContent(doc, false, {
      preserveWhitespace: "full",
    });
    return editor.storage.markdown.getMarkdown();
  } finally {
    editor.destroy();
  }
}
