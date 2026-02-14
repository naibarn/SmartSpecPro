# Section 07 Code Review

## CRITICAL
1. Privilege escalation via user_id in request body (Python backend) -- req.user_id not validated against current_user.id
2. No tenant isolation on `getActiveEditSession` query
3. No tenant ownership check on library item access in openForEditing/saveBack
4. Access token read via raw SQL in Celery bypasses encryption layer

## HIGH
5. Race condition: duplicate edit sessions possible (no unique constraint)
6. Missing `createContentVersion` call in saveBack -- previous version lost
7. Missing re-indexing job creation in saveBack
8. Celery beat schedule not updated -- cleanup task never runs
9. No file size limit on upload
10. Celery task bypasses GoogleTokenService for token retrieval

## MEDIUM
11. saveBack no transactional integrity
12. Notification for expiring sessions is a no-op (just logger.info)
13. sourceUrl stored as relative key but returns full URL
14. Plan requires CONFLICT error but implementation returns existing session
15. No error handling for mutations in frontend
16. editUrl used to determine export format -- fragile coupling

## LOW
17. Missing Vitest tests for router and component
18. DocumentPreviewPanel.tsx changes not in diff
19. No success toast shown
20. Discard uses inline div instead of Radix AlertDialog
21. hoursRemaining display misleading at <1h
22. Double-commit risk in task session management
