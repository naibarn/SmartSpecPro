from __future__ import annotations
from typing import Any


def compile_ltx25_prompt(*, mode:str, scene_description:str, duration_seconds:int|None, automatic_duration:bool=False,
                         shots:list[dict[str,Any]]|None=None, action_chronology:list[str]|None=None,
                         camera_intent:str='', camera_motion:str|None=None, dialogue_lines:list[dict[str,Any]]|None=None,
                         soundscape:str='', music:str='', continuity_locks:list[str]|None=None,
                         derived_reference_guidance:list[str]|None=None, audio_driver_asset_id:str|None=None,
                         generate_audio:bool=True, constraints:list[str]|None=None) -> dict[str,Any]:
    shots=list(shots or []);actions=list(action_chronology or []);dialogue=list(dialogue_lines or [])
    locks=list(continuity_locks or []);derived=list(derived_reference_guidance or []);constraints=list(constraints or [])
    parts=[]

    if mode in {'image_to_video','first_last_to_video','audio_to_video'}:
        if mode!='audio_to_video' or audio_driver_asset_id is None:
            parts.append('Continue directly from the supplied first frame as the literal opening state. Do not replay actions already completed in that image.')
    if mode=='first_last_to_video':
        parts.append('The motion must arrive naturally at the supplied last frame at the exact end while preserving subject and product continuity.')
    if mode=='audio_to_video':
        parts.append('The supplied audio is the exact soundtrack and timing driver. Synchronize visible action, cuts, speech and reactions to that audio; do not replace it with a different generated performance.')
    if mode=='local_extension':
        parts.append('Continue from the verified local prefix/suffix source state without replaying completed actions; preserve audiovisual continuity.')
    if derived:
        parts.append('Use these derived reference constraints: '+' '.join(x.strip() for x in derived))
    if scene_description:
        parts.append(scene_description.strip())

    multi=bool(len(shots)>1)
    if shots:
        # LTX official guidance prefers chronological prose with explicit cut language, not numbered shot lists.
        prose=[]
        for i,s in enumerate(shots):
            desc=str(s.get('description','')).strip()
            transition=str(s.get('transition') or ('hard cut' if i else '')).strip()
            audio_cont=str(s.get('audioContinuity') or '').strip()
            if i==0:
                prose.append(desc)
            else:
                lead=f"A {transition} transitions to" if transition else 'The view cuts to'
                sentence=f"{lead} {desc[0].lower()+desc[1:] if desc else 'the next view'}"
                if audio_cont: sentence += f"; {audio_cont}"
                prose.append(sentence+'.')
        parts.append(' '.join(prose))
    elif actions:
        parts.append('The action unfolds chronologically: '+' Then '.join(actions)+'.')

    if camera_intent: parts.append('Camera direction: '+camera_intent.strip())
    compiled=[]
    if dialogue:
        lines=[]
        for d in dialogue:
            row={'speakerId':d['speakerId'],'text':d['text'],'lipSyncRequired':bool(d.get('lipSyncRequired',True))};compiled.append(row)
            lines.append(f"{row['speakerId']} says exactly {'with precise visible lip sync' if row['lipSyncRequired'] else 'as off-screen voice-over'}: “{row['text']}”")
        parts.append('Dialogue: '+' '.join(lines))
    if soundscape:parts.append('Diegetic sound: '+soundscape.strip())
    if music:parts.append('Music: '+music.strip())
    if locks:parts.append('Continuity: '+'; '.join(locks)+'.')
    if constraints:parts.append('Constraints: '+'; '.join(constraints)+'.')

    audio_mode='exact_driver' if audio_driver_asset_id else ('generated' if generate_audio else 'silent')
    warnings=[]
    if multi:
        warnings.append('LTX native multi-shot prompt is compiled as chronological prose with explicit transitions, matching official prompting guidance rather than a screenplay shot list.')
    if automatic_duration and mode not in {'text_to_video','image_to_video'}:
        warnings.append('Automatic duration is a cloud T2V/I2V feature; other modes require route-specific duration handling.')
    return {
      'mode':mode,'durationSeconds':duration_seconds,'automaticDuration':bool(automatic_duration),
      'promptText':'\n\n'.join(parts),'multiShot':multi,'dialogueLines':compiled,
      'audioPlan':{'mode':audio_mode,'nativeGeneratedAudio':bool(generate_audio and not audio_driver_asset_id),'audioDriverAssetId':audio_driver_asset_id},
      'cameraMotion':None if camera_motion in {None,'auto'} else camera_motion,'continuityLocks':locks,'warnings':warnings
    }
