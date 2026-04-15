CREATE INDEX IF NOT EXISTS "finance_transactions_search_tsvector_idx"
  ON "finance_transactions"
  USING gin (
    to_tsvector(
      'simple',
      COALESCE("note", '') || ' ' ||
      COALESCE("counterparty_name", '') || ' ' ||
      COALESCE("merchant_name", '') || ' ' ||
      COALESCE("slip_reference", '') || ' ' ||
      COALESCE("merchant_id", '') || ' ' ||
      COALESCE("payment_source_name", '') || ' ' ||
      COALESCE("payment_destination_name", '') || ' ' ||
      COALESCE("payment_source_institution_name", '') || ' ' ||
      COALESCE("payment_destination_institution_name", '') || ' ' ||
      COALESCE("payment_institution_name", '') || ' ' ||
      COALESCE("payment_account_nickname", '') || ' ' ||
      COALESCE("payment_account_masked_identifier", '')
    )
  );
