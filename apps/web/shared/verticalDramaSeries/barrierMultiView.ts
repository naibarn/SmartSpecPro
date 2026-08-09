/**
 * Explicit two-view contract for physical conversations across a barrier.
 *
 * This is intentionally separate from both `requiredCharacterRefs` (the
 * visible cast of the main start frame) and `screenCallerCharacterRefs` (a
 * device-mediated phone/video-call role).
 */

import type { VerticalDramaBarrierDialogue } from "./barrierDialogue";

export type VerticalDramaBarrierViewSide = "inside" | "outside";
export type VerticalDramaBarrierViewRole = "start_frame" | "barrier_reference";

export type VerticalDramaDualViewScenario =
  | "physical_barrier"
  | "remote_call"
  | "separate_locations";

export type VerticalDramaDualViewActivationSource =
  | "auto"
  | "manual"
  | "legacy";

export type VerticalDramaBarrierMultiViewStatus =
  | "configured"
  | "start_ready"
  | "reference_ready"
  | "ready"
  | "stale";

export type VerticalDramaBarrierMultiView = {
  enabled: true;
  /** Generalized product-facing mode. Legacy records omit this and normalize to physical_barrier. */
  scenario?: VerticalDramaDualViewScenario;
  activationSource?: VerticalDramaDualViewActivationSource;
  detection?: {
    confidence: number;
    reasonCodes: string[];
  };
  barrierType: "closed_door" | "none";
  relation: "same_establishment_adjacent_spaces" | "separate_locations";
  startView: {
    side: "inside";
    characterRefs: string[];
    locationKey: string;
  };
  referenceView: {
    side: "outside";
    characterRefs: string[];
    locationKey: string;
    /** Independently authored image prompt for Image 2; Image 1 remains frame.imagePrompt. */
    imagePrompt?: string;
    negativePrompt?: string;
    referenceFrameAssetId?: string;
  };
  dialogueSideMap: Record<string, VerticalDramaBarrierViewSide>;
  status?: VerticalDramaBarrierMultiViewStatus;
  staleReason?: string;
};

export type VerticalDramaDualViewDetectionInput = {
  text: string;
  sceneCharacterRefs: string[];
  screenCallerCharacterRefs?: string[];
  dialogueCharacterRefs?: string[];
  primaryLocationKey?: string;
  locations?: Array<{ locationKey: string; name?: string }>;
};

export type VerticalDramaBarrierCut = {
  subShotNumber: number;
  side: VerticalDramaBarrierViewSide;
  speakerRefs: string[];
  lineIndexes: number[];
  durationSeconds: number;
  viewRole: VerticalDramaBarrierViewRole;
};

function cleanRefs(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map(item => item.trim())
        .filter(Boolean)
    )
  );
}

function cleanSideMap(
  value: unknown
): Record<string, VerticalDramaBarrierViewSide> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([key, side]) => {
      const normalizedKey = key.trim();
      return normalizedKey && (side === "inside" || side === "outside")
        ? [[normalizedKey, side]]
        : [];
    })
  );
}

