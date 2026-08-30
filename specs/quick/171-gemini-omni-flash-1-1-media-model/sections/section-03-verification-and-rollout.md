# Section 03 — verification and rollout

## Ownership

Own final focused gates, stale-gate reruns, and evidence capture. Do not deploy or mutate production DB unless the environment operation is explicitly in scope and credentials are available.

## Required gates

- `npm --workspace apps/web test -- --environment jsdom <focused test files>`
- `python -m pytest <focused provider tests>`
- `git diff --check`
- targeted TypeScript check for affected web modules where available

## Live smoke

If `KIE_AI_API_KEY`/provider configuration and safe public test input are available, run one prompt-only and one single-image smoke through the existing application path with a bounded timeout. Record submission task ID, terminal provider state, result URL/artifact, and durable storage outcome without logging credentials or signed URLs. If unavailable, record exactly which configuration is missing.

## Rollout acceptance

- seed/upsert has been run in the target environment;
- new row is enabled and selectable;
- local contract gates pass;
- live provider evidence is either present or explicitly pending;
- production deployment/browser verification are not claimed unless executed.
