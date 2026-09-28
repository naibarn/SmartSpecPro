import type { VerticalDramaSupportingPresence } from "./supportingPresence";
import type { VideoPromptModelFamily } from "./videoPromptModelFamily";

/**
 * Deterministic admission checks for video motion prompts.
 *
 * This is deliberately provider-neutral: it does not claim that a provider
 * can render perfect physics. It only rejects prompt contracts that are
 * internally unsafe (identity drift, unscoped people, impossible grounded
 * motion) before a paid render is submitted. Genre policy is explicit so a
 * fantasy/sci-fi shot can use non-realistic motion without weakening the
 * identity and cast locks.
 */
export type VideoPromptGenreMode =
  | "grounded"
  | "fantasy"
  | "supernatural"
  | "fairy_tale"
  | "sci_fi"
  | "action";

export interface VideoPromptGenrePolicy {
  mode: VideoPromptGenreMode;
  physics: "realistic" | "genre_consistent";
  allowsNonRealisticMotion: boolean;
}

export type VideoPromptAssuranceSeverity = "blocking" | "warning" | "info";

export interface VideoPromptAssuranceFinding {
  code:
    | "unlisted_people"
    | "face_identity_risk"
    | "face_observability_risk"
    | "grounded_physics_violation"
    | "motion_contract_risk"
    | "missing_identity_lock";
  severity: VideoPromptAssuranceSeverity;
  message: string;
  repair: string;
}

export interface VideoPromptMotionAssuranceInput {
  prompt: string;
  negativePrompt?: string;
  family: VideoPromptModelFamily;
  genre?: unknown;
  establishedCharacterNames?: readonly string[];
  dialogueSpeakerNames?: readonly string[];
  /** Characters rendered only inside a phone/video screen. */
  screenCallerCharacterNames?: readonly string[];
  supportingPresence?: readonly VerticalDramaSupportingPresence[];
  frameAnalysis?: {
    facesSeparated?: boolean;
    people?: readonly {
      name?: string;
      eyesVisible?: boolean | string;
      occlusion?: string;
      faceSize?: string;
      overlappedByOtherFace?: boolean;
    }[];
  };
  motionProfile?: {
    effectiveRisk?: string;
    identityRisk?: string;
    cameraMotion?: string;
    characters?: readonly {
      characterKey?: string;
      startFacing?: string;
      endFacing?: string;
      turnMagnitude?: string;
      revealsHiddenSide?: boolean;
    }[];
  };
}

export interface VideoPromptMotionAssuranceResult {
  ok: boolean;
  policy: VideoPromptGenrePolicy;
  findings: VideoPromptAssuranceFinding[];
  blocking: VideoPromptAssuranceFinding[];
  warnings: VideoPromptAssuranceFinding[];
}

/**
 * Only these findings are genuine source-frame blockers.  All other findings
 * are prompt-contract problems that the orchestra can repair without asking
 * the user to spend another credit or manually rewrite the prompt.
 */
export function isVideoPromptSourceBlockingFinding(
  finding: VideoPromptAssuranceFinding,
): boolean {
  return finding.code === "face_observability_risk";
}

/**
 * Deterministic last-mile repair used when an LLM repair candidate still
 * contains a known unsafe phrase.  This is intentionally conservative: it
 * removes only positive instructions that the verifier can identify and then
 * appends an explicit safety contract.  It never invents dialogue or people.
 */
