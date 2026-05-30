export type ProductionStoryDimension = "problem_solution" | "objection_trust" | "quick_demo" | "use_case_moment";
export type ProductionStoryLocale = "th" | "en";

export interface ProductionStoryVariationProductSignals {
  productRef: string;
  friction: string;
  aspiration: string;
  consideration: string;
  proofFocus: string;
  quickSteps: string[];
  miniStory: string;
  fallbackBenefits: string[];
}

export interface ProductionStoryVariationRecipe {
  id: string;
  journeyStage: string;
  storyArc: string;
  emotion: string;
  speakingStyle: string;
  hookStyle: string;
  cameraGrammar: string;
  pacing: string;
  ctaStyle: string;
  visualLanguage: string;
  narrativeStructure: string;
  emotionalTone: string;
  hookTechnique: string;
}

export interface ProductionStoryVoiceoverBeat {
  order: number;
  startSec: number;
  endSec: number;
  title: string;
  journeyStage: string;
  visualBeat: string;
  cameraDirection: string;
  emotion: string;
  voiceoverScript: string;
  speechBudgetSeconds: number;
}

export const PRODUCTION_STORY_CONCEPT_SHOT_COUNT = 9;
export const PRODUCTION_STORY_CONCEPT_SHOT_COUNT_OPTIONS = [6, 7, 8, 9, 10, 12, 15] as const;
export const PRODUCTION_STORY_CONCEPT_TOTAL_SECONDS = 60;
export const PRODUCTION_STORY_CONCEPT_SHOT_SECONDS =
  PRODUCTION_STORY_CONCEPT_TOTAL_SECONDS / PRODUCTION_STORY_CONCEPT_SHOT_COUNT;
export const PRODUCTION_STORY_CONCEPT_SPEECH_BUDGET_SECONDS = 10;

export function normalizeProductionStoryShotCount(value: unknown, fallback = PRODUCTION_STORY_CONCEPT_SHOT_COUNT): number {
  const numeric = Math.round(Number(value));
  return (PRODUCTION_STORY_CONCEPT_SHOT_COUNT_OPTIONS as readonly number[]).includes(numeric)
    ? numeric
    : fallback;
}

export function getProductionStoryShotSeconds(shotCount: unknown): number {
  return Number((PRODUCTION_STORY_CONCEPT_TOTAL_SECONDS / normalizeProductionStoryShotCount(shotCount)).toFixed(2));
}

const recipeCatalog: Record<ProductionStoryDimension, {
  journeyStages: string[];
  storyArcs: string[];
  emotions: string[];
  speakingStyles: string[];
  hookStyles: string[];
  cameraGrammars: string[];
  pacings: string[];
  ctaStyles: string[];
  visualLanguages: string[];
  narrativeStructures: string[];
  emotionalTones: string[];
  hookTechniques: string[];
}> = {
  problem_solution: {
    journeyStages: ["awareness_to_relief", "problem_recognition_to_solution", "daily_friction_to_clear_fix"],
    storyArcs: ["messy_moment_to_relief", "before_after_resolution", "small_problem_big_ease"],
    emotions: ["relief", "empathy", "warm_practical"],
    speakingStyles: ["friend_points_out_the_problem", "soft_narrator_guides_the_fix", "real_user_tells_a_small_truth"],
    hookStyles: ["pain_point_question", "ever_had_this_moment", "before_after_tease"],
    cameraGrammars: ["wide_before_to_product_closeup", "handheld_problem_then_clean_reveal", "slow_push_from_friction_to_fix"],
    pacings: ["problem_first_then_relief", "calm_setup_to_clear_payoff", "quick_hook_then_use_case"],
    ctaStyles: ["save_as_a_practical_option", "check_if_it_fits_your_routine", "compare_with_your_space"],
    visualLanguages: ["realistic_home_lifestyle", "clean_marketplace_demo", "warm_daily_routine"],
    narrativeStructures: ["Problem -> Solution", "Before -> After", "Pain -> Relief"],
    emotionalTones: ["Empathy Tone", "Relief Tone", "Warm Home Tone"],
    hookTechniques: ["Hook แบบปัญหาโดนใจ", "Hook แบบ Before / After", "Formula 1: เคยไหม + ปัญหา"],
  },
  objection_trust: {
    journeyStages: ["consideration_to_confidence", "doubt_to_evidence", "comparison_to_trust"],
    storyArcs: ["objection_to_proof", "question_to_answer", "review_style_verification"],
    emotions: ["confidence", "reassurance", "careful_trust"],
    speakingStyles: ["friend_answers_the_doubt", "expert_keeps_it_simple", "reviewer_checks_before_buying"],
    hookStyles: ["objection_question", "dont_buy_until_you_check_this", "proof_first_tease"],
    cameraGrammars: ["macro_detail_then_context_reveal", "scale_check_then_use_case", "side_by_side_context_check"],
    pacings: ["slow_proof_then_clear_cta", "doubt_first_then_detail_cut", "calm_review_to_decision"],
    ctaStyles: ["check_product_details_first", "match_it_with_your_use_case", "review_the_size_and_evidence"],
    visualLanguages: ["proof_led_marketplace_review", "clean_product_detail_demo", "honest_consideration_review"],
    narrativeStructures: ["Objection -> Proof", "Question -> Answer", "Review / Social Proof Story"],
    emotionalTones: ["Trust / Confidence Tone", "Real User Tone", "Value Tone"],
    hookTechniques: ["Hook แบบข้อกังวล", "Hook แบบรีวิวจริงใจ", "Hook แบบเปรียบเทียบ"],
  },
  quick_demo: {
    journeyStages: ["demo_to_understanding", "proof_review_demo", "fast_use_to_visible_result"],
    storyArcs: ["four_beat_demo", "use_case_montage", "show_dont_tell_benefits"],
    emotions: ["satisfying", "fun_fast", "practical_energy"],
    speakingStyles: ["quick_demo_host", "hands_on_friend", "brisk_product_walkthrough"],
    hookStyles: ["demo_first", "watch_this_use_case", "fast_benefit_stack"],
    cameraGrammars: ["top_down_steps_then_result", "fast_cuts_with_detail_inserts", "handheld_pov_demo"],
    pacings: ["snappy_demo_beats", "fast_cut_then_pause_on_result", "one_action_per_shot"],
    ctaStyles: ["try_matching_this_to_your_routine", "save_if_you_need_this_use_case", "open_details_for_exact_fit"],
    visualLanguages: ["fast_realistic_demo", "satisfying_product_steps", "clean_social_short"],
    narrativeStructures: ["Demo Story", "Use Case Montage", "Question -> Answer"],
    emotionalTones: ["Fun & Fast Tone", "Value Tone", "Premium Lifestyle Tone"],
    hookTechniques: ["Hook แบบเดโมเร็ว", "Hook Formula: ถ้า + สถานการณ์ + ต้องมี", "Hook แบบเร่งให้ตัดสินใจ"],
  },
  use_case_moment: {
    journeyStages: ["post_purchase_experience", "day_in_life_to_payoff", "routine_upgrade"],
    storyArcs: ["day_in_the_life", "routine_upgrade_mini_story", "post_purchase_feeling"],
    emotions: ["warm_satisfaction", "aesthetic_calm", "everyday_delight"],
    speakingStyles: ["real_user_after_buying", "calm_lifestyle_narrator", "pov_daily_routine"],
    hookStyles: ["real_use_moment", "after_setup_feeling", "small_routine_change"],
    cameraGrammars: ["pov_morning_or_evening_routine", "soft_orbit_then_lifestyle_context", "over_shoulder_use_moment"],
    pacings: ["cinematic_reveal_to_soft_cta", "routine_steps_with_emotional_payoff", "slow_lifestyle_then_practical_close"],
    ctaStyles: ["imagine_it_in_your_routine", "keep_it_for_this_kind_of_day", "choose_if_this_feeling_matches_you"],
    visualLanguages: ["warm_lifestyle_story", "aesthetic_daily_use", "quiet_premium_routine"],
    narrativeStructures: ["Day in the Life", "Transformation Story", "Before -> After"],
    emotionalTones: ["Warm Home Tone", "Aesthetic Tone", "Empathy Tone"],
    hookTechniques: ["Hook แบบสถานการณ์จริง", "Hook แบบอารมณ์มินิมอล", "Hook แบบ Before / After"],
  },
};

