# Routing Decision

This reference defines when orchestra should stay in its normal wave model and when it should automatically chain into `deep-plan-quick`, `deep-plan`, `deep-project`, and `deep-implement`.

## Route Table

| Scope / Situation | Route | Behavior |
|---|---|---|
| `trivial` | `direct-edit` | Edit directly; no planning chain |
| `small` and implementation-ready with no safe parallel split | `single-agent` | Dispatch one sub-agent when tooling exists; direct conductor implementation only for `trivial` |
| `medium` or any task with 2+ safe independent workstreams | `multi-agent-waves` | Wave-based implementation with parallel batches by default |
| `small` or `medium` but under-specified / plan-beneficial | `quick-plan-chain` | Auto-run `deep-plan-quick`, then `deep-implement` |
| idea/product direction unclear before planning | `brainstorming-prelude` | Use `brainstorming` to clarify intent/options, then route to quick plan, deep plan, or full pipeline |
| explicit installed skill/slash tool or specialized scan/generator | `installed-skill-flow` | Read `installed-skill-routing.md`, run the smallest matching skill, and wrap with Orchestra state/gates when multi-step |
| product help/tutorial/demo generated from code | `code-aware-help-flow` | Discover real behavior from code, generate help/script/outline, add GPT Image 2 visuals, and optionally build a web-video companion |
| security-sensitive implementation or review | `security-gate` | Use normal implementation routing plus mandatory security specialists and pre-merge security gate |
| user-facing behavior unclear | `product-ux-preflight` | Dispatch `product-ux`, then route to architecture/planning |
| visual polish / responsive / accessibility UI work | `visual-ui-flow` | Dispatch visual UI requirement/direction agents, then builder/review/refactor waves |
| `large` | `deep-plan-chain` | Auto-run full `deep-plan`, then `deep-implement` |
| `project` | `full-pipeline` | Auto-run `deep-project`, then per-split `deep-plan`, then `deep-implement` |

## General Rule

Do not stop merely to ask the user to run another skill.

Do not collapse non-trivial work into conductor-only implementation when a sub-agent tool is
available. Before selecting `single-agent`, run the parallelization preflight from
`wave-planning.md`; if it finds two or more safe workstreams, select `multi-agent-waves`.

If orchestra determines that a deep-* skill is needed, it should:
1. create the required input artifact(s)
2. read the sibling deep-* `SKILL.md`
3. execute that workflow inline
4. verify the resulting files
5. continue automatically

Interrupt the user only for:
- destructive archival/reset
- ambiguous product intent
- critical blocker that cannot be resolved safely
- critical security acceptance

## Route: `installed-skill-flow`

Use this route when:
- the user names an installed skill or slash-style tool
- the task is primarily an audit, scanner, generator, analytics query, health check, SEO/content task, security verification, deploy/release workflow, UI enhancement, image prompt, OpenAI-docs question, or skill/plugin maintenance task
- a specialized skill can perform the task more directly than generic agent dispatch

Execution:
1. Read `installed-skill-routing.md`.
2. Select the smallest matching operational skill. For broad launch/security requests, compose skill groups from that registry.
3. Read the selected skill's `SKILL.md` and only the needed references/tools.
4. Run read-only checks automatically. Ask only before overwrites, external side effects, credential-backed operations, destructive actions, or accepted-risk security bypasses.
5. Feed results back into Orchestra progress, risk register, backlog, and quality gates when the task is multi-step or risk is medium+.
6. If implementation is required after the skill report, route into direct edit, waves, quick-plan, deep-plan, or deep-implement as appropriate.

## Route: `brainstorming-prelude`

Use this route before any deep-* planning chain when:
- the user is still exploring what to build, who it is for, which workflow or
  product shape is best, or which option to choose
- the request uses ideation language such as brainstorm, explore, design the
  concept, คิดไอเดีย, ช่วยคิดระบบ, ออกแบบ feature, or อยากทำอะไรดี
- a project/module/system may be large enough for `deep-project`, but the
  product intent, audience, success criteria, or option choice is not settled

Do not use this route when:
- the user already provided a concrete project/module goal and asks to split,
  decompose, plan, or implement it
