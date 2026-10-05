import mongoose, { type ClientSession } from 'mongoose';
import { connectToMongo } from '@/lib/mongoose';
import { calculateOrderTotals, getBusinessRules, getFulfillmentCapabilities } from '@/lib/businessRules';
import { availableQuantity, resolveInventoryMode, type InventoryMode } from '@/lib/inventory';
import { legacyRupeesOrPaise, paiseToRupees, percentageOfPaise } from '@/lib/money';
import { requestFingerprint } from '@/lib/orders/fingerprint';
import { allocateOrderToken } from '@/lib/orders/token';
import {
  assertOrderTransition,
  type OrderActorType,
  type OrderStatus,
} from '@/lib/orders/stateMachine';
import { Coupon } from '@/models/Coupon';
import { CouponUsage } from '@/models/CouponUsage';
import { MenuItem } from '@/models/MenuItem';
import { InventoryEvent } from '@/models/InventoryEvent';
import { Order } from '@/models/Order';
import { PaymentEvent } from '@/models/PaymentEvent';
import { User } from '@/models/User';

export type CheckoutLine = {
  menuItemId: string;
  variantId?: string;
  quantity: number;
};

export type CheckoutInput = {
  items: CheckoutLine[];
  fulfillmentType?: 'counter';
  paymentMethod: 'counter' | 'cash';
  couponCode?: string;
  specialInstructions?: string;
};

export type CheckoutIdentityType = 'guest' | 'google' | 'registered';

export type OrderActor = {
  type: OrderActorType;
  id: string;
  name?: string;
};

export class OrderServiceError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(code);
    this.name = 'OrderServiceError';
  }
}

function normalizeLines(lines: CheckoutLine[], maximum: number): CheckoutLine[] {
  const grouped = new Map<string, CheckoutLine>();
  for (const line of lines) {
    const variantId = line.variantId?.trim() || 'base';
    const key = `${line.menuItemId}:${variantId}`;
    const existing = grouped.get(key);
    const quantity = (existing?.quantity ?? 0) + line.quantity;
    if (quantity > maximum) {
      throw new OrderServiceError('QUANTITY_LIMIT_EXCEEDED', 400, {
        menuItemId: line.menuItemId,
        variantId,
        maximum,
      });
    }
    grouped.set(key, { menuItemId: line.menuItemId, variantId, quantity });
  }
  return [...grouped.values()].sort((a, b) =>
    `${a.menuItemId}:${a.variantId}`.localeCompare(`${b.menuItemId}:${b.variantId}`),
  );
}

function isDuplicateKey(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 11000);
}

function costBreakdownSnapshot(value: unknown, total: number | null) {
  if (!value || typeof value !== 'object' || total == null) return null;
  const source = value as Record<string, unknown>;
  const ingredientPaise = Number(source.ingredientPaise ?? 0);
  const productPaise = Number(source.productPaise ?? 0);
  const packagingPaise = Number(source.packagingPaise ?? 0);
  if (![ingredientPaise, productPaise, packagingPaise].every(entry => Number.isSafeInteger(entry) && entry >= 0)) return null;
  if (ingredientPaise + productPaise + packagingPaise !== total) return null;
  return { ingredientPaise, productPaise, packagingPaise };
}

function serializeOrderResult(order: any, duplicate: boolean) {
  return {
    orderId: String(order._id),
    orderNumber: order.tokenNumber ?? String(order._id).slice(-8),
    tokenNumber: order.tokenNumber ?? null,
    tokenBusinessDate: order.tokenBusinessDate ?? null,
    fulfillmentType: order.fulfillmentType ?? 'delivery',
    fulfillmentLocationId: order.fulfillmentLocationId ?? null,
    fulfillmentLocationName: order.fulfillmentLocationName ?? null,
    totalAmount: Number(order.totalAmount),
    totalPaise: Number(order.totalPaise),
    subtotalPaise: Number(order.subtotalPaise),
    discountPaise: Number(order.discountPaise),
    taxPaise: Number(order.taxPaise),
    deliveryChargePaise: Number(order.deliveryChargePaise),
    items: (order.items ?? []).map((item: any) => ({
      menuItemId: String(item.menuItemId),
      name: item.productName ?? item.name,
      variantName: item.variantName,
      quantity: Number(item.quantity),
      unitPricePaise: Number(item.unitPricePaise),
      totalPricePaise: Number(item.totalPricePaise),
    })),
    createdAt: new Date(order.createdAt).toISOString(),
    estimatedReadyTime: order.estimatedReadyTime ? new Date(order.estimatedReadyTime).toISOString() : null,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    orderStatus: order.orderStatus,
    stateVersion: Number(order.stateVersion ?? 0),
    duplicate,
  };
}

