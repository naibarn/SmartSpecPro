DO $$
BEGIN
  CREATE TYPE payment_method_setup_session_status AS ENUM ('pending', 'confirmed', 'abandoned', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS payment_method_setup_sessions (
  id serial PRIMARY KEY,
  "userId" integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "tenantId" varchar(36) REFERENCES tenants(id) ON DELETE CASCADE,
  provider payment_provider NOT NULL DEFAULT 'beam',
  "setupSessionId" varchar(128) NOT NULL,
  status payment_method_setup_session_status NOT NULL DEFAULT 'pending',
  "returnUrl" varchar(2048),
  "providerCustomerId" varchar(128),
  "providerPaymentMethodId" varchar(128),
  "payloadJson" json,
  "errorMessage" text,
  "expiresAt" timestamptz,
  "confirmedAt" timestamptz,
  "abandonedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_method_setup_sessions_setup_unique
  ON payment_method_setup_sessions(provider, "setupSessionId");

CREATE INDEX IF NOT EXISTS payment_method_setup_sessions_user_idx
  ON payment_method_setup_sessions("userId", status, "createdAt");

ALTER TABLE notification_dispatches
  ADD COLUMN IF NOT EXISTS "renewalAttemptId" integer REFERENCES renewal_attempts(id) ON DELETE SET NULL;

ALTER TABLE reconciliation_runs
  ADD COLUMN IF NOT EXISTS "renewalAttemptId" integer REFERENCES renewal_attempts(id) ON DELETE SET NULL;