- the next required action is mechanical decomposition into specs
- the user explicitly asks for `deep-project` and the requirements are already
  clear enough to split

Execution:
1. Read `../brainstorming/SKILL.md`.
2. Run a bounded ideation pass that outputs:
   - chosen direction or shortlist
   - target user and main job-to-be-done
   - non-goals and constraints
   - success criteria
   - open questions that block decomposition
3. If the chosen direction is still ambiguous, ask the smallest product question.
4. If the direction is chosen and scope is project-scale, continue into
   `full-pipeline` (`deep-project` -> per-split `deep-plan` -> `deep-implement`).
5. If the result is a small or medium feature, continue into `quick-plan-chain`
   or `deep-plan-chain` based on scope and risk.

## Route: `code-aware-help-flow`

Use this route when:
- the user asks for help docs, onboarding, walkthroughs, demo scripts, release
  tutorials, or professional help-center content for an existing feature
- the requested material should be based on a real page, route, component, API,
  workflow, or product behavior in the codebase
- the user wants visual explanation, premium imagery, or a video companion

Execution:
1. Use SocratiCode first when active:
   - `codebase_search` to locate the page/feature/route/API
   - `codebase_flow` or `codebase_graph_query` when runtime flow matters
   - `codebase_symbols` / `codebase_symbol` for named handlers/components
2. Verify the discovered behavior with targeted file reads and `rg`.
3. Produce a source-grounded Help Brief:
   - target user and goal
   - discovered route/page/API/component files
   - happy path, important states, permission/role constraints, and failure cases
   - claims that need screenshots, diagrams, or visual metaphors
4. For written help, draft the article/guide directly or route UI integration
   through `visual-ui-enhancement` when it becomes in-product UI.
5. For video-ready help, read `../web-video-presentation/SKILL.md` and create
   `script.md` + `outline.md` from the Help Brief and discovered code behavior.
6. For imagery, read `../gpt-image-2/SKILL.md`; generate visual prompts for
   hero images, diagrams, or chapter frames and execute through Codex-native
   image generation when available.
7. Before any scaffold, npm install, TTS, or external audio generation, ask for
   explicit confirmation immediately before the side effect.
8. Run the relevant installed skill and UI quality gates before final delivery.

## Route: `security-gate`

Use this route when:
- the request modifies or audits auth, RBAC, tenant isolation, secrets, encryption,
  CORS/CSP, uploads/deserialization, infrastructure security, or security-related
  dependency changes
- the user explicitly asks for a security gate, secure implementation, pre-merge
  security review, or authorization/permission hardening
- normal implementation routing would otherwise run, but the risk-sensitive surface
  requires security specialists before completion

Execution:
1. Choose the normal implementation route by scope (`single-agent`,
   `multi-agent-waves`, `quick-plan-chain`, or `deep-plan-chain`).
2. Mark `security_gate_required = true` before final quality gates.
3. Read `security-review-protocol.md`.
4. Dispatch `ssp-security-trpc`, `ssp-security-fastapi`, and/or
   `ssp-security-frontend` when their buckets apply. Use sequential inline execution
   only when the active platform has no Task/sub-agent tool.
5. Run `ssp-security-review` as the aggregator after all applicable specialist Result
   Reports are collected.
6. Block on `FAIL`, auto-log/continue on `CONDITIONAL` only under `auto_by_default`,
   and include the verdict in the final summary.

## Route: `quick-plan-chain`

Use this route when:
- the user provided only a short free-form request
- no `spec.md` exists
- the task is not large enough to justify the full heavy planning pipeline
- implementation would be safer with a compact written plan first

Execution:
1. Create `specs/quick/NNN-name/request.md`.
2. Read `../../deep-plan-quick/SKILL.md` and execute it.
3. Verify `implementation-plan.md`, `sections/index.md`, and `sections/section-*.md` exist.
4. If quick planning reveals hidden complexity, promote to `deep-plan-chain`.
5. Otherwise continue directly into `deep-implement`.

## Route: `product-ux-preflight`

Use this route when:
- the request affects user-facing workflows
- acceptance criteria, UX states, roles, tenant behavior, or copy are unclear
- implementation would otherwise require guessing product behavior

