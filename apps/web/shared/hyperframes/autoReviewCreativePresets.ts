import { z } from "zod";

export const AutoReviewCreativePresetFamilySchema = z.enum([
  "tone_preset",
  "story_arc_preset",
  "pacing_preset",
  "camera_motion_preset",
  "visual_style_preset",
  "audio_preset",
  "platform_preset",
  "segment_structure_preset",
]);

export type AutoReviewCreativePresetFamily = z.infer<
  typeof AutoReviewCreativePresetFamilySchema
>;

export const AutoReviewCreativePresetSelectionSchema = z
  .object({
    presetId: z.string().trim().min(1).max(120),
    family: AutoReviewCreativePresetFamilySchema,
  })
  .strict();

export type AutoReviewCreativePresetSelection = z.infer<
  typeof AutoReviewCreativePresetSelectionSchema
>;

export type AutoReviewCreativePreset = {
  id: string;
  family: AutoReviewCreativePresetFamily;
  label: string;
  thaiLabel: string;
  description: string;
  directive: string;
  conflictGroup: string;
  allowedInfluence:
    | "tone_only"
    | "story_structure"
    | "camera_motion"
    | "visual_style"
    | "audio_behavior"
    | "segment_grouping";
  audioPolicy?: {
    requestedAudioStrategy: "native_video_audio" | "separate_tts_voiceover" | "silent";
    speechLanguage: "none" | "th" | "en";
    directive: string;
  };
};

