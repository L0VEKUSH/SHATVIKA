'use client';

import {
  createContext, useContext, useState, useCallback, ReactNode,
} from 'react';
import { CartItem, MenuItem, Variant } from '@/types';

/* ── Types ─────────────────────────────────────────── */
export interface AppliedCoupon {
  code: string;
  discountPercent: number;
}

interface CartContextType {
  items:          CartItem[];
  wishlist:       string[];
  totalItems:     number;
  wishlistCount:  number;
  subtotal:       number;
  appliedCoupon:  AppliedCoupon | null;
  addToCart:      (item: MenuItem, variant: Variant) => void;
  removeFromCart: (cartItemId: string) => void;
  updateQuantity: (cartItemId: string, quantity: number) => void;
  clearCart:      () => void;
  toggleWishlist: (id: string) => void;
  isInWishlist:   (id: string) => boolean;
  applyDiscount:  (coupon: AppliedCoupon) => void;
  clearDiscount:  () => void;
}

/* ── Context ────────────────────────────────────────── */
const CartContext = createContext<CartContextType | undefined>(undefined);

/* ── Provider ───────────────────────────────────────── */
export function CartProvider({ children }: { children: ReactNode }) {
  const [items,    setItems]    = useState<CartItem[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);

  // ── Derived values ──────────────────────────────────
  const totalItems    = items.reduce((s, i) => s + i.quantity, 0);
  const wishlistCount = wishlist.length;
  const subtotal      = items.reduce((s, i) => s + i.variantPrice * i.quantity, 0);

  // ── Cart actions ────────────────────────────────────
  const addToCart = useCallback((item: MenuItem, variant: Variant) => {
    const cartItemId = `${item.id}-${variant.id}`;
    setItems(prev => {
      const existing = prev.find(i => i.id === cartItemId);
      if (existing) {
        return prev.map(i => i.id === cartItemId ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, {
        id: cartItemId,
        menuItemId: item.id,
        menuItemName: item.name,
        variantId: variant.id,
        variantName: variant.name,
        variantPrice: variant.price,
        quantity: 1,
        emoji: item.emoji,
        gradientClass: item.gradientClass
      }];
    });
  }, []);

  const removeFromCart = useCallback((cartItemId: string) => {
    setItems(prev => prev.filter(i => i.id !== cartItemId));
  }, []);

  const updateQuantity = useCallback((cartItemId: string, quantity: number) => {
    if (quantity <= 0) {
      setItems(prev => prev.filter(i => i.id !== cartItemId));
      return;
    }
    setItems(prev => prev.map(i => i.id === cartItemId ? { ...i, quantity } : i));
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  // ── Wishlist actions ────────────────────────────────
  const toggleWishlist = useCallback((id: string) => {
    setWishlist(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  }, []);

  const isInWishlist = useCallback(
    (id: string) => wishlist.includes(id),
    [wishlist]
  );

  // ── Coupon actions ──────────────────────────────────
  const applyDiscount = useCallback((coupon: AppliedCoupon) => {
    setAppliedCoupon(coupon);
  }, []);

  const clearDiscount = useCallback(() => {
    setAppliedCoupon(null);
  }, []);

  return (
    <CartContext.Provider value={{
      items, wishlist, totalItems, wishlistCount, subtotal, appliedCoupon,
      addToCart, removeFromCart, updateQuantity, clearCart,
      toggleWishlist, isInWishlist, applyDiscount, clearDiscount,
    }}>
      {children}
    </CartContext.Provider>
  );
}

/* ── Hook ───────────────────────────────────────────── */
export function useCart(): CartContextType {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within a <CartProvider>');
  return ctx;
}