Execution:
1. Dispatch `product-ux` with relevant existing pages/specs and the user request.
2. If the agent returns product blockers, ask the smallest possible product question.
3. If it returns a complete Product UX Brief, inject it into `architect`, `deep-plan-quick`, or `deep-plan` CONTEXT.
4. Continue through the normal route selected by scope.

## Route: `visual-ui-flow`

Use this route when:
- the user asks for premium, modern, polished, professional, responsive, accessible, or dark-mode-friendly UI
- Tailwind CSS, shadcn/ui, component states, visual hierarchy, or production UI QA are in scope
- a frontend change needs visual/UX/a11y/responsive review beyond normal implementation

Execution:
1. Read `../visual-ui-enhancement/SKILL.md` and relevant references lazily.
2. Read `ui-ux-planning-contract.md` and `design-token-extraction.md`; require the UI
   Enhancement Brief to cover existing token/component vocabulary plus
   target user/JTBD, surface inventory, component map, state matrix, responsive matrix,
   accessibility acceptance, and browser evidence requirements.
3. Dispatch `visual-ui-requirement-analyzer` to produce a UI Enhancement Brief. Inline only
   when no Task/sub-agent tool is available and record the fallback.
4. Dispatch `visual-ui-direction` to choose one coherent direction. Inline only when no
   Task/sub-agent tool is available and record the fallback.
5. Dispatch `frontend` when the primary work is routing, hooks, tRPC consumers, auth-aware
   client behavior, or behavior tests. Dispatch `ui-builder` when the primary work is
   visual hierarchy, Tailwind/shadcn composition, tokens, states, or responsive polish.
   Do not dispatch both as parallel writers for the same file; split into sequential waves
   if both are needed.
   Writer routing and gate routing are separate: browser-visible async/data-fetching UI
   implemented by `frontend` still requires Component State Gate and UI Screenshot/E2E Gate
   when loading, empty, error, success, disabled, focus, or primary action reachability can
   regress.
6. Run read-only review wave: dispatch `visual-ux-reviewer`, `accessibility-reviewer`, and
   `responsive-reviewer` together when all apply. Use `ui-review-report-template.md` for
   report shape.
7. Dispatch `visual-final-refactor` only when review findings require code changes.
8. Run visual UI quality gates from `quality-gates.md` and browser evidence checks from
   `ui-browser-verification.md`.

## Route: `deep-plan-chain`

Use this route when:
- scope is `large`
- a proper `spec.md` already exists
- the task spans multiple domains or needs a full planning package

Execution:
1. Create or refresh `specs/feature/NNN-name/spec.md`.
2. Auto-review the spec for completeness, clarity, scope boundary, and technical risk.
3. Apply planner-owned technical improvements automatically.
4. Ask the user only if product intent is still ambiguous.
5. Read `../../deep-plan/skills/deep-plan/SKILL.md` and execute it.
6. Verify `claude-plan.md`, `claude-plan-tdd.md`, and `sections/index.md` exist.
7. Continue directly into `deep-implement`.

## Route: `full-pipeline`

Use this route when scope is `project` and decomposition is required first.

Use `brainstorming-prelude` before this route only when the product direction is
not yet chosen. If the project goal is clear, do not add a brainstorming step;
start with `deep-project`.

Execution:
1. Create or refresh `specs/project/NNN-name/requirements.md`.
2. Auto-review the requirements document for decomposability, shared contracts, dependency order, and missing scope.
3. Read `../../deep-project/skills/deep-project/SKILL.md` and execute it.
4. For each generated split spec, run the full `deep-plan-chain` automatically.
5. For each completed split plan, run `deep-implement` automatically.
6. Aggregate progress in the same `orchestra/` session.

## Plan-First Bias

If the task is not implementation-ready, prefer planning before coding.

Use `quick-plan-chain` by default for short/underspecified small-medium requests. Escalate to `deep-plan-chain` only when complexity warrants it.

## Resume Rule

On `/orchestra resume`, orchestra should resume the earliest incomplete automatic chain stage rather than asking the user to manually restart deep-* skills.
