CREATE TYPE "public"."invite_code_type" AS ENUM('admin', 'user');--> statement-breakpoint
CREATE TABLE "invite_code_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"inviteCodeId" integer NOT NULL,
	"registeredUserId" integer NOT NULL,
	"creditsGivenToUser" integer DEFAULT 0 NOT NULL,
	"creditsGivenToOwner" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invite_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(32) NOT NULL,
	"label" varchar(128),
	"type" "invite_code_type" NOT NULL,
	"ownerId" integer NOT NULL,
	"bonusCreditsForNewUser" integer DEFAULT 0 NOT NULL,
	"bonusCreditsForOwner" integer DEFAULT 0 NOT NULL,
	"maxUses" integer,
	"currentUses" integer DEFAULT 0 NOT NULL,
	"expiresAt" timestamp with time zone,
	"isActive" boolean DEFAULT true NOT NULL,
	"description" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invite_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "referredByInviteCodeId" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "disabledReason" varchar(64);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "lastCreditUsedAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invite_code_usage" ADD CONSTRAINT "invite_code_usage_inviteCodeId_invite_codes_id_fk" FOREIGN KEY ("inviteCodeId") REFERENCES "public"."invite_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_code_usage" ADD CONSTRAINT "invite_code_usage_registeredUserId_users_id_fk" FOREIGN KEY ("registeredUserId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_ownerId_users_id_fk" FOREIGN KEY ("ownerId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invite_code_usage_code_idx" ON "invite_code_usage" USING btree ("inviteCodeId");--> statement-breakpoint
CREATE INDEX "invite_code_usage_user_idx" ON "invite_code_usage" USING btree ("registeredUserId");--> statement-breakpoint
CREATE INDEX "invite_codes_owner_idx" ON "invite_codes" USING btree ("ownerId");--> statement-breakpoint
CREATE INDEX "invite_codes_type_active_idx" ON "invite_codes" USING btree ("type","isActive");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_referredByInviteCodeId_invite_codes_id_fk" FOREIGN KEY ("referredByInviteCodeId") REFERENCES "public"."invite_codes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ft_tenant_status_idx" ON "feedback_tickets" USING btree ("tenantId","status");--> statement-breakpoint
CREATE INDEX "ft_submitted_by_idx" ON "feedback_tickets" USING btree ("submittedBy");