# Chat image upload and Skill attachment repair

## Scope

Repair the Chat image path after the Media Studio storage authorization fix:

- show actionable failures for the main Chat upload control;
- load Chat attachment previews through the authenticated media boundary;
- resolve tenant-managed image URLs to signed broker URLs before any external
  LLM/provider submission, including Unified Skill execution.

Chat Skill's existing `useImageUpload` validation/retry behavior remains the
source of truth; this change only closes the shared storage/provider and Chat
preview gaps.

## Design

The browser keeps storing the managed URL returned by `ai.upload`. The main
Chat upload handler catches file-reader and mutation failures, validates that a
URL was returned, and reports the file name plus the next action through the
existing toast surface.

Chat attachment thumbnails and message image thumbnails use
`AuthenticatedMediaImage`, preserving external/data URLs while fetching
managed paths with session credentials and an explicit fallback state.

Before provider submission, server code calls the existing
`resolveExternalMediaReferenceUrls` with the authenticated tenant/user and
public app URL. Managed `/api/storage/files/*` and `/uploads/*` references are
converted to short-lived signed broker URLs; public provider URLs remain
unchanged. This is applied to the direct Chat LLM stream and Unified Skill
context construction.

## Failure and security boundaries

- Missing upload URL is treated as an upload failure.
- Managed references fail closed when tenant identity or public URL is absent.
- The browser never receives or sends a storage credential to an external
  provider.
- No schema or durable media migration is required.

## Verification

- Chat Skill/upload and attachment helper tests.
- Focused provider URL/context tests.
- esbuild transforms for ChatView, ChatDynamicSkillForm, Chat server routes,
  and context builder.
- `git diff --check` and local health check.
