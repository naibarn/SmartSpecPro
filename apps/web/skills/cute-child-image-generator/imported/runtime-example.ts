import sceneData from "./scene-presets.json";
import rules from "./randomization-rules.json";

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

function weightedAge(): number {
  const roll = Math.random() * 100;
  if (roll < 50) return pick([2, 3, 4]);
  if (roll < 80) return pick([5, 6]);
  return pick([7, 8]);
}

function ageGroup(age: number): string {
  if (age <= 2) return "toddler";
  if (age <= 4) return "preschooler";
  if (age <= 8) return "young_child";
  if (age <= 12) return "older_child";
  if (age <= 17) return "teenager";
  return "adult";
}

function ageAppropriateIdentityNoun(age: number): string {
  return age >= 18 ? "person" : age >= 13 ? "teenager" : "child";
}

function subjectLabel(age: number, count: number, gender: string): string {
  const noun =
    age >= 18
      ? count === 1
        ? "adult person"
        : "adults"
      : age >= 13
        ? count === 1
          ? "teenager"
          : "teenagers"
        : count === 1
          ? "child"
          : "children";
  return `${count} ${age}-year-old ${gender === "any" ? "" : `${gender} `}${noun}`.trim();
}

function safetyGuidance(age: number): string {
  if (age >= 18) {
    return "Keep the subject clearly adult and age-appropriate. Use realistic adult proportions and natural skin texture. Clothing must be modest and age-appropriate. Avoid sexualized or revealing presentation, dramatic cosmetics, luxury influencer styling, text overlays, and watermarks.";
  }
  if (age >= 13) {
    return "Keep the subject clearly looking like a teenager and age-appropriate. Use realistic proportions and natural skin texture. Clothing must be modest and age-appropriate. Avoid adult-like styling, heavy makeup, glamorous fashion-model posing, sexualized appearance, revealing clothing, dramatic cosmetics, luxury influencer styling, text overlays, and watermarks.";
  }
  return "Keep the subject clearly looking like a child. Make the subject extra adorable, wholesome, and age-appropriate. Use realistic child proportions and natural skin texture. Clothing must be modest, cute, and age-appropriate. Avoid adult-like styling, heavy makeup, glamorous fashion-model posing, mature body proportions, sexualized appearance, revealing clothing, dramatic cosmetics, luxury influencer styling, text overlays, and watermarks.";
}

function resolveScene(sceneMode: string) {
  const presets = Array.isArray(sceneData.presets)
    ? (sceneData.presets as any[])
    : [];
  const fallback = {
    id: "custom_storyboard_scene",
    category: "custom",
    label_th: "ฉากตามไอเดียของผู้ใช้",
    label_en: "User story scene",
    prompt:
      "A coherent vertical short-video scene that follows the user's story idea, with a warm, welcoming, age-appropriate visual atmosphere.",
  };
  if (presets.length === 0) return fallback;
  if (sceneMode === "random_all") return pick(presets);
  if (sceneMode.startsWith("random_")) {
    const mode = (sceneData.random_modes as any[]).find(
      x => x.id === sceneMode
    );
    if (!mode) return pick(presets);
    const pool = presets.filter(x => x.category === mode.category);
    return pool.length > 0 ? pick(pool) : pick(presets);
  }
  return presets.find(x => x.id === sceneMode) ?? pick(presets);
}

