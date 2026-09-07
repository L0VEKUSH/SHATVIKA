'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import Image from 'next/image';

interface GalleryItem {
  id: string;
  title: string;
  description?: string;
  category: string;
  imageUrl: string;
  imageType: 'image' | 'video' | 'youtube';
  youtubeId?: string;
  featured?: boolean;
}

/* ── Lightbox ──────────────────────────────────── */
function Lightbox({
  item,
  onClose,
  onNext,
  onPrev,
  hasNext,
  hasPrev,
}: {
  item: GalleryItem;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  hasNext: boolean;
  hasPrev: boolean;
}) {
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && hasNext) onNext();
      if (e.key === 'ArrowLeft' && hasPrev) onPrev();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onNext, onPrev, hasNext, hasPrev]);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  // Mobile swipe support
  const touchStartX = useRef(0);
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(diff) < 50) return;
    if (diff < 0 && hasNext) onNext();
    if (diff > 0 && hasPrev) onPrev();
  };

  return (
    <motion.div
      className="fixed inset-0 bg-black/95 z-50 flex flex-col items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      role="dialog"
      aria-modal="true"
    >
      {/* Close button */}
      <button
        ref={closeRef}
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition z-10"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Media container */}
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="flex flex-col items-center gap-4 max-w-4xl w-full"
      >
        {/* Image/Video */}
        {item.imageType === 'youtube' && item.youtubeId ? (
          <iframe
            src={`https://www.youtube.com/embed/${item.youtubeId}?autoplay=1`}
            title={item.title}
            className="w-full aspect-video rounded-xl border border-white/20"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : item.imageType === 'video' ? (
          <video
            controls
            autoPlay
            className="w-full max-h-[70vh] rounded-xl border border-white/20"
          >
            <source src={item.imageUrl} type="video/mp4" />
            Your browser does not support the video tag.
          </video>
        ) : (
          <div className="relative w-full max-h-[70vh] rounded-xl border border-white/20" style={{ height: 'min(70vh, 60vw)' }}>
            <Image
              src={item.imageUrl}
              alt={item.title}
              fill
              sizes="(max-width: 768px) 90vw, 1200px"
              style={{ objectFit: 'contain' }}
              priority
            />
          </div>
        )}

        {/* Info */}
        <div className="text-center">
          <h3 className="text-2xl font-black text-white mb-2">{item.title}</h3>
          {item.description && <p className="text-gray-300 text-sm">{item.description}</p>}
          <p className="text-xs text-gray-500 mt-2">{item.category}</p>
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-4">
          <button
            onClick={onPrev}
            disabled={!hasPrev}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-white transition"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={onNext}
            disabled={!hasNext}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-white transition"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ── Gallery Tile ──────────────────────────────── */
function GalleryTile({
  item,
  onClick,
}: {
  item: GalleryItem;
  onClick: (item: GalleryItem) => void;
}) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      onClick={() => onClick(item)}
      className="group rounded-2xl overflow-hidden cursor-pointer bg-black/40 border border-white/10 hover:border-white/30 transition-all"
    >
      {/* Image/Video Thumbnail */}
      <div className="relative aspect-square overflow-hidden bg-white/5">
        {item.imageType === 'youtube' && item.youtubeId ? (
          <>
            <div className="relative w-full h-full">
              <Image
                src={`https://img.youtube.com/vi/${item.youtubeId}/sddefault.jpg`}
                alt={item.title}
                fill
                sizes="(max-width: 768px) 33vw, 25vw"
                style={{ objectFit: 'cover' }}
                loading="lazy"
              />
            </div>
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 group-hover:bg-black/50 transition">
              <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
                <div className="w-0 h-0 border-l-8 border-l-transparent border-r-0 border-t-5 border-t-transparent border-b-5 border-b-transparent" />
              </div>
            </div>
          </>
        ) : item.imageType === 'video' ? (
          <>
            <div className="relative w-full h-full">
              <Image
                src={item.imageUrl}
                alt={item.title}
                fill
                sizes="(max-width: 768px) 33vw, 25vw"
                style={{ objectFit: 'cover' }}
                loading="lazy"
              />
            </div>
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 group-hover:bg-black/50 transition">
              <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
                <span className="text-lg">▶</span>
              </div>
            </div>
          </>
        ) : (
          <div className="relative w-full h-full">
            <Image
              src={item.imageUrl}
              alt={item.title}
              fill
              sizes="(max-width: 768px) 33vw, 25vw"
              style={{ objectFit: 'cover' }}
              loading="lazy"
            />
          </div>
        )}

        {/* Featured badge */}
        {item.featured && (
          <div className="absolute top-2 right-2 bg-gradient-to-r from-[#FF4500] to-[#FFD700] text-white text-xs font-black px-3 py-1 rounded-full">
            Featured
          </div>
        )}
      </div>

      {/* Text Overlay */}
      <div className="p-4">
        <h3 className="font-bold text-white text-sm group-hover:text-[#FFD700] transition mb-1 truncate">
          {item.title}
        </h3>
        <p className="text-xs text-gray-400">{item.category}</p>
      </div>
    </motion.div>
  );
}

