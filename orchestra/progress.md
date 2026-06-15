# Progress
- Investigating latest HyperFrames Final Composite output where job completes but the 48s MP4 is black/text-only.
- SocratiCode status green; narrowed to HyperFrames composition builder/runtime adapter and focused tests.
- Real DB job evidence for `hf_hf_bc722b91`: official HyperFrames CLI was called, six source MP4 URLs were present, but the stored output was only ~186 KB for 48s and the old composition lacked the new direct timed video contract.
- Root cause confirmed: the completed black/text-only job used old HTML (`hf_515dd361`) with source videos as non-scene `.clip source-video` elements and overlay visibility driven by custom `.is-active` JS. HyperFrames CLI did run, but the final capture/assembly path did not treat those MP4s/shot overlays as first-class timed scene clips.
- Implemented v6 composition builder: source MP4s are direct timed `class="clip scene source-video"` elements with `data-hf-auto-start`; overlay sections are direct timed `class="clip shot ..."` elements and visible to the official HyperFrames timeline instead of relying on custom preview-only activation.
- Real CLI replay against the same six job source MP4s passed: `/tmp/ssp-hf-v6-replay-LgePbS/output.mp4`, 48s, 1080x1920, 30fps, 72,211,142 bytes; extracted frame 1s and 10s both show source MP4 footage plus overlay/subtitle.
- Verification passed: focused Vitest 39/39, `npm run check`, and `npm run build`.
