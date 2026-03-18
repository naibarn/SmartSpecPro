I now have sufficient context. Let me produce the section content.

# Section 07 -- Feedback Backend

## Overview

This section implements the **feedback system backend**: a tRPC router (`feedback.ts`) for user and admin ticket management, and a processing pipeline (`feedbackProcessor.ts`) that auto-classifies, deduplicates, correlates, prioritizes, and routes incoming feedback tickets. It also covers the internal agent feedback API endpoint, rate limiting, XSS sanitization, and tenant isolation.

**Depends on:** section-01-schema-system-user (database tables `feedback_tickets`, `feedback_ticket_comments`, `feedback_ticket_attachments`, enums `ticketTypeEnum`, `ticketStatusEnum`, `ticketResolutionEnum`, and the `reminderPriorityEnum` already in schema).

**Blocks:** section-09-feedback-dashboard-ui (provides the tRPC API the frontend consumes).

---

## Files to Create

| File | Purpose |
|------|---------|
| `apps/web/server/services/virtualAdmin/feedbackProcessor.ts` | Auto-processing pipeline (classify, dedup, correlate, prioritize, route, auto-respond) |
| `apps/web/server/routers/feedback.ts` | tRPC router with user + admin endpoints |
| `apps/web/server/services/virtualAdmin/__tests__/feedbackProcessor.test.ts` | Unit tests for the processor |
| `apps/web/server/routers/__tests__/feedback.test.ts` | Unit tests for the router |

## Files to Modify

| File | Change |
|------|--------|
| `apps/web/server/routers.ts` | Import and register `feedbackRouter` in the app router |
| `apps/web/server/_core/index.ts` | Register internal Express endpoint `POST /api/internal/virtual-admin/feedback` for agent submissions |

---

## Tests (Write First)

### feedbackProcessor.test.ts

File: `apps/web/server/services/virtualAdmin/__tests__/feedbackProcessor.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before imports
vi.mock("../../../db", () => ({ getDb: vi.fn() }));
vi.mock("../../../_core/llm", () => ({ callLLM: vi.fn() }));
vi.mock("../../notificationService", () => ({
  createNotification: vi.fn(),
}));

describe("FeedbackProcessor", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // --- Classification ---
  describe("classify", () => {
    it("LLM classifies bug report correctly");
    it("falls back to keyword classification when LLM fails");
    it("keyword: 'error' maps to bug type, high priority");
    it("keyword: 'suggestion' maps to feature_request type, normal priority");
    it("returns default category and normal priority for unrecognized input");
  });

  // --- Deduplication ---
  describe("deduplicate", () => {
    it("detects duplicate by title similarity >80%");
    it("links duplicate ticket to original via duplicateOf FK");
    it("does not flag as duplicate when similarity <80%");
    it("only compares against open tickets in same tenant from last 7 days");
  });

  // --- Correlation ---
  describe("correlate", () => {
    it("links ticket to active incident when error keywords match");
    it("does not link when no matching incident exists");
    it("sets relatedIncidentId on the ticket record");
  });

  // --- Priority Scoring ---
  describe("prioritize", () => {
    it("increases priority for virtual_agent submissions (1.5x weight)");
    it("increases priority when multiple duplicates exist (2x per dup)");
    it("increases priority when linked to active incident (3x weight)");
    it("caps priority at 'critical'");
  });

  // --- Auto-response ---
  describe("autoRespond", () => {
    it("responds 'we are aware' when linked to active incident");
    it("responds 'tracked in #X' when duplicate found");
    it("creates comment record with authorType 'system_guardian'");
    it("does not auto-respond when no incident or duplicate link");
  });
});
```

### feedback.test.ts

