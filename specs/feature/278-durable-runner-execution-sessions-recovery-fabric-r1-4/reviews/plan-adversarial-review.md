# Adversarial Plan Review

1. Could an execution session become a second job authority? No: job state/cancel/settlement remains in `worker_jobs`; session is a linked projection and every recovery/terminal result reconciles canonically.
2. Could an autonomous child outlive the grant? The Session Host verifies bounded signed authority and enforces expiry locally, including suspend/time uncertainty. A host unable to enforce this cannot claim stronger fencing and admission is policy-gated.
3. Could recovery race across server instances? Section 03 explicitly requires transactional CAS on the canonical execution slot and a losing adopter receives no grant.
4. Could output pressure destroy receipts? Section 04/08 reserve durable critical outbox delivery separately from bounded output spool; commercial evidence also has priority.
5. Could a provider snapshot be mistaken for process persistence? The plan and Section 07 explicitly classify replacement as reconstruction and prohibit `PROCESS_PERSISTENT` claims.
6. Could Runner settle commercial balances? No; grants authorize a bounded envelope and evidence only. Spec 280/ledger remain authorities.
7. Could integration corrupt another active task? Shared orchestra state is isolated; dirty protected `main` is not reset/staged/committed; target files are inspected before changes.
8. Is UI plan implementable? Section 09 includes all contract fields and proof requirements; it uses existing Task Control ownership.

Outcome: no plan change required. Proceed with section generation complete; implement in order and preserve named external certification gates.
