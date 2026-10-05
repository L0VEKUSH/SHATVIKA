# SHATVIKA CORNER

SHATVIKA CORNER is a counter-collection ordering and business-operations application. Customers can browse the live menu without signing in, keep a local cart, authenticate only when confirming an order, receive one daily/location-scoped token, pay at the counter, and follow the order through collection. Restricted worker and administrator workspaces manage the queue, verified collections, inventory, costs, analytics, and private downloadable reports.

Delivery is not available for new orders. Historical delivery records retain their original meaning.

## Features

- Anonymous menu browsing, wishlist, and persistent cart
- Default guest checkout with same-browser order history, plus optional customer/Google account history
- Transactional counter checkout with server-authoritative prices, stock, coupons, tax, and integer-paise totals
- Atomic daily/location token allocation and retry-safe idempotency
- Counter workflow: `Placed -> Accepted -> Preparing -> Ready -> Served`
- Separate unpaid/paid/partially-refunded/refunded payment state
- Restricted worker queue for verified cash and merchant-confirmed UPI collections
- Admin menu, coupon, content, gallery, review, contact, order, cost, expense, and inventory operations
- Business analytics with India/Kolkata date boundaries, comparisons, cost coverage, operations, customers, and growth signals
- Private CSV, XLSX, and PDF reports that share dashboard metrics and filters
- CSRF/origin protection, signed role sessions, session-version revocation, rate limiting, validation, audit events, and security headers

## Tech stack

- Next.js 15 App Router and React 18
- TypeScript in strict mode
- MongoDB with Mongoose 9
- Tailwind CSS and Framer Motion
- Zod validation
- Vitest with an isolated MongoDB replica-set integration harness
- ExcelJS and pdfmake for reports
- GitHub Actions for clean install, types, lint, tests, audit, and build

## Architecture

Browser requests pass through security middleware for correlation IDs, CSP/security headers, same-origin mutation checks, signed CSRF tokens, and coarse route-role enforcement. Every protected API route then revalidates the signed session against the current database account and session version before accessing data.

Checkout, inventory, coupon use, token allocation, and order creation commit in one MongoDB transaction. Analytics and exports share the same server-side metric dictionary, filter resolution, business timezone, and snapshot cutoff. See [docs/architecture.md](docs/architecture.md) and [docs/counter-operations.md](docs/counter-operations.md).

## Screenshots

Screenshots are intentionally not checked in yet. Capture them from an isolated staging database after owner-supplied branding, contact, tax, and policy settings are complete; never use real customer/order data in repository screenshots.

## Requirements

- Node.js `24.13.x` (supported package range: `>=24.11 <25`)
- npm `11.x` (documented version: `11.6.2`)
- A transaction-capable MongoDB replica set or Atlas deployment
- Independent high-entropy session and CSRF secrets

## Installation

```powershell
git clone https://github.com/L0VEKUSH/SHATVIKA.git
Set-Location -LiteralPath 'SHATVIKA'
npm ci
Copy-Item -LiteralPath '.env.example' -Destination '.env.local'
```

Complete `.env.local` before starting the application. Never commit it.

## Environment setup

The complete environment contract and comments are in [.env.example](.env.example). Required operational settings include:

```dotenv
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SITE_URL=http://localhost:3000
MONGODB_URI=
MONGODB_DB=SHATVIKA
ADMIN_JWT_SECRET=
CUSTOMER_JWT_SECRET=
WORKER_JWT_SECRET=
CSRF_SECRET=
DELIVERY_ENABLED=false
BUSINESS_TIME_ZONE=Asia/Kolkata
COUNTER_LOCATION_ID=shatvika-corner
COUNTER_LOCATION_NAME=Shatvika Corner
COUNTER_TOKEN_PREFIX=SC
TAX_RATE_BASIS_POINTS=
```

`TAX_RATE_BASIS_POINTS` has no guessed default. The owner/accountant must confirm it before checkout is considered configured. Resend email and Cloudinary media storage remain disabled unless their complete optional configurations are supplied.

## Development

```powershell
npm run dev
```