export function buildCuteChildPrompt(input: any) {
  const age = input.age ?? weightedAge();
  const age_group = ageGroup(age);
  const identity_noun = ageAppropriateIdentityNoun(age);
  const subject_label = subjectLabel(
    age,
    input.child_count ?? 1,
    input.gender_style ?? "any"
  );
  const gender = input.gender_style ?? "any";
  const poolKey = gender === "girl" ? "girl" : gender === "boy" ? "boy" : "any";
  const appearancePoolKey = age >= 18 ? "adult" : poolKey;
  const scene = resolveScene(input.scene_mode ?? "random_all");
  const outfit = pick((rules as any).outfit_pools[appearancePoolKey]);
  const hairstyle = pick((rules as any).hair_pools[appearancePoolKey]);
  const accMode =
    input.accessory_mode && input.accessory_mode !== "random"
      ? input.accessory_mode
      : age >= 18
        ? "none"
        : pick(["bow", "flower_clip", "hat", "headband", "none"]);
  const accessory = pick((rules as any).accessories[accMode]);
  const expressions = (rules as any).expressions;
  const expression =
    input.expression && input.expression !== "random"
      ? expressions[input.expression]
      : pick(Object.values(expressions));

  const shotMap: Record<string, string> = {
    close_up: "close-up portrait",
    medium_close_up: "medium close-up portrait",
    waist_up: "waist-up portrait",
    full_body: "full-body portrait",
  };
  const shot_type =
    input.shot_type && input.shot_type !== "random"
      ? shotMap[input.shot_type]
      : pick(Object.values(shotMap));

  const refs = input.character_reference_images ?? [];
  const identityLock = input.identity_lock_mode ?? "strong";
  const identityBlock =
    refs.length > 0 && identityLock !== "off"
      ? `Use all uploaded character reference images as identity references for the same ${identity_noun} character. Preserve the same recognizable facial identity, apparent age, face shape, facial proportions, eye shape, nose, mouth, skin tone, and overall age-appropriate appearance. Do not invent a different ${identity_noun}. Keep the character clearly recognizable while changing clothing, accessories, pose, camera angle, activity, and scene according to the current request. Identity lock mode: ${identityLock}.`
      : "";

  const prompt = `
Create a highly adorable, wholesome, age-appropriate image of ${subject_label}.

${identityBlock}

The subject should look warm and heartwarming, with facial proportions and a natural expression appropriate for the requested age.

Appearance:
- age group: ${age_group}
- hairstyle: ${hairstyle}
- accessory: ${accessory}
- outfit: ${outfit}

Activity and framing:
- expression: ${expression}
- activity: ${input.custom_activity ?? "a natural age-appropriate pose"}
- framing: ${shot_type}

Scene:
${scene.prompt}
${input.scene_detail ? `Additional scene detail: ${input.scene_detail}` : ""}

Visual direction:
- style: ${input.style_mode ?? "photorealistic"}
- mood: ${input.background_mood ?? "soft"}
- soft natural-looking light
- clean composition
- social-media-friendly composition
- the subject must remain the main subject

${input.idea ? `Additional user idea: ${input.idea}` : ""}
${input.custom_notes ? `Additional notes: ${input.custom_notes}` : ""}

  ${safetyGuidance(age)}
  `.trim();

  return {
    resolved: {
      age,
      age_group,
      requested_scene_mode: input.scene_mode ?? "random_all",
      scene_id: scene.id,
      scene_category: scene.category,
      scene_label: { th: scene.label_th ?? null, en: scene.label_en ?? null },
      scene_prompt: scene.prompt,
      outfit,
      hairstyle,
      accessory,
      expression,
      shot_type,
      background_mood: input.background_mood ?? "soft",
      reference_image_count: refs.length,
      identity_lock_mode: identityLock,
    },
    generation_prompt: prompt,
    generation_request: {
      prompt,
      aspect_ratio: input.aspect_ratio ?? "4:5",
      reference_images: refs.map((x: any) => ({
        asset_id: x.asset_id ?? null,
        url: x.url ?? null,
        role: "identity_reference",
      })),
    },
    prompt_debug: {
      identity_block: identityBlock,
      subject_block: subject_label,
      scene_block: `${scene.prompt}${input.scene_detail ? ` | ${input.scene_detail}` : ""}`,
      style_block: `${input.style_mode ?? "photorealistic"} | ${input.background_mood ?? "soft"} | ${shot_type}`,
      safety_block: "single-prompt safety rules embedded",
    },
  };
}
