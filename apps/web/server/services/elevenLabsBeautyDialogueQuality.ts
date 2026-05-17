export const ELEVENLABS_BEAUTY_DIALOGUE_SKILL_ID = "elevenlabs-beauty-dialogue";

export type ElevenLabsBeautyDialogueQualityIssue = {
  code: string;
  severity: "repair" | "warning";
  message: string;
};

export type ElevenLabsBeautyDialogueQualityReport = {
  passed: boolean;
  issues: ElevenLabsBeautyDialogueQualityIssue[];
};

const THAI_CHAR_PATTERN = /[\u0E00-\u0E7F]/g;

function countThaiChars(text: string): number {
  return (text.match(THAI_CHAR_PATTERN) || []).length;
}

function normalizeLines(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
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

export function evaluateElevenLabsBeautyDialogueQuality(
  content: string,
  skillId: string | null | undefined,
): ElevenLabsBeautyDialogueQualityReport {
  if (skillId !== ELEVENLABS_BEAUTY_DIALOGUE_SKILL_ID) {
    return { passed: true, issues: [] };
  }

  const issues: ElevenLabsBeautyDialogueQualityIssue[] = [];
  const lines = normalizeLines(content);

  if (lines.length === 0) {
    issues.push({ code: "empty_output", severity: "repair", message: "Output is empty." });
  }

  lines.forEach((line, index) => {
    if (!/^Speaker\s*[12]\s*[:：]/i.test(line)) {
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

  return {
    passed: !issues.some((issue) => issue.severity === "repair"),
    issues,
  };
}

export function buildElevenLabsBeautyDialogueRepairPrompt(params: {
  previousContent: string;
  issues: ElevenLabsBeautyDialogueQualityIssue[];
  userInputs: Record<string, unknown>;
}): string {
  return [
    "Repair this ElevenLabs Thai beauty dialogue for final Media Studio TTS output.",
    "",
    "Return ONLY the corrected dialogue. No notes, no markdown fences, no headings.",
    "",
    "Quality target:",
    "- Strong stop-scroll sales audio, short punchy turns, energetic but natural.",
    "- Every line starts with Speaker 1: or Speaker 2:.",
    "- No blank lines.",
    "- Speaker 1 leads the sell; Speaker 2 reacts like a real listener.",
    "- Use 2-3 emotion tags total, only where they improve delivery.",
    "- Avoid exaggerated intensifiers or instant-result wording such as อ่อนโยนสุด ๆ, ทันที, วางใจได้เลย, ตื่นเต้น!, or generic hype.",
    "- Avoid guarantee words such as แน่นอน, วางใจได้เลย, ไม่ทำให้..., and avoid ทุกวัน when it implies a promised result.",
    "- Speaker 2 should ask grounded short questions or objections, not cheerlead.",
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
