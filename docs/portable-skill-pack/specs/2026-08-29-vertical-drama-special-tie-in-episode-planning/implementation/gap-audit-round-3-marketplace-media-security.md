# Gap audit round 3 — Marketplace and managed media

Checked: product-first Marketplace Capture flow, exact image selection, aggregate cap,
provider URL handling, upload registration, tenant/user authorization, and Scenes reuse.

Fixes applied: UI uses `listProducts` then `listProductImages`, with no URL-only field;
selected Marketplace images are materialized through the existing managed-media ingest;
uploads use the existing upload plus registration flow; Marketplace materialization verifies
series ownership; location/store references reconcile to an idempotent Scenes slot and avoid
duplicate asset links.

Evidence: reference-selection and UI constraint tests pass. Actual Marketplace data and R2
object replay require authenticated integration/browser verification.