async function reserveCoupon({
  code,
  userId,
  guestSessionId,
  subtotalPaise,
  orderItems,
  session,
  now,
}: {
  code: string;
  userId: mongoose.Types.ObjectId | null;
  guestSessionId: mongoose.Types.ObjectId | null;
  subtotalPaise: number;
  orderItems: any[];
  session: ClientSession;
  now: Date;
}) {
  const coupon = await Coupon.findOne({ code: code.toUpperCase() }).session(session).lean();
  if (!coupon || !coupon.isActive) throw new OrderServiceError('INVALID_COUPON', 400);
  if (coupon.startsAt && new Date(coupon.startsAt) > now) throw new OrderServiceError('COUPON_NOT_STARTED', 400);
  if (!coupon.expiresAt || new Date(coupon.expiresAt) <= now) throw new OrderServiceError('EXPIRED_COUPON', 400);

  const minOrderPaise = legacyRupeesOrPaise(coupon.minOrderPaise, coupon.minOrderValue, 'coupon minimum');
  if (subtotalPaise < minOrderPaise) {
    throw new OrderServiceError('MIN_ORDER_NOT_MET', 400, { minOrderPaise });
  }

  const categories = new Set<string>(coupon.applicableCategories ?? []);
  const eligibleSubtotalPaise = categories.size === 0
    ? subtotalPaise
    : orderItems.reduce((sum, item) => (
      categories.has(item.categoryId) || categories.has(item.categoryName)
        ? sum + item.totalPricePaise
        : sum
    ), 0);
  if (eligibleSubtotalPaise === 0) throw new OrderServiceError('COUPON_NOT_APPLICABLE', 400);

  let discountPaise: number;
  if (coupon.discountType === 'percentage') {
    const basisPoints = Math.round(Number(coupon.discountValue) * 100);
    if (basisPoints <= 0 || basisPoints > 10000) throw new OrderServiceError('INVALID_COUPON_RULE', 500);
    discountPaise = percentageOfPaise(eligibleSubtotalPaise, basisPoints);
  } else {
    discountPaise = legacyRupeesOrPaise(
      coupon.fixedDiscountPaise,
      coupon.discountValue,
      'fixed coupon discount',
    );
  }
  discountPaise = Math.min(discountPaise, eligibleSubtotalPaise);

  if (coupon.maxDiscountPaise !== null || coupon.maxDiscount !== null) {
    const cap = legacyRupeesOrPaise(coupon.maxDiscountPaise, coupon.maxDiscount, 'coupon cap');
    discountPaise = Math.min(discountPaise, cap);
  }

  const globalFilter: Record<string, unknown> = {
    _id: coupon._id,
    isActive: true,
    expiresAt: { $gt: now },
    $and: [
      { $or: [{ startsAt: null }, { startsAt: { $exists: false } }, { startsAt: { $lte: now } }] },
      coupon.usageLimit == null
        ? {}
        : { usageCount: { $lt: coupon.usageLimit } },
    ],
  };
  const couponIncrement: Record<string, unknown> = { $inc: { usageCount: 1 } };
  if (userId) couponIncrement.$addToSet = { usedBy: userId };
  const reserved = await Coupon.findOneAndUpdate(
    globalFilter,
    couponIncrement,
    { returnDocument: 'after', session },
  ).lean();
  if (!reserved) throw new OrderServiceError('COUPON_LIMIT_REACHED', 409);

  const perCustomerLimit = Number(coupon.perCustomerLimit ?? 1);
  const usageOwner = userId ? { userId } : { guestSessionId };
  const usage = await CouponUsage.findOneAndUpdate(
    { couponId: coupon._id, ...usageOwner },
    { $setOnInsert: { count: 0 } },
    { upsert: true, returnDocument: 'after', session },
  );
  if (!usage || usage.count >= perCustomerLimit) {
    throw new OrderServiceError('COUPON_CUSTOMER_LIMIT_REACHED', 409);
  }
  const incremented = await CouponUsage.findOneAndUpdate(
    { _id: usage._id, count: { $lt: perCustomerLimit } },
    { $inc: { count: 1 } },
    { returnDocument: 'after', session },
  );
  if (!incremented) throw new OrderServiceError('COUPON_CUSTOMER_LIMIT_REACHED', 409);

  return { coupon, discountPaise, eligibleSubtotalPaise };
}

