# Section 01: Chat Selection Contract and Picker UX

## Purpose

Define how the chat UI expresses:

- explicit model selection
- global auto
- provider-auto

without breaking the current picker flow.

## Ownership

- `ModelPicker`
- `ChatView`
- client-side selection normalization

## Target files

- `apps/web/client/src/components/agency/ModelPicker.tsx`
- `apps/web/client/src/components/chat/ChatView.tsx`

## Implementation notes

### Picker modes

The picker must expose:

- `Auto (best overall)`
- `Kie AI - Auto Model`
- `OpenRouter - Auto Model`
- explicit models grouped by provider

### Availability rule

Show provider-auto only when:

- provider is enabled
- provider has at least one enabled mapped model

### Contract rule

The client should normalize picker state into a structured `modelSelection` contract before sending requests.

### Backward compatibility

- keep explicit `model` behavior for legacy clients
- use structured `modelSelection` for new chat clients

### UX rule

The UI should show the resolved model in a subtle way after auto selection.

## Acceptance checks

- specific model selection still works
- provider-auto is selectable independently from global auto
- picker does not show dead provider-auto entries for disabled/empty providers
