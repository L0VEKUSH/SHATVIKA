'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Plus, Edit, Trash2, ChevronUp, ChevronDown, Check, AlertTriangle, Upload, X } from 'lucide-react';
import Image from 'next/image';
import { ApiClientError, apiRequest } from '@/lib/apiClient';

interface GalleryItem {
  id: string;
  title: string;
  description?: string;
  category: string;
  imageUrl: string;
  imageType: 'image' | 'video' | 'youtube';
  youtubeId?: string;
  featured: boolean;
  order: number;
  createdAt: string;
}

interface FormData {
  title: string;
  description: string;
  category: string;
  imageUrl: string;
  imageType: 'image' | 'video' | 'youtube';
  youtubeId: string;
  featured: boolean;
  mediaAssetId: string | null;
}

const CATEGORIES = ['Food', 'Restaurant', 'Team', 'Events'];

const emptyForm: FormData = {
  title: '',
  description: '',
  category: 'Food',
  imageUrl: '',
  imageType: 'image',
  youtubeId: '',
  featured: false,
  mediaAssetId: null,
};

export default function AdminGalleryPage() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<GalleryItem | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState<FormData>(emptyForm);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const fetchItems = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await apiRequest<{ items?: GalleryItem[] }>('/api/gallery');
      setItems(data.items || []);
    } catch (err) {
      setError(`Failed to load: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  useEffect(() => {
    if (!showModal) return;
    const restoreFocusTarget = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () => Array.from(modalRef.current?.querySelectorAll<HTMLElement>(
      'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? []).filter(element => !element.hasAttribute('hidden') && element.offsetParent !== null);
    focusable()[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowModal(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const nodes = focusable();
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      restoreFocusTarget?.focus();
    };
  }, [showModal]);

  const handleFileUpload = async (file: File) => {
    setActionError('');
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const data = await apiRequest<{ imageUrl: string; mediaType: 'image' | 'video'; assetId: string }>(
        '/api/upload?scope=admin-gallery',
        { method: 'POST', body },
      );
      setFormData(prev => ({
        ...prev,
        imageUrl: data.imageUrl,
        imageType: data.mediaType === 'video' ? 'video' : 'image',
        mediaAssetId: data.assetId,
      }));
    } catch (err) {
      setActionError(
        err instanceof ApiClientError && err.code === 'UPLOAD_STORAGE_NOT_CONFIGURED'
          ? err.message
          : err instanceof Error ? err.message : 'Upload failed',
      );
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError('');
    setActionLoading('submit');

    try {
      const method = editing ? 'PUT' : 'POST';
      const url = editing ? `/api/gallery?id=${encodeURIComponent(editing.id)}` : '/api/gallery';

      await apiRequest(url, {
        method,
        body: { ...formData },
      });

      await fetchItems();
      setShowModal(false);
      setEditing(null);
      setFormData(emptyForm);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to save gallery item');
    } finally {
      setActionLoading(null);
    }
  };

  const handleEdit = (item: GalleryItem) => {
    setActionError('');
    setFormData({
      title: item.title,
      description: item.description || '',
      category: item.category,
      imageUrl: item.imageUrl,
      imageType: item.imageType,
      youtubeId: item.youtubeId || '',
      featured: item.featured,
      mediaAssetId: null,
    });
    setEditing(item);
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    setActionError('');
    setActionLoading(id);
    try {
      await apiRequest(`/api/gallery?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      await fetchItems();
      setDeleteConfirm(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete gallery item');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReorder = async (id: string, direction: 'up' | 'down') => {
    const idx = items.findIndex(i => i.id === id);
    if (idx === -1) return;

    const newItems = [...items];
    if (direction === 'up' && idx > 0) {
      [newItems[idx], newItems[idx - 1]] = [newItems[idx - 1], newItems[idx]];
    } else if (direction === 'down' && idx < newItems.length - 1) {
      [newItems[idx], newItems[idx + 1]] = [newItems[idx + 1], newItems[idx]];
    } else {
      return;
    }

    try {
      setActionError('');
      setActionLoading(`reorder-${id}`);
      const reorderData = newItems.map((item, i) => ({ id: item.id, order: i }));
      await apiRequest('/api/gallery', {
        method: 'PATCH',
        body: { items: reorderData },
      });
      setItems(newItems);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to reorder gallery items');
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleFeatured = async (item: GalleryItem) => {
    try {
      setActionError('');
      setActionLoading(`featured-${item.id}`);
      await apiRequest(`/api/gallery?id=${encodeURIComponent(item.id)}`, {
        method: 'PUT',
        body: { featured: !item.featured },
      });
      await fetchItems();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update gallery item');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6 animate-pulse">
        <div className="h-10 bg-white/10 rounded-lg w-48" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 bg-white/10 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-white">Gallery Management</h1>
          <p className="text-sm text-gray-500 mt-1">Upload images and videos shown on the customer site.</p>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            setActionError('');
            setEditing(null);
            setFormData(emptyForm);
            setShowModal(true);
          }}
          className="btn-flame px-6 py-3 flex items-center gap-2 font-bold"
        >
          <Plus className="w-5 h-5" /> Add Item
        </motion.button>
      </div>

      {actionError && (
        <div
          role="alert"
          className="fixed right-4 top-4 z-[60] flex max-w-md items-start gap-3 rounded-2xl border border-red-500/30 bg-zinc-950 p-4 text-sm text-red-300 shadow-2xl"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-none" aria-hidden="true" />
          <span className="flex-1">{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError('')}
            className="rounded p-1 text-gray-300 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-400"
            aria-label="Dismiss error"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {error && (
        <div className="glass rounded-2xl p-4 border border-red-500/20 bg-red-500/5 text-red-400 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" aria-hidden="true" />
          {error}
        </div>
      )}

      {items.length === 0 ? (
        <div className="glass rounded-3xl border border-white/8 p-12 text-center">
          <p className="text-4xl mb-3">📸</p>
          <h3 className="text-xl font-black text-white mb-2">No gallery items yet</h3>
          <p className="text-gray-400 text-sm">Upload your first photo or video to showcase on the homepage.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item, idx) => (
            <div
              key={item.id}
              className="glass rounded-2xl p-5 border border-white/8 flex items-center justify-between gap-4 relative"
            >
              <div className="flex items-center gap-4 flex-1 min-w-0">
                {item.imageUrl && item.imageType !== 'youtube' && (
                  <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 relative bg-black/30">
                    {item.imageType === 'video' ? (
                      <video src={item.imageUrl} className="w-full h-full object-cover" muted />
                    ) : (
                      <Image src={item.imageUrl} alt={item.title} fill sizes="64px" style={{ objectFit: 'cover' }} />
                    )}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-white truncate">{item.title}</h3>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs px-2 py-1 rounded bg-white/10 text-gray-300">{item.category}</span>
                    <span className="text-xs px-2 py-1 rounded bg-white/10 text-gray-300 capitalize">{item.imageType}</span>
                    {item.featured && (
                      <span className="text-xs px-2 py-1 rounded bg-orange-500/20 text-orange-400 font-bold">Featured</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <button type="button" onClick={() => handleReorder(item.id, 'up')} disabled={idx === 0 || actionLoading !== null} className="p-2 hover:bg-white/10 rounded disabled:opacity-40" aria-label={`Move ${item.title} up`}>
                  <ChevronUp className="w-4 h-4" aria-hidden="true" />
                </button>
                <button type="button" onClick={() => handleReorder(item.id, 'down')} disabled={idx === items.length - 1 || actionLoading !== null} className="p-2 hover:bg-white/10 rounded disabled:opacity-40" aria-label={`Move ${item.title} down`}>
                  <ChevronDown className="w-4 h-4" aria-hidden="true" />
                </button>
                <button type="button" onClick={() => handleToggleFeatured(item)} disabled={actionLoading !== null} className={`p-2 rounded disabled:opacity-40 ${item.featured ? 'bg-orange-500/20 text-orange-400' : 'hover:bg-white/10 text-gray-400'}`} aria-label={`${item.featured ? 'Remove' : 'Mark'} ${item.title} ${item.featured ? 'from' : 'as'} featured`}>
                  <Check className="w-4 h-4" aria-hidden="true" />
                </button>
                <button type="button" onClick={() => handleEdit(item)} className="p-2 hover:bg-white/10 rounded" aria-label={`Edit ${item.title}`}>
                  <Edit className="w-4 h-4" aria-hidden="true" />
                </button>
                <button type="button" onClick={() => setDeleteConfirm(item.id)} className="p-2 hover:bg-red-500/10 rounded text-red-400" aria-label={`Delete ${item.title}`}>
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>

              {deleteConfirm === item.id && (
                <div className="absolute inset-0 bg-black/50 rounded-2xl flex items-center justify-center gap-3 backdrop-blur-sm">
                  <button type="button" onClick={() => setDeleteConfirm(null)} className="px-4 py-2 rounded bg-white/10 text-white font-bold">Cancel</button>
                  <button type="button" onClick={() => handleDelete(item.id)} disabled={actionLoading === item.id} className="px-4 py-2 rounded bg-red-500 text-white font-bold disabled:opacity-60">
                    {actionLoading === item.id ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm p-4" onClick={() => setShowModal(false)}>
          <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="gallery-dialog-title" className="glass rounded-3xl border border-white/8 p-8 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="mb-6 flex items-start justify-between gap-4">
              <h2 id="gallery-dialog-title" className="text-2xl font-black text-white">{editing ? 'Edit Gallery Item' : 'Add Gallery Item'}</h2>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-lg p-2 text-gray-400 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-400"
                aria-label="Close gallery item dialog"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="gallery-title" className="block text-sm font-bold text-gray-300 mb-2">Title *</label>
                <input id="gallery-title" name="title" type="text" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} required maxLength={120} className="admin-input w-full" />
              </div>
              <div>
                <label htmlFor="gallery-description" className="block text-sm font-bold text-gray-300 mb-2">Description</label>
                <textarea id="gallery-description" name="description" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} maxLength={500} rows={3} className="admin-input w-full resize-none" />
              </div>
              <div>
                <label htmlFor="gallery-category" className="block text-sm font-bold text-gray-300 mb-2">Category *</label>
                <select id="gallery-category" name="category" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} className="admin-input w-full">
                  {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-300 mb-2">Type *</label>
                <div className="flex gap-4">
                  {(['image', 'video', 'youtube'] as const).map(type => (
                    <label key={type} className="flex items-center gap-2 cursor-pointer capitalize text-sm text-gray-300">
                      <input type="radio" name="imageType" value={type} checked={formData.imageType === type} onChange={() => setFormData({
                        ...formData,
                        imageType: type,
                        mediaAssetId: type === 'youtube' ? null : formData.mediaAssetId,
                        youtubeId: type === 'youtube' ? formData.youtubeId : '',
                      })} />
                      {type}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor="gallery-media-url" className="block text-sm font-bold text-gray-300 mb-2">Media *</label>
                <input ref={fileInputRef} id="gallery-file" name="mediaFile" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }} />
                <div className="flex flex-wrap gap-2 mb-2">
                  <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="admin-button">
                    <Upload className="w-4 h-4" />
                    {uploading ? 'Uploading…' : 'Upload File'}
                  </button>
                </div>
                <input id="gallery-media-url" name="imageUrl" type="url" value={formData.imageUrl} onChange={e => setFormData({ ...formData, imageUrl: e.target.value, mediaAssetId: null })} placeholder="Upload a durable file, or use an HTTPS thumbnail for YouTube" required className="admin-input w-full" />
                {formData.imageType !== 'youtube' && !formData.mediaAssetId && !editing && (
                  <p className="mt-2 text-xs text-amber-300">New image/video entries require a successful durable upload. Manual URLs are not accepted as verified assets.</p>
                )}
              </div>
              {formData.imageType === 'youtube' && (
                <div>
                  <label htmlFor="gallery-youtube-id" className="block text-sm font-bold text-gray-300 mb-2">YouTube Video ID</label>
                  <input id="gallery-youtube-id" name="youtubeId" type="text" value={formData.youtubeId} onChange={e => setFormData({ ...formData, youtubeId: e.target.value })} className="admin-input w-full" />
                </div>
              )}
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input type="checkbox" checked={formData.featured} onChange={e => setFormData({ ...formData, featured: e.target.checked })} />
                Featured item
              </label>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 admin-button">Cancel</button>
                <button type="submit" disabled={actionLoading === 'submit' || uploading} className="flex-1 btn-flame disabled:opacity-60">
                  {actionLoading === 'submit' ? 'Saving...' : editing ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
