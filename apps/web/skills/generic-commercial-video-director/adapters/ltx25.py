from __future__ import annotations
from typing import Any
from .ltx25_reference_planner import plan_ltx25_inputs

BASE_URL='https://api.ltx.io'
UPLOAD_URL=f'{BASE_URL}/v1/upload'
CAMERA_MOTIONS={'dolly_in','dolly_out','dolly_left','dolly_right','jib_up','jib_down','static','focus_shift'}
CLOUD_MODELS={'ltx-2-5-fast','ltx-2-5-pro'}

class Ltx25AdapterError(ValueError):
    pass


def _tier(resolution:str)->str:
    m={
      '1280x720':'720p','720x1280':'720p','1920x1080':'1080p','1080x1920':'1080p',
      '2560x1440':'1440p','1440x2560':'1440p','3840x2160':'4k','2160x3840':'4k'
    }
    if resolution not in m: raise Ltx25AdapterError(f'Unsupported LTX-2.5 cloud resolution {resolution!r}.')
    return m[resolution]


def choose_cloud_model(*, requested_model:str='auto', resolution:str='1920x1080', duration:int|None=8, optimize_for:str='quality')->str:
    if requested_model in CLOUD_MODELS:return requested_model
    if requested_model not in {'auto',None}:raise Ltx25AdapterError('Unknown LTX cloud model.')
    tier=_tier(resolution)
    # Pro is quality-first, but Fast is required for >1080p or >10s.
    if tier in {'1440p','4k'} or (duration is not None and duration>10):return 'ltx-2-5-fast'
    return 'ltx-2-5-pro' if optimize_for=='quality' else 'ltx-2-5-fast'


def allowed_durations(model:str,resolution:str,fps:int)->list[int]:
    tier=_tier(resolution)
    if model=='ltx-2-5-fast':
        if tier in {'720p','1080p'} and fps in {24,25}:return [6,8,10,12,14,16,18,20]
        if tier in {'720p','1080p'} and fps in {48,50}:return [6,8,10]
        if tier in {'1440p','4k'} and fps in {24,25,48,50}:return [6,8,10]
        return []
    if model=='ltx-2-5-pro':
        if tier in {'720p','1080p'} and fps in {24,25,50}:return [6,8,10]
        return []
    return []


def validate_cloud_generation(*, model:str, mode:str, resolution:str, fps:int, duration:int|None,
                              automatic_duration:bool=False, has_last_frame:bool=False,
                              audio_duration_seconds:float|None=None)->None:
    if model not in CLOUD_MODELS:raise Ltx25AdapterError('Cloud LTX-2.5 requires fast/pro model.')
    allowed=allowed_durations(model,resolution,int(fps))
    if not allowed:raise Ltx25AdapterError(f'{model} does not support {resolution} at {fps} fps.')
    if mode in {'text_to_video','image_to_video','first_last_to_video'}:
        if automatic_duration:
            if mode=='first_last_to_video' or has_last_frame:
                raise Ltx25AdapterError('LTX automatic duration cannot be combined with last_frame_uri.')
            if duration is not None:
                raise Ltx25AdapterError('Automatic duration requires duration=None.')
        elif duration not in allowed:
            raise Ltx25AdapterError(f'{model} {resolution} {fps}fps supports durations {allowed}; got {duration}.')
    elif mode=='audio_to_video':
        if audio_duration_seconds is None:
            raise Ltx25AdapterError('Audio-to-Video requires input audio duration metadata for paid-job preflight.')
        tier=_tier(resolution)
        max_audio=20 if (model=='ltx-2-5-fast' and tier in {'720p','1080p'}) else 10
        if not (0 < float(audio_duration_seconds) <= max_audio):
            raise Ltx25AdapterError(f'{model} {tier} Audio-to-Video supports input audio up to {max_audio}s.')
    else:
        raise Ltx25AdapterError(f'Mode {mode!r} is not an LTX-2.5 cloud generation endpoint.')


def _media(asset_id:str|None, asset_inputs:dict[str,str])->str|None:
    if asset_id is None:return None
    v=asset_inputs.get(asset_id)
    if not v:raise Ltx25AdapterError(f'Missing LTX provider URI for asset {asset_id}.')
    return v


