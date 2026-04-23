import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { ReactRenderer } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import tippy, { type Instance } from "tippy.js";

import KnowledgeAutocompleteMenu, {
  type KnowledgeAutocompleteItem,
  type KnowledgeAutocompleteMenuRef,
} from "./KnowledgeAutocompleteMenu";

const PROPERTY_REFERENCE_SUGGESTION_PLUGIN_KEY = new PluginKey(
  "propertyReferenceSuggestion",
);
const PROPERTY_REFERENCE_PATTERN = /(?:^|\n)([A-Za-z][A-Za-z0-9_-]{0,63})::$/;

function findPropertyReferenceSuggestionMatch({
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

  const match = PROPERTY_REFERENCE_PATTERN.exec(text);
  if (!match) {
    return null;
  }

  const query = match[1] ?? "";
  if (!query) {
    return null;
  }

  return {
    range: {
      from: $position.pos - query.length - 2,
      to: $position.pos,
    },
    query,
    text: `${query}::`,
  };
}

export function createPropertyReferenceSuggestionExtension(options: {
  getItems: (
    query: string,
  ) => Promise<KnowledgeAutocompleteItem[]> | KnowledgeAutocompleteItem[];
}): Extension {
  return Extension.create({
    name: "propertyReferenceSuggestion",

    addOptions() {
      return {
        suggestion: {
          char: ":",
          pluginKey: PROPERTY_REFERENCE_SUGGESTION_PLUGIN_KEY,
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
              .insertContent(`${props.label}:: `)
              .run();
          },
          items: async ({ query }: { query: string }) => options.getItems(query),
          findSuggestionMatch: findPropertyReferenceSuggestionMatch,
          render: () => {
            let component: ReactRenderer<KnowledgeAutocompleteMenuRef>;
            let popup: Instance[];

            return {
              onStart(props: any) {
                component = new ReactRenderer(KnowledgeAutocompleteMenu, {
                  props: {
                    ...props,
                    title: "Reuse property",
                    emptyMessage: "No matching properties found.",
                    icon: "property",
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
                  maxWidth: 400,
                });
              },

              onUpdate(props: any) {
                component?.updateProps({
                  ...props,
                  title: "Reuse property",
                  emptyMessage: "No matching properties found.",
                  icon: "property",
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
