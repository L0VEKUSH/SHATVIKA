import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
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
import { connectToMongo } from '@/lib/mongoose';
import { Admin } from '@/models/Admin';
import { RateLimitBucket } from '@/models/RateLimitBucket';
import { User } from '@/models/User';

let replicaSet: MongoMemoryReplSet;

const CUSTOMER_SECRET = 'isolated-customer-session-secret-000000000000000000';
const ADMIN_SECRET = 'isolated-admin-session-secret-000000000000000000000';

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
  });
  await connectToMongo();
  await Promise.all([User.syncIndexes(), Admin.syncIndexes(), RateLimitBucket.syncIndexes()]);
}, 300_000);

beforeEach(async () => {
  Object.assign(process.env, {
    CUSTOMER_JWT_SECRET: CUSTOMER_SECRET,
    ADMIN_JWT_SECRET: ADMIN_SECRET,
  });
  cookieStore.get.mockReset();
  cookieStore.set.mockReset();
  await Promise.all([
    User.deleteMany({}),
    Admin.deleteMany({}),
    RateLimitBucket.deleteMany({}),
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await replicaSet?.stop();
  delete process.env.MONGODB_URI;
  delete process.env.MONGODB_DB;
  delete process.env.CUSTOMER_JWT_SECRET;
  delete process.env.ADMIN_JWT_SECRET;
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
});
