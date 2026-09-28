# Request

Implement the approved free-credit inactivity lifecycle for SmartSpecPro.
Users receiving positive free credits through signup or invite code get a
15-day inactivity window. If they do not spend credits or purchase credits,
remaining credits are reset to zero and the account is disabled. A successful
purchase permanently cancels the policy. Show a clear Dashboard warning once
per UTC day on login. Exclude admin/system users from automatic disabling.

## Repository assumptions

- `users.lastCreditUsedAt` is already updated by the central credit deduction
  path.
- Signup and invite bonuses currently use multiple paths, including one direct
  balance write that must be normalized.
- The existing inactive-user job can remain as a background backstop.
- The worktree is heavily dirty; unrelated changes must be preserved.

## Non-goals

- Building a general notification center.
- Changing paid-credit expiration or subscription policy.
- Automatically reactivating an account after purchase.
- Running real payment/provider or authenticated production checks.