function hashSeed(value: string): number {
  return Array.from(value).reduce((sum, char) => ((sum * 31) + char.charCodeAt(0)) >>> 0, 17);
}

function pickSeeded(items: string[], seed: string, offset: number): string {
  if (!items.length) return "";
  return items[(hashSeed(`${seed}:${offset}`) + offset) % items.length] ?? items[0] ?? "";
}

const variationLabelMap: Record<string, { th: string; en: string }> = {
  awareness_to_relief: { th: "จากปัญหาไปสู่ความโล่งใจ", en: "awareness to relief" },
  problem_recognition_to_solution: { th: "จากเห็นปัญหาไปสู่ทางออก", en: "problem recognition to solution" },
  daily_friction_to_clear_fix: { th: "จากความติดขัดประจำวันไปสู่การแก้ที่เห็นภาพ", en: "daily friction to clear fix" },
  consideration_to_confidence: { th: "จากความลังเลไปสู่ความมั่นใจ", en: "consideration to confidence" },
  doubt_to_evidence: { th: "จากข้อสงสัยไปสู่หลักฐาน", en: "doubt to evidence" },
  comparison_to_trust: { th: "จากการเปรียบเทียบไปสู่ความเชื่อมั่น", en: "comparison to trust" },
  demo_to_understanding: { th: "จากเดโมไปสู่ความเข้าใจ", en: "demo to understanding" },
  proof_review_demo: { th: "พิสูจน์ด้วยเดโมและบริบทจริง", en: "proof review demo" },
  fast_use_to_visible_result: { th: "จากการใช้เร็วไปสู่ผลลัพธ์ที่เห็นชัด", en: "fast use to visible result" },
  post_purchase_experience: { th: "ประสบการณ์หลังซื้อ", en: "post-purchase experience" },
  day_in_life_to_payoff: { th: "หนึ่งวันในชีวิตไปสู่ผลลัพธ์", en: "day in the life to payoff" },
  routine_upgrade: { th: "ยกระดับกิจวัตรเล็ก ๆ", en: "routine upgrade" },
  messy_moment_to_relief: { th: "จากมุมรกไปสู่ความโล่ง", en: "messy moment to relief" },
  before_after_resolution: { th: "ก่อนใช้และหลังจัดเสร็จ", en: "before and after resolution" },
  small_problem_big_ease: { th: "ปัญหาเล็กที่ทำให้ชีวิตง่ายขึ้น", en: "small problem, big ease" },
  objection_to_proof: { th: "จากข้อกังวลไปสู่หลักฐาน", en: "objection to proof" },
  question_to_answer: { th: "จากคำถามไปสู่คำตอบ", en: "question to answer" },
  review_style_verification: { th: "เล่าแบบรีวิวตรวจรายละเอียด", en: "review-style verification" },
  four_beat_demo: { th: "เดโม 4 จังหวะ", en: "four-beat demo" },
  use_case_montage: { th: "ตัดต่อหลายบริบทการใช้งาน", en: "use case montage" },
  show_dont_tell_benefits: { th: "โชว์ให้เห็นแทนการพูดยาว", en: "show, do not tell benefits" },
  day_in_the_life: { th: "หนึ่งวันในชีวิตจริง", en: "day in the life" },
  routine_upgrade_mini_story: { th: "มินิสตอรี่ยกระดับกิจวัตร", en: "routine upgrade mini story" },
  post_purchase_feeling: { th: "ความรู้สึกหลังซื้อมาใช้จริง", en: "post-purchase feeling" },
  relief: { th: "โล่งใจ", en: "relief" },
  empathy: { th: "เข้าใจปัญหา", en: "empathy" },
  warm_practical: { th: "อบอุ่นและใช้งานจริง", en: "warm and practical" },
  confidence: { th: "มั่นใจ", en: "confidence" },
  reassurance: { th: "อุ่นใจ", en: "reassurance" },
  careful_trust: { th: "เชื่อมั่นแบบรอบคอบ", en: "careful trust" },
  satisfying: { th: "ดูแล้วพอใจ", en: "satisfying" },
  fun_fast: { th: "สนุกและเร็ว", en: "fun and fast" },
  practical_energy: { th: "กระฉับกระเฉงแบบใช้งานจริง", en: "practical energy" },
  warm_satisfaction: { th: "อบอุ่นและพอใจ", en: "warm satisfaction" },
  aesthetic_calm: { th: "สวยนิ่งและสงบ", en: "aesthetic calm" },
  everyday_delight: { th: "ความสุขเล็ก ๆ ในชีวิตประจำวัน", en: "everyday delight" },
  friend_points_out_the_problem: { th: "เพื่อนชี้ปัญหาให้เห็นแบบเป็นกันเอง", en: "a friend points out the problem" },
  soft_narrator_guides_the_fix: { th: "ผู้บรรยายค่อย ๆ พาไปเห็นทางแก้", en: "soft narrator guides the fix" },
  real_user_tells_a_small_truth: { th: "ผู้ใช้จริงเล่าความจริงเล็ก ๆ", en: "real user tells a small truth" },
  friend_answers_the_doubt: { th: "เพื่อนตอบข้อสงสัยแบบจริงใจ", en: "friend answers the doubt" },
  expert_keeps_it_simple: { th: "ผู้รู้เล่าให้ง่ายและไม่ขายเกิน", en: "expert keeps it simple" },
  reviewer_checks_before_buying: { th: "รีวิวแบบตรวจให้ดูก่อนซื้อ", en: "reviewer checks before buying" },
  quick_demo_host: { th: "พิธีกรเดโมเร็ว", en: "quick demo host" },
  hands_on_friend: { th: "เพื่อนลองใช้ให้ดู", en: "hands-on friend" },
  brisk_product_walkthrough: { th: "พาเดินดูสินค้าแบบกระชับ", en: "brisk product walkthrough" },
  real_user_after_buying: { th: "ผู้ใช้จริงหลังซื้อมาใช้", en: "real user after buying" },
  calm_lifestyle_narrator: { th: "ผู้บรรยายไลฟ์สไตล์โทนนุ่ม", en: "calm lifestyle narrator" },
  pov_daily_routine: { th: "เล่าแบบ POV ในกิจวัตรประจำวัน", en: "POV daily routine" },
  pain_point_question: { th: "ตั้งคำถามจาก pain point", en: "pain-point question" },
  ever_had_this_moment: { th: "เปิดด้วยคำว่าเคยไหม", en: "ever had this moment" },
  before_after_tease: { th: "แย้มภาพก่อนและหลัง", en: "before-after tease" },
  objection_question: { th: "เปิดด้วยข้อกังวลก่อนซื้อ", en: "objection question" },
  dont_buy_until_you_check_this: { th: "อย่าเพิ่งซื้อถ้ายังไม่เช็กจุดนี้", en: "do not buy until you check this" },
  proof_first_tease: { th: "เปิดด้วยหลักฐานก่อนเฉลย", en: "proof-first tease" },
  demo_first: { th: "เริ่มด้วยเดโมทันที", en: "demo first" },
  watch_this_use_case: { th: "ชวนดูบริบทใช้งานนี้", en: "watch this use case" },
  fast_benefit_stack: { th: "เรียงประโยชน์แบบเร็ว", en: "fast benefit stack" },
  real_use_moment: { th: "เปิดด้วยโมเมนต์ใช้งานจริง", en: "real use moment" },
  after_setup_feeling: { th: "เปิดด้วยความรู้สึกหลังจัดเสร็จ", en: "after setup feeling" },
  small_routine_change: { th: "การเปลี่ยนกิจวัตรเล็ก ๆ", en: "small routine change" },
  wide_before_to_product_closeup: { th: "เปิดกว้างเห็นปัญหา แล้วค่อยเข้าใกล้สินค้า", en: "wide before shot into product close-up" },
  handheld_problem_then_clean_reveal: { th: "ถือกล้องเบา ๆ ตอนเห็นปัญหา แล้วเผยภาพที่จัดเรียบร้อย", en: "light handheld problem shot, then clean reveal" },
  slow_push_from_friction_to_fix: { th: "ค่อย ๆ ดันกล้องจากจุดรกไปสู่ภาพหลังจัด", en: "slow push-in from friction to fix" },
  macro_detail_then_context_reveal: { th: "ซูมรายละเอียดก่อน แล้วค่อยเผยบริบทใช้งานจริง", en: "macro detail, then context reveal" },
  scale_check_then_use_case: { th: "เทียบสเกลก่อน แล้วโชว์การใช้งาน", en: "scale check, then use case" },
  side_by_side_context_check: { th: "เทียบภาพก่อนหลังในบริบทเดียวกัน", en: "side-by-side context check" },
  top_down_steps_then_result: { th: "มุมบนเห็นขั้นตอน แล้วจบด้วยผลลัพธ์", en: "top-down steps, then result" },
  fast_cuts_with_detail_inserts: { th: "ตัดเร็วสลับ close-up รายละเอียด", en: "fast cuts with detail inserts" },
  handheld_pov_demo: { th: "มุมมองผู้ใช้ถือกล้องเดโม", en: "handheld POV demo" },
  pov_morning_or_evening_routine: { th: "POV ในกิจวัตรเช้าหรือก่อนนอน", en: "POV morning or evening routine" },
  soft_orbit_then_lifestyle_context: { th: "หมุนกล้องนุ่ม ๆ แล้วเผยบริบทไลฟ์สไตล์", en: "soft orbit into lifestyle context" },
  over_shoulder_use_moment: { th: "มุมข้ามไหล่ขณะใช้งานจริง", en: "over-shoulder use moment" },
  problem_first_then_relief: { th: "เริ่มจากปัญหาแล้วค่อยผ่อนเป็นความโล่ง", en: "problem first, then relief" },
  calm_setup_to_clear_payoff: { th: "จัดฉากอย่างนิ่ง แล้วจบด้วยผลลัพธ์ชัด", en: "calm setup to clear payoff" },
  quick_hook_then_use_case: { th: "hook เร็ว แล้วเข้าบริบทใช้งาน", en: "quick hook, then use case" },
  slow_proof_then_clear_cta: { th: "พิสูจน์ช้า ๆ แล้ว CTA ชัดเจน", en: "slow proof, then clear CTA" },
  doubt_first_then_detail_cut: { th: "เริ่มจากข้อสงสัย แล้วตัดเข้ารายละเอียด", en: "doubt first, then detail cut" },
  calm_review_to_decision: { th: "รีวิวอย่างนิ่งจนไปสู่การตัดสินใจ", en: "calm review to decision" },
  snappy_demo_beats: { th: "เดโมเร็วเป็นจังหวะ", en: "snappy demo beats" },
  fast_cut_then_pause_on_result: { th: "ตัดเร็ว แล้วหยุดให้ดูผลลัพธ์", en: "fast cut, then pause on result" },
  one_action_per_shot: { th: "หนึ่งช็อต หนึ่งการกระทำ", en: "one action per shot" },
  cinematic_reveal_to_soft_cta: { th: "เผยภาพแบบ cinematic แล้วปิดนุ่ม ๆ", en: "cinematic reveal to soft CTA" },
  routine_steps_with_emotional_payoff: { th: "ตามขั้นตอนในกิจวัตร แล้วจบด้วยอารมณ์หลังใช้", en: "routine steps with emotional payoff" },
  slow_lifestyle_then_practical_close: { th: "ไลฟ์สไตล์ช้า ๆ แล้วปิดด้วยเหตุผลใช้งาน", en: "slow lifestyle, then practical close" },
};

