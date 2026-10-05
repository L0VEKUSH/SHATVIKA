'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Minus, Trash2, ShoppingBag, ArrowRight, Heart } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { useAdmin } from '@/context/AdminContext';
import { useAuth } from '@/context/AuthContext';
import { CartItem, MenuItem } from '@/types';
import { ApiClientError, apiRequest } from '@/lib/apiClient';
import { availableQuantity, resolveInventoryMode } from '@/lib/inventory';

interface CartProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'cart' | 'wishlist';
}

function CouponApplyUI() {
  const { appliedCoupon, applyDiscount, clearDiscount, items } = useCart();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleApply = async () => {
    const normalized = code.trim().toUpperCase();
    if (!normalized) {
      setError('Enter a coupon code');
      return;
    }

    try {
      setError(null);
      setPending(true);
      const data = await apiRequest<{
        ok: true;
        coupon: {
          code: string;
          discountType: 'percentage' | 'fixed';
          discountValue: number;
        };
        discountPaise: number;
      }>('/api/coupons/validate', {
        method: 'POST',
        body: {
          code: normalized,
          items: items.map((item) => ({
            menuItemId: item.menuItemId,
            variantId: item.variantId,
            quantity: item.quantity,
          })),
        },
      });
      applyDiscount({
        code: data.coupon.code,
        discountPaise: data.discountPaise,
        discountType: data.coupon.discountType,
        discountValue: data.coupon.discountValue,
      });
      setCode('');
    } catch (requestError) {
      if (requestError instanceof ApiClientError) {
        const errMap: Record<string, string> = {
          COUPON_NOT_FOUND: 'Invalid coupon code',
          COUPON_INACTIVE: 'This coupon is no longer active',
          COUPON_NOT_STARTED: 'This coupon is not active yet',
          COUPON_EXPIRED: 'This coupon has expired',
          COUPON_LIMIT_REACHED: 'This coupon has reached its usage limit',
          COUPON_CUSTOMER_LIMIT_REACHED: 'You have already used this coupon',
          MINIMUM_ORDER_NOT_MET: 'This basket does not meet the coupon minimum',
          COUPON_NOT_APPLICABLE: 'This coupon does not apply to these items',
          UNAUTHENTICATED: 'Sign in before applying a coupon',
        };
        setError(errMap[requestError.code] || requestError.message || 'Invalid or inactive coupon');
      } else {
        setError('Could not validate coupon. Try again.');
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-2">
      {appliedCoupon ? (
        <button
          onClick={() => clearDiscount()}
          className="text-[11px] font-bold text-gray-300 hover:text-white transition-colors w-full text-left"
        >
          Remove coupon ({appliedCoupon.code})
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Coupon code"
            className="input-flame text-xs font-mono w-full"
          />
          <button
            onClick={handleApply}
            disabled={pending || items.length === 0}
            className="btn-flame px-3 py-2 text-xs font-bold whitespace-nowrap disabled:opacity-50"
          >
            {pending ? 'Checking…' : 'Apply'}
          </button>
        </div>
      )}
      {error && <p className="text-[11px] text-red-400">{error}</p>}
    </div>
  );
}

type OrderConfirmation = {
  orderId: string;
  tokenNumber: string;
  tokenBusinessDate: string;
  fulfillmentLocationName: string;
  totalAmount: number;
  totalPaise: number;
  subtotalPaise: number;
  discountPaise: number;
  taxPaise: number;
  deliveryChargePaise: number;
  items: Array<{
    menuItemId: string;
    name: string;
    variantName?: string;
    quantity: number;
    unitPricePaise: number;
    totalPricePaise: number;
  }>;
  createdAt: string;
  paymentStatus: 'pending' | 'paid' | 'partially_refunded' | 'refunded';
  orderStatus: string;
};

const CHECKOUT_RETRY_STORAGE_KEY = 'shatvika-checkout-retry-v1';

export default function Cart({ isOpen, onClose, initialTab = 'cart' }: CartProps) {
  const {
    items,
    wishlist,
    wishlistCount,
    subtotal,
    appliedCoupon,
    removeFromCart,
    updateQuantity,
    clearCart,
    addToCart,
    toggleWishlist,
    clearDiscount,
    isCartSyncing,
    cartPersistenceError,
    retryCartSync,
  } = useCart();
  const { adminMenuItems } = useAdmin();
  const { customer } = useAuth();

  const [activeTab, setActiveTab] = useState<'cart' | 'wishlist'>('cart');
  const [orderToken, setOrderToken] = useState<OrderConfirmation | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutPending, setCheckoutPending] = useState(false);
  const [googleAvailable, setGoogleAvailable] = useState<boolean | null>(null);
  const [claimableGuestOrders, setClaimableGuestOrders] = useState(0);
  const [claimingGuestOrders, setClaimingGuestOrders] = useState(false);
  const [stockIssues, setStockIssues] = useState<Record<string, string>>({});
  const [stockCheckPending, setStockCheckPending] = useState(false);
  const [stockCheckError, setStockCheckError] = useState<string | null>(null);
  const [stockRefresh, setStockRefresh] = useState(0);
  const checkoutKey = useRef<string | null>(null);

  // Sync active tab when cart opens
  useEffect(() => {
    if (isOpen) setActiveTab(initialTab);
  }, [isOpen, initialTab]);

  // Map wishlist IDs to full menu items
  const wishlistedItems = useMemo(() => {
    return adminMenuItems.filter((item: MenuItem) => wishlist.includes(item.id));
  }, [wishlist, adminMenuItems]);

  const cartSignature = items
    .map((item) => `${item.menuItemId}:${item.variantId}:${item.quantity}`)
    .sort()
    .join('|');
  const checkoutSignature = `${cartSignature}|coupon:${appliedCoupon?.code ?? ''}`;

  useEffect(() => {
    if (!isOpen || !items.length) {
      setStockIssues({});
      setStockCheckError(null);
      return;
    }
    let cancelled = false;
    setStockCheckPending(true);
    setStockCheckError(null);
    void apiRequest<MenuItem[]>('/api/menu?availability=1', { cache: 'no-store' })
      .then((products) => {
        if (cancelled) return;
        const byId = new Map(products.map(product => [
          String(product.id ?? (product as MenuItem & { _id?: string })._id),
          product,
        ]));
        const requested = new Map<string, number>();
        for (const item of items) requested.set(item.menuItemId, (requested.get(item.menuItemId) ?? 0) + item.quantity);
        const next: Record<string, string> = {};
        for (const [menuItemId, quantity] of requested) {
          const product = byId.get(menuItemId);
          const name = items.find(item => item.menuItemId === menuItemId)?.menuItemName ?? 'An item';
          if (!product || product.available === false) {
            next[menuItemId] = `${name} is unavailable.`;
            continue;
          }
          const mode = resolveInventoryMode(product);
          if (mode === 'unconfigured') {
            next[menuItemId] = `${name} cannot be ordered until inventory is configured.`;
            continue;
          }
          if (mode === 'tracked') {
            const available = availableQuantity(product) ?? 0;
            if (available < quantity) {
              next[menuItemId] = available > 0 ? `Only ${available} ${name} available.` : `${name} is out of stock.`;
            }
          }
        }
        setStockIssues(next);
      })
      .catch(() => {
        if (!cancelled) setStockCheckError('Current stock could not be refreshed. Retry before confirming.');
      })
      .finally(() => {
        if (!cancelled) setStockCheckPending(false);
      });
    return () => { cancelled = true; };
  }, [cartSignature, isOpen, items, stockRefresh]);

  useEffect(() => {
    setCheckoutError(null);
    try {
      const stored = JSON.parse(window.sessionStorage.getItem(CHECKOUT_RETRY_STORAGE_KEY) ?? 'null') as { signature?: string; key?: string } | null;
      if (cartSignature && stored?.signature === checkoutSignature && typeof stored.key === 'string' && stored.key.length >= 8) {
        checkoutKey.current = stored.key;
      } else {
        checkoutKey.current = null;
        window.sessionStorage.removeItem(CHECKOUT_RETRY_STORAGE_KEY);
      }
    } catch {
      checkoutKey.current = null;
      window.sessionStorage.removeItem(CHECKOUT_RETRY_STORAGE_KEY);
    }
  }, [cartSignature, checkoutSignature]);

  useEffect(() => {
    apiRequest<{ ok: true; available: boolean }>('/api/auth/google/status', { cache: 'no-store' })
      .then(result => setGoogleAvailable(result.available))
      .catch(() => setGoogleAvailable(false));
  }, []);

  useEffect(() => {
    if (!customer) { setClaimableGuestOrders(0); return; }
    apiRequest<{ ok: true; available: number }>('/api/user/guest-orders/claim', { cache: 'no-store' })
      .then(result => setClaimableGuestOrders(result.available))
      .catch(() => setClaimableGuestOrders(0));
  }, [customer]);

  // Coupon validation is server-authoritative, but remains provisional until the transaction commits.
  const discountAmount = appliedCoupon ? appliedCoupon.discountPaise / 100 : 0;
  const subtotalAfterDiscount = Math.max(0, subtotal - discountAmount);

  const handleCheckout = async () => {
    if (items.length === 0) {
      setCheckoutError('Your cart is empty.');
      return;
    }
    if (stockCheckPending || stockCheckError || Object.keys(stockIssues).length) {
      setCheckoutError(stockCheckError ?? Object.values(stockIssues)[0] ?? 'Wait for the stock check to finish.');
      return;
    }

    try {
      setCheckoutPending(true);
      setCheckoutError(null);
      if (!customer) {
        // Establish the HttpOnly owner cookie in a separate response first so
        // an ambiguous order timeout can recover under the same guest owner.
        await apiRequest('/api/guest/session', { cache: 'no-store' });
      }
      checkoutKey.current ??= crypto.randomUUID();
      window.sessionStorage.setItem(CHECKOUT_RETRY_STORAGE_KEY, JSON.stringify({
        signature: checkoutSignature,
        key: checkoutKey.current,
      }));
      const data = await apiRequest<OrderConfirmation & { ok: true }>('/api/user/orders', {
        method: 'POST',
        headers: { 'Idempotency-Key': checkoutKey.current },
        body: {
          items: items.map((item: CartItem) => ({
            menuItemId: item.menuItemId,
            variantId: item.variantId,
            quantity: item.quantity,
          })),
          fulfillmentType: 'counter',
          paymentMethod: 'counter',
          couponCode: appliedCoupon?.code,
        },
      });

      window.sessionStorage.removeItem(CHECKOUT_RETRY_STORAGE_KEY);
      checkoutKey.current = null;
      clearCart();
      clearDiscount();
      setOrderToken(data);
      setActiveTab('cart');
    } catch (err) {
      const messages: Record<string, string> = {
        UNAUTHENTICATED: 'Your private guest session could not be established. Refresh and try again.',
        GUEST_SESSION_UNAVAILABLE: 'Guest checkout is temporarily unavailable. Your cart was kept.',
        GUEST_OUTSTANDING_ORDER_LIMIT: 'This browser already has the maximum number of unpaid active orders. Pay or collect an existing order before trying again.',
        CHECKOUT_NOT_CONFIGURED: 'Ordering is temporarily unavailable while the configured tax rule is checked.',
        TRANSACTION_DATABASE_REQUIRED: 'Ordering is temporarily unavailable because safe stock transactions are not configured.',
        INSUFFICIENT_STOCK: 'An item just sold out. Your cart was kept; review it and try again.',
        INVENTORY_NOT_CONFIGURED: 'An item needs inventory setup by an administrator. Your cart was kept.',
        MENU_ITEM_UNAVAILABLE: 'An item in your cart is no longer available.',
        VARIANT_UNAVAILABLE: 'A selected option is no longer available.',
        IDEMPOTENCY_KEY_REUSED: 'The basket changed during checkout. Please try again.',
        UPLOAD_STORAGE_NOT_CONFIGURED: 'Checkout received a media-upload response instead of an order response. Your cart was kept. Refresh the page and retry with the same basket; the saved request key prevents a duplicate order.',
      };
      const details = err instanceof ApiClientError && err.details && typeof err.details === 'object'
        ? err.details as { available?: unknown }
        : null;
      const stockMessage = err instanceof ApiClientError && err.code === 'INSUFFICIENT_STOCK' &&
        typeof details?.available === 'number'
        ? details.available > 0 ? `Only ${details.available} available. Your cart was kept.` : 'An item is out of stock. Your cart was kept.'
        : null;
      setCheckoutError(err instanceof ApiClientError
        ? stockMessage ?? (messages[err.code] || err.message)
        : 'Confirmation may not have completed. Your cart was kept; retry to safely recover the same order.');
      setStockRefresh(value => value + 1);
    } finally {
      setCheckoutPending(false);
    }
  };

  const claimGuestOrders = async () => {
    if (!customer || claimingGuestOrders) return;
    setClaimingGuestOrders(true);
    setCheckoutError(null);
    try {
      const result = await apiRequest<{ ok: true; claimed: number }>('/api/user/guest-orders/claim', { method: 'POST' });
      setClaimableGuestOrders(0);
      setCheckoutError(result.claimed > 0 ? `${result.claimed} guest order${result.claimed === 1 ? '' : 's'} saved to your account.` : 'Guest orders are already saved.');
    } catch (error) {
      setCheckoutError(error instanceof ApiClientError ? error.message : 'Guest orders could not be linked. Nothing was duplicated.');
    } finally {
      setClaimingGuestOrders(false);
    }
  };

  return (
    <AnimatePresence>
      {/* ── Order Confirmation Modal ─────────────────────── */}
      {orderToken && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              setOrderToken(null);
              onClose();
            }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="counter-confirmation-title"
            className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2"
          >
            <div className="max-h-[92vh] overflow-y-auto rounded-3xl border border-[#FF4500]/20 bg-gradient-to-b from-[#1a1a1a] to-[#0f0f0f] p-5 text-center shadow-2xl sm:p-7">
              <h2 id="counter-confirmation-title" className="text-2xl font-black text-white">Order confirmed</h2>
              <p className="mt-1 text-sm text-gray-400">Show this token and pay at the counter</p>

              <div className="my-5 rounded-2xl bg-gradient-to-r from-[#FF4500] to-[#FFD700] p-5">
                <p className="text-xs font-semibold uppercase text-white/80">Your token number</p>
                <p className="mt-1 font-mono text-5xl font-black tracking-wider text-white">{orderToken.tokenNumber}</p>
                <p className="mt-2 text-xs text-white/85">
                  {new Intl.DateTimeFormat('en-IN', {
                    dateStyle: 'medium', timeStyle: 'short',
                    timeZone: process.env.NEXT_PUBLIC_BUSINESS_TIME_ZONE || 'Asia/Kolkata',
                  }).format(new Date(orderToken.createdAt))}
                </p>
              </div>

              <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4 text-left">
                <div className="flex justify-between gap-3 text-xs">
                  <span className="text-gray-400">Order ID</span>
                  <span className="break-all text-right font-mono text-[10px] text-white">{orderToken.orderId}</span>
                </div>
                <ul className="space-y-2 border-t border-white/10 pt-3">
                  {orderToken.items.map(item => (
                    <li key={`${item.menuItemId}:${item.variantName ?? 'base'}`} className="text-xs">
                      <div className="flex justify-between gap-3 text-white">
                        <span>{item.quantity}× {item.name}</span>
                        <span>₹{(item.totalPricePaise / 100).toFixed(2)}</span>
                      </div>
                      <p className="text-[10px] text-gray-500">₹{(item.unitPricePaise / 100).toFixed(2)} each{item.variantName ? ` · ${item.variantName}` : ''}</p>
                    </li>
                  ))}
                </ul>
                <div className="space-y-1 border-t border-white/10 pt-3 text-xs">
                  <div className="flex justify-between"><span className="text-gray-400">Subtotal</span><span>₹{(orderToken.subtotalPaise / 100).toFixed(2)}</span></div>
                  {orderToken.discountPaise > 0 ? <div className="flex justify-between text-emerald-300"><span>Discount</span><span>−₹{(orderToken.discountPaise / 100).toFixed(2)}</span></div> : null}
                  <div className="flex justify-between"><span className="text-gray-400">Configured tax</span><span>₹{(orderToken.taxPaise / 100).toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Collection</span><span>{orderToken.fulfillmentLocationName}</span></div>
                  <div className="flex justify-between pt-1 text-base font-black text-white"><span>Final amount</span><span>₹{orderToken.totalAmount.toFixed(2)}</span></div>
                </div>
                <div className="grid grid-cols-2 gap-3 border-t border-white/10 pt-3 text-xs">
                  <div><span className="block text-gray-500">Payment</span><span className="font-semibold capitalize text-amber-300">{orderToken.paymentStatus === 'pending' ? 'Unpaid — pay at counter' : orderToken.paymentStatus.replaceAll('_', ' ')}</span></div>
                  <div><span className="block text-gray-500">Order status</span><span className="font-semibold capitalize text-yellow-300">{orderToken.orderStatus}</span></div>
                </div>
              </div>

              <p className="mt-4 text-xs leading-5 text-amber-100">Delivery currently unavailable — collect at Shatvika Corner. Keep this token; it remains available in My Orders.</p>
              {!customer && <p className="mt-2 text-[11px] leading-5 text-gray-400">Guest history is saved privately in this browser and may be lost if browser data is cleared or the guest session expires.</p>}
              <a href="/orders" className="mt-4 block min-h-11 rounded-xl border border-white/15 px-4 py-3 text-sm font-bold text-white hover:bg-white/5">Open My Orders</a>
              <button
                type="button"
                onClick={() => { setOrderToken(null); onClose(); }}
                className="btn-flame mt-5 w-full py-3 text-sm font-bold"
              >
                Close
              </button>
            </div>
          </motion.div>
        </>
      )}

      {/* ── Main Cart Sidebar ────────────────────────────── */}
      {isOpen && !orderToken && (
        <>
          {/* ── Backdrop ─────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
          />

          {/* ── Sidebar ──────────────────────────────────── */}
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 220 }}
            className="fixed top-0 right-0 h-full w-full max-w-[420px] z-50
                       bg-[#111111] border-l border-white/8 flex flex-col shadow-2xl"
          >
            {/* Header */}
            <div className="flex flex-col border-b border-white/8 shrink-0">
              <div className="flex items-center justify-between p-5 pb-3">
                <div className="flex items-center gap-2.5">
                  <ShoppingBag className="w-5 h-5 text-[#FF4500]" />
                  <h2 className="text-lg font-black text-white">SHATVIKA CORNER</h2>
                </div>
                <div className="flex items-center gap-2">
                  {activeTab === 'cart' && items.length > 0 && (
                    <button
                      onClick={clearCart}
                      className="text-xs text-gray-600 hover:text-[#FF4500] transition-colors font-medium"
                    >
                      Clear all
                    </button>
                  )}
                  <button
                    onClick={onClose}
                    aria-label="Close cart"
                    className="w-9 h-9 rounded-full bg-white/6 hover:bg-white/12
                               flex items-center justify-center transition-colors"
                  >
                    <X className="w-4 h-4 text-gray-400" />
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex px-5 pb-2 gap-4">
                <button
                  onClick={() => setActiveTab('cart')}
                  className={`pb-2 text-sm font-bold border-b-2 transition-all relative ${
                    activeTab === 'cart'
                      ? 'text-white border-[#FF4500]'
                      : 'border-transparent text-gray-500 hover:text-gray-300'
                  }`}
                >
                  My Cart ({items.length})
                </button>
                <button
                  onClick={() => setActiveTab('wishlist')}
                  className={`pb-2 text-sm font-bold border-b-2 transition-all relative ${
                    activeTab === 'wishlist'
                      ? 'text-white border-[#FF4500]'
                      : 'border-transparent text-gray-500 hover:text-gray-300'
                  }`}
                >
                  Wishlist ({wishlistCount})
                </button>
              </div>
            </div>

            {/* Content Switcher */}
            <div className="flex-1 overflow-hidden flex flex-col">
              {activeTab === 'cart' ? (
                items.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
                    <span className="text-6xl">🛒</span>
                    <h3 className="text-lg font-bold text-white">Your cart is empty</h3>
                    <p className="text-sm text-gray-500 max-w-xs">
                      Add some delicious items from our menu and they will appear here.
                    </p>
                    <button onClick={onClose} className="btn-flame px-6 py-3 text-sm mt-2">
                      <span>Browse Menu</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Cart items list */}
                    <div className="flex-1 overflow-y-auto p-5 space-y-3">
                      <AnimatePresence>
                        {items.map((item: CartItem) => (
                          <motion.div
                            key={item.id}
                            layout
                            initial={{ opacity: 0, x: 30 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -30, height: 0, marginBottom: 0, padding: 0 }}
                            transition={{ duration: 0.28 }}
                            className={`flex items-center gap-3 rounded-2xl p-3.5 border border-white/6 ${item.gradientClass}`}
                          >
                            <div className="w-12 h-12 rounded-xl bg-black/20 flex items-center justify-center shrink-0 text-2xl">
                              {item.emoji}
                            </div>

                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-white truncate">{item.menuItemName}</p>
                              <p className="text-xs text-gray-400">{item.variantName}</p>
                              <p className="flame-text text-sm font-black mt-0.5">₹{(item.variantPrice * item.quantity).toFixed(2)}</p>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                onClick={() => updateQuantity(item.id, item.quantity - 1)}
                                aria-label="Decrease quantity"
                                className="w-7 h-7 rounded-full bg-black/30 hover:bg-black/50
                                           flex items-center justify-center transition-colors"
                              >
                                <Minus className="w-3 h-3 text-white" />
                              </button>
                              <span className="text-white font-bold text-sm w-5 text-center">{item.quantity}</span>
                              <button
                                onClick={() => updateQuantity(item.id, item.quantity + 1)}
                                aria-label="Increase quantity"
                                className="w-7 h-7 rounded-full bg-[#FF4500]/30 hover:bg-[#FF4500]/50
                                           flex items-center justify-center transition-colors"
                              >
                                <Plus className="w-3 h-3 text-white" />
                              </button>
                            </div>

                            <button
                              onClick={() => removeFromCart(item.id)}
                              aria-label="Remove item"
                              className="w-7 h-7 rounded-full bg-black/20 hover:bg-red-500/20
                                         flex items-center justify-center transition-colors shrink-0"
                            >
                              <Trash2 className="w-3 h-3 text-gray-500 hover:text-red-400" />
                            </button>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>

                    {/* Order summary calculations */}
                    <div className="px-5 py-4 border-t border-white/6 bg-[#0f0f0f] shrink-0">
                      <div className="space-y-2 mb-4">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500 font-medium">Subtotal</span>
                          <span className="text-xs font-bold text-white">₹{subtotal.toFixed(2)}</span>
                        </div>

                        {/* Coupon apply UI */}
                        <CouponApplyUI />

                        {appliedCoupon && (
                          <div className="flex items-center justify-between bg-green-500/10 border border-green-500/20 rounded-xl px-3 py-2">
                            <span className="text-xs text-green-400 font-semibold">
                              Coupon Applied: <span className="font-black">{appliedCoupon.code}</span>
                            </span>
                            <span className="text-xs font-bold text-green-400">-₹{discountAmount.toFixed(2)}</span>
                          </div>
                        )}

                        <div className="border-t border-white/8 pt-2 flex items-center justify-between">
                          <span className="text-sm font-bold text-white">Estimated merchandise total</span>
                          <span className="flame-text text-lg font-black">₹{subtotalAfterDiscount.toFixed(2)}</span>
                        </div>
                        <p className="text-[10px] leading-relaxed text-gray-500">
                          Configured tax, availability and the coupon are recalculated by the server before confirmation. No delivery fee is charged.
                        </p>
                      </div>

                      {checkoutError && (
                        <p role="alert" className="mb-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                          {checkoutError}
                        </p>
                      )}
                      {(stockCheckPending || stockCheckError || Object.keys(stockIssues).length > 0) && (
                        <div role="status" className="mb-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                          {stockCheckPending ? <p>Checking current stock…</p> : (
                            <>
                              {stockCheckError && <p>{stockCheckError}</p>}
                              {Object.values(stockIssues).map(message => <p key={message}>{message}</p>)}
                              <button type="button" onClick={() => setStockRefresh(value => value + 1)} className="mt-1 font-bold underline underline-offset-2">Retry stock check</button>
                            </>
                          )}
                        </div>
                      )}
                      {cartPersistenceError && (
                        <div role="alert" className="mb-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                          <p>{cartPersistenceError}</p>
                          {customer && (
                            <button type="button" onClick={retryCartSync} className="mt-1 font-bold underline underline-offset-2">
                              Retry account sync
                            </button>
                          )}
                        </div>
                      )}
                      {isCartSyncing && customer && (
                        <p role="status" className="mb-3 text-center text-[10px] text-gray-500">Saving cart to your account…</p>
                      )}
                      {customer && claimableGuestOrders > 0 && (
                        <div className="mb-3 rounded-xl border border-sky-400/20 bg-sky-400/10 p-3 text-xs text-sky-100">
                          <p>{claimableGuestOrders} order{claimableGuestOrders === 1 ? '' : 's'} from this browser can be saved to your account.</p>
                          <button type="button" onClick={() => void claimGuestOrders()} disabled={claimingGuestOrders} className="mt-2 font-bold underline underline-offset-2 disabled:opacity-50">{claimingGuestOrders ? 'Saving…' : 'Save authorized guest orders'}</button>
                        </div>
                      )}
                      <button
                        onClick={handleCheckout}
                        disabled={checkoutPending || stockCheckPending || Boolean(stockCheckError) || Object.keys(stockIssues).length > 0}
                        className="btn-flame w-full py-4 text-base font-bold flex items-center justify-center gap-2 group disabled:opacity-50"
                      >
                        <span>{checkoutPending ? 'Confirming safely…' : 'Confirm order & get token'}</span>
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      </button>

                      {!customer && (
                        <div className="mt-3 text-center text-xs text-gray-400">
                          {googleAvailable === true ? (
                            <a href="/api/auth/google/start?returnTo=%2F%3FconfirmOrder%3D1" className="inline-flex min-h-10 items-center justify-center rounded-lg border border-white/15 px-4 py-2 font-semibold text-white hover:bg-white/5">Continue with Google (optional)</a>
                          ) : googleAvailable === false ? (
                            <p>Google sign-in is not configured. Guest checkout remains available.</p>
                          ) : <p>Checking optional account sign-in…</p>}
                          <p className="mt-2 text-[10px] leading-4 text-gray-500">Google may request its own authentication or security verification. A Shatvika password or OTP is not required for guest checkout.</p>
                        </div>
                      )}

                      <p className="mt-3 text-center text-[11px] text-amber-200/80">Delivery currently unavailable — collect at Shatvika Corner. Pay at counter by cash or verified UPI.</p>
                    </div>
                  </div>
                )
              ) : wishlistedItems.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
                  <span className="text-6xl text-red-500">❤️</span>
                  <h3 className="text-lg font-bold text-white">Your wishlist is empty</h3>
                  <p className="text-sm text-gray-500 max-w-xs">
                    
                  </p>
                  <button onClick={onClose} className="btn-flame px-6 py-3 text-sm mt-2">
                    <span>Explore Menu</span>
                  </button>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto p-5 space-y-3">
                  <AnimatePresence>
                    {wishlistedItems.map((item: MenuItem) => (
                      <motion.div
                        key={item.id}
                        layout
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: 30, height: 0, marginBottom: 0, padding: 0 }}
                        transition={{ duration: 0.25 }}
                        className={`flex items-center gap-3 rounded-2xl p-3.5 border border-white/6 ${item.gradientClass}`}
                      >
                        <div className="w-12 h-12 rounded-xl bg-black/20 flex items-center justify-center shrink-0 text-2xl">
                          {item.emoji}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-white truncate">{item.name}</p>
                          <p className="flame-text text-sm font-black mt-0.5">₹{(item.variants[0]?.price ?? item.basePrice ?? 0).toFixed(2)}</p>
                        </div>

                        <button
                          onClick={() => {
                            const variant = item.variants[0] ?? {
                              id: 'base',
                              name: 'Regular',
                              price: item.basePrice ?? 0,
                              pricePaise: item.basePricePaise,
                              available: item.available !== false,
                            };
                            if (variant) addToCart(item, variant);
                            setActiveTab('cart');
                          }}
                          className="btn-flame px-3 py-1.5 text-xs font-bold shrink-0"
                        >
                          Add
                        </button>

                        <button
                          onClick={() => toggleWishlist(item.id)}
                          aria-label="Remove from wishlist"
                          className="w-7 h-7 rounded-full bg-red-500/10 hover:bg-red-500/25
                                       flex items-center justify-center transition-colors shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
