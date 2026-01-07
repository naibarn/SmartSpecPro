# Coverage Testing Guide

This guide explains how to run coverage tests for the SmartSpecPro project.

## Overview

The project has multiple components with different testing frameworks:

1. **Python Backend** - pytest with coverage (80% minimum)
2. **API Generator** - Jest/Vitest with coverage
3. **Control Plane** - Vitest with coverage
4. **Desktop App** - Vitest with coverage
5. **SmartSpecWeb** - Jest/Vitest with coverage

## Quick Start

### Run All Tests with Coverage

```bash
# From project root
bash scripts/ci/run_all.sh
```

This will run tests for all components sequentially.

### Run Individual Component Tests

#### Python Backend

```bash
cd python-backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pytest
```

The pytest configuration in `pytest.ini` includes:

- Coverage measurement for the `app` directory
- 80% coverage threshold (will fail if below)
- Coverage reports in terminal and XML format

#### API Generator

```bash
cd api-generator
npm install
npm run test:coverage
```

#### Control Plane

```bash
cd control-plane
npm install
npm run test:coverage
```

#### Desktop App

```bash
cd desktop-app
npm install
npm run test:coverage
```

#### SmartSpecWeb

```bash
cd SmartSpecWeb
npm install
npm run test:coverage
```

## Coverage Reports

### Python Backend

After running tests, coverage reports are generated:

- **Terminal**: Shows coverage summary with missing lines
- **XML**: `python-backend/coverage.xml` (for CI/CD integration)

### Node.js Packages

Coverage reports are generated in each package's `coverage/` directory:

- `coverage/coverage-summary.json` - JSON summary
- `coverage/lcov-report/index.html` - HTML report (open in browser)

## Coverage Thresholds

### Python Backend

- Configured in `python-backend/pytest.ini`
- Minimum: 80% coverage
- Command: `--cov-fail-under=80`

### Node.js Packages

Check each package's `package.json` for coverage thresholds in the Jest/Vitest configuration.

## CI/CD Integration

The project uses GitHub Actions for automated testing. See `.github/workflows/ci.yml` for the complete CI pipeline.

The CI workflow:

1. Runs tests for each component in parallel
2. Uploads coverage reports as artifacts
3. Generates an aggregated coverage summary
4. Creates coverage badges
5. Publishes badges to the `badges` branch

## Viewing Coverage Summary

After CI runs, you can view the coverage summary:

```bash
python3 scripts/ci/coverage_summary.py \
  --python-xml python-backend/coverage.xml \
  --api-generator api-generator/coverage/coverage-summary.json \
  --control-plane control-plane/coverage/coverage-summary.json \
  --desktop-app desktop-app/coverage/coverage-summary.json \
  --smartspecweb SmartSpecWeb/coverage/coverage-summary.json \
  --out-json coverage_summary.json \
  --out-md coverage_summary.md
```

## Troubleshooting

### Python Tests Failing

1. Ensure virtual environment is activated
2. Install all dependencies: `pip install -r requirements.txt`
3. Check that you're in the `python-backend` directory
4. Verify Python version (3.11+ recommended)

### Node.js Tests Failing

1. Clear node_modules: `rm -rf node_modules`
2. Clear package lock: `rm package-lock.json` or `rm pnpm-lock.yaml`
3. Reinstall: `npm install` or `pnpm install`
4. Check Node version (20+ recommended)

### Coverage Below Threshold

If coverage is below the threshold:

1. Identify uncovered code in the terminal report
2. Add tests for missing coverage
3. Run tests again to verify

## Integration Tests

By default, integration and E2E tests are skipped in CI. To run them:

```bash
RUN_INTEGRATION_TESTS=1 bash scripts/ci/run_all.sh
```

## Additional Resources

- Python coverage configuration: `python-backend/pytest.ini`
- Python coverage RC: `python-backend/.coveragerc` (if exists)
- CI configuration: `.github/workflows/ci.yml`
- Coverage summary script: `scripts/ci/coverage_summary.py`
