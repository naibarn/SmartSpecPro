-- Additive presentation editing schema

CREATE TABLE IF NOT EXISTS presentation_decks (
  id serial PRIMARY KEY,
  tenant_id varchar(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  library_item_id integer NOT NULL REFERENCES library_items(id) ON DELETE CASCADE,
  title varchar(255) NOT NULL,
  description text,
  version integer NOT NULL DEFAULT 1,
  slide_count integer NOT NULL DEFAULT 0,
  total_asset_bytes integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS presentation_decks_library_item_unique
  ON presentation_decks (library_item_id);
CREATE INDEX IF NOT EXISTS presentation_decks_tenant_idx
  ON presentation_decks (tenant_id);
CREATE INDEX IF NOT EXISTS presentation_decks_tenant_updated_idx
  ON presentation_decks (tenant_id, updated_at);

CREATE TABLE IF NOT EXISTS presentation_slides (
  id serial PRIMARY KEY,
  deck_id integer NOT NULL REFERENCES presentation_decks(id) ON DELETE CASCADE,
  order_index integer NOT NULL,
  version integer NOT NULL DEFAULT 1,
  title varchar(255) NOT NULL DEFAULT 'Slide',
  slide_content json NOT NULL DEFAULT '{}',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS presentation_slides_deck_order_unique
  ON presentation_slides (deck_id, order_index);
CREATE INDEX IF NOT EXISTS presentation_slides_deck_idx
  ON presentation_slides (deck_id);
CREATE INDEX IF NOT EXISTS presentation_slides_deck_updated_idx
  ON presentation_slides (deck_id, updated_at);

CREATE TABLE IF NOT EXISTS presentation_asset_links (
  id serial PRIMARY KEY,
  tenant_id varchar(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  deck_id integer NOT NULL REFERENCES presentation_decks(id) ON DELETE CASCADE,
  slide_id integer REFERENCES presentation_slides(id) ON DELETE SET NULL,
  library_item_id integer NOT NULL REFERENCES library_items(id) ON DELETE CASCADE,
  byte_size integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS presentation_asset_links_unique
  ON presentation_asset_links (deck_id, slide_id, library_item_id);
CREATE INDEX IF NOT EXISTS presentation_asset_links_deck_idx
  ON presentation_asset_links (deck_id);
CREATE INDEX IF NOT EXISTS presentation_asset_links_slide_idx
  ON presentation_asset_links (slide_id);

CREATE TABLE IF NOT EXISTS presentation_source_attachments (
  id serial PRIMARY KEY,
  deck_id integer NOT NULL REFERENCES presentation_decks(id) ON DELETE CASCADE,
  source_library_item_id integer REFERENCES library_items(id) ON DELETE SET NULL,
  source_format varchar(16) NOT NULL,
  conversion_status varchar(32) NOT NULL DEFAULT 'pending',
  partial_fidelity boolean NOT NULL DEFAULT false,
  fidelity_warnings json NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS presentation_source_attachments_deck_unique
  ON presentation_source_attachments (deck_id);
CREATE INDEX IF NOT EXISTS presentation_source_attachments_source_item_idx
  ON presentation_source_attachments (source_library_item_id);
