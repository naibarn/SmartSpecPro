-- Feature 170: declarative, version-independent video capability profiles.
-- The profile is data, not a model-id switch, so a provider can add a new
-- model/version by registering the same capability shape without code edits.

UPDATE "media_models"
SET "configJson" = (COALESCE("configJson"::jsonb, '{}'::jsonb) || jsonb_build_object(
  'videoCapabilityProfile', jsonb_build_object(
    'providerFamily', 'minimax-h3',
    'modelKey', 'minimax-h3',
    'displayName', 'MiniMax H3',
    'capabilityProfileVersion', 'minimax-h3/1',
    'capabilitySource', 'provider_manifest',
    'modes', jsonb_build_array(
      jsonb_build_object(
        'id', 'text-to-video', 'acceptsStartFrame', false,
        'acceptsStopFrame', false, 'acceptsReferenceImages', false,
        'acceptsReferenceVideos', false, 'acceptsReferenceAudio', false,
        'allowsMixedReferences', false, 'maxImages', 0, 'maxVideos', 0,
        'maxAudio', 0, 'maxTotalReferences', 0, 'maxPayloadBytes', null,
        'maxVideoDurationSec', 15,
        'requiresVisualReferenceForAudio', false,
        'supportedReferenceRoles', jsonb_build_array(),
        'preservesStartStopSemanticsWithReferences', false,
        'transport', 'kie', 'nativeFieldMap', jsonb_build_object()
      ),
      jsonb_build_object(
        'id', 'image-to-video', 'acceptsStartFrame', true,
        'acceptsStopFrame', true, 'acceptsReferenceImages', false,
        'acceptsReferenceVideos', false, 'acceptsReferenceAudio', false,
        'allowsMixedReferences', false, 'maxImages', 0, 'maxVideos', 0,
        'maxAudio', 0, 'maxTotalReferences', 0, 'maxPayloadBytes', null,
        'maxVideoDurationSec', 15,
        'requiresVisualReferenceForAudio', false,
        'supportedReferenceRoles', jsonb_build_array(),
        'preservesStartStopSemanticsWithReferences', true,
        'transport', 'kie',
        'nativeFieldMap', jsonb_build_object('startFrame', 'first_frame_url', 'stopFrame', 'last_frame_url')
      ),
      jsonb_build_object(
        'id', 'reference-to-video', 'acceptsStartFrame', true,
        'acceptsStopFrame', false, 'acceptsReferenceImages', true,
        'acceptsReferenceVideos', true, 'acceptsReferenceAudio', true,
        'allowsMixedReferences', true, 'maxImages', 9, 'maxVideos', 3,
        'maxAudio', 3, 'maxTotalReferences', 15, 'maxPayloadBytes', null,
        'maxVideoDurationSec', 15,
        'requiresVisualReferenceForAudio', true,
        'supportedReferenceRoles', jsonb_build_array('reference', 'character', 'location', 'prop', 'style', 'continuity', 'action', 'barrier_reference', 'soundscape'),
        'preservesStartStopSemanticsWithReferences', false,
        'transport', 'kie',
        'nativeFieldMap', jsonb_build_object('images', 'reference_image_urls', 'videos', 'reference_video_urls', 'audio', 'reference_audio_urls')
      )
    )
  )
))::json
WHERE "modelId" = 'minimax-h3';

UPDATE "media_models"
SET "configJson" = (COALESCE("configJson"::jsonb, '{}'::jsonb) || jsonb_build_object(
  'videoCapabilityProfile', jsonb_build_object(
    'providerFamily', 'seedance', 'modelKey', "modelId",
    'displayName', "name", 'capabilityProfileVersion', 'seedance/1',
    'capabilitySource', 'provider_manifest',
    'modes', jsonb_build_array(jsonb_build_object(
      'id', 'mixed-reference-to-video', 'acceptsStartFrame', true,
      'acceptsStopFrame', false, 'acceptsReferenceImages', true,
      'acceptsReferenceVideos', true, 'acceptsReferenceAudio', true,
      'allowsMixedReferences', true, 'maxImages', CASE WHEN "modelId" ILIKE '%2.5%' THEN 30 ELSE 9 END,
      'maxVideos', CASE WHEN "modelId" ILIKE '%2.5%' THEN 10 ELSE 3 END,
      'maxAudio', CASE WHEN "modelId" ILIKE '%2.5%' THEN 10 ELSE 3 END,
      'maxTotalReferences', null, 'maxPayloadBytes', null,
      'maxVideoDurationSec', 12,
      'requiresVisualReferenceForAudio', true,
      'supportedReferenceRoles', jsonb_build_array('reference', 'character', 'location', 'prop', 'style', 'continuity', 'action', 'barrier_reference', 'soundscape'),
      'preservesStartStopSemanticsWithReferences', false,
      'transport', 'generic_typed_media',
      'nativeFieldMap', jsonb_build_object('images', 'reference_image_urls', 'videos', 'reference_video_urls', 'audio', 'reference_audio_urls')
    ))
  )
))::json
WHERE "modelType" = 'video'::media_model_type
  AND ("modelId" ILIKE '%seedance%2.0%' OR "modelId" ILIKE '%seedance%2.5%');
