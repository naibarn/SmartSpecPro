---
description: Run coverage tests for all components
---

# Coverage Testing Workflow

This workflow runs coverage tests for all components of the SmartSpecPro project.

## Steps

### 1. Run All Coverage Tests

// turbo

```bash
cd /home/naibarn/projects/SmartSpecPro && bash scripts/ci/run_all.sh
```

This will run coverage tests for:

- Python backend (pytest with 80% coverage threshold)
- API Generator (Jest/Vitest)
- Control Plane (Vitest)
- Desktop App (Vitest)
- SmartSpecWeb (Jest/Vitest)

### 2. View Coverage Summary

After tests complete, view the aggregated coverage summary:

```bash
cd /home/naibarn/projects/SmartSpecPro
python3 scripts/ci/coverage_summary.py \
  --python-xml python-backend/coverage.xml \
  --api-generator api-generator/coverage/coverage-summary.json \
  --control-plane control-plane/coverage/coverage-summary.json \
  --desktop-app desktop-app/coverage/coverage-summary.json \
  --smartspecweb SmartSpecWeb/coverage/coverage-summary.json \
  --out-json coverage_summary.json \
  --out-md coverage_summary.md
```

### 3. View Individual Coverage Reports

**Python Backend:**

```bash
cd /home/naibarn/projects/SmartSpecPro/python-backend
cat coverage.xml
```

**Node.js Packages (HTML reports):**

```bash
# API Generator
open api-generator/coverage/lcov-report/index.html

# Control Plane
open control-plane/coverage/lcov-report/index.html

# Desktop App
open desktop-app/coverage/lcov-report/index.html

# SmartSpecWeb
open SmartSpecWeb/coverage/lcov-report/index.html
```

## Individual Component Tests

### Python Backend Only

// turbo

```bash
cd /home/naibarn/projects/SmartSpecPro && bash scripts/ci/python_tests.sh
```

### API Generator Only

// turbo

```bash
cd /home/naibarn/projects/SmartSpecPro && bash scripts/ci/node_tests.sh api-generator
```

### Control Plane Only

// turbo

```bash
cd /home/naibarn/projects/SmartSpecPro && bash scripts/ci/node_tests.sh control-plane
```

### Desktop App Only

// turbo

```bash
cd /home/naibarn/projects/SmartSpecPro && bash scripts/ci/node_tests.sh desktop-app
```

### SmartSpecWeb Only

// turbo

```bash
cd /home/naibarn/projects/SmartSpecPro && bash scripts/ci/node_tests.sh SmartSpecWeb
```

## Including Integration Tests

By default, integration and E2E tests are skipped. To include them:

```bash
cd /home/naibarn/projects/SmartSpecPro
RUN_INTEGRATION_TESTS=1 bash scripts/ci/run_all.sh
```

## Notes

- Python backend requires 80% minimum coverage (configured in pytest.ini)
- Coverage reports are generated in each component's directory
- CI/CD automatically runs these tests on push/PR (see .github/workflows/ci.yml)
- Coverage badges are automatically updated on the badges branch
