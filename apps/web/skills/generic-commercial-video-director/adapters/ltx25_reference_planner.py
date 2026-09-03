from __future__ import annotations
from typing import Any

IMAGE_REF_ROLES={
    'product_reference','character_reference','environment_reference','style_reference','place_reference','venue_reference',
    'storefront_reference','interior_reference','exterior_reference','signage_reference','menu_reference','service_reference',
    'property_reference','facility_reference','map_reference','logo','ui_reference','mechanism_reference','mid_keyframe','clay_render_reference'
}
VIDEO_REF_ROLES={'video_reference','motion_reference','camera_reference','source_video'}
AUDIO_REF_ROLES={'audio_reference','voice_reference','music_reference','sound_reference'}


def semantic_roles(a:dict[str,Any])->list[str]:
    out=list(a.get('referencePurposes') or [])
    defaults={
      'product_reference':['product_geometry','product_label'],'character_reference':['identity'],
      'environment_reference':['environment'],'style_reference':['style'],
      'place_reference':['place_identity','venue_layout','place_atmosphere'],'venue_reference':['place_identity','venue_layout'],
      'motion_reference':['motion'],'camera_reference':['camera_motion'],'video_reference':['motion','temporal_structure'],
      'source_video':['source_video_continuation'],'voice_reference':['voice_timbre','voice_delivery'],
      'audio_reference':['audio_continuity'],'music_reference':['music_style'],'sound_reference':['sound_effect'],
      'ui_reference':['ui_source'],'mechanism_reference':['mechanism_reference'],'clay_render_reference':['blocking_reference','trajectory_reference']
    }
    for x in defaults.get(a.get('role'),[]):
        if x not in out: out.append(x)
    return out


def _policy(a:dict[str,Any])->str:
    return a.get('providerUsePolicy','auto')


def _ltx_hints(a:dict[str,Any])->dict[str,Any]:
    return ((a.get('providerHints') or {}).get('ltx') or {})


def _derive(a:dict[str,Any])->str:
    sem=set(semantic_roles(a))
    if 'identity' in sem:return 'identity_description'
    if {'product_geometry','product_label'} & sem:return 'product_description'
    if {'place_identity','venue_layout','place_atmosphere'} & sem:return 'place_description'
    if 'motion' in sem:return 'motion_description'
    if 'camera_motion' in sem:return 'camera_description'
    if {'voice_timbre','voice_delivery','audio_continuity'} & sem:return 'audio_description'
    return 'visual_description'