export function applyVideoPromptMotionSafetyFallback(
  prompt: string,
  findings: readonly VideoPromptAssuranceFinding[],
): string {
  let repaired = prompt.trim();
  const codes = new Set(findings.map(f => f.code));

  if (codes.has("unlisted_people")) {
    repaired = repaired.replace(
      /\b(?:an?\s+)?(?:extra|additional|background|unrelated|random)\s+(?:person|people|human|character|staff|passer(?:by|s))\b|\b(?:crowd|onlookers?|bystanders?|passers[- ]by)\b|(?:คนเพิ่ม|คนอื่น|ผู้คนด้านหลัง|ฝูงชน|ตัวประกอบ|คนเดินผ่าน)/giu,
      "the established cast only",
    );
    repaired += " Keep exactly the established cast only; no unnamed person, background extra, reflection, or duplicate body.";
  }

  if (codes.has("face_identity_risk")) {
    repaired = repaired.replace(
      /\b(?:full profile|back of (?:the )?head|face (?:hidden|obscured|covered|cropped|outside|unreadable)|eyes (?:not|never) visible|mouth (?:not|never) visible|extreme side angle|identity (?:changes|swap|drift)|face (?:morph|morphs|warping|distort(?:s|ed|ing)?)\b)|(?:ใบหน้าหันหลัง|ปิดบังใบหน้า|ใบหน้าเพี้ยน|สลับใบหน้า|ตาไม่เห็น|ปากไม่เห็น)/giu,
      "faces remain readable and identities remain preserved",
    );
    repaired += " Keep every required face readable, with preserved facial identity and natural frontal or three-quarter angles; never morph, swap, duplicate, or obscure a face.";
  }

  if (codes.has("grounded_physics_violation")) {
    repaired = repaired.replace(
      /\b(?:teleport(?:s|ed|ing)?|instant(?:ly)? transform|levitat(?:e|es|ed|ing)|float(?:s|ed|ing) without support|weightless|gravity[- ]defying|fuse[sd]? (?:with|into)|impossible (?:physics|motion)|rubber(?:y)? limbs?|extra limbs?|duplicate body)\b|(?:ละเมิดฟิสิกส์|ลอยโดยไม่มีแรงพยุง|หายตัว|วาร์ป|แขนขาเพิ่ม)/giu,
      "one continuous physically grounded action",
    );
    repaired += " The action obeys gravity, weight, contact, inertia, collision, cloth, hair, and prop continuity; no teleporting, floating, fused objects, rubber limbs, or impossible body changes.";
  }

  if (codes.has("motion_contract_risk")) {
    repaired += " Re-anchor every attached identity after each turn or cut; keep the speaking face readable and unchanged.";
  }

  return repaired.replace(/\s{2,}/g, " ").trim();
}

const NON_REALISTIC_GENRE = /(fantasy|supernatural|magic|fairy|myth|เทพ|เซียน|เหนือธรรมชาติ|เวทมนตร์|นิยาย|มหัศจรรย์|ไซไฟ|sci[- ]?fi)/iu;
const SCI_FI_GENRE = /(sci[- ]?fi|science fiction|ไซไฟ|อนาคต|อวกาศ)/iu;
const FAIRY_GENRE = /(fairy|fairytale|เทพนิยาย|นิทาน|มหัศจรรย์)/iu;
const SUPERNATURAL_GENRE = /(supernatural|magic|myth|เทพ|เซียน|เหนือธรรมชาติ|เวทมนตร์)/iu;
const ACTION_GENRE = /(action|ต่อสู้|แอ็กชัน|กำลังภายใน)/iu;

export function resolveVideoPromptGenrePolicy(value: unknown): VideoPromptGenrePolicy {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || !NON_REALISTIC_GENRE.test(text)) {
    return { mode: "grounded", physics: "realistic", allowsNonRealisticMotion: false };
  }
  if (SCI_FI_GENRE.test(text)) {
    return { mode: "sci_fi", physics: "genre_consistent", allowsNonRealisticMotion: true };
  }
  if (FAIRY_GENRE.test(text)) {
    return { mode: "fairy_tale", physics: "genre_consistent", allowsNonRealisticMotion: true };
  }
  if (SUPERNATURAL_GENRE.test(text)) {
    return { mode: "supernatural", physics: "genre_consistent", allowsNonRealisticMotion: true };
  }
  if (ACTION_GENRE.test(text)) {
    return { mode: "action", physics: "realistic", allowsNonRealisticMotion: false };
  }
  return { mode: "fantasy", physics: "genre_consistent", allowsNonRealisticMotion: true };
}

