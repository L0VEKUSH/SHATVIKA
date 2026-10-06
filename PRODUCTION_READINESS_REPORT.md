# Production readiness report

Audit date: 2026-10-06

The application is a **production candidate**. The core application controls
and verification suites pass, but human/operational actions remain before
deployment.

## Readiness summary

| Category | Before | After | Evidence |
|---|---|---|---|
| Security | Exposed credentials were treated as compromised | Operator-confirmed external rotation verified; no values exposed by this work | Required rotated variables load from ignored `.env.local`; clean live E2E passed; tracked/report scans found no literal secrets |
| Authentication | Audited and passing | No application changes; controls remain verified | Role-scoped sessions, password-version invalidation, rate limits, cookie controls, and password reset tests |
| Authorization | Audited and passing | No application changes; controls remain verified | Customer ownership, worker permissions/location checks, and admin permission checks |
| Checkout | Audited and passing | No application changes; server-side totals remain verified | Isolated E2E checkout, stock, tax, token, and payment flow |
| Orders | Audited and passing | No application changes; state/idempotency controls remain verified | Isolated E2E and order service tests |
| Counter | Audited and passing | No application changes; worker/location controls remain verified | Isolated E2E payment, serving, and collection flow |
| Inventory | Audited and passing | No application changes; atomic reservation remains verified | Isolated E2E inventory result: one unit sold and remaining stock tracked |
| Analytics | Audited and passing | No application changes; server-side calculations remain verified | Isolated E2E analytics result: orders, served, collected paise, and gross margin |
| Reports | Audited and passing | No application changes; protected download remains verified | Isolated E2E CSV report download succeeded and contained the expected order |
| Media | Disabled because `MEDIA_STORAGE_PROVIDER` was unset | Still disabled; `MEDIA-001` OPEN | Existing Cloudinary abstraction and media tests pass; no authorized provider credentials were available |
| Dependencies | 14 moderate/high findings recorded | 9 findings remain; `DEPS-001` OPEN | Compatible patches applied; `npm run deps:review` identifies Tailwind/Next ESLint breaking upgrades |
| Testing | Prior suites passed | All required functional suites pass | Typecheck, lint, unit, integration, default `npm test`, isolated E2E |
| Build | Clean build passed after stale-cache cleanup | Production build passes | `npm run build:production` completed successfully and generated all routes |
| Deployment | Node/Next deployment model documented; hosting provider unspecified | Candidate only | Node `>=24.11 <25`, npm `11.6.2`, `npm ci`, `npm run build`, and `npm start` are documented |
| Observability | Structured errors, request IDs, health checks, and audit events exist | Operational monitoring still required | `lib/apiError.ts`, middleware, `/api/health`, and `AuditEvent` reviewed |
| Backup/recovery | Transactional data protections and guarded migrations exist | Backup/restore runbook and provider policy still required | No repository-backed backup or restore configuration found |

## Dependency remediation

The following compatible patches were applied:

- `dompurify`: 3.4.15 -> 3.4.16
- `source-map-js`: 1.2.1 -> 1.2.2
- `brace-expansion`: 1.1.18 -> 1.1.21
- `brace-expansion`: 2.1.4 -> 2.1.7
- `brace-expansion`: 5.0.9 -> 5.0.12

No `npm audit fix --force` was run. The remaining findings are in the
Tailwind 3.4.19 and Next ESLint dependency chains. The registry proposes
Tailwind 4.3.3 or `eslint-config-next` 14.2.35; both require a separately
reviewed compatibility migration and were not applied.

## Media readiness

The implementation supports Cloudinary only. It validates provider
configuration, signs uploads/deletes server-side, validates provider responses,
persists `MediaAsset` records, and enforces route authorization. The current
environment has no configured provider, so media uploads intentionally remain
unavailable and return `UPLOAD_STORAGE_NOT_CONFIGURED`. Production media
workflows must not be enabled until an authorized operator configures and
verifies Cloudinary, or those workflows are explicitly disabled.

## Blocker status and score

| ID | Priority | Status |
|---|---|---|
| SEC-001 | P0 | RESOLVED - operator confirmed external rotation; runtime and live E2E verification passed |
| DEPS-001 | P1 | OPEN - 9 findings remain and require breaking upgrade decisions |
| MEDIA-001 | P1 | OPEN - durable media provider is not configured |

**Overall score: 83/100**

The score reflects strong verified application controls, passing functional
validation, and resolution of the secret-rotation blocker. It remains reduced
for the unresolved dependency/media decisions and operational deployment,
monitoring, and backup work.

## Security verification limitations

Retired JWT and CSRF values were not available for replay testing and were not
requested or exposed. The application design uses the configured signing
secrets, so replacing them rejects tokens/material signed with the retired
values. Provider audit-log review and unknown-session/key revocation remain
operational follow-up actions.

## Final category scores

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

### Fully verified

- Rotated secrets load without values being exposed; `.env.local` is ignored.
- MongoDB-backed authentication, guest checkout, server totals, stock,
  token/payment flow, counter serving, analytics, and reports pass isolated E2E.
- Authentication, authorization, CSRF, cookies, security headers, rate limits,
  ownership checks, API validation, and safe error handling were reviewed.
- `/api/seed` is permanently disabled and admin bootstrap fails closed unless
  explicitly enabled.
- Typecheck, lint, unit tests, integration tests, full test suite, isolated E2E,
  production build, and diff check pass.

### Remaining application defects

None confirmed in the audited runtime application paths.

### Remaining human/operational tasks

1. Set both production canonical URLs to the same HTTPS origin, explicitly set
   `ADMIN_BOOTSTRAP_ENABLED=false`, and remove one-time bootstrap/setup and
   provisioning material after controlled setup.
2. Decide whether to accept the 9 remaining dependency findings temporarily or
   schedule compatibility-tested Tailwind/Next ESLint migrations. Do not use
   `npm audit fix --force`.
3. Configure and verify Cloudinary before enabling review-image or admin gallery
   workflows, or explicitly disable those workflows.
4. Select and configure the actual hosting platform, process supervision,
   HTTPS termination, timeouts, environment secret store, and deployment
   health checks.
5. Establish database backup, restore testing, retention, incident response,
   alerting, and uptime monitoring outside the repository.
6. Review provider audit logs and revoke unknown sessions/keys from the prior
   credential exposure.

### Exact deployment checklist

- [ ] Deploy on Node `>=24.11 <25` with npm 11.x using `npm ci`.
- [ ] Set matching HTTPS `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_SITE_URL`.
- [ ] Set MongoDB, four independent session/CSRF secrets, database name,
  counter location, timezone, tax rate, token prefix, and `DELIVERY_ENABLED=false`.
- [ ] Set `ADMIN_BOOTSTRAP_ENABLED=false`; confirm `/api/seed` returns
  `SEED_DISABLED`.
- [ ] Verify `/api/health` reports database and configuration ready.
- [ ] Run customer guest checkout through counter collection in staging.
- [ ] Run worker location/payment/status authorization checks.
- [ ] Configure or explicitly disable media-dependent workflows.
- [ ] Review dependency exception/migration decision.
- [ ] Configure logs, request-ID search, alerts, backups, restore test, and
  rollback procedure.
- [ ] Run the final sequential verification suite against the release artifact.

### Deployment decision

It is safe to proceed to production deployment **only after** the checklist's
human/operational tasks are completed and the dependency/media decisions are
formally accepted. Based on the current repository state alone, deploy as a
staged production candidate, not as an unconditional production release.
