# Section 03 — Offers, Claims, Pools and Local Adapters

## Source coverage

Feature 197 sections 6–11, 23–25, 30, 58–60, 65, 69–71, 75 and 77.

## Deliverable

Use Feature 195 leases/fences and Feature 196 capability/policy to implement pool-first offers, targeted affinity, local resolution, adapter selection, execution sessions, resource waits and high-impact enablement.

## TDD steps

Test competing claims, lease expiry, stale snapshot, user-owned tool modes, local selector, resource wait and duplicate effect before implementing adapters; rerun focused tests.

## Completion gate

Offer identity and local implementation identity remain separate; all claims are revalidated at execution time.

