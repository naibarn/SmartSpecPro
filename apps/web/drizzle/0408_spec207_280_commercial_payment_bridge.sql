-- Additive SPEC-207/280 contract storage. No legacy credit/payment rows are rewritten.
CREATE TABLE IF NOT EXISTS commercial_spending_limits (
  tenant_ref varchar(128) NOT NULL,
  payer_ref varchar(128) NOT NULL,
  currency varchar(8) NOT NULL,
  global_cap_minor bigint NOT NULL CHECK (global_cap_minor >= 0),
  overdraft_limit_minor bigint NOT NULL DEFAULT 0 CHECK (overdraft_limit_minor >= 0),
  overdraft_enabled boolean NOT NULL DEFAULT false,
  policy_version varchar(64) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_ref, payer_ref, currency),
  CHECK (overdraft_enabled OR overdraft_limit_minor = 0)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS commercial_payment_requests (
  request_id varchar(128) PRIMARY KEY,
  task_id varchar(128) NOT NULL UNIQUE,
  invocation_id varchar(128) NOT NULL,
  tenant_ref varchar(128) NOT NULL,
  payer_ref varchar(128) NOT NULL,
  currency varchar(8) NOT NULL,
  rail varchar(24) NOT NULL CHECK (rail IN ('credits', 'fiat_payg', 'x402', 'mpp')),
  idempotency_key varchar(256) NOT NULL UNIQUE,
  request_hash varchar(64) NOT NULL,
  snapshot_json jsonb NOT NULL,
  state varchar(32) NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved', 'authorization_unknown', 'authorized', 'paused', 'settled', 'reconciliation_required')),
  reserved_minor bigint NOT NULL CHECK (reserved_minor >= 0),
  captured_minor bigint NOT NULL DEFAULT 0 CHECK (captured_minor >= 0),
  fencing_token integer NOT NULL DEFAULT 1 CHECK (fencing_token > 0),
  provider_ref varchar(256),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS commercial_payment_payer_state_idx
  ON commercial_payment_requests (tenant_ref, payer_ref, currency, state);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS commercial_payment_attempts (
  attempt_id varchar(128) PRIMARY KEY,
  task_id varchar(128) NOT NULL REFERENCES commercial_payment_requests(task_id) ON DELETE RESTRICT,
  attempt_no integer NOT NULL CHECK (attempt_no > 0),
  provider_id varchar(128) NOT NULL,
  rail varchar(24) NOT NULL CHECK (rail IN ('credits', 'fiat_payg', 'x402', 'mpp')),
  status varchar(32) NOT NULL CHECK (status IN ('pending', 'authorized', 'declined', 'unknown', 'captured', 'released', 'refunded', 'reconciliation_required')),
  idempotency_key varchar(256) NOT NULL UNIQUE,
  request_hash varchar(64) NOT NULL,
  provider_ref varchar(256),
  fencing_token integer NOT NULL CHECK (fencing_token > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, attempt_no)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS commercial_payment_attempt_provider_ref_idx
  ON commercial_payment_attempts (provider_id, provider_ref);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS commercial_usage_receipts (
  receipt_id varchar(128) PRIMARY KEY,
  task_id varchar(128) NOT NULL REFERENCES commercial_payment_requests(task_id) ON DELETE RESTRICT,
  invocation_id varchar(128) NOT NULL,
  sequence integer NOT NULL CHECK (sequence > 0),
  idempotency_key varchar(256) NOT NULL UNIQUE,
  receipt_hash varchar(64) NOT NULL,
  meter varchar(128) NOT NULL,
  unit varchar(32) NOT NULL,
  quantity numeric(24,8) NOT NULL CHECK (quantity >= 0),
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  currency varchar(8) NOT NULL,
  source_attempt_ref varchar(256) NOT NULL,
  evidence_ref varchar(256) NOT NULL,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, sequence)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS commercial_settlements (
  settlement_id varchar(128) PRIMARY KEY,
  task_id varchar(128) NOT NULL UNIQUE REFERENCES commercial_payment_requests(task_id) ON DELETE RESTRICT,
  authorization_id varchar(128) NOT NULL,
  idempotency_key varchar(256) NOT NULL UNIQUE,
  captured_minor bigint NOT NULL CHECK (captured_minor >= 0),
  released_minor bigint NOT NULL CHECK (released_minor >= 0),
  currency varchar(8) NOT NULL,
  allocation_snapshot_json jsonb NOT NULL,
  receipt_ids_json jsonb NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'settled' CHECK (status IN ('settled', 'reconciliation_required', 'reversed')),
  settled_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS commercial_ledger_postings (
  posting_ref varchar(256) PRIMARY KEY,
  task_id varchar(128) NOT NULL REFERENCES commercial_payment_requests(task_id) ON DELETE RESTRICT,
  idempotency_key varchar(256) NOT NULL,
  account_ref varchar(256) NOT NULL,
  side varchar(8) NOT NULL CHECK (side IN ('debit', 'credit')),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency varchar(8) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key, account_ref)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS commercial_ledger_task_created_idx
  ON commercial_ledger_postings (task_id, created_at);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS commercial_payment_refunds (
  refund_id varchar(128) PRIMARY KEY,
  task_id varchar(128) NOT NULL REFERENCES commercial_payment_requests(task_id) ON DELETE RESTRICT,
  settlement_id varchar(128) NOT NULL REFERENCES commercial_settlements(settlement_id) ON DELETE RESTRICT,
  idempotency_key varchar(256) NOT NULL UNIQUE,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency varchar(8) NOT NULL,
  status varchar(24) NOT NULL CHECK (status IN ('refunded', 'unknown', 'reconciliation_required')),
  provider_ref varchar(256),
  created_at timestamptz NOT NULL DEFAULT now()
);
