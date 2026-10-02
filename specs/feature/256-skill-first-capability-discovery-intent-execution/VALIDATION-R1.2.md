# R1.2 static validation report

The R1.2 reference suite tests proposed JSON Schema draft 2020-12 shapes/fixtures, 34 inherited reference/packaging checks, six strict schemas plus security negatives for intent mode, effect budget, admission/checkpoint, agent delegation and Film media pass metadata. It does **not** test deployed APIs or model outputs. See the actual result summary reported after pack generation; no runtime claim is made here.

**Not verified:** canonical Spec 256 allocation, owner schema-fit, live tenants, actual entitlement, MCP host/client, provider billable attempt, ComfyUI/Runner media or mobile UI integration. G0–G7 remain mandatory.

**Final local static test execution:** `python -m unittest discover -s tests -v` -> **68 tests passed**; these are offline tests over packaged schemas, fixtures and illustrative pure-reference guards only.
