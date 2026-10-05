# SHATVIKA CORNER repair and verification report

Date: 2026-09-20; follow-ups verified 2026-09-26 and 2026-09-27 (Asia/Kolkata)
Workspace: `C:\Users\ASUS\Downloads\SHATVIKA CORNER`
Branch/base commits: `master` / initial audit `3fc075ee6319741231e2529facee94afc8acacf8`; follow-up base `ed91b51a33b68273d9907838b020dcaaf0d31012`
Runtime used: Node `v24.13.0`, npm `11.6.2`, Windows PowerShell

This report compares the same acceptance criteria before and after the repair and the subsequent counter-token extension. It does not claim production readiness: live email, durable storage, browser accessibility, deployment, representative-load checks, and a real payment-gateway sandbox remain unverified.

## 2026-09-26 follow-up

- Fixed product-detail quantity handling so the selected quantity reaches the shared cart, made Buy Now open the existing confirmation cart, and replaced the inert share control with Web Share/clipboard feedback.
- Corrected verified-purchase review eligibility for new counter orders in `served` state while retaining legacy `delivered` records.
- Removed the obsolete precise-geolocation prompt and aligned public copy with counter collection and zero delivery availability.
- Added mobile customer navigation; keyboard/focus trapping, Escape handling, dialog semantics, labels, and visible action errors across the public/admin navigation and gallery workflow.
- Extended redacted structured exception logging to the remaining reviewed API routes and broadened middleware matching so public pages receive the same production security headers as API/account routes.
- Added a professional README, security policy, architecture guide, cart/review regression tests, and a reusable local HTTP/security smoke runner.
- `GET /api/health` confirmed MongoDB `ok` for the configured `SHATVIKA` database. Overall readiness remains `503 not_ready` because the local file intentionally lacks deployable HTTPS canonical URLs, independent 32+ byte production secrets, and an owner-confirmed `TAX_RATE_BASIS_POINTS`. The production admin login fails closed with 503 under that invalid secret configuration; in development, CSRF-protected invalid customer and admin credentials both returned 401.
- Headless Chrome rendered the public app at 390x844 and 1440x1000 with the title, main landmark, and counter-only notice present and no captured CSP/uncaught-runtime error signals. This is a public-page smoke check, not a full authenticated E2E or accessibility audit.
- No customer, order, payment, product, or other business record was modified during this follow-up. Invalid-login probes may create/refresh their expected distributed rate-limit buckets.

### 2026-09-27 checkout/media attribution

`UPLOAD_STORAGE_NOT_CONFIGURED` was traced exclusively to `/api/upload`; the cart posts counter-order JSON to `/api/user/orders`, and the order route/service do not import media storage. Responses now carry an operation header and typed client errors retain the request URL/method, correlation ID, and operation so unrelated failures can be attributed correctly. Review/gallery uploads show an honest disabled message without affecting ordering.

An isolated route test proved counter checkout succeeds with all media-provider variables absent, creates one `pending`/unpaid order with zero delivery charge, and returns the same order/token for an identical idempotent retry. A separate upload-route test proved a real authenticated upload still returns the expected 503 configuration error. With the current local environment, the actual authenticated checkout blocker is the deliberately missing `TAX_RATE_BASIS_POINTS`, which produces `CHECKOUT_NOT_CONFIGURED`; no tax value was invented.

## Fixed acceptance criteria