/** Normalize persisted JSON without using prose or synopsis inference. */
export function normalizeVerticalDramaBarrierMultiView(
  value: unknown
): VerticalDramaBarrierMultiView | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const startRaw =
    typeof raw.startView === "object" && raw.startView !== null
      ? (raw.startView as Record<string, unknown>)
      : {};
  const referenceRaw =
    typeof raw.referenceView === "object" && raw.referenceView !== null
      ? (raw.referenceView as Record<string, unknown>)
      : {};
  const startView = {
    side: "inside" as const,
    characterRefs: cleanRefs(startRaw.characterRefs ?? startRaw.character_refs),
    locationKey: String(
      startRaw.locationKey ?? startRaw.location_key ?? ""
    ).trim(),
  };
  const referenceFrameAssetId = String(
    referenceRaw.referenceFrameAssetId ??
      referenceRaw.reference_frame_asset_id ??
      ""
  ).trim();
  const referenceImagePrompt = String(
    referenceRaw.imagePrompt ?? referenceRaw.image_prompt ?? ""
  ).trim();
  const referenceNegativePrompt = String(
    referenceRaw.negativePrompt ?? referenceRaw.negative_prompt ?? ""
  ).trim();
  const referenceView = {
    side: "outside" as const,
    characterRefs: cleanRefs(
      referenceRaw.characterRefs ?? referenceRaw.character_refs
    ),
    locationKey: String(
      referenceRaw.locationKey ?? referenceRaw.location_key ?? ""
    ).trim(),
    ...(referenceImagePrompt ? { imagePrompt: referenceImagePrompt } : {}),
    ...(referenceNegativePrompt
      ? { negativePrompt: referenceNegativePrompt }
      : {}),
    ...(referenceFrameAssetId ? { referenceFrameAssetId } : {}),
  };
  const status = raw.status;
  const scenario =
    raw.scenario === "remote_call" ||
    raw.scenario === "separate_locations" ||
    raw.scenario === "physical_barrier"
      ? raw.scenario
      : "physical_barrier";
  const activationSource =
    raw.activationSource === "auto" ||
    raw.activationSource === "manual" ||
    raw.activationSource === "legacy"
      ? raw.activationSource
      : "legacy";
  const detectionRaw =
    typeof raw.detection === "object" &&
    raw.detection !== null &&
    !Array.isArray(raw.detection)
      ? (raw.detection as Record<string, unknown>)
      : undefined;
  const confidence = Number(detectionRaw?.confidence);
  const reasonCodes = cleanRefs(
    detectionRaw?.reasonCodes ?? detectionRaw?.reason_codes
  );
  const normalized: VerticalDramaBarrierMultiView = {
    enabled: true,
    scenario,
    activationSource,
    ...(Number.isFinite(confidence)
      ? {
          detection: {
            confidence: Math.min(1, Math.max(0, confidence)),
            reasonCodes,
          },
        }
      : {}),
    barrierType: scenario === "physical_barrier" ? "closed_door" : "none",
    relation:
      scenario === "physical_barrier"
        ? "same_establishment_adjacent_spaces"
        : "separate_locations",
    startView,
    referenceView,
    dialogueSideMap: cleanSideMap(raw.dialogueSideMap ?? raw.dialogue_side_map),
    ...(status === "configured" ||
    status === "start_ready" ||
    status === "reference_ready" ||
    status === "ready" ||
    status === "stale"
      ? { status }
      : {}),
    ...(typeof raw.staleReason === "string" && raw.staleReason.trim()
      ? { staleReason: raw.staleReason.trim() }
      : {}),
  };
  return normalized.enabled ? normalized : undefined;
}

export function validateVerticalDramaBarrierMultiView(
  view: VerticalDramaBarrierMultiView,
  dialogueCharacterRefs: readonly string[] = []
): string[] {
  const errors: string[] = [];
  if (view.startView.characterRefs.length === 0) {
    errors.push("start_view_requires_character");
  }
  if (view.referenceView.characterRefs.length === 0) {
    errors.push("reference_view_requires_character");
  }
  if (!view.startView.locationKey) errors.push("start_view_requires_location");
  if (!view.referenceView.locationKey) {
    errors.push("reference_view_requires_location");
  }
  const start = new Set(view.startView.characterRefs);
  if (view.referenceView.characterRefs.some(key => start.has(key))) {
    errors.push("view_character_refs_must_be_disjoint");
  }
  for (const characterKey of dialogueCharacterRefs) {
    if (!view.dialogueSideMap[characterKey]) {
      errors.push(`speaker_side_missing:${characterKey}`);
    }
  }
  for (const [characterKey, side] of Object.entries(view.dialogueSideMap)) {
    if (
      side === "inside" &&
      !view.startView.characterRefs.includes(characterKey)
    ) {
      errors.push(`inside_speaker_not_in_start_view:${characterKey}`);
    }
    if (
      side === "outside" &&
      !view.referenceView.characterRefs.includes(characterKey)
    ) {
      errors.push(`outside_speaker_not_in_reference_view:${characterKey}`);
    }
  }
  return Array.from(new Set(errors));
}

function normalizeBarrierSpeakerLabel(value: string): string {
  return value
    .trim()
    .replace(/^(คุณ|นาย|นางสาว|นาง)\s*/i, "")
    .replace(/\s+/g, "")
    .toLocaleLowerCase();
}

/**
 * Resolve dialogue speaker labels to the stable character keys configured on
 * the two views. Canonical dialogue commonly stores display names (for
 * example `กฤต`) while `dialogueSideMap` stores roster keys (for example
 * `character-3`). An ambiguous or unknown label is deliberately preserved so
 * the normal validator still fails closed with `speaker_side_missing:*`.
 */
export function resolveVerticalDramaBarrierDialogueCharacterRefs(params: {
  view: VerticalDramaBarrierMultiView;
  dialogueCharacterRefs: readonly string[];
  characters: ReadonlyArray<{
    characterKey: string;
    name?: string | null;
    aliases?: readonly string[];
  }>;
}): string[] {
  const configuredKeys = new Set([
    ...params.view.startView.characterRefs,
    ...params.view.referenceView.characterRefs,
  ]);
  const keyByNormalizedLabel = new Map<string, string | null>();
  const register = (label: string | null | undefined, characterKey: string) => {
    if (!label) return;
    const normalized = normalizeBarrierSpeakerLabel(label);
    if (!normalized) return;
    const existing = keyByNormalizedLabel.get(normalized);
    if (existing === undefined) keyByNormalizedLabel.set(normalized, characterKey);
    else if (existing !== characterKey) keyByNormalizedLabel.set(normalized, null);
  };

  for (const characterKey of configuredKeys) register(characterKey, characterKey);
  for (const character of params.characters) {
    if (!configuredKeys.has(character.characterKey)) continue;
    register(character.characterKey, character.characterKey);
    register(character.name, character.characterKey);
    for (const alias of character.aliases ?? []) {
      register(alias, character.characterKey);
    }
  }

  return params.dialogueCharacterRefs.map(rawLabel => {
    const label = rawLabel.trim();
    if (!label || params.view.dialogueSideMap[label]) return label;
    return keyByNormalizedLabel.get(normalizeBarrierSpeakerLabel(label)) ?? label;
  });
}

