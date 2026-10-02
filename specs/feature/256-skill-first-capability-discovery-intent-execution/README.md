# SmartAIHub Spec 256 — R1.2 second independent 12-pass audit pack

**Status:** implementation **proposal**, not code-certified, live-protocol-certified or approved for production. The number `256` is **provisional** until the canonical SmartSpecPro main/worktree/PR/spec registry G0 check. Prepared 2026-09-28.

## Exact source baseline and scope

This is a **cumulative** successor to the user-supplied 829-line `SPEC-256-Skill-First-Capability-Discovery-Intent-Execution-R1.1-14PASS.md`. The original R1.1 §§0–24 and prior 14-pass audit are retained. R1.2 adds §§25–36 and 12 **new distinct document-review passes**; it does **not** recycle the 14 old rows as new work. Newly defined acceptance cases C256-81..112 extend old C256-01..80: **112 requirements total**.

R1.2 adds six closed sample JSON Schemas and six example fixtures to the old seven of each (**13 schemas + 13 positive fixtures**). The test suite retains previous 34 checks and adds 34 new reference/static checks (**68 static tests**, expected only when dependencies exist). The evaluation gold set has **30** Thai/English *labeled* examples (15 each), **not** 30 observed inference successes.

## Canonical spec

`specs/feature/256-skill-first-capability-discovery-intent-execution/spec.md` — full cumulative implementation proposal. The same full file is supplied separately as an `.md` download.

## Handoff files

- `AUDIT-12-ADDITIONAL-PASSES-R1.2.md`: twelve additional pass-by-pass evidence/findings/fixes and outstanding owner/runtime gates.
- `AUDIT-14-PASSES-R1.1.md`: retained historical document review.
- `CHANGELOG-R1.2.md`: only the new revision changes; original `CHANGELOG-R1.1.md` retained.
- `CROSS-SPEC-IMPACT-R1.2.md`: ownership boundary and proposed additions without editing frozen specs.
- `IMPLEMENTATION-ORDER-R1.2.md` and `IMPLEMENTATION-MISSION-R1.2.md`: staged G0–G7 and agent handoff.
- `contracts/`: closed illustrative schema definitions. **These do not replace existing deployed owner APIs.**
- `fixtures/`: samples containing *example references*, never grants or runnable credentials.
- `skills/film-hybrid-scene-replacement/SKILL.md`: **unpublished candidate**, requiring Spec 221 review and publication.
- `evaluation/intent-goldset-th-en.json`: bilingual labels and negative cases. No LLM accuracy is claimed.
- `tests/`: static schema, illustrative semantic validation and security negative fixtures.
- `generate_r12_contracts.py`: deterministic schema/fixture regeneration (for this illustrative pack only).
- `SHA256SUMS.txt` and `verify_pack.py`: exact non-self-referential release file hash checks.

## Offline test command

From extracted pack root, with Python 3.11+ and `jsonschema`, `referencing` and `PyYAML` installed:

```sh
python -m unittest discover -s tests -v
python verify_pack.py
```

These commands do **not** contact external providers, mutate SmartAIHub, make paid calls or certify live entitlement, tenant isolation, MCP, GPUs, billing or production readiness. Do not assume requirements are implemented based on fixture success.

## Strict implementation boundaries

No retroactive edits of Specs 1–214. No change to actively implemented Spec 224. No second Capability/Skill Registry, Chat, Workflow, physical job ledger, approval authority, billing ledger or Film domain tables. Feature 196, Specs 221/229/248/253/254/255/215 and existing owner APIs are definitive. G0 current-code reconciliation and owner approval precede actual code/DDL/deploy; all flags default OFF. The public catalog is a **strict display-only proposal**, not a new MCP `skills/*` method.
