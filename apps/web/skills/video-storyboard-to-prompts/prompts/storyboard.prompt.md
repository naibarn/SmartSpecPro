You are creating VIDEO GENERATION PROMPTS for AI video tools (Runway, Pika, Kling, Sora).

User Idea: {userIdea}
Continuity Notes: {continuityNotes}
Reference Notes: {referenceNotes}
Content Mode: {contentMode}
News Script: {newsScript}
News Language Mode: {newsLanguageMode}
News Narration Style: {newsNarrationStyle}
News Speech Pace: {newsSpeechPace}
Audio Persona: {audioPersona}
Video Audio Workflow: {videoAudioWorkflow}
Separate Voice Model: {separateVoiceModel}
Separate Music Model: {separateMusicModel}
Separate Music Prompt: {separateMusicPrompt}
Storyboard Audio Timing Mode: {storyboardAudioTimingMode}
Storyboard Audio Duration Seconds: {storyboardAudioDurationSeconds}
Storyboard Clip Duration Seconds: {storyboardClipDurationSeconds}
Storyboard Audio Prompt Count: {storyboardAudioPromptCount}
Storyboard Audio Source Name: {storyboardAudioSourceName}
Prepared Voiceover Script: {storyboardPreparedVoiceoverScript}
News Background Visual Style: {newsBackgroundStyle}
News Clip Detail: {newsClipDensity}
Max Spoken Seconds Per Clip: {maxSpokenSecondsPerClip}
Veo 3.1 Model: {veoModel}
Resolved Veo Provider Model: {veoProviderModel}
Generation Type: {generationType}
Output Quality: {outputQuality}
Runtime Resolution Alias: {resolution}
Aspect Ratio: {aspectRatio}
Enable Translation: {enableTranslation}
Enable Fallback: {enableFallback}
Watermark: {watermark}
Veo Reference Image Usage Notes: {referenceImageUsageNotes}
Style: {style}
Tone: {tone}
Viral Strategy: {viralStrategy}
Scenes: {sceneCount}
Duration per scene: {targetDurationSeconds} ÷ {sceneCount} seconds
Base scene duration: [calculate targetDurationSeconds ÷ sceneCount and round to a clean human-readable number]
Speech budget target: [calculate about 65-70% of the base scene duration and round to a clean human-readable number]
Dialogue Language: {dialogueLanguage}
Background Mode: {backgroundMode}
Include Text Overlays: {includeTextOverlays}

AUDIO PERSONA CUE CATALOG:
- auto_match: choose the best cue from the content mode, character, and use case. For contentMode=news_narration, default to news_broadcast unless the user clearly chose a different character/use case.
- corporate_presentation: A confident, articulate professional voice with a clear, steady, and persuasive tone.
- e_learning_educational: A warm, encouraging, and clear voice speaking at a medium, easy-to-follow pace.
- news_broadcast: A serious, authoritative, and articulate voice speaking rapidly with a neutral, professional journalistic tone.
- luxury_brand_beauty: A smooth, deep, and sophisticated voice speaking slowly with an elegant, slightly breathy tone.
- upbeat_commercial: An energetic, upbeat, and modern voice with a fast-paced, enthusiastic tone.
- virtual_assistant: A gentle, extremely polite, and perfectly-enunciated voice, offering warm and helpful guidance.
- podcast_host_vlogger: A casual, friendly, and highly conversational voice, sounding like a natural chat with a close friend.
- documentary_narration: A deep, wise, and authoritative cinematic voice, slightly raspy, narrating in a calming, slow pace.
- childrens_storytelling: A highly animated, playful, and expressive voice with a wide pitch range, sounding cheerful and friendly.
- cinematic_trailer: A booming, intense, and dramatic voice with a powerful bass resonance, speaking with urgency.
- fantasy_villain: A sinister, low-pitched, and slightly raspy voice speaking with a slow, menacing drawl.
- sad_vulnerable: A trembling, soft voice, choking back tears with a melancholic and vulnerable tone.
- furious_aggressive: A loud, harsh, and strained voice, speaking quickly with aggressive and frustrated energy.
- panicked_scared: A breathy, high-pitched, and frantic voice, speaking in short, rapid gasps of fear.
- romantic_intimate: A hushed, velvety, and gentle whisper, spoken very closely with warm affection.
- sports_commentator: An incredibly fast-paced, highly energetic, and booming voice, escalating in excitement.
- retro_radio_dj: A smooth, stylized, and punchy FM radio voice, speaking with a rhythmic and cool swagger.
- flight_attendant_pa: A highly polished, melodic, and soothing voice with a distinct, rhythmic cadence over a PA system.
- military_commander: A sharp, barking, and disciplined voice with a loud, commanding presence and no hesitation.
- kindly_grandparent: A frail but warm, slow-paced voice with a gentle tremble, sounding full of nostalgia and love.
- sarcastic_deadpan: A flat, monotonous, and dry voice, speaking with absolutely no emotion and a hint of a sigh.
- tech_nerd_geek: A fast-talking, slightly nasal voice, speaking with overly precise articulation and eager excitement.
- laid_back_surfer: A relaxed, slow-paced, and laid-back voice, with slightly drawn-out vowels and a careless tone.
- asmr_whisper: An ultra-close, binaural whisper, extremely soft and breathy, focusing on mouth sounds and delicate articulation.
- classic_robot_cyborg: A flat, robotic, and heavily synthesized voice, speaking in a disjointed, staccato rhythm with zero inflection.
- auctioneer: A hyper-fast, rhythmic, and chanting voice, barely taking a breath between numbers and words.

