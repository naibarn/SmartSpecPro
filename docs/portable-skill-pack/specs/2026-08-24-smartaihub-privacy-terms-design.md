# SmartAIHub Privacy Policy and Terms Design

Date: 2026-08-24
Status: Approved and implemented locally; pending deployment/legal-entity confirmation

## Goal

Replace the incomplete, English-only `/privacy` and `/terms` pages with public-facing
documents that are bilingual (English and Thai), follow the language selected in the
application, and describe SmartAIHub conservatively using facts that can be supported by
the current product and the `/contact` page.

The temporary controller/service operator name is **Smart AI Hub Team**. The site must not
invent a company registration number, registered address, DPO appointment, vendor name,
security certification, or statutory contact address until those details are confirmed.

## Verified contact facts in scope

The documents may link to the existing Contact page and use these currently published
details:

- Email: `smartaihubapp@gmail.com`
- Line: the existing SmartAIHub Line support link/QR code
- Contact location: `Nakhon Ratchasima, Thailand`
- Typical response target: within 24 hours during business days

The location is presented as a contact location only; it is not labelled as a registered
office or legal service address.

## Chosen implementation approach

Use a shared typed legal-content module containing parallel English and Thai section data.
`Privacy.tsx` and `Terms.tsx` will select the document by the active locale exposed by the
existing i18n hook and render the same section structure in either language. This avoids
hard-coded English UI, keeps the two language versions structurally aligned, and avoids
adding a new i18next namespace while the repository has substantial unrelated locale
changes in progress.

The existing visual language (Navbar, Footer, motion, cards, icons, responsive container)
will be retained. The content renderer will use explicit headings, lists, links, and
paragraphs instead of displaying markdown markers as plain text. Metadata, document title,
last-updated label, table of contents, navigation links, and footer acknowledgement will
also be localized.

## Privacy Policy content contract

The Privacy Policy will include these sections in both languages:

1. Scope and introduction
2. Controller identity and contact details
3. Personal data categories and collection sources
4. Purposes and applicable processing bases
5. AI prompts, generated content, uploads, and workspace data
6. Disclosure to service providers and data transfers, stated by category unless a vendor
   is verified
7. Retention and deletion criteria, without unsupported fixed periods
8. Security safeguards described without unsupported certifications or algorithms
9. Cookies and essential/optional technologies
10. Data-subject rights and how to submit a request
11. Data breach response and complaint channel
12. Children and age requirements, using a product-supported rule
13. Policy updates
14. Contact

The policy will explain that a legal basis depends on the purpose and applicable facts,
including contract performance, legitimate interests, legal obligations, or consent where
appropriate. It will not claim that all processing is consent-based, and it will not promise
that every request is always granted when a legal exception applies.

The rights section will cover access, correction, deletion, restriction or objection where
applicable, portability where applicable, withdrawal of consent, and complaint options.
Requests will be routed to the verified public email and Contact page; the page will not
publish an unverified `privacy@` or `support@` mailbox.

## Terms of Service content contract

The Terms will include these sections in both languages:

1. Acceptance and document updates
2. Eligibility and account responsibility
3. SmartAIHub services and evolving features
4. AI output limitations and human review responsibility
5. User content, permissions, and ownership boundaries
6. Acceptable use and prohibited conduct
7. Third-party providers, integrations, and external links
8. Credits, paid features, billing, and refunds by the applicable purchase terms
9. Availability, maintenance, and service changes
10. Suspension, termination, and account/data consequences
11. Intellectual property and feedback
12. Disclaimer and limitation of liability to the extent permitted by Thai law
13. Indemnity and user responsibility, stated proportionately
14. Governing law and dispute/contact route
15. Contact details

The Terms will not promise a specific uptime, output quality, refund policy, or provider
availability unless that promise is already represented by the product. AI output will be
described as assistance that requires user review and may be inaccurate, incomplete, or
unsuitable for a particular purpose.

## Language and accessibility behavior

- English is the fallback when the selected locale is unavailable.
- Thai mode displays Thai headings, labels, summaries, navigation, legal content, and
  metadata; product names, email addresses, URLs, and technical terms may remain unchanged.
- English mode displays the corresponding English version.
- Both versions preserve the same section IDs/order so deep links and table-of-contents
  navigation remain stable.
- Long legal text must wrap on narrow screens and remain keyboard navigable.
- The pages must not truncate or hide legal text.

## Validation contract

Add focused tests or static assertions for:

- both language content sets being present and section-aligned;
- the temporary controller name and verified Contact email being used consistently;
- removed unsupported legacy claims not being rendered;
- selected locale changing the visible document copy;
- `/privacy` and `/terms` retaining their routes and cross-links.

Run the focused client tests with the repository's jsdom setup, a changed-file TypeScript
diagnostic or the web typecheck with baseline failures separated, Prettier/check formatting,
and `git diff --check`. Browser authentication/deployment proof is outside this local change
unless separately available; it must not be claimed as completed here.

## Legal-source boundary

This is product copy and implementation guidance, not a substitute for review by a Thai
privacy or commercial lawyer. The structure follows the public Privacy Notice examples and
official legal resources from the Thai Personal Data Protection Committee and ETDA:

- https://gppc.pdpc.or.th/privacy-policy/
- https://gppc.pdpc.or.th/wp-content/uploads/GPPC-PDPC_Register_Privacy-Notice-%E0%B8%89%E0%B8%9A%E0%B8%B1%E0%B8%9A%E0%B8%A2%E0%B9%88%E0%B8%AD_05062024.pdf
- https://www.etda.or.th/th/Useful-Resource/%E0%B8%81%E0%B8%8F%E0%B8%AB%E0%B8%A1%E0%B8%B2%E0%B8%A2-HTML/%E0%B8%9E%E0%B8%A3%E0%B8%B0%E0%B8%A3%E0%B8%B2%E0%B8%8A%E0%B8%9A%E0%B8%8D%E0%B8%8D%E0%B8%95%E0%B8%B4%E0%B8%A7%E0%B9%88%E0%B8%B2%E0%B8%94%E0%B9%89%E0%B8%A7%E0%B8%A2%E0%B8%98%E0%B8%B8%E0%B8%A3%E0%B8%81%E0%B8%A3%E0%B8%A3%E0%B8%A1%E0%B8%97%E0%B8%B2%E0%B8%87%E0%B8%AD%E0%B8%B4%E0%B9%80%E0%B8%A5%E0%B9%87%E0%B8%81%E0%B8%97%E0%B8%A3%E0%B8%AD%E0%B8%99%E0%B8%B4%E0%B8%81%E0%B8%AA-%E0%B8%9E.%E0%B8%A8.2544.aspx
