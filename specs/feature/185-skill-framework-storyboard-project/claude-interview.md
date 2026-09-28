# Deep-plan interview transcript — Feature 185

## Interview outcome

No blocking business question remains. The user explicitly requested autonomous completion of deep-plan, deep-implement, and post-implementation gap repair. The supplied Feature 185 spec already contains the needed product decisions, so no additional pause was required.

## Q1. What is the v1 storyboard length and timing contract?

**Answer/resolution from the supplied spec:** The user selects 2–12 shots, default 9. Every shot is fixed at 10 seconds in v1, with total duration `totalShots * 10`. The implementation must reject values outside 2–12 and any non-10 shot duration on the server.

## Q2. How should characters move between Skill Storyboard and Drama Series?

**Answer/resolution from the supplied spec:** Use a shared canonical Character Library with immutable revisions and explicit snapshot bindings. Drama and Storyboard keep their existing owner boundaries. Publish/import/sync are explicit actions; they never silently mutate the source, duplicate binary assets, or spend generation credits. The Characters tab must have Drama parity, while skill-specific prompt generation is selected through the character's skill adapter.

## Q3. What is the generation and approval boundary?

**Answer/resolution from the supplied spec:** The orchestrator plans the selected number of shots, calls the selected character skill in `prompt_only` mode per shot, preserves the entire canonical `generation_request`, sends it to the Image Core, then creates one video prompt per generated image. v1 does not auto-submit video generation. There is one job-level credit confirmation before paid image calls; retries are explicit and limited to failed stages.

## Auto-decisions

- Use the existing React/TypeScript/tRPC/Drizzle/Vitest/Playwright conventions discovered in the repository.
- Use a new project parent and durable run/shot records instead of overloading legacy review JSON or making Drama's `seriesId` nullable.
- Use a file-based deep-plan session because no Claude task-list backend/session ID is available.
- Use targeted shell research because SocratiCode `codebase_*` tools are not exposed in this runtime.
- Use mocked provider/media boundaries in CI; reserve authenticated browser, real provider, billing, migration, and deployment checks for environment-specific gates.
- Preserve all unrelated dirty worktree changes and do not commit unless explicitly requested.
