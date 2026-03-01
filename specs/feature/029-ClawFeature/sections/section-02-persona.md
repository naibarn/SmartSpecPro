I now have all the context needed to generate the section. Let me compile the comprehensive section content.

# Section 02: F08 -- AI Persona System

## Overview

This section implements the AI Persona System (F08), which allows platform, tenant, and user-level customization of AI assistant behavior through reusable persona templates. Personas define a system prompt prefix, tone, response style, language preference, and restrictions that are injected into every LLM interaction.

**Depends on:** section-01-database (the `persona_templates` table, `users.defaultPersonaId`, `tenants.defaultPersonaId`, `conversations.personaId`, and `conversations.tenantId` columns must already exist in the database).

**Feature flag:** `AI_PERSONA_ENABLED` (gated via `tenants.settings.featureFlags`).

---

## 1. Tests First

All tests should be written before implementation. The project uses **Vitest** for TypeScript and **pytest** for Python.

### 1.1 Persona Service Tests

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/personaService.test.ts`

Test stubs for `resolvePersona`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mocks for DB and dependent services
const { mockSelect } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
}));

vi.mock("../../db", () => ({
  db: { select: mockSelect },
}));

vi.mock("../../../drizzle/schema", () => ({
  personaTemplates: { id: "pt.id", tenantId: "pt.tenantId", scope: "pt.scope" },
  users: { id: "u.id", defaultPersonaId: "u.defaultPersonaId" },
  tenants: { id: "t.id", defaultPersonaId: "t.defaultPersonaId" },
  conversations: { id: "c.id", personaId: "c.personaId", tenantId: "c.tenantId" },
  chatWidgets: { id: "cw.id", defaultPersonaId: "cw.defaultPersonaId" },
}));

describe("personaService.resolvePersona", () => {
  it("returns conversation-level persona when personaId is set");
  it("returns widget default persona when widgetId provided and widget has default");
  it("returns user default when no conversation/widget persona");
  it("returns tenant default when no user default");
  it("returns platform default as last fallback");
  it("validates tenant isolation (persona.tenantId must match conversation.tenantId)");
  it("allows platform-scope personas (tenantId=null) for any tenant");
});
```

### 1.2 Chat Context Integration Tests

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/personaChatContext.test.ts`

```typescript
describe("buildChatContext persona integration", () => {
  it("prepends persona systemPromptPrefix to system prompt");
  it("appends response style instructions when persona has responseStyle");
  it("appends restrictions as bullet points");
  it("works when persona system is disabled (no feature flag)");
});
```

Additionally, a test in the memoryService context:

```typescript
describe("memoryService.buildChatContext persona integration", () => {
  it("resolves and injects persona into context");
});
```

### 1.3 Agency Integration Tests

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/_core/__tests__/agencyStreamPersona.test.ts`

```typescript
describe("agencyStreamProxy persona passthrough", () => {
  it("passes persona_prefix in run config to Python backend");
});
```

**File:** `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_agency_persona.py`

```python
import pytest
from unittest.mock import MagicMock, patch

@pytest.mark.unit
class TestAgencyPersonaPrefix:
    """Test persona_prefix injection into agent instructions."""

    def test_prepends_persona_prefix_to_agent_instructions(self):
        """When persona_prefix is in run config, it is prepended to agent.instructions."""
        ...

    def test_agent_instructions_unchanged_when_no_persona_prefix(self):
        """When no persona_prefix in config, agent.instructions are unmodified."""
        ...
```

### 1.4 Prompt Injection Mitigation Tests

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/personaSanitization.test.ts`

```typescript
describe("persona prompt injection mitigation", () => {
  it("rejects system_prompt_prefix over 2000 chars");
  it("blocks known jailbreak patterns ([SYSTEM], [INST], etc.) in prefix");
  it("strips consecutive newlines >2 from prefix");
  it("rejects restrictions array over 20 entries");
  it("rejects single restriction over 500 chars");
});
```

### 1.5 tRPC Router Tests

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/persona.test.ts`

