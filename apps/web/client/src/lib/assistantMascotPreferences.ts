export type AssistantMascotStyle =
  | "droplet"
  | "star"
  | "shield"
  | "chat"
  | "orbit";
export type AssistantMascotMotion = "off" | "subtle" | "normal";

export interface AssistantMascotPreferences {
  version: 2;
  enabled: boolean;
  style: AssistantMascotStyle;
  motion: AssistantMascotMotion;
  notificationReminders: boolean;
  chatOnboarding: boolean;
}

export const DEFAULT_ASSISTANT_MASCOT_PREFERENCES: AssistantMascotPreferences =
  {
    version: 2,
    enabled: true,
    style: "droplet",
    motion: "subtle",
    notificationReminders: true,
    chatOnboarding: true,
  };

const STYLES = new Set<AssistantMascotStyle>([
  "droplet",
  "star",
  "shield",
  "chat",
  "orbit",
]);
const MOTIONS = new Set<AssistantMascotMotion>(["off", "subtle", "normal"]);
export const MAX_ASSISTANT_MASCOT_PREFERENCES_LENGTH = 2048;

export function parseAssistantMascotPreferences(
  value: unknown
): AssistantMascotPreferences | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.version !== 2 ||
    typeof candidate.enabled !== "boolean" ||
    typeof candidate.style !== "string" ||
    !STYLES.has(candidate.style as AssistantMascotStyle) ||
    typeof candidate.motion !== "string" ||
    !MOTIONS.has(candidate.motion as AssistantMascotMotion) ||
    typeof candidate.notificationReminders !== "boolean" ||
    typeof candidate.chatOnboarding !== "boolean"
  ) {
    return null;
  }
  return {
    version: 2,
    enabled: candidate.enabled,
    style: candidate.style as AssistantMascotStyle,
    motion: candidate.motion as AssistantMascotMotion,
    notificationReminders: candidate.notificationReminders,
    chatOnboarding: candidate.chatOnboarding,
  };
}

export function assistantMascotStorageKey(
  userId: number | string,
  tenantId: number | string
): string {
  return `assistant-mascot:v2:${encodeURIComponent(String(tenantId))}:${encodeURIComponent(String(userId))}`;
}

export function loadAssistantMascotPreferences(
  storage: Pick<Storage, "getItem">,
  key: string
): AssistantMascotPreferences {
  try {
    const raw = storage.getItem(key);
    if (!raw || raw.length > MAX_ASSISTANT_MASCOT_PREFERENCES_LENGTH) {
      return DEFAULT_ASSISTANT_MASCOT_PREFERENCES;
    }
    return (
      parseAssistantMascotPreferences(JSON.parse(raw)) ??
      DEFAULT_ASSISTANT_MASCOT_PREFERENCES
    );
  } catch {
    return DEFAULT_ASSISTANT_MASCOT_PREFERENCES;
  }
}

export function effectiveMascotMotion(
  motion: AssistantMascotMotion,
  reducedMotion: boolean
): "off" | "subtle" | "normal" {
  return reducedMotion ? "off" : motion;
}
