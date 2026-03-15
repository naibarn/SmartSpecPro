## TDD Order

1. backend test สำหรับ header/footer disabled case
2. state/editor tests สำหรับ autofit component และ raw fallback node selection
3. catalog/layout tests สำหรับ A4 block family ใหม่
4. AI routing/layout tests สำหรับ A4 auto-fit insert path

## Initial Failure Expectations

- header/footer test fail เพราะ override path ยังเปิด chrome กลับมา
- editor raw node tests fail เพราะ fallback clicks ยังถูก reroute เป็น component selection
- A4 fit tests fail เพราะยังไม่มี helper/toolbar path
- block family tests fail เพราะ variant ใหม่ยังไม่มี
