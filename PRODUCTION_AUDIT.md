# Production audit

Audit date: 2026-10-06

This is an evidence-based audit snapshot. The application is a **production
candidate** while the remaining human/operational actions below are pending.

## Findings

| ID | Priority | Evidence | Risk | Recommended fix |
|---|---|---|---|---|
| SEC-001 | P0 (resolved) | The operator confirmed external rotation/replacement. The current ignored `.env.local` contains non-empty rotated configuration, runtime loading succeeds without exposing values, and the clean live E2E flow reaches MongoDB-backed authentication, checkout, counter, analytics, and reports. | Previously exposed credentials are no longer the active configured material. | Continue monitoring provider audit logs and revoke any unknown sessions/keys. No secret values were printed or committed. |
| BUILD-001 | P2 (resolved) | The first `npm run build:production` attempt failed during page-data collection with `PageNotFoundError: Cannot find module for page: /_document` while stale generated artifacts were present. There is no `pages/` directory or `pages/_document` file. | A stale build directory can produce a false production-build failure during verification. | A clean `.next` rebuild completed successfully. Treat a future recurrence as a build-cache/Next.js configuration investigation, not as a confirmed source defect. |
| DEPS-001 | P1 | After compatible patches for `dompurify` 3.4.16, `source-map-js` 1.2.2, and all affected `brace-expansion` instances, `npm run deps:review` reports 9 remaining findings: Tailwind 3.4.19's `braces`/`postcss-selector-parser` chain and the Next ESLint plugin's `fast-glob` chain. npm proposes Tailwind 4.3.3 or `eslint-config-next` 14.2.35, both breaking changes for this project. | The remaining packages are build/development dependencies, but vulnerable parser/glob code can cause denial of service if exposed to attacker-controlled patterns during tooling execution. | Keep the compatible patches. Plan and separately test a Tailwind 4 migration and current Next/ESLint migration; do not apply `npm audit fix --force` without compatibility testing. |
| MEDIA-001 | P1 | `.env.local` leaves `MEDIA_STORAGE_PROVIDER` and Cloudinary credentials unset; `/api/upload` returns `UPLOAD_STORAGE_NOT_CONFIGURED` when storage is disabled. | Review image and admin gallery uploads are unavailable; production content workflows depending on durable media cannot operate. | Configure and verify an approved durable provider, or explicitly remove/disable upload-dependent workflows before deployment. |

No MongoDB implementation changes were made.

## Authentication and authorization

### Customer

- Registered customer login uses bcrypt, a fake-hash not-found path, per-IP and
  per-subject rate limits, signed role-scoped cookies, and database-backed
  active/password-version checks.
- Guest checkout remains available through a random 32-byte guest cookie whose
  hash is stored server-side. Guest orders are scoped by the guest-session hash.
- Customer order reads, edits, and cancellations apply account/claimed-order
  ownership filters. Guest claiming runs in a MongoDB transaction and atomically
  marks the session claimed/revoked.
- Google OAuth is isolated behind the Google OIDC implementation; customer
  sessions use the customer role and cannot satisfy admin or worker verifiers.

### Worker

- Worker login validates the worker role, active state, bcrypt password, required
  `counter:operate` permission, independent worker secret configuration, and the
  configured counter location.
- `WORKER_LOCATION_MISMATCH` is checked server-side during login.
- Counter list, detail, status, and payment routes revalidate the worker session
  and pass the worker location into service-layer queries/operations. The service
  rejects non-counter orders and mismatched locations.
- Worker cookies are HttpOnly, SameSite=Lax, Secure in production, and expire
  after 12 hours. Password-version changes invalidate existing sessions.

### Admin

- Admin login uses bcrypt, fake-hash comparison, rate limiting, signed role
  claims, active-state/password-version checks, and HttpOnly/SameSite cookies.
