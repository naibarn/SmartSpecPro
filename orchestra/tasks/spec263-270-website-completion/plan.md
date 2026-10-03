# Website Completion Continuation — Spec 263 / 270

Date: 2026-10-03

## Goal and route

Make the public SmartAIHub website usable on current `origin/main`, continuing the approved Spec 263/270 plans. Scope is large and user-facing/high risk because public routes, content and crawl output are involved. Use the existing deep-plan and deep-implement artifacts; do not redesign their requirements. Prioritize the smallest truthful public flow that can be closed from repository-owned code. Keep durable storage, live Spec 224/256 authorities, provider certification, production and owner-approved customer/media claims disabled until their actual owners/evidence exist.

`orchestra/progress.md` at repository root belongs to an unrelated active Spec 215 task and is preserved. This continuation tracks lifecycle, loop progress, test design and findings under this task directory.

## Discovery

- Current delivery base: `origin/main` at `284f35b748de2dc0fd5b7872a71d03f3ce638504`; prior Spec 263/270 delivery commit `49decb91e` is an ancestor.
- New isolated worktree: `/home/dev/.codex/worktrees/spec263-270-website-completion/SmartSpecPro`.
- Main checkout contains unrelated dirty user changes and is out of write scope.
- SocratiCode/codebase-index tools are unavailable in this runtime; use targeted `rg`, exact file reads and repository tests.
- Existing Spec 263 sections 03/04 remain blocked by public-ready artifact, approved claims/assets and Film proof. Spec 270 Section 06 remains blocked by durable artifact ownership and live implementation authorities. Reassess whether public UI can be closed safely using only existing verified routes/capabilities, without inventing claims or wiring private runtime.

## Parallelization preflight

- First wave: one bounded read-only website scout; no competing writers.
- Candidate later review wave: independent public-route/SEO review after changes; only dispatch if source changes establish a distinct test or browser boundary.
- Shared contract: existing homepage/public route/navigation/SEO owners from Spec 263; do not add a new route or provider API unless the existing plan and code prove it necessary.
- Ownership: conductor owns all writes; scout/review agents read only.
- No database or runtime-owner integration is assumed.

## Work sequence

1. Read-only scout current public homepage, navigation, CTA, route, SEO, feature content and existing tests.
2. Reconcile scout findings with Spec 263 Section 03 and the approved claim/asset truth map. Choose only a codebase-supported, user-visible path.
3. Record requirement-to-test matrix and establish red/absent evidence.
4. Implement the narrowest public website improvements, following Astryx discovery and local UI conventions.
5. Run focused tests, available browser/responsive/accessibility checks, claim/route safety tests and diff review.
6. Address all safe P1/P2 findings; retain typed blockers for owner/runtime/browser evidence that cannot be produced locally.
7. Recheck branch and remote before any delivery action. The prior user instruction authorized a push to `main`; do not deploy production without a separate explicit request.

## Loop policy

- iteration: 1/12
- tool_call_batches: 1/30
- dispatch_waves: 0/6
- active_subagents: 0/4
- parallel_writers: 0/2
- repair_rounds: 0/5
- stop_reason: active
- model preference: gpt-5.6-terra for implementation/review; sol only if a new planning deliverable is genuinely needed.

## Success and residual boundary

Success means the changed public path has correct routes and CTAs, truthful public content, automated focused proof, and browser evidence where available. No local test is evidence of production deployment. Any acceptance requiring externally owned approvals, private owner APIs, paid providers, production credentials or rights clearance remains explicitly blocked.