function humanizeVariationValue(value: string, locale: ProductionStoryLocale): string {
  const mapped = variationLabelMap[value]?.[locale];
  if (mapped) return mapped;
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDimension(value: ProductionStoryDimension | string | undefined): ProductionStoryDimension {
  if (value === "objection_trust" || value === "quick_demo" || value === "use_case_moment") return value;
  return "problem_solution";
}

export function buildProductionStoryVariationRecipe(input: {
  dimension?: ProductionStoryDimension | string;
  storyOptionId?: string;
  generationSeed: string;
  index?: number;
  locale: ProductionStoryLocale;
}): ProductionStoryVariationRecipe {
  const dimension = normalizeDimension(input.dimension);
  const catalog = recipeCatalog[dimension];
  const seed = `${input.generationSeed}:${input.storyOptionId ?? dimension}:${input.index ?? 0}:${input.locale}`;
  const recipe = {
    journeyStage: humanizeVariationValue(pickSeeded(catalog.journeyStages, seed, 1), input.locale),
    storyArc: humanizeVariationValue(pickSeeded(catalog.storyArcs, seed, 3), input.locale),
    emotion: humanizeVariationValue(pickSeeded(catalog.emotions, seed, 5), input.locale),
    speakingStyle: humanizeVariationValue(pickSeeded(catalog.speakingStyles, seed, 7), input.locale),
    hookStyle: humanizeVariationValue(pickSeeded(catalog.hookStyles, seed, 11), input.locale),
    cameraGrammar: humanizeVariationValue(pickSeeded(catalog.cameraGrammars, seed, 13), input.locale),
    pacing: humanizeVariationValue(pickSeeded(catalog.pacings, seed, 17), input.locale),
    ctaStyle: humanizeVariationValue(pickSeeded(catalog.ctaStyles, seed, 19), input.locale),
    visualLanguage: humanizeVariationValue(pickSeeded(catalog.visualLanguages, seed, 23), input.locale),
    narrativeStructure: pickSeeded(catalog.narrativeStructures, seed, 29),
    emotionalTone: pickSeeded(catalog.emotionalTones, seed, 31),
    hookTechnique: pickSeeded(catalog.hookTechniques, seed, 37),
  };
  return {
    id: [
      dimension,
      recipe.journeyStage,
      recipe.storyArc,
      recipe.emotion,
      recipe.speakingStyle,
      recipe.cameraGrammar,
    ].join(":"),
    ...recipe,
  };
}

function cleanText(value: unknown, fallback = ""): string {
  return String(value ?? fallback).replace(/\s+/g, " ").trim();
}

function shortText(value: unknown, fallback: string, max = 140): string {
  const text = cleanText(value, fallback);
  if (text.length <= max) return text;
  const sliced = text.slice(0, max + 1);
  const boundary = Math.max(sliced.lastIndexOf(" "), sliced.lastIndexOf(","), sliced.lastIndexOf("."));
  return sliced.slice(0, boundary >= Math.floor(max * 0.6) ? boundary : max).trim();
}

function formatSeconds(seconds: number): string {
  return Number.isInteger(seconds) ? String(seconds) : seconds.toFixed(1).replace(/\.0$/, "");
}

export function formatProductionStoryTimeRange(startSec: number, endSec: number): string {
  return `${formatSeconds(startSec)}-${formatSeconds(endSec)}s`;
}

function benefitAt(items: string[], index: number, fallback: string): string {
  return shortText(items[index] ?? items[0], fallback, 110);
}

function stepAt(items: string[], index: number, fallback: string): string {
  return shortText(items[index] ?? fallback, fallback, 130);
}

function buildThaiBeatLines(input: {
  dimension: ProductionStoryDimension;
  productRef: string;
  signals: ProductionStoryVariationProductSignals;
  sellingPoints: string[];
  objectionsTrust: string[];
  useCase: string;
  recipe: ProductionStoryVariationRecipe;
}): string[] {
  const { dimension, productRef, signals, sellingPoints, objectionsTrust, useCase, recipe } = input;
  const firstBenefit = benefitAt(sellingPoints, 0, signals.fallbackBenefits[0] ?? signals.aspiration);
  const secondBenefit = benefitAt(sellingPoints, 1, signals.fallbackBenefits[1] ?? signals.proofFocus);
  const objection = benefitAt(objectionsTrust, 0, signals.consideration);
  const useMoment = shortText(useCase || signals.proofFocus, signals.proofFocus, 150);

  if (dimension === "objection_trust") {
    return [
      `ก่อนซื้อ ${productRef} หลายคนก็คงคิดเหมือนกันว่า มันจะใช้จริงได้แค่ไหน`,
      `จุดที่ต้องดูไม่ใช่แค่รูปสวย แต่ต้องเทียบกับพื้นที่และวิธีใช้ของเราจริง ๆ`,
      `ช็อตนี้เลยให้ดูรายละเอียดใกล้ ๆ ก่อน ว่าตรงไหนคือส่วนที่ช่วยตอบข้อกังวล`,
      `แล้วค่อยถอยภาพออกมาให้เห็นว่า ${useMoment}`,
      `ถ้ากังวลเรื่อง ${objection} ให้ดูจากบริบทใช้งานและข้อมูลสินค้าที่มีหลักฐาน`,
      `ส่วนจุดที่น่าสนใจคือ ${firstBenefit}${secondBenefit ? ` และ ${secondBenefit}` : ""}`,
      `พูดง่าย ๆ คืออย่าเชื่อจากคำขายอย่างเดียว ให้ดูว่ามันเข้ากับชีวิตเราหรือเปล่า`,
      `ก่อนตัดสินใจ ให้ย้อนดูทั้งภาพรวมและรายละเอียดอีกครั้งว่าตรงกับมุมที่เราจะใช้จริงไหม`,
      `ถ้าภาพนี้ตรงกับสิ่งที่คุณกำลังหา ลองเช็กรายละเอียดสินค้าให้ครบก่อนตัดสินใจนะ`,
    ];
  }

  if (dimension === "quick_demo") {
    return [
      `ดูแบบเร็ว ๆ นะ เริ่มจากปัญหาก่อนใช้: ${signals.friction}`,
      `จากนั้นเอา ${productRef} เข้ามาในฉาก ให้เห็นทันทีว่ามันเข้ามาช่วยตรงไหน`,
      `ขั้นแรกคือ ${stepAt(signals.quickSteps, 1, `วาง ${productRef} ในจุดใช้งานจริง`)}`,
      `ต่อด้วย ${stepAt(signals.quickSteps, 2, useMoment)} แบบไม่ต้องอธิบายเยอะ`,
      `ให้กล้องซูมรายละเอียดที่เกี่ยวกับ ${firstBenefit} เพื่อให้เห็นจากภาพ`,
      `แล้วตัดกลับมาที่ผลลัพธ์หลังใช้: ${signals.aspiration}`,
      `ถ้าคุณชอบคลิปที่ดูแล้วเข้าใจทันที แนวนี้คือโชว์ประโยชน์แบบไม่อ้อม`,
      `ช็อตท้ายก่อนปิดให้เห็นอีกครั้งว่าแต่ละจุดทำงานร่วมกันยังไงในพื้นที่จริง`,
      `ลองเปิดรายละเอียดแล้วเทียบกับการใช้งานของตัวเอง ถ้าตรง ก็น่าเก็บไว้เป็นตัวเลือก`,
    ];
  }

  if (dimension === "use_case_moment") {
    return [
      `ลองนึกภาพหลังซื้อมาแล้วนะ ไม่ใช่แค่สินค้าอยู่ในรูป แต่เข้าไปอยู่ในวันของเรา`,
      `${signals.miniStory}`,
      `กล้องค่อย ๆ ตามมือและพื้นที่รอบ ๆ ให้เห็นว่า ${productRef} อยู่ตรงไหนในชีวิตจริง`,
      `ช็อตนี้ไม่ต้องขายแรง แค่ให้เห็นว่า ${useMoment}`,
      `รายละเอียดเล็ก ๆ อย่าง ${firstBenefit} คือสิ่งที่ทำให้ภาพหลังใช้ดูน่าเชื่อ`,
      `พอจังหวะทุกอย่างเข้าที่ ความรู้สึกคือ ${signals.aspiration}`,
      `นี่คือมุมเล่าแบบ ${recipe.emotion} ให้คนดูรู้สึกก่อน แล้วค่อยตัดสินใจเอง`,
      `ก่อนจบให้กลับมาเห็นมุมใช้งานเต็ม ๆ อีกครั้ง เพื่อให้จำภาพหลังใช้ได้ชัด`,
      `ถ้าคุณอยากได้ความรู้สึกแบบนี้ในมุมของตัวเอง ลองดู ${productRef} รุ่นนี้ได้เลย`,
    ];
  }

  return [
    `เคยไหม ${signals.friction}`,
    `ปัญหานี้ดูเล็กนะ แต่พอเจอทุกวัน มันทำให้มุมนั้นใช้งานไม่ค่อยสบาย`,
    `พอเอา ${productRef} เข้ามา ภาพแรกที่อยากให้เห็นคือมันช่วยจัดบริบทใหม่ยังไง`,
    `ช็อตนี้ให้ดูใกล้ขึ้น โดยเน้น ${firstBenefit} แบบเห็นจากภาพ ไม่ต้องพูดเกินจริง`,
    `จากนั้นโชว์การใช้งานจริง: ${useMoment}`,
    `ผลลัพธ์ที่อยากให้คนดูรู้สึกคือ ${signals.aspiration}`,
    `ถ้ายังกังวลอยู่ ให้เทียบขนาด รายละเอียด และพื้นที่ของตัวเองก่อนเสมอ`,
    `แล้วค่อยกลับมาดูภาพรวมอีกทีว่า ${productRef} ทำให้มุมนี้ใช้งานง่ายขึ้นจริงไหม`,
    `แต่ถ้าปัญหานี้คือสิ่งที่เจออยู่ ${productRef} ก็น่าเก็บไว้เป็นตัวเลือกนะ`,
  ];
}

function buildEnglishBeatLines(input: {
  dimension: ProductionStoryDimension;
  productRef: string;
  signals: ProductionStoryVariationProductSignals;
  sellingPoints: string[];
  objectionsTrust: string[];
  useCase: string;
  recipe: ProductionStoryVariationRecipe;
}): string[] {
  const { dimension, productRef, signals, sellingPoints, objectionsTrust, useCase, recipe } = input;
  const firstBenefit = benefitAt(sellingPoints, 0, signals.fallbackBenefits[0] ?? signals.aspiration);
  const secondBenefit = benefitAt(sellingPoints, 1, signals.fallbackBenefits[1] ?? signals.proofFocus);
  const objection = benefitAt(objectionsTrust, 0, signals.consideration);
  const useMoment = shortText(useCase || signals.proofFocus, signals.proofFocus, 150);

  if (dimension === "objection_trust") {
    return [
      `Before buying the ${productRef}, it is fair to ask whether it really fits your routine.`,
      "The useful check is not just a nice product photo, it is the space, scale, and actual use.",
      "So this shot moves in close first, showing the detail that answers the doubt.",
      `Then we pull back and show ${useMoment}.`,
      `If your concern is ${objection}, keep the proof tied to what the product evidence actually shows.`,
      `The strongest visible points are ${firstBenefit}${secondBenefit ? ` and ${secondBenefit}` : ""}.`,
      "In simple terms, do not buy from hype alone; check whether it fits your everyday setup.",
      "Before deciding, look back at the full setup and the details together, not just one attractive shot.",
      "If this looks like your situation, open the product details and compare the fit before deciding.",
    ];
  }

  if (dimension === "quick_demo") {
    return [
      `Quick demo: start with the real problem, ${signals.friction}.`,
      `Now bring in the ${productRef}, so the viewer sees exactly where it helps.`,
      `First, ${stepAt(signals.quickSteps, 1, `place the ${productRef} in the real use spot`)}.`,
      `Then, ${stepAt(signals.quickSteps, 2, useMoment)}, without turning it into a long sales pitch.`,
      `Cut closer to the detail connected to ${firstBenefit}, so the proof is visual.`,
      `Then show the after moment: ${signals.aspiration}.`,
      "This angle is for people who want to understand the benefit quickly, just by watching.",
      "Before the close, show the whole setup once more so the viewer sees how the small details work together.",
      "If that use case matches your routine, check the details and keep it as an option.",
    ];
  }

  if (dimension === "use_case_moment") {
    return [
      "Picture the moment after purchase, when the product is not just in a listing anymore.",
      signals.miniStory,
      `Let the camera follow the hands and space so the ${productRef} feels part of the routine.`,
      `This shot does not need a hard sell; it simply shows ${useMoment}.`,
      `A small detail like ${firstBenefit} makes the after-use moment feel believable.`,
      `Once everything settles, the feeling is ${signals.aspiration}.`,
      `This is the ${recipe.emotion} angle: let the viewer feel it first, then decide.`,
      "Before the final call, return to the full use moment so the after-purchase picture stays clear.",
      `If you want this kind of moment in your own space, the ${productRef} is worth a closer look.`,
    ];
  }

  return [
    `Ever run into this: ${signals.friction}?`,
    "It feels small, but when it happens every day, that corner becomes less comfortable to use.",
    `Once the ${productRef} enters the scene, the point is to show how it changes the context.`,
    `Move closer and focus on ${firstBenefit}, keeping the proof visual and evidence-safe.`,
    `Then show the real use case: ${useMoment}.`,
    `The feeling we want the viewer to see is ${signals.aspiration}.`,
    "If there is still a doubt, compare the size, details, and your own space first.",
    `Then look at the full setup again and ask whether the ${productRef} really makes that spot easier to use.`,
    `But if this is the problem you are dealing with, the ${productRef} is worth saving as an option.`,
  ];
}

function buildBeatTitles(dimension: ProductionStoryDimension, locale: ProductionStoryLocale): string[] {
  if (locale === "th") {
    if (dimension === "objection_trust") return ["ตั้งข้อสงสัย", "เช็กบริบท", "ดูรายละเอียด", "พิสูจน์ในพื้นที่จริง", "ตอบข้อกังวล", "ย้ำหลักฐาน", "สรุปแบบจริงใจ", "เช็กภาพรวมก่อนซื้อ", "ชวนเช็กก่อนตัดสินใจ"];
    if (dimension === "quick_demo") return ["เปิดเดโมเร็ว", "สินค้าเข้าฉาก", "ขั้นตอนแรก", "ขั้นตอนต่อเนื่อง", "ซูมจุดสำคัญ", "ผลลัพธ์หลังใช้", "สรุปประโยชน์", "ภาพรวมเดโม", "CTA แบบใช้งานจริง"];
    if (dimension === "use_case_moment") return ["หลังซื้อมาแล้ว", "เข้าสู่กิจวัตร", "ตามมือใช้งาน", "โมเมนต์จริง", "รายละเอียดเล็ก ๆ", "ความรู้สึกหลังใช้", "อารมณ์ของเรื่อง", "ภาพจำหลังใช้", "ปิดด้วยภาพชีวิตจริง"];
    return ["เปิดปัญหา", "ขยาย pain point", "สินค้าเข้ามาแก้", "หลักฐานจากภาพ", "ใช้งานจริง", "ผลลัพธ์", "กันความคาดหวังเกินจริง", "ยืนยันภาพรวม", "CTA"];
  }
  if (dimension === "objection_trust") return ["Name the doubt", "Check the context", "Show the detail", "Prove it in use", "Answer the concern", "Evidence points", "Honest summary", "Full setup check", "Decision CTA"];
  if (dimension === "quick_demo") return ["Fast demo hook", "Product enters", "First step", "Next step", "Detail close-up", "After result", "Benefit summary", "Full demo recap", "Practical CTA"];
  if (dimension === "use_case_moment") return ["After purchase", "Daily routine", "Hands-on moment", "Real use", "Small detail", "After feeling", "Story mood", "After-use memory", "Lifestyle CTA"];
  return ["Open problem", "Expand friction", "Product answer", "Visual proof", "Real use", "Outcome", "Expectation check", "Full setup confirm", "CTA"];
}

function buildCameraDirections(recipe: ProductionStoryVariationRecipe, locale: ProductionStoryLocale): string[] {
  if (locale === "th") {
    return [
      `เปิดด้วย ${recipe.cameraGrammar} ให้เห็นบริบทก่อนสินค้า`,
      "แพนช้า ๆ หรือ handheld เบา ๆ เพื่อให้ปัญหาดูเป็นชีวิตจริง",
      "นำสินค้าเข้าฉากด้วยมุมกลาง เห็นสัดส่วนกับพื้นที่",
      "ตัดเป็น close-up รายละเอียดสินค้าและวัสดุที่มองเห็นได้",
      "ใช้ POV หรือ top-down เพื่อโชว์การใช้งานจริงแบบเข้าใจทันที",
      "ถอยเป็น wide shot เพื่อเห็นผลลัพธ์หลังใช้",
      "ค้างภาพนิ่งขึ้นเล็กน้อย ให้คนดูมีเวลาตรวจรายละเอียด",
      "ตัดกลับเป็นมุมกึ่งกว้างเพื่อเชื่อมรายละเอียดกับภาพรวม",
      "ปิดด้วย hero shot สะอาด มีพื้นที่หายใจ ไม่มีข้อความล้นจอ",
    ];
  }
  return [
    `Open with ${recipe.cameraGrammar}, showing context before the product.`,
    "Use a gentle pan or light handheld move so the problem feels real.",
    "Bring the product into frame with a medium shot that shows scale.",
    "Cut to a close-up of visible product details and material cues.",
    "Use POV or top-down framing for an instantly understandable use moment.",
    "Pull back to a wide shot that shows the after-use result.",
    "Hold slightly steadier so the viewer can inspect the details.",
    "Cut back to a medium-wide recap that connects the details with the full setup.",
    "End on a clean hero shot with breathing room and no crowded text.",
  ];
}

const thaiVoiceoverBudgetBridges = [
  "ให้เปิดเรื่องแบบคนดูรู้สึกว่า นี่คือปัญหาที่เจอได้จริงในบ้านของตัวเอง",
  "จังหวะนี้ช่วยให้คนดูเห็นเหตุผลก่อน ไม่ใช่รู้สึกว่าโดนขายเร็วเกินไป",
  "พูดเหมือนกำลังชี้ให้เพื่อนดู ว่าสินค้านี้เข้ามาเปลี่ยนสถานการณ์ตรงไหน",
  "ให้ภาพทำหน้าที่พิสูจน์ ส่วนคำพูดแค่พาคนดูสังเกตจุดสำคัญ",
  "เชื่อมกับการใช้งานจริงของคนซื้อ เพื่อให้ช็อตนี้ไม่ใช่แค่ภาพโชว์สินค้า",
  "เว้นจังหวะให้เห็นความต่างก่อนและหลัง แล้วค่อยสรุปความรู้สึกที่ได้",
  "พูดแบบตรงไปตรงมา เพื่อกันความคาดหวังเกินจริงและทำให้คำแนะนำดูน่าเชื่อ",
  "เชื่อมภาพรวมกลับเข้ากับรายละเอียด เพื่อให้ storyboard จบครบก่อนเข้า CTA",
  "ปิดให้นุ่มแต่ชัด ให้คนดูรู้ว่าขั้นต่อไปคือเช็กว่าสินค้าตรงกับชีวิตเขาไหม",
];

const englishVoiceoverBudgetBridges = [
  "This helps the viewer feel the problem first, before the product is asked to solve anything.",
  "That small pause makes the reason feel real instead of turning the shot into a hard sell.",
  "Say it like you are pointing the moment out to a friend, not reading a product description.",
  "Let the image carry the proof while the voice simply guides the viewer to what matters.",
  "Tie it back to the buyer's real routine so the shot feels useful, not just decorative.",
  "Give the before-and-after a moment to land, then name the practical feeling it creates.",
  "Keep it honest and specific, so the viewer trusts the recommendation without feeling pushed.",
  "Connect the full setup back to the detail, so the storyboard feels complete before the CTA.",
  "Close softly but clearly, pointing them to check whether this product fits their own setup.",
];

function fitVoiceoverLineToSpeechBudget(line: string, locale: ProductionStoryLocale, index: number): string {
  const text = cleanText(line);
  const minChars = locale === "th" ? 120 : 170;
  if (text.length >= minChars) return text;
  const bridges = locale === "th" ? thaiVoiceoverBudgetBridges : englishVoiceoverBudgetBridges;
  const bridge = bridges[index] ?? bridges[bridges.length - 1] ?? "";
  if (!bridge || text.includes(bridge)) return text;
  return `${text} ${bridge}`.trim();
}

function formatVoiceoverBudgetLabel(seconds: number, locale: ProductionStoryLocale): string {
  return locale === "th" ? `ประมาณ ${seconds} วินาที` : `about ${seconds}s`;
}

function fitSequenceToShotCount(items: string[], shotCount: number, locale: ProductionStoryLocale): string[] {
  const cleanItems = items.map((item) => cleanText(item)).filter(Boolean);
  if (shotCount <= 0) return [];
  if (!cleanItems.length) return Array.from({ length: shotCount }, (_, index) => locale === "th" ? `ช็อตที่ ${index + 1}` : `Shot ${index + 1}`);
  if (cleanItems.length === shotCount) return cleanItems;
  if (shotCount === 1) return [cleanItems[0]];
  if (cleanItems.length > shotCount) {
    return Array.from({ length: shotCount }, (_, index) => {
      const sourceIndex = Math.round((index * (cleanItems.length - 1)) / (shotCount - 1));
      return cleanItems[sourceIndex] ?? cleanItems[cleanItems.length - 1] ?? cleanItems[0];
    });
  }
  const recapLines = locale === "th"
    ? [
      "เพิ่มช็อตเชื่อมอารมณ์ให้เห็นรายละเอียดที่สัมพันธ์กับชีวิตจริง",
      "เพิ่มช็อต transition ให้ภาพต่อเนื่องจากปัญหาไปสู่ผลลัพธ์",
      "เพิ่มช็อต close-up สั้น ๆ เพื่อย้ำหลักฐานที่มองเห็นได้",
      "เพิ่มช็อต lifestyle recap เพื่อให้ storyboard ไม่กระโดดเร็วเกินไป",
      "เพิ่มช็อตถือภาพนิ่งเล็กน้อย ให้คนดูมีเวลารับรู้รายละเอียดก่อนปิด",
      "เพิ่มช็อตมุมกว้างเพื่อยืนยันบริบทจริงก่อนเข้า CTA",
    ]
    : [
      "Add a bridge shot that connects the detail back to real daily use.",
      "Add a transition shot so the story moves smoothly from problem to result.",
      "Add a short close-up beat to reinforce the visible proof.",
      "Add a lifestyle recap so the storyboard does not jump too quickly.",
      "Add a steadier hold so the viewer has time to register the detail before the close.",
      "Add a wider context shot before the CTA to confirm the real setup.",
    ];
  const result = cleanItems.slice(0, -1);
  while (result.length < shotCount - 1) {
    result.push(recapLines[(result.length - cleanItems.length + 1) % recapLines.length] ?? recapLines[0] ?? cleanItems[cleanItems.length - 1]);
  }
  result.push(cleanItems[cleanItems.length - 1]);
  return result;
}

export function buildProductionStoryVoiceoverBeats(input: {
  locale: ProductionStoryLocale;
  dimension?: ProductionStoryDimension | string;
  productSignals: ProductionStoryVariationProductSignals;
  variationRecipe: ProductionStoryVariationRecipe;
  sellingPoints?: string[];
  objectionsTrust?: string[];
  useCase?: string;
  shotCount?: number;
}): ProductionStoryVoiceoverBeat[] {
  const dimension = normalizeDimension(input.dimension);
  const shotCount = normalizeProductionStoryShotCount(input.shotCount);
  const shotSeconds = PRODUCTION_STORY_CONCEPT_TOTAL_SECONDS / shotCount;
  const productRef = shortText(input.productSignals.productRef, input.locale === "th" ? "สินค้านี้" : "this product", 90);
  const sellingPoints = (input.sellingPoints ?? []).map((item) => shortText(item, "", 120)).filter(Boolean);
  const objectionsTrust = (input.objectionsTrust ?? []).map((item) => shortText(item, "", 120)).filter(Boolean);
  const useCase = shortText(input.useCase, input.productSignals.proofFocus, 150);
  const lines = input.locale === "th"
    ? buildThaiBeatLines({
      dimension,
      productRef,
      signals: input.productSignals,
      sellingPoints,
      objectionsTrust,
      useCase,
      recipe: input.variationRecipe,
    })
    : buildEnglishBeatLines({
      dimension,
      productRef,
      signals: input.productSignals,
      sellingPoints,
      objectionsTrust,
      useCase,
      recipe: input.variationRecipe,
    });
  const titles = fitSequenceToShotCount(buildBeatTitles(dimension, input.locale), shotCount, input.locale);
  const cameras = fitSequenceToShotCount(buildCameraDirections(input.variationRecipe, input.locale), shotCount, input.locale);
  const voiceoverLines = fitSequenceToShotCount(lines, shotCount, input.locale);
  return Array.from({ length: shotCount }, (_, index) => {
    const startSec = Number((index * shotSeconds).toFixed(1));
    const endSec = Number((index === shotCount - 1 ? PRODUCTION_STORY_CONCEPT_TOTAL_SECONDS : (index + 1) * shotSeconds).toFixed(1));
    return {
      order: index + 1,
      startSec,
      endSec,
      title: titles[index] ?? `Shot ${index + 1}`,
      journeyStage: input.variationRecipe.journeyStage,
      visualBeat: [
        titles[index] ?? `Shot ${index + 1}`,
        index === 0 ? input.variationRecipe.hookStyle : "",
        index === 4 ? useCase : "",
        index === shotCount - 1 ? input.variationRecipe.ctaStyle : "",
      ].filter(Boolean).join(" - "),
      cameraDirection: cameras[index] ?? input.variationRecipe.cameraGrammar,
      emotion: input.variationRecipe.emotion,
      voiceoverScript: fitVoiceoverLineToSpeechBudget(voiceoverLines[index] ?? voiceoverLines[voiceoverLines.length - 1] ?? "", input.locale, index),
      speechBudgetSeconds: PRODUCTION_STORY_CONCEPT_SPEECH_BUDGET_SECONDS,
    };
  });
}

export function buildProductionStorySceneTimelineFromVoiceoverBeats(
  beats: ProductionStoryVoiceoverBeat[],
): Array<{ timeRange: string; title: string; detail: string }> {
  return beats.map((beat) => ({
    timeRange: formatProductionStoryTimeRange(beat.startSec, beat.endSec),
    title: beat.title,
    detail: [
      beat.visualBeat,
      beat.cameraDirection,
      beat.voiceoverScript ? `Dialogue: ${beat.voiceoverScript}` : "",
    ].filter(Boolean).join(" | "),
  }));
}

export function buildProductionStoryShotBriefText(input: {
  beats: ProductionStoryVoiceoverBeat[];
  locale: ProductionStoryLocale;
  overview?: string | null;
  includeVoiceover?: boolean;
}): string {
  const sorted = input.beats
    .slice()
    .sort((a, b) => Number(a.order) - Number(b.order));
  if (!sorted.length) return cleanText(input.overview);
  const isThai = input.locale === "th";
  const includeVoiceover = input.includeVoiceover !== false;
  const overview = cleanText(input.overview);
  const totalSeconds = Math.max(...sorted.map((beat) => Number(beat.endSec) || 0));
  const header = isThai
    ? `แนวคิดวิดีโอแบบ Shot-by-shot: ${sorted.length} shot / ${formatSeconds(totalSeconds)} วินาที`
    : `Shot-by-shot video concept: ${sorted.length} shots / ${formatSeconds(totalSeconds)} seconds`;
  const shotLines = sorted.map((beat) => {
    const range = formatProductionStoryTimeRange(Number(beat.startSec) || 0, Number(beat.endSec) || 0);
    return [
      `${beat.order}. ${range} ${beat.title}`,
      beat.visualBeat ? `${isThai ? "ภาพ" : "Visual"}: ${beat.visualBeat}` : "",
      beat.cameraDirection ? `${isThai ? "มุมกล้อง" : "Camera"}: ${beat.cameraDirection}` : "",
      beat.emotion ? `${isThai ? "อารมณ์" : "Emotion"}: ${beat.emotion}` : "",
      includeVoiceover && beat.voiceoverScript
        ? `${isThai ? "บทพูด" : "Voiceover"} (${formatVoiceoverBudgetLabel(beat.speechBudgetSeconds, input.locale)}): ${beat.voiceoverScript}`
        : "",
    ].filter(Boolean).join("\n");
  });
  return [
    overview ? `${isThai ? "แกนเรื่อง" : "Story spine"}: ${overview}` : "",
    header,
    ...shotLines,
  ].filter(Boolean).join("\n\n");
}

export function buildProductionStoryVideoBriefFromVoiceoverBeats(input: {
  beats: ProductionStoryVoiceoverBeat[];
  aspectRatio?: string;
  locale: ProductionStoryLocale;
  variationRecipe?: ProductionStoryVariationRecipe;
}): Record<string, unknown> {
  const beats = input.beats.slice();
  const shotCount = beats.length || PRODUCTION_STORY_CONCEPT_SHOT_COUNT;
  return {
    schemaVersion: "1.0",
    durationSec: PRODUCTION_STORY_CONCEPT_TOTAL_SECONDS,
    aspectRatio: input.aspectRatio || "9:16",
    language: input.locale,
    structureLabel: input.locale === "th"
      ? `60 วินาที | ${shotCount} visual shot | บทพูดประมาณ 10 วินาที/shot`
      : `60 seconds | ${shotCount} visual shots | voiceover about 10s/shot`,
    noOnScreenText: true,
    variationRecipe: input.variationRecipe,
    shots: beats.map((beat) => ({
      order: beat.order,
      startSec: beat.startSec,
      endSec: beat.endSec,
      title: beat.title,
      videoPrompt: [
        "Vertical video 9:16, realistic product storytelling video, no subtitles, no crowded on-screen text.",
        input.variationRecipe ? `Story arc: ${input.variationRecipe.storyArc}.` : "",
        input.variationRecipe ? `Emotion: ${input.variationRecipe.emotion}.` : "",
        beat.visualBeat,
        `Camera: ${beat.cameraDirection}`,
      ].filter(Boolean).join(" "),
      subShots: [
        beat.visualBeat,
        beat.cameraDirection,
        input.locale === "th"
          ? `บทพูดธรรมชาติยาวประมาณ ${beat.speechBudgetSeconds} วินาที เพื่อไม่ให้เกิดช่วงเงียบนาน`
          : `Natural spoken line around ${beat.speechBudgetSeconds} seconds, avoiding long empty gaps`,
      ],
      thaiVoiceover: input.locale === "th" ? `พูดเป็นภาษาไทยว่า "${beat.voiceoverScript}"` : undefined,
      voiceoverScript: beat.voiceoverScript,
      speechBudgetSeconds: beat.speechBudgetSeconds,
      journeyStage: beat.journeyStage,
      emotion: beat.emotion,
    })),
  };
}

export function getProductionStoryConceptTimingFromVoiceoverBeats(
  beats: ProductionStoryVoiceoverBeat[] | null | undefined,
): { totalDurationSeconds: number; clipDurationSeconds: number; shotCount: number } | null {
  if (!beats?.length) return null;
  const ordered = beats
    .filter((beat) => Number.isFinite(Number(beat.startSec)) && Number.isFinite(Number(beat.endSec)) && Number(beat.endSec) > Number(beat.startSec))
    .sort((a, b) => Number(a.order) - Number(b.order));
  if (!ordered.length) return null;
  const totalDurationSeconds = Math.max(...ordered.map((beat) => Number(beat.endSec)));
  const shotCount = ordered.length;
  return {
    totalDurationSeconds,
    clipDurationSeconds: Number((totalDurationSeconds / shotCount).toFixed(2)),
    shotCount,
  };
}
