/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Search, 
  Filter, 
  MoreVertical, 
  Eye, 
  Trash2, 
  Download,
  Calendar,
  Tag,
  FileText
} from 'lucide-react';
import { motion } from 'motion/react';
import { Document, DocumentCategory } from '../types';

interface DocumentListProps {
  documents: Document[];
  onDelete: (id: string) => void;
  onView: (doc: Document) => void;
}

export default function DocumentList({ documents, onDelete, onView }: DocumentListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const filteredDocs = documents.filter(doc => {
    const matchesSearch = doc.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         doc.extractedText.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || doc.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-3xl border border-slate-200 shadow-sm">
        <div className="relative flex-1 w-full">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input 
            type="text" 
            placeholder="البحث في الوثائق أو النصوص المستخرجة..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pr-12 pl-4 py-3 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 transition-all text-slate-900"
          />
        </div>
        <div className="flex gap-4 w-full md:w-auto">
          <select 
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="flex-1 md:w-48 px-4 py-3 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 text-slate-700 font-medium"
          >
            <option value="all">جميع الفئات</option>
            {Object.values(DocumentCategory).map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <button className="p-3 bg-slate-50 text-slate-500 rounded-2xl hover:bg-slate-100 transition-colors">
            <Filter size={20} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredDocs.map((doc, i) => (
          <motion.div
            key={doc.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05 }}
            className="group bg-white rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden"
          >
            <div className="relative aspect-[4/3] bg-slate-100 overflow-hidden">
              <img 
                src={doc.fileData} 
                alt={doc.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4 gap-2">
                <button 
                  onClick={() => onView(doc)}
                  className="flex-1 bg-white/20 backdrop-blur-md text-white py-2 rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-white/30 transition-colors"
                >
                  <Eye size={16} />
                  عرض
                </button>
                <button 
                  className="bg-white/20 backdrop-blur-md text-white p-2 rounded-xl hover:bg-white/30 transition-colors"
                >
                  <Download size={16} />
                </button>
              </div>
              <div className="absolute top-4 right-4 bg-blue-600 text-white text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider">
                {doc.fileType}
              </div>
            </div>
            
            <div className="p-5">
              <div className="flex justify-between items-start mb-3">
                <h3 className="font-bold text-slate-900 line-clamp-1">{doc.title}</h3>
                <button className="text-slate-300 hover:text-slate-600">
                  <MoreVertical size={18} />
                </button>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Tag size={14} className="text-blue-500" />
                  <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md font-medium">{doc.category}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Calendar size={14} />
                  {new Date(doc.uploadDate).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <FileText size={14} />
                  الباركود: {doc.barcode}
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-50 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500">
                    {doc.uploaderName[0]}
                  </div>
                  <span className="text-[10px] text-slate-500 font-medium">{doc.uploaderName}</span>
                </div>
                <button 
                  onClick={() => onDelete(doc.id)}
                  className="text-slate-300 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {filteredDocs.length === 0 && (
        <div className="bg-white p-20 rounded-3xl border border-slate-100 text-center space-y-4">
          <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto text-slate-300">
            <Search size={40} />
          </div>
          <h3 className="text-xl font-bold text-slate-400">لم يتم العثور على نتائج</h3>
          <p className="text-slate-400">جرب البحث بكلمات أخرى أو تغيير الفئة المختارة</p>
        </div>
      )}
    </div>
  );
}
