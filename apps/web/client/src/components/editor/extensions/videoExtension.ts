import { Node, mergeAttributes } from "@tiptap/core";
import {
  sanitizeMediaSrc,
  buildDataAttrs,
  parseDataAttr,
  escapeAttr,
} from "./mediaSerializationRules";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    video: {
      setVideo: (attrs: {
        src: string;
        poster?: string | null;
        caption?: string | null;
        assetId?: string | null;
        controls?: boolean;
        width?: string | null;
        height?: string | null;
      }) => ReturnType;
    };
  }
}

export const VideoExtension = Node.create({
  name: "video",

  group: "block",

  atom: true,

  draggable: true,

  addAttributes() {
    return {
      src: {
        default: "",
        parseHTML: (element: HTMLElement) =>
          sanitizeMediaSrc(element.getAttribute("src") ?? ""),
      },
      poster: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const val = parseDataAttr(element, "data-poster");
          return val ? sanitizeMediaSrc(val) : null;
        },
      },
      caption: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          parseDataAttr(element, "data-caption"),
      },
      assetId: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          parseDataAttr(element, "data-asset-id"),
      },
      controls: {
        default: true,
        parseHTML: (element: HTMLElement) =>
          element.hasAttribute("controls"),
      },
      width: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("width"),
      },
      height: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("height"),
      },
    };
  },

  parseHTML() {
    return [{ tag: "video[src]" }];
  },

  renderHTML({ HTMLAttributes }) {
    const dataAttrs = buildDataAttrs({
      "data-poster": HTMLAttributes.poster,
      "data-caption": HTMLAttributes.caption,
      "data-asset-id": HTMLAttributes.assetId,
    });
    const { poster, caption, assetId, controls, ...rest } = HTMLAttributes;
    return [
      "video",
      mergeAttributes(rest, dataAttrs, controls ? { controls: "" } : {}),
    ];
  },

  addCommands() {
    return {
      setVideo:
        (attrs) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              ...attrs,
              src: sanitizeMediaSrc(attrs.src || ""),
              poster: attrs.poster ? sanitizeMediaSrc(attrs.poster) : null,
            },
          });
        },
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write(`<video src="${escapeAttr(node.attrs.src)}" controls`);
          if (node.attrs.poster) state.write(` data-poster="${escapeAttr(node.attrs.poster)}"`);
          if (node.attrs.caption) state.write(` data-caption="${escapeAttr(node.attrs.caption)}"`);
          if (node.attrs.assetId) state.write(` data-asset-id="${escapeAttr(node.attrs.assetId)}"`);
          if (node.attrs.width) state.write(` width="${escapeAttr(node.attrs.width)}"`);
          if (node.attrs.height) state.write(` height="${escapeAttr(node.attrs.height)}"`);
          state.write("></video>");
          state.closeBlock(node);
        },
        parse: {},
      },
    };
  },
});

export default VideoExtension;