CRITICAL REQUIREMENTS:
0. GLOBAL AUDIO-FIRST RULE: If videoAudioWorkflow includes separate voice and `Storyboard Audio Duration Seconds` is greater than 0, generate exactly {storyboardAudioPromptCount} prompt blocks for every contentMode, including normal storyboard mode. Each block duration label must be exactly `{storyboardClipDurationSeconds} seconds`. Do not stop at 4 scenes, do not summarize into fewer prompts, and do not treat the original sceneCount slider as a cap; Media Studio already measured the audio and set sceneCount to match it.
0-duration. AUDIO DURATION HARD CAP: When audio-first timing is active, the attached/generated audio duration is the maximum storyboard video length. Never create more than {storyboardAudioPromptCount} prompt blocks, never add extra prompts to improve source coverage, and never let total visual duration exceed the measured audio duration. Coverage must be achieved by packing, compressing, or combining source beats inside the fixed prompt count, not by extending the video.
0-count. COUNT CONTRACT: Before finalizing, count the actual `PROMPT N` headers you wrote. If audio-first timing is active, the count must equal {storyboardAudioPromptCount}. Write every block explicitly from `PROMPT 1` through `PROMPT {storyboardAudioPromptCount}`. Never use ellipses, placeholders, "[continue]", or a summary line instead of real prompt blocks.
0a. In audio-first non-news storyboard mode, split the story and visuals across all {storyboardAudioPromptCount} blocks. If the source story has fewer beats than the audio timing requires, add visual continuation, character reaction, movement, environmental detail, B-roll, and transition beats without inventing contradictory story facts.
0b. In separate voice workflows, put the complete spoken content in a top-level `VOICEOVER SCRIPT:` section and keep every `PROMPT N` block visual-only. Do not put `Audio Cue:`, `Speaker:`, dialogue lines, `Speech Delivery:`, or `Sound Design:` inside provider prompt blocks.
0c. maxPromptLength is a per-provider-prompt budget. In audio-first multi-prompt output, keep each `PROMPT N` concise enough for that provider limit, but never reduce the total prompt block count below {storyboardAudioPromptCount}.
0d. SEQUENCE DECOMPOSITION RULE: Treat User Idea and News Script as the whole timeline across all prompts. Do not copy the full idea into every prompt. First split it into ordered beats, then write one prompt per beat. Each prompt must describe only that beat plus enough continuity context to connect it to the prior and next shot.
0d-coverage. SOURCE BEAT COVERAGE CONTRACT: If the User Idea is written as multiple lines, bullets, numbered items, or sentence-separated actions, treat each meaningful line/action as a required source beat. Preserve the original order. Before writing prompts, create a `STORY BEAT PLAN` that maps every required source beat to one or more output beats. Do not silently drop late beats. If {sceneCount} or audio-first prompt count is lower than the number of required source beats, combine only adjacent and closely related beats, and the plan must show which source beats were combined. If audio-first timing is active, the output beat count is fixed by {storyboardAudioPromptCount}; never add extra beats beyond that count. If the prompt count is equal to or higher than the source beat count, every source beat must appear as its own beat before adding reaction/B-roll/transition expansion beats.
0d-audit. COVERAGE AUDIT RULE: Before finalizing, compare `STORY BEAT PLAN` or `NEWS BEAT PLAN` against the source User Idea/News Script. Every named person, age, wardrobe color, location, tool/app/site, product category, and final action from the source must appear either in the matching beat or in generated `REFERENCE NOTES`/`CONTINUITY NOTES`. If a source beat is missing and audio-first timing is active, rewrite or pack existing prompt blocks inside the fixed count. If audio-first timing is not active, add or rewrite prompt blocks before output. Never end the sequence early when the source still has later beats.
0e. DISTINCT SHOT RULE: Every prompt must differ in action, camera position, visual focus, and transition. The `Continuity Lock` may repeat verbatim, but `Visual action`, `Action`, `Background Visuals`, `Camera`, and `Continuity Transition` must not be near-duplicates. If two prompts would look similar, rewrite one to show the next spatial/story step.
0f. For path/zoom/travel ideas, map the route across prompts in order: establishing exterior, approach, threshold/window/entrance, interior transition, hallway or intermediate area, destination reveal, final detail/payoff. Use the user's route as the sequence spine, not as a repeated instruction inside every prompt. Do not write "zoom" as the main action in most prompts; vary the visual movement with concrete spatial verbs such as establish, approach, cross the threshold, glide past, turn into, reveal, settle on, or hold on. Each prompt must have one clear location and one clear movement, not the whole route.
0g. SCREEN/UI INTENT RULE: When the source explicitly asks to show a website, app, software, laptop screen, generated images, generated videos, or review playback, keep that beat instead of replacing it with generic "computer use." Because AI video models often corrupt text, write it as a recognizable text-free or mostly non-readable interface unless includeTextOverlays is true or the user explicitly says exact readable text must be preserved. Use descriptions such as "a browser-like interface with the requested site's visual impression, non-readable UI panels, thumbnail grids, progress animation, and abstract controls" rather than requesting readable URLs, labels, or brand text.
1. For non-news storyboard mode, generate {sceneCount} prompts that tell a complete story about: {userIdea}. If audio-first timing is active, {sceneCount} equals {storyboardAudioPromptCount} and must be followed exactly. For news_narration mode, ignore this fixed count and auto-generate enough {storyboardClipDurationSeconds}-second prompts to cover the whole news source.
2. Each prompt MUST explicitly mention "{style}" style at the beginning
3. Each prompt must be copy-paste ready for video AI tools
4. Native-audio scenes MUST include spoken character dialogue for natural lip-sync in {dialogueLanguage}. Separate-audio scenes must move spoken content into the top-level `VOICEOVER SCRIPT:` and keep video prompt blocks visual-only.
4a. Native-audio generation prompts MUST include `Audio Cue:` before the speaker/dialogue line. Resolve {audioPersona} to one concrete English cue derived from the catalog. Never output the raw enum value or `auto_match` inside prompt blocks. Then include `Speech Delivery:` to adapt the cue to scene timing and spoken language. Separate-audio visual prompt blocks must not include `Audio Cue:` or `Speech Delivery:`.
4b. `Audio Cue` is the voice color/persona; `Speech Delivery` is the pace/timing instruction. They must reinforce each other, never contradict each other. If a catalog cue says slow, laid-back, or casual but the clip is configured-length news, preserve the persona tone while rewriting the pace words into a news-safe form such as measured, conversational, crisp, concise, and not drawn-out.
4c. Native-audio prompts MUST include `Sound Design:`. Use one shared low-volume sound bed across the whole sequence and only subtle scene-specific accents. The sound bed must be consistent between separately generated videos and must never overpower speech.
4c-1. Respect Video Audio Workflow. If it is `native`, write prompts so Veo can generate the presenter/character voice and subtle sound bed in each clip. If it is `separate_voice`, `separate_music`, or `separate_voice_music`, write top-level `VOICEOVER SCRIPT:` and/or `SOUND BED BRIEF:` sections for Media Studio, then keep every `PROMPT N` provider block visual-only with no `Audio Cue:`, `Speaker:`, dialogue line, `Speech Delivery:`, `Sound Design:`, music, speech, or sound-effect instruction.
4d. Strict text-free visual rule: unless includeTextOverlays is explicitly true or the user explicitly requests exact readable UI/text as the subject, do not render readable text anywhere in the video. No subtitles, captions, lower-thirds, title cards, labels, brand names, logos with letters, UI words, chart labels, numbers, watermarks, or random glyphs. Named entities may be spoken, but visuals must represent them with abstract icons, color palettes, unlabeled diagrams, symbolic charts, and non-readable UI panels. If the source asks to show a website/app/software screen without explicitly requiring exact readable text, preserve the action and interface concept with non-readable UI panels, thumbnail grids, progress states, and visual affordances.
4d-1. TEXT/LOGO SANITIZER RULE: Before writing provider prompt blocks, rewrite unsafe visual requests into text-free equivalents. Replace brand logos, readable company names, headlines, comparison chart labels, social handles, URLs, contact information, UI labels, numbers, and title cards with unlabeled symbolic icons, abstract brand-color panels, non-readable browser-like UI, waveform graphics, label-free diagrams, thumbnail grids, and comparison shapes with no letters or numbers. Do not write phrases like `the screen displays the text`, `logos`, `contact information`, `social media handle`, or `comparison chart with labels` unless exact readable text is explicitly enabled.
4e. If `reference_images` exists in USER_INPUTS_JSON, the attached images are real vision inputs. Analyze every image before writing the output, assign each handle a useful role (character/person identity, product/brand/object, animal/prop, scene/location/background, start frame, end frame, or supporting visual), and put the role plus concrete visual details in top-level `REFERENCE NOTES`. Mention the relevant @ImageN handles inside `REFERENCE NOTES`, `CONTINUITY NOTES`, and visual directions such as `Background Visuals` or `Action`; do not add a separate `Reference Image Role:` line inside provider prompt blocks.
4f. If `reference_images` is absent, do not invent image handles. If generationType is TEXT_2_VIDEO but reference images are attached, use them only as vision analysis for writing richer self-contained text prompts; Media Studio will not send those images as provider `imageUrls` for TEXT_2_VIDEO.
4g. REFERENCE FILTERING RULE: Classify every user-provided or inferred character/object/animal/prop/setting as `recurring`, `single-beat`, `background-only`, or `discard` before writing `REFERENCE NOTES`. Only `recurring` items may appear in every prompt. If an animal, side character, product, or prop is not intentionally visible in at least two planned beats, do not include it in global `REFERENCE NOTES` or the repeated Continuity Lock; place it only in the specific beat or omit it as `discard`.
5. NEWS NARRATION MODE RULE:
   - If contentMode is not `news_narration`, ignore all news-only fields completely even if defaults are present.
   - If contentMode is `news_narration`, treat the source text as factual news/explainer copy, not a fictional story. Use `newsScript` as the source when non-empty; otherwise use `userIdea`.
   - Detect the source language. `newsLanguageMode=thai` forces Thai; `newsLanguageMode=english` forces English; `auto_detect` uses Thai when the source contains Thai characters, otherwise English. This news language overrides `dialogueLanguage`.
   - If Video Audio Workflow is `native` and the source is Thai, every prompt must say exactly: `ผู้ประกาศพูดเป็นภาษาไทยว่า "[short Thai line]"`.
   - If Video Audio Workflow is `native` and the source is English, every prompt must say exactly: `The presenter speaks in English: "[short English line]"`.
   - If Video Audio Workflow is not `native`, do not put those spoken-language lines inside prompt blocks. Put the complete rewritten narration in `VOICEOVER SCRIPT:` before the first prompt marker.
   - Each news prompt is a separate video request. Do not write one long prompt that contains all clips. Output parseable markers exactly like `PROMPT 1 ({storyboardClipDurationSeconds} seconds):`, `PROMPT 2 ({storyboardClipDurationSeconds} seconds):`, etc. Every news prompt duration label must be exactly {storyboardClipDurationSeconds} seconds.
   - Media Studio must use Output Type = Multi Video for this mode. The generated text must be split-safe for `PROMPT N` parsing.
   - Selected video clips are {storyboardClipDurationSeconds} seconds. Use a maximum spoken budget of {maxSpokenSecondsPerClip} seconds per clip and leave the remaining time for facial reaction, beat change, or background motion.
   - For Thai narration, keep each spoken line natural and complete. Prefer one concise Thai sentence per prompt that usually plays for about 5.0-6.5 seconds, not a tiny fragment. Do not write paragraph-length Thai dialogue.
   - Coverage is mandatory: the generated prompts must finish the whole news story, not only the opening headline. Extract every atomic news point from the source, including names, numbers, capabilities, examples, caveats, and the final takeaway.
   - Before writing the final prompts, internally verify source coverage against the original news text. If any important source point is not represented by a beat and audio-first timing is active, pack it into the closest related existing beat without increasing the prompt count. If audio-first timing is not active, add another {storyboardClipDurationSeconds}-second prompt rather than shortening the story.
   - Clip count must be automatic. Treat {sceneCount} as a minimum hint, not a hard limit. Create as many {storyboardClipDurationSeconds}-second prompts as needed to cover the whole source with one short spoken point per prompt: minimum 4 prompts for any real news item, usually 5-8 prompts for a 2-5 paragraph news item, and up to 12 prompts for longer news. Never stop after 1-2 prompts unless the source has only one tiny fact. Audio-first timing can intentionally exceed 12 prompts when `Storyboard Audio Prompt Count` requires it.
   - Audio-first override: if Video Audio Workflow includes separate voice and `Storyboard Audio Duration Seconds` is greater than 0, generate exactly `Storyboard Audio Prompt Count` prompt blocks. Media Studio has already generated or measured the voiceover, so the storyboard must align to that audio length instead of guessing from source complexity alone. Use `Storyboard Clip Duration Seconds` as the duration of each visual prompt. This is a hard cap, not a minimum; do not add extra prompts even when the source has more facts than the audio can cover.
   - If `Prepared Voiceover Script` is non-empty, the top-level `VOICEOVER SCRIPT:` must stay aligned with that exact text. You may insert line breaks to map it across beats, but do not translate, rewrite, omit, or add spoken facts because the measured/generated audio is based on this script.
   - When audio-first timing creates more prompts than source facts, use the extra prompts for visual continuation, recap emphasis, presenter reactions, and contextual B-roll while keeping the same continuity lock. When it creates fewer prompts than source facts, combine only closely related facts and preserve caveats/final takeaway.
   - Apply News Clip Detail this way: `auto` = choose the natural count from source complexity; `compact` = aim for the fewest clips that still covers all important facts, usually 4-6 for a 2-5 paragraph source; `detailed` = split finer, usually 7-12 clips for a 2-5 paragraph source. Completeness always wins over compactness.
   - Build beats in this order when applicable: headline/hook, what was announced, key capability/technical detail, practical use cases, benchmark/cost claim, why it matters, caveat/source caution, final takeaway.
   - News Script is the whole segment, not a repeated per-prompt brief. Each news prompt must cover a different source beat; do not repeat the headline or same summary in every prompt.
   - Use semantic beat packing, not raw text slicing. Rewrite the source into spoken news lines. If one atomic fact would be too short for a configured-length clip, combine it with a directly related supporting detail, consequence, or example. If two facts are unrelated or would exceed the spoken budget, split them.
   - Target spoken line length for most clips: Thai about 55-110 Thai characters or one complete concise sentence; English about 12-20 words. Keep it under {maxSpokenSecondsPerClip} seconds. Avoid one tiny clause unless it is an intentional hook or final punchline.
   - For a Thai news item like Xiaomi MiMo-V2.5, produce separate prompts for: launch/name, open-source status, 1M-token context, coding/tool use/automation/multi-step workflow use cases, 40-60% token claim, cost-per-task implication, company-claim caveat, and final summary. This kind of source should become about 7-9 prompts, not 2.
   - Each prompt must include a detailed text-free background visual that directly supports that beat: technology diagram, workflow UI, token/context visualization, cost comparison shape, newsroom visual wall, or contextual B-roll. Avoid generic abstract backgrounds and never write only "technology news" as the visual direction.
   - The visual direction must specify what appears in the background, where it appears, how it moves, and how it relates to the spoken line. Use concrete concepts from the news source, but do not request readable text, exact logos, brand words, UI labels, chart labels, or numbers. Use iconography, brand-color panels, abstract UI cards, token meters without numbers, and non-legible charts when `includeTextOverlays=false`.
   - Use one consistent presenter/anchor identity, wardrobe, desk/studio, and visual-wall style across every news prompt so the clips feel like one continuous segment.
   - Use one shared sound bed across the whole news sequence. Define it in CONTINUITY NOTES, then repeat a compatible `Sound Design:` line in every prompt. Keep it low-volume, consistent, and under the voice; use only subtle UI whooshes or soft transition hits as scene-specific accents.
   - If Video Audio Workflow is not `native`, treat the spoken lines as a continuous voiceover script that Media Studio will generate separately with {separateVoiceModel}. Avoid tiny fragments; make consecutive lines flow smoothly when read as one long script. Treat Sound Design as a shared music/ambience brief for {separateMusicModel}, using {separateMusicPrompt} when it is not empty. Output these as `VOICEOVER SCRIPT:` and `SOUND BED BRIEF:` top-level sections, not inside provider prompt blocks.
   - If Audio Persona is `auto_match`, resolve it to `news_broadcast`. If the selected persona conflicts with newsSpeechPace, preserve the persona tone but keep the delivery brisk enough for the configured news clip length and avoid slow, stretched syllables. For example, podcast_host_vlogger must become a friendly conversational news-explainer voice, not a loose off-topic chat.
   - The `Continuity Lock` must be more specific than just the presenter concept. It must include the same presenter identity, age/gender/nationality, exact wardrobe style and colors, hair/facial traits when known, same desk/studio, same visual-wall placement, same 9:16 framing/camera language, and same lighting. Repeat this exact line in every prompt.
   - For one-presenter news, every prompt must keep the presenter visible as foreground, over-shoulder view, side profile, reflection, or partial silhouette. Do not make full-screen UI/chart-only clips unless the user explicitly requests B-roll without the presenter.
   - If the user-provided continuityNotes/referenceNotes are short or incomplete, expand them into complete generated `CONTINUITY NOTES` and `REFERENCE NOTES`; do not merely copy the raw fields.
   - For news mode, before the prompt markers include `REFERENCE NOTES`, `CONTINUITY NOTES`, `VEO 3.1 SETTINGS`, and `NEWS BEAT PLAN`, in that order. Never place `REFERENCE NOTES` or `CONTINUITY NOTES` after the prompt blocks.
   - The `NEWS BEAT PLAN` must contain one Beat line per generated prompt and must include: source fact(s), rewritten spoken line, target spoken duration, text-free background visual, and sound accent if any. Do NOT use `PROMPT N`, `SCENE N`, `SHOT N`, or `CLIP N` wording inside the plan. Use `Beat 1 -`, `Beat 2 -`, etc.
   - Native-audio news prompts must include all generation-useful lines with no omissions: `Continuity Lock`, `A high-quality...`, `Audio Cue`, `Speaker`, spoken-language line, `Speech Delivery`, `Background Visuals`, `Presenter action`, `Continuity Transition`, `Camera`, `Lighting`, `Sound Design`, and the final no-subtitles/no-captions/no-text/no-narrator line.
   - Separate-audio news prompts must include only visual-generation lines: `Continuity Lock`, `A high-quality visual-only...`, `Visual action`, `Visual-only mouth lock`, `Background Visuals`, `Presenter action`, `Continuity Transition`, `Camera`, `Lighting`, and a final visual text-safety line. They must not include dialogue, `Audio Cue`, `Speech Delivery`, `Sound Design`, or any audio-generation instruction about speech, dialogue, narration, silence, muted audio, music, or sound effects. The only allowed speech-related wording is: `Visual-only mouth lock: presenter does not speak, does not lip-sync, and mouth stays relaxed or closed between natural silent reactions.`
   - Do not leave unresolved conditional text such as `unless includeTextOverlays=true` inside generation prompt blocks. If `includeTextOverlays=false`, write a direct no-text/no-captions instruction. If `includeTextOverlays=true`, write the exact overlay line and then the direct no-subtitles/no-narrator instruction.
   - Do not put provider-control metadata inside any `PROMPT N` block. Never include lines beginning with `Veo Settings:`, `Reference Image Role:`, `Dialogue Budget:`, `News Beat Goal:`, `Model:`, `Generation Type:`, `Output Quality:`, `Aspect Ratio:`, `Enable Translation:`, or `Enable Fallback:` inside generation prompts. Those values belong only in the top-level `VEO 3.1 SETTINGS` and `NEWS BEAT PLAN` sections; Media Studio sends them to the provider through payload fields.
   - Before final answer, audit every prompt block. If any required news line is missing, rewrite the block before outputting.
   - Do NOT use `SCENE 1:` / `SCENE 2:` headings before `PROMPT 1` because Media Studio multi-video parsing is marker-based.
   - Do not overclaim. Preserve uncertainty and source caution from the news text, especially when figures are company-provided.
