'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ZoomIn } from 'lucide-react';
import { useAdmin } from '@/context/AdminContext';
import type { GalleryItem } from '@/types';

/* ── Lightbox ──────────────────────────────────────── */
function Lightbox({
  item, onClose,
}: {
  item: GalleryItem;
  onClose: () => void;
}) {
  return (
    <motion.div
      className="lightbox-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.75, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.75, opacity: 0 }}
        transition={{ type: 'spring', damping: 22 }}
        className="relative rounded-3xl overflow-hidden max-w-sm w-full mx-4"
        style={{ background: item.gradient }}
        onClick={e => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm
                     flex items-center justify-center border border-white/15 text-white
                     hover:bg-black/60 transition-colors z-10"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Content */}
        <div className="flex flex-col items-center py-16 px-8 text-center">
          <motion.span
            className="text-9xl mb-6"
            animate={{ rotate: [0, -8, 8, -8, 0], scale: [1, 1.1, 1] }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            {item.emoji}
          </motion.span>
          <h3 className="text-2xl font-black text-white mb-2">{item.label}</h3>
          <p className="text-gray-400 text-sm">SHATVIKA CORNER Signature</p>

          <button className="btn-flame mt-8 px-6 py-3 text-sm font-bold">
            <span>Order This</span>
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ── Gallery item tile ─────────────────────────────── */
function GalleryTile({
  item, onClick,
}: {
  item: GalleryItem;
  onClick: (item: GalleryItem) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="masonry-item rounded-2xl overflow-hidden cursor-pointer relative group"
      style={{ background: item.gradient }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onClick(item)}
    >
      <div
        className={`flex flex-col items-center justify-center px-4 py-8 transition-transform duration-300 ${
          item.tall ? 'py-14' : 'py-8'
        }`}
      >
        {/* Food emoji — scales on hover */}
        <motion.span
          className="text-6xl md:text-7xl block"
          animate={hovered ? { scale: 1.18, rotate: 6 } : { scale: 1, rotate: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
          {item.emoji}
        </motion.span>

        {/* Label */}
        <p className="text-xs font-bold text-white/70 mt-3 group-hover:text-white transition-colors">
          {item.label}
        </p>
      </div>

      {/* Hover overlay */}
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center"
          >
            <div className="w-10 h-10 rounded-full bg-white/20 border border-white/30
                            flex items-center justify-center">
              <ZoomIn className="w-4 h-4 text-white" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Main component ────────────────────────────────── */
export default function Gallery() {
  const [lightboxItem, setLightboxItem] = useState<GalleryItem | null>(null);
  const { galleryItems } = useAdmin();

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
            Food Porn
          </p>
          <h2 className="text-4xl md:text-5xl font-black text-white mb-4">
            The <span className="flame-text">Gallery</span>
          </h2>
          <p className="text-gray-400 max-w-md mx-auto text-sm md:text-base">
            A feast for the eyes before the feast for the palate. Manage gallery items from the admin panel.
          </p>
        </motion.div>

        {/* Masonry grid */}
        {galleryItems.length > 0 ? (
          <motion.div
            className="masonry"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15 }}
          >
            {galleryItems.map((item, i) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.07 }}
              >
                <GalleryTile item={item} onClick={setLightboxItem} />
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <div className="glass rounded-3xl border border-white/8 p-10 text-center">
            <p className="text-4xl mb-3">🖼️</p>
            <h3 className="text-xl font-black text-white mb-2">Gallery is empty</h3>
            <p className="text-gray-400 text-sm max-w-xl mx-auto">
              
            </p>
          </div>
        )}

        {/* Bottom CTA */}
        <motion.div
          className="text-center mt-12"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
        >
          <p className="text-gray-500 text-sm mb-5">
            Follow us for daily food shots
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            {[
              { label: '@SHATVIKA CORNER',    platform: 'Instagram', emoji: '📸' },
              { label: '/SHATVIKA CORNERHQ', platform: 'TikTok',    emoji: '🎵' },
              { label: '@SHATVIKA CORNERFD', platform: 'Twitter/X', emoji: '🐦' },
            ].map(s => (
              <span
                key={s.platform}
                className="glass rounded-full px-4 py-2 text-xs font-medium text-gray-400 border border-white/8"
              >
                {s.emoji} {s.label}
              </span>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Lightbox portal */}
      <AnimatePresence>
        {lightboxItem && (
          <Lightbox item={lightboxItem} onClose={() => setLightboxItem(null)} />
        )}
      </AnimatePresence>
    </section>
  );
}
