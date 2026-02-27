ALTER TABLE "agencies" DROP CONSTRAINT "agencies_createdBy_users_id_fk";
--> statement-breakpoint
ALTER TABLE "agency_communication_flows" DROP CONSTRAINT "agency_communication_flows_fromAgentId_agency_agents_id_fk";
--> statement-breakpoint
ALTER TABLE "agency_communication_flows" DROP CONSTRAINT "agency_communication_flows_toAgentId_agency_agents_id_fk";
--> statement-breakpoint
ALTER TABLE "agency_conversations" DROP CONSTRAINT "agency_conversations_agencyId_agencies_id_fk";
--> statement-breakpoint
ALTER TABLE "agency_tools" DROP CONSTRAINT "agency_tools_tenantId_tenants_id_fk";
--> statement-breakpoint
ALTER TABLE "agencies" ADD CONSTRAINT "agencies_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_communication_flows" ADD CONSTRAINT "agency_communication_flows_fromAgentId_agency_agents_id_fk" FOREIGN KEY ("fromAgentId") REFERENCES "public"."agency_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_communication_flows" ADD CONSTRAINT "agency_communication_flows_toAgentId_agency_agents_id_fk" FOREIGN KEY ("toAgentId") REFERENCES "public"."agency_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_conversations" ADD CONSTRAINT "agency_conversations_agencyId_agencies_id_fk" FOREIGN KEY ("agencyId") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_tools" ADD CONSTRAINT "agency_tools_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;