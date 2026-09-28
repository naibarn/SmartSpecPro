# Request

Implement the approved presentation-export media URL refresh design.

## Summary

Before Playwright captures a presentation slide, managed media must be resolved
to a fresh URL. Transient navigation/media failures should retry with a fresh
render request, while deterministic failures and unresolved media remain
fail-closed.

## Affected areas

- Node internal slide-render route
- Python Celery presentation renderer
- Focused Node/Python tests
- Worker runtime configuration verification only; do not rewrite `.env`

## Constraints and non-goals

- Preserve authored slide data and existing media assets.
- Do not call image/video providers or spend credits.
- Do not weaken internal route authorization or capture placeholders.
- Do not add dependencies or schema migrations.
- Preserve unrelated dirty work, including the existing Python
  `response.status` property fix.

## Assumptions

- Persisted `/api/storage/files/...` references are the canonical managed-media
  form for current Presentation Builder records.
- A fresh slide-render request is the correct boundary for issuing new
  presigned URLs.
