# Feature 138 — Source request (2026-07-23)

User report (Thai, same session as Feature 137's brief), with 3 sample images
of 3 CONSECUTIVE shots from one scene (rooftop: woman in apron watching from a
doorway while a man talks with a woman in a navy suit):

> อีกปัญหาที่พบ คือการสร้างภาพเราแนบภาพฉากลงไปด้วยก็จริง แต่พอเป็นซีนต่อเนื่อง
> ระบบก็จะสร้างภาพออกมาเป็นคนละมุมกันจากฉากเดียวกัน และฉากไม่ได้ครอบคลุมถึง
> รายละเอียดของบทครบถ้วนอยู่แล้วเป็นปกติ ทำให้ซีนต่อกันแต่ภาพต่างกันคนละที่
> อันนี้ตัวอย่างภาพ 3 ช็อตต่อเนื่องกัน

Interpretation: the location reference image IS attached during start-frame
generation, but (a) consecutive same-scene shots come out as unrelated camera
angles whose surroundings don't match, and (b) a single location image never
covers every detail the script needs, so each shot INVENTS the uncovered
parts differently — consecutive shots look like different places.

## Observed drift classes in the 3 samples

1. Lighting / time-of-day: golden-hour low sun → warm afternoon → bright
   midday blue sky, across three consecutive shots of one continuous beat.
2. Set geometry: rusty water tank / ladder placement, door and wall
   materials, and the city-skyline background change per shot.
3. Wardrobe: the observing woman wears a long apron dress in shots 1–2 and a
   short beige dress in shot 3.
4. Staging / axis: relative positions of the three characters vs the doorway
   and roof edge shift between shots.
5. Prop persistence: a brown envelope on the concrete ledge exists only in
   shot 2 (if it is a scripted prop it must persist; if not, it must not
   appear).

This is the SCENE/ENVIRONMENT sibling of Feature 137's face-identity problem:
137 = the character must stay the same person across a clip; 138 = the WORLD
must stay the same place across a scene's shots.
