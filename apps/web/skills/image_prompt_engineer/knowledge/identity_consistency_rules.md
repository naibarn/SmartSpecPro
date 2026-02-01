# **IdentityConsistencyRules.md**

## 🔒 **IDENTITY CONSISTENCY RULES — System-Level Specification**
**Purpose:** Ensure all generated images preserve the same person’s identity with high morphological fidelity.

---

# ## **1. Landmark-Level Identity Preservation (CRITICAL)**
When generating images using a reference face, the model must preserve all *non‑changing anatomical landmarks*. The following must match the reference image precisely:

### **1.1 Facial Structure**
- Overall face shape (V-line, round, heart-shaped, etc.)
- Jawline contour and angle
- Cheekbone height and prominence
- Chin shape and point

### **1.2 Eyes**
- Exact eye shape & corner angle
- Eyelid fold pattern
- Iris size relative to sclera
- Brow-to-eye distance

### **1.3 Nose**
- Nose bridge width
- Nose tip shape
- Nostril size & contour
- Nose angle (projection)

### **1.4 Mouth**
- Lip thickness ratio (upper:lower)
- Cupid’s bow curvature
- Mouth width
- Natural asymmetry (if any)

### **1.5 Eyebrows**
- Shape, arch height, thickness
- Spacing between brows
- Distance to eyes

### **1.6 Ears & Hairline**
- Ear shape & angle
- Hairline curvature & density pattern

These features must remain *consistent and recognizable* as the same person across all generated images.

---

# ## **2. Stable Identity Features (NEVER CHANGE)**
The following identity traits are stable and must never be altered:
- Bone structure
- Ratios between facial features
- Eye-to-eye, eye-to-nose, eye-to-mouth distances
- Natural asymmetries
- Lip-to-nose proportion
- Volumetric structure of cheeks & jaw

If the model alters any of these, it must regenerate.

---

# ## **3. Allowed Variations (SAFE)**
Changes that DO NOT break identity:
- Hairstyles
- Makeup styles
- Clothing
- Scene, environment, background
- Lighting style
- Expressions (as long as morphology stays consistent)
- Camera angle & focal length changes

Identity is based on **structure**, not surface style.

---

# ## **4. Identity Verification Step**
Before finalizing an image, the system must internally verify:
1. Do all landmark ratios match the reference?
2. Would an ordinary viewer instantly recognize them as the same person?
3. Has the model unintentionally redesigned facial geometry?
4. Are morphological features preserved under new lighting/makeup?

If any answer is **No**, regenerate the output.

---

# ## **5. Multi-Image Identity Fusion**
When multiple reference images are provided:
- **Image 1 = primary identity anchor** (all facial geometry must come from this image)
- Additional images may contribute:
  - Lighting
  - Textures
  - Outfits
  - Backgrounds
  - Poses
- Facial structure MUST NOT be influenced by secondary images.

---

# ## **6. Forbidden Model Behaviors (NEVER ALLOW)**
The model must not:
- Replace or redesign facial features
- Beautify in a way that alters bone structure
- Change ethnicity or mix features from other sources
- Over-smooth skin to the point of morphology loss
- Modify ratios of eyes, nose, lips, or jaw
- Produce a face that could reasonably appear as a different person

Identity consistency is strict.

---

# ## **7. Identity Preservation Guidelines (English + Thai)**
### **EN:**
Identity must be preserved using morphological consistency, not stylistic similarity. The generated face must keep the exact landmark geometry of the reference.

### **TH:**
The generated face must preserve the "actual structural form" of the person in the reference image — not merely a similar feeling or style. All landmarks must be maintained, such as eyes, nose, mouth, chin, and all proportions must match the original.

---

# ## **8. Summary (for system enforcement)**
- Identity is defined by *landmarks & ratios*, not pixels.
- Preserve all stable morphology.
- Only allow stylistic changes that do not modify bone structure.
- Always check identity before finalizing.
- Regenerate if identity drift occurs.

---

# **END OF IdentityConsistencyRules.md**

