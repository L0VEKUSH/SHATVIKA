'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Save, Trash2 } from 'lucide-react';
import { useAdmin } from '@/context/AdminContext';
import type { Feature, Stat, TeamMember, Review, GalleryItem } from '@/types';

const sectionVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

function FeatureEditor({ feature }: { feature: Feature }) {
  const { updateFeature, deleteFeature } = useAdmin();
  const [draft, setDraft] = useState(feature);

  useEffect(() => {
    setDraft(feature);
  }, [feature]);

  return (
    <div className="rounded-2xl border border-white/8 bg-white/5 p-4 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input className="admin-input" value={draft.emoji} onChange={e => setDraft(prev => ({ ...prev, emoji: e.target.value }))} placeholder="Emoji" />
        <input className="admin-input" value={draft.title} onChange={e => setDraft(prev => ({ ...prev, title: e.target.value }))} placeholder="Title" />
      </div>
      <textarea className="admin-input min-h-24" value={draft.description} onChange={e => setDraft(prev => ({ ...prev, description: e.target.value }))} placeholder="Description" />
      <input className="admin-input" value={draft.gradient} onChange={e => setDraft(prev => ({ ...prev, gradient: e.target.value }))} placeholder="Gradient" />
      <div className="flex items-center gap-2">
        <button className="admin-button" onClick={() => updateFeature(feature.id, draft)}>
          <Save className="w-4 h-4" />
          Save
        </button>
        <button className="admin-button admin-button-danger" onClick={() => deleteFeature(feature.id)}>
          <Trash2 className="w-4 h-4" />
          Delete
        </button>
      </div>
    </div>
  );
}

function StatEditor({ stat }: { stat: Stat }) {
  const { updateStat, deleteStat } = useAdmin();
  const [draft, setDraft] = useState(stat);

  useEffect(() => {
    setDraft(stat);
  }, [stat]);

  return (
    <div className="rounded-2xl border border-white/8 bg-white/5 p-4 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input className="admin-input" value={draft.emoji} onChange={e => setDraft(prev => ({ ...prev, emoji: e.target.value }))} placeholder="Emoji" />
        <input className="admin-input" value={draft.value} onChange={e => setDraft(prev => ({ ...prev, value: e.target.value }))} placeholder="Value" />
      </div>
      <input className="admin-input" value={draft.label} onChange={e => setDraft(prev => ({ ...prev, label: e.target.value }))} placeholder="Label" />
      <div className="flex items-center gap-2">
        <button className="admin-button" onClick={() => updateStat(stat.id, draft)}>
          <Save className="w-4 h-4" />
          Save
        </button>
        <button className="admin-button admin-button-danger" onClick={() => deleteStat(stat.id)}>
          <Trash2 className="w-4 h-4" />
          Delete
        </button>
      </div>
    </div>
  );
}

function TeamEditor({ member }: { member: TeamMember }) {
  const { updateTeamMember, deleteTeamMember } = useAdmin();
  const [draft, setDraft] = useState(member);

  useEffect(() => {
    setDraft(member);
  }, [member]);

  return (
    <div className="rounded-2xl border border-white/8 bg-white/5 p-4 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input className="admin-input" value={draft.emoji} onChange={e => setDraft(prev => ({ ...prev, emoji: e.target.value }))} placeholder="Emoji" />
        <input className="admin-input" value={draft.id} onChange={e => setDraft(prev => ({ ...prev, id: e.target.value }))} placeholder="ID" />
      </div>
      <input className="admin-input" value={draft.name} onChange={e => setDraft(prev => ({ ...prev, name: e.target.value }))} placeholder="Name" />
      <input className="admin-input" value={draft.role} onChange={e => setDraft(prev => ({ ...prev, role: e.target.value }))} placeholder="Role" />
      <input className="admin-input" value={draft.gradient} onChange={e => setDraft(prev => ({ ...prev, gradient: e.target.value }))} placeholder="Gradient" />
      <div className="flex items-center gap-2">
        <button className="admin-button" onClick={() => updateTeamMember(member.id, draft)}>
          <Save className="w-4 h-4" />
          Save
        </button>
        <button className="admin-button admin-button-danger" onClick={() => deleteTeamMember(member.id)}>
          <Trash2 className="w-4 h-4" />
          Delete
        </button>
      </div>
    </div>
  );
}

