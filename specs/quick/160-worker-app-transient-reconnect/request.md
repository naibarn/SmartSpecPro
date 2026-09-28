# Request

ปรับปรุง Worker App ให้ timeout จาก server restart/network เป็น transient
connection state, retry อัตโนมัติรวม 2 นาที และกลับมาใช้งานต่อได้โดยไม่ต้องกด
Reconnect เอง ยกเว้น server ยืนยัน credential/device invalid หรือ unavailable
นานเกิน budget

## Assumptions

- Existing Worker App 0.1.185 source is the implementation target.
- The existing server refresh-token reuse grace window remains the protocol
  safety net for a timed-out rotation.
- No database migration, auth contract change, deployment, or service restart is
  required for this behavior change.

## Non-goals

- Replacing the Worker control-plane protocol.
- Hiding genuine 401/403/revocation/device errors.
- Changing render runtime readiness or queue admission policy.
