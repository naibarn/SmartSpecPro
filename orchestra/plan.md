# Orchestra Plan

## Current Task — Work Requests UI Polish
ปรับปรุง UI เดิมของหน้า `/work/requests` และ `/work/request` ให้ premium, modern, responsive และ accessible โดยคง behavior/API เดิมไว้

## Classification
- scope: medium
- risk: low
- affected_domains: frontend React pages, visual UI states, accessibility/responsive QA
- estimated_file_count: 4
- chosen_route: visual-ui-flow
- task_summary: Polish Work OS request list and request intake pages without changing existing API behavior.
- bug_route: false

## Intent Activation
- Explicit invocation: user invoked `$orchestra`.
- Matched signals: premium/modern/responsive/accessible UI work, route-level user-facing workflow, requested verification across states and viewports.
- Additional skill family: `visual-ui-enhancement`.

## Wave Plan
- Wave 1: Inspect existing `/work/requests` and `/work/request` UI, state handling, tests, and local design primitives.
- Wave 2: Apply scoped frontend polish for white-mode layout, hierarchy, loading/empty/error/disabled states, and responsive behavior.
- Wave 3: Run typecheck, targeted tests, browser screenshot/responsive gate for mobile/tablet/desktop.

---

## Task
Upgrade the SmartSpecPro skill system by borrowing selected superpowers methodology patterns and integrating the visual UI enhancement skill as a first-class repo skill.

## Task Classification
- Scope: large
- Risk: medium
- Affected domains: skills/orchestra, skills/sub-agents, .claude/agents, skill validation, installed skill sync
- Estimated file count: 25+
- Chosen route: multi-agent-waves with conductor-owned implementation
- Bug route: false
- Classification notes: This is a cross-skill-system enhancement touching routing, quality gates, agent registry, native Claude agent definitions, and validation scripts. Risk is medium because it changes development workflow behavior but not application runtime, auth, DB, or external APIs.

## Intent Activation
- Explicit invocation: user invoked `$orchestra` and asked to plan and implement fully.
- Matched signals: planning + execution delegation, end-to-end ownership, skill-system-wide changes.
- Orchestra ownership is justified because the work spans multiple skill packs, agent routing, quality gates, and validation.

## Scope Boundaries
- Include: repo-local `skills/`, `.claude/agents/`, `orchestra/` state files, installed skill publication under the existing sync scripts.
- Exclude: unrelated dirty `apps/web/` changes and existing `specs/quick/001-auto-team-capability-routing/` work.
- Exclude: external LLM API wiring, `.venv`-dependent runtime integration, and app runtime feature changes.

## Wave Plan

### Wave 1: Superpowers Pattern Foundation
- Add orchestra references for meta activation, worktree discipline, verification before completion, TDD discipline, branch finishing, and skill behavior tests.
- Wire those references into `skills/orchestra/SKILL.md` and relevant routing/quality docs.

### Wave 2: Visual UI Skill Integration
- Extract `skills/visual-ui-enhancement-multiplatform.zip` into a repo-local `skills/visual-ui-enhancement/` folder.
- Remove or neutralize `.venv` / external `OPENAI_API_KEY` runtime dependency from the active skill package.
- Preserve portable Codex/Claude/manual references.

### Wave 3: UI/UX Agent Coverage
- Add SmartSpecPro sub-agent definitions for visual UI requirement analysis, visual direction, UI building, UX review, accessibility review, responsive review, and final visual refactor.
- Add matching `.claude/agents/ssp-*` native definitions.
- Update sub-agent registry and dispatch mapping.

### Wave 4: Gates and Behavior Validation
- Add UI/UX quality gates to orchestra quality gates.
- Add skill behavior scenarios for meta activation and visual UI routing.
- Update audit validation to catch missing superpowers-pattern references, UI gates, visual skill dependency leaks, and behavior scenarios.

### Wave 5: Verification and Publication
- Run skill audit.
- Publish to installed skills.
- Verify installed sync.
- Report final status and residual risks.
