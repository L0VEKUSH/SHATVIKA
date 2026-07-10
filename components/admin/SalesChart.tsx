'use client';

import { motion } from 'framer-motion';

const DAYS   = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const VALUES = [820, 1340, 960, 1780, 2100, 2640, 1920]; // $ revenue
const MAX    = Math.max(...VALUES);

export default function SalesChart() {
  return (
    <div className="glass rounded-2xl p-6 border border-white/8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-white font-bold text-sm">Weekly Revenue</h3>
          <p className="text-gray-500 text-xs mt-0.5">This week vs last week</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-[#FF4500] to-[#FF8C00]" />
            <span className="text-xs text-gray-500">This Week</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
            <span className="text-xs text-gray-500">Last Week</span>
          </div>
        </div>
      </div>

      {/* Chart bars */}
      <div className="flex items-end gap-3 h-40">
        {VALUES.map((val, i) => {
          const height  = (val / MAX) * 100;
          const lastVal = [680, 1100, 1040, 1520, 1800, 2200, 1650][i];
          const lastH   = (lastVal / MAX) * 100;
          return (
            <div key={DAYS[i]} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex items-end gap-1 h-36">
                {/* Last week bar */}
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${lastH}%` }}
                  transition={{ delay: i * 0.07, duration: 0.6, ease: 'easeOut' }}
                  className="flex-1 rounded-t-lg bg-white/10 border border-white/8"
                />
                {/* This week bar */}
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${height}%` }}
                  transition={{ delay: i * 0.07 + 0.05, duration: 0.6, ease: 'easeOut' }}
                  className="flex-1 rounded-t-lg bg-gradient-to-t from-[#FF4500] to-[#FFD700]
                             shadow-lg shadow-[#FF4500]/20"
                />
              </div>
              <span className="text-[10px] text-gray-600 font-medium">{DAYS[i]}</span>
            </div>
          );
        })}
      </div>

      {/* Y-axis labels */}
      <div className="flex justify-between mt-3 px-1">
        <span className="text-[10px] text-gray-700">$0</span>
        <span className="text-[10px] text-gray-700">${(MAX / 2).toFixed(0)}</span>
        <span className="text-[10px] text-gray-700">${MAX.toLocaleString()}</span>
      </div>
    </div>
  );
}
