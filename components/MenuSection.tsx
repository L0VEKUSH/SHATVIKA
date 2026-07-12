'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Heart, Plus, Star, Flame, Leaf, Zap } from 'lucide-react';
import { Category, MenuItem } from '@/types';
import { useCart } from '@/context/CartContext';
import { useAdmin } from '@/context/AdminContext';

const CATEGORIES: Category[] = [
  'All', 'Burgers', 'Pizza', 'Sandwiches', 'Fries', 'Drinks', 'Desserts',
];

const CATEGORY_EMOJIS: Record<Category, string> = {
  All:        '🍽️',
  Burgers:    '🍔',
  Pizza:      '🍕',
  Sandwiches: '🥪',
  Fries:      '🍟',
  Drinks:     '🥤',
  Desserts:   '🍰',
};

/* ── Star renderer ─────────────────────────────────── */
function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <Star
          key={n}
          className={`w-3 h-3 ${n <= Math.round(rating) ? 'fill-[#FFD700] text-[#FFD700]' : 'text-gray-700'}`}
        />
      ))}
    </div>
  );
}

/* ── Single food card ──────────────────────────────── */
function FoodCard({ item }: { item: MenuItem }) {
  const { addToCart, toggleWishlist, isInWishlist } = useCart();
  const [added, setAdded] = useState(false);
  const wishlisted = isInWishlist(item.id);
  const [selectedVariantId, setSelectedVariantId] = useState<string>(item.variants[0]?.id || '');

  const handleAdd = () => {
    const variant = item.variants.find(v => v.id === selectedVariantId);
    if (!variant) return;
    addToCart(item, variant);
    setAdded(true);
    setTimeout(() => setAdded(false), 1400);
  };

  const selectedVariant = item.variants.find(v => v.id === selectedVariantId) || item.variants[0];
  const price = selectedVariant?.price || 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.35 }}
      whileHover={{ y: -6, transition: { duration: 0.25 } }}
      className={`relative rounded-2xl overflow-hidden border border-white/8 ${item.gradientClass}
                  flex flex-col group cursor-default`}
    >
      {/* Badges */}
      <div className="absolute top-3 left-3 flex flex-col gap-1.5 z-10">
        {item.popular    && <span className="tag-popular   text-[10px] font-bold px-2 py-0.5 rounded-full">🔥 Popular</span>}
        {item.isNew      && <span className="tag-new       text-[10px] font-bold px-2 py-0.5 rounded-full">✨ New</span>}
        {item.spicy      && <span className="tag-spicy     text-[10px] font-bold px-2 py-0.5 rounded-full">🌶 Spicy</span>}
        {item.vegetarian && <span className="tag-veg       text-[10px] font-bold px-2 py-0.5 rounded-full">🌿 Veg</span>}
      </div>

      {/* Wishlist button */}
      <button
        onClick={() => toggleWishlist(item.id)}
        aria-label={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
        className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full glass
                   flex items-center justify-center transition-colors hover:bg-white/15"
      >
        <Heart
          className={`w-4 h-4 transition-colors ${
            wishlisted ? 'fill-[#FF4500] text-[#FF4500]' : 'text-gray-400'
          }`}
        />
      </button>

      {/* Food emoji visual */}
      <div className="flex items-center justify-center pt-8 pb-4 text-7xl select-none
                      group-hover:scale-110 transition-transform duration-300">
        {item.emoji}
      </div>

      {/* Card body */}
      <div className="p-4 pt-0 flex flex-col flex-1 gap-2">
        <div>
          <h3 className="font-bold text-white text-sm leading-tight">{item.name}</h3>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed line-clamp-2">
            {item.description}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <Stars rating={item.rating} />
          <span className="text-[11px] text-gray-500 font-medium">
            {item.rating} ({item.reviewCount.toLocaleString()})
          </span>
        </div>

        {item.variants.length > 1 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {item.variants.map((variant) => (
              <button
                key={
                  variant.id ??
                  (variant as any)._id ??
                  (variant as any).slug ??
                  (variant as any).code ??
                  variant.name
                }
                onClick={() => setSelectedVariantId(variant.id)}
                className={`text-[10px] px-3 py-1.5 rounded-full border transition-all duration-200 transform-gpu hover:scale-[1.03] ${
                  selectedVariantId === variant.id
                    ? 'bg-[#FF4500] text-white border-transparent shadow-[0_0_0_3px_rgba(255,69,0,0.15)]'
                    : 'bg-[#0f0f0f] text-gray-200 border-white/15 hover:border-white/30'
                }`}
              >
                {variant.name}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between mt-auto pt-2 border-t border-white/5">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white truncate">{item.name}</p>
            <p className="flame-text text-sm font-black mt-0.5">₹{(selectedVariant?.price || 0).toFixed(2)}</p>
          </div>

          <button
            onClick={handleAdd}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold
                        transition-all duration-200 ${
                          added
                            ? 'bg-green-500/20 border border-green-500/40 text-green-400'
                            : 'btn-flame'
                        }`}
          >
            {added ? (
              <>✓ Added</>
            ) : (
              <>
                <Plus className="w-3 h-3" />
                Add
              </>
            )}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

/* ── Main component ────────────────────────────────── */
export default function MenuSection() {
  const [activeCategory, setActiveCategory] = useState<Category>('All');
  const [searchQuery,    setSearchQuery]    = useState('');
  const { adminMenuItems } = useAdmin();

  const filtered = useMemo(() => {
    return adminMenuItems.filter(item => {
      const matchCat   = activeCategory === 'All' || item.category === activeCategory;
      const matchSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          item.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [activeCategory, searchQuery, adminMenuItems]);

  return (
    <section className="section-pad bg-[#0a0a0a]">
      <div className="max-w-7xl mx-auto">

        {/* ── Section header ─── */}
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <p className="text-xs uppercase tracking-[0.3em] text-[#FF8C00] font-semibold mb-3">
            What We Serve
          </p>
          <h2 className="text-4xl md:text-5xl font-black text-white mb-4">
            Our <span className="flame-text">Live</span> Menu
          </h2>
          <p className="text-gray-400 max-w-lg mx-auto text-sm md:text-base">
            Manage items in the admin panel and the customer menu updates immediately.
          </p>
        </motion.div>

        {/* ── Search bar ─── */}
        <motion.div
          className="relative max-w-md mx-auto mb-8"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
        >
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="search"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search burgers, pizza, fries…"
            className="input-flame pl-11"
          />
        </motion.div>

        {/* ── Category tabs ─── */}
        <motion.div
          className="flex items-center gap-2 overflow-x-auto pb-2 mb-8 scrollbar-hide justify-start md:justify-center"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.15 }}
        >
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold
                          whitespace-nowrap border transition-all duration-200 shrink-0 ${
                            activeCategory === cat
                              ? 'bg-gradient-to-r from-[#FF4500] to-[#FF8C00] text-white border-transparent shadow-lg shadow-[#FF4500]/25'
                              : 'bg-white/4 text-gray-400 border-white/8 hover:bg-white/8 hover:text-white'
                          }`}
            >
              <span>{CATEGORY_EMOJIS[cat]}</span>
              {cat}
            </button>
          ))}
        </motion.div>

        {/* ── Food grid ─── */}
        <AnimatePresence mode="wait">
          {filtered.length > 0 ? (
            <motion.div
              key={activeCategory + searchQuery}
              className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
            {filtered.map((item, i) => (
                <motion.div
                  key={
                    item.id ??
                    (item as any)._id ??
                    (item as any).slug ??
                    (item as any).code ??
                    item.name
                  }
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <FoodCard item={item} />
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              className="text-center py-20"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <p className="text-5xl mb-4">🍽️</p>
              <p className="text-gray-400 font-medium">
                {adminMenuItems.length === 0
                  ? 'No menu items have been created yet.'
                  : `No items found for “${searchQuery}”`}
              </p>
              <button
                onClick={() => { setSearchQuery(''); setActiveCategory('All'); }}
                className="mt-4 text-[#FF8C00] text-sm font-semibold hover:underline"
              >
                Clear filters
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
