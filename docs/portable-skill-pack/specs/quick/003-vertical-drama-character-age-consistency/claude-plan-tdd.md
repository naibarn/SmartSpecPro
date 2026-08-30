# TDD Plan: Dynamic Casting Age Consistency

## 1. Objective and boundaries

Before implementation, prove that the change is limited to casting candidate generation
and selection, with no downstream behavior or migration assumptions.

## 2. Chosen solution

Test the shared age profile contract independently from DB and provider integrations.

## 3. Data and contract changes

### 3.1 Shared age profile module

- Test explicit numeric age and numeric range precedence.
- Test approved Visual Bible/DNA age range precedence over role inference.
- Test age-stage variant classification and preservation of child/teen/adult semantics.
- Test contextual examples: student 17–19, young working adult 22–25, older lead 30–35.
- Test separate ranges for two characters in an intentional age-gap story.
- Test malformed, inverted, unsafe, and absent inputs; verify only truly unresolved
  characters fail closed and no universal 24–25 fallback is produced.
- Test bounded rationale/source/confidence output and stable normalization.

### 3.2 Normal candidate-generation path

- Test the candidate input contains one shared age directive for candidate counts 1–5.
- Test every returned candidate age range is checked against the resolved profile.
- Test material age drift rejects the batch or enters the existing bounded retry path.
- Test legacy approved DNA recast unlocks face identity while retaining age evidence.
- Test existing role-tier, anti-clone, lead-quality, and candidate-count validation still
  runs unchanged.

### 3.3 Reference-guided path

- Test adapter input maps the resolved 17–19, 22–25, and 30–35 profiles to numeric
  `age_min`/`age_max` without adult-only clamping.
- Test the imported skill input schema accepts under-18 age ranges and rejects invalid
  bounds.
- Test plain-text prompt instructions preserve new-fictional-person, reference-guideline,
  same-age-band, and age-appropriate wording.
- Test one shared profile is used regardless of requested image count 1–5.
- Test retry/reference projection caps more than six stored links and preserves the
  canonical primary portrait when optional references are edited.

### 3.4 Candidate validation and persistence

- Test candidate batch metadata stores one profile/range and rejects missing or mismatched
  candidate metadata before provider submission.
- Test selecting a candidate preserves the selected profile in the canonical Visual Bible
  and leaves sibling candidates as non-primary alternatives.
- Test legacy rows without the optional profile remain readable.

## 4. UI/UX contract

- Test resolved age range and source render as read-only text.
- Test inferred, unresolved/error, loading, and candidate-success states.
- Test no age input is submitted by the browser.
- Test Thai/English fallback copy and accessible labeling.
- Test long range/source copy does not overflow the casting controls at the existing
  component test viewport assumptions; browser verification remains a separate evidence
  step.

## 5. Failure modes and operational behavior

- Test no credit reservation or provider task is created for unresolved age or age drift.
- Test under-18 safety directive remains present and no sexualized casting language is
  introduced by the age profile.
- Test explicit age wins over conflicting inferred role signals and records bounded
  diagnostics only.

## 6. Work sequence and dependencies

Run the pure resolver/profile tests first, then service prompt tests, adapter/schema tests,
router persistence tests, and UI tests. Run existing focused suites after each touched
boundary and the aggregate focused set before handoff.

## 7. Focused file ownership

Test files should follow existing Vitest conventions beside the resolver, image-generation
service, reference adapter, router, shared profile, and character stock panel. Do not
modify unrelated baseline tests.

## 8. Verification and definition of done

Required proof is focused Vitest output plus `git diff --check`; typecheck, browser,
provider, and deployment results must be reported separately according to what actually
runs.

## 9. Rollback

Test that old candidate rows and snapshots without the optional age metadata continue to
parse and render, and that disabling the new resolver branch restores the existing path.
