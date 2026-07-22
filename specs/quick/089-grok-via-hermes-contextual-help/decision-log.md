# Decision Log

## Decisions

1. Use four task-oriented topics instead of one long topic.
2. Reuse `HelpButton` and `HelpPanel`; add no dependency or custom modal.
3. Keep `hermes-workers` unchanged because it documents Hermes Agent Gateway.
4. Make Help available even when Hermes is disabled so setup blockers remain
   explainable.
5. Use localized visible labels and let the existing Help panel control content
   locale.
6. Use the same admin topic from platform and tenant pages because the two
   controls form one rollout workflow.

## Review convergence

- Round 1: Split user, admin, Worker App, and monitoring concerns.
- Round 2: Added explicit Agent Gateway versus Media Worker distinction.
- Round 3: Added disabled-state access and three-scope ownership explanation.
- Round 4: Added responsive, accessibility, locale, and test requirements.
- Round 5: Clean review; no missing product state identified.
- Round 6: Clean review; paths, topic slugs, and acceptance criteria agree.
- Round 7: Fixed stale monitoring test fixtures and the current tenant flag
  label; the full focused suite then passed.
- Round 8: Clean review; 72 focused tests, locale pairing, topic mapping, and
  scoped diff checks passed with no must-do-now gaps.
