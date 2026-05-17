# Batch v12 Automated Test Report

Date: 2026-05-16

OVERALL: PASS

## Cases

PASS 01 hair_color_cream
PASS 02 bath_bomb
PASS 03 coconut_oil_serum
PASS 04 glutathione_aha_soap
PASS 05 orthodontic_wax
PASS 06 deodorant_spray
PASS 07 whitening_toothpaste
PASS 08 body_whitening_lotion
PASS 09 makeup_puff
PASS 10 portable_urine_bag
PASS 11 face_mask
PASS 12 anti_hairloss_shampoo
PASS 13 face_sunscreen
PASS 14 body_sunscreen
PASS 15 facial_cleanser

## Automated Checks

PASS plain_text_not_json
PASS thai_language_present
PASS speaker_labels_present
PASS audio_tags_present
PASS first_line_hook_short
PASS duration_estimate_under_55s
PASS marketplace_noise_removed
PASS temporary_promo_removed
PASS risky_whitening_claims_rewritten
PASS acne_hairloss_medical_claims_removed
PASS dental_orthodontic_warning_present
PASS sunscreen_reapply_notice_present
PASS patch_test_notice_present_when_needed
PASS portable_urine_bag_hygiene_caution_present
PASS no_brand_or_competitor_endorsement


## v12 No Meta-Compliance Dialogue Regression

PASS: no output lines contain “ไม่ควรนำคำเคลม”
PASS: no output lines contain “ไม่ควรใช้คำว่า”
PASS: no output lines contain “ไม่ควรเคลมว่า”
PASS: no output lines contain “ห้ามใช้คำว่า”
PASS: no output lines contain English compliance phrases such as “do not mention”, “avoid claiming”, “risky claim”, or “banned claim”
PASS: risky claims are silently rewritten into consumer-facing, natural ad benefits
