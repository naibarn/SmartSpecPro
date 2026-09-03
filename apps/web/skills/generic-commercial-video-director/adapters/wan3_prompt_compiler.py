from __future__ import annotations
from typing import Any

def _tc(seconds:float)->str:
    m=int(seconds//60)
    s=seconds-m*60
    return f"{m:02d}:{s:05.2f}"

def compile_wan3_prompt(
    *,
    reference_plan:dict[str,Any],
    duration_seconds:int|None,
    smart_duration:bool=False,
    scene_description:str,
    shots:list[dict[str,Any]]|None=None,
    action_chronology:list[str]|None=None,
    camera_intent:str="",
    dialogue_lines:list[dict[str,Any]]|None=None,
    soundscape:str="",
    music:str="",
    continuity_locks:list[str]|None=None,
    constraints:list[str]|None=None,
    extension_direction:str="forward",
) -> dict[str,Any]:
    if not smart_duration and (duration_seconds is None or not 2<=int(duration_seconds)<=30):
        raise ValueError("Wan 3.0 duration must be 2-30 seconds or smart_duration=True.")

    mode=reference_plan["mode"]
    shots=list(shots or [])
    action_chronology=list(action_chronology or [])
    dialogue_lines=list(dialogue_lines or [])
    continuity_locks=list(continuity_locks or [])
    constraints=list(constraints or [])

    bindings=[]
    for ref in reference_plan.get("referenceImages",[]):
        bindings.append({"label":ref["label"],"meaning":"image reference","preserve":ref.get("semanticRoles",[])})
    for ref in reference_plan.get("referenceVideos",[]):
        bindings.append({"label":ref["label"],"meaning":"video/motion reference","preserve":ref.get("semanticRoles",[])})
    for ref in reference_plan.get("referenceAudios",[]):
        bindings.append({"label":ref["label"],"meaning":"audio/voice reference","preserve":ref.get("semanticRoles",[])})
    if reference_plan.get("documentReference"):
        bindings.append({"label":"File 1","meaning":"document factual/context reference","preserve":["document_content"]})
    if reference_plan.get("webReference"):
        bindings.append({"label":"Link 1","meaning":"public web factual/context reference","preserve":["web_content"]})

    parts=[]
    if mode in {"image_to_video","first_last_to_video"}:
        parts.append(
            "HARD FRAME CONTROL: Continue directly from the supplied first frame as literal State #0. "
            "Do not replay actions already completed in that frame. "
            + ("Land exactly on the supplied last frame at the end." if mode=="first_last_to_video" else "")
        )
    if bindings:
        parts.append("REFERENCE BINDINGS: "+" ".join(
            f"{x['label']} = {x['meaning']}; preserve {', '.join(x['preserve']) or 'relevant appearance/behavior'}."
            for x in bindings
        ))

    if mode=="video_edit":
        parts.append("TASK INTENT: Edit the supplied reference video according to the instructions below while preserving all unrequested content.")
    elif mode=="video_extend":
        parts.append(
            f"TASK INTENT: Extend the supplied reference video {extension_direction}. "
            "Continue from its audiovisual state without replaying completed actions."
        )

    if scene_description:
        parts.append("SCENE: "+scene_description.strip())

    timeline=[]
    if shots:
        for i,s in enumerate(shots,1):
            st=float(s.get("startSeconds",0))
            en=float(s.get("endSeconds", duration_seconds or 30))
            desc=str(s.get("description","")).strip()
            timeline.append({"shotId":str(s.get("shotId",f"S{i:02d}")),"startSeconds":st,"endSeconds":en,"description":desc})
        parts.append("TIMELINE / SHOTS: "+" ".join(
            f"({_tc(s['startSeconds'])} - {_tc(s['endSeconds'])}) {s['description']}" for s in timeline
        ))
    elif action_chronology:
        parts.append("ACTION CHRONOLOGY: "+" Then ".join(f"{i+1}) {x}" for i,x in enumerate(action_chronology)))

    if camera_intent:
        parts.append("CAMERA: "+camera_intent.strip())

    compiled_dialogue=[]
    if dialogue_lines:
        lines=[]
        for d in dialogue_lines:
            row={"speakerId":d["speakerId"],"text":d["text"],"lipSyncRequired":bool(d.get("lipSyncRequired",True))}
            compiled_dialogue.append(row)
            lip="with precise visible lip sync" if row["lipSyncRequired"] else "as off-screen voice-over"
            lines.append(f"{row['speakerId']} says exactly {lip}: “{row['text']}”")
        parts.append("DIALOGUE: "+" ".join(lines))

    if soundscape: parts.append("DIEGETIC SOUND: "+soundscape.strip())
    if music: parts.append("BGM: "+music.strip())
    if continuity_locks: parts.append("CONTINUITY LOCKS: "+"; ".join(continuity_locks))
    if constraints: parts.append("CONSTRAINTS: "+"; ".join(constraints))

    return {
        "mode":mode,
        "durationSeconds":None if smart_duration else int(duration_seconds),
        "smartDuration":bool(smart_duration),
        "promptText":"\n\n".join(parts),
        "shotTimeline":timeline,
        "referenceBindings":bindings,
        "dialogueLines":compiled_dialogue,
        "audioPlan":{
            "nativeAudio":True,
            "dialogue":bool(dialogue_lines),
            "bgm":bool(music),
            "soundEffects":bool(soundscape)
        },
        "warnings":list(reference_plan.get("warnings",[]))
    }
