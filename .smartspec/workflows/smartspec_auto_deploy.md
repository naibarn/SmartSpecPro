# SmartSpec Auto Deploy Workflow

## Overview

This workflow handles automatic deployment of the project to production environments (Vercel, Netlify, or custom) after passing the quality gate.

## Trigger

This workflow is triggered automatically by `smartspec_quality_gate` when:
- All tests pass
- Code coverage >= 80%
- No critical issues detected

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `project_path` | string | Yes | - | Path to the project root |
| `deploy_target` | string | No | `vercel` | Deployment target: `vercel`, `netlify`, `github-pages`, `custom` |
| `branch` | string | No | `main` | Branch to deploy |
| `environment` | string | No | `production` | Environment: `preview`, `staging`, `production` |
| `auto_confirm` | boolean | No | `false` | Skip deployment confirmation |

## Workflow Steps

### Step 1: Pre-Deployment Checks

```yaml
action: pre_deploy_check
tasks:
  - verify_build_success
  - verify_tests_passed
  - verify_coverage_threshold
  - check_deploy_config
```

**Verification:**
- Build artifacts exist and are valid
- All tests passed in the previous step
- Coverage meets minimum threshold (80%)
- Deployment configuration exists (vercel.json, netlify.toml, etc.)

### Step 2: Prepare Deployment

```yaml
action: prepare_deployment
tasks:
  - generate_deploy_config
  - set_environment_variables
  - create_deployment_branch
```

**Tasks:**
1. Generate or update deployment configuration based on project type
2. Set required environment variables (API keys, database URLs)
3. Create a deployment branch if needed (e.g., `deploy/production`)

### Step 3: Request Deployment Approval (Optional)

```yaml
action: request_approval
condition: "!auto_confirm"
artifact_type: deployment_plan
preview: |
  ## Deployment Plan
  
  **Target:** {{ deploy_target }}
  **Environment:** {{ environment }}
  **Branch:** {{ branch }}
  
  ### Changes to Deploy
  {{ git_diff_summary }}
  
  ### Environment Variables
  {{ env_vars_summary }}
next_command: /smartspec_auto_deploy --continue
```

If `auto_confirm` is false, the workflow will pause and request user approval before proceeding.

### Step 4: Execute Deployment

```yaml
action: deploy
tasks:
  - trigger_deployment
  - wait_for_completion
  - verify_deployment
```

**Deployment Methods:**

#### Vercel
```bash
# Using Vercel CLI
vercel --prod --yes

# Or trigger via GitHub Action
gh workflow run deploy.yml -f environment=production
```

#### Netlify
```bash
# Using Netlify CLI
netlify deploy --prod

# Or trigger via GitHub Action
gh workflow run deploy.yml -f environment=production
```

#### GitHub Pages
```bash
# Push to gh-pages branch
git push origin main:gh-pages
```

#### Custom
```bash
# Execute custom deploy script
./scripts/deploy.sh --env production
```

### Step 5: Post-Deployment Verification

```yaml
action: verify_deployment
tasks:
  - check_deployment_status
  - run_smoke_tests
  - verify_endpoints
```

**Verification Tasks:**
1. Check deployment status from provider API
2. Run smoke tests against deployed URL
3. Verify critical endpoints are responding

### Step 6: Report Deployment Result

```yaml
action: report_result
output:
  success: boolean
  deployment_url: string
  deployment_id: string
  duration: string
  logs: string[]
```

## Output

Upon successful completion, the workflow outputs:

```json
{
  "success": true,
  "deployment_url": "https://my-app.vercel.app",
  "deployment_id": "dpl_abc123",
  "environment": "production",
  "duration": "2m 34s",
  "commit": "abc1234",
  "logs": [
    "Building project...",
    "Uploading assets...",
    "Deployment complete!"
  ]
}
```

## Error Handling

| Error | Action |
|-------|--------|
| Build failed | Abort deployment, report error |
| Deploy config missing | Generate default config, retry |
| Deployment timeout | Retry up to 3 times |
| Smoke tests failed | Rollback to previous version |
| Provider API error | Retry with exponential backoff |

## Integration with Quality Gate

This workflow is designed to be called from `smartspec_quality_gate`:

```yaml
# In smartspec_quality_gate.md
on_success:
  - workflow: smartspec_auto_deploy
    params:
      project_path: "{{ project_path }}"
      deploy_target: "{{ deploy_target }}"
      environment: "production"
```

## GitHub Action Integration

Create `.github/workflows/auto_deploy.yml`:

```yaml
name: Auto Deploy

on:
  workflow_dispatch:
    inputs:
      environment:
        description: 'Deployment environment'
        required: true
        default: 'production'
        type: choice
        options:
          - preview
          - staging
          - production

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Build
        run: npm run build
        
      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
```

## Notes

- Always ensure secrets are properly configured before deployment
- Use preview deployments for testing before production
- Monitor deployment logs for any issues
- Set up alerts for deployment failures
