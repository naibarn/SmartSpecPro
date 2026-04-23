import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { ReactRenderer } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import tippy, { type Instance } from "tippy.js";

import WikiLinkSuggestionMenu, {
  type WikiLinkSuggestionItem,
  type WikiLinkSuggestionMenuRef,
} from "./WikiLinkSuggestionMenu";

const WIKI_LINK_SUGGESTION_PLUGIN_KEY = new PluginKey("wikiLinkSuggestion");
const WIKI_LINK_QUERY_PATTERN = /\[\[([^\]\n]*)$/;

function findWikiLinkSuggestionMatch({
  $position,
}: {
  $position: {
    pos: number;
    nodeBefore?: {
      isText?: boolean;
      text?: string;
    } | null;
  };
}) {
  const text = $position.nodeBefore?.isText ? $position.nodeBefore.text ?? "" : "";
  if (!text) {
    return null;
  }

  const match = WIKI_LINK_QUERY_PATTERN.exec(text);
  if (!match || typeof match.index !== "number") {
    return null;
  }

  const from = $position.pos - (match[0]?.length ?? 0);
  const to = $position.pos;

  return {
    range: { from, to },
    query: match[1] ?? "",
    text: match[0] ?? "",
  };
}

export function createWikiLinkSuggestionExtension(options: {
  getItems: (
    query: string,
  ) => Promise<WikiLinkSuggestionItem[]> | WikiLinkSuggestionItem[];
}): Extension {
  return Extension.create({
    name: "wikiLinkSuggestion",

    addOptions() {
      return {
        suggestion: {
          char: "[",
          pluginKey: WIKI_LINK_SUGGESTION_PLUGIN_KEY,
          command: ({
            editor,
            range,
            props,
          }: {
            editor: any;
            range: { from: number; to: number };
            props: WikiLinkSuggestionItem;
          }) => {
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .insertContent([
                {
                  type: "wikiLink",
                  attrs: {
                    reference: props.reference,
                    label: props.label,
                  },
                },
                {
                  type: "text",
                  text: " ",
                },
              ])
              .run();
          },
          items: async ({ query }: { query: string }) => options.getItems(query),
          findSuggestionMatch: findWikiLinkSuggestionMatch,
          render: () => {
            let component: ReactRenderer<WikiLinkSuggestionMenuRef>;
            let popup: Instance[];

            return {
              onStart(props: any) {
                component = new ReactRenderer(WikiLinkSuggestionMenu, {
                  props,
                  editor: props.editor,
                });

                if (!props.clientRect) {
                  return;
                }

                popup = tippy("body", {
                  getReferenceClientRect: props.clientRect,
                  appendTo: () => document.body,
                  content: component.element,
                  showOnCreate: true,
                  interactive: true,
                  trigger: "manual",
                  placement: "bottom-start",
                  maxWidth: 420,
                });
              },

              onUpdate(props: any) {
                component?.updateProps(props);

                if (popup?.[0] && props.clientRect) {
                  popup[0].setProps({
                    getReferenceClientRect: props.clientRect,
                  });
                }
              },

              onKeyDown(props: any) {
                if (props.event.key === "Escape") {
                  popup?.[0]?.hide();
                  return true;
                }

                return component?.ref?.onKeyDown(props) ?? false;
              },

              onExit() {
                popup?.[0]?.destroy();
                component?.destroy();
              },
            };
          },
        },
      };
    },

    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          ...this.options.suggestion,
        }),
      ];
    },
  });
}

export type { WikiLinkSuggestionItem };
