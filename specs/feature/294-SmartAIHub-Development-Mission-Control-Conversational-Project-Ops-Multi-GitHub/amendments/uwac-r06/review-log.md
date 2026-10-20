# Fifteen substantive gap-review rounds

These are fifteen scoped source/document review lenses performed in sequence against the inspected base and this amendment, not independent production audits or repeated runtime tests. Each round identifies a concrete contract gap or misleading inference, adds the normative correction below and maps to acceptance; [review-evidence.json](review-evidence.json) retains exact rg scope/time/excerpts. Old R0.6 checklist rows are not counted as completed tests.

| Round | Lens | Source-derived gap | Correction / owner plan | Acceptance |
|---|---|---|---|---|
| 01 | Ownership | A preserved duplicate file must not claim competing authority; user request plus pack README selects outer document only. | C10/G0 resolution; C11-01 | UW-32 |
| 02 | UX | Existing UI explicitly says mutable task state can remain live; snapshot token cannot be described as immutable history for all fields. | C4/WP32; C11-02 | UW-19 UW-20 UW-26 |
| 03 | General Work | DevelopmentJob repositoryRef must not spread into a universal Work requirement. | C1/WP31; C11-03 | UW-13 UW-28 UW-29 |
| 04 | Skills | Studio create/improve options do not establish publication rights or immutable version acceptance. | C6/WP35; C11-04 | UW-08 UW-18 UW-25 |
| 05 | Multi-Agent | Graph-level permission/budget attenuation and loop bounds must survive independent provider sessions. | C2/WP36; C11-05 | UW-09 UW-24 UW-29 |
| 06 | Session Lifecycle | Repaired Runner authentication sessions are different from work continuity; provider ID reuse is not resumption proof. | C2/C3/WP36; C11-06 | UW-11 UW-18 UW-22 |
| 07 | Git | main is policy data and remote/tracking/local/last-green/deployed observations need explicit scope/generation. | C8/WP38; C11-07 | UW-23 UW-30 |
| 08 | Merge | Integration source/head/base can change between review and mutation. | C8/WP38; C11-08 | UW-14 UW-15 UW-30 |
| 09 | Build/Deploy | Local provenance guards exist but generic remote workflow is not equivalent evidence. | C9/WP38; C11-09 | UW-16 UW-34 UW-36 |
| 10 | Security | Cursor integrity does not grant current source/evidence read or mutation scope; event text remains untrusted. | C3/C4/WP32/36; C11-10 | UW-17 UW-21 UW-32 |
| 11 | Billing | Usage union/dedup is necessary across overlapping tasks/sessions and subscription/platform routes. | C3/WP36; C11-11 | UW-10 UW-24 |
| 12 | Multi-Tenant | Source permission changes can invalidate a previously signed scope token and cached cards. | C3/C4/WP32; C11-12 | UW-17 UW-21 |
| 13 | Cross-Device | Device/session change must preserve work identity but cannot preserve stale read grants or local-only bytes. | C5/WP33; C11-13 | UW-20 UW-22 UW-33 |
| 14 | Recovery | Observation and execution recovery must not share a blocking dependency; uncertain effect retries can duplicate external changes. | C4/C7/WP32/37; C11-14 | UW-11 UW-12 UW-33 UW-35 |
| 15 | Production Acceptance | A document, helper suite or build flag cannot establish the live target source/effects. | C9/C10/WP39; C11-15 | UW-30 UW-34 UW-35 UW-36 |

Final consistency review: each added owner requirement points to shared clauses and explicit cases; sections own separate change surfaces, with shared schema/reducer edits coordinated. Prior SPEC224 live state and old requirement rows are compared byte-for-field after official writes. Remaining implementation/runtime gaps stay in traceability and canonical ledgers, not silently closed.
