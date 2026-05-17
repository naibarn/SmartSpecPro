export function sanitizeSmartCharacterPromptOutput(content: string): string {
  return content
    .replace(/\s+--(?:ar|aspect)(?:\s+|=)\d+(?::\d+)?(?=[\s.,;:!?)]|$)/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .trim();
}

export function validateSmartCharacterPromptOutput(content: string): { ok: true; content: string } | { ok: false; reason: string } {
  const sanitized = sanitizeSmartCharacterPromptOutput(content);
  if (!sanitized) {
    return { ok: false, reason: "LLM returned an empty prompt." };
  }

  if (sanitized.length < 80) {
    return { ok: false, reason: "LLM returned a prompt that is too short to use." };
  }

  const hasPromptSignal = /(?:portrait|shot|composition|lighting|camera|photography|ภาพ|พรอมต์|ตัวละคร|แสง|กล้อง)/i
    .test(sanitized);
  if (!hasPromptSignal) {
    return { ok: false, reason: "LLM output did not look like an image prompt." };
  }

  return { ok: true, content: sanitized };
}

type JsonRecord = Record<string, unknown>;

const SHOT_LABELS: Record<string, string> = {
  close_up: "close-up portrait",
  portrait: "portrait shot",
  medium: "medium shot",
  full_body: "full body shot",
  upper_body: "upper body portrait",
  three_quarter: "three-quarter portrait",
  profile: "profile portrait",
  over_the_shoulder: "over-the-shoulder portrait",
  walking: "walking portrait",
  action: "action portrait",
  environmental_portrait: "environmental portrait",
  custom: "custom portrait",
};

const DEFAULT_SHOTS = ["close_up", "portrait", "medium", "full_body"];

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function humanize(value: string): string {
  return value.replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

function meaningful(value: unknown): boolean {
  return value !== undefined
    && value !== null
    && value !== ""
    && value !== "auto"
    && value !== false;
}

function collectProfileDetails(value: unknown, prefix = ""): string[] {
  if (!isRecord(value)) return [];

  const details: string[] = [];
  for (const [key, raw] of Object.entries(value)) {
    if (!meaningful(raw)) continue;

    if (Array.isArray(raw)) {
      const items = raw
        .filter(meaningful)
        .map((item) => typeof item === "string" ? humanize(item) : String(item));
      if (items.length > 0) details.push(`${humanize(key)}: ${items.join(", ")}`);
      continue;
    }

    if (isRecord(raw)) {
      details.push(...collectProfileDetails(raw, key));
      continue;
    }

    const label = prefix ? `${humanize(prefix)} ${humanize(key)}` : humanize(key);
    details.push(`${label}: ${typeof raw === "string" ? humanize(raw) : String(raw)}`);
  }

  return details;
}

function getAspectRatioText(value: unknown): string {
  const aspectRatio = typeof value === "string" && value !== "auto" ? value : "9:16";
  switch (aspectRatio) {
    case "16:9":
    case "21:9":
      return `wide ${aspectRatio} composition`;
    case "1:1":
      return "square 1:1 composition";
    case "4:5":
    case "3:4":
    case "2:3":
    case "9:16":
      return `vertical ${aspectRatio} composition`;
    case "3:2":
    case "4:3":
      return `horizontal ${aspectRatio} composition`;
    default:
      return "balanced portrait composition";
  }
}

function getSelectedShots(params: JsonRecord): string[] {
  const shotType = typeof params.shot_types === "string" ? params.shot_types : "portrait";
  const count = Math.max(1, Math.min(8, Number(params.prompt_count) || 1));
  if (shotType === "auto") return DEFAULT_SHOTS.slice(0, count);
  return Array.from({ length: count }, () => shotType);
}

export function buildSmartCharacterPromptOutput(params: JsonRecord): string {
  const profile = isRecord(params.character_profile) ? params.character_profile : {};
  const preferences = isRecord(params.generation_preferences) ? params.generation_preferences : {};
  const name = String(profile.name ?? "").trim();
  const detailText = collectProfileDetails(profile)
    .filter((detail) => !detail.startsWith("name:"))
    .join(", ");
  const preferenceText = collectProfileDetails(preferences).join(", ");
  const aspectText = getAspectRatioText(params.aspect_ratio);
  const hasReferenceImages = Array.isArray(params.reference_images) && params.reference_images.length > 0;
  const referenceText = hasReferenceImages
    ? "Use the uploaded reference images as visual guidance while preserving the submitted character choices."
    : "";
  const shots = getSelectedShots(params);

  const prompts = shots.map((shot, index) => {
    const shotText = SHOT_LABELS[shot] ?? humanize(shot || "portrait");
    const parts = [
      `${index + 1}. ${shotText.toUpperCase()}`,
      "",
      name ? `${shotText} of ${name}.` : `${shotText}.`,
      detailText,
      preferenceText,
      referenceText,
      "professional realistic photography, coherent character identity, concrete visual environment, natural pose, refined lighting, sharp focus, high detail",
      aspectText,
    ].filter(Boolean);

    return sanitizeSmartCharacterPromptOutput(parts.join(" "));
  });

  return sanitizeSmartCharacterPromptOutput(prompts.join("\n\n---\n\n"));
}

export function buildSmartCharacterLlmPrompt(params: JsonRecord): string {
  const profile = isRecord(params.character_profile) ? params.character_profile : {};
  const preferences = isRecord(params.generation_preferences) ? params.generation_preferences : {};
  const name = String(profile.name ?? "").trim();
  const promptCount = Math.max(1, Math.min(4, Number(params.prompt_count) || 1));
  const shotType = typeof params.shot_types === "string" ? params.shot_types : "portrait";
  const aspectText = getAspectRatioText(params.aspect_ratio);

  return [
    "Generate copy-ready AI image prompts from this submitted character form.",
    "Use the form data creatively and coherently; infer natural missing details when the value is auto.",
    "Return plain text only. Do not use JSON, markdown tables, bullets, or code blocks.",
    "Do not include Midjourney/platform command suffixes such as --ar, --aspect, --v, --style, --s, or similar.",
    `Use aspect ratio as normal wording: ${aspectText}.`,
    `Create ${promptCount} prompt(s). Shot type: ${SHOT_LABELS[shotType] ?? humanize(shotType)}.`,
    name
      ? `Character name: ${name}.`
      : "No character name was provided. Do not ask for a name and do not include a placeholder name in the prompt.",
    "",
    "Character profile JSON:",
    JSON.stringify(profile),
    "",
    "Generation preferences JSON:",
    JSON.stringify(preferences),
  ].join("\n");
}