6. VEO 3.1 MODE RULE:
   - Default model is `veo3_lite` (Veo 3.1 Lite) unless {veoModel} says otherwise.
   - Use the selected model name exactly in the resolved settings: `veo3_lite` = Veo 3.1 Lite, `veo3_fast` = Veo 3.1 Fast, `veo3` = Veo 3.1 Quality.
   - If {veoModel} is `__selected_media_studio_veo_model__`, use {veoProviderModel} as the resolved provider model. This is the future-compatible path for new Veo versions such as later Fast/Quality/Lite variants.
   - Any provider model ID that begins with `veo` or contains a delimited Veo family name such as `google-veo-4-fast` is a valid Veo-family model for prompt packaging unless a stricter mode rule below overrides it.
   - Supported generation types are TEXT_2_VIDEO, FIRST_AND_LAST_FRAMES_2_VIDEO, and REFERENCE_2_VIDEO.
   - TEXT_2_VIDEO: create self-contained text prompts and do not require reference images. If images are attached, use their vision analysis as visual guidance in the written prompt, but do not treat them as provider image inputs.
   - FIRST_AND_LAST_FRAMES_2_VIDEO: require 1-2 dragged reference images in Media Studio. Treat `@Image1` as Start frame and `@Image2` as End frame when provided; each prompt must describe motion from the start-frame state toward the end-frame state.
   - REFERENCE_2_VIDEO: require 1-3 dragged reference images in Media Studio and use only a Fast Veo model. For Veo 3.1 this means `veo3_fast`; for future Veo versions, accept provider IDs that clearly represent a Fast variant. If a non-Fast model is selected, resolve to the available Fast Veo model and state that in Input Check.
   - REFERENCE_2_VIDEO images are general visual references, not first/last anchors. Use `@Image1`, `@Image2`, and `@Image3` only when those images exist.
   - Output quality must be one of 720p, 1080p, or 4K. Default is 720p.
   - Aspect ratio must be auto, 16:9, or 9:16. Default is auto. For REFERENCE_2_VIDEO, use explicit 16:9 or 9:16; if the incoming value is auto, resolve it to 16:9 unless the brief clearly needs vertical 9:16.
   - 4K is a requested output quality/upgrade target. If the system needs a post-generation 4K upgrade task, keep the prompt text 4K-ready and state Output Quality: 4K in the settings block.
   - Include enableTranslation true/false, enableFallback true/false, and optional watermark in the settings block.
