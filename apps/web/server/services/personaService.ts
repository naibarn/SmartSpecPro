/**
 * Persona Service — resolution, sanitization, and prompt building for AI personas.
 *
 * Resolution chain (first match wins):
 * 1. conversation.personaId (explicitly set on the conversation)
 * 2. widget.defaultPersonaId (if widgetId is provided)
 * 3. user.defaultPersonaId
 * 4. tenant.defaultPersonaId
 * 5. PLATFORM_DEFAULT_PERSONA (hardcoded fallback)
 *
 * Tenant isolation: tenant-scoped personas must have persona.tenantId === conversation.tenantId.
 * Platform-scope personas (tenantId=null) are accessible to all tenants.
 */

import { eq, and, or, isNull, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  personaTemplates,
  users,
  tenants,
  conversations,
  chatWidgets,
  type PersonaTemplate,
} from "../../drizzle/schema";
import { getTenantFeatureFlags } from "./tenantFeatureFlagService";
import { FEATURE_FLAG_DEFAULTS } from "../../shared/featureFlags";

// ── Types ────────────────────────────────────────────────────

export interface PersonaCreateInput {
  name: string;
  description?: string | null;
  assistantNickname?: string | null;
  assistantGender?: "female" | "male" | "neutral" | null;
  workingHours?: PersonaWorkingHours | PersonaWorkingHoursLegacy | null;
  sourceTemplateIds?: string[];
  sourceTemplateLabels?: string[];
  sourceTemplateCategories?: string[];
  systemPromptPrefix: string;
  tone?: "formal" | "casual" | "friendly" | "technical" | "creative" | null;
  language?: string;
  responseStyle?: Record<string, unknown> | null;
  restrictions?: string[];
  scope: "platform" | "tenant" | "user";
  tenantId?: string | null;
  userId?: number | null;
  isDefault?: boolean;
  provisionedByBlueprintId?: string | null;
  provisionedByBlueprintMemberId?: string | null;
}

export interface PersonaPromptSegments {
  prefix: string;
  styleInstructions: string | null;
  restrictionsBulletPoints: string | null;
}

export interface PersonaNicknameCandidate {
  id: string;
  assistantNickname?: string | null;
}

export const PERSONA_WORKING_DAY_KEYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type PersonaWorkingDayKey = (typeof PERSONA_WORKING_DAY_KEYS)[number];

export interface PersonaWorkingHours {
  timezone: string;
  days: Partial<Record<PersonaWorkingDayKey, PersonaWorkingHoursDay>>;
}

export interface PersonaWorkingHoursDay {
  startTime: string;
  endTime: string;
}

export interface PersonaWorkingHoursLegacy {
  startTime: string;
  endTime: string;
  timezone: string;
}

// ── Platform Default Persona ─────────────────────────────────

export const PLATFORM_DEFAULT_PERSONA: Omit<PersonaTemplate, "createdAt" | "updatedAt"> = {
  id: "00000000-0000-0000-0000-000000000001",
  tenantId: null,
  userId: null,
  name: "SmartSpec Default",
  description: "Helpful, concise, markdown-friendly general assistant",
  assistantNickname: null,
  assistantGender: "neutral",
  workingHours: null,
  sourceTemplateIds: [],
  sourceTemplateLabels: [],
  sourceTemplateCategories: [],
  systemPromptPrefix: "You are a friendly, helpful AI assistant. Provide clear, concise, and well-formatted responses using markdown when appropriate.",
  tone: "friendly",
  language: "auto",
  responseStyle: {},
  restrictions: [],
  scope: "platform",
  isDefault: true,
  provisionedByBlueprintId: null,
  provisionedByBlueprintMemberId: null,
};

// ── Jailbreak Pattern Blocklist ──────────────────────────────

const BLOCKED_PATTERNS = [
  "[SYSTEM]",
  "[INST]",
  "<<SYS>>",
  "</s>",
  "[/INST]",
];

const BLOCKED_LINE_PREFIXES = ["---", "###"];
const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isAsciiNickname(value: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(value);
}

function findNicknamePosition(message: string, nickname: string): number {
  const atMentionIndex = message.indexOf(`@${nickname}`);
  if (atMentionIndex >= 0) return atMentionIndex;

  if (isAsciiNickname(nickname)) {
    const boundaryPattern = new RegExp(
      `(^|[^\\p{L}\\p{N}_])${escapeRegExp(nickname)}(?=$|[^\\p{L}\\p{N}_])`,
      "iu",
    );
    const match = boundaryPattern.exec(message);
    if (match) {
      return match.index + (match[1]?.length ?? 0);
    }
    return -1;
  }

  return message.indexOf(nickname);
}

