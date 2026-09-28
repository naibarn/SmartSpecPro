# Request

Implement a complete Meta / Facebook Pages configuration experience in
SmartSpecPro Admin Settings.

Requirements:

- Add every required OAuth and webhook field to the UI.
- Explain exactly where each value is created or entered in Meta Developer.
- Provide complete English copy and Thai copy when the application locale is
  Thai.
- Reuse the existing Admin Settings language switcher.
- Make the configuration secure, testable, tenant-aware, responsive, and
  production-ready.

Constraints:

- Preserve existing Google, GitHub, and Microsoft OAuth behavior.
- Do not expose decrypted secrets to the browser or logs.
- Use the current database and encryption format; no schema migration.
- Keep unrelated dirty worktree changes untouched.
- Follow current Admin Settings and Astryx patterns.

Non-goals:

- Adding Instagram account management beyond the existing Meta Page contract.
- Automating Meta App Review submission.
- Deploying or changing production credentials in this implementation.
