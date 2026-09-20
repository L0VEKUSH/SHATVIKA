'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ApiClientError, apiRequest } from '@/lib/apiClient';
import { useAdmin } from '@/context/AdminContext';
import { useAuth } from '@/context/AuthContext';
import type { CartItem, MenuItem, Variant } from '@/types';

export interface AppliedCoupon {
  code: string;
  discountPaise: number;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
}

interface CartContextType {
  items: CartItem[];
  wishlist: string[];
  totalItems: number;
  wishlistCount: number;
  subtotal: number;
  appliedCoupon: AppliedCoupon | null;
  isCartSyncing: boolean;
  cartPersistenceError: string | null;
  addToCart: (item: MenuItem, variant: Variant) => void;
  removeFromCart: (cartItemId: string) => void;
  updateQuantity: (cartItemId: string, quantity: number) => void;
  clearCart: () => void;
  toggleWishlist: (id: string) => void;
  isInWishlist: (id: string) => boolean;
  applyDiscount: (coupon: AppliedCoupon) => void;
  clearDiscount: () => void;
  retryCartSync: () => void;
}

type PersistedCart = { items: CartItem[]; wishlist: string[] };
type ServerLine = { menuItemId: string; variantId: string; quantity: number };
type ServerCartResponse = {
  ok: true;
  cart: { items: ServerLine[]; couponCode: string | null };
  totals: {
    coupon: null | { code: string; discountType: 'percentage' | 'fixed'; discountValue: number };
    discountPaise: number;
  };
};

const CartContext = createContext<CartContextType | undefined>(undefined);
const STORAGE_PREFIX = 'shatvika-cart-v2';

function storageKey(identity: string) {
  return `${STORAGE_PREFIX}:${identity}`;
}

function isCartItem(value: unknown): value is CartItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<CartItem>;
  return typeof item.id === 'string' && item.id.length <= 200 &&
    /^[a-f\d]{24}$/i.test(item.menuItemId ?? '') &&
    typeof item.menuItemName === 'string' && item.menuItemName.length <= 200 &&
    typeof item.variantId === 'string' && item.variantId.length <= 120 &&
    typeof item.variantName === 'string' && item.variantName.length <= 120 &&
    Number.isFinite(item.variantPrice) && Number(item.variantPrice) >= 0 &&
    Number.isSafeInteger(item.quantity) && Number(item.quantity) >= 1 && Number(item.quantity) <= 100 &&
    typeof item.emoji === 'string' && item.emoji.length <= 20 &&
    typeof item.gradientClass === 'string' && item.gradientClass.length <= 200;
}

function readPersisted(identity: string): PersistedCart {
  if (typeof window === 'undefined') return { items: [], wishlist: [] };
  try {
    const raw = window.localStorage.getItem(storageKey(identity));
    if (!raw || raw.length > 250_000) return { items: [], wishlist: [] };
    const parsed = JSON.parse(raw) as Partial<PersistedCart>;
    const items = Array.isArray(parsed.items) ? parsed.items.filter(isCartItem).slice(0, 100) : [];
    const wishlist = Array.isArray(parsed.wishlist)
      ? [...new Set(parsed.wishlist.filter((value): value is string => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value)))].slice(0, 200)
      : [];
    return { items, wishlist };
  } catch {
    return { items: [], wishlist: [] };
  }
}

function persist(identity: string, value: PersistedCart) {
  try {
    window.localStorage.setItem(storageKey(identity), JSON.stringify(value));
  } catch {
    // Server persistence remains authoritative for signed-in carts. Storage can
    // be unavailable in restricted/private browser contexts.
  }
}

function toLines(items: CartItem[]): ServerLine[] {
  return items.map((item) => ({
    menuItemId: item.menuItemId,
    variantId: item.variantId || 'base',
    quantity: item.quantity,
  }));
}

function lineSignature(items: CartItem[], couponCode?: string | null) {
  return `${toLines(items)
    .map((line) => `${line.menuItemId}:${line.variantId}:${line.quantity}`)
    .sort()
    .join('|')}::${couponCode ?? ''}`;
}

function mergeLines(primary: ServerLine[], additions: ServerLine[]): ServerLine[] {
  const merged = new Map<string, ServerLine>();
  for (const line of primary) merged.set(`${line.menuItemId}:${line.variantId || 'base'}`, { ...line, variantId: line.variantId || 'base' });
  for (const line of additions) {
    const key = `${line.menuItemId}:${line.variantId || 'base'}`;
    const current = merged.get(key);
    merged.set(key, {
      ...line,
      variantId: line.variantId || 'base',
      quantity: Math.min(100, (current?.quantity ?? 0) + line.quantity),
    });
  }
  return [...merged.values()];
}

