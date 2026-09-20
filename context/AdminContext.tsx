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
import { usePathname } from 'next/navigation';
import { ApiClientError, apiRequest } from '@/lib/apiClient';
import {
  isOrderStatus,
  type OrderStatus,
} from '@/lib/orders/stateMachine';
import type { Feature, GalleryItem, MenuItem, Review, Stat, TeamMember } from '@/types';

export type { OrderStatus } from '@/lib/orders/stateMachine';

export interface Order {
  id: string;
  token: number;
  customer: string;
  avatar: string;
  items: { name: string; qty: number; price: number; variantName?: string }[];
  total: number;
  status: OrderStatus;
  stateVersion: number;
  createdAt?: string;
  time: string;
  address: string;
  email?: string;
  phone?: string;
  specialInstructions?: string;
  paymentStatus?: string;
  collectedPaise?: number;
  refundedPaise?: number;
  refundDuePaise?: number;
}

export type CouponVisibility = 'public' | 'private';

export interface Coupon {
  id: string;
  code: string;
  discountPercent: number;
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  active: boolean;
  usageCount: number;
  expiry: string;
  visibility: CouponVisibility;
}

function normalizeMenuItem(item: any): MenuItem {
  return {
    ...item,
    id: String(item.id ?? item._id),
    variants: (item.variants ?? []).map((variant: any) => ({
      ...variant,
      id: String(variant.id ?? variant._id ?? 'base'),
    })),
  } as MenuItem;
}

function normalizeBackendOrder(order: any): Order {
  const id = String(order.id ?? order._id);
  const rawStatus = order.orderStatus ?? order.status;
  const status: OrderStatus = isOrderStatus(rawStatus) ? rawStatus : 'pending';
  const snapshot = order.customerSnapshot ?? {};
  return {
    id,
    token: Number(id.slice(-4)) || 0,
    customer: snapshot.name ?? order.customerName ?? order.deliveryAddress?.name ?? 'Customer details unavailable',
    avatar: '👤',
    items: (order.items ?? []).map((item: any) => ({
      name: item.productName ?? item.name ?? 'Historical item',
      qty: Number(item.quantity ?? item.qty ?? 1),
      price: Number(item.unitPrice ?? item.price ?? 0),
      variantName: item.variantName,
    })),
    total: Number(order.totalAmount ?? order.total ?? 0),
    status,
    stateVersion: Number(order.stateVersion ?? 0),
    createdAt: order.createdAt,
    time: order.createdAt
      ? new Date(order.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
      : '',
    address: [
      order.deliveryAddress?.street,
      order.deliveryAddress?.city,
      order.deliveryAddress?.state,
      order.deliveryAddress?.zipCode,
    ].filter(Boolean).join(', ') || 'Delivery address unavailable',
    email: snapshot.email ?? order.customerEmail ?? 'Not recorded on this order',
    phone: snapshot.phone ?? order.deliveryAddress?.phone ?? order.customerPhone ?? 'Not recorded on this order',
    specialInstructions: order.specialInstructions || '',
    paymentStatus: order.paymentStatus || 'pending',
    collectedPaise: order.collectedPaise,
    refundedPaise: order.refundedPaise,
    refundDuePaise: order.refundDuePaise,
  };
}

function normalizeBackendCoupon(coupon: any): Coupon {
  const discountType = coupon.discountType === 'fixed' ? 'fixed' : 'percentage';
  const discountValue = Number(coupon.discountValue ?? 0);
  return {
    id: String(coupon.id ?? coupon._id),
    code: String(coupon.code ?? '').toUpperCase(),
    discountPercent: discountType === 'percentage' ? discountValue : 0,
    discountType,
    discountValue,
    active: Boolean(coupon.isActive),
    usageCount: Number(coupon.usageCount ?? 0),
    expiry: coupon.expiresAt ? String(coupon.expiresAt).slice(0, 10) : '',
    visibility: coupon.visibility === 'private' ? 'private' : 'public',
  };
}

type AsyncAction = Promise<void>;

interface AdminContextType {
  isLoading: boolean;
  isMutating: boolean;
  error: string | null;
  clearError: () => void;
  refresh: () => Promise<void>;
  adminMenuItems: MenuItem[];
  updateMenuItem: (id: string, patch: Partial<MenuItem>) => AsyncAction;
  deleteMenuItem: (id: string) => AsyncAction;
  addMenuItem: (item: MenuItem) => AsyncAction;
  orders: Order[];
  addOrder: (order: Order) => void;
  updateOrderStatus: (id: string, status: OrderStatus, reason?: string) => AsyncAction;
  coupons: Coupon[];
  addCoupon: (coupon: Coupon) => AsyncAction;
  deleteCoupon: (id: string) => AsyncAction;
  toggleCoupon: (id: string) => AsyncAction;
  reviews: Review[];
  addReview: (review: Review) => AsyncAction;
  updateReview: (id: string, patch: Partial<Review>) => AsyncAction;
  deleteReview: (id: string) => AsyncAction;
  galleryItems: GalleryItem[];
  addGalleryItem: (item: GalleryItem) => AsyncAction;
  updateGalleryItem: (id: string, patch: Partial<GalleryItem>) => AsyncAction;
  deleteGalleryItem: (id: string) => AsyncAction;
  features: Feature[];
  updateFeature: (id: string, patch: Partial<Feature>) => AsyncAction;
  addFeature: (feature: Feature) => AsyncAction;
  deleteFeature: (id: string) => AsyncAction;
  stats: Stat[];
  updateStat: (id: string, patch: Partial<Stat>) => AsyncAction;
  addStat: (stat: Stat) => AsyncAction;
  deleteStat: (id: string) => AsyncAction;
  teamMembers: TeamMember[];
  updateTeamMember: (id: string, patch: Partial<TeamMember>) => AsyncAction;
  addTeamMember: (member: TeamMember) => AsyncAction;
  deleteTeamMember: (id: string) => AsyncAction;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    const known: Record<string, string> = {
      UNAUTHORIZED: 'Your admin session expired. Sign in again.',
      DATABASE_UNAVAILABLE: 'The database is temporarily unavailable.',
      STALE_ORDER_VERSION: 'This order changed elsewhere. Refresh and try again.',
      INVALID_ORDER_TRANSITION: 'That order status change is not allowed.',
      VALIDATION_FAILED: 'The server rejected one or more fields.',
    };
    return known[error.code] ?? error.message;
  }
  return error instanceof Error ? error.message : 'The request could not be completed.';
}

