# Task Packet: Specs 263 and 270 Completion

## User intent
Complete all repository-implementable sections of Specs 263 and 270, close stale work items, and make the public tenant homepage actually render the current tenant's published content. User requires no build in this continuation. User has authorized autonomous implementation and delegated sub-agents earlier.

## Constraints
- Worktree: `/home/dev/.codex/worktrees/spec263-270-public-completion-20261005`, reconciled onto `origin/main` SHA `58cafcfd60` before the task commit was rebased.
- Preserve all other worktrees and the dirty canonical checkout.
- Do not run build or repository-wide typecheck. Do not mutate production DB or claim deployment.
- Never revive retired workflow/Agency/OpenSandbox systems.
- Follow Specs 263/270 and current AGENTS; use existing package manager and focused fast gates only.

## Current evidence / suspected root
- `Home.tsx` now uses `useTenantPage("home")` and renders `TenantHomePage` when present, otherwise SmartAIHub static fallback.
- Production DB homepage row is global (`tenantId=null`), while `/api/tenant/public-pages/:pageKey` only selects exact tenant rows. Thus the public endpoint 404s on the deployed homepage and fallback renders old generic content. This is a likely remaining code/data contract gap.
- Need verify source code, tests, exact schema nullability, and safe global fallback semantics before changing.

## Scout assignment
Read-only Spec 270 gap-closure map and safe implementation sequencing. No code edits, no build/full typecheck. Report bounded paths, cross-spec blockers, and focused tests.

## Must not claim
No browser or production proof, no full spec closure where rights, tenant content approval, SEO crawl, browser matrix, analytics, production RUM, or external provider certification is absent.
