# Version History

## v2.2 (January 24, 2026) - Reality Check 🎯

### 🆕 New Features
- ✅ **Reality Check** — Validates consistency with real-world constraints
  - Location-based validation
  - Time-based validation  
  - Physics validation (underwater, gravity)
  - Clothing-weather consistency
  - Auto-correction of unrealistic elements
  - Realism score (0-100)
  - Detailed warnings

### 📊 Coverage
- 20+ incompatibility rules
- 15+ auto-correction patterns
- 5 main categories
- 5 locations (indoor, shopping mall, underwater, beach, etc.)

### Example
```
Input: "wind-swept hair in shopping mall"
Output: "slightly tousled hair in shopping mall" + Warning
Realism Score: 85/100
```

---

## v2.1 (January 24, 2026) - Hallucination Control

### 🆕 New Features
- ✅ **Hallucination Control** — Prevents adding unspecified nationality/ethnicity
- ✅ Thai language support (Korean fashion, Korean style, etc.)
- ✅ Auto-correction when hallucination detected
- ✅ Warnings in output

---

## v2.0 (January 24, 2026) - Major Update

### 🆕 New Features
- ✅ Generation Mode Selection (text-to-image, img2img, inpaint, outpaint, variation)
- ✅ Text-based Inpainting with prompt-based masking
- ✅ Outpainting Configuration (expand in 4 directions)
- ✅ Advanced Parameters (denoising, CFG, steps, seed, sampler)
- ✅ ControlNet Support (7 types)
- ✅ IP-Adapter Support (3 modes)
- ✅ Platform Selection (7 platforms)
- ✅ Complete default values for all inputs
- ✅ Enhanced validation and error handling

### Capability Improvements
| Feature | v1.0 | v2.0 |
|---------|------|------|
| Text-to-Image | 9/10 | 9.5/10 |
| Image-to-Image | 6/10 | 9/10 |
| Inpainting | 3/10 | 9/10 |
| Outpainting | 0/10 | 9/10 |
| **Overall** | 7/10 | 9.5/10 |

---

## v1.0 - Initial Release

### Features
- Basic text-to-image prompt generation
- Style catalog (151+ styles)
- VFX effects (50+ effects)
- Realistic skin preservation
- Identity consistency
- Aspect ratio support
