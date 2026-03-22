import { Extension } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import tippy, { type Instance } from "tippy.js";
import SlashCommandMenu from "./SlashCommandMenu";
import type { SlashCommandMenuRef } from "./SlashCommandMenu";
import {
  getSlashCommandItems,
  filterSlashItems,
} from "./slashCommandItems";

export function createSlashCommandExtension(options: {
  onMediaInsert?: (type: "image" | "video" | "audio") => void;
  onFileInsert?: () => void;
}): Extension {
  return Extension.create({
    name: "slashCommand",

    addOptions() {
      return {
        suggestion: {
          char: "/",
          startOfLine: false,
          command: ({
            editor,
            range,
            props,
          }: {
            editor: any;
            range: any;
            props: any;
          }) => {
            props.command({ editor, range });
          },
          items: ({ query }: { query: string }) => {
            const allItems = getSlashCommandItems(options.onMediaInsert, options.onFileInsert);
            return filterSlashItems(allItems, query);
          },
          render: () => {
            let component: ReactRenderer<SlashCommandMenuRef>;
            let popup: Instance[];

            return {
              onStart(props: any) {
                component = new ReactRenderer(SlashCommandMenu, {
                  props,
                  editor: props.editor,
                });

                if (!props.clientRect) return;

                popup = tippy("body", {
                  getReferenceClientRect: props.clientRect,
                  appendTo: () => document.body,
                  content: component.element,
                  showOnCreate: true,
                  interactive: true,
                  trigger: "manual",
                  placement: "bottom-start",
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
