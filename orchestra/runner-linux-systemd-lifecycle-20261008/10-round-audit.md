# Linux Runner lifecycle audit — 10 rounds

Baseline: `0f3e8a30ca59d41d671618313b9960a49fc3b73f`; source package only, no physical host.

1. Requirements: SPEC-205 section 09 requires Linux x86_64 install/start/reconnect and explicitly blocks physical completion without a host. Installer supplies the bounded lifecycle; host remains unverified.
2. Ownership: uses the existing `smartaihub-runner`, `sah-runner-v1`, and user systemd manager; no new control plane or protocol.
3. Data flow: service executes `run`; enrollment stays an explicit `connect` operation before first service start.
4. Authorization: no credentials are handled by the installer; existing Runner enrollment/approval path remains authoritative.
5. Privileges: root is rejected; only `systemctl --user` is called; no sudo, permission changes, listener, or lingering change.
6. Install failure: staged files and backups are cleaned; previous files are restored on daemon reload/restart failure. Fake-systemctl test covers rollback.
7. Upgrade and recovery: service is restarted only when it was active; inactive service remains inactive; old binary/unit are restored after restart failure.
8. Uninstall and data retention: removes only binary/unit and requests user-manager disable/stop; enrollment and workspace data are preserved by source and test.
9. Release integrity: existing manual signed release gate remains; Linux tar contains executable, installer and unit. No signature or release publication is claimed by local tests.
10. Verification and remaining gap: installer tests, shell syntax, workflow policy verifier and diff hygiene pass. Real Linux systemd lifecycle and signed release asset remain pending; no additional in-scope source gap found.
