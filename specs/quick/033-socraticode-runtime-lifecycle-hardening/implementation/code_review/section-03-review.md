# Code Review: Section 03 - Safe Runtime Rollout

Conductor review (critical runtime path):

- Data safety: no application service, database, volume, or production data was
  changed. Backup and exact restore steps predate installation.
- Session safety: the watcher was the only restarted runtime; the three active
  interactive container IDs survived unchanged.
- Cleanup safety: managed/project/grace/launcher identity/caller checks are all
  required; timeout, malformed metadata, legacy status, and ambiguity preserve
  containers.
- Service security: cleanup runs as `dev` with `NoNewPrivileges`, strict system
  protection, private `/tmp`, a single writable lock directory, and tight
  memory/CPU limits.
- Resource recovery: wrapper traps own one child/container, watcher requests
  have watchdogs, boot indexing is serialized before the watcher, logs rotate,
  and recurring cleanup is bounded.
- Live proof: MCP initialize/status, timer cleanup, health probes, cgroup/PSI
  snapshots, and Docker-child checks pass.

Rollout repairs:
1. Moved cleanup temporary state into `PrivateTmp` compatibility after the
   first fail-closed service run exposed the read-only `/tmp` boundary.
2. Replaced the shared `/tmp` lock with the dev-owned runtime lock directory and
   narrowed `ReadWritePaths` to that directory.
3. Added an empty capability bounding set, private network/devices, kernel and
   control-group protections, namespace/realtime/SUID restrictions, AF_UNIX-only
   sockets, and a restrictive umask to the cleanup service.

Verdict: PASS. The busy legacy container later reached its existing 4 GiB cap
and was killed locally; memory PSI stayed quiet and the monitor emitted the
expected critical cgroup alert. Three fresh follow-up snapshots were stable.
The two remaining legacy containers are idle and tied to live clients;
automatic deletion remains intentionally disabled until they exit and reconnect
through the managed launcher.