function menuPayload(item: Partial<MenuItem>) {
  const {
    id: _id,
    rating: _rating,
    reviewCount: _reviewCount,
    basePricePaise: _basePricePaise,
    archivedAt: _archivedAt,
    quantitySold: _quantitySold,
    ...allowed
  } = item;
  return allowed;
}

export function AdminProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const adminArea = Boolean(
    pathname && (pathname === '/admin' || pathname.startsWith('/admin/')) &&
    !pathname.startsWith('/admin/login') && !pathname.startsWith('/admin/signup'),
  );
  const [adminMenuItems, setAdminMenuItems] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [stats, setStats] = useState<Stat[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [mutationCount, setMutationCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const mutationLocks = useRef(new Set<string>());

  const clearError = useCallback(() => setError(null), []);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const requests = [
      apiRequest<any[]>(adminArea ? '/api/menu?scope=admin' : '/api/menu'),
      apiRequest<{ ok: true; coupons: any[] }>(adminArea ? '/api/coupons?scope=admin' : '/api/coupons'),
      apiRequest<{ ok: true; reviews: Review[] }>(adminArea
        ? '/api/reviews?scope=admin&status=all&limit=100'
        : '/api/reviews?status=approved&limit=100'),
      apiRequest<Feature[]>('/api/content?type=feature'),
      apiRequest<Stat[]>('/api/content?type=stat'),
      apiRequest<TeamMember[]>('/api/content?type=teammember'),
      apiRequest<GalleryItem[]>('/api/content?type=galleryitem'),
      adminArea
        ? apiRequest<{ ok: true; orders: any[] }>('/api/orders?pageSize=100')
        : Promise.resolve({ ok: true as const, orders: [] as any[] }),
    ] as const;
    const results = await Promise.allSettled(requests);
    const failures = results.filter((result) => result.status === 'rejected');
    if (results[0]?.status === 'fulfilled') setAdminMenuItems(results[0].value.map(normalizeMenuItem));
    if (results[1]?.status === 'fulfilled') setCoupons(results[1].value.coupons.map(normalizeBackendCoupon));
    if (results[2]?.status === 'fulfilled') setReviews(results[2].value.reviews ?? []);
    if (results[3]?.status === 'fulfilled') setFeatures(results[3].value);
    if (results[4]?.status === 'fulfilled') setStats(results[4].value);
    if (results[5]?.status === 'fulfilled') setTeamMembers(results[5].value);
    if (results[6]?.status === 'fulfilled') setGalleryItems(results[6].value);
    if (adminArea && results[7].status === 'fulfilled') {
      setOrders(results[7].value.orders.map(normalizeBackendOrder));
    }
    if (failures.length) setError(`${failures.length} dashboard data source${failures.length === 1 ? '' : 's'} could not be loaded.`);
    setIsLoading(false);
  }, [adminArea]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const mutate = useCallback(async <T,>(key: string, operation: () => Promise<T>): Promise<T | null> => {
    if (mutationLocks.current.has(key)) return null;
    mutationLocks.current.add(key);
    setMutationCount((count) => count + 1);
    setError(null);
    try {
      return await operation();
    } catch (operationError) {
      setError(errorMessage(operationError));
      return null;
    } finally {
      mutationLocks.current.delete(key);
      setMutationCount((count) => Math.max(0, count - 1));
    }
  }, []);

  const updateMenuItem = useCallback(async (id: string, patch: Partial<MenuItem>) => {
    const response = await mutate(`menu:update:${id}`, () => apiRequest<{ item: any }>(`/api/menu/${id}`, {
      method: 'PUT', body: menuPayload(patch),
    }));
    if (response) setAdminMenuItems((items) => items.map((item) => item.id === id ? normalizeMenuItem(response.item) : item));
  }, [mutate]);

  const deleteMenuItem = useCallback(async (id: string) => {
    const response = await mutate(`menu:delete:${id}`, () => apiRequest(`/api/menu/${id}`, { method: 'DELETE' }));
    if (response) setAdminMenuItems((items) => items.filter((item) => item.id !== id));
  }, [mutate]);

  const addMenuItem = useCallback(async (item: MenuItem) => {
    const response = await mutate('menu:create', () => apiRequest<{ item: any }>('/api/menu', {
      method: 'POST', body: menuPayload(item),
    }));
    if (response) setAdminMenuItems((items) => [normalizeMenuItem(response.item), ...items]);
  }, [mutate]);

  const addOrder = useCallback((order: Order) => setOrders((items) => [order, ...items]), []);

  const updateOrderStatus = useCallback(async (id: string, status: OrderStatus, reason?: string) => {
    const existing = orders.find((order) => order.id === id);
    if (!existing) return;
    const response = await mutate(`order:update:${id}`, () => apiRequest<{ order: any }>(`/api/orders/${id}`, {
      method: 'PUT',
      body: {
        orderStatus: status,
        expectedVersion: existing.stateVersion,
        ...(status === 'cancelled' ? { reason: reason?.trim() || 'Cancelled by administrator' } : {}),
      },
    }));
    if (response) setOrders((items) => items.map((order) => order.id === id ? normalizeBackendOrder(response.order) : order));
    else await refresh();
  }, [mutate, orders, refresh]);

  const addCoupon = useCallback(async (coupon: Coupon) => {
    const expiresAt = new Date(`${coupon.expiry}T23:59:59.999+05:30`).toISOString();
    const response = await mutate('coupon:create', () => apiRequest<{ coupon: any }>('/api/coupons', {
      method: 'POST',
      body: {
        code: coupon.code,
        discountType: coupon.discountType ?? 'percentage',
        discountValue: coupon.discountValue ?? coupon.discountPercent,
        expiresAt,
        isActive: coupon.active,
        visibility: coupon.visibility,
      },
    }));
    if (response) setCoupons((items) => [normalizeBackendCoupon(response.coupon), ...items]);
  }, [mutate]);

  const deleteCoupon = useCallback(async (id: string) => {
    const response = await mutate(`coupon:disable:${id}`, () => apiRequest(`/api/coupons/${id}`, { method: 'DELETE' }));
    if (response) setCoupons((items) => items.map((coupon) => coupon.id === id ? { ...coupon, active: false } : coupon));
  }, [mutate]);

  const toggleCoupon = useCallback(async (id: string) => {
    const existing = coupons.find((coupon) => coupon.id === id);
    if (!existing) return;
    const response = await mutate(`coupon:toggle:${id}`, () => apiRequest<{ coupon: any }>(`/api/coupons/${id}`, {
      method: 'PUT', body: { isActive: !existing.active },
    }));
    if (response) setCoupons((items) => items.map((coupon) => coupon.id === id ? normalizeBackendCoupon(response.coupon) : coupon));
  }, [coupons, mutate]);

  const addReview = useCallback(async (review: Review) => {
    const response = await mutate('review:create', () => apiRequest<{ id: string; status: Review['status'] }>('/api/reviews', {
      method: 'POST', body: review as unknown as Record<string, unknown>,
    }));
    if (response) setReviews((items) => [{ ...review, id: response.id, status: response.status }, ...items]);
  }, [mutate]);

  const updateReview = useCallback(async (id: string, patch: Partial<Review>) => {
    const response = await mutate(`review:update:${id}`, () => apiRequest<any>('/api/reviews', {
      method: 'PATCH', body: { id, ...(patch.status ? { status: patch.status } : {}) },
    }));
    if (response) setReviews((items) => items.map((review) => review.id === id ? { ...review, ...patch, ...response } : review));
  }, [mutate]);

  const deleteReview = useCallback(async (id: string) => {
    const response = await mutate(`review:delete:${id}`, () => apiRequest(`/api/reviews?id=${encodeURIComponent(id)}`, { method: 'DELETE' }));
    if (response) setReviews((items) => items.filter((review) => review.id !== id));
  }, [mutate]);

  const addContent = useCallback(async <T extends { id: string }>(type: string, value: T, setter: React.Dispatch<React.SetStateAction<T[]>>) => {
    const { id: _id, ...payload } = value;
    const response = await mutate(`${type}:create`, () => apiRequest<T>(`/api/content?type=${type}`, { method: 'POST', body: payload }));
    if (response) setter((items) => [response, ...items]);
  }, [mutate]);

  const updateContent = useCallback(async <T extends { id: string }>(type: string, id: string, patch: Partial<T>, setter: React.Dispatch<React.SetStateAction<T[]>>) => {
    const { id: _ignoredId, ...payload } = patch;
    const response = await mutate(`${type}:update:${id}`, () => apiRequest<T>(`/api/content?type=${type}&id=${encodeURIComponent(id)}`, { method: 'PUT', body: payload as Record<string, unknown> }));
    if (response) setter((items) => items.map((item) => item.id === id ? response : item));
  }, [mutate]);

  const deleteContent = useCallback(async <T extends { id: string }>(type: string, id: string, setter: React.Dispatch<React.SetStateAction<T[]>>) => {
    const response = await mutate(`${type}:delete:${id}`, () => apiRequest(`/api/content?type=${type}&id=${encodeURIComponent(id)}`, { method: 'DELETE' }));
    if (response) setter((items) => items.filter((item) => item.id !== id));
  }, [mutate]);

  const addGalleryItem = useCallback((item: GalleryItem) => addContent('galleryitem', item, setGalleryItems), [addContent]);
  const updateGalleryItem = useCallback((id: string, patch: Partial<GalleryItem>) => updateContent('galleryitem', id, patch, setGalleryItems), [updateContent]);
  const deleteGalleryItem = useCallback((id: string) => deleteContent('galleryitem', id, setGalleryItems), [deleteContent]);
  const addFeature = useCallback((item: Feature) => addContent('feature', item, setFeatures), [addContent]);
  const updateFeature = useCallback((id: string, patch: Partial<Feature>) => updateContent('feature', id, patch, setFeatures), [updateContent]);
  const deleteFeature = useCallback((id: string) => deleteContent('feature', id, setFeatures), [deleteContent]);
  const addStat = useCallback((item: Stat) => addContent('stat', item, setStats), [addContent]);
  const updateStat = useCallback((id: string, patch: Partial<Stat>) => updateContent('stat', id, patch, setStats), [updateContent]);
  const deleteStat = useCallback((id: string) => deleteContent('stat', id, setStats), [deleteContent]);
  const addTeamMember = useCallback((item: TeamMember) => addContent('teammember', item, setTeamMembers), [addContent]);
  const updateTeamMember = useCallback((id: string, patch: Partial<TeamMember>) => updateContent('teammember', id, patch, setTeamMembers), [updateContent]);
  const deleteTeamMember = useCallback((id: string) => deleteContent('teammember', id, setTeamMembers), [deleteContent]);

  const value: AdminContextType = {
    isLoading,
    isMutating: mutationCount > 0,
    error,
    clearError,
    refresh,
    adminMenuItems,
    updateMenuItem,
    deleteMenuItem,
    addMenuItem,
    orders,
    addOrder,
    updateOrderStatus,
    coupons,
    addCoupon,
    deleteCoupon,
    toggleCoupon,
    reviews,
    addReview,
    updateReview,
    deleteReview,
    galleryItems,
    addGalleryItem,
    updateGalleryItem,
    deleteGalleryItem,
    features,
    updateFeature,
    addFeature,
    deleteFeature,
    stats,
    updateStat,
    addStat,
    deleteStat,
    teamMembers,
    updateTeamMember,
    addTeamMember,
    deleteTeamMember,
  };

  return (
    <AdminContext.Provider value={value}>
      {children}
      {adminArea && error && (
        <div role="alert" className="fixed bottom-4 right-4 z-[100] max-w-sm rounded-xl border border-red-500/30 bg-[#211010] p-4 text-sm text-red-200 shadow-2xl">
          <div className="flex items-start gap-3">
            <span className="flex-1">{error}</span>
            <button type="button" onClick={clearError} aria-label="Dismiss error" className="font-bold text-red-300">×</button>
          </div>
        </div>
      )}
    </AdminContext.Provider>
  );
}

export function useAdmin(): AdminContextType {
  const context = useContext(AdminContext);
  if (!context) throw new Error('useAdmin must be used within <AdminProvider>');
  return context;
}
