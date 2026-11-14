# Section 09 — Sidebar footer, language and Astryx themes

## Objective

Keep the signed-in account controls at the bottom of the expanded Chat sidebar, put the language selector directly above them, provide a working selector for every theme supported by the installed Astryx release, and propagate the selected language across the full Chat and host-shell interface.

## Requirements

- The user avatar/name, profile/settings action and sign-out action remain pinned to the bottom edge of the expanded left panel while navigation or history content scrolls.
- The Thai/English control appears immediately above the account row and reads/writes the existing `smartaihub.locale` preference.
- Switching languages immediately updates all static customer-facing Chat copy, the host shell's Chat status/error copy, Astryx-generated labels, accessible names, the browser document language/title and locale-sensitive timestamps/numbers. User-provided names/content and model/provider identifiers remain unchanged.
- The theme control remains reachable in the Chat surface and lists Neutral, Butter, Chocolate, Gothic, Matcha, Stone and Y2K.
- Choosing a theme applies its actual Astryx design tokens/styles immediately and preserves the choice across reloads. Neutral is the default; Gothic uses dark mode.
- The theme option list uses the available viewport space. From the fixed lower-right desktop control it opens above the trigger, and flips to the opposite side when there is not enough room. All seven options remain visible and actionable without clipping.
- At mobile widths (at or below 48rem), toolbar controls wrap into compact rows, the model selector remains at natural height, example prompts use one column, and the theme selector moves into normal layout flow so it cannot cover the composer. The conversation starts near the top and scrolls independently; the composer/send action remain usable above safe-area insets. Tablet and desktop retain their established layout without horizontal overflow or overlap.
- Astryx theme packages and CSS are owned by the independent Chat module and remain compatible with the installed Astryx Core release.
- No auth, tenant, queue, provider, credit, host runtime, or deployment-target behavior changes.

## Owned paths

- `smartaihub-platform/modules/chat/package.json`
- `smartaihub-platform/pnpm-lock.yaml`
- `smartaihub-platform/modules/chat/src/astryx-themes.ts`
- `smartaihub-platform/modules/chat/src/ui/ChatWorkspace.tsx`
- `smartaihub-platform/modules/chat/src/ui/i18n.tsx`
- `smartaihub-platform/apps/saas-shell/src/App.tsx`
- `smartaihub-platform/apps/saas-shell/src/pages/ChatPage.tsx`
- `smartaihub-platform/apps/saas-shell/src/pages/StatusScreen.tsx`
- `smartaihub-platform/modules/chat/src/ui/main.tsx`
- `smartaihub-platform/modules/chat/src/ui/styles.css`
- Focused Chat UI tests
- This section, `sections/index.md`, SPEC-312 R1.12–R1.14 and canonical handoff evidence.

## Verification

- Existing focused UI coverage covers footer order, language persistence and all seven theme choices changing Astryx theme attributes; scoped Chat and shell typechecks/builds verify this locale propagation change, including Astryx-generated message and attachment labels.
- Authenticated visual/interaction review at desktop, tablet and mobile includes switching languages with Chat already open, checking all visible/accessibility copy and date/number formatting, checking persistence after reload, and verifying mobile toolbar wrapping, natural-height model selection, one-column prompts, independent conversation scrolling, safe-area composer reachability and non-overlapping theme control.
- Theme-menu review opens the menu from its lower-right desktop position and a compact layout, checks every option is visible/reachable, and resizes the viewport to confirm the menu flips instead of clipping.
- `pnpm --filter @smartaihub/chat typecheck`, `pnpm --filter @smartaihub/saas-shell typecheck`, `pnpm --filter @smartaihub/chat build` and `pnpm --filter @smartaihub/saas-shell build` pass.
- The exact integrated source SHA is released only to `modular-debian-dev` and its receipt/public smoke and served asset parity are recorded.
- Authenticated rendered visual/interaction review at desktop, tablet and mobile remains an acceptance item until performed against the deployed exact SHA; successful builds, health checks and asset parity do not close it.

The same rendered review must confirm the seven-option theme menu stays within the viewport and flips when required. The current menu code is deployed; until that interaction is visually confirmed, retain it as pending UAT.

## Completion and handoff

Record exact source SHA, focused checks, deployment receipt, public smoke and served asset parity in SPEC-312's canonical handoff. Keep authenticated responsive browser review open unless supported by actual evidence. Do not mark parent SPEC-312 complete from this section.
