---
name: Feature 046 Tiptap Editor — Security Audit (2026-03-19)
description: Security-focused review of the 13-section Tiptap Markdown Editor deep-plan. Verdict: CONDITIONAL.
type: project
---

## Verdict: CONDITIONAL

All 13 sections read. Security audit identifies 4 HIGH, 5 MEDIUM, 4 LOW findings.

**Why:** Plan is architecturally sound but has exploitable gaps in media URL sanitization and markdown serialization that must be fixed before implementing sections 06, 07, 09, 11.

**How to apply:** Block S06/S07/S09/S11 implementation until the four HIGH issues are resolved in the plan.

---

## HIGH Findings (blocking)

### H1 — `sanitizeMediaSrc` blocks only `javascript:`, not all `data:` abuse
- **Location**: S06 `mediaSerializationRules.ts`
- `data:text/html,...` and `data:image/svg+xml,...` (SVG with embedded script) are NOT blocked by a pure `javascript:` check.
- **Fix**: Block ALL `data:` URIs for video/audio `src` and `poster`. Only `data:image/*` is acceptable for image src.

### H2 — `sanitizeMediaSrc` only at `parseHTML` time, not at `setVideo` command time
- **Location**: S06 extension `addAttributes()` vs `setVideo` command injection via `insertContentAt`
- A crafted Tiptap JSON document loaded directly (not via `parseHTML`) could carry un-sanitized `poster` into `VideoNodeView`.
- **Fix**: Call `sanitizeMediaSrc` inside `setVideo`/`setAudio` commands themselves, not only in `parseHTML`.

### H3 — Paste sanitizer missing URL protocol filtering for `<img src>`
- **Location**: S09 `transformPastedHTML`
- DOMPurify strips `javascript:` by default but not `data:image/svg+xml,...` XSS via img src.
- `SafeMarkdown.tsx`'s `sanitizeUrls()` blocks `data:text` and `data:application` but the paste sanitizer never calls it.
- **Fix**: Post-process `<img src>` attrs in `transformPastedHTML` with the same URL protocol blocklist.

### H4 — Markdown serializer uses unescaped string interpolation for user-controlled values
- **Location**: S06 `addStorage().markdown.serialize`
- `state.write(\`<video ... data-caption="${node.attrs.caption}"\`)` — a caption containing `"` breaks attribute boundaries → stored XSS.
- **Fix**: HTML-encode all attribute values before interpolating: `value.replace(/"/g, '&quot;').replace(/</g, '&lt;')`.

---

## MEDIUM Findings

- **M1**: `data-poster` URL validation in `splitByMedia` (S11) — extraction layer missing `sanitizeMediaUrl()` call; only render time validated.
- **M2**: `video`/`audio` intentionally excluded from paste ALLOWED_TAGS (S09) — must be documented explicitly to prevent implementor drift.
- **M3**: `uploadFile` base64 size cap unverified — `MAX_FILE_BASE64_LENGTH` referenced in S08 but not confirmed in tRPC Zod schema.
- **M4**: Multi-image paste concurrent uploads — `handlePaste` does not serialize uploads, inserts may be non-deterministic.
- **M5**: Overwrite handler doesn't sync `updatedAt` from server response — second conflict won't produce dialog, silently overwrites again.

---

## LOW Findings

- **L1**: tippy.js described as "already available as transitive dep" but S01 correctly installs it directly — remove contradictory note.
- **L2**: S04 i18n keys — defer all `editor.*` additions to S10's canonical table, not independently.
- **L3**: Performance tests should use `test.skipIf(process.env.CI === "true")` instead of passive `.skip`.
- **L4**: Server-side MIME validation on `/api/media-jobs/upload` — verify multer `fileFilter` exists.

---

## Architecture Security Notes

### `html: true` in tiptap-markdown — acceptable but must be documented
ProseMirror's schema acts as an implicit allowlist — unknown HTML becomes text or is dropped. `<script>`, `<iframe>`, etc. are not registered node types. SECURE **as long as no future extension adds these node types**. Add explicit comment to `TiptapMarkdownBridge.ts`: "html: true is safe because ProseMirror schema enforces allowlist — never register script/iframe/embed/object as node types."

### data-* whitelist in SafeMarkdown is targeted (GOOD)
`ADD_ATTR: ["data-poster", "data-caption", "data-asset-id"]` with `ALLOW_DATA_ATTR: false` — correct approach.

---

## Remaining Completeness Gaps (non-security)

- S06 "CRITICAL SPIKE" for `tiptap-markdown` v0.8 serialization API is still unresolved at plan time.
- S08 `uploadMedia.ts` endpoint ambiguity: tRPC (`uploadFile`) vs REST (`/api/media-jobs/upload`) — two different paths described in S08 and S09.
- S12 Radix AlertDialog — Escape behavior spec is WRONG: dialog WILL close on Escape unless `onEscapeKeyDown={e => e.preventDefault()}` is explicitly added. This would leave auto-save permanently paused if user Escapes the dialog.
- Version history flooding by 2-second auto-saves — not specified whether `saveMarkdown` creates a version entry on each call.
