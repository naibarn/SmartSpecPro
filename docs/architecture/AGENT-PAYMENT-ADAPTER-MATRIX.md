# Agentic Payment Interoperability Matrix — R0.9 (2026-11-01)

**Classification**: public specification or product documentation != SmartSIHub provider readiness. Every adapter is initially `PLANNED/NOT IMPLEMENTED` until account access, region, support, credentials, callback and live end-to-end proof are recorded. The native API and existing PSP integrations must be inventoried separately.

| Family | Role | Good fit | Key condition | Proposed implementation priority |
|---|---|---|---|---|
| Native HTTPS + SmartSIHub MCP | Existing account-bound spending and Agent actions | Core Skill pricing, prepaid credits, PAYG | Delegated payer/tenant auth and canonical ledger | P0 build |
| Existing Beam card + PromptPay | Real-money top-ups/subscription charges | Thailand initial funding | Verify exact production gateway configuration and payment confirmation | P0 adapt |
| Manual PromptPay | Assisted top-up | Human QR/slip settlement | Not autonomous headless; return `ACTION_REQUIRED` | P0 compatibility |
| Stripe saved-card/Shared Payment Tokens | Scoped agent payment credentials | Auto top-up/checkout when supported | PSP availability, consent, token scoping; integration required | P1 optional |
| OpenAI ACP | Agentic commerce checkout | Supported ChatGPT-to-merchant checkout | Currently partner/eligibility-dependent; not generic Skill debit API | P1 optional |
| Google/Shopify UCP | Commerce discovery/checkout/orders | Platform plan/miniapp purchases through agents | Version negotiation, merchant/PSP support | P1 optional |
| Google AP2 | Payment authorization evidence | High-trust mandate receipts | AP2 is not a payment processor; signature/constraint verification | P1/P2 optional |
| Visa Trusted Agent | Agent identity/commerce signals | Card networks when PSP supports | Network/merchant implementation eligibility | P2 optional |
| Mastercard Agent Pay | Agent network payment | PSP/network tokenized flows | Partner/region eligibility | P2 optional |
| x402 (Coinbase/Cloudflare) | Programmatic HTTP machine payments | External API access and paid microtransactions | Network/token/facilitator availability; jurisdiction and economics | P2 optional |

Never require crypto, new PSP, or a publicly specified Agent protocol to ship a native prepaid+subscription+PAYG early beta. For unknown/unsupported provider capability, return a clear structured next action, not a fake payment success. Agent identity and account-bound authority are checked at SmartSIHub independently of payment-method protocol.
