# Result Report Schema

The Result Report is the structured response that every sub-agent returns to the `/orchestra` conductor after completing its assigned Task Packet. The conductor's result integration step (SKILL.md Step 5) parses this format to detect conflicts, assess quality gate status, and plan the next wave.

Every standard field is **mandatory**. If a field has no content, use an explicit empty
list `[]` — never omit the field. Role-specific extension fields are allowed when the
Task Packet OUTPUT requests them, but they must never replace the six standard fields.

## Output Budget Rules

Result Reports must be compact enough to carry between waves without causing context
growth:

- Target <= 1,500 words unless the Task Packet explicitly requests a longer artifact.
- List at most the top 15 findings by severity and impact. If more exist, summarize the remainder
  as counts by category and add the file path, trace ID, command, or artifact where the
  full evidence can be retrieved.
- Never paste full diffs, full source files, full logs, full stack traces, full prior
  Result Reports, raw JSONL timelines, or complete command transcripts.
- For command output, include only the relevant failing/error lines plus at most a short
  first/last excerpt. Point to the command or saved artifact for full reproduction.
- For read-only audits, prefer a finding table with `severity`, `file:line`, `evidence`,
  and `recommended_action` over prose paragraphs.
- If truncation affects confidence, record that in `blockers` or `next_steps`; otherwise
  note the truncation in `quality_gate_results`.

---

## Schema Reference

### status

**Allowed values (exactly 3):**

| Value | Meaning |
|-------|---------|
| `success` | All assigned work is complete. All blocking quality gates passed. |
| `partial` | Work is complete but one or more non-blocking quality gates failed, or the deliverable is narrower than specified (with explanation in `blockers`). |
| `failed` | Unable to complete assigned work. A blocking gate failed or a hard blocker was encountered. Conductor must not proceed with dependent waves. |

**Format:**
```
status: success
```

**Compatibility rule:** Older reports may use `completed` or uppercase wave labels
(`SUCCESS`, `PARTIAL`, `FAILED`). The conductor must normalize them before integration:

| Incoming value | Canonical status |
|---|---|
| `completed`, `success`, `SUCCESS` | `success` |
| `partial`, `PARTIAL` | `partial` |
| `failed`, `FAILED`, `blocked` | `failed` |

New agents must emit only the canonical lowercase values.

---

### files_changed

**What it must contain:** A list of every file that was modified, created, or deleted during this agent's execution.

**Format:**
```
files_changed:
  - /absolute/path/to/file.ext — brief description of what changed
```

**Rules:**
- Absolute paths only (starting with `/`)
- One entry per file
- New files are listed with "— created"
- Deleted files are listed with "— deleted"
- If no files were changed (read-only audit): `files_changed: []`

---

### findings

**What it must contain:** Issues discovered during the work that were **not** part of the original Task Packet. These are observations the conductor should consider for future waves.

**Severity levels:**
| Severity | Meaning |
|----------|---------|
| `HIGH` | Security vulnerability, data loss risk, or blocking regression |
| `MEDIUM` | Code quality issue that will cause problems at scale or in edge cases |
| `LOW` | Nitpick, style issue, or minor optimization opportunity |

**Format:**
```
findings:
  - [HIGH] Description of issue — /absolute/path/to/file.ext:42
  - [MEDIUM] Description of issue — /absolute/path/to/file.ext:107
  - [LOW] Description of issue — /absolute/path/to/file.ext:88
```

**If no findings:** `findings: []`

**Budget rule:** Findings should be one line each unless the evidence cannot be understood
without a short excerpt. Use `file:line`, trace IDs, test names, or artifact paths instead
of copying large evidence blocks.

---

### blockers

**What it must contain:** Things that prevented the agent from completing work, or that will prevent dependent waves from succeeding.

**Format:**
```
blockers:
  - what: Description of what was blocked and why
    action: What the conductor should do (e.g., "Re-dispatch after resolving contract conflict in wave 2")
```

**If no blockers:** `blockers: []`

---

### next_steps

**What it must contain:** Recommended follow-on actions the conductor should consider after integrating this result. This is **advisory** — the conductor decides what to do.

**Format:**
```
next_steps:
  - Run TypeScript check before dispatching wave 3: cd apps/web && pnpm check
  - Consider adding index on skills.tenantId for query performance (wave 4 or later)
  - Frontend agent (CMD-1) should receive the SkillSummary type before building UI
```

**If no next steps:** `next_steps: []`

