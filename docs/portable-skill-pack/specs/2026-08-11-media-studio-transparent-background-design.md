# Media Studio Native Transparent Background

## Goal

Allow Media Studio users to request a real transparent-background image with one
checkbox, while only exposing the control for image models whose provider contract
explicitly declares native support. The request must remain fail-closed when a model
does not declare that capability.

## Evidence and scope

- Media Studio already receives per-model `configJson`, renders model-specific
  boolean inputs, and sends `extraParams` through the async image route.
- Kie's GPT Image 2 image-to-image documentation lists `background` values including
  `transparent`; the Kie route is the scope of the current GPT Image 2 catalog entry.
- Google’s official Nano Banana image-generation guide documents image generation but
  does not document an alpha/transparent-background output control. Nano Banana stays
  disabled until a provider contract is verified.
- Native alpha only: adding the word “transparent” to a prompt or chroma-key cleanup
  is explicitly out of scope.

## Design

### Configuration contract

Models opt in with:

```json
{
  "supportsTransparentBackground": true,
  "transparentBackground": {
    "inputKey": "background",
    "enabledValue": "transparent",
    "disabledValue": "auto",
    "outputFormat": "png"
  }
}
```

The nested values are provider-specific escape hatches for future models. Defaults
are `background`, `transparent`, `auto`, and `png`. Models without the explicit opt-in
do not show the control and server requests carrying `background=transparent` are
rejected.

### Data flow

1. Media Studio resolves the selected model capability from `configJson`.
2. If supported, it shows a labeled accessible switch in the existing model-input
   section. Off uses the provider's normal/auto background value; on sends the
   configured transparent value.
3. The common payload keeps the value in `extraParams`, preserving the existing
   async generation and retry path.
4. The tRPC image routes validate the capability before credit reservation or provider
   dispatch. Native transparency also forces the configured lossless output format.
5. Kie receives the configured provider field through the existing catalog-driven
   `extraParams` merge.

### UI/UX contract

#### Target user / JTBD

- Role: Media Studio image creator.
- Goal: create a cutout/asset without manually editing the background.
- Entry point: Media Studio image tab, selected model's model-input area.
- Success outcome: the generated asset is a true transparent PNG when the switch is on.

#### Existing pattern reference

- Found: `apps/web/client/src/pages/MediaStudio.tsx` dynamic boolean model inputs,
  which use the existing `Switch`, label, status text, and description patterns.
- Decision: reuse the same switch and semantic utility classes; add only the dedicated
  capability gate and explanatory copy.

#### Surface inventory and component map

| Surface | File | Change |
|---|---|---|
| Media Studio image controls | `client/src/pages/MediaStudio.tsx` | Render capability-gated switch and add its value to `extraParams`. |
| Shared capability contract | `shared/mediaModelCapabilities.ts` | Parse and normalize model config. |
| Image tRPC routes | `server/routers/media.ts` | Reject unsupported native transparency and normalize output format. |
| Kie model definitions | `server/services/modelRegistry.ts`, `scripts/seed-media-models-kie-ai.ts` | Opt GPT Image 2 Kie model in; leave Nano Banana disabled. |
| Existing DB rows | `drizzle/0221_media_transparent_background_capability.sql` | Idempotently backfill the live GPT Image 2 row. |

#### State matrix

| State | Expected UI |
|---|---|
| Unsupported model | Control absent; existing inputs unchanged. |
| Supported, off | Switch off; normal provider background behavior. |
| Supported, on | Switch on; helper text explains native alpha PNG. |
| Model change | Value resets to configured default and never leaks to an unsupported model. |
| Submission error | Existing generation error surface is used; server returns a clear capability error. |

#### Responsive and accessibility acceptance

- Mobile 390x844, tablet 768x1024, desktop 1440x900: the control stays in the
  existing single-column model-input flow without horizontal overflow.
- The switch has a visible label, helper text, keyboard focus, and a semantic checked
  state. No color-only meaning is used.
- No new animation is required; existing reduced-motion behavior remains unchanged.

#### Copy contract

- English label: `Transparent background`
- Thai label: `พื้นหลังโปร่งใส`
- Helper: `Native alpha output; PNG is used automatically.` /
  `สร้าง alpha จริงจาก model และบังคับเป็น PNG อัตโนมัติ`
- Server error: `The selected model does not support native transparent backgrounds.`

## Failure handling and trade-offs

- A config opt-in is conservative and may temporarily hide a capability until its
  provider docs are verified; this avoids claiming transparency for prompt-only or
  flattened outputs.
- Provider failures remain normal generation failures and are not converted into a
  post-processing fallback.
- No table-column migration is needed; the targeted JSON backfill updates only the
  known GPT Image 2 row and preserves unrelated model configuration.

## Verification

- Shared capability parser tests: supported/default/custom/unsupported cases.
- Media Studio payload tests: transparent value is preserved in `extraParams`.
- Server route/helper tests: supported requests normalize to PNG; unsupported requests
  fail before provider dispatch.
- Focused TypeScript/Vitest tests and `git diff --check`.
- Browser screenshot/E2E is not required for this small additive control unless an
  authenticated browser session is available; manual UI evidence remains a follow-up.
