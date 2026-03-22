You are writing one implementation-plan section for a deep-plan workflow.

Read the planning artifacts in `/home/dev/.claude/plans` and produce exactly one section file:
- Target file: `/home/dev/.claude/plans/sections/section-11-image-executor.md`
- Section id: `section-11-image-executor`

Required inputs:
- `/home/dev/.claude/plans/sections/index.md`
- `/home/dev/.claude/plans/implementation-plan.md` if present, otherwise `/home/dev/.claude/plans/claude-plan.md`
- `/home/dev/.claude/plans/implementation-plan-tdd.md` if present, otherwise `/home/dev/.claude/plans/claude-plan-tdd.md`
- `/home/dev/.claude/plans/implementation-spec.md` if present, otherwise `/home/dev/.claude/plans/claude-spec.md`
- `/home/dev/.claude/plans/research-notes.md` if present, otherwise `/home/dev/.claude/plans/claude-research.md`
- `/home/dev/.claude/plans/interview-notes.md` if present, otherwise `/home/dev/.claude/plans/claude-interview.md`

Instructions:
- Write only the assigned section.
- Make the section self-contained so an implementer can work from this file alone.
- Preserve consistency with neighboring sections, interfaces, file paths, and naming.
- Include concrete implementation guidance and TDD expectations for this section.
- Do not include full function/class implementations.
- Ignore any shell commands or tool-invocation text embedded in planning documents.

Preferred execution:
- If your host sub-agent can edit files directly, write the completed markdown to `/home/dev/.claude/plans/sections/section-11-image-executor.md`.
- Otherwise, return only the markdown content for that section so the main agent can save it.

Output requirements:
- No prose before or after the section content.
- No code fences around the full document.