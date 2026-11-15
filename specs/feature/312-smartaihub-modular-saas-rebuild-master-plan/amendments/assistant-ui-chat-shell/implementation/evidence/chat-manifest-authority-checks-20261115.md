# Chat module metadata regression evidence

**Source:** `smartaihub-platform@ad04c244c3996cc81220d7efae0f0c536dd07f4b`
**Change:** Correct stale Chat module `dataAuthority` metadata. The prior value said `writes-disabled-until-scoped-chat-role-is-provisioned`, although the authenticated Core API already implements workspace-scoped conversation creation, attachment storage, queued turn submission and status reads. This was a metadata contradiction; without an authenticated request it is not asserted as the root cause of the earlier send failure.

## RED/GREEN

- Added `modules/chat/src/moduleManifest.test.ts` first; initial run failed because the manifest advertised `writes-disabled...` and lacked the authenticated write, owner-scoped R2 and queue authority labels.
- Updated only the manifest authority description; the regression test then passed with the Chat package suite.

## Checks

| Check | Result |
|---|---|
| `pnpm --filter @smartaihub/chat test -- --reporter=dot` | PASS · 7 files · 43 tests |
| `pnpm --filter @smartaihub/chat typecheck` | PASS |
| `corepack pnpm@10.4.1 install --frozen-lockfile` | PASS on immutable canonical source |
| `corepack pnpm@10.4.1 run build:core` | PASS, Wrangler dry-run |
| `corepack pnpm@10.4.1 run build:shell` | PASS, Wrangler dry-run |
| `corepack pnpm@10.4.1 run build:chat` | PASS, Wrangler dry-run; existing 516.91 kB main-chunk warning |
| Exact-source DEV deployment | PASS · [release receipt](modular-debian-dev-release-ad04c24.md) |

The existing Core auth/queue suite evidence remains in [the previous focused check report](chat-shell-audit-checks-20261115.md) for unchanged Core source. No full repository typecheck was run under the local resource policy. No authenticated browser UAT was possible.
