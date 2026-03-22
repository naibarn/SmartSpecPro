ALTER TABLE "invite_codes" ADD COLUMN "tenantId" varchar(36);--> statement-breakpoint
ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invite_codes_tenant_idx" ON "invite_codes" USING btree ("tenantId");