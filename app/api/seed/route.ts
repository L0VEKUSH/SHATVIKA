import { NextResponse } from 'next/server';
import { connectToMongo } from '@/lib/mongoose';
import { MenuItem } from '@/models/MenuItem';
import { Feature } from '@/models/Content';
import { Stat } from '@/models/Content';
import { TeamMember } from '@/models/Content';
import { menuItems } from '@/data/menuData';

export const dynamic = 'force-dynamic';

// Default content seeds
const defaultFeatures = [
  {
    title: 'Fresh Ingredients',
    description: 'Every item is prepared with locally sourced, premium ingredients. No frozen patties — ever.',
    emoji: '🌿',
    gradient: 'linear-gradient(135deg,rgba(21,128,61,0.15),rgba(34,197,94,0.05))',
  },
  {
    title: 'Lightning Delivery',
    description: 'From grill to your door in under 30 minutes. Real-time GPS tracking on every order.',
    emoji: '⚡',
    gradient: 'linear-gradient(135deg,rgba(234,179,8,0.15),rgba(255,215,0,0.05))',
  },
  {
    title: 'Expert Chefs',
    description: 'Award-winning culinary team with 100+ combined years of fine dining experience.',
    emoji: '👨‍🍳',
    gradient: 'linear-gradient(135deg,rgba(255,69,0,0.15),rgba(255,140,0,0.05))',
  },
  {
    title: 'Unbeatable Value',
    description: 'Gourmet quality at street-food prices. Daily deals and loyalty rewards for every order.',
    emoji: '💰',
    gradient: 'linear-gradient(135deg,rgba(107,33,168,0.15),rgba(168,85,247,0.05))',
  },
];

const defaultStats = [
  { value: '12+', label: 'Years of Fire',    emoji: '🔥' },
  { value: '50K+', label: 'Happy Customers', emoji: '😍' },
  { value: '100+', label: 'Menu Items',      emoji: '🍽️' },
  { value: '< 30', label: 'Min Delivery',    emoji: '⚡' },
];

const defaultTeam = [
  { name: 'Marco Rossi',   role: 'Head Chef',        emoji: '👨🏽‍🍳', gradient: 'linear-gradient(135deg,#FF4500,#FF8C00)' },
  { name: 'Aisha Patel',   role: 'Pastry Chef',      emoji: '👩🏽‍🍳', gradient: 'linear-gradient(135deg,#DC143C,#FF4500)' },
  { name: 'Liam Nguyen',   role: 'Pit Master',       emoji: '👨🏻‍🍳', gradient: 'linear-gradient(135deg,#B45309,#FFD700)' },
  { name: 'Sofia Almeida', role: 'Beverages Expert', emoji: '👩🏻‍🍳', gradient: 'linear-gradient(135deg,#6B21A8,#A855F7)' },
];

export async function GET() {
  try {
    await connectToMongo();

    const seeded: string[] = [];

    // Seed menu items
    const menuCount = await MenuItem.countDocuments();
    if (menuCount === 0) {
      await MenuItem.insertMany(
        menuItems.map((item) => ({
          ...item,
          isNewItem: item.isNew ?? false,
          isNew: undefined, // strip old field name
        }))
      );
      seeded.push(`${menuItems.length} menu items`);
    }

    // Seed features
    const featureCount = await Feature.countDocuments();
    if (featureCount === 0) {
      await Feature.insertMany(defaultFeatures);
      seeded.push(`${defaultFeatures.length} features`);
    }

    // Seed stats
    const statCount = await Stat.countDocuments();
    if (statCount === 0) {
      await Stat.insertMany(defaultStats);
      seeded.push(`${defaultStats.length} stats`);
    }

    // Seed team members
    const teamCount = await TeamMember.countDocuments();
    if (teamCount === 0) {
      await TeamMember.insertMany(defaultTeam);
      seeded.push(`${defaultTeam.length} team members`);
    }

    if (seeded.length === 0) {
      return NextResponse.json({ message: 'Database already seeded — nothing to do.' });
    }

    return NextResponse.json({ message: `Seeded: ${seeded.join(', ')}.` });
  } catch (err) {
    console.error('[GET /api/seed]', err);
    return NextResponse.json({ error: 'Failed to seed database' }, { status: 500 });
  }
}
