CREATE INDEX IF NOT EXISTS "finance_transactions_search_tsvector_idx"
  ON "finance_transactions"
  USING gin (
    to_tsvector(
      'simple',
      COALESCE("note", '') || ' ' ||
      COALESCE("counterparty_name", '') || ' ' ||
      COALESCE("merchant_name", '') || ' ' ||
      COALESCE("category_code", '') || ' ' ||
      COALESCE("slip_reference", '') || ' ' ||
      COALESCE("merchant_id", '') || ' ' ||
      COALESCE("payment_source_name", '') || ' ' ||
      COALESCE("payment_destination_name", '')
    )
  );
