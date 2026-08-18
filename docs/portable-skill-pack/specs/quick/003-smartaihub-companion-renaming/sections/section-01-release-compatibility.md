# Section 01: Release Compatibility

Status: Complete

## Ownership

- `apps/web/server/routes/desktopReleases.ts`
- focused release resolver/route tests under `apps/web/server/routes/__tests__/`

## Work and TDD

Write tests proving mixed legacy/canonical filenames are compared together, then add canonical Companion latest/download routes while retaining legacy aliases. Both route families must select the same artifact; their response download URL may use the requested alias.

## Acceptance

- Canonical `0.1.138` wins over legacy `0.1.137`.
- Legacy latest/download routes expose the canonical artifact.
- No old route or file support is removed.
- Missing-release behavior remains unchanged.

## Verification

- `desktopReleases.companionExtension.test.ts`: 3 passing tests.
- Proved registration of both latest/download route families, mixed-name
  highest-version selection, route-specific download aliases, and equal-version
  updated-at tie-breaking.
