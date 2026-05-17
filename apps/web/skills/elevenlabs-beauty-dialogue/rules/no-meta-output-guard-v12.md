# No Meta Output Guard v12

Final output must be usable as spoken ad dialogue immediately. It must not include moderation notes, compliance reasoning, banned-word lists, or phrases that tell the audience which claims were removed.

## Blocked meta phrases

Thai examples:
- ไม่ควรนำคำเคลม
- ไม่ควรใช้คำว่า
- ไม่ควรเคลมว่า
- ห้ามใช้คำว่า
- คำเคลมเสี่ยง
- ในบทโฆษณา
- ในบทพูด
- ถูกตัดออก
- ระบบตรวจพบ

English examples:
- do not mention
- avoid claiming
- risky claim
- banned claim
- compliance
- policy
- removed from the script
- should not be used in the ad

## Replacement behavior

1. Silently remove risky unsupported claims.
2. Replace with safe, product-specific, natural benefits.
3. Keep the tone friendly and ad-ready.
4. Add only consumer-facing cautions when useful, e.g. patch test, follow label, results vary, consult a professional for persistent issues.
