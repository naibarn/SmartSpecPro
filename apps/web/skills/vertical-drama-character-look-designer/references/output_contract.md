# Output contract

Return `{ "contract_version": 1, "designs": [...] }` exactly as described by
`schemas/output.schema.json`. Each design is keyed by `request_key` and contains
wardrobe, hair, makeup, footwear, accessories, identity lock, quality checks,
and separate evidence references. An `age_stage` design must include the
canonical stage (`infant`, `early_childhood`, `school_age`,
`university_student`, `adult`, or `older_adult`) and a non-empty
`age_stage_description`; an outfit-only design must not contain age-stage
fields. The application derives persisted visual
text from structured fields and ignores free-text convenience fields.
