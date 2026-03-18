I have enough context now. Let me produce the section content.

# Section 08: Summary Service

## Overview

This section implements `summaryService.ts`, a Node.js service that generates structured summaries for completed (or in-progress) team runs. It supports three generation methods with different cost/quality trade-offs and produces a consistent output format consumed by the run engine, frontend, and monitoring systems.

**File to create:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/summaryService.ts`
**Test file to create:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/summaryService.test.ts`

### Dependencies on Other Sections

- **Section 03 (Scoped Memory):** The summary service reads `scoped_memories` to enrich summaries and optionally writes a memory record of type `note` when a summary is produced.
- **Section 02 (Schema: Rooms/Runs):** Uses `team_room_messages`, `team_runs`, and `agent_activity_events` tables to gather conversation content and run metadata.
- **Section 01 (Schema: Identity):** Uses `assistant_profiles` to resolve participant names and roles.

The summary service does not block other sections. It is consumed at runtime by Section 05 (Run Engine) when a run completes, and by Section 10 (tRPC Routers) to expose summary data to the frontend.

---

## Tests First

All tests use Vitest. The service's external dependencies (database queries, LLM calls) should be mocked.

### Test file: `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/summaryService.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for summaryService.ts
 *
 * Mocked dependencies:
 * - Database (getDb) — mock query results for team_room_messages,
 *   team_runs, assistant_profiles, agent_activity_events
 * - callLLMStructured — mock LLM responses for agent-generated
 *   and system-generated methods
 */

describe("summaryService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("generateSummary", () => {
    it("agent-generated: calls LLM with lead agent persona in system prompt", async () => {
      /**
       * Setup: mock a run with a lead agent persona.
       * Assert: the system prompt passed to callLLMStructured includes
       * the lead agent's persona name and roleTitle.
       */
    });

    it("system-generated: uses neutral prompt with no persona", async () => {
      /**
       * Setup: request a system-generated summary.
       * Assert: the system prompt does NOT include any agent persona.
       * Assert: the model selection uses the cheapest available model.
       */
    });

    it("extractive: collects only decision, summary, and execution_update messages", async () => {
      /**
       * Setup: mock team_room_messages with mixed turnTypes
       * (discussion, handoff, review, decision, execution_update, summary).
       * Assert: only decision, summary, and execution_update messages
       * appear in the returned output.
       * Assert: no LLM call is made (extractive is pure data extraction).
       */
    });

    it("output structure contains all required fields", async () => {
      /**
       * For each generation method, verify the returned object has:
       * objective, participants, keyDecisions, keyFindings,
       * artifactsProduced, openQuestions, nextSteps, totalCost,
       * totalDuration.
       */
    });
  });

  describe("freshness tracking", () => {
    it("marks summary as stale when new messages arrive after generation", async () => {
      /**
       * Setup: generate a summary, then mock new messages with
       * createdAt after the summary timestamp.
       * Assert: isFresh() returns false for that run.
       */
    });

    it("marks summary as fresh when no new messages exist", async () => {
      /**
       * Setup: generate a summary, no new messages after it.
       * Assert: isFresh() returns true.
       */
    });
  });

  describe("edge cases", () => {
    it("handles run with zero messages gracefully", async () => {
      /**
       * Assert: returns a summary with empty arrays for decisions,
       * findings, artifacts, etc. Does not throw.
       */
    });

    it("respects roomLanguage instruction for LLM-based methods", async () => {
      /**
       * Setup: room has roomLanguage = "th" (Thai).
       * Assert: the LLM prompt includes an instruction to generate
       * the summary in Thai.
       */
    });

    it("falls back to system-generated when agent-generated LLM call fails", async () => {
      /**
       * Setup: mock callLLMStructured to throw on first call (agent-generated).
       * Assert: the service retries with system-generated method.
       * Assert: result is still valid structured output.
       */
    });
  });
});
```

---

## Implementation Details

### Summary Output Structure

Define a Zod schema and TypeScript type for the structured summary output. This is the contract shared between the service, the run engine, tRPC routers, and the frontend.

```typescript
// Within summaryService.ts or a shared types file