const presets = [
  {
    id: "tone_warm_honest",
    family: "tone_preset",
    label: "Warm honest review",
    thaiLabel: "จริงใจเป็นกันเอง",
    description: "A believable customer-style review with practical wording.",
    directive:
      "Use a warm, honest customer-review tone. Keep wording practical, evidence-backed, and not exaggerated.",
    conflictGroup: "tone",
    allowedInfluence: "tone_only",
  },
  {
    id: "tone_expert_confident",
    family: "tone_preset",
    label: "Confident expert",
    thaiLabel: "ผู้เชี่ยวชาญมั่นใจ",
    description: "A knowledgeable reviewer explaining fit, use, and proof.",
    directive:
      "Use a confident expert tone. Explain practical reasons, proof moments, and usage fit without inventing claims.",
    conflictGroup: "tone",
    allowedInfluence: "tone_only",
  },
  {
    id: "tone_energetic_creator",
    family: "tone_preset",
    label: "Energetic creator",
    thaiLabel: "ครีเอเตอร์พลังสูง",
    description: "A faster creator-led review while staying truthful.",
    directive:
      "Use energetic creator pacing and expressive transitions while keeping product proof truthful and grounded.",
    conflictGroup: "tone",
    allowedInfluence: "tone_only",
  },
  {
    id: "story_problem_solution_result",
    family: "story_arc_preset",
    label: "Problem → Solution → Result",
    thaiLabel: "ปัญหา → วิธีแก้ → ผลลัพธ์",
    description: "Start from a real pain point, then show product use and result.",
    directive:
      "Use a problem-solution-result arc: start with a relatable pain point, introduce the product as a practical fix, then show a clear use/result moment.",
    conflictGroup: "story_arc",
    allowedInfluence: "story_structure",
  },
  {
    id: "story_proof_first",
    family: "story_arc_preset",
    label: "Proof-first review",
    thaiLabel: "เปิดด้วยหลักฐาน",
    description: "Lead with visible proof/detail before persuasion.",
    directive:
      "Use a proof-first arc: show visible evidence/detail early, then explain why it matters and close with fit/CTA.",
    conflictGroup: "story_arc",
    allowedInfluence: "story_structure",
  },
  {
    id: "story_objection_handling",
    family: "story_arc_preset",
    label: "Objection handling",
    thaiLabel: "ตอบข้อกังวลก่อนซื้อ",
    description: "Address common purchase hesitation honestly.",
    directive:
      "Use an objection-handling arc: raise a likely buyer concern, show evidence-based use/proof, and avoid unsupported promises.",
    conflictGroup: "story_arc",
    allowedInfluence: "story_structure",
  },
  {
    id: "pacing_compact_hook",
    family: "pacing_preset",
    label: "Fast hook",
    thaiLabel: "ฮุกเร็ว กระชับ",
    description: "Shorter opening and compact beat transitions.",
    directive:
      "Use a fast hook and compact beat transitions. Avoid dragging the setup; keep each visual beat purposeful.",
    conflictGroup: "pacing",
    allowedInfluence: "story_structure",
  },
  {
    id: "pacing_premium_slow",
    family: "pacing_preset",
    label: "Slow premium",
    thaiLabel: "พรีเมียม ช้าละเมียด",
    description: "Measured pacing for premium product proof.",
    directive:
      "Use slower premium pacing with fewer, cleaner motions and more deliberate product detail moments.",
    conflictGroup: "pacing",
    allowedInfluence: "story_structure",
  },
  {
    id: "camera_handheld_ugc",
    family: "camera_motion_preset",
    label: "Handheld UGC",
    thaiLabel: "ถือกล้องแบบ UGC",
    description: "Natural handheld creator framing.",
    directive:
      "Use natural handheld UGC camera language with stable product visibility and believable human movement.",
    conflictGroup: "camera_motion",
    allowedInfluence: "camera_motion",
  },
  {
    id: "camera_macro_detail",
    family: "camera_motion_preset",
    label: "Macro detail proof",
    thaiLabel: "มาโครเน้นรายละเอียด",
    description: "More close-up proof shots and product detail motion.",
    directive:
      "Use macro/detail camera moments to show visible product proof. Do not invent new product parts or textures.",
    conflictGroup: "camera_motion",
    allowedInfluence: "camera_motion",
  },
  {
    id: "visual_clean_studio",
    family: "visual_style_preset",
    label: "Clean studio",
    thaiLabel: "สตูดิโอสะอาด",
    description: "Clean lighting and uncluttered background.",
    directive:
      "Use clean studio-like lighting and uncluttered backgrounds while preserving the exact referenced product and character identity.",
    conflictGroup: "visual_style",
    allowedInfluence: "visual_style",
  },
  {
    id: "visual_real_home_use",
    family: "visual_style_preset",
    label: "Real home use",
    thaiLabel: "ใช้งานจริงในบ้าน",
    description: "Practical home-use context without changing product facts.",
    directive:
      "Use realistic home-use context and practical props only when compatible with reference frames. Do not change product shape, color, material, brand, or countable parts.",
    conflictGroup: "visual_style",
    allowedInfluence: "visual_style",
  },
  {
    id: "audio_silent",
    family: "audio_preset",
    label: "Silent video",
    thaiLabel: "ไม่มีเสียง",
    description: "Video generation should not create speech or sound.",
    directive:
      "Do not generate speech, voiceover, music, captions, subtitles, or text overlays inside provider video prompts.",
    conflictGroup: "audio",
    allowedInfluence: "audio_behavior",
    audioPolicy: {
      requestedAudioStrategy: "silent",
      speechLanguage: "none",
      directive: "Silent video: provider prompts must not ask for speech or music.",
    },
  },
  {
    id: "audio_thai_tts",
    family: "audio_preset",
    label: "Thai TTS voiceover",
    thaiLabel: "เสียงบรรยายไทยแบบ TTS แยก",
    description: "Use separate Thai TTS aligned to storyboard beats.",
    directive:
      "Use separate Thai TTS voiceover. The spoken content must come from the storyboard voiceover script and stay aligned with each shot; provider video prompts must not request native Thai speech.",
    conflictGroup: "audio",
    allowedInfluence: "audio_behavior",
    audioPolicy: {
      requestedAudioStrategy: "separate_tts_voiceover",
      speechLanguage: "th",
      directive:
        "Thai speech must be generated through separate TTS, not native video audio. Keep TTS text aligned with storyboard shot voiceover and visual beats.",
    },
  },
  {
    id: "audio_english_native",
    family: "audio_preset",
    label: "English native audio",
    thaiLabel: "เสียงอังกฤษในวิดีโอ",
    description: "Allow native English speech when the selected model supports it.",
    directive:
      "Use native English video audio only when the selected model supports it. Speech must follow storyboard voiceover intent and must not add product claims.",
    conflictGroup: "audio",
    allowedInfluence: "audio_behavior",
    audioPolicy: {
      requestedAudioStrategy: "native_video_audio",
      speechLanguage: "en",
      directive:
        "Native English audio may be requested only for supported models and must stay aligned with storyboard beats.",
    },
  },
  {
    id: "platform_tiktok_shop",
    family: "platform_preset",
    label: "TikTok Shop review",
    thaiLabel: "รีวิว TikTok Shop",
    description: "Vertical creator-commerce pacing.",
    directive:
      "Fit TikTok Shop vertical review behavior: clear hook, visual proof, practical use, and concise CTA without unsupported urgency or price claims.",
    conflictGroup: "platform",
    allowedInfluence: "story_structure",
  },
  {
    id: "segment_per_shot_control",
    family: "segment_structure_preset",
    label: "Per-shot: 1 shot per video",
    thaiLabel: "Per-shot: 1 ช็อตต่อ 1 วิดีโอ",
    description: "No multi-shot grouping. Keep one storyboard shot per generated video for maximum inspection and repair control.",
    directive:
      "Prefer per-shot generation so each storyboard beat stays as a separate video job for inspection and repair control.",
    conflictGroup: "segment_structure",
    allowedInfluence: "segment_grouping",
  },
  {
    id: "segment_adaptive_model",
    family: "segment_structure_preset",
    label: "Adaptive multi-shot: model decides sub-shots",
    thaiLabel: "Multi-shot อัตโนมัติ: โมเดลกำหนด sub-shot",
    description: "Let the planner group adjacent storyboard shots as sub-shots in one video only when the selected video model has reviewed support.",
    directive:
      "Use model-adaptive multi-shot grouping only when the selected video model capability allows it. Preserve ordered sub-shots and references.",
    conflictGroup: "segment_structure",
    allowedInfluence: "segment_grouping",
  },
  {
    id: "segment_compact_multi",
    family: "segment_structure_preset",
    label: "Compact multi-shot: more sub-shots per video",
    thaiLabel: "Multi-shot กระชับ: รวมหลาย sub-shot ต่อวิดีโอ",
    description: "Prefer grouping more adjacent storyboard shots as sub-shots in each generated video when the selected video model supports it.",
    directive:
      "Prefer compact multi-shot grouping for adjacent story beats when model capability allows it. Keep all sub-shots coherent and ordered.",
    conflictGroup: "segment_structure",
    allowedInfluence: "segment_grouping",
  },
] as const satisfies readonly AutoReviewCreativePreset[];

