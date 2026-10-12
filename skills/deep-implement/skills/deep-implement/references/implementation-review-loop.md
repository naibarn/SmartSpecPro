# Implementation Review Loop

Use this reference for targeted review during development and thorough review during gap closure. **A per-section exhaustive review is not a prerequisite for a development checkpoint.**

## Per-section check

Check that the section's main observable behavior is implemented, imports resolve, and the changed code passes its relevant focused check. Fix material defects discovered immediately; track secondary UI states, missing browser evidence, optional tests and polish as specific follow-up gaps. Record incomplete sections honestly.

## Cross-section review and iterative closure

After integrated code can be built, check interfaces between sections, actually run the app, inspect user-visible behavior, and fix gaps iteratively. Every successful fix can be integrated independently. Repeat reviews while they make progress; do not demand a fixed number of clean rounds, all screenshots or full SPEC evidence before any merge.

For final acceptance, compare remaining requirements with real code/runtime evidence, repair failures and explicitly list items still unverified. A partial checkpoint is never labeled fully accepted.
