import type { EditorView } from "@tiptap/pm/view";
import type { Slice } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/core";
import DOMPurify from "dompurify";
import type { Config as DOMPurifyConfig } from "dompurify";
import { toast } from "sonner";
import {
  uploadMedia,
  classifyMediaType,
  validateAttachmentFile,
} from "./uploadMedia";
import { sanitizeMediaSrc } from "./extensions/mediaSerializationRules";

/**
 * Tiptap editorProps.handlePaste handler.
 * Intercepts clipboard image pastes, uploads them, and inserts image nodes.
 * Returns true if the paste was handled, false to fall through to defaults.
 */
export function handlePaste(
  view: EditorView,
  event: ClipboardEvent,
  _slice: Slice,
  editor: Editor,
  options?: {
    uploadMetadata?: Record<string, unknown>;
    onInserted?: (editor: Editor) => void;
  },
): boolean {
  const items = event.clipboardData?.items;
  if (!items) return false;

  const fileItems: Array<{ item: DataTransferItem; type: "image" | "video" | "audio" | "file" }> = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind !== "file") continue;
    const mediaType = classifyMediaType(item.type);
    if (mediaType) {
      fileItems.push({ item, type: mediaType });
      continue;
    }
    const file = item.getAsFile();
    if (!file) continue;
    if (validateAttachmentFile(file) === null) {
      fileItems.push({ item, type: "file" });
    }
  }

  if (fileItems.length === 0) return false;

  event.preventDefault();

  // Upload async — handlePaste must return synchronously
  for (const { item, type } of fileItems) {
    const file = item.getAsFile();
    if (!file) continue;

    uploadMedia(file, {
      metadata: options?.uploadMetadata,
    })
      .then((uploaded) => {
        if (editor.isDestroyed) return;
        if (type === "image") {
          editor.chain().focus().setImage({ src: uploaded.url, alt: file.name, assetId: uploaded.assetId }).run();
        } else if (type === "video") {
          editor.chain().focus().setVideo({
            src: uploaded.url,
            caption: file.name,
            assetId: uploaded.assetId,
          }).run();
        } else if (type === "audio") {
          editor.chain().focus().setAudio({
            src: uploaded.url,
            caption: file.name,
            assetId: uploaded.assetId,
          }).run();
        } else {
          editor.chain().focus().setAttachment({
            src: uploaded.url,
            title: file.name,
            fileName: file.name,
            mimeType: uploaded.mimeType,
            assetId: uploaded.assetId,
          }).run();
        }

        options?.onInserted?.(editor);
      })
      .catch(() => {
        toast.error(`Failed to upload ${file.name}`);
      });
  }

  return true;
}

// Regex patterns for Word/Office cleanup
const XML_NS_TAG = /<\/?[a-zA-Z]+:[a-zA-Z]+[^>]*>/g;
const MSO_STYLE_ATTR = /\s*style="[^"]*mso-[^"]*"/gi;
const EMPTY_SPAN = /<span\s*>\s*([\s\S]*?)\s*<\/span>/gi;

const PURIFY_CONFIG: DOMPurifyConfig = {
  ALLOWED_TAGS: [
    "p",
    "br",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "a",
    "ul",
    "ol",
    "li",
    "blockquote",
    "pre",
    "code",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "img",
    "figure",
    "figcaption",
    "hr",
  ],
  ALLOWED_ATTR: [
    "href",
    "src",
    "alt",
    "title",
    "colspan",
    "rowspan",
    "download",
    "target",
    "rel",
    "data-file-attachment",
    "data-file-name",
    "data-mime-type",
    "data-asset-id",
    "data-file-size-bytes",
  ],
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: ["script", "style", "iframe", "object", "embed"],
  FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus"],
};

/**
 * Tiptap editorProps.transformPastedHTML handler.
 * Sanitizes rich HTML pasted from Word/Google Docs.
 */
export function transformPastedHTML(html: string): string {
  // 1. Strip XML-namespaced tags (Word's <o:p>, <w:sdt>, etc.)
  let cleaned = html.replace(XML_NS_TAG, "");

  // 2. Strip style attributes containing mso-* properties
  cleaned = cleaned.replace(MSO_STYLE_ATTR, "");

  // 3. Collapse empty spans
  cleaned = cleaned.replace(EMPTY_SPAN, "$1");

  // 4. Pre-sanitize img src URLs before DOMPurify (so DOMPurify is the terminal step)
  cleaned = cleaned.replace(
    /<img\s+[^>]*?src="([^"]*)"[^>]*?>/gi,
    (match, src) => {
      const safeSrc = sanitizeMediaSrc(src);
      if (!safeSrc) return "";
      return match.replace(src, safeSrc);
    },
  );

  // 5. DOMPurify sanitize (terminal step — no regex post-processing)
  return String(DOMPurify.sanitize(cleaned, PURIFY_CONFIG));
}
