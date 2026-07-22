# User Slice Memory Guardrail Tightening

## Objective

Protect SSH and production services from Remote SSH, VS Code, agent, and build
workloads that share `user-1000.slice`.

## Confirmed incident evidence

- The previous limit set was `MemoryHigh=18G`, `MemoryMax=20G`, and
  `MemorySwapMax=4G`.
- During the 2026-07-21 incident, `user-1000.slice` reached its high-memory
  boundary, memory PSI rose above 98%, swap usage rose to about 6.1 GiB, and
  SSH sessions repeatedly disconnected or reconnected.
- A rerun after reboot confirmed that a Vite production build inside a Remote
  SSH session could push the slice back toward the same boundary.
- In the healthy post-build snapshot, most charged slice memory was reclaimable
  file cache and host memory PSI was zero.

## Approved design

Persist and apply these aggregate limits to `user-1000.slice`:

```ini
[Slice]
MemoryHigh=14G
MemoryMax=16G
MemorySwapMax=2G
```

`MemoryHigh` initiates reclaim and throttling before user workloads can starve
the host. `MemoryMax` bounds the aggregate session memory. The reduced swap cap
limits prolonged swap thrashing. Production services remain in `system.slice`
and are not assigned these limits.

## Implementation

1. Update `systemd/user-1000.slice.d/50-smartspec-memory.conf`.
2. Validate the drop-in with `systemd-analyze verify`.
3. Apply the values live with `systemctl set-property --runtime` without a
   reboot or production-service restart.
4. Reload systemd configuration so the persisted drop-in is used on later
   boots.

## Verification

- Confirm the effective `MemoryHigh`, `MemoryMax`, and `MemorySwapMax` values.
- Confirm SSH remains active.
- Probe public, local web, and backend health.
- Compare RAM, swap, memory PSI, and `user-1000.slice/memory.events` over short,
  discrete snapshots.
- Treat rising PSI, health failures, new OOM kills, or persistent session
  instability as a failed rollout.

## Rollback

If the live change destabilizes normal sessions, restore both runtime and the
drop-in to:

```ini
[Slice]
MemoryHigh=18G
MemoryMax=20G
MemorySwapMax=4G
```

Rollback does not require a reboot or data-volume operation.

## Trade-off

Large builds launched inside Remote SSH may run more slowly or be killed at the
hard boundary. This is intentional: preserving SSH, Docker, PostgreSQL, and the
production application has priority over an in-session build.
