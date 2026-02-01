CREATE TABLE "email_verification_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"email" varchar(320) NOT NULL,
	"code" varchar(6) NOT NULL,
	"channel" varchar(20) DEFAULT 'email' NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"usedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"menu_item_id" varchar(50) NOT NULL,
	"platform" varchar(10) DEFAULT 'web' NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"custom_label" varchar(100),
	"custom_icon" varchar(50),
	"sort_order" integer,
	"tenant_id" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoice_config" ALTER COLUMN "tenantId" SET DATA TYPE varchar(36);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "backupEmail" varchar(320);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "backupEmailVerified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone" varchar(20);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phoneVerified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "twoFactorEnabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "twoFactorSecret" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "recoveryCodes" json DEFAULT '[]'::json;--> statement-breakpoint
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_config" ADD CONSTRAINT "menu_config_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "menu_config_unique" ON "menu_config" USING btree ("menu_item_id","platform","tenant_id");