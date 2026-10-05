import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Admin } from '@/models/Admin';
import { AuditEvent } from '@/models/AuditEvent';
import { GuestSession } from '@/models/GuestSession';
import { InventoryEvent } from '@/models/InventoryEvent';
import { MenuItem } from '@/models/MenuItem';
import { Order } from '@/models/Order';
import { PaymentEvent } from '@/models/PaymentEvent';
import { RateLimitBucket } from '@/models/RateLimitBucket';
import { ReportJob } from '@/models/ReportJob';
import { TokenCounter } from '@/models/TokenCounter';
import { User } from '@/models/User';
import { Worker } from '@/models/Worker';

const port = 3101;
const origin = `http://127.0.0.1:${port}`;
const databaseName = 'shatvika_http_e2e';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function nextCalendarDate(date: string) {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

async function json(response: Response): Promise<Record<string, any>> {
  const body = await response.json().catch(() => null);
  assert(body && typeof body === 'object', `Expected JSON from ${response.url}, received HTTP ${response.status}`);
  return body as Record<string, any>;
}

class CookieClient {
  private readonly cookies = new Map<string, string>();
  private csrfToken: string | null = null;

  private remember(response: Response) {
    const headers = response.headers as Headers & { getSetCookie?: () => string[] };
    const values = headers.getSetCookie?.() ?? (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')!] : []);
    for (const value of values) {
      const pair = value.split(';', 1)[0];
      const separator = pair.indexOf('=');
      if (separator < 1) continue;
      const name = pair.slice(0, separator);
      const cookieValue = pair.slice(separator + 1);
      if (!cookieValue) this.cookies.delete(name);
      else this.cookies.set(name, cookieValue);
    }
  }

  private cookieHeader() {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  async csrf() {
    const response = await this.request('/api/csrf');
    const body = await json(response);
    assert(response.status === 200 && typeof body.csrfToken === 'string', 'CSRF bootstrap failed');
    this.csrfToken = body.csrfToken;
  }

  async request(pathname: string, init: RequestInit = {}, protectMutation = false) {
    if (protectMutation && !this.csrfToken) await this.csrf();
    const headers = new Headers(init.headers);
    const cookie = this.cookieHeader();
    if (cookie) headers.set('cookie', cookie);
    if (protectMutation) {
      headers.set('origin', origin);
      headers.set('x-csrf-token', this.csrfToken!);
    }
    const response = await fetch(`${origin}${pathname}`, { ...init, headers, redirect: init.redirect ?? 'manual' });
    this.remember(response);
    return response;
  }

  async postJson(pathname: string, body: unknown, headers?: HeadersInit) {
    return this.request(pathname, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...Object.fromEntries(new Headers(headers).entries()) },
      body: JSON.stringify(body),
    }, true);
  }

  async patchJson(pathname: string, body: unknown) {
    return this.request(pathname, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }, true);
  }
}