export async function createCustomerOrder({
  userId,
  guestSessionId,
  recoveryGuestSessionId,
  identityType,
  customerName,
  input,
  idempotencyKey,
  now = new Date(),
}: {
  userId?: string;
  guestSessionId?: string;
  recoveryGuestSessionId?: string;
  identityType?: CheckoutIdentityType;
  customerName?: string | null;
  input: CheckoutInput;
  idempotencyKey: string;
  now?: Date;
}) {
  const hasAccountOwner = Boolean(userId && mongoose.isValidObjectId(userId));
  const hasGuestOwner = Boolean(guestSessionId && mongoose.isValidObjectId(guestSessionId));
  if (hasAccountOwner === hasGuestOwner) throw new OrderServiceError('UNAUTHENTICATED', 401);
  if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 128) {
    throw new OrderServiceError('IDEMPOTENCY_KEY_REQUIRED', 400);
  }
  if (!['counter', 'cash'].includes(input.paymentMethod)) {
    throw new OrderServiceError('PAYMENT_METHOD_UNAVAILABLE', 400, {
      availableMethods: ['counter'],
      reason: 'Payment is recorded only after cash or UPI is verified at the counter',
    });
  }

  const rules = getBusinessRules();
  const lines = normalizeLines(input.items, rules.maxQuantityPerItem);
  const capabilities = getFulfillmentCapabilities();
  const fingerprint = requestFingerprint({
    fulfillmentType: 'counter', paymentMethod: 'counter',
    couponCode: input.couponCode?.trim().toUpperCase() || null,
    specialInstructions: input.specialInstructions?.trim() || null,
    customerName: customerName?.trim() || null,
    items: lines,
  });
  const userObjectId = hasAccountOwner ? new mongoose.Types.ObjectId(userId) : null;
  const guestObjectId = hasGuestOwner ? new mongoose.Types.ObjectId(guestSessionId) : null;
  const recoveryGuestObjectId = userObjectId && recoveryGuestSessionId && mongoose.isValidObjectId(recoveryGuestSessionId)
    ? new mongoose.Types.ObjectId(recoveryGuestSessionId)
    : null;
  const ownerFilter = userObjectId ? { userId: userObjectId } : { guestSessionId: guestObjectId };
  const ownerActorId = userObjectId ? String(userObjectId) : String(guestObjectId);
  const ownerActorType: OrderActorType = userObjectId ? 'customer' : 'guest';

  await connectToMongo();
  const session = await mongoose.startSession();
  let result: ReturnType<typeof serializeOrderResult> | null = null;

  try {
    await session.withTransaction(async () => {
      const existing = await Order.findOne({ ...ownerFilter, idempotencyKey }).session(session).lean();
      if (existing) {
        if (existing.requestFingerprint !== fingerprint) {
          throw new OrderServiceError('IDEMPOTENCY_KEY_REUSED', 409);
        }
        result = serializeOrderResult(existing, true);
        return;
      }
      if (recoveryGuestObjectId) {
        const guestRetry = await Order.findOne({ guestSessionId: recoveryGuestObjectId, idempotencyKey }).session(session);
        if (guestRetry) {
          if (guestRetry.requestFingerprint !== fingerprint) throw new OrderServiceError('IDEMPOTENCY_KEY_REUSED', 409);
          if (guestRetry.claimedByUserId && String(guestRetry.claimedByUserId) !== String(userObjectId)) {
            throw new OrderServiceError('IDEMPOTENCY_KEY_REUSED', 409);
          }
          guestRetry.claimedByUserId = userObjectId;
          guestRetry.claimedAt ??= now;
          guestRetry.customerIdentityType = identityType ?? 'registered';
          await guestRetry.save({ session });
          result = serializeOrderResult(guestRetry, true);
          return;
        }
      }

      const user = userObjectId
        ? await User.findById(userObjectId)
          .select('_id fullName email phone isActive authProvider')
          .session(session)
          .lean()
        : null;
      if (userObjectId && (!user || user.isActive === false)) throw new OrderServiceError('USER_NOT_FOUND', 404);

      if (guestObjectId) {
        const configuredLimit = Number(process.env.MAX_OUTSTANDING_GUEST_ORDERS ?? 5);
        const outstandingLimit = Number.isSafeInteger(configuredLimit) && configuredLimit >= 1 && configuredLimit <= 20
          ? configuredLimit
          : 5;
        const outstanding = await Order.countDocuments({
          guestSessionId: guestObjectId,
          claimedByUserId: null,
          orderStatus: { $nin: ['served', 'delivered', 'cancelled'] },
          paymentStatus: { $in: ['pending', 'failed'] },
        }).session(session);
        if (outstanding >= outstandingLimit) {
          throw new OrderServiceError('GUEST_OUTSTANDING_ORDER_LIMIT', 429, { maximum: outstandingLimit });
        }
      }

      const productIds = [...new Set(lines.map((line) => line.menuItemId))];
      if (productIds.some((id) => !mongoose.isValidObjectId(id))) {
        throw new OrderServiceError('INVALID_MENU_ITEM_ID', 400);
      }
      const products = await MenuItem.find({ _id: { $in: productIds } }).session(session).lean();
      const productMap = new Map(products.map((product: any) => [String(product._id), product]));
      const orderId = new mongoose.Types.ObjectId();

      const orderItems: any[] = [];
      const inventoryModeByProduct = new Map<string, InventoryMode>();
      let subtotalPaise = 0;
      for (const line of lines) {
        const product: any = productMap.get(line.menuItemId);
        if (!product || product.available === false) throw new OrderServiceError('MENU_ITEM_UNAVAILABLE', 409);
        const inventoryMode = resolveInventoryMode(product);
        if (inventoryMode === 'unconfigured') {
          throw new OrderServiceError('INVENTORY_NOT_CONFIGURED', 409, {
            menuItemId: line.menuItemId,
            available: null,
          });
        }
        inventoryModeByProduct.set(line.menuItemId, inventoryMode);

        const variants: any[] = product.variants ?? [];
        const isBase = variants.length === 0 && (line.variantId === 'base' || !line.variantId);
        const variant = isBase ? null : variants.find((entry) => entry.id === line.variantId);
        if (!isBase && (!variant || variant.available === false)) {
          throw new OrderServiceError('VARIANT_UNAVAILABLE', 409, { menuItemId: line.menuItemId });
        }

        const unitPricePaise = isBase
          ? legacyRupeesOrPaise(product.basePricePaise, product.basePrice, 'base price')
          : legacyRupeesOrPaise(variant.pricePaise, variant.price, 'variant price');
        const unitCostPaise = isBase
          ? (Number.isSafeInteger(product.costPaise) ? product.costPaise : null)
          : (Number.isSafeInteger(variant.costPaise) ? variant.costPaise : null);
        const unitCostBreakdown = costBreakdownSnapshot(isBase ? product.costBreakdown : variant.costBreakdown, unitCostPaise);
        const totalPricePaise = unitPricePaise * line.quantity;
        subtotalPaise += totalPricePaise;
        orderItems.push({
          menuItemId: product._id,
          name: product.name,
          productName: product.name,
          variantId: isBase ? 'base' : variant.id,
          variantName: isBase ? 'Regular' : variant.name,
          categoryId: product.categoryId || 'unknown',
          categoryName: product.category || 'Unknown',
          quantity: line.quantity,
          inventoryMode,
          unitPricePaise,
          totalPricePaise,
          unitCostPaise,
          unitCostBreakdown,
          unitPrice: paiseToRupees(unitPricePaise),
          totalPrice: paiseToRupees(totalPricePaise),
        });
      }

      const quantityByProduct = new Map<string, number>();
      for (const line of lines) {
        quantityByProduct.set(line.menuItemId, (quantityByProduct.get(line.menuItemId) ?? 0) + line.quantity);
      }
      for (const [menuItemId, quantity] of quantityByProduct) {
        const inventoryMode = inventoryModeByProduct.get(menuItemId);
        const stock = inventoryMode === 'unlimited'
          ? await MenuItem.updateOne(
              { _id: menuItemId, available: true, inventoryMode: 'unlimited' },
              { $inc: { quantitySold: quantity } },
              { session },
            )
          : await MenuItem.updateOne(
              {
                _id: menuItemId,
                available: true,
                quantity: { $gte: quantity },
                $or: [{ inventoryMode: 'tracked' }, { inventoryMode: { $exists: false } }],
              },
              { $inc: { quantity: -quantity, quantitySold: quantity } },
              { session },
            );
        if (stock.modifiedCount !== 1) {
          const current = await MenuItem.findById(menuItemId)
            .select('available inventoryMode quantity')
            .session(session)
            .lean();
          const available = availableQuantity(current ?? {});
          throw new OrderServiceError(
            current && resolveInventoryMode(current) === 'unconfigured'
              ? 'INVENTORY_NOT_CONFIGURED'
              : 'INSUFFICIENT_STOCK',
            409,
            { menuItemId, available, requested: quantity },
          );
        }
      }
      await InventoryEvent.insertMany(
        lines.filter(line => inventoryModeByProduct.get(line.menuItemId) === 'tracked').map(line => ({
          orderId,
          menuItemId: line.menuItemId,
          variantId: line.variantId ?? 'base',
          type: 'stock_reserved',
          quantity: line.quantity,
          quantityDelta: -line.quantity,
          reason: 'Counter order confirmed',
          actorType: ownerActorType,
          actorId: ownerActorId,
          occurredAt: now,
        })),
        { session },
      );

      let discountPaise = 0;
      let couponData: Awaited<ReturnType<typeof reserveCoupon>> | null = null;
      if (input.couponCode?.trim()) {
        couponData = await reserveCoupon({
          code: input.couponCode.trim(),
          userId: userObjectId,
          guestSessionId: guestObjectId,
          subtotalPaise,
          orderItems,
          session,
          now,
        });
        discountPaise = couponData.discountPaise;
      }

      const { taxablePaise, taxPaise, deliveryChargePaise, totalPaise } = calculateOrderTotals(
        subtotalPaise,
        discountPaise,
        rules,
        { fulfillmentType: 'counter' },
      );
      const token = await allocateOrderToken(session, now);
      const estimatedReadyTime = new Date(now.getTime() + rules.targetPreparationMinutes * 60_000);

      const [created] = await Order.create([{
        _id: orderId,
        userId: userObjectId,
        guestSessionId: guestObjectId,
        customerIdentityType: identityType ?? (userObjectId ? (user?.authProvider === 'google' ? 'google' : 'registered') : 'guest'),
        fulfillmentType: 'counter',
        fulfillmentLocationId: token.locationId,
        fulfillmentLocationName: token.locationName,
        tokenBusinessDate: token.businessDate,
        tokenSequence: token.sequence,
        tokenNumber: token.tokenNumber,
        customerSnapshot: {
          name: user?.fullName ?? customerName?.trim() ?? null,
          email: user?.email ?? null,
          phone: user?.phone ?? null,
        },
        items: orderItems,
        subtotalPaise,
        discountPaise,
        taxPaise,
        deliveryChargePaise,
        totalPaise,
        subtotal: paiseToRupees(subtotalPaise),
        discount: paiseToRupees(discountPaise),
        tax: paiseToRupees(taxPaise),
        deliveryCharge: paiseToRupees(deliveryChargePaise),
        totalAmount: paiseToRupees(totalPaise),
        couponCode: couponData?.coupon.code ?? null,
        couponId: couponData?.coupon._id ?? null,
        couponSnapshot: couponData ? {
          couponId: couponData.coupon._id,
          code: couponData.coupon.code,
          discountType: couponData.coupon.discountType,
          discountValue: couponData.coupon.discountValue,
          eligibleSubtotalPaise: couponData.eligibleSubtotalPaise,
        } : null,
        couponState: couponData ? 'redeemed' : 'none',
        idempotencyKey,
        requestFingerprint: fingerprint,
        paymentMethod: 'counter',
        paymentStatus: 'pending',
        collectedPaise: 0,
        refundedPaise: 0,
        refundDuePaise: 0,
        orderStatus: 'placed',
        stateVersion: 0,
        inventoryState: 'committed',
        statusHistory: [{
          fromStatus: null,
          status: 'placed',
          timestamp: now,
          actorType: ownerActorType,
          actorId: ownerActorId,
          note: 'Counter order placed',
        }],
        deliveryAddress: null,
        specialInstructions: input.specialInstructions?.trim() || null,
        estimatedDeliveryTime: null,
        estimatedReadyTime,
      }], { session });
      result = serializeOrderResult(created, false);
    });
  } catch (error) {
    if (isDuplicateKey(error)) {
      const existing = await Order.findOne({ ...ownerFilter, idempotencyKey }).lean();
      if (existing && existing.requestFingerprint === fingerprint) return serializeOrderResult(existing, true);
      throw new OrderServiceError('IDEMPOTENCY_KEY_REUSED', 409);
    }
    throw error;
  } finally {
    await session.endSession();
  }

  if (!result) throw new OrderServiceError('ORDER_TRANSACTION_FAILED', 500);
  return result;
}

