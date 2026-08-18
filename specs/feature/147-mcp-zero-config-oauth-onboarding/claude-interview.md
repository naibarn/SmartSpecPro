# Feature 147 planning interview record

No blocking user interview was required for the planning pass. The request establishes the product decisions:

- supported first-party clients are Hermes, Claude, and Codex;
- user setup should require only the MCP server URL;
- authentication should happen in a SmartAIHub browser window with explicit approval;
- user complexity should be minimized without weakening tenant/device/scope security;
- implementation planning comes before deep-implementation;
- existing Hermes pairing remains compatible during migration.

Planning assumptions to verify during implementation gates:

1. `smartaihub.app` is the production issuer and canonical resource host.
2. Claude's documented DCR/callback behavior is available for the target account tier.
3. The deployed SmartAIHub environment can safely provision and rotate an asymmetric OAuth signing key through its existing secret/key-management process.
4. A real live Codex MCP OAuth test account/environment will be provided before enabling Codex compatibility as PASS.
