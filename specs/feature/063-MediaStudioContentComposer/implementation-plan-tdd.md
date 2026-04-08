# TDD Guidance: Feature 063 - Media Studio Content Composer and Publish Router

## Test-first order

1. Add unit tests for the article draft state model.
2. Add unit tests for skill vs agency selection behavior.
3. Add UI tests for role-based destination visibility.
4. Add UI tests for platform-first social routing.
5. Add integration tests for stable asset attachment.
6. Add regression tests for temporary URL rejection.

## Tests to cover

- `MediaStudio` composer panel renders the new article section.
- The composer can switch between skill and agency execution sources.
- Agency mode shows the selected agency or template.
- General users only see Social post in destination options.
- Admin or domain admin users see Docs, Blog, and Social post.
- Skill selection is preserved when toggling web search and thinking.
- Agency recommendation appears for complex tasks but remains user-overridable.
- Asset selection is limited to 1 to 6 items.
- Publish action blocks temporary preview URLs and requires library-backed assets.
- Social routing requires a platform before account/page/channel selection.
- Upload-Post path supports the final publish target selection flow.

## Suggested regression checks

- Existing image/video generation still works unchanged.
- Existing `attachTarget` based flow still works for blog/page media attach.
- Existing Social Publishing page continues to load and publish connected pages.
- Existing library search and upload flows still function.
- Existing role-based destination gating still behaves correctly for general users.
- Existing social background registry and internal tool routes still list and execute TikTok/YouTube provider actions.

## Implementation notes

- Prefer testing the new article composer as a self-contained panel before wiring the publish adapters.
- Mock the library and social routing sources so the tests stay stable.
- Keep the old media generation controls intact while the new composer is introduced.
- Add a security-focused test for agency execution so only approved templates and tools are used.
