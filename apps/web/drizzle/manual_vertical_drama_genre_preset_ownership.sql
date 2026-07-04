-- Vertical Drama Series genre preset ownership (section-11) — additive, IF NOT EXISTS guarded.
-- Hand-authored from drizzle/schema.ts because drizzle-kit generate is blocked by the same
-- pre-existing meta-journal collision (0146/0147) documented for the prior two vertical-drama
-- migrations. Zero data-loss: existing 36 rows keep scope='global' with NULL owner columns,
-- which is exactly the semantics they already had (visible to everyone).
BEGIN;

ALTER TABLE vertical_drama_genre_presets
  ADD COLUMN IF NOT EXISTS "scope" varchar(20) NOT NULL DEFAULT 'global',
  ADD COLUMN IF NOT EXISTS "tenantId" varchar(36),
  ADD COLUMN IF NOT EXISTS "userId" integer REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS vds_genre_presets_owner_idx
  ON vertical_drama_genre_presets ("tenantId", "userId", "scope");

COMMIT;
