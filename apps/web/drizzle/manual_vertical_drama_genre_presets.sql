-- Vertical Drama Series genre presets (Feature 131 UI addendum) — additive, CREATE IF NOT EXISTS.
-- Hand-authored from drizzle/schema.ts because drizzle-kit generate is blocked by the same
-- pre-existing meta-journal collision (0146/0147) documented for manual_vertical_drama_131.sql.
-- Zero data-loss (no drops/alters); this is a brand-new, empty table.
BEGIN;

CREATE TABLE IF NOT EXISTS vertical_drama_genre_presets (
  id bigserial PRIMARY KEY,
  title varchar(150) NOT NULL,
  category varchar(60) NOT NULL,
  locale varchar(8) NOT NULL DEFAULT 'th',
  logline text NOT NULL,
  "mainPlot" text NOT NULL,
  "seasonArc" text NOT NULL,
  tone varchar(100) NOT NULL,
  "cliffhangerStyle" varchar(150) NOT NULL,
  "charactersJson" jsonb NOT NULL,
  "visualBible" text NOT NULL,
  "sortOrder" integer NOT NULL DEFAULT 0,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vds_genre_presets_locale_idx ON vertical_drama_genre_presets (locale, "sortOrder");

COMMIT;