function isLegacyWorkingHours(
  workingHours: PersonaWorkingHours | PersonaWorkingHoursLegacy,
): workingHours is PersonaWorkingHoursLegacy {
  return "startTime" in workingHours && "endTime" in workingHours;
}

function normalizeWorkingHours(
  workingHours: PersonaWorkingHours | PersonaWorkingHoursLegacy,
): PersonaWorkingHours {
  if (isLegacyWorkingHours(workingHours)) {
    const days = PERSONA_WORKING_DAY_KEYS.reduce<
      Partial<Record<PersonaWorkingDayKey, PersonaWorkingHoursDay>>
    >((acc, day) => {
      acc[day] = {
        startTime: workingHours.startTime,
        endTime: workingHours.endTime,
      };
      return acc;
    }, {});

    return {
      timezone: workingHours.timezone,
      days,
    };
  }

  return workingHours;
}

// ── Sanitization ─────────────────────────────────────────────

export function sanitizePersonaInput(input: PersonaCreateInput): PersonaCreateInput {
  const sanitized = { ...input };

  // Validate systemPromptPrefix length
  if (sanitized.systemPromptPrefix.length > 2000) {
    throw new Error("systemPromptPrefix must not exceed 2000 characters");
  }

  if (sanitized.assistantNickname !== undefined && sanitized.assistantNickname !== null) {
    sanitized.assistantNickname = sanitized.assistantNickname.trim();
    if (sanitized.assistantNickname.length === 0) {
      sanitized.assistantNickname = null;
    } else if (sanitized.assistantNickname.length > 80) {
      throw new Error("assistantNickname must not exceed 80 characters");
    }
  }

  if (
    sanitized.assistantGender !== undefined &&
    sanitized.assistantGender !== null &&
    !["female", "male", "neutral"].includes(sanitized.assistantGender)
  ) {
    throw new Error("assistantGender must be female, male, or neutral");
  }

  if (sanitized.workingHours !== undefined && sanitized.workingHours !== null) {
    const normalizedWorkingHours = normalizeWorkingHours(sanitized.workingHours);
    const trimmedTimezone = normalizedWorkingHours.timezone.trim();
    if (trimmedTimezone.length === 0 || trimmedTimezone.length > 100) {
      throw new Error("workingHours.timezone must be between 1 and 100 characters");
    }

    const sanitizedDays: Partial<Record<PersonaWorkingDayKey, PersonaWorkingHoursDay>> = {};
    let activeDayCount = 0;
    for (const day of PERSONA_WORKING_DAY_KEYS) {
      const workingDay = normalizedWorkingHours.days[day];
      if (!workingDay) continue;
      if (!TIME_OF_DAY_PATTERN.test(workingDay.startTime)) {
        throw new Error(`workingHours.days.${day}.startTime must be in HH:MM format`);
      }
      if (!TIME_OF_DAY_PATTERN.test(workingDay.endTime)) {
        throw new Error(`workingHours.days.${day}.endTime must be in HH:MM format`);
      }

      sanitizedDays[day] = {
        startTime: workingDay.startTime,
        endTime: workingDay.endTime,
      };
      activeDayCount += 1;
    }

    if (activeDayCount === 0) {
      throw new Error("workingHours must include at least one active day");
    }

    sanitized.workingHours = {
      timezone: trimmedTimezone,
      days: sanitizedDays,
    };
  }

  const sourceTemplateFields = [
    { key: "sourceTemplateIds", value: sanitized.sourceTemplateIds, maxLength: 120 },
    { key: "sourceTemplateLabels", value: sanitized.sourceTemplateLabels, maxLength: 200 },
    { key: "sourceTemplateCategories", value: sanitized.sourceTemplateCategories, maxLength: 100 },
  ] as const;

  for (const field of sourceTemplateFields) {
    if (!field.value) continue;
    if (field.value.length > 5) {
      throw new Error(`${field.key} must not exceed 5 entries`);
    }
    const normalized = field.value.map((entry) => entry.trim());
    if (normalized.some((entry) => entry.length === 0)) {
      throw new Error(`${field.key} must not contain empty values`);
    }
    if (normalized.some((entry) => entry.length > field.maxLength)) {
      throw new Error(`${field.key} contains a value that exceeds ${field.maxLength} characters`);
    }
    if (field.key !== "sourceTemplateCategories" && new Set(normalized).size !== normalized.length) {
      throw new Error(`${field.key} must contain unique values`);
    }

    sanitized[field.key] = normalized;
  }

  const templateFieldLengths = [
    sanitized.sourceTemplateIds?.length ?? 0,
    sanitized.sourceTemplateLabels?.length ?? 0,
    sanitized.sourceTemplateCategories?.length ?? 0,
  ];
  const nonZeroTemplateFieldLengths = templateFieldLengths.filter((length) => length > 0);
  if (nonZeroTemplateFieldLengths.length > 0 && new Set(nonZeroTemplateFieldLengths).size !== 1) {
    throw new Error("source template metadata arrays must have matching lengths");
  }

  // Block known jailbreak patterns
  const upperPrefix = sanitized.systemPromptPrefix.toUpperCase();
  for (const pattern of BLOCKED_PATTERNS) {
    if (upperPrefix.includes(pattern.toUpperCase())) {
      throw new Error(`systemPromptPrefix contains blocked pattern: ${pattern}`);
    }
  }

  // Block structural markers at line start
  const lines = sanitized.systemPromptPrefix.split("\n");
  for (const line of lines) {
    const trimmed = line.trimStart();
    for (const prefix of BLOCKED_LINE_PREFIXES) {
      if (trimmed.startsWith(prefix)) {
        throw new Error(`systemPromptPrefix contains blocked line prefix: ${prefix}`);
      }
    }
  }

  // Strip consecutive newlines > 2
  sanitized.systemPromptPrefix = sanitized.systemPromptPrefix.replace(/\n{3,}/g, "\n\n");

  // Validate restrictions
  if (sanitized.restrictions) {
    if (sanitized.restrictions.length > 20) {
      throw new Error("restrictions array must not exceed 20 entries");
    }
    for (const restriction of sanitized.restrictions) {
      if (restriction.length > 500) {
        throw new Error("each restriction must not exceed 500 characters");
      }
    }
    // Escape YAML separators within restriction text
    sanitized.restrictions = sanitized.restrictions.map((r) =>
      r.replace(/^---$/gm, "\\---"),
    );
  }

  return sanitized;
}

