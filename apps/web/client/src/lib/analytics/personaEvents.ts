import { getPostHog } from "@/lib/posthog";

export interface PersonaTemplateAppliedPayload {
  templateIds: string[];
  templateLabels: string[];
  templateCategories: string[];
  templateCount: number;
  applyMode: "single" | "mixed";
  editorMode: "create" | "edit";
  surface: "settings_personas" | "teams_personas";
}

export function trackPersonaTemplateApplied(
  payload: PersonaTemplateAppliedPayload,
): void {
  getPostHog()?.capture("persona_template_applied", {
    template_ids: payload.templateIds,
    template_labels: payload.templateLabels,
    template_categories: payload.templateCategories,
    template_count: payload.templateCount,
    apply_mode: payload.applyMode,
    editor_mode: payload.editorMode,
    surface: payload.surface,
  });
}
