# Section 01: Content and Renderers

## Ownership

- `apps/web/client/src/lib/legalContent.ts`
- `apps/web/client/src/pages/Privacy.tsx`
- `apps/web/client/src/pages/Terms.tsx`

## Work

- Define typed bilingual documents with stable section IDs.
- Render paragraphs, bullets, and subsection labels as semantic HTML.
- Use `useScopedTranslation("publicSite")` only for locale selection and retain the existing
  Navbar/Footer shell.
- Localize title, summary, last-updated label, table of contents, links, and JSON-LD.

## UI/UX Contract

- Target user: a visitor deciding whether to use SmartAIHub and needing readable legal terms.
- States: normal English, normal Thai, fallback English, and narrow viewport wrapping.
- Responsive: preserve the existing centered max-width layout; legal text must wrap without
  horizontal clipping or truncation.
- Accessibility: semantic `main`, headings, lists, anchored sections, visible focus states,
  descriptive links, and no information conveyed only by icons.
- Copy: professional, plain, cautious, legally scoped; no unverified factual promises.
- Browser evidence: local route click-through and locale toggle are desirable; if unavailable,
  report them as unperformed rather than inferring production behavior.
