from __future__ import annotations
from typing import Any

def _tc(s:float)->str:
    m=int(s//60);sec=s-m*60
    return f"{m:02d}:{sec:05.2f}"

def compile_seedance_prompt(
    *,
    model:str,
    reference_plan:dict[str,Any],
    duration_seconds:int,
    scene_description:str,
    shots:list[dict[str,Any]]|None=None,
    action_chronology:list[str]|None=None,
    camera_intent:str="",
    dialogue_lines:list[dict[str,Any]]|None=None,
    soundscape:str="",
    music:str="",
    continuity_locks:list[str]|None=None,
    constraints:list[str]|None=None,
    editing_instruction:str|None=None,
) -> dict[str,Any]:
    max_d=30 if model=="dreamina-seedance-2-5-260628" else 15
    if not 4<=int(duration_seconds)<=max_d:
        raise ValueError(f"Seedance duration must be 4-{max_d}s for this model.")
    mode=reference_plan["mode"]
    shots=list(shots or []);actions=list(action_chronology or [])
    dialogue=list(dialogue_lines or []);locks=list(continuity_locks or []);constraints=list(constraints or [])

    bindings=[]
    for r in reference_plan.get("referenceImages",[]):
        bindings.append({"label":r["label"],"meaning":"image reference","preserve":r.get("semanticRoles",[])})
    for r in reference_plan.get("referenceVideos",[]):
        bindings.append({"label":r["label"],"meaning":"video/motion reference","preserve":r.get("semanticRoles",[])})
    for r in reference_plan.get("referenceAudios",[]):
        bindings.append({"label":r["label"],"meaning":"audio/voice/music reference","preserve":r.get("semanticRoles",[])})

    parts=[]
    if mode in {"image_to_video","first_last_to_video"}:
        parts.append(
            "START STATE LOCK: Continue directly from the supplied first frame as State #0. "
            "Do not repeat completed actions. "
            + ("Reach the supplied last frame at the end while maintaining natural motion." if mode=="first_last_to_video" else "")
        )
    if bindings:
        parts.append("REFERENCE BINDINGS: "+" ".join(
            f"{b['label']} = {b['meaning']}; preserve {', '.join(b['preserve']) or 'the instructed subject/style'}."
            for b in bindings
        ))
    if mode=="video_extend":
        parts.append("TASK: Extend the referenced video naturally. Continue subjects, scene, visual style, action state, voices and sound without replaying completed beats.")
    elif mode=="video_edit":
        parts.append("TASK: Edit only the requested temporal/content region while preserving unrequested subjects, motion, camera, scene and audio continuity.")
        if editing_instruction:parts.append("EDIT INSTRUCTION: "+editing_instruction.strip())

    if scene_description:parts.append("SCENE: "+scene_description.strip())

    timeline=[]
    if shots:
        for i,s in enumerate(shots,1):
            st=float(s.get("startSeconds",0));en=float(s.get("endSeconds",duration_seconds))
            desc=str(s.get("description","")).strip()
            timeline.append({"startSeconds":st,"endSeconds":en,"description":desc})
        parts.append("TIMELINE: "+" ".join(
            f"({_tc(x['startSeconds'])}-{_tc(x['endSeconds'])}) {x['description']}" for x in timeline
        ))
    elif actions:
        parts.append("ACTION CHRONOLOGY: "+" Then ".join(f"{i+1}) {a}" for i,a in enumerate(actions)))

    if camera_intent:parts.append("CAMERA: "+camera_intent.strip())
    compiled=[]
    if dialogue:
        ds=[]
        for d in dialogue:
            row={"speakerId":d["speakerId"],"text":d["text"],"lipSyncRequired":bool(d.get("lipSyncRequired",True))}
            compiled.append(row)
            ds.append(f"{row['speakerId']} says exactly {'with precise visible lip sync' if row['lipSyncRequired'] else 'as off-screen voice-over'}: “{row['text']}”")
        parts.append("DIALOGUE: "+" ".join(ds))
    if soundscape:parts.append("DIEGETIC SOUND: "+soundscape.strip())
    if music:parts.append("MUSIC: "+music.strip())
    if locks:parts.append("CONTINUITY LOCKS: "+"; ".join(locks))
    if constraints:parts.append("CONSTRAINTS: "+"; ".join(constraints))

    return {
        "model":model,
        "mode":mode,
        "durationSeconds":int(duration_seconds),
        "promptText":"\n\n".join(parts),
        "timeline":timeline,
        "referenceBindings":bindings,
        "dialogueLines":compiled,
        "warnings":list(reference_plan.get("warnings",[]))
    }
