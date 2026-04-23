import { Node, mergeAttributes, nodeInputRule } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { escapeAttr } from "./mediaSerializationRules";
import {
  parseWikiLinkTarget,
  serializeWikiLinkTarget,
} from "@/lib/wikiLink";
import WikiLinkNodeView from "../nodeviews/WikiLinkNodeView";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    wikiLink: {
      setWikiLink: (attrs: {
        reference: string;
        label?: string | null;
      }) => ReturnType;
    };
  }
}

const WIKI_LINK_INPUT_PATTERN = /\[\[([^\]\n]+?)\]\]$/;

function escapeHtmlText(value: string): string {
  return escapeAttr(value).replace(/'/g, "&#39;");
}

function installWikiLinkMarkdownIt(md: any) {
  if (md.__wikiLinkInstalled) {
    return;
  }

  md.inline.ruler.before("link", "wikilink", (state: any, silent: boolean) => {
    const start = state.pos;
    const src = state.src;

    if (src.charCodeAt(start) !== 0x5b || src.charCodeAt(start + 1) !== 0x5b) {
      return false;
    }

    const closeIndex = src.indexOf("]]", start + 2);
    if (closeIndex < 0) {
      return false;
    }

    const rawBody = src.slice(start + 2, closeIndex);
    if (!rawBody || rawBody.includes("\n")) {
      return false;
    }

    const target = parseWikiLinkTarget(rawBody);
    if (!target) {
      return false;
    }

    if (!silent) {
      const token = state.push("wikilink", "span", 0);
      token.meta = target;
    }

    state.pos = closeIndex + 2;
    return true;
  });

  md.renderer.rules.wikilink = (tokens: any[], idx: number) => {
    const target = tokens[idx]?.meta;
    const reference =
      target && typeof target.reference === "string" ? target.reference : "";
    const label = target && typeof target.label === "string"
      ? target.label
      : reference;

    return `<span data-wikilink="true" data-reference="${escapeAttr(reference)}" data-label="${escapeAttr(label)}" class="wiki-link-chip">${escapeHtmlText(label)}</span>`;
  };

  md.__wikiLinkInstalled = true;
}

export const WikiLinkExtension = Node.create({
  name: "wikiLink",

  group: "inline",

  inline: true,

  atom: true,

  selectable: true,

  draggable: false,

  addAttributes() {
    return {
      reference: {
        default: "",
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-reference") ?? "",
      },
      label: {
        default: "",
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-label")
          ?? element.textContent
          ?? "",
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-wikilink='true']",
        priority: 1000,
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const label = String(HTMLAttributes.label ?? HTMLAttributes.reference ?? "");
    const reference = String(HTMLAttributes.reference ?? "");
    const { label: _label, reference: _reference, ...rest } = HTMLAttributes;

    return [
      "span",
      mergeAttributes(rest, {
        "data-wikilink": "true",
        "data-reference": reference,
        "data-label": label,
        "data-node-type": "wiki-link",
        "contenteditable": "false",
        "role": "link",
        "tabindex": "0",
        "aria-label": `Open linked note ${label}`,
        title:
          reference && reference !== label
            ? `${label} (${reference})`
            : label,
        class: "wiki-link-chip",
      }),
      label,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(WikiLinkNodeView);
  },

  addCommands() {
    return {
      setWikiLink:
        (attrs) =>
        ({ commands }) => {
          const reference = String(attrs.reference ?? "").trim();
          const label = String(attrs.label ?? reference).trim() || reference;

          if (!reference) {
            return false;
          }

          return commands.insertContent({
            type: this.name,
            attrs: {
              reference,
              label,
            },
          });
        },
    };
  },

  addInputRules() {
    return [
      nodeInputRule({
        find: WIKI_LINK_INPUT_PATTERN,
        type: this.type,
        getAttributes: (match) => {
          const target = parseWikiLinkTarget(match[1] ?? "");
          return target ?? { reference: "", label: "" };
        },
      }),
    ];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write(
            serializeWikiLinkTarget({
              reference: String(node.attrs.reference ?? ""),
              label: String(node.attrs.label ?? ""),
            }),
          );
        },
        parse: {
          setup(md: any) {
            installWikiLinkMarkdownIt(md);
          },
        },
      },
    };
  },
});

export default WikiLinkExtension;
