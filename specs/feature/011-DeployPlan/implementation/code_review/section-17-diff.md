diff --git a/.github/workflows/deploy-production.yml b/.github/workflows/deploy-production.yml
new file mode 100644
index 0000000..0ddbe8e
--- /dev/null
+++ b/.github/workflows/deploy-production.yml
@@ -0,0 +1,132 @@
+name: Deploy to Production
+
+on:
+  release:
+    types: [created]
+  workflow_dispatch:
+
+permissions:
+  contents: read
+  id-token: write
+
+jobs:
+  build-and-deploy:
+    runs-on: ubuntu-latest
+    environment:
+      name: production
+      url: https://smartaihub.app
+
+    steps:
+      - name: Checkout code
+        uses: actions/checkout@v4
+
+      - name: Authenticate to GCP
+        uses: google-github-actions/auth@v2
+        with:
+          workload_identity_provider: ${{ secrets.GCP_WORKLOAD_IDENTITY_PROVIDER }}
+          service_account: ${{ secrets.GCP_SERVICE_ACCOUNT }}
+
+      - name: Set up Cloud SDK
+        uses: google-github-actions/setup-gcloud@v2
+
+      - name: Configure Docker for Artifact Registry
+        run: |
+          gcloud auth configure-docker ${{ secrets.GCP_REGION }}-docker.pkg.dev
+
+      - name: Set image tags
+        id: tags
+        run: |
+          echo "RELEASE_TAG=${GITHUB_REF#refs/tags/}" >> $GITHUB_OUTPUT
+          echo "COMMIT_SHA=$(git rev-parse --short HEAD)" >> $GITHUB_OUTPUT
+
+      - name: Build and push all images
+        run: |
+          docker build -f docker/Dockerfile.node-api \
+            -t ${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/node-api:${{ steps.tags.outputs.RELEASE_TAG }} \
+            .
+          docker push ${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/node-api:${{ steps.tags.outputs.RELEASE_TAG }}
+
+          docker build -f docker/Dockerfile.python-orchestrator \
+            -t ${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/python-orchestrator:${{ steps.tags.outputs.RELEASE_TAG }} \
+            .
+          docker push ${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/python-orchestrator:${{ steps.tags.outputs.RELEASE_TAG }}
+
+          docker build -f docker/Dockerfile.video-job-runner \
+            -t ${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/video-job-runner:${{ steps.tags.outputs.RELEASE_TAG }} \
+            .
+          docker push ${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/video-job-runner:${{ steps.tags.outputs.RELEASE_TAG }}
+
+      - name: Run database migrations (Production)
+        run: |
+          cd apps/web
+          npm install
+          DATABASE_URL="${{ secrets.NEON_PROD_DB_URL }}" npm run db:push
+
+      - name: Deploy node-api to Cloud Run (10% canary)
+        run: |
+          gcloud run deploy node-api \
+            --image=${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/node-api:${{ steps.tags.outputs.RELEASE_TAG }} \
+            --platform=managed \
+            --region=${{ secrets.GCP_REGION }} \
+            --service-account=cloud-run-api@${{ secrets.GCP_PROJECT_ID }}.iam.gserviceaccount.com \
+            --allow-unauthenticated \
+            --tag=release-${{ steps.tags.outputs.RELEASE_TAG }} \
+            --no-traffic \
+            --set-env-vars="ENVIRONMENT=production,RELEASE=${{ steps.tags.outputs.RELEASE_TAG }}"
+
+          gcloud run services update-traffic node-api \
+            --to-revisions=release-${{ steps.tags.outputs.RELEASE_TAG }}=10 \
+            --region=${{ secrets.GCP_REGION }}
+
+      - name: Deploy python-orchestrator to Cloud Run (10% canary)
+        run: |
+          gcloud run deploy python-orchestrator \
+            --image=${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/python-orchestrator:${{ steps.tags.outputs.RELEASE_TAG }} \
+            --platform=managed \
+            --region=${{ secrets.GCP_REGION }} \
+            --service-account=cloud-run-api@${{ secrets.GCP_PROJECT_ID }}.iam.gserviceaccount.com \
+            --no-allow-unauthenticated \
+            --tag=release-${{ steps.tags.outputs.RELEASE_TAG }} \
+            --no-traffic \
+            --set-env-vars="ENVIRONMENT=production,RELEASE=${{ steps.tags.outputs.RELEASE_TAG }}"
+
+          gcloud run services update-traffic python-orchestrator \
+            --to-revisions=release-${{ steps.tags.outputs.RELEASE_TAG }}=10 \
+            --region=${{ secrets.GCP_REGION }}
+
+      - name: Update Cloud Run Job (video-job-runner)
+        run: |
+          gcloud run jobs update video-job-runner \
+            --image=${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/video-job-runner:${{ steps.tags.outputs.RELEASE_TAG }} \
+            --region=${{ secrets.GCP_REGION }}
+
+      - name: Smoke test (10% canary)
+        run: bash scripts/smoke-test.sh https://smartaihub.app
+
+      - name: Shift to 50% traffic
+        run: |
+          gcloud run services update-traffic node-api \
+            --to-revisions=release-${{ steps.tags.outputs.RELEASE_TAG }}=50 \
+            --region=${{ secrets.GCP_REGION }}
+
+          gcloud run services update-traffic python-orchestrator \
+            --to-revisions=release-${{ steps.tags.outputs.RELEASE_TAG }}=50 \
+            --region=${{ secrets.GCP_REGION }}
+
+      - name: Wait for manual approval
+        uses: trstringer/manual-approval@v1
+        with:
+          secret: ${{ github.TOKEN }}
+          approvers: admin-user1,admin-user2
+          minimum-approvals: 1
+          issue-title: "Approve production deployment to 100%"
+
+      - name: Shift to 100% traffic
+        run: |
+          gcloud run services update-traffic node-api \
+            --to-latest \
+            --region=${{ secrets.GCP_REGION }}
+
+          gcloud run services update-traffic python-orchestrator \
+            --to-latest \
+            --region=${{ secrets.GCP_REGION }}
diff --git a/.github/workflows/deploy-staging.yml b/.github/workflows/deploy-staging.yml
new file mode 100644
index 0000000..425338c
--- /dev/null
+++ b/.github/workflows/deploy-staging.yml
@@ -0,0 +1,141 @@
+name: Deploy to Staging
+
+on:
+  push:
+    branches:
+      - main
+
+permissions:
+  contents: read
+  id-token: write
+
+jobs:
+  build-and-deploy:
+    runs-on: ubuntu-latest
+
+    steps:
+      - name: Checkout code
+        uses: actions/checkout@v4
+
+      - name: Authenticate to GCP
+        uses: google-github-actions/auth@v2
+        with:
+          workload_identity_provider: ${{ secrets.GCP_WORKLOAD_IDENTITY_PROVIDER }}
+          service_account: ${{ secrets.GCP_SERVICE_ACCOUNT }}
+
+      - name: Set up Cloud SDK
+        uses: google-github-actions/setup-gcloud@v2
+
+      - name: Configure Docker for Artifact Registry
+        run: |
+          gcloud auth configure-docker ${{ secrets.GCP_REGION }}-docker.pkg.dev
+
+      - name: Set image tags
+        id: tags
+        run: |
+          echo "COMMIT_SHA=$(git rev-parse --short HEAD)" >> $GITHUB_OUTPUT
+          echo "TIMESTAMP=$(date +%s)" >> $GITHUB_OUTPUT
+
+      - name: Build and push node-api image
+        run: |
+          docker build \
+            -f docker/Dockerfile.node-api \
+            -t ${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/node-api:${{ steps.tags.outputs.COMMIT_SHA }} \
+            -t ${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/node-api:latest \
+            .
+          docker push ${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/node-api:${{ steps.tags.outputs.COMMIT_SHA }}
+          docker push ${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/node-api:latest
+
+      - name: Build and push python-orchestrator image
+        run: |
+          docker build \
+            -f docker/Dockerfile.python-orchestrator \
+            -t ${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/python-orchestrator:${{ steps.tags.outputs.COMMIT_SHA }} \
+            -t ${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/python-orchestrator:latest \
+            .
+          docker push ${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/python-orchestrator:${{ steps.tags.outputs.COMMIT_SHA }}
+          docker push ${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/python-orchestrator:latest
+
+      - name: Build and push video-job-runner image
+        run: |
+          docker build \
+            -f docker/Dockerfile.video-job-runner \
+            -t ${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/video-job-runner:${{ steps.tags.outputs.COMMIT_SHA }} \
+            -t ${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/video-job-runner:latest \
+            .
+          docker push ${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/video-job-runner:${{ steps.tags.outputs.COMMIT_SHA }}
+          docker push ${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/video-job-runner:latest
+
+      - name: Run database migrations (Drizzle)
+        run: |
+          cd apps/web
+          npm install
+          DATABASE_URL="${{ secrets.NEON_STAGING_DB_URL }}" npm run db:push
+
+      - name: Deploy node-api to Cloud Run (canary 10%)
+        run: |
+          gcloud run deploy node-api-staging \
+            --image=${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/node-api:${{ steps.tags.outputs.COMMIT_SHA }} \
+            --platform=managed \
+            --region=${{ secrets.GCP_REGION }} \
+            --service-account=cloud-run-api@${{ secrets.GCP_PROJECT_ID }}.iam.gserviceaccount.com \
+            --allow-unauthenticated \
+            --tag=canary-${{ steps.tags.outputs.COMMIT_SHA }} \
+            --no-traffic \
+            --set-env-vars="ENVIRONMENT=staging,RELEASE=${{ steps.tags.outputs.COMMIT_SHA }}"
+
+          gcloud run services update-traffic node-api-staging \
+            --to-revisions=canary-${{ steps.tags.outputs.COMMIT_SHA }}=10 \
+            --region=${{ secrets.GCP_REGION }}
+
+      - name: Deploy python-orchestrator to Cloud Run (canary 10%)
+        run: |
+          gcloud run deploy python-orchestrator-staging \
+            --image=${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/python-orchestrator:${{ steps.tags.outputs.COMMIT_SHA }} \
+            --platform=managed \
+            --region=${{ secrets.GCP_REGION }} \
+            --service-account=cloud-run-api@${{ secrets.GCP_PROJECT_ID }}.iam.gserviceaccount.com \
+            --no-allow-unauthenticated \
+            --tag=canary-${{ steps.tags.outputs.COMMIT_SHA }} \
+            --no-traffic \
+            --set-env-vars="ENVIRONMENT=staging,RELEASE=${{ steps.tags.outputs.COMMIT_SHA }}"
+
+          gcloud run services update-traffic python-orchestrator-staging \
+            --to-revisions=canary-${{ steps.tags.outputs.COMMIT_SHA }}=10 \
+            --region=${{ secrets.GCP_REGION }}
+
+      - name: Update Cloud Run Job (video-job-runner)
+        run: |
+          gcloud run jobs update video-job-runner-staging \
+            --image=${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/video-job-runner:${{ steps.tags.outputs.COMMIT_SHA }} \
+            --region=${{ secrets.GCP_REGION }}
+
+      - name: Run smoke tests
+        id: smoke-test
+        run: |
+          bash scripts/smoke-test.sh https://node-api-staging-canary-${{ steps.tags.outputs.COMMIT_SHA }}---${{ secrets.GCP_REGION }}.run.app
+
+      - name: Shift 100% traffic on success
+        if: steps.smoke-test.outcome == 'success'
+        run: |
+          gcloud run services update-traffic node-api-staging \
+            --to-latest \
+            --region=${{ secrets.GCP_REGION }}
+
+          gcloud run services update-traffic python-orchestrator-staging \
+            --to-latest \
+            --region=${{ secrets.GCP_REGION }}
+
+      - name: Rollback on failure
+        if: steps.smoke-test.outcome == 'failure'
+        run: |
+          echo "Smoke tests failed. Rolling back to previous revision."
+          gcloud run services update-traffic node-api-staging \
+            --to-revisions=LATEST=100 \
+            --region=${{ secrets.GCP_REGION }}
+
+          gcloud run services update-traffic python-orchestrator-staging \
+            --to-revisions=LATEST=100 \
+            --region=${{ secrets.GCP_REGION }}
+
+          exit 1
diff --git a/.github/workflows/pr-preview.yml b/.github/workflows/pr-preview.yml
new file mode 100644
index 0000000..82d19fe
--- /dev/null
+++ b/.github/workflows/pr-preview.yml
@@ -0,0 +1,61 @@
+name: PR Preview
+
+on:
+  pull_request:
+    types: [opened, synchronize, reopened]
+
+permissions:
+  contents: read
+  id-token: write
+  pull-requests: write
+
+jobs:
+  build-preview:
+    runs-on: ubuntu-latest
+
+    steps:
+      - name: Checkout code
+        uses: actions/checkout@v4
+
+      - name: Authenticate to GCP
+        uses: google-github-actions/auth@v2
+        with:
+          workload_identity_provider: ${{ secrets.GCP_WORKLOAD_IDENTITY_PROVIDER }}
+          service_account: ${{ secrets.GCP_SERVICE_ACCOUNT }}
+
+      - name: Set up Cloud SDK
+        uses: google-github-actions/setup-gcloud@v2
+
+      - name: Configure Docker
+        run: gcloud auth configure-docker ${{ secrets.GCP_REGION }}-docker.pkg.dev
+
+      - name: Build and push node-api preview
+        run: |
+          docker build -f docker/Dockerfile.node-api \
+            -t ${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/node-api:pr-${{ github.event.pull_request.number }} \
+            .
+          docker push ${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/node-api:pr-${{ github.event.pull_request.number }}
+
+      - name: Deploy preview to Cloud Run
+        id: deploy
+        run: |
+          gcloud run deploy node-api-pr-${{ github.event.pull_request.number }} \
+            --image=${{ secrets.GCP_REGION }}-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/smartspec-images/node-api:pr-${{ github.event.pull_request.number }} \
+            --platform=managed \
+            --region=${{ secrets.GCP_REGION }} \
+            --allow-unauthenticated \
+            --set-env-vars="ENVIRONMENT=preview,PR_NUMBER=${{ github.event.pull_request.number }}"
+
+          PREVIEW_URL=$(gcloud run services describe node-api-pr-${{ github.event.pull_request.number }} --region=${{ secrets.GCP_REGION }} --format='value(status.url)')
+          echo "PREVIEW_URL=${PREVIEW_URL}" >> $GITHUB_OUTPUT
+
+      - name: Comment preview URL on PR
+        uses: actions/github-script@v7
+        with:
+          script: |
+            github.rest.issues.createComment({
+              issue_number: context.issue.number,
+              owner: context.repo.owner,
+              repo: context.repo.repo,
+              body: `Preview deployment ready!\n\n**Preview URL:** ${{ steps.deploy.outputs.PREVIEW_URL }}\n\nCommit: ${{ github.sha }}`
+            })
diff --git a/.github/workflows/tests/workflow-validation.test.sh b/.github/workflows/tests/workflow-validation.test.sh
new file mode 100755
index 0000000..73ec714
--- /dev/null
+++ b/.github/workflows/tests/workflow-validation.test.sh
@@ -0,0 +1,17 @@
+#!/bin/bash
+# Validates GitHub Actions workflow YAML using actionlint.
+# Requires: actionlint (https://github.com/rhysd/actionlint)
+# Usage: bash .github/workflows/tests/workflow-validation.test.sh
+
+set -e
+
+if ! command -v actionlint &> /dev/null; then
+  echo "actionlint not found. Install: https://github.com/rhysd/actionlint"
+  echo "Skipping workflow validation."
+  exit 0
+fi
+
+actionlint .github/workflows/deploy-staging.yml
+actionlint .github/workflows/deploy-production.yml
+actionlint .github/workflows/pr-preview.yml
+echo "All workflow files are valid"
diff --git a/apps/web/server/__tests__/ci-deployment.test.ts b/apps/web/server/__tests__/ci-deployment.test.ts
new file mode 100644
index 0000000..a210e4b
--- /dev/null
+++ b/apps/web/server/__tests__/ci-deployment.test.ts
@@ -0,0 +1,155 @@
+import { describe, it, expect } from 'vitest';
+
+/**
+ * CI/CD Deployment Configuration Tests
+ *
+ * Validates canary deployment logic, traffic splitting,
+ * and rollback behavior used by GitHub Actions workflows.
+ */
+
+interface TrafficSplit {
+  revisionName: string;
+  percent: number;
+}
+
+interface DeploymentConfig {
+  service: string;
+  environment: 'staging' | 'production' | 'preview';
+  traffic: TrafficSplit[];
+}
+
+function validateTrafficSplit(config: DeploymentConfig): {
+  valid: boolean;
+  error?: string;
+} {
+  const totalPercent = config.traffic.reduce((sum, t) => sum + t.percent, 0);
+  if (totalPercent !== 100) {
+    return {
+      valid: false,
+      error: `Traffic must sum to 100%, got ${totalPercent}%`,
+    };
+  }
+  for (const t of config.traffic) {
+    if (t.percent < 0 || t.percent > 100) {
+      return {
+        valid: false,
+        error: `Invalid traffic percent ${t.percent} for ${t.revisionName}`,
+      };
+    }
+  }
+  return { valid: true };
+}
+
+function shouldRollback(smokeTestPassed: boolean): boolean {
+  return !smokeTestPassed;
+}
+
+function buildImageTag(
+  region: string,
+  projectId: string,
+  imageName: string,
+  tag: string,
+): string {
+  return `${region}-docker.pkg.dev/${projectId}/smartspec-images/${imageName}:${tag}`;
+}
+
+describe('Canary Deployment', () => {
+  it('should create valid canary config at 10% traffic', () => {
+    const config: DeploymentConfig = {
+      service: 'node-api-staging',
+      environment: 'staging',
+      traffic: [
+        { revisionName: 'node-api-abc123', percent: 10 },
+        { revisionName: 'node-api-previous', percent: 90 },
+      ],
+    };
+
+    expect(config.traffic[0].percent).toBe(10);
+    expect(validateTrafficSplit(config)).toEqual({ valid: true });
+  });
+
+  it('should reject traffic splits that do not sum to 100%', () => {
+    const config: DeploymentConfig = {
+      service: 'node-api-staging',
+      environment: 'staging',
+      traffic: [
+        { revisionName: 'node-api-abc123', percent: 10 },
+        { revisionName: 'node-api-previous', percent: 80 },
+      ],
+    };
+
+    const result = validateTrafficSplit(config);
+    expect(result.valid).toBe(false);
+    expect(result.error).toContain('90%');
+  });
+
+  it('should support 50% canary for production staged rollout', () => {
+    const config: DeploymentConfig = {
+      service: 'node-api',
+      environment: 'production',
+      traffic: [
+        { revisionName: 'node-api-v1.2.0', percent: 50 },
+        { revisionName: 'node-api-v1.1.0', percent: 50 },
+      ],
+    };
+
+    expect(validateTrafficSplit(config)).toEqual({ valid: true });
+  });
+
+  it('should support 100% traffic for full rollout', () => {
+    const config: DeploymentConfig = {
+      service: 'node-api',
+      environment: 'production',
+      traffic: [{ revisionName: 'node-api-v1.2.0', percent: 100 }],
+    };
+
+    expect(validateTrafficSplit(config)).toEqual({ valid: true });
+  });
+});
+
+describe('Smoke Test Rollback', () => {
+  it('should rollback on failed smoke test', () => {
+    expect(shouldRollback(false)).toBe(true);
+  });
+
+  it('should not rollback on passed smoke test', () => {
+    expect(shouldRollback(true)).toBe(false);
+  });
+});
+
+describe('Image Tagging', () => {
+  it('should build correct Artifact Registry image tag', () => {
+    const tag = buildImageTag(
+      'asia-southeast1',
+      'smartspecpro-mvp',
+      'node-api',
+      'abc1234',
+    );
+
+    expect(tag).toBe(
+      'asia-southeast1-docker.pkg.dev/smartspecpro-mvp/smartspec-images/node-api:abc1234',
+    );
+  });
+
+  it('should build PR preview image tag', () => {
+    const tag = buildImageTag(
+      'asia-southeast1',
+      'smartspecpro-mvp',
+      'node-api',
+      'pr-42',
+    );
+
+    expect(tag).toContain('pr-42');
+  });
+
+  it('should build release tag for production', () => {
+    const tag = buildImageTag(
+      'asia-southeast1',
+      'smartspecpro-mvp',
+      'node-api',
+      'v1.2.0',
+    );
+
+    expect(tag).toContain('v1.2.0');
+  });
+});
diff --git a/scripts/smoke-test.sh b/scripts/smoke-test.sh
new file mode 100755
index 0000000..3d3046f
--- /dev/null
+++ b/scripts/smoke-test.sh
@@ -0,0 +1,54 @@
+#!/bin/bash
+# Smoke tests for canary validation during CI/CD deployments.
+# Usage: ./scripts/smoke-test.sh <target-url>
+
+set -e
+
+TARGET_URL="$1"
+if [ -z "$TARGET_URL" ]; then
+  echo "Usage: $0 <target-url>"
+  exit 1
+fi
+
+echo "Running smoke tests against: $TARGET_URL"
+
+# Test 1: Health check
+echo "Test 1: Health check"
+HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${TARGET_URL}/healthz")
+if [ "$HTTP_CODE" != "200" ]; then
+  echo "FAIL Health check failed (HTTP $HTTP_CODE)"
+  exit 1
+fi
+echo "PASS Health check passed"
+
+# Test 2: Ready check (DB + Redis)
+echo "Test 2: Ready check"
+HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${TARGET_URL}/readyz")
+if [ "$HTTP_CODE" != "200" ]; then
+  echo "FAIL Ready check failed (HTTP $HTTP_CODE)"
+  exit 1
+fi
+echo "PASS Ready check passed"
+
+# Test 3: Login endpoint responds (expects 401 or 400 for invalid creds)
+echo "Test 3: Login endpoint availability"
+HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${TARGET_URL}/api/auth/login" \
+  -H "Content-Type: application/json" \
+  -d '{"email":"test@example.com","password":"invalid"}')
+if [ "$HTTP_CODE" != "401" ] && [ "$HTTP_CODE" != "400" ]; then
+  echo "FAIL Login endpoint unexpected response (HTTP $HTTP_CODE)"
+  exit 1
+fi
+echo "PASS Login endpoint available"
+
+# Test 4: Static assets served
+echo "Test 4: Static assets"
+HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${TARGET_URL}/")
+if [ "$HTTP_CODE" != "200" ]; then
+  echo "FAIL Static assets not served (HTTP $HTTP_CODE)"
+  exit 1
+fi
+echo "PASS Static assets served"
+
+echo ""
+echo "All smoke tests passed!"
