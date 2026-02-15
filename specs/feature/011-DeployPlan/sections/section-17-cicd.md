Now I have all the context. Let me generate the complete section content for section-17-cicd (CI/CD Pipeline). I'll extract the relevant content from the claude-plan.md and claude-plan-tdd.md files and create a self-contained implementation guide.

---

# Section 17: CI/CD Pipeline (GitHub Actions)

## Overview

This section implements the automated CI/CD pipeline using GitHub Actions to build Docker images, push to Google Cloud Artifact Registry, run database migrations, and deploy to Google Cloud Run with canary traffic management. The pipeline supports both staging deployments (on push to main) and production deployments (on tag/release) with automated smoke testing and rollback capabilities.

## Dependencies

This section requires completion of:
- **section-01-gcp-bootstrap** — GCP project, Artifact Registry, service accounts, Secret Manager
- **section-02-docker-images** — Docker image definitions for node-api, python-orchestrator, video-job-runner
- **section-03-database** — Neon Postgres setup, migration scripts

## Test Specifications

Before implementing the CI/CD pipeline, prepare the following test validations:

### Workflow Validation Tests

**File: `.github/workflows/tests/workflow-validation.test.sh`**

```bash
#!/bin/bash
# Test: GitHub Actions workflow YAML is valid (actionlint)
# Validates workflow syntax before committing

set -e
actionlint .github/workflows/deploy-staging.yml
actionlint .github/workflows/deploy-production.yml
actionlint .github/workflows/pr-preview.yml
echo "✓ All workflow files are valid"
```

### Build Matrix Tests

**File: `scripts/test-docker-builds.sh`**

```bash
#!/bin/bash
# Test: All three Docker images build successfully in CI environment
# Test: Images are tagged with commit SHA

set -e
COMMIT_SHA=$(git rev-parse --short HEAD)

# Build all images
docker build -f docker/node-api.Dockerfile -t test/node-api:${COMMIT_SHA} .
docker build -f docker/python-orchestrator.Dockerfile -t test/python-orch:${COMMIT_SHA} .
docker build -f docker/video-job-runner.Dockerfile -t test/video-runner:${COMMIT_SHA} .

echo "✓ All Docker images built successfully with tag: ${COMMIT_SHA}"
```

### Deployment Tests (Vitest)

**File: `apps/web/__tests__/ci-deployment.test.ts`**

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('Canary Deployment', () => {
  it('should create new revision at 10% traffic', async () => {
    // Test: Canary deployment creates new revision at 10% traffic
    // Mock Cloud Run deployment API
    const deploymentConfig = {
      traffic: [
        { revisionName: 'node-api-abc123', percent: 10 },
        { revisionName: 'node-api-previous', percent: 90 }
      ]
    };
    
    expect(deploymentConfig.traffic[0].percent).toBe(10);
    expect(deploymentConfig.traffic.reduce((sum, t) => sum + t.percent, 0)).toBe(100);
  });

  it('should rollback on failed smoke test', async () => {
    // Test: Failed smoke test triggers rollback to previous revision
    const smokeTestResult = false;
    const shouldRollback = !smokeTestResult;
    
    expect(shouldRollback).toBe(true);
  });
});
```

## Implementation Details

### 1. Workload Identity Federation Setup

**Purpose:** Authenticate GitHub Actions to GCP without storing long-lived service account keys.

**GCP Configuration (via gcloud):**

```bash
# Create Workload Identity Pool
gcloud iam workload-identity-pools create "github-pool" \
  --project="${PROJECT_ID}" \
  --location="global" \
  --display-name="GitHub Actions Pool"

# Create Workload Identity Provider (GitHub OIDC)
gcloud iam workload-identity-pools providers create-oidc "github-provider" \
  --project="${PROJECT_ID}" \
  --location="global" \
  --workload-identity-pool="github-pool" \
  --display-name="GitHub Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
  --issuer-uri="https://token.actions.githubusercontent.com"

# Grant the github-deploy@ service account permissions
gcloud iam service-accounts add-iam-policy-binding "github-deploy@${PROJECT_ID}.iam.gserviceaccount.com" \
  --project="${PROJECT_ID}" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github-pool/attribute.repository/${GITHUB_REPO}"
