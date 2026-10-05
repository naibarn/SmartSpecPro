# Decisions

1. Use a text-first vertical-series product panel because repository inventory has no public-rights proof for the available images. Do not create a fake live demo or claim a finished-film outcome without Spec 258 approval.
2. Point signed-out creators through the existing local auth return flow to the authenticated `/drama-series` route; keep general account creation at `/signup`.
3. Keep per-tenant published home pages enabled and isolated. Do not globally reuse the production-observed null-tenant legacy record.
4. Keep external design provider, persistence DDL, authoring UI, and Spec 224/256 handoff disabled until their explicit authority gates close.
5. Do not run a product build or repository-wide typecheck during this task, per the user's no-build instruction and repository shared-resource policy.
