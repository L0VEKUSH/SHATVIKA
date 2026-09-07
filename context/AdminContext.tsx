'use client';

import {
  createContext, useContext, useEffect, useState, useCallback, ReactNode,
} from 'react';
import { MenuItem, Review, Feature, Stat, TeamMember, GalleryItem } from '@/types';

export type OrderStatus = 'Pending' | 'Cooking' | 'Out for Delivery' | 'Delivered' | 'Cancelled';

export interface Order {
  id: string;
  token: number;
  customer: string;
  avatar: string;
  items: { name: string; qty: number; price: number }[];
  total: number;
  status: OrderStatus;
  createdAt?: string;
  time: string;
  address: string;
  email?: string;
  phone?: string;
  specialInstructions?: string;
  paymentStatus?: string;
}

export type CouponVisibility = 'public' | 'private';

export interface Coupon {
  id: string;
  code: string;
  discountPercent: number;
  active: boolean;
  usageCount: number;
  expiry: string;
  visibility: CouponVisibility;
}

function normalizeOrderStatus(orderStatus?: string): OrderStatus {
  switch (orderStatus) {
    case 'pending': return 'Pending';
    case 'accepted':
    case 'preparing': return 'Cooking';
    case 'ready':
    case 'out_for_delivery': return 'Out for Delivery';
    case 'delivered': return 'Delivered';
    case 'cancelled': return 'Cancelled';
    default: return 'Pending';
  }
}

function normalizeBackendOrder(order: any): Order {
  return {
    id: String(order.id ?? order._id),
    token: Number(String(order._id ?? order.id).slice(-4)) || 0,
    customer: order.customerName ?? order.deliveryAddress?.name ?? 'Customer',
    avatar: '👤',
    items: (order.items || []).map((item: any) => ({
      name: item.name,
      qty: item.quantity ?? item.qty ?? 1,
      price: item.unitPrice ?? item.price ?? 0,
    })),
    total: order.totalAmount ?? order.total ?? 0,
    status: normalizeOrderStatus(order.orderStatus ?? order.status),
    createdAt: order.createdAt,
    time: order.createdAt ? new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
    address: [order.deliveryAddress?.street, order.deliveryAddress?.city, order.deliveryAddress?.state]
      .filter(Boolean)
      .join(', ') || 'Delivery address',
    email: order.user?.email || order.customerEmail || 'Unknown Email',
    phone: order.deliveryAddress?.phone || order.customerPhone || 'No Phone',
    specialInstructions: order.specialInstructions || '',
    paymentStatus: order.paymentStatus || 'pending',
  };
}

function normalizeBackendCoupon(coupon: any): Coupon {
  const discountPercent = coupon.discountType === 'percentage'
    ? Number(coupon.discountValue || 0)
    : Number(coupon.discountValue || 0);

  return {
    id: String(coupon.id ?? coupon._id),
    code: String(coupon.code ?? '').toUpperCase(),
    discountPercent,
    active: Boolean(coupon.isActive),
    usageCount: Number(coupon.usageCount ?? 0),
    expiry: coupon.expiresAt ? String(coupon.expiresAt).slice(0, 10) : '',
    visibility: coupon.applicableCategories?.length ? 'private' : 'public',
  };
}

