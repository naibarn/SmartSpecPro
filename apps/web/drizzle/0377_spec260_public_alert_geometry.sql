ALTER TABLE "emergency_public_alerts"
  ADD COLUMN IF NOT EXISTS "publicGeometryJson" jsonb;
