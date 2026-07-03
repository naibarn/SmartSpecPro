# Interview Transcript: Feature 130 Hybrid Flow OpenAI Agents SDK Runtime

The user already provided the product direction through the conversation and explicitly asked to proceed without another blocking question.

## Captured Decisions

1. Hybrid Flow should move away from `agency-swarm` as the new product-grade runtime.
2. Hybrid Flow should use the existing OpenAI Agents SDK integration instead of expanding Agency workflow.
3. Chat-origin Hybrid must work independently from Agency.
4. OpenAI Agents SDK should be able to run independently when Chat invokes it.
5. Detection in Chat must become precise enough to avoid routing direct image/video/prompt-enhance tasks into Hybrid.
6. `create image:` and `create video:` are direct media/skill paths, not Hybrid paths.
7. `enhance prompt` / `edit prompt` should be direct prompt enhancement unless the user requests staged alternatives, critique, approval, or final commit.
8. OpenAI Agents SDK dependency should be upgraded to the latest stable version at implementation time, but pinned exactly and gated by compatibility tests.
9. The implementation plan should be product-grade and try to cut the old Agency dependency out of Chat-origin Hybrid.

## Non-Blocking Open Questions From Spec

These remain implementation-planning decisions, not blockers for deep-plan:

1. Whether the neutral workspace route remains `/hybrid` or later nests under Work OS.
2. Whether new durable tables are required or existing Work OS/agent runtime tables can carry the same read model.
3. Which first commit executor ships: safe skill execution, media preview, or library save.
4. How Agency-origin Hybrid branding should appear while using the neutral runtime.
5. The first manually reviewed quality benchmark for "Hybrid improves output".
6. Whether ambiguous Hybrid routing asks inline or uses a compact decision card.

## Planning Assumptions

- Use `/hybrid/preview` and `/hybrid/:executionId` as the first neutral route.
- Create new Hybrid-specific durable tables unless implementation discovery proves existing tables can satisfy the same read/resume/audit requirements with less risk.
- First commit executor should be safe and non-publishing: media prompt preview or selected direct skill execution.
- Agency-origin compatibility should preserve old links while internally redirecting/wrapping neutral runtime.
- All destructive or external-write commit executors remain out of the first slice.