def build_cloud_payload(*, input_plan:dict[str,Any], prompt:dict[str,Any], asset_inputs:dict[str,str],
                        resolution:str, fps:int=24, camera_motion:str|None=None,
                        automatic_duration:bool=False, audio_duration_seconds:float|None=None,
                        generate_audio:bool=True)->dict[str,Any]:
    if input_plan.get('blocked'):raise Ltx25AdapterError('LTX input plan is blocked.')
    if input_plan.get('prebakeRequired'):raise Ltx25AdapterError('LTX input plan requires an approved prebaked Start Frame before cloud submission.')
    model=input_plan['model'];mode=input_plan['mode']
    duration=None if automatic_duration else prompt.get('durationSeconds')
    validate_cloud_generation(model=model,mode=mode,resolution=resolution,fps=fps,duration=duration,
                              automatic_duration=automatic_duration,has_last_frame=bool(input_plan.get('lastFrameAssetId')),
                              audio_duration_seconds=audio_duration_seconds)
    if camera_motion in {'auto','',None}:camera_motion=None
    elif camera_motion not in CAMERA_MOTIONS:raise Ltx25AdapterError('Unsupported LTX camera_motion.')

    payload={'model':model,'prompt':prompt['promptText'],'resolution':resolution,'fps':int(fps)}
    if mode=='text_to_video':
        payload['duration']=None if automatic_duration else int(duration)
        payload['generate_audio']=bool(generate_audio)
    elif mode in {'image_to_video','first_last_to_video'}:
        payload['image_uri']=_media(input_plan.get('startFrameAssetId'),asset_inputs)
        payload['duration']=None if automatic_duration else int(duration)
        payload['generate_audio']=bool(generate_audio)
        if input_plan.get('lastFrameAssetId'):payload['last_frame_uri']=_media(input_plan['lastFrameAssetId'],asset_inputs)
    elif mode=='audio_to_video':
        payload['audio_uri']=_media(input_plan.get('audioDriverAssetId'),asset_inputs)
        if input_plan.get('startFrameAssetId'):payload['image_uri']=_media(input_plan['startFrameAssetId'],asset_inputs)
        if input_plan.get('lastFrameAssetId'):payload['last_frame_uri']=_media(input_plan['lastFrameAssetId'],asset_inputs)
        # No duration field: exact soundtrack determines output length.
    if camera_motion:payload['camera_motion']=camera_motion
    return payload


def endpoint_for(mode:str, api_mode:str='async')->str:
    mapping={'text_to_video':'text-to-video','image_to_video':'image-to-video','first_last_to_video':'image-to-video','audio_to_video':'audio-to-video'}
    if mode not in mapping:raise Ltx25AdapterError(f'No LTX cloud endpoint for mode {mode!r}.')
    version='v2' if api_mode=='async' else 'v1'
    return f'{BASE_URL}/{version}/{mapping[mode]}'


def polling_url(mode:str,job_id:str)->str:
    if not job_id:raise Ltx25AdapterError('job_id is required.')
    return endpoint_for(mode,'async')+'/'+job_id


def build_local_workflow_plan(*, input_plan:dict[str,Any], prompt:dict[str,Any], local_pipeline:str='auto',
                              local_workflow_id:str|None=None, prompt_enhance:bool=True, seed:int|None=None,
                              resolution:str|None=None, fps:int|None=None, local_width:int|None=None, local_height:int|None=None,
                              local_fps:int|None=None, local_num_frames:int|None=None,
                              local_auto_duration_min_seconds:float|None=None, local_auto_duration_max_seconds:float|None=None)->dict[str,Any]:
    if input_plan.get('blocked'):raise Ltx25AdapterError('LTX local input plan is blocked.')
    if input_plan.get('prebakeRequired'):raise Ltx25AdapterError('LTX local input plan requires approved prebaked Start Frame before standard I2V submission.')
    mode=input_plan['mode']
    builtins={
      'text_to_video':'video_ltx2_5_t2v','image_to_video':'video_ltx2_5_i2v','first_last_to_video':'video_ltx2_5_flf2v'
    }
    if local_width is not None and local_width % 32 != 0: raise Ltx25AdapterError('LTX local width must be divisible by 32.')
    if local_height is not None and local_height % 32 != 0: raise Ltx25AdapterError('LTX local height must be divisible by 32.')
    if local_num_frames is not None and (local_num_frames-1) % 8 != 0: raise Ltx25AdapterError('LTX local num_frames must follow 8k+1.')
    if local_pipeline in {'distilled_two_stage','full_two_stage'}:
        if local_width is not None and local_width % 64 != 0: raise Ltx25AdapterError('LTX two-stage final width must be divisible by 64.')
        if local_height is not None and local_height % 64 != 0: raise Ltx25AdapterError('LTX two-stage final height must be divisible by 64.')
    if local_auto_duration_min_seconds is not None and local_auto_duration_max_seconds is not None and local_auto_duration_min_seconds > local_auto_duration_max_seconds:
        raise Ltx25AdapterError('LTX local auto-duration minimum cannot exceed maximum.')
    if mode in builtins:
        workflow_id=local_workflow_id or builtins[mode]
    else:
        if not local_workflow_id:
            raise Ltx25AdapterError(f'LTX local mode {mode} requires an explicitly configured/verified workflow ID.')
        workflow_id=local_workflow_id
    return {
      'engine':'ComfyUI' if input_plan['executionRoute'] in {'local_comfyui','worker_comfyui'} else 'ltx-pipelines',
      'workflowId':workflow_id,'pipeline':local_pipeline,'model':'Lightricks/LTX-2.5',
      'prompt':prompt['promptText'],'promptEnhance':bool(prompt_enhance),'seed':seed,
      'resolution':resolution,'fps':local_fps or fps,'width':local_width,'height':local_height,'numFrames':local_num_frames,
      'autoDurationMinSeconds':local_auto_duration_min_seconds,'autoDurationMaxSeconds':local_auto_duration_max_seconds,'startFrameAssetId':input_plan.get('startFrameAssetId'),
      'lastFrameAssetId':input_plan.get('lastFrameAssetId'),'audioDriverAssetId':input_plan.get('audioDriverAssetId'),
      'genericImageReferences':input_plan.get('genericImageReferences',[]),
      'genericVideoReferences':input_plan.get('genericVideoReferences',[]),
      'genericAudioReferences':input_plan.get('genericAudioReferences',[]),
      'requiresVerifiedReferenceWorkflow':mode=='local_ic_lora','requiresVerifiedExtensionWorkflow':mode=='local_extension'
    }


