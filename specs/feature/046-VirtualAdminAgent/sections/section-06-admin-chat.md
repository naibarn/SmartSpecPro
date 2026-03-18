# Section 06: Dedicated Admin Chat with System Guardian

## Overview

This section implements a dedicated admin chat interface where administrators can interact with the System Guardian through natural-language-like commands. The chat reuses the existing conversation and message infrastructure (the `conversations` and `messages` tables, plus `chatService.ts` helpers) but adds a command handler layer that interprets admin messages and returns structured responses with real-time system data.

**Depends on:**
- Section 01 (schema + system user): The system user (`id: -1`) must exist. The `virtual_admin_incidents` and `virtual_admin_approvals` tables must be present.
- Section 04 (actuators + approval): The `ActuatorRegistry` must be available so that `retry` and `approve` commands can invoke actuators. The `decideApproval` logic must be importable.

**Files to create:**
- `apps/web/server/services/virtualAdmin/chatHandler.ts`
- `apps/web/server/services/virtualAdmin/__tests__/chatHandler.test.ts`
- `apps/web/client/src/components/guardian/GuardianChat.tsx`

**Files to modify:**
- `apps/web/server/routers/virtualAdmin.ts` (add chat-related procedures)

---

## Tests (Write First)

File: `apps/web/server/services/virtualAdmin/__tests__/chatHandler.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("GuardianChatHandler", () => {
  it("responds to 'status' with sensor health summary");
  it("responds to 'incidents' with open incident list");
  it("responds to 'retry <id>' by executing retry actuator");
  it("responds to 'approve <id>' by processing approval");
  it("responds to unknown command with help menu");
  it("creates conversation with type system_guardian on first use");
  it("reuses existing guardian conversation for same admin");
  it("stores all messages in conversations table");
});
```

### Test Strategy

- Mock `sensorRegistry.getAllLatestReadings()` for status command
- Mock `db.select().from(virtualAdminIncidents)` for incidents command
- Mock `actuatorRegistry.executeAction()` for retry command
- Mock approval processing from section-04 for approve command
- Mock `chatService.createConversation`, `chatService.createMessage`, `chatService.getMessages`
- Use `vi.fn()` to capture calls and verify correct arguments

**Key test scenarios:**

- **Status command**: Mock `getAllLatestReadings()` to return 3 sensor readings with different statuses. Verify response contains a markdown table with sensor names and health indicators.

- **Incidents command**: Mock DB query returning 5 open incidents with mixed severities. Verify response lists all 5 with correct severity badges and relative timestamps.

- **Retry command**: Call with `"retry 42"`. Verify `actuatorRegistry.executeAction("retry_failed_job", { jobId: "42" })` was called. On success, verify response says "Job 42 retried successfully." On failure, verify error message.

- **Approve command**: Call with `"approve 7"`. Verify `decideApproval(7, adminUserId, "approved")` was called. On CONFLICT error, verify response says "Already decided by another admin."

- **Unknown command**: Call with `"hello"`. Verify response contains the help menu listing all commands.

- **Conversation lifecycle**: First call for admin creates new conversation with `[system_guardian]` marker. Second call finds and reuses it.

---

## Implementation Details

### 1. Chat Handler Service

**File:** `apps/web/server/services/virtualAdmin/chatHandler.ts`

Main exported function:

```typescript
export async function handleGuardianMessage(
  adminUserId: number,
  message: string,
  tenantId: string | null
): Promise<{ conversationId: number; response: string }>;
```

**Intent parsing** is keyword-based (no LLM needed). The handler trims and lowercases the input, then matches against a command map:

| Pattern | Intent | Handler |
|---------|--------|---------|
| starts with `status` or `health` | System status | `handleStatusCommand` |
| starts with `incidents` or `problems` | Open incidents | `handleIncidentsCommand` |
| matches `retry <number>` | Retry job | `handleRetryCommand` |
| matches `approve <number>` | Process approval | `handleApproveCommand` |
| starts with `queue` | Queue health | `handleQueueCommand` |
| starts with `credit` | Credit balance | `handleCreditCommand` |
| anything else | Help / fallback | `handleHelpCommand` |

**Fallback:** If intent is unclear, respond with help menu listing available commands. Never silently ignore admin messages.

**Conversation management logic:**

1. Look up existing guardian conversation for this admin:
   ```sql
   SELECT * FROM conversations
   WHERE "userId" = adminUserId
   AND "systemPrompt" LIKE '%[system_guardian]%'
   AND "trashedAt" IS NULL
   ORDER BY "updatedAt" DESC LIMIT 1
   ```
2. If none found, create via `chatService.createConversation` with:
   - `userId: adminUserId`
   - `title: "System Guardian"`
   - `systemPrompt: "[system_guardian] You are the System Guardian assistant."`
3. Save admin's message via `chatService.createMessage` with `role: "user"`.
4. Generate response from matched command handler.
5. Save response via `chatService.createMessage` with `role: "assistant"`.
6. Return `{ conversationId, response }`.

The system user (`id: -1`) is NOT the owner of the conversation. The admin owns it. The system user identity is only used for audit logging. The conversation is tagged by `[system_guardian]` in `systemPrompt`.

### 2. Command Handler Functions

Each handler is a private async function in the same file:

**`handleStatusCommand(tenantId)`** — calls sensor registry `getAllLatestReadings()`, formats as markdown table. If no readings available yet, returns "No sensor data available yet. Sensors run on scheduled intervals."

**`handleIncidentsCommand(tenantId)`** — queries `virtual_admin_incidents WHERE status = 'open'`, returns formatted list: `- **#<id>** [<severity>] <title> (since <relative time>)`. Limit 25, sorted by severity DESC, createdAt DESC.