- Bootstrap requires `ADMIN_BOOTSTRAP_ENABLED=true`, a high-entropy setup key,
  secure admin-session configuration, and an empty admin collection; duplicate
  creation is rejected.
- Admin APIs validate the admin session; worker management and media/report PII
  operations additionally enforce permissions where applicable.
- Password reset tokens are random, hashed at rest, single-use, time-limited,
  rate-limited, and increment `passwordVersion`, invalidating prior sessions.

### Session and CSRF controls

- Middleware applies trusted-origin checks plus double-submit CSRF validation to
  unsafe API/admin/counter mutations.
- Session cookies use HttpOnly, SameSite=Lax, production Secure, explicit paths,
  and bounded expirations. Logout clears cookies; password changes/reset
  invalidate sessions through password-version checks.
- No confirmed authentication or authorization bypass was found in the reviewed
  implementation.

## Checkout, order, token, counter, and inventory

- Checkout is guest-capable and does not require customer login.
- `createCustomerOrder` loads menu items from MongoDB, derives prices and costs
  from server-side menu documents, calculates tax/discount/total in paise, and
  rejects unsupported payment methods.
- `TAX_RATE_BASIS_POINTS` is required by `getBusinessRules`; the current local
  configuration supplies `0`, so the local checkout configuration is complete
  for tax. No tax value was invented.
- Missing tax configuration produces `BusinessRulesConfigurationError` and
  prevents checkout rather than silently defaulting.
- Stock decrement, order creation, coupon reservation, token allocation, and
  inventory events run in a MongoDB transaction. Tracked stock uses an atomic
  `quantity: { $gte: requested }` update, preventing two concurrent orders from
  consuming the same unit.
- Order creation requires an idempotency key and request fingerprint. Counter
  payment recording also requires an idempotency key and rejects mismatched key
  reuse.
- The state machine permits customer/guest cancellation only through the
  customer-allowed states, restricts counter workers to counter transitions,
  requires payment before serving unless an admin records an explicit exception,
  and enforces expected state versions.
- Counter payment and status routes require worker authentication and location
  matching. Customers have no payment/status mutation path.
- Cancellation compensates stock/coupon usage transactionally and records
  release/wastage events.
- No concrete checkout, order ownership, token, counter authorization, or
  concurrent-stock defect was confirmed.

## Analytics and reports

- Analytics are generated server-side from orders, payments, products, expenses,
  inventory events, reviews, and contacts; dashboard responses redact customer
  email/phone data.
- Reports require an admin session, rate limiting, bounded filters/snapshots,
  row/file limits, private no-store responses, and explicit `reports:pii` for
  customer-detail exports.
- Report downloads are private, expiring, checksum-backed jobs. Business dates
  use the configured business timezone (`Asia/Kolkata` in the local config).
- No frontend-calculated authoritative metric or report authorization defect was
  confirmed.

## Uploads

- `/api/upload` validates scope, customer/admin authorization, rate limits,
  content length, MIME/signature/extension through `validateMediaFile`, and
  durable storage configuration.
- Media records store owner and scope metadata; customer deletion is restricted
  to that customer's unlinked review assets, while admin deletion requires
  `media:manage` (or `*`).
- Filename traversal is rejected by `/api/uploads/[filename]`.
- The concrete readiness issue is `MEDIA-001`: durable storage is currently
  disabled/unconfigured.

## API inventory

All 54 `app/api/**/route.ts` route files were reviewed. Middleware supplies
security headers and CSRF checks for unsafe mutations; route handlers perform
the role/ownership checks shown below.

