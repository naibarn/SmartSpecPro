# Chat transcript load failure recovery

Date: 2026-10-29 (Asia/Bangkok)

Integrated source SHA: `04f4533b3757068ed7c8977296b4ec023a918ecd`.

## Change

When the authorized `chat.getMessages` read fails, Chat now shows a localized,
retryable error instead of presenting an empty-conversation welcome state. A
failed read does not clear messages already held in the current view. The error
message tells the user that saved messages were not removed; retry invokes the
same query and does not create a conversation, Run, or Job.

## Verification

- Focused Vitest regressions: **48 passed across 4 files** covering Chat
  navigation, Chat execution activity, Task Control and Mission Control views.
- Authenticated local UAT: **1 passed**. The test forces the transcript read to
  return HTTP 500, verifies the error and retry control, confirms the empty-chat
  welcome state is suppressed, then retries and observes another transcript
  read. It creates no development work.
- English and Thai locale JSON parsed successfully; `git diff --check` passed.
- Canonical integration: `04f4533b3757068ed7c8977296b4ec023a918ecd` is reachable
  from `origin/main` and local `main` matches the remote tip.

## Limits

This closes the silent blank-state/retry UI gap. It does not identify or repair
the underlying cause of the hosted `chat.getMessages` HTTP 500, and local UAT is
not evidence of the hosted serving revision. Hosted runtime correlation remains
open.
