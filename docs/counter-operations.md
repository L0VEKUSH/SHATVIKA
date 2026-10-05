# Counter ordering and operations runbook

SHATVIKA CORNER currently accepts counter-collection orders only. The supported customer journey is:

`Browse menu -> Add to cart -> Confirm order & get token -> Pay at counter -> Collect items`

Guest checkout is the default. A random server-issued HttpOnly cookie authorizes same-browser guest history; an optional Google account can provide cross-device history when configured. New orders never require an address and always have a zero delivery charge.

## Required configuration

Configure these values in `.env.local` for development and as secrets/settings in the deployment environment:

```dotenv
DELIVERY_ENABLED=false
BUSINESS_TIME_ZONE=Asia/Kolkata
NEXT_PUBLIC_BUSINESS_TIME_ZONE=Asia/Kolkata
COUNTER_LOCATION_ID=shatvika-corner
COUNTER_LOCATION_NAME=Shatvika Corner
COUNTER_TOKEN_PREFIX=SC
WORKER_JWT_SECRET=
TAX_RATE_BASIS_POINTS=
TARGET_PREPARATION_MINUTES=20
MAX_OUTSTANDING_GUEST_ORDERS=5
```

`WORKER_JWT_SECRET` must be an independent high-entropy server-only value of at least 32 bytes. Do not reuse the admin or customer signing secret. Generate a local/deployment value without printing it into source control using the deployment secret manager, or generate one for `.env.local` with:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Restart the Next.js server after changing environment values. The worker cookie is `shatvika_worker_session`; it is HttpOnly, SameSite=Lax, Secure in production, and is not shared with admin/customer sessions.

`TAX_RATE_BASIS_POINTS` must be confirmed by the owner/accountant. Checkout remains unavailable when required financial configuration is absent; the application does not invent a tax rate. MongoDB must be a replica set or another transaction-capable deployment because checkout allocates inventory, coupon use, the daily token, and the order in one transaction.

Optional Google sign-in requires a Google Cloud OAuth 2.0 Web application client and these server-only values:

```dotenv
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
```

Add that exact local URI as an authorized redirect URI. Production must use its exact HTTPS origin with `/api/auth/google/callback`. The flow validates the provider response through `openid-client` and binds it to one-time state, nonce, and PKCE values. Missing or cancelled Google setup never blocks guest checkout. Matching email alone does not link a password account; the signed-in customer must use the explicit linking flow.

## Tokens, orders, and retries

- The server allocates a token using an atomic MongoDB counter scoped by business date, location, and timezone. The readable value (for example, `SC-0042`) is only meaningful together with that date and location; MongoDB's order ID remains globally unique.
- The token is created only inside the successful order transaction. A cart action does not allocate a token, and the customer UI does not clear the purchased cart before the API confirms success.
- The checkout idempotency key and request fingerprint are persisted for retry recovery. Reusing the key with identical input returns the same order; different input is rejected.
- A token is not an authentication credential. Customer endpoints enforce ownership and counter endpoints require an active worker session.

## Worker provisioning and access

There is no public worker-registration route. Provision a worker only from a controlled shell with a non-production or deliberately selected database configuration:

Run this in Windows PowerShell. Replace only the name, email, and location with authorized values. The password prompt is hidden; it is converted only for the child provisioning process and removed in `finally`.

```powershell
Set-Location -LiteralPath 'C:\Users\ASUS\Downloads\SHATVIKA CORNER'
$workerPassword = Read-Host 'New worker password (12+ characters)' -AsSecureString
try {
  $env:WORKER_PROVISION_CONFIRM = 'CREATE_COUNTER_WORKER'
  $env:WORKER_NAME = 'REPLACE WITH AUTHORIZED WORKER NAME'
  $env:WORKER_EMAIL = 'REPLACE-WITH-AUTHORIZED-WORKER-EMAIL@example.com'
  $env:WORKER_LOCATION_ID = 'shatvika-corner'
  $env:WORKER_PASSWORD = [System.Net.NetworkCredential]::new('', $workerPassword).Password
  npm run worker:create
} finally {
  Remove-Item Env:WORKER_PROVISION_CONFIRM,Env:WORKER_NAME,Env:WORKER_EMAIL,Env:WORKER_LOCATION_ID,Env:WORKER_PASSWORD -ErrorAction SilentlyContinue
  $workerPassword = $null
}
```

