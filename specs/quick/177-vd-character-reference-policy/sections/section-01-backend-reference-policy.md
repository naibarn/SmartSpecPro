# Section 01 — Backend reference policy

## Ownership

Own the backend contract and reference resolution. Do not change UI behavior here except through the public input contract.

## Target files

- `apps/web/server/routers/verticalDramaCharacters.ts`
- related router/service tests

## Requirements

- Add a validated policy with `none` and `auto`; explicit `referenceAssetLinkId` remains highest precedence.
- Main portrait default is no-reference; look/variant callers can request auto.
- `none` must not call own or fallback primary lookup and must produce no provider reference URLs.
- Explicit assets must be ownership-checked and used exactly; invalid scope fails before paid work.
- Keep sheet/angle/shared resolver behavior compatible unless the call explicitly opts into main no-reference.

## TDD

Write resolver and provider-payload tests before implementation. Cover none, explicit own/history, invalid scope, auto own, auto inherited, and model selection.

## Acceptance checks

- No silent fallback from main `none` to current primary.
- Explicit user reference survives policy handling.
- Existing DNA/setup and prompt fallback tests remain green.

## Risks

Shared resolver is used by sheet generation; avoid changing sheet default accidentally. Preserve existing source classification (`explicit`, `own`, `inherited`).

## Implemented

- Added `none`/`auto` policy to the shared portrait resolver.
- `generateCharacterImage` defaults to `none`; explicit asset ids still take precedence.
- `generateCharacterSheet` and angle-pack nested image calls keep `auto` behavior.
