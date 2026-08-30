# Section 03 — Generation lineage and verification

## Ownership boundaries

Own persistence of DNA revision lineage in prompt/visual-bible generation and
the end-to-end verification needed to prove the Character-tab edit affects the
next explicit generation. Do not make save automatically call generation.

## Target files

- `apps/web/server/services/verticalDramaCharacterImageGeneration.ts`
- `apps/web/server/routers/verticalDramaCharacters.ts` generation persistence
  blocks
- related prompt/DNA tests

## Implementation requirements

- Read the current identity revision when generating a prompt/visual bible.
- Persist `promptDnaRevision` equal to the revision used.
- Preserve the edited approved identity through existing canonical DNA pinning
  and normalization.
- Treat `designDna.ageRange` and `designDna.faceIdentity` as authoritative over
  older derived summary/anchor strings; mark those derived views stale until
  the explicit generation refreshes them.
- Expose enough authorized status for the Character tab to compare current and
  prompt revisions without exposing private asset IDs.
- Keep existing portraits and candidates; expose stale status rather than
  deleting or replacing them.

## TDD expectations

Test that an edited age wins over approved DNA/role inference, that generated
snapshots record the revision used, and that legacy snapshots without revision
metadata remain renderable. Test that the DNA save path does not invoke any
generation or billing function.

## Acceptance checks

- After changing age to `20`, explicit prompt generation uses apparent age 20.
- The Character tab shows the old prompt/portrait as potentially stale until a
  generation uses the current revision.
- Existing prompt preview, candidate, and portrait selection flows remain
  compatible.

## UI/UX Contract

### Target User / JTBD

The creator must understand whether the visible prompt/portrait reflects the
current DNA revision and must explicitly choose when to regenerate.

### Surface Inventory

- Character-tab DNA revision and stale status.
- Existing prompt/image generation actions and their separate network requests.

### Component Map

- Server-side revision metadata on the visual-bible DTO.
- Character-tab stale badge/warning and explicit generation action.

### State Matrix

| State | Display |
| --- | --- |
| revisions match | Current prompt/portrait |
| current revision is newer | Potentially stale warning |
| legacy revision missing | Compatible/unknown status, never false certainty |
| explicit generation complete | Prompt revision equals current DNA revision |

### Responsive Matrix

Stale status must remain readable beside or above portrait/prompt controls on
desktop and stack above them on narrow screens.

### Accessibility Acceptance

Stale status must include text and an accessible label; color alone is not a
valid indicator.

### Copy Contract

Use localized copy distinguishing `DNA changed`, `prompt/portrait may be
stale`, and `generate explicitly`; never imply that save generated an image.

### Browser Evidence Required

Use Network inspection to prove save and explicit generation are separate
requests, then verify the generated prompt carries the edited age.

## Browser and workspace verification

- Run focused shared, server, and Character-tab tests.
- Run the affected `apps/web` test bundle.
- Use browser Network inspection for the Character-tab flow: save must show
  only the DNA mutation; explicit generation must be a separate later request.
- Do not perform production generation, deployment, or migration in this wave.

## Implementation status

Implemented in `verticalDramaCharacterDnaPersistence.ts` and the prompt payload
builder. Generated visual-bible persistence preserves the identity revision,
marks the prompt revision, and edited prompts no longer carry a stale approved
DNA snapshot. Focused lineage, router, persistence, and Character-tab tests
pass. Browser Network and provider-generation proof remain pending because no
browser session was run in this workspace turn.
