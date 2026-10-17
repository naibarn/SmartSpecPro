# Backlog

1. [IN PROGRESS] Integrate translation-DOM-mutation prevention and outer React error boundary into configured canonical `main` using the protected PR flow.
2. [PENDING] Run `pnpm run build:canonical` against the integrated exact SHA; build must use `/mnt` canonical source root.
3. [PENDING] Deploy only the frontend hotfix using the repository production path; do not alter database schema or restart unrelated services.
4. [PENDING] Verify production `/login` HTML has no-translate markers, assets load, route responds, and no blank page after ordinary repeated navigation; report limitations of non-browser verification.
