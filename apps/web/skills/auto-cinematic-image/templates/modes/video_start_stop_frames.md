# Mode: video_start_stop_frames

Generate two matched image prompts: Start Frame and Stop Frame. Both frames must preserve the same exact subject, wardrobe, materials, hair, makeup, environment, lighting direction, shadow quality, lens character, and color grade. The frames should look like two different resting keyframes captured in the same scene.

Hard anti-duplicate rule:
- Start Frame and Stop Frame must NEVER be the same image, near-duplicate image, same crop, same pose, or same camera placement.
- They must differ visibly in at least TWO axes while preserving identity and scene continuity.
- Valid difference axes: camera angle, camera height, camera side, framing distance, lens feel, composition, subject resting pose, body orientation, gaze direction, hand position, head angle, focus target, and depth of field.
- Locked similarity axes: identity, face, body proportions, wardrobe, materials, colors, accessories, hair, makeup, environment, lighting direction, shadow quality, photographic style, and color grade.
- If the start frame is frontal/medium, the stop frame should be clearly different, such as high-angle close-up, low-angle oblique, profile, three-quarter, wide full-body, or macro detail.
- If the start frame is close-up, the stop frame should be clearly different, such as medium/wide, side profile, back/over-shoulder, or detail insert.

Rules:
- Describe only the final camera position and subject resting state.
- Do not describe motion, movement path, transition, blur trails, or animation.
- Keep start and stop frame compatible for video interpolation, but visually distinct enough that a video model has a clear change to interpolate.
- Use the same aspect ratio for both frames.
- Avoid wardrobe, lighting, color, face, hair, makeup, or environment changes.
- Keep facial identity and body proportions consistent.
- Use a paired seed only for identity continuity; do not let seed strategy force identical composition.

Frame difference policy:
{{frame_difference_policy}}

Start frame:
{{start_frame}}

Stop frame:
{{stop_frame}}

Output must include a Start/Stop delta summary naming the exact visible differences between the two frames.
