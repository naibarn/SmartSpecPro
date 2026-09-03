# Interview transcript

## Q1. What raw data may be retained?

User answer: Store raw prompt/request and raw output/response in full for
debugging, admin-only, for 30 days. Redact API keys, Authorization, cookies,
tokens, and signed URLs.

## Auto-decisions

- Use a dedicated additive forensic table because special episodes do not have a
  repair revision and existing global audit sanitization intentionally removes
  prompt bodies.
- Keep JSONL audit events as compact operational summaries and persist full
  redacted payloads in the dedicated table.
- Instrument only the special adapter through opt-in callbacks; existing normal
  episode callers retain their current behavior.
- Use admin-only tRPC procedures with bounded limits and exact correlation filters.
- Make forensic writes best-effort and never let them change billing or generation
  outcome.
