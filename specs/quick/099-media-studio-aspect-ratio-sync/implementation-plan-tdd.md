# TDD Plan

1. Add failing tests for canonical ratio precedence, including initial and
   retry callers plus the Veo exception.
2. Add a failing DynamicSkillForm/default helper test showing excluded fields
   are omitted while normal defaults remain.
3. Add a failing server normalization test where top-level `9:16` conflicts
   with `extraParams.aspect_ratio=16:9`.
4. Implement the smallest pure helpers and wire both generation paths.
5. Run focused tests, then the scoped TypeScript check; inspect the final diff.
