# Product Coverage & Boundaries — v5

## Coverage model

v5 no longer relies on a closed category list. It uses two layers:
1. **Product families** for common planning patterns.
2. **Composable behavior primitives** (dispense, apply, rotate, heat, cool, filter, charge, display, measure, connect, etc.) for products that do not fit a known family.

This lets an unknown product be described as a combination of: `actor action → product state change → mechanism domain → target surface/system → observable proof → explanatory visualization`.

## High-coverage families

- personal care / cosmetics / hair / oral hygiene
- household and surface cleaners
- laundry consumables
- washing machines / dishwashers / vacuums / robot cleaners
- air conditioners / fans / heaters / purifiers / dehumidifiers
- kitchen appliances and beverage-preparation machines
- water filtration / pumps / faucets / fluid systems
- smartphones / tablets / laptops / cameras / smartwatches
- audio/video products, TVs, speakers, headphones, projectors
- smart-home / security / sensors / locks / cameras
- power banks / chargers / batteries / energy products
- lighting / electrical products
- software / apps / SaaS / digital services
- tools / workshop / garden / machinery
- furniture / mattresses / storage / home living
- fashion / shoes / bags / wearables / accessories
- jewelry / watches
- food / beverage / ingredients
- baby / parenting products
- pet products
- toys / family play products
- sports / fitness products
- outdoor / garden products
- construction materials / adhesives / sealants / paint
- vehicles and automotive accessories
- office / stationery / printers / organizers
- industrial / B2B equipment

## Conditional / limited families

### Regulated healthcare / medical / wellness
Architecture supports demonstration and UI/mechanism planning, but exact medical claims, contraindications, clinical efficacy and safety instructions require verified source material and human/compliance approval.

### Hazardous chemicals / high-risk machinery
The Skill can plan a truthful commercial, but must not infer handling or safety procedures. Use official instructions and human approval.

### Microscopic / scientific mechanisms
Use a schematic explanatory visualization unless exact mechanism/geometry is verified. Do not present an invented molecular/cross-section animation as literal truth.

## Persistent generative limitations

Even with good planning, video models may still drift on:
- exact labels, tiny text and UI;
- hands and object contact;
- transparent/reflective surfaces;
- liquids, foam, particles and complex cloth;
- long unbroken choreography;
- exact internal geometry;
- multi-speaker lip sync;
- product geometry after repeated extensions.

Production mitigation: split shots, use keyframes, route models, composite exact graphics/UI/labels in post, and run per-shot/per-seam QC.
