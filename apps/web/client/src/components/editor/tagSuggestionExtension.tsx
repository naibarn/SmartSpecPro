import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { ReactRenderer } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import tippy, { type Instance } from "tippy.js";

import KnowledgeAutocompleteMenu, {
  type KnowledgeAutocompleteItem,
  type KnowledgeAutocompleteMenuRef,
} from "./KnowledgeAutocompleteMenu";

const TAG_SUGGESTION_PLUGIN_KEY = new PluginKey("tagSuggestion");
const TAG_QUERY_PATTERN = /(?:[\s([{])#([A-Za-z0-9/_-]{1,64})$/;

function findTagSuggestionMatch({
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

  const match = TAG_QUERY_PATTERN.exec(text);
  if (!match) {
    return null;
  }

  const query = match[1] ?? "";
  if (!query) {
    return null;
  }

  return {
    range: {
      from: $position.pos - query.length - 1,
      to: $position.pos,
    },
    query,
    text: `#${query}`,
  };
}

export function createTagSuggestionExtension(options: {
  getItems: (
    query: string,
  ) => Promise<KnowledgeAutocompleteItem[]> | KnowledgeAutocompleteItem[];
}): Extension {
  return Extension.create({
    name: "tagSuggestion",

    addOptions() {
      return {
        suggestion: {
          char: "#",
          pluginKey: TAG_SUGGESTION_PLUGIN_KEY,
          command: ({
            editor,
            range,
            props,
          }: {
            editor: any;
            range: { from: number; to: number };
            props: KnowledgeAutocompleteItem;
          }) => {
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .insertContent(`#${props.label} `)
              .run();
          },
          items: async ({ query }: { query: string }) => options.getItems(query),
          findSuggestionMatch: findTagSuggestionMatch,
          render: () => {
            let component: ReactRenderer<KnowledgeAutocompleteMenuRef>;
            let popup: Instance[];

            return {
              onStart(props: any) {
                component = new ReactRenderer(KnowledgeAutocompleteMenu, {
                  props: {
                    ...props,
                    title: "Reuse tag",
                    emptyMessage: "No matching tags found.",
                    icon: "tag",
                  },
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
                  maxWidth: 380,
                });
              },

              onUpdate(props: any) {
                component?.updateProps({
                  ...props,
                  title: "Reuse tag",
                  emptyMessage: "No matching tags found.",
                  icon: "tag",
                });

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

export type { KnowledgeAutocompleteItem };