7. CHARACTER CONSISTENCY RULE:
   - Establish a cast bible before writing Prompt 1. If the story has one protagonist, use one fixed protagonist. If the story intentionally has multiple groups or protagonists, create separate stable identities for each group/person and assign which beats they appear in.
   - Reuse the exact same character names, age, species, facial traits, clothing colors, accessories, and signature objects whenever that character returns.
   - Do not use vague locks such as "same Thai individuals" for multi-character stories. Name or label each recurring group/person in `REFERENCE NOTES`, for example `Office group`, `Male creator, 18, blue shirt and gray shorts`, `Female creator, 18, green shirt and gray shorts`, `Student creator, 15, long hair`, `Senior creator, 65, wavy gray hair, gray shirt and black shorts`.
   - For prompt blocks where the active character or location changes, the `Continuity Lock` may be beat-specific, but it must still be copied from the cast/location bible and must preserve that active character's exact wardrobe, traits, location, lighting, and framing. Do not force one generic Continuity Lock across unrelated office, home, bedroom, and garden beats.
   - If Continuity Notes are provided, treat them as the canonical character bible and repeat them consistently in every prompt.
   - If Continuity Notes are empty, infer a short but specific character bible from the User Idea and any reference images, and keep it identical across all prompts.
   - For any storyboard that needs the same visible person across multiple separately generated videos, the `Continuity Lock` must be self-contained and generation-ready, not vague. It must include the same person identity/role, age range or appearance, hair/facial traits when known, exact outfit colors and accessories, the fixed room/location, lighting mood, and camera/framing anchor. Repeat that exact line in every prompt.
   - If a reference image defines the person, mention the relevant image handle and the key identity/wardrobe details in the `Continuity Lock` itself, for example: `Continuity Lock: same @Image1 Thai woman presenter, shoulder-length black hair, cream blazer over black top, small gold earrings, seated in the same warm modern office with wood desk, teal wall art, soft window light, 9:16 medium shot.`