```typescript
describe("persona tRPC router", () => {
  // list
  it("list returns user's own + tenant + platform scope personas");
  it("list does NOT return other tenants' personas");

  // RBAC
  it("create with scope='platform' requires admin role");
  it("create with scope='tenant' requires domain_admin for own tenant");
  it("create with scope='user' allowed for any authenticated user");

  // delete side-effects
  it("delete persona sets defaultPersonaId to null on affected users/tenants");

  // defaults
  it("setUserDefault updates user.defaultPersonaId");
});
```

---

## 2. Implementation Details

### 2.1 Persona Service

**Create file:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/personaService.ts`

This is the shared module providing persona CRUD and the resolution function. Both `chatService.ts` and `memoryService.ts` call this service.

**Resolution function signature and logic:**

```typescript
/**
 * Resolve which persona to use for a given conversation context.
 *
 * Resolution chain (first match wins):
 * 1. conversation.personaId (explicitly set on the conversation)
 * 2. widget.defaultPersonaId (if widgetId is provided and widget has a default)
 * 3. user.defaultPersonaId (user's personal default)
 * 4. tenant.defaultPersonaId (tenant-wide default)
 * 5. PLATFORM_DEFAULT_PERSONA (hardcoded constant)
 *
 * Tenant isolation: tenant-scoped personas must have persona.tenantId === conversation.tenantId.
 * Platform-scope personas (tenantId=null) are accessible to all tenants.
 */
export async function resolvePersona(
  conversation: { personaId?: string | null; tenantId?: string | null },
  user: { id: number; defaultPersonaId?: string | null },
  tenant: { id: string; defaultPersonaId?: string | null },
  widgetId?: string | null
): Promise<PersonaTemplate | null>
```

At each step, when loading a persona by ID from `persona_templates`, validate:
- If `persona.tenantId` is not null, it must equal the conversation's `tenantId`
- If `persona.tenantId` is null (platform scope), it is allowed for any tenant

The `PLATFORM_DEFAULT_PERSONA` constant should be defined in this file as a static object matching the "SmartSpec Default" seed persona (see section 2.5 below).

**Additional exported functions:**

```typescript
/** Sanitize persona fields before create/update (prompt injection prevention). */
export function sanitizePersonaInput(input: PersonaCreateInput): PersonaCreateInput

/** Build the persona-aware system prompt segments. */
export function buildPersonaPromptSegments(persona: PersonaTemplate): {
  prefix: string;       // [PERSONA START]...systemPromptPrefix...[PERSONA END]
  styleInstructions: string | null;
  restrictionsBulletPoints: string | null;
}
```

**Database table reference** (created by section-01-database): The `persona_templates` table has columns: `id` (varchar(36) PK), `tenantId` (nullable FK to tenants), `userId` (nullable FK to users), `name`, `description`, `systemPromptPrefix` (text, max 2000 chars), `tone` (CHECK: 'formal'|'casual'|'friendly'|'technical'|'creative'), `language` (text, default 'auto'), `responseStyle` (JSONB), `restrictions` (text[]), `scope` (CHECK: 'platform'|'tenant'|'user'), `isDefault` (boolean), `createdAt`, `updatedAt`.

### 2.2 Chat Context Integration

**Modify file:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/chatService.ts`

The existing `buildChatContext` function (starting at line 647) has this signature:

```typescript
export async function buildChatContext(
  conversationId: number,
  userId: number,
  systemPrompt?: string
): Promise<Array<{ role: "system" | "user" | "assistant"; content: string }>>
```

Changes required:
1. Add optional `tenantId?: string` parameter
2. Call `personaService.resolvePersona()` early in the function, loading the conversation, user, and tenant objects as needed
3. Prepend `persona.systemPromptPrefix` before the existing system prompt (wrapped in `[PERSONA START]...[PERSONA END]` delimiters)
4. If `persona.responseStyle` is non-empty, append style instructions to the system prompt
5. If `persona.restrictions` is non-empty, append restriction bullet points to the system prompt

