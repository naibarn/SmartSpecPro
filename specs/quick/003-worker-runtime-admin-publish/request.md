# Request

Build a complete, simple UI-driven Worker Runtime release flow for Smart AI Hub.

Approved constraints:

- Only system admins can publish.
- Admin uploads a pre-built and signed ZIP through the UI.
- Artifacts are separate per platform/runtime but share a release version.
- Partial release is allowed: Windows/WSL2 can be current while macOS is pending.
- Do not require users to edit environment variables.
- Do not put a private signing key in browser code or application database.

The Worker App must expose Update/Repair in Runtime & agents and consume the same published runtime catalog.
