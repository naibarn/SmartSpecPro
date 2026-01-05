# Feature Specs Map

Last updated: 2026-01-05

- **001-workflow-scripts**: local workflow engine (`.smartspec/ss_autopilot`) used by Desktop (004) and tests (008)
- **002-auth-generator**: generator/template (CLI) used optionally by Web server (003) or Python backend (007)
- **003-smartspec-website**: full-stack web app in `SmartSpecWeb/` (React/Vite + Node/Express + tRPC + Drizzle)
- **004-desktop-app**: desktop (Tauri+React) runs workflows via python bridge and calls python backend (007)
- **005-api-generator**: generator CLI used primarily by Web server (003), optionally by 007/001
- **006-docker**: run/deploy stack for 003 (and optionally 007)
- **007-python-backend**: tooling/local backend for desktop and optional integration
- **008-tests-and-validators**: tests for 001 + validators fixtures
