'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Plus, Edit, Trash2, ChevronUp, ChevronDown, Check, AlertTriangle, Upload } from 'lucide-react';
import Image from 'next/image';

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
};

export default function AdminGalleryPage() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<GalleryItem | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState<FormData>(emptyForm);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchItems = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetch('/api/gallery');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
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

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setFormData(prev => ({
        ...prev,
        imageUrl: data.imageUrl,
        imageType: data.mediaType === 'video' ? 'video' : 'image',
      }));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading('submit');

    try {
      const method = editing ? 'PUT' : 'POST';
      const url = editing ? `/api/gallery?id=${encodeURIComponent(editing.id)}` : '/api/gallery';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData),
      });

      if (!res.ok) throw new Error('Failed to save');

      await fetchItems();
      setShowModal(false);
      setEditing(null);
      setFormData(emptyForm);
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Failed to save'}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleEdit = (item: GalleryItem) => {
    setFormData({
      title: item.title,
      description: item.description || '',
      category: item.category,
      imageUrl: item.imageUrl,
      imageType: item.imageType,
      youtubeId: item.youtubeId || '',
      featured: item.featured,
    });
    setEditing(item);
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/gallery?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Delete failed');
      await fetchItems();
      setDeleteConfirm(null);
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Failed to delete'}`);
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
      setActionLoading(`reorder-${id}`);
      const reorderData = newItems.map((item, i) => ({ id: item.id, order: i }));
      const res = await fetch('/api/gallery', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ items: reorderData }),
      });
      if (!res.ok) throw new Error('Failed to reorder');
      setItems(newItems);
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Failed to reorder'}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleFeatured = async (item: GalleryItem) => {
    try {
      setActionLoading(`featured-${item.id}`);
      const res = await fetch(`/api/gallery?id=${encodeURIComponent(item.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ featured: !item.featured }),
      });
      if (!res.ok) throw new Error('Update failed');
      await fetchItems();
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Failed to update'}`);
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
            setEditing(null);
            setFormData(emptyForm);
            setShowModal(true);
          }}
          className="btn-flame px-6 py-3 flex items-center gap-2 font-bold"
        >
          <Plus className="w-5 h-5" /> Add Item
        </motion.button>
      </div>

      {error && (
        <div className="glass rounded-2xl p-4 border border-red-500/20 bg-red-500/5 text-red-400 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
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
                <button onClick={() => handleReorder(item.id, 'up')} disabled={idx === 0} className="p-2 hover:bg-white/10 rounded disabled:opacity-40">
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button onClick={() => handleReorder(item.id, 'down')} disabled={idx === items.length - 1} className="p-2 hover:bg-white/10 rounded disabled:opacity-40">
                  <ChevronDown className="w-4 h-4" />
                </button>
                <button onClick={() => handleToggleFeatured(item)} className={`p-2 rounded ${item.featured ? 'bg-orange-500/20 text-orange-400' : 'hover:bg-white/10 text-gray-400'}`}>
                  <Check className="w-4 h-4" />
                </button>
                <button onClick={() => handleEdit(item)} className="p-2 hover:bg-white/10 rounded">
                  <Edit className="w-4 h-4" />
                </button>
                <button onClick={() => setDeleteConfirm(item.id)} className="p-2 hover:bg-red-500/10 rounded text-red-400">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {deleteConfirm === item.id && (
                <div className="absolute inset-0 bg-black/50 rounded-2xl flex items-center justify-center gap-3 backdrop-blur-sm">
                  <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 rounded bg-white/10 text-white font-bold">Cancel</button>
                  <button onClick={() => handleDelete(item.id)} disabled={actionLoading === item.id} className="px-4 py-2 rounded bg-red-500 text-white font-bold disabled:opacity-60">
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
          <div className="glass rounded-3xl border border-white/8 p-8 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-2xl font-black text-white mb-6">{editing ? 'Edit Gallery Item' : 'Add Gallery Item'}</h2>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-gray-300 mb-2">Title *</label>
                <input type="text" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} required maxLength={120} className="admin-input w-full" />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-300 mb-2">Description</label>
                <textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} maxLength={500} rows={3} className="admin-input w-full resize-none" />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-300 mb-2">Category *</label>
                <select value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} className="admin-input w-full">
                  {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-300 mb-2">Type *</label>
                <div className="flex gap-4">
                  {(['image', 'video', 'youtube'] as const).map(type => (
                    <label key={type} className="flex items-center gap-2 cursor-pointer capitalize text-sm text-gray-300">
                      <input type="radio" name="imageType" value={type} checked={formData.imageType === type} onChange={() => setFormData({ ...formData, imageType: type })} />
                      {type}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-300 mb-2">Media *</label>
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }} />
                <div className="flex flex-wrap gap-2 mb-2">
                  <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="admin-button">
                    <Upload className="w-4 h-4" />
                    {uploading ? 'Uploading…' : 'Upload File'}
                  </button>
                </div>
                <input type="text" value={formData.imageUrl} onChange={e => setFormData({ ...formData, imageUrl: e.target.value })} placeholder="/uploads/... or https://..." required className="admin-input w-full" />
              </div>
              {formData.imageType === 'youtube' && (
                <div>
                  <label className="block text-sm font-bold text-gray-300 mb-2">YouTube Video ID</label>
                  <input type="text" value={formData.youtubeId} onChange={e => setFormData({ ...formData, youtubeId: e.target.value })} className="admin-input w-full" />
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
