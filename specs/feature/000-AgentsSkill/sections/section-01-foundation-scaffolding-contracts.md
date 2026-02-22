I now have all the context needed. Let me generate the section content.

# Section 01 — Foundation: Scaffolding + Contract Schemas

## Overview

This section is the foundation for all other sections. It creates the directory structure and contract schema files that every subsequent section depends on. No other section can be implemented until this one is complete.

**Dependencies:** None — this section has no prerequisites.

**Blocks:** All other sections (02 through 09).

**Deliverable files:**

| File | Purpose |
|------|---------|
| `deep_plan/skills/orchestra/` | Orchestra skill root directory |
| `deep_plan/skills/orchestra/references/` | Reference documents directory |
| `deep_plan/skills/sub-agents/` | Sub-agents skill root directory |
| `deep_plan/skills/sub-agents/agents/` | Individual agent definition files |
| `deep_plan/skills/sub-agents/contracts/` | Contract schema files |
| `deep_plan/skills/sub-agents/contracts/task-packet.schema.md` | Task Packet format definition |
| `deep_plan/skills/sub-agents/contracts/result-report.schema.md` | Result Report format definition |
| `deep_plan/skills/orchestra/references/task-packet-format.md` | Conductor-perspective Task Packet guide |

---

## Background and Context

This implementation creates two new Claude Code skills for SmartSpecPro:

- `/orchestra` — the conductor skill that analyzes tasks, dispatches specialized sub-agents, integrates results, and manages file-based session memory
- `sub-agents` — a library of 17 specialized agent definitions (13 general + 4 security specialists)

All deliverables are markdown files. There is no TypeScript or Python code to write. The project follows the conventions established by the existing `deep-plan` skill (at `deep_plan/skills/deep-plan/`). Study that skill before implementing to understand the YAML frontmatter conventions and reference file patterns.

The deliverables across all 9 sections live in three locations:

1. `deep_plan/skills/orchestra/` — conductor skill (1 SKILL.md + 13 reference files)
2. `deep_plan/skills/sub-agents/` — agent prompt library (1 README + 17 agent files + 2 contract files)
3. `.claude/agents/` — native Claude Code agent definitions (17 YAML+markdown files)

Section 01 creates the directory scaffolding and the two core contract schema files. These contracts define the communication protocol between the orchestra conductor and all sub-agents. Every agent file in sections 07 and 08 will reference these schemas in their Input Contract and Output Contract sections.

---

## Validation Tests (Run Before and After Implementation)

These are structural validation checks — not executable tests. Verify each item after creating the files.

**S = Structure**, **C = Contract consistency**, **X = Cross-reference**

### Directory Existence Checks

- [x] **S:** `deep_plan/skills/orchestra/` directory exists
- [x] **S:** `deep_plan/skills/orchestra/references/` directory exists
- [x] **S:** `deep_plan/skills/sub-agents/` directory exists
- [x] **S:** `deep_plan/skills/sub-agents/agents/` directory exists
- [x] **S:** `deep_plan/skills/sub-agents/contracts/` directory exists
- [x] All 5 directories physically present (not just referenced — verify with `ls`)

### task-packet.schema.md Checks

- [x] **S:** File contains exactly 8 required sections: `TASK`, `DOMAIN`, `FILES`, `CONTEXT`, `CONSTRAINTS`, `CONTRACT`, `OUTPUT`, `QUALITY GATE`
- [x] **S:** Every section has a description of what it contains
- [x] **S:** File includes at least 2 worked examples (e.g., one for frontend, one for backend role)
- [x] **S:** Examples include absolute file paths (not relative)
- [x] **C:** Field names (e.g., `TASK:`, `DOMAIN:`, `FILES:`) will be used identically in SKILL.md Step 4 and in agent Input Contract sections — make sure the casing and formatting you choose here is what you'll use everywhere

### result-report.schema.md Checks

- [x] **S:** File contains exactly 6 required fields: `status`, `files_changed`, `findings`, `blockers`, `next_steps`, `quality_gate_results`
- [x] **S:** The `status` field documents exactly 3 allowed values: `success`, `partial`, `failed`
- [x] **S:** The `findings` field documents the severity values: `HIGH`, `MEDIUM`, `LOW`
- [x] **S:** File includes at least 2 worked examples (one successful execution, one failed execution)
- [x] **C:** `status` values (`success`/`partial`/`failed`) must match what SKILL.md Step 5 (result integration) will expect when parsing agent outputs

### task-packet-format.md Checks

