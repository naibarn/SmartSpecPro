## CI & Coverage

This repo runs tests and coverage gates per package:

- **python-backend**: `pytest` with coverage gate (see `python-backend/pytest.ini` and `.coveragerc`)
- **api-generator**: Jest coverage gate (`npm run test:coverage`)
- **control-plane**: Vitest coverage gate (`npm run test:coverage`)
- **desktop-app**: Vitest coverage gate (`npm run test:coverage`)

Run everything locally:

```bash
bash scripts/ci/run_all.sh
```

Coverage summary (aggregated across packages):

- Script: `scripts/ci/coverage_summary.py`
- In GitHub Actions, the job **coverage_summary** publishes `coverage_summary.md/json` as an artifact
- The workflow will **fail** if any package does not produce `coverage/coverage-summary.json` (prevents “false green” CI)

> Note: Integration/E2E tests are skipped by default in CI. Enable with `RUN_INTEGRATION_TESTS=1`.
