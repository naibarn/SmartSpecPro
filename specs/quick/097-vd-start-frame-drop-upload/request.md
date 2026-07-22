# Request

## Original request

Allow a user to drag an image from their harddisk onto a Vertical Drama shot's
Start Frame, upload it automatically, and replace the existing Start Frame.

## Approved design

Use the approved design in
`docs/portable-skill-pack/specs/2026-07-22-vertical-drama-start-frame-drop-upload-design.md`.

## Constraints

- Preserve URL drops from Library and Media History.
- Upload local files through the existing authenticated `trpc.ai.upload` path.
- Preserve the 15 MB image guard and server validation.
- Keep the existing Start Frame until the full upload/resolve/link chain succeeds.
- Await the whole callback so the busy overlay is accurate.
- Preserve unrelated dirty-worktree changes in all overlapping source files.
- Do not deploy, generate paid media, add dependencies, or change the database.

## Non-goals

- Multiple-file replacement.
- Image editing or cropping.
- New upload endpoints or storage formats.
- Changes to character portrait or supplementary-reference drop behavior.

