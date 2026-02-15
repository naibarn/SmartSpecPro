#!/bin/bash
# Validates GitHub Actions workflow YAML using actionlint.
# Requires: actionlint (https://github.com/rhysd/actionlint)
# Usage: bash .github/workflows/tests/workflow-validation.test.sh

set -e

if ! command -v actionlint &> /dev/null; then
  echo "actionlint not found. Install: https://github.com/rhysd/actionlint"
  echo "Skipping workflow validation."
  exit 0
fi

actionlint .github/workflows/deploy-staging.yml
actionlint .github/workflows/deploy-production.yml
actionlint .github/workflows/pr-preview.yml
echo "All workflow files are valid"