File: `apps/web/server/routers/__tests__/feedback.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoist mocks following project pattern (see apiKeys.test.ts)
vi.mock("../../db", () => ({ getDb: vi.fn() }));
vi.mock("../../services/virtualAdmin/feedbackProcessor", () => ({
  processFeedbackTicket: vi.fn(),
}));
vi.mock("../../../drizzle/schema", () => ({
  feedbackTickets: { /* column stubs */ },
  feedbackTicketComments: { /* column stubs */ },
  feedbackTicketAttachments: { /* column stubs */ },
}));
vi.mock("../../_core/trpc", () => ({
  protectedProcedure: {
    input: vi.fn().mockReturnThis(),
    query: vi.fn().mockReturnThis(),
    mutation: vi.fn().mockReturnThis(),
  },
  adminProcedure: {
    input: vi.fn().mockReturnThis(),
    query: vi.fn().mockReturnThis(),
    mutation: vi.fn().mockReturnThis(),
  },
  domainAdminProcedure: {
    input: vi.fn().mockReturnThis(),
    query: vi.fn().mockReturnThis(),
    mutation: vi.fn().mockReturnThis(),
  },
  router: vi.fn((procedures) => ({ _def: { procedures }, ...procedures })),
}));

describe("FeedbackRouter", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // --- User endpoints ---
  describe("user endpoints", () => {
    it("submit creates ticket with correct fields and triggers processing");
    it("submit rate limited to 10/hour per user");
    it("submit sanitizes HTML in title and description (XSS prevention)");
    it("myTickets returns only the calling user's own tickets");
    it("getTicket returns 404 for another user's ticket");
    it("getTicket returns ticket with comments for the owner");
  });

  // --- Admin endpoints ---
  describe("admin endpoints", () => {
    it("adminList returns all tenant tickets for admin role");
    it("adminList supports filters: type, status, priority, category");
    it("adminList supports pagination with cursor");
    it("adminUpdate changes priority and status fields");
    it("adminRespond creates a public comment and notifies the user");
    it("adminRespond with isInternal=true creates admin-only note");
    it("adminMergeDuplicate links target ticket and closes it as duplicate");
    it("adminResolve sets resolution type and notes");
  });

  // --- Tenant isolation ---
  describe("tenant isolation", () => {
    it("admin cannot see tickets from other tenant");
    it("domain_admin can see tickets from all tenants");
    it("user cannot access admin endpoints (FORBIDDEN)");
  });

  // --- Agent API ---
  describe("agent feedback endpoint", () => {
    it("accepts POST with valid internal token");
    it("rejects POST without valid internal token");
    it("rate limited to 50/hour per agent");
    it("sets submittedByType to 'virtual_agent'");
  });
});
```

---

## Implementation Details

### 1. Feedback Processor (`feedbackProcessor.ts`)

This service exposes a single entry point `processFeedbackTicket(ticketId: number)` that runs the full auto-processing pipeline on a newly created ticket. It is called after every ticket insert (from both the tRPC `submit` mutation and the internal agent endpoint).

**Pipeline steps (executed sequentially):**

1. **Classify** -- Call the cheapest available LLM model with the ticket title + description using a structured prompt that returns `{ category, priority, summary }`. Use the existing `callLLM` or model selection utilities in the codebase (see `apps/web/server/services/skillModelFallback.ts` for cheapest-model selection patterns). On LLM failure (timeout, error), fall back to keyword-based classification:
   - Keywords like `error`, `crash`, `fail`, `bug`, `broken` map to `bug` type, `high` priority
   - Keywords like `suggestion`, `could you add`, `feature`, `wish` map to `feature_request` type, `normal` priority
   - Keywords like `question`, `how to`, `help` map to `question` type, `low` priority
   - Default: `observation` type, `normal` priority
   - Update the ticket's `autoCategory`, `autoPriority`, and `autoSummary` fields.

2. **Deduplicate** -- Query open tickets in the same tenant from the last 7 days. Compare the new ticket's title against each using a simple text similarity function (Levenshtein distance or cosine similarity of word tokens). If similarity exceeds 80%, set `duplicateOf` to the original ticket's ID and update status to `duplicate`.

3. **Correlate** -- Query `virtual_admin_incidents` for open incidents in the same tenant. Match by checking if any incident's `title` or `message` contains keywords from the ticket title/description. If a match is found, set `relatedIncidentId` on the ticket.

4. **Prioritize** -- Compute a priority score starting from the auto-classified priority:
   - Base score: `low=1, normal=2, high=3, critical=4`
   - If `submittedByType === 'virtual_agent'`: multiply by 1.5
   - If `duplicateOf` is set (has duplicates): add 2 per duplicate
   - If `relatedIncidentId` is set: add 3
   - Map final score back: `>=6 → critical`, `>=4 → high`, `>=2 → normal`, else `low`
   - Update the ticket's `priority` field.

5. **Route** -- Notify tenant admin(s) based on final priority using the existing `createNotification` from `apps/web/server/services/notificationService.ts`. Critical priority triggers immediate notification; normal and low are batched (the notification itself is created; batching/digesting is handled by the notification system).

6. **Auto-respond** -- If the ticket was linked to an active incident, create a `feedback_ticket_comments` record with `authorType: 'system_guardian'`, `authorId: -1`, content: "We're aware of this issue and actively working on it. See incident #{incidentId}." If the ticket was marked as duplicate, create a comment: "This appears to be tracked in ticket #{duplicateOf}." Set `isInternal: false` so the user sees the response.

