# Research Notes

## Discovery method

SocratiCode MCP ไม่ได้ถูกเปิดใช้งานใน runtime นี้ จึงใช้ targeted `rg`, `sed`,
package inspection และ existing tests แทนการค้นทั้ง repositoryแบบกว้าง ๆ

## Current codebase evidence

- `specs/feature/143-video-studio-layer-timeline-editor/spec.md` ระบุว่า Feature
  143 P0-P3 เสร็จแล้ว และ P4 transitions ถูกแยกไว้ต่างหาก
- `apps/web/shared/videoIntelligence/motionTemplates.ts` มี template ids 10 แบบ
  และกำหนด `kind: "layer_pack"` เพียงชนิดเดียว
- `apps/web/server/remotion/templates/index.ts` มี registry สำหรับ builder แบบ pure
  ที่คืน `RemotionLayer[]`; `videoProjectMotionDirector.ts` ใช้ registry นี้ตรวจสอบ
  motion candidates ก่อน persist
- `packages/remotion-render/src/layerTemplateSchemas.ts` และ
  `apps/web/shared/remotion/layerTemplateSchemas.ts` เป็น schema ที่ทำซ้ำกันแบบ
  byte-sensitive และมี contract/version/fixture implications เมื่อเพิ่ม layer type
- renderer รองรับ `image`, `video`, `text`, `svg`, `motionGraphic`, `scene3d`, `audio`
  ใน `packages/remotion-render/src/GenericTemplateComposition.tsx`
- `scene3d` ใช้ closed registry จาก `sceneRegistryIds.ts` และ `@remotion/three`; ตอนนี้
  มี `orbiting-product` เป็นตัวอย่างเดียว
- `videoProjectCompiler.ts` มี `syncVisualMotionToCaptionCues()` ซึ่ง slice visual
  layer ตาม caption cue แต่ปัจจุบันมีเพียง `scene`/`captions` sync และยังไม่มี event
  timeline สำหรับ procedural systems ที่ต้องต่อเนื่องข้าม cue
- `RemotionProjectPreview.tsx` ใช้ Remotion Player และ source composition เดียวกับ
  rendering path หลังการแก้ parity ล่าสุด
- `packages/remotion-render` มี `@remotion/three` อยู่แล้ว แต่ยังไม่มี Skia/canvas
  dependency เฉพาะทาง ดังนั้นแผน MVP จะหลีกเลี่ยง dependency ใหม่จนกว่า benchmark
  จะพิสูจน์ว่าจำเป็น
- Video Studio UI มี `MotionPanel.tsx` ที่แสดง template candidates และยังรองรับ
  manual template params; ต้องเพิ่ม surface สำหรับ procedural presets โดยไม่ทำให้
  user ต้องกรอก JSON เป็นหลัก

## Existing integration contracts

- Scene motion candidates ใช้ `templateId`, `templateParams`, `motion`, `label`,
  `rationale`; การเพิ่ม visual system ควร reuse contract นี้แทนการสร้าง candidate
  model ใหม่
- compiler สร้าง visual layers แล้ว sync กับ caption cues ก่อน offset เป็น absolute
  frames; audio asset และ narration duration อยู่บน `Scene`
- worker input schema ฝัง `RemotionTemplateConfig` แบบ strict และมี
  `platformContractVersion`, `rendererPolicyVersion`, template hash และ segment plan
- render layer budget ปัจจุบัน 40; procedural visual system ต้องเป็น 1 declarative
  layer ที่มีองค์ประกอบภายใน ไม่ใช่ N layers

## Official Remotion research

- Remotion supports React-based programmatic video, reusable templates with props,
  Player preview and server/local rendering: https://www.remotion.dev/
- `useCurrentFrame()` exposes the frame relative to a timed component:
  https://www.remotion.dev/docs/use-current-frame
- `interpolate()` maps frame/time values into opacity, position, scale and other
  output values; `spring()` supplies physics-based timing:
  https://www.remotion.dev/docs/interpolate
  https://www.remotion.dev/docs/spring
- `@remotion/three` integrates React Three Fiber with Remotion and documents the
  server-side Chromium `angle` requirement:
  https://www.remotion.dev/docs/three
- `useAudioData()` can drive audio visualisation, but remote audio must satisfy CORS;
  this makes it appropriate as a secondary audio-reactive input, not the primary
  narration timing source:
  https://www.remotion.dev/docs/use-audio-data

## Implications

1. The smallest safe architecture is to extend the registry and renderer with a
   closed procedural composition contract, not to add dozens of fields to
   `motionGraphic`.
2. The first 2D implementation can use deterministic SVG/HTML or canvas-like drawing
   inside one layer; a performance benchmark must decide whether a canvas primitive
   is required before adding dependencies.
3. The 3D reference should be a new vetted `scene3d` registry entry, with explicit
   server-rendering GL configuration and low-count preview props.
4. Semantic alignment needs a structured beat/event contract from the skill. A raw
   narration string is insufficient to guarantee that a chart, graph or particle
   system represents the intended meaning.
