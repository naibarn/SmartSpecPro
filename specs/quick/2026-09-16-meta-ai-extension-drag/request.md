# Request

Update SmartAIHub Companion so all images in Drama Series, Storyboard Review,
and Product Reviews can be dragged into Meta.ai. Change Storyboard Review from a
wide two-column project/detail view to the Drama Series pattern: show projects,
open one project into a focused shot list, and use Back to choose another.
Show both image and video prompts with a four-to-five-line preview and a Copy
button that copies the complete prompt. Bump to the next extension version and
publish the ZIP in the dashboard release directory.

## Assumptions

- The next version after `0.1.145` is `0.1.146`.
- Existing managed-media auth and bridge TTL behavior remain authoritative.
- Storyboard image prompt is read from existing task/context prompt fields; no
  schema or migration is needed.
- Browser-authenticated Meta.ai proof may be unavailable in the local session,
  so built-package and focused contract proof must remain separate from that
  external proof.