export function matchPersonaByNickname<T extends PersonaNicknameCandidate>(
  personas: T[],
  message?: string | null,
): T | null {
  const normalizedMessage = message?.trim().toLocaleLowerCase();
  if (!normalizedMessage) return null;

  const candidates = personas
    .map((persona) => {
      const nickname = persona.assistantNickname?.trim().toLocaleLowerCase();
      if (!nickname) return null;

      const position = findNicknamePosition(normalizedMessage, nickname);
      if (position < 0) return null;

      return {
        persona,
        position,
        nicknameLength: nickname.length,
      };
    })
    .filter((candidate): candidate is { persona: T; position: number; nicknameLength: number } => !!candidate)
    .sort((a, b) => {
      if (a.position !== b.position) return a.position - b.position;
      return b.nicknameLength - a.nicknameLength;
    });

  return candidates[0]?.persona ?? null;
}

// ── Prompt Building ──────────────────────────────────────────

export function buildPersonaPromptSegments(
  persona: Pick<
    PersonaTemplate,
    "systemPromptPrefix" | "responseStyle" | "restrictions" | "tone" | "assistantNickname" | "assistantGender"
  >,
): PersonaPromptSegments {
  const prefix = `[PERSONA START]\n${persona.systemPromptPrefix}\n[PERSONA END]`;

  let styleInstructions: string | null = null;
  const style = persona.responseStyle as Record<string, unknown> | null;
  if (style && Object.keys(style).length > 0) {
    const parts: string[] = [];
    if (persona.assistantNickname) {
      parts.push(`Your nickname is ${persona.assistantNickname}. Introduce yourself with this name when it helps the conversation feel natural.`);
    }
    if (persona.tone) parts.push(`Respond in a ${persona.tone} tone.`);
    if (persona.assistantGender === "female") {
      parts.push("If responding in Thai, use feminine polite particles such as ค่ะ or คะ when natural.");
    } else if (persona.assistantGender === "male") {
      parts.push("If responding in Thai, use masculine polite particles such as ครับ when natural.");
    } else if (persona.assistantGender === "neutral") {
      parts.push("If responding in Thai, prefer polite neutral phrasing and avoid forcing gendered particles when they feel unnatural.");
    }
    for (const [key, value] of Object.entries(style)) {
      if (value) parts.push(`${key}: ${value}`);
    }
    if (parts.length > 0) styleInstructions = parts.join(" ");
  } else {
    const parts: string[] = [];
    if (persona.assistantNickname) {
      parts.push(`Your nickname is ${persona.assistantNickname}. Introduce yourself with this name when it helps the conversation feel natural.`);
    }
    if (persona.tone) {
      parts.push(`Respond in a ${persona.tone} tone.`);
    }
    if (persona.assistantGender === "female") {
      parts.push("If responding in Thai, use feminine polite particles such as ค่ะ or คะ when natural.");
    } else if (persona.assistantGender === "male") {
      parts.push("If responding in Thai, use masculine polite particles such as ครับ when natural.");
    } else if (persona.assistantGender === "neutral") {
      parts.push("If responding in Thai, prefer polite neutral phrasing and avoid forcing gendered particles when they feel unnatural.");
    }
    if (parts.length > 0) {
      styleInstructions = parts.join(" ");
    }
  }

  let restrictionsBulletPoints: string | null = null;
  if (persona.restrictions && persona.restrictions.length > 0) {
    restrictionsBulletPoints =
      "Restrictions:\n" + persona.restrictions.map((r) => `- ${r}`).join("\n");
  }

  return { prefix, styleInstructions, restrictionsBulletPoints };
}