async function compensateCancelledOrder(
  order: any,
  session: ClientSession,
  actor: OrderActor,
  reason: string,
  now: Date,
): Promise<void> {
  if (order.inventoryState === 'committed') {
    const quantityByProduct = new Map<string, { quantity: number; inventoryMode: InventoryMode }>();
    for (const item of order.items ?? []) {
      const id = String(item.menuItemId);
      // Historical orders predate the explicit snapshot and always decremented tracked stock.
      const inventoryMode: InventoryMode = item.inventoryMode === 'unlimited' ? 'unlimited' : 'tracked';
      const existing = quantityByProduct.get(id);
      quantityByProduct.set(id, {
        quantity: (existing?.quantity ?? 0) + Number(item.quantity),
        inventoryMode,
      });
    }
    const isCounter = order.fulfillmentType === 'counter';
    const canRestock = !isCounter || ['placed', 'pending', 'accepted'].includes(order.orderStatus);
    for (const [menuItemId, inventory] of quantityByProduct) {
      const { quantity, inventoryMode } = inventory;
      await MenuItem.updateOne(
        { _id: menuItemId, quantitySold: { $gte: quantity } },
        { $inc: inventoryMode === 'unlimited'
          ? (canRestock ? { quantitySold: -quantity } : { quantitySold: -quantity, quantityWasted: quantity })
          : (canRestock
              ? { quantity, quantitySold: -quantity }
              : { quantitySold: -quantity, quantityWasted: quantity }) },
        { session },
      );
    }
    await InventoryEvent.insertMany(
      (order.items ?? []).filter((item: any) => item.inventoryMode !== 'unlimited').map((item: any) => ({
        menuItemId: item.menuItemId,
        variantId: item.variantId ?? 'base',
        orderId: order._id,
        type: canRestock ? 'stock_released' : 'wastage',
        quantity: Number(item.quantity),
        quantityDelta: canRestock ? Number(item.quantity) : 0,
        reason,
        actorType: actor.type,
        actorId: actor.id,
        occurredAt: now,
      })),
      { session },
    );
    order.inventoryState = canRestock ? 'released' : 'consumed';
  }

  if (order.couponState === 'redeemed' && order.couponId) {
    const usageOwner = order.userId
      ? { userId: order.userId }
      : { guestSessionId: order.guestSessionId };
    const usage = await CouponUsage.findOneAndUpdate(
      { couponId: order.couponId, ...usageOwner, count: { $gt: 0 } },
      { $inc: { count: -1 } },
      { returnDocument: 'after', session },
    );
    const couponUpdate: Record<string, unknown> = { $inc: { usageCount: -1 } };
    if (order.userId && (!usage || usage.count === 0)) couponUpdate.$pull = { usedBy: order.userId };
    await Coupon.updateOne({ _id: order.couponId, usageCount: { $gt: 0 } }, couponUpdate, { session });
    order.couponState = 'released';
  }
}

