# Request

Fix Grok via Hermes image generation so Vertical Drama character and location
reference images are actually attached to the worker job. Do not silently
continue as text-to-image when required references cannot be resolved.

Constraints:
- Preserve tenant and user ownership checks.
- Do not store expiring reference URLs in worker jobs.
- Do not add a schema migration or dependency.
- Keep non-Hermes media routing unchanged.

