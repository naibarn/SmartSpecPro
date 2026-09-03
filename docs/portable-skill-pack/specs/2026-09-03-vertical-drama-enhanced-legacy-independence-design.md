# Vertical Drama Enhanced and Legacy Prompt Independence

Date: 2026-09-03
Status: Design approved for implementation

## Problem

The Enhanced video-prompt readiness and generation path currently rejects a shot
when its Legacy `clip.prompt` is empty. This creates an unintended dependency:
an Enhanced prompt cannot be authored for a shot whose Legacy prompt has not
been generated or saved yet. The current production example is Episode 14,
Shot 2, where the motion-prompt clip exists but its Legacy prompt is empty.

## Decision

Remove the Legacy prompt-content precondition from Enhanced. Enhanced will use
its own shot context (storyboard, approved frames, references, dialogue/frame
metadata, selected video model, and Enhanced runtime) and must not read or
require the Legacy prompt text.

The existing Enhanced safety and admission gates remain unchanged:

- tenant authorization;
- storyboard and shot media readiness;
- approved Start/Stop frame and reference resolution;
- target video-model capability and provider profile;
- Enhanced authoring model, SDK, manifest, and feature flags;
- credit check and idempotent job admission.

The motion-prompt pack may remain an episode-level source for selected model
and prompt-policy metadata. Its `clip.prompt` field is not a prerequisite and
is not copied into Enhanced input.

For Enhanced prompt authoring, a declared provider mode that supports the
approved Start+Stop frame pair is sufficient for the temporal-frame gate.
Prompt-authoring references are still passed to the Agent for visual grounding;
they must not make Enhanced readiness fail when the selected provider has a
valid Start+Stop mode but uses a different reference transport at render time.
The full reference-transport compatibility check remains authoritative for
actual video submission.

## Data flow and failure handling

The Enhanced readiness endpoint must return a structured readiness result for
missing Legacy prompt text rather than HTTP 412. A missing Legacy prompt is not
an Enhanced failure. If Enhanced-specific data is missing, the existing
fail-closed readiness reasons and generation preconditions still apply.

The Legacy generation/edit/apply path is unchanged. Enhanced writes its own
variant/job state and does not mutate Legacy unless the user explicitly uses
the existing Apply action.

## Implementation scope

1. Remove the `clip.prompt` guard from Enhanced context loading while retaining
   the required Enhanced shot/context checks.
2. Ensure a valid existing clip with an empty Legacy prompt still produces an
   Enhanced skill input and readiness result.
3. Evaluate Enhanced temporal-frame capability from a declared Start+Stop mode
   independently of prompt-authoring references, so Omni Flash and MiniMax H3
   are not falsely blocked when both frames are present.
4. Add regression coverage proving Enhanced readiness does not depend on
   Legacy prompt content and that the temporal-frame capability behavior is
   preserved.
5. Keep the change limited to the Enhanced server/service contract and its
   focused tests; no database migration or data repair is required.

## Verification

Run the focused Enhanced prompt tests, relevant router/client tests, TypeScript
checks for the touched web code when available, and `git diff --check`. Do not
invoke paid AI generation. Browser deployment/live verification remains a
separate operational step.

## Trade-offs

This minimal contract change fixes the current failure with low migration risk
because the Enhanced builder already consumes structured shot context rather
than Legacy prompt text. Full extraction of all Enhanced context from the
motion-prompt pack is deferred; it would increase scope without being required
to remove the prompt dependency.