/** The model-specific shaping is a prompt dialect, never a capability override. */
export function videoPromptModelFamilyDirectives(family: VideoPromptModelFamily): string[] {
  switch (family) {
    case "grok":
      return [
        "Grok/Kie: put every critical constraint positively in prompt; do not rely on negative_prompt.",
        "Keep the first action and speaking-face identity anchors compact and explicit; preserve one continuous start-frame action.",
      ];
    case "veo":
      return [
        "Veo: use precise cinematic shot grammar and one motivated primary camera move; keep quoted speech tied to the named visible face.",
        "Keep diegetic audio separate from music and never turn dialogue into subtitles or on-screen text.",
      ];
    case "seedance":
      return [
        "Seedance: describe sequential cuts only when the beat requires them; re-anchor identity after every cut and keep transitions physically continuous.",
        "Use explicit segment timing and visible speaker faces for every spoken beat.",
      ];
    case "minimax_h3":
      return [
        "MiniMax H3: prefer short, unambiguous action beats with explicit subject, verb, object, camera, and shot transition order; avoid pronouns for speakers.",
        "Keep every speaking face readable and keep body/prop contact continuous across the whole shot.",
      ];
    case "flux3":
      return [
        "Flux3: use concrete cinematic composition and physically grounded temporal continuity; repeat identity anchors at each action or cut.",
        "Do not trade face readability or cast count for spectacle; effects must be bounded to the declared genre.",
      ];
    case "gemini_omni":
      return [
        "Gemini Omni: keep first-frame and last-frame intent explicit and preserve the continuous action between them.",
        "Treat attached image references as additive visual context; keep dialogue tied to the named visible speaker and preserve prop and identity continuity.",
      ];
    default:
      return [
        "Unknown video model: use the conservative provider-neutral contract; state all critical identity, cast, face, motion, and physics constraints positively.",
      ];
  }
}

export function buildVideoPromptMotionAssuranceDirective(params: {
  family: VideoPromptModelFamily;
  genre?: unknown;
  establishedCharacterCount?: number;
  supportingPresence?: readonly VerticalDramaSupportingPresence[];
}): string {
  const policy = resolveVideoPromptGenrePolicy(params.genre);
  const castCount = params.establishedCharacterCount ?? 0;
  const supporting = params.supportingPresence ?? [];
  const castRule = castCount > 0
    ? supporting.length > 0
      ? `Use exactly the established cast plus only these declared generic supporting people: ${supporting.map(p => `${p.role} x${p.countMin === p.countMax ? p.countMin : `${p.countMin}-${p.countMax}`}`).join(", ")}. Do not add any other person, reflection, duplicate, or background extra.`
      : `Use exactly the ${castCount} established cast member${castCount === 1 ? "" : "s"}; add no unnamed person, background extra, reflection, duplicate, or crowd.`
    : "Do not introduce people unless the shot facts explicitly declare them.";
  return [
    "VIDEO MOTION ASSURANCE CONTRACT (MANDATORY):",
    `- genre_mode: ${policy.mode}; physics_mode: ${policy.physics}.`,
    `- ${castRule}`,
    "- Preserve each attached identity's face geometry, eyes, hair, wardrobe, age, and body proportions; never morph, swap, duplicate, fuse, or invent a face.",
    "- Every speaking beat must keep the named speaker's face readable (frontal or natural three-quarter when possible); listeners keep mouths closed unless explicitly speaking.",
    "- A screen-only caller shown inside a phone/video display is not a physical-scene face: preserve the caller's identity and keep the screen present, but do not require physical-scene face separation or block natural display softness/overlap.",
    policy.allowsNonRealisticMotion
      ? "- Non-realistic motion is allowed only when explicitly motivated by the declared genre; keep gravity, contact, collision, scale, and character identity internally consistent, with no accidental extra bodies or face changes."
      : "- Keep one continuous physically plausible action: gravity, weight, contact, inertia, collision, cloth, hair, and props must behave naturally; no teleporting, floating, fused objects, rubber limbs, or impossible body changes.",
    ...videoPromptModelFamilyDirectives(params.family).map(line => `- ${line}`),
  ].join("\n");
}

