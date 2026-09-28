from __future__ import annotations
from typing import Any

STABLE_LANGUAGES = {"Arabic","Chinese","English","French","German","Italian","Japanese","Korean","Portuguese","Russian","Spanish"}

def timecode(seconds: float) -> str:
    minutes = int(seconds // 60)
    sec = seconds - minutes * 60
    return f"{minutes:02d}:{sec:06.3f}"

def language_support(language: str | None) -> str:
    if not language:
        return "unknown"
    return "stable" if language in STABLE_LANGUAGES else "variable"


def default_keyframe_alignment(mode: str, duration_seconds: int, final_shot_index: int = 1) -> str | None:
    if mode == "t2va":
        return None
    if mode == "i2va":
        return "For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced."
    if mode == "fl2va":
        return (
            f"How the reference pictures align with the target video — Picture 1 (from Shot 1) "
            f"aligns with the 0.00-second mark of the target video; Picture 2 (from Shot {final_shot_index}) "
            f"aligns with the {duration_seconds:.2f}-second mark of the target video."
        )
    if mode == "l2va":
        return (
            f"How the reference pictures align with the target video — <Picture 1> "
            f"(from [Shot {final_shot_index}]) aligns with the {duration_seconds:.2f}-second mark of the target video."
        )
    raise ValueError(f"Unknown H3 base mode {mode}")

def compile_shot_map(shots: list[dict[str, Any]], duration_seconds: int) -> list[dict[str, Any]]:
    if not shots:
        raise ValueError("At least one H3 shot is required.")
    out=[]
    for i,shot in enumerate(shots,1):
        start=float(shot.get("startSeconds",0 if i==1 else -1))
        if i==1 and abs(start)>1e-9:
            raise ValueError("Shot 1 must start at 0.")
        if i>1 and not 0 < start < duration_seconds:
            raise ValueError("Later H3 cut timestamps must be inside target duration.")
        out.append({"shotId":str(shot.get("shotId",f"S{i:02d}")),"shotIndex":i,"startSeconds":start,"cutTimestamp":None if i==1 else timecode(start)})
    starts=[x["startSeconds"] for x in out]
    if any(b<=a for a,b in zip(starts,starts[1:])):
        raise ValueError("H3 shot timestamps must strictly increase.")
    return out

def _dialogue(line: dict[str,Any], h3_speaker: str) -> str:
    lang=line.get("language") or "English"
    text=line["text"]
    if line.get("voiceover"):
        return f"({h3_speaker}) says in an off-screen voiceover: <d>[{lang}] {text}</d> while the corresponding on-screen character's lips remain completely closed."
    return f"({h3_speaker}) says: <d>[{lang}] {text}</d>"

def _speaker_map(assignments: list[dict[str,Any]]) -> tuple[list[dict[str,Any]], list[str], dict[str,str]]:
    out=[]; warnings=[]; by={}
    for x in assignments:
        lang=x.get("language")
        support=language_support(lang)
        row={"speakerId":x["speakerId"],"h3SpeakerId":x["h3SpeakerId"],"lineIds":list(x.get("lineIds",[])),"language":lang,"languageSupport":support}
        out.append(row); by[x["speakerId"]]=x["h3SpeakerId"]
        if support=="variable":
            warnings.append(f"Dialogue language {lang!r} has variable H3 support; require ASR/lip-sync QC and fallback.")
    return out,warnings,by

def _detailed(shots, speaker_by):
    chunks=[]
    for i,shot in enumerate(shots,1):
        head=f"[Shot {i}]" if i==1 else f"[Shot {i}] At {timecode(float(shot['startSeconds']))},"
        bits=[head, shot.get("description","").strip()]
        for line in shot.get("dialogue",[]):
            sid=speaker_by.get(line.get("speakerId"))
            if sid:
                bits.append(_dialogue(line,sid))
        chunks.append(" ".join(x for x in bits if x).strip())
    return " ".join(chunks)

def compile_base_prompt(*, mode:str, duration_seconds:int, shots:list[dict[str,Any]],
                        overall_soundscape:str, non_diegetic_music:str,
                        keyframe_alignment_instruction:str|None=None,
                        speaker_assignments:list[dict[str,Any]]|None=None,
                        compiler_mode:str="smartaihub_native") -> dict[str,Any]:
    if mode not in {"t2va","i2va","l2va","fl2va"}:
        raise ValueError("Base H3 compiler supports T2VA/I2VA/L2VA/FL2VA only.")
    if not 4<=duration_seconds<=15:
        raise ValueError("MiniMax-H3 duration must be 4-15 seconds.")
    shot_map=compile_shot_map(shots,duration_seconds)
    speaker_map,warnings,by=_speaker_map(speaker_assignments or [])
    integrated=_detailed(shots,by)
    if keyframe_alignment_instruction is None:
        keyframe_alignment_instruction = default_keyframe_alignment(mode, duration_seconds, len(shots))
    sections=[]
    if keyframe_alignment_instruction:
        sections.append(keyframe_alignment_instruction.strip())
    sections.extend([
        f"integrated_multimodal_description: {integrated}",
        f"overall_soundscape: {overall_soundscape or 'N/A'}",
        f"non_diegetic_music: {non_diegetic_music or 'N/A'}"
    ])
    return {"mode":mode,"compilerMode":compiler_mode,"durationSeconds":duration_seconds,
            "keyframeAlignmentInstruction":keyframe_alignment_instruction,
            "subjectDefinitions":None,"summary":None,"retentionAnalysis":None,
            "integratedMultimodalDescription":integrated,"detailedDescription":None,
            "overallSoundscape":overall_soundscape or "N/A","nonDiegeticMusic":non_diegetic_music or "N/A",
            "promptText":"\n".join(sections),"shotMap":shot_map,"speakerMap":speaker_map,
            "audioPlan":None,"warnings":warnings}

def compile_reference_prompt(*, duration_seconds:int, subject_definitions:str, summary:str,
                             retention_analysis:str, shots:list[dict[str,Any]],
                             overall_soundscape:str, non_diegetic_music:str,
                             speaker_assignments:list[dict[str,Any]]|None=None,
                             compiler_mode:str="smartaihub_native") -> dict[str,Any]:
    if not 4<=duration_seconds<=15:
        raise ValueError("MiniMax-H3 duration must be 4-15 seconds.")
    shot_map=compile_shot_map(shots,duration_seconds)
    speaker_map,warnings,by=_speaker_map(speaker_assignments or [])
    detailed=_detailed(shots,by)
    sections=[
        f"subject_definitions:\n{subject_definitions.strip()}",
        f"summary:\n{summary.strip()}",
        f"retention_analysis:\n{retention_analysis.strip()}",
        f"detailed_description:\n{detailed}",
        f"overall_soundscape: {overall_soundscape or 'N/A'}",
        f"non_diegetic_music: {non_diegetic_music or 'N/A'}"
    ]
    return {"mode":"ref2va","compilerMode":compiler_mode,"durationSeconds":duration_seconds,
            "keyframeAlignmentInstruction":None,"subjectDefinitions":subject_definitions,
            "summary":summary,"retentionAnalysis":retention_analysis,
            "integratedMultimodalDescription":None,"detailedDescription":detailed,
            "overallSoundscape":overall_soundscape or "N/A","nonDiegeticMusic":non_diegetic_music or "N/A",
            "promptText":"\n".join(sections),"shotMap":shot_map,"speakerMap":speaker_map,
            "audioPlan":None,"warnings":warnings}
