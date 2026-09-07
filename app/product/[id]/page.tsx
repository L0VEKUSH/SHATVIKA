'use client';

import { useEffect, useState, use, useCallback } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import {
  Star, ShoppingCart, Zap, Plus, Minus, ChevronLeft,
  CheckCircle, ThumbsUp, Send, Heart, Share2, LogIn, AlertCircle,
} from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';

/* ── Types ─────────────────────────────────────────── */
interface VariantType { id: string; name: string; price: number; available: boolean; }
interface ProductType {
  _id: string; id?: string; name: string; description: string;
  ingredients?: string[]; images?: string[]; variants: VariantType[];
  basePrice?: number; rating: number; reviewCount: number;
  category: string; emoji: string; gradientClass: string;
  popular?: boolean; spicy?: boolean; vegetarian?: boolean;
  available?: boolean;
}
interface ReviewType {
  id: string; name: string; rating: number; text?: string;
  title?: string; imageUrl?: string | null;
  mediaUrls?: string[]; verifiedPurchase?: boolean;
  isAnonymous?: boolean; helpfulCount?: number; createdAt?: string;
  replyText?: string | null;
}

/* ── Star renderer ─────────────────────────────────── */
function Stars({ rating, size = 4 }: { rating: number; size?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <Star
          key={n}
          className={`w-${size} h-${size} ${n <= Math.round(rating) ? 'fill-[#FFD700] text-[#FFD700]' : 'text-gray-700'}`}
          style={{ width: `${size * 4}px`, height: `${size * 4}px` }}
        />
      ))}
    </div>
  );
}

/* ── Rating Bar ───────────────────────────────────── */
function RatingBar({ star, pct }: { star: number; pct: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1 w-10 text-sm text-gray-400 shrink-0">
        {star} <Star className="w-3 h-3 fill-current text-[#FFD700]" />
      </div>
      <div className="flex-1 h-2.5 bg-white/5 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, delay: (5 - star) * 0.1 }}
          className="h-full rounded-full bg-gradient-to-r from-[#FF4500] to-[#FFD700]"
        />
      </div>
      <span className="text-xs text-gray-500 w-10 text-right">{pct}%</span>
    </div>
  );
}

