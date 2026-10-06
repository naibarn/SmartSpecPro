# Canonical Spec count bridge — 2026-10-06

Baseline authority is the prior index at `8779e6ef697212f22836f2020a4ec6ec0c590d4d`; current inventory is `9ab681181a6ac850a366bb92ebf5dc024029655b`.

| Change | Count | Record evidence | Effect |
|---|---:|---|---:|
| Previous canonical Specs |  | Prior `specs/_status/spec-index.json` | 307 |
| Renumbered canonical identities added as 296–301 | +6 | Six `specs/_config/spec-id-registry.json` aliases and 100% Git rename evidence; targets remain canonical | +6 |
| Previous IDs/paths replaced by those six renumber aliases | -6 | Alias source paths are excluded from active roots; corresponding canonical targets above | -6 |
| Agency Creator 058 demoted to history | -1 | `duplicate-authority-resolution-20261006.md`; byte-identical move to `specs/_history/spec-id-conflicts/058-agency-creator-intelligence-upgrade` | -1 |
| Combined 162/163 gap-closure artifact demoted to implementation evidence | -1 | `duplicate-authority-resolution-20261006.md`; byte-identical move to `specs/_history/spec-id-conflicts/162-163-gap-closure` | -1 |
| Merged duplicate revisions | 0 | Current dynamic inventory reports no duplicate canonical IDs or revisions | 0 |
| Other dispositions | 0 | Dynamic inventory and eight-group authority decision record | 0 |
| **Current canonical Specs** |  | **307 + 6 - 6 - 1 - 1** | **305** |

The 307-to-305 change is therefore exactly two records demoted from canonical authority. Renumbering has zero net effect. Both demoted records remain discoverable in configured alternate roots; neither was deleted.

Current regenerated repository facts at baseline SHA `9ab681181a6ac850a366bb92ebf5dc024029655b`:

- 305 canonical Specs and 463 total inventory records.
- 331 reconciliation-review records; all have deterministic primary classifications, with Feature 161 as the sole `UNRESOLVED_AUTHORITY`.
- 302 relationship-graph candidate edges.
- Zero duplicate canonical authority IDs; six valid renumber aliases.
- Feature 161 remains unresolved because its canonical-root directory has no normative `spec.md`; it has a `claude-spec.md` synthesized from an approved design and downstream Specs reference it, but no evidence authorizes promoting that synthesized file to normative authority.

The machine-readable record-by-record classification is `reconciliation-record-classifications-20261006.json`; validate its exact dynamic inventory coverage with `python3 -m tools.spec_handoff classifications --check`.
