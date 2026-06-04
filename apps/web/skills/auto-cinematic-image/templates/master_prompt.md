# Master Prompt Template

Use the attached reference image(s) as absolute ground truth. Preserve the same locked person, product, environment, materials, colors, textures, accessories, room/set layout, lighting direction, shadow quality, color grade, and photographic style. For products, preserve category, silhouette, proportions, finish, construction details, and visible markings. For environments, preserve architecture, furniture inventory, fixture placement, surface materials, spatial relationships, and lighting. Do not add or remove people, props, accessories, jewelry, glasses, logos, furniture, scenery, text, or objects unless explicitly present in the reference image(s) or explicitly requested.

Reference roles:
- Primary identity reference: {{primary_identity_reference}}
- Product identity/detail reference: {{product_reference}}
- Wardrobe/material reference: {{wardrobe_material_reference}}
- Lighting/color-grade reference: {{lighting_colorgrade_reference}}
- Pose/composition reference: {{pose_composition_reference}}
- Environment/set reference: {{environment_set_reference}}

Generation mode: {{mode}}
Aspect ratio: {{aspect_ratio}}
Style preset: {{style_preset}}
Custom style notes: {{custom_style_notes}}
Allow text in image: {{allow_text_in_image}}

Continuity locks:
{{continuity_locks}}

Camera/composition request:
{{camera_and_composition}}

Video keyframe anti-duplicate rule:
{{start_stop_anti_duplicate_rule}}

Rendering requirements:
Photorealistic cinematic image, physically plausible lighting, correct perspective, consistent depth of field for the selected focal length and camera distance. For people, keep accurate anatomy, realistic skin texture, realistic hair texture, and consistent identity. For products, keep accurate proportions, faithful materials, finish, seams, labels/markings already present, and realistic reflections. For environments, keep coherent architecture, room topology, furniture placement, materials, fixtures, and spatial depth.

Negative constraints:
{{negative_constraints}}

Text policy:
Unless `allow_text_in_image` is true, do not generate captions, labels, panel text, watermarks, UI text, logos, or random glyphs. If text is allowed, keep it concise and only where requested.

Output format:
{{output_format}}
