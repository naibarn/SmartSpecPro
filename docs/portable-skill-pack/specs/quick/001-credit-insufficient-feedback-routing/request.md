# Request

Implement the approved credit-insufficiency feedback policy in SmartSpecPro.

Requirements:

- Ordinary user-credit insufficiency must notify only the affected user to buy credits.
- LLM requests above 3,000 credits are suspicious.
- Media requests may be up to 10,000 credits; above that is suspicious.
- Unknown model context uses the conservative 3,000-credit threshold.
- Provider-account credit failures such as KIE.ai/OpenRouter always alert admins at critical priority.
- Preserve unrelated auto-feedback behavior, tenant boundaries, deduplication, and best-effort error handling.

Constraints:

- The worktree is heavily dirty; only focused files may be changed.
- No database migration is expected.
- User explicitly approved the design and requested autonomous completion without another confirmation.