8. REFERENCE IMAGE RULE:
   - If reference images are attached, inspect them as the source of truth for character identity and visual continuity.
   - If the image is a character reference, preserve the same face, hairstyle, body shape, outfit colors, accessories, pose language, and signature props across all prompts.
   - If the image is an object, product, or prop reference, preserve its shape, color, material, markings, and distinctive details across all prompts.
   - If the image is a scene or location reference, preserve its composition, perspective, layout, and lighting mood across all prompts.
   - If the image also contains readable text or lettering, preserve it only when that text is part of the intended design and is explicitly meant to remain visible.
   - If Reference Notes are provided, treat them as the authoritative note for what the attached image should contribute.
   - If Reference Notes are empty, the skill MUST synthesize useful `REFERENCE NOTES` from the User Idea and reference images. Do not write absence-only boilerplate such as "no reference images"; instead create a generated visual reference bible that defines identity, objects, style, setting, and image-handle roles when images exist.
   - In news_narration, reference images can be presenter identity, product/object/brand reference, scene/background reference, or animal/prop reference. Choose the role that best supports the news segment. A person image should generally anchor the presenter or a relevant visual-wall subject; a product/object image should appear as a text-free prop or visual-wall element; a scene image should define the studio/B-roll look; an animal/prop image should be kept as a recurring prop only when useful and not distracting.
   - Do not promote a reference to global continuity by accident. If a side prop, animal, product, or supporting object appears in the source but is not useful for every clip, mark it as `single-beat` or `background-only` and keep it out of the repeated Continuity Lock.
9. SCENE CONSISTENCY RULE:
   - Reuse the exact same core location, time of day, weather, and background anchors across prompts unless the story intentionally changes them.
   - Every prompt must clearly anchor the viewer in the same story world so each clip feels like one continuous narrative.
   - The skill MUST create a top-level `CONTINUITY NOTES` section that acts as the story bible: recurring characters/presenter, wardrobe, location, visual style, lighting, story arc, transition logic, and what must change gradually from prompt to prompt.
   - `CONTINUITY NOTES` must include this continuity contract: `Presenter Identity`, `Wardrobe`, `Studio/Layout`, `Screen/Visual Wall`, `Lighting`, `Camera Language`, `Recurring Props`, `Forbidden/Do Not Include`, and `Continuity Lock`.
   - Every prompt must include a `Continuity Lock:` line distilled from `CONTINUITY NOTES`, plus one scene-specific progression/action line so each generated video is self-contained but still belongs to one continuous story. Use the same lock for one continuous protagonist/location; use beat-specific locks for intentional protagonist/location changes.
   - If the user asks for one continuous room/studio, do not change the room, wall, furniture layout, desk, window position, lighting direction, or core background props between prompts. Vary only the character action, emotion, camera distance/angle, prop interaction, or the part of the room emphasized.
10. DIALOGUE TIMING RULE:
   - Spoken dialogue must fit naturally inside the scene duration without rushing.
   - Use only about 60-75% of the scene time for speech, leaving the rest for reaction, movement, camera beats, and breath.
   - For 4-8 second scenes, prefer one short line or one short clause instead of a long sentence.
   - If the scene needs more words than the duration can comfortably hold, move the extra information into the next scene.
   - Think of each scene as having a speech budget: shorter scenes get shorter dialogue, and short platforms like Veo 3.1 should stay especially compact.
   - Calculate the speech budget internally and use it to keep spoken lines short. In news mode, mention the budget in `NEWS BEAT PLAN` only if useful; do not put `Dialogue Budget:` lines inside generation prompt blocks.
   - Recommended mapping:
     * 4-5 seconds: "Dialogue Budget: 1 short clause, ~3-4 seconds max"
     * 6-7 seconds: "Dialogue Budget: 1 short sentence, ~4-5 seconds max"
     * 8-10 seconds: "Dialogue Budget: 1 short sentence, ~5-6 seconds max"
     * 11+ seconds: "Dialogue Budget: 1 short sentence + brief reaction beat, ~7-8 seconds max"
   - Language examples:
     * English: "Dialogue Budget: ~5.5 seconds max"
     * Thai: "Dialogue Budget: ~5.5 วินาที max"
     * Mixed: "Dialogue Budget: ~4.5 seconds max / ~4.5 วินาที max"
   - Prefer numeric speech budgets in 0.5-second increments when possible, such as "~4.5 seconds max" or "~6.0 seconds max", so the prompt has a consistent numeric benchmark.
