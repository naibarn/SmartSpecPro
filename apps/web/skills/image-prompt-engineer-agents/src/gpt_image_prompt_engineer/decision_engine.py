from __future__ import annotations
from copy import deepcopy
from statistics import mean

from .deliverables import (
    PREMIUM_DELIVERABLES,
    TEXT_SENSITIVE_DELIVERABLES,
    profile_for,
    visual_defaults_for,
)

LANDSCAPE_RATIOS = {"16:9","21:9","3:2","4:3","5:4"}
PORTRAIT_RATIOS = {"9:16","9:21","2:3","3:4","4:5"}

def contains_any(text: str, words: list[str]) -> bool:
    t = text.lower()
    return any(w.lower() in t for w in words)

def has_thai(text: str) -> bool:
    return any("\u0e00" <= c <= "\u0e7f" for c in text)

def add(trace, field, old, selected, reason, confidence):
    trace.append({"field": field, "input": old, "selected": selected, "reason": reason, "confidence": round(float(confidence), 3)})

def infer_style(topic: str) -> tuple[str,str,float]:
    rules = [
        ("cinematic", ["cinematic","film","movie","ภาพยนตร์","หนัง"], "cinematic / film keywords", .92),
        ("fashion_lookbook", ["fashion","แฟชั่น","lookbook","editorial","เกาหลี"], "fashion/editorial keywords", .9),
        ("product_mockup", ["product mockup","mockup สินค้า","ม็อกอัปสินค้า"], "product mockup keywords", .9),
        ("product_mockup", ["packaging","package","packaging mockup","แพ็กเกจ","แพ็คเกจ","บรรจุภัณฑ์"], "packaging/mockup keywords", .88),
        ("product_ad", ["product","สินค้า","ads","โฆษณา","packaging","launch"], "product or ad keywords", .88),
        ("social_post", ["social post","feed post","instagram post","โพสต์โซเชียล","โพสต์ฟีด"], "social post keywords", .86),
        ("slides_diagram", ["presentation","slide","สไลด์","deck"], "presentation/slide keywords", .86),
        ("infographic", ["infographic","อินโฟกราฟิก","diagram","แผนภาพ","chart"], "information design keywords", .9),
        ("ui_mockup", ["ui","dashboard","app","mockup","webpage"], "UI/mockup keywords", .86),
        ("food_photography", ["food","อาหาร","dessert","coffee","restaurant"], "food keywords", .84),
        ("portrait", ["portrait","face","ใบหน้า","โฟกัสชัดที่หน้า","ลำตัวส่วนบน","ผู้หญิง","ชาย","คน","girl","woman","man"], "person/portrait keywords", .82),
        ("landscape", ["landscape","วิว","ภูเขา","ทะเล","forest","cityscape"], "landscape/place keywords", .83),
    ]
    for style, kws, reason, conf in rules:
        if contains_any(topic, kws):
            return style, reason, conf
    return "realistic", "fallback to realistic style", .65

def infer_deliverable(style: str, topic: str):
    if contains_any(topic, ["poster","โปสเตอร์"]): return "poster","poster keyword",.86
    if contains_any(topic, ["banner","แบนเนอร์","hero image","cover banner"]): return "banner","banner keyword",.84
    if contains_any(topic, ["thumbnail","หน้าปกคลิป"]): return "thumbnail","thumbnail keyword",.84
    if contains_any(topic, ["story post","instagram story","facebook story","สตอรี่","story แนวตั้ง"]): return "story_post","story post keyword",.88
    if contains_any(topic, ["social post","feed post","instagram post","โพสต์โซเชียล","โพสต์ฟีด"]): return "social_post","social post keyword",.86
    if contains_any(topic, ["presentation","slide","สไลด์","deck"]): return "presentation_slide","presentation keyword",.88
    if contains_any(topic, ["packaging mockup","package mockup","แพ็กเกจ","แพ็คเกจ","บรรจุภัณฑ์"]): return "packaging_mockup","packaging mockup keyword",.9
    if contains_any(topic, ["product mockup","mockup สินค้า","ม็อกอัปสินค้า"]): return "product_mockup","product mockup keyword",.9
    if contains_any(topic, ["storyboard","สตอรี่บอร์ด","หลายเฟรม","หลายช่อง"]): return "storyboard","storyboard keyword",.9
    if contains_any(topic, ["contact sheet","variant sheet","comparison sheet"]): return "contact_sheet","contact sheet keyword",.86
    if style == "infographic": return "infographic","style requires infographic deliverable",.9
    if style == "ui_mockup": return "ui_mockup","style requires UI mockup deliverable",.9
    if style == "slides_diagram": return "presentation_slide","slide style requires presentation deliverable",.86
    if style == "product_mockup": return "product_mockup","product mockup style requires mockup deliverable",.88
    if style == "social_post": return "social_post","social post style requires social deliverable",.86
    if style == "product_ad": return "product_ad","style requires product ad deliverable",.9
    if style == "cinematic": return "storyboard" if contains_any(topic,["storyboard","หลายเฟรม"]) else "general_image","cinematic still default",.76
    return "general_image","general image fallback",.7

