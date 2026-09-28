# TDD plan

1. Update the Rust authorize fixture to emit the real three-line Hermes 0.18.2
   format and assert no event exists after the URL-only line.
2. Add a Rust source/platform test for the Windows no-window flag.
3. Add a server test for raw-only legacy events returning
   `HERMES_PROCESS_FAILED` without raw fields.
4. Add/update React tests for the recoverable error and localized waiting copy.
5. Run targeted tests red, implement, then rerun targeted and full Worker App
   suites plus focused web regressions.

## Results

- RED: the real multi-line Rust fixture latched a URL-only raw event; the
  server accepted a non-ready private worker; the React query continued
  polling after `HERMES_PROCESS_FAILED`.
- GREEN: Worker App 121 tests passed; focused Hermes web suites passed 120
  tests; scheduler/handler follow-ups passed 44 tests; Worker App TypeScript
  typecheck and production web build passed.