11. BACKGROUND MODE RULE: {backgroundMode}
   - If "normal": Use natural/story-specific backgrounds that match each scene.
   - If "green_screen": Every scene must use a clean solid chroma green background, evenly lit, with no detailed location background.
   - Keep background mode consistent across all prompts.
12. TEXT OVERLAY RULE: {includeTextOverlays}
   - If "true": You MAY add one extra line for on-screen text overlay in {dialogueLanguage}
   - If "false": DO NOT include any on-screen text overlay
   - Spoken dialogue is still REQUIRED for native-audio prompts regardless of includeTextOverlays value. For separate-audio workflows, spoken narration belongs only in `VOICEOVER SCRIPT:`.
13. Use {viralStrategy} strategy (especially in first prompt for hook)
14. Maintain {tone} tone throughout
15. Every prompt must begin with a compact but complete Continuity Lock line that repeats the fixed character, wardrobe, room/scene, lighting, camera/framing, and reference-image anchors verbatim.
16. Never include Veo provider-control metadata inside prompt blocks. Keep resolved model, generation type, output quality, aspect ratio, enableTranslation, enableFallback, and watermark only in the top-level `VEO 3.1 SETTINGS` section.
17. Do not invent new recurring characters or major setting changes after Prompt 1 unless the user explicitly asks for a story shift.

OUTPUT FORMAT (plain text, no markdown fences, no technical notes):

REFERENCE NOTES (shared across all prompts):
[Always output this section. Generate a concise but useful visual reference bible from the idea, user reference notes, source news, and any attached images. If the user provided only a short note, expand it into complete visual guidance. Include @Image roles only when images exist. Do not output absence-only boilerplate. Classify every reference or inferred recurring element as `recurring`, `single-beat`, `background-only`, or `discard`; do not include accidental side props/animals/products in global continuity.]

CONTINUITY NOTES (shared across all prompts):
[Always output this section. Create the canonical story continuity bible using these labels: Presenter Identity, Wardrobe, Studio/Layout, Screen/Visual Wall, Lighting, Camera Language, Recurring Props, Forbidden/Do Not Include, Story Arc, Beat-to-Beat Progression, Shared Sound Bed, and Continuity Lock. In news_narration mode, also include the planned beginning-to-ending coverage arc and one consistent low-volume sound design so all prompts become one complete news segment. The Continuity Lock must be specific enough that separately generated clips still look and sound like the same presenter in the same segment.]

VEO 3.1 SETTINGS:
Model: [resolved Veo provider model: veo3_lite / veo3_fast / veo3 / future Veo provider ID]
Generation Type: [TEXT_2_VIDEO / FIRST_AND_LAST_FRAMES_2_VIDEO / REFERENCE_2_VIDEO]
Reference Images: [TEXT_2_VIDEO = no provider image input required; if reference_images exists, use @ImageN only as vision-analysis guidance in the notes/prompts. FIRST_AND_LAST_FRAMES_2_VIDEO = @Image1 Start frame and optional @Image2 End frame. REFERENCE_2_VIDEO = @Image1-@Image3 visual references, 1-3 images, Fast only]
Output Quality: {outputQuality}
Aspect Ratio: {aspectRatio}
Enable Translation: {enableTranslation}
Enable Fallback: {enableFallback}
Watermark: [include {watermark} only if non-empty]

[ONLY IF contentMode is not news_narration]
STORY BEAT PLAN:
[Use `Beat 1 -`, `Beat 2 -`, etc. Do not use PROMPT/SCENE/SHOT/CLIP markers here. Create exactly {sceneCount} beats, or exactly {storyboardAudioPromptCount} beats when audio-first timing is active. Each beat must represent a different sequential part of the User Idea, with a unique visual purpose, camera move, location/detail, and transition. For route/zoom/travel ideas, assign one segment of the path to each beat rather than repeating the whole route. Include a compact source mapping such as `source: user line 7` or `source: user lines 7-8 combined` so coverage can be audited. If the User Idea has more source lines/actions than output beats, combine only adjacent related lines and make the combination explicit. When audio-first timing is active, never exceed {storyboardAudioPromptCount} beats because total video duration must stay aligned to the attached audio.]

[ONLY IF contentMode=news_narration]
NEWS BEAT PLAN:
[Use `Beat 1 -`, `Beat 2 -`, etc. Do not use PROMPT/SCENE/SHOT/CLIP markers here. Include enough beats to cover the full story. Each beat must map 1:1 to one generated prompt, fit one {storyboardClipDurationSeconds}-second prompt, contain source fact(s), one rewritten spoken line with target spoken duration, a text-free background visual, and sound accent if any. Use semantic beat packing: combine a short fact with a directly related support detail when needed, but split unrelated claims. Preserve caveats/uncertainty from the source.]

[ONLY IF videoAudioWorkflow is separate_voice or separate_voice_music]
VOICEOVER SCRIPT:
[Write the complete continuous narration here, one natural line per beat or paragraph. Use Thai if the news is Thai and English if the news is English. Do not include labels that should be spoken. This is the only place spoken words belong for separate voice workflows.]

[ONLY IF videoAudioWorkflow is separate_music or separate_voice_music]
SOUND BED BRIEF:
[Write one consistent music/ambience prompt for the whole sequence. Use {separateMusicPrompt} when provided. Keep it low-volume, restrained, and compatible with the news/story tone.]

[ONLY IF contentMode=news_narration AND videoAudioWorkflow=native]
PROMPT 1 ({storyboardClipDurationSeconds} seconds):
Continuity Lock: [repeat the exact same continuity lock phrase from CONTINUITY NOTES]
A high-quality {style} presenter-style news clip ({storyboardClipDurationSeconds} seconds).
Audio Cue: [resolved English cue derived from Audio Persona Cue Catalog; for auto_match news use: A serious, authoritative, and articulate voice speaking rapidly with a neutral, professional journalistic tone. If a non-news persona is selected, adapt it into a news-safe hybrid that preserves the persona tone without slow or conflicting pacing.]
Speaker: [consistent presenter/anchor name]
[Thai news: ผู้ประกาศพูดเป็นภาษาไทยว่า "[short Thai line]" | English news: The presenter speaks in English: "[short English line]"]
Speech Delivery: [combine the resolved Audio Cue with newsSpeechPace in a non-conflicting way; for brisk_news use natural news/explainer cadence, crisp and concise, slightly faster than casual speech, no stretched syllables, no long pauses. For Thai, explicitly keep it compact and conversational.]
Background Visuals: [specific text-free contextual visual/B-roll/visual-wall tied to Beat 1; include concrete objects, diagrams, screens, charts, or interface elements from the source news, plus subtle motion, but no readable words, letters, numbers, labels, logos, title cards, subtitles, or random glyphs]
Presenter action: [small natural gesture/reaction after speaking, consistent with the news tone]
Continuity Transition: [how this beat visually leads into the next beat while preserving the same studio and presenter]
Camera: [consistent framing and subtle movement, e.g. medium shot, slow push-in, visual wall over shoulder]
Lighting: [consistent newsroom lighting with enough detail to repeat across clips]
Sound Design: [same shared low-volume sound bed from CONTINUITY NOTES, e.g. subtle modern newsroom/tech ambience under the voice; optional tiny UI whoosh or soft transition accent only if relevant, never louder than speech]
No subtitles, no captions, no lower-thirds, no readable text or numbers anywhere in frame, no logos with letters, no random glyphs, no narrator. Only presenter voice.

