# Section 09 — Sidebar footer, language and Astryx themes

## Objective

Keep the signed-in account controls at the bottom of the expanded Chat sidebar, put the language selector directly above them, and provide a working selector for every theme supported by the installed Astryx release.

## Requirements

- The user avatar/name, profile/settings action and sign-out action remain pinned to the bottom edge of the expanded left panel while navigation or history content scrolls.
- The Thai/English control appears immediately above the account row and reads/writes the existing `smartaihub.locale` preference.
- The theme control remains reachable in the Chat surface and lists Neutral, Butter, Chocolate, Gothic, Matcha, Stone and Y2K.
- Choosing a theme applies its actual Astryx design tokens/styles immediately and preserves the choice across reloads. Neutral is the default; Gothic uses dark mode.
- Astryx theme packages and CSS are owned by the independent Chat module and remain compatible with the installed Astryx Core release.
- No auth, tenant, queue, provider, credit, host runtime, or deployment-target behavior changes.

## Owned paths

- `smartaihub-platform/modules/chat/package.json`
- `smartaihub-platform/pnpm-lock.yaml`
- `smartaihub-platform/modules/chat/src/astryx-themes.ts`
- `smartaihub-platform/modules/chat/src/ui/ChatWorkspace.tsx`
- `smartaihub-platform/modules/chat/src/ui/main.tsx`
- `smartaihub-platform/modules/chat/src/ui/styles.css`
- Focused Chat UI tests
- This section, `sections/index.md`, SPEC-312 R1.12 and canonical handoff evidence.

## Verification

- Focused Chat tests cover footer order, language persistence, all seven theme choices changing Astryx theme attributes, and theme persistence.
- `pnpm --filter @smartaihub/chat typecheck` and `pnpm --filter @smartaihub/chat build` pass.
- The exact integrated source SHA is released only to `modular-debian-dev` and its receipt/public smoke are recorded.
- Authenticated visual/interaction review at desktop, tablet and mobile remains an acceptance item until performed against the deployed exact SHA.

## Completion and handoff

Record exact source SHA, focused checks, deployment receipt and public smoke in SPEC-312's canonical handoff. Keep authenticated responsive browser review open unless supported by actual evidence. Do not mark parent SPEC-312 complete from this section.
