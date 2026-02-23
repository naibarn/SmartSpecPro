# Integration Notes — External Review Feedback

**Review source:** Opus subagent (iteration-1-opus.md)
**Date:** 2026-02-22
**Plan file:** claude-plan.md

---

## What We Are Integrating and Why

### 1. CRITICAL — Sub-Agent Nesting Fix (Section 08)

**Integrating: YES — this is architecturally mandatory.**

The research document (line 140) explicitly confirms: "Sub-agents CANNOT spawn other sub-agents." The plan described `security-review.md` as a coordinator that dispatches 3 specialists via Task tool calls. This would fail at runtime — security-review.md is itself dispatched as a sub-agent by orchestra, and sub-agents cannot further spawn sub-agents.

**Fix being integrated:**
- Restructure the pre-merge security gate so **orchestra directly dispatches** all 3 security specialists in parallel (single message, 3 Task calls)
- Repurpose `security-review.md` from a "dispatcher" to an **aggregator**: it is dispatched with the collected findings from all 3 specialists already available (passed as context in its Task Packet), and its job is to deduplicate, apply severity thresholds, write to risk_register.md, and return the PASS/CONDITIONAL/FAIL verdict
- Update Section 06 (SKILL.md) Step 5/6 to reflect that orchestra does the dispatch; security-review is only invoked after specialists complete

### 2. HIGH — `tools` Field Added to Agent Matrix (Section 09)

**Integrating: YES — the research document and spec both show this field is required.**

The YAML frontmatter pattern includes `tools:` but the configuration matrix in Section 09 omits it. This is a gap.

**Fix being integrated:**
- Add `tools` to the agent configuration matrix
- Read-only agents: `Read, Grep, Glob`
- Write-capable agents: `Read, Grep, Glob, Bash, Write, Edit`
- Note: Only include tools agents actually need (principle of least privilege)

### 3. HIGH — `isolation` Field Added to Agent Matrix (Section 09)

**Integrating: YES — the research document (line 158) and wave-planning constraints already reference this.**

The plan mentions `isolation: worktree` at line 125 but the Section 09 matrix omits it.

**Fix being integrated:**
- Add `isolation: worktree` for writing agents that may be dispatched in parallel waves
- Read-only (Explore/plan) agents do not need isolation

### 4. HIGH — Skill Registration Section (Section 01)

**Integrating: YES — valid gap.**

The plan never addresses how the `/orchestra` slash command gets registered. The existing deep-plan skill works because the plugin is registered in `.claude/settings.json`. A new sibling skill at `deep_plan/skills/orchestra/` may or may not auto-discover.

**Fix being integrated:**
- Add a registration sub-task to Section 01: "Verify skill is discoverable — check if a new entry is needed in `.claude/settings.json` or if the sibling placement is auto-detected by the plugin system."
- Add acceptance criterion: "Invoke `/orchestra help` and verify the skill banner appears without errors."

### 5. HIGH — Agent Naming to Avoid Subagent_type Collisions (Section 09)

**Integrating: PARTIALLY.**

The reviewer flagged potential collisions between `.claude/agents/NAME.md` and plugin-provided `subagent_type` values. In practice, `.claude/agents/` definitions are triggered by description-matching during auto-dispatch, while Task tool's `subagent_type` parameter targets plugin agents by ID. These serve different dispatch mechanisms and are unlikely to conflict.

However, using generic names like `backend.md` in `.claude/agents/` while the plugin provides `backend-api-security:backend-architect` as a subagent_type could be confusing for maintainers.

**Fix being integrated:**
- Add a note in Section 09 clarifying the two dispatch mechanisms are independent
- Recommend using `ssp-` prefix for `.claude/agents/` definitions (e.g., `ssp-backend.md`) to distinguish from plugin subagent types
- Note this as an implementer choice, not a hard rule

### 6. MEDIUM — Agent Count Header Fix (Section 07)

**Integrating: YES — simple correctness fix.**

Section 07 header says "17 agent files" but only covers 13. Section 08 covers the remaining 4 security specialists.

**Fix being integrated:**
- Change Section 07 header to "13 general agent files"
- Add a note: "The remaining 4 security specialists are defined in Section 08"
- Fix acceptance criteria from "All 13 general agent files" (already correct) to also clarify the total is 17 across sections 07+08

### 7. MEDIUM — `orchestra/` Directory Path Clarification (Section 05)

**Integrating: YES — clarification only, behavior unchanged.**

The spec (claude-spec.md line 197) says "`orchestra/` is created in the project working directory when `/orchestra` is first invoked." This is intentionally at the project root — it's the single active session directory.

**Fix being integrated:**
- Clarify in artifact-management.md that `orchestra/` lives at the project root (`/home/dev/projects/SmartSpecPro/orchestra/`)
- Note that the archive mechanism (`orchestra/archive/<timestamp>/`) handles historical sessions
- Add a note about multi-developer simultaneous use: if two developers are running separate `/orchestra` sessions concurrently, they will collide. This is an acceptable limitation for a single-developer workflow tool; add a warning in the banner.

### 8. MEDIUM — Conditional Reference File Reads (Section 06)

**Integrating: YES — important performance optimization.**

SKILL.md reads reference files unconditionally. For trivial/small tasks, reading wave-planning.md, security-review-protocol.md, and compaction-safety.md is wasteful (adding 500+ lines to context before any work begins).

