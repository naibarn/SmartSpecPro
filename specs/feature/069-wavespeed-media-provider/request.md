# Request Brief

Original request:

- research the codebase and plan the next feature spec under `specs/feature`
- add UI support in Media Provider for WaveSpeedAI using the official API docs
- add Media Model support for Seedance 2.0 using the WaveSpeed blog/model guidance
- explicitly support the WaveSpeed model page `wavespeed-ai/cinematic-video-generator`

Assumptions inferred from the repository:

- the canonical provider key should follow existing snake_case conventions and use `wavespeed_ai`
- the canonical Seedance model id should follow the WaveSpeed model page and use `wavespeed-ai/cinematic-video-generator`
- the first rollout should cover the provider plus one video model, not the full WaveSpeed catalog
- the provider should be seeded disabled by default, like the other optional media providers
- pricing should use the existing `1 USD = 1000 credits` convention already used by the media seed scripts
- connection testing should use a read-only endpoint from the WaveSpeed API instead of spending generation credits

Unresolved product questions:

- none that block the planning work
