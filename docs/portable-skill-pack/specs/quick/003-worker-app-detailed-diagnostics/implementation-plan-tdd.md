# TDD guidance

1. Add diagnostics unit tests first for marker creation/clean removal,
   unexpected-session detection, token/private-key redaction, bounded excerpts,
   export merge order, and missing-file handling.
2. Add command-level tests for export destination validation and atomic output.
3. Add frontend type/build coverage through the existing TypeScript build; keep
   the download button disabled while an export is active and show the result.
4. Run regression tests for existing token-reference and log-rotation behavior.
5. Verify manually that a normal close is marked clean, a forced termination is
   marked unclean on the next launch, and the downloaded file opens in a text
   editor without secrets.
