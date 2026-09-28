# Self-review round 1

## Findings and resolutions

1. **SDK upgrade could be misread as an immediate dependency edit.** Resolved by making the upgrade a gated profile/migration step and explicitly retaining the current resolver until Agency imports are removed.
2. **The broad spec could lead to an unsafe all-at-once Agency deletion.** Resolved by making Section 06 freeze and read-only reconciliation first; deletion is conditional on migration proof and is not performed by a blind cleanup.
3. **Provider quality and credit safety were described but not tied to executable boundaries.** Resolved by requiring Node final gate plus one-time side-effect authorization and provider capability profiles before submission.
4. **Cross-language drift was under-specified.** Resolved with canonical hash vectors, mirrored Pydantic/Zod models, and golden fixtures in Section 01 and Section 07.
5. **Future scene modes could become another one-off patch.** Resolved by requiring task-kind/rule-pack registry fixtures for phone, cross-location, shout, narration, and prop interaction.
6. **User correction could overwrite a paid artifact.** Resolved by requiring immutable prior attempts, new correction attempts, and provider-unknown reconciliation rather than automatic retry.
7. **Section index validation initially failed because the manifest was not in the required parser format.** Fixed by using the required top-of-file PROJECT_CONFIG and SECTION_MANIFEST blocks and canonical section filenames; `check-sections.py` now reports complete 7/7.

## Remaining deliberate limits

- Real provider calls, authenticated browser flows, deployment, and credit-ledger reconciliation remain release-only checks.
- Database table additions and deletion of Agency historical data are not included in the first safe implementation slice; the plan requires authoritative schema discovery and retention/legal-hold proof first.
