# Platform Compatibility

Tells the conductor how to detect which AI platform it is running on and how to adapt
dispatch behavior for that platform. Platform detection runs once per session (SKILL.md
Step 4) and is persisted to `orchestra/platform.md`. Detection should be automatic by
default and should not ask the user unless runtime evidence is genuinely contradictory.

---

## 1. Platform Detection Flow

```
1. Check if `orchestra/platform.md` exists
   → Yes: read it, use the stored platform name, skip to dispatch
   → No: proceed to step 2

2. Detect dispatch capability before deciding whether inline fallback is allowed:
   a) native Task/sub-agent tool
   b) default/worker/explorer/spawn-agent style tool
   c) no agent tool

   If the tool exposes a model override field, record `model-overrides-supported` in the
   capability note and apply `model-routing.md` during dispatch.

3. If the current skill pack/runtime is standard-oriented, default to `standard`
   immediately and continue, but preserve the detected dispatch capability.

4. If runtime evidence clearly points to another platform, use that platform name:
   a) claude-code  — Full features (native Task tool, parallel agents, worktree isolation)
   b) standard     — If a general-purpose sub-agent tool is available, inject agent
                     identity templates; otherwise execute the same role inline
   c) open-code    — No sub-agent tool; conductor executes all roles sequentially inline

5. Ask the user only if the runtime evidence is contradictory and the dispatch strategy
   would materially change.

6. Write the resolved platform to `orchestra/platform.md` (one line: the platform name)
   and write `orchestra/dispatch-capability.md` with one of:
   `parallel-agent-tool`, `single-agent-tool`, or `inline-only`.

7. Never ask again for this session (or future sessions) until platform.md is deleted
```

**Platform names are case-sensitive:** Use exactly `claude-code`, `standard`, or `open-code`.

---

## 2. Claude Code Mode

Full feature set available. Use exact `ssp-*` native agent names from the agent mapping
table in `sub-agent-dispatch.md`. Parallel waves dispatch all independent agents in a
single message. Use `isolation: worktree` for file-editing agents running in parallel when
the platform supports worktree isolation; otherwise split writers into sequential
sub-waves.

**Dispatch example for a frontend + backend wave (claude-code):**

```
Dispatch (single message, both Task calls simultaneously):

  Task #1:
    agent: "ssp-frontend"
    background: false
    isolation: worktree
    prompt: |
      TASK: Add the UserDashboard React page component
      DOMAIN: CMD-1 Frontend
      FILES:
        - <absolute-repo-root>/apps/web/client/src/pages/Dashboard.tsx
        - <absolute-repo-root>/apps/web/client/src/components/StatsCard.tsx
      CONTEXT: [wave N results block]
      CONSTRAINTS: Do not modify server files. Use TanStack Query for data fetching.
      CONTRACT: See orchestra/contracts.md — frontend ↔ backend — UserDashboard
      OUTPUT: Dashboard.tsx + StatsCard.tsx created, tests passing
      QUALITY GATE: cd apps/web && pnpm check && pnpm test

  Task #2:
    agent: "ssp-backend"
    background: false
    isolation: worktree
    prompt: |
      TASK: Implement trpc.dashboard.getSummary procedure
      DOMAIN: CMD-2 Backend
      FILES:
        - <absolute-repo-root>/apps/web/server/routers/dashboard.ts
        - <absolute-repo-root>/apps/web/server/services/dashboardService.ts
      CONTEXT: [wave N results block]
      CONSTRAINTS: Enforce tenantId isolation. Validate input with Zod.
      CONTRACT: See orchestra/contracts.md — frontend ↔ backend — UserDashboard
      OUTPUT: dashboard.ts router + dashboardService.ts created, tests passing
      QUALITY GATE: cd apps/web && pnpm check && pnpm test
```

---

## 3. Standard Mode

If this environment exposes default/worker/explorer/spawn-agent-style agents, use the
closest safe role and preserve specialization by injecting the identity + constraints
section from `../../sub-agents/agents/NAME.md` at the top of each Task Packet prompt. When
2+ independent agents are ready, dispatch them as one batch. If no agent tool is available,
follow the open-code inline procedure while preserving the same Task Packet and Result
Report contracts.