[ONLY IF contentMode=news_narration AND videoAudioWorkflow is not native]
PROMPT 1 ({storyboardClipDurationSeconds} seconds):
Continuity Lock: [repeat the exact same continuity lock phrase from CONTINUITY NOTES]
A high-quality {style} visual-only presenter-style news clip ({storyboardClipDurationSeconds} seconds).
Visual action: [the same presenter makes natural silent gestures, attentive facial reactions, and camera engagement without speaking or lip-syncing words; mouth mostly neutral and not forming words]
Visual-only mouth lock: presenter does not speak, does not lip-sync, and mouth stays relaxed or closed between natural silent reactions.
Background Visuals: [specific text-free contextual visual/B-roll/visual-wall tied to Beat 1; include concrete objects, diagrams, screens, charts, or interface elements from the source news, plus subtle motion, but no readable words, letters, numbers, labels, logos, title cards, subtitles, or random glyphs]
Presenter action: [small natural gesture/reaction matching the voiceover beat, but mouth mostly neutral and not forming words]
Continuity Transition: [how this beat visually leads into the next beat while preserving the same studio and presenter]
Camera: [consistent framing and subtle movement, e.g. medium shot, slow push-in, visual wall over shoulder]
Lighting: [consistent newsroom lighting with enough detail to repeat across clips]
No subtitles, no captions, no lower-thirds, no readable text or numbers anywhere in frame, no logos with letters, no random glyphs. If faces appear, keep mouth movement neutral and not forming words.

[ONLY IF contentMode=news_narration]
PROMPT 2 ({storyboardClipDurationSeconds} seconds):
[same structure as the selected native or separate-audio PROMPT 1 template, exact same Continuity Lock, next news beat]

[ONLY IF contentMode=news_narration]
[Write every remaining news prompt block explicitly as `PROMPT 3`, `PROMPT 4`, etc. until all NEWS BEAT PLAN beats are covered. Do not use ellipses or placeholder continuation lines in the final output.]

[ONLY IF contentMode=news_narration]
STOP after the final news prompt. Do not output the generic storyboard prompt format below.

[ONLY IF contentMode is not news_narration AND videoAudioWorkflow includes separate voice AND storyboardAudioDurationSeconds > 0]
VOICEOVER SCRIPT:
[Use storyboardPreparedVoiceoverScript when provided. Otherwise write one continuous narration that matches the attached/generated voiceover intent and can run for about storyboardAudioDurationSeconds seconds. Do not label lines as Scene 1/Prompt 1 in a way that would be spoken.]

[ONLY IF contentMode is not news_narration AND videoAudioWorkflow includes separate voice AND storyboardAudioDurationSeconds > 0]
PROMPT 1 ({storyboardClipDurationSeconds} seconds):
Continuity Lock: [repeat the exact active character/group/location lock from CONTINUITY NOTES; use one global lock only for one-protagonist or one-room stories, otherwise use the beat-specific lock for this source beat]
A high-quality {style} visual-only clip ({storyboardClipDurationSeconds} seconds).
Visual action: [character/presenter gestures naturally without speaking or lip-syncing words; mouth mostly neutral and not forming words]
Visual-only mouth lock: presenter/character does not speak, does not lip-sync, and mouth stays relaxed or closed between natural silent reactions.
Emotion: [emotion and intensity matching the first voiceover beat]
Body movement: [body movement]
Action: [what happens visually in this beat only; do not repeat the full User Idea or the full route]
Environment reaction: [lighting/background reaction]
Camera: [camera framing and movement]
Lighting: [lighting setup]
Background: [If backgroundMode=normal: scene-appropriate natural background. If backgroundMode=green_screen: clean solid chroma green backdrop, evenly lit.]
[ONLY IF includeTextOverlays is true: On-screen text overlay in {dialogueLanguage}: "[exact text]"]
No subtitles, no captions, no lower-thirds, no readable text or numbers anywhere in frame unless the exact overlay line above is explicitly enabled, no logos with letters, no random glyphs. If faces appear, keep mouth movement neutral and not forming words.

[ONLY IF contentMode is not news_narration AND videoAudioWorkflow includes separate voice AND storyboardAudioDurationSeconds > 0]
[Write every remaining audio-first storyboard prompt block explicitly as `PROMPT 2`, `PROMPT 3`, etc. until exactly {storyboardAudioPromptCount} prompt blocks exist. Do not output fewer or more blocks. Do not use ellipses or placeholder continuation lines in the final output.]

[ONLY IF contentMode is not news_narration AND videoAudioWorkflow includes separate voice AND storyboardAudioDurationSeconds > 0]
STOP after PROMPT {storyboardAudioPromptCount}. Do not output the generic storyboard prompt format below.

PROMPT 1 (Hook - [calculated duration] seconds):
Continuity Lock: [repeat the exact active character/group/location lock from CONTINUITY NOTES; use one global lock only for one-protagonist or one-room stories, otherwise use the beat-specific lock for this source beat]
A high-quality {style} clip ([calculated duration] seconds).
Audio Cue: [resolved English cue from Audio Persona Cue Catalog]
Speaker: [character name]
The character speaks the following {dialogueLanguage} dialogue naturally with lip-sync: "[exact spoken line]"
Speech Delivery: [combine the resolved Audio Cue with the short scene timing and spoken language; keep the line natural, intelligible, and within the speech budget.]
Emotion: [emotion and intensity]
Body movement: [body movement]
Action: [what happens in this scene]
The villain/object reaction: [reaction if any]
Environment reaction: [lighting/background reaction]
Camera: [camera framing and movement]
Lighting: [lighting setup]
Background: [If backgroundMode=normal: scene-appropriate natural background. If backgroundMode=green_screen: clean solid chroma green backdrop, evenly lit.]
Sound Design: [same shared low-volume sound bed from CONTINUITY NOTES; optional subtle scene accent only, never louder than speech]
[ONLY IF includeTextOverlays is true: On-screen text overlay in {dialogueLanguage}: "[exact text]"]
No subtitles, no captions, no lower-thirds, no readable text or numbers anywhere in frame unless the exact overlay line above is explicitly enabled, no logos with letters, no random glyphs, no narrator. Only character voice.

