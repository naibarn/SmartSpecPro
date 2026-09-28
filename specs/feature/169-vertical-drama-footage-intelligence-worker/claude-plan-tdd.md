# TDD plan — Feature 169

1. Rust unit tests: secure source roots, checksum/Range, probe normalization, millisecond map math, segment bounds and policy enums.
2. Media fixtures: Thai speech, leading/trailing/middle silence, meaningful pauses, black/frozen frames, scene changes, no-audio and corrupt input.
3. HyperFrames/runtime tests: manifest resolver, exact CLI help/Thai `large-v3`, word-level JSON, missing binary/model/version/checksum failures and no network install.
4. Worker lifecycle tests: claim, heartbeat, cancel, retry classification, token refresh, ordered event replay, stale lease, outbox and staged artifact reuse.
5. Preparation/render tests: approved concat, speech-overlap rejection, bidirectional map, preview/final separation, exact B-roll timing/audio/source in-out, overflow and failed-QC isolation.
6. Storage/privacy/benchmark tests: tenant ownership, checksum publication, bounded resources, cleanup and concurrency backpressure.
