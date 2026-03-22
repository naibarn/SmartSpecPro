import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { sanitizeMediaSrc, buildDataAttrs, parseDataAttr, escapeAttr } from "./mediaSerializationRules";
import AttachmentNodeView from "../nodeviews/AttachmentNodeView";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    attachment: {
      setAttachment: (attrs: {
        src: string;
        title?: string | null;
        fileName?: string | null;
        mimeType?: string | null;
        assetId?: string | null;
        sizeBytes?: number | null;
      }) => ReturnType;
    };
  }
}

export const AttachmentExtension = Node.create({
  name: "attachment",

  group: "block",

  atom: true,

  draggable: true,

  addAttributes() {
    return {
      src: {
        default: "",
        parseHTML: (element: HTMLElement) =>
          sanitizeMediaSrc(
            element.getAttribute("data-src")
            ?? element.getAttribute("href")
            ?? element.getAttribute("src")
            ?? element.querySelector("a")?.getAttribute("href")
            ?? element.querySelector("a")?.getAttribute("src")
            ?? "",
          ),
      },
      title: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          parseDataAttr(element, "data-title"),
      },
      fileName: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          parseDataAttr(element, "data-file-name"),
      },
      mimeType: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          parseDataAttr(element, "data-mime-type"),
      },
      assetId: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          parseDataAttr(element, "data-asset-id"),
      },
      sizeBytes: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const raw = parseDataAttr(element, "data-file-size-bytes");
          const parsed = raw ? Number(raw) : null;
          return Number.isFinite(parsed) ? parsed : null;
        },
      },
    };
  },

  parseHTML() {
    return [
      { tag: "a[data-file-attachment='true']" },
      { tag: "figure[data-file-attachment='true']" },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const dataAttrs = buildDataAttrs({
      "data-file-attachment": "true",
      "data-title": HTMLAttributes.title,
      "data-file-name": HTMLAttributes.fileName,
      "data-mime-type": HTMLAttributes.mimeType,
      "data-asset-id": HTMLAttributes.assetId,
      "data-file-size-bytes": HTMLAttributes.sizeBytes != null ? String(HTMLAttributes.sizeBytes) : null,
      "data-src": sanitizeMediaSrc(HTMLAttributes.src || "") || null,
    });
    const { title, fileName, mimeType, assetId, sizeBytes, ...rest } = HTMLAttributes;
    const safeSrc = sanitizeMediaSrc(HTMLAttributes.src || "");
    return [
      "figure",
      mergeAttributes(rest, dataAttrs, {
        "data-file-attachment": "true",
      }),
      [
        "a",
        mergeAttributes({
          href: safeSrc || "#",
          target: "_blank",
          rel: "noopener noreferrer",
          download: fileName || title || "",
        }),
        title || fileName || "Attachment",
      ],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AttachmentNodeView);
  },

  addCommands() {
    return {
      setAttachment:
        (attrs) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              ...attrs,
              src: sanitizeMediaSrc(attrs.src || ""),
            },
          });
        },
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          // Always emit HTML block markup so the attachment node round-trips
          // back into the custom attachment extension instead of degrading to
          // a plain markdown link.
          state.write(`<figure data-file-attachment="true" data-src="${escapeAttr(node.attrs.src)}"`);
          if (node.attrs.title) state.write(` data-title="${escapeAttr(node.attrs.title)}"`);
          if (node.attrs.fileName) state.write(` data-file-name="${escapeAttr(node.attrs.fileName)}"`);
          if (node.attrs.mimeType) state.write(` data-mime-type="${escapeAttr(node.attrs.mimeType)}"`);
          if (node.attrs.assetId) state.write(` data-asset-id="${escapeAttr(node.attrs.assetId)}"`);
          if (node.attrs.sizeBytes != null) state.write(` data-file-size-bytes="${escapeAttr(String(node.attrs.sizeBytes))}"`);
          state.write(`><a href="${escapeAttr(node.attrs.src)}" target="_blank" rel="noopener noreferrer" download="${escapeAttr((node.attrs.fileName || node.attrs.title || "attachment").toString())}">`);
          state.write(`${escapeAttr(node.attrs.title || node.attrs.fileName || "Attachment")}`);
          state.write(`</a></figure>`);
          state.closeBlock(node);
        },
        parse: {},
      },
    };
  },
});

export default AttachmentExtension;