def plan_ltx25_inputs(
    assets:list[dict[str,Any]], *, execution_route:str='auto', model:str='auto', requested_mode:str='auto',
    audio_driver_asset_id:str|None=None, reference_policy:str='auto',
    local_reference_workflow_verified:bool=False, local_extension_workflow_verified:bool=False,
) -> dict[str,Any]:
    asset_by_id={a['assetId']:a for a in assets}
    start=next((a for a in assets if a.get('role')=='start_frame'),None)
    last=next((a for a in assets if a.get('role')=='end_frame'),None)
    warnings=[]; derived=[]; non_provider=[]; blocked=False; prebake=False; local_required=False

    # Resolve explicit audio soundtrack driver. A2V audio is not a soft reference; it is the actual timeline soundtrack.
    flagged=[a for a in assets if a.get('mediaType')=='audio' and _ltx_hints(a).get('useAsAudioDriver')]
    if audio_driver_asset_id:
        if audio_driver_asset_id not in asset_by_id or asset_by_id[audio_driver_asset_id].get('mediaType')!='audio':
            blocked=True; warnings.append('audioDriverAssetId must point to an uploaded audio asset.')
        driver=asset_by_id.get(audio_driver_asset_id)
    elif len(flagged)==1:
        driver=flagged[0]
    elif len(flagged)>1:
        driver=None;blocked=True;warnings.append('LTX Audio-to-Video accepts one soundtrack driver; multiple assets are marked useAsAudioDriver.')
    else:
        driver=None

    images=[];videos=[];audios=[]
    for a in assets:
        if a is start or a is last or (driver is not None and a.get('assetId')==driver.get('assetId')):
            continue
        if _policy(a)=='analysis_only':
            non_provider.append({'assetId':a['assetId'],'reason':'providerUsePolicy=analysis_only','preservedAs':'analysis_only'});continue
        if _policy(a)=='post_only':
            non_provider.append({'assetId':a['assetId'],'reason':'providerUsePolicy=post_only','preservedAs':'post_only'});continue
        mt=a.get('mediaType');role=a.get('role')
        if mt=='image' and (role in IMAGE_REF_ROLES or a.get('referencePurposes')): images.append(a)
        elif mt=='video' or role in VIDEO_REF_ROLES: videos.append(a)
        elif mt=='audio' or role in AUDIO_REF_ROLES: audios.append(a)

    # Route/model truth.
    if execution_route=='auto':
        route='local_comfyui' if model=='Lightricks/LTX-2.5' else 'cloud_api'
    else:
        route=execution_route
    if route=='cloud_api':
        resolved_model='ltx-2-5-pro' if model=='auto' else model
        if resolved_model not in {'ltx-2-5-fast','ltx-2-5-pro'}:
            blocked=True;warnings.append('LTX cloud route requires ltx-2-5-fast or ltx-2-5-pro.')
    else:
        resolved_model='Lightricks/LTX-2.5'
        if model not in {'auto','Lightricks/LTX-2.5'}:
            warnings.append('Local LTX route normalizes model to Lightricks/LTX-2.5 open weights.')

    if last and not start:
        blocked=True;warnings.append('LTX last frame requires a first/start frame.')

    # Explicit local extension is never silently mapped to cloud 2.5 Extend endpoint.
    if requested_mode=='local_extension':
        if route=='cloud_api':
            blocked=True;warnings.append('LTX-2.5 cloud variants do not support Extend; choose a verified local workflow or another provider.')
        elif not local_extension_workflow_verified:
            blocked=True;warnings.append('local_extension requires localExtensionWorkflowVerified=true.')
        mode='local_extension';local_required=True
    elif driver is not None or requested_mode=='audio_to_video':
        mode='audio_to_video'
        if driver is None:
            blocked=True;warnings.append('audio_to_video requires one explicit audio soundtrack driver.')
        if route!='cloud_api':
            local_required=True
    elif start and last:
        mode='first_last_to_video'
    elif start:
        mode='image_to_video'
    elif requested_mode=='local_ic_lora':
        mode='local_ic_lora';local_required=True
        if route=='cloud_api':
            blocked=True;warnings.append('local_ic_lora is a local execution mode, not an LTX cloud API mode.')
        elif not local_reference_workflow_verified:
            blocked=True;warnings.append('local_ic_lora requires localReferenceWorkflowVerified=true.')
    else:
        mode='text_to_video'

    # Cloud reference semantics: only first/last frame + one exact audio driver are first-class inputs.
    if route=='cloud_api' and (images or videos or audios):
        policy=reference_policy
        if policy=='auto':
            policy='prebake_start_frame' if images else 'derive_to_prompt'
        if policy=='prebake_start_frame':
            if images:
                prebake=True
                for a in images:
                    derived.append({'sourceAssetId':a['assetId'],'derivation':'prebaked_start_frame','resultRole':'start_frame_composite_input'})
                    non_provider.append({'assetId':a['assetId'],'reason':'LTX cloud 2.5 has no generic soft image-reference bundle; integrate into an approved first frame.','preservedAs':'prebake_input'})
            for a in videos+audios:
                if _policy(a)=='must_use_raw':
                    blocked=True;non_provider.append({'assetId':a['assetId'],'reason':'LTX cloud 2.5 cannot consume this raw generic video/audio reference.','preservedAs':'fallback_provider'})
                else:
                    derived.append({'sourceAssetId':a['assetId'],'derivation':_derive(a),'resultRole':'prompt_guidance'})
                    non_provider.append({'assetId':a['assetId'],'reason':'LTX cloud reference input unsupported; retained as derived guidance.','preservedAs':'derived_guidance'})
        elif policy=='derive_to_prompt':
            for a in images+videos+audios:
                if _policy(a)=='must_use_raw':
                    blocked=True;non_provider.append({'assetId':a['assetId'],'reason':'must_use_raw reference cannot be downgraded to text for LTX cloud 2.5.','preservedAs':'fallback_provider'})
                else:
                    derived.append({'sourceAssetId':a['assetId'],'derivation':_derive(a),'resultRole':'prompt_guidance'})
                    non_provider.append({'assetId':a['assetId'],'reason':'Generic LTX cloud reference converted to prompt guidance.','preservedAs':'derived_guidance'})
        elif policy=='local_ic_lora':
            blocked=True;local_required=True
            for a in images+videos+audios:
                non_provider.append({'assetId':a['assetId'],'reason':'Reference requires a verified local IC-LoRA workflow rather than cloud API.','preservedAs':'local_workflow'})
        elif policy=='fallback_provider':
            blocked=any(_policy(a)=='must_use_raw' for a in images+videos+audios)
            for a in images+videos+audios:
                non_provider.append({'assetId':a['assetId'],'reason':'Reference semantics are not supported by LTX cloud 2.5.','preservedAs':'fallback_provider'})
        else:
            blocked=True
            for a in images+videos+audios:
                non_provider.append({'assetId':a['assetId'],'reason':'LTX reference policy blocks unsupported generic reference inputs.','preservedAs':'separate_stage'})

    # Local reference handling is conditional on a known workflow/IC-LoRA adapter.
    if route!='cloud_api' and (images or videos or audios):
        policy=reference_policy
        if policy=='auto': policy='local_ic_lora' if local_reference_workflow_verified else ('prebake_start_frame' if images else 'derive_to_prompt')
        if policy=='local_ic_lora':
            local_required=True
            if not local_reference_workflow_verified:
                blocked=True;warnings.append('Local LTX raw reference conditioning requires a verified IC-LoRA/custom workflow.')
            else:
                mode='local_ic_lora'
                for a in images+videos+audios:
                    non_provider.append({'assetId':a['assetId'],'reason':'Consumed by verified local LTX IC-LoRA/custom reference workflow.','preservedAs':'local_workflow'})
        elif policy=='prebake_start_frame':
            if images:
                prebake=True
                for a in images:
                    derived.append({'sourceAssetId':a['assetId'],'derivation':'prebaked_start_frame','resultRole':'start_frame_composite_input'})
                    non_provider.append({'assetId':a['assetId'],'reason':'Prebake generic references into an approved first frame for standard local I2V.','preservedAs':'prebake_input'})
            for a in videos+audios:
                if _policy(a)=='must_use_raw': blocked=True; preserve='fallback_provider'
                else: preserve='derived_guidance';derived.append({'sourceAssetId':a['assetId'],'derivation':_derive(a),'resultRole':'prompt_guidance'})
                non_provider.append({'assetId':a['assetId'],'reason':'Standard local LTX template does not automatically consume arbitrary raw reference media.','preservedAs':preserve})
        elif policy=='derive_to_prompt':
            for a in images+videos+audios:
                if _policy(a)=='must_use_raw': blocked=True;preserve='fallback_provider'
                else: preserve='derived_guidance';derived.append({'sourceAssetId':a['assetId'],'derivation':_derive(a),'resultRole':'prompt_guidance'})
                non_provider.append({'assetId':a['assetId'],'reason':'Reference converted to guidance for standard local LTX workflow.','preservedAs':preserve})
        elif policy=='fallback_provider':
            for a in images+videos+audios:
                non_provider.append({'assetId':a['assetId'],'reason':'Use a provider/workflow with verified raw reference semantics.','preservedAs':'fallback_provider'})
            blocked=any(_policy(a)=='must_use_raw' for a in images+videos+audios)
        else:
            blocked=True

    # If prebake creates the actual first frame, the post-prebake execution becomes I2V/FLF2V/A2V+I2V.
    if prebake and start is None and mode=='text_to_video':
        mode='image_to_video'

    return {
      'executionRoute':route,'model':resolved_model,'mode':mode,
      'startFrameAssetId':start.get('assetId') if start else None,
      'lastFrameAssetId':last.get('assetId') if last else None,
      'audioDriverAssetId':driver.get('assetId') if driver else None,
      'genericImageReferences':[{'assetId':a['assetId'],'semanticRoles':semantic_roles(a),'entityId':a.get('entityId')} for a in images],
      'genericVideoReferences':[{'assetId':a['assetId'],'semanticRoles':semantic_roles(a),'entityId':a.get('entityId')} for a in videos],
      'genericAudioReferences':[{'assetId':a['assetId'],'semanticRoles':semantic_roles(a),'entityId':a.get('entityId')} for a in audios],
      'derivedReferences':derived,'nonProviderReferences':non_provider,
      'prebakeRequired':bool(prebake),'localWorkflowRequired':bool(local_required),'blocked':bool(blocked),'warnings':warnings
    }