| Endpoint group | Methods | Auth/role | Validation and ownership |
|---|---|---|---|
| `/api/auth/*`, `/api/csrf`, `/api/guest/session`, `/api/health` | GET/POST as implemented | Public where applicable | Auth input, reset-token, CSRF, and guest-cookie validation |
| `/api/menu`, `/api/menu/[id]`, `/api/content`, `/api/gallery`, `/api/contact` | GET/POST/PUT/DELETE as implemented | Public reads; admin mutations | Zod/field validation; admin state and media permission checks |
| `/api/reviews`, `/api/reviews/[id]/helpful` | GET/POST/PATCH as implemented | Public reads; customer mutations | Customer session and review ownership/eligibility checks |
| `/api/coupons`, `/api/coupons/[id]`, `/api/coupons/validate` | GET/POST/PUT/DELETE as implemented | Public validation; admin management | Strict schemas and server-side coupon rules |
| `/api/orders`, `/api/orders/[id]` | GET/PUT | Admin | Admin session; strict order/status validation |
| `/api/user/profile`, `/api/user/change-password`, `/api/user/addresses*`, `/api/user/cart*`, `/api/user/payments` | GET/POST/PATCH/DELETE as implemented | Customer | Current customer session; account-scoped queries and schemas |
| `/api/user/orders`, `/api/user/orders/[id]`, `/api/user/guest-orders/claim` | GET/PATCH/DELETE/POST | Customer or guest principal as applicable | Account, claimed-order, or guest-session ownership; transactional claim |
| `/api/counter/me`, `/api/counter/orders*`, `/api/counter/payments` | GET/PATCH/POST | Worker with `counter:operate` | Server-side location restriction, strict status/payment schemas, rate limits |
| `/api/admin/analytics*`, `/api/admin/costs`, `/api/admin/inventory-events` | GET/POST as implemented | Admin | Admin session, bounded filters, schemas, private responses |
| `/api/admin/expenses*`, `/api/admin/expense-periods` | GET/POST/PATCH/DELETE as implemented | Admin | Admin session and validated financial/inventory inputs |
| `/api/admin/reports*` | GET/POST | Admin; `reports:pii` for deliberate PII export | Bounded date/filter input, report size/time limits, private expiring downloads |
| `/api/admin/workers*` | GET/POST/PATCH/DELETE | Admin with `workers:manage` | Strict worker schemas and password/session-version handling |
| `/api/upload`, `/api/uploads*` | POST/DELETE/GET | Customer review owner or admin media manager | File validation, owner checks, traversal protection, provider gating |
| `/api/seed` | route-defined | Reviewed as a protected operational route | Must remain disabled/protected in production deployment configuration |

## Production command results

| Command | Result |
|---|---|
| `npm run typecheck` | Passed |
| `npm run lint` | Passed; Next.js reports `next lint` deprecation warning |
| `npm run test:unit` | Passed: 18 files, 105 tests |
| `npm run test:integration` | Passed: 3 files, 31 tests |
| `npm run test:e2e:isolated` | Passed; checkout, payment, serving, inventory, analytics, report download, and authenticated pages verified |
| `npm run deps:review` | Failed: 9 moderate/high vulnerabilities remain after compatible patches; see `DEPS-001` |
| `npm run build:production` | Passed after removing stale generated `.next` artifacts; initial failure was recorded as `BUILD-001` |

## Audit conclusion

The reviewed runtime controls are substantially implemented and the focused
test suites plus a clean production build pass. Secret rotation is resolved.
Remaining dependency/media decisions and deployment operations must be
completed or formally accepted before an unconditional production release.

## Remediation verification (2026-10-06)

- The operator confirmed that exposed credentials were rotated externally.
  Required rotated variables are present and non-empty in the ignored
  `.env.local`; runtime loading succeeds without displaying values. The clean
  live E2E flow verified MongoDB-backed authentication, checkout, counter,
  analytics, and reports. `SEC-001` is RESOLVED based on this evidence.
- Previously issued JWT/CSRF material was not replay-tested because retired
  secret values are not available and were not requested or exposed. The
  session design signs role-specific tokens and CSRF material with the
  configured secrets, so replacing those secrets invalidates old signatures;
  direct replay evidence remains unavailable by design.
- `.env.example` contains placeholders/empty values only, and `.env.local` is
  Git-ignored. No secret values were printed, committed, or added to source.
