function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeFieldKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function sanitizeValueForLlm(key: string, value: unknown): unknown {
  const normalizedKey = normalizeFieldKey(key);

  if (normalizedKey === "sourcevideourl") {
    return typeof value === "string" && value.trim() ? "[provided]" : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => (
      isPlainObject(item)
        ? Object.fromEntries(
          Object.entries(item).map(([nestedKey, nestedValue]) => [nestedKey, sanitizeValueForLlm(nestedKey, nestedValue)]),
        )
        : item
    ));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([nestedKey, nestedValue]) => [nestedKey, sanitizeValueForLlm(nestedKey, nestedValue)]),
    );
  }

  return value;
}

function sanitizeConditionalSkillInputs(
  payload: Record<string, unknown>,
  referenceImageCount: number,
): void {
  if (payload.delivery_mode === "multi_shot_single_video") {
    delete payload.multi_video_strategy;
    delete payload.video_count;
    delete payload.video_segments;
  }

  if (referenceImageCount <= 0) {
    delete payload.reference_images;
    delete payload.reference_image_1_role;
    delete payload.reference_image_2_role;
    delete payload.reference_image_3_role;
    delete payload.reference_image_4_role;
    delete payload.reference_image_notes;
    return;
  }

  for (let index = referenceImageCount + 1; index <= 4; index += 1) {
    delete payload[`reference_image_${index}_role`];
  }
}

export function buildCustomSkillPromptInputPayload(
  userInputs: Record<string, unknown>,
  options?: { referenceImageCount?: number },
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(userInputs)) {
    const normalizedKey = normalizeFieldKey(key);
    if (normalizedKey === "referenceimages" || normalizedKey === "referenceimageurls") {
      continue;
    }
    payload[key] = sanitizeValueForLlm(key, value);
  }

  const referenceImageCount = options?.referenceImageCount ?? 0;
  if (referenceImageCount > 0) {
    payload.reference_images = Array.from(
      { length: referenceImageCount },
      (_, index) => `@Image${index + 1}`,
    );
  }

  sanitizeConditionalSkillInputs(payload, referenceImageCount);

  return payload;
}

export function buildCustomSkillUserPrompt(
  userInputs: Record<string, unknown>,
  options?: { referenceImageCount?: number },
): string {
  const payload = buildCustomSkillPromptInputPayload(userInputs, options);
  const serializedPayload = JSON.stringify(payload, null, 2);

  if (!serializedPayload || serializedPayload === "{}") {
    return "Please execute the skill and return only the final output requested by the system prompt.";
  }

  const parts = [
    "Execute the skill using the following user inputs.",
    "Treat these values as authoritative. If they already provide enough direction, do not ask the user to provide the topic or restate missing basics.",
    "Treat `delivery_mode` as the authoritative packaging choice. If it is `multi_shot_single_video`, produce exactly one prompt package and ignore any stale multi-video defaults.",
    "Only treat reference images as real when the `reference_images` array is present in USER_INPUTS_JSON. If that array is absent, do not invent `@ImageN` handles or imply that files were uploaded.",
    "USER_INPUTS_JSON:",
    serializedPayload,
  ];

  if ((options?.referenceImageCount ?? 0) > 0) {
    parts.push("Attached reference images are supplied separately as vision inputs and correspond to the `reference_images` handles above.");
  }

  parts.push("Return only the final output requested by the system prompt.");

  return parts.join("\n\n");
}
