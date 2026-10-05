# Architecture

## Runtime and boundaries

SHATVIKA CORNER is a single Next.js App Router application. React client components provide interactive public, customer, worker, and administrator experiences. Node.js route handlers own persistence and business rules. MongoDB is the system of record and Mongoose defines schemas, indexes, and middleware.

The three authenticated roles are deliberately separate:

| Role | Session | Primary access |
|---|---|---|
| Customer | `customer_session` | Own profile, cart, orders, reviews, and payment visibility |
| Worker | `shatvika_worker_session` | Configured-location queue, allowed transitions, and verified counter collections |
| Admin | `admin_session` | Business operations, analytics, finance inputs, moderation, and reports |

Middleware verifies signed role claims for routing and adds request/security headers. Each protected API route performs the authoritative database-backed account, active-state, role/permission, and session-version check again.

## Customer order flow

```text
Public catalogue
  -> anonymous/local cart
  -> server-issued HttpOnly guest session (default), or optional customer/Google account
  -> server quote from current catalogue and coupon rules
  -> MongoDB transaction
       conditional stock decrement
       coupon reservation/redemption
       atomic daily/location token allocation
       immutable order snapshots
       order insert with idempotency key/fingerprint
  -> committed order/token response
  -> customer cart cleared only after success
```

All money calculations use integer paise. The configured tax rate is applied with the shared documented rounding rule. Counter orders have no delivery address and zero delivery fee.

## Order and payment state

New counter orders use the forward-only state machine:

`Placed -> Accepted -> Preparing -> Ready -> Served`

Permitted cancellation paths record actor, reason, timestamp, and compensation. Stock is restored before preparation when evidence supports it; cancellation after preparation records wastage. Historical delivery states remain unchanged.

Payment state is independent of preparation state. Cash is recorded when physically collected. UPI is recorded only after a worker verifies the merchant source. Serving unpaid orders is blocked unless an administrator records an explicit audited exception. Cancellation and refund completion are separate facts.

## Analytics and reports

`lib/analytics/service.ts` creates a bounded server-side snapshot using filters resolved in the configured business timezone. Dashboard summaries and paginated tables use this snapshot. Report jobs reuse its cutoff, filters, metric dictionary, definitions, and missing-data limitations.

Revenue concepts remain separate: merchandise sales, discounts, tax, delivery charges on historical records, collections, outstanding balances, and refunds. Profit is suppressed when immutable order-time cost coverage is incomplete. Operating expenses contribute to net profit only when the recorded period is marked complete.

CSV, XLSX, and PDF renderers protect spreadsheet cells, preserve text identifiers, include report metadata, and are validated by parsers in tests. Report jobs are private, expiring, audited, requester-bound, and size-limited.

## Persistence and compatibility

Important integrity constraints include unique account emails, unique user/idempotency keys, unique location/date/token sequences, rate-limit bucket indexes/TTL, and bounded query indexes for status/date/location access.

Legacy records are handled conservatively:

- missing `fulfillmentType` means historical delivery
- `delivered` and counter `served` share only the reporting aggregate `fulfilled`
- missing costs, collections, refunds, customer snapshots, or stage timestamps remain unknown
- migration tools default to dry-run and never infer missing facts

## External adapters

- Password reset email: optional Resend adapter; unavailable unless fully configured
- Durable media: optional Cloudinary adapter; unavailable unless fully configured
- Online payments: disabled; no gateway labels are treated as processing

Unavailable adapters return honest setup states rather than simulated success.

## Verification boundaries

The automated suite covers pure business rules, authorization/security primitives, analytics/export reconciliation, authentication routes, Mongoose middleware, and transactional commerce on an isolated replica set. Real deployment topology, browser/device accessibility, provider sandboxes, production observability, and representative load require staging evidence and are not implied by a successful build.
