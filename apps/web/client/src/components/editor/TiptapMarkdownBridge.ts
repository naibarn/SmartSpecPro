import { Editor, type Extension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Link } from "@tiptap/extension-link";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { Underline } from "@tiptap/extension-underline";
import { Markdown } from "tiptap-markdown";
import { ImageExtension } from "./extensions/imageExtension";
import { VideoExtension } from "./extensions/videoExtension";
import { AudioExtension } from "./extensions/audioExtension";
import { AttachmentExtension } from "./extensions/attachmentExtension";
import { WikiLinkExtension } from "./extensions/wikiLinkExtension";
import { escapeAttr, isAllowedLinkUri } from "./extensions/mediaSerializationRules";

import type { JSONContent } from "@tiptap/core";
export type { JSONContent };

/**
 * Returns the standard set of Tiptap extensions for the editor.
 * This is the single source of truth for extension configuration.
 */
export function getDefaultExtensions(): Extension[] {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4] },
      // StarterKit v3 bundles Link and Underline — disable to configure separately below
      link: false,
      underline: false,
    }),
    ImageExtension,
    VideoExtension,
    AudioExtension,
    AttachmentExtension,
    WikiLinkExtension,
    Link.configure({
      openOnClick: false,
      isAllowedUri: (url) => isAllowedLinkUri(url),
    }),
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

/** Returns a fresh minimal empty document (avoids shared mutable state). */
function emptyDoc(): JSONContent {
  return { type: "doc", content: [] };
}

/**
 * Parse a markdown string into a Tiptap JSONContent document.
 * Returns an empty document on parse failure instead of throwing.
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
  } catch (err) {
    console.error("[TiptapMarkdownBridge] parse failed, returning empty doc:", err);
    return emptyDoc();
  } finally {
    editor.destroy();
  }
}

/**
 * Serialize a Tiptap JSONContent document to a markdown string.
 * Returns empty string on serialization failure instead of throwing.
 */
export function serialize(
  doc: JSONContent,
  extensions?: Extension[],
): string {
  const exts = extensions ?? getDefaultExtensions();
  const editor = createHeadlessEditor(exts);
  try {
    // Set JSON content directly (bypass tiptap-markdown's markdown parsing)
    editor.commands.setContent(doc, {
      parseOptions: { preserveWhitespace: "full" },
    });
    const storage = editor.storage as unknown as Record<string, unknown>;
    const mdStorage = storage.markdown as
      | { getMarkdown: () => string }
      | undefined;
    if (!mdStorage?.getMarkdown) {
      console.error("[TiptapMarkdownBridge] Markdown extension not loaded — cannot serialize");
      return "";
    }
    let markdown = mdStorage.getMarkdown();
    for (const attachment of collectAttachmentNodes(doc)) {
      const linkPattern = new RegExp(
        `\\[${escapeRegex(attachment.label)}\\]\\(${escapeRegex(attachment.src)}\\)`,
        "g",
      );
      markdown = markdown.replace(linkPattern, attachment.html);
    }
    return markdown;
  } catch (err) {
    console.error("[TiptapMarkdownBridge] serialize failed:", err);
    return "";
  } finally {
    editor.destroy();
  }
}

function collectAttachmentNodes(doc: JSONContent): Array<{
  src: string;
  label: string;
  html: string;
}> {
  const attachments: Array<{ src: string; label: string; html: string }> = [];

  const visit = (node: JSONContent): void => {
    if (node.type === "attachment") {
      const src = String(node.attrs?.src ?? "");
      const label = String(node.attrs?.title ?? node.attrs?.fileName ?? "Attachment");
      const fileName = String(node.attrs?.fileName ?? node.attrs?.title ?? "attachment");
      const mimeType = node.attrs?.mimeType ? String(node.attrs.mimeType) : null;
      const assetId = node.attrs?.assetId ? String(node.attrs.assetId) : null;
      const sizeBytes = node.attrs?.sizeBytes != null ? String(node.attrs.sizeBytes) : null;
      attachments.push({
        src,
        label,
        html: buildAttachmentHtml({
          src,
          title: label,
          fileName,
          mimeType,
          assetId,
          sizeBytes,
        }),
      });
    }

    node.content?.forEach((child) => visit(child));
  };

  visit(doc);
  return attachments;
}

function buildAttachmentHtml(attrs: {
  src: string;
  title: string;
  fileName: string;
  mimeType: string | null;
  assetId: string | null;
  sizeBytes: string | null;
}): string {
  const safeSrc = escapeAttr(attrs.src);
  const safeTitle = escapeAttr(attrs.title);
  const safeFileName = escapeAttr(attrs.fileName);
  const safeMimeType = attrs.mimeType ? escapeAttr(attrs.mimeType) : null;
  const safeAssetId = attrs.assetId ? escapeAttr(attrs.assetId) : null;
  const safeSizeBytes = attrs.sizeBytes ? escapeAttr(attrs.sizeBytes) : null;

  return [
    `<figure data-file-attachment="true" data-src="${safeSrc}"`,
    ` data-title="${safeTitle}"`,
    ` data-file-name="${safeFileName}"`,
    safeMimeType ? ` data-mime-type="${safeMimeType}"` : "",
    safeAssetId ? ` data-asset-id="${safeAssetId}"` : "",
    safeSizeBytes ? ` data-file-size-bytes="${safeSizeBytes}"` : "",
    `>`,
    `<a href="${safeSrc}" target="_blank" rel="noopener noreferrer" download="${safeFileName}">${safeTitle}</a>`,
    `</figure>`,
  ].join("");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
