/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { 
  LayoutDashboard, 
  FileText, 
  Upload, 
  Search, 
  Users, 
  Settings, 
  LogOut,
  BarChart3
} from 'lucide-react';
import { motion } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const menuItems = [
  { id: 'dashboard', label: 'لوحة التحكم', icon: LayoutDashboard },
  { id: 'documents', label: 'الوثائق المؤرشفة', icon: FileText },
  { id: 'upload', label: 'أرشفة وثيقة جديدة', icon: Upload },
  { id: 'search', label: 'البحث المتقدم', icon: Search },
  { id: 'stats', label: 'الإحصائيات', icon: BarChart3 },
  { id: 'users', label: 'إدارة المستخدمين', icon: Users },
  { id: 'settings', label: 'الإعدادات', icon: Settings },
];

export default function Sidebar({ activeTab, setActiveTab }: SidebarProps) {
  return (
    <div className="w-64 bg-slate-900 text-slate-300 flex flex-col h-screen border-l border-slate-800" dir="rtl">
      <div className="p-6 border-b border-slate-800">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <FileText size={20} className="text-white" />
          </div>
          نظام الأرشفة
        </h1>
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group",
              activeTab === item.id 
                ? "bg-blue-600 text-white shadow-lg shadow-blue-900/20" 
                : "hover:bg-slate-800 hover:text-white"
            )}
          >
            <item.icon 
              size={20} 
              className={cn(
                "transition-colors",
                activeTab === item.id ? "text-white" : "text-slate-400 group-hover:text-white"
              )} 
            />
            <span className="font-medium">{item.label}</span>
            {activeTab === item.id && (
              <motion.div 
                layoutId="active-pill"
                className="mr-auto w-1.5 h-1.5 rounded-full bg-white"
              />
            )}
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-800">
        <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-red-500/10 hover:text-red-400 transition-colors text-slate-400">
          <LogOut size={20} />
          <span className="font-medium">تسجيل الخروج</span>
        </button>
      </div>
    </div>
  );
}
