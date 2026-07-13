# Test Plan

1. Add a focused Vitest assertion for the exact catalog row before adding the source entry.
2. Run it and observe the expected failing import/inventory assertion.
3. Add the minimal catalog export and row; rerun the test.
4. Run `pnpm run check` and the seed `--dry-run` output assertion.
5. Run the production seed, then query the exact model id and enabled state.