- Safe dependency patches were applied without `npm audit fix --force`:
  `dompurify` 3.4.15 -> 3.4.16, `source-map-js` 1.2.1 -> 1.2.2,
  `brace-expansion` 1.1.18 -> 1.1.21, 2.1.4 -> 2.1.7, and
  5.0.9 -> 5.0.12. `DEPS-001` remains OPEN because 9 findings require
  breaking Tailwind/Next ESLint decisions.
- Cloudinary is the only implemented durable provider. It was not configured
  because no authorized production credentials were available; upload routes
  continue to return `UPLOAD_STORAGE_NOT_CONFIGURED`. `MEDIA-001` remains
  OPEN.
- `npm run typecheck`, `npm run lint`, `npm test` (21 files, 136 tests),
  `npm run test:unit`, `npm run test:integration`,
  `npm run test:e2e:isolated`, and `npm run build:production` passed.
- `npm run deps:review` failed only on the 9 documented remaining dependency
  findings.
- `git diff --check` passed. Tracked-file and audit-report scans found no
  literal secret assignments.

## Final read-only deployment audit (2026-10-06)

### Environment configuration

The following statuses were checked without displaying values:

| Variable/group | Classification | Status |
|---|---|---|
| `MONGODB_URI`, `MONGODB_DB` | REQUIRED | Configured in the local ignored environment; MongoDB-backed E2E passed |
| `ADMIN_JWT_SECRET`, `CUSTOMER_JWT_SECRET`, `WORKER_JWT_SECRET`, `CSRF_SECRET` | REQUIRED | Configured, independent, and accepted by runtime readiness checks |
| `ADMIN_SETUP_KEY` | PRODUCTION ONLY / one-time | Present locally; bootstrap is disabled by route default when the flag is absent, but deployment must explicitly set `ADMIN_BOOTSTRAP_ENABLED=false` and remove setup material after bootstrap |
| `ADMIN_BOOTSTRAP_ENABLED` | PRODUCTION ONLY | Not explicitly present in the local environment; the route fails closed unless it equals `true` |
| `COUNTER_LOCATION_ID`, `COUNTER_LOCATION_NAME`, `COUNTER_TOKEN_PREFIX` | REQUIRED | Configured; canonical location is `shatvika-corner`, name is `Shatvika Corner`, prefix is `SC` |
| `DELIVERY_ENABLED` | PRODUCTION ONLY | Explicitly `false`; delivery is also hard-disabled in server fulfillment capabilities |
| `TAX_RATE_BASIS_POINTS` | REQUIRED | Configured; checkout rules load successfully |
| `BUSINESS_TIME_ZONE` | REQUIRED | Configured as `Asia/Kolkata` |
| `MEDIA_STORAGE_PROVIDER`, Cloudinary variables | OPTIONAL integration | Intentionally disabled/unconfigured; upload-dependent workflows are unavailable |
| Google OAuth variables | OPTIONAL integration | Disabled/unconfigured; guest checkout and password authentication remain available |
| Resend variables | OPTIONAL integration | Disabled/unconfigured; password-reset email delivery is unavailable until configured |
| Worker provisioning variables | DEVELOPMENT ONLY / controlled shell | Disabled outside an explicit provisioning operation |
| `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL` | REQUIRED for deployment | Local environment has the app URL; site URL is not explicitly present. Production deployment must set both to the same HTTPS origin |

`.env.example` contains placeholders or non-secret operational defaults only.
`.env.local` remains Git-ignored.

### Security and API controls

- Production readiness rejects non-HTTPS canonical origins, and cookies are
  configured as HttpOnly, SameSite=Lax, and Secure in production.
- Middleware enforces trusted-origin and signed double-submit CSRF checks for
  unsafe API/admin/counter mutations.
- Security headers include CSP, HSTS-equivalent `upgrade-insecure-requests` in
  production, frame denial, MIME sniffing protection, referrer policy,
  permissions policy, and request IDs.
