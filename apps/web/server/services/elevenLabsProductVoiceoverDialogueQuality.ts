export const ELEVENLABS_PRODUCT_VOICEOVER_DIALOGUE_SKILL_ID = "elevenlabs-product-voiceover-dialogue";
const ELEVENLABS_PRODUCT_VOICEOVER_DIALOGUE_LEGACY_SKILL_IDS = new Set([
  "elevenlabs-beauty-dialogue",
]);

export type ElevenLabsProductVoiceoverDialogueQualityIssue = {
  code: string;
  severity: "repair" | "warning";
  message: string;
};

export type ElevenLabsProductVoiceoverDialogueQualityReport = {
  passed: boolean;
  issues: ElevenLabsProductVoiceoverDialogueQualityIssue[];
};

const THAI_CHAR_PATTERN = /[\u0E00-\u0E7F]/g;
const STORYBOARD_METADATA_PATTERN = /(^|\s)(แนวคิด|รายละเอียด|โครงเรื่อง|อารมณ์|Hook|Pain|Agitate|Relief|CTA|Scene|Timeline|Storyboard)\s*[:：]|\/?\s*\d+\s*[-–]\s*\d+\s*s\b|→|·/i;

function countThaiChars(text: string): number {
  return (text.match(THAI_CHAR_PATTERN) || []).length;
}

