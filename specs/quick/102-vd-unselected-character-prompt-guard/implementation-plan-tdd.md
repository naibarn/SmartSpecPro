# TDD Plan

1. Add a failing pure test whose synopsis mentions `ปราง` while only
   `คุณกฤต` is selected.
2. Assert parenthetical off-screen context and all occurrences of `ปราง` are
   absent, while `คุณกฤต` and the selected-cast lock remain.
3. Add normal-mode/final-output coverage and an overlapping-name case.
4. Add router source/wiring coverage for tenant-series roster exclusion data.
5. Implement the smallest pure helper and central guard, then rerun focused
   prompt, required-character, and router suites.
