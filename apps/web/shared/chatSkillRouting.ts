const EXPLICIT_TASK_PREFIX_RE =
  /^(?:\/[a-zA-Z0-9-_]+(?:\s+.*)?|(?:ช่วย|ขอ(?:ให้)?|กรุณา|โปรด|please|help(?:\s+me)?|ต้องการ|อยาก)\s*)?(?:เขียน|สร้าง|ทำ|ออกแบบ|วางแผน|วาง|จัดทำ|วิจัย|วิเคราะห์|เปรียบเทียบ|ประเมิน|สรุป|รีวิว|แปล|generate|create|design|build|plan|research|analyze|compare|evaluate|summarize|review|translate)/i;
const PROMPT_CONTEXT_RE =
  /(?:image\s+prompt|video\s+prompt|prompt\s+(?:ภาพ|รูป|วิดีโอ|วีดีโอ)|พรอมต์)/i;
const QUESTION_SIGNAL_RE =
  /(\?|(?:^|[\s])(ไหม|มั้ย|หรือไม่|หรือเปล่า|ยังไง|อย่างไร|อะไร|ไหน|แนะนำ|เหมาะกับ|เหมาะสำหรับ|ควรใช้|ควรไหม|ได้ไหม|ได้มั้ย|ใช่ไหม|หรือไม่)\b)/i;

function hasExplicitTaskVerb(text: string): boolean {
  return EXPLICIT_TASK_PREFIX_RE.test(text) || PROMPT_CONTEXT_RE.test(text);
}

export function looksLikeSkillRequest(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) {
    return false;
  }

  if (normalized.startsWith("/")) {
    return true;
  }

  const explicitTask = hasExplicitTaskVerb(normalized);
  if (!explicitTask) {
    return false;
  }

  // Questions that merely mention a task noun should stay in normal chat.
  // Explicit commands like "ช่วยเขียน..." or "สร้าง..." are allowed.
  if (QUESTION_SIGNAL_RE.test(normalized)) {
    return EXPLICIT_TASK_PREFIX_RE.test(normalized);
  }

  return true;
}

export function shouldAttemptSkillRouting(text: string): boolean {
  return looksLikeSkillRequest(text);
}

export function shouldAutoRunDetectedSkill(input: {
  text: string;
  detectedSkill: { confidence?: number | null } | null;
  minConfidence?: number;
}): boolean {
  if (!input.detectedSkill) {
    return false;
  }

  if (!looksLikeSkillRequest(input.text)) {
    return false;
  }

  const normalized = input.text.trim();
  if (normalized.startsWith("/")) {
    return true;
  }

  const minConfidence = input.minConfidence ?? 0.75;
  const confidence =
    typeof input.detectedSkill.confidence === "number"
      ? input.detectedSkill.confidence
      : Number(input.detectedSkill.confidence ?? NaN);

  return Number.isFinite(confidence) && confidence >= minConfidence;
}
