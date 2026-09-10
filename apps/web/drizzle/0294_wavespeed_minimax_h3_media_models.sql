-- WaveSpeedAI MiniMax H3 open-weights catalog (13 endpoint-specific models).
-- SmartAIHub credits: 1 USD = 1,000 credits.
-- Official minimax/h3 endpoints are intentionally not included; this migration
-- mirrors the 13 wavespeed-ai/minimax-h3 entries shown in the product catalog.
WITH model_rows(model_id, model_name, description, model_type, route, credit_cost, sort_order, max_images, max_videos, max_audios, max_loras, supports_last_image, supports_aspect_ratio) AS (
  VALUES
    ('wavespeed-ai/minimax-h3/image-to-video-spicy', 'MiniMax H3 Spicy Image-to-Video (WaveSpeed)', 'MiniMax H3 Open Weights spicy image-to-video with native stereo audio.', 'video', 'image-to-video', 100, 200, 1, 0, 0, 0, true, false),
    ('wavespeed-ai/minimax-h3/image-to-video', 'MiniMax H3 Image-to-Video (WaveSpeed)', 'MiniMax H3 Open Weights image-to-video with native stereo audio.', 'video', 'image-to-video', 100, 201, 1, 0, 0, 0, true, false),
    ('wavespeed-ai/minimax-h3/reference-to-video', 'MiniMax H3 Reference-to-Video (WaveSpeed)', 'MiniMax H3 Open Weights video generation from image, video, and audio references.', 'video', 'reference-to-video', 125, 202, 9, 3, 3, 0, false, true),
    ('wavespeed-ai/minimax-h3/text-to-video', 'MiniMax H3 Text-to-Video (WaveSpeed)', 'MiniMax H3 Open Weights text-to-video with native stereo audio.', 'video', 'text-to-video', 100, 203, 0, 0, 0, 0, false, true),
    ('wavespeed-ai/minimax-h3/image-to-video-lora', 'MiniMax H3 Image-to-Video LoRA (WaveSpeed)', 'MiniMax H3 Open Weights image-to-video with custom LoRA support.', 'video', 'image-to-video', 125, 204, 1, 0, 0, 3, true, false),
    ('wavespeed-ai/minimax-h3/reference-to-video-lora', 'MiniMax H3 Reference-to-Video LoRA (WaveSpeed)', 'MiniMax H3 Open Weights multimodal reference-to-video with custom LoRA support.', 'video', 'reference-to-video', 150, 205, 9, 3, 3, 3, false, true),
    ('wavespeed-ai/minimax-h3/text-to-video-lora', 'MiniMax H3 Text-to-Video LoRA (WaveSpeed)', 'MiniMax H3 Open Weights text-to-video with custom LoRA support.', 'video', 'text-to-video', 125, 206, 0, 0, 0, 3, false, true),
    ('wavespeed-ai/minimax-h3/video-edit', 'MiniMax H3 Video Edit (WaveSpeed)', 'MiniMax H3 Open Weights video-to-video editing with native stereo audio.', 'video', 'video-edit', 125, 207, 9, 1, 3, 0, false, true),
    ('wavespeed-ai/minimax-h3/video-extend', 'MiniMax H3 Video Extend (WaveSpeed)', 'MiniMax H3 Open Weights continuation of an existing video.', 'video', 'video-extend', 100, 208, 0, 1, 0, 0, true, false),
    ('wavespeed-ai/minimax-h3/image-edit-lora', 'MiniMax H3 Image Edit LoRA (WaveSpeed)', 'MiniMax H3 Open Weights image editing with up to 9 references and custom LoRA.', 'image', 'image-edit', 30, 209, 9, 0, 0, 3, false, true),
    ('wavespeed-ai/minimax-h3/text-to-image-lora', 'MiniMax H3 Text-to-Image LoRA (WaveSpeed)', 'MiniMax H3 Open Weights text-to-image with custom LoRA.', 'image', 'text-to-image', 20, 210, 0, 0, 0, 3, false, true),
    ('wavespeed-ai/minimax-h3/image-edit', 'MiniMax H3 Image Edit (WaveSpeed)', 'MiniMax H3 Open Weights image editing with up to 9 reference images.', 'image', 'image-edit', 30, 211, 9, 0, 0, 0, false, true),
    ('wavespeed-ai/minimax-h3/text-to-image', 'MiniMax H3 Text-to-Image (WaveSpeed)', 'MiniMax H3 Open Weights text-to-image generation.', 'image', 'text-to-image', 20, 212, 0, 0, 0, 0, false, true)
), shared AS (
  SELECT '["16:9","9:16","1:1","4:3","3:4","21:9","9:21"]'::json AS ratios,
         '["480p","540p","768p","1080p"]'::json AS video_resolutions,
         '["1k","2k"]'::json AS image_resolutions,
         '["1k","2k"]'::json AS image_sizes,
         '["png","jpeg","webp"]'::json AS output_formats
)
INSERT INTO "media_models" (
  "modelId", "name", "description", "modelType", "provider", "aliases",
  "creditCost", "aspectRatios", "durations", "sizes", "configJson",
  "isEnabled", "priority", "sortOrder", "thinkingModeDefault", "thinkingModes", "updatedAt"
)
SELECT
  row.model_id,
  row.model_name,
  row.description,
  row.model_type::media_model_type,
  'wavespeed_ai',
  json_build_array(lower(row.model_name), row.model_id),
  row.credit_cost,
  CASE WHEN row.supports_aspect_ratio THEN shared.ratios ELSE '[]'::json END,
  CASE WHEN row.model_type = 'video' THEN '[3,4,5,6,7,8,9,10,11,12,13,14,15]'::json ELSE '[]'::json END,
  CASE WHEN row.model_type = 'video' THEN shared.video_resolutions ELSE shared.image_sizes END,
  (
    jsonb_build_object(
      'apiPayloadFormat', 'wavespeed',
      'generateType', row.route,
      'providerModelId', row.model_id,
      'apiEndpoint', '/' || row.model_id,
      'apiQueryEndpoint', '/predictions/{requestId}/result',
      'pricingFormula', CASE WHEN row.model_type = 'video' THEN 'per_second' ELSE 'matrix' END,
      'pricingTiers', CASE WHEN row.model_type = 'video' THEN jsonb_build_object('default', row.credit_cost) ELSE jsonb_build_object('1k', 20, '2k', 60) END,
      'pricingPerSecondByResolution', CASE WHEN row.model_type = 'video' THEN jsonb_build_object('480p', row.credit_cost / 5.0, '540p', row.credit_cost * 1.5 / 5.0, '768p', row.credit_cost * 2.0 / 5.0, '1080p', row.credit_cost * 4.0 / 5.0) ELSE NULL END,
      'pricingAdditionalReferenceCosts', CASE WHEN row.route = 'video-edit' THEN jsonb_build_object('reference_images', 20, 'reference_audios', 20) ELSE NULL END,
      'nativeAudio', row.model_type = 'video',
      'supportsReferenceImages', row.max_images > 0,
      'requiresReferenceImages', row.route IN ('image-to-video', 'image-edit'),
      'maxReferenceImages', row.max_images,
      'maxReferenceVideos', row.max_videos,
      'maxReferenceAudios', row.max_audios,
      'maxLoras', row.max_loras,
      'supportsLastImage', row.supports_last_image,
      'inputFields', CASE
        WHEN row.route = 'text-to-video' THEN jsonb_build_array(
          jsonb_build_object('key','prompt','label','Prompt','type','text','required',true,'syncWith','prompt'),
          jsonb_build_object('key','aspect_ratio','label','Aspect Ratio','type','select','default','16:9','options',jsonb_build_array('16:9','9:16','1:1','4:3','3:4','21:9','9:21')),
          jsonb_build_object('key','resolution','label','Resolution','type','select','default','480p','affectsPricing',true,'options',jsonb_build_array('480p','540p','768p','1080p')),
          jsonb_build_object('key','duration','label','Duration','type','select','default','5','affectsPricing',true,'options',jsonb_build_array('3','4','5','6','7','8','9','10','11','12','13','14','15')),
          jsonb_build_object('key','seed','label','Seed','type','number','required',false,'advancedOnly',true)
        ) || CASE WHEN row.max_loras > 0 THEN jsonb_build_array(jsonb_build_object('key','loras','label','LoRA Weights','type','array','maxItems',3,'providerPayloadKey','loras','itemFields',jsonb_build_array(jsonb_build_object('key','path','label','LoRA URL','type','text','required',true),jsonb_build_object('key','scale','label','Scale','type','number','required',true,'default',1)))) ELSE '[]'::jsonb END
        WHEN row.route = 'image-to-video' THEN jsonb_build_array(
          jsonb_build_object('key','prompt','label','Prompt','type','text','required',true,'syncWith','prompt'),
          jsonb_build_object('key','image','label','Start Image','type','image_urls','required',true,'providerPayloadKey','image','maxItems',1),
          jsonb_build_object('key','last_image','label','Last Frame Image','type','image_urls','required',false,'providerPayloadKey','last_image','maxItems',1),
          jsonb_build_object('key','resolution','label','Resolution','type','select','default','480p','affectsPricing',true,'options',jsonb_build_array('480p','540p','768p','1080p')),
          jsonb_build_object('key','duration','label','Duration','type','select','default','5','affectsPricing',true,'options',jsonb_build_array('3','4','5','6','7','8','9','10','11','12','13','14','15')),
          jsonb_build_object('key','seed','label','Seed','type','number','required',false,'advancedOnly',true)
        ) || CASE WHEN row.max_loras > 0 THEN jsonb_build_array(jsonb_build_object('key','loras','label','LoRA Weights','type','array','maxItems',3,'providerPayloadKey','loras','itemFields',jsonb_build_array(jsonb_build_object('key','path','label','LoRA URL','type','text','required',true),jsonb_build_object('key','scale','label','Scale','type','number','required',true,'default',1)))) ELSE '[]'::jsonb END
        WHEN row.route = 'reference-to-video' THEN jsonb_build_array(
          jsonb_build_object('key','prompt','label','Prompt','type','text','required',true,'syncWith','prompt'),
          jsonb_build_object('key','reference_images','label','Reference Images','type','image_urls','required',false,'providerPayloadKey','reference_images','maxItems',9),
          jsonb_build_object('key','reference_videos','label','Reference Videos','type','video_urls','required',false,'providerPayloadKey','reference_videos','maxItems',3),
          jsonb_build_object('key','reference_audios','label','Reference Audio','type','audio_urls','required',false,'providerPayloadKey','reference_audios','maxItems',3),
          jsonb_build_object('key','aspect_ratio','label','Aspect Ratio','type','select','default','16:9','options',jsonb_build_array('16:9','9:16','1:1','4:3','3:4','21:9','9:21')),
          jsonb_build_object('key','resolution','label','Resolution','type','select','default','480p','affectsPricing',true,'options',jsonb_build_array('480p','540p','768p','1080p')),
          jsonb_build_object('key','duration','label','Duration','type','select','default','5','affectsPricing',true,'options',jsonb_build_array('3','4','5','6','7','8','9','10','11','12','13','14','15')),
          jsonb_build_object('key','seed','label','Seed','type','number','required',false,'advancedOnly',true)
        ) || CASE WHEN row.max_loras > 0 THEN jsonb_build_array(jsonb_build_object('key','loras','label','LoRA Weights','type','array','maxItems',3,'providerPayloadKey','loras','itemFields',jsonb_build_array(jsonb_build_object('key','path','label','LoRA URL','type','text','required',true),jsonb_build_object('key','scale','label','Scale','type','number','required',true,'default',1)))) ELSE '[]'::jsonb END
        WHEN row.route = 'video-edit' THEN jsonb_build_array(
          jsonb_build_object('key','video','label','Source Video','type','video_urls','required',true,'providerPayloadKey','video','maxItems',1),
          jsonb_build_object('key','prompt','label','Prompt','type','text','required',true,'syncWith','prompt'),
          jsonb_build_object('key','reference_images','label','Reference Images','type','image_urls','required',false,'providerPayloadKey','reference_images','maxItems',9),
          jsonb_build_object('key','reference_audios','label','Reference Audio','type','audio_urls','required',false,'providerPayloadKey','reference_audios','maxItems',3),
          jsonb_build_object('key','aspect_ratio','label','Aspect Ratio','type','select','default','16:9','options',jsonb_build_array('16:9','9:16','1:1','4:3','3:4','21:9','9:21')),
          jsonb_build_object('key','resolution','label','Resolution','type','select','default','480p','affectsPricing',true,'options',jsonb_build_array('480p','540p','768p','1080p')),
          jsonb_build_object('key','duration','label','Duration','type','select','default','5','affectsPricing',true,'options',jsonb_build_array('3','4','5','6','7','8','9','10','11','12','13','14','15')),
          jsonb_build_object('key','generate_audio','label','Generate Audio','type','boolean','default',true),
          jsonb_build_object('key','seed','label','Seed','type','number','required',false,'advancedOnly',true)
        )
        WHEN row.route = 'video-extend' THEN jsonb_build_array(
          jsonb_build_object('key','video','label','Source Video','type','video_urls','required',true,'providerPayloadKey','video','maxItems',1),
          jsonb_build_object('key','prompt','label','Prompt','type','text','required',true,'syncWith','prompt'),
          jsonb_build_object('key','last_image','label','Last Frame Image','type','image_urls','required',false,'providerPayloadKey','last_image','maxItems',1),
          jsonb_build_object('key','resolution','label','Resolution','type','select','default','480p','affectsPricing',true,'options',jsonb_build_array('480p','768p')),
          jsonb_build_object('key','duration','label','Duration','type','select','default','5','affectsPricing',true,'options',jsonb_build_array('3','4','5','6','7','8','9','10','11','12','13','14','15')),
          jsonb_build_object('key','seed','label','Seed','type','number','required',false,'advancedOnly',true)
        )
        WHEN row.route = 'image-edit' THEN jsonb_build_array(
          jsonb_build_object('key','prompt','label','Prompt','type','text','required',true,'syncWith','prompt'),
          jsonb_build_object('key','images','label','Reference Images','type','image_urls','required',true,'providerPayloadKey','images','maxItems',9),
          jsonb_build_object('key','aspect_ratio','label','Aspect Ratio','type','select','default','1:1','options',jsonb_build_array('1:1','1:2','2:1','1:3','3:1','2:3','3:2','3:4','4:3','4:5','5:4','9:16','16:9','9:21','21:9')),
          jsonb_build_object('key','resolution','label','Resolution','type','select','default','1k','affectsPricing',true,'options',jsonb_build_array('1k','2k')),
          jsonb_build_object('key','output_format','label','Output Format','type','select','default','jpeg','options',jsonb_build_array('jpeg','png','webp')),
          jsonb_build_object('key','seed','label','Seed','type','number','required',false,'advancedOnly',true)
        ) || CASE WHEN row.max_loras > 0 THEN jsonb_build_array(jsonb_build_object('key','loras','label','LoRA Weights','type','array','maxItems',3,'providerPayloadKey','loras','itemFields',jsonb_build_array(jsonb_build_object('key','path','label','LoRA URL','type','text','required',true),jsonb_build_object('key','scale','label','Scale','type','number','required',true,'default',1)))) ELSE '[]'::jsonb END
        ELSE jsonb_build_array(
          jsonb_build_object('key','prompt','label','Prompt','type','text','required',true,'syncWith','prompt'),
          jsonb_build_object('key','aspect_ratio','label','Aspect Ratio','type','select','default','1:1','options',jsonb_build_array('1:1','1:2','2:1','1:3','3:1','2:3','3:2','3:4','4:3','4:5','5:4','9:16','16:9','9:21','21:9')),
          jsonb_build_object('key','resolution','label','Resolution','type','select','default','1k','affectsPricing',true,'options',jsonb_build_array('1k','2k')),
          jsonb_build_object('key','output_format','label','Output Format','type','select','default','jpeg','options',jsonb_build_array('jpeg','png','webp')),
          jsonb_build_object('key','seed','label','Seed','type','number','required',false,'advancedOnly',true)
        ) || CASE WHEN row.max_loras > 0 THEN jsonb_build_array(jsonb_build_object('key','loras','label','LoRA Weights','type','array','maxItems',3,'providerPayloadKey','loras','itemFields',jsonb_build_array(jsonb_build_object('key','path','label','LoRA URL','type','text','required',true),jsonb_build_object('key','scale','label','Scale','type','number','required',true,'default',1)))) ELSE '[]'::jsonb END
      END
    )::json
  ),
  true,
  row.sort_order / 10,
  row.sort_order,
  'none',
  '["none"]'::json,
  NOW()
FROM model_rows row
CROSS JOIN shared
ON CONFLICT ("modelId") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "modelType" = EXCLUDED."modelType",
  "provider" = EXCLUDED."provider",
  "aliases" = EXCLUDED."aliases",
  "creditCost" = EXCLUDED."creditCost",
  "aspectRatios" = EXCLUDED."aspectRatios",
  "durations" = EXCLUDED."durations",
  "sizes" = EXCLUDED."sizes",
  "configJson" = EXCLUDED."configJson",
  "isEnabled" = EXCLUDED."isEnabled",
  "priority" = EXCLUDED."priority",
  "sortOrder" = EXCLUDED."sortOrder",
  "thinkingModeDefault" = EXCLUDED."thinkingModeDefault",
  "thinkingModes" = EXCLUDED."thinkingModes",
  "updatedAt" = NOW();