const EXTRA_PERSON_PATTERN = /(\b(?:extra|additional|background|unrelated|random|another)\s+(?:person|people|human|character|extra|staff|passer(?:by|s))\b|\b(?:crowd|onlookers?|bystanders?|passers[- ]by)\b|(?:คนเพิ่ม|คนอื่น|ผู้คนด้านหลัง|ฝูงชน|ตัวประกอบ|คนเดินผ่าน))/iu;
const FACE_RISK_PATTERN = /(full profile|back of (?:the )?head|face (?:hidden|obscured|covered|cropped|outside|unreadable)|eyes (?:not|never) visible|mouth (?:not|never) visible|extreme side angle|identity (?:changes|swap|drift)|face (?:morph|warping|distort)|ใบหน้าหันหลัง|ปิดบังใบหน้า|ใบหน้าเพี้ยน|สลับใบหน้า|ตาไม่เห็น|ปากไม่เห็น)/iu;
const GROUNDED_PHYSICS_PATTERN = /(teleport(?:s|ed|ing)?|instant(?:ly)? transform|levitat(?:e|es|ed|ing)|float(?:s|ed|ing) without support|weightless|gravity[- ]defying|fuse[sd]? (?:with|into)|impossible (?:physics|motion)|rubber(?:y)? limbs?|extra limbs?|duplicate body|ละเมิดฟิสิกส์|ลอยโดยไม่มีแรงพยุง|หายตัว|วาร์ป|แขนขาเพิ่ม)/iu;

function hasUnnegatedMatch(text: string, pattern: RegExp): boolean {
  for (const match of text.matchAll(new RegExp(pattern.source, `${pattern.flags.replace("g", "")}g`))) {
    const index = match.index ?? 0;
    // Providers such as Grok may receive negative constraints inline in the
    // positive prompt field. Those are guards, not requested actions, so do
    // not reject them as if the model were asked to perform them.
    const prefix = text.slice(Math.max(0, index - 192), index);
    if (!/(?:\bno\b|\bnot\b|\bnever\b|\bwithout\b|\bavoid\b|\bdo not\b|\bno additional\b|\bno extra\b|negative\s+(?:prompt|constraints?)|negative:|ห้าม|ไม่มี|อย่า|ไม่เพิ่ม)/iu.test(prefix)) return true;
  }
  return false;
}

