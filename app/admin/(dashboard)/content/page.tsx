'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Save, Trash2 } from 'lucide-react';
import { useAdmin } from '@/context/AdminContext';
import type { Feature, Stat, TeamMember } from '@/types';

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

export default function AdminContentPage() {
  const { isLoading, features, stats, teamMembers, addFeature, addStat, addTeamMember } = useAdmin();
  const [featureDraft, setFeatureDraft] = useState<Feature>({ id: '', emoji: '', title: '', description: '', gradient: '' });
  const [statDraft, setStatDraft] = useState<Stat>({ id: '', emoji: '', value: '', label: '' });
  const [memberDraft, setMemberDraft] = useState<TeamMember>({ id: '', name: '', role: '', emoji: '', gradient: '' });

  if (isLoading) {
    return (
      <div className="space-y-8 max-w-7xl mx-auto">
        <div className="glass rounded-3xl p-6 md:p-8 border border-white/8 animate-pulse">
          <div className="h-4 bg-white/10 rounded w-32 mb-3" />
          <div className="h-10 bg-white/10 rounded w-48 mb-4" />
          <div className="h-3 bg-white/10 rounded w-64" />
        </div>
      </div>
    );
  }

  return (
    <motion.div variants={sectionVariants} initial="hidden" animate="show" className="space-y-8 max-w-7xl mx-auto">
      <div className="glass rounded-3xl p-6 md:p-8 border border-white/8">
        <p className="text-xs uppercase tracking-[0.3em] text-[#FF8C00] font-bold">Content Admin</p>
        <h1 className="text-3xl md:text-4xl font-black text-white mt-2">Edit the live homepage content</h1>
        <p className="text-sm text-gray-400 mt-3 max-w-2xl">
          Manage features, stats, and team profiles shown on the customer site. Reviews and gallery have dedicated admin pages.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <section className="xl:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Features</h2>
            <span className="text-xs text-gray-500">{features.length} items</span>
          </div>
          {features.length === 0 ? (
            <p className="text-sm text-gray-500">No features yet. Add your first highlight.</p>
          ) : (
            <div className="grid gap-4">
              {features.map(feature => <FeatureEditor key={feature.id} feature={feature} />)}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-bold text-white">Add Feature</h2>
          <div className="rounded-2xl border border-white/8 bg-white/5 p-4 space-y-3">
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
          {stats.length === 0 ? (
            <p className="text-sm text-gray-500">No stats yet. Add metrics for the hero and about sections.</p>
          ) : (
            <div className="grid gap-4">
              {stats.map(stat => <StatEditor key={stat.id} stat={stat} />)}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-bold text-white">Add Stat</h2>
          <div className="rounded-2xl border border-white/8 bg-white/5 p-4 space-y-3">
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
          {teamMembers.length === 0 ? (
            <p className="text-sm text-gray-500">No team members yet.</p>
          ) : (
            <div className="grid gap-4">
              {teamMembers.map(member => <TeamEditor key={member.id} member={member} />)}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-bold text-white">Add Member</h2>
          <div className="rounded-2xl border border-white/8 bg-white/5 p-4 space-y-3">
            <input className="admin-input" value={memberDraft.emoji} onChange={e => setMemberDraft(prev => ({ ...prev, emoji: e.target.value }))} placeholder="Emoji" />
            <input className="admin-input" value={memberDraft.name} onChange={e => setMemberDraft(prev => ({ ...prev, name: e.target.value }))} placeholder="Name" />
            <input className="admin-input" value={memberDraft.role} onChange={e => setMemberDraft(prev => ({ ...prev, role: e.target.value }))} placeholder="Role" />
            <input className="admin-input" value={memberDraft.gradient} onChange={e => setMemberDraft(prev => ({ ...prev, gradient: e.target.value }))} placeholder="Gradient" />
            <button className="admin-button w-full" onClick={() => { addTeamMember({ ...memberDraft, id: memberDraft.id || crypto.randomUUID() }); setMemberDraft({ id: '', name: '', role: '', emoji: '', gradient: '' }); }}>
              <Plus className="w-4 h-4" />
              Add Member
            </button>
          </div>
        </section>
      </div>
    </motion.div>
  );
}