export async function transitionOrder({
  orderId,
  nextStatus,
  actor,
  expectedVersion,
  reason,
  note,
  allowUnpaidServeException = false,
  unpaidServeExceptionReason,
  requiredLocationId,
  now = new Date(),
}: {
  orderId: string;
  nextStatus: OrderStatus;
  actor: OrderActor;
  expectedVersion?: number;
  reason?: string;
  note?: string;
  allowUnpaidServeException?: boolean;
  unpaidServeExceptionReason?: string;
  requiredLocationId?: string;
  now?: Date;
}) {
  if (!mongoose.isValidObjectId(orderId)) throw new OrderServiceError('INVALID_ORDER_ID', 400);
  await connectToMongo();
  const session = await mongoose.startSession();
  let output: any;
  try {
    await session.withTransaction(async () => {
      const order = await Order.findById(orderId).session(session);
      if (!order) throw new OrderServiceError('ORDER_NOT_FOUND', 404);
      if (requiredLocationId && (
        order.fulfillmentType !== 'counter' || order.fulfillmentLocationId !== requiredLocationId
      )) {
        throw new OrderServiceError('ORDER_NOT_FOUND', 404);
      }
      if (actor.type === 'customer' && ![String(order.userId ?? ''), String(order.claimedByUserId ?? '')].includes(actor.id)) {
        throw new OrderServiceError('ORDER_NOT_FOUND', 404);
      }
      if (actor.type === 'guest' && String(order.guestSessionId) !== actor.id) {
        throw new OrderServiceError('ORDER_NOT_FOUND', 404);
      }
      if (order.orderStatus === nextStatus) {
        output = order;
        return;
      }
      if (expectedVersion !== undefined && Number(order.stateVersion) !== expectedVersion) {
        throw new OrderServiceError('STALE_ORDER_VERSION', 409, {
          currentVersion: Number(order.stateVersion),
          currentStatus: order.orderStatus,
        });
      }
      try {
        assertOrderTransition(order.orderStatus as OrderStatus, nextStatus, actor.type);
      } catch {
        throw new OrderServiceError('INVALID_ORDER_TRANSITION', 409, {
          currentStatus: order.orderStatus,
          requestedStatus: nextStatus,
          actorType: actor.type,
        });
      }

      const isCounter = order.fulfillmentType === 'counter';
      if (isCounter && ['out_for_delivery', 'delivered'].includes(nextStatus)) {
        throw new OrderServiceError('FULFILLMENT_TRANSITION_MISMATCH', 409);
      }
      if (!isCounter && nextStatus === 'served') {
        throw new OrderServiceError('FULFILLMENT_TRANSITION_MISMATCH', 409);
      }
      if (nextStatus === 'cancelled' && !reason?.trim()) {
        throw new OrderServiceError('CANCELLATION_REASON_REQUIRED', 400);
      }
      if (nextStatus === 'served' && order.paymentStatus !== 'paid') {
        const exceptionReason = unpaidServeExceptionReason?.trim() || '';
        if (!allowUnpaidServeException || actor.type !== 'admin' || exceptionReason.length < 3) {
          throw new OrderServiceError('PAYMENT_REQUIRED_BEFORE_SERVING', 409, {
            paymentStatus: order.paymentStatus,
            outstandingPaise: Math.max(0, Number(order.totalPaise) - Number(order.collectedPaise ?? 0)),
          });
        }
        order.unpaidServeException = true;
        order.unpaidServeExceptionBy = actor.id;
        order.unpaidServeExceptionReason = exceptionReason;
      }

      if (nextStatus === 'cancelled') {
        await compensateCancelledOrder(order, session, actor, reason?.trim() || 'Order cancelled', now);
        order.cancelledAt = now;
        order.cancellationReason = reason?.trim() || null;
        const collected = Number.isSafeInteger(order.collectedPaise) ? order.collectedPaise : 0;
        const refunded = Number.isSafeInteger(order.refundedPaise) ? order.refundedPaise : 0;
        order.refundDuePaise = Math.max(0, collected - refunded);
      }
      if (nextStatus === 'delivered') order.actualDeliveryTime = now;
      if (nextStatus === 'served') {
        order.servedAt = now;
        order.servedById = actor.id;
        order.servedByName = actor.name?.trim() || null;
      }

      const fromStatus = order.orderStatus;
      order.orderStatus = nextStatus;
      order.stateVersion = Number(order.stateVersion ?? 0) + 1;
      order.statusHistory.push({
        fromStatus,
        status: nextStatus,
        timestamp: now,
        actorType: actor.type,
        actorId: actor.id,
        reason: reason?.trim() || null,
        note: note?.trim() || null,
      });
      await order.save({ session });
      output = order;
    });
  } finally {
    await session.endSession();
  }
  return output;
}