Open `http://localhost:3000`. Customer, worker, and administrator sessions are intentionally separate.

Create the initial admin only while the guarded bootstrap capability is deliberately enabled. Disable `ADMIN_BOOTSTRAP_ENABLED` immediately afterward. Provision workers from a controlled shell with `npm run worker:create`; there is no public worker-registration route.

## Production build

```powershell
npm run verify
npm run start
```

With the built server running, use a second terminal for the HTTP/security smoke check:

```powershell
npm run test:smoke -- http://localhost:3000
```

`npm run verify` runs type checking, lint, unit tests, replica-set integration tests, dependency review, and the production build in sequence.

## Deployment

No hosting provider is assumed. Deploy as a Node.js Next.js application with:

- HTTPS canonical URLs that agree across `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_SITE_URL`
- A transaction-capable MongoDB deployment
- independent 32-byte-or-longer production secrets
- `DELIVERY_ENABLED=false`
- confirmed tax and public policy settings
- `ADMIN_BOOTSTRAP_ENABLED=false` after initial setup
- explicit trusted-proxy settings matching the real topology
- durable Cloudinary/Resend settings only when sandbox-tested
- structured-log and health-check integration with the selected monitoring platform

Run the application behind HTTPS and verify the production CSP against every required media origin. Rotate bootstrap and administrator credentials before deployment, then remove temporary legacy-repair values.

## API overview

- `/api/auth/*`: customer authentication and password recovery
- `/api/user/*`: current-customer profile, cart, addresses, orders, and payment visibility
- `/api/menu`, `/api/coupons`, `/api/reviews`, `/api/content`, `/api/gallery`, `/api/contact`: public reads with role-protected mutations
- `/api/counter/*`: location-scoped worker queue, transitions, and verified collections
- `/api/admin/analytics*`, `/api/admin/reports*`: private business analysis and exports
- `/api/admin/costs`, `/api/admin/expenses`, `/api/admin/inventory-events`: auditable finance and stock inputs
- `/api/health`: readiness without credentials or customer contents

Mutation requests require a trusted same-origin request and the signed double-submit CSRF token supplied automatically by `lib/apiClient.ts`.

## Testing

Unit tests cover money, business rules, token/date boundaries, order states, analytics, export parsing/reconciliation, security primitives, media validation, password reset, legacy migration, cart quantities, and review eligibility. Integration tests use isolated data and a replica set for authentication, transactions, idempotency, stock/coupon races, cancellation, payment, and Mongoose middleware behavior.

The suite never points at the configured application database. Browser automation, real provider sandboxes, representative load, and deployment monitoring remain environment-specific verification work.

## Security notes

- Never commit `.env.local`, report output, temporary uploads, database binaries, or production data.
- A readable counter token is not authentication.
- Workers cannot access admin analytics, exports, user administration, or privileged settings.
- Online payment processing is not implemented. UPI means a worker verified receipt using the merchant's source.
- Missing historical cost/payment/timestamp evidence remains unknown; it is not inferred.
- Report downloads are private, expiring, requester-bound, audited, and formula-injection protected.

See [SECURITY.md](SECURITY.md) for vulnerability reporting and operational expectations.

## Project structure

```text
app/                 App Router pages and HTTP route handlers
components/          Public and admin UI components
context/             Customer auth, cart, and admin client state
lib/                 Security, ordering, analytics, reports, validation, and adapters
models/              Mongoose schemas and indexes
scripts/             Guarded provisioning and migration utilities
tests/unit/          Deterministic business/security tests
tests/integration/   Isolated replica-set persistence and transaction tests
docs/                Architecture, operations, and verification evidence
.github/workflows/   CI and dependency-review workflow
```

## Future improvements

- Staging browser automation across customer, worker, and admin flows
- Representative private load testing and query profiling
- Production observability/alert routing
- Provider-specific online payments only after provider selection and sandbox verification
- Screenshots captured with isolated, non-customer fixture data
- Further replacement of legacy broad Mongoose `any` types with explicit hydrated/lean document contracts

## License

No license file is currently present. All rights remain with the repository owner until an explicit license is selected and added.
