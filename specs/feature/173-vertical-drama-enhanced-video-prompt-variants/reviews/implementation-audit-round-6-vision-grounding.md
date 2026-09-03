# Follow-up implementation audit — vision grounding

This follow-up was run after the five required audits because the initial
implementation marked the authoring model as vision-capable while passing only
media metadata to the Agent.

## Finding and fix

AUTO-FIX: the server now resolves and authorizes transient HTTPS media
references for the approved Start frame, Stop frame, and image references.
The isolated bridge passes them to OpenAI Agents SDK as `input_image` items.
The persisted prompt variant and input fingerprint retain only the canonical
Feature 170 bundle (asset IDs, roles, order, revisions, and fingerprints), never
the transient URLs.

## Non-regression check

The Legacy path, its URL resolution, job contract, prompt projection, and credit
behavior were not modified. If Core cannot produce an authorized absolute image
reference, Enhanced must fail its precondition rather than claiming vision was
used.

## Evidence

- OpenAI Agents SDK Runner accepts string or list input items; the image path
  uses `input_image` with `image_url`.
- Focused TypeScript tests: 19 passed.
- Skill runtime regression: 8 checks passed.
- Browser and live-provider image delivery remain unverified release proof.
