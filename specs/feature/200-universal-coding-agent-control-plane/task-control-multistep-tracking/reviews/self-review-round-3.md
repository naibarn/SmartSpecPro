# Self-review round 3

- The server is the owner of grouping, aggregation and scope, reducing client
  divergence between inline and full-page Task Control.
- The new task query must not return raw input/progress/output payloads.
- Pagination is group-based after bounded collection, so one plan is not split
  across visible pages by normal queue sizes.
- Browser assertions cover expansion and the existing no-navigation global
  access requirement.

Plan is ready for ordered implementation.
