[COMPLETE] wave-1-direct-edit — Updated video-storyboard-to-prompts prompt templates for stronger continuity, reference filtering, text/logo sanitization, separate-audio visual-only handling, presenter visibility, and final QA audit.
[COMPLETE] wave-2-orchestra-socraticode-flow — Updated Orchestra skill flow to require SocratiCode active checks before repository shell exploration, prefer token-efficient line-range reads/diff stat, and use SocratiCode for Task Packet file resolution before targeted rg.
[COMPLETE] wave-3-deep-skills-socraticode-alignment — Aligned deep-project, deep-plan, and deep-implement with SocratiCode-first discovery, impact checks, fallback logging, and token-efficient shell verification.
[COMPLETE] wave-4-orchestra-subagent-impact-flow — Audited all 29 sub-agent roles and added central shared operational discipline, impact preflight, Task Packet impact context, wave impact boundaries, and post-wave impact closure so Orchestra must choose least-impact fixes or escalate real tradeoffs.

## Advisory Dirty State
The repository had pre-existing uncommitted changes before this Orchestra session, including prior edits under `apps/web/skills/video-storyboard-to-prompts/`. This session will preserve existing work and only patch the requested skill prompt behavior.

## Verification
- PASS: `git diff --check -- apps/web/skills/video-storyboard-to-prompts/prompts/system.prompt.md apps/web/skills/video-storyboard-to-prompts/prompts/storyboard.prompt.md apps/web/skills/video-storyboard-to-prompts/prompts/video_prompts.prompt.md orchestra`
- PASS: targeted `rg` audit for separate-audio conflict terms, text/logo sanitizer rules, visual-only mouth lock, presenter visibility, and reference filtering.
- SKIPPED: TypeScript/unit tests because only Markdown prompt templates and Orchestra session notes changed; no runtime TypeScript/Python code changed in this wave.
- PASS: SocratiCode active preflight before shell edits for wave 2 (`codebase_status` green).
- PASS: `git diff --check -- skills/orchestra/SKILL.md skills/orchestra/references/task-packet-format.md orchestra`
- PASS: targeted `rg` audit for `Token-Efficient Reading Discipline`, `SocratiCode Discovery`, `Token Budget Guardrails`, `codebase_status` before shell exploration, and Task Packet `Resolution shortcut`.
- PASS: `bash skills/audit-skills.sh` (skill structure/sync plus deep-implement 135 tests, deep-project 166 tests, deep-plan 327 tests).
- PASS: SocratiCode active preflight before shell edits for wave 3 (`codebase_status` green).
- PASS: active installed skill copies match repo mirrors for deep-project, deep-plan, and deep-implement.
- PASS: `git diff --check -- skills/deep-project/skills/deep-project/SKILL.md skills/deep-plan/skills/deep-plan/SKILL.md skills/deep-implement/skills/deep-implement/SKILL.md orchestra/progress.md`
- PASS: targeted `rg` audit for deep skill `SocratiCode Discovery`, mandatory `codebase_status`, `codebase_impact`, fallback logging, and token guardrails.
- PASS: `bash skills/audit-skills.sh` (skill structure/sync plus deep-implement 135 tests, deep-project 166 tests, deep-plan 327 tests).
- PASS: SocratiCode active preflight before shell edits for wave 4 (`codebase_status` green).
- PASS: active installed skill copies match repo mirrors for Orchestra/sub-agents impact-flow files.
- PASS: `git diff --check -- skills/orchestra/SKILL.md skills/orchestra/references/wave-planning.md skills/orchestra/references/task-packet-format.md skills/orchestra/references/sub-agent-dispatch.md skills/orchestra/references/result-integration.md skills/sub-agents/contracts/task-packet.schema.md skills/sub-agents/README.md skills/sub-agents/references/shared-operational-discipline.md`
- PASS: targeted `rg` audit for `Impact & Option Preflight`, `Impact Closure`, `shared-operational-discipline`, `Impact preflight`, `codebase_impact`, `least-impact`, `blocker/options`, and `Impact Boundary`.
- PASS: `bash skills/audit-skills.sh` (skill structure/sync plus deep-implement 135 tests, deep-project 166 tests, deep-plan 327 tests).