export function deriveVerticalDramaBarrierMultiViewStatus(params: {
  view: VerticalDramaBarrierMultiView;
  startFrameAssetId?: string | null;
}): VerticalDramaBarrierMultiViewStatus {
  if (params.view.status === "stale") return "stale";
  const hasStart = Boolean(params.startFrameAssetId);
  const hasReference = Boolean(params.view.referenceView.referenceFrameAssetId);
  if (hasStart && hasReference) return "ready";
  if (hasStart) return "start_ready";
  if (hasReference) return "reference_ready";
  return "configured";
}

export function projectLegacyBarrierDialogueToMultiView(
  legacy: VerticalDramaBarrierDialogue,
  params?: {
    startLocationKey?: string;
    referenceLocationKey?: string;
    dialogueSideMap?: Record<string, VerticalDramaBarrierViewSide>;
  }
): VerticalDramaBarrierMultiView {
  return {
    enabled: true,
    scenario: "physical_barrier",
    activationSource: "legacy",
    barrierType: "closed_door",
    relation: "same_establishment_adjacent_spaces",
    startView: {
      side: "inside",
      characterRefs: [...legacy.visibleCharacterRefs],
      locationKey: params?.startLocationKey?.trim() ?? "",
    },
    referenceView: {
      side: "outside",
      characterRefs: [...legacy.offscreenCharacterRefs],
      locationKey: params?.referenceLocationKey?.trim() ?? "",
    },
    dialogueSideMap: params?.dialogueSideMap ?? {},
    status: "configured",
    staleReason: "legacy_single_frame_requires_reference_frame",
  };
}

export function renderVerticalDramaBarrierMultiViewFactBlock(
  view: VerticalDramaBarrierMultiView
): string {
  const scenario = view.scenario ?? "physical_barrier";
  const scenarioRules =
    scenario === "remote_call"
      ? [
          "communication: phone_or_video_call_with_environment_cutaways",
          "Show each participant physically in their own location. Do not collapse the secondary participant into a phone-screen portrait only.",
        ]
      : scenario === "separate_locations"
        ? [
            "communication: cross_location_dialogue_or_parallel_action",
            "Show each view as a distinct physical location and cut between them according to the dialogue map.",
          ]
        : [
            "barrier_type: closed_door",
            "Keep the barrier closed and never place both sides in the same room.",
          ];
  return [
    "DUAL VIEW (MANDATORY):",
    `scenario: ${scenario}`,
    `view_set: ${view.relation}`,
    `image_1: start_frame characters=${view.startView.characterRefs.join(", ")} location=${view.startView.locationKey}`,
    `image_2: reference_frame characters=${view.referenceView.characterRefs.join(", ")} location=${view.referenceView.locationKey}`,
    `dialogue_side_map: ${Object.entries(view.dialogueSideMap)
      .map(([key, side]) => `${key}=${side}`)
      .join(", ")}`,
    ...scenarioRules,
    "coordinate_space: Image 1 and Image 2 each have their own viewer-left/viewer-right coordinates.",
    "frame_analysis_contract: characters in Image 1 use view_role=start_frame; characters in Image 2 use view_role=barrier_reference.",
    "prompt_anchor_contract: write the exact Image 1 or Image 2 label before every speaker name and viewer-relative position.",
    "Use Image 1 for primary-image speakers and Image 2 for secondary-image speakers. Never merge both physical environments into one image, analyze an Image 2 character as not_visible in Image 1, or silently fall back to one image.",
  ].join("\n");
}

/**
 * Deterministic safety net for generalized Dual View intent. The storyboard
 * model may declare the mode, but this detector can also recover strong Thai
 * or English cues. It intentionally returns no suggestion for an ordinary
 * phone-screen caller unless the text also asks for another environment or
 * a cutaway, avoiding false activation of Dual View.
 */