import { z } from "zod";

export const runSummarySchema = z.object({
  objective: z.string(),
  participants: z.array(
    z.object({
      assistantId: z.string(),
      displayName: z.string(),
      roleTitle: z.string(),
      turnCount: z.number(),
    })
  ),
  keyDecisions: z.array(z.string()),
  keyFindings: z.array(z.string()),
  artifactsProduced: z.array(
    z.object({
      name: z.string(),
      type: z.string(),
      description: z.string().optional(),
    })
  ),
  openQuestions: z.array(z.string()),
  nextSteps: z.array(z.string()),
  totalCost: z.number(), // credits
  totalDuration: z.number(), // milliseconds
  generatedAt: z.string(), // ISO timestamp
  method: z.enum(["agent-generated", "system-generated", "extractive"]),
});

export type RunSummary = z.infer<typeof runSummarySchema>;
```

### Three Generation Methods

#### 1. Agent-Generated (Highest Quality)

This method asks the lead agent (the assistant with `isLead = true` on the team) to produce a structured summary. The LLM call uses the lead agent's persona as the system prompt context, producing a summary that matches the team's communication style.

Steps:
1. Load the run from `team_runs`, resolve the `teamId` to find the lead `assistant_profile`.
2. Load the lead agent's persona (from `personaTemplates` via `assistant_profiles.personaId`).
3. Load all `team_room_messages` for the run's room, filtered to messages visible at `transparent` or `milestone` level.
4. Construct a system prompt that includes the lead persona's name, roleTitle, and instructions to produce a JSON summary matching `runSummarySchema`.
5. Include `roomLanguage` instruction if set on the `team_rooms` record (e.g., "Generate this summary in Thai.").
6. Call `callLLMStructured` from the existing `/home/dev/projects/SmartSpecPro/apps/web/server/services/callLLMStructured.ts` utility, passing the `runSummarySchema` as the Zod schema for validation.
7. On success, return the parsed `RunSummary`.
8. On failure, fall back to system-generated method.

#### 2. System-Generated (Fallback)

Uses a neutral summarizer prompt with no persona binding. Designed to use the cheapest available LLM model to keep costs low.

Steps:
1. Load run metadata and all visible messages (same as agent-generated).
2. Construct a system prompt: "You are a neutral meeting summarizer. Produce a structured JSON summary of the following team discussion."
3. Resolve the cheapest model via `resolveEnabledLlmModelId` from `/home/dev/projects/SmartSpecPro/apps/web/server/services/enabledLlmModels.ts` with a cost-optimized preference.
4. Call `callLLMStructured` with the neutral prompt and cheapest model.
5. Return the parsed `RunSummary`.

#### 3. Extractive (Cheapest, No LLM)

Pure data extraction -- no LLM call. Collects messages of specific `turnType` values and assembles them into the output structure.

Steps:
1. Load all `team_room_messages` for the run where `turnType` is one of: `decision`, `summary`, `execution_update`.
2. Load run metadata from `team_runs` (objective, startedAt, endedAt, budgetSnapshotJson).
3. Load participant info from `assistant_profiles` joined through `team_room_participants`.
4. Map `decision` messages to `keyDecisions` (extract text content).
5. Map `execution_update` messages to `keyFindings`.
6. Map `summary` messages to a combined narrative for the objective recap.
7. Extract artifact references from `artifactRefsJson` on any matching message.
8. Compute `totalCost` from `team_runs.budgetSnapshotJson` and `totalDuration` from `startedAt`/`endedAt`.
9. Return the assembled `RunSummary` with `method: "extractive"`.

### Freshness Tracking

The service tracks whether a summary is still current or has become stale due to new activity.

Implementation approach:
- Store the summary's `generatedAt` timestamp (either in the `team_runs.summaryArtifactId` metadata or in a dedicated field).
- `isFresh(runId)` queries `team_room_messages` for any messages with `createdAt > summary.generatedAt` in the same room.
- If new messages exist, the summary is stale.
- The run engine and tRPC layer use `isFresh()` to decide whether to regenerate or serve cached summaries.

### Service API (Function Signatures)

```typescript
// summaryService.ts

