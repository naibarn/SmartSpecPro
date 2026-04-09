ALTER TABLE "agencies"
  ADD COLUMN IF NOT EXISTS "documentVersion" integer DEFAULT 1 NOT NULL,
  ADD COLUMN IF NOT EXISTS "defaultEngine" varchar(30) DEFAULT 'agency_swarm' NOT NULL,
  ADD COLUMN IF NOT EXISTS "compileMode" varchar(30) DEFAULT 'legacy_agency' NOT NULL,
  ADD COLUMN IF NOT EXISTS "compatibilityMode" varchar(50) DEFAULT 'preserve_agency_swarm' NOT NULL;--> statement-breakpoint

ALTER TABLE "agency_agents"
  ADD COLUMN IF NOT EXISTS "subgraphId" varchar(100),
  ADD COLUMN IF NOT EXISTS "engineHint" varchar(30),
  ADD COLUMN IF NOT EXISTS "runtimeConfig" jsonb;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "agency_subgraphs" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "agencyId" varchar(36) NOT NULL,
  "subgraphKey" varchar(100) NOT NULL,
  "name" varchar(255) NOT NULL,
  "engine" varchar(30) DEFAULT 'agency_swarm' NOT NULL,
  "entryNodeIds" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "exitNodeIds" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "nodeIds" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "boundaryPolicy" jsonb,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'agency_subgraphs_agencyId_agencies_id_fk'
  ) THEN
    ALTER TABLE "agency_subgraphs"
      ADD CONSTRAINT "agency_subgraphs_agencyId_agencies_id_fk"
      FOREIGN KEY ("agencyId") REFERENCES "public"."agencies"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "agency_subgraphs_agency_idx"
  ON "agency_subgraphs" USING btree ("agencyId");--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "agency_subgraphs_agency_key_idx"
  ON "agency_subgraphs" USING btree ("agencyId", "subgraphKey");