interface AdminContextType {
  /* loading state */
  isLoading: boolean;
  /* menu */
  adminMenuItems: MenuItem[];
  updateMenuItem: (id: string, patch: Partial<MenuItem>) => void;
  deleteMenuItem: (id: string) => void;
  addMenuItem: (item: MenuItem) => void;
  /* orders */
  orders: Order[];
  addOrder: (order: Order) => void;
  updateOrderStatus: (id: string, status: OrderStatus) => void;
  /* coupons */
  coupons: Coupon[];
  addCoupon: (c: Coupon) => void;
  deleteCoupon: (id: string) => void;
  toggleCoupon: (id: string) => void;
  /* reviews */
  reviews: Review[];
  addReview: (review: Review) => void;
  updateReview: (id: string, patch: Partial<Review>) => void;
  deleteReview: (id: string) => void;
  /* content */
  galleryItems: GalleryItem[];
  addGalleryItem: (item: GalleryItem) => void;
  updateGalleryItem: (id: string, patch: Partial<GalleryItem>) => void;
  deleteGalleryItem: (id: string) => void;
  features: Feature[];
  updateFeature: (id: string, patch: Partial<Feature>) => void;
  addFeature: (feature: Feature) => void;
  deleteFeature: (id: string) => void;
  stats: Stat[];
  updateStat: (id: string, patch: Partial<Stat>) => void;
  addStat: (stat: Stat) => void;
  deleteStat: (id: string) => void;
  teamMembers: TeamMember[];
  updateTeamMember: (id: string, patch: Partial<TeamMember>) => void;
  addTeamMember: (member: TeamMember) => void;
  deleteTeamMember: (id: string) => void;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export function AdminProvider({ children }: { children: ReactNode }) {
  const [adminMenuItems, setAdminMenuItems] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [stats, setStats] = useState<Stat[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Fetch data without auto-seeding runtime content.
    async function loadData() {
      try {
        const [menuRes, orderRes, couponRes, reviewRes, featureRes, statRes, teamRes, galleryRes] = await Promise.all([
          fetch('/api/menu').then(r => r.json()),
          fetch('/api/orders').then(r => r.json()),
          fetch('/api/coupons').then(r => r.json()),
          fetch('/api/reviews').then(r => r.json()),
          fetch('/api/content?type=feature').then(r => r.json()),
          fetch('/api/content?type=stat').then(r => r.json()),
          fetch('/api/content?type=teammember').then(r => r.json()),
          fetch('/api/content?type=galleryitem').then(r => r.json()),
        ]);

        if (Array.isArray(menuRes)) setAdminMenuItems(menuRes);
        if (Array.isArray(orderRes)) setOrders(orderRes.map(normalizeBackendOrder));
        if (Array.isArray(couponRes)) setCoupons(couponRes.map(normalizeBackendCoupon));
        if (reviewRes?.reviews) setReviews(reviewRes.reviews);
        if (Array.isArray(featureRes)) setFeatures(featureRes);
        if (Array.isArray(statRes)) setStats(statRes);
        if (Array.isArray(teamRes)) setTeamMembers(teamRes);
        if (Array.isArray(galleryRes)) setGalleryItems(galleryRes);
        setIsLoading(false);
      } catch (err) {
        console.error('Failed to fetch admin data', err);
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  /* Menu actions */
  const updateMenuItem = useCallback(async (id: string, patch: Partial<MenuItem>) => {
    setAdminMenuItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
    await fetch(`/api/menu/${id}`, { method: 'PUT', body: JSON.stringify(patch) });
  }, []);

  const deleteMenuItem = useCallback(async (id: string) => {
    setAdminMenuItems(prev => prev.filter(i => i.id !== id));
    await fetch(`/api/menu/${id}`, { method: 'DELETE' });
  }, []);

  const addMenuItem = useCallback(async (item: MenuItem) => {
    setAdminMenuItems(prev => [item, ...prev]);
    await fetch('/api/menu', { method: 'POST', body: JSON.stringify(item) });
  }, []);

  /* Order actions */
  const addOrder = useCallback(async (order: Order) => {
    setOrders(prev => [order, ...prev]);
  }, []);

  const updateOrderStatus = useCallback(async (id: string, status: OrderStatus) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
    await fetch(`/api/orders/${id}`, { method: 'PUT', body: JSON.stringify({ orderStatus: status.toLowerCase().replace(/ /g, '_') }) });
  }, []);

  /* Coupon actions */
  const addCoupon = useCallback(async (c: Coupon) => {
    setCoupons(prev => [c, ...prev]);
    await fetch('/api/coupons', { method: 'POST', body: JSON.stringify({
      code: c.code,
      discountType: 'percentage',
      discountValue: c.discountPercent,
      expiresAt: new Date(c.expiry).toISOString(),
      isActive: c.active,
      applicableCategories: c.visibility === 'private' ? ['Private'] : [],
    }) });
  }, []);

  const deleteCoupon = useCallback(async (id: string) => {
    setCoupons(prev => prev.filter(c => c.id !== id));
    await fetch(`/api/coupons/${id}`, { method: 'DELETE' });
  }, []);

  const toggleCoupon = useCallback(async (id: string) => {
    const coupon = coupons.find(x => x.id === id);
    if (coupon) {
      setCoupons(prev => prev.map(c => c.id === id ? { ...c, active: !c.active } : c));
      try {
        await fetch(`/api/coupons/${id}`, { method: 'PUT', body: JSON.stringify({ isActive: !coupon.active }) });
      } catch (err) {
        console.error('Failed to toggle coupon', err);
      }
    }
  }, [coupons]);

  /* Reviews */
  const addReview = useCallback(async (review: Review) => {
    setReviews(prev => [{ ...review, id: review.id || crypto.randomUUID() }, ...prev]);
    await fetch('/api/reviews', { method: 'POST', body: JSON.stringify(review) });
  }, []);

  const updateReview = useCallback(async (id: string, patch: Partial<Review>) => {
    setReviews(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
    await fetch(`/api/reviews`, { method: 'PATCH', body: JSON.stringify({ id, status: patch.status }) });
  }, []);

  const deleteReview = useCallback(async (id: string) => {
    setReviews(prev => prev.filter(r => r.id !== id));
    await fetch(`/api/reviews?id=${id}`, { method: 'DELETE' });
  }, []);

  /* Content */
  const addGalleryItem = useCallback(async (item: GalleryItem) => {
    setGalleryItems(prev => [item, ...prev]);
    await fetch('/api/content?type=galleryitem', { method: 'POST', body: JSON.stringify(item) });
  }, []);
  const updateGalleryItem = useCallback(async (id: string, patch: Partial<GalleryItem>) => {
    setGalleryItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
    await fetch(`/api/content?type=galleryitem&id=${id}`, { method: 'PUT', body: JSON.stringify(patch) });
  }, []);
  const deleteGalleryItem = useCallback(async (id: string) => {
    setGalleryItems(prev => prev.filter(i => i.id !== id));
    await fetch(`/api/content?type=galleryitem&id=${id}`, { method: 'DELETE' });
  }, []);

  const addFeature = useCallback(async (feature: Feature) => {
    setFeatures(prev => [feature, ...prev]);
    await fetch('/api/content?type=feature', { method: 'POST', body: JSON.stringify(feature) });
  }, []);
  const updateFeature = useCallback(async (id: string, patch: Partial<Feature>) => {
    setFeatures(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f));
    await fetch(`/api/content?type=feature&id=${id}`, { method: 'PUT', body: JSON.stringify(patch) });
  }, []);
  const deleteFeature = useCallback(async (id: string) => {
    setFeatures(prev => prev.filter(f => f.id !== id));
    await fetch(`/api/content?type=feature&id=${id}`, { method: 'DELETE' });
  }, []);

  const addStat = useCallback(async (stat: Stat) => {
    setStats(prev => [stat, ...prev]);
    await fetch('/api/content?type=stat', { method: 'POST', body: JSON.stringify(stat) });
  }, []);
  const updateStat = useCallback(async (id: string, patch: Partial<Stat>) => {
    setStats(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
    await fetch(`/api/content?type=stat&id=${id}`, { method: 'PUT', body: JSON.stringify(patch) });
  }, []);
  const deleteStat = useCallback(async (id: string) => {
    setStats(prev => prev.filter(s => s.id !== id));
    await fetch(`/api/content?type=stat&id=${id}`, { method: 'DELETE' });
  }, []);

  const addTeamMember = useCallback(async (member: TeamMember) => {
    setTeamMembers(prev => [member, ...prev]);
    await fetch('/api/content?type=teammember', { method: 'POST', body: JSON.stringify(member) });
  }, []);
  const updateTeamMember = useCallback(async (id: string, patch: Partial<TeamMember>) => {
    setTeamMembers(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m));
    await fetch(`/api/content?type=teammember&id=${id}`, { method: 'PUT', body: JSON.stringify(patch) });
  }, []);
  const deleteTeamMember = useCallback(async (id: string) => {
    setTeamMembers(prev => prev.filter(m => m.id !== id));
    await fetch(`/api/content?type=teammember&id=${id}`, { method: 'DELETE' });
  }, []);

  return (
    <AdminContext.Provider value={{
      isLoading,
      adminMenuItems, updateMenuItem, deleteMenuItem, addMenuItem,
      orders, addOrder, updateOrderStatus,
      coupons, addCoupon, deleteCoupon, toggleCoupon,
      reviews, addReview, updateReview, deleteReview,
      galleryItems, addGalleryItem, updateGalleryItem, deleteGalleryItem,
      features, updateFeature, addFeature, deleteFeature,
      stats, updateStat, addStat, deleteStat,
      teamMembers, updateTeamMember, addTeamMember, deleteTeamMember,
    }}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin(): AdminContextType {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used within <AdminProvider>');
  return ctx;
}