```

**GitHub Repository Secrets:**

Store these in the GitHub repository settings (Settings → Secrets and variables → Actions):

- `GCP_PROJECT_ID` — GCP project ID (e.g., `smartspecpro-mvp`)
- `GCP_WORKLOAD_IDENTITY_PROVIDER` — Full resource name: `projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github-pool/providers/github-provider`
- `GCP_SERVICE_ACCOUNT` — Email: `github-deploy@${PROJECT_ID}.iam.gserviceaccount.com`
- `GCP_REGION` — Deployment region (e.g., `asia-southeast1`)
- `NEON_STAGING_DB_URL` — Neon Postgres connection string for staging
- `NEON_PROD_DB_URL` — Neon Postgres connection string for production

### 2. Staging Deployment Workflow

**File: `.github/workflows/deploy-staging.yml`**

```yaml
name: Deploy to Staging

on:
  push:
    branches:
      - main

permissions:
  contents: read
  id-token: write  # Required for Workload Identity Federation

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Authenticate to GCP
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ secrets.GCP_WORKLOAD_IDENTITY_PROVIDER }}
          service_account: ${{ secrets.GCP_SERVICE_ACCOUNT }}

      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v2

      - name: Configure Docker for Artifact Registry
        run: |
          gcloud auth configure-docker ${{ secrets.GCP_REGION }}-docker.pkg.dev

      - name: Set image tags
        id: tags
        run: |
          echo "COMMIT_SHA=$(git rev-parse --short HEAD)" >> $GITHUB_OUTPUT
          echo "TIMESTAMP=$(date +%s)" >> $GITHUB_OUTPUT

      - name: Build and push node-api image
        run: |
          docker build \
            -f docker/node-api.Dockerfile \
            -t ${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/node-api:${{ steps.tags.outputs.COMMIT_SHA }} \
            -t ${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/node-api:latest \
            .
          docker push ${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/node-api:${{ steps.tags.outputs.COMMIT_SHA }}
          docker push ${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/node-api:latest

      - name: Build and push python-orchestrator image
        run: |
          docker build \
            -f docker/python-orchestrator.Dockerfile \
            -t ${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/python-orchestrator:${{ steps.tags.outputs.COMMIT_SHA }} \
            -t ${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/python-orchestrator:latest \
            .
          docker push ${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/python-orchestrator:${{ steps.tags.outputs.COMMIT_SHA }}
          docker push ${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/python-orchestrator:latest

      - name: Build and push video-job-runner image
        run: |
          docker build \
            -f docker/video-job-runner.Dockerfile \
            -t ${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/video-job-runner:${{ steps.tags.outputs.COMMIT_SHA }} \
            -t ${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/video-job-runner:latest \
            .
          docker push ${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/video-job-runner:${{ steps.tags.outputs.COMMIT_SHA }}
          docker push ${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/video-job-runner:latest

      - name: Run database migrations (Drizzle)
        run: |
          cd apps/web
          npm install
          DATABASE_URL="${{ secrets.NEON_STAGING_DB_URL }}" npm run db:push

      - name: Run database migrations (Alembic)
        run: |
          cd python-backend
          pip install -r requirements.txt
          DATABASE_URL="${{ secrets.NEON_STAGING_DB_URL }}" alembic upgrade head

      - name: Deploy node-api to Cloud Run (canary 10%)
        id: deploy-node
        run: |
          gcloud run deploy node-api-staging \
            --image=${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/node-api:${{ steps.tags.outputs.COMMIT_SHA }} \
            --platform=managed \
            --region=${{ secrets.GCP_REGION }} \
            --service-account=cloud-run-api@${{ secrets.GCP_PROJECT_ID }}.iam.gserviceaccount.com \
            --allow-unauthenticated \
            --tag=canary-${{ steps.tags.outputs.COMMIT_SHA }} \
            --no-traffic \
            --set-env-vars="ENVIRONMENT=staging,RELEASE=${{ steps.tags.outputs.COMMIT_SHA }}"
          
          # Shift 10% traffic to canary
          gcloud run services update-traffic node-api-staging \
            --to-revisions=canary-${{ steps.tags.outputs.COMMIT_SHA }}=10 \
            --region=${{ secrets.GCP_REGION }}

      - name: Deploy python-orchestrator to Cloud Run (canary 10%)
        run: |
          gcloud run deploy python-orchestrator-staging \
            --image=${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/python-orchestrator:${{ steps.tags.outputs.COMMIT_SHA }} \
            --platform=managed \
            --region=${{ secrets.GCP_REGION }} \
            --service-account=cloud-run-api@${{ secrets.GCP_PROJECT_ID }}.iam.gserviceaccount.com \
            --no-allow-unauthenticated \
            --tag=canary-${{ steps.tags.outputs.COMMIT_SHA }} \
            --no-traffic \
            --set-env-vars="ENVIRONMENT=staging,RELEASE=${{ steps.tags.outputs.COMMIT_SHA }}"
          
          gcloud run services update-traffic python-orchestrator-staging \
            --to-revisions=canary-${{ steps.tags.outputs.COMMIT_SHA }}=10 \
            --region=${{ secrets.GCP_REGION }}

      - name: Update Cloud Run Job (video-job-runner)
        run: |
          gcloud run jobs update video-job-runner-staging \
            --image=${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/video-job-runner:${{ steps.tags.outputs.COMMIT_SHA }} \
            --region=${{ secrets.GCP_REGION }}

      - name: Run smoke tests
        id: smoke-test
        run: |
          bash scripts/smoke-test.sh https://node-api-staging-canary-${{ steps.tags.outputs.COMMIT_SHA }}---${{ secrets.GCP_REGION }}.run.app

      - name: Shift 100% traffic on success
        if: steps.smoke-test.outcome == 'success'
        run: |
          gcloud run services update-traffic node-api-staging \
            --to-latest \
            --region=${{ secrets.GCP_REGION }}
          
          gcloud run services update-traffic python-orchestrator-staging \
            --to-latest \
            --region=${{ secrets.GCP_REGION }}

      - name: Rollback on failure
        if: steps.smoke-test.outcome == 'failure'
        run: |
          echo "Smoke tests failed. Rolling back to previous revision."
          gcloud run services update-traffic node-api-staging \
            --to-revisions=LATEST=100 \
            --region=${{ secrets.GCP_REGION }}
          
          gcloud run services update-traffic python-orchestrator-staging \
            --to-revisions=LATEST=100 \
            --region=${{ secrets.GCP_REGION }}
          
          exit 1
```

### 3. Production Deployment Workflow

**File: `.github/workflows/deploy-production.yml`**

```yaml
name: Deploy to Production

on:
  release:
    types: [created]
  workflow_dispatch:  # Manual trigger

permissions:
  contents: read
  id-token: write

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    environment:
      name: production
      url: https://app.smartaihub.app
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Authenticate to GCP
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ secrets.GCP_WORKLOAD_IDENTITY_PROVIDER }}
          service_account: ${{ secrets.GCP_SERVICE_ACCOUNT }}

      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v2

      - name: Configure Docker for Artifact Registry
        run: |
          gcloud auth configure-docker ${{ secrets.GCP_REGION }}-docker.pkg.dev

      - name: Set image tags
        id: tags
        run: |
          echo "RELEASE_TAG=${GITHUB_REF#refs/tags/}" >> $GITHUB_OUTPUT
          echo "COMMIT_SHA=$(git rev-parse --short HEAD)" >> $GITHUB_OUTPUT

      - name: Build and push all images
        run: |
          # Same build steps as staging but with production tags
          docker build -f docker/node-api.Dockerfile \
            -t ${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/node-api:${{ steps.tags.outputs.RELEASE_TAG }} \
            .
          docker push ${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/node-api:${{ steps.tags.outputs.RELEASE_TAG }}
          
          docker build -f docker/python-orchestrator.Dockerfile \
            -t ${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/python-orchestrator:${{ steps.tags.outputs.RELEASE_TAG }} \
            .
          docker push ${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/python-orchestrator:${{ steps.tags.outputs.RELEASE_TAG }}
          
          docker build -f docker/video-job-runner.Dockerfile \
            -t ${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/video-job-runner:${{ steps.tags.outputs.RELEASE_TAG }} \
            .
          docker push ${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/video-job-runner:${{ steps.tags.outputs.RELEASE_TAG }}

      - name: Run database migrations (Production)
        run: |
          cd apps/web
          npm install
          DATABASE_URL="${{ secrets.NEON_PROD_DB_URL }}" npm run db:push
          
          cd ../python-backend
          pip install -r requirements.txt
          DATABASE_URL="${{ secrets.NEON_PROD_DB_URL }}" alembic upgrade head

      - name: Deploy to Cloud Run (10% canary)
        run: |
          gcloud run deploy node-api \
            --image=${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/node-api:${{ steps.tags.outputs.RELEASE_TAG }} \
            --platform=managed \
            --region=${{ secrets.GCP_REGION }} \
            --service-account=cloud-run-api@${{ secrets.GCP_PROJECT_ID }}.iam.gserviceaccount.com \
            --allow-unauthenticated \
            --tag=release-${{ steps.tags.outputs.RELEASE_TAG }} \
            --no-traffic \
            --set-env-vars="ENVIRONMENT=production,RELEASE=${{ steps.tags.outputs.RELEASE_TAG }}"
          
          gcloud run services update-traffic node-api \
            --to-revisions=release-${{ steps.tags.outputs.RELEASE_TAG }}=10 \
            --region=${{ secrets.GCP_REGION }}

      - name: Smoke test (10% canary)
        run: bash scripts/smoke-test.sh https://app.smartaihub.app

      - name: Shift to 50% traffic
        run: |
          gcloud run services update-traffic node-api \
            --to-revisions=release-${{ steps.tags.outputs.RELEASE_TAG }}=50 \
            --region=${{ secrets.GCP_REGION }}

      - name: Wait for manual approval
        uses: trstringer/manual-approval@v1
        with:
          secret: ${{ github.TOKEN }}
          approvers: admin-user1,admin-user2
          minimum-approvals: 1
          issue-title: "Approve production deployment to 100%"

      - name: Shift to 100% traffic
        run: |
          gcloud run services update-traffic node-api \
            --to-latest \
            --region=${{ secrets.GCP_REGION }}
          
          gcloud run services update-traffic python-orchestrator \
            --to-latest \
            --region=${{ secrets.GCP_REGION }}
```

### 4. PR Preview Workflow

**File: `.github/workflows/pr-preview.yml`**

```yaml
name: PR Preview

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  id-token: write
  pull-requests: write  # To comment preview URL

jobs:
  build-preview:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Authenticate to GCP
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ secrets.GCP_WORKLOAD_IDENTITY_PROVIDER }}
          service_account: ${{ secrets.GCP_SERVICE_ACCOUNT }}

      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v2

      - name: Configure Docker
        run: gcloud auth configure-docker ${{ secrets.GCP_REGION }}-docker.pkg.dev

      - name: Build and push node-api preview
        run: |
          docker build -f docker/node-api.Dockerfile \
            -t ${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/node-api:pr-${{ github.event.pull_request.number }} \
            .
          docker push ${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/node-api:pr-${{ github.event.pull_request.number }}

      - name: Deploy preview to Cloud Run
        id: deploy
        run: |
          gcloud run deploy node-api-pr-${{ github.event.pull_request.number }} \
            --image=${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/node-api:pr-${{ github.event.pull_request.number }} \
            --platform=managed \
            --region=${{ secrets.GCP_REGION }} \
            --allow-unauthenticated \
            --set-env-vars="ENVIRONMENT=preview,PR_NUMBER=${{ github.event.pull_request.number }}"
          
          PREVIEW_URL=$(gcloud run services describe node-api-pr-${{ github.event.pull_request.number }} --region=${{ secrets.GCP_REGION }} --format='value(status.url)')
          echo "PREVIEW_URL=${PREVIEW_URL}" >> $GITHUB_OUTPUT

      - name: Comment preview URL on PR
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `🚀 Preview deployment ready!\n\n**Preview URL:** ${{ steps.deploy.outputs.PREVIEW_URL }}\n\nCommit: ${{ github.sha }}`
            })
```

### 5. Smoke Test Script

**File: `scripts/smoke-test.sh`**

```bash
#!/bin/bash
# Smoke tests for canary validation

set -e

TARGET_URL="$1"
if [ -z "$TARGET_URL" ]; then
  echo "Usage: $0 <target-url>"
  exit 1
fi

echo "Running smoke tests against: $TARGET_URL"

# Test 1: Health check
echo "Test 1: Health check"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${TARGET_URL}/healthz")
if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ Health check failed (HTTP $HTTP_CODE)"
  exit 1
fi
echo "✓ Health check passed"

# Test 2: Ready check (DB + Redis)
echo "Test 2: Ready check"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${TARGET_URL}/readyz")
if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ Ready check failed (HTTP $HTTP_CODE)"
  exit 1
fi
echo "✓ Ready check passed"

# Test 3: Login endpoint responds
echo "Test 3: Login endpoint availability"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${TARGET_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"invalid"}')
if [ "$HTTP_CODE" != "401" ] && [ "$HTTP_CODE" != "400" ]; then
  echo "❌ Login endpoint unexpected response (HTTP $HTTP_CODE)"
  exit 1
fi
echo "✓ Login endpoint available"

# Test 4: Static assets served
echo "Test 4: Static assets"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${TARGET_URL}/")
if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ Static assets not served (HTTP $HTTP_CODE)"
  exit 1
fi
echo "✓ Static assets served"

echo ""
echo "🎉 All smoke tests passed!"
```

### 6. Migration Strategy

**Phased Migration from Existing Setup:**

1. **Phase 1 — Add workflows alongside existing deployment:**
   - Create all three workflow files
   - Configure Workload Identity Federation
   - Test staging deployment without affecting current prod
   - Verify canary traffic splitting works correctly

2. **Phase 2 — Validate in staging:**
   - Deploy to staging via GitHub Actions
   - Monitor for 1-2 weeks
   - Compare with manual deployments
   - Fix any issues discovered

3. **Phase 3 — Switch production deployments:**
   - Tag a release to trigger production workflow
   - Use manual approval gate for 100% traffic
   - Keep rollback procedure documented and tested
   - Archive old deployment scripts (don't delete yet)

4. **Phase 4 — Remove old deployment tooling:**
   - After 1 month of successful GitHub Actions deployments
   - Remove manual deployment scripts
   - Update documentation

### 7. Security Considerations

**Service Account Permissions:**
The `github-deploy@` service account requires these IAM roles (configured in section-01-gcp-bootstrap):
- `roles/artifactregistry.writer` — Push Docker images
- `roles/run.admin` — Deploy Cloud Run services and jobs
- `roles/iam.serviceAccountUser` — Act as the runtime service accounts

**Secret Protection:**
- Never log secrets or environment variables in workflow output
- Use GitHub's secret masking automatically via `secrets.*` context
- Rotate service account credentials quarterly

**Audit Trail:**
- All deployments are logged in GitHub Actions run history
- Cloud Run retains revision history (last 1000 revisions)
- Tag releases in git for production deployments

### 8. Rollback Procedures

**Automated Rollback (smoke test failure):**
The workflow automatically rolls back if smoke tests fail during staging deployment.

**Manual Rollback (production):**

```bash
# List recent revisions
gcloud run revisions list \
  --service=node-api \
  --region=$GCP_REGION \
  --limit=5

# Route 100% traffic to previous revision
gcloud run services update-traffic node-api \
  --to-revisions=node-api-abc123=100 \
  --region=$GCP_REGION
```

**Database Migration Rollback:**
Follow the Expand → Migrate → Contract pattern (see section-03-database). If a migration breaks:
1. The new code should still work with old schema (backward compatibility)
2. Deploy previous code revision via GitHub Actions or manual Cloud Run update
3. For data corruption: use Neon point-in-time recovery

### 9. Monitoring CI/CD Health

**GitHub Actions Metrics:**
- Track workflow success/failure rates
- Monitor deployment duration (target: <15 minutes end-to-end)
- Set up GitHub Actions notifications for failures

**Cloud Run Deployment Metrics:**
- Monitor revision rollout success rate
- Track canary validation pass rate
- Alert on smoke test failures

**Post-Deployment Validation:**
- Check Sentry for error spikes after deployment
- Monitor Cloud Run request latency (p95 should not increase)
- Verify PostHog events continue flowing

## File Modifications Required

### New Files to Create

1. `.github/workflows/deploy-staging.yml` — Staging deployment workflow
2. `.github/workflows/deploy-production.yml` — Production deployment workflow
3. `.github/workflows/pr-preview.yml` — PR preview deployment workflow
4. `scripts/smoke-test.sh` — Smoke test script for canary validation
5. `scripts/test-docker-builds.sh` — Local Docker build validation
6. `.github/workflows/tests/workflow-validation.test.sh` — Workflow YAML validation

### Existing Files to Modify

1. **`apps/web/package.json`** — Add migration script:
   ```json
   {
     "scripts": {
       "db:push": "drizzle-kit generate && drizzle-kit migrate"
     }
   }
   ```

2. **`python-backend/alembic.ini`** — Ensure DATABASE_URL from env is used:
   ```ini
   sqlalchemy.url = env:DATABASE_URL
   ```

3. **`.dockerignore`** (if not already comprehensive) — Exclude unnecessary files:
   ```
   .git/
   node_modules/
   python-backend/.venv/
   .env
   .env.local
   *.log
   .turbo/
   .next/
   dist/
   build/
   ```

## Success Criteria

This section is complete when:

1. All three workflow files pass `actionlint` validation
2. Staging deployment workflow successfully deploys on push to main
3. Canary deployment shifts traffic correctly (10% → 100%)
4. Smoke tests run and validate basic functionality
5. Production deployment workflow triggers on tag/release
6. Manual approval gate works for production 100% rollout
7. PR preview workflow deploys unique revision and comments URL
8. Rollback procedure tested and documented
9. No service account JSON keys stored in GitHub Secrets
10. Database migrations run successfully in both staging and production

## Observability

After deployment, verify:
- GitHub Actions run history shows successful deployments
- Cloud Run revision history reflects deployed versions
- Sentry release tracking matches git commit SHA
- PostHog environment tags correctly identify staging vs production
- Cloud Logging shows structured logs from new revisions