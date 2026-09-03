-- Feature 173 / Grok app transport: Vertical Drama sends the approved
-- Start Frame and selected image references in one ordered image_urls array.
-- The Start Frame therefore consumes one of Grok's seven image slots and is
-- not a separate first_frame_url field when references are present.

UPDATE "media_models"
SET "configJson" = (
  COALESCE("configJson"::jsonb, '{}'::jsonb) || jsonb_build_object(
    'providerProfileId', 'grok-imagine-video-1.5',
    'videoCapabilityProfile', jsonb_build_object(
      'providerFamily', 'grok-imagine-video',
      'modelKey', 'grok-imagine-video-1-5-preview',
      'displayName', 'Grok Imagine Video 1.5 (SmartAIHub image transport)',
      'capabilityProfileVersion', 'grok-imagine-video/1.5-app-transport-1',
      'capabilitySource', 'runtime_catalog',
      'modes', jsonb_build_array(jsonb_build_object(
        'id', 'reference-to-video',
        'acceptsStartFrame', true,
        'acceptsStopFrame', false,
        'acceptsReferenceImages', true,
        'acceptsReferenceVideos', false,
        'acceptsReferenceAudio', false,
        'allowsMixedReferences', false,
        'maxImages', 7,
        'maxVideos', 0,
        'maxAudio', 0,
        'maxTotalReferences', 7,
        'maxPayloadBytes', null,
        'maxVideoDurationSec', 15,
        'startFrameConsumesImageSlot', true,
        'requiresVisualReferenceForAudio', false,
        'supportedReferenceRoles', jsonb_build_array(
          'reference', 'character', 'location', 'prop', 'style',
          'continuity', 'action', 'barrier_reference', 'soundscape'
        ),
        'preservesStartStopSemanticsWithReferences', false,
        'transport', 'kie',
        'nativeFieldMap', jsonb_build_object(
          'startFrame', 'image_urls',
          'images', 'image_urls'
        )
      ))
    )
  )
)::json
WHERE "modelId" = 'grok-imagine-video-1-5-preview';
