export const PRESENTATION_TEMPLATE_SOURCE = "presentation_template";
export const PRESENTATION_PROJECT_SOURCE = "presentation_project";

type UnknownRecord = Record<string, unknown>;

function toRecord(value: unknown): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as UnknownRecord;
}

export function isPresentationTemplateItem(input: {
  source?: unknown;
  metadata?: unknown;
}): boolean {
  const source = String(input.source || "").toLowerCase();
  const metadata = toRecord(input.metadata);
  const sourceType = String(metadata.source_type || metadata.sourceType || "").toLowerCase();
  const presentationType = String(
    metadata.presentation_type || metadata.presentationType || metadata.kind || "",
  ).toLowerCase();

  return (
    source.includes("template")
    || Boolean(metadata.isTemplate)
    || Boolean(metadata.is_template)
    || Boolean(metadata.template)
    || sourceType.includes("template")
    || presentationType === "template"
  );
}

