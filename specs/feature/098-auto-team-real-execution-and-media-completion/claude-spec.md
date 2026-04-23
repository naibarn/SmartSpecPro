# Synthesized Specification: Feature 098 Auto-Team Real Execution and Media Completion

## Summary

Auto-team automation must become evidence-based execution rather than a chat-only loop. The system must classify each work request into an execution route, create durable stages, execute route-appropriate work, call media or agency systems when required, review actual outputs, and mirror progress back to Work OS and Team UI.

## Core Problem

Production traces show an `auto_team` room can generate many messages, choose a generic article-writing skill, reach `max_rounds_reached`, and appear active while producing no media job, artifact, review, or final result. For a media objective, this is a false completion.

## Required Behavior

1. Every auto-team run must create a persisted route decision before production execution.
2. The route decision must classify the objective as one of:
   - `media.video`
   - `media.image`
   - `agency.swarm`
   - `workflow.automation`
   - `research.synthesis`
   - `document.writing`
   - `unknown.blocked`
3. The selected skill must belong to the allowed family for the route.
4. Media objectives must never complete through article/document writing alone.
5. Every meaningful auto-team turn must bind to durable evidence such as a work item, plan step, job handle, artifact ref, review record, final result, or case ID.
6. Video requests must produce at minimum:
   - research or source summary artifact
   - storyboard or scene plan artifact
   - video prompt artifact
   - media job reference
   - terminal media job status
   - reviewer score/comment
   - final result link or failure explanation
7. Image requests must produce prompt artifact, media job reference/result, review, and final result.
8. Complex multi-agent work must delegate to Agency Swarm or a governed executor and persist its run/job handle.
9. Work OS, My Requests, and Team Room UI must show the same execution trail and never hide prior requests after assignment.
10. Users need clear stop/cancel controls and repeated-loop protection.
11. Room language must be selected at request/start time, default English, optional Thai, stored on the room, and enforced in LLM instructions.
12. Security controls must preserve tenant isolation, media URL safety, server-side auth token injection, rate limits, idempotency, and sanitized user-visible errors.
13. Guided/manual Team room sends must not be persist-only; they must be able to start or resume a `team_chat` run and emit a real assistant turn through the run engine.
14. Team prompt assembly must consume the shared context-pack contract defined by Feature 099, which supplies user entity memory, user rule memory, project continuity summaries, scoped assistant/run/room/team memories, and room language when available.
15. Feature 098 does not need to reimplement the shared context engine. It should wire execution into that contract so Team execution, media execution, and guided chat all receive the same contextual inputs where available.
16. This feature does not require complete storage-level unification with Chat conversations; parity is defined by prompt inputs, context packs, and durable behavior, not by forcing Team rooms onto the `conversationId` model.
17. Scoped-memory create/search/update/delete/promote endpoints must enforce actual room/team/project/run access, not tenant scope alone.

## Out of Scope

- Replacing the whole run engine.
- Replacing Media Studio or Agency Swarm.
- Making every provider synchronous.
- Bypassing budget, entitlement, tenant, approval, or safety policies.

## Architecture Direction

Use the existing run engine, work item service, unified orchestrator, media generation service, agency bridge, Work OS service, scoped memory services, and Team prompt composer. Add a canonical auto-team execution layer that records route decisions, stage transitions, media job refs, review records, and final results. The run engine should call this layer at deterministic boundaries, while guided Team rooms should consume the shared context pack contract from Feature 099 instead of inventing a separate conversation stack.

## Acceptance Summary

A request like "create a 24-30 second Songkran video using Veo 3.1" must:

- create a new auto-team room in the selected team
- start in the selected room language
- route to `media.video`
- reject article-only skills as primary execution
- create and display a stage plan
- generate durable research/storyboard/video prompt artifacts
- submit a media video job with an idempotency key
- poll or resume from the media job handle
- attach job/result references to the work item and room
- run reviewer scoring on actual artifacts/result
- either repair/replan or produce a final result
- keep the request visible in Work OS and My Requests throughout
- allow guided/manual Team rooms to continue the work with run-backed assistant turns that consume the shared context pack from Feature 099