**Also modify file:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/memoryService.ts`

The independent `buildChatContext` function (starting at line 668) has a different signature:

```typescript
export async function buildChatContext(
  conversationId: number,
  userId: number,
  systemPrompt?: string,
  options?: {
    contextBudget?: number;
    currentUserMessage?: string;
    memoryMode?: "full" | "no_long" | "off";
    projectId?: string;
  }
): Promise<ChatContext>
```

Apply the same persona integration pattern here. Both functions must call the shared `personaService.resolvePersona()` to ensure consistent behavior.

**Update callers of buildChatContext:** Identify all call sites and ensure they pass `tenantId` when available:
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/chatService.ts` (internal calls)
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/channelGateway.ts` (line ~381, passes to chatService version)

When the persona feature flag `AI_PERSONA_ENABLED` is disabled (or missing), the function should skip persona resolution entirely and behave as before -- no persona injection, no errors.

### 2.3 Agency Integration

**Modify file:** `/home/dev/projects/SmartSpecPro/apps/web/server/_core/agencyStreamProxy.ts`

In the `registerAgencyStreamRoutes` function, before the upstream `fetch` call to the Python backend (around line 138), resolve the persona for the current conversation and tenant:

1. Query the conversation by `conversationId` to get its `personaId` and `tenantId`
2. Call `personaService.resolvePersona()` with the conversation, user, and tenant
3. If a persona is resolved, include `persona_prefix: buildPersonaPromptSegments(persona).prefix` in the JSON body sent to the Python backend

The `body: JSON.stringify({...})` at line 148 should include the `persona_prefix` field when present.

**Modify file:** `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_swarm_adapter.py`

In the `create_agent` method (line 122), check for `persona_prefix` in the run config. If present, prepend it to `config.instructions`:

```python
def create_agent(self, config: AgentConfig, user_token: str, run_config: dict | None = None) -> Agent:
    instructions = config.instructions
    if run_config and run_config.get("persona_prefix"):
        instructions = f"{run_config['persona_prefix']}\n\n{instructions}"
    # ... rest of method using modified instructions
```

The `AgencyConfig` model or the calling code in `agency_service.py` needs to pass the `persona_prefix` from the request payload through to `create_agent`.

### 2.4 Prompt Injection Mitigation

Implement within `personaService.ts` in the `sanitizePersonaInput` function:

**`system_prompt_prefix` validation:**
- Max 2000 characters total length -- reject with descriptive error if exceeded
- Strip consecutive newlines greater than 2 (replace `\n{3,}` with `\n\n`)
- Block known jailbreak patterns using a blocklist array: `[SYSTEM]`, `[INST]`, `<<SYS>>`, `</s>`, `[/INST]`; also block lines starting with `---` or `###` (structural markers that could break prompt boundaries)
- Wrap final content in structural delimiters: `[PERSONA START]\n...content...\n[PERSONA END]`

**`restrictions[]` validation:**
- Max 20 entries in the array -- reject if exceeded
- Each entry max 500 characters -- reject if any exceeds
- Escape YAML separators (`---`) within restriction text

