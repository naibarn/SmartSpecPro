ALTER TABLE "team_rooms"
ADD COLUMN IF NOT EXISTS "language" varchar(8) NOT NULL DEFAULT 'en';
