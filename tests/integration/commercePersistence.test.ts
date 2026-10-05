import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectToMongo } from '@/lib/mongoose';
import {
  createCustomerOrder,
  OrderServiceError,
  recordCashPayment,
  recordCounterPayment,
  transitionOrder,
} from '@/lib/orders/service';
import { Coupon } from '@/models/Coupon';
import { CouponUsage } from '@/models/CouponUsage';
import { ContactMessage } from '@/models/ContactMessage';
import { InventoryEvent } from '@/models/InventoryEvent';
import { MenuItem } from '@/models/MenuItem';
import { Order } from '@/models/Order';
import { PaymentEvent } from '@/models/PaymentEvent';
import { Review } from '@/models/Review';
import { User } from '@/models/User';
import { TokenCounter } from '@/models/TokenCounter';
import { GuestSession } from '@/models/GuestSession';
import { hashGuestSessionToken } from '@/lib/guestSession';
import { GET as getCustomerOrder } from '@/app/api/user/orders/[id]/route';
import { NextRequest } from 'next/server';

let replicaSet: MongoMemoryReplSet;

const rules = {
  TAX_RATE_BASIS_POINTS: '500',
  DELIVERY_FEE_PAISE: '4000',
  FREE_DELIVERY_THRESHOLD_PAISE: '50000',
  SERVICEABLE_POSTAL_CODES: '110001',
  MAX_QUANTITY_PER_ITEM: '10',
  TARGET_PREPARATION_MINUTES: '20',
  BUSINESS_TIME_ZONE: 'Asia/Kolkata',
  COUNTER_LOCATION_ID: 'test-counter',
  COUNTER_LOCATION_NAME: 'Test Counter',
  COUNTER_TOKEN_PREFIX: 'SC',
};

async function createUser(email: string) {
  return User.create({
    email,
    // Models persist an already-hashed credential; hashing behavior is tested at the auth boundary.
    password: '$2b$12$M2V8OqAPd8n4MxnqNcaXq.Q9rxjhPl4OlRP31p6IXpIb82A6Y8sUe',
    fullName: 'Isolated Test Customer',
    phone: '9999999999',
    addresses: [{
      label: 'Test address',
      street: '1 Test Street',
      city: 'Delhi',
      state: 'Delhi',
      zipCode: '110001',
      phone: '9999999999',
      isDefault: false,
    }],
  });
}

async function createBaseProduct(overrides: Record<string, unknown> = {}) {
  return MenuItem.create({
    name: `Test item ${new mongoose.Types.ObjectId()}`,
    description: 'Isolated integration fixture',
    basePrice: 100,
    costPaise: 6000,
    category: 'Momos',
    emoji: 'T',
    gradientClass: 'from-amber-100 to-orange-100',
    quantity: 10,
    reorderPoint: 2,
    ...overrides,
  });
}

function checkoutInput(_user: any, product: any, quantity = 1, couponCode?: string) {
  return {
    items: [{ menuItemId: String(product._id), variantId: 'base', quantity }],
    fulfillmentType: 'counter' as const,
    paymentMethod: 'counter' as const,
    couponCode,
  };
}

beforeAll(async () => {
  replicaSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  process.env.MONGODB_URI = replicaSet.getUri();
  process.env.MONGODB_DB = 'shatvika_integration';
  await connectToMongo();
  await Promise.all([
    User.syncIndexes(),
    MenuItem.syncIndexes(),
    Coupon.syncIndexes(),
    CouponUsage.syncIndexes(),
    ContactMessage.syncIndexes(),
    Order.syncIndexes(),
    PaymentEvent.syncIndexes(),
    TokenCounter.syncIndexes(),
    InventoryEvent.syncIndexes(),
    Review.syncIndexes(),
    GuestSession.syncIndexes(),
  ]);
}, 300_000);

