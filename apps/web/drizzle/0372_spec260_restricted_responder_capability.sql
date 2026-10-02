ALTER TABLE "emergency_capability_grants" DROP CONSTRAINT IF EXISTS "emergency_capability_grants_capability_check";
ALTER TABLE "emergency_capability_grants" ADD CONSTRAINT "emergency_capability_grants_capability_check"
  CHECK ("capability" IN ('emergency.respond', 'emergency.respond.restricted', 'emergency.command', 'emergency.sponsorship', 'emergency.verify'));
