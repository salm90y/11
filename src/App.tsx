/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import DocumentUpload from './components/DocumentUpload';
import DocumentList from './components/DocumentList';
import PCSettings from './components/PCSettings';
import { saveDocToLocalHandle, downloadStructuredZip } from './utils/pcArchive';
import { Document, Stats, UserRole, MentionedPerson, ReferencedLetter } from './types';
import { 
  Bell, 
  Search as SearchIcon, 
  HelpCircle,
  X,
  FileText,
  Download,
  Printer,
  Edit3,
  Save,
  Check,
  Sparkles,
  HardDrive
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
  const [pcDirectoryHandle, setPcDirectoryHandle] = useState<any | null>(null);

  // حالات تعديل الوثيقة المحفوظة يدوياً
  const [isEditingSavedDoc, setIsEditingSavedDoc] = useState(false);
  const [editedSavedDocText, setEditedSavedDocText] = useState('');
  const [editedSavedDocBodyText, setEditedSavedDocBodyText] = useState('');
  const [editedSavedDocAttachments, setEditedSavedDocAttachments] = useState('');
  const [editedSavedDocCopyTo, setEditedSavedDocCopyTo] = useState('');
  const [editedSavedDocMentionedPersons, setEditedSavedDocMentionedPersons] = useState<MentionedPerson[]>([]);
  const [editedSavedDocLetterNumber, setEditedSavedDocLetterNumber] = useState('');
  const [editedSavedDocLetterDate, setEditedSavedDocLetterDate] = useState('');
  const [editedSavedDocIssuingAuthority, setEditedSavedDocIssuingAuthority] = useState('');
  const [editedSavedDocReferencedLetters, setEditedSavedDocReferencedLetters] = useState<ReferencedLetter[]>([]);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  useEffect(() => {
    if (selectedDoc) {
      setEditedSavedDocText(selectedDoc.extractedText || '');
      setEditedSavedDocBodyText(selectedDoc.bodyText || '');
      setEditedSavedDocAttachments(selectedDoc.attachments || '');
      setEditedSavedDocCopyTo(selectedDoc.copyTo || '');
      setEditedSavedDocMentionedPersons(selectedDoc.mentionedPersons || []);
      setEditedSavedDocLetterNumber(selectedDoc.letterNumber || '');
      setEditedSavedDocLetterDate(selectedDoc.letterDate || '');
      setEditedSavedDocIssuingAuthority(selectedDoc.issuingAuthority || '');
      setEditedSavedDocReferencedLetters(selectedDoc.referencedLetters || []);
      setIsEditingSavedDoc(false);
    }
  }, [selectedDoc]);

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

  const handleSaveDocumentEdit = async () => {
    if (!selectedDoc) return;
    setIsSavingEdit(true);
    try {
      const response = await fetch(`/api/documents/${selectedDoc.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          extractedText: editedSavedDocText,
          bodyText: editedSavedDocBodyText,
          attachments: editedSavedDocAttachments,
          copyTo: editedSavedDocCopyTo,
          mentionedPersons: editedSavedDocMentionedPersons,
          letterNumber: editedSavedDocLetterNumber,
          letterDate: editedSavedDocLetterDate,
          issuingAuthority: editedSavedDocIssuingAuthority,
          referencedLetters: editedSavedDocReferencedLetters
        })
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.doc) {
          setSelectedDoc(data.doc);
          setDocuments(prevDocs => prevDocs.map(d => d.id === selectedDoc.id ? data.doc : d));
          fetchData();
          setIsEditingSavedDoc(false);
        }
      } else {
        alert('فشل حفظ التعديلات على المستند');
      }
    } catch (error) {
      console.error('Error updating document text:', error);
      alert('حدث خطأ أثناء حفظ التعديلات');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const [isSavingToPC, setIsSavingToPC] = useState(false);
  const [pcSaveMessage, setPcSaveMessage] = useState('');

  const handleSaveToLocalPC = async (doc: Document) => {
    setIsSavingToPC(true);
    setPcSaveMessage('');
    try {
      if (pcDirectoryHandle) {
        const savedPath = await saveDocToLocalHandle(doc, pcDirectoryHandle);
        setPcSaveMessage(`تم الحفظ بنجاح في مجلد الحاسبة: ${savedPath} ✅`);
        setTimeout(() => setPcSaveMessage(''), 5000);
      } else {
        // Fallback: If not connected, offer to download a structured zip of just this doc,
        // or prompt them to connect
        const confirmConnect = confirm(
          "لم تقم بربط مجلد الحاسبة الشخصية بعد لتمكين الحفظ المباشر بنقرة واحدة.\n\n" +
          "هل ترغب في ربط وتحديد مجلد الحاسبة الشخصية الآن؟"
        );
        if (confirmConnect) {
          if (!('showDirectoryPicker' in window)) {
            alert(
              "متصفحك الحالي لا يدعم الربط المباشر مع مجلدات جهاز الكمبيوتر.\n\n" +
              "سنقوم الآن بتنزيل هذا المستند لك مرتباً في الهيكل المطلوب تلقائياً كملف مضغوط (ZIP)!"
            );
            await downloadStructuredZip([doc]);
          } else {
            // @ts-ignore
            const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
            setPcDirectoryHandle(handle);
            const savedPath = await saveDocToLocalHandle(doc, handle);
            setPcSaveMessage(`تم الربط والحفظ بنجاح في مجلد الحاسبة: ${savedPath} ✅`);
            setTimeout(() => setPcSaveMessage(''), 5000);
          }
        } else {
          // Alternative: Download single doc ZIP
          await downloadStructuredZip([doc]);
        }
      }
    } catch (error: any) {
      console.error(error);
      if (error.name !== 'AbortError') {
        alert(error.message || "حدث خطأ أثناء محاولة حفظ المستند.");
      }
    } finally {
      setIsSavingToPC(false);
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
              {activeTab === 'settings' && 'أرشيف الحاسبة ومجلدات الكمبيوتر 💻'}
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
              {activeTab === 'settings' && (
                <PCSettings 
                  documents={documents}
                  pcDirectoryHandle={pcDirectoryHandle}
                  setPcDirectoryHandle={setPcDirectoryHandle}
                />
              )}
              
              {(activeTab === 'search' || activeTab === 'users') && (
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
                  {pcSaveMessage && (
                    <span className="text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-3 py-2 rounded-xl">
                      {pcSaveMessage}
                    </span>
                  )}
                  <button 
                    onClick={() => handleSaveToLocalPC(selectedDoc)}
                    disabled={isSavingToPC}
                    className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-extrabold rounded-xl transition-all flex items-center gap-2 shadow-md shadow-blue-500/10"
                  >
                    <HardDrive size={16} />
                    <span>{isSavingToPC ? 'جاري الحفظ...' : 'حفظ في مجلد الحاسبة 💻'}</span>
                  </button>
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
                <div className="w-full lg:w-[500px] border-r border-slate-100 flex flex-col bg-white overflow-y-auto">
                  <div className="p-6 border-b border-slate-100 flex flex-col">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-bold text-slate-900">مضمون نص الكتاب الإداري المستخلص</h4>
                      {isEditingSavedDoc ? (
                        <div className="flex gap-2">
                          <button
                            onClick={handleSaveDocumentEdit}
                            disabled={isSavingEdit}
                            className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold rounded-lg transition-colors shadow-sm"
                          >
                            <Save size={12} />
                            <span>{isSavingEdit ? 'جاري الحفظ...' : 'حفظ'}</span>
                          </button>
                          <button
                            onClick={() => {
                              setEditedSavedDocText(selectedDoc.extractedText || '');
                              setEditedSavedDocBodyText(selectedDoc.bodyText || '');
                              setEditedSavedDocAttachments(selectedDoc.attachments || '');
                              setEditedSavedDocCopyTo(selectedDoc.copyTo || '');
                              setEditedSavedDocMentionedPersons(selectedDoc.mentionedPersons || []);
                              setEditedSavedDocLetterNumber(selectedDoc.letterNumber || '');
                              setEditedSavedDocLetterDate(selectedDoc.letterDate || '');
                              setEditedSavedDocIssuingAuthority(selectedDoc.issuingAuthority || '');
                              setIsEditingSavedDoc(false);
                            }}
                            className="flex items-center gap-1 px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 text-[11px] font-bold rounded-lg transition-colors"
                          >
                            <span>إلغاء</span>
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setIsEditingSavedDoc(true)}
                          className="flex items-center gap-1 px-2.5 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 text-[11px] font-bold rounded-lg transition-colors shadow-sm"
                        >
                          <Edit3 size={12} />
                          <span>تعديل يدوياً</span>
                        </button>
                      )}
                    </div>
                    {isEditingSavedDoc ? (
                      <textarea
                        className="w-full h-72 p-4 bg-slate-50 text-slate-800 text-base rounded-2xl border border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed font-serif text-right resize-none"
                        style={{ fontFamily: "'Traditional Arabic', 'Amiri', 'Arial', sans-serif" }}
                        dir="rtl"
                        value={editedSavedDocBodyText || editedSavedDocText}
                        onChange={(e) => setEditedSavedDocBodyText(e.target.value)}
                      />
                    ) : (
                      <div className="bg-slate-50 rounded-2xl p-4 text-sm text-slate-600 leading-relaxed whitespace-pre-wrap max-h-[300px] overflow-y-auto">
                        {selectedDoc.bodyText || selectedDoc.extractedText || 'لا توجد نصوص مستخرجة'}
                      </div>
                    )}
 
                    {/* حقول هيكلية الكتاب الإداري المستخلصة */}
                    <div className="mt-6 pt-6 border-t border-slate-100 space-y-4">
                      <h4 className="font-bold text-sm text-slate-900 flex items-center gap-1.5 border-b border-slate-100 pb-2">
                        <Sparkles className="text-blue-600" size={16} />
                        بيانات وهيكلية الكتاب الإداري المستخلصة
                      </h4>
 
                      {isEditingSavedDoc ? (
                        <div className="space-y-4">
                          {/* جهة إصدار الكتاب */}
                          <div className="space-y-1">
                            <label className="block text-xs font-bold text-slate-700">🏢 جهة إصدار الكتاب:</label>
                            <input
                              type="text"
                              value={editedSavedDocIssuingAuthority}
                              onChange={(e) => setEditedSavedDocIssuingAuthority(e.target.value)}
                              className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 text-slate-800 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="جهة إصدار الكتاب..."
                            />
                          </div>

                          {/* رقم الكتاب */}
                          <div className="space-y-1">
                            <label className="block text-xs font-bold text-slate-700">🔢 رقم الكتاب / العدد:</label>
                            <input
                              type="text"
                              value={editedSavedDocLetterNumber}
                              onChange={(e) => setEditedSavedDocLetterNumber(e.target.value)}
                              className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 text-slate-800 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="رقم الكتاب..."
                            />
                          </div>

                          {/* تاريخ الكتاب */}
                          <div className="space-y-1">
                            <label className="block text-xs font-bold text-slate-700">📅 تاريخ الكتاب:</label>
                            <input
                              type="text"
                              value={editedSavedDocLetterDate}
                              onChange={(e) => setEditedSavedDocLetterDate(e.target.value)}
                              className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 text-slate-800 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="تاريخ الكتاب..."
                            />
                          </div>

                          {/* 2. المرفقات */}
                          <div className="space-y-1">
                            <label className="block text-xs font-bold text-slate-700">📎 المرفقات:</label>
                            <input
                              type="text"
                              value={editedSavedDocAttachments}
                              onChange={(e) => setEditedSavedDocAttachments(e.target.value)}
                              className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 text-slate-800 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="المرفقات..."
                            />
                          </div>

                          {/* 3. نسخة منه إلى */}
                          <div className="space-y-1">
                            <label className="block text-xs font-bold text-slate-700">📂 نسخة منه إلى:</label>
                            <textarea
                              value={editedSavedDocCopyTo}
                              onChange={(e) => setEditedSavedDocCopyTo(e.target.value)}
                              rows={2}
                              className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 text-slate-800 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="نسخة منه إلى..."
                            />
                          </div>

                          {/* 4. قائمة الأسماء والمنتسبين المذكورين */}
                          <div className="space-y-2 pt-2 border-t border-slate-100">
                            <div className="flex justify-between items-center">
                              <label className="block text-xs font-bold text-slate-700">👥 المراتب والضباط المذكورين:</label>
                              <button
                                type="button"
                                onClick={() => setEditedSavedDocMentionedPersons([...editedSavedDocMentionedPersons, { statisticalNumber: '', rank: 'شرطي', name: '' }])}
                                className="text-[11px] text-blue-600 font-bold hover:underline"
                              >
                                + إضافة اسم
                              </button>
                            </div>
                            <div className="space-y-2 max-h-48 overflow-y-auto p-1 bg-slate-50 rounded-xl border border-slate-100">
                              {editedSavedDocMentionedPersons.map((p, pIdx) => (
                                <div key={pIdx} className="flex gap-1.5 items-center bg-white p-1.5 rounded-lg shadow-sm border border-slate-100">
                                  <input
                                    type="text"
                                    placeholder="رقم إحصائي"
                                    value={p.statisticalNumber}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setEditedSavedDocMentionedPersons(editedSavedDocMentionedPersons.map((x, i) => i === pIdx ? { ...x, statisticalNumber: val } : x));
                                    }}
                                    className="w-16 px-1.5 py-1 text-[10px] border border-slate-200 rounded-md"
                                  />
                                  <select
                                    value={p.rank}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setEditedSavedDocMentionedPersons(editedSavedDocMentionedPersons.map((x, i) => i === pIdx ? { ...x, rank: val } : x));
                                    }}
                                    className="w-20 px-1 py-1 text-[10px] border border-slate-200 rounded-md"
                                  >
                                    <option value="شرطي">شرطي</option>
                                    <option value="عريف">عريف</option>
                                    <option value="مفوض">مفوض</option>
                                    <option value="ملازم">ملازم</option>
                                    <option value="نقيب">نقيب</option>
                                    <option value="رائد">رائد</option>
                                    <option value="مقدم">مقدم</option>
                                    <option value="عقيد">عقيد</option>
                                    <option value="عميد">عميد</option>
                                    <option value="لواء">لواء</option>
                                    <option value="فريق">فريق</option>
                                    <option value="فريق أول">فريق أول</option>
                                    <option value="منتسب">منتسب</option>
                                    <option value="موظف مدني">موظف مدني</option>
                                  </select>
                                  <input
                                    type="text"
                                    placeholder="الاسم"
                                    value={p.name}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setEditedSavedDocMentionedPersons(editedSavedDocMentionedPersons.map((x, i) => i === pIdx ? { ...x, name: val } : x));
                                    }}
                                    className="flex-1 px-1.5 py-1 text-[10px] border border-slate-200 rounded-md"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setEditedSavedDocMentionedPersons(editedSavedDocMentionedPersons.filter((_, i) => i !== pIdx))}
                                    className="text-red-500 text-xs font-bold px-1 hover:text-red-700"
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* 5. الكتب والوثائق الأخرى المشار إليها في المتن */}
                          <div className="space-y-2 pt-2 border-t border-slate-100">
                            <div className="flex justify-between items-center">
                              <label className="block text-xs font-bold text-slate-700">📄 الكتب والوثائق الأخرى المشار إليها:</label>
                              <button
                                type="button"
                                onClick={() => setEditedSavedDocReferencedLetters([...editedSavedDocReferencedLetters, { letterNumber: '', letterDate: '', issuingAuthority: '' }])}
                                className="text-[11px] text-indigo-600 font-bold hover:underline"
                              >
                                + إضافة كتاب مشار إليه
                              </button>
                            </div>
                            <div className="space-y-2 max-h-48 overflow-y-auto p-1 bg-indigo-50/20 rounded-xl border border-indigo-100/50">
                              {editedSavedDocReferencedLetters.map((rl, rlIdx) => (
                                <div key={rlIdx} className="flex gap-1.5 items-center bg-white p-1.5 rounded-lg shadow-sm border border-slate-100">
                                  <input
                                    type="text"
                                    placeholder="رقم الكتاب"
                                    value={rl.letterNumber}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setEditedSavedDocReferencedLetters(editedSavedDocReferencedLetters.map((x, i) => i === rlIdx ? { ...x, letterNumber: val } : x));
                                    }}
                                    className="w-24 px-1.5 py-1 text-[10px] border border-slate-200 rounded-md font-mono font-bold"
                                  />
                                  <input
                                    type="text"
                                    placeholder="تاريخه"
                                    value={rl.letterDate}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setEditedSavedDocReferencedLetters(editedSavedDocReferencedLetters.map((x, i) => i === rlIdx ? { ...x, letterDate: val } : x));
                                    }}
                                    className="w-24 px-1.5 py-1 text-[10px] border border-slate-200 rounded-md"
                                  />
                                  <input
                                    type="text"
                                    placeholder="جهة الإصدار"
                                    value={rl.issuingAuthority}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setEditedSavedDocReferencedLetters(editedSavedDocReferencedLetters.map((x, i) => i === rlIdx ? { ...x, issuingAuthority: val } : x));
                                    }}
                                    className="flex-1 px-1.5 py-1 text-[10px] border border-slate-200 rounded-md"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setEditedSavedDocReferencedLetters(editedSavedDocReferencedLetters.filter((_, i) => i !== rlIdx))}
                                    className="text-red-500 text-xs font-bold px-1 hover:text-red-700"
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                              {editedSavedDocReferencedLetters.length === 0 && (
                                <p className="text-[10px] text-center text-slate-400 py-2">لا توجد كتب مشار إليها مضافة حالياً</p>
                              )}
                            </div>
                          </div>

                        </div>
                      ) : (
                        <div className="space-y-4">
                          {/* عرض البيانات المستخلصة الرئيسية */}
                          {(selectedDoc.issuingAuthority || selectedDoc.letterNumber || selectedDoc.letterDate) && (
                            <div className="grid grid-cols-1 gap-2 bg-blue-50/50 p-3.5 rounded-2xl border border-blue-100 text-xs">
                              {selectedDoc.issuingAuthority && (
                                <div className="flex justify-between items-center py-1 border-b border-blue-100/40">
                                  <span className="font-bold text-slate-800">🏢 جهة الإصدار:</span>
                                  <span className="text-slate-700 font-medium">{selectedDoc.issuingAuthority}</span>
                                </div>
                              )}
                              {selectedDoc.letterNumber && (
                                <div className="flex justify-between items-center py-1 border-b border-blue-100/40">
                                  <span className="font-bold text-slate-800">🔢 رقم الكتاب / العدد:</span>
                                  <span className="text-slate-700 font-mono font-bold">{selectedDoc.letterNumber}</span>
                                </div>
                              )}
                              {selectedDoc.letterDate && (
                                <div className="flex justify-between items-center py-1">
                                  <span className="font-bold text-slate-800">📅 تاريخ الكتاب:</span>
                                  <span className="text-slate-700 font-medium">{selectedDoc.letterDate}</span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* عرض مضمون القرار المستخلص */}
                          {selectedDoc.bodyText && (
                            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 text-xs">
                              <p className="font-bold text-slate-800 mb-1">📝 مضمون القرار / نص الكتاب:</p>
                              <p className="text-slate-600 leading-relaxed whitespace-pre-wrap">{selectedDoc.bodyText}</p>
                            </div>
                          )}

                          {/* عرض المرفقات */}
                          {selectedDoc.attachments && (
                            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-xs">
                              <span className="font-bold text-slate-800">📎 المرفقات: </span>
                              <span className="text-slate-600">{selectedDoc.attachments}</span>
                            </div>
                          )}

                          {/* عرض نسخة منه إلى */}
                          {selectedDoc.copyTo && (
                            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-xs">
                              <p className="font-bold text-slate-800 mb-1">📂 نسخة منه إلى:</p>
                              <p className="text-slate-600 leading-relaxed whitespace-pre-wrap">{selectedDoc.copyTo}</p>
                            </div>
                          )}

                          {/* عرض المنتسبين المذكورين */}
                          {selectedDoc.mentionedPersons && selectedDoc.mentionedPersons.length > 0 && (
                            <div className="space-y-2">
                              <p className="font-bold text-xs text-slate-800">👥 المراتب والضباط المذكورين في الكتاب:</p>
                              <div className="overflow-hidden border border-slate-150 rounded-xl bg-slate-50/50">
                                <table className="w-full border-collapse text-right text-[11px]">
                                  <thead>
                                    <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 font-bold">
                                      <th className="p-2 text-center w-8">ت</th>
                                      <th className="p-2 w-20">رقم إحصائي</th>
                                      <th className="p-2 w-20">الرتبة</th>
                                      <th className="p-2">الاسم الكامل</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {selectedDoc.mentionedPersons.map((person, pIdx) => (
                                      <tr key={pIdx} className="hover:bg-white bg-slate-50/30">
                                        <td className="p-2 text-center font-semibold text-slate-400">{pIdx + 1}</td>
                                        <td className="p-2 text-slate-600 font-mono">{person.statisticalNumber || '-'}</td>
                                        <td className="p-2 font-bold text-blue-800">{person.rank}</td>
                                        <td className="p-2 text-slate-800 font-medium">{person.name}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          {/* عرض الكتب والوثائق الأخرى المشار إليها في المتن */}
                          {selectedDoc.referencedLetters && selectedDoc.referencedLetters.length > 0 && (
                            <div className="space-y-2 pt-2 border-t border-slate-100">
                              <p className="font-bold text-xs text-slate-800">📄 الكتب والوثائق الأخرى المشار إليها في المتن:</p>
                              <div className="overflow-hidden border border-slate-150 rounded-xl bg-slate-50/50">
                                <table className="w-full border-collapse text-right text-[11px]">
                                  <thead>
                                    <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 font-bold">
                                      <th className="p-2 text-center w-8">ت</th>
                                      <th className="p-2 w-32">رقم الكتاب / العدد</th>
                                      <th className="p-2 w-28">تاريخ الكتاب</th>
                                      <th className="p-2">جهة إصدار الكتاب المشار إليه</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {selectedDoc.referencedLetters.map((refLetter, rIdx) => (
                                      <tr key={rIdx} className="hover:bg-white bg-slate-50/30">
                                        <td className="p-2 text-center font-semibold text-slate-400">{rIdx + 1}</td>
                                        <td className="p-2 text-slate-700 font-mono font-bold">{refLetter.letterNumber || '-'}</td>
                                        <td className="p-2 text-slate-600 font-medium">{refLetter.letterDate || '-'}</td>
                                        <td className="p-2 font-bold text-slate-800">{refLetter.issuingAuthority}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
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