export async function recordCounterPayment({
  orderId,
  action,
  method,
  amountPaise,
  actorId,
  actorType = 'admin',
  actorName,
  idempotencyKey,
  transactionReference,
  receiptVerified = false,
  note,
  requiredLocationId,
  now = new Date(),
}: {
  orderId: string;
  action: 'collect' | 'refund';
  method: 'cash' | 'upi';
  amountPaise: number;
  actorId: string;
  actorType?: 'admin' | 'worker';
  actorName?: string;
  idempotencyKey: string;
  transactionReference?: string;
  receiptVerified?: boolean;
  note?: string;
  requiredLocationId?: string;
  now?: Date;
}) {
  if (!mongoose.isValidObjectId(orderId)) throw new OrderServiceError('INVALID_ORDER_ID', 400);
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
    throw new OrderServiceError('INVALID_PAYMENT_AMOUNT', 400);
  }
  if (idempotencyKey.length < 8 || idempotencyKey.length > 128) {
    throw new OrderServiceError('IDEMPOTENCY_KEY_REQUIRED', 400);
  }
  const reference = transactionReference?.trim() || null;
  if (reference && reference.length > 160) throw new OrderServiceError('INVALID_TRANSACTION_REFERENCE', 400);
  if (action === 'collect' && method === 'upi' && (!receiptVerified || !reference)) {
    throw new OrderServiceError('UPI_RECEIPT_VERIFICATION_REQUIRED', 400);
  }

  const fingerprint = requestFingerprint({ action, method, amountPaise, actorId, reference, note: note?.trim() || null });

  await connectToMongo();
  const session = await mongoose.startSession();
  let output: any;
  try {
    await session.withTransaction(async () => {
      const existing = await PaymentEvent.findOne({ orderId, idempotencyKey })
        .select('+requestFingerprint')
        .session(session)
        .lean();
      const order = await Order.findById(orderId).session(session);
      if (!order) throw new OrderServiceError('ORDER_NOT_FOUND', 404);
      if (requiredLocationId && (
        order.fulfillmentType !== 'counter' || order.fulfillmentLocationId !== requiredLocationId
      )) {
        throw new OrderServiceError('ORDER_NOT_FOUND', 404);
      }
      if (existing) {
        if (existing.requestFingerprint !== fingerprint) {
          throw new OrderServiceError('IDEMPOTENCY_KEY_REUSED', 409);
        }
        output = { order, event: existing, duplicate: true };
        return;
      }
      if (!['counter', 'cash', 'upi'].includes(order.paymentMethod)) {
        throw new OrderServiceError('PAYMENT_PROVIDER_ACTION_REQUIRED', 409);
      }

      const collected = Number.isSafeInteger(order.collectedPaise) ? Number(order.collectedPaise) : 0;
      const refunded = Number.isSafeInteger(order.refundedPaise) ? Number(order.refundedPaise) : 0;
      const total = Number(order.totalPaise);
      if (action === 'collect' && amountPaise > total - collected) {
        throw new OrderServiceError('PAYMENT_AMOUNT_EXCEEDS_OUTSTANDING', 409, {
          outstandingPaise: Math.max(0, total - collected),
        });
      }
      if (action === 'collect' && amountPaise !== total - collected) {
        throw new OrderServiceError('FULL_COUNTER_PAYMENT_REQUIRED', 409, {
          outstandingPaise: Math.max(0, total - collected),
        });
      }
      if (action === 'refund' && amountPaise > collected - refunded) {
        throw new OrderServiceError('REFUND_AMOUNT_EXCEEDS_COLLECTED', 409, {
          refundablePaise: Math.max(0, collected - refunded),
        });
      }

      const eventType = action === 'collect'
        ? method === 'cash' ? 'cash_collected' : 'payment_captured'
        : 'refund_succeeded';
      const [event] = await PaymentEvent.create([{
        orderId: order._id,
        userId: order.userId,
        guestSessionId: order.guestSessionId,
        type: eventType,
        status: 'succeeded',
        method,
        amountPaise,
        provider: method === 'upi' ? 'merchant_source_verified' : 'manual',
        providerReference: reference,
        idempotencyKey,
        requestFingerprint: fingerprint,
        occurredAt: now,
        recordedByType: actorType,
        recordedById: actorId,
        recordedByName: actorName?.trim() || null,
        note: note?.trim() || null,
      }], { session });

      if (action === 'collect') {
        order.collectedPaise = collected + amountPaise;
        order.paymentMethod = method;
      }
      else order.refundedPaise = refunded + amountPaise;
      const newCollected = Number(order.collectedPaise ?? collected);
      const newRefunded = Number(order.refundedPaise ?? refunded);
      const netCollected = newCollected - newRefunded;
      order.paymentStatus = newRefunded >= newCollected && newRefunded > 0
        ? 'refunded'
        : newRefunded > 0
          ? 'partially_refunded'
          : newCollected >= total
            ? 'paid'
            : 'pending';
      order.refundDuePaise = Math.max(0, newCollected - newRefunded - (order.orderStatus === 'cancelled' ? 0 : total));
      if (order.orderStatus === 'cancelled') {
        order.refundDuePaise = Math.max(0, newCollected - newRefunded);
      }
      await order.save({ session });
      output = { order, event, duplicate: false };
    });
  } catch (error) {
    if (isDuplicateKey(error)) {
      const [event, order] = await Promise.all([
        PaymentEvent.findOne({ orderId, idempotencyKey }).select('+requestFingerprint').lean(),
        Order.findById(orderId),
      ]);
      if (event && order) {
        if (event.requestFingerprint !== fingerprint) {
          throw new OrderServiceError('IDEMPOTENCY_KEY_REUSED', 409);
        }
        return { order, event, duplicate: true };
      }
    }
    throw error;
  } finally {
    await session.endSession();
  }
  return output;
}

/** Backward-compatible admin cash API wrapper. */
export async function recordCashPayment(input: {
  orderId: string;
  action: 'collect' | 'refund';
  amountPaise: number;
  actorId: string;
  idempotencyKey: string;
  note?: string;
  now?: Date;
}) {
  return recordCounterPayment({ ...input, method: 'cash', actorType: 'admin' });
}
