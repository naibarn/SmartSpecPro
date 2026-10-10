# SPEC-208 local Moli isolation acceptance

This is a non-production Linux acceptance harness. It uses a rootless systemd
user service, an immutable read-only rootfs, and a private network namespace.
It is not a Cloudflare Container deployment and does not certify production
compatibility.

Build the rootfs from the pinned Moli v1.1.15 release binary and a Node binary:

```sh
scripts/spec208/build-moli-acceptance-rootfs.sh \
  /path/to/moli-v1.1.15-x86_64-unknown-linux-gnu/moli \
  /path/to/node \
  /tmp/spec208-moli-rootfs
```

The build writes a sibling `.provenance.json` file with source references,
binary hashes, and the normalized rootfs tree digest. The runner recomputes
that digest and rejects a changed rootfs before starting the service. Moli's
publisher build attestation is not currently verified, so the local digest
must not be presented as authenticated upstream provenance.

Run the acceptance slice with the digest emitted by the build step:

```sh
scripts/spec208/run-moli-isolation-acceptance.sh \
  /tmp/spec208-moli-rootfs \
  sha256:<rootfs-digest>
```

The harness starts two Moli processes with separate attempt profiles, reads
DOM and profile-scoped storage from a local synthetic page, probes CDP and
WebDriver routes, and attempts external/metadata egress through a fixture-only
proxy. It terminates both processes and removes both profiles. The systemd
service applies CPU, memory, PID, and wall-clock limits; disables capabilities
and privilege gain; hides host filesystems; exposes only loopback networking;
and mounts profile and temporary storage as bounded tmpfs filesystems.

The emitted receipt is explicitly a local harness receipt. It does not create
a `worker_jobs` row or exercise application authorization, lease fencing,
canonical result receipts, or terminal settlement. Use only on an approved
non-production host; do not attach this runtime to production dispatch.
