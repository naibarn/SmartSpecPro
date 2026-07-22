# TDD guidance

1. Add failing Rust tests for required Windows path keys and safe diagnostic
   extraction/redaction. Implement only after the failures are observed.
2. Add failing React tests for active/history partitioning, collapsed default,
   five-row slice, show-more, admin central filtering, and Thai/English labels.
3. Update the server minimum-version regression from 0.1.131 to 0.1.132 and
   prove 0.1.131 is demoted while central workers remain eligible.
4. Run focused Rust, React, scheduler/registry, formatting, release, and live
   health checks.