beforeEach(async () => {
  Object.assign(process.env, rules);
  await Promise.all([
    User.deleteMany({}),
    MenuItem.deleteMany({}),
    Coupon.deleteMany({}),
    CouponUsage.deleteMany({}),
    ContactMessage.deleteMany({}),
    Order.deleteMany({}),
    PaymentEvent.deleteMany({}),
    TokenCounter.deleteMany({}),
    InventoryEvent.deleteMany({}),
    Review.deleteMany({}),
    GuestSession.deleteMany({}),
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await replicaSet?.stop();
  delete process.env.MONGODB_URI;
  delete process.env.MONGODB_DB;
});

describe('transactional commerce persistence on MongoDB replica set', () => {
  it('creates one persistent unpaid guest order and denies another browser access by order ID or token knowledge', async () => {
    const product = await createBaseProduct();
    const ownerToken = 'owner-browser-token-that-is-long-and-random-enough-0001';
    const otherToken = 'other-browser-token-that-is-long-and-random-enough-0002';
    const [owner] = await Promise.all([
      GuestSession.create({ tokenHash: hashGuestSessionToken(ownerToken), expiresAt: new Date(Date.now() + 86_400_000), lastSeenAt: new Date() }),
      GuestSession.create({ tokenHash: hashGuestSessionToken(otherToken), expiresAt: new Date(Date.now() + 86_400_000), lastSeenAt: new Date() }),
    ]);

    const first = await createCustomerOrder({
      guestSessionId: String(owner._id), identityType: 'guest', input: checkoutInput(null, product), idempotencyKey: 'guest-checkout-retry-0001',
    });
    const retry = await createCustomerOrder({
      guestSessionId: String(owner._id), identityType: 'guest', input: checkoutInput(null, product), idempotencyKey: 'guest-checkout-retry-0001',
    });
    expect(retry).toMatchObject({ orderId: first.orderId, tokenNumber: first.tokenNumber, duplicate: true, paymentStatus: 'pending' });
    expect(await Order.countDocuments({ guestSessionId: owner._id })).toBe(1);

    const ownedResponse = await getCustomerOrder(
      new NextRequest(`http://localhost/api/user/orders/${first.orderId}`, { headers: { cookie: `shatvika_guest=${ownerToken}` } }),
      { params: Promise.resolve({ id: first.orderId }) },
    );
    expect(ownedResponse.status).toBe(200);
    const deniedResponse = await getCustomerOrder(
      new NextRequest(`http://localhost/api/user/orders/${first.orderId}`, { headers: { cookie: `shatvika_guest=${otherToken}` } }),
      { params: Promise.resolve({ id: first.orderId }) },
    );
    expect(deniedResponse.status).toBe(404);
  });

  it('runs Mongoose 9 save/update middleware and persists authoritative snapshots', async () => {
    const user = await createUser('persistence@example.test');
    expect(user.addresses[0].isDefault).toBe(true);

    const product = await createBaseProduct({ quantity: 3 });
    expect(product.basePricePaise).toBe(10_000);
    const updatedProduct = await MenuItem.findByIdAndUpdate(
      product._id,
      { $set: { basePrice: 105.5 } },
      { returnDocument: 'after', runValidators: true },
    );
    expect(updatedProduct?.basePricePaise).toBe(10_550);

    const coupon = await Coupon.create({
      code: 'SAVE10',
      discountType: 'fixed',
      discountValue: 10,
      minOrderValue: 50,
      usageLimit: 5,
      perCustomerLimit: 1,
      startsAt: new Date('2026-01-01T00:00:00.000Z'),
      expiresAt: new Date('2027-01-01T00:00:00.000Z'),
    });
    expect(coupon.fixedDiscountPaise).toBe(1_000);
    const updatedCoupon = await Coupon.findByIdAndUpdate(
      coupon._id,
      { $set: { discountType: 'fixed', discountValue: 12.5 } },
      { returnDocument: 'after', runValidators: true },
    );
    expect(updatedCoupon?.fixedDiscountPaise).toBe(1_250);

    const placed = await createCustomerOrder({
      userId: String(user._id),
      input: {
        ...checkoutInput(user, updatedProduct, 1, 'SAVE10'),
        // Repeated lines are aggregated before the inventory write.
        items: [
          { menuItemId: String(product._id), variantId: 'base', quantity: 1 },
          { menuItemId: String(product._id), variantId: 'base', quantity: 1 },
        ],
      },
      idempotencyKey: 'checkout-persistence-1',
      now: new Date('2026-06-15T12:00:00.000Z'),
    });
    const persisted = await Order.findById(placed.orderId).lean();
    expect(persisted).toMatchObject({
      subtotalPaise: 21_100,
      discountPaise: 1_250,
      taxPaise: 993,
      deliveryChargePaise: 0,
      totalPaise: 20_843,
      paymentStatus: 'pending',
      paymentMethod: 'counter',
      orderStatus: 'placed',
      fulfillmentType: 'counter',
      tokenBusinessDate: '2026-06-15',
      tokenSequence: 1,
      tokenNumber: '001',
      inventoryState: 'committed',
      customerSnapshot: { name: 'Isolated Test Customer', email: 'persistence@example.test' },
    });
    expect(persisted?.items[0]).toMatchObject({
      productName: updatedProduct?.name,
      categoryId: 'momos',
      categoryName: 'Momos',
      unitCostPaise: 6000,
      quantity: 2,
    });
    expect((await MenuItem.findById(product._id).lean())?.quantity).toBe(1);
    expect((await CouponUsage.findOne({ couponId: coupon._id, userId: user._id }).lean())?.count).toBe(1);

    const retry = await createCustomerOrder({
      userId: String(user._id),
      input: {
        ...checkoutInput(user, updatedProduct, 1, 'SAVE10'),
        items: [
          { menuItemId: String(product._id), variantId: 'base', quantity: 1 },
          { menuItemId: String(product._id), variantId: 'base', quantity: 1 },
        ],
      },
      idempotencyKey: 'checkout-persistence-1',
      now: new Date('2026-06-15T12:01:00.000Z'),
    });
    expect(retry).toMatchObject({ orderId: placed.orderId, duplicate: true });
    expect((await MenuItem.findById(product._id).lean())?.quantity).toBe(1);

    await expect(createCustomerOrder({
      userId: String(user._id),
      input: checkoutInput(user, updatedProduct, 1),
      idempotencyKey: 'checkout-persistence-1',
    })).rejects.toMatchObject<Partial<OrderServiceError>>({ code: 'IDEMPOTENCY_KEY_REUSED', status: 409 });
  });

  it('allows only one concurrent buyer to reserve the last shared-variant stock', async () => {
    const [firstUser, secondUser] = await Promise.all([
      createUser('buyer-one@example.test'),
      createUser('buyer-two@example.test'),
    ]);
    const product = await MenuItem.create({
      name: 'Shared inventory variants',
      variants: [
        { id: 'small', name: 'Small', price: 80, costPaise: 4000 },
        { id: 'large', name: 'Large', price: 120, costPaise: 6000 },
      ],
      category: 'Fries',
      emoji: 'V',
      gradientClass: 'from-yellow-100 to-orange-100',
      quantity: 1,
    });

    const results = await Promise.allSettled([
      createCustomerOrder({
        userId: String(firstUser._id),
        input: {
          ...checkoutInput(firstUser, product),
          items: [{ menuItemId: String(product._id), variantId: 'small', quantity: 1 }],
        },
        idempotencyKey: 'last-stock-buyer-one',
      }),
      createCustomerOrder({
        userId: String(secondUser._id),
        input: {
          ...checkoutInput(secondUser, product),
          items: [{ menuItemId: String(product._id), variantId: 'large', quantity: 1 }],
        },
        idempotencyKey: 'last-stock-buyer-two',
      }),
    ]);

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: 'INSUFFICIENT_STOCK', status: 409, details: { available: 0, requested: 1 } });
    expect(await Order.countDocuments()).toBe(1);
    expect((await MenuItem.findById(product._id).lean())?.quantity).toBe(0);
  });

  it('requires an explicit decision for ambiguous legacy inventory and supports unlimited items', async () => {
    const user = await createUser('inventory-mode@example.test');
    const legacy = await createBaseProduct({ name: 'Legacy inventory ambiguity', quantity: 2 });
    await MenuItem.collection.updateOne(
      { _id: legacy._id },
      { $unset: { inventoryMode: '', quantity: '' } },
    );
    await expect(createCustomerOrder({
      userId: String(user._id),
      input: checkoutInput(user, legacy),
      idempotencyKey: 'legacy-inventory-unconfigured',
    })).rejects.toMatchObject({ code: 'INVENTORY_NOT_CONFIGURED', status: 409 });
    expect(await Order.countDocuments()).toBe(0);

    const unlimited = await createBaseProduct({ name: 'Made to order unlimited', quantity: 0 });
    await MenuItem.updateOne({ _id: unlimited._id }, { $set: { inventoryMode: 'unlimited' } });
    const placed = await createCustomerOrder({
      userId: String(user._id),
      input: checkoutInput(user, unlimited),
      idempotencyKey: 'unlimited-inventory-order',
    });
    expect(await MenuItem.findById(unlimited._id).lean()).toMatchObject({ quantity: 0, quantitySold: 1 });
    expect((await Order.findById(placed.orderId).lean())?.items[0]).toMatchObject({ inventoryMode: 'unlimited' });
    await transitionOrder({
      orderId: placed.orderId,
      nextStatus: 'cancelled',
      actor: { type: 'customer', id: String(user._id) },
      expectedVersion: 0,
      reason: 'Changed my mind',
    });
    expect(await MenuItem.findById(unlimited._id).lean()).toMatchObject({ quantity: 0, quantitySold: 0 });
    expect(await InventoryEvent.countDocuments({ orderId: placed.orderId })).toBe(0);
  });

  it('allocates unique daily location tokens atomically and resets only at the business-date boundary', async () => {
    const product = await createBaseProduct({ name: 'Token concurrency item', quantity: 20 });
    const users = await Promise.all(Array.from({ length: 6 }, (_, index) => createUser(`token-${index}@example.test`)));
    const beforeMidnight = new Date('2026-06-15T18:29:59.000Z'); // 23:59:59 Asia/Kolkata
    const placed = await Promise.all(users.map((user, index) => createCustomerOrder({
      userId: String(user._id),
      input: checkoutInput(user, product),
      idempotencyKey: `concurrent-token-${index}`,
      now: beforeMidnight,
    })));
    expect(new Set(placed.map(order => order.orderId)).size).toBe(6);
    expect(placed.map(order => order.tokenNumber).sort()).toEqual([
      '001', '002', '003', '004', '005', '006',
    ]);
    expect(new Set(placed.map(order => order.tokenBusinessDate))).toEqual(new Set(['2026-06-15']));

    const nextUser = await createUser('next-business-day@example.test');
    const nextDay = await createCustomerOrder({
      userId: String(nextUser._id),
      input: checkoutInput(nextUser, product),
      idempotencyKey: 'next-day-token-1',
      now: new Date('2026-06-15T18:30:00.000Z'), // 00:00:00 next day in Asia/Kolkata
    });
    expect(nextDay).toMatchObject({ tokenBusinessDate: '2026-06-16', tokenNumber: '001' });
    expect(await TokenCounter.countDocuments({ locationId: 'test-counter' })).toBe(2);
  });

  it('rolls back partial writes and compensates a cancellation exactly once', async () => {
    const user = await createUser('rollback@example.test');
    const first = await createBaseProduct({ name: 'Rollback first', quantity: 2 });
    const second = await createBaseProduct({ name: 'Rollback second', quantity: 0 });

    await expect(createCustomerOrder({
      userId: String(user._id),
      input: {
        ...checkoutInput(user, first),
        items: [
          { menuItemId: String(first._id), variantId: 'base', quantity: 1 },
          { menuItemId: String(second._id), variantId: 'base', quantity: 1 },
        ],
      },
      idempotencyKey: 'transaction-rollback-1',
    })).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    expect((await MenuItem.findById(first._id).lean())?.quantity).toBe(2);
    expect(await Order.countDocuments()).toBe(0);

    const placed = await createCustomerOrder({
      userId: String(user._id),
      input: checkoutInput(user, first),
      idempotencyKey: 'cancellation-compensate-1',
    });
    const cancelled = await transitionOrder({
      orderId: placed.orderId,
      nextStatus: 'cancelled',
      actor: { type: 'customer', id: String(user._id) },
      expectedVersion: 0,
      reason: 'Placed by mistake',
    });
    expect(cancelled.inventoryState).toBe('released');
    expect((await MenuItem.findById(first._id).lean())?.quantity).toBe(2);

    await transitionOrder({
      orderId: placed.orderId,
      nextStatus: 'cancelled',
      actor: { type: 'customer', id: String(user._id) },
      expectedVersion: 0,
      reason: 'Retry of the same request',
    });
    expect((await MenuItem.findById(first._id).lean())?.quantity).toBe(2);
  });

  it('enforces coupon dates and a concurrent global redemption cap atomically', async () => {
    const [firstUser, secondUser] = await Promise.all([
      createUser('coupon-one@example.test'),
      createUser('coupon-two@example.test'),
    ]);
    const product = await createBaseProduct({ name: 'Coupon race item', quantity: 5 });
    await Coupon.create({
      code: 'ONLYONCE',
      discountType: 'percentage',
      discountValue: 10,
      minOrderValue: 0,
      usageLimit: 1,
      perCustomerLimit: 1,
      startsAt: new Date('2026-06-01T00:00:00.000Z'),
      expiresAt: new Date('2026-07-01T00:00:00.000Z'),
    });

    const attempts = await Promise.allSettled([
      createCustomerOrder({
        userId: String(firstUser._id),
        input: checkoutInput(firstUser, product, 1, 'ONLYONCE'),
        idempotencyKey: 'coupon-race-one',
        now: new Date('2026-06-15T00:00:00.000Z'),
      }),
      createCustomerOrder({
        userId: String(secondUser._id),
        input: checkoutInput(secondUser, product, 1, 'ONLYONCE'),
        idempotencyKey: 'coupon-race-two',
        now: new Date('2026-06-15T00:00:00.000Z'),
      }),
    ]);
    expect(attempts.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect((attempts.find(result => result.status === 'rejected') as PromiseRejectedResult).reason)
      .toMatchObject({ code: 'COUPON_LIMIT_REACHED', status: 409 });
    expect((await Coupon.findOne({ code: 'ONLYONCE' }).lean())?.usageCount).toBe(1);
    expect(await CouponUsage.countDocuments({ count: 1 })).toBe(1);
    expect(await Order.countDocuments()).toBe(1);

    await expect(createCustomerOrder({
      userId: String(firstUser._id),
      input: checkoutInput(firstUser, product, 1, 'ONLYONCE'),
      idempotencyKey: 'coupon-before-start',
      now: new Date('2026-05-31T23:59:59.999Z'),
    })).rejects.toMatchObject({ code: 'COUPON_NOT_STARTED', status: 400 });
    await expect(createCustomerOrder({
      userId: String(firstUser._id),
      input: checkoutInput(firstUser, product, 1, 'ONLYONCE'),
      idempotencyKey: 'coupon-at-expiry',
      now: new Date('2026-07-01T00:00:00.000Z'),
    })).rejects.toMatchObject({ code: 'EXPIRED_COUPON', status: 400 });
  });

  it('fingerprints manual-payment idempotency keys', async () => {
    const user = await createUser('payment@example.test');
    const product = await createBaseProduct();
    const placed = await createCustomerOrder({
      userId: String(user._id),
      input: checkoutInput(user, product),
      idempotencyKey: 'payment-order-1',
    });
    const first = await recordCashPayment({
      orderId: placed.orderId,
      action: 'collect',
      amountPaise: placed.totalPaise,
      actorId: new mongoose.Types.ObjectId().toString(),
      idempotencyKey: 'cash-operation-1',
      note: 'Deposit',
    });
    const actorId = String(first.event.recordedById);
    const duplicate = await recordCashPayment({
      orderId: placed.orderId,
      action: 'collect',
      amountPaise: placed.totalPaise,
      actorId,
      idempotencyKey: 'cash-operation-1',
      note: 'Deposit',
    });
    expect(duplicate.duplicate).toBe(true);
    await expect(recordCashPayment({
      orderId: placed.orderId,
      action: 'collect',
      amountPaise: placed.totalPaise - 1,
      actorId,
      idempotencyKey: 'cash-operation-1',
      note: 'Deposit',
    })).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED', status: 409 });
  });

  it('keeps payment separate from preparation, verifies UPI, and makes duplicate worker actions safe', async () => {
    const user = await createUser('worker-lifecycle@example.test');
    const product = await createBaseProduct({ name: 'Worker lifecycle item', quantity: 3 });
    const placed = await createCustomerOrder({
      userId: String(user._id), input: checkoutInput(user, product), idempotencyKey: 'worker-lifecycle-order',
    });
    const workerId = new mongoose.Types.ObjectId().toString();
    const accepted = await transitionOrder({
      orderId: placed.orderId, nextStatus: 'accepted', actor: { type: 'worker', id: workerId, name: 'Test Worker' },
      expectedVersion: 0, requiredLocationId: 'test-counter',
    });
    const preparing = await transitionOrder({
      orderId: placed.orderId, nextStatus: 'preparing', actor: { type: 'worker', id: workerId, name: 'Test Worker' },
      expectedVersion: accepted.stateVersion, requiredLocationId: 'test-counter',
    });
    expect(preparing.paymentStatus).toBe('pending');
    const ready = await transitionOrder({
      orderId: placed.orderId, nextStatus: 'ready', actor: { type: 'worker', id: workerId, name: 'Test Worker' },
      expectedVersion: preparing.stateVersion, requiredLocationId: 'test-counter',
    });
    await expect(transitionOrder({
      orderId: placed.orderId, nextStatus: 'served', actor: { type: 'worker', id: workerId, name: 'Test Worker' },
      expectedVersion: ready.stateVersion, requiredLocationId: 'test-counter',
    })).rejects.toMatchObject({ code: 'PAYMENT_REQUIRED_BEFORE_SERVING', status: 409 });
    await expect(recordCounterPayment({
      orderId: placed.orderId, action: 'collect', method: 'upi', amountPaise: placed.totalPaise,
      actorId: workerId, actorType: 'worker', idempotencyKey: 'upi-without-proof', requiredLocationId: 'test-counter',
    })).rejects.toMatchObject({ code: 'UPI_RECEIPT_VERIFICATION_REQUIRED', status: 400 });

    const paymentAttempts = await Promise.all([
      recordCounterPayment({
        orderId: placed.orderId, action: 'collect', method: 'upi', amountPaise: placed.totalPaise,
        actorId: workerId, actorType: 'worker', actorName: 'Test Worker', idempotencyKey: 'verified-upi-payment',
        transactionReference: 'MERCHANT-REF-101', receiptVerified: true, requiredLocationId: 'test-counter',
      }),
      recordCounterPayment({
        orderId: placed.orderId, action: 'collect', method: 'upi', amountPaise: placed.totalPaise,
        actorId: workerId, actorType: 'worker', actorName: 'Test Worker', idempotencyKey: 'verified-upi-payment',
        transactionReference: 'MERCHANT-REF-101', receiptVerified: true, requiredLocationId: 'test-counter',
      }),
    ]);
    expect(paymentAttempts.filter(result => result.duplicate)).toHaveLength(1);
    expect(await PaymentEvent.countDocuments({ orderId: placed.orderId })).toBe(1);

    const servedAttempts = await Promise.all([
      transitionOrder({
        orderId: placed.orderId, nextStatus: 'served', actor: { type: 'worker', id: workerId, name: 'Test Worker' },
        expectedVersion: ready.stateVersion, requiredLocationId: 'test-counter',
      }),
      transitionOrder({
        orderId: placed.orderId, nextStatus: 'served', actor: { type: 'worker', id: workerId, name: 'Test Worker' },
        expectedVersion: ready.stateVersion, requiredLocationId: 'test-counter',
      }),
    ]);
    expect(servedAttempts.every(order => order.orderStatus === 'served')).toBe(true);
    expect((await Order.findById(placed.orderId).lean())?.servedByName).toBe('Test Worker');
    await expect(transitionOrder({
      orderId: placed.orderId, nextStatus: 'cancelled', actor: { type: 'worker', id: workerId },
      expectedVersion: 4, reason: 'Too late', requiredLocationId: 'different-counter',
    })).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND', status: 404 });
  });

  it('records prepared cancellation as wastage and leaves a paid cancellation pending refund until completed', async () => {
    const user = await createUser('wastage-refund@example.test');
    const product = await createBaseProduct({ name: 'Wastage item', quantity: 4 });
    const preparedOrder = await createCustomerOrder({
      userId: String(user._id), input: checkoutInput(user, product), idempotencyKey: 'prepared-cancel-order',
    });
    const workerId = new mongoose.Types.ObjectId().toString();
    await transitionOrder({ orderId: preparedOrder.orderId, nextStatus: 'accepted', actor: { type: 'worker', id: workerId }, expectedVersion: 0 });
    await transitionOrder({ orderId: preparedOrder.orderId, nextStatus: 'preparing', actor: { type: 'worker', id: workerId }, expectedVersion: 1 });
    const cancelledPrepared = await transitionOrder({
      orderId: preparedOrder.orderId, nextStatus: 'cancelled', actor: { type: 'worker', id: workerId },
      expectedVersion: 2, reason: 'Customer did not want the prepared item',
    });
    expect(cancelledPrepared.inventoryState).toBe('consumed');
    expect(await InventoryEvent.countDocuments({ orderId: preparedOrder.orderId, type: 'wastage' })).toBe(1);
    expect(await MenuItem.findById(product._id).lean()).toMatchObject({ quantity: 3, quantitySold: 0, quantityWasted: 1 });

    const paidOrder = await createCustomerOrder({
      userId: String(user._id), input: checkoutInput(user, product), idempotencyKey: 'paid-cancel-order',
    });
    const adminId = new mongoose.Types.ObjectId().toString();
    await recordCounterPayment({
      orderId: paidOrder.orderId, action: 'collect', method: 'cash', amountPaise: paidOrder.totalPaise,
      actorId: adminId, idempotencyKey: 'paid-cancel-cash',
    });
    const cancelledPaid = await transitionOrder({
      orderId: paidOrder.orderId, nextStatus: 'cancelled', actor: { type: 'admin', id: adminId },
      expectedVersion: 0, reason: 'Counter could not fulfil',
    });
    expect(cancelledPaid).toMatchObject({ paymentStatus: 'paid', refundDuePaise: paidOrder.totalPaise });
    const refunded = await recordCounterPayment({
      orderId: paidOrder.orderId, action: 'refund', method: 'cash', amountPaise: paidOrder.totalPaise,
      actorId: adminId, idempotencyKey: 'paid-cancel-refund',
    });
    expect(refunded.order).toMatchObject({ paymentStatus: 'refunded', refundDuePaise: 0 });
  });

  it('updates ownerless legacy orders without retroactively requiring modern owner or address snapshots', async () => {
    const legacyId = new mongoose.Types.ObjectId();
    await Order.collection.insertOne({
      _id: legacyId,
      items: [{
        menuItemId: new mongoose.Types.ObjectId(),
        name: 'Historical item',
        quantity: 1,
        unitPrice: 75,
        totalPrice: 75,
      }],
      subtotal: 75,
      discount: 0,
      tax: 0,
      deliveryCharge: 0,
      totalAmount: 75,
      paymentMethod: 'cash',
      paymentStatus: 'pending',
      orderStatus: 'pending',
      stateVersion: 0,
      statusHistory: [],
      inventoryState: 'unknown',
      createdAt: new Date('2025-01-01T12:00:00.000Z'),
      updatedAt: new Date('2025-01-01T12:00:00.000Z'),
    } as any);

    const accepted = await transitionOrder({
      orderId: String(legacyId),
      nextStatus: 'accepted',
      actor: { type: 'admin', id: new mongoose.Types.ObjectId().toString() },
      expectedVersion: 0,
      now: new Date('2025-01-01T12:05:00.000Z'),
    });
    expect(accepted).toMatchObject({ orderStatus: 'accepted', stateVersion: 1 });
    expect(accepted.userId).toBeNull();
    expect(accepted.guestSessionId).toBeNull();
    expect(accepted.deliveryAddress).toBeNull();

    await expect(Order.create({
      fulfillmentType: 'counter',
      items: [{ menuItemId: new mongoose.Types.ObjectId(), name: 'Invalid new order', quantity: 1, unitPrice: 10, totalPrice: 10 }],
      subtotal: 10,
      discount: 0,
      tax: 0,
      deliveryCharge: 0,
      totalAmount: 10,
      paymentMethod: 'counter',
    })).rejects.toMatchObject({ name: 'ValidationError' });
  });

  it('executes the explicitly enabled Mongoose 9 review update pipeline', async () => {
    const user = await createUser('review-pipeline@example.test');
    const product = await createBaseProduct({ name: 'Reviewed integration item' });
    const review = await Review.create({
      name: 'Isolated Test Customer',
      rating: 4,
      text: 'A verified isolated integration review.',
      userId: user._id,
      menuItemId: product._id,
      status: 'approved',
      verifiedPurchase: true,
      helpfulVoters: [],
      helpfulCount: 0,
    });

    const updated = await Review.findOneAndUpdate(
      { _id: review._id, status: 'approved' },
      [
        { $set: { helpfulVoters: { $setUnion: [{ $ifNull: ['$helpfulVoters', []] }, ['v1:test-voter']] } } },
        { $set: { helpfulCount: { $size: '$helpfulVoters' } } },
      ],
      { returnDocument: 'after', updatePipeline: true },
    ).lean();

    expect(updated).toMatchObject({ helpfulVoters: ['v1:test-voter'], helpfulCount: 1 });
  });

  it('persists contact follow-up state without changing the submitted message', async () => {
    const created = await ContactMessage.create({
      name: 'Isolated Contact',
      email: 'contact@example.test',
      phone: '9999999999',
      subject: 'feedback',
      message: 'This message is isolated test data for contact follow-up.',
    });
    const adminId = new mongoose.Types.ObjectId();
    const handledAt = new Date('2026-06-15T12:30:00.000Z');
    const updated = await ContactMessage.findByIdAndUpdate(created._id, {
      $set: {
        status: 'replied',
        adminNote: 'Follow-up recorded in the isolated test database.',
        handledAt,
        handledBy: adminId,
      },
    }, { returnDocument: 'after', runValidators: true }).lean();

    expect(updated).toMatchObject({
      status: 'replied',
      message: 'This message is isolated test data for contact follow-up.',
      adminNote: 'Follow-up recorded in the isolated test database.',
      handledAt,
      handledBy: adminId,
    });
  });
});