async function waitUntilReady(server: ChildProcessWithoutNullStreams, output: () => string) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Next.js exited before readiness.\n${output().slice(-2_000)}`);
    try {
      const response = await fetch(`${origin}/api/health`);
      if (response.status === 200) return;
    } catch {
      // Compilation/server startup is still in progress.
    }
    await new Promise(resolve => setTimeout(resolve, 1_000));
  }
  throw new Error(`Next.js did not become ready.\n${output().slice(-2_000)}`);
}

async function run() {
  let replica: MongoMemoryReplSet | null = null;
  let server: ChildProcessWithoutNullStreams | null = null;
  let serverOutput = '';
  try {
    replica = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
    const mongoUri = replica.getUri();
    await mongoose.connect(mongoUri, { dbName: databaseName });
    await Promise.all([
      Admin.syncIndexes(), Worker.syncIndexes(), MenuItem.syncIndexes(), Order.syncIndexes(),
      GuestSession.syncIndexes(), PaymentEvent.syncIndexes(), InventoryEvent.syncIndexes(),
      TokenCounter.syncIndexes(), RateLimitBucket.syncIndexes(), ReportJob.syncIndexes(), AuditEvent.syncIndexes(),
      User.syncIndexes(),
    ]);

    const adminPassword = 'Isolated admin password 42!';
    const workerPassword = 'Isolated worker password 42!';
    await Admin.create({
      email: 'admin@isolated.example.test', password: await bcrypt.hash(adminPassword, 12),
      role: 'admin', permissions: ['*'], isActive: true,
    });
    await Worker.create({
      name: 'Isolated Counter Worker', email: 'worker@isolated.example.test',
      password: await bcrypt.hash(workerPassword, 12), role: 'worker', isActive: true,
      permissions: ['counter:operate'], locationId: 'isolated-counter',
    });
    const customerPassword = 'Isolated customer password 42!';
    await User.create({
      email: 'customer@isolated.example.test', password: await bcrypt.hash(customerPassword, 12),
      authProvider: 'password', fullName: 'Isolated Customer', isActive: true,
    });
    const product = await MenuItem.create({
      name: 'Isolated Golden Item', description: 'Never leaves the isolated test database.',
      basePrice: 100, costPaise: 6_000, category: 'Patties', emoji: 'T',
      gradientClass: 'from-orange-500 to-amber-500', inventoryMode: 'tracked', quantity: 10, reorderPoint: 2,
    });

    const childEnvironment = {
      ...process.env,
      MONGODB_URI: mongoUri,
      MONGODB_DB: databaseName,
      NEXT_PUBLIC_APP_URL: origin,
      NEXT_PUBLIC_SITE_URL: origin,
      NEXT_PUBLIC_SITE_NAME: 'SHATVIKA CORNER ISOLATED E2E',
      BUSINESS_TIME_ZONE: 'Asia/Kolkata',
      NEXT_PUBLIC_BUSINESS_TIME_ZONE: 'Asia/Kolkata',
      ADMIN_JWT_SECRET: 'isolated-e2e-admin-secret-0000000000000000000000000000',
      CUSTOMER_JWT_SECRET: 'isolated-e2e-customer-secret-00000000000000000000000000',
      WORKER_JWT_SECRET: 'isolated-e2e-worker-secret-000000000000000000000000000',
      CSRF_SECRET: 'isolated-e2e-csrf-secret-00000000000000000000000000000',
      ADMIN_BOOTSTRAP_ENABLED: 'false',
      DELIVERY_ENABLED: 'false',
      COUNTER_LOCATION_ID: 'isolated-counter',
      COUNTER_LOCATION_NAME: 'Isolated Counter',
      COUNTER_TOKEN_PREFIX: 'SC',
      TAX_RATE_BASIS_POINTS: '500',
      TARGET_PREPARATION_MINUTES: '20',
      MAX_OUTSTANDING_GUEST_ORDERS: '5',
      NEXT_TELEMETRY_DISABLED: '1',
    };
    const nextBin = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next');
    const nextServer = spawn(process.execPath, [nextBin, 'dev', '-p', String(port)], {
      cwd: process.cwd(), env: childEnvironment, stdio: ['pipe', 'pipe', 'pipe'],
    });
    server = nextServer;
    const capture = (chunk: Buffer) => { serverOutput = `${serverOutput}${chunk.toString('utf8')}`.slice(-20_000); };
    nextServer.stdout.on('data', capture);
    nextServer.stderr.on('data', capture);
    await waitUntilReady(nextServer, () => serverOutput);

    const pageResults: Record<string, number> = {};
    for (const page of [
      '/', '/orders', '/policies', `/product/${product._id}`,
      '/auth/login', '/auth/signup', '/auth/forgot-password', '/auth/reset-password', '/auth/logout',
      '/counter/login', '/admin/login', '/admin/signup',
    ]) {
      const response = await fetch(`${origin}${page}`, { redirect: 'manual' });
      pageResults[page] = response.status;
      assert(response.status === 200, `Public page ${page} returned ${response.status}`);
    }
    for (const [page, destination] of [['/counter', '/counter/login'], ['/admin', '/admin/login'], ['/customer', '/auth/login']] as const) {
      const response = await fetch(`${origin}${page}`, { redirect: 'manual' });
      assert([302, 307, 308].includes(response.status) && response.headers.get('location')?.includes(destination), `${page} did not redirect to ${destination}`);
    }
    for (const api of ['/api/counter/orders', '/api/admin/analytics', '/api/user/profile']) {
      const response = await fetch(`${origin}${api}`);
      assert(response.status === 401, `Protected API ${api} returned ${response.status}, expected 401`);
    }
    const csrfRejection = await fetch(`${origin}/api/user/orders`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin }, body: '{}',
    });
    assert(csrfRejection.status === 403, `Missing CSRF proof returned ${csrfRejection.status}`);

    const guest = new CookieClient();
    const guestSession = await guest.request('/api/guest/session');
    assert(guestSession.status === 200, `Guest session returned ${guestSession.status}`);
    const checkoutPayload = {
      fulfillmentType: 'counter', paymentMethod: 'counter',
      items: [{ menuItemId: String(product._id), variantId: 'base', quantity: 1 }],
    };
    const idempotencyKey = 'isolated-e2e-checkout-0001';
    const checkoutResponse = await guest.postJson('/api/user/orders', checkoutPayload, { 'idempotency-key': idempotencyKey });
    const checkout = await json(checkoutResponse);
    assert(checkoutResponse.status === 201 && checkout.ok === true, `Checkout failed with ${checkoutResponse.status}: ${checkout.error ?? 'unknown'}`);
    assert(checkout.paymentStatus === 'pending' && checkout.orderStatus === 'placed', 'New counter order was not placed unpaid');
    assert(checkout.deliveryChargePaise === 0 && typeof checkout.tokenNumber === 'string', 'Checkout did not return a committed counter token with zero delivery fee');

    const retryResponse = await guest.postJson('/api/user/orders', checkoutPayload, { 'idempotency-key': idempotencyKey });
    const retry = await json(retryResponse);
    assert(retryResponse.status === 200 && retry.orderId === checkout.orderId && retry.duplicate === true, 'Idempotent checkout retry did not recover the same order');

    const otherBrowser = new CookieClient();
    await otherBrowser.request('/api/guest/session');
    const denied = await otherBrowser.request(`/api/user/orders/${checkout.orderId}`);
    assert(denied.status === 404, `Another guest browser accessed an order by ID: HTTP ${denied.status}`);

    const worker = new CookieClient();
    const invalidWorkerLogin = await worker.postJson('/counter/api/login', { email: 'worker@isolated.example.test', password: 'incorrect password' });
    assert(invalidWorkerLogin.status === 401, `Wrong worker password returned ${invalidWorkerLogin.status}`);
    const workerLogin = await worker.postJson('/counter/api/login', { email: 'worker@isolated.example.test', password: workerPassword });
    assert(workerLogin.status === 200, `Worker login returned ${workerLogin.status}`);
    const counterPage = await worker.request('/counter');
    assert(counterPage.status === 200, `Authenticated counter page returned ${counterPage.status}`);
    const queueResponse = await worker.request(`/api/counter/orders?businessDate=${encodeURIComponent(checkout.tokenBusinessDate)}&status=all&limit=100`);
    const queue = await json(queueResponse);
    assert(queueResponse.status === 200 && queue.orders.some((entry: Record<string, unknown>) => entry.id === checkout.orderId), 'Committed order did not reach the assigned counter queue');

    const paymentKey = 'isolated-e2e-payment-0001';
    const paymentPayload = { orderId: checkout.orderId, method: 'cash', amountPaise: checkout.totalPaise, merchantReceiptVerified: false };
    const paymentResponse = await worker.postJson('/api/counter/payments', paymentPayload, { 'idempotency-key': paymentKey });
    const payment = await json(paymentResponse);
    assert(paymentResponse.status === 200 && payment.order.paymentStatus === 'paid', 'Verified cash collection was not recorded');
    const duplicatePaymentResponse = await worker.postJson('/api/counter/payments', paymentPayload, { 'idempotency-key': paymentKey });
    const duplicatePayment = await json(duplicatePaymentResponse);
    assert(duplicatePaymentResponse.status === 200 && duplicatePayment.duplicate === true, 'Duplicate payment action was not idempotent');

    let version = 0;
    for (const nextStatus of ['accepted', 'preparing', 'ready', 'served']) {
      const response = await worker.patchJson(`/api/counter/orders/${checkout.orderId}`, { orderStatus: nextStatus, expectedVersion: version });
      const body = await json(response);
      assert(response.status === 200 && body.order.orderStatus === nextStatus, `Transition to ${nextStatus} failed with ${response.status}`);
      version = Number(body.order.stateVersion);
    }

    const customerOrderResponse = await guest.request(`/api/user/orders/${checkout.orderId}`);
    const customerOrder = await json(customerOrderResponse);
    assert(customerOrderResponse.status === 200 && customerOrder.order.orderStatus === 'served', 'Guest could not reopen the served order');

    const admin = new CookieClient();
    const adminLogin = await admin.postJson('/admin/api/login', { email: 'admin@isolated.example.test', password: adminPassword });
    assert(adminLogin.status === 200, `Admin login returned ${adminLogin.status}`);
    for (const page of [
      '/admin', '/admin/contacts', '/admin/content', '/admin/coupons', '/admin/finance',
      '/admin/gallery', '/admin/menu', '/admin/orders', '/admin/reviews', '/admin/workers',
    ]) {
      const response = await admin.request(page);
      assert(response.status === 200, `Authenticated admin page ${page} returned ${response.status}`);
    }
    const reportDateTo = nextCalendarDate(checkout.tokenBusinessDate);
    const analyticsResponse = await admin.request(`/api/admin/analytics?preset=custom&from=${checkout.tokenBusinessDate}&to=${reportDateTo}`);
    const analytics = await json(analyticsResponse);
    assert(
      analyticsResponse.status === 200 && analytics.overview.orderVolume.value === 1,
      `Analytics order count did not reconcile (actual=${String(analytics.overview?.orderVolume?.value)}, range=${String(analytics.meta?.range?.fromUtc)}..${String(analytics.meta?.range?.toExclusiveUtc)}, createdAt=${String(customerOrder.order?.createdAt)}, response=${JSON.stringify(analytics).slice(0, 2_000)})`,
    );
    assert(analytics.overview.deliveredOrders.value === 1 && analytics.overview.unitsSold.value === 1, 'Analytics fulfilled order/units did not reconcile');
    assert(analytics.overview.collectedPayments.value === checkout.totalPaise, 'Analytics collection total did not reconcile');
    assert(analytics.overview.netMerchandiseSales.value === checkout.subtotalPaise, 'Analytics merchandise sales did not reconcile');
    assert(analytics.overview.costOfGoodsSold.value === 6_000 && analytics.overview.grossMargin.value === checkout.subtotalPaise - 6_000, 'Analytics cost/profit did not reconcile');

    const reportResponse = await admin.postJson('/api/admin/reports', {
      reportType: 'detailed-orders-tokens', format: 'csv', asOfUtc: analytics.meta.asOfUtc,
      filters: { preset: 'custom', from: checkout.tokenBusinessDate, to: reportDateTo },
      includeCustomerDetails: false,
    });
    const report = await json(reportResponse);
    assert(reportResponse.status === 201 && typeof report.report.downloadUrl === 'string', `CSV report creation failed with ${reportResponse.status}`);
    const downloadResponse = await admin.request(report.report.downloadUrl);
    const csv = await downloadResponse.text();
    assert(downloadResponse.status === 200 && downloadResponse.headers.get('content-type')?.includes('text/csv'), 'CSV report download failed');
    assert(csv.includes(checkout.orderId) && csv.includes(checkout.tokenNumber), 'CSV report did not contain the reconciled order/token');

    const customer = new CookieClient();
    const invalidCustomerLogin = await customer.postJson('/api/auth/login', { email: 'customer@isolated.example.test', password: 'incorrect password' });
    assert(invalidCustomerLogin.status === 401, `Wrong customer password returned ${invalidCustomerLogin.status}`);
    const customerLogin = await customer.postJson('/api/auth/login', { email: 'customer@isolated.example.test', password: customerPassword });
    assert(customerLogin.status === 200, `Customer login returned ${customerLogin.status}`);
    for (const page of ['/customer', '/customer/addresses', '/customer/change-password', '/customer/orders', '/customer/profile']) {
      const response = await customer.request(page);
      assert(response.status === 200, `Authenticated customer page ${page} returned ${response.status}`);
    }

    const workerLogout = await worker.postJson('/counter/api/logout', {});
    assert(workerLogout.status === 200, `Worker logout returned ${workerLogout.status}`);
    const loggedOutWorkerApi = await worker.request('/api/counter/orders');
    assert(loggedOutWorkerApi.status === 401, `Worker session remained valid after logout: ${loggedOutWorkerApi.status}`);

    const [storedOrder, storedProduct, paymentEvents, tokenCount] = await Promise.all([
      Order.findById(checkout.orderId).lean(),
      MenuItem.findById(product._id).lean(),
      PaymentEvent.countDocuments({ orderId: checkout.orderId }),
      TokenCounter.countDocuments({ locationId: 'isolated-counter', businessDate: checkout.tokenBusinessDate }),
    ]);
    assert(storedOrder?.orderStatus === 'served' && storedOrder.paymentStatus === 'paid', 'Database order state did not match the UI/API state');
    assert(storedProduct?.quantity === 9 && storedProduct.quantitySold === 1, 'Database inventory did not reconcile');
    assert(paymentEvents === 1 && tokenCount === 1, 'Duplicate financial event or token counter detected');

    console.log(JSON.stringify({
      ok: true,
      publicPages: pageResults,
      order: { status: storedOrder.orderStatus, paymentStatus: storedOrder.paymentStatus, token: checkout.tokenNumber },
      inventory: { remaining: storedProduct.quantity, unitsSold: storedProduct.quantitySold },
      analytics: {
        orders: analytics.overview.orderVolume.value,
        served: analytics.overview.deliveredOrders.value,
        collectedPaise: analytics.overview.collectedPayments.value,
        grossMarginPaise: analytics.overview.grossMargin.value,
      },
      report: { format: 'csv', downloaded: true, containsOrder: true },
      authenticatedPages: { admin: 10, customer: 5, counter: 1 },
    }, null, 2));
  } finally {
    if (server && server.exitCode === null) {
      server.kill('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 1_000));
      if (server.exitCode === null) server.kill('SIGKILL');
    }
    await mongoose.disconnect().catch(() => undefined);
    await replica?.stop().catch(() => undefined);
  }
}

run().catch(error => {
  console.error(error instanceof Error ? error.message : 'Isolated E2E failed');
  process.exitCode = 1;
});
