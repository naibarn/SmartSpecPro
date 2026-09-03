from __future__ import annotations
from typing import Any

def compile_flux3_prompt(
    *,
    mode:str,
    duration_seconds:int,
    scene_description:str,
    action_chronology:list[str]|None=None,
    shots:list[dict[str,Any]]|None=None,
    camera_intent:str="",
    dialogue_lines:list[dict[str,Any]]|None=None,
    soundscape:str="",
    music:str="",
    continuity_locks:list[str]|None=None,
    derived_reference_guidance:list[str]|None=None,
    constraints:list[str]|None=None,
) -> dict[str,Any]:
    max_d=15 if mode=="v2v" else 20
    if not 5<=int(duration_seconds)<=max_d:
        raise ValueError(f"FLUX 3 {mode} duration must be 5-{max_d} seconds.")
    actions=list(action_chronology or [])
    shots=list(shots or [])
    dialogue=list(dialogue_lines or [])
    locks=list(continuity_locks or [])
    derived=list(derived_reference_guidance or [])
    constraints=list(constraints or [])

    parts=[]
    if mode=="i2v":
        parts.append(
            "KEYFRAME CONTINUITY: Treat supplied keyframes as literal pinned moments in the clip. "
            "Start exactly from the first keyframe when it is pinned at 0s and land on the ending keyframe when one is pinned at the clip end."
        )
    elif mode=="v2v":
        parts.append(
            "VIDEO CONTINUATION: Continue directly from the supplied start_video audiovisual state. "
            "Carry forward subject identity, motion direction, camera behavior, dialogue/audio context and scene logic. "
            "Do not replay actions already completed in the source clip."
        )
    if derived:
        parts.append("DERIVED REFERENCE GUIDANCE: "+" ".join(derived))
    if scene_description:
        parts.append("SCENE: "+scene_description.strip())

    # FLUX supports multi-scene generations, but there is no verified provider timestamp
    # syntax contract analogous to H3. Keep ordered beats in natural-language form.
    if shots:
        parts.append("SHOT / SCENE PROGRESSION: "+" ".join(
            f"Shot {i}: {str(s.get('description','')).strip()}" for i,s in enumerate(shots,1)
        ))
    elif actions:
        parts.append("ACTION CHRONOLOGY: "+" Then ".join(f"{i+1}) {a}" for i,a in enumerate(actions)))

    if camera_intent:
        parts.append("CAMERA: "+camera_intent.strip())

    compiled=[]
    if dialogue:
        ds=[]
        for d in dialogue:
            row={"speakerId":d["speakerId"],"text":d["text"],"lipSyncRequired":bool(d.get("lipSyncRequired",True))}
            compiled.append(row)
            ds.append(f"{row['speakerId']} says exactly {'with precise visible lip sync' if row['lipSyncRequired'] else 'as off-screen voice-over'}: “{row['text']}”")
        parts.append("DIALOGUE: "+" ".join(ds))

    audio={"nativeAudio":True,"dialogue":bool(dialogue),"soundscape":soundscape or None,"music":music or None}
    if soundscape:parts.append("DIEGETIC SOUND: "+soundscape.strip())
    if music:parts.append("MUSIC: "+music.strip())
    if locks:parts.append("CONTINUITY LOCKS: "+"; ".join(locks))
    if constraints:parts.append("CONSTRAINTS: "+"; ".join(constraints))

    warnings=[]
    if shots:
        warnings.append("FLUX supports multiple scenes/camera angles, but this compiler does not claim a provider-native timestamped-cut syntax.")
    return {
        "mode":mode,
        "durationSeconds":int(duration_seconds),
        "promptText":"\n\n".join(parts),
        "dialogueLines":compiled,
        "audioPlan":audio,
        "continuityLocks":locks,
        "warnings":warnings,
    }
