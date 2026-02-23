-- Stream C hardening: durable conversion state + DB-enforced tenant link integrity

CREATE TABLE IF NOT EXISTS presentation_conversion_locks (
  id serial PRIMARY KEY,
  tenant_id varchar(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_item_id integer NOT NULL REFERENCES library_items(id) ON DELETE CASCADE,
  lock_token varchar(64) NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS presentation_conversion_records (
  id serial PRIMARY KEY,
  tenant_id varchar(36) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_item_id integer NOT NULL REFERENCES library_items(id) ON DELETE CASCADE,
  source_format varchar(16) NOT NULL,
  idempotency_key varchar(128) NOT NULL,
  deck_library_item_id integer NOT NULL REFERENCES library_items(id) ON DELETE CASCADE,
  deck_id integer NOT NULL REFERENCES presentation_decks(id) ON DELETE CASCADE,
  partial_fidelity boolean NOT NULL DEFAULT false,
  fidelity_warnings json NOT NULL DEFAULT '[]',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS presentation_conversion_locks_source_unique
  ON presentation_conversion_locks (tenant_id, source_item_id);
CREATE INDEX IF NOT EXISTS presentation_conversion_locks_expires_at_idx
  ON presentation_conversion_locks (expires_at);

CREATE UNIQUE INDEX IF NOT EXISTS presentation_conversion_records_source_unique
  ON presentation_conversion_records (tenant_id, source_item_id);
CREATE INDEX IF NOT EXISTS presentation_conversion_records_idempotency_idx
  ON presentation_conversion_records (tenant_id, source_item_id, idempotency_key);
CREATE INDEX IF NOT EXISTS presentation_conversion_records_expires_at_idx
  ON presentation_conversion_records (expires_at);

CREATE UNIQUE INDEX IF NOT EXISTS library_items_id_tenant_unique
  ON library_items (id, tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS presentation_decks_id_tenant_unique
  ON presentation_decks (id, tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS presentation_slides_deck_id_unique
  ON presentation_slides (deck_id, id);

DO $$ BEGIN
  ALTER TABLE presentation_asset_links
    ADD CONSTRAINT presentation_asset_links_deck_tenant_fk
    FOREIGN KEY (deck_id, tenant_id)
    REFERENCES presentation_decks(id, tenant_id)
    ON DELETE CASCADE
    NOT VALID;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE presentation_asset_links
    ADD CONSTRAINT presentation_asset_links_library_item_tenant_fk
    FOREIGN KEY (library_item_id, tenant_id)
    REFERENCES library_items(id, tenant_id)
    ON DELETE CASCADE
    NOT VALID;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE presentation_asset_links
    ADD CONSTRAINT presentation_asset_links_slide_deck_fk
    FOREIGN KEY (deck_id, slide_id)
    REFERENCES presentation_slides(deck_id, id)
    NOT VALID;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