export interface GenerateSummaryInput {
  runId: string;
  method: "agent-generated" | "system-generated" | "extractive";
  userId: number;
  tenantId: string;
}

/**
 * Generate a structured summary for a team run.
 * Falls back from agent-generated to system-generated on LLM failure.
 * Extractive method never calls LLM.
 */
export async function generateSummary(
  input: GenerateSummaryInput
): Promise<RunSummary>;

/**
 * Check whether the cached summary for a run is still fresh
 * (no new messages since it was generated).
 */
export async function isSummaryFresh(runId: string): Promise<boolean>;

/**
 * Get the most recent summary for a run, or null if none exists.
 */
export async function getRunSummary(
  runId: string
): Promise<RunSummary | null>;
```

### Integration Points

**Run Engine (Section 05):** When `stopRun()` is called with `requireFinalSummary = true` in the stop policy, the run engine calls `generateSummary({ runId, method: "agent-generated", ... })`. The returned summary is stored as JSON in the run's associated metadata (via `team_runs.summaryArtifactId` or a dedicated JSON column).

**tRPC Router (Section 10):** The `teamRoom.getSummary` and `monitoring.getRunSummary` procedures call `getRunSummary(runId)` and check freshness with `isSummaryFresh(runId)`.

**Python Backend (Section 15):** The Python `summary_generator.py` endpoint provides an alternative generation path.

**Python delegation rule:** The Node.js summaryService is the PRIMARY implementation. Python delegation via `POST /api/team-orchestrator/generate-summary` is used ONLY when:
- The team's `defaultModelId` refers to a model accessible only via the Python backend (e.g., local Ollama models routed through Python LLM gateway)
- The Node.js `callLLMStructured` call fails and Python is available as a fallback

In all other cases, the Node.js service handles summary generation directly. This avoids an unnecessary HTTP hop for the common path.

### Model Selection

- **Agent-generated:** Uses the lead agent's `preferredModelId` from `assistant_profiles`, falling back to the team's `defaultModelId` from `assistant_teams`.
- **System-generated:** Uses the cheapest enabled model. Query `model_provider_map` sorted by cost ascending, filtered to enabled models.
- **Extractive:** No model needed.

### Error Handling

- If `callLLMStructured` throws for agent-generated, log the error via `auditLogger` and automatically retry with system-generated method.
- If system-generated also fails, fall back to extractive.
- If the run has zero messages, return a valid `RunSummary` with empty arrays and the run's objective from `team_runs.objective`.
- All errors are logged to the audit trail with `eventType: "summary_generation_error"`.

### Key File Paths

| File | Purpose |
|------|---------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/summaryService.ts` | Main service (create) |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/summaryService.test.ts` | Unit tests (create) |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/callLLMStructured.ts` | Existing LLM call utility (use, do not modify) |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/enabledLlmModels.ts` | Model resolution (use, do not modify) |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/auditLogger.ts` | Audit logging (use, do not modify) |
| `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts` | Schema definitions for team_runs, team_room_messages, assistant_profiles (read from, defined in Sections 01-02) |

### Implementation Checklist

1. Create the test file with all test stubs described above.
2. Define `runSummarySchema` Zod schema and `RunSummary` type.
3. Implement `generateSummary()` with the three method branches.
4. Implement extractive method (pure data, no LLM).
5. Implement agent-generated method (LLM with lead persona).
6. Implement system-generated method (LLM with neutral prompt, cheapest model).
7. Implement fallback chain: agent-generated -> system-generated -> extractive.
8. Implement `isSummaryFresh()` freshness check.
9. Implement `getRunSummary()` for cached retrieval.
10. Add `roomLanguage` instruction support for LLM-based methods.
11. Add audit logging for generation events and errors.
12. Run tests and verify all pass.