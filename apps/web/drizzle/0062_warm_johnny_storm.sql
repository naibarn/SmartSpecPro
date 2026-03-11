ALTER TABLE "model_provider_map" ADD COLUMN "supportsResponses" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "model_provider_map" ADD COLUMN "supportsStructuredOutputs" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "model_provider_map" ADD COLUMN "supportsWebSearch" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "model_provider_map" ADD COLUMN "supportsFunctionTools" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "model_provider_map" ADD COLUMN "supportsCodeExecution" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "model_provider_map" ADD COLUMN "supportsComputerUse" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "model_provider_map" ADD COLUMN "supportsBackground" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "executionPolicyJson" json;