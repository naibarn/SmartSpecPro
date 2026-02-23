# Interview Transcript — Orchestra & Sub-Agents Skill Pack

**Date:** 2026-02-22
**Feature:** 000-AgentsSkill

---

## Round 1: Architecture & Structure

### Q1: Where should the orchestra/sub-agents skills be placed?

**A:** Inside `deep_plan/skills/` alongside deep-plan and deep-implement. Simpler, single plugin root. Invoked as `/orchestra`.

---

### Q2: Platform scope — Claude Code only, or all 3 platforms?

**A:** All 3 platforms from day 1 — build platform detection + dispatch adapter (`platform-compat.md`) as part of phase 1 (Claude Code, Codex, OpenCode).

---

### Q3: Sub-agents format — prompt library only, or also create native .claude/agents/ definitions?

**A:** Both: prompt library + .claude/agents/ definitions.
- Each sub-agent has a `skills/sub-agents/agents/NAME.md` template (prompt library)
- AND a `.claude/agents/NAME.md` native definition with YAML frontmatter (model, tools, memory, etc.)
- Project scope: `.claude/agents/` in SmartSpecPro repo (checked into git, available to all contributors)

---

## Round 2: Behavior & Policy

### Q4: How should /orchestra relate to the existing CLAUDE.md orchestration rules?

**A:** Orchestra supersedes CLAUDE.md rules when invoked. When `/orchestra` is active, it runs the full conductor workflow. CLAUDE.md orchestration rules are the fallback for day-to-day work when orchestra is NOT explicitly invoked.

---

### Q5: When should orchestra PAUSE and ask the user? (Pause conditions)

**A:** Orchestra is autonomous by default. Pause ONLY for:
1. Destructive operations (DROP TABLE, force push, delete files) — per CLAUDE.md DB Safety Protocol
2. High/critical risk tasks (security, auth, data migration) — risk classification from task analysis
3. Unresolvable conflicts between parallel agent results (when automated conflict resolution fails)
4. Context compaction threshold reached during active task (before CHC triggers)
5. Production deploy / infrastructure changes (apply terraform, restart services, feature flag rollout)

---

### Q6: What triggers the security gate automatically?

**A:** All of the following trigger the pre-merge security gate:
- Any change touching auth/JWT/session code
- Any new API endpoint (tRPC router or FastAPI route)
- HIGH or CRITICAL risk classification in task analysis
- Changes to encryption/secret handling code (LLM_ENCRYPTION_KEY, crypto.ts, smartspecweb_crypto.py)
- RBAC/permissions/policy changes (roles, scopes, ACL, IAM, middleware authz)
- CORS / CSP / security headers / cookie settings (SameSite, Secure, HttpOnly)
- File upload / download / deserialization / template rendering (RCE / path traversal / SSRF)
- Dependency upgrades involving security-relevant libs (auth, crypto, web frameworks)
- Infra / deployment config (Dockerfile, k8s, terraform, CI secrets, env vars)

---

## Round 3: State & Quality Gates

### Q7: How detailed should the orchestra snapshot be?

**A:** Full state JSON + human summary:
- `orchestra/snapshot.json` — structured checkpoint (completed steps, in-progress, pending, decisions, blockers, key files)
- `orchestra/snapshot.md` — human-readable summary for context injection at session resume

---

### Q8: Which quality gates are BLOCKING vs. WARNING?

**A:** Risk-driven approach:
- **LOW / MEDIUM risk tasks**: gates are warnings (orchestra continues, notifies)
- **HIGH / CRITICAL risk tasks**: all gates must pass before proceeding (blocking)

---

### Q9: Should orchestra include Python/bash helper scripts?

**A:** Pure markdown only. Orchestra is entirely SKILL.md + reference .md files. No scripts needed — Claude Code tools handle state.

---

## Round 4: Integration & Conflict Resolution

### Q10: How does the security review coordinator work with the 3 specialists?

**A:** When orchestra triggers the security gate, it calls the `security-review` agent (coordinator), which fans out to `security-trpc`, `security-fastapi`, and `security-frontend` specialists **simultaneously** (parallel dispatch). Coordinator aggregates findings into a PASS/FAIL verdict.

---

### Q11: Conflict resolution strategy when parallel sub-agents produce contradictory results?

**A:** Escalate to conductor for decision. When conflicts are detected, the conductor (orchestra) analyzes both results and makes a merge decision. Only pause to ask the user if the conflict is unresolvable programmatically.

---

### Q12: Scope for .claude/agents/ native definitions?

**A:** Project scope — `.claude/agents/` in SmartSpecPro repo. Checked into git. Available to all contributors.
