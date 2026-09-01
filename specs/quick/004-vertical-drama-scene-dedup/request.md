# Request

Original request: ปรับปรุงระบบชื่อฉากที่มีการสร้างฉากคล้ายกันใน Vertical Drama ให้สมบูรณ์ หลังจากยืนยันแนวทาง identity resolver กลาง, candidate review, and safe handling of existing duplicates.

Assumptions:

- The current user-visible series is series 53.
- Existing application changes in the worktree belong to the user and must not be rewritten.
- The implementation must avoid destructive merging and paid/provider side effects.