function ReviewEditor({ review }: { review: Review }) {
  const { updateReview, deleteReview } = useAdmin();
  const [draft, setDraft] = useState(review);


  useEffect(() => {
    setDraft(review);
  }, [review]);

  return (
    <div className="rounded-2xl border border-white/8 bg-white/5 p-4 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input className="admin-input" value={draft.id} onChange={e => setDraft(prev => ({ ...prev, id: e.target.value }))} placeholder="ID" />
        <input className="admin-input" value={draft.name} onChange={e => setDraft(prev => ({ ...prev, name: e.target.value }))} placeholder="Name" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input className="admin-input" value={draft.avatar} onChange={e => setDraft(prev => ({ ...prev, avatar: e.target.value }))} placeholder="Avatar" />
        <input className="admin-input" value={String(draft.rating)} onChange={e => setDraft(prev => ({ ...prev, rating: Number(e.target.value) || 0 }))} placeholder="Rating" type="number" min="0" max="5" step="0.1" />
      </div>
      <input className="admin-input" value={draft.location} onChange={e => setDraft(prev => ({ ...prev, location: e.target.value }))} placeholder="Location" />
      <input className="admin-input" value={draft.date} onChange={e => setDraft(prev => ({ ...prev, date: e.target.value }))} placeholder="Date" />
      <textarea className="admin-input min-h-24" value={draft.comment} onChange={e => setDraft(prev => ({ ...prev, comment: e.target.value }))} placeholder="Comment" />
      <div className="flex items-center gap-2">
        <button className="admin-button" onClick={() => updateReview(review.id, draft)}>
          <Save className="w-4 h-4" />
          Save
        </button>
        <button className="admin-button admin-button-danger" onClick={() => deleteReview(review.id)}>
          <Trash2 className="w-4 h-4" />
          Delete
        </button>
      </div>
    </div>
  );
}

function GalleryEditor({ item }: { item: GalleryItem }) {
  const { updateGalleryItem, deleteGalleryItem } = useAdmin();
  const [draft, setDraft] = useState(item);

  useEffect(() => {
    setDraft(item);
  }, [item]);

  return (
    <div className="rounded-2xl border border-white/8 bg-white/5 p-4 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input className="admin-input" value={draft.id} onChange={e => setDraft(prev => ({ ...prev, id: e.target.value }))} placeholder="ID" />
        <input className="admin-input" value={draft.emoji} onChange={e => setDraft(prev => ({ ...prev, emoji: e.target.value }))} placeholder="Emoji" />
      </div>
      <input className="admin-input" value={draft.label} onChange={e => setDraft(prev => ({ ...prev, label: e.target.value }))} placeholder="Label" />
      <input className="admin-input" value={draft.gradient} onChange={e => setDraft(prev => ({ ...prev, gradient: e.target.value }))} placeholder="Gradient" />
      <label className="flex items-center gap-2 text-sm text-gray-300">
        <input type="checkbox" checked={!!draft.tall} onChange={e => setDraft(prev => ({ ...prev, tall: e.target.checked }))} />
        Tall tile
      </label>
      <div className="flex items-center gap-2">
        <button className="admin-button" onClick={() => updateGalleryItem(item.id, draft)}>
          <Save className="w-4 h-4" />
          Save
        </button>
        <button className="admin-button admin-button-danger" onClick={() => deleteGalleryItem(item.id)}>
          <Trash2 className="w-4 h-4" />
          Delete
        </button>
      </div>
    </div>
  );
}

