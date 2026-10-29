# Spec handoff CLI large JSON argument fix — 2026-10-29

Integrated source: `bf3172b169cb3c637e6c04c6b645a4d88f5c8ad7` (`origin/main`).

`spec-handoff update --changes-json` now safely accepts either inline JSON or a JSON file path. Previously, inline JSON longer than the operating system filename limit raised `ENAMETOOLONG` while checking whether the argument was a file. The same parsing fix applies to requirement updates.

Verification: `python3 -m unittest tools.spec_handoff.tests.test_cli_json_argument tools.spec_handoff.tests.test_cli tools.spec_handoff.tests.test_store -v` — 17 tests passed. The wider `tools/spec_handoff` suite has six unrelated existing failures in classification expectations and mirrored lifecycle-skill contract expectations; these were not modified.
