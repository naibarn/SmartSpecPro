# R1.2 changes (cumulative over 829-line R1.1)

R1.2 appends normative §§25–36 without deleting previous design history and adds **12 distinct new review passes** with explicit evidence and residual gates. Previously defined C256-01..80 remain unchanged. C256-81..112 add 32 implementation requirements.

New closed proposed JSON Schemas and positive fixtures (six each): `capability-public-result`, `effect-budget`, `admission-checklist`, `step-review-checkpoint`, `delegation-scope`, `film-media-pass`. The internal `capability-search-result` **remains server-only** and may not be serialized as public output; public views use explicit field allowlists.

Hardened local tests cover structural schema checks; unexpected internal metadata; no hidden effect or external egress; actual plan-step set equality; mode ceiling; artifact-bound checkpoint; child delegation attenuation; relative-depth/alpha/PTS; fake RAW provenance and signed-readiness distinction. An expanded bilingual goldset contains adversarial and negative phrasing. Every local test is a reference/static example only, not live production evidence.

Unchanged ownership: Feature 196 / Spec 221 / 229 / 248 / 253 / 254 / 255 / 215 and existing physical jobs, approval, ledger, rights and publication owners. Specs 1–214 and active 224 are not edited. All flags OFF; provisional number 256 subject to canonical repository reconciliation.
