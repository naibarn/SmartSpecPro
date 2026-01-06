# README Badges

To enable a real GitHub Actions badge, add this block near the top of `README.md`:

```md
<!-- CI_BADGES_START -->
[![CI](https://github.com/OWNER/REPO/actions/workflows/ci.yml/badge.svg)](https://github.com/OWNER/REPO/actions/workflows/ci.yml)
<!-- CI_BADGES_END -->
```

Then run:

```bash
python3 scripts/ci/update_readme_badges.py --repo OWNER/REPO
```

In GitHub Actions, the script can run without `--repo` because `GITHUB_REPOSITORY` is set automatically.