**Key design decisions:**
- LLM classification uses the system user (id: -1) context with zero credit cost (system user does not consume credits -- handled in section-01)
- All DB queries are scoped by `tenantId` from the ticket record
- The entire pipeline is wrapped in try/catch; individual step failures are logged but do not prevent subsequent steps from running
- No secrets are included in LLM prompts (only ticket title, description, and category labels)

### 2. Feedback tRPC Router (`feedback.ts`)

Register in `apps/web/server/routers.ts` alongside other routers:
```typescript
import { feedbackRouter } from "./routers/feedback";
// ... in the appRouter definition:
feedback: feedbackRouter,
```

**User-facing procedures (use `protectedProcedure`):**

- **`submit`** -- Mutation. Input: `{ title: string, description: string, ticketType: TicketType, stepsToReproduce?: string, expectedBehavior?: string, actualBehavior?: string, contextJson?: object }`. Sanitize `title` and `description` with `sanitize-html` (already in project dependencies at `apps/web/package.json`). Insert into `feedback_tickets` with `submittedBy: ctx.user.id`, `submittedByType: 'human'`, `tenantId: ctx.user.tenantId`, `status: 'new'`. Call `processFeedbackTicket(ticketId)` asynchronously (fire-and-forget with `.catch(log)`). Rate limit: 10 per hour per user (use in-memory rate limiter pattern from `apps/web/server/_core/rateLimitedProcedure.ts`; create a `feedbackSubmitProcedure` with `namespace: "feedback-submit"`, `limit: 10`, `windowMs: 3_600_000`).

- **`myTickets`** -- Query. Input: `{ cursor?: number, limit?: number }`. Returns the calling user's tickets ordered by `createdAt DESC` with pagination. Filter: `WHERE submittedBy = ctx.user.id`. Include comment count as a subquery or join.

- **`getTicket`** -- Query. Input: `{ ticketId: number }`. Returns the ticket with all comments (ordered `createdAt ASC`) and attachments. Enforce ownership: if `ticket.submittedBy !== ctx.user.id` and user is not admin, throw `TRPCError({ code: "NOT_FOUND" })` (do not reveal existence to other users).

**Admin procedures (use `adminProcedure`):**

- **`adminList`** -- Query. Input: `{ tenantId?: string, type?: TicketType, status?: TicketStatus, priority?: Priority, category?: string, assignedTo?: number, cursor?: number, limit?: number }`. For `admin` role: filter by `ctx.user.tenantId`. For `domain_admin` role (check using `domainAdminProcedure` or role check in handler): allow cross-tenant access. Returns paginated ticket list with submitter info (join users table for username/email).

- **`adminUpdate`** -- Mutation. Input: `{ ticketId: number, priority?: Priority, status?: TicketStatus, category?: string, assignedTo?: number, plannedVersion?: string, planningDocUrl?: string, devBranch?: string }`. Update the specified fields. Set `triagedAt` if status changes to `triaged`. Verify ticket belongs to admin's tenant.

- **`adminRespond`** -- Mutation. Input: `{ ticketId: number, content: string, isInternal?: boolean }`. Create a `feedback_ticket_comments` record with `authorId: ctx.user.id`, `authorType: 'human'`, `isInternal` flag. If not internal, notify the ticket submitter via `createNotification`. Set `respondedAt` on the ticket if this is the first non-internal response.

- **`adminMergeDuplicate`** -- Mutation. Input: `{ ticketId: number, duplicateOfId: number }`. Set `ticket.duplicateOf = duplicateOfId`, `ticket.status = 'duplicate'`, `ticket.resolutionType = 'duplicate'`. Add a comment explaining the merge.

- **`adminResolve`** -- Mutation. Input: `{ ticketId: number, resolutionType: TicketResolution, resolutionNotes?: string }`. Set `status: 'resolved'`, `resolvedAt: now()`, `resolutionType`, `resolutionNotes`. Notify the submitter.

- **`stats`** -- Query (admin). Returns aggregate counts: tickets by type, by status, by priority; average time to first response; resolution rate (resolved / total last 30 days). Scoped to tenant.

### 3. Internal Agent Feedback Endpoint

Add an Express route in `apps/web/server/_core/index.ts`:

```
POST /api/internal/virtual-admin/feedback
```

