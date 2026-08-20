# Request

Implement the approved Vertical Drama character-reference UX change from
`../../2026-08-19-vertical-drama-character-reference-disclosure-design.md`.

The complete reference group should be collapsed by default once a character
already has a primary portrait. It should expand automatically for a character
without a primary portrait, and the user must be able to open it manually to
choose another primary reference or run the existing 1–5 image casting flow.

Preserve the existing server mutations, candidate polling, credit guards, and
read-only behavior. Work in the dirty checkout without touching unrelated user
changes.
