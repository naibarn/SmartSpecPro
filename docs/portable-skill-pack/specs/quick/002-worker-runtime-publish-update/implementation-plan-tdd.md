# TDD guidance

1. Extend route ZIP fixtures with Whisper entries and a valid-looking
   transcription manifest; confirm the new complete fixture still serves.
2. Add failing cases for missing transcription metadata and placeholder
   signature; implement server admission gates until they pass.
3. Update Rust WSL fixtures for the Linux Whisper path and run the focused
   doctor suite.
4. Add the force flag and Runtime & agents controls; run Worker App typecheck.
5. Run the packaging release check and require a real signature before any
   archive build or promotion.

Expected focused proof: web route tests 32/32, Rust runtime manifest tests
12/12, and Worker App TypeScript typecheck successful. Full web typecheck and
Windows cross-compile are separate repository/toolchain checks.
