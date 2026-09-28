# OpenAI Agents SDK Reference — v10

SmartAIHub owns the deterministic production workflow. OpenAI Agents SDK is used for bounded reasoning and typed outputs.

## Canonical pattern

Use `output_type` / Pydantic objects for specialist results and persist every approved stage in SmartAIHub project state.

Recommended logical outputs now include:
- ProductMechanism
- ExpandedIntent
- SequencePlan
- ShotPlan
- H3ReferencePlan
- H3CompiledPrompt
- H3ExecutionPlan
- GrokReferencePlan
- GrokCompiledPrompt
- GrokExecutionPlan
- PromptChain
- QCReport
- RepairPlan

## H3 orchestration example

```python
brief = await run_intake(project)
scene_semantics = await analyze_start_frame(brief) if brief.has_start_frame else None
mechanism = await run_product_mechanism(brief, scene_semantics)
intent = await expand_idea(brief, mechanism, scene_semantics)
sequence = await plan_sequence(intent)

approved = await pause_for_storyboard_approval(sequence)

for logical_shot in approved.shots:
    if logical_shot.provider_family == "minimax-h3":
        ref_plan = await plan_h3_references(logical_shot, project.assets)

        # Application code, not the agent, enforces provider-mode legality.
        assert not mixes_hard_frames_and_ref2va(ref_plan)

        h3_prompt = await compile_h3_prompt(logical_shot, ref_plan)

        if project.h3_context_ir:
            enhanced = await h3_context_ir(h3_prompt, ref_plan)
            h3_prompt = await validate_or_repair_context_ir(
                canonical=logical_shot,
                reference_plan=ref_plan,
                candidate=enhanced,
            )

        result_768 = await generate_h3(logical_shot, ref_plan, h3_prompt)
        qc = await run_h3_qc(result_768, logical_shot, ref_plan)

        if not qc.pass_:
            result_768 = await bounded_h3_repair(result_768, qc)

        if project.require_2k:
            final = await h3_regenerate_2k(
                approved_768=result_768,
                original_context=project.h3_original_context,
            )
```

## Long H3 continuity

H3 reference continuation is different from a native extension API:

```python
segments = temporal_planner.plan_reference_continuation_chain(
    target_total_seconds=40,
    preferred_segment_seconds=15,
    tail_seconds=4,
)

previous = None
for segment in segments:
    if segment.index == 0:
        current = await generate_h3_base(segment)
    else:
        tail = await extract_tail(previous, seconds=segment.tail_seconds)
        current = await generate_h3_ref2va_continuation(
            segment,
            reference_video=tail,
            state_ledger=project.state_ledger,
        )
        await seam_qc(previous, current)

    previous = current
```

Agents may recommend the route, but code validates:
- tenant/asset authorization;
- reference limits;
- H3 mode exclusivity;
- budget/idempotency;
- paid generation approvals;
- retry ceilings;
- publish side effects.


## v10 branch-aware target orchestration

```python
target = await resolve_promotion_target(
    idea=project.idea,
    scene_semantics=project.scene_semantics,
    assets=project.assets,
)

if target.branch == "product_mechanism":
    target_model = await build_product_mechanism(target, project)
elif target.branch == "place_experience":
    target_model = await build_place_experience(target, project)
elif target.branch in {
    "service_experience",
    "digital_experience",
    "event_experience",
    "property_experience",
    "brand_narrative",
}:
    target_model = await build_experience_model(target, project)
elif target.branch == "narrative_only":
    target_model = None
else:
    await block_or_request_missing_evidence(target)

intent = await expand_idea(
    project.idea,
    target_resolution=target,
    target_model=target_model,
    scene_semantics=project.scene_semantics,
)
```

The controller owns branch commitment. A specialist agent may recommend a target kind, but a physical-product workflow must not be forced merely because the Skill historically originated as a product-video director.


## Grok Imagine Video 1.5 orchestration

```python
grok_refs = await plan_grok_references(
    assets=shot.assets,
    start_state=shot.start_state,
    provider_options=project.provider_options.grokImagineVideo15,
)

if grok_refs.conflict_resolution == "prebake_start_frame":
    prebaked = await create_and_approve_start_frame(
        original_start=shot.start_frame,
        reference_assets=grok_refs.prebake_inputs,
    )
else:
    prebaked = None

grok_prompt = await compile_grok_prompt(
    shot=shot,
    reference_plan=grok_refs,
)

result = await generate_grok_15(
    prompt=grok_prompt,
    reference_plan=grok_refs,
    prebaked_start=prebaked,
)
```

