import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const cookieStore = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => cookieStore),
}));

import { POST as customerLogin } from '@/app/api/auth/login/route';
import { POST as adminLogin } from '@/app/admin/api/login/route';
import { POST as workerLogin } from '@/app/counter/api/login/route';
import { POST as workerLogout } from '@/app/counter/api/logout/route';
import { GET as listWorkers, POST as createWorker } from '@/app/api/admin/workers/route';
import { PATCH as updateWorker } from '@/app/api/admin/workers/[id]/route';
import { GET as counterQueue } from '@/app/api/counter/orders/route';
import { POST as createContent, PUT as updateContent } from '@/app/api/content/route';
import { connectToMongo } from '@/lib/mongoose';
import { signSessionToken } from '@/lib/sessionToken';
import { verifyWorkerTokenState } from '@/lib/workerJwt';
import { WORKER_COOKIE_NAME } from '@/lib/workerSessionConfig';
import { Admin } from '@/models/Admin';
import { RateLimitBucket } from '@/models/RateLimitBucket';
import { User } from '@/models/User';
import { Worker } from '@/models/Worker';
import { Feature } from '@/models/Content';

let replicaSet: MongoMemoryReplSet;

const CUSTOMER_SECRET = 'isolated-customer-session-secret-000000000000000000';
const ADMIN_SECRET = 'isolated-admin-session-secret-000000000000000000000';
const WORKER_SECRET = 'isolated-worker-session-secret-0000000000000000000';

function loginRequest(path: string, email: string, password: string) {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, rememberMe: false }),
  });
}

beforeAll(async () => {
  replicaSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  Object.assign(process.env, {
    MONGODB_URI: replicaSet.getUri(),
    MONGODB_DB: 'shatvika_auth_integration',
    CUSTOMER_JWT_SECRET: CUSTOMER_SECRET,
    ADMIN_JWT_SECRET: ADMIN_SECRET,
    WORKER_JWT_SECRET: WORKER_SECRET,
    COUNTER_LOCATION_ID: 'counter-one',
  });
  await connectToMongo();
  await Promise.all([User.syncIndexes(), Admin.syncIndexes(), Worker.syncIndexes(), RateLimitBucket.syncIndexes(), Feature.syncIndexes()]);
}, 300_000);

