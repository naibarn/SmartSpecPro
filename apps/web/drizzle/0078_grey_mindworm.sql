ALTER TABLE "multimodal_memory_items" ALTER COLUMN "tenantId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "multimodal_memory_items" ALTER COLUMN "userId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "multimodal_memory_vectors" ALTER COLUMN "embedding" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_visual_state" ADD COLUMN "tenantId" varchar(36) NOT NULL;--> statement-breakpoint
CREATE INDEX "media_assets_tenant_user_idx" ON "media_assets" USING btree ("tenantId","userId");--> statement-breakpoint
CREATE UNIQUE INDEX "multimodal_memory_links_unique_idx" ON "multimodal_memory_links" USING btree ("fromMemoryItemId","toMemoryItemId","relationType");