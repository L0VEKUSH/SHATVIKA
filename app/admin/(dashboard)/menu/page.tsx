'use client';

import { motion } from 'framer-motion';
import MenuTable from '@/components/admin/MenuTable';
import { useAdmin } from '@/context/AdminContext';

export default function AdminMenuPage() {
  const { adminMenuItems } = useAdmin();

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="max-w-7xl mx-auto space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-2xl font-black text-white">
            Menu <span className="flame-text">Manager</span>
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {adminMenuItems.length} items across 6 categories. Edit prices, toggle tags, and add new items.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          Live data — changes reflect immediately on the customer menu
        </div>
      </div>

      {/* Table panel */}
      <div className="glass rounded-2xl p-6 border border-white/8">
        <MenuTable />
      </div>

      {/* Legend */}
      <div className="glass rounded-xl p-4 border border-white/8 flex flex-wrap gap-4 text-xs text-gray-500">
        <span>💡 Click the <strong className="text-white">pencil icon</strong> on a price to edit it inline.</span>
        <span>Click any <strong className="text-white">tag badge</strong> to toggle it on/off.</span>
        <span>Use the <strong className="text-[#FF8C00]">Add Item</strong> button to create new menu entries.</span>
      </div>
    </motion.div>
  );
}
