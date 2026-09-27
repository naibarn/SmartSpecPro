-- Add new skill category for Image/Video Generation
ALTER TYPE "public"."skill_category" ADD VALUE IF NOT EXISTS 'image_video_generation' BEFORE 'audio_generation';
