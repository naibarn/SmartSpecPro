# Request

Original request: `ให้ทำ implement ให้เลย ป้องกันการเกิดเหตุการณ์ขึ้นอีก`

Implement the approved SocratiCode runtime lifecycle hardening after the 2026-07-16 host incident where SSH/Codex reconnect fan-out and SocratiCode MCP/index workloads caused sustained cgroup memory pressure.

Constraints:
- preserve production data and active interactive MCP sessions;
- no reboot, DB/container-volume recreation, application rollback, or unrelated edits;
- back up host-side runtime files before installation;
- fail closed when container ownership cannot be proven;
- use focused tests, dry-run cleanup, and short live stability snapshots.

Non-goals:
- replace SocratiCode or its image;
- change SmartSpecPro application behavior;
- lower aggregate cgroup limits without new steady-state evidence;
- require an external webhook credential for the prevention mechanism.