The command loads `MONGODB_URI` and optional `MONGODB_DB` from `.env.local`; `WORKER_JWT_SECRET` must also be configured for login. It refuses an existing worker email and never overwrites it. An authenticated administrator with `*` or `workers:manage` can alternatively manage accounts at `/admin/workers`; password resets and deactivation increment the worker session version so existing sessions stop working.

Worker locations must resolve to the same canonical ID as `COUNTER_LOCATION_ID`. The management page displays every assignment, flags legacy mismatches, and provides a validated location selector plus **Save location**; saving increments the worker session version and revokes old sessions. This deployment currently exposes one configured location, so arbitrary/nonexistent IDs are rejected instead of silently joining another queue. Configure `COUNTER_LOCATION_ID` explicitly in production; the visible development fallback is `shatvika-corner`.

Workers sign in at `/counter/login`. Their role is restricted to the configured location and `counter:operate`; they cannot use admin analytics, reports, user administration, privileged settings, or PII exports.

The enforced counter state sequence is `Placed -> Accepted -> Preparing -> Ready -> Served`. Appropriate pre-service states may be cancelled with a reason. Backward and stale transitions are rejected. The worker queue polls with cleanup and refreshes after mutations; transition preconditions prevent two workers from silently overwriting one another.

## Payment and cancellation rules

Payment is independent from preparation state:

- Cash is recorded only after it is physically received.
- UPI is recorded only after the worker verifies receipt in the merchant payment source. A customer screenshot is not verification.
- A successful collection records integer-paise amount, method, timestamp, worker, and an optional transaction reference. An idempotency fingerprint prevents duplicate collection.
- Serving is blocked while unpaid unless an administrator deliberately records the authorized exception and audit reason.
- Cancellation never means refund completion. Paid cancellations remain pending refund until a separate refund event is completed.
- Cancellation before preparation can restore committed stock and coupon use exactly once. Cancellation after preparation records wastage instead of pretending consumed ingredients returned to inventory.

## Inventory setup and legacy data

Inventory is currently product-level and shared by all variants. Each menu item must explicitly use one of these modes:

- `tracked`: the available integer quantity is conditionally decremented inside the order transaction and can never become negative.
- `unlimited`: appropriate only for genuinely made-to-order/unbounded items; order creation records units sold but does not change a fake stock quantity.

Legacy items with neither a stored quantity nor an explicit mode are reported as **unconfigured**, not as zero stock and not as unlimited. Repair them at `/admin/menu` by choosing the evidence-backed mode and, for tracked stock, entering the real available quantity and low-stock point. This is a deliberate data decision and no automatic production migration invents it.

## Admin finance and reconciliation

The admin dashboard separates order placement, fulfilled merchandise sales, tax, collections, outstanding balances, and refunds. Product costs are snapshotted when the order is created. Missing historical costs remain unknown and suppress misleading overall profit. Operating expenses and completeness periods are entered at `/admin/finance`; packaging or wastage must be classified consistently so it is not counted both in item cost and expenses.

Reports use the dashboard's `asOfUtc`, business-time filters, definitions, and end-exclusive range. The report request is rejected when its snapshot is stale rather than silently producing a different cutoff. CSV, XLSX, and PDF jobs are private, audited, expiring, size-limited, and requester-owned.

## Historical delivery compatibility

No historical status is blindly renamed. A legacy order without `fulfillmentType` is interpreted as legacy delivery for reporting, while every new order must explicitly be `counter`. Legacy `delivered` and counter `served` can appear together only in the documented aggregate `fulfilled`; row-level reports retain the original fulfillment type and status.

Use the dry run to inspect evidence-only legacy patches:

```powershell
npm run migrate:legacy:dry-run
```

The tool does not infer customer identity, costs, payment collections/refunds, reservation state, or missing operational timestamps. Do not run the apply mode against production. Apply is guarded to a database name containing `test`, `dev`, `local`, or `staging`, requires `MIGRATION_CONFIRM=SHATVIKA_LEGACY_BACKFILL`, and still requires human review of the dry-run counts.

## Verification still required per deployment

Before using a deployment with real orders, verify the complete customer/worker/admin flow in a private staging replica set; test mobile/keyboard behavior and a rendered Unicode PDF; confirm tax and policies; validate reverse-proxy trust/CSP; and connect structured failures to the chosen monitoring service. Email and durable media remain unavailable unless their optional provider settings are complete. No online payment gateway is enabled: UPI is a worker-verified counter collection, not an automated gateway confirmation.
