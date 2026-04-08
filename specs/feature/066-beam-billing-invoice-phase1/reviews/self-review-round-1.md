# Plan Self-Review — Round 1

## Summary

The first deep-plan draft still needed clearer module placement, auth strategy, and migration stance around `invoice_config`.

## Fixes applied

- clarified tRPC vs Express webhook boundary
- clarified capability-style billing authorization
- clarified that `invoice_config` remains legacy context, not the new billing model
- clarified secure document access via existing storage abstraction
