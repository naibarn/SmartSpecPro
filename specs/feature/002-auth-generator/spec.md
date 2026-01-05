
# spec.md

Spec ID: AUTH-GEN-001  
Title: Authentication Module Generator  
Description:
ระบบสำหรับ generate authentication module แบบครบวงจร (JWT, Password, OAuth, API Key, RBAC, 2FA)
โดยใช้ template engine เพื่อสร้าง service, repository, routes และ types ตาม configuration

Core Capabilities:
- Generate Auth services (auth, jwt, password)
- Two-factor authentication (TOTP, Backup Codes)
- API Key authentication
- RBAC (role-based access control)
- OAuth integration
- Multiple repository implementations (memory, prisma)
- Swagger route generation
- Secret generation script

Non-goals:
- UI/Auth frontend
- Identity provider hosting

Tech Stack:
- Node.js / TypeScript
- Handlebars templates
- Express-compatible architecture
