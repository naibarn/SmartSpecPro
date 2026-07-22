# Vertical Drama Separate Image and Video Prompt Languages

Date: 2026-07-22  
Status: Spec reviewed; awaiting implementation approval  
Scope: Vertical Drama sub-episode prompt-language settings

## Problem

Vertical Drama currently persists one `motionPromptPack.promptLanguage` value
and sends it to both image/start-frame prompt generators and video-motion
prompt generators. A Thai synopsis therefore forces an undesirable choice:
keep Thai for story-faithful image generation or switch to English for stronger
video-motion instruction following.

The two media types need independent language settings. Policy-safe synopsis
mode must continue preserving the synopsis's original language exactly.

## Decision

Separate the settings according to the artifact that owns them:

- `startFramePlan.imagePromptLanguage?: VerticalDramaPromptLanguage` owns the
  selected language for image/start-frame prompt generation.
- `motionPromptPack.promptLanguage?: VerticalDramaPromptLanguage` remains the
  video-motion prompt language. Its stored field name remains unchanged for
  backward compatibility, but UI copy calls it “video prompt language.”
- `motionPromptPack.dialogueLanguage` and `thaiAccent` remain unchanged.
- No database migration is required because both plans are existing JSONB
  payloads.

## Effective-language Rules

### Image prompts

1. When the resolved image-prompt mode is `policy_safe_rewrite`, ignore any
   selected image language and preserve the authoritative synopsis language.
   Do not translate it.
2. For `cinematic_narrative`, legacy image prompt generation, batch start-frame
   planning, and supplementary reference-frame prompts, resolve:

   ```text
   startFramePlan.imagePromptLanguage
   ?? motionPromptPack.promptLanguage
   ?? "en"
   ```

   The middle fallback exists only for episodes created before this feature.
3. Once `imagePromptLanguage` has been persisted, image generation must never
   read a newly changed video language as its effective setting.

### Video prompts

Video-motion prompt generation continues resolving:

```text
motionPromptPack.promptLanguage ?? "en"
```

It must never read `startFramePlan.imagePromptLanguage`.

### Existing-episode compatibility

When an existing episode has no `startFramePlan.imagePromptLanguage` and the
user changes `motionPromptPack.promptLanguage`, the server must atomically
snapshot the image language that was effective before the change:

```text
old motionPromptPack.promptLanguage ?? "en"
```

into `startFramePlan.imagePromptLanguage`, then save the new video language.
This prevents changing video prompts from silently changing future image
prompts. If no start-frame plan exists, create the same minimal plan shape used
by the existing image-mode setter.

## API and Contract Changes

### Shared contract

Add optional `imagePromptLanguage` to `VerticalDramaStartFramePlan`. Update the
language documentation so `VerticalDramaPromptLanguage` is a reusable language
code rather than a shared image/video setting.

### Server mutations

- Add `setEpisodeImagePromptLanguage`, following the existing free JSONB-patch
  convention used by `setEpisodeImagePromptMode`.
- Keep `setEpisodeVideoPromptLanguage` for video prompt language, dialogue
  language, and Thai accent.
- Extend its prompt-language branch with the compatibility snapshot described
  above. Ownership and tenant filters remain unchanged.
- Both setters must lock and freshly re-read the episode row inside a
  transaction before merging JSONB. They must update only the relevant
  plan-level language fields and preserve concurrent frame/clip changes.
- Neither mutation triggers generation or consumes credits.

### Generator routing

Introduce one server-side effective-image-language resolver and use it in all
image prompt paths:

- whole-episode start-frame render-plan generation;
- single-shot start-frame prompt generation;
- supplementary reference-frame prompt generation.

All video-motion prompt paths continue consuming only
`motionPromptPack.promptLanguage`.

The deterministic `policy_safe_rewrite` branch does not receive a translation
instruction and remains source-language locked.

Every projection, regeneration, repair, and minimal-plan constructor that
rewrites `startFramePlan` must preserve `imagePromptLanguage`, just as it must
preserve `imagePromptMode` and the selected image model. Whole-plan generation
must not silently erase the user's language choice.

## UI/UX Contract

### Target User / JTBD

- Role: Vertical Drama creator.
- Goal: Generate story-faithful Thai images and higher-performing English video
  motion prompts in the same sub-episode.
- Entry point: model and prompt settings row in the episode storyboard panel.
- Success outcome: image and video prompt languages can be understood and
  changed independently without affecting already generated assets.

### Existing Pattern Reference

