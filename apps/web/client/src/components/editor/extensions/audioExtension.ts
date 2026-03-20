import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import {
  sanitizeMediaSrc,
  buildDataAttrs,
  parseDataAttr,
  escapeAttr,
} from "./mediaSerializationRules";
import AudioNodeView from "../nodeviews/AudioNodeView";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    audio: {
      setAudio: (attrs: {
        src: string;
        caption?: string | null;
        assetId?: string | null;
        controls?: boolean;
      }) => ReturnType;
    };
  }
}

export const AudioExtension = Node.create({
  name: "audio",

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
    };
  },

  parseHTML() {
    return [{ tag: "audio[src]" }];
  },

  renderHTML({ HTMLAttributes }) {
    const dataAttrs = buildDataAttrs({
      "data-caption": HTMLAttributes.caption,
      "data-asset-id": HTMLAttributes.assetId,
    });
    const { caption, assetId, controls, ...rest } = HTMLAttributes;
    return [
      "audio",
      mergeAttributes(rest, dataAttrs, controls ? { controls: "" } : {}),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AudioNodeView);
  },

  addCommands() {
    return {
      setAudio:
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
          state.write(`<audio src="${escapeAttr(node.attrs.src)}" controls`);
          if (node.attrs.caption) state.write(` data-caption="${escapeAttr(node.attrs.caption)}"`);
          if (node.attrs.assetId) state.write(` data-asset-id="${escapeAttr(node.attrs.assetId)}"`);
          state.write("></audio>");
          state.closeBlock(node);
        },
        parse: {},
      },
    };
  },
});

export default AudioExtension;
