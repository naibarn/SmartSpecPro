# Decision log

## Planning depth

- Depth: micro
- Reason: one server projection and its focused test file are sufficient; the
  existing API shape and extension component remain unchanged.
- Promotion triggers: discovery of a missing canonical character query, schema
  change, or an extension-side contract change. None were found.

## Decisions

- Resolve names server-side so old rows are fixed immediately and every client
  receives safe display values.
- Prefer canonical identity keys over persisted display labels because legacy
  plans may store a key in `speakerName`.
- Preserve a human-readable legacy name only when no canonical mapping exists.
- Replace unresolved opaque identifiers with `ไม่ระบุผู้พูด`.

## Self-review stabilization

1. Completeness: added both timed-plan and clip-only paths to the acceptance
   criteria; no additional scope needed.
2. Contradictions: clarified that canonical identity wins while legacy human
   names remain supported; no contradiction remains.
3. Security: verified the existing owner/tenant boundary is unchanged and no
   new query is added.
4. Integration: confirmed the response shape and panel renderer need no edit;
   no hidden packaging requirement remains.
5. Testability: specified a red regression for opaque stored values and a
   narrator/unresolved fallback guard; no meaningful auto-fix remains.
6. Clean review: no additional scope, security, or integration issue found.

## Cross-section consistency review

1. Ownership: the single section changes only the declared service and focused
   test; no overlapping writer or downstream UI edit exists.
2. Interface: `DramaShotDialogueLine` and the extension JSON response are
   unchanged; the new map is an internal helper input only.
3. Security: the canonical map uses character rows loaded after the existing
   owner/tenant/series checks; no authorization boundary moved.
4. Failure modes: unresolved `character*`, `char_*`, and current `c-<hash>`
   identifiers degrade to `ไม่ระบุผู้พูด`; human legacy labels remain readable.
5. Verification: focused red/green coverage and repository typecheck ownership
   filtering are sufficient for this micro plan; no meaningful auto-fix remains.
6. Clean review: no naming drift, dependency-order issue, or missing plan
   coverage found.