/* ── Main Component ────────────────────────────── */
export default function Gallery() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [lightboxItem, setLightboxItem] = useState<GalleryItem | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  useEffect(() => {
    async function loadGallery() {
      try {
        const res = await fetch('/api/gallery');
        if (!res.ok) throw new Error('Failed to load gallery');
        const data = await res.json();

        const realItems = (data.items || [])
          .map((item: { id?: string; _id?: { toString: () => string }; title?: string; description?: string; category?: string; imageUrl: string; imageType?: 'image' | 'video' | 'youtube'; youtubeId?: string; featured?: boolean }) => ({
            id: item.id || item._id?.toString(),
            title: item.title || '',
            description: item.description || '',
            category: item.category || 'Food',
            imageUrl: item.imageUrl,
            imageType: item.imageType || 'image',
            youtubeId: item.youtubeId || undefined,
            featured: item.featured || false,
          }));

        setItems(realItems);
        setFilteredItems(realItems);
      } catch (err) {
        setItems([]);
        setFilteredItems([]);
      } finally {
        setLoading(false);
      }
    }

    loadGallery();
  }, []);

  useEffect(() => {
    if (selectedCategory === 'All') {
      setFilteredItems(items);
    } else {
      setFilteredItems(items.filter(item => item.category === selectedCategory));
    }
  }, [selectedCategory, items]);

  const categories = ['All', ...new Set(items.map(item => item.category))];
  const featuredItems = items.filter(item => item.featured);

  const handleLightboxOpen = (item: GalleryItem) => {
    setLightboxItem(item);
    setLightboxIndex(filteredItems.findIndex(i => i.id === item.id));
  };

  const handleLightboxNext = () => {
    if (lightboxIndex < filteredItems.length - 1) {
      const nextIndex = lightboxIndex + 1;
      setLightboxItem(filteredItems[nextIndex]);
      setLightboxIndex(nextIndex);
    }
  };

  const handleLightboxPrev = () => {
    if (lightboxIndex > 0) {
      const prevIndex = lightboxIndex - 1;
      setLightboxItem(filteredItems[prevIndex]);
      setLightboxIndex(prevIndex);
    }
  };

  return (
    <section className="section-pad bg-[#0a0a0a]">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <p className="text-xs uppercase tracking-[0.3em] text-[#FF8C00] font-semibold mb-3">
            Visual Journey
          </p>
          <h2 className="text-4xl md:text-5xl font-black text-white mb-4">
            The <span className="flame-text">Gallery</span>
          </h2>
          <p className="text-gray-400 max-w-md mx-auto text-sm md:text-base">
            A feast for the eyes before the feast for the palate.
          </p>
        </motion.div>

        {/* Category Filter */}
        {categories.length > 1 && (
          <motion.div
            className="flex flex-wrap items-center justify-center gap-2 mb-10"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 rounded-full text-sm font-semibold transition ${
                  selectedCategory === cat
                    ? 'bg-gradient-to-r from-[#FF4500] to-[#FFD700] text-white'
                    : 'bg-white/10 text-gray-400 hover:bg-white/20'
                }`}
              >
                {cat}
              </button>
            ))}
          </motion.div>
        )}

        {featuredItems.length > 0 && (
          <motion.div
            className="mb-10"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black text-white">Featured Moments</h3>
              <span className="text-xs uppercase tracking-[0.25em] text-[#FF8C00]">Curated highlights</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {featuredItems.map((item, i) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                >
                  <GalleryTile item={item} onClick={handleLightboxOpen} />
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Gallery Grid or Empty State */}
        {loading ? (
          <div className="glass rounded-3xl border border-white/8 p-10 text-center">
            <p className="text-gray-400 text-sm">Loading gallery…</p>
          </div>
        ) : filteredItems.length > 0 ? (
          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
          >
            {filteredItems.map((item, i) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
              >
                <GalleryTile item={item} onClick={handleLightboxOpen} />
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <div className="glass rounded-3xl border border-white/8 p-10 text-center">
            <p className="text-4xl mb-3">📸</p>
            <h3 className="text-xl font-black text-white mb-2">Fresh moments are on the way</h3>
            <p className="text-gray-400 text-sm max-w-xl mx-auto">
              New photos and stories from SHATVIKA CORNER will appear here as soon as they are shared.
            </p>
          </div>
        )}
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxItem && (
          <Lightbox
            item={lightboxItem}
            onClose={() => setLightboxItem(null)}
            onNext={handleLightboxNext}
            onPrev={handleLightboxPrev}
            hasNext={lightboxIndex < filteredItems.length - 1}
            hasPrev={lightboxIndex > 0}
          />
        )}
      </AnimatePresence>
    </section>
  );
}
