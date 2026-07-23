/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { 
  FileText, 
  Users, 
  TrendingUp, 
  Clock,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { motion } from 'motion/react';
import { Stats } from '../types';

interface DashboardProps {
  stats: Stats;
}

export default function Dashboard({ stats }: DashboardProps) {
  const statCards = [
    { 
      label: 'إجمالي الوثائق', 
      value: stats.totalDocuments, 
      icon: FileText, 
      color: 'blue',
      change: '+12%',
      isUp: true
    },
    { 
      label: 'المستخدمين النشطين', 
      value: 2, // Fixed for demo
      icon: Users, 
      color: 'purple',
      change: '+2',
      isUp: true
    },
    { 
      label: 'وثائق اليوم', 
      value: stats.dailyUploads.length, 
      icon: TrendingUp, 
      color: 'emerald',
      change: '-5%',
      isUp: false
    },
    { 
      label: 'أرشفة الشهر', 
      value: stats.totalDocuments, 
      icon: Clock, 
      color: 'orange',
      change: '+18%',
      isUp: true
    },
  ];

  return (
    <div className="space-y-8 p-1 animate-in fade-in slide-in-from-bottom-4 duration-700" dir="rtl">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex justify-between items-start mb-4">
              <div className={`p-3 rounded-2xl bg-${stat.color}-50 text-${stat.color}-600`}>
                <stat.icon size={24} />
              </div>
              <div className={`flex items-center gap-1 text-sm font-medium ${stat.isUp ? 'text-emerald-600' : 'text-red-600'}`}>
                {stat.isUp ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                {stat.change}
              </div>
            </div>
            <div>
              <p className="text-slate-500 text-sm font-medium mb-1">{stat.label}</p>
              <h3 className="text-3xl font-bold text-slate-900">{stat.value}</h3>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center">
            <h3 className="font-bold text-lg text-slate-900">النشاط الأخير</h3>
            <button className="text-blue-600 text-sm font-medium hover:underline">عرض الكل</button>
          </div>
          <div className="divide-y divide-slate-50">
            {stats.recentActivity.length > 0 ? stats.recentActivity.map((activity, i) => (
              <div key={activity.id} className="p-4 flex items-center gap-4 hover:bg-slate-50 transition-colors">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold">
                  {activity.user[0]}
                </div>
                <div className="flex-1">
                  <p className="text-slate-900 font-medium">{activity.user}</p>
                  <p className="text-slate-500 text-sm">{activity.action}</p>
                </div>
                <div className="text-slate-400 text-xs">
                  {new Date(activity.time).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            )) : (
              <div className="p-12 text-center text-slate-400">
                لا يوجد نشاط متاح حالياً
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
          <h3 className="font-bold text-lg text-slate-900 mb-6">توزيع الفئات</h3>
          <div className="space-y-4">
            {Object.entries(stats.documentsByCategory).length > 0 ? Object.entries(stats.documentsByCategory).map(([category, count]) => (
              <div key={category} className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-700 font-medium">{category}</span>
                  <span className="text-slate-400">{count}</span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${(count / stats.totalDocuments) * 100}%` }}
                    className="h-full bg-blue-500 rounded-full"
                  />
                </div>
              </div>
            )) : (
              <div className="text-center text-slate-400 py-12">
                لا توجد بيانات للفئات بعد
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
