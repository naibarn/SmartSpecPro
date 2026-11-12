-- Convert the stored credit unit from 1,000 to 10,000 credits per USD.
-- Scale historical ledger values as a unit conversion so each balanceAfter
-- and the running ledger remain internally consistent.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM users WHERE credits::bigint * 10 > 2147483647
  ) OR EXISTS (
    SELECT 1 FROM credit_transactions
    WHERE amount::bigint * 10 NOT BETWEEN -2147483648 AND 2147483647
       OR "balanceAfter"::bigint * 10 NOT BETWEEN -2147483648 AND 2147483647
  ) OR EXISTS (
    SELECT 1 FROM credit_packages WHERE credits::bigint * 10 > 2147483647
  ) OR EXISTS (
    SELECT 1 FROM llm_inference_credit_reservations
    WHERE "reservedCredits"::bigint * 10 > 2147483647
       OR "settledCredits"::bigint * 10 > 2147483647
  ) THEN
    RAISE EXCEPTION 'Credit unit conversion would overflow an integer credit field';
  END IF;

  IF EXISTS (
    SELECT 1 FROM system_settings
    WHERE category = 'registration'
      AND key IN ('signup_bonus_credits', 'first_user_bonus_credits', 'user_referral_bonus_credits')
      AND value ~ '^[0-9]+$'
      AND value::numeric * 10 > 2147483647
  ) THEN
    RAISE EXCEPTION 'Credit unit conversion would overflow a registration credit setting';
  END IF;

  IF EXISTS (
    SELECT 1 FROM user_preferences
    WHERE "low_credits_threshold"::bigint * 10 > 2147483647
  ) THEN
    RAISE EXCEPTION 'Credit unit conversion would overflow a user credit threshold';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM credit_reservation_snapshots,
         LATERAL (VALUES
           (payload->>'reservedAmount'),
           (payload->>'drawnAmount')
         ) AS amounts(value)
    WHERE value IS NOT NULL
      AND value ~ '^-?[0-9]+$'
      AND abs(value::numeric) * 10 > 9007199254740991
  ) THEN
    RAISE EXCEPTION 'Credit unit conversion would exceed safe reservation snapshot precision';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM credit_reservation_snapshots,
         LATERAL jsonb_each(CASE
           WHEN jsonb_typeof(payload->'settledCallAmounts') = 'object'
             THEN payload->'settledCallAmounts'
           ELSE '{}'::jsonb
         END) AS settlements(key, value)
    WHERE value #>> '{}' ~ '^-?[0-9]+$'
      AND abs((value #>> '{}')::numeric) * 10 > 9007199254740991
  ) THEN
    RAISE EXCEPTION 'Credit unit conversion would exceed safe settled reservation precision';
  END IF;
END $$;

UPDATE users SET credits = (credits::bigint * 10)::integer;
UPDATE credit_transactions
SET amount = (amount::bigint * 10)::integer,
    "balanceAfter" = ("balanceAfter"::bigint * 10)::integer;
UPDATE credit_packages SET credits = (credits::bigint * 10)::integer;
UPDATE system_settings
SET value = (value::bigint * 10)::text
WHERE category = 'registration'
  AND key IN ('signup_bonus_credits', 'first_user_bonus_credits', 'user_referral_bonus_credits')
  AND value ~ '^[0-9]+$';
UPDATE user_preferences
SET low_credits_threshold = (low_credits_threshold::bigint * 10)::integer;
UPDATE llm_inference_credit_reservations
SET "reservedCredits" = ("reservedCredits"::bigint * 10)::integer,
    "settledCredits" = ("settledCredits"::bigint * 10)::integer;

UPDATE credit_reservation_snapshots
SET payload = jsonb_set(
  jsonb_set(
    CASE
      WHEN jsonb_typeof(payload->'settledCallAmounts') = 'object' THEN
        jsonb_set(
          payload,
          '{settledCallAmounts}',
          COALESCE((
            SELECT jsonb_object_agg(key, to_jsonb((value #>> '{}')::numeric * 10))
            FROM jsonb_each(payload->'settledCallAmounts')
          ), '{}'::jsonb),
          true
        )
      ELSE payload
    END,
    '{reservedAmount}', to_jsonb((payload->>'reservedAmount')::numeric * 10), true
  ),
  '{drawnAmount}', to_jsonb((payload->>'drawnAmount')::numeric * 10), true
), updated_at = now()
WHERE jsonb_typeof(payload) = 'object'
  AND payload ? 'reservedAmount'
  AND payload ? 'drawnAmount';
