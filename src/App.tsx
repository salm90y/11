/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import DocumentUpload from './components/DocumentUpload';
import DocumentList from './components/DocumentList';
import { Document, Stats, UserRole } from './types';
import { 
  Bell, 
  Search as SearchIcon, 
  HelpCircle,
  X,
  FileText,
  Download,
  Printer
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Barcode from 'react-barcode';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalDocuments: 0,
    documentsByCategory: {},
    dailyUploads: [],
    recentActivity: []
  });
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [docsRes, statsRes] = await Promise.all([
        fetch('/api/documents'),
        fetch('/api/stats')
      ]);
      const docs = await docsRes.json();
      const st = await statsRes.json();
      setDocuments(docs);
      setStats(st);
    } catch (error) {
      console.error('Fetch Error:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذه الوثيقة نهائياً؟')) return;
    try {
      await fetch(`/api/documents/${id}`, { method: 'DELETE' });
      fetchData();
    } catch (error) {
      console.error('Delete Error:', error);
    }
  };

  const handleUploadSuccess = (doc: Document) => {
    setActiveTab('documents');
    fetchData();
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans select-none" dir="rtl">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between z-10">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-slate-800">
              {activeTab === 'dashboard' && 'نظرة عامة'}
              {activeTab === 'documents' && 'الأرشيف الإلكتروني'}
              {activeTab === 'upload' && 'أرشفة وثيقة'}
              {activeTab === 'search' && 'البحث المتقدم'}
              {activeTab === 'stats' && 'التقارير والإحصائيات'}
              {activeTab === 'users' && 'إدارة المستخدمين'}
              {activeTab === 'settings' && 'الإعدادات'}
            </h2>
          </div>

          <div className="flex items-center gap-6">
            <div className="hidden md:flex relative group">
              <SearchIcon className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={18} />
              <input 
                type="text" 
                placeholder="بحث سريع..." 
                className="pr-10 pl-4 py-2 bg-slate-100 border-none rounded-full text-sm w-64 focus:ring-2 focus:ring-blue-500 transition-all"
              />
            </div>
            
            <div className="flex items-center gap-2">
              <button className="p-2.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all relative">
                <Bell size={20} />
                <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-red-500 border-2 border-white rounded-full"></span>
              </button>
              <button className="p-2.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all">
                <HelpCircle size={20} />
              </button>
            </div>

            <div className="h-8 w-[1px] bg-slate-200 mx-2"></div>

            <div className="flex items-center gap-3">
              <div className="text-left">
                <p className="text-sm font-bold text-slate-900 leading-tight">مدير النظام</p>
                <p className="text-[10px] text-slate-500 font-medium">مدير (Admin)</p>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center text-white font-bold shadow-lg shadow-blue-200">
                م
              </div>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === 'dashboard' && <Dashboard stats={stats} />}
              {activeTab === 'documents' && <DocumentList documents={documents} onDelete={handleDelete} onView={setSelectedDoc} />}
              {activeTab === 'upload' && <DocumentUpload onUploadSuccess={handleUploadSuccess} />}
              {activeTab === 'stats' && <Dashboard stats={stats} />} {/* Reusing dashboard for stats for now */}
              
              {(activeTab === 'search' || activeTab === 'users' || activeTab === 'settings') && (
                <div className="h-[60vh] flex flex-col items-center justify-center text-slate-400 bg-white rounded-3xl border border-slate-100 p-12 text-center">
                  <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mb-6">
                    <FileText size={48} className="text-slate-200" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-300">قيد التطوير</h3>
                  <p className="max-w-md mt-2">هذه الخاصية سيتم تفعيلها في التحديث القادم للنظام. الأولوية حالياً لوظائف الأرشفة و OCR.</p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Document Viewer Modal */}
      <AnimatePresence>
        {selectedDoc && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedDoc(null)}
              className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-6xl bg-white rounded-[2rem] shadow-2xl flex flex-col max-h-full overflow-hidden"
              dir="rtl"
            >
              <div className="flex items-center justify-between p-6 border-b border-slate-100">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                    <FileText size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-xl text-slate-900">{selectedDoc.title}</h3>
                    <p className="text-sm text-slate-400">{selectedDoc.category} • {new Date(selectedDoc.uploadDate).toLocaleDateString('ar-EG')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button className="p-3 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all">
                    <Printer size={20} />
                  </button>
                  <button className="p-3 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all">
                    <Download size={20} />
                  </button>
                  <button 
                    onClick={() => setSelectedDoc(null)}
                    className="p-3 bg-slate-100 text-slate-500 hover:bg-slate-200 rounded-xl transition-all mr-4"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
                <div className="flex-1 bg-slate-900 overflow-y-auto p-4 flex items-center justify-center">
                  <img 
                    src={selectedDoc.fileData} 
                    alt={selectedDoc.title}
                    className="max-w-full max-h-full rounded-lg shadow-2xl"
                  />
                </div>
                <div className="w-full lg:w-[400px] border-r border-slate-100 flex flex-col bg-white">
                  <div className="p-6 border-b border-slate-100">
                    <h4 className="font-bold text-slate-900 mb-4">النصوص المستخرجة</h4>
                    <div className="bg-slate-50 rounded-2xl p-4 text-sm text-slate-600 leading-relaxed whitespace-pre-wrap max-h-[300px] lg:max-h-none overflow-y-auto">
                      {selectedDoc.extractedText || 'لا توجد نصوص مستخرجة'}
                    </div>
                  </div>
                  <div className="p-6 space-y-6">
                    <div>
                      <h4 className="font-bold text-slate-900 mb-4">بيانات الأرشفة</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 bg-slate-50 rounded-xl">
                          <p className="text-[10px] text-slate-400 font-bold mb-1">المؤرشف</p>
                          <p className="text-sm font-bold text-slate-700">{selectedDoc.uploaderName}</p>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-xl">
                          <p className="text-[10px] text-slate-400 font-bold mb-1">تاريخ الأرشفة</p>
                          <p className="text-sm font-bold text-slate-700">{new Date(selectedDoc.uploadDate).toLocaleDateString('ar-EG')}</p>
                        </div>
                      </div>
                    </div>
                    <div className="text-center p-4 border-2 border-dashed border-slate-100 rounded-2xl">
                      <Barcode 
                        value={selectedDoc.barcode} 
                        width={1.2} 
                        height={50} 
                        fontSize={12}
                      />
                      <p className="text-[10px] text-slate-400 mt-2">رقم الباركود: {selectedDoc.barcode}</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
