import { Image } from "@tiptap/extension-image";
import { mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import {
  sanitizeMediaSrc,
  buildDataAttrs,
  parseDataAttr,
  escapeAttr,
} from "./mediaSerializationRules";
import ImageNodeView from "../nodeviews/ImageNodeView";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    image: {
      setImage: (attrs: {
        src: string;
        alt?: string;
        caption?: string | null;
        width?: string | null;
        alignment?: string | null;
        assetId?: string | null;
      }) => ReturnType;
    };
  }
}

export const ImageExtension = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      src: {
        default: "",
        parseHTML: (element: HTMLElement) => {
          const img =
            element.tagName === "IMG"
              ? element
              : element.querySelector("img");
          const raw = img?.getAttribute("src") ?? "";
          return sanitizeMediaSrc(raw);
        },
      },
      alt: {
        default: "",
        parseHTML: (element: HTMLElement) => {
          const img =
            element.tagName === "IMG"
              ? element
              : element.querySelector("img");
          return img?.getAttribute("alt") ?? "";
        },
      },
      caption: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          // Check for <figcaption> child first, then data-caption attribute
          const figcaption = element.querySelector("figcaption");
          if (figcaption) return figcaption.textContent ?? null;
          return parseDataAttr(element, "data-caption");
        },
      },
      width: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const img =
            element.tagName === "IMG"
              ? element
              : element.querySelector("img");
          return img?.getAttribute("width") ?? null;
        },
      },
      alignment: {
        default: "center",
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-alignment") ?? "center",
      },
      assetId: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          parseDataAttr(element, "data-asset-id"),
      },
    };
  },

  parseHTML() {
    return [
      { tag: "img[src]" },
      {
        tag: "figure",
        getAttrs: (element: HTMLElement) => {
          const img = element.querySelector("img");
          if (!img) return false;
          return {};
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const dataAttrs = buildDataAttrs({
      "data-caption": HTMLAttributes.caption,
      "data-asset-id": HTMLAttributes.assetId,
      "data-alignment": HTMLAttributes.alignment,
    });
    const { caption, assetId, alignment, ...rest } = HTMLAttributes;
    return [
      "img",
      mergeAttributes(rest, dataAttrs),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
  },

  addCommands() {
    return {
      setImage:
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
          const src = node.attrs.src ?? "";
          const alt = node.attrs.alt ?? "";
          const caption = node.attrs.caption;
          const assetId = node.attrs.assetId;
          const alignment = node.attrs.alignment;

          // If only basic attributes, use standard markdown image syntax
          if (!caption && !assetId && (!alignment || alignment === "center")) {
            state.write(`![${escapeAttr(alt)}](${escapeAttr(src)})`);
            state.closeBlock(node);
            return;
          }

          // Use HTML figure for extended attributes
          state.write(`<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}"`);
          if (caption) state.write(` data-caption="${escapeAttr(caption)}"`);
          if (assetId) state.write(` data-asset-id="${escapeAttr(assetId)}"`);
          if (alignment) state.write(` data-alignment="${escapeAttr(alignment)}"`);
          state.write(">");
          state.closeBlock(node);
        },
        parse: {},
      },
    };
  },
});

export default ImageExtension;
