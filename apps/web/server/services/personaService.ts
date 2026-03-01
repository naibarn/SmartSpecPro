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
import { getFeatureFlag } from "./featureFlags";

// ── Types ────────────────────────────────────────────────────

export interface PersonaCreateInput {
  name: string;
  description?: string | null;
  systemPromptPrefix: string;
  tone?: "formal" | "casual" | "friendly" | "technical" | "creative" | null;
  language?: string;
  responseStyle?: Record<string, unknown> | null;
  restrictions?: string[];
  scope: "platform" | "tenant" | "user";
  tenantId?: string | null;
  userId?: number | null;
  isDefault?: boolean;
}

export interface PersonaPromptSegments {
  prefix: string;
  styleInstructions: string | null;
  restrictionsBulletPoints: string | null;
}

// ── Platform Default Persona ─────────────────────────────────

export const PLATFORM_DEFAULT_PERSONA: Omit<PersonaTemplate, "createdAt" | "updatedAt"> = {
  id: "00000000-0000-0000-0000-000000000001",
  tenantId: null,
  userId: null,
  name: "SmartSpec Default",
  description: "Helpful, concise, markdown-friendly general assistant",
  systemPromptPrefix: "You are a friendly, helpful AI assistant. Provide clear, concise, and well-formatted responses using markdown when appropriate.",
  tone: "friendly",
  language: "auto",
  responseStyle: {},
  restrictions: [],
  scope: "platform",
  isDefault: true,
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

// ── Sanitization ─────────────────────────────────────────────

export function sanitizePersonaInput(input: PersonaCreateInput): PersonaCreateInput {
  const sanitized = { ...input };

  // Validate systemPromptPrefix length
  if (sanitized.systemPromptPrefix.length > 2000) {
    throw new Error("systemPromptPrefix must not exceed 2000 characters");
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

// ── Prompt Building ──────────────────────────────────────────

export function buildPersonaPromptSegments(
  persona: Pick<PersonaTemplate, "systemPromptPrefix" | "responseStyle" | "restrictions" | "tone">,
): PersonaPromptSegments {
  const prefix = `[PERSONA START]\n${persona.systemPromptPrefix}\n[PERSONA END]`;

  let styleInstructions: string | null = null;
  const style = persona.responseStyle as Record<string, unknown> | null;
  if (style && Object.keys(style).length > 0) {
    const parts: string[] = [];
    if (persona.tone) parts.push(`Respond in a ${persona.tone} tone.`);
    for (const [key, value] of Object.entries(style)) {
      if (value) parts.push(`${key}: ${value}`);
    }
    if (parts.length > 0) styleInstructions = parts.join(" ");
  } else if (persona.tone) {
    styleInstructions = `Respond in a ${persona.tone} tone.`;
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
  // Check feature flag
  const enabled = await getFeatureFlag("AI_PERSONA_ENABLED");
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
      systemPromptPrefix: sanitized.systemPromptPrefix,
      tone: sanitized.tone,
      language: sanitized.language || "auto",
      responseStyle: sanitized.responseStyle || {},
      restrictions: sanitized.restrictions || [],
      scope: sanitized.scope,
      tenantId: sanitized.tenantId || null,
      userId: sanitized.userId || null,
      isDefault: sanitized.isDefault || false,
    })
    .returning();

  return results[0];
}

export async function updatePersona(
  id: string,
  input: Partial<PersonaCreateInput>,
): Promise<PersonaTemplate | null> {
  const db = await getDb();
  if (!db) return null;

  // Run sanitization when any sanitizable field is present
  const needsSanitization = input.systemPromptPrefix !== undefined || input.restrictions !== undefined;
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
    .where(eq(personaTemplates.id, id))
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
