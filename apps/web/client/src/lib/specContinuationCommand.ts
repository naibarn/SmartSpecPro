const SPEC_REFERENCE = /(?:\bspec(?:ification)?\s*[-#]?\s*|สเปก\s*|ข้อกำหนด\s*)(\d{3})\b/i;

export function isSpecContinuationCommand(text: string): boolean {
  return SPEC_REFERENCE.test(text)
    && /(?:ต่อจากเดิม|ทำต่อ|ทำงานเดิมต่อ|ต่อเนื่อง|\bcontinue\b|\bresume\b)/i.test(text)
    && /(?:ทำงานพัฒนา|พัฒนา|\bimplement(?:ation)?\b|\bdevelopment\b|\bwork on\b)/i.test(text);
}
