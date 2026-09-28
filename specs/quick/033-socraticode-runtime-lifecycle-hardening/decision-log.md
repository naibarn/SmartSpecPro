# Decision Log

- Planning depth: `standard` (three implementation sections). The approved architecture is concrete, but runtime safety and live rollout require more than a micro plan.
- Keep the existing 8G/10G aggregate agent-slice budget initially. Fix lifecycle leakage before capacity retuning.
- Lower only the persistent watcher container cap from 6G to 4G; keep index at 6G so a full rebuild can finish inside the aggregate cap.
- Use managed Docker labels plus wrapper ownership traps and a periodic fail-closed cleanup timer.
- Use direct conductor implementation; no parallel writers on live runtime files.
- External alert webhook configuration is optional because no endpoint/credential is available; prevention is enforced locally by lifecycle controls.

## Stabilization reviews

1. `[AUTO-FIX]` Completeness: added explicit wrapper EOF/signal regression coverage and active interactive preservation wording.
2. `[AUTO-FIX]` Contradictions/ownership: added the installed watcher unit to the owned rollout surface.
3. `[AUTO-FIX]` Security/abuse: strengthened live-launcher identity from PID/cmdline alone to PID + UID + process start-time + cmdline so PID reuse fails closed.
4. `[CLEAN]` Failure-mode/rollback review: Docker timeout, dry-run, active-session preservation, dedicated-watcher-only restart, and exact restore coverage are present.
5. `[CLEAN]` Cross-section consistency review: manifest count matches section files, ownership paths do not overlap, and no destructive runtime command appears in the plan.

Stop condition: five rounds completed with two consecutive clean rounds; the package is ready for implementation.

6. `[AUTO-FIX]` Implementation boundary: stage all source/tests/units/policy inside `ops/socraticode-runtime/` and install validated copies to the active host paths. This satisfies deep-implementation path safety and gives the runtime a durable repository source without changing the approved active control-plane path.
7. `[AUTO-FIX]` Boot concurrency: change the index unit to a non-restarting oneshot ordered before the persistent watcher. The existing `Type=simple` made `After=index.service` ineffective for completion ordering and allowed the 6G index plus 4-6G watcher to overlap after boot.
8. `[AUTO-FIX]` Cleanup sandbox compatibility: retain a private writable temp
   directory and move the shared lock to the dev-owned runtime locks directory;
   do not make host `/tmp` writable to the service.
9. `[AUTO-FIX]` Cleanup service security: empty the capability bounding set,
   isolate network/devices/temp, allow only AF_UNIX sockets, protect kernel and
   cgroup surfaces, restrict namespaces/realtime/SUID, and set umask 0077.
10. `[CLEAN]` Live containment: preserve a busy legacy container while its
    launcher/client are live. Its later 4 GiB local OOM was contained without
    host PSI, restart fan-out, or application health regression.