def infer_ratio(style, deliverable, multi_mode):
    if multi_mode not in ("auto","single"): return "16:9","multi-frame layouts benefit from wider canvas",.82
    profile_ratio = profile_for(deliverable).get("ratio") if deliverable != "general_image" else None
    if profile_ratio:
        return profile_ratio, f"{deliverable} deliverable profile", .88
    if style in ("portrait","fashion_lookbook"): return "2:3","portrait/fashion body composition",.84
    if style in ("landscape","cinematic"): return "16:9","landscape/cinematic framing",.82
    return "3:2","general photographic fallback",.7

def ratio_to_size(ratio):
    if ratio in PORTRAIT_RATIOS: return "1024x1536"
    if ratio in LANDSCAPE_RATIOS: return "1536x1024"
    return "1024x1024"

def resolve(payload: dict) -> tuple[dict,list[dict],list[str]]:
    d = deepcopy(payload)
    warnings = []
    trace = []
    topic = d["topic"]
    multi_frame_was_auto = d.get("multi_frame_mode", "auto") == "auto"

    # Defaults for missing optional fields
    defaults = {
        "target_language":"auto","render_api":"auto","render_action":"auto","image_style":"auto","mode":"generate",
        "deliverable_type":"auto","aspect_ratio":"auto","render_size":"auto","quality":"auto","output_format":"auto","api_background":"auto",
        "scene_background_mode":"auto","multi_frame_mode":"auto","frame_layout":"auto","panel_subject_strategy":"auto","continuity_mode":"auto",
        "camera_angle":"auto","shot_framing":"auto","camera_system":"auto","lens_focal_length":"auto","aperture_style":"auto","depth_of_field":"auto",
        "background_blur":"auto","camera_movement":"auto","film_stock":"auto","shutter_speed_style":"auto","iso_style":"auto","sensor_format":"auto",
        "anamorphic_flare":"auto","motion_blur":"auto","composition_rule":"auto","lighting_preset":"auto","light_source":"auto","light_direction":"auto",
        "color_grade":"auto","cinematic_mode":"auto","moderation":"auto","n":1,"return_variants":2,"panel_count":1,"output_compression":None,
        "modifiers":[],"avoid":[],"panel_descriptions":[],"include_edit_prompt":True,
        "factual_reference_mode":"auto","verified_reference_facts":[],"reference_sources":[],
        "orchestration_mode":"auto","enable_subagents":True,"subagent_budget":"balanced","reasoning_depth":"standard","quality_review_passes":1,"safety_review_level":"standard"
    }
    for k,v in defaults.items(): d.setdefault(k,v)

    if d["target_language"] == "auto":
        sel = "th" if has_thai(topic) else "en"
        add(trace,"target_language","auto",sel,"detected Thai characters" if sel=="th" else "defaulted to English",.9)
        d["target_language"] = sel


    if d["render_api"] == "auto":
        sel = "image_api" if d.get("mode","generate") == "generate" else "responses_tool"
        add(trace,"render_api","auto",sel,"single generation uses Image API; edits default to Responses tool for multi-turn workflow",.78)
        d["render_api"] = sel

    if d["render_action"] == "auto":
        sel = "edit" if d.get("mode") == "edit" else "generate"
        add(trace,"render_action","auto",sel,"mirrors requested mode",.88)
        d["render_action"] = sel

    if d["image_style"] == "auto":
        sel, reason, conf = infer_style(topic)
        add(trace,"image_style","auto",sel,reason,conf)
        d["image_style"] = sel

    if d["multi_frame_mode"] == "auto":
        if contains_any(topic, ["storyboard","หลายเฟรม","หลายช่อง","grid","before after"]):
            sel, reason, conf = "storyboard","multi-frame keywords",.86
        else:
            sel, reason, conf = "single","no multi-frame signal",.78
        add(trace,"multi_frame_mode","auto",sel,reason,conf); d["multi_frame_mode"]=sel

    if d["deliverable_type"] == "auto":
        sel, reason, conf = infer_deliverable(d["image_style"], topic)
        add(trace,"deliverable_type","auto",sel,reason,conf); d["deliverable_type"]=sel

    if multi_frame_was_auto and d["deliverable_type"] in {"storyboard", "contact_sheet"} and d["multi_frame_mode"] == "single":
        sel = "storyboard" if d["deliverable_type"] == "storyboard" else "contact_sheet"
        add(trace,"multi_frame_mode","single",sel,f"{d['deliverable_type']} requires a multi-frame layout",.86)
        d["multi_frame_mode"] = sel

    if d["aspect_ratio"] == "auto":
        sel, reason, conf = infer_ratio(d["image_style"], d["deliverable_type"], d["multi_frame_mode"])
        add(trace,"aspect_ratio","auto",sel,reason,conf); d["aspect_ratio"]=sel

    if d["render_size"] == "auto":
        sel = ratio_to_size(d["aspect_ratio"])
        add(trace,"render_size","auto",sel,f"mapped requested aspect ratio {d['aspect_ratio']} to closest supported API size",.86)
        d["render_size"]=sel
    else:
        expected = ratio_to_size(d["aspect_ratio"])
        if d["render_size"] != expected:
            warnings.append(f"render_size={d['render_size']} may not match aspect_ratio={d['aspect_ratio']}; keeping explicit render_size.")

    if d["quality"] == "auto":
        profile_quality = profile_for(d["deliverable_type"]).get("quality")
        sel = profile_quality or ("high" if d["image_style"] in ("infographic","ui_mockup","product_ad","product_mockup","social_post","cinematic","fashion_lookbook","slides_diagram") or d["deliverable_type"] in PREMIUM_DELIVERABLES or d["deliverable_type"] in TEXT_SENSITIVE_DELIVERABLES else "medium")
        add(trace,"quality","auto",sel,"high-detail or text-sensitive style" if sel=="high" else "general style",.82)
        d["quality"]=sel

    if d["output_format"] == "auto":
        sel = "png" if d["api_background"] == "transparent" else "png"
        add(trace,"output_format","auto",sel,"PNG is safest default for text, transparency, and lossless review",.76)
        d["output_format"]=sel

    if d["api_background"] == "auto":
        sel = "transparent" if d["scene_background_mode"] == "green_screen" and contains_any(topic,["transparent","asset","sticker","cutout"]) else "opaque"
        add(trace,"api_background","auto",sel,"asset/cutout signal" if sel=="transparent" else "opaque is safest for full-scene imagery",.76)
        d["api_background"]=sel

    if d["api_background"] == "transparent" and d["output_format"] == "jpeg":
        d["output_format"] = "png"
        warnings.append("Transparent background requires png or webp; output_format was changed from jpeg to png.")
    if d.get("output_compression") is not None and d["output_format"] == "png":
        warnings.append("output_compression applies only to jpeg/webp; it will be omitted from render_request.")

    # Visual defaults
    style = d["image_style"]
    cinematic = "on" if style == "cinematic" or contains_any(topic,["cinematic","ภาพยนตร์","หนัง"]) else "off"
    visual_defaults = {
        "cinematic_mode": cinematic,
        "camera_angle": "low_angle" if cinematic=="on" and contains_any(topic,["hero","power","dramatic","ทรงพลัง"]) else ("eye_level" if style in ("portrait","fashion_lookbook") else "three_quarter" if style=="product_ad" else "eye_level"),
        "shot_framing": "full_body" if style=="fashion_lookbook" else "medium_close_up" if style=="portrait" else "wide_shot" if style in ("landscape","cinematic") else "medium_shot",
        "camera_system": "cinema_camera" if cinematic=="on" else "medium_format" if style in ("portrait","fashion_lookbook") else "mirrorless",
        "sensor_format": "super35" if cinematic=="on" else "medium_format" if style in ("portrait","fashion_lookbook") else "full_frame",
        "lens_focal_length": "35mm" if cinematic=="on" else "85mm" if style=="portrait" else "50mm",
        "aperture_style": "f1_8" if style in ("portrait","fashion_lookbook") else "f2_8" if cinematic=="on" else "f5_6",
        "depth_of_field": "shallow" if style in ("portrait","fashion_lookbook","cinematic","product_ad") else "deep" if style in ("infographic","ui_mockup") else "medium",
        "background_blur": "medium" if style in ("portrait","fashion_lookbook","cinematic") else "subtle",
        "camera_movement": "static",
        "film_stock": "cinema_film" if cinematic=="on" else "clean_digital",
        "shutter_speed_style": "natural_motion" if cinematic=="on" else "crisp",
        "iso_style": "natural_grain" if cinematic=="on" else "clean_low_iso",
        "anamorphic_flare": "subtle" if cinematic=="on" else "off",
        "motion_blur": "subtle" if cinematic=="on" else "none",
        "composition_rule": "rule_of_thirds" if cinematic=="on" else "centered" if style=="product_ad" else "rule_of_thirds",
        "lighting_preset": "moody_cinematic" if cinematic=="on" else "studio_softbox" if style in ("fashion_lookbook","product_ad") else "natural_soft",
        "light_source": "mixed" if cinematic=="on" else "softbox" if style in ("fashion_lookbook","product_ad") else "window",
        "light_direction": "side" if cinematic=="on" else "three_point" if style in ("fashion_lookbook","product_ad") else "front",
        "color_grade": "teal_orange" if cinematic=="on" else "natural",
        "scene_background_mode": "contextual" if d["scene_background_mode"]=="auto" and (cinematic=="on" or contains_any(topic,["beach","sea","ocean","forest","city","street","mountain","ทะเล","ชายหาด","ภูเขา","ป่า","เมือง","ถนน"])) else ("plain_studio" if d["scene_background_mode"]=="auto" and style in ("fashion_lookbook","product_ad","portrait") else d["scene_background_mode"]),
        "frame_layout": "2x2" if d["multi_frame_mode"] in ("storyboard","grid","multi_angle") else "1x1",
        "panel_subject_strategy": "sequence" if d["multi_frame_mode"]=="storyboard" else "same_subject",
        "continuity_mode": "strict" if d["multi_frame_mode"] in ("storyboard","multi_angle") else "none",
    }
    visual_defaults.update(visual_defaults_for(d["deliverable_type"]))
    for field, sel in visual_defaults.items():
        if d.get(field,"auto") == "auto":
            add(trace,field,"auto",sel,f"auto-selected from style={style}, cinematic_mode={cinematic}, deliverable={d['deliverable_type']}",.74)
            d[field]=sel

    if d["multi_frame_mode"] != "single" and d.get("panel_count",1) == 1:
        layout_counts = {"2x1":2,"1x2":2,"2x2":4,"2x3":6,"3x2":6,"2x4":8,"4x2":8,"3x3":9,"4x4":16}
        d["panel_count"] = layout_counts.get(d["frame_layout"],4)

    return d, trace, warnings

def confidence(trace: list[dict]) -> float:
    return round(mean([x["confidence"] for x in trace]) if trace else .5, 3)
