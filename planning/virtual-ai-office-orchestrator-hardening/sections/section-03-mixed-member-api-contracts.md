# Section 03: Mixed-Member API Contracts

## Goal

Ensure all APIs and frontend consumers support `persona`, `human`, and `external_connector` members without assistant-centric assumptions.

## Deliverables

- discriminated union DTOs
- runtime resolution contract
- roster and monitoring response rules

## Required Rules

- no API should rely on missing fields to infer member kind
- every roster response must include `memberKind`
- runtime references must be explicit per member kind
- frontend roster rendering should work from the same union contract