**RBAC enforcement rules** (implemented in the tRPC router, section 2.7):
- `scope='platform'`: CREATE/UPDATE/DELETE requires `admin` role (the project's `roleEnum` has `user`, `admin`, `domain_admin` -- there is no `super_admin`)
- `scope='tenant'`: requires `domain_admin` role AND the persona's `tenantId` must match the user's `currentTenantId`
- `scope='user'`: requires the persona's `userId` to match `ctx.user.id`

### 2.5 Seed Data

**File:** `/home/dev/projects/SmartSpecPro/apps/web/drizzle/seed.ts` (or a separate seed script)

After the persona_templates migration is applied, insert 6 platform-scope personas (tenantId=null, userId=null, scope='platform'):

| Name | Tone | Language | Description |
|------|------|----------|-------------|
| SmartSpec Default | friendly | auto | Helpful, concise, markdown-friendly general assistant |
| Professional Advisor | formal | auto | Business-appropriate, structured responses |
| Creative Partner | creative | auto | Imaginative, expressive, explorative |
| Technical Expert | technical | auto | Precise, code-heavy, documentation-oriented |
| Thai Assistant | friendly | th | Always responds in Thai regardless of input language |
| Concise Bot | casual | auto | Ultra-short answers, minimal formatting |

Each persona should have appropriate `systemPromptPrefix` content (e.g., "You are a friendly, helpful AI assistant..." for SmartSpec Default). The SmartSpec Default should have `isDefault: true`.

Use `gen_random_uuid()` or pre-generated UUIDs for the `id` column. Use an idempotent pattern (INSERT ... ON CONFLICT DO NOTHING or check existence first) so the seed can be re-run safely.

### 2.6 Frontend Components

**Create file:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/chat/PersonaSelector.tsx`

A dropdown component rendered in the conversation header area. It:
- Lists the user's own personas + tenant personas + platform personas (via `persona.list` tRPC query)
- Shows the currently active persona (resolved or explicitly set)
- On selection, calls a mutation to update `conversations.personaId`
- Uses Radix UI `Select` or `Popover` primitive from `@smartspec/ui`

**Create file:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/PersonaSettings.tsx`

User settings page for persona management:
- CRUD for user-scope personas (scope='user')
- Set default persona for the user
- Form fields: name, description, system prompt prefix, tone selector, language, response style, restrictions array editor
- Preview of how the persona prompt will look

**Create file:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/AdminPersonas.tsx`

Admin page for managing tenant-scope and platform-scope personas:
- CRUD for tenant-scope personas (domain_admin) and platform-scope personas (admin)
- Token overhead preview showing approximate token count of the persona prefix
- Table listing all personas with scope, author, and usage stats

Register these pages in the app router at `/home/dev/projects/SmartSpecPro/apps/web/client/src/App.tsx` and add menu entries in `/home/dev/projects/SmartSpecPro/packages/shared/src/constants/menu.ts`.

### 2.7 tRPC Router

**Create file:** `/home/dev/projects/SmartSpecPro/apps/web/server/routers/persona.ts`

Register this router in `/home/dev/projects/SmartSpecPro/apps/web/server/routers.ts` by importing it and adding `persona: personaRouter` to the `appRouter` definition.

Procedures:

```typescript
import { router, protectedProcedure, adminProcedure, domainAdminProcedure } from "../_core/trpc";
import { z } from "zod";

export const personaRouter = router({
  /** List personas visible to the current user (own + tenant + platform scope). */
  list: protectedProcedure.query(async ({ ctx }) => {
    // Query persona_templates WHERE:
    //   scope='platform' (tenantId IS NULL)
    //   OR (scope='tenant' AND tenantId = user's currentTenantId)
    //   OR (scope='user' AND userId = ctx.user.id)
    // Must NOT return other tenants' personas
  }),

  /** Get a single persona by ID with ownership validation. */
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => { ... }),

  /** Create a persona. RBAC enforced by scope. */
  create: protectedProcedure
    .input(personaCreateSchema)  // Zod schema with all fields
    .mutation(async ({ ctx, input }) => {
      // Validate RBAC based on input.scope:
      //   'platform' -> ctx.user.role must be 'admin'
      //   'tenant' -> ctx.user.role must be 'admin' or 'domain_admin', tenantId must match
      //   'user' -> any authenticated user, sets userId = ctx.user.id
      // Call sanitizePersonaInput() before insert
    }),

  /** Update a persona with sanitization. */
  update: protectedProcedure
    .input(personaUpdateSchema)
    .mutation(async ({ ctx, input }) => { ... }),

  /** Delete a persona. Side effect: nullify defaultPersonaId on affected users/tenants. */
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Validate ownership/RBAC based on persona's scope
      // Before deleting:
      //   UPDATE users SET defaultPersonaId = NULL WHERE defaultPersonaId = input.id
      //   UPDATE tenants SET defaultPersonaId = NULL WHERE defaultPersonaId = input.id
      //   UPDATE conversations SET personaId = NULL WHERE personaId = input.id
      // Then DELETE from persona_templates
    }),

  /** Set the current user's default persona. */
  setUserDefault: protectedProcedure
    .input(z.object({ personaId: z.string().uuid().nullable() }))
    .mutation(async ({ ctx, input }) => {
      // UPDATE users SET defaultPersonaId = input.personaId WHERE id = ctx.user.id
    }),

  /** Set the tenant's default persona (domain_admin only). */
  setTenantDefault: domainAdminProcedure
    .input(z.object({ personaId: z.string().uuid().nullable() }))
    .mutation(async ({ ctx, input }) => {
      // UPDATE tenants SET defaultPersonaId = input.personaId WHERE id = user's currentTenantId
    }),
});
```

**Zod schemas** for create/update should enforce the same constraints as the sanitization layer:
- `systemPromptPrefix`: `z.string().max(2000)`
- `restrictions`: `z.array(z.string().max(500)).max(20)`
- `tone`: `z.enum(["formal", "casual", "friendly", "technical", "creative"]).optional()`
- `scope`: `z.enum(["platform", "tenant", "user"])`
- `responseStyle`: `z.record(z.string(), z.unknown()).optional()`

---

## 3. File Summary

| Action | File Path |
|--------|-----------|
| CREATE | `/home/dev/projects/SmartSpecPro/apps/web/server/services/personaService.ts` |
| CREATE | `/home/dev/projects/SmartSpecPro/apps/web/server/routers/persona.ts` |
| CREATE | `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/personaService.test.ts` |
| CREATE | `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/personaChatContext.test.ts` |
| CREATE | `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/personaSanitization.test.ts` |
| CREATE | `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/persona.test.ts` |
| CREATE | `/home/dev/projects/SmartSpecPro/apps/web/server/_core/__tests__/agencyStreamPersona.test.ts` |
| CREATE | `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_agency_persona.py` |
| CREATE | `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/chat/PersonaSelector.tsx` |
| CREATE | `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/PersonaSettings.tsx` |
| CREATE | `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/AdminPersonas.tsx` |
| MODIFY | `/home/dev/projects/SmartSpecPro/apps/web/server/services/chatService.ts` (buildChatContext at line 647) |
| MODIFY | `/home/dev/projects/SmartSpecPro/apps/web/server/services/memoryService.ts` (buildChatContext at line 668) |
| MODIFY | `/home/dev/projects/SmartSpecPro/apps/web/server/_core/agencyStreamProxy.ts` (add persona_prefix to upstream payload) |
| MODIFY | `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_swarm_adapter.py` (prepend persona_prefix in create_agent) |
| MODIFY | `/home/dev/projects/SmartSpecPro/apps/web/server/routers.ts` (register personaRouter in appRouter) |
| MODIFY | `/home/dev/projects/SmartSpecPro/apps/web/client/src/App.tsx` (add routes for PersonaSettings, AdminPersonas) |
| MODIFY | `/home/dev/projects/SmartSpecPro/packages/shared/src/constants/menu.ts` (add Persona menu items) |
| MODIFY | `/home/dev/projects/SmartSpecPro/apps/web/drizzle/seed.ts` (add 6 platform-scope seed personas) |

---

## 4. Key Design Decisions

1. **Resolution chain is read-through, not cached.** Persona resolution queries the database each time. Given the low cardinality of personas per tenant (likely under 50), this is acceptable. Caching can be added later with a 60-second Redis TTL if needed.

2. **Two independent buildChatContext functions.** Both `chatService.ts` (line 647) and `memoryService.ts` (line 668) have their own `buildChatContext`. Both must be modified. They both call the shared `personaService.resolvePersona()` so the resolution logic lives in exactly one place.

3. **Structural delimiters for persona content.** The persona system prompt prefix is wrapped in `[PERSONA START]...[PERSONA END]` delimiters. This makes it harder for user messages to manipulate or override persona instructions via injection.

4. **RBAC uses the existing role enum.** The `roleEnum` only has `user`, `admin`, `domain_admin`. There is no `super_admin`. Platform-scope operations require `admin`. Tenant-scope operations require `domain_admin` (which also allows `admin` since `domainAdminProcedure` checks for either role).

5. **Feature flag graceful degradation.** When `AI_PERSONA_ENABLED` is false (or not set), all persona-related code paths are skipped silently. The `buildChatContext` functions behave exactly as they do today. The tRPC router endpoints should return a 403 with a clear message.

6. **Widget persona resolution.** The `chat_widgets` table (created in section-01-database, migration 4) has a `defaultPersonaId` column. The `resolvePersona` function accepts an optional `widgetId` parameter. If a widgetId is provided and the widget has a `defaultPersonaId`, it takes priority over user/tenant defaults but not over a conversation-level explicit persona.