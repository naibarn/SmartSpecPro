# Code Review Interview: Section 05

Review findings repaired: bind every notice field to server-owned watch authority, replace claim-before-deliver with lease/retry/ack semantics, reauthorize after claim, and prove acknowledged notices cannot redeliver even after an ambiguous acknowledgement response. Final independent review approved. No product decision was required; the durable runtime is not composed in this slice.