- [x] **S:** Covers all 8 Task Packet sections from the conductor's perspective (how to construct a packet, not just what the fields are)
- [x] **S:** Includes worked construction examples for at least 3 different agent roles (4 examples: Backend, Frontend, Database, Python/FastAPI)
- [x] **S:** Documents platform-mode variations: `claude-code`, `codex`, and `open-code`

---

## Implementation Details

### Step 1: Create Directory Structure

Create all 5 directories. The directories at `deep_plan/skills/` level will sit alongside the existing `deep-plan/` skill directory.

From the project root (`/home/dev/projects/SmartSpecPro`):

```
deep_plan/skills/orchestra/
deep_plan/skills/orchestra/references/
deep_plan/skills/sub-agents/
deep_plan/skills/sub-agents/agents/
deep_plan/skills/sub-agents/contracts/
```

The directories can be created by placing any file in them (markdown files do not require explicit directory creation commands — writing a file at a path creates the parent directories). However, it is fine to create placeholder files or to create directories explicitly. The `agents/` and `references/` directories will be populated in later sections; `contracts/` is populated in this section.

### Step 2: Create `task-packet.schema.md`

**File path:** `deep_plan/skills/sub-agents/contracts/task-packet.schema.md`

**Expected size:** 100–150 lines.

**Content to include:**

This file is the canonical reference for the Task Packet format — the structured briefing that orchestra sends to each sub-agent. Every field is mandatory. Document each field with:
- Name and label (e.g., `TASK:`)
- What it must contain
- Format constraints
- A short example value

The 8 required fields, in order:

1. **TASK** — An imperative verb phrase stating exactly what to do (e.g., "Add Zod validation to the `createSkill` tRPC procedure"). Must be a specific action, never vague ("look at", "check", "investigate").

2. **DOMAIN** — The Commander designation: `CMD-1` (Frontend), `CMD-2` (Backend), `CMD-3` (Python), `CMD-4` (Database), `CMD-5` (Infrastructure), `CMD-6` (Security). Used to identify which agent family handles this packet.

3. **FILES** — Absolute file paths only. Never relative paths. List every file the agent must read and every file the agent may modify. Separate read-only from write targets when needed.

4. **CONTEXT** — Prior events, relevant error messages, trace IDs, and what was already attempted. Must be specific — include actual error output, not summaries. This section allows agents to pick up mid-stream without reading conversation history.

5. **CONSTRAINTS** — What the agent must not touch (e.g., "Do not modify frontend files", "Do not drop any columns", "Do not change the API response shape"). Also includes coding conventions to follow for this agent's domain.

6. **CONTRACT** — Interface definition shared with parallel agents. Includes: API endpoint shape (method, path, request schema, response schema), shared type definitions, test boundaries. Required when dispatching parallel agents; `N/A` for solo agents.

7. **OUTPUT** — The exact deliverable format. Must be specific: "Modify file X to add Y", "Return a Research Brief in the format defined in result-report.schema.md", "Write test file at path Z". Never vague ("do the work", "implement it").

8. **QUALITY GATE** — What must pass before the agent's work is considered complete. Examples: "TypeScript must compile: `cd apps/web && pnpm check`", "Tests must pass: `pnpm test`", "No ruff errors: `cd python-backend && ruff check app/`".

Include 3 worked examples in the file:
- A frontend agent packet (adding a React component, with CONTRACT field showing the tRPC procedure schema it will call)
- A backend agent packet (adding a tRPC router, with CONTRACT field showing the response type the frontend expects)
- A security audit packet (read-only, CONTRACT field is N/A)

### Step 3: Create `result-report.schema.md`

**File path:** `deep_plan/skills/sub-agents/contracts/result-report.schema.md`

**Expected size:** 100–150 lines.

**Content to include:**

This file defines the structured report that sub-agents return to the conductor. The conductor's result integration step (SKILL.md Step 5) parses this format to detect conflicts, assess quality gate status, and determine the next wave.

The 6 required fields:

1. **status** — One of exactly three values: `success` (all work complete, all gates pass), `partial` (work complete but one or more non-blocking gates failed), `failed` (unable to complete — a blocker was encountered or a blocking gate failed).

2. **files_changed** — List of files modified, with a one-line description of what changed in each. Format: `- /absolute/path/to/file.ext — brief description of change`. Must use absolute paths.

3. **findings** — Issues discovered during the work that were not part of the original task. Each finding has: severity (`HIGH`, `MEDIUM`, `LOW`), description, and file:line location. Format:
   ```
   - [HIGH] Description of issue — /path/to/file.ext:42
   - [LOW] Description of issue — /path/to/file.ext:88
   ```
   Empty list (`[]`) if nothing found.