export default function AdminContentPage() {
  const { features, stats, teamMembers, reviews, galleryItems, addFeature, addStat, addTeamMember, addReview, addGalleryItem } = useAdmin();
  const [featureDraft, setFeatureDraft] = useState<Feature>({ id: '', emoji: '', title: '', description: '', gradient: '' });
  const [statDraft, setStatDraft] = useState<Stat>({ id: '', emoji: '', value: '', label: '' });
  const [memberDraft, setMemberDraft] = useState<TeamMember>({ id: '', name: '', role: '', emoji: '', gradient: '' });
  const [reviewDraft, setReviewDraft] = useState<Review>({
    id: '',
    name: '',
    avatar: '',
    rating: 5,
    comment: '',
    date: '',
    location: '',
    text: null,
    imageUrl: null,
    menuItemId: null,
  });

  const [galleryDraft, setGalleryDraft] = useState<GalleryItem>({ id: '', emoji: '', label: '', gradient: '', tall: false });

  return (
    <motion.div variants={sectionVariants} initial="hidden" animate="show" className="space-y-8 max-w-7xl mx-auto">
      <div className="glass rounded-3xl p-6 md:p-8 border border-white/8">
        <p className="text-xs uppercase tracking-[0.3em] text-[#FF8C00] font-bold">Content Admin</p>
        <h1 className="text-3xl md:text-4xl font-black text-white mt-2">Edit the live homepage content</h1>
        <p className="text-sm text-gray-400 mt-3 max-w-2xl">
          These sections now drive the public site directly. Update them here instead of editing static demo text.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <section className="xl:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Features</h2>
            <span className="text-xs text-gray-500">{features.length} items</span>
          </div>
          <div className="grid gap-4">
            {features.map(feature => <FeatureEditor key={feature.id} feature={feature} />)}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-bold text-white">Add Feature</h2>
          <div className="rounded-2xl border border-white/8 bg-white/5 p-4 space-y-3">
            <input className="admin-input" value={featureDraft.id} onChange={e => setFeatureDraft(prev => ({ ...prev, id: e.target.value }))} placeholder="ID" />
            <input className="admin-input" value={featureDraft.emoji} onChange={e => setFeatureDraft(prev => ({ ...prev, emoji: e.target.value }))} placeholder="Emoji" />
            <input className="admin-input" value={featureDraft.title} onChange={e => setFeatureDraft(prev => ({ ...prev, title: e.target.value }))} placeholder="Title" />
            <textarea className="admin-input min-h-24" value={featureDraft.description} onChange={e => setFeatureDraft(prev => ({ ...prev, description: e.target.value }))} placeholder="Description" />
            <input className="admin-input" value={featureDraft.gradient} onChange={e => setFeatureDraft(prev => ({ ...prev, gradient: e.target.value }))} placeholder="Gradient" />
            <button className="admin-button w-full" onClick={() => { addFeature({ ...featureDraft, id: featureDraft.id || crypto.randomUUID() }); setFeatureDraft({ id: '', emoji: '', title: '', description: '', gradient: '' }); }}>
              <Plus className="w-4 h-4" />
              Add Feature
            </button>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <section className="xl:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Stats</h2>
            <span className="text-xs text-gray-500">{stats.length} items</span>
          </div>
          <div className="grid gap-4">
            {stats.map(stat => <StatEditor key={stat.id} stat={stat} />)}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-bold text-white">Add Stat</h2>
          <div className="rounded-2xl border border-white/8 bg-white/5 p-4 space-y-3">
            <input className="admin-input" value={statDraft.id} onChange={e => setStatDraft(prev => ({ ...prev, id: e.target.value }))} placeholder="ID" />
            <input className="admin-input" value={statDraft.emoji} onChange={e => setStatDraft(prev => ({ ...prev, emoji: e.target.value }))} placeholder="Emoji" />
            <input className="admin-input" value={statDraft.value} onChange={e => setStatDraft(prev => ({ ...prev, value: e.target.value }))} placeholder="Value" />
            <input className="admin-input" value={statDraft.label} onChange={e => setStatDraft(prev => ({ ...prev, label: e.target.value }))} placeholder="Label" />
            <button className="admin-button w-full" onClick={() => { addStat({ ...statDraft, id: statDraft.id || crypto.randomUUID() }); setStatDraft({ id: '', emoji: '', value: '', label: '' }); }}>
              <Plus className="w-4 h-4" />
              Add Stat
            </button>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <section className="xl:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Team Members</h2>
            <span className="text-xs text-gray-500">{teamMembers.length} items</span>
          </div>
          <div className="grid gap-4">
            {teamMembers.map(member => <TeamEditor key={member.id} member={member} />)}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-bold text-white">Add Member</h2>
          <div className="rounded-2xl border border-white/8 bg-white/5 p-4 space-y-3">
            <input className="admin-input" value={memberDraft.id} onChange={e => setMemberDraft(prev => ({ ...prev, id: e.target.value }))} placeholder="ID" />
            <input className="admin-input" value={memberDraft.emoji} onChange={e => setMemberDraft(prev => ({ ...prev, emoji: e.target.value }))} placeholder="Emoji" />
            <input className="admin-input" value={memberDraft.name} onChange={e => setMemberDraft(prev => ({ ...prev, name: e.target.value }))} placeholder="Name" />
            <input className="admin-input" value={memberDraft.role} onChange={e => setMemberDraft(prev => ({ ...prev, role: e.target.value }))} placeholder="Role" />
            <input className="admin-input" value={memberDraft.gradient} onChange={e => setMemberDraft(prev => ({ ...prev, gradient: e.target.value }))} placeholder="Gradient" />
            <button className="admin-button w-full" onClick={() => { addTeamMember(memberDraft); setMemberDraft({ id: '', name: '', role: '', emoji: '', gradient: '' }); }}>
              <Plus className="w-4 h-4" />
              Add Member
            </button>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <section className="xl:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Reviews</h2>
            <span className="text-xs text-gray-500">{reviews.length} items</span>
          </div>
          <div className="grid gap-4">
            {reviews.map(review => <ReviewEditor key={review.id} review={review} />)}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-bold text-white">Add Review</h2>
          <div className="rounded-2xl border border-white/8 bg-white/5 p-4 space-y-3">
            <input className="admin-input" value={reviewDraft.id} onChange={e => setReviewDraft(prev => ({ ...prev, id: e.target.value }))} placeholder="ID" />
            <input className="admin-input" value={reviewDraft.name} onChange={e => setReviewDraft(prev => ({ ...prev, name: e.target.value }))} placeholder="Name" />
            <input className="admin-input" value={reviewDraft.avatar} onChange={e => setReviewDraft(prev => ({ ...prev, avatar: e.target.value }))} placeholder="Avatar" />
            <input className="admin-input" value={String(reviewDraft.rating)} onChange={e => setReviewDraft(prev => ({ ...prev, rating: Number(e.target.value) || 0 }))} placeholder="Rating" type="number" min="0" max="5" step="0.1" />
            <input className="admin-input" value={reviewDraft.location} onChange={e => setReviewDraft(prev => ({ ...prev, location: e.target.value }))} placeholder="Location" />
            <input className="admin-input" value={reviewDraft.date} onChange={e => setReviewDraft(prev => ({ ...prev, date: e.target.value }))} placeholder="Date" />
            <textarea className="admin-input min-h-24" value={reviewDraft.comment} onChange={e => setReviewDraft(prev => ({ ...prev, comment: e.target.value }))} placeholder="Comment" />
            <button className="admin-button w-full" onClick={() => { addReview({ ...reviewDraft, id: reviewDraft.id || crypto.randomUUID() }); setReviewDraft({ id: '', name: '', avatar: '', rating: 5, comment: '', date: '', location: '', text: null, imageUrl: null, menuItemId: null }); }}>

              <Plus className="w-4 h-4" />
              Add Review
            </button>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <section className="xl:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Gallery</h2>
            <span className="text-xs text-gray-500">{galleryItems.length} items</span>
          </div>
          <div className="grid gap-4">
            {galleryItems.map(item => <GalleryEditor key={item.id} item={item} />)}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-bold text-white">Add Gallery Item</h2>
          <div className="rounded-2xl border border-white/8 bg-white/5 p-4 space-y-3">
            <input className="admin-input" value={galleryDraft.id} onChange={e => setGalleryDraft(prev => ({ ...prev, id: e.target.value }))} placeholder="ID" />
            <input className="admin-input" value={galleryDraft.emoji} onChange={e => setGalleryDraft(prev => ({ ...prev, emoji: e.target.value }))} placeholder="Emoji" />
            <input className="admin-input" value={galleryDraft.label} onChange={e => setGalleryDraft(prev => ({ ...prev, label: e.target.value }))} placeholder="Label" />
            <input className="admin-input" value={galleryDraft.gradient} onChange={e => setGalleryDraft(prev => ({ ...prev, gradient: e.target.value }))} placeholder="Gradient" />
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input type="checkbox" checked={!!galleryDraft.tall} onChange={e => setGalleryDraft(prev => ({ ...prev, tall: e.target.checked }))} />
              Tall tile
            </label>
            <button className="admin-button w-full" onClick={() => { addGalleryItem({ ...galleryDraft, id: galleryDraft.id || crypto.randomUUID() }); setGalleryDraft({ id: '', emoji: '', label: '', gradient: '', tall: false }); }}>
              <Plus className="w-4 h-4" />
              Add Gallery Item
            </button>
          </div>
        </section>
      </div>
    </motion.div>
  );
}