# SmartSpecPro Load Test Report

**Date:** [Test execution date]
**Environment:** Staging
**Tool:** k6

## Summary

[Overall summary of test results]

## Scenario 1: API Load (100 Concurrent Users)

- Duration: 5 minutes
- Total requests: [TBD]
- p95 latency: [TBD] ms (target: <500ms)
- Error rate: [TBD]% (target: <1%)
- Cloud Run instance count peak: [TBD]

## Scenario 2: Job Burst (500 Concurrent Generates)

- Duration: [TBD] seconds
- Jobs queued: [TBD] / 500
- Lost jobs: [TBD]
- Queue depth peak: [TBD]
- Cloud Run instance count peak: [TBD]

## Scenario 3: Sustained Load (1000 Jobs / Hour)

- Duration: 60 minutes
- Total jobs submitted: [TBD]
- Queue depth average: [TBD], peak: [TBD]
- Job completion time p95: [TBD] minutes
- Memory utilization trend: [TBD]
- DB connections peak: [TBD] / 100 (limit)

## Success Criteria

| Scenario | Metric | Target | Actual | Pass/Fail |
|----------|--------|--------|--------|-----------|
| API Load | p95 latency | < 500ms | [TBD] | [ ] |
| API Load | 5xx error rate | 0% | [TBD] | [ ] |
| Job Burst | Jobs queued | 500 in <30s | [TBD] | [ ] |
| Job Burst | Lost jobs | 0 | [TBD] | [ ] |
| Sustained | Queue depth | < 100 peak | [TBD] | [ ] |
| Sustained | Job completion | < 10 min p95 | [TBD] | [ ] |
| Sustained | Memory leak | Stable over 60min | [TBD] | [ ] |
| Sustained | DB connections | < 80% of limit | [TBD] | [ ] |

## Bottlenecks Identified

[List any issues found and remediation applied]

## Recommendations

[Any configuration changes or optimizations for production]

## Appendix: Metrics

[Attach or link to metrics-*.json files]
