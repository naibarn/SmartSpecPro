# Spec 211 Synthesized Specification

Build a governed external-agent runtime fabric that supports certified ACP
clients and an optional managed Gas City session provider. It must negotiate
capabilities, preserve session/configuration epochs, normalize updates and
permission requests, supervise child processes, map background work into
canonical Jobs, and provide authoritative store/read/reconcile behavior.

The first slice is contracts, adapters and disabled-by-default certification
paths. No ACP/Gas City implementation exists in the current repository, so
dependency installation and provider enablement are separate release gates.