function readTargetDurationSeconds(userInputs?: Record<string, unknown> | null): number | null {
  const rawValue = userInputs?.target_duration_seconds ?? userInputs?.max_duration_seconds ?? userInputs?.duration_seconds;
  if (rawValue === "auto" || rawValue === undefined || rawValue === null || rawValue === "") return null;
  const parsed = Number(String(rawValue).trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function estimateSpokenSeconds(content: string): number {
  const thaiChars = countThaiChars(content);
  if (thaiChars > 0) return thaiChars / 7.2;
  const words = content.split(/\s+/).filter(Boolean).length;
  return words / 2.6;
}

export function resolveElevenLabsProductVoiceoverDialogueRepairMaxTokens(userInputs?: Record<string, unknown> | null): number {
  const targetDurationSeconds = readTargetDurationSeconds(userInputs);
  if (!targetDurationSeconds || targetDurationSeconds < 60) return 1800;
  return Math.max(1800, Math.min(5200, Math.ceil(targetDurationSeconds * 34)));
}

function normalizeLines(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function isSingleSpeakerVoiceover(userInputs?: Record<string, unknown> | null): boolean {
  const value = userInputs?.speaker_count;
  return value === 1 || value === "1";
}

function isElevenLabsProductVoiceoverDialogueSkill(skillId: string | null | undefined): boolean {
  if (!skillId) return false;
  return skillId === ELEVENLABS_PRODUCT_VOICEOVER_DIALOGUE_SKILL_ID
    || ELEVENLABS_PRODUCT_VOICEOVER_DIALOGUE_LEGACY_SKILL_IDS.has(skillId);
}

export function normalizeElevenLabsProductVoiceoverDialogueOutput(
  content: string,
  skillId: string | null | undefined,
  userInputs?: Record<string, unknown> | null,
): string {
  if (!isElevenLabsProductVoiceoverDialogueSkill(skillId) || !isSingleSpeakerVoiceover(userInputs)) {
    return content;
  }

  const lines = normalizeLines(content);
  const normalizedLines: string[] = [];
  for (const line of lines) {
    if (/^Speaker\s*2\s*[:：]/i.test(line)) {
      continue;
    }

    const speakerOneMatch = line.match(/^Speaker\s*1\s*[:：]\s*(.*)$/i);
    if (speakerOneMatch) {
      const text = String(speakerOneMatch[1] || "").trim();
      if (text) {
        normalizedLines.push(text);
      }
      continue;
    }

    if (/^Speaker\s*\d+\s*[:：]/i.test(line)) {
      continue;
    }

    normalizedLines.push(line);
  }

  return normalizedLines.join("\n").trim();
}

function hasRiskyCleanserClaim(line: string): boolean {
  const lower = line.toLowerCase();
  return [
    /(ฆ่า|กำจัด|ยับยั้ง).{0,18}(เชื้อ|แบคทีเรีย)/i,
    /(ลด|ยุบ|รักษา|ป้องกัน).{0,18}สิว/i,
    /สิว.{0,12}(หาย|แห้ง|ยุบ|ลด)/i,
    /(ลด|แก้|บรรเทา).{0,12}อักเสบ/i,
    /(ซ่อม|ฟื้นฟู|เสริม|สร้าง|ปกป้อง).{0,18}(ชั้นผิว|เกราะผิว|skin barrier)/i,
    /(ไม่ทำลาย|ไม่รบกวน).{0,18}(ชั้นผิว|เกราะผิว|skin barrier)/i,
    /(ไม่มี|ปราศจาก|ไม่ก่อ).{0,18}(สารระคายเคือง|การระคายเคือง|แพ้|allergen|irritation)/i,
    /ผิวโดนทำลาย/i,
  ].some((pattern) => pattern.test(lower));
}

function hasWeakAudioEnergy(line: string): boolean {
  return /ฟังดูดี|น่าสนใจนะ|ต้องลองแล้ว|ตัวเลือกที่ดีเลย/i.test(line);
}

function hasOverbroadResultClaim(line: string): boolean {
  return /ผิวสุขภาพดีขึ้น|เผยผิวใส\s*สุขภาพดี|สุขภาพดีด้วย|ผิวใสอย่างเป็นธรรมชาติ|รู้สึกดีขึ้นได้เลย/i.test(line);
}

function hasOverclaimIntensity(line: string): boolean {
  return /อ่อนโยนสุด\s*ๆ|สุดยอด|เห็นผล|ดีขึ้นทันที|สบายขึ้นทันที|สดชื่นขึ้นทันที|ผิว.*ขึ้นทันที/i.test(line);
}

function hasTrustGuarantee(line: string): boolean {
  return /วางใจได้เลย|มั่นใจได้เลย|เชื่อใจได้เลย|ปลอดภัยแน่นอน|หายห่วง|แน่นอน|ไม่ทำให้.*(แห้ง|ตึง|ระคาย|แพ้)/i.test(line);
}

function hasUnnaturalListenerReaction(line: string): boolean {
  return /^Speaker\s*2\s*[:：].*(ตื่นเต้น!|ว้าว!|เยี่ยมไปเลย!|ต้องจัดแล้ว|ต้องมีแล้ว)/i.test(line);
}

function hasDailyResultPromise(line: string): boolean {
  return /ทุกวัน/i.test(line) && /(สบายขึ้น|ดีขึ้น|สดชื่นขึ้น|ผิว|ใส|สุขภาพดี)/i.test(line);
}

export function evaluateElevenLabsProductVoiceoverDialogueQuality(
  content: string,
  skillId: string | null | undefined,
  userInputs?: Record<string, unknown> | null,
): ElevenLabsProductVoiceoverDialogueQualityReport {
  if (!isElevenLabsProductVoiceoverDialogueSkill(skillId)) {
    return { passed: true, issues: [] };
  }

  const issues: ElevenLabsProductVoiceoverDialogueQualityIssue[] = [];
  const lines = normalizeLines(content);
  const singleSpeakerVoiceover = isSingleSpeakerVoiceover(userInputs);

  if (lines.length === 0) {
    issues.push({ code: "empty_output", severity: "repair", message: "Output is empty." });
  }

  lines.forEach((line, index) => {
    if (singleSpeakerVoiceover && /^Speaker\s*\d+\s*[:：]/i.test(line)) {
      issues.push({
        code: "speaker_format",
        severity: "repair",
        message: `Line ${index + 1} must be plain voiceover text with no Speaker label because speaker_count is 1.`,
      });
    } else if (!singleSpeakerVoiceover && !/^Speaker\s*[12]\s*[:：]/i.test(line)) {
      issues.push({
        code: "speaker_format",
        severity: "repair",
        message: `Line ${index + 1} must start with Speaker 1: or Speaker 2:.`,
      });
    }
    if (hasRiskyCleanserClaim(line)) {
      issues.push({
        code: "cleanser_claim_risk",
        severity: "repair",
        message: `Line ${index + 1} uses treatment, barrier, acne, bacteria, inflammation, or absolute-safety wording that is not suitable for facial cleanser ad audio.`,
      });
    }
    if (hasOverbroadResultClaim(line)) {
      issues.push({
        code: "overbroad_result_claim",
        severity: "repair",
        message: `Line ${index + 1} promises a broad skin-health or clear-skin result instead of routine/sensory language.`,
      });
    }
    if (hasWeakAudioEnergy(line)) {
      issues.push({
        code: "weak_audio_energy",
        severity: "repair",
        message: `Line ${index + 1} is filler and weakens the sales rhythm.`,
      });
    }
    if (hasOverclaimIntensity(line)) {
      issues.push({
        code: "overclaim_intensity",
        severity: "repair",
        message: `Line ${index + 1} uses exaggerated or immediate-result wording that makes the ad sound less credible.`,
      });
    }
    if (hasTrustGuarantee(line)) {
      issues.push({
        code: "trust_guarantee",
        severity: "repair",
        message: `Line ${index + 1} uses guarantee-style reassurance. Use factual label/routine language instead.`,
      });
    }
    if (hasUnnaturalListenerReaction(line)) {
      issues.push({
        code: "unnatural_listener_reaction",
        severity: "repair",
        message: `Line ${index + 1} makes Speaker 2 sound like an announcer instead of a real listener.`,
      });
    }
    if (hasDailyResultPromise(line)) {
      issues.push({
        code: "daily_result_promise",
        severity: "repair",
        message: `Line ${index + 1} promises an ongoing daily skin-feel/result. Use a routine next-step instead.`,
      });
    }
    if (STORYBOARD_METADATA_PATTERN.test(line)) {
      issues.push({
        code: "storyboard_metadata_leak",
        severity: "repair",
        message: `Line ${index + 1} contains planning/storyboard labels or timecodes. Convert the idea into natural spoken ad copy.`,
      });
    }
    if (countThaiChars(line) > 95) {
      issues.push({
        code: "line_too_long_for_audio",
        severity: "warning",
        message: `Line ${index + 1} is long for energetic TTS delivery.`,
      });
    }
  });

  const firstLine = lines[0] || "";
  if (
    firstLine &&
    (countThaiChars(firstLine) > 70 || /สวัสดี|วันนี้|ขอแนะนำ|อยู่เหรอ/i.test(firstLine))
  ) {
    issues.push({
      code: "weak_hook",
      severity: "repair",
      message: "Opening hook is too soft, generic, or slow for stop-scroll audio.",
    });
  }

  const tagCount = lines.join("\n").match(/\[[^\]]+\]/g)?.length ?? 0;
  if (tagCount > 3) {
    issues.push({
      code: "too_many_emotion_tags",
      severity: "repair",
      message: "Use only 2-3 strong emotion tags total.",
    });
  }

  const targetDurationSeconds = readTargetDurationSeconds(userInputs);
  if (targetDurationSeconds && targetDurationSeconds >= 60 && lines.length > 0) {
    const estimatedSeconds = estimateSpokenSeconds(lines.join("\n"));
    const minimumExpectedSeconds = targetDurationSeconds * 0.72;
    if (estimatedSeconds < minimumExpectedSeconds) {
      issues.push({
        code: "duration_too_short",
        severity: "repair",
        message: `Estimated spoken length is about ${Math.round(estimatedSeconds)} seconds, below the requested ${targetDurationSeconds} seconds. Expand into a fuller spoken script, not planning notes.`,
      });
    }
  }

  return {
    passed: !issues.some((issue) => issue.severity === "repair"),
    issues,
  };
}

export function buildElevenLabsProductVoiceoverDialogueRepairPrompt(params: {
  previousContent: string;
  issues: ElevenLabsProductVoiceoverDialogueQualityIssue[];
  userInputs: Record<string, unknown>;
}): string {
  const singleSpeakerVoiceover = isSingleSpeakerVoiceover(params.userInputs);
  const targetDurationSeconds = readTargetDurationSeconds(params.userInputs);
  const durationRules = targetDurationSeconds && targetDurationSeconds >= 60
    ? [
        `- Target spoken duration is ${targetDurationSeconds} seconds. Aim for about ${Math.round(targetDurationSeconds * 0.8)}-${Math.round(targetDurationSeconds * 0.95)} seconds of natural speech.`,
        "- Do not summarize the concept into a short brief. Expand it into a complete spoken ad script with a hook, problem, product fit, usage moment, grounded benefits, and closing CTA.",
        "- For Thai, a 90-second script normally needs roughly 10-14 compact spoken lines, depending on pacing.",
      ]
    : [
        targetDurationSeconds
          ? `- Target spoken duration is ${targetDurationSeconds} seconds. Keep it close to that target without padding.`
          : "- Keep the script concise unless the user selected a longer duration.",
      ];
  const speakerFormatRules = singleSpeakerVoiceover
    ? [
        "- speaker_count is 1, so output a single-speaker voiceover.",
        "- Do not use Speaker 1:, Speaker 2:, or any speaker label.",
        "- Do not include listener reactions, Q&A turns, or a second persona.",
      ]
    : [
        "- Every line starts with Speaker 1: or Speaker 2:.",
        "- Speaker 1 leads the sell; Speaker 2 reacts like a real listener.",
        "- Speaker 2 should ask grounded short questions or objections, not cheerlead.",
      ];

  return [
    "Repair this ElevenLabs Thai product voiceover dialogue for final Media Studio TTS output.",
    "",
    "Return ONLY the corrected dialogue. No notes, no markdown fences, no headings.",
    "",
    "Quality target:",
    "- Strong stop-scroll sales audio, short punchy turns, energetic but natural.",
    ...durationRules,
    ...speakerFormatRules,
    "- No blank lines.",
    "- Convert storyboard/planning input into spoken ad copy. Never output labels like แนวคิด:, รายละเอียด:, โครงเรื่อง:, Hook:, CTA:, 0-3s, Pain → Agitate → Relief, or bullet-style planning notes.",
    "- Use 2-3 emotion tags total, only where they improve delivery.",
    "- Avoid exaggerated intensifiers or instant-result wording such as อ่อนโยนสุด ๆ, ทันที, วางใจได้เลย, ตื่นเต้น!, or generic hype.",
    "- Avoid guarantee words such as แน่นอน, วางใจได้เลย, ไม่ทำให้..., and avoid ทุกวัน when it implies a promised result.",
    "",
    "Facial cleanser claim rules:",
    "- Do not mention killing bacteria, reducing inflammation, acne drying, acne cure/prevention, or acne treatment.",
    "- Do not claim repairing/restoring/strengthening/protecting skin barrier or not damaging the skin barrier.",
    "- Do not claim no irritants, irritation-free, allergen-free, safe for sensitive skin, or guaranteed suitability.",
    "- Do not promise immediate comfort/result. Use sensory routine language instead.",
    "- Use safe rinse-off language: pH กรดอ่อน ๆ, ผิวรู้สึกสบายหลังล้าง, ล้างแล้วไม่เอี๊ยด, มี Ceramides และ Tea Tree Oil ตามสูตร, มีรายการ 5-free ตามที่แบรนด์ระบุ.",
    "",
    "Issues to fix:",
    ...params.issues.map((issue) => `- ${issue.code}: ${issue.message}`),
    "",
    "User options/context:",
    JSON.stringify(params.userInputs, null, 2),
    "",
    "Previous dialogue:",
    params.previousContent,
  ].join("\n");
}