The application controller, not the LLM, validates:
- Start Frame vs Reference-to-Video mode exclusivity;
- max 7 reference images;
- max 3 preset voices;
- reference mode <=720p;
- Start Frame aspect normalization;
- unsupported raw video-reference handling;
- custom voice entitlement;
- paid-job idempotency.

For current xAI edit/extend flows, route to companion model `grok-imagine-video`; do not merge those capabilities into the `grok-imagine-video-1.5` profile.


## Wan / FLUX / Seedance v9 orchestration

Provider-specific planning happens after the canonical SmartAIHub shot/sequence is approved.

```python
if shot.provider_family == "wan3":
    refs = await plan_wan3_references(
        assets=shot.assets,
        provider_options=project.provider_options.wan3,
    )

    await enforce_wan_reference_budget(refs)
    await enforce_wan_video_input_plus_output_duration(refs, shot)

    if refs.requires_prebake:
        approved_start = await create_and_approve_start_frame(...)
    elif refs.requires_split:
        return await build_split_generation_plan(...)

    prompt = await compile_wan3_prompt(shot, refs)
    result = await generate_wan3(prompt, refs)

elif shot.provider_family == "flux3":
    keyframe_plan = await plan_flux3_inputs(
        assets=shot.assets,
        timed_keyframes=shot.timed_keyframes,
        provider_options=project.provider_options.flux3,
    )

    if keyframe_plan.prebake_required:
        approved_keyframes = await create_and_approve_shot_keyframes(...)
    else:
        approved_keyframes = keyframe_plan.keyframes

    prompt = await compile_flux3_prompt(shot, keyframe_plan)
    draft = await generate_flux3(prompt, approved_keyframes, draft=True)

    if project.provider_options.flux3.draftWorkflow == "draft_then_enhance":
        selected = await approve_flux_draft(draft)
        result = await flux_draft_enhance(selected.draft_cache)

elif shot.provider_family == "seedance":
    refs = await plan_seedance_references(
        model=shot.model,
        assets=shot.assets,
        provider_options=project.provider_options.seedance,
    )

    await enforce_seedance_model_specific_limits(refs)
    await enforce_byteplus_material_library(refs)

    if refs.requires_prebake:
        approved_start = await create_and_approve_start_frame(...)
    elif refs.requires_split:
        return await build_split_generation_plan(...)

    prompt = await compile_seedance_prompt(shot, refs)
    result = await generate_seedance(prompt, refs)
```

### Controller-owned provider invariants

The application controller, not an LLM, enforces:

**Wan 3.0**
- hard-frame XOR raw-reference family;
- image/video/audio/file/link budgets;
- video-input + output <=30s;
- file/link exclusivity;
- async job idempotency.

**FLUX 3**
- generic identity/product/place images are not silently interpreted as literal keyframes;
- timed keyframes are inside the clip duration;
- maximum ten keyframes;
- V2V uses an actual continuation source;
- arbitrary raw audio references are not invented;
- draft_cache is required for draft_enhance.

**Seedance 2.x**
- 2.0 and 2.5 model-specific duration/resolution/reference limits;
- 2.0 audio-only restriction;
- BytePlus real-human material-library authorization;
- hard-frame + multimodal reference mix only when endpoint verification allows it;
- current 2.5 continuation-turn cap.


## LTX 2.5 v10 orchestration

```python
ltx_inputs = await plan_ltx25_inputs(
    assets=shot.assets,
    provider_options=project.provider_options.ltx25,
)

if ltx_inputs.prebake_required:
    approved_start = await create_and_approve_start_frame(...)
else:
    approved_start = None

ltx_prompt = await compile_ltx25_prompt(
    shot=shot,
    input_plan=ltx_inputs,
)

if ltx_inputs.execution_route == "cloud_api":
    await validate_ltx25_cloud_matrix(...)
    result = await generate_ltx25_cloud(
        input_plan=ltx_inputs,
        prompt=ltx_prompt,
        prebaked_start=approved_start,
    )
else:
    await validate_ltx25_local_workflow(...)
    result = await generate_ltx25_local(...)
```

Controller-owned invariants:

**Cloud**
- Fast/Pro exact resolution/FPS/duration matrix;
- `last_frame_uri` requires first frame;
- auto duration + Last Frame rejected;
- A2V requires exactly one explicit soundtrack driver and duration metadata;
- arbitrary cloud soft/video references rejected/adapted;
- Retake/Extend/Reframe not advertised for current 2.5 models;
- async paid jobs are idempotent and polled via the matching v2 endpoint.

**Local**
- known ComfyUI/Python workflow;
- raw reference IC-LoRA capability explicitly verified;
- extension capability explicitly verified;
- dimensions and `8k+1` frames preflighted;
- Worker access/tenant authorization enforced by application code.