For lightweight-default sub-agent work, pass `gpt-5.3-codex-spark` when the tool supports a
model override. Use the inherited current/default model for explicit overrides,
deep-* routes, high-complexity/high-risk work, performance-critical analysis, retry
escalations, or unsupported override paths. See `model-routing.md`.

In Codex Standard mode, this is an actual `spawn_agent` parameter:
`model: "gpt-5.3-codex-spark"`. Do not rely only on prompt text or Task Packet
metadata for model routing.

Inline execution in Standard mode is a last resort. Before using it, the conductor must
record in `orchestra/progress.md` that agent-tool detection failed or that a dispatch
attempt failed.

See `sub-agent-dispatch.md` Section 4 for the full template injection procedure.

**Dispatch example for a frontend agent (standard):**

```
Task #1:
  agent: "default or worker"
  prompt: |
    You are the Frontend Agent for the active codebase. You implement React 19 components
    following Wouter routing, Radix UI + CVA patterns, and TanStack Query conventions.

    Constraints: Do not modify backend files. Do not modify Python backend files.
    Do not modify database schema. Stage changes only — do not commit.

    ---

    TASK: Add the UserDashboard page component
    DOMAIN: CMD-1 Frontend
    FILES:
      - <absolute-repo-root>/apps/web/client/src/pages/Dashboard.tsx
      - <absolute-repo-root>/apps/web/client/src/components/StatsCard.tsx
    CONTEXT:
      ### Results from Wave N
      - [backend] Added getSummary procedure: <absolute-repo-root>/apps/web/server/routers/dashboard.ts — success
    CONSTRAINTS: [...]
    CONTRACT: See orchestra/contracts.md — frontend ↔ backend — UserDashboard
    OUTPUT: Dashboard.tsx and StatsCard.tsx created with passing tests
    QUALITY GATE: cd apps/web && pnpm check && pnpm test
```

Use condensed templates (identity + constraints only). Do not inject the full agent file —
it inflates prompt size beyond what Standard mode handles reliably.

---

## 4. Open-Code Mode

No Task tool is available. The conductor adopts each agent's identity inline and executes
tasks sequentially.

**Scope cap:** Open-code mode is capped at `small` scope. For `medium` or larger scope
tasks, print this exact warning and continue (do not block):

```
⚠️ This task requires parallel agents (medium+ scope). Open-code mode executes
sequentially, which will take longer and may lose cross-agent contract discipline.

Consider switching to Claude Code or Standard mode for better results.
Proceeding sequentially. You may want to use `/clear` between agent role
transitions to manage context window size.
```

**Role transition announcements (required in open-code mode):**

When adopting an agent role inline, announce the transition clearly:

```
--- [Adopting Frontend Agent role] ---
Following: React 19, Wouter, Radix UI + CVA, TanStack Query. Not modifying backend files.
```

After completing the inline task, announce the exit:

```
--- [Returning to Orchestra Conductor role] ---
```

**Dispatch example for a frontend task (open-code, inline):**

```
--- [Adopting Frontend Agent role] ---
Following: React 19, Wouter, Radix UI + CVA, TanStack Query. Not modifying backend files.

[Implements Dashboard.tsx and StatsCard.tsx inline]
[Runs: cd apps/web && pnpm check && pnpm test]

--- [Returning to Orchestra Conductor role] ---
Wave 1 result: [frontend] Added Dashboard.tsx — success
Next: adopt backend agent role for getSummary procedure.
```

---

## 5. Platform Reset

If the user needs to change the platform after the initial selection:

**Delete the file to re-prompt on next invocation:**
```bash
rm orchestra/platform.md
```

**Or edit it directly with any text editor** — change its single-line contents to the new
platform name (`claude-code`, `standard`, or `open-code`).

On the next invocation of `/orchestra`, the detection flow runs again (missing file →
re-prompt). The conductor does not provide a built-in "change platform" command — file-based
reset is the self-service path.