| Area | Weight | Evidence required for a 7–8 core-verification score |
|---|---:|---|
| Authentication, authorization, security | 15% | Signed expiring role/subject sessions; current-account/session-version checks; CSRF/origin handling; protected logout; reset-token abuse controls; admin bootstrap guard; authorization tests. |
| Checkout, payments, stock, coupons | 15% | Server-authoritative integer-paise quote; transaction-capable database; conditional inventory/coupon/token writes; idempotency fingerprint; state machine/history; compensation; explicit counter collections/refunds; unavailable gateway methods rejected. |
| Customer features and account experience | 10% | Typed persisted profile/address/cart/order flows; ownership isolation; reload/error/empty/session states; correct return paths. |
| Admin operations and data persistence | 10% | Authorized CRUD/follow-up, confirmed updates, reload persistence, stable IDs, validation, feedback and error states. |
| Analytics accuracy and actionable insights | 15% | One server service/dictionary; deterministic filters/timezone/comparison; money/status/refund/cost definitions; missing-data handling; bounded data access; formula fixtures. |
| Report exports and reconciliation | 5% | Same snapshot/filters/definitions as dashboard; complete authorized rows; valid CSV/XLSX/PDF; PII control; formula protection; totals parsed and reconciled. |
| Responsive design and accessibility | 5% | Critical flows exercised at desktop/tablet/mobile sizes with keyboard, focus, labels, contrast, chart alternatives, and rendered PDF review. |
| Performance and scalability | 5% | Bounded/indexed queries and generation limits plus representative isolated timing/load evidence. |
| Automated tests and regression protection | 5% | Clean CI with unit, replica-set integration, auth/security/formula/export regressions, and browser critical-flow coverage. |
| Reliability, privacy, and monitoring | 5% | Private caches, redacted correlated logs, diagnostics, failure states, export audit trail/expiry, no secret/PII leakage, actionable monitoring. |
| SEO and business-information completeness | 5% | Valid URLs/assets/metadata plus accurate owner-supplied business and policy information without invented claims. |
| Deployment, dependencies, maintainability | 5% | Reproducible clean install, supported pinned runtime, patched dependency graph, type/lint/build, CI, env contract, safe migrations. |

Scale: 0–2 unusable/unsafe; 3–4 major blockers; 5–6 partial; 7–8 core criteria verified with gaps; 9–10 comprehensive verification. An unexercised criterion is `Not verified`, not zero.

## Baseline evidence

Before implementation, the recorded baseline was Node `v24.13.0`, npm `11.6.2`, branch `master`, commit `3fc075e`. An isolated `npm ci` succeeded (exit 0, 81.442 s), so the earlier audit's clean-install failure was not reproducible in the current checkout. `npx tsc --noEmit` succeeded (exit 0, 38.089 s) and `npm run lint` succeeded (exit 0, 101.023 s). The baseline dependency audit and production build did not complete in their available window and are marked unverified. The baseline had no equivalent deterministic transaction, analytics, export-parser, CSRF, or CI evidence.

## Implemented repairs