export function detectVerticalDramaDualViewIntent(
  input: VerticalDramaDualViewDetectionInput
): VerticalDramaBarrierMultiView | undefined {
  const text = input.text.toLocaleLowerCase();
  const barrierCue =
    /(ประตูปิด|ล็อกประตู|หน้าประตู|อีกฝั่ง(?:ของ)?ประตู|ผ่านประตู|คนละฝั่ง|closed door|locked door|outside the door|across the door)/iu.test(
      text
    );
  const callCue =
    /(โทรศัพท์|โทรหา|โทรคุย|คุยโทรศัพท์|ปลายสาย|วิดีโอคอล|video call|phone call|calls? (?:him|her|them)|on the phone)/iu.test(
      text
    );
  const separateLocationCue =
    /(คนละสถานที่|คนละที่|อีกสถานที่|อีกฝั่งของเมือง|อยู่ที่.+ส่วน.+อยู่|ตัด(?:ภาพ)?ไป|สลับ(?:ภาพ|มุม)|ระหว่างสองสถานที่|different locations?|another location|elsewhere|cut(?:s)? (?:to|between)|intercut)/iu.test(
      text
    );
  const environmentCutawayCue =
    /(เห็นบรรยากาศ|เห็นทั้งสองฝ่าย|สลับตามผู้พูด|ตัดสลับ|ปลายสายอยู่|อีกฝ่ายอยู่|show both sides|both environments|cutaway|reaction shot)/iu.test(
      text
    );

  const allRefs = Array.from(
    new Set([
      ...input.sceneCharacterRefs,
      ...(input.screenCallerCharacterRefs ?? []),
      ...(input.dialogueCharacterRefs ?? []),
    ])
  );
  if (allRefs.length < 2) return undefined;

  let scenario: VerticalDramaDualViewScenario | undefined;
  let confidence = 0;
  const reasonCodes: string[] = [];
  if (barrierCue) {
    scenario = "physical_barrier";
    confidence = 0.92;
    reasonCodes.push("physical_barrier_text");
  } else if (callCue && (separateLocationCue || environmentCutawayCue)) {
    scenario = "remote_call";
    confidence = 0.9;
    reasonCodes.push("remote_call_text", "environment_cutaway_text");
  } else if (separateLocationCue) {
    scenario = "separate_locations";
    confidence = 0.84;
    reasonCodes.push("separate_locations_text");
  }
  if (!scenario) return undefined;

  const explicitCallers = Array.from(
    new Set(input.screenCallerCharacterRefs ?? [])
  );
  const startRefs = input.sceneCharacterRefs.length
    ? Array.from(new Set(input.sceneCharacterRefs))
    : [allRefs[0]];
  let referenceRefs = explicitCallers.filter(key => !startRefs.includes(key));
  if (referenceRefs.length === 0) {
    referenceRefs = allRefs.filter(key => !startRefs.includes(key));
  }
  if (referenceRefs.length === 0 && startRefs.length > 1) {
    referenceRefs = startRefs.splice(1);
  }
  if (referenceRefs.length === 0) return undefined;

  const matchedLocations = (input.locations ?? []).filter(location => {
    const key = location.locationKey.toLocaleLowerCase();
    const name = location.name?.toLocaleLowerCase();
    return text.includes(key) || Boolean(name && text.includes(name));
  });
  const referenceLocationKey = matchedLocations.find(
    location => location.locationKey !== input.primaryLocationKey
  )?.locationKey;

  return {
    enabled: true,
    scenario,
    activationSource: "auto",
    detection: { confidence, reasonCodes },
    barrierType: scenario === "physical_barrier" ? "closed_door" : "none",
    relation:
      scenario === "physical_barrier"
        ? "same_establishment_adjacent_spaces"
        : "separate_locations",
    startView: {
      side: "inside",
      characterRefs: startRefs,
      locationKey: input.primaryLocationKey ?? "",
    },
    referenceView: {
      side: "outside",
      characterRefs: referenceRefs,
      locationKey: referenceLocationKey ?? "",
    },
    dialogueSideMap: Object.fromEntries([
      ...startRefs.map(key => [key, "inside" as const]),
      ...referenceRefs.map(key => [key, "outside" as const]),
    ]),
    status: "configured",
  };
}

export function buildVerticalDramaBarrierCutPlan(params: {
  view: VerticalDramaBarrierMultiView;
  windows: ReadonlyArray<{
    subShotNumber: number;
    characterKey: string;
    lineIndexes: number[];
    durationSeconds: number;
  }>;
}): VerticalDramaBarrierCut[] {
  return params.windows.map(window => {
    const side = params.view.dialogueSideMap[window.characterKey];
    if (!side) {
      throw new Error(
        `Missing barrier side mapping for ${window.characterKey}`
      );
    }
    return {
      subShotNumber: window.subShotNumber,
      side,
      speakerRefs: [window.characterKey],
      lineIndexes: [...window.lineIndexes],
      durationSeconds: window.durationSeconds,
      viewRole: side === "inside" ? "start_frame" : "barrier_reference",
    };
  });
}
