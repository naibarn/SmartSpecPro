# Section 01: Capability Contracts And Flags

## Objective

Add the minimum shared contract and configuration surface needed to represent
client WebGPU acceleration without changing Feature 125 server capture behavior.

## Scope

- Shared acceleration preference enum.
- Shared acceleration capability report schema.
- Client capability probe helper.
- Tenant/global feature flags.
- Capability projection fields for Storyboard Review.

## Contract

```ts
type StoryboardClientCaptureAccelerationPreference =
  | "none"
  | "webgpu";

type StoryboardClientCaptureAccelerationTier =
  | "none"
  | "webgpu_available"
  | "webgpu_webcodecs_available"
  | "client_draft_capture_available";
```

The first implementation should only submit the preference/report to the server.
It must not start a client draft capture unless the draft upload flag is enabled.

## Tests

- Capability probe returns `none` when `navigator.gpu` is missing.
- Capability probe requires secure context.
- WebCodecs availability changes tier but does not imply final publish support.
- Feature flags are fail-closed by default.
- Invalid preference values are rejected by shared schema.

## Acceptance Criteria

- Server capture remains unchanged when preference is `none`.
- WebGPU fields are optional and backward compatible.
- No high-entropy GPU model/vendor/device identifier is persisted.
