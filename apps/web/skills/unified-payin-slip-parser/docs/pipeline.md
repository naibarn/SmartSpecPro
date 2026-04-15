# Pipeline

## Stage 1
Normalize input text and gather source hints:
- OCR text
- short caption
- filename
- image path
- optional image color hints

## Stage 2
Issuer detection:
- text keywords
- filename keywords
- reference patterns
- image dominant colors (heuristic)
- generic type hints (wallet / gov app / bank)

## Stage 3
Transaction type detection

## Stage 4
Route to parser:
- exact parser for issuer code
- otherwise generic parser by issuer type
- otherwise GenericSlipParser

## Stage 5
Extract fields:
- payer / payee
- amount / fee
- references
- merchant
- date / datetime

## Stage 6
Normalize final output:
- compatibility.bank_code for banks only
- warnings / missing_fields
- raw input echo