# TDD plan

## Red

1. Change the current mismatch test to expect successful normalized output matching the
   production incident and assert the LLM executor is called once.
2. Add assertions that the returned snapshot contains authoritative evidence and a
   provisional threshold.
3. Add negative tests for `candidate_direction_count != 3`, role mismatch, and approved
   identity drift to prove non-owned fields remain strict.
4. Add status tests for preserving `redesign_required` and never promoting under structured
   history.

## Green

Implement the smallest preprocess normalizer and bounded correction logger needed to pass
the new tests. Retain the existing post-normalization evidence assertion.

## Refactor and regression

Keep the helper pure and narrowly typed. Run the focused character image-generation test,
then the related Character DNA suite and TypeScript check. Finish with scoped
`git diff --check`.
