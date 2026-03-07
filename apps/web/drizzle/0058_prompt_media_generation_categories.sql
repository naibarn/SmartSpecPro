ALTER TYPE "public"."skill_category" ADD VALUE IF NOT EXISTS 'image_prompt_generation' BEFORE 'video_generation';--> statement-breakpoint
ALTER TYPE "public"."skill_category" ADD VALUE IF NOT EXISTS 'video_prompt_generation' BEFORE 'image_video_generation';--> statement-breakpoint
