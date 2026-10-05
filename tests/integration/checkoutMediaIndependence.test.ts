import mongoose from 'mongoose';
import { NextRequest } from 'next/server';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { POST as createOrder } from '@/app/api/user/orders/route';
import { connectToMongo } from '@/lib/mongoose';
import { InventoryEvent } from '@/models/InventoryEvent';
import { MenuItem } from '@/models/MenuItem';
import { Order } from '@/models/Order';
import { RateLimitBucket } from '@/models/RateLimitBucket';
import { TokenCounter } from '@/models/TokenCounter';
import { User } from '@/models/User';
import { GuestSession } from '@/models/GuestSession';

let replicaSet: MongoMemoryReplSet;

const checkoutRules = {
  TAX_RATE_BASIS_POINTS: '500',
  MAX_QUANTITY_PER_ITEM: '10',
  TARGET_PREPARATION_MINUTES: '20',
  BUSINESS_TIME_ZONE: 'Asia/Kolkata',
  COUNTER_LOCATION_ID: 'route-test-counter',
  COUNTER_LOCATION_NAME: 'Route Test Counter',
  COUNTER_TOKEN_PREFIX: 'SC',
};

function orderRequest(menuItemId: string, variantId: string, idempotencyKey: string, cookie?: string) {
  return new NextRequest('http://localhost/api/user/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({
      fulfillmentType: 'counter',
      items: [{ menuItemId, variantId, quantity: 1 }],
      paymentMethod: 'counter',
    }),
  });
}

beforeAll(async () => {
  replicaSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  process.env.MONGODB_URI = replicaSet.getUri();
  process.env.MONGODB_DB = 'shatvika_checkout_media_independence';
  await connectToMongo();
  await Promise.all([
    User.syncIndexes(),
    MenuItem.syncIndexes(),
    Order.syncIndexes(),
    TokenCounter.syncIndexes(),
    InventoryEvent.syncIndexes(),
    RateLimitBucket.syncIndexes(),
    GuestSession.syncIndexes(),
  ]);
}, 300_000);

beforeEach(async () => {
  Object.assign(process.env, checkoutRules);
  delete process.env.MEDIA_STORAGE_PROVIDER;
  delete process.env.CLOUDINARY_CLOUD_NAME;
  delete process.env.CLOUDINARY_API_KEY;
  delete process.env.CLOUDINARY_API_SECRET;
  await Promise.all([
    User.deleteMany({}),
    MenuItem.deleteMany({}),
    Order.deleteMany({}),
    TokenCounter.deleteMany({}),
    InventoryEvent.deleteMany({}),
    RateLimitBucket.deleteMany({}),
    GuestSession.deleteMany({}),
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await replicaSet?.stop();
  delete process.env.MONGODB_URI;
  delete process.env.MONGODB_DB;
});

describe('counter checkout is independent from durable media storage', () => {
  it('creates and recovers one unpaid order while upload credentials are absent', async () => {
    const variantId = new mongoose.Types.ObjectId().toString();
    const product = await MenuItem.create({
      name: 'No-storage checkout item',
      description: 'Isolated checkout route fixture',
      variants: [{ id: variantId, name: 'Regular', price: 125, available: true }],
      category: 'Momos',
      emoji: 'T',
      gradientClass: 'from-orange-100 to-red-100',
      quantity: 2,
    });

    const firstResponse = await createOrder(orderRequest(
      String(product._id),
      variantId,
      'checkout-without-media-storage',
    ));
    const firstBody = await firstResponse.json();

    expect(firstResponse.status).toBe(201);
    expect(firstResponse.headers.get('x-shatvika-operation')).toBe('counter-order');
    expect(firstBody).toMatchObject({
      ok: true,
      fulfillmentType: 'counter',
      paymentMethod: 'counter',
      paymentStatus: 'pending',
      orderStatus: 'placed',
      deliveryChargePaise: 0,
      duplicate: false,
    });
    expect(firstBody.tokenNumber).toMatch(/^\d{3,}$/);
    const guestCookie = firstResponse.headers.get('set-cookie')?.split(';', 1)[0];
    expect(guestCookie).toMatch(/^shatvika_guest=/);

    const retryResponse = await createOrder(orderRequest(
      String(product._id),
      variantId,
      'checkout-without-media-storage',
      guestCookie,
    ));
    const retryBody = await retryResponse.json();

    expect(retryResponse.status).toBe(200);
    expect(retryBody).toMatchObject({
      ok: true,
      orderId: firstBody.orderId,
      tokenNumber: firstBody.tokenNumber,
      duplicate: true,
    });
    expect(await Order.countDocuments()).toBe(1);
    expect((await MenuItem.findById(product._id).lean())?.quantity).toBe(1);
  });

  it('reports the real checkout configuration error instead of an upload error', async () => {
    const product = await MenuItem.create({
      name: 'Missing-tax checkout item',
      basePrice: 100,
      category: 'Momos',
      emoji: 'T',
      gradientClass: 'from-orange-100 to-red-100',
      quantity: 2,
    });
    delete process.env.TAX_RATE_BASIS_POINTS;

    const response = await createOrder(orderRequest(
      String(product._id),
      'base',
      'checkout-missing-tax-rule',
    ));

    expect(response.status).toBe(503);
    expect(response.headers.get('x-shatvika-operation')).toBe('counter-order');
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'CHECKOUT_NOT_CONFIGURED',
      details: { missing: ['TAX_RATE_BASIS_POINTS'] },
    });
    expect(await Order.countDocuments()).toBe(0);
    expect((await MenuItem.findById(product._id).lean())?.quantity).toBe(2);
  });
});