function hydrateLines(lines: ServerLine[], products: MenuItem[]): CartItem[] {
  return lines.flatMap((line) => {
    const product = products.find((candidate) => candidate.id === line.menuItemId);
    if (!product) return [];
    const variant = product.variants.find((candidate) => candidate.id === (line.variantId || 'base')) ??
      (product.variants.length === 0 && (line.variantId === 'base' || !line.variantId)
        ? {
            id: 'base',
            name: 'Regular',
            price: product.basePrice ?? (product.basePricePaise ?? 0) / 100,
            available: product.available !== false,
          }
        : null);
    if (!variant) return [];
    return [{
      id: `${product.id}-${variant.id}`,
      menuItemId: product.id,
      menuItemName: product.name,
      variantId: variant.id,
      variantName: variant.name,
      variantPrice: variant.price,
      quantity: line.quantity,
      emoji: product.emoji,
      gradientClass: product.gradientClass,
    }];
  });
}

function persistenceMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    const messages: Record<string, string> = {
      CHECKOUT_NOT_CONFIGURED: 'Cart is saved on this device; server sync awaits configured checkout rules.',
      INSUFFICIENT_STOCK: 'Cart was kept on this device, but current stock cannot support every quantity.',
      MENU_ITEM_UNAVAILABLE: 'Cart was kept on this device; one item is no longer available.',
      VARIANT_UNAVAILABLE: 'Cart was kept on this device; one selected option is no longer available.',
      DATABASE_UNAVAILABLE: 'Cart was kept on this device while account sync is unavailable.',
    };
    return messages[error.code] ?? 'Cart was kept on this device, but account sync did not complete.';
  }
  return 'Cart was kept on this device, but account sync did not complete.';
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { customer, isLoading: authLoading } = useAuth();
  const { adminMenuItems, isLoading: catalogLoading } = useAdmin();
  const [items, setItems] = useState<CartItem[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [ready, setReady] = useState(false);
  const [isCartSyncing, setIsCartSyncing] = useState(false);
  const [cartPersistenceError, setCartPersistenceError] = useState<string | null>(null);
  const identityRef = useRef<string | null>(null);
  const itemsRef = useRef<CartItem[]>([]);
  const lastServerSignature = useRef<string | null>(null);
  const syncSequence = useRef(0);
  const claimAnonymousCart = useRef(false);

  useEffect(() => { itemsRef.current = items; }, [items]);

  useEffect(() => {
    if (authLoading || catalogLoading) return;
    const identity = customer?.id ?? 'anonymous';
    if (identityRef.current === identity) return;
    const previousIdentity = identityRef.current;
    const anonymousItems = previousIdentity === 'anonymous'
      ? itemsRef.current
      : previousIdentity === null && customer
        ? readPersisted('anonymous').items
        : [];
    claimAnonymousCart.current = Boolean(customer && anonymousItems.length);
    identityRef.current = identity;
    setReady(false);
    setCartPersistenceError(null);
    setAppliedCoupon(null);
    const stored = readPersisted(identity);
    setWishlist(previousIdentity === 'anonymous' && customer
      ? [...new Set([...stored.wishlist, ...wishlist])]
      : stored.wishlist);

    if (!customer) {
      setItems(stored.items);
      lastServerSignature.current = null;
      setReady(true);
      return;
    }

    let cancelled = false;
    setIsCartSyncing(true);
    void apiRequest<ServerCartResponse>('/api/user/cart', { cache: 'no-store' })
      .then((response) => {
        if (cancelled) return;
        const pendingLocalLines = stored.items.length ? toLines(stored.items) : [];
        const usedLocalFallback = anonymousItems.length > 0 ||
          (pendingLocalLines.length > 0 && response.cart.items.length === 0);
        const mergedLines = anonymousItems.length
          ? mergeLines(response.cart.items, toLines(anonymousItems))
          : pendingLocalLines.length && response.cart.items.length === 0
            ? pendingLocalLines
            : response.cart.items;
        const hydrated = hydrateLines(mergedLines, adminMenuItems);
        setItems(hydrated);
        if (!usedLocalFallback && response.totals.coupon) {
          setAppliedCoupon({ ...response.totals.coupon, discountPaise: response.totals.discountPaise });
        }
        lastServerSignature.current = usedLocalFallback
          ? null
          : lineSignature(hydrated, response.cart.couponCode);
        if (hydrated.length !== mergedLines.length) {
          setCartPersistenceError('Some saved items are no longer in the current catalogue and were not restored.');
        }
      })
      .catch((error) => {
        if (cancelled) return;
        const fallback = anonymousItems.length ? anonymousItems : stored.items;
        setItems(fallback);
        lastServerSignature.current = null;
        setCartPersistenceError(persistenceMessage(error));
      })
      .finally(() => {
        if (cancelled) return;
        setReady(true);
        setIsCartSyncing(false);
      });
    return () => { cancelled = true; };
  }, [adminMenuItems, authLoading, catalogLoading, customer, wishlist]);

  const syncCart = useCallback(() => {
    if (!ready || !customer || identityRef.current !== customer.id) return;
    const signature = lineSignature(itemsRef.current, appliedCoupon?.code);
    if (signature === lastServerSignature.current) return;
    const sequence = ++syncSequence.current;
    setIsCartSyncing(true);
    setCartPersistenceError(null);
    void apiRequest<ServerCartResponse>('/api/user/cart', {
      method: 'POST',
      body: { items: toLines(itemsRef.current), couponCode: appliedCoupon?.code ?? null },
    }).then((response) => {
      if (sequence !== syncSequence.current) return;
      lastServerSignature.current = signature;
      if (claimAnonymousCart.current) {
        window.localStorage.removeItem(storageKey('anonymous'));
        claimAnonymousCart.current = false;
      }
      if (response.totals.coupon) {
        setAppliedCoupon({ ...response.totals.coupon, discountPaise: response.totals.discountPaise });
      } else if (appliedCoupon) {
        setAppliedCoupon(null);
      }
    }).catch((error) => {
      if (sequence === syncSequence.current) setCartPersistenceError(persistenceMessage(error));
    }).finally(() => {
      if (sequence === syncSequence.current) setIsCartSyncing(false);
    });
  }, [appliedCoupon, customer, ready]);

  useEffect(() => {
    if (!ready || !identityRef.current) return;
    persist(identityRef.current, { items, wishlist });
    if (!customer) return;
    const timer = window.setTimeout(syncCart, 350);
    return () => window.clearTimeout(timer);
  }, [customer, items, ready, syncCart, wishlist]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      const identity = identityRef.current;
      if (!identity || event.key !== storageKey(identity)) return;
      const stored = readPersisted(identity);
      setItems(stored.items);
      setWishlist(stored.wishlist);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const addToCart = useCallback((item: MenuItem, variant: Variant) => {
    setAppliedCoupon(null);
    const cartItemId = `${item.id}-${variant.id}`;
    setItems((current) => {
      const existing = current.find((entry) => entry.id === cartItemId);
      if (existing) {
        return current.map((entry) => entry.id === cartItemId
          ? { ...entry, quantity: Math.min(100, entry.quantity + 1) }
          : entry);
      }
      return [...current, {
        id: cartItemId,
        menuItemId: item.id,
        menuItemName: item.name,
        variantId: variant.id,
        variantName: variant.name,
        variantPrice: variant.price,
        quantity: 1,
        emoji: item.emoji,
        gradientClass: item.gradientClass,
      }];
    });
  }, []);

  const removeFromCart = useCallback((cartItemId: string) => {
    setAppliedCoupon(null);
    setItems((current) => current.filter((item) => item.id !== cartItemId));
  }, []);

  const updateQuantity = useCallback((cartItemId: string, quantity: number) => {
    setAppliedCoupon(null);
    setItems((current) => quantity <= 0
      ? current.filter((item) => item.id !== cartItemId)
      : current.map((item) => item.id === cartItemId ? { ...item, quantity: Math.min(100, quantity) } : item));
  }, []);

  const clearCart = useCallback(() => {
    setAppliedCoupon(null);
    setItems([]);
  }, []);

  const toggleWishlist = useCallback((id: string) => {
    setWishlist((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }, []);

  const isInWishlist = useCallback((id: string) => wishlist.includes(id), [wishlist]);
  const applyDiscount = useCallback((coupon: AppliedCoupon) => setAppliedCoupon(coupon), []);
  const clearDiscount = useCallback(() => setAppliedCoupon(null), []);

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce((sum, item) => sum + item.variantPrice * item.quantity, 0);

  return (
    <CartContext.Provider value={{
      items,
      wishlist,
      totalItems,
      wishlistCount: wishlist.length,
      subtotal,
      appliedCoupon,
      isCartSyncing,
      cartPersistenceError,
      addToCart,
      removeFromCart,
      updateQuantity,
      clearCart,
      toggleWishlist,
      isInWishlist,
      applyDiscount,
      clearDiscount,
      retryCartSync: syncCart,
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextType {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used within a <CartProvider>');
  return context;
}
