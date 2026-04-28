# Request

Stabilize the Work Request -> Auto Team automation flow so it is complete enough to stop the repeated audit/fix loop and ship with confidence.

The user-facing target flow is:

1. User types what they want.
2. User reviews the request.
3. User presses Start.
4. Work OS creates or reuses the right request/case.
5. Work OS opens a linked Team room/run.
6. Auto Team plans the work.
7. Auto Team executes each plan step through the best available capability: skill, document management, media studio, video editor, Agency Swarm, native/OpenAI Agents runtime, or safe skill-creation fallback.
8. Each step has plan/do/check semantics with evidence.
9. Failed checks loop into repair when safe.
10. Async media/video jobs wait and resume automatically.
11. Final review validates the result against the original objective.
12. Safe personal fully-auto work completes without unnecessary human approval.

## Stabilization Goal

This pass is a **freeze + completion** pass. It must not introduce new product scope unless required to fix a blocker or safety defect in the target flow.

## Assumptions

- Existing broad changes in the working tree are intentional prior work and must not be reverted.
- This plan focuses on Work Request / Auto Team completion, not unrelated LLM provider or skill documentation changes.
- Fully-auto can bypass default privileged-surface approval only when the step is not explicitly marked as requiring human approval.
- Security boundaries remain mandatory: tenant isolation, user-bound media tokens, budget caps, bounded retries, and no public skill publishing as fallback.

## Non-goals

- No new major runtime architecture.
- No new UI redesign beyond what is required to verify the flow.
- No destructive migration cleanup.
- No attempt to make every unrelated test in the repository green if failures are clearly outside this flow.
