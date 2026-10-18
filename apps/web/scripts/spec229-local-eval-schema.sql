-- Disposable test-database subset for the existing Library retrieval service.
-- Apply only to a dedicated local database named spec229_eval_*.
CREATE TYPE library_item_status AS ENUM ('draft','ready','indexing','archived','failed');
CREATE TYPE library_visibility AS ENUM ('private','shared','public');

CREATE TABLE user_groups (
  id serial PRIMARY KEY, tenant_id varchar(36) NOT NULL, name varchar(128) NOT NULL,
  description text, owner_id integer NOT NULL, icon_url text, settings json NOT NULL DEFAULT '{}', member_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE TABLE group_members (
  id serial PRIMARY KEY, group_id integer NOT NULL, user_id integer NOT NULL,
  role varchar(32) NOT NULL DEFAULT 'member', added_by integer, status varchar(32) NOT NULL DEFAULT 'active',
  joined_at timestamptz NOT NULL DEFAULT now(), removed_at timestamptz
);
CREATE TABLE library_items (
  id serial PRIMARY KEY, tenant_id varchar(36) NOT NULL, owner_user_id integer NOT NULL, parent_id integer,
  item_type varchar(32) NOT NULL, source varchar(64) NOT NULL, project_id varchar(100), title varchar(255) NOT NULL,
  description text, status library_item_status NOT NULL DEFAULT 'ready', visibility library_visibility NOT NULL DEFAULT 'private',
  metadata json NOT NULL DEFAULT '{}', source_url text, thumbnail_url text, allowed_scopes text[] DEFAULT '{}',
  deleted_at timestamptz, deleted_by integer, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE library_chunks (
  id serial PRIMARY KEY, tenant_id varchar(36) NOT NULL, library_item_id integer NOT NULL, project_id varchar(100),
  chunk_index integer NOT NULL, content text NOT NULL, content_type varchar(32) NOT NULL DEFAULT 'text', token_count integer,
  vector_ref_id varchar(128), vector_index_name varchar(128), metadata json NOT NULL DEFAULT '{}', allowed_scopes text[] DEFAULT '{}',
  is_parent boolean NOT NULL DEFAULT false, parent_chunk_id text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE library_permissions (
  id serial PRIMARY KEY, tenant_id varchar(36) NOT NULL, library_item_id integer NOT NULL,
  subject_type varchar(32) NOT NULL, subject_id varchar(64) NOT NULL, permission_level varchar(32) NOT NULL DEFAULT 'read',
  granted_by_user_id integer, expires_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE system_settings (
  id serial PRIMARY KEY, category varchar(64) NOT NULL, key varchar(128) NOT NULL, value text, "valueJson" json,
  "isSensitive" boolean DEFAULT false, description text, "updatedBy" integer, "createdAt" timestamptz DEFAULT now()
);
