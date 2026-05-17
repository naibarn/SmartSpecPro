export interface MediaStudioAutoPromptSchemaLike {
  sections?: Array<{
    fields?: Array<{
      id?: string | null;
    }>;
  }>;
}

export interface BuildMediaStudioAutoPromptIdeaInput {
  mainPrompt?: string | null;
  advancedRequest?: string | null;
  dynamicFormValues?: Record<string, unknown> | null;
  skillSchema?: MediaStudioAutoPromptSchemaLike | null;
}

const IMAGE_FIELD_KEYWORDS = [
  "image",
  "images",
  "referenceimage",
  "referenceimages",
  "referenceproductimages",
  "referencecharacterimages",
  "referenceenvironmentimages",
] as const;

const AUTO_PROMPT_TEXT_FIELD_PRIORITIES = [
  "topic",
  "request",
  "prompt",
  "useridea",
  "idea",
  "concept",
  "promptgoal",
  "description",
  "mainsubject",
  "subject",
  "setting",
  "action",
  "dialogueortext",
  "projecttitle",
  "continuitynotes",
  "referencenotes",
] as const;

const AUTO_PROMPT_TEXT_FIELD_SET = new Set<string>(AUTO_PROMPT_TEXT_FIELD_PRIORITIES);

function normalizeFieldKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function hasMeaningfulText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim() !== ".";
}

function humanizeFieldKey(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function isUsableImageReferenceUrl(value: string): boolean {
  const trimmed = value.trim();
  return Boolean(
    trimmed
      && (
        trimmed.startsWith("http://")
        || trimmed.startsWith("https://")
        || trimmed.startsWith("/uploads/")
        || trimmed.startsWith("/api/storage/")
      ),
  );
}

function collectImageReferenceUrlsFromValue(value: unknown, urls: string[]): void {
  if (typeof value === "string") {
    if (isUsableImageReferenceUrl(value)) {
      urls.push(value.trim());
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectImageReferenceUrlsFromValue(item, urls));
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  const record = value as Record<string, unknown>;
  for (const key of ["url", "source_url", "sourceUrl", "image_url", "imageUrl"]) {
    collectImageReferenceUrlsFromValue(record[key], urls);
  }
}

export function extractMediaStudioDynamicImageUrls(
  dynamicFormValues?: Record<string, unknown> | null,
): string[] {
  if (!dynamicFormValues) {
    return [];
  }

  const urls: string[] = [];
  for (const [key, value] of Object.entries(dynamicFormValues)) {
    const normalizedKey = normalizeFieldKey(key);
    const isImageField = IMAGE_FIELD_KEYWORDS.some((keyword) => normalizedKey.includes(keyword));
    if (!isImageField) {
      continue;
    }
    collectImageReferenceUrlsFromValue(value, urls);
  }

  const seen = new Set<string>();
  return urls.filter((url) => {
    if (seen.has(url)) {
      return false;
    }
    seen.add(url);
    return true;
  });
}

function getOrderedSchemaFieldIds(
  dynamicFormValues: Record<string, unknown>,
  skillSchema?: MediaStudioAutoPromptSchemaLike | null,
): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();

  if (Array.isArray(skillSchema?.sections)) {
    for (const section of skillSchema.sections) {
      if (!Array.isArray(section?.fields)) continue;
      for (const field of section.fields) {
        if (typeof field?.id !== "string" || !field.id.trim()) continue;
        if (field.id in dynamicFormValues && !seen.has(field.id)) {
          ordered.push(field.id);
          seen.add(field.id);
        }
      }
    }
  }

  for (const key of Object.keys(dynamicFormValues)) {
    if (!seen.has(key)) {
      ordered.push(key);
      seen.add(key);
    }
  }

  return ordered;
}

export function buildMediaStudioAutoPromptIdea(input: BuildMediaStudioAutoPromptIdeaInput): string {
  const mainPrompt = input.mainPrompt?.trim() ?? "";
  const advancedRequest = input.advancedRequest?.trim() ?? "";
  const dynamicFormValues = input.dynamicFormValues ?? {};

  const orderedFieldIds = getOrderedSchemaFieldIds(dynamicFormValues, input.skillSchema);
  const entries: Array<{ label: string; value: string }> = [];
  const seenValues = new Set<string>();

  const pushEntry = (label: string, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const dedupeKey = trimmed.toLowerCase();
    if (seenValues.has(dedupeKey)) return;
    seenValues.add(dedupeKey);
    entries.push({ label, value: trimmed });
  };

  if (mainPrompt) {
    pushEntry("Prompt", mainPrompt);
  }

  if (advancedRequest) {
    pushEntry("Additional Details", advancedRequest);
  }

  for (const key of orderedFieldIds) {
    const value = dynamicFormValues[key];
    if (!hasMeaningfulText(value)) continue;

    const normalizedKey = normalizeFieldKey(key);
    if (!AUTO_PROMPT_TEXT_FIELD_SET.has(normalizedKey)) continue;

    // `request` is already represented by the dedicated advanced request textarea.
    if (normalizedKey === "request" && advancedRequest) continue;

    pushEntry(humanizeFieldKey(key), value);
  }

  if (entries.length === 0) {
    return "";
  }

  if (entries.length === 1) {
    return entries[0].value;
  }

  return entries
    .map((entry) => `${entry.label}: ${entry.value}`)
    .join("\n\n");
}
