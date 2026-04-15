# SKILL.md

## Skill Name
Unified Slip Parser (Thailand) - Complete

## Purpose
One skill that:
- auto detects issuer (bank / wallet / gov app)
- routes to issuer-specific parsers
- falls back to generic parsers when no specific parser matches strongly

## Supported Issuers
- Banks: KTB, BAY, SCB, TTB
- Wallets: TrueMoney
- Gov/App: Paotang
- Generic fallback for unknown bank/wallet/app slips

## Core Flow
input -> detect issuer -> detect transaction type -> choose parser -> extract fields -> normalize output

## Generic Fallback
This package includes:
- generic parser
- generic bank parser
- generic wallet parser
- generic gov-app parser

## Notes
Image-only issuer detection is heuristic-based unless OCR/vision text is available.
Field extraction is strongest when OCR text exists.