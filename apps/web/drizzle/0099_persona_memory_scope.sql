ALTER TABLE "entity_memories"
ADD COLUMN IF NOT EXISTS "personaId" varchar(36);

ALTER TABLE "entity_memories"
DROP CONSTRAINT IF EXISTS "entity_memories_personaId_persona_templates_id_fk";

ALTER TABLE "entity_memories"
ADD CONSTRAINT "entity_memories_personaId_persona_templates_id_fk"
FOREIGN KEY ("personaId") REFERENCES "public"."persona_templates"("id")
ON DELETE set null
ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "entity_memories_user_persona_idx"
ON "entity_memories" ("userId", "personaId");

UPDATE "entity_memories" AS em
SET "personaId" = c."personaId"
FROM "conversations" AS c
WHERE em."sourceConversationId" = c."id"
  AND c."personaId" IS NOT NULL;