This endpoint is for virtual agents and the System Guardian to submit feedback programmatically.

- **Auth**: Validate the request carries the system user JWT (from `Authorization: Bearer <token>`) or a shared internal token (`SMARTSPEC_WEB_GATEWAY_TOKEN` from env). Reject with 401 if neither is valid.
- **Rate limit**: 50 requests per hour per source (use IP-based or token-based bucketing).
- **Body**: `{ title, description, ticketType, submittedByType: 'virtual_agent' | 'system_guardian', tenantId, contextJson? }`
- **Handler**: Insert into `feedback_tickets`, call `processFeedbackTicket`, return `{ ticketId }`.
- **Set `submittedBy` to -1** (system user ID) for system_guardian submissions, or to the agent's configured user ID for virtual_agent submissions.

### 4. XSS Sanitization

All user-provided text fields (`title`, `description`, `stepsToReproduce`, `expectedBehavior`, `actualBehavior`, comment `content`) must be sanitized before DB insert using `sanitize-html`. The project already has `sanitize-html` as a dependency. Use a strict allowlist:

```typescript
import sanitizeHtml from "sanitize-html";

function sanitize(input: string): string {
  return sanitizeHtml(input, {
    allowedTags: [], // strip ALL HTML
    allowedAttributes: {},
  });
}
```

This strips all HTML tags, preventing stored XSS. Apply this in both the tRPC `submit` mutation and the internal Express endpoint before inserting into the database.

### 5. Tenant Isolation Rules

- **User role**: sees only their own tickets (`submittedBy = userId`)
- **Admin role**: sees all tickets in their tenant (`tenantId = admin.tenantId`)
- **Domain admin role**: sees tickets across all tenants (no tenantId filter)
- Every query in the router must include the appropriate `WHERE tenantId = ?` clause based on the caller's role
- The `processFeedbackTicket` pipeline inherits the ticket's `tenantId` for all sub-queries (dedup search, incident correlation, notification routing)

### 6. Zod Input Schemas

Define input validation schemas for each procedure using Zod. Key constraints:

- `title`: `z.string().min(3).max(255)`
- `description`: `z.string().min(10).max(5000)`
- `ticketType`: `z.enum(["bug", "feature_request", "observation", "question"])`
- `stepsToReproduce`, `expectedBehavior`, `actualBehavior`: `z.string().max(2000).optional()`
- `contextJson`: `z.record(z.unknown()).optional()` (allows arbitrary JSON for page URL, browser info, error stack)
- `cursor`: `z.number().int().positive().optional()`
- `limit`: `z.number().int().min(1).max(100).default(20)`

### 7. Audit Events

Log the following audit events using the project's existing audit logger:

- `feedback_ticket_created` -- on successful ticket insert (user or agent)
- `feedback_auto_classified` -- after LLM/keyword classification completes
- `feedback_duplicate_detected` -- when dedup finds a match
- `feedback_admin_responded` -- when admin posts a response

Include `ticketId`, `tenantId`, and `userId` in the audit event payload. Never include the full ticket description in audit logs (may contain sensitive user data); log only ticket ID and classification results.

---

## Text Similarity for Deduplication

Implement a simple word-token cosine similarity function in `feedbackProcessor.ts`. This avoids external dependencies:

```typescript
function textSimilarity(a: string, b: string): number {
  /** Returns 0..1 cosine similarity of word-frequency vectors. */
  // Tokenize, lowercase, build frequency maps, compute dot product / magnitudes
}
```

The function tokenizes both strings into lowercase words, builds frequency vectors, and computes cosine similarity. A threshold of 0.8 (80%) indicates a likely duplicate. This is intentionally simple; it can be upgraded to embedding-based similarity later if needed.

---

## Dependency Summary

- **section-01** must be complete: tables `feedback_tickets`, `feedback_ticket_comments`, `feedback_ticket_attachments` and their enums must exist in the database
- **section-01** must provide the system user (id: -1) for auto-response comments and agent submissions
- Uses existing `createNotification` from `apps/web/server/services/notificationService.ts`
- Uses existing `sanitize-html` package (already in `apps/web/package.json`)
- Uses existing rate limit middleware pattern from `apps/web/server/_core/rateLimitedProcedure.ts`
- Uses existing tRPC procedure builders (`protectedProcedure`, `adminProcedure`, `domainAdminProcedure`) from `apps/web/server/_core/trpc.ts`
- The `virtual_admin_incidents` table (from section-01) is needed for the correlation step; if not yet available, the correlate step should gracefully skip (query returns empty)