function ProductReviewCard({ review, onToggleHelpful }: { review: ReviewType; onToggleHelpful: (id: string, helpful: boolean) => void }) {
  const [isHelpful, setIsHelpful] = useState(false);

  useEffect(() => {
    const key = `review_${review.id}_helpful`;
    setIsHelpful(localStorage.getItem(key) === '1');
  }, [review.id]);

  return (
    <div className="glass rounded-2xl p-6 border border-white/8">
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FF4500] to-[#FFD700] flex items-center justify-center text-sm font-bold">
            {review.name?.[0] || 'U'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm">{review.name}</span>
              {review.verifiedPurchase && (
                <span className="flex items-center gap-1 text-[10px] text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">
                  <CheckCircle className="w-3 h-3" /> Verified
                </span>
              )}
            </div>
            <span className="text-[11px] text-gray-500">
              {review.createdAt ? new Date(review.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' }) : ''}
            </span>
          </div>
        </div>
        <Stars rating={review.rating} />
      </div>
      {review.text && <p className="text-gray-300 text-sm leading-relaxed mb-3">{review.text}</p>}
      {(review.imageUrl || review.mediaUrls?.length) ? (
        <div className="flex gap-2 mb-3">
          {(review.mediaUrls?.length ? review.mediaUrls : [review.imageUrl!]).map((url, i) => (
            <div key={i} className="w-16 h-16 rounded-lg overflow-hidden border border-white/10 relative">
              <Image src={url} alt="Review media" fill sizes="64px" style={{ objectFit: 'cover' }} />
            </div>
          ))}
        </div>
      ) : null}
      {review.replyText && (
        <div className="mb-3 rounded-xl bg-[#FF4500]/10 border border-[#FF4500]/20 p-3 text-sm text-gray-300">
          <p className="text-xs font-bold text-[#FF8C00] mb-1">Response from SHATVIKA CORNER</p>
          {review.replyText}
        </div>
      )}
      <button
        onClick={async () => {
          const key = `review_${review.id}_helpful`;
          await onToggleHelpful(review.id, isHelpful);
          const next = !isHelpful;
          setIsHelpful(next);
          if (next) localStorage.setItem(key, '1');
          else localStorage.removeItem(key);
        }}
        className="flex items-center gap-1 text-xs text-gray-500 hover:text-white transition-colors"
      >
        <ThumbsUp className={`w-3.5 h-3.5 ${isHelpful ? 'fill-[#FFD700] text-[#FFD700]' : ''}`} />
        Helpful ({review.helpfulCount || 0})
      </button>
    </div>
  );
}
export default function ProductDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = use(params);
  const { id } = unwrappedParams;

  const [product, setProduct] = useState<ProductType | null>(null);
  const [reviews, setReviews] = useState<ReviewType[]>([]);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [reviewSuccess, setReviewSuccess] = useState(false);
  const [added, setAdded] = useState(false);
  const [relatedItems, setRelatedItems] = useState<ProductType[]>([]);

  const { addToCart, toggleWishlist, isInWishlist } = useCart();
  const { isAuthenticated, customer } = useAuth();

  const loadReviews = useCallback(async (productId: string) => {
    const revRes = await fetch(`/api/reviews?menuItemId=${productId}&status=approved`);
    if (revRes.ok) {
      const revData = await revRes.json();
      setReviews(revData.reviews || []);
    }
  }, []);

  /* Fetch product */
  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const res = await fetch(`/api/menu/${id}`);
        if (!res.ok) throw new Error('Not found');
        const data = await res.json();
        setProduct(data);
        if (data.variants?.length > 0) {
          setSelectedVariantId(data.variants[0].id || data.variants[0]._id);
        }
        // Fetch related items from same category
        const menuRes = await fetch('/api/menu');
        if (menuRes.ok) {
          const allItems = await menuRes.json();
          setRelatedItems(
            allItems
              .filter((i: ProductType) => i.category === data.category && (i._id || i.id) !== id)
              .slice(0, 4)
          );
        }
        // Fetch reviews for this product
        await loadReviews(id);
      } catch {
        setProduct(null);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, loadReviews]);

  const submitReview = async () => {
    if (!product) return;
    setReviewSubmitting(true);
    setReviewError('');
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          menuItemId: id,
          rating: reviewRating,
          text: reviewText.trim(),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = data?.message || data?.error || 'Failed to submit review';
        throw new Error(msg);
      }
      setReviewSuccess(true);
      setReviewText('');
      setReviewRating(5);
      setShowReviewForm(false);
      setTimeout(() => setReviewSuccess(false), 3000);
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'Failed to submit review');
    } finally {
      setReviewSubmitting(false);
    }
  };

  const toggleHelpful = async (reviewId: string, currentlyHelpful: boolean) => {
    try {
      const res = await fetch(`/api/reviews/${reviewId}/helpful`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ helpful: !currentlyHelpful }),
      });
      if (res.ok) await loadReviews(id);
    } catch {
      // ignore
    }
  };

  const productId = product?._id || product?.id || '';
  const wishlisted = isInWishlist(productId);
  const selectedVariant = product?.variants?.find(v => (v.id || (v as any)._id) === selectedVariantId);
  const currentPrice = selectedVariant?.price || product?.basePrice || 0;
  const totalPrice = currentPrice * quantity;

  const handleAddToCart = useCallback(() => {
    if (!product) return;
    if (selectedVariant) {
      addToCart(product as any, selectedVariant as any);
    } else if (product.basePrice) {
      // Create a synthetic variant for items with only basePrice
      addToCart(product as any, { id: 'base', name: 'Regular', price: product.basePrice, available: true });
    }
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }, [product, selectedVariant, addToCart]);

  // Rating distribution (mock from reviews if available)
  const ratingDist = [0, 0, 0, 0, 0];
  reviews.forEach(r => { if (r.rating >= 1 && r.rating <= 5) ratingDist[r.rating - 1]++; });
  const totalReviews = reviews.length;
  const avgRating = totalReviews > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / totalReviews : product?.rating || 0;
  const ratingPcts = ratingDist.map(c => totalReviews > 0 ? Math.round((c / totalReviews) * 100) : 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          className="w-12 h-12 border-4 border-[#FF4500] border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center text-white gap-4">
        <span className="text-6xl">🍽️</span>
        <h1 className="text-3xl font-black">Product Not Found</h1>
        <p className="text-gray-400">The item you are looking for does not exist.</p>
        <Link href="/" className="btn-flame px-6 py-3 text-sm font-bold mt-4">
          ← Back to Menu
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white pb-20">
      {/* Background glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#FF4500]/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#FFD700]/8 rounded-full blur-[120px]" />
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 relative z-10">
        {/* Breadcrumb */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <Link href="/" className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm font-medium">
            <ChevronLeft className="w-4 h-4" /> Back to Menu
          </Link>
        </motion.div>

        {/* ── Product Section ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-20">
          {/* Left — Visual */}
          <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}>
            <div
              className={`relative aspect-square rounded-3xl overflow-hidden border border-white/8 flex items-center justify-center bg-gradient-to-br ${product.gradientClass}`}
            >
              <motion.span
                className="text-[12rem] select-none"
                animate={{ rotate: [0, -3, 3, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
              >
                {product.emoji}
              </motion.span>

              {/* Badges */}
              <div className="absolute top-4 left-4 flex flex-col gap-2">
                {product.popular && <span className="tag-popular text-[10px] font-bold px-2.5 py-1 rounded-full">🔥 Popular</span>}
                {product.vegetarian && <span className="tag-veg text-[10px] font-bold px-2.5 py-1 rounded-full">🌿 Veg</span>}
                {product.spicy && <span className="tag-spicy text-[10px] font-bold px-2.5 py-1 rounded-full">🌶 Spicy</span>}
              </div>

              {/* Availability */}
              <div className="absolute top-4 right-4">
                {product.available !== false ? (
                  <div className="bg-green-500/20 border border-green-500/40 text-green-400 px-3 py-1 rounded-full text-xs font-bold backdrop-blur-md flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" /> Available
                  </div>
                ) : (
                  <div className="bg-red-500/20 border border-red-500/40 text-red-400 px-3 py-1 rounded-full text-xs font-bold backdrop-blur-md">
                    Out of Stock
                  </div>
                )}
              </div>

              {/* Category chip */}
              <div className="absolute bottom-4 left-4 bg-white/10 border border-white/15 text-white px-3 py-1 rounded-full text-xs font-semibold backdrop-blur-md">
                {product.category}
              </div>
            </div>
          </motion.div>

          {/* Right — Details */}
          <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }} className="flex flex-col justify-center">
            {/* Rating */}
            <div className="flex items-center gap-2 mb-3">
              <Stars rating={avgRating} size={5} />
              <span className="text-gray-400 text-sm">
                {avgRating.toFixed(1)} ({totalReviews || product.reviewCount} reviews)
              </span>
            </div>

            <h1 className="text-4xl sm:text-5xl font-black mb-4 leading-tight">
              {product.name}
            </h1>

            {product.description && (
              <p className="text-gray-300 text-lg mb-6 leading-relaxed">{product.description}</p>
            )}

            {/* Ingredients */}
            {product.ingredients && product.ingredients.length > 0 && (
              <div className="mb-6 p-4 rounded-2xl bg-white/5 border border-white/8 backdrop-blur-md">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Ingredients</h3>
                <div className="flex flex-wrap gap-2">
                  {product.ingredients.map((ing, i) => (
                    <span key={i} className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-sm text-gray-200">
                      {ing}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Variant Selector */}
            {product.variants && product.variants.length > 0 && (
              <div className="mb-6">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Select Size</h3>
                <div className="flex flex-wrap gap-2">
                  {product.variants.map((v) => {
                    const vid = v.id || (v as any)._id;
                    return (
                      <button
                        key={vid}
                        onClick={() => setSelectedVariantId(vid)}
                        className={`px-4 py-2.5 rounded-full border text-sm font-bold transition-all duration-200 ${
                          selectedVariantId === vid
                            ? 'bg-[#FF4500] text-white border-transparent shadow-[0_0_0_3px_rgba(255,69,0,0.2)]'
                            : 'bg-white/5 text-gray-200 border-white/15 hover:border-white/30'
                        }`}
                      >
                        {v.name} — ₹{v.price}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Price */}
            <div className="flame-text text-4xl font-black mb-6">
              ₹{totalPrice.toFixed(0)}
              {quantity > 1 && <span className="text-sm text-gray-500 ml-2 font-medium">(₹{currentPrice} × {quantity})</span>}
            </div>

            {/* Quantity + Actions */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 mb-6">
              <div className="flex items-center bg-white/5 border border-white/10 rounded-full p-1">
                <button
                  onClick={() => setQuantity(q => Math.max(1, q - 1))}
                  className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-12 text-center font-bold text-lg">{quantity}</span>
                <button
                  onClick={() => setQuantity(q => q + 1)}
                  className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <button
                onClick={handleAddToCart}
                disabled={product.available === false}
                className={`flex-1 flex items-center justify-center gap-2 px-8 py-4 rounded-full font-bold transition-all duration-200 ${
                  added
                    ? 'bg-green-500/20 border border-green-500/40 text-green-400'
                    : 'btn-flame disabled:opacity-50'
                }`}
              >
                {added ? (
                  <><CheckCircle className="w-5 h-5" /> Added to Cart!</>
                ) : (
                  <><ShoppingCart className="w-5 h-5" /> Add to Cart</>
                )}
              </button>

              <button
                onClick={() => { handleAddToCart(); /* Navigate to checkout */ }}
                disabled={product.available === false}
                className="flex items-center justify-center gap-2 px-6 py-4 rounded-full font-bold bg-white text-black hover:bg-gray-100 transition-colors disabled:opacity-50"
              >
                <Zap className="w-5 h-5" /> Buy Now
              </button>
            </div>

            {/* Wishlist + Share */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => toggleWishlist(productId)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium transition-all ${
                  wishlisted
                    ? 'border-[#FF4500]/40 text-[#FF4500] bg-[#FF4500]/10'
                    : 'border-white/10 text-gray-400 hover:text-white hover:border-white/20'
                }`}
              >
                <Heart className={`w-4 h-4 ${wishlisted ? 'fill-current' : ''}`} />
                {wishlisted ? 'Wishlisted' : 'Add to Wishlist'}
              </button>
              <button className="flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 text-gray-400 text-sm font-medium hover:text-white hover:border-white/20 transition-all">
                <Share2 className="w-4 h-4" /> Share
              </button>
            </div>
          </motion.div>
        </div>

        {/* ── Reviews ─── */}
        <div className="mb-20">
          <h2 className="text-2xl font-black text-white mb-8">Customer Reviews ({totalReviews})</h2>

          {reviewSuccess && (
            <div className="mb-6 glass rounded-xl p-4 border border-green-500/20 text-green-400 text-sm">
              Thanks! Your review is pending moderation.
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1 glass rounded-2xl p-6 border border-white/8 self-start lg:sticky lg:top-24">
              <h3 className="text-lg font-black text-white mb-6">Rating Summary</h3>
              <div className="flex items-center gap-4 mb-6">
                <div className="text-5xl font-black flame-text">{avgRating.toFixed(1)}</div>
                <div>
                  <Stars rating={avgRating} />
                  <p className="text-gray-400 text-xs mt-1">{totalReviews} reviews</p>
                </div>
              </div>
              <div className="space-y-2 mb-6">
                <RatingBar star={5} pct={ratingPcts[4]} />
                <RatingBar star={4} pct={ratingPcts[3]} />
                <RatingBar star={3} pct={ratingPcts[2]} />
                <RatingBar star={2} pct={ratingPcts[1]} />
                <RatingBar star={1} pct={ratingPcts[0]} />
              </div>
              {!showReviewForm ? (
                <button onClick={() => setShowReviewForm(true)} className="w-full py-3 px-4 btn-flame text-sm font-bold">
                  Write a Review
                </button>
              ) : !isAuthenticated ? (
                <div className="text-center">
                  <LogIn className="w-6 h-6 text-[#FF8C00] mx-auto mb-2" />
                  <p className="text-xs text-gray-400 mb-3">Sign in with a delivered order to review.</p>
                  <Link href={`/auth/login?from=/product/${id}`} className="btn-flame inline-flex px-4 py-2 text-xs">Sign In</Link>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-gray-500">Reviewing as {customer?.fullName}</p>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button key={n} onClick={() => setReviewRating(n)}>
                        <Star className={`w-5 h-5 ${n <= reviewRating ? 'fill-[#FFD700] text-[#FFD700]' : 'text-gray-700'}`} />
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={reviewText}
                    onChange={e => setReviewText(e.target.value.slice(0, 500))}
                    placeholder="Share your experience (optional)"
                    rows={3}
                    className="input-flame w-full resize-none text-sm"
                  />
                  {reviewError && (
                    <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{reviewError}</p>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => setShowReviewForm(false)} className="flex-1 py-2 rounded-xl bg-white/10 text-sm">Cancel</button>
                    <button onClick={submitReview} disabled={reviewSubmitting} className="flex-1 btn-flame py-2 text-sm disabled:opacity-50">
                      {reviewSubmitting ? 'Submitting…' : 'Submit'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="lg:col-span-2 space-y-4">
              {reviews.length > 0 ? reviews.map((review) => (
                <ProductReviewCard key={review.id} review={review} onToggleHelpful={toggleHelpful} />
              )) : (
                <div className="glass rounded-2xl p-10 border border-white/8 text-center">
                  <span className="text-4xl mb-3 block">💬</span>
                  <h3 className="text-lg font-black text-white mb-2">No reviews yet</h3>
                  <p className="text-gray-400 text-sm">Be the first to review this product after your order is delivered.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Related Products ─── */}
        {relatedItems.length > 0 && (
          <div className="mb-20">
            <h2 className="text-2xl font-black text-white mb-6">Related Products</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {relatedItems.map(item => {
                const itemId = item._id || item.id || '';
                const itemPrice = item.variants?.[0]?.price || item.basePrice || 0;
                return (
                  <Link
                    key={itemId}
                    href={`/product/${itemId}`}
                    className="glass rounded-2xl overflow-hidden border border-white/8 hover:border-white/15 transition-all group"
                  >
                    <div className={`flex items-center justify-center py-8 bg-gradient-to-br ${item.gradientClass}`}>
                      <span className="text-5xl group-hover:scale-110 transition-transform duration-300">{item.emoji}</span>
                    </div>
                    <div className="p-4">
                      <h3 className="font-bold text-sm text-white truncate">{item.name}</h3>
                      <p className="flame-text text-sm font-black mt-1">₹{itemPrice}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
