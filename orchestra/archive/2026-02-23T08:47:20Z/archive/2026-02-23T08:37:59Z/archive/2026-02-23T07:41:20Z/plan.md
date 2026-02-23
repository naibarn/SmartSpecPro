# Orchestra Plan

## Task
Integrate BytePlus ModelArk API as a new media provider, supporting Seedream image generation and Seedance video generation (T2V and I2V) throughout the admin UI, Python backend, and Media Studio.

## Task Classification
- Scope: large
- Risk: high
- Affected domains: CMD-1 Frontend (admin pages + Media Studio), CMD-2 Backend (tRPC router templates, testConnection), CMD-3 Python (new provider adapter + task handling), CMD-4 Database (no new tables, but template data + media models seeded)
- Estimated file count: 10–14 files
- Chosen route: deep-plan-codex-chain
- Bug route: false
- Classification notes: New external API integration touching 4 domains (frontend admin pages, Node.js tRPC provider templates, Python backend provider adapter, existing Celery task dispatch). No new DB tables but new provider template data and 6 media model records. Risk is HIGH due to external API key storage (encrypted) and new async task flow with different API shape than Kie.ai.

## Route: deep-plan-codex-chain
- spec_file: specs/feature/022-byteplus-modelark-api/spec.md
- status: spec_complete
- backlog: orchestra/backlog.md
