# MiniMax H3 Reference Routing Matrix

| Inputs / requirement | Preferred route | Important note |
|---|---|---|
| Text only | T2VA | Concrete ratio required |
| Start Frame only | I2VA | Hard State #0 |
| End Frame only | L2VA | Hard ending |
| Start + End | FL2VA | Prefer continuous shot unless storyboard says otherwise |
| Product/person images | Ref2VA | Up to 9 images |
| Motion/camera videos | Ref2VA | Up to 3 videos, total <=15s |
| Voice/music/audio refs | Ref2VA | Up to 3 audio clips, total <=15s |
| Image + video + audio | Ref2VA | Full multimodal route |
| Hard Start + product image | Prebake/derive or Ref2VA soft-start | Cannot mix raw provider modes |
| Hard Start + motion video | Hard I2VA + motion descriptor, Ref2VA soft-start, or split | Choose exact frame vs raw motion |
| Hard Start + voice audio | Split/external voice, or Ref2VA soft-start | Exact raw voice + hard first frame cannot share one hosted H3 request |
| Exact product label/UI | Clean plate + post composite | Protect exactness |
| 4–15s multi-shot | Native H3 multi-shot or independent clips | `[Shot N] At timestamp` |
| >15s normal review/ad | Independent H3 clips | Best repairability |
| >15s continuous scene | Ref2VA continuation chain | New segments + external assembly |
| 2K production | 768P → QC → Regenerate-2K | Avoid 2K rejected drafts |
| Local image/video/audio refs | H3-Base Ref2VA Worker | SGLang/vLLM/Diffusers/ComfyUI |
| Fast no-Ref2VA draft | H3-Max | No Ref2VA / no 2K |
