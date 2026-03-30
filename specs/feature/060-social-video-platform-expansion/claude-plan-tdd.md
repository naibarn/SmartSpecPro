# Social Video Platform Expansion TDD Plan

## 1. Test Strategy

This feature should be implemented with tests first for the provider contracts and background entry points.

## 2. Test Layers

### 2.1 TypeScript

1. registry discovery tests for provider catalog
2. internal route tests for provider-aware background execution
3. agency router tests for `builtin-social-actions`
4. serialization / payload mapping tests for workflow dispatch

### 2.2 Python

1. adapter unit tests for TikTok and YouTube provider validation
2. API bridge tests for `tenantId` injection
3. job state tests for publish / draft / schedule / cancel
4. Shorts classification tests

## 3. Core TDD Scenarios

### 3.1 Registry

1. fail when an unknown provider is requested
2. return capabilities for registered providers
3. expose planned scaffolds separately from live providers

### 3.2 TikTok

1. reject unaudited public publish attempts
2. reject invalid media formats and over-limit assets
3. require creator-info preflight before publish
4. support draft upload and direct post paths

### 3.3 YouTube

1. allow upload via `videos.insert`
2. allow scheduled publish with `publishAt`
3. classify Shorts candidates correctly
4. fail predictably for unsupported privacy / audit states

### 3.4 Background Dispatch

1. route through `builtin-social-actions`
2. preserve tenant isolation
3. map freeform query text into provider action payloads when appropriate
4. keep provider errors structured and diagnosable

## 4. Exit Criteria

1. All provider-specific tests pass.
2. Background integration works from the agency bridge.
3. Shorts classification is deterministic.
4. The implementation remains additive to the existing Meta social stack.

