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

function getStringInput(payload: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function hasThaiText(value: string): boolean {
  return /[\u0E00-\u0E7F]/.test(value);
}

function readPositiveNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function isSeparateVoiceStoryboardTimingPayload(payload: Record<string, unknown>): boolean {
  const workflow = String(payload.videoAudioWorkflow ?? "").trim();
  const durationSeconds = readPositiveNumber(payload.storyboardAudioDurationSeconds);
  const clipDurationSeconds = readPositiveNumber(payload.storyboardClipDurationSeconds);
  const promptCount = readPositiveNumber(payload.storyboardAudioPromptCount);
  return (
    (workflow === "separate_voice" || workflow === "separate_voice_music")
    && durationSeconds !== null
    && clipDurationSeconds !== null
    && promptCount !== null
  );
}

function isReferenceAssetStoryboardOrNewsPayload(payload: Record<string, unknown>): boolean {
  const contentMode = String(payload.contentMode ?? "").trim();
  return (
    (contentMode === "storyboard" || contentMode === "news_narration")
    && String(payload.generationType ?? "").trim() !== "FIRST_AND_LAST_FRAMES_2_VIDEO"
  );
}

function parseStoryboardLayoutPreset(value: unknown): {
  canvasRatio: string;
  grid: string;
  totalFrames: number;
  frameRatio: string | null;
  cropSafe: boolean;
} | null {
  const preset = typeof value === "string" ? value.trim() : "";
  if (!preset || preset === "auto") return null;

  const match = preset.match(/^canvas_(\d+)_(\d+)_grid_(\d+)x(\d+)(?:_frame_(\d+)_(\d+)_exact|_crop_safe)$/);
  if (!match) return null;

  const columns = Number(match[3]);
  const rows = Number(match[4]);
  if (!Number.isFinite(columns) || !Number.isFinite(rows) || columns <= 0 || rows <= 0) {
    return null;
  }

  return {
    canvasRatio: `${match[1]}:${match[2]}`,
    grid: `${columns}x${rows}`,
    totalFrames: columns * rows,
    frameRatio: match[5] && match[6] ? `${match[5]}:${match[6]}` : null,
    cropSafe: preset.endsWith("_crop_safe"),
  };
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
  const layoutContract = parseStoryboardLayoutPreset(payload.storyboard_layout_preset);
  if (layoutContract && (!payload.generation_mode || payload.generation_mode === "auto")) {
    payload.generation_mode = "multi_frame_storyboard";
  }
  if (layoutContract && (!payload.aspect_ratio || payload.aspect_ratio === "auto")) {
    payload.aspect_ratio = layoutContract.canvasRatio;
  }

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
  ];

  if (payload.response_mode === "text_prompt") {
    const sourcePrompt = getStringInput(payload, ["topic", "prompt", "request", "userIdea", "idea"]);
    const targetLanguage = typeof payload.target_language === "string" ? payload.target_language : "auto";
    const languageInstruction = targetLanguage === "auto"
      ? hasThaiText(sourcePrompt)
        ? "The source idea is Thai. Write the final prompt in Thai."
        : "Write the final prompt in the same language as the source idea."
      : `Write the final prompt in ${targetLanguage}.`;
    parts.push(
      "The requested response mode is `text_prompt`: rewrite and expand the user's source idea into a production-ready image generation prompt.",
      "Do not return the source idea unchanged. Do not merely translate it. Add concrete visual detail: subject, pose/action, environment, composition, camera/framing, lighting, color, texture, mood, and relevant constraints.",
      languageInstruction,
      "Use the selected skill's own instructions, input schema defaults, and auto-field inference rules to decide which technical details and constraints are relevant. Do not hard-code one fixed style, lens, camera setup, or safety wording for every request.",
      "The output should be materially richer than the source idea and should preserve any explicit user constraints exactly.",
      "Return plain prompt text only, with no JSON, no Markdown fence, no labels, no review notes, and no explanation.",
    );
    if (sourcePrompt) {
      parts.push(`SOURCE_PROMPT_TO_REWRITE:\n${sourcePrompt}`);
    }
  }

  if (isSeparateVoiceStoryboardTimingPayload(payload)) {
    const promptCount = Math.max(1, Math.ceil(readPositiveNumber(payload.storyboardAudioPromptCount) ?? 1));
    const clipDurationSeconds = readPositiveNumber(payload.storyboardClipDurationSeconds);
    const durationSeconds = readPositiveNumber(payload.storyboardAudioDurationSeconds);
    parts.push(
      "AUDIO_FIRST_STORYBOARD_PROMPT_COUNT_CONTRACT:",
      `The attached or prepared voice audio is ${durationSeconds} seconds and each storyboard video prompt is ${clipDurationSeconds} seconds.`,
      `The final answer must contain exactly ${promptCount} parseable video prompt blocks, with headers PROMPT 1 through PROMPT ${promptCount}.`,
      `Every prompt header must use the configured clip duration, for example PROMPT N (${clipDurationSeconds} seconds):.`,
      "Do not stop at 10 prompts, do not treat sceneCount or UI defaults as a cap, and do not use ellipses or placeholder continuation lines.",
      "For storyboard mode, distribute the same continuous story, recurring reference-image characters, reactions, B-roll, camera changes, and transitions across every required prompt block.",
    );
  }

  const layoutContract = parseStoryboardLayoutPreset(payload.storyboard_layout_preset);
  if (layoutContract) {
    parts.push(
      "STORYBOARD_LAYOUT_CONTRACT:",
      `The selected storyboard_layout_preset requires one single ${layoutContract.canvasRatio} storyboard image containing exactly ${layoutContract.totalFrames} frames in a ${layoutContract.grid} grid.`,
      `Do not return fewer than ${layoutContract.totalFrames} scenes or panels. Do not summarize the storyboard into 3 scenes.`,
      `The final prompt must explicitly say: ${layoutContract.grid} grid, ${layoutContract.totalFrames} total frames, ${layoutContract.canvasRatio} final canvas.`,
      layoutContract.frameRatio
        ? `Every frame must use exact ${layoutContract.frameRatio} composition.`
        : "Every frame must be crop-safe with generous margins around product, person, hands, and key actions.",
      "Write one distinct scene or panel instruction for every required frame.",
      "Do not duplicate the same sentence under each scene heading.",
      "Do not output JSON; write this storyboard as plain prompt text only.",
    );
  }

  parts.push("USER_INPUTS_JSON:", serializedPayload);

  if ((options?.referenceImageCount ?? 0) > 0) {
    parts.push(
      "Attached reference images are supplied separately as vision inputs and correspond to the `reference_images` handles above.",
      "Analyze every attached image with vision before writing the final answer. Assign each handle the best role from: character/person identity, product/brand/object, animal/prop, scene/location/background, start frame, end frame, or supporting visual.",
      "Use the detected roles in the final prompt output instead of generic wording. If the skill outputs REFERENCE NOTES, CONTINUITY NOTES, per-scene prompts, or video prompts, include the relevant @ImageN handle(s), the role, and the concrete visual details to preserve.",
      "Do not claim an image is a person/product/scene unless the vision input supports that role; choose the most useful role for the user's media generation goal.",
    );
    if (isReferenceAssetStoryboardOrNewsPayload(payload)) {
      parts.push(
        "For contentMode storyboard or news_narration, attached images must be declared as reference assets, not start frames, unless generationType is FIRST_AND_LAST_FRAMES_2_VIDEO.",
        "In REFERENCE NOTES, write each relevant handle with explicit wording such as `@Image1 is used as a reference asset for character identity, not as a start frame` or `@Image2 is used as a reference asset for the scene/background, not as a start frame`.",
        "Do not call any @ImageN a Start frame, End frame, first frame, last frame, frozen opening frame, or exact video frame unless generationType is FIRST_AND_LAST_FRAMES_2_VIDEO.",
      );
    }
  }

  parts.push("Return only the final output requested by the system prompt.");

  return parts.join("\n\n");
}
