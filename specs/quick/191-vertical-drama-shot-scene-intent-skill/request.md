# Request

Add a skill-first Vertical Drama semantic interpreter so shot generation does not
mistake a mentioned character for a visible character. It must read the current
shot and bounded preceding context, classify physical presence, caller/off-screen
speech, barrier/separate-location communication, video calls, text messages, and
mentioned-only references, then feed a validated contract into image prompting.

## Assumptions

- User approved automatic application when no manual cast selection exists.
- Existing `characterRefsCustomized` remains authoritative.
- Existing `screen_caller_refs`, `dual_view`, supporting-presence, and start-frame
  contracts are reused.
- This pass is paid in production but all local tests mock the LLM and provider.

## Non-goals

- No synopsis rewrite, media regeneration, deployment, `.env` edit, or migration.
