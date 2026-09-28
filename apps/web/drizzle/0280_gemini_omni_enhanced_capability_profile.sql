-- Feature 173 / Gemini Omni Enhanced readiness.
-- The static registry already declares these profiles, but the DB-backed
-- catalog is authoritative at runtime. Keep this additive and idempotent so
-- existing prompt/media data and unrelated admin-maintained config survive.

UPDATE "media_models"
SET "configJson" = (
  COALESCE("configJson"::jsonb, '{}'::jsonb) || jsonb_build_object(
    'providerProfileId', CASE
      WHEN "modelId" = 'gemini-omni-video' THEN 'gemini-omni-video'
      ELSE 'google/gemini-omni-flash-1-1'
    END,
    'videoCapabilityProfile', CASE
      WHEN "modelId" = 'gemini-omni-video' THEN jsonb_build_object(
        'providerFamily', 'gemini-omni',
        'modelKey', 'gemini-omni-video',
        'displayName', 'Gemini Omni Video',
        'capabilityProfileVersion', 'gemini-omni/1',
        'capabilitySource', 'runtime_catalog',
        'modes', jsonb_build_array(jsonb_build_object(
          'id', 'mixed-references',
          'acceptsStartFrame', true,
          'acceptsStopFrame', true,
          'acceptsReferenceImages', true,
          'acceptsReferenceVideos', true,
          'acceptsReferenceAudio', true,
          'allowsMixedReferences', true,
          'maxImages', 7,
          'maxVideos', 1,
          'maxAudio', 1,
          'maxTotalReferences', 9,
          'maxPayloadBytes', null,
          'maxVideoDurationSec', 30,
          'startFrameConsumesImageSlot', false,
          'requiresVisualReferenceForAudio', false,
          'supportedReferenceRoles', jsonb_build_array(
            'reference', 'character', 'location', 'prop', 'style',
            'continuity', 'action', 'barrier_reference', 'soundscape'
          ),
          'preservesStartStopSemanticsWithReferences', true,
          'transport', 'kie',
          'nativeFieldMap', jsonb_build_object(
            'startFrame', 'first_frame_url',
            'stopFrame', 'last_frame_url',
            'images', 'image_urls',
            'videos', 'video_list',
            'audio', 'audio_urls'
          )
        ))
      )
      ELSE jsonb_build_object(
        'providerFamily', 'gemini-omni',
        'modelKey', 'gemini-omni-flash-1-1',
        'displayName', 'Gemini Omni Flash 1.1',
        'capabilityProfileVersion', 'gemini-omni/1',
        'capabilitySource', 'runtime_catalog',
        'modes', jsonb_build_array(jsonb_build_object(
          'id', 'mixed-references',
          'acceptsStartFrame', true,
          'acceptsStopFrame', true,
          'acceptsReferenceImages', true,
          'acceptsReferenceVideos', true,
          'acceptsReferenceAudio', true,
          'allowsMixedReferences', true,
          'maxImages', 7,
          'maxVideos', 1,
          'maxAudio', 3,
          'maxTotalReferences', 11,
          'maxPayloadBytes', null,
          'maxVideoDurationSec', 30,
          'startFrameConsumesImageSlot', false,
          'requiresVisualReferenceForAudio', false,
          'supportedReferenceRoles', jsonb_build_array(
            'reference', 'character', 'location', 'prop', 'style',
            'continuity', 'action', 'barrier_reference', 'soundscape'
          ),
          'preservesStartStopSemanticsWithReferences', true,
          'transport', 'kie',
          'nativeFieldMap', jsonb_build_object(
            'startFrame', 'first_frame_url',
            'stopFrame', 'last_frame_url',
            'images', 'image_urls',
            'videos', 'video_list',
            'audio', 'audio_urls'
          )
        ))
      )
    END
  )
)::json
WHERE "modelId" IN ('gemini-omni-video', 'gemini-omni-flash-1-1')
  AND "modelType" = 'video'::media_model_type;