**Fix being integrated:**
- Add explicit conditional read guidance to SKILL.md writing rules:
  - Step 2 (routing): read task-analysis.md + routing-decision.md always
  - Step 3: read wave-planning.md only if scope = medium+
  - Step 4: read sub-agent-dispatch.md + platform-compat.md only for medium+ (trivial uses direct edit)
  - Step 5: read result-integration.md only for medium+
  - Step 6: read quality-gates.md always; read security-review-protocol.md only when gate triggers
  - Step 8: read compaction-safety.md only when context state is yellow+

### 9. MEDIUM — Prominent Logging for Auto-Approved HIGH Security Findings (Section 04)

**Integrating: PARTIALLY — logging requirement, NOT changing the auto-approve policy.**

The auto-approve in `auto_by_default` mode for CONDITIONAL (HIGH findings, no CRITICAL) is a deliberate design decision from the interview (spec line 158). We are not changing this policy.

However, the reviewer's point about silent approval is valid from a security posture perspective.

**Fix being integrated:**
- Add requirement: when HIGH security findings are auto-approved in `auto_by_default` mode, they MUST appear in the final summary output with a "⚠️ AUTO-APPROVED HIGH SECURITY FINDINGS" header
- Also log each auto-approval with timestamp to `orchestra/decisions.md`

### 10. MEDIUM — Snapshot Schema Canonical Definition (Section 05)

**Integrating: YES — clarification to prevent implementer confusion.**

The research document (lines 353-369) shows a generic checkpoint schema with field names like `completed_steps`, `pending`, `task_id`. The plan's spec (claude-spec.md lines 215-229) uses `completed_waves`, `pending_waves`, `task_description`, `phase`. The plan itself uses the spec schema.

**Fix being integrated:**
- Add an explicit note in Section 05 that the canonical schema is defined in the plan (spec-aligned: `completed_waves`, `pending_waves`, `task_description`, `phase`)
- Note that the research document shows a generic pattern; the plan's schema supersedes it for this feature

### 11. MEDIUM — Handoff Verification for Large/Project Scope (Section 05)

**Integrating: YES — valid gap in the resume flow.**

When orchestra hands off to deep-* skills, the user runs the skill manually and then types `/orchestra resume`. The plan doesn't address what happens if deep-* artifacts are missing when orchestra resumes.

**Fix being integrated:**
- Add to session-resume.md: "If resuming after a deep-* handoff, verify expected artifacts exist (e.g., `sections/index.md`, `claude-plan.md` in the spec directory). If missing, report clearly: 'Expected artifacts from deep-plan not found at [path]. Did the deep-plan session complete?'"
- Add to skill-pack-integration.md: "After creating the spec file and notifying the user, write the expected output paths to `orchestra/backlog.md` so the resume flow can verify them."

### 12. LOW — Wave N Context Injection Format (Section 03)

**Integrating: YES — useful precision.**

The plan says wave N results are injected as "structured context" but never defines the format.

**Fix being integrated:**
- Add a concrete format example to wave-planning.md:
  ```
  ### Results from Wave 1
  - [database] Migration added: /path/to/migration.sql — SUCCESS
  - [backend] Service added: /path/to/resource-service.ts, exports: IResourceService — SUCCESS
  - [backend] Open contract note: expects ResourceModel from database agent ✓ fulfilled
  ```

### 13. LOW — Open-Code Mode Scope Cap (Section 03)

**Integrating: YES — reasonable safety guardrail.**

Open-code mode (sequential inline execution) will hit context limits for medium+ tasks with 6+ agents.

**Fix being integrated:**
- Add to platform-compat.md: "For open-code mode, auto-cap to `small` scope. If scope = medium+, print a recommendation: 'This task requires parallel agents. Consider switching to Claude Code or Codex. Proceeding sequentially — enable more context with `/clear` between agent roles if needed.'"

---

## What We Are NOT Integrating and Why

### Duplicate Task Packet Content (finding #14)

**Not integrating.** The three-way content pattern (contracts/task-packet.schema.md → references/task-packet-format.md → SKILL.md Step 4) is intentional. The contracts directory is for sub-agents to reference; the references directory is for the conductor; SKILL.md Step 4 has a condensed inline version. These are different audiences, not accidental duplication. Maintenance burden is acceptable for markdown files.

### .gitignore Verification Step (finding #16)

**Not integrating.** The SmartSpecPro `.gitignore` is well-maintained and doesn't contain broad wildcard patterns that would catch `orchestra/*.json`. Adding a verification step to Section 01 would be over-engineering for this risk level.

### Codex Template Injection Size Limits (finding #13)

**Not integrating as a structural change.** We will add a brief note in platform-compat.md that condensed templates (identity + constraints only) should be used for Codex injection, but we will not create separate condensed template files. This is an implementer judgment call when writing each agent file.

### Copy-Paste Error in Spec Output Examples (finding #18)

**Not integrating into the plan.** The spec file (`claude-spec.md`) is a synthesis document — the plan takes precedence. We will add a note in Section 08 acceptance criteria reminding implementers to use domain-appropriate file paths in output examples.

### Platform Detection Reset Mechanism (finding #12)

**Not integrating as a new feature.** The `orchestra/platform.md` file is plain text — if a user needs to change platform, they can simply delete the file or edit it directly. Adding `--platform=X` flag syntax is scope creep for an MVP. We'll add a note in platform-compat.md that "to change platform, delete or edit `orchestra/platform.md`."
