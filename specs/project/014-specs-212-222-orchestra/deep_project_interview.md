# Deep-Project Interview Record

## Interview status

No product interview was required before decomposition. The user supplied the
normative dependency order, lifecycle stages, certification condition, and typed
blocked-stop rules directly. This record preserves those decisions as the source
of truth for project decomposition.

## Decisions captured

- Existing authorities are frozen first: 195, 199, 200, 206, 207, 208, 209, 211.
- The exact sequence 214 → 215 → 216 Phases 0–3 → 220 → 217 → 222 foundation
  → 221 → 218 → 219 → integration hardening → 212 R20 is mandatory.
- Spec 213 may be parallel only with independent ownership and must certify before
  Computer Use enters harness integration.
- Each spec/wave must complete all seven lifecycle stages.
- Gaps backtrack to the earliest affected stage and invalidate downstream proof.
- Product decisions, destructive actions, external dependencies and loop limits
  are typed blockers with evidence and resume pointers.

## Decomposition decision

Use the existing feature spec files as canonical split inputs. Do not duplicate or
rename them into the project planning directory; the project directory owns only
coordination artifacts and the execution manifest.
