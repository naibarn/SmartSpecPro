"""
Video Prompt Engineer v1.0
Professional AI Video Prompt Generator
"""
from __future__ import annotations
import json
from typing import Any, Dict

PLATFORM_SPECS = {
    "sora": {"duration": (4, 20), "char_limit": None, "text_overlay": True},
    "veo": {"duration": (4, 8), "char_limit": 500, "text_overlay": False},
    "kling": {"duration": (5, 10), "char_limit": None, "text_overlay": True},
    "wan": {"duration": (4, 15), "char_limit": None, "text_overlay": True},
    "seedance": {"duration": (4, 12), "char_limit": None, "text_overlay": True},
    "compatible": {"duration": (4, 60), "char_limit": None, "text_overlay": True}
}

def build_prompt(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Generate video prompt"""
    request = payload.get("request", "")
    platform = payload.get("target_platform", "compatible")
    duration = payload.get("duration", 8)
    aspect_ratio = payload.get("aspect_ratio", "9:16")
    
    # Build prompt based on platform
    if platform == "veo":
        prompt = build_veo_prompt(payload)
    elif platform == "sora":
        prompt = build_sora_prompt(payload)
    else:
        prompt = build_universal_prompt(payload)
    
    return {
        "prompt": prompt,
        "platform": platform,
        "metadata": {
            "duration": duration,
            "aspect_ratio": aspect_ratio,
            "language": payload.get("language", "en")
        }
    }

def build_sora_prompt(payload: Dict[str, Any]) -> str:
    """Build detailed Sora prompt"""
    request = payload["request"]
    camera = payload.get("camera_movement", "tracking")
    lighting = payload.get("lighting_style", "natural")
    style = payload.get("cinematic_style", "cinematic")
    
    prompt = f"{style.capitalize()} {camera} shot. {request}. "
    prompt += f"Shot with {lighting} lighting. "
    prompt += "Professional cinematography, high production value."
    
    return prompt

def build_veo_prompt(payload: Dict[str, Any]) -> str:
    """Build compact Veo prompt (500 char limit)"""
    request = payload["request"]
    camera = payload.get("camera_movement", "static")
    
    prompt = f"Camera {camera}. {request}."
    
    # Ensure under 500 chars
    if len(prompt) > 500:
        prompt = prompt[:497] + "..."
    
    return prompt

def build_universal_prompt(payload: Dict[str, Any]) -> str:
    """Build universal compatible prompt"""
    request = payload["request"]
    style = payload.get("visual_style", "cinematic")
    camera = payload.get("camera_movement", "dynamic")
    lighting = payload.get("lighting_style", "natural")
    
    prompt = f"A {style} video with {camera} camera movement. {request}. "
    prompt += f"Filmed with {lighting} lighting and professional production quality."
    
    return prompt

def run(input_data: Dict[str, Any]) -> Dict[str, Any]:
    """Entry point"""
    return build_prompt(input_data)

def main():
    """CLI entry point"""
    import sys
    raw = sys.stdin.read().strip()
    payload = json.loads(raw)
    result = run(payload)
    print(json.dumps(result, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
