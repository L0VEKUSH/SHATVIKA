'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Plus, Trash2, Edit3, Check, X, PlusCircle } from 'lucide-react';
import { useAdmin } from '@/context/AdminContext';
import { Category, MenuItem, Variant } from '@/types';

const CATEGORIES: Category[] = ['Burgers', 'Pizza', 'Sandwiches', 'Fries', 'Drinks', 'Desserts'];

const GRAD_OPTIONS = [
  { label: 'Burger',   cls: 'grad-burger'   },
  { label: 'Pizza',    cls: 'grad-pizza'     },
  { label: 'Sandwich', cls: 'grad-sandwich'  },
  { label: 'Fries',    cls: 'grad-fries'     },
  { label: 'Drinks',   cls: 'grad-drinks'    },
  { label: 'Desserts', cls: 'grad-desserts'  },
];

function BadgeToggle({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all ${
        active ? 'bg-[#FF4500]/20 text-[#FF8C00] border-[#FF4500]/30' : 'bg-white/5 text-gray-600 border-white/10'
      }`}
    >
      {label}
    </button>
  );
}

/* ── Inline Variants editor ── */
function VariantsCell({ item }: { item: MenuItem }) {
  const { updateMenuItem } = useAdmin();
  const [editing, setEditing] = useState(false);
  const [variants, setVariants] = useState<Variant[]>(item.variants || []);

  const save = () => {
    if (variants.length === 0) return;
    updateMenuItem(item.id, { variants });
    setEditing(false);
  };

  const addVariant = () => {
    setVariants([...variants, { id: `v-${Date.now()}`, name: 'New Variant', price: 0, available: true }]);
  };

  const updateVariant = (id: string, key: keyof Variant, val: any) => {
    setVariants(prev => prev.map(v => v.id === id ? { ...v, [key]: val } : v));
  };

  const removeVariant = (id: string) => {
    setVariants(prev => prev.filter(v => v.id !== id));
  };

  if (editing) {
    return (
      <div className="flex flex-col gap-2 min-w-[200px]">
        {variants.map(v => (
          <div key={v.id} className="flex items-center gap-1">
            <input
              value={v.name}
              onChange={e => updateVariant(v.id, 'name', e.target.value)}
              className="w-20 bg-white/10 border border-[#FF4500]/40 rounded-lg px-2 py-1 text-xs text-white font-bold focus:outline-none"
              placeholder="Name"
            />
            <span className="text-gray-500 text-xs">₹</span>
            <input
              type="number"
              value={v.price}
              onChange={e => updateVariant(v.id, 'price', parseFloat(e.target.value) || 0)}
              className="w-16 bg-white/10 border border-[#FF4500]/40 rounded-lg px-2 py-1 text-xs text-white font-bold focus:outline-none"
            />
            <button onClick={() => removeVariant(v.id)}><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
          </div>
        ))}
        <div className="flex items-center gap-2 mt-1">
          <button onClick={addVariant} className="text-xs text-[#FF8C00] flex items-center gap-1"><PlusCircle className="w-3 h-3"/> Add</button>
          <div className="flex-1"></div>
          <button onClick={save} className="text-green-400"><Check className="w-4 h-4" /></button>
          <button onClick={() => setEditing(false)} className="text-gray-500"><X className="w-4 h-4" /></button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 items-start">
      {item.variants?.map(v => (
        <div key={v.id} className="flex items-center gap-2">
          <span className="text-[10px] text-gray-400 border border-gray-600 rounded px-1">{v.name}</span>
          <span className="flame-text text-sm font-black">₹{v.price.toFixed(2)}</span>
        </div>
      ))}
      <button onClick={() => setEditing(true)} className="text-xs text-gray-500 hover:text-white flex items-center gap-1 mt-1">
        <Edit3 className="w-3 h-3" /> Edit Variants
      </button>
    </div>
  );
}

/* ── Add Item Modal ── */
function AddItemModal({ onClose }: { onClose: () => void }) {
  const { addMenuItem } = useAdmin();
  const [form, setForm] = useState({
    name: '', description: '', category: 'Burgers' as Category,
    emoji: '🍔', gradientClass: 'grad-burger',
    popular: false, spicy: false, vegetarian: false, isNew: true,
  });
  
  const [variants, setVariants] = useState<Variant[]>([
    { id: `v-${Date.now()}`, name: 'Regular', price: 99, available: true }
  ]);

  const submit = () => {
    if (!form.name || variants.length === 0) return;
    const item: MenuItem = {
      id: `custom-${Date.now()}`,
      ...form,
      variants,
      rating: 4.5,
      reviewCount: 0,
    };
    addMenuItem(item);
    onClose();
  };

  const updateVariant = (id: string, key: keyof Variant, val: any) => {
    setVariants(prev => prev.map(v => v.id === id ? { ...v, [key]: val } : v));
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', damping: 22 }}
        onClick={e => e.stopPropagation()}
        className="bg-[#141414] border border-white/10 rounded-3xl p-6 w-full max-w-md shadow-2xl my-8"
      >
        <h3 className="text-lg font-black text-white mb-5">Add New Item</h3>
        <div className="space-y-4">
          <input placeholder="Item name *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input-flame text-sm" />
          <textarea placeholder="Description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="input-flame text-sm resize-none" rows={2} />
          
          <div>
            <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider font-semibold">Variants *</p>
            {variants.map(v => (
              <div key={v.id} className="flex items-center gap-2 mb-2">
                <input value={v.name} onChange={e => updateVariant(v.id, 'name', e.target.value)} placeholder="Name" className="input-flame text-xs flex-1" />
                <input type="number" value={v.price} onChange={e => updateVariant(v.id, 'price', parseFloat(e.target.value) || 0)} placeholder="Price" className="input-flame text-xs w-24" />
                <button onClick={() => setVariants(vs => vs.filter(x => x.id !== v.id))} className="text-red-400 p-2"><Trash2 className="w-4 h-4"/></button>
              </div>
            ))}
            <button onClick={() => setVariants([...variants, { id: `v-${Date.now()}`, name: 'New', price: 0, available: true }])} className="text-xs text-[#FF8C00] font-bold">+ Add Variant</button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <input placeholder="Emoji" value={form.emoji} onChange={e => setForm(f => ({ ...f, emoji: e.target.value }))} className="input-flame text-sm" />
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as Category }))} className="input-flame text-sm appearance-none">
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider font-semibold">Card Style</p>
            <div className="flex gap-2 flex-wrap">
              {GRAD_OPTIONS.map(g => (
                <button key={g.cls} onClick={() => setForm(f => ({ ...f, gradientClass: g.cls }))}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${g.cls}
                              ${form.gradientClass === g.cls ? 'border-[#FF4500] text-white' : 'border-white/10 text-gray-400'}`}>
                  {g.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {[
              { key: 'popular', label: '🔥 Popular' },
              { key: 'spicy', label: '🌶 Spicy' },
              { key: 'vegetarian', label: '🌿 Veg' },
              { key: 'isNew', label: '✨ New' },
            ].map(({ key, label }) => (
              <BadgeToggle
                key={key}
                label={label}
                active={!!(form as Record<string, unknown>)[key]}
                onClick={() => setForm(f => ({ ...f, [key]: !(f as Record<string, unknown>)[key] }))}
              />
            ))}
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-white/8 text-sm text-gray-300 hover:bg-white/12 transition-colors">Cancel</button>
          <button onClick={submit} className="flex-1 btn-flame py-2.5 text-sm font-bold">Add Item</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ── Main table ── */
export default function MenuTable() {
  const { adminMenuItems, updateMenuItem, deleteMenuItem } = useAdmin();
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState<Category | 'All'>('All');
  const [showAdd, setShowAdd] = useState(false);

  const filtered = useMemo(() => adminMenuItems.filter(item => {
    const matchQ   = item.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = catFilter === 'All' || item.category === catFilter;
    return matchQ && matchCat;
  }), [adminMenuItems, search, catFilter]);

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search menu…"
            className="input-flame pl-9 text-sm"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {(['All', ...CATEGORIES] as const).map(c => (
            <button key={c} onClick={() => setCatFilter(c)}
              className={`px-3 py-2 rounded-xl text-xs font-bold border whitespace-nowrap transition-all ${
                catFilter === c
                  ? 'bg-gradient-to-r from-[#FF4500] to-[#FF8C00] text-white border-transparent'
                  : 'bg-white/5 text-gray-400 border-white/10 hover:text-white'
              }`}>
              {c}
            </button>
          ))}
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-flame px-4 py-2 text-sm font-bold flex items-center gap-2 shrink-0">
          <Plus className="w-4 h-4" /> <span>Add Item</span>
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-white/8">
        <table className="w-full">
          <thead className="bg-white/3">
            <tr>
              {['Item', 'Category', 'Variants & Prices', 'Tags', 'Rating', ''].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[10px] uppercase tracking-wider text-gray-600 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <AnimatePresence>
              {filtered.map(item => (
                <motion.tr
                  key={item.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="border-t border-white/5 hover:bg-white/3 transition-colors"
                >
                  {/* Item */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl ${item.gradientClass} flex items-center justify-center text-xl shrink-0`}>
                        {item.emoji}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white leading-tight">{item.name}</p>
                        <p className="text-[11px] text-gray-600 line-clamp-1 max-w-[180px]">{item.description}</p>
                      </div>
                    </div>
                  </td>
                  {/* Category */}
                  <td className="px-4 py-3">
                    <span className="text-xs text-gray-400 font-medium">{item.category}</span>
                  </td>
                  {/* Variants */}
                  <td className="px-4 py-3"><VariantsCell item={item} /></td>
                  {/* Tags */}
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      <BadgeToggle label="🔥 Pop"  active={!!item.popular}    onClick={() => updateMenuItem(item.id, { popular:    !item.popular    })} />
                      <BadgeToggle label="🌶 Spicy" active={!!item.spicy}      onClick={() => updateMenuItem(item.id, { spicy:      !item.spicy      })} />
                      <BadgeToggle label="🌿 Veg"   active={!!item.vegetarian} onClick={() => updateMenuItem(item.id, { vegetarian: !item.vegetarian })} />
                      <BadgeToggle label="✨ New"   active={!!item.isNew}      onClick={() => updateMenuItem(item.id, { isNew:      !item.isNew      })} />
                    </div>
                  </td>
                  {/* Rating */}
                  <td className="px-4 py-3">
                    <span className="text-xs font-bold text-[#FFD700]">★ {item.rating}</span>
                    <span className="text-[10px] text-gray-600 ml-1">({item.reviewCount.toLocaleString()})</span>
                  </td>
                  {/* Delete */}
                  <td className="px-4 py-3">
                    <button
                      onClick={() => deleteMenuItem(item.id)}
                      className="w-7 h-7 rounded-lg bg-red-500/10 hover:bg-red-500/20 flex items-center
                                 justify-center transition-colors border border-red-500/10"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </button>
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-600">
            <p className="text-3xl mb-2">🍽️</p>
            <p className="text-sm">No items found</p>
          </div>
        )}
      </div>

      {/* Add modal */}
      <AnimatePresence>
        {showAdd && <AddItemModal onClose={() => setShowAdd(false)} />}
      </AnimatePresence>
    </div>
  );
}