- Searched: existing `LanguageSelect` usage in
  `VerticalDramaStoryboardPanel.tsx` and prop wiring through
  `VerticalDramaEpisodeWorkspace.tsx` / `VerticalDramaEpisodePage.tsx`.
- Found pattern: the existing prompt-language and dialogue-language selectors.
- Decision: reuse the existing `LanguageSelect`; do not introduce a new visual
  control.

### Surface Inventory

| Surface | Change |
|---|---|
| Episode storyboard settings row | Replace the ambiguous prompt-language label with separate image and video prompt language controls |
| Option 1 image mode | Show a disabled/read-only “follow synopsis language” value |
| Option 2 image mode | Enable the normal image-language selector |

### Component Map

| Component | Responsibility |
|---|---|
| `VerticalDramaEpisodePage` | Read effective values and call the appropriate mutations |
| `VerticalDramaEpisodeWorkspace` | Forward separate image/video language props |
| `VerticalDramaStoryboardPanel` | Render two clearly labeled controls and the Option 1 locked state |
| `verticalDramaWorkspaceCopy` | Thai and English labels/help copy |

### State Matrix

| State | Expected behavior |
|---|---|
| Option 1 selected/resolved | Image language reads “Follow synopsis language (automatic)” and cannot be changed |
| Option 2 selected/resolved | Image language dropdown is enabled |
| Saving | Existing mutation pending behavior applies; generated prompts are not changed retroactively |
| Save error | Existing toast displays the server error; prior stored value remains |
| Video language change on legacy episode | Image language is snapshotted before the video value changes |

### Responsive Matrix

The controls reuse the current wrapping settings-row behavior at mobile,
tablet, laptop, and desktop widths. No new fixed widths or breakpoint behavior
is introduced. Browser verification must confirm that both labels remain
distinguishable at 390x844, 768x1024, and 1440x900.

### Accessibility Acceptance

- Both controls have distinct accessible labels.
- The Option 1 image-language control exposes its disabled/read-only state.
- Extend the existing `LanguageSelect` with a real `disabled` prop; do not
  simulate disabled behavior only by omitting a callback.
- Existing keyboard and focus behavior of `LanguageSelect` is preserved.
- The explanation does not rely on color alone.

### Copy Contract

Thai:

- `ภาษาพรอมต์ภาพ`
- `ตามภาษาเรื่องย่อ (อัตโนมัติ)`
- `ภาษาพรอมต์วิดีโอ`

English:

- `Image prompt language`
- `Follow synopsis language (automatic)`
- `Video prompt language`

Existing dialogue-language and Thai-accent copy remains unchanged.

### Browser Evidence Required

Verify the settings row at mobile 390x844, tablet 768x1024, and desktop
1440x900 for both Option 1 and Option 2 states.

## Failure Handling

- Missing/corrupt optional language fields fall back according to the rules
  above; they do not block generation.
- The server validates all explicit languages with
  `VERTICAL_DRAMA_PROMPT_LANGUAGES`.
- Failed compatibility snapshot writes fail the entire language-setting
  mutation. Never save a new video language while leaving an unsnapshotted
  image language that would change implicitly.
- Existing generated image/video prompts and assets are not rewritten.

## Testing Strategy

1. Shared-contract/type tests cover the new optional field.
2. Router tests cover image-language persistence, minimal-plan creation, and
   atomic legacy snapshot behavior, including preservation of concurrent frame
   data from the locked fresh row.
3. Pipeline/router service tests prove every image path receives the effective
   image language.
4. Video tests prove video paths continue receiving only
   `motionPromptPack.promptLanguage`.
5. Option 1 regression tests prove the source synopsis language is preserved
   and no prompt-language translation directive is added.
6. Component tests verify distinct labels, independent callbacks, and the
   disabled Option 1 state.
7. Projection/regeneration tests prove `imagePromptLanguage` survives a full
   start-frame plan refresh.
8. Targeted TypeScript typecheck and browser-responsive verification complete
   the implementation gate.

## Security, Scale, and Operations

- No authorization surface changes; existing tenant/user ownership filters are
  reused.
- No additional service, dependency, credit charge, or external API call.
- JSONB updates remain per episode and do not change query scale.
- No data backfill is required; lazy compatibility snapshotting avoids a broad
  production rewrite.

## Non-goals

- Translating Option 1 policy-safe synopses.
- Rewriting prompts or regenerating media when a setting changes.
- Changing dialogue language, Thai accent behavior, model routing, or the two
  image-prompt mode definitions.