**Budget rule:** keep `next_steps` to the top 8 actionable items. Group duplicates and
defer optional ideas to a backlog artifact/path instead of expanding the report.

---

### quality_gate_results

Use the same commands the conductor supplied in the Task Packet's `QUALITY GATE` section. The command strings in the examples below are repository example defaults only.

**What it must contain:** The pass/fail/skip result for every quality gate listed in the Task Packet's QUALITY GATE section.

**Allowed values per gate:** `passed`, `failed`, `skipped`

**Format:**
```
quality_gate_results:
  - TypeScript check (cd apps/web && pnpm check): passed
  - Unit tests (cd apps/web && pnpm test): passed
  - Security scan: skipped (no new endpoints added)
```

**Rules:**
- List every gate from the QUALITY GATE section — do not omit any
- If a gate was not in the original packet but was run anyway, include it with a note
- `skipped` is only valid when the gate genuinely does not apply (e.g., no TS files changed, read-only audit)
- Keep each gate result to status plus the decisive excerpt. For failures, include the
  command, exit code, and last relevant 40 lines or an artifact path. Do not include full
  test, lint, build, migration, or validation output inline.

---

### Role-Specific Extension Fields

Some agents produce a domain verdict in addition to the canonical `status`. Extension
fields are parsed only by the conductor logic that requested them.

| Agent | Extension field | Allowed values | Notes |
|---|---|---|---|
| `security-review` | `security_verdict` | `PASS`, `CONDITIONAL`, `FAIL` | Pre-merge gate verdict. Does not replace `status`. |
| `reviewer` | `review_verdict` | `APPROVE`, `APPROVE_WITH_FIXES`, `REQUEST_CHANGES` | Code-review verdict; blocking policy is decided by orchestra. |
| `visual-ux-reviewer`, `accessibility-reviewer`, `responsive-reviewer` | `ux_verdict` | `PASS`, `FIXES_REQUIRED`, `BLOCKED` | UI/UX/a11y/responsive verdict for visual UI gates. |

**Security-review example header:**

```
status: success
security_verdict: CONDITIONAL
```

---

## Worked Examples

### Example 1 — Successful Backend Agent Result

```
status: success

files_changed:
  - <absolute-repo-root>/apps/web/server/routers/skills.ts — added `list` query procedure with pagination and tenantId filter

findings:
  - [MEDIUM] The `create` procedure (added in wave 1) does not validate `category` against the allowed enum values. Line 47. Recommend adding Zod enum validation in a follow-up wave.

blockers: []

next_steps:
  - Frontend agent (CMD-1) is unblocked and can begin building SkillCard component
  - Consider adding database index on (tenantId, createdAt) for the list query — currently doing a full table scan on the skills table
  - The MEDIUM finding in the create procedure should be addressed before release

quality_gate_results:
  - TypeScript check (cd apps/web && pnpm check): passed
  - Unit tests (cd apps/web && pnpm test): passed
```

---

### Example 2 — Failed Frontend Agent Result

```
status: failed

files_changed:
  - <absolute-repo-root>/apps/web/client/src/components/skills/SkillCard.tsx — created (partial — Run button not implemented)

findings:
  - [HIGH] The tRPC client import path used in SkillsPage.tsx is deprecated (@/lib/trpc vs @/utils/trpc). Using the wrong path causes a runtime import error. File: <absolute-repo-root>/apps/web/client/src/pages/SkillsPage.tsx:3

blockers:
  - what: Cannot implement the Run button because the tRPC client import convention is ambiguous.
          Two import paths exist (@/lib/trpc and @/utils/trpc). TypeScript accepts both but
          only one resolves at runtime. The conductor must clarify which path is canonical
          before the frontend agent can safely wire up the mutation.
    action: Conductor should dispatch CMD-2 Backend to confirm canonical tRPC client export,
            then re-dispatch CMD-1 Frontend with updated CONTEXT and FILES pointing to the
            correct import source.

next_steps:
  - Resolve the tRPC import ambiguity (see blocker above) before re-dispatching CMD-1
  - The HIGH finding in SkillsPage.tsx should be fixed regardless of the blocker — it is a pre-existing issue
  - After re-dispatch, frontend agent should be able to complete in one additional wave

quality_gate_results:
  - TypeScript check (cd apps/web && pnpm check): failed (2 type errors in SkillCard.tsx related to unresolved tRPC types)
  - Unit tests (cd apps/web && pnpm test): skipped (TypeScript errors prevented test run)
```
