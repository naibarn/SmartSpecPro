# Coverage Badge (Shields Endpoint)

This repo can publish a coverage badge JSON that Shields.io can render.

## How it works

1) CI aggregates coverage across packages into `coverage_summary.json`
2) CI generates `badges/coverage.json` using `scripts/ci/coverage_badge.py`
3) CI pushes that file to a dedicated branch: `badges`
4) README renders the badge using Shields endpoint:

- JSON endpoint (raw):
  `https://raw.githubusercontent.com/OWNER/REPO/badges/badges/coverage.json`

- Badge image (Shields):
  `https://img.shields.io/endpoint?url=<urlencoded-json-endpoint>`

## Enable publishing

Publishing is enabled by the GitHub Actions workflow for pushes to the default branch.
It does **not** publish on pull requests.

If your repo disallows workflow pushes, enable:
- Workflow permissions: **Read and write permissions**
- Or use a PAT/Deploy key (advanced)

## Local update

After you push a new branch name or fork, update README badges:

```bash
python3 scripts/ci/update_readme_badges.py --repo OWNER/REPO
```
