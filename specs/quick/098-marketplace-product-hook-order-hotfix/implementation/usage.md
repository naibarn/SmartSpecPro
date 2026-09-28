# Hotfix Verification Guide

After deployment, open the affected Marketplace Capture product-detail URL while authenticated. Confirm that the loading state transitions to product content without the application error boundary and that the browser console does not report React error 310.

For local regression verification, run the two focused Marketplace Capture source-wiring tests documented in `sections/index.md` from `apps/web`.
