# Implementation Decision Log

## 2026-02-16 Run Initialization

- step: preflight
- options: `stop_for_branch`, `proceed_here`
- decision: `proceed_here`
- mode: `asked`
- rationale: User explicitly confirmed continuing on current dirty `main` state.

- step: decision_style_handshake
- options: `ask_every_choice`, `smart_auto`, `auto_by_default`
- decision: `smart_auto` (reused)
- mode: `auto`
- rationale: `decision-mode.md` already exists and user did not request mode change.

- step: test_command
- options: manifest `PROJECT_CONFIG` command vs inferred defaults
- decision: `npm --workspace @smartspec/web test && cd python-backend && pytest`
- mode: `auto`
- rationale: Explicitly provided in `sections/index.md` PROJECT_CONFIG block.

- step: tooling
- options: `rg`, `grep/find`
- decision: `grep/find` fallback
- mode: `auto`
- rationale: `rg` is unavailable in this environment.

## Section 01 Decisions

- step: resolver_default_provider
- options: `chromadb` default vs `cloudflare_vectorize` default
- decision: `cloudflare_vectorize`
- mode: `auto`
- rationale: Preserve current production behavior and avoid silent provider flip.

- step: node_adapter_scope
- options: full pgvector/chroma runtime implementation vs explicit boundary stubs
- decision: boundary stubs with deterministic `VectorProviderError`
- mode: `auto`
- rationale: Keeps contract and resolver/dispatch behavior testable without introducing unverified DB/API assumptions.
