# Section 03 Review Triage

- No user input required; review findings had clear fail-closed resolutions.
- Auto-fixes: block apply on invalid/non-revocation JTI data and unresolved all-family audit state; count user-side pairing records as unresolved; tolerate at most 1 second PTTL observation drift while preserving material expiry/permanence checks.
- The external writer fence remains mandatory because repository checks cannot prove that no writer will run after the final audit.
