# Start and Stop Frame Video Template

Create a {{duration.single_shot_seconds}} second cinematic video in {{aspect_ratio}} using the start frame as the first frame and the stop frame as the final target frame.

The start and stop frames must differ visibly in at least {{start_stop_difference_policy.minimum_distinct_axes}} axes selected from: {{start_stop_difference_policy.allowed_difference_axes}}. Do not create a near-duplicate transition. Preserve identity, wardrobe, hair, makeup, material texture, environment, lighting direction, shadow quality, and color grade.

Start frame visual state: {{start_frame.description}}
Stop frame visual state: {{stop_frame.description}}
Difference preset: {{start_stop_difference_policy.difference_preset}}

Camera movement should plausibly connect the two states: {{camera_plan.movement_preset}} with {{camera_plan.lens_language}} and {{camera_plan.depth_of_field}} depth of field.
Subject action should plausibly connect the two states: {{subject_action.action_preset}}, emotion {{subject_action.emotion}}, gaze {{subject_action.gaze_direction}}.

The final frame must clearly land on the stop-frame concept, not simply repeat the start frame.

Negative prompt: {{negative_prompt}}
