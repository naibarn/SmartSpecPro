import type { TiptapEditorTemplate } from "./types";

export interface EditorTemplatePreset {
  id: TiptapEditorTemplate;
  label: string;
  description: string;
  badgeLabel: string;
  badgeClassName: string;
  shellClassName: string;
  contentShellClassName: string;
  contentInnerClassName: string;
  showBubbleMenu: boolean;
}

export const EDITOR_TEMPLATE_PRESETS: Record<TiptapEditorTemplate, EditorTemplatePreset> = {
  simple: {
    id: "simple",
    label: "Simple",
    description: "A compact toolbar for fast edits.",
    badgeLabel: "Tiptap",
    badgeClassName: "border-sky-200 bg-sky-50 text-sky-700",
    shellClassName: "mb-3 shrink-0 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-sm backdrop-blur sm:p-2.5",
    contentShellClassName: "flex-1 min-h-0 overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm",
    contentInnerClassName: "",
    showBubbleMenu: false,
  },
  page: {
    id: "page",
    label: "Page",
    description: "Sticky controls for long-form editing.",
    badgeLabel: "Page",
    badgeClassName: "border-slate-200 bg-slate-50 text-slate-600",
    shellClassName: "mb-3 shrink-0 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-sm backdrop-blur sm:p-2.5",
    contentShellClassName: "flex-1 min-h-0 overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm bg-gradient-to-b from-white via-white to-slate-50/60 p-2 sm:p-3",
    contentInnerClassName: "mx-auto w-full max-w-6xl",
    showBubbleMenu: true,
  },
};

export function getEditorTemplatePreset(template: TiptapEditorTemplate): EditorTemplatePreset {
  return EDITOR_TEMPLATE_PRESETS[template];
}