// ── Resolution ───────────────────────────────────────────────

async function loadPersonaById(
  personaId: string,
  conversationTenantId: string | null,
): Promise<PersonaTemplate | null> {
  const db = await getDb();
  if (!db) return null;

  const results = await db
    .select()
    .from(personaTemplates)
    .where(eq(personaTemplates.id, personaId))
    .limit(1);

  if (results.length === 0) return null;

  const persona = results[0];

  // Tenant isolation check: tenant-scoped personas must match conversation tenant
  if (persona.tenantId !== null && persona.tenantId !== conversationTenantId) {
    return null;
  }

  return persona;
}

export async function resolvePersona(
  conversation: { personaId?: string | null; tenantId?: string | null },
  user: { id: number; defaultPersonaId?: string | null },
  tenant: { id: string; defaultPersonaId?: string | null },
  widgetId?: string | null,
): Promise<PersonaTemplate | null> {
  // Check tenant-scoped persona feature flag
  const enabled = tenant.id
    ? (await getTenantFeatureFlags(tenant.id)).personaSystem
    : FEATURE_FLAG_DEFAULTS.personaSystem;
  if (!enabled) return null;

  const conversationTenantId = conversation.tenantId || tenant.id;

  // 1. Conversation-level persona
  if (conversation.personaId) {
    const persona = await loadPersonaById(conversation.personaId, conversationTenantId);
    if (persona) return persona;
  }

  // 2. Widget default persona
  if (widgetId) {
    const db = await getDb();
    if (db) {
      const widgets = await db
        .select({ defaultPersonaId: chatWidgets.defaultPersonaId })
        .from(chatWidgets)
        .where(eq(chatWidgets.id, widgetId))
        .limit(1);

      if (widgets.length > 0 && widgets[0].defaultPersonaId) {
        const persona = await loadPersonaById(widgets[0].defaultPersonaId, conversationTenantId);
        if (persona) return persona;
      }
    }
  }

  // 3. User default persona
  if (user.defaultPersonaId) {
    const persona = await loadPersonaById(user.defaultPersonaId, conversationTenantId);
    if (persona) return persona;
  }

  // 4. Tenant default persona
  if (tenant.defaultPersonaId) {
    const persona = await loadPersonaById(tenant.defaultPersonaId, conversationTenantId);
    if (persona) return persona;
  }

  // 5. Platform default
  return PLATFORM_DEFAULT_PERSONA as PersonaTemplate;
}

// ── CRUD helpers ─────────────────────────────────────────────

export async function listPersonas(
  userId: number,
  tenantId: string | null,
): Promise<PersonaTemplate[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(personaTemplates)
    .where(
      or(
        // Platform scope (tenantId is null)
        and(eq(personaTemplates.scope, "platform"), isNull(personaTemplates.tenantId)),
        // Tenant scope matching user's tenant
        ...(tenantId
          ? [and(eq(personaTemplates.scope, "tenant"), eq(personaTemplates.tenantId, tenantId))]
          : []),
        // User's own personas
        and(eq(personaTemplates.scope, "user"), eq(personaTemplates.userId, userId)),
      ),
    );
}

export async function getPersonaById(id: string): Promise<PersonaTemplate | null> {
  const db = await getDb();
  if (!db) return null;

  const results = await db
    .select()
    .from(personaTemplates)
    .where(eq(personaTemplates.id, id))
    .limit(1);

  return results[0] || null;
}

