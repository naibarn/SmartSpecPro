# Section 05 — Vision Description and Evidence

Each asset can request an AI description using the asset, product/place context,
slot title, and narrative intent. The output is a provenance-tagged suggestion,
not an authority.

Keep separate:

- visible observations;
- creator's intended message;
- factual claims and source references;
- opinion, mood, and editorial direction.

The creator can edit or accept the suggestion. Unsupported claims remain
`needs_verification` and must not be rendered as verified facts. Hybrid
reenactment is explicitly labelled and cannot be presented as documentary
footage.

Analysis has a terminal `succeeded`/`failed` contract: it may run through a
bounded inline path or a real worker, but the API must not leave an unconsumed
`queued` record. Status, retry/backoff, model and policy versions, input
checksum, output schema version, confidence, provenance, and credit
reservation/reconciliation remain durable. The idempotency key includes the
pack, slot, managed-media version, operation, and policy version. OCR, captions,
metadata, and user text are treated as untrusted content rather than model
instructions. Partial failures preserve successful results and expose a
targeted retry without duplicate charges.