export const AUTO_REVIEW_CREATIVE_PRESETS: readonly AutoReviewCreativePreset[] =
  presets;

export function getAutoReviewCreativePreset(
  presetId: string
): AutoReviewCreativePreset | null {
  const normalized = String(presetId || "").trim();
  return (
    AUTO_REVIEW_CREATIVE_PRESETS.find(preset => preset.id === normalized) ??
    null
  );
}

export function normalizeAutoReviewCreativePresetSelections(
  value: unknown
): AutoReviewCreativePresetSelection[] {
  if (!Array.isArray(value)) return [];
  const byConflictGroup = new Map<string, AutoReviewCreativePresetSelection>();
  for (const item of value) {
    const parsed = AutoReviewCreativePresetSelectionSchema.safeParse(item);
    if (!parsed.success) continue;
    const preset = getAutoReviewCreativePreset(parsed.data.presetId);
    if (!preset || preset.family !== parsed.data.family) continue;
    byConflictGroup.set(preset.conflictGroup, {
      presetId: preset.id,
      family: preset.family,
    });
  }
  return [...byConflictGroup.values()];
}

export function buildAutoReviewCreativePresetDirective(input: {
  selections?: unknown;
  videoModel?: string | null;
}): string {
  const selections = normalizeAutoReviewCreativePresetSelections(
    input.selections
  );
  if (selections.length === 0) return "";
  const selectedPresets = selections
    .map(selection => getAutoReviewCreativePreset(selection.presetId))
    .filter((preset): preset is AutoReviewCreativePreset => Boolean(preset));
  const audio = selectedPresets.find(preset => preset.family === "audio_preset");
  const model = String(input.videoModel || "").toLowerCase();
  const seedanceThaiGuard =
    audio?.audioPolicy?.speechLanguage === "th" && /seedance/.test(model)
      ? "Selected video model appears to be Seedance; do not ask Seedance to generate Thai native speech. Keep Thai narration in separate TTS aligned to storyboard shot.voiceover."
      : "";
  return [
    "USER-SELECTED CREATIVE PRESET GUIDANCE:",
    ...selectedPresets.map(
      preset => `${preset.thaiLabel} (${preset.family}): ${preset.directive}`
    ),
    audio?.audioPolicy?.directive
      ? `Audio policy: ${audio.audioPolicy.directive}`
      : "",
    seedanceThaiGuard,
    "Preset guidance may affect tone, story structure, pacing, camera, visual style, audio behavior, or segment grouping only. It must not change product identity, product claims, character identity, reference frame roles, brand/logo/text details, or provider policy.",
  ]
    .filter(Boolean)
    .join(" ");
}

export function autoReviewCreativePresetRequestedAudioStrategy(
  selections?: unknown
): "native_video_audio" | "separate_tts_voiceover" | "silent" | null {
  const normalized = normalizeAutoReviewCreativePresetSelections(selections);
  const audio = normalized
    .map(selection => getAutoReviewCreativePreset(selection.presetId))
    .find(preset => preset?.family === "audio_preset");
  return audio?.audioPolicy?.requestedAudioStrategy ?? null;
}