export function assureVideoPromptMotion(
  input: VideoPromptMotionAssuranceInput,
): VideoPromptMotionAssuranceResult {
  const policy = resolveVideoPromptGenrePolicy(input.genre);
  const findings: VideoPromptAssuranceFinding[] = [];
  const prompt = input.prompt.trim();
  const establishedCount = input.establishedCharacterNames?.length ?? 0;
  const supportingCount = (input.supportingPresence ?? []).length;
  const normalizeIdentity = (value: string) =>
    value
      .trim()
      .replace(/^(?:คุณ|นาย|นางสาว|นาง)\s*/iu, "")
      .replace(/\s+/g, "")
      .toLocaleLowerCase();
  const screenCallerNames = new Set(
    (input.screenCallerCharacterNames ?? [])
      .map(normalizeIdentity)
      .filter(Boolean),
  );
  const isScreenCaller = (name: string) =>
    screenCallerNames.has(normalizeIdentity(name));

  if (establishedCount > 0 && supportingCount === 0 && hasUnnegatedMatch(prompt, EXTRA_PERSON_PATTERN)) {
    findings.push({
      code: "unlisted_people",
      severity: "blocking",
      message: "Prompt introduces an unlisted person/group although no supporting presence was declared.",
      repair: "Remove the unlisted person/group and keep exactly the established cast.",
    });
  }
  if (hasUnnegatedMatch(prompt, FACE_RISK_PATTERN)) {
    findings.push({
      code: "face_identity_risk",
      severity: "blocking",
      message: "Prompt contains a positive face-obscuring or identity-changing instruction.",
      repair: "Keep each required face readable and preserve the attached identity; use a natural three-quarter view instead of hiding or morphing the face.",
    });
  }
  if (!policy.allowsNonRealisticMotion && hasUnnegatedMatch(prompt, GROUNDED_PHYSICS_PATTERN)) {
    findings.push({
      code: "grounded_physics_violation",
      severity: "blocking",
      message: "Prompt requests non-physical motion while the shot is in grounded physics mode.",
      repair: "Rewrite as one continuous action obeying gravity, weight, contact, inertia, collision, and prop continuity, or explicitly select a genre that authorizes the effect.",
    });
  }
  // A global `faces_separated=false` result is common when one of the
  // detected faces belongs to a small/soft phone or video-call display. It
  // must not block those shots; per-person physical-scene findings below
  // remain blocking when the vision model identifies them explicitly.
  if (input.frameAnalysis?.facesSeparated === false && screenCallerNames.size === 0) {
    findings.push({
      code: "face_observability_risk",
      severity: "blocking",
      message: "Attached frame analysis reports overlapping/ambiguous faces.",
      repair: "Ask the user to replace or repair the reference frame, or create a Video-Safe frame with separated readable faces.",
    });
  }
  const dialogueNames = new Set((input.dialogueSpeakerNames ?? []).map(name => name.trim()).filter(Boolean));
  for (const person of input.frameAnalysis?.people ?? []) {
    if (!person.name || !dialogueNames.has(person.name)) continue;
    if (isScreenCaller(person.name)) continue;
    if (person.eyesVisible === false || /^(?:false|no|hidden|not visible)$/iu.test(String(person.eyesVisible ?? "")) || person.overlappedByOtherFace === true || /tiny|small|hidden|occluded/iu.test(person.faceSize ?? "") || /occluded|covered|hidden/iu.test(person.occlusion ?? "")) {
      findings.push({
        code: "face_observability_risk",
        severity: "blocking",
        message: `Speaking face for ${person.name} is not sufficiently observable in the attached frame.`,
        repair: `Keep ${person.name}'s eyes, mouth, and jawline readable, or ask the user to replace/repair the reference frame before rendering.`,
      });
    }
  }
  const risk = input.motionProfile?.effectiveRisk ?? input.motionProfile?.identityRisk;
  const highRiskMotion = risk === "high" || /orbit|large_reframe|large|back_of_head|profile/iu.test(
    `${input.motionProfile?.cameraMotion ?? ""} ${input.motionProfile?.characters?.map(c => `${c.startFacing} ${c.endFacing} ${c.turnMagnitude}`).join(" ") ?? ""}`,
  );
  if (highRiskMotion && establishedCount > 0 && !/preserv|identity|face|facial|readable/iu.test(prompt)) {
    findings.push({
      code: "motion_contract_risk",
      severity: "blocking",
      message: "High-risk camera/turn motion has no explicit identity-preservation language.",
      repair: "Add a bounded continuous camera/action move and repeat the face identity/readability lock at the turn or cut.",
    });
  }
  if (establishedCount > 0 && !/exactly|established cast|attached identit|preserv|identity|characterKey|face/iu.test(prompt)) {
    findings.push({
      code: "missing_identity_lock",
      severity: "warning",
      message: "Prompt does not contain a recognizable identity-preservation anchor.",
      repair: "Add the attached identity/cast lock and keep every required face readable.",
    });
  }
  const blocking = findings.filter(f => f.severity === "blocking");
  const warnings = findings.filter(f => f.severity === "warning");
  return { ok: blocking.length === 0, policy, findings, blocking, warnings };
}
