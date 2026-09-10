-- Add unified GPT Image 2.5 Flare/Sunburst rows for WaveSpeedAI.
-- The catalog keeps one row per tier and selects the text-to-image or edit
-- endpoint from the presence of reference images at request time.
-- SmartAIHub credits use 1 USD = 1,000 credits. Edit pricing includes one
-- reference image; each additional image costs 12 credits ($0.012).
INSERT INTO "media_models" (
  "modelId", "name", "description", "modelType", "provider", "aliases",
  "creditCost", "aspectRatios", "configJson", "isEnabled", "priority",
  "sortOrder", "thinkingModeDefault", "thinkingModes", "updatedAt"
) VALUES
(
  'openai/gpt-image-2.5-flare/text-to-image',
  'GPT Image 2.5 Flare (WaveSpeed)',
  'OpenAI GPT Image 2.5 Flare text-to-image and reference-image editing via WaveSpeedAI.',
  'image'::media_model_type,
  'wavespeed_ai',
  '["wavespeed gpt image 2.5 flare", "wavespeed gpt-image-2.5-flare", "openai/gpt-image-2.5-flare/edit", "wavespeed gpt image 2.5 flare edit"]'::json,
  24,
  '["1:1", "1:2", "2:1", "1:3", "3:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "9:21", "21:9"]'::json,
  jsonb_build_object(
    'apiPayloadFormat', 'wavespeed',
    'generateType', 'text-to-image',
    'providerModelId', 'openai/gpt-image-2.5-flare/text-to-image',
    'apiEndpoint', '/openai/gpt-image-2.5-flare/text-to-image',
    'apiQueryEndpoint', '/predictions/{requestId}/result',
    'pricingFormula', 'matrix',
    'pricingTiers', '{"1k-low-text-to-image":10,"2k-low-text-to-image":20,"4k-low-text-to-image":30,"1k-medium-text-to-image":24,"2k-medium-text-to-image":40,"4k-medium-text-to-image":70,"1k-high-text-to-image":90,"2k-high-text-to-image":150,"4k-high-text-to-image":270,"1k-xhigh-text-to-image":160,"2k-xhigh-text-to-image":270,"4k-xhigh-text-to-image":480,"1k-max-text-to-image":360,"2k-max-text-to-image":600,"4k-max-text-to-image":1000,"1k-low-edit":20,"2k-low-edit":30,"4k-low-edit":40,"1k-medium-edit":34,"2k-medium-edit":50,"4k-medium-edit":80,"1k-high-edit":100,"2k-high-edit":160,"4k-high-edit":280,"1k-xhigh-edit":170,"2k-xhigh-edit":280,"4k-xhigh-edit":490,"1k-max-edit":370,"2k-max-edit":610,"4k-max-edit":1010}'::jsonb,
    'pricingAdditionalReferenceCost', 12,
    'pricingAdditionalReferenceField', 'images',
    'supportsReferenceImages', true,
    'maxReferenceImages', 16,
    'inputFields', '[
      {"key":"images","label":"Reference Images","type":"image_urls","required":false,"syncWith":"reference_images","providerPayloadKey":"images","pricingAliases":["reference_image_urls","referenceImageUrls"],"pricingPresenceLabels":{"present":"edit","absent":"text-to-image"},"affectsPricing":true,"maxItems":16},
      {"key":"aspect_ratio","label":"Aspect Ratio","type":"select","required":false,"syncWith":"aspect_ratio","default":"1:1","options":[{"value":"1:1","label":"1:1"},{"value":"1:2","label":"1:2"},{"value":"2:1","label":"2:1"},{"value":"1:3","label":"1:3"},{"value":"3:1","label":"3:1"},{"value":"2:3","label":"2:3"},{"value":"3:2","label":"3:2"},{"value":"3:4","label":"3:4"},{"value":"4:3","label":"4:3"},{"value":"4:5","label":"4:5"},{"value":"5:4","label":"5:4"},{"value":"9:16","label":"9:16"},{"value":"16:9","label":"16:9"},{"value":"9:21","label":"9:21"},{"value":"21:9","label":"21:9"}]},
      {"key":"resolution","label":"Resolution","type":"select","required":false,"syncWith":"resolution","default":"1k","affectsPricing":true,"options":[{"value":"1k","label":"1K"},{"value":"2k","label":"2K"},{"value":"4k","label":"4K"}]},
      {"key":"quality","label":"Thinking Mode","type":"select","required":false,"default":"medium","affectsPricing":true,"options":[{"value":"low","label":"Low"},{"value":"medium","label":"Medium"},{"value":"high","label":"High"},{"value":"xhigh","label":"XHigh"},{"value":"max","label":"Max"}]},
      {"key":"output_format","label":"Output Format","type":"select","required":false,"default":"png","options":[{"value":"png","label":"PNG"},{"value":"jpeg","label":"JPEG"},{"value":"webp","label":"WEBP"}]}
    ]'::jsonb,
    'apiConfig', jsonb_build_object('provider','wavespeed_ai','provider_model_id','openai/gpt-image-2.5-flare/text-to-image','provider_model_id_with_references','openai/gpt-image-2.5-flare/edit','endpoint_with_references','/openai/gpt-image-2.5-flare/edit','generate_type','text-to-image','defaultInputParams',jsonb_build_object('resolution','1k','quality','medium','output_format','png'))
  ),
  true, 11, 110, 'medium', '["low","medium","high","xhigh","max"]'::json, NOW()
),
(
  'openai/gpt-image-2.5-sunburst/text-to-image',
  'GPT Image 2.5 Sunburst (WaveSpeed)',
  'OpenAI GPT Image 2.5 Sunburst text-to-image and reference-image editing via WaveSpeedAI.',
  'image'::media_model_type,
  'wavespeed_ai',
  '["wavespeed gpt image 2.5 sunburst", "wavespeed gpt-image-2.5-sunburst", "openai/gpt-image-2.5-sunburst/edit", "wavespeed gpt image 2.5 sunburst edit"]'::json,
  24,
  '["1:1", "1:2", "2:1", "1:3", "3:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "9:21", "21:9"]'::json,
  jsonb_build_object(
    'apiPayloadFormat', 'wavespeed',
    'generateType', 'text-to-image',
    'providerModelId', 'openai/gpt-image-2.5-sunburst/text-to-image',
    'apiEndpoint', '/openai/gpt-image-2.5-sunburst/text-to-image',
    'apiQueryEndpoint', '/predictions/{requestId}/result',
    'pricingFormula', 'matrix',
    'pricingTiers', '{"1k-low-text-to-image":10,"2k-low-text-to-image":20,"4k-low-text-to-image":30,"1k-medium-text-to-image":24,"2k-medium-text-to-image":40,"4k-medium-text-to-image":70,"1k-high-text-to-image":90,"2k-high-text-to-image":150,"4k-high-text-to-image":270,"1k-xhigh-text-to-image":160,"2k-xhigh-text-to-image":270,"4k-xhigh-text-to-image":480,"1k-max-text-to-image":360,"2k-max-text-to-image":600,"4k-max-text-to-image":1000,"1k-low-edit":20,"2k-low-edit":30,"4k-low-edit":40,"1k-medium-edit":34,"2k-medium-edit":50,"4k-medium-edit":80,"1k-high-edit":100,"2k-high-edit":160,"4k-high-edit":280,"1k-xhigh-edit":170,"2k-xhigh-edit":280,"4k-xhigh-edit":490,"1k-max-edit":370,"2k-max-edit":610,"4k-max-edit":1010}'::jsonb,
    'pricingAdditionalReferenceCost', 12,
    'pricingAdditionalReferenceField', 'images',
    'supportsReferenceImages', true,
    'maxReferenceImages', 16,
    'inputFields', '[
      {"key":"images","label":"Reference Images","type":"image_urls","required":false,"syncWith":"reference_images","providerPayloadKey":"images","pricingAliases":["reference_image_urls","referenceImageUrls"],"pricingPresenceLabels":{"present":"edit","absent":"text-to-image"},"affectsPricing":true,"maxItems":16},
      {"key":"aspect_ratio","label":"Aspect Ratio","type":"select","required":false,"syncWith":"aspect_ratio","default":"1:1","options":[{"value":"1:1","label":"1:1"},{"value":"1:2","label":"1:2"},{"value":"2:1","label":"2:1"},{"value":"1:3","label":"1:3"},{"value":"3:1","label":"3:1"},{"value":"2:3","label":"2:3"},{"value":"3:2","label":"3:2"},{"value":"3:4","label":"3:4"},{"value":"4:3","label":"4:3"},{"value":"4:5","label":"4:5"},{"value":"5:4","label":"5:4"},{"value":"9:16","label":"9:16"},{"value":"16:9","label":"16:9"},{"value":"9:21","label":"9:21"},{"value":"21:9","label":"21:9"}]},
      {"key":"resolution","label":"Resolution","type":"select","required":false,"syncWith":"resolution","default":"1k","affectsPricing":true,"options":[{"value":"1k","label":"1K"},{"value":"2k","label":"2K"},{"value":"4k","label":"4K"}]},
      {"key":"quality","label":"Thinking Mode","type":"select","required":false,"default":"medium","affectsPricing":true,"options":[{"value":"low","label":"Low"},{"value":"medium","label":"Medium"},{"value":"high","label":"High"},{"value":"xhigh","label":"XHigh"},{"value":"max","label":"Max"}]},
      {"key":"output_format","label":"Output Format","type":"select","required":false,"default":"png","options":[{"value":"png","label":"PNG"},{"value":"jpeg","label":"JPEG"},{"value":"webp","label":"WEBP"}]}
    ]'::jsonb,
    'apiConfig', jsonb_build_object('provider','wavespeed_ai','provider_model_id','openai/gpt-image-2.5-sunburst/text-to-image','provider_model_id_with_references','openai/gpt-image-2.5-sunburst/edit','endpoint_with_references','/openai/gpt-image-2.5-sunburst/edit','generate_type','text-to-image','defaultInputParams',jsonb_build_object('resolution','1k','quality','medium','output_format','png'))
  ),
  true, 12, 111, 'medium', '["low","medium","high","xhigh","max"]'::json, NOW()
)
ON CONFLICT ("modelId") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "modelType" = EXCLUDED."modelType",
  "provider" = EXCLUDED."provider",
  "aliases" = EXCLUDED."aliases",
  "creditCost" = EXCLUDED."creditCost",
  "aspectRatios" = EXCLUDED."aspectRatios",
  "configJson" = EXCLUDED."configJson",
  "isEnabled" = EXCLUDED."isEnabled",
  "priority" = EXCLUDED."priority",
  "sortOrder" = EXCLUDED."sortOrder",
  "thinkingModeDefault" = EXCLUDED."thinkingModeDefault",
  "thinkingModes" = EXCLUDED."thinkingModes",
  "updatedAt" = NOW();