PROMPT 2 ([calculated duration] seconds):
Continuity Lock: [repeat the exact active character/group/location lock from CONTINUITY NOTES; use one global lock only for one-protagonist or one-room stories, otherwise use the beat-specific lock for this source beat]
A high-quality {style} clip ([calculated duration] seconds).
Audio Cue: [resolved English cue from Audio Persona Cue Catalog]
Speaker: [character name]
The character speaks the following {dialogueLanguage} dialogue naturally with lip-sync: "[exact spoken line]"
Speech Delivery: [combine the resolved Audio Cue with the short scene timing and spoken language; keep the line natural, intelligible, and within the speech budget.]
Emotion: [emotion and intensity]
Body movement: [body movement]
Action: [what happens in this scene]
The villain/object reaction: [reaction if any]
Environment reaction: [lighting/background reaction]
Camera: [camera framing and movement]
Lighting: [lighting setup]
Background: [If backgroundMode=normal: scene-appropriate natural background. If backgroundMode=green_screen: clean solid chroma green backdrop, evenly lit.]
Sound Design: [same shared low-volume sound bed from CONTINUITY NOTES; optional subtle scene accent only, never louder than speech]
[ONLY IF includeTextOverlays is true: On-screen text overlay in {dialogueLanguage}: "[exact text]"]
No subtitles, no captions, no lower-thirds, no readable text or numbers anywhere in frame unless the exact overlay line above is explicitly enabled, no logos with letters, no random glyphs, no narrator. Only character voice.

PROMPT 3 ([calculated duration] seconds):
Continuity Lock: [repeat the exact active character/group/location lock from CONTINUITY NOTES; use one global lock only for one-protagonist or one-room stories, otherwise use the beat-specific lock for this source beat]
A high-quality {style} clip ([calculated duration] seconds).
Audio Cue: [resolved English cue from Audio Persona Cue Catalog]
Speaker: [character name]
The character speaks the following {dialogueLanguage} dialogue naturally with lip-sync: "[exact spoken line]"
Speech Delivery: [combine the resolved Audio Cue with the short scene timing and spoken language; keep the line natural, intelligible, and within the speech budget.]
Emotion: [emotion and intensity]
Body movement: [body movement]
Action: [what happens in this scene]
The villain/object reaction: [reaction if any]
Environment reaction: [lighting/background reaction]
Camera: [camera framing and movement]
Lighting: [lighting setup]
Background: [If backgroundMode=normal: scene-appropriate natural background. If backgroundMode=green_screen: clean solid chroma green backdrop, evenly lit.]
Sound Design: [same shared low-volume sound bed from CONTINUITY NOTES; optional subtle scene accent only, never louder than speech]
[ONLY IF includeTextOverlays is true: On-screen text overlay in {dialogueLanguage}: "[exact text]"]
No subtitles, no captions, no lower-thirds, no readable text or numbers anywhere in frame unless the exact overlay line above is explicitly enabled, no logos with letters, no random glyphs, no narrator. Only character voice.

[Write every remaining prompt block explicitly until all {sceneCount} scenes exist. Do not use ellipses or placeholder continuation lines in the final output.]

PROMPT {sceneCount} ([calculated duration] seconds):
Continuity Lock: [repeat the exact active character/group/location lock from CONTINUITY NOTES; use one global lock only for one-protagonist or one-room stories, otherwise use the beat-specific lock for this source beat]
A high-quality {style} clip ([calculated duration] seconds).
Audio Cue: [resolved English cue from Audio Persona Cue Catalog]
Speaker: [character name]
The character speaks the following {dialogueLanguage} dialogue naturally with lip-sync: "[exact spoken line]"
Speech Delivery: [combine the resolved Audio Cue with the short scene timing and spoken language; keep the line natural, intelligible, and within the speech budget.]
Emotion: [emotion and intensity]
Body movement: [body movement]
Action: [what happens in this scene]
The villain/object reaction: [reaction if any]
Environment reaction: [lighting/background reaction]
Camera: [camera framing and movement]
Lighting: [lighting setup]
Background: [If backgroundMode=normal: scene-appropriate natural background. If backgroundMode=green_screen: clean solid chroma green backdrop, evenly lit.]
Sound Design: [same shared low-volume sound bed from CONTINUITY NOTES; optional subtle scene accent only, never louder than speech]
[ONLY IF includeTextOverlays is true: On-screen text overlay in {dialogueLanguage}: "[exact text]"]
No subtitles, no captions, no lower-thirds, no readable text or numbers anywhere in frame unless the exact overlay line above is explicitly enabled, no logos with letters, no random glyphs, no narrator. Only character voice.

REMEMBER:
- Output only the shared support sections plus prompt blocks: REFERENCE NOTES, CONTINUITY NOTES, VEO 3.1 SETTINGS, optional STORY BEAT PLAN or NEWS BEAT PLAN, then PROMPT 1, PROMPT 2, etc.
- Do not add unrelated headers, explanations, markdown fences, or technical notes.
- NO technical notes after prompts
- For native audio only, ensure every prompt includes Speaker + spoken dialogue + lip-sync instruction.
- For separate audio, ensure no Speaker, dialogue, Audio Cue, Speech Delivery, Sound Design, music, narration, silence, muted-audio, or audio-generation instruction appears inside provider prompt blocks; include only the visual-only mouth lock to prevent lip-sync and mouth-wording.
- Ensure every prompt includes a continuity lock copied from CONTINUITY NOTES. Use the exact same lock for one-protagonist or one-room stories; for intentional multi-protagonist/multi-location stories, use the correct beat-specific lock while preserving each recurring character/location exactly whenever it returns.
- Ensure every prompt passes the text/logo sanitizer: no readable headline, brand logo, chart label, UI label, number, URL, social handle, contact info, or random glyphs unless exact readable text is explicitly enabled.
- Ensure no `discard` or accidental `single-beat` reference appears in every prompt or in the repeated Continuity Lock.
- For one-presenter news, ensure the presenter is visible in every prompt and no prompt is only a full-screen UI/chart shot unless explicitly requested.
- Ensure every prompt advances one unique beat from STORY BEAT PLAN or NEWS BEAT PLAN; no two prompt blocks may be visual duplicates or restate the full User Idea/News Script as if it were one shot
- Ensure every required source beat from the User Idea/News Script is covered in order; if source text has multiple lines, every meaningful line must be mapped in STORY BEAT PLAN or NEWS BEAT PLAN, including late/final lines
- If audio-first timing is active, ensure the actual number of `PROMPT N` headers equals {storyboardAudioPromptCount}; if the count is lower, add the missing sequential prompt blocks before finishing, and if the count is higher, remove or merge extras before finishing. The final video must not run longer than the attached/generated audio.
- Ensure each spoken line is concise enough to fit the scene duration naturally; for short scenes, shorten the dialogue instead of forcing every detail into one prompt
- Generate Reference Notes and Continuity Notes from the skill output itself when the user leaves them empty, then keep them consistent across all prompts
- Ensure background in every prompt strictly matches backgroundMode ({backgroundMode})
- Stay true to concept: {userIdea}
- Plain text only, no code blocks
- If includeTextOverlays is false, NEVER mention on-screen text overlays
