# Smart Landscape Designer Knowledge Base V1.1.0

This knowledge base supports prompt-only exterior landscape generation for Thai tropical climates.

## 1. Core design priorities
- Photo-real exterior results
- Strong architectural preservation when a primary reference image is attached
- Climate-appropriate planting for hot, humid, high-rainfall regions
- Clean sight lines to the facade
- Durable, low-maintenance hardscape choices

## 2. Thai tropical planting guidance
Prefer these plant families when `useThaiTropicalPlants` is enabled:
- Palms: foxtail palm, lady palm, areca palm
- Foliage: bird of paradise, heliconia, philodendron, monstera, elephant ear, ginger
- Accent shrubs: croton, ixora, dwarf bamboo, cordyline
- Flowering accents: hibiscus, plumeria, orchids, bromeliads
- Groundcover: mondo grass, dwarf ruellia, liriope, low tropical grasses

Avoid:
- Dense overgrowth that blocks doors, windows, or the main facade
- Temperate plants that perform poorly in tropical heat
- Oversized roots too close to foundations

## 3. Hardscape guidance
Recommended:
- Natural stone pavers
- Textured concrete walkways
- Gravel drains and edge bands
- Timber-look composite details
- Warm landscape lighting
- Permeable surfaces where possible

Avoid:
- Slippery polished finishes in heavy rain zones
- Overly reflective materials that look CGI
- Unrealistic symmetry unless the user explicitly wants it

## 4. Preservation rules
When a primary reference image is attached and preservation is enabled:
- Keep the exact massing
- Keep the roof form
- Keep window placement
- Keep facade proportions
- Keep the same story count
- Keep the same overall footprint

Only change:
- Landscape planting
- Lawn shape
- Walkways and paving
- Water features
- Lighting
- Outdoor furniture
- Atmosphere
- Camera view
- Time of day

## 5. Building condition
- `newly_built`: crisp finishes, fresh paint, clean paving, tidy edges
- `aged`: natural patina, softened wear, mature but controlled planting

## 6. Camera realism
Good prompt phrases:
- eye-level exterior photo
- full-frame DSLR realism
- natural daylight
- realistic depth and lens compression
- physically plausible shadows
- subtle atmospheric perspective

Default camera spec:
- Canon EOS R5, 24-70mm lens, f/8

## 7. Negative prompt baseline
When enabled, prefer a negative prompt similar to:
- avoid 3D render, CGI, SketchUp, CAD, architectural visualization, plastic textures, impossible geometry, oversaturated fake lighting

## 8. Variation strategy
If multiple prompts are requested:
- keep the same core request
- vary composition, planting density, and hardscape emphasis
- keep the architecture consistent when preservation is required
- do not create random unrelated styles

## 9. Prompt writing order
Use this order for best results:
1. scene and camera framing
2. architecture preservation or house context
3. landscape layout
4. planting palette
5. hardscape and lighting
6. material and color edits
7. weather / mood / time of day
8. realism cues