export async function createPersona(input: PersonaCreateInput): Promise<PersonaTemplate> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const sanitized = sanitizePersonaInput(input);

  const results = await db
    .insert(personaTemplates)
    .values({
      name: sanitized.name,
      description: sanitized.description,
      assistantNickname: sanitized.assistantNickname || null,
      assistantGender: sanitized.assistantGender || "neutral",
      workingHours: sanitized.workingHours || null,
      sourceTemplateIds: sanitized.sourceTemplateIds || [],
      sourceTemplateLabels: sanitized.sourceTemplateLabels || [],
      sourceTemplateCategories: sanitized.sourceTemplateCategories || [],
      systemPromptPrefix: sanitized.systemPromptPrefix,
      tone: sanitized.tone,
      language: sanitized.language || "auto",
      responseStyle: sanitized.responseStyle || {},
      restrictions: sanitized.restrictions || [],
      scope: sanitized.scope,
      tenantId: sanitized.tenantId || null,
      userId: sanitized.userId || null,
      isDefault: sanitized.isDefault || false,
      provisionedByBlueprintId: sanitized.provisionedByBlueprintId || null,
      provisionedByBlueprintMemberId: sanitized.provisionedByBlueprintMemberId || null,
    })
    .returning();

  return results[0];
}

export async function updatePersona(
  id: string,
  input: Partial<PersonaCreateInput>,
  tenantId?: string | null,
): Promise<PersonaTemplate | null> {
  const db = await getDb();
  if (!db) return null;

  // Run sanitization when any sanitizable field is present
  const needsSanitization =
    input.systemPromptPrefix !== undefined ||
    input.restrictions !== undefined ||
    input.assistantNickname !== undefined ||
    input.assistantGender !== undefined ||
    input.workingHours !== undefined ||
    input.sourceTemplateIds !== undefined ||
    input.sourceTemplateLabels !== undefined ||
    input.sourceTemplateCategories !== undefined;
  const sanitized = needsSanitization
    ? sanitizePersonaInput({
        ...input,
        name: input.name || "",
        systemPromptPrefix: input.systemPromptPrefix || "",
        scope: input.scope || "user",
      })
    : input;

  const updateFields: Record<string, unknown> = {};
  if (sanitized.name !== undefined) updateFields.name = sanitized.name;
  if (sanitized.description !== undefined) updateFields.description = sanitized.description;
  if (sanitized.assistantNickname !== undefined) updateFields.assistantNickname = sanitized.assistantNickname;
  if (sanitized.assistantGender !== undefined) updateFields.assistantGender = sanitized.assistantGender;
  if (sanitized.workingHours !== undefined) updateFields.workingHours = sanitized.workingHours;
  if (sanitized.sourceTemplateIds !== undefined) updateFields.sourceTemplateIds = sanitized.sourceTemplateIds;
  if (sanitized.sourceTemplateLabels !== undefined) updateFields.sourceTemplateLabels = sanitized.sourceTemplateLabels;
  if (sanitized.sourceTemplateCategories !== undefined) updateFields.sourceTemplateCategories = sanitized.sourceTemplateCategories;
  if (sanitized.systemPromptPrefix !== undefined) updateFields.systemPromptPrefix = sanitized.systemPromptPrefix;
  if (sanitized.tone !== undefined) updateFields.tone = sanitized.tone;
  if (sanitized.language !== undefined) updateFields.language = sanitized.language;
  if (sanitized.responseStyle !== undefined) updateFields.responseStyle = sanitized.responseStyle;
  if (sanitized.restrictions !== undefined) updateFields.restrictions = sanitized.restrictions;
  if (sanitized.isDefault !== undefined) updateFields.isDefault = sanitized.isDefault;
  updateFields.updatedAt = new Date();

  const results = await db
    .update(personaTemplates)
    .set(updateFields)
    .where(and(
      eq(personaTemplates.id, id),
      tenantId ? eq(personaTemplates.tenantId, tenantId) : isNull(personaTemplates.tenantId),
    ))
    .returning();

  return results[0] || null;
}

export async function deletePersona(id: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Nullify references before deleting
  await db.update(users).set({ defaultPersonaId: null }).where(eq(users.defaultPersonaId, id));
  await db.update(tenants).set({ defaultPersonaId: null }).where(eq(tenants.defaultPersonaId, id));
  await db.update(conversations).set({ personaId: null }).where(eq(conversations.personaId, id));

  await db.delete(personaTemplates).where(eq(personaTemplates.id, id));
}
