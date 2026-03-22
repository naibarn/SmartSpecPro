-- Partial unique indexes to prevent duplicate participants in team rooms.
-- A user or assistant can only be added once per room.

CREATE UNIQUE INDEX IF NOT EXISTS "team_room_participants_user_unique"
  ON "team_room_participants" ("roomId", "participantUserId")
  WHERE "participantUserId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "team_room_participants_assistant_unique"
  ON "team_room_participants" ("roomId", "participantAssistantId")
  WHERE "participantAssistantId" IS NOT NULL;
