# R03.3 Focused Test Ideas

- Core route returns authorized missions for current workspace; rejects no session, no workspace membership, and does not accept arbitrary owner/workspace identity from query input.
- Client requests include the selected workspace header and do not issue calls for a different workspace after selection changes.
- LIVE route renders only returned canonical records and explicit unavailable states; it imports no demo fixtures and never silently substitutes fixtures on API errors.
- Mission selection fetches conversation Task Control projection; exact Job/Run/Attempt links are preserved and invalid or non-matching query identities are rejected after refetch.
- Return navigation restores source Mission tab/panel without calling Job mutation/dispatch endpoints.