beforeEach(async () => {
  Object.assign(process.env, {
    CUSTOMER_JWT_SECRET: CUSTOMER_SECRET,
    ADMIN_JWT_SECRET: ADMIN_SECRET,
    WORKER_JWT_SECRET: WORKER_SECRET,
    COUNTER_LOCATION_ID: 'counter-one',
  });
  cookieStore.get.mockReset();
  cookieStore.set.mockReset();
  await Promise.all([
    User.deleteMany({}),
    Admin.deleteMany({}),
    Worker.deleteMany({}),
    RateLimitBucket.deleteMany({}),
    Feature.deleteMany({}),
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await replicaSet?.stop();
  delete process.env.MONGODB_URI;
  delete process.env.MONGODB_DB;
  delete process.env.CUSTOMER_JWT_SECRET;
  delete process.env.ADMIN_JWT_SECRET;
  delete process.env.WORKER_JWT_SECRET;
  delete process.env.COUNTER_LOCATION_ID;
});

describe('login routes on an isolated MongoDB replica set', () => {
  it('authenticates a customer and creates an HTTP-only signed session', async () => {
    const password = 'Correct horse battery staple 42!';
    await User.create({
      email: 'customer@example.test',
      password: await bcrypt.hash(password, 10),
      fullName: 'Isolated Customer',
      phone: '9999999999',
    });

    const response = await customerLogin(loginRequest('/api/auth/login', 'customer@example.test', password));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(cookieStore.set).toHaveBeenCalledWith(
      'customer_session',
      expect.stringMatching(/^[^.]+\.[^.]+\.[^.]+$/),
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/' }),
    );
  });

  it('returns 401 for invalid customer credentials without revealing account existence', async () => {
    const response = await customerLogin(loginRequest('/api/auth/login', 'absent@example.test', 'Wrong password 42!'));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'INVALID_CREDENTIALS',
      message: 'Invalid credentials',
    });
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it('returns the configuration 503 when the customer session secret is missing', async () => {
    delete process.env.CUSTOMER_JWT_SECRET;
    const response = await customerLogin(loginRequest('/api/auth/login', 'customer@example.test', 'Any password 42!'));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'AUTH_CONFIGURATION_UNAVAILABLE' });
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it('authenticates an active administrator with the admin session secret', async () => {
    const password = 'Admin password 42!';
    await Admin.create({
      email: 'admin@example.test',
      password: await bcrypt.hash(password, 10),
      role: 'admin',
      permissions: ['*'],
      isActive: true,
    });

    const response = await adminLogin(loginRequest('/admin/api/login', 'admin@example.test', password));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(cookieStore.set).toHaveBeenCalledWith(
      'admin_session',
      expect.stringMatching(/^[^.]+\.[^.]+\.[^.]+$/),
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/' }),
    );
  });

  it('authenticates only an active worker and scopes the session to the assigned counter', async () => {
    const password = 'Worker password 42!';
    await Worker.create({
      name: 'Counter One', email: 'worker@example.test', password: await bcrypt.hash(password, 12),
      role: 'worker', locationId: 'counter-one', permissions: ['counter:operate'], isActive: true,
    });
    await User.create({
      email: 'customer-only@example.test', password: await bcrypt.hash(password, 12), fullName: 'Customer Only',
    });

    const response = await workerLogin(loginRequest('/counter/api/login', 'worker@example.test', password));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, worker: { name: 'Counter One', locationId: 'counter-one' } });
    expect(cookieStore.set).toHaveBeenCalledWith(WORKER_COOKIE_NAME, expect.any(String), expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/', maxAge: 43_200 }));
    const workerSessionToken = cookieStore.set.mock.calls.find(call => call[0] === WORKER_COOKIE_NAME)?.[1] as string;
    cookieStore.get.mockImplementation((name: string) => name === WORKER_COOKIE_NAME ? { value: workerSessionToken } : undefined);
    const queueResponse = await counterQueue(new NextRequest('http://localhost/api/counter/orders?businessDate=2026-09-27'));
    expect(queueResponse.status).toBe(200);
    await expect(queueResponse.json()).resolves.toMatchObject({ ok: true, locationId: 'counter-one', orders: [] });

    const customerRejected = await workerLogin(loginRequest('/counter/api/login', 'customer-only@example.test', password));
    expect(customerRejected.status).toBe(401);
    const customerRoleToken = await signSessionToken({
      accountId: '507f1f77bcf86cd799439011', role: 'customer', sessionVersion: 0,
      lifetimeSeconds: 600, secret: WORKER_SECRET, tokenId: 'customer-role-counter-api-test',
    });
    cookieStore.get.mockImplementation((name: string) => name === WORKER_COOKIE_NAME ? { value: customerRoleToken } : undefined);
    const customerQueueResponse = await counterQueue(new NextRequest('http://localhost/api/counter/orders?businessDate=2026-09-27'));
    expect(customerQueueResponse.status).toBe(401);
  });

  it('enforces admin authorization for worker management and revokes sessions on reset/deactivation', async () => {
    const unauthorized = await listWorkers(new Request('http://localhost/api/admin/workers') as any);
    expect(unauthorized.status).toBe(401);

    const admin = await Admin.create({
      email: 'worker-admin@example.test', password: await bcrypt.hash('Admin password 42!', 12),
      role: 'admin', permissions: ['workers:manage'], isActive: true,
    });
    const adminToken = await signSessionToken({
      accountId: String(admin._id), role: 'admin', sessionVersion: 0,
      lifetimeSeconds: 600, secret: ADMIN_SECRET, tokenId: 'worker-admin-session-test',
    });
    cookieStore.get.mockImplementation((name: string) => name === 'admin_session' ? { value: adminToken } : undefined);

    const legacyWorker = await Worker.create({
      name: 'Legacy Location', email: 'legacy-location@example.test', password: await bcrypt.hash('Legacy worker 42!', 12),
      role: 'worker', locationId: 'counter-two', permissions: ['counter:operate'], isActive: true,
    });
    const legacyLocationToken = await signSessionToken({
      accountId: String(legacyWorker._id), role: 'worker', sessionVersion: 0,
      lifetimeSeconds: 600, secret: WORKER_SECRET, tokenId: 'legacy-location-session-test',
    });
    const assignmentResponse = await updateWorker(new Request(`http://localhost/api/admin/workers/${String(legacyWorker._id)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'assign_location', locationId: 'counter-one' }),
    }) as any, { params: Promise.resolve({ id: String(legacyWorker._id) }) });
    expect(assignmentResponse.status).toBe(200);
    await expect(assignmentResponse.json()).resolves.toMatchObject({
      ok: true, worker: { locationId: 'counter-one', locationMatches: true },
    });
    expect((await verifyWorkerTokenState(legacyLocationToken)).status).toBe('invalid');
    const reassignedLogin = await workerLogin(loginRequest(
      '/counter/api/login',
      'legacy-location@example.test',
      'Legacy worker 42!',
    ));
    expect(reassignedLogin.status).toBe(200);
    await expect(reassignedLogin.json()).resolves.toMatchObject({
      ok: true,
      worker: { name: 'Legacy Location', locationId: 'counter-one' },
    });

    const wrongLocationResponse = await createWorker(new Request('http://localhost/api/admin/workers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Wrong Location', email: 'wrong-location@example.test', password: 'Managed worker 42!', locationId: 'counter-two' }),
    }) as any);
    expect(wrongLocationResponse.status).toBe(400);
    await expect(wrongLocationResponse.json()).resolves.toMatchObject({
      ok: false, error: 'INVALID_COUNTER_LOCATION', expectedLocationId: 'counter-one',
    });
    expect(await Worker.exists({ email: 'wrong-location@example.test' })).toBeNull();

    const createdResponse = await createWorker(new Request('http://localhost/api/admin/workers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Managed Worker', email: 'managed@example.test', password: 'Managed worker 42!', locationId: 'counter-one' }),
    }) as any);
    expect(createdResponse.status).toBe(201);
    const createdBody = await createdResponse.json() as any;
    expect(createdBody.worker).toMatchObject({ email: 'managed@example.test', locationId: 'counter-one', locationMatches: true, isActive: true });
    const stored = await Worker.findById(createdBody.worker.id).select('+password +passwordVersion').lean();
    expect(stored?.password).not.toBe('Managed worker 42!');

    const workerToken = await signSessionToken({
      accountId: createdBody.worker.id, role: 'worker', sessionVersion: 0,
      lifetimeSeconds: 600, secret: WORKER_SECRET, tokenId: 'managed-worker-session-test',
    });
    expect((await verifyWorkerTokenState(workerToken)).status).toBe('valid');

    const resetResponse = await updateWorker(new Request(`http://localhost/api/admin/workers/${createdBody.worker.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset_password', password: 'Replacement worker 84!' }),
    }) as any, { params: Promise.resolve({ id: createdBody.worker.id }) });
    expect(resetResponse.status).toBe(200);
    expect((await verifyWorkerTokenState(workerToken)).status).toBe('invalid');

    const resetWorker = await Worker.findById(createdBody.worker.id).select('+passwordVersion').lean();
    const postResetToken = await signSessionToken({
      accountId: createdBody.worker.id, role: 'worker', sessionVersion: resetWorker?.passwordVersion ?? -1,
      lifetimeSeconds: 600, secret: WORKER_SECRET, tokenId: 'managed-worker-post-reset-session-test',
    });
    expect((await verifyWorkerTokenState(postResetToken)).status).toBe('valid');
    const deactivateResponse = await updateWorker(new Request(`http://localhost/api/admin/workers/${createdBody.worker.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'deactivate' }),
    }) as any, { params: Promise.resolve({ id: createdBody.worker.id }) });
    expect(deactivateResponse.status).toBe(200);
    expect((await verifyWorkerTokenState(postResetToken)).status).toBe('account_disabled');

    const duplicateResponse = await createWorker(new Request('http://localhost/api/admin/workers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Duplicate', email: 'managed@example.test', password: 'Duplicate worker 42!', locationId: 'counter-one' }),
    }) as any);
    expect(duplicateResponse.status).toBe(409);
    expect(await Worker.countDocuments({ email: 'managed@example.test' })).toBe(1);
  });

  it('keeps admin content create/update payloads aligned with the strict feature contract', async () => {
    const admin = await Admin.create({
      email: 'content-admin@example.test', password: await bcrypt.hash('Admin password 42!', 12),
      role: 'admin', permissions: ['*'], isActive: true,
    });
    const token = await signSessionToken({
      accountId: String(admin._id), role: 'admin', sessionVersion: 0,
      lifetimeSeconds: 600, secret: ADMIN_SECRET, tokenId: 'content-admin-session-test',
    });
    cookieStore.get.mockImplementation((name: string) => name === 'admin_session' ? { value: token } : undefined);

    const createdResponse = await createContent(new NextRequest('http://localhost/api/content?type=feature', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Fast counter collection', description: 'Prepared for counter pickup.', emoji: '✓', gradient: 'from-orange-500 to-amber-500' }),
    }));
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json() as { id: string };

    const updatedResponse = await updateContent(new NextRequest(`http://localhost/api/content?type=feature&id=${created.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Reliable counter collection' }),
    }));
    expect(updatedResponse.status).toBe(200);
    await expect(updatedResponse.json()).resolves.toMatchObject({
      id: created.id,
      title: 'Reliable counter collection',
      description: 'Prepared for counter pickup.',
    });

    const invalidResponse = await createContent(new NextRequest('http://localhost/api/content?type=feature', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'client-only-id', title: 'Invalid', description: 'Strict contract', emoji: 'X', gradient: 'none' }),
    }));
    expect(invalidResponse.status).toBe(400);
    await expect(invalidResponse.json()).resolves.toMatchObject({ ok: false, error: 'VALIDATION_FAILED' });
  });

  it.each([
    { label: 'wrong password', email: 'login-worker@example.test', password: 'Wrong worker password 42!' },
    { label: 'nonexistent email', email: 'absent-worker@example.test', password: 'Worker password 42!' },
  ])('returns 401 for $label without revealing account existence', async ({ email, password }) => {
    await Worker.create({
      name: 'Login Worker', email: 'login-worker@example.test', password: await bcrypt.hash('Worker password 42!', 12),
      role: 'worker', locationId: 'counter-one', permissions: ['counter:operate'], isActive: true,
    });
    const response = await workerLogin(loginRequest('/counter/api/login', email, password));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'INVALID_CREDENTIALS' });
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'inactive account', isActive: false, permissions: ['counter:operate'], rawRole: false },
    { label: 'missing permission', isActive: true, permissions: [], rawRole: false },
    { label: 'wrong role', isActive: true, permissions: ['counter:operate'], rawRole: true },
  ])('returns 401 for a worker record with $label', async ({ isActive, permissions, rawRole }) => {
    const password = 'Worker password 42!';
    if (rawRole) {
      await Worker.collection.insertOne({
        name: 'Wrong Role', email: 'restricted-worker@example.test', password: await bcrypt.hash(password, 12),
        passwordVersion: 0, role: 'admin', locationId: 'counter-one', permissions, isActive,
        createdAt: new Date(), updatedAt: new Date(),
      } as any);
    } else {
      await Worker.create({
        name: 'Restricted Worker', email: 'restricted-worker@example.test', password: await bcrypt.hash(password, 12),
        role: 'worker', locationId: 'counter-one', permissions, isActive,
      });
    }
    const response = await workerLogin(loginRequest('/counter/api/login', 'restricted-worker@example.test', password));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'INVALID_CREDENTIALS' });
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it('returns AUTH_UNAVAILABLE only when the independent worker secret is missing', async () => {
    delete process.env.WORKER_JWT_SECRET;
    const response = await workerLogin(loginRequest('/counter/api/login', 'worker@example.test', 'Worker password 42!'));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'AUTH_UNAVAILABLE' });
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it('rejects a valid worker assigned to a different counter with a specific error', async () => {
    const password = 'Worker password 42!';
    await Worker.create({
      name: 'Other Counter', email: 'other-counter@example.test', password: await bcrypt.hash(password, 12),
      role: 'worker', locationId: 'counter-two', permissions: ['counter:operate'], isActive: true,
    });
    const response = await workerLogin(loginRequest('/counter/api/login', 'other-counter@example.test', password));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'WORKER_LOCATION_MISMATCH' });
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it('rejects expired and tampered worker sessions and clears the cookie on logout', async () => {
    const worker = await Worker.create({
      name: 'Session Worker', email: 'session-worker@example.test', password: await bcrypt.hash('Worker password 42!', 12),
      role: 'worker', locationId: 'counter-one', permissions: ['counter:operate'], isActive: true,
    });
    const expired = await signSessionToken({
      accountId: String(worker._id), role: 'worker', sessionVersion: 0,
      lifetimeSeconds: 60, secret: WORKER_SECRET,
      nowSeconds: Math.floor(Date.now() / 1000) - 120,
      tokenId: 'expired-worker-session-test',
    });
    expect((await verifyWorkerTokenState(expired)).status).toBe('invalid');

    const valid = await signSessionToken({
      accountId: String(worker._id), role: 'worker', sessionVersion: 0,
      lifetimeSeconds: 600, secret: WORKER_SECRET, tokenId: 'tampered-worker-session-test',
    });
    const [header, payload, signature] = valid.split('.');
    const tampered = `${header}.${payload}.${signature.startsWith('a') ? 'b' : 'a'}${signature.slice(1)}`;
    expect((await verifyWorkerTokenState(tampered)).status).toBe('invalid');

    const logoutResponse = await workerLogout();
    expect(logoutResponse.status).toBe(200);
    await expect(logoutResponse.json()).resolves.toEqual({ ok: true });
    expect(cookieStore.set).toHaveBeenCalledWith(WORKER_COOKIE_NAME, '', expect.objectContaining({ httpOnly: true, maxAge: 0, path: '/' }));
  });

  it('returns 401 from protected counter APIs and keeps worker sessions out of admin APIs', async () => {
    const unauthenticatedQueue = await counterQueue(new NextRequest('http://localhost/api/counter/orders'));
    expect(unauthenticatedQueue.status).toBe(401);

    const worker = await Worker.create({
      name: 'No Admin', email: 'no-admin@example.test', password: await bcrypt.hash('Worker password 42!', 12),
      role: 'worker', locationId: 'counter-one', permissions: ['counter:operate'], isActive: true,
    });
    const token = await signSessionToken({
      accountId: String(worker._id), role: 'worker', sessionVersion: 0,
      lifetimeSeconds: 600, secret: WORKER_SECRET, tokenId: 'worker-cannot-admin-test',
    });
    cookieStore.get.mockImplementation((name: string) => name === WORKER_COOKIE_NAME ? { value: token } : undefined);
    const adminResponse = await listWorkers(new Request('http://localhost/api/admin/workers') as any);
    expect(adminResponse.status).toBe(401);
  });
});
