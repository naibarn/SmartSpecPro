CREATE TABLE "agency_templates" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"systemPrompt" text,
	"category" varchar(64) NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_templates" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"agencyTemplateId" varchar(36),
	"name" varchar(100) NOT NULL,
	"role" varchar(100) NOT NULL,
	"description" text,
	"instructions" text,
	"category" varchar(64) NOT NULL,
	"icon" varchar(64) DEFAULT 'bot',
	"defaultModel" varchar(100),
	"isEntryPoint" boolean DEFAULT false NOT NULL,
	"position" json,
	"defaultTools" json,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_templates" ADD CONSTRAINT "agent_templates_agencyTemplateId_agency_templates_id_fk" FOREIGN KEY ("agencyTemplateId") REFERENCES "public"."agency_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_templates_agency_tmpl_idx" ON "agent_templates" USING btree ("agencyTemplateId");--> statement-breakpoint
CREATE INDEX "agent_templates_category_idx" ON "agent_templates" USING btree ("category");