4. **blockers** — Things that stopped progress. Each blocker has: what was blocked, why, and what the conductor should do about it (e.g., "Re-dispatch after resolving the contract conflict in wave 2"). Empty list (`[]`) if none.

5. **next_steps** — Recommended follow-on actions the conductor should consider after integrating this result. May include: follow-up tasks for other agents, quality gates to run, or observations about the codebase. This is advisory — the conductor decides what to do.

6. **quality_gate_results** — Per-gate status. Format:
   ```
   - TypeScript check: passed
   - Unit tests: skipped (no TS files changed)
   - Security scan: passed
   ```
   Each gate must be one of: `passed`, `failed`, `skipped`.

Include 2 worked examples:
- A successful backend agent result (status: success, files_changed with real SmartSpecPro paths, empty findings, empty blockers)
- A failed frontend agent result (status: failed, files_changed showing partial work, a HIGH finding, a blocker with guidance for the conductor)

### Step 4: Create `task-packet-format.md`

**File path:** `deep_plan/skills/orchestra/references/task-packet-format.md`

**Expected size:** 100–200 lines.

**Content to include:**

This is the conductor's reference for *constructing* Task Packets — it covers the same schema as `task-packet.schema.md` but from the perspective of the orchestra writing packets, not agents reading them.

Include:

- The construction checklist (things to verify before dispatching any packet)
- The 8-field template with conductor-perspective guidance for each field (e.g., for FILES: "List every file the agent must read. If the agent will write new files, include the target path even if it doesn't exist yet.")
- Platform-mode notes for each field:
  - `claude-code`: Standard Task Packet, dispatch via Task tool with specific `subagent_type`
  - `codex`: Prepend the full `agents/NAME.md` content before the packet, use `subagent_type: general-purpose`
  - `open-code`: No Task tool — conductor adopts the agent identity and executes inline
- 3 worked construction examples for conductor use:
  - Constructing a packet for the backend agent when adding a new tRPC router (SmartSpecPro context: `apps/web/server/routers/`, Zod schema, Drizzle query)
  - Constructing a packet for the frontend agent (SmartSpecPro context: `apps/web/client/src/`, TanStack Query, Radix UI)
  - Constructing a packet for the database agent (SmartSpecPro context: `packages/db/` or `drizzle/schema.ts`, backup protocol)

---

## Skill Registration Note

After section 06 creates `deep_plan/skills/orchestra/SKILL.md`, verify whether the `/orchestra` command is auto-discoverable. The existing plugin root at `deep_plan/` auto-discovers sibling skills under `skills/` — check whether the `/orchestra` command is available without changes to `.claude/settings.json`.

If explicit registration is required, add an entry to `.claude/settings.json` analogous to the existing `"deep-plan"` entry. The acceptance criterion: invoking `/orchestra` displays the orchestra banner without a "skill not found" error.

This verification step belongs to section 06, not section 01, since SKILL.md does not exist yet. Document this note in `task-packet-format.md` or in a README in the orchestra directory so the section 06 implementer knows to check.

---

## Acceptance Criteria

All items must be satisfied before marking section 01 complete:

- [x] All 5 directories exist at the correct absolute paths under `/home/dev/projects/SmartSpecPro/`
- [x] `deep_plan/skills/sub-agents/contracts/task-packet.schema.md` exists and documents all 8 Task Packet fields with descriptions and examples
- [x] `deep_plan/skills/sub-agents/contracts/result-report.schema.md` exists and documents all 6 Result Report fields, with `status` having exactly 3 allowed values (`success`/`partial`/`failed`)
- [x] `deep_plan/skills/orchestra/references/task-packet-format.md` exists and covers all 8 Task Packet sections from the conductor's construction perspective
- [x] `task-packet-format.md` includes platform-mode notes (claude-code, codex, open-code)
- [x] All 3 files use SmartSpecPro-specific file path examples (e.g., `apps/web/server/routers/`, `python-backend/app/api/v1/`, `apps/web/client/src/`)
- [x] The `status` values documented in `result-report.schema.md` are `success`, `partial`, and `failed` — these exact strings must be used consistently throughout all subsequent sections

---

## What NOT to Do

- Do not write SKILL.md in this section — that is section 06.
- Do not write any agent files — those are sections 07 and 08.
- Do not write reference files other than `task-packet-format.md` — those are sections 02 through 05.
- Do not implement any TypeScript or Python code — all deliverables are markdown.
- Do not use relative file paths in any examples within these schema files.