from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from adapters.ltx25_reference_planner import plan_ltx25_inputs
from adapters.ltx25_prompt_compiler import compile_ltx25_prompt
from adapters.ltx25 import (allowed_durations,validate_cloud_generation,build_cloud_payload,build_local_workflow_plan,
                            endpoint_for,polling_url,normalize_submit_response,normalize_job_response,choose_cloud_model,normalize_upload_ticket,cloud_input_transport_limits,Ltx25AdapterError)

def run():
    # 1 Fast 1080 24fps has full 6-20 even duration set.
    assert allowed_durations('ltx-2-5-fast','1920x1080',24)==[6,8,10,12,14,16,18,20]
    # 2 Fast 4K is capped to 6/8/10.
    assert allowed_durations('ltx-2-5-fast','3840x2160',50)==[6,8,10]
    # 3 Pro supports 6/8/10 at 1080/24.
    assert allowed_durations('ltx-2-5-pro','1920x1080',24)==[6,8,10]
    # 4 Pro has no 4K.
    assert allowed_durations('ltx-2-5-pro','3840x2160',24)==[]
    # 5 Pro 48fps is not in official 2.5 matrix.
    assert allowed_durations('ltx-2-5-pro','1920x1080',48)==[]
    # 6 Automatic duration is legal for T2V.
    validate_cloud_generation(model='ltx-2-5-fast',mode='text_to_video',resolution='1920x1080',fps=24,duration=None,automatic_duration=True)
    # 7 Automatic duration + last frame is illegal.
    try:
        validate_cloud_generation(model='ltx-2-5-pro',mode='first_last_to_video',resolution='1920x1080',fps=24,duration=None,automatic_duration=True,has_last_frame=True)
    except Ltx25AdapterError: pass
    else: raise AssertionError('auto duration + last frame must fail')
    # 8 Start frame routes to I2V.
    p=plan_ltx25_inputs([{'assetId':'s','role':'start_frame','mediaType':'image'}],execution_route='cloud_api',model='ltx-2-5-pro')
    assert p['mode']=='image_to_video' and p['startFrameAssetId']=='s'
    # 9 Start + last routes to FLF2V semantics.
    p2=plan_ltx25_inputs([{'assetId':'s','role':'start_frame','mediaType':'image'},{'assetId':'e','role':'end_frame','mediaType':'image'}],execution_route='cloud_api',model='ltx-2-5-pro')
    assert p2['mode']=='first_last_to_video'
    # 10 Last frame without first blocks.
    p3=plan_ltx25_inputs([{'assetId':'e','role':'end_frame','mediaType':'image'}],execution_route='cloud_api',model='ltx-2-5-pro')
    assert p3['blocked']
    # 11 Explicit audio driver routes to A2V.
    audio=[{'assetId':'a','role':'audio_reference','mediaType':'audio','providerHints':{'ltx':{'useAsAudioDriver':True}},'mediaMetadata':{'durationSeconds':18}}]
    pa=plan_ltx25_inputs(audio,execution_route='cloud_api',model='ltx-2-5-fast')
    assert pa['mode']=='audio_to_video' and pa['audioDriverAssetId']=='a'
    # 12 A2V Fast 18s at 1080 is legal.
    validate_cloud_generation(model='ltx-2-5-fast',mode='audio_to_video',resolution='1920x1080',fps=24,duration=None,audio_duration_seconds=18)
    # 13 A2V Fast 18s at 4K is illegal (10s cap).
    try:
        validate_cloud_generation(model='ltx-2-5-fast',mode='audio_to_video',resolution='3840x2160',fps=24,duration=None,audio_duration_seconds=18)
    except Ltx25AdapterError: pass
    else: raise AssertionError('4K A2V >10s must fail')
    # 14 Cloud generic product ref defaults to prebake, not fictitious reference array.
    prod=[{'assetId':'p','role':'product_reference','mediaType':'image','providerUsePolicy':'must_use_raw','referencePurposes':['product_geometry']}]
    pp=plan_ltx25_inputs(prod,execution_route='cloud_api',model='ltx-2-5-pro',reference_policy='auto')
    assert pp['prebakeRequired'] and pp['mode']=='image_to_video'
    # 15 Raw motion ref cannot be downgraded in cloud derive policy.
    mv=[{'assetId':'v','role':'motion_reference','mediaType':'video','providerUsePolicy':'must_use_raw','referencePurposes':['motion']}]
    pm=plan_ltx25_inputs(mv,execution_route='cloud_api',model='ltx-2-5-pro',reference_policy='derive_to_prompt')
    assert pm['blocked']
    # 16 Local verified IC-LoRA accepts raw reference workflow.
    pl=plan_ltx25_inputs(mv,execution_route='worker_comfyui',model='Lightricks/LTX-2.5',requested_mode='local_ic_lora',reference_policy='local_ic_lora',local_reference_workflow_verified=True)
    assert pl['mode']=='local_ic_lora' and not pl['blocked']
    # 17 Unverified local IC-LoRA blocks.
    pl2=plan_ltx25_inputs(mv,execution_route='worker_comfyui',model='Lightricks/LTX-2.5',requested_mode='local_ic_lora',reference_policy='local_ic_lora',local_reference_workflow_verified=False)
    assert pl2['blocked']
    # 18 Local standard I2V maps official built-in template.
    lp=build_local_workflow_plan(input_plan=plan_ltx25_inputs([{'assetId':'s','role':'start_frame','mediaType':'image'}],execution_route='local_comfyui',model='Lightricks/LTX-2.5'),prompt={'promptText':'animate'},local_pipeline='distilled_two_stage',local_width=768,local_height=512,local_num_frames=81)
    assert lp['workflowId']=='video_ltx2_5_i2v' and lp['numFrames']==81
    # 19 Local FLF maps official built-in template.
    lp2=build_local_workflow_plan(input_plan=plan_ltx25_inputs([{'assetId':'s','role':'start_frame','mediaType':'image'},{'assetId':'e','role':'end_frame','mediaType':'image'}],execution_route='local_comfyui',model='Lightricks/LTX-2.5'),prompt={'promptText':'transition'},local_pipeline='first_last_single_stage',local_width=768,local_height=512,local_num_frames=81)
    assert lp2['workflowId']=='video_ltx2_5_flf2v'
    # 20 Local num_frames must be 8k+1.
    try:
        build_local_workflow_plan(input_plan=plan_ltx25_inputs([],execution_route='local_comfyui',model='Lightricks/LTX-2.5'),prompt={'promptText':'x'},local_num_frames=80)
    except Ltx25AdapterError: pass
    else: raise AssertionError('num_frames 80 must fail')
    # 21 Two-stage final dimensions must be divisible by 64.
    try:
        build_local_workflow_plan(input_plan=plan_ltx25_inputs([],execution_route='local_comfyui',model='Lightricks/LTX-2.5'),prompt={'promptText':'x'},local_pipeline='distilled_two_stage',local_width=800,local_height=512)
    except Ltx25AdapterError: pass
    else: raise AssertionError('two-stage width 800 must fail')
    # 22 Cloud payload I2V/last frame uses documented fields.
    cp=compile_ltx25_prompt(mode='first_last_to_video',scene_description='A presenter raises a product.',duration_seconds=8,camera_motion='dolly_in')
    payload=build_cloud_payload(input_plan=p2,prompt=cp,asset_inputs={'s':'https://x/s.png','e':'https://x/e.png'},resolution='1920x1080',fps=24,camera_motion='dolly_in')
    assert payload['image_uri'].endswith('s.png') and payload['last_frame_uri'].endswith('e.png') and payload['duration']==8
    # 23 A2V payload has no duration field and uses exact audio_uri.
    cpa=compile_ltx25_prompt(mode='audio_to_video',scene_description='Speaker performs to soundtrack.',duration_seconds=None,audio_driver_asset_id='a')
    ap=build_cloud_payload(input_plan=pa,prompt=cpa,asset_inputs={'a':'https://x/a.wav'},resolution='1920x1080',fps=24,audio_duration_seconds=18)
    assert ap['audio_uri'].endswith('a.wav') and 'duration' not in ap
    # 24 Endpoints and polling are correct.
    assert endpoint_for('first_last_to_video','async').endswith('/v2/image-to-video')
    assert polling_url('audio_to_video','job').endswith('/v2/audio-to-video/job')
    # 25 Model auto routing chooses Pro for <=10/1080 quality and Fast for longer/high-res.
    assert choose_cloud_model(requested_model='auto',resolution='1920x1080',duration=8,optimize_for='quality')=='ltx-2-5-pro'
    assert choose_cloud_model(requested_model='auto',resolution='1920x1080',duration=20,optimize_for='quality')=='ltx-2-5-fast'
    assert choose_cloud_model(requested_model='auto',resolution='3840x2160',duration=8,optimize_for='quality')=='ltx-2-5-fast'
    # 26 Native multi-shot compiler uses prose/cut language, not numbered provider shot list.
    ms=compile_ltx25_prompt(mode='text_to_video',scene_description='A premium product commercial.',duration_seconds=10,shots=[{'description':'The presenter reveals the product'},{'description':'The same presenter demonstrates it','transition':'match cut','audioContinuity':'the same music continues across the cut'}])
    assert ms['multiShot'] and 'match cut' in ms['promptText'] and 'Shot 1' not in ms['promptText']
    # 27 Async response normalization.
    ns=normalize_submit_response({'id':'j1','created_at':'2026-09-01T00:00:00Z'},'text_to_video');assert ns['status']=='submitted'
    nr=normalize_job_response({'id':'j1','status':'completed','result':{'video_url':'https://x/out.mp4'}});assert nr['status']=='succeeded' and nr['outputUrl'].endswith('out.mp4')
    # 28 LTX upload ticket normalization supports provider-managed asset transport.
    ut=normalize_upload_ticket({'upload_url':'https://upload','storage_uri':'ltx://uploads/abc','expires_at':'x','required_headers':{'x':'y'}})
    assert ut['valid'] and ut['storageUri'].startswith('ltx://')
    # 29 Transport limits reflect official HTTPS/Data URI/upload caps.
    tl=cloud_input_transport_limits();assert tl['ltxUpload']['maxUploadBytes']==200*1024*1024 and tl['httpsUrl']['imageMaxBytes']==15*1024*1024
    print('PASS: 29 LTX 2.5 integration regression checks')

if __name__=='__main__':run()