**`handleRetryCommand(jobId, tenantId)`** — delegates to `actuatorRegistry.executeAction("retry_failed_job", { jobId })`. Returns success confirmation or error message.

**`handleApproveCommand(approvalId, adminUserId)`** — delegates to `decideApproval(approvalId, adminUserId, "approved")` from section-04. Returns confirmation or error (CONFLICT, NOT_FOUND, expired).

**`handleQueueCommand(tenantId)`** — reads queue health from `getQueueHealthStatus()`, returns formatted queue depths and alert status.

**`handleCreditCommand(tenantArg, tenantId)`** — queries credit balance for specified tenant, returns balance vs soft/hard limits.

**`handleHelpCommand()`** — returns static markdown:
```markdown
## System Guardian Commands

- **status** — Show current sensor health summary
- **incidents** — List open incidents
- **retry <job_id>** — Retry a failed job
- **approve <approval_id>** — Approve a pending action
- **queue** — Show queue health details
- **credit <tenant>** — Show credit balance for a tenant

Type any command to get started.
```

### 3. tRPC Router Additions

Add to `apps/web/server/routers/virtualAdmin.ts`:

**`sendGuardianMessage`** — `adminProcedure` mutation.
- Input: `z.object({ message: z.string().min(1).max(2000) })`
- Calls `handleGuardianMessage(ctx.user.id, input.message, ctx.tenantId)`
- Returns `{ conversationId: number; response: string }`

**`getGuardianHistory`** — `adminProcedure` query.
- Input: `z.object({ limit: z.number().min(1).max(100).default(50), offset: z.number().min(0).default(0) })`
- Finds admin's guardian conversation (same lookup as handler)
- Returns paginated messages via `chatService.getMessages()`
- If no conversation exists: returns `{ conversationId: null, messages: [] }`

### 4. Frontend Component

**File:** `apps/web/client/src/components/guardian/GuardianChat.tsx`

Embedded in the AdminSystemGuardian page (section-08):

- On mount: `trpc.virtualAdmin.getGuardianHistory.useQuery({ limit: 50 })` loads existing messages
- Chat layout: user messages aligned right, guardian responses left (standard chat)
- Input field at bottom with Send button
- On submit: call `trpc.virtualAdmin.sendGuardianMessage.useMutation()`
- Optimistically add user message to local list, append guardian response when mutation returns
- Guardian responses rendered with markdown (reuse existing `renderMarkdown` utility)
- Typing indicator while mutation is in flight
- Auto-scroll to bottom on new messages

TanStack Query pattern:
```typescript
const historyQuery = trpc.virtualAdmin.getGuardianHistory.useQuery({ limit: 50 });
const sendMutation = trpc.virtualAdmin.sendGuardianMessage.useMutation({
  onSuccess: () => { historyQuery.refetch(); },
});
```

Styling: Tailwind utility classes, Radix UI primitives for input and button, consistent with admin panel aesthetic.

### 5. Conversation Type Discovery

The conversations table does not have a dedicated `type` column. The guardian conversation is identified by `[system_guardian]` marker in `systemPrompt`. This avoids any schema migration.

The lookup query uses:
```typescript
const [conv] = await db
  .select()
  .from(conversations)
  .where(and(
    eq(conversations.userId, adminUserId),
    sql`${conversations.systemPrompt} LIKE '%[system_guardian]%'`,
    isNull(conversations.trashedAt)
  ))
  .orderBy(desc(conversations.updatedAt))
  .limit(1);
```

### 6. Security

- Only `admin` or `domain_admin` can access (enforced by `adminProcedure`)
- `retry` and `approve` validate entity belongs to admin's tenant
- Message content stored as-is (no code execution)
- Error responses never expose stack traces
- Rate limiting via standard `adminProcedure` limits

### 7. Audit Logging

Every command logs `guardian_chat_command` via existing `auditLogger`:
- Payload: `{ command, adminUserId, tenantId, responseLength }`
- Action commands (retry, approve) additionally log via actuator/approval subsystems from section-04

### 8. Error Handling

- If a command handler throws (DB unavailable, actuator fails): catch and return user-friendly message "Failed to execute command: <brief reason>. Please try again or check the dashboard."
- Never expose stack traces in guardian responses
- Log full error via `debugError` for debugging

---

## Dependencies Summary

| Dependency | From Section | What Is Needed |
|------------|-------------|----------------|
| System user (id: -1) | Section 01 | Exists in users table; used for audit |
| `virtual_admin_incidents` table | Section 01 | Queried by `handleIncidentsCommand` |
| `virtual_admin_approvals` table | Section 01 | Queried by `handleApproveCommand` |
| Sensor registry (`getAllLatestReadings`) | Section 02 | Called by `handleStatusCommand` |
| Actuator registry (`executeAction`) | Section 04 | Called by `handleRetryCommand` |
| Approval processing (`decideApproval`) | Section 04 | Called by `handleApproveCommand` |
| `chatService.createConversation` | Existing | Creates guardian conversation |
| `chatService.createMessage` | Existing | Stores command + response messages |
| `chatService.getMessages` | Existing | Retrieves chat history |
| `adminProcedure` | Existing (`_core/trpc.ts`) | Auth guard for tRPC endpoints |

---

## File Paths Summary

| File | Action |
|------|--------|
| `apps/web/server/services/virtualAdmin/chatHandler.ts` | CREATE |
| `apps/web/server/services/virtualAdmin/__tests__/chatHandler.test.ts` | CREATE |
| `apps/web/client/src/components/guardian/GuardianChat.tsx` | CREATE |
| `apps/web/server/routers/virtualAdmin.ts` | MODIFY — add sendGuardianMessage, getGuardianHistory |

## Test Execution

```bash
cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test -- --run server/services/virtualAdmin/__tests__/chatHandler.test.ts
```
