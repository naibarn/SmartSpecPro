/**
 * Task Profile Parser — deterministic message analysis for skill routing.
 *
 * Parses user/assistant messages into structured TaskProfile objects
 * that drive candidate retrieval and scoring. Zero LLM calls.
 *
 * Part of Feature 021: Hybrid Skill Orchestrator.
 */

import type { RoomIntentOrigin } from "./roomIntentRouter";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TaskProfile {
  /** Does the task need current/fresh information? */
  freshness: "none" | "preferred" | "required";
  /** What media types are involved? */
  modalities: Array<"text" | "image" | "video" | "audio">;
  /** How many deliverables are expected? */
  complexity: "single" | "multi_deliverable" | "iterative";
  /** Inferred domain hints (e.g., ["product_review", "food"]) */
  domainHints: string[];
  /** Specific capabilities the task requires */
  capabilityNeeds: {
    webSearch: boolean;
    /** User explicitly asked for web search (e.g., "ใช้ web search", "search online") */
    webSearchExplicit: boolean;
    citations: boolean;
    vision: boolean;
    codeExecution: boolean;
  };
  /** Detected primary language */
  languageHint: "th" | "en" | "mixed";
}

export interface TaskProfileContext {
  hasImages?: boolean;
  origin: RoomIntentOrigin;
}

// ─── Detection Patterns ─────────────────────────────────────────────────────
// Thai words don't support \b — use bare match for Thai, \b for English.

const FRESHNESS_REQUIRED_RE = /(ล่าสุด|ปัจจุบัน|ราคาวันนี้|ราคาตอนนี้|ข่าวใหม่|เพิ่งออก|รุ่นใหม่|ใหม่ล่าสุด|เปิดตัว|\blatest\b|\bcurrent\b|\btoday\b|\bright now\b|\bjust released\b|\b20(?:2[4-9]|3\d)\b|\bnew launch\b|\bbreaking\b)/i;

const FRESHNESS_PREFERRED_RE = /(เทรนด์|แนวโน้ม|สถานการณ์|สมัยนี้|ยุคนี้|\btrend\b|\brecent\b|\bmarket\b|\bupdate\b|\bpopular now\b)/i;

const MODALITY_IMAGE_RE = /(รูป|ภาพ|โปสเตอร์|อินโฟกราฟิก|สติกเกอร์|โลโก้|แบนเนอร์|\bimage\b|\bphoto\b|\bpicture\b|\bposter\b|\billustration\b|\binfographic\b|\blogo\b|\bbanner\b|\bmidjourney\b|\bflux\b|\bstable diffusion\b|\bdall-?e\b)/i;

const MODALITY_VIDEO_RE = /(วิดีโอ|คลิป|วีดีโอ|แอนิเมชัน|หนังสั้น|\bvideo\b|\bclip\b|\banimation\b|\bshort film\b|\breels?\b|\btiktok\b)/i;

const MODALITY_AUDIO_RE = /(เสียง|ดนตรี|เพลง|พากย์|เอฟเฟกต์เสียง|ซาวด์|\baudio\b|\bmusic\b|\bsound effect\b|\bvoiceover\b|\bpodcast\b|\bsfx\b|\bfoley\b)/i;

const MULTI_DELIVERABLE_RE = /(พร้อมทั้ง|พร้อมกับ|และยัง|รวมถึง|ทั้ง\s*\d+|หลายอย่าง|\band also\b|\balong with\b|\bplus\b|\bas well as\b|\btogether with\b|\bmultiple\b|\b\d+\s*(?:pieces?|items?|deliverables?|outputs?)\b)/i;

const ITERATIVE_RE = /(เปรียบเทียบ|วิเคราะห์หลาย|สรุปจากหลาย|ทีละขั้น|step.by.step|\bcompare\b|\banalyze multiple\b|\bstep[- ]by[- ]step\b|\biteratively\b|\beach one\b)/i;

const CODE_RE = /(โค้ด|เขียนโปรแกรม|สคริปต์|ดีบัก|\bcode\b|\bscript\b|\bdebug\b|\bprogram\b|\bfunction\b|\bapi\b|\bendpoint\b)/i;

const CITATION_RE = /(อ้างอิง|แหล่งข้อมูล|หลักฐาน|เอกสารอ้างอิง|\bcitation\b|\breference\b|\bsource\b|\bevidence\b|\bcite\b)/i;

const WEB_SEARCH_REQUEST_RE = /(ค้นเว็บ|ค้นหาจากเว็บ|ค้นหาออนไลน์|หาจากอินเทอร์เน็ต|ใช้ web search|เปิด web search|ข้อมูลจากเว็บ|\bweb search\b|\bsearch the web\b|\bsearch online\b|\buse web\b|\buse search\b|\blook up online\b|\binternet search\b|\bgoogle\b|\bbrowse the web\b)/i;
const CONJUNCTION_RE = /(?:^|[\s(])(?:และ|กับ)(?:[\s,.:;!?)]|$)|\band\b|\bwith\b/i;

// ─── Domain Detection ───────────────────────────────────────────────────────

interface DomainPattern {
  domain: string;
  pattern: RegExp;
}

const DOMAIN_PATTERNS: DomainPattern[] = [
  { domain: "product_review", pattern: /(รีวิว|เปรียบเทียบสินค้า|ข้อดีข้อเสีย|\breview\b|\bpros?\s*(and|&)\s*cons?\b|\bcomparison\b)/i },
  { domain: "food", pattern: /(อาหาร|ร้านอาหาร|เมนู|สูตร|รสชาติ|\bfood\b|\brestaurant\b|\brecipe\b|\bcuisine\b)/i },
  { domain: "tech", pattern: /(เทคโนโลยี|ซอฟต์แวร์|ฮาร์ดแวร์|กล้อง|มือถือ|โน๊ตบุ๊ค|\btech\b|\bsoftware\b|\bhardware\b|\bgadget\b|\bsmartphone\b|\blaptop\b)/i },
  { domain: "beauty", pattern: /(ความงาม|สกินแคร์|เครื่องสำอาง|ครีม|\bbeauty\b|\bskincare\b|\bcosmetic\b|\bmakeup\b)/i },
  { domain: "travel", pattern: /(ท่องเที่ยว|โรงแรม|สถานที่|ที่พัก|\btravel\b|\bhotel\b|\bdestination\b|\bresort\b)/i },
  { domain: "finance", pattern: /(การเงิน|ลงทุน|หุ้น|คริปโต|ธนาคาร|\bfinance\b|\binvest\b|\bstock\b|\bcrypto\b|\bbank\b)/i },
  { domain: "health", pattern: /(สุขภาพ|ออกกำลังกาย|โภชนาการ|วิตามิน|\bhealth\b|\bfitness\b|\bnutrition\b|\bwellness\b)/i },
  { domain: "real_estate", pattern: /(บ้าน|คอนโด|อสังหา|ที่ดิน|\breal estate\b|\bproperty\b|\bcondo\b|\bhouse\b)/i },
  { domain: "education", pattern: /(การศึกษา|เรียน|สอน|หลักสูตร|\beducation\b|\blearning\b|\bcourse\b|\bteaching\b)/i },
  { domain: "marketing", pattern: /(การตลาด|โฆษณา|แคมเปญ|SEO|โซเชียล|\bmarketing\b|\badvertis\b|\bcampaign\b|\bseo\b|\bsocial media\b)/i },
];

// ─── Language Detection ─────────────────────────────────────────────────────

const THAI_CHAR_RE = /[\u0E00-\u0E7F]/;
const ASCII_WORD_RE = /[a-zA-Z]{3,}/;

function detectLanguage(text: string): "th" | "en" | "mixed" {
  const hasThai = THAI_CHAR_RE.test(text);
  const hasEnglish = ASCII_WORD_RE.test(text);
  if (hasThai && hasEnglish) return "mixed";
  if (hasThai) return "th";
  return "en";
}

// ─── Main Parser ────────────────────────────────────────────────────────────

export function parseTaskProfile(
  message: string,
  context: TaskProfileContext,
): TaskProfile {
  const text = message.trim();

  // Freshness detection
  let freshness: TaskProfile["freshness"] = "none";
  if (FRESHNESS_REQUIRED_RE.test(text)) {
    freshness = "required";
  } else if (FRESHNESS_PREFERRED_RE.test(text)) {
    freshness = "preferred";
  }

  // Modality detection
  const modalities: TaskProfile["modalities"] = ["text"];
  if (MODALITY_IMAGE_RE.test(text)) modalities.push("image");
  if (MODALITY_VIDEO_RE.test(text)) modalities.push("video");
  if (MODALITY_AUDIO_RE.test(text)) modalities.push("audio");
  if (context.hasImages && !modalities.includes("image")) modalities.push("image");

  // Complexity detection
  // Multiple distinct modalities joined by conjunction = multi-deliverable
  // e.g., "สร้างภาพ และ ข้อความ" = image + text with "และ"
  // Thai doesn't support \b — use bare match for Thai, \b for English
  const hasConjunction = CONJUNCTION_RE.test(text);
  const distinctMediaModalities = modalities.filter((m) => m !== "text").length;
  const isMultiModalWithConjunction = distinctMediaModalities >= 1 && hasConjunction && modalities.length >= 2;

  let complexity: TaskProfile["complexity"] = "single";
  if (MULTI_DELIVERABLE_RE.test(text) || modalities.length >= 3 || isMultiModalWithConjunction) {
    complexity = "multi_deliverable";
  } else if (ITERATIVE_RE.test(text)) {
    complexity = "iterative";
  }

  // Domain hints
  const domainHints: string[] = [];
  for (const { domain, pattern } of DOMAIN_PATTERNS) {
    if (pattern.test(text)) {
      domainHints.push(domain);
    }
  }

  // Capability needs
  const webSearchExplicit = WEB_SEARCH_REQUEST_RE.test(text);
  const capabilityNeeds = {
    webSearch: freshness === "required" || webSearchExplicit,
    webSearchExplicit,
    citations: CITATION_RE.test(text),
    vision: context.hasImages === true,
    codeExecution: CODE_RE.test(text),
  };

  // Language
  const languageHint = detectLanguage(text);

  return {
    freshness,
    modalities,
    complexity,
    domainHints,
    capabilityNeeds,
    languageHint,
  };
}