def build_execution_plan(*, assets:list[dict[str,Any]], prompt:dict[str,Any], asset_inputs:dict[str,str],
                         execution_route:str='auto', requested_model:str='auto', requested_mode:str='auto',
                         resolution:str='1920x1080', fps:int=24, duration_policy:str='exact', camera_motion:str='auto',
                         generate_audio:str='auto', audio_driver_asset_id:str|None=None, reference_policy:str='auto',
                         cloud_api_mode:str='async', local_pipeline:str='auto', local_workflow_id:str|None=None,
                         local_reference_workflow_verified:bool=False, local_extension_workflow_verified:bool=False,
                         prompt_enhance_local:bool=True, seed:int|None=None, optimize_for:str='quality',
                         local_width:int|None=None, local_height:int|None=None, local_fps:int|None=None, local_num_frames:int|None=None,
                         local_auto_duration_min_seconds:float|None=None, local_auto_duration_max_seconds:float|None=None,
                         prebaked_start_asset_id:str|None=None)->dict[str,Any]:
    # Resolve model before planner so auto route can be accurate.
    desired_duration=prompt.get('durationSeconds')
    if execution_route=='cloud_api' or (execution_route=='auto' and requested_model!='Lightricks/LTX-2.5'):
        model=choose_cloud_model(requested_model=requested_model,resolution=resolution,duration=desired_duration,optimize_for=optimize_for)
    else:model='Lightricks/LTX-2.5'
    plan=plan_ltx25_inputs(assets,execution_route=execution_route,model=model,requested_mode=requested_mode,
                           audio_driver_asset_id=audio_driver_asset_id,reference_policy=reference_policy,
                           local_reference_workflow_verified=local_reference_workflow_verified,
                           local_extension_workflow_verified=local_extension_workflow_verified)
    if plan['blocked']:raise Ltx25AdapterError('LTX planning blocked by incompatible required references/mode.')
    if plan['prebakeRequired']:
        if not prebaked_start_asset_id:raise Ltx25AdapterError('LTX reference strategy requires prebaked_start_asset_id before video submission.')
        plan=dict(plan);plan['startFrameAssetId']=prebaked_start_asset_id;plan['prebakeRequired']=False
        if plan['mode']=='text_to_video':plan['mode']='image_to_video'
    automatic=duration_policy=='automatic'
    if plan['mode']=='audio_to_video' and automatic:
        raise Ltx25AdapterError('Audio-to-Video duration is driven by the input soundtrack; use durationPolicy=audio_driven.')
    if duration_policy=='audio_driven' and plan['mode']!='audio_to_video':
        raise Ltx25AdapterError('durationPolicy=audio_driven is valid only for Audio-to-Video.')
    audio_meta=None
    if plan.get('audioDriverAssetId'):
        a=next((x for x in assets if x.get('assetId')==plan['audioDriverAssetId']),{})
        audio_meta=(a.get('mediaMetadata') or {}).get('durationSeconds')
    gen_audio=generate_audio!='off'
    provider_payload=None;local_plan=None
    if plan['executionRoute']=='cloud_api':
        provider_payload=build_cloud_payload(input_plan=plan,prompt=prompt,asset_inputs=asset_inputs,resolution=resolution,fps=fps,
                                             camera_motion=camera_motion,automatic_duration=automatic,
                                             audio_duration_seconds=audio_meta,generate_audio=gen_audio)
    else:
        local_plan=build_local_workflow_plan(input_plan=plan,prompt=prompt,local_pipeline=local_pipeline,
                                            local_workflow_id=local_workflow_id,prompt_enhance=prompt_enhance_local,
                                            seed=seed,resolution=resolution,fps=fps,local_width=local_width,local_height=local_height,local_fps=local_fps,
                                            local_num_frames=local_num_frames,local_auto_duration_min_seconds=local_auto_duration_min_seconds,
                                            local_auto_duration_max_seconds=local_auto_duration_max_seconds)
    qc=['LTX_PROMPT_ADHERENCE','LTX_CHARACTER_IDENTITY','LTX_PRODUCT_PLACE_IDENTITY','LTX_ACTION_CHRONOLOGY','LTX_NATIVE_AV_SYNC']
    if plan.get('startFrameAssetId'):qc+=['LTX_START_FRAME_ADHERENCE','LTX_START_STATE_CONTINUITY']
    if plan.get('lastFrameAssetId'):qc.append('LTX_LAST_FRAME_ADHERENCE')
    if prompt.get('multiShot'):qc+=['LTX_MULTISHOT_CONTINUITY','LTX_CUT_AUDIO_CONTINUITY']
    if prompt.get('dialogueLines'):qc+=['LTX_DIALOGUE_EXACTNESS','LTX_LIPSYNC']
    if plan['mode']=='audio_to_video':qc+=['LTX_AUDIO_DRIVER_SYNC','LTX_AUDIO_DRIVER_PRESERVATION']
    if plan['mode']=='local_ic_lora':qc.append('LTX_ICLORA_REFERENCE_RETENTION')
    return {
      'executionRoute':plan['executionRoute'],'model':plan['model'],'mode':plan['mode'],
      'durationSeconds':None if (automatic or plan['mode']=='audio_to_video') else prompt.get('durationSeconds'),
      'automaticDuration':bool(automatic),'resolution':resolution,'fps':fps,'inputPlan':plan,'prompt':prompt,
      'providerPayload':provider_payload,'localWorkflowPlan':local_plan,
      'postGeneration':{'ingestToLibraryImmediately':True,'postCompositeExactBrandTextUI':True,'cloudApiMode':cloud_api_mode,'cloudEndpoint':endpoint_for(plan['mode'],cloud_api_mode) if plan['executionRoute']=='cloud_api' else None},
      'qcRequirements':qc,'warnings':list(plan.get('warnings',[]))+list(prompt.get('warnings',[]))
    }


