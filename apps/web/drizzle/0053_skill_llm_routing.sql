ALTER TABLE "skills"
ADD COLUMN "llmModelId" varchar(128),
ADD COLUMN "preferredProviderId" integer,
ADD COLUMN "strictProviderPin" boolean DEFAULT false NOT NULL;

ALTER TABLE "skills"
ADD CONSTRAINT "skills_preferredProviderId_llm_providers_id_fk"
FOREIGN KEY ("preferredProviderId") REFERENCES "public"."llm_providers"("id")
ON DELETE no action ON UPDATE no action;
