Convert the storyboard into one video prompt per scene.

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
Background Mode: {backgroundMode}
Base scene duration: [use the per-scene duration and round to a clean human-readable number]
Speech budget target: [calculate about 65-70% of the base scene duration and round to a clean human-readable number]
Preferred rounding: [round speech budget to the nearest 0.5 second, e.g. ~4.5 seconds max]

Audio Persona Cue Catalog:
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

For native audio, each scene prompt should output:

A high-quality {style} clip ({sceneDuration} seconds).
Audio Cue: [Resolved English cue derived from the Audio Persona Cue Catalog. Put this before character/dialogue instructions so the voice style anchors the generated audio. If content timing requires it, adapt pace words so this cue does not contradict Speech Delivery.]
Speaker: {speaker}
The character speaks the following {dialogueLanguage} dialogue naturally with lip-sync: "{dialogue}"
Speech Delivery: [Combine the resolved Audio Cue with any content-specific pace rules and make it consistent with the cue. For news_narration, also resolve from newsSpeechPace: natural = clear conversational pace. brisk_news = natural news/explainer cadence, crisp and concise, slightly faster than casual speech, no stretched syllables, no long pauses. fast_social = quicker short-form delivery, still intelligible and lip-sync stable.]
Emotion: {emotion}
Body movement: {bodyMovement}
Action: {action}
The villain/object reaction: {objectReaction}
Environment reaction: {environmentReaction}
Camera: {camera}
Lighting: {lighting}
Background: [If backgroundMode=normal: scene-appropriate natural background. If backgroundMode=green_screen: clean solid chroma green backdrop, evenly lit.]
Sound Design: [Use the shared low-volume sound bed from CONTINUITY NOTES; add only subtle scene-matched accents that do not overpower speech.]
No subtitles, no captions, no lower-thirds, no readable text or numbers anywhere in frame, no logos with letters, no narrator. Only character voice.

For separate audio workflows (`separate_voice`, `separate_music`, `separate_voice_music`), output top-level audio sections before prompt blocks, then make every prompt block visual-only:

VOICEOVER SCRIPT:
[continuous spoken script only, one line per scene/beat or natural paragraph, no labels that should be spoken]

SOUND BED BRIEF:
[one consistent music/ambience prompt for the whole sequence, only when workflow includes music]

PROMPT 1 ({storyboardClipDurationSeconds} seconds):
Continuity Lock: [same lock from CONTINUITY NOTES]
A high-quality {style} visual-only clip ({sceneDuration} seconds).
Visual action: [character/presenter gestures naturally without speaking or lip-syncing words]
Visual-only mouth lock: presenter/character does not speak, does not lip-sync, and mouth stays relaxed or closed between natural silent reactions.
Emotion: {emotion}
Body movement: {bodyMovement}
Action: {action}
Environment reaction: {environmentReaction}
Camera: {camera}
Lighting: {lighting}
Background: [scene-appropriate visual background, text-free]
No subtitles, no captions, no lower-thirds, no readable text or numbers anywhere in frame, no logos with letters, no random glyphs. If faces appear, keep mouth movement neutral and not forming words.

Rules:
- Keep each prompt self-contained (do not reference previous prompts implicitly).
- Always output top-level `REFERENCE NOTES` and `CONTINUITY NOTES` before prompt blocks. These are generated by the skill, synced into Media Studio, and must be strong enough to keep separately generated videos visually and narratively continuous.
- If `reference_images` exists in USER_INPUTS_JSON, analyze every attached image with vision before writing prompts. Assign each handle the best role: character/person identity, product/brand/object, animal/prop, scene/location/background, start frame, end frame, or supporting visual. For contentMode=`storyboard` or `news_narration`, treat attached images as reference assets, not start/end frames, unless generationType is explicitly `FIRST_AND_LAST_FRAMES_2_VIDEO`.
- Put the @ImageN roles and concrete visual details in top-level `REFERENCE NOTES`, and carry relevant details into `CONTINUITY NOTES`, `Background Visuals`, `Action`, or `Background`. Make it explicit that attached reference images are being used, e.g. `@Image1 is used as a reference asset for the recurring main character, not as a start frame`. Do not put a separate `Reference Image Role:` line inside provider prompt blocks.
- If user referenceNotes/continuityNotes are blank, infer them from the storyboard, user idea/news source, and attached reference images. Do not write absence-only boilerplate; create a useful generated visual/reference bible.
- If user referenceNotes/continuityNotes are short or incomplete, expand them into full shared `REFERENCE NOTES` and `CONTINUITY NOTES`; never copy a one-line note as the entire continuity bible.
- For contentMode=`storyboard`, prioritize continuous story flow and character/cast consistency across all prompts. The prompts must feel like one storyboard with stable recurring identity, wardrobe, props, setting anchors, lighting, camera language, emotional arc, and beat-to-beat transitions, not independent redesigns.
- `REFERENCE NOTES` must classify every reference or inferred visual element as `recurring`, `single-beat`, `background-only`, or `discard`. Only `recurring` elements may appear in every prompt. Keep accidental side props, animals, products, or supporting objects out of the repeated Continuity Lock unless they are intentionally visible throughout the sequence.
- `CONTINUITY NOTES` must include a compact continuity contract using these labels: `Presenter Identity`, `Wardrobe`, `Studio/Layout`, `Screen/Visual Wall`, `Lighting`, `Camera Language`, `Recurring Props`, `Forbidden/Do Not Include`, and `Continuity Lock`.
- Every prompt must include a `Continuity Lock:` line derived from `CONTINUITY NOTES`, then add scene-specific action/progression for that beat. Use the exact same lock for one-protagonist or one-room stories; for intentional multi-protagonist/multi-location stories, use the correct beat-specific lock from the cast/location bible and reuse it exactly whenever that character/location returns.
- For visible-person continuity, make the `Continuity Lock` detailed enough to stand alone inside each provider prompt: same person/reference image handle, face/hair traits, exact wardrobe colors, accessories, fixed room/studio, background anchors, lighting, aspect/framing, and camera language. Repeat it verbatim.
- Treat User Idea, storyboard text, or News Script as the whole sequence across all prompt blocks, not as a full instruction to repeat in every prompt. Decompose it into ordered beats first; each `PROMPT N` covers one unique beat only.
- If the User Idea or storyboard is written as multiple lines, bullets, numbered items, or sentence-separated actions, treat each meaningful line/action as a required source beat. Preserve the order and map every source beat into the output. Do not drop late beats just because the earlier beats already feel complete.
- Before finalizing, audit coverage: every named person, age, wardrobe color, location, tool/app/site, product category, and final action from the source must appear in the matching prompt, `REFERENCE NOTES`, or `CONTINUITY NOTES`. If the prompt count is lower than the source beat count, combine only adjacent related beats and make the combined visual action explicit.
- If audio-first timing is active, the attached/generated audio duration is a hard cap. The final output must contain exactly `Storyboard Audio Prompt Count` prompt blocks and must not add extra prompt blocks for coverage. If source beats exceed the fixed prompt count, pack multiple adjacent related source beats into the same visual prompt while keeping the sequence readable and in order.
- The repeated `Continuity Lock` preserves identity/style/world. It must not cause repeated action, repeated camera moves, repeated backgrounds, or repeated summaries. Each prompt needs unique visual action, camera position/movement, visual focus, and transition role.
- For multi-character stories, do not use one vague `Continuity Lock` for everyone. Build a cast/location bible in `REFERENCE NOTES` and `CONTINUITY NOTES`, then use a beat-specific lock for the active group/person that preserves exact identity, wardrobe, setting, lighting, and framing. A story can have separate locks for office group, home creator, student creator, and senior creator when the user intentionally changes protagonist/location.
- For one-room continuity, keep the room layout, furniture, wall/window position, background props, and lighting direction unchanged in every prompt; vary only performance, gesture, emotion, prop use, and camera distance/angle.
- For path/zoom/travel ideas, assign one part of the route to each prompt in order: exterior establishing view, approach/zoom, threshold/window/entrance, interior transition, hallway or intermediate space, destination reveal, and final detail/payoff. Never place the entire route in every prompt.
- For website/app/software/screen beats, keep the requested screen action as a distinct beat. If exact readable text is not explicitly enabled, describe a recognizable but mostly non-readable UI: browser-like frame, abstract brand-color page, image grid, generation progress, video preview window, playback controls, or software canvas without readable labels/logos/numbers.
- If contentMode is `news_narration`, output separate parseable prompt blocks only: `PROMPT 1 ({storyboardClipDurationSeconds} seconds):`, `PROMPT 2 ({storyboardClipDurationSeconds} seconds):`, etc. Media Studio Multi Video will send each prompt separately to Kie.ai.
- If contentMode is not `news_narration`, ignore news-only defaults such as newsLanguageMode/newsNarrationStyle/newsBackgroundStyle/maxSpokenSecondsPerClip.
- Audio-first timing applies to every content mode, not only news. If videoAudioWorkflow includes separate voice and `Storyboard Audio Duration Seconds` is greater than 0, output exactly `Storyboard Audio Prompt Count` prompt blocks, each labeled `PROMPT N ({storyboardClipDurationSeconds} seconds):`. Do not output fewer blocks even when the non-news storyboard has fewer natural beats.
- If the caller prompt includes `AUDIO_FIRST_STORYBOARD_PROMPT_COUNT_CONTRACT`, treat it as the exact runtime count contract. It overrides generic examples and any tendency to stop at 10 prompts; if it says PROMPT 1 through PROMPT 15, write all 15 real prompt blocks explicitly.
- Count the final `PROMPT N` headers before answering. If `Storyboard Audio Prompt Count` is 7, explicitly output `PROMPT 1` through `PROMPT 7`. Do not use ellipses, "[continue]", or placeholder continuation lines.
- Do not output more than `Storyboard Audio Prompt Count` when audio-first timing is active. The total video duration is `Storyboard Audio Prompt Count × Storyboard Clip Duration Seconds` and must stay aligned to the attached audio duration. Coverage must be compressed into that fixed duration, not extended.
- In non-news audio-first mode, distribute story action, character reactions, movement, B-roll, environmental detail, and transitions across the exact prompt count. If videoAudioWorkflow includes separate voice, keep every prompt block visual-only and place spoken narration only in the top-level `VOICEOVER SCRIPT:`.
- maxPromptLength is a per-provider-prompt budget. In audio-first multi-prompt output, keep each `PROMPT N` concise enough for that provider limit, but never reduce the total prompt block count below `Storyboard Audio Prompt Count`.
- Respect audioPersona for every content mode. If audioPersona is `auto_match`, resolve one cue from the catalog and reuse the same resolved cue across the whole storyboard unless a scene explicitly changes speaker/character.
- Native-audio prompts must include an `Audio Cue:` line using a resolved English cue derived from the catalog, then a `Speech Delivery:` line that adapts that cue to the scene timing and language. Separate-audio visual prompt blocks must not include audio cue, speaker, dialogue, speech delivery, or sound design lines.
- `Audio Cue` and `Speech Delivery` must not conflict. `Audio Cue` defines the voice color/persona; `Speech Delivery` defines timing. If a catalog cue says slow/laid-back but the clip is configured-length news, rewrite the resolved cue to retain the tone while using measured/brisk wording instead of slow/drawn-out wording.
- For contentMode=`news_narration`, `auto_match` resolves to `news_broadcast` by default, because news should sound authoritative, articulate, and brisk. If the user selected another persona, write the cue and delivery as a news-safe hybrid. Example: podcast_host_vlogger becomes a friendly conversational news-explainer voice with crisp delivery; it must not sound like an unrelated casual chat.
- Do not leave unresolved conditional text such as `unless includeTextOverlays=true` in generation prompt blocks. Resolve the condition into explicit final instructions before output.
- Enforce a strict text-free visual rule unless the user explicitly enabled text overlays or explicitly requested exact readable UI/text as the subject. Do not ask the video model to render readable text, subtitles, captions, lower-thirds, chart labels, UI labels, brand names, logos with letters, numbers, or watermarks. Use abstract icons, unlabeled diagrams, non-readable UI cards, color palettes, and symbolic charts instead. If the source asks to show a website/app/software screen, preserve the visual action with non-readable interface elements rather than deleting the beat.
- Sanitize text/logo/contact/chart requests before writing prompt blocks. Replace readable brand names, logos, headlines, social handles, URLs, contact information, chart labels, UI labels, and numbers with unlabeled symbolic icons, abstract brand-color panels, non-readable browser-like interfaces, waveform shapes, thumbnail grids, and label-free comparison graphics.
- Named entities from the news may be spoken in the dialogue, but must not appear as readable text in the background visual.
- In news_narration mode, ignore generic scene-count compression. The number of prompts must be computed from the news source so the full story is told from hook through final takeaway.
- In news_narration mode, each prompt must cover a different source beat. Do not repeat the headline, summary, or same background visual in every prompt.
- In news_narration mode, use {sceneCount} only as a minimum hint. Create at least 4 prompts for any real news item, usually 5-8 prompts for a 2-5 paragraph source, and up to 12 prompts when needed. Never output only 1-2 prompts for a multi-paragraph news article. Audio-first timing can intentionally exceed 12 prompts when `Storyboard Audio Prompt Count` requires it.
- If videoAudioWorkflow includes separate voice and `Storyboard Audio Duration Seconds` is greater than 0, this is an audio-first storyboard. The final number of `PROMPT N ({storyboardClipDurationSeconds} seconds):` blocks must equal `Storyboard Audio Prompt Count` exactly, because Media Studio already measured or generated the voiceover. Use `Storyboard Clip Duration Seconds` as the visual length of each prompt and distribute the story beats across that exact count. Do not ignore this timing lock even if source text is short or long.
- If `Prepared Voiceover Script` is non-empty, keep the top-level `VOICEOVER SCRIPT:` aligned to that exact spoken text. You may add line breaks for readability, but do not rewrite facts, omit sentences, translate it, or invent a different script, because the audio file has already been generated from this text.
- If the audio-first prompt count is higher than the number of news facts, spread visual emphasis, reactions, recap beats, and contextual B-roll across the extra prompts while keeping the continuous voiceover/story arc coherent. If the prompt count is lower than the number of facts or source beats, pack adjacent related facts together; do not drop caveats or the final takeaway, and do not add prompts beyond the audio cap.
- In news_narration mode, apply newsClipDensity: `auto` chooses naturally from source complexity; `compact` aims for the fewest clips that still covers all important facts; `detailed` splits into more clips with finer background visuals and transitions. Completeness always overrides compactness.
- In news_narration mode, extract source beats before writing prompts: announcement/name, key capability, technical detail, user impact/use cases, metric/claim, caveat, and final summary when present.
- In news_narration mode, use semantic beat packing for configured-length clips. A prompt may combine one major fact with one directly related supporting detail or consequence when the spoken line would otherwise be too short. If one paragraph has two unrelated important claims, split them into separate prompts.
- In news_narration mode, target complete spoken lines around 60-80% of {storyboardClipDurationSeconds} seconds for most clips. For Thai, avoid one tiny clause unless it is a deliberate hook; rewrite into one natural complete sentence, roughly 55-110 Thai characters when possible. For English, target roughly 12-20 words. Always stay under {maxSpokenSecondsPerClip} seconds.
- In news_narration mode, detect Thai versus English from the newsScript/userIdea unless newsLanguageMode forces a language.
- If videoAudioWorkflow is `native` and Thai, every prompt must include the exact phrase `ผู้ประกาศพูดเป็นภาษาไทยว่า "..."` with one complete Thai spoken sentence that fits within {maxSpokenSecondsPerClip} seconds and never exceeds 7 seconds.
- If videoAudioWorkflow is `native` and English, every prompt must include the exact phrase `The presenter speaks in English: "..."` with one complete English spoken sentence that fits within {maxSpokenSecondsPerClip} seconds and never exceeds 7 seconds.
- In news_narration mode with native audio, include `Audio Cue:` and `Speech Delivery:` in every prompt. For `brisk_news`, tell Veo the presenter speaks in a natural, crisp news cadence, not slow, not sleepy, no stretched syllables, no long dramatic pauses. For Thai, explicitly say the Thai speech is compact and conversational.
- In news_narration mode with separate audio, put the spoken Thai/English narration only in `VOICEOVER SCRIPT:` and keep every `PROMPT N` block visual-only with no Audio Cue, Speech Delivery, Sound Design, or audio-generation instructions about speech, dialogue, narration, silence, muted audio, music, or sound effects. The only allowed speech-related wording is the visual-only mouth lock that prevents lip-sync and mouth-wording.
- In news_narration mode, every prompt must include a detailed background visual or visual-wall/B-roll direction directly related to that specific beat of the news. Do not use generic decorative backgrounds or vague phrases such as "technology news"; name the concrete product concept, workflow, token/context visual, cost comparison shape, or caution signal from the source, but keep all visuals text-free and unlabeled.
- In news_narration mode, native-audio prompts should include `Background Visuals`, `Presenter action`, `Continuity Transition`, `Camera`, `Lighting`, and `Sound Design` so they are detailed enough for direct video generation. Separate-audio prompts must omit `Sound Design` from prompt blocks and use the top-level `SOUND BED BRIEF` instead. Keep `News Beat Goal` in the shared beat plan, not inside provider prompt blocks.
- In news_narration mode, use the same presenter identity, outfit, desk/studio, visual-wall style, camera language, and lighting across every prompt.
- In one-presenter news_narration, keep the presenter visible in every prompt as foreground, over-shoulder view, side profile, reflection, or partial silhouette. Do not make full-screen UI/chart-only clips unless the user explicitly requests B-roll without the presenter.
- In news_narration mode, use the same subtle sound bed across the whole sequence. For native audio, express it as `Sound Design` inside each prompt. For separate audio, express it only in the top-level `SOUND BED BRIEF`; video prompt blocks must stay visual-only.
- In news_narration mode, every prompt duration label must be exactly {storyboardClipDurationSeconds} seconds.
- In news_narration mode, avoid `SCENE N:` headings before `PROMPT 1` because Media Studio splits multi-video text on prompt markers. If you include a beat plan, use `Beat 1 -` wording and do not use PROMPT/SCENE/SHOT/CLIP markers inside the plan.
- Use `veo3_lite` as the default resolved model unless {veoModel} specifies Fast or Quality.
- If {veoModel} is `__selected_media_studio_veo_model__`, use {veoProviderModel} as the resolved provider model. Future Veo provider IDs beginning with `veo` or containing a delimited Veo family name such as `google-veo-4-fast` are valid for prompt packaging.
- If generationType is REFERENCE_2_VIDEO, the resolved model MUST be a Fast Veo model. For Veo 3.1 use `veo3_fast`; for future Veo versions use the selected Fast provider model if it is clearly a Fast variant. If another model was selected, correct it in the top-level settings section.
- If generationType is TEXT_2_VIDEO, do not require provider image inputs. If real `reference_images` are attached, use @ImageN as vision-analysis guidance in shared notes and concrete visual directions, but keep each prompt self-contained and do not imply Kie will receive imageUrls.
- If generationType is FIRST_AND_LAST_FRAMES_2_VIDEO, explicitly state that `@Image1` is the Start frame and `@Image2` is the End frame when provided, and describe a smooth visual transition from the start frame to the end-frame target.
- If generationType is REFERENCE_2_VIDEO, explicitly state that 1-3 dragged images are used as visual reference assets. Use `@Image1`, `@Image2`, and `@Image3` only as identity/style/product/setting/composition references, not as start/end frames. In REFERENCE NOTES, each relevant handle must say `used as a reference asset` and `not as a start frame`.
- Output quality must remain one of 720p, 1080p, or 4K; aspect ratio must remain auto, 16:9, or 9:16. For REFERENCE_2_VIDEO, use explicit 16:9 or 9:16 and never leave aspect ratio as auto.
- Treat 4K as an output quality/upgrade target. Keep the prompt 4K-ready and state `Output Quality: 4K` only in the top-level settings section; the generation system may create a post-generation 4K upgrade task when required by the provider.
- Do not include provider-control metadata inside prompt blocks. Never include lines beginning with `Veo Settings:`, `Reference Image Role:`, `Dialogue Budget:`, `News Beat Goal:`, `Model:`, `Generation Type:`, `Output Quality:`, `Aspect Ratio:`, `Enable Translation:`, or `Enable Fallback:` in a generation prompt. Media Studio sends those values as payload fields.
- Ensure camera + lighting + environment are consistent across scenes unless story requires change.
- Preserve the same character, scene, and reference-image anchors across every prompt.
- Keep the spoken dialogue short enough to fit naturally inside {sceneDuration} seconds at a natural speaking pace; use only about 60-75% of the clip time for speech and leave the rest for reaction and motion.
- For news_narration, do not stretch short dialogue to fill the clip. Keep the spoken phrase short, then use presenter reaction, gestures, and background visual motion for the remaining time.
- For short scenes, especially 4-8 seconds, prefer one short sentence or one short clause. Avoid long monologues or multi-part sentences that would force rushed lip-sync.
- Calculate the speech budget internally for each scene: target roughly 65-70% of {sceneDuration}, rounded into a readable budget label for planning only.
- Prefer numeric speech budgets in 0.5-second increments, e.g. "~4.5 seconds max", "~5.0 seconds max", or "~6.5 seconds max".
- Recommended budget mapping:
  - 4-5 seconds: "Dialogue Budget: 1 short clause, ~3-4 seconds max"
  - 6-7 seconds: "Dialogue Budget: 1 short sentence, ~4-5 seconds max"
  - 8-10 seconds: "Dialogue Budget: 1 short sentence, ~5-6 seconds max"
  - 11+ seconds: "Dialogue Budget: 1 short sentence + brief reaction beat, ~7-8 seconds max"
- Language examples:
  - English: "Dialogue Budget: ~5.5 seconds max"
  - Thai: "Dialogue Budget: ~5.5 วินาที max"
  - Mixed: "Dialogue Budget: ~5.5 seconds max / ~5.5 วินาที max"
- If reference images are character references, preserve the same face, hairstyle, body shape, outfit colors, accessories, pose language, and signature props across every prompt.
- If reference images are character references in contentMode=`storyboard`, carry the same @Image handle and character traits through the whole storyboard whenever that character appears; do not redesign the character between beats.
- If reference images are object, product, or prop references, preserve their shape, color, material, markings, and distinctive details across every prompt.
- If reference images are scene or location references, preserve their composition, perspective, layout, and lighting mood across every prompt.
- In news_narration, choose the role that best supports the segment: person images can anchor the presenter or visual-wall subject; product/object images become text-free props or visual-wall material; scene images define studio/B-roll look; animal/prop images recur only when useful and not distracting. These attached images must be declared as reference assets, not start frames, unless generationType is FIRST_AND_LAST_FRAMES_2_VIDEO.
- Before finalizing, run a hidden QA pass: prompt count matches the timing contract, every prompt has a continuity lock, no unintended recurring prop/reference appears in every prompt, no readable text/logos/numbers/contact info remain, separate-audio prompt blocks contain no audio/dialogue/sound instructions, every one-presenter news prompt keeps the presenter visible, and every prompt has a distinct visual beat.
- If reference notes are empty, infer a concise visual reference bible from the storyboard and reference images, then place it in a top-level "REFERENCE NOTES" paragraph and repeat it verbatim in every prompt block.
- If reference images also contain readable text, preserve it only when the user explicitly wants that text retained.
- Ensure background in every prompt strictly matches backgroundMode ({backgroundMode}).
- If product exists, include it in late scenes (e.g., sceneCount-1, sceneCount) with natural integration.