def normalize_submit_response(response:dict[str,Any],mode:str)->dict[str,Any]:
    return {'providerJobId':response.get('id'),'createdAt':response.get('created_at'),'endpoint':mode,'status':'submitted' if response.get('id') else 'unknown','raw':response}


def normalize_job_response(response:dict[str,Any])->dict[str,Any]:
    status=str(response.get('status') or '').lower();result=response.get('result') or {}
    return {'providerJobId':response.get('id'),'status':{'pending':'queued','processing':'running','completed':'succeeded','failed':'failed'}.get(status,status or 'unknown'),'outputUrl':result.get('video_url'),'result':result,'error':response.get('error'),'raw':response}



def normalize_upload_ticket(response:dict[str,Any])->dict[str,Any]:
    """Normalize POST /v1/upload response. The caller performs the signed PUT and then uses storageUri."""
    return {
      'uploadUrl':response.get('upload_url'),'storageUri':response.get('storage_uri'),
      'expiresAt':response.get('expires_at'),'requiredHeaders':response.get('required_headers') or {},
      'valid':bool(response.get('upload_url') and response.get('storage_uri'))
    }


def cloud_input_transport_limits()->dict[str,Any]:
    return {
      'ltxUpload':{'requestEndpoint':UPLOAD_URL,'maxUploadBytes':200*1024*1024,'uploadUrlExpiresSeconds':3600,'assetAvailableSeconds':86400},
      'httpsUrl':{'imageMaxBytes':15*1024*1024,'videoAudioMaxBytes':32*1024*1024,'httpsOnly':True,'public':True,'redirectsAllowed':False},
      'dataUri':{'imageMaxEncodedBytes':7*1024*1024,'videoAudioMaxEncodedBytes':15*1024*1024},
      'formats':{'images':['png','jpeg','jpg','webp'],'videos':['mp4','mov','mkv'],'audio':['wav','mp3','m4a','ogg']}
    }