- Dependency/deployment: synchronized manifests; exact Next `15.5.25`, Mongoose `9.10.0`, Vitest `5.0.0`; supported Node/npm contract; disabled Mongo binary download during install; CI clean install, types, lint, unit, replica-set integration, audit, production build, and PR dependency review. Official references used: [Next.js security releases](https://nextjs.org/blog), [Next.js advisories](https://github.com/vercel/next.js/security/advisories), [React RSC advisory](https://react.dev/blog/2025/12/11/denial-of-service-and-source-code-exposure-in-react-server-components), and [Mongoose 9 migration guidance](https://mongoosejs.com/docs/migrating_to_9.html).
- Authentication/security: shared typed API client; coherent signed CSRF tokens with expiry/origin checks and renewal; protected logout; validated relative `returnTo`; current-user/database checks; password-version invalidation; cold-start DB handling; guarded/rate-limited bootstrap; hashed single-use expiring reset tokens and Resend adapter; redacted structured error logging and correlation/security headers.
- Durable uploads: permission-scoped admin/review upload paths; byte/MIME/extension/content validation; limits and unique keys; Cloudinary adapter and explicit disabled state; owned asset claiming; conservative deletion policy. Existing assets are not silently removed.
- Commerce: counter-only authoritative catalog/variant pricing; documented integer-paise half-up rounding; owner-configured tax; zero delivery charge and no required address; repeated-line aggregation; atomic conditional stock/coupon/token/order writes; transaction rollback; user/key/fingerprint idempotency persisted across browser retry; immutable customer/item/category/price/tax/discount/cost snapshots; counter state machine and actor history; cancellation/restock-or-wastage compensation; explicit cash/verified-UPI collections and refunds. No payment gateway is implied by recording counter UPI.
- Customer/admin: anonymous browse/cart; authenticated confirmation with preserved return path/cart; one server-issued daily/location token per committed order; persisted own-order token/detail/timeline/cancellation; confirmed/reconciled admin requests; approved-only public reviews; moderation/reply workflow; auditable paginated contact follow-up; loading/error/empty/session states.
- Counter operations: separate signed active-worker sessions and location/permission enforcement; searchable live queue; `Placed -> Accepted -> Preparing -> Ready -> Served`; payment kept independent; unpaid serving blocked except for an explicit audited admin override; idempotent worker actions; payment verification and serving attribution. Workers have no admin analytics, exports, user administration, or settings access.
- Reliability/content: distributed Mongo-backed rate limits, proxy trust settings, health endpoint, private sensitive responses, CSP/security headers, canonical URL alignment, repaired icon/manifest links, and owner-supplied contact/policy placeholders instead of fabricated claims.
- Legacy data: dry-run-first evidence-only backfill tooling. Applying it requires a non-production database name plus `MIGRATION_CONFIRM=SHATVIKA_LEGACY_BACKFILL`; unknown historical customer/category/cost values stay unknown.

## Dashboard and report deliverables

`/admin` now provides today/yesterday/week/month/custom end-exclusive ranges, fair elapsed-period comparison dates, Asia/Kolkata grouping, product/category/order/payment/worker/token filters, drill-down links, paginated sortable server tables, last-refreshed and shared report-cutoff times, and loading/error/empty/data-quality states.

Sections: business overview, sales/demand, product/category performance, complete sold-item detail, customers, counter operations, payments/refunds, inventory/wastage, coupons, feedback, evidence-based growth actions, data explorer, and reports. Cost, expense, and completeness-period entry is at `/admin/finance`; contact follow-up is at `/admin/contacts`.

Report datasets: business summary, orders/tokens, sold items, products/categories, sales/cost/profit, expenses, collections/refunds, inventory/wastage, counter operations, customers, coupons, reviews, and consolidated. Every dataset supports UTF-8 CSV, typed multi-sheet XLSX, and paginated Unicode PDF. Private jobs expire after 15 minutes; creation is limited to 5/minute/admin, downloads to 10/minute/admin, generation to 25 seconds and 10 MiB, CSV/XLSX to 10,000 report rows, and PDF to 1,500. Oversized reports fail explicitly instead of truncating. Customer contact fields require `reports:pii`; job lookup/download is requester-owned and private/no-store.

## Metric definitions and reconciliation

- Order volume counts orders placed in `[fromUtc, toExclusiveUtc)` after selected filters. Counter `served` and legacy delivery `delivered` share only the documented `fulfilled` aggregate; row-level status and fulfillment meaning are preserved. Cancellation/current-status cohorts are labeled because legacy event coverage cannot reconstruct every event date.
- Gross merchandise sales is fulfilled item subtotal before discount/tax/delivery. Net merchandise sales subtracts allocated discounts and refund adjustments. Tax, historical delivery, collections, outstanding amounts, and refunds remain separate.
- Collections/refunds use successful payment events and their `occurredAt`, including cash and verified-UPI counter collections. Outstanding amounts include non-cancelled unpaid/part-paid orders in the selected placement cohort. Missing legacy payment events are reported as a limitation rather than guessed.
- AOV is net merchandise sales divided by fulfilled orders and is null for a zero denominator. Comparisons include absolute change; previous zero is `New / no comparison`.
- New/returning status checks fulfilled purchases before the selected period. Inventory stockouts use quantity independently from manual availability.
- Gross profit uses immutable order-time item costs and is shown only at complete cost coverage; otherwise it reports `Cost data required` and coverage. Net profit subtracts recorded operating expenses only when cost coverage is complete, and remains labeled recorded-expense profit until the selected expense periods are confirmed complete. No current-price or fixed-percentage profit estimate remains.
- Operational duration uses actual status-history timestamps; missing stages remain missing. Historical category/customer snapshots use stable IDs, with explicit unknown buckets.

The 10 report tests recomputed row counts and integer-paise totals from the same analytics snapshot, reopened XLSX with ExcelJS, parsed the generated PDF with PDF.js, verified INR and Devanagari text, and round-tripped hostile CSV fields. The report API requires the dashboard `asOfUtc` and rejects stale cutoffs. Dashboard metric definitions/values and export overview rows matched; filtered order counts and totals reconciled exactly in the fixture. This is deterministic fixture reconciliation, not reconciliation against live customer records.

## Before/after scorecard

| Area | Weight | Baseline | Verified final | Change | Supporting check / remaining limit |
|---|---:|---:|---:|---:|---|
| Authentication, authorization, security | 15% | 3.0 | 7.5 | +4.5 | Security/CSRF/session/reset unit coverage; no live email/browser auth run. |
| Checkout, payments, stock, coupons | 15% | 3.0 | 8.0 | +5.0 | Replica-set token/stock/coupon races, rollback, retry, counter state, cash/verified-UPI/refund/wastage tests; no gateway. |
| Customer features and account experience | 10% | 4.0 | 7.0 | +3.0 | Typed persistent implementations and validation tests; no browser E2E. |
| Admin operations and data persistence | 10% | 4.0 | 7.0 | +3.0 | Restricted worker queue/actions, finance/inventory APIs and confirmed admin requests; full CRUD browser matrix not run. |
| Analytics accuracy and actionable insights | 15% | 2.0 | 8.5 | +6.5 | Deterministic formulas/timezone/filter/zero/cost/refund tests. |
| Report exports and reconciliation | 5% | 1.0 | 8.5 | +7.5 | 10/10 parser and reconciliation tests for real generated formats. |
| Responsive design and accessibility | 5% | Not verified | Not verified | — | No browser/axe/visual/PDF rendering session was available. |
| Performance and scalability | 5% | 3.0 | 6.0 | +3.0 | Query/row/time/file limits and indexes verified by inspection/tests; representative load test not run. |
| Automated tests and regression protection | 5% | 2.0 | 8.0 | +6.0 | 83 unit + 16 replica-set integration tests and CI; complete authenticated browser/provider suites absent. |
| Reliability, privacy, and monitoring | 5% | 3.0 | 7.0 | +4.0 | Health/rate-limit/private-cache/audit/redaction code and tests; no external alert sink verified. |
| SEO and business-information completeness | 5% | 3.0 | 7.0 | +4.0 | Canonical/manifest/robots/sitemap and honest configurable content; owner data incomplete. |
| Deployment, dependencies, maintainability | 5% | 4.0 | 8.0 | +4.0 | Clean install, exact runtime/deps, audit, lint, type-check, build, CI and safe migration. |

Baseline provisional score: **2.9/10 across 95% verification coverage** (28.0 covered points out of 100; normalized over verified weight).
Final provisional score: **7.6/10 across 95% verification coverage** (72.25 covered points out of 100; normalized over verified weight).
Improvement on the same verified weight: **+4.7/10**. Responsive/accessibility remains excluded from both weighted averages rather than guessed.

## Final command outcomes

| Command | Result |
|---|---|
| `npm ci` | exit 0; 619 packages; about 2 min; 0 vulnerabilities (deprecated transitive-tooling notices remain) |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0; no warnings/errors (Next reports its lint-command deprecation notice) |
| `npm run test:unit` | exit 0; 15 files, 83 tests passed (latest run 42.80 s) |
| `npm run test:integration` | exit 0; 3 files, 16 tests passed on isolated replica sets (latest run 16.37 s) |
| `npm exec vitest run tests/unit/reports.test.ts` | exit 0; 10 tests passed; generated CSV/XLSX/PDF reopened and inspected |
| `npm audit --audit-level=moderate` | exit 0; 0 vulnerabilities |
| `npm run build:production` | exit 0; Next 15.5.25 compiled, generated 45 static pages, and traced the PDF Unicode font |
| Production HTTP smoke | public page/header/CSP checks passed; `unsafe-eval` absent; readiness and admin login correctly failed closed because local production configuration is incomplete |
| Development HTTP/browser smoke | customer/admin invalid-login checks returned 401; mobile and desktop public renders completed without captured CSP/uncaught error signals |
| `git diff --check` | exit 0; no whitespace errors; only expected CRLF notices |

Mongoose 9.10.0 was exercised at runtime for actual user, menu/product, coupon, token-counter, order, payment, inventory/wastage, review, and contact records. The replica-set tests cover save/update middleware, authoritative snapshots, repeated-line aggregation, concurrent daily token allocation and midnight rollover, a concurrent last-stock race, coupon-cap/date races, request/payment idempotency fingerprints, rollback/compensation, duplicate worker actions, serving rules, prepared-food wastage, refunds, explicit update-pipeline opt-in, and follow-up persistence.

## Remaining risks and external/manual setup

1. No online-payment provider was selected or configured. The verified behavior is pay-at-counter: cash is recorded when received and UPI only after a worker verifies the merchant source. This is not gateway verification. A provider-specific server request, signed webhook, sandbox failure/refund, and replay suite still requires provider selection and sandbox credentials.
2. Configure and sandbox-test Resend and Cloudinary before enabling reset-email/media features. Without complete settings, each feature reports unavailable and never simulates delivery/storage success.
3. Public mobile/desktop rendering is smoke-tested, but run authenticated browser automation and manual review for the customer cart/auth/confirmation/token flow, worker queue/payment/preparation/serving flow, admin reconciliation, keyboard/focus, contrast, tablet sizing, chart alternatives, and rendered Unicode PDF. This remains the unverified 5% scorecard area.
4. Run representative private load tests against a non-production replica-set dataset. Analytics intentionally rejects more than 20,000 orders/10,000 supporting rows; move larger workloads to database aggregation/background object storage before raising limits.
5. Connect structured failure events and health diagnostics to the deployment's alerting/observability sink. Verify CSP against production domains and reverse-proxy IP trust in the real topology.
6. Owner/accountant/legal confirmation is still required for tax, cost classification, expense-period completeness, contact details, hours, collection/cancellation/refund/privacy text. The app deliberately does not invent these values. Delivery is explicitly unavailable for new orders.
7. No production migration, deployment, live customer/payment data mutation, or live credential test was performed. Run the legacy migration dry-run and inspect its evidence before any separately authorized apply.

## Local commands and deployment prerequisites

```powershell
Set-Location -LiteralPath 'C:\Users\ASUS\Downloads\SHATVIKA CORNER'
npm ci
npm run typecheck
npm run lint
npm run test:unit
$env:MONGOMS_SYSTEM_BINARY=(Get-Command mongod).Source
npm run test:integration
npm run deps:review
npm run build:production
npm run migrate:legacy:dry-run
npm run worker:create
npm run dev
```

If local `mongod` is unavailable, omit `MONGOMS_SYSTEM_BINARY`; the integration harness downloads its isolated test binary at test runtime. Never point tests or migration apply at production.

Deployment requires Node 24.13.x/npm 11.6.x, a transaction-capable MongoDB replica set, independent 32+ byte admin/customer/worker session and CSRF secrets, `DELIVERY_ENABLED=false`, a stable counter location/token prefix/timezone, confirmed tax/business settings, provisioned restricted workers, and `ADMIN_BOOTSTRAP_ENABLED=false` after authorized bootstrap. Configure trusted proxies only for a known topology. Resend/Cloudinary and any future payment provider are optional integrations but must be complete and sandbox-verified before their UI/API capability is enabled. See `docs/counter-operations.md` for the operational runbook.
