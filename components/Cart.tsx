'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Minus, Trash2, ShoppingBag, ArrowRight, Heart } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { useAdmin } from '@/context/AdminContext';
import { CartItem, MenuItem } from '@/types';

interface CartProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'cart' | 'wishlist';
}

function CouponApplyUI() {
  const { appliedCoupon, applyDiscount, clearDiscount } = useCart();
  const { coupons } = useAdmin();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleApply = () => {
    const normalized = code.trim().toUpperCase();
    if (!normalized) {
      setError('Enter a coupon code');
      return;
    }

    const coupon = coupons.find(
      c => c.active && c.code.toUpperCase() === normalized
    );

    if (!coupon) {
      setError('Invalid or inactive coupon');
      return;
    }

    applyDiscount({ code: coupon.code, discountPercent: coupon.discountPercent });
    setError(null);
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
          <button onClick={handleApply} className="btn-flame px-3 py-2 text-xs font-bold whitespace-nowrap">
            Apply
          </button>
        </div>
      )}
      {error && <p className="text-[11px] text-red-400">{error}</p>}
    </div>
  );
}

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
  } = useCart();
  const { adminMenuItems, addOrder } = useAdmin();

  const [activeTab, setActiveTab] = useState<'cart' | 'wishlist'>('cart');
  const [orderToken, setOrderToken] = useState<{ token: number; id: string } | null>(null);

  // Sync active tab when cart opens
  useEffect(() => {
    if (isOpen) setActiveTab(initialTab);
  }, [isOpen, initialTab]);

  // Map wishlist IDs to full menu items
  const wishlistedItems = useMemo(() => {
    return adminMenuItems.filter((item: MenuItem) => wishlist.includes(item.id));
  }, [wishlist, adminMenuItems]);

  // Apply coupon discount (percentage)
  const discountAmount = appliedCoupon
    ? (subtotal * appliedCoupon.discountPercent) / 100
    : 0;
  const subtotalAfterDiscount = Math.max(0, subtotal - discountAmount);


  const freeDeliveryThreshold = 0; // ₹1000
  const standardDeliveryFee = 0; // ₹150
  const deliveryFee = subtotalAfterDiscount >= freeDeliveryThreshold ? 0 : standardDeliveryFee;
  const total = subtotalAfterDiscount + deliveryFee;

  // Generate numeric order token between 1 and 2000
  const generateToken = (): number => {
    return Math.floor(Math.random() * 2000) + 1; // 1..2000
  };

  const handleCheckout = () => {
    if (items.length === 0) {
      alert('Your cart is empty!');
      return;
    }

    const token = generateToken();
    const order = {
      id: `order-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      token,
      customer: 'Guest Customer',
      avatar: '👤',
      items: items.map((item: CartItem) => ({
        name: `${item.menuItemName} (${item.variantName})`,
        qty: item.quantity,
        price: item.variantPrice,
      })),
      total,
      status: 'Pending' as const,
      createdAt: new Date().toISOString(),
      time: new Date().toLocaleTimeString(),
      address: '123 Main Street',
    };

    addOrder(order);
    clearCart();
    clearDiscount();
    setOrderToken({ token, id: order.id });
    setActiveTab('cart');
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
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm mx-4"
          >
            <div className="bg-gradient-to-b from-[#1a1a1a] to-[#0f0f0f] rounded-3xl border border-[#FF4500]/20 p-8 text-center shadow-2xl">
              <div className="mb-6">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/20 border border-green-500/40 mb-4">
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="text-3xl"
                  >
                    ✅
                  </motion.div>
                </div>
              </div>

              <h2 className="text-2xl font-black text-white mb-2">Order Confirmed!</h2>
              <p className="text-sm text-gray-400 mb-6">Your delicious meal is being prepared</p>

              <div className="bg-gradient-to-r from-[#FF4500] to-[#FFD700] rounded-2xl p-6 mb-6">
                <p className="text-xs text-white/70 font-semibold mb-2 uppercase">Your Token Number</p>
                <p className="text-4xl font-black text-white tracking-widest font-mono">{orderToken.token}</p>
              </div>

              <div className="space-y-2 mb-6 text-left bg-white/5 rounded-xl p-4 border border-white/10">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Order ID:</span>
                  <span className="text-white font-mono text-[10px]">{orderToken.id}</span>
                </div>
                <div className="flex justify-between text-xs pt-2 border-t border-white/10">
                  <span className="text-gray-400">Status:</span>
                  <span className="text-yellow-400 font-semibold">🟡 Pending</span>
                </div>
              </div>

              <button
                onClick={() => {
                  setOrderToken(null);
                  onClose();
                }}
                className="btn-flame w-full py-3 text-sm font-bold"
              >
                Close & Continue Shopping
              </button>

              <p className="text-[10px] text-gray-500 mt-4">
                📱 Track your order using the token number above<br />
                🕐 Estimated delivery: 30 minutes
              </p>
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
                          <span className="text-sm font-bold text-white">Total</span>
                          <span className="flame-text text-lg font-black">₹{total.toFixed(2)}</span>
                        </div>
                      </div>


                      <button
                        onClick={handleCheckout}
                        className="btn-flame w-full py-4 text-base font-bold flex items-center justify-center gap-2 group"
                      >
                        <span>Proceed to Checkout</span>
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      </button>

                      <p className="text-center text-[10px] text-gray-600 mt-3"></p>
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
                          <p className="flame-text text-sm font-black mt-0.5">₹{(item.variants[0]?.price || 0).toFixed(2)}</p>
                        </div>

                        <button
                          onClick={() => {
                            const variant = item.variants[0];
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

