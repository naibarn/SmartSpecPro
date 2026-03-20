import type { EditorView } from "@tiptap/pm/view";
import type { Slice } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/core";
import DOMPurify from "dompurify";
import { toast } from "sonner";
import { uploadMedia, classifyMediaType } from "./uploadMedia";
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
): boolean {
  const items = event.clipboardData?.items;
  if (!items) return false;

  const imageItems: DataTransferItem[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind === "file" && classifyMediaType(item.type) === "image") {
      imageItems.push(item);
    }
  }

  if (imageItems.length === 0) return false;

  event.preventDefault();

  // Upload async — handlePaste must return synchronously
  for (const item of imageItems) {
    const file = item.getAsFile();
    if (!file) continue;

    uploadMedia(file)
      .then((url) => {
        if (editor.isDestroyed) return;
        editor.chain().focus().setImage({ src: url, alt: file.name }).run();
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

const PURIFY_CONFIG: DOMPurify.Config = {
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
    "hr",
  ],
  ALLOWED_ATTR: ["href", "src", "alt", "title", "colspan", "rowspan"],
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
  cleaned = DOMPurify.sanitize(cleaned, PURIFY_CONFIG);

  return cleaned;
}