- Authentication uses bcrypt, role-specific HS256 secrets, rate limits,
  password-version invalidation, and server-side worker location/permission
  checks.
- CORS headers are not enabled; the application relies on same-origin
  deployment and trusted-origin mutation validation.
- `POST /admin/api/signup` requires the exact opt-in
  `ADMIN_BOOTSTRAP_ENABLED=true`, a high-entropy setup key, secure session
  configuration, and an empty admin collection. Missing the flag is fail-closed.
- All methods of `/api/seed` return `410 SEED_DISABLED`; no unauthenticated
  production seeding path exists.
- The reviewed 54 API route files apply server-side validation, authorization,
  ownership checks, rate limiting on sensitive operations, safe error codes,
  and redacted structured logging. No confirmed API authorization or secret
  disclosure defect was found.

### Database, recovery, and observability

- MongoDB connections are cached/reused, fail fast on unavailable commands,
  use bounded selection/socket timeouts, and retry after connection failure.
- Transactions protect checkout, inventory, coupon, token, cancellation, and
  payment operations. Models define unique constraints for accounts, tokens,
  idempotency/payment events, media, and other business invariants.
- Test cleanup uses isolated integration databases. Legacy migration apply mode
  refuses production database names and requires an explicit confirmation.
- Guarded admin repair requires an explicit confirmation and records an audit
  event. No public destructive seed route exists.
- Structured error logs omit messages/stacks/request contents and redact
  sensitive metadata. Request IDs and health-check database/configuration
  status are available.
- Audit events cover important admin/worker/report/media operations.
- No repository-backed backup, restore, disaster-recovery, alerting, or
  monitoring provider configuration was found. These remain operational
  responsibilities.

### Deployment and media

- The repository proves a Node.js Next.js deployment model: Node `>=24.11 <25`,
  documented CI runtime Node 24.13.0, npm 11.6.2, `npm ci`, `npm run build`,
  and `npm start`.
- No hosting provider, process supervisor, cron, background worker, WebSocket,
  or persistent local filesystem requirement is declared.
- Media storage supports Cloudinary only. Core menu browsing, guest checkout,
  orders, counter operations, analytics, and reports remain usable without it.
  Customer review images and admin gallery/media workflows do not.

### Final sequential verification

| Command | Result |
|---|---|
| `npm run typecheck` | Passed |
| `npm run lint` | Passed; only the existing `next lint` deprecation warning |
| `npm run test:unit` | Passed: 18 files, 105 tests |
| `npm run test:integration` | Passed: 3 files, 31 tests |
| `npm test` | Passed: 21 files, 136 tests |
| `npm run test:e2e:isolated` | Passed: checkout, payment, serving, inventory, analytics, reports, and authenticated pages |
| `npm run build:production` | Passed; all routes generated |
| `npm run deps:review` | Failed: 9 moderate/high findings remain |
| `git diff --check` | Passed |

### Final category scores

| Category | Score |
|---|---:|
| Security | 92 |
| Authentication | 95 |
| Authorization | 95 |
| Customer UX | 90 |
| Checkout | 95 |
| Orders | 95 |
| Counter | 95 |
| Inventory | 95 |
| Admin | 90 |
| Analytics | 92 |
| Reports | 92 |
| Media | 45 |
| Dependencies | 55 |
| Testing | 95 |
| Deployment | 72 |
| Observability | 75 |
| Backup/recovery | 45 |
| **Overall average** | **83/100** |

## Final classification

**B. PRODUCTION CANDIDATE — HUMAN/OPERATIONAL ACTIONS REMAIN**

No confirmed application defect remains in the audited customer, checkout,
order, counter, inventory, authentication, authorization, analytics, or report
paths. Deployment must remain conditional on the open dependency decision,
media decision, explicit production environment setup, and operational
monitoring/backup arrangements.
