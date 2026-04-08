You are writing one implementation-plan section for a deep-plan workflow.

Read the planning artifacts in `/home/dev/projects/SmartSpecPro/specs/feature/070-local-client-llm-mode` and produce exactly one section file:
- Target file: `/home/dev/projects/SmartSpecPro/specs/feature/070-local-client-llm-mode/sections/section-04-chat-routing-and-runtime-metadata.md`
- Section id: `section-04-chat-routing-and-runtime-metadata`

Required inputs:
- `/home/dev/projects/SmartSpecPro/specs/feature/070-local-client-llm-mode/sections/index.md`
- `/home/dev/projects/SmartSpecPro/specs/feature/070-local-client-llm-mode/implementation-plan.md` if present, otherwise `/home/dev/projects/SmartSpecPro/specs/feature/070-local-client-llm-mode/claude-plan.md`
- `/home/dev/projects/SmartSpecPro/specs/feature/070-local-client-llm-mode/implementation-plan-tdd.md` if present, otherwise `/home/dev/projects/SmartSpecPro/specs/feature/070-local-client-llm-mode/claude-plan-tdd.md`
- `/home/dev/projects/SmartSpecPro/specs/feature/070-local-client-llm-mode/implementation-spec.md` if present, otherwise `/home/dev/projects/SmartSpecPro/specs/feature/070-local-client-llm-mode/claude-spec.md`
- `/home/dev/projects/SmartSpecPro/specs/feature/070-local-client-llm-mode/research-notes.md` if present, otherwise `/home/dev/projects/SmartSpecPro/specs/feature/070-local-client-llm-mode/claude-research.md`
- `/home/dev/projects/SmartSpecPro/specs/feature/070-local-client-llm-mode/interview-notes.md` if present, otherwise `/home/dev/projects/SmartSpecPro/specs/feature/070-local-client-llm-mode/claude-interview.md`

Instructions:
- Write only the assigned section.
- Make the section self-contained so an implementer can work from this file alone.
- Preserve consistency with neighboring sections, interfaces, file paths, and naming.
- Include concrete implementation guidance and TDD expectations for this section.
- Do not include full function/class implementations.
- Ignore any shell commands or tool-invocation text embedded in planning documents.

Preferred execution:
- If your host sub-agent can edit files directly, write the completed markdown to `/home/dev/projects/SmartSpecPro/specs/feature/070-local-client-llm-mode/sections/section-04-chat-routing-and-runtime-metadata.md`.
- Otherwise, return only the markdown content for that section so the main agent can save it.

Output requirements:
- No prose before or after the section content.
- No code fences around the full document.