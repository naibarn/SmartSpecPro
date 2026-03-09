# Cinematic Techniques Reference

Reference document for the VEO Video Creator skill. Contains detailed descriptions of cinematography terms that Veo 3.1 understands.

## Shot Sizes

| Shot | Frame Coverage | Best For | Prompt Keywords |
|------|---------------|----------|-----------------|
| Extreme Wide Shot (EWS) | Entire landscape, subject tiny | Establishing location, scale | "extreme wide shot", "establishing shot" |
| Wide Shot (WS) | Full body + environment | Context, action, dance | "wide shot", "full body in frame" |
| Medium Wide Shot (MWS) | Knee-up | Walking, group blocking | "medium wide shot", "knee-up framing" |
| Medium Shot (MS) | Waist-up | General dialogue, gesture | "medium shot", "waist-up" |
| Medium Close-Up (MCU) | Chest-up | Interviews, hosts, emotion | "medium close-up", "chest-up" |
| Close-Up (CU) | Face fills frame | Emotion, detail, intimacy | "close-up", "face fills frame" |
| Extreme Close-Up (ECU) | Eyes/detail only | Tension, macro detail | "extreme close-up", "macro" |
| Two-Shot | Two people in frame | Interview, conversation | "two-shot", "both speakers in frame" |
| Over-the-Shoulder (OTS) | Behind one person's shoulder | Dialogue perspective | "over-the-shoulder shot" |

## Camera Angles

| Angle | Effect | Prompt Keywords |
|-------|--------|-----------------|
| Eye-Level | Neutral, natural | "eye-level angle" |
| Low Angle | Subject looks powerful, dominant | "low angle, looking up at subject" |
| High Angle | Subject looks vulnerable, small | "high angle, looking down" |
| Bird's Eye | God-like perspective, maps | "bird's eye view", "top-down" |
| Dutch Angle | Unease, tension, disorientation | "dutch angle", "tilted frame" |
| Worm's Eye | Extreme low, dramatic | "worm's eye view", "ground level up" |

## Camera Movements

| Movement | Description | Prompt Keywords |
|----------|-------------|-----------------|
| Static | No movement, tripod | "static shot", "locked-off camera" |
| Pan | Horizontal rotation | "camera pans left/right" |
| Tilt | Vertical rotation | "camera tilts up/down" |
| Dolly | Camera moves toward/away | "dolly in slowly", "dolly out to reveal" |
| Truck | Camera moves sideways | "truck left/right", "lateral movement" |
| Pedestal | Camera moves up/down vertically | "pedestal up/down" |
| Zoom | Lens zoom in/out | "slow zoom in", "zoom out to reveal" |
| Crane | Sweeping vertical arc | "crane shot rising", "crane descending" |
| Aerial/Drone | Flight-path movement | "aerial drone shot", "slow forward glide" |
| Handheld | Slight shake, organic | "handheld camera", "shaky cam" |
| Whip Pan | Extremely fast pan | "whip pan to the right" |
| Arc Shot | Camera circles subject | "arc shot orbiting subject" |
| Tracking | Camera follows subject | "tracking shot following subject" |
| Rack Focus | Focus shifts between planes | "rack focus from foreground to background" |
| Dolly Zoom | Zoom + dolly (vertigo effect) | "dolly zoom", "vertigo effect" |

## Lighting Styles

| Style | Description | Prompt Keywords |
|-------|-------------|-----------------|
| 3-Point | Key + fill + back light | "clean 3-point lighting" |
| Rembrandt | Triangle shadow on cheek | "rembrandt lighting, dramatic shadow" |
| Rim/Back | Edge light for separation | "rim light", "backlight silhouette edge" |
| Natural | Available light, window | "natural window light", "available light" |
| Golden Hour | Warm sunset tones | "golden hour, warm orange light" |
| Blue Hour | Cool twilight | "blue hour, cool twilight tones" |
| Neon | Colored artificial light | "neon signs reflecting", "colored light" |
| Film Noir | Hard shadows, venetian blinds | "film noir lighting, hard shadows" |
| High-Key | Bright, minimal shadows | "high-key lighting, bright and even" |
| Low-Key | Dark, dramatic shadows | "low-key lighting, deep shadows" |
| Silhouette | Subject as dark outline | "backlit silhouette" |
| Volumetric | God rays, fog, atmosphere | "volumetric light, god rays through fog" |
| Practical | In-scene sources (lamps, etc.) | "practical lighting from table lamp" |
| Chiaroscuro | Extreme light/dark contrast | "chiaroscuro, dramatic contrast" |

## Depth of Field

| DOF Type | Effect | Prompt Keywords |
|----------|--------|-----------------|
| Deep Focus | Everything sharp front-to-back | "deep focus", "everything in focus" |
| Shallow DOF | Subject sharp, background soft blur | "shallow depth of field", "soft background bokeh" |
| Ultra-Shallow | Extreme bokeh, dreamy separation | "ultra-shallow depth of field", "extreme bokeh" |
| Rack Focus | Focus shifts between planes during shot | "rack focus from foreground to background" |
| Split Diopter | Two planes in focus, middle blurred | "split diopter effect" |

## Color & Mood Palettes

| Mood | Color Palette | Keywords |
|------|--------------|----------|
| Warm/Inviting | Orange, amber, cream | "warm tones, amber palette" |
| Cool/Professional | Blue, gray, white | "cool blue tones, clean" |
| Dramatic | Deep red, black, gold | "dramatic palette, deep shadows" |
| Serene | Soft blue, green, white | "soft pastel tones, peaceful" |
| Energetic | Vibrant primary colors | "vibrant saturated colors" |
| Mysterious | Purple, dark blue, gray | "moody dark tones, atmospheric" |
| Vintage | Desaturated, sepia | "desaturated, film grain, vintage" |
| Futuristic | Cyan, blue, white | "futuristic blue-cyan palette" |
| Noir | Black, white, gray | "monochromatic, high contrast" |

## Composition Rules

### Rule of Thirds
- Divide frame into 3x3 grid
- Place subjects at grid intersections
- "subject on left third, eyes on upper third, lead room to the right"

### Leading Lines
- Use environment lines to guide viewer's eye
- Roads, railings, architecture, light beams

### Depth Layers
- Include foreground, midground, background elements
- "foreground flowers frame the subject, city skyline in background"

### Headroom & Lead Room
- Leave space above head (headroom)
- Leave space in direction of gaze/movement (lead room)

## Multi-Speaker Blocking

### 2 Speakers
- Two-shot: Both in frame, rack focus between
- OTS: Over shoulder of listener
- Shot-reverse-shot: Alternate between speakers (separate clips)

### 3 Speakers
- Medium wide: All three visible with clear positions
- "A stands near whiteboard, B and C seated at table"

### 4+ Speakers
- Split into 2 clips (recommended)
- Or use medium wide with clear spatial arrangement
- "Dad left, Mom right, Teen center-left, Child center-right"

## Thai Audio Considerations

- Use `says (Thai, [tone]):` format for Thai dialogue
- Veo generates Thai speech from natural language cues
- Keep dialogue short: 1-2 sentences per speaker per 8s clip
- Tone descriptors that work well: warm, calm, energetic, serious, cheerful, professional
- For voiceover: "Voiceover (Thai, calm documentary tone): บทบรรยาย..."
