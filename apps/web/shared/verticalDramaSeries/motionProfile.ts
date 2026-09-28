/**
 * Feature 137 P1 (`verticalDramaMotionContracts`) motion-profile facts.
 *
 * This client-safe module never judges creative quality and never gates a
 * generation. The skill declares categorical facts and its own risk; code only
 * validates those declarations and raises risk to a deterministic floor.
 * Categories deliberately replace pseudo-precise yaw angles because an LLM
 * cannot measure degrees from a frame reliably. Every parser entry point is
 * total and never throws.
 */

export const VD_FACINGS = [
  "frontal",
  "three_quarter",
  "profile",
  "back_of_head",
  "not_visible",
] as const;
export const VD_TURN_MAGNITUDES = ["none", "subtle", "moderate", "large"] as const;
export const VD_CAMERA_MOTIONS = [
  "locked",
  "push_in",
  "pull_back",
  "small_pan_tilt",
  "small_lateral",
  "orbit",
  "large_reframe",
] as const;
export const VD_IDENTITY_RISKS = ["low", "medium", "high"] as const;

export type VdFacing = (typeof VD_FACINGS)[number];
export type VdTurnMagnitude = (typeof VD_TURN_MAGNITUDES)[number];
export type VdCameraMotion = (typeof VD_CAMERA_MOTIONS)[number];
export type VdIdentityRisk = (typeof VD_IDENTITY_RISKS)[number];
export type VdMotionContractStatus = "emitted" | "missing" | "invalid";

export interface VdMotionProfileCharacter {
  name: string;
  startFacing: VdFacing;
  endFacing: VdFacing;
  turnMagnitude: VdTurnMagnitude;
  revealsHiddenSide: boolean;
}

export interface VdMotionProfile {
  characters: VdMotionProfileCharacter[];
  cameraMotion: VdCameraMotion;
  newCharacterEnters: boolean;
  identityRisk: VdIdentityRisk;
  riskReasons: string[];
}

export type VdMotionProfileParseResult =
  | { status: "missing" | "invalid"; profile?: never; effectiveRisk?: never }
  | { status: "emitted"; profile: VdMotionProfile; effectiveRisk: VdIdentityRisk };

export function isVdFacing(value: unknown): value is VdFacing {
  return typeof value === "string" && (VD_FACINGS as readonly string[]).includes(value);
}

export function isVdTurnMagnitude(value: unknown): value is VdTurnMagnitude {
  return typeof value === "string" && (VD_TURN_MAGNITUDES as readonly string[]).includes(value);
}

export function isVdCameraMotion(value: unknown): value is VdCameraMotion {
  return typeof value === "string" && (VD_CAMERA_MOTIONS as readonly string[]).includes(value);
}

export function isVdIdentityRisk(value: unknown): value is VdIdentityRisk {
  return typeof value === "string" && (VD_IDENTITY_RISKS as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeEnum(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return normalized || undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return undefined;
}

function readEither(
  record: Record<string, unknown>,
  snakeCase: string,
  camelCase: string,
): unknown {
  return record[snakeCase] ?? record[camelCase];
}

/**
 * Parse the optional LLM field while retaining missing-vs-invalid telemetry.
 * A malformed profile never receives guessed defaults and therefore never
 * produces an effective risk.
 */
export function parseMotionProfile(raw: unknown): VdMotionProfileParseResult {
  try {
    if (raw === undefined || raw === null || raw === "") return { status: "missing" };
    if (!isRecord(raw)) return { status: "invalid" };

    const rawCharacters = raw.characters;
    const rawCameraMotion = normalizeEnum(readEither(raw, "camera_motion", "cameraMotion"));
    const rawNewCharacterEnters = readBoolean(
      readEither(raw, "new_character_enters", "newCharacterEnters"),
    );
    const rawIdentityRisk = normalizeEnum(readEither(raw, "identity_risk", "identityRisk"));
    const rawRiskReasons = readEither(raw, "risk_reasons", "riskReasons");

    if (
      !Array.isArray(rawCharacters) ||
      !isVdCameraMotion(rawCameraMotion) ||
      rawNewCharacterEnters === undefined ||
      !isVdIdentityRisk(rawIdentityRisk) ||
      !Array.isArray(rawRiskReasons) ||
      rawRiskReasons.some(reason => typeof reason !== "string")
    ) {
      return { status: "invalid" };
    }

    const characters: VdMotionProfileCharacter[] = [];
    for (const entry of rawCharacters.slice(0, 6)) {
      if (!isRecord(entry)) return { status: "invalid" };
      const name = typeof entry.name === "string" ? entry.name.trim().slice(0, 80) : "";
      const startFacing = normalizeEnum(readEither(entry, "start_facing", "startFacing"));
      const endFacing = normalizeEnum(readEither(entry, "end_facing", "endFacing"));
      const turnMagnitude = normalizeEnum(
        readEither(entry, "turn_magnitude", "turnMagnitude"),
      );
      const revealsHiddenSide = readBoolean(
        readEither(entry, "reveals_hidden_side", "revealsHiddenSide"),
      );
      if (
        !name ||
        !isVdFacing(startFacing) ||
        !isVdFacing(endFacing) ||
        !isVdTurnMagnitude(turnMagnitude) ||
        revealsHiddenSide === undefined
      ) {
        return { status: "invalid" };
      }
      characters.push({ name, startFacing, endFacing, turnMagnitude, revealsHiddenSide });
    }

    const profile: VdMotionProfile = {
      characters,
      cameraMotion: rawCameraMotion,
      newCharacterEnters: rawNewCharacterEnters,
      identityRisk: rawIdentityRisk,
      riskReasons: rawRiskReasons
        .map(reason => reason.trim().slice(0, 200))
        .filter(Boolean)
        .slice(0, 6),
    };
    return {
      status: "emitted",
      profile,
      effectiveRisk: resolveEffectiveIdentityRisk(profile),
    };
  } catch {
    return { status: "invalid" };
  }
}

/** Compatibility convenience for consumers that do not need status telemetry. */
export function resolveMotionProfile(raw: unknown): VdMotionProfile | undefined {
  const parsed = parseMotionProfile(raw);
  return parsed.status === "emitted" ? parsed.profile : undefined;
}

export function deriveMotionRiskFloor(profile: VdMotionProfile): VdIdentityRisk {
  if (
    profile.characters.some(
      entry => entry.revealsHiddenSide || entry.turnMagnitude === "large",
    ) ||
    profile.cameraMotion === "orbit" ||
    profile.cameraMotion === "large_reframe" ||
    profile.newCharacterEnters
  ) {
    return "high";
  }

  if (
    profile.characters.some(
      entry =>
        entry.turnMagnitude === "moderate" ||
        ((entry.startFacing === "profile" ||
          entry.startFacing === "back_of_head" ||
          entry.startFacing === "not_visible") &&
          entry.turnMagnitude !== "none"),
    )
  ) {
    return "medium";
  }
  return "low";
}

/** Max over low < medium < high; deterministic facts can never lower skill risk. */
export function resolveEffectiveIdentityRisk(profile: VdMotionProfile): VdIdentityRisk {
  const rank: Record<VdIdentityRisk, number> = { low: 0, medium: 1, high: 2 };
  const floor = deriveMotionRiskFloor(profile);
  return rank[floor] > rank[profile.identityRisk] ? floor : profile.identityRisk;
}
