# Decision Log - Feature 095 Work OS Automation Fabric

## Decisions

1. **Work OS is the canonical orchestration plane.**
   - It owns the case identity, run state, checkpoints, approvals, exceptions, SLA visibility, and final outcome.

2. **No second workflow engine.**
   - The fabric is an orchestration layer that composes the existing systems instead of replacing them.

3. **Three modes are first-class.**
   - Manual assist, semi-auto, and fully auto with approval gates are supported on the same case.

4. **Agency Swarm handles open-ended work.**
   - Research, planning, critique, and branch exploration should happen there.

5. **Skills handle deterministic execution.**
   - Reusable bounded steps should route through the skill registry and unified orchestrator.

6. **Automation Copilot is an adapter, not the brain.**
   - It is reserved for browser/external automation steps that require its policy and credit gates.

7. **Document Management stores intermediate content.**
   - Briefs, drafts, prompts, and storyboard artifacts belong there, not in Work OS itself.

8. **Media Studio and Video Editor stay specialized.**
   - They remain the execution surfaces for media generation and video composition.

9. **Edits must be resumable.**
   - Checkpoints are versioned and the run can resume from the last safe state.

10. **Rollout is staged.**
    - Begin with additive state and compatibility-first behavior, then expand automation modes and adapters.

11. **The first release proves one content-production workflow.**
    - Use a content-heavy path with research, drafting, media generation, review, and export before generalizing to other case families.

12. **Safety is policy-driven, not inferred.**
    - High-risk, publish, external side-effect, and destructive steps require explicit gates or a manual-assist fallback.
