# TDD plan

1. Shared contract tests:
   - new model predicate accepts old internal ID, new internal ID, and exact Kie ID;
   - valid prompt-only, multimodal, and first/last-frame inputs normalize correctly;
   - missing last frame, last without first, mixed frame/reference, unsafe URL, quota overflow, and invalid resolution fail closed.
2. Registry parity tests:
   - both catalogs expose the new row as video/Kie/market;
   - new row has exact provider ID and new resolution set; old row stays unchanged;
   - seed definition contains the same provider ID and field contract.
3. Provider tests:
   - `generate_video(..., api_config={kie_model_id: ...})` calls `create_task` with exact provider model;
   - image/video/asset fields and first/last-frame fields have the documented shape;
   - async return and existing polling path remain unchanged.
4. Router/client tests:
   - preflight and retry recognize both internal IDs;
   - invalid mixed references are rejected before generation.
5. Red-green sequence: add assertions first and run the narrow tests to establish absence/failure, implement the smallest contract changes, rerun focused tests, then run affected typecheck/format/diff gates.
