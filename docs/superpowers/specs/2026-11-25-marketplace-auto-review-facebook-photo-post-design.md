# Marketplace Auto Review Facebook Photo Post

## Intent

Extend the existing Marketplace Auto Review Facebook publishing panel to publish either a Facebook Reel or a Facebook Photo Post. Users can reuse the existing caption, hashtags, affiliate URL, Facebook Page connection, and one of the three already-generated social post images. The selected image is a single-photo post; this does not create a carousel.

## Goals

- Show Reel and Photo Post as two selectable formats in the existing publishing panel, following the provided mockup.
- Keep the panel collapsible/expandable and preserve current Reel behavior.
- In Photo Post mode, let the user select exactly one completed image variant: caption-source, character-reference, or product-reference.
- Preview the selected image and existing caption/hashtags before publishing.
- Reuse the existing Meta connection, Page access checks, affiliate/disclosure controls, `social_posts`, `worker_jobs` and outbox.
- Keep Photo Post and Reel publication intents, statuses, retries, and history distinguishable.
- Never start image or video generation as a side effect of publishing.

## Non-goals

- Multi-image carousel, scheduled publishing, or Auto Post.
- Native Facebook product tagging or a claim that affiliate links are clickable/attributed without live evidence.
- Public publishing against a real Page without explicit test-Page authorization.
- Redesigning Auto Review or replacing the existing Social Publishing system.

## Constraints

- Generated image variants are currently projected in `socialCaption.postImages.variants`; only completed variants with an authorized stored artifact may be selected. Photo Post readiness depends on a valid generated image and Page, not on final video rendering or Reel readiness.
- Publishing must resolve the source run, selected image artifact, tenant/user, canonical affiliate URL, and target Page on the server. The client must not submit an arbitrary image URL.
- Photo publishing must use a Meta Page photo/feed publishing path, not the Reels endpoint. Use the existing Facebook Graph client and pin/verify the API behavior before implementation.
- Photo publication failure or retry must not mutate the Auto Review run or trigger regeneration.
- Preserve the existing pre-task dirty worktree changes.

## Approaches

1. **Extend the current Auto Review publishing panel and publishing service with a media format.** Share Page, content, disclosure, and affiliate controls; resolve and publish a selected image through an isolated Photo Post intent using the existing job and social-post infrastructure. This follows the mockup and avoids duplicate controls. **Recommended and accepted as the working approach.**
2. Add a separate Photo Post card below the Reel card. This isolates UI but duplicates Page/content/disclosure controls and makes publication history less cohesive.
3. Route directly through the generic legacy Social Publishing UI/service. This is quicker to wire but does not provide the run-bound artifact verification and intent reconciliation required for Auto Review.

## Interaction and behavior

- The existing panel presents two format choices: Facebook Reel and Facebook Photo Post.
- Reel remains selected by default to preserve existing behavior.
- Selecting Photo Post shows the three completed generated variants; the user must select one. If no completed image is available, publishing stays disabled with an explanation and a link or direction to the existing image-generation section.
- Shared caption, hashtags, affiliate placement, commercial disclosure, Page selection, and publication history remain in the panel. Reel-specific media preview/status is replaced by the selected image and Photo Post-specific status.
- The outer panel can collapse and expand without changing the selected format or draft snapshot during the current mount.
- Schedule and Auto Post remain unavailable in this phase.

## Implementation calls

- One selected image per Photo Post; no carousel.
- Use the generated social-post image variants rather than raw product references or arbitrary URLs.
- Use a distinct intent/source/media kind so the same run can independently publish a Reel and a Photo Post, while repeated requests for the same format and snapshot deduplicate.
- Reuse current affiliate and commercial-disclosure safeguards. Preserve URL tracking data and report attribution as unverified until externally proven.
- Do not perform a live Meta publish as part of development verification unless an authorized test Page is explicitly configured.

## Verification

- UI tests for format switching, panel collapse, choosing each available image, missing/incomplete variants, retained Reel behavior, and disabled states.
- Service tests for tenant/user ownership, authorized image artifact resolution, image integrity/preflight, caption/hashtag/affiliate snapshot, distinct-format deduplication, retries/reconciliation, and no Auto Review mutation or regeneration.
- Python/Meta transport tests for the Page Photo Post upload/publish path and ambiguous external outcomes, with mocked transport only.
- Run focused suites, build, apply any necessary DEV migration, deploy only to `legacy-debian-dev`, and verify the deployed UI/API without claiming live Meta acceptance absent test-Page evidence.
