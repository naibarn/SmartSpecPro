# Orchestra Decisions Log

## 2026-03-18T08:50:00Z — Security findings from tRPC audit
- V09 CRITICAL: system_agent JWT lacks audience/issuer claims — deferred to security hardening pass
- V01-V08 HIGH: IDOR in 8 endpoints missing tenantId WHERE guard — will fix in round 2
- V11-V12 HIGH: Conditional tenantId filter allows cross-tenant reads when tenantId is null — will fix in round 2
- Reason: Agent 2 is already fixing tenant isolation in actuatorRegistry. Router-level IDOR fixes need round 2 dispatch.
