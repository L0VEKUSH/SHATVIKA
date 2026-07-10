'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { useAdmin, Coupon, CouponVisibility } from '@/context/AdminContext';


function CouponRow({ coupon }: { coupon: Coupon }) {
  const { deleteCoupon, toggleCoupon } = useAdmin();

  const visLabel = coupon.visibility === 'private' ? 'Private' : 'Public';
  const visColor = coupon.visibility === 'private'
    ? 'text-yellow-300 border-yellow-500/30 bg-yellow-500/10'
    : 'text-green-400 border-green-500/30 bg-green-500/10';

  return (

    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 30 }}
      className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${
        coupon.active
          ? 'border-[#FF4500]/20 bg-[#FF4500]/5'
          : 'border-white/8 bg-white/3 opacity-60'
      }`}
    >
      {/* Code badge */}
      <div className={`px-4 py-2 rounded-xl font-black text-sm tracking-widest ${
        coupon.active
          ? 'bg-gradient-to-r from-[#FF4500] to-[#FF8C00] text-white shadow-lg shadow-[#FF4500]/25'
          : 'bg-white/10 text-gray-500'
      }`}>
        {coupon.code}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white">{coupon.discountPercent}% Off</p>
        <p className="text-xs text-gray-600 mt-0.5">
          {coupon.usageCount} uses · Expires {coupon.expiry}
        </p>
      </div>

      {/* Active badge */}
      <span className={`text-[10px] font-bold px-2 py-1 rounded-full border hidden sm:inline ${
        coupon.active
          ? 'text-green-400 border-green-500/30 bg-green-500/10'
          : 'text-gray-600 border-white/10 bg-white/5'
      }`}>
        {coupon.active ? '● Active' : '○ Inactive'}
      </span>

      {/* Visibility badge */}
      <span
        className={`text-[10px] font-bold px-2 py-1 rounded-full border hidden md:inline ${visColor}`}
        title={visLabel}
      >
        {coupon.visibility === 'private' ? '🔒 Private' : '🌐 Public'}
      </span>


      {/* Toggle */}
      <button
        onClick={() => toggleCoupon(coupon.id)}
        className="hover:scale-110 transition-transform"
        aria-label={`Toggle ${coupon.code}`}
      >
        {coupon.active
          ? <ToggleRight className="w-6 h-6 text-[#FF4500]" />
          : <ToggleLeft  className="w-6 h-6 text-gray-600" />}
      </button>

      {/* Delete */}
      <button
        onClick={() => deleteCoupon(coupon.id)}
        className="w-8 h-8 rounded-xl bg-red-500/10 hover:bg-red-500/20 flex items-center
                   justify-center transition-colors border border-red-500/10"
        aria-label={`Delete ${coupon.code}`}
      >
        <Trash2 className="w-3.5 h-3.5 text-red-400" />
      </button>
    </motion.div>
  );
}

function AddCouponModal({ onClose }: { onClose: () => void }) {
  const { addCoupon } = useAdmin();
  const [form, setForm] = useState({
    code: '',
    discountPercent: '',
    expiry: '',
    visibility: 'public' as CouponVisibility,
  });


  const submit = () => {
    if (!form.code || !form.discountPercent) return;
    addCoupon({
      id: `coup-${Date.now()}`,
      code: form.code.toUpperCase(),
      discountPercent: parseInt(form.discountPercent),
      active: true,
      usageCount: 0,
      expiry: form.expiry || '2026-12-31',
      visibility: form.visibility,
    });

    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', damping: 22 }}
        onClick={e => e.stopPropagation()}
        className="bg-[#141414] border border-white/10 rounded-3xl p-6 w-full max-w-sm shadow-2xl"
      >
        <h3 className="text-lg font-black text-white mb-5">Create Coupon</h3>
        <div className="space-y-3">
          <input
            placeholder="Coupon code (e.g. SUMMER20) *"
            value={form.code}
            onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
            className="input-flame text-sm font-mono uppercase tracking-widest"
          />
          <input
            placeholder="Discount % (e.g. 20) *"
            type="number"
            min={1}
            max={100}
            value={form.discountPercent}
            onChange={e => setForm(f => ({ ...f, discountPercent: e.target.value }))}
            className="input-flame text-sm"
          />
          <input
            type="date"
            value={form.expiry}
            onChange={e => setForm(f => ({ ...f, expiry: e.target.value }))}
            className="input-flame text-sm"
          />

          <div className="flex items-center gap-3">
            <label className="text-xs font-semibold text-gray-400 whitespace-nowrap">
              Visibility
            </label>
            <select
              value={form.visibility}
              onChange={e => setForm(f => ({ ...f, visibility: e.target.value as CouponVisibility }))}
              className="flex-1 input-flame text-sm"
            >
              <option value="public">Public (Website)</option>
              <option value="private">Private (Known Person)</option>
            </select>
          </div>

        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-white/8 text-sm text-gray-300 hover:bg-white/12 transition-colors">Cancel</button>
          <button onClick={submit} className="flex-1 btn-flame py-2.5 text-sm font-bold">Create</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function CouponsPanel() {
  const { coupons } = useAdmin();
  const [showAdd, setShowAdd] = useState(false);

  const active   = coupons.filter(c => c.active);
  const inactive = coupons.filter(c => !c.active);

  return (
    <div>
      {/* Header actions */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-4 text-sm">
          <span className="text-green-400 font-bold">{active.length} Active</span>
          <span className="text-gray-600">{inactive.length} Inactive</span>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-flame px-4 py-2 text-sm font-bold flex items-center gap-2">
          <Plus className="w-4 h-4" /> <span>New Coupon</span>
        </button>
      </div>

      {/* List */}
      <div className="space-y-3">
        <AnimatePresence>
          {coupons.map(c => <CouponRow key={c.id} coupon={c} />)}
        </AnimatePresence>
      </div>

      {coupons.length === 0 && (
        <div className="text-center py-12 text-gray-600">
          <p className="text-3xl mb-2">🏷️</p>
          <p className="text-sm">No coupons yet. Create one!</p>
        </div>
      )}

      <AnimatePresence>
        {showAdd && <AddCouponModal onClose={() => setShowAdd(false)} />}
      </AnimatePresence>
    </div>
  );
}
