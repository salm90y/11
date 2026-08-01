/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { 
  Upload, 
  File, 
  X, 
  Loader2, 
  Barcode as BarcodeIcon,
  Save,
  Type,
  Sparkles,
  Server,
  Copy,
  Check,
  Wand2,
  CheckCircle2,
  RotateCcw,
  Cpu,
  Settings,
  HelpCircle,
  Edit3,
  Plus
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Barcode from 'react-barcode';
import { Document, DocumentCategory } from '../types';
import { normalizeAndCorrectArabicText } from '../utils/arabicPostProcessor';

interface DocumentUploadProps {
  onUploadSuccess: (doc: Document) => void;
}

interface UploadQueueItem {
  id: string;
  file: File;
  preview: string;
  title: string;
  barcodeValue: string;
  ocrResult: { 
    text: string; 
    category: string; 
    engine?: string;
    stages?: Array<{ stage: number; title: string; details: string }>;
    enhancedImage?: string;
  } | null;
  isProcessing: boolean;
  progress: number;
  isRefining: boolean;
  isRefined: boolean;
  refinementMethod: string | null;
  originalUnrefinedText: string | null;
  isEditingManually: boolean;
  showEnhancedPreview: boolean;
  ocrEngine: 'python' | 'gemini';
}

const CLASSIFICATION_KEYWORDS: Record<DocumentCategory, string[]> = {
  [DocumentCategory.RETIREMENT]: ['تقاعد', 'التقاعد', 'إحالة'],
  [DocumentCategory.TRANSFER]: ['نقل', 'تنسيب', 'تحويل'],
  [DocumentCategory.ANNEX]: ['إلحاق', 'ملحق'],
  [DocumentCategory.ENROLLMENT]: ['التحاق', 'باشر', 'مباشرة'],
  [DocumentCategory.PENALTY]: ['عقوبات', 'عقوبة', 'تنبيه', 'إنذار'],
  [DocumentCategory.LEAVE]: ['إجازات', 'إجازة', 'مرضية'],
  [DocumentCategory.ABSENCE]: ['غياب', 'انقطاع'],
  [DocumentCategory.DEATH]: ['وفاة', 'متوفي'],
  [DocumentCategory.TERMINATION]: ['قطع علاقة', 'فصل', 'إنهاء'],
  [DocumentCategory.DETACHMENT]: ['انفكاك'],
  [DocumentCategory.ASSIGNMENT]: ['تنسيب'],
  [DocumentCategory.POSITION]: ['منصب', 'تكليف'],
  [DocumentCategory.PROMOTION]: ['ترقية', 'ترفيع'],
  [DocumentCategory.BONUS]: ['علاوة', 'مكافأة'],
  [DocumentCategory.ID]: ['هوية', 'هويات', 'بطاقة'],
  [DocumentCategory.OTHER]: [],
};

export default function DocumentUpload({ onUploadSuccess }: DocumentUploadProps) {
  // طابور رفع المستندات المتعددة
  const [queue, setQueue] = useState<UploadQueueItem[]>([]);
  const [activeIdx, setActiveIdx] = useState<number>(-1);
  const [copied, setCopied] = useState(false);

  // إعدادات Ollama للتدقيق اللغوي الأوفلاين
  const [ollamaModel, setOllamaModel] = useState(() => localStorage.getItem('ollamaModel') || 'qwen2.5');
  const [ollamaHost, setOllamaHost] = useState(() => localStorage.getItem('ollamaHost') || 'http://127.0.0.1:11434');
  const [showOllamaSettings, setShowOllamaSettings] = useState(false);
  const [ollamaError, setOllamaError] = useState<string | null>(null);

  const activeDoc = activeIdx >= 0 && activeIdx < queue.length ? queue[activeIdx] : null;

  const handleOllamaModelChange = (val: string) => {
    setOllamaModel(val);
    localStorage.setItem('ollamaModel', val);
  };

  const handleOllamaHostChange = (val: string) => {
    setOllamaHost(val);
    localStorage.setItem('ollamaHost', val);
  };

  // دالة مساعدة لتحديث خواص أي ملف في الطابور
  const updateQueueItem = (id: string, updates: Partial<UploadQueueItem>) => {
    setQueue(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  // دالة تصنيف النصوص الذكية
  const classifyText = (text: string): DocumentCategory => {
    for (const [category, keywords] of Object.entries(CLASSIFICATION_KEYWORDS)) {
      if (keywords.some(keyword => text.includes(keyword))) {
        return category as DocumentCategory;
      }
    }
    return DocumentCategory.OTHER;
  };

  // تدقيق Ollama للوثيقة النشطة
  const handleOllamaRefine = async () => {
    if (!activeDoc || !activeDoc.ocrResult?.text) return;
    
    updateQueueItem(activeDoc.id, { isRefining: true });
    setOllamaError(null);
    try {
      if (!activeDoc.originalUnrefinedText) {
        updateQueueItem(activeDoc.id, { originalUnrefinedText: activeDoc.ocrResult.text });
      }

      let res: Response | null = null;
      const payload = {
        text: activeDoc.ocrResult.text,
        model: ollamaModel,
        host: ollamaHost
      };

      try {
        const url = activeDoc.ocrEngine === 'python' 
          ? 'http://127.0.0.1:5000/api/ollama-refine' 
          : '/api/ollama-refine';

        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } catch (err) {
        // الاتصال المباشر بـ Node Backend proxy
        try {
          res = await fetch('/api/ollama-refine', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
        } catch (err2) {
          // جلب مباشر من المضيف
          try {
            res = await fetch(`${ollamaHost}/api/generate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: ollamaModel,
                prompt: `أنت خبير فائق الذكاء والاحترافية في تدقيق وتنقيح وتصحيح النصوص العربية المستخرجة عبر الـ OCR للكتب الرسمية والأوامر الإدارية والقرارات الحكومية. قم بتقديم تصحيح وتدقيق لغوي كامل ومطابقة الكلمات مع أصولها العربية الفصحى. اكتب النص النهائي المصحح بالكامل فقط، وبدون أي مقدمات أو شرح.\n\nالنص المطلوب تدقيقه:\n${activeDoc.ocrResult.text}`,
                stream: false
              })
            });
          } catch (err3) {
            throw new Error(`تعذر الاتصال بخدمة Ollama المحلية على العنوان: ${ollamaHost}. يرجى التأكد من تشغيل Ollama EXE في الخلفية.`);
          }
        }
      }

      if (!res || !res.ok) {
        throw new Error('فشل طلب تنقيح وتعديل النص عبر Ollama');
      }

      const data = await res.json();
      if (data.success && data.text) {
        updateQueueItem(activeDoc.id, {
          ocrResult: { ...activeDoc.ocrResult, text: data.text },
          isRefined: true,
          refinementMethod: data.method || `نموذج Ollama المحلي أوفلاين (${ollamaModel})`
        });
      } else {
        throw new Error(data.error || 'حدث خطأ غير معروف أثناء التدقيق بـ Ollama');
      }
    } catch (err: any) {
      console.error('Ollama Refine error:', err);
      setOllamaError(err.message || 'فشل الاتصال بـ Ollama');
    } finally {
      updateQueueItem(activeDoc.id, { isRefining: false });
    }
  };

  // تنقيح وتصحيح النص (Gemini / معجم محلي) للوثيقة النشطة
  const handleRefineText = async (mode: 'ai' | 'offline' = 'ai') => {
    if (!activeDoc || !activeDoc.ocrResult?.text) return;
    
    updateQueueItem(activeDoc.id, { isRefining: true });
    try {
      if (!activeDoc.originalUnrefinedText) {
        updateQueueItem(activeDoc.id, { originalUnrefinedText: activeDoc.ocrResult.text });
      }

      const apiUrl = activeDoc.ocrEngine === 'python' && mode === 'offline' 
        ? 'http://127.0.0.1:5000/api/refine-text' 
        : '/api/refine-text';

      let res: Response;
      try {
        res = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: activeDoc.ocrResult.text,
            mode
          })
        });
      } catch (e) {
        res = await fetch('/api/refine-text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: activeDoc.ocrResult.text,
            mode
          })
        });
      }

      if (!res.ok) {
        throw new Error('فشل طلب تنقيح وتعديل النص');
      }

      const data = await res.json();
      if (data.success && data.text) {
        updateQueueItem(activeDoc.id, {
          ocrResult: { ...activeDoc.ocrResult, text: data.text },
          isRefined: true,
          refinementMethod: data.method || (mode === 'ai' ? 'تنقيح بالذكاء الاصطناعي (Gemini)' : 'تنقيح لغوي مورفولوجي أوفلاين')
        });
      }
    } catch (err: any) {
      console.error('Refine error:', err);
      alert(`فشل تنقيح النص: ${err.message || 'حدث خطأ'}`);
    } finally {
      updateQueueItem(activeDoc.id, { isRefining: false });
    }
  };

  // تراجع عن التنقيح للوثيقة النشطة
  const handleUndoRefinement = () => {
    if (activeDoc && activeDoc.originalUnrefinedText && activeDoc.ocrResult) {
      updateQueueItem(activeDoc.id, {
        ocrResult: { ...activeDoc.ocrResult, text: activeDoc.originalUnrefinedText },
        isRefined: false,
        refinementMethod: null
      });
    }
  };

  // عند سحب وإفلات ملفات جديدة (متعددة)
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    const newItems: UploadQueueItem[] = [];

    acceptedFiles.forEach((file) => {
      const id = Math.random().toString(36).substr(2, 9);
      const barcodeValue = `DMS-${Math.floor(100000 + Math.random() * 900000)}`;
      const title = file.name.split('.')[0];

      const reader = new FileReader();
      reader.onload = () => {
        const previewUrl = reader.result as string;
        setQueue(prev => prev.map(item => item.id === id ? { ...item, preview: previewUrl } : item));
      };
      reader.readAsDataURL(file);

      newItems.push({
        id,
        file,
        preview: '',
        title,
        barcodeValue,
        ocrResult: null,
        isProcessing: false,
        progress: 0,
        isRefining: false,
        isRefined: false,
        refinementMethod: null,
        originalUnrefinedText: null,
        isEditingManually: false,
        showEnhancedPreview: false,
        ocrEngine: 'python'
      });
    });

    setQueue(prev => {
      const updated = [...prev, ...newItems];
      if (prev.length === 0) {
        setActiveIdx(0);
      }
      return updated;
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpeg', '.jpg'],
      'image/png': ['.png'],
    },
    multiple: true // تفعيل الرفع المتعدد
  } as any);

  // تشغيل قراءة النصوص (OCR) للوثيقة النشطة أو أي وثيقة
  const processOCR = async (idx = activeIdx) => {
    const doc = queue[idx];
    if (!doc || !doc.preview) return;

    updateQueueItem(doc.id, { isProcessing: true, progress: 20 });

    try {
      const base64Data = doc.preview.split(',')[1];
      let apiUrl = doc.ocrEngine === 'python' ? 'http://127.0.0.1:5000/api/ocr' : '/api/ocr';

      updateQueueItem(doc.id, { progress: 40 });
      let response: Response;
      let usedEngineName = doc.ocrEngine === 'gemini' ? 'Gemini Vision AI + القاموس العربي' : 'سيرفر بايثون المحلي';

      try {
        response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_base64: base64Data,
            image: base64Data,
            fileData: base64Data
          })
        });

        if (!response.ok && doc.ocrEngine === 'python') {
          throw new Error('Python server error');
        }
      } catch (err) {
        // التحول التلقائي للمحرك المتقدم أونلاين
        if (doc.ocrEngine === 'python') {
          console.warn('سيرفر بايثون غير متصل، جاري التحويل لمحرك الذكاء الاصطناعي الفائق أونلاين...');
          response = await fetch('/api/ocr', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              image_base64: base64Data,
              image: base64Data,
              fileData: base64Data
            })
          });
          usedEngineName = 'الذكاء الاصطناعي (تحويل تلقائي + المعجم العربي)';
        } else {
          throw err;
        }
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `خطأ السيرفر: ${response.status}`);
      }

      updateQueueItem(doc.id, { progress: 85 });
      const data = await response.json();

      const rawText = data.text || '';
      const correctedText = normalizeAndCorrectArabicText(rawText);
      const finalEngine = data.engine || usedEngineName;
      const stages = data.stages || [];
      const enhancedImage = data.enhanced_image || null;

      const category = classifyText(correctedText);
      
      updateQueueItem(doc.id, {
        progress: 100,
        ocrResult: { 
          text: correctedText, 
          category, 
          engine: finalEngine,
          stages,
          enhancedImage
        }
      });
    } catch (error: any) {
      console.error('OCR Error:', error);
      alert(`حدث خطأ أثناء معالجة المستند ${doc.title}:\n${error.message || 'خطأ غير معروف'}`);
    } finally {
      updateQueueItem(doc.id, { isProcessing: false });
    }
  };

  const handleCopy = () => {
    if (activeDoc?.ocrResult?.text) {
      navigator.clipboard.writeText(activeDoc.ocrResult.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // حفظ وثيقة منفردة في الخادم لقاعدة البيانات
  const saveSingleDocument = async (idx: number): Promise<Document | null> => {
    const doc = queue[idx];
    if (!doc || !doc.preview) return null;

    const newDoc: Document = {
      id: Math.random().toString(36).substr(2, 9),
      title: doc.title,
      category: (doc.ocrResult?.category as DocumentCategory) || DocumentCategory.OTHER,
      uploadDate: new Date().toISOString(),
      fileType: doc.file.type.includes('pdf') ? 'pdf' : 'image',
      uploaderId: '1',
      uploaderName: 'مدير النظام',
      barcode: doc.barcodeValue,
      originalFileName: doc.file.name,
      extractedText: doc.ocrResult?.text || '',
      fileData: doc.preview
    };

    try {
      const response = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newDoc)
      });
      if (response.ok) {
        return newDoc;
      }
    } catch (error) {
      console.error('Save Error:', error);
    }
    return null;
  };

  // حفظ المستند النشط الحالي
  const saveCurrentDocument = async () => {
    if (activeIdx < 0 || !activeDoc) return;
    const doc = await saveSingleDocument(activeIdx);
    if (doc) {
      // إزالة المستند الذي تم حفظه من الطابور
      const newQueue = queue.filter((_, i) => i !== activeIdx);
      setQueue(newQueue);
      if (newQueue.length > 0) {
        setActiveIdx(Math.max(0, activeIdx - 1));
      } else {
        setActiveIdx(-1);
      }
      onUploadSuccess(doc);
    } else {
      alert('فشل حفظ المستند الحالي');
    }
  };

  // حفظ جميع المستندات في الطابور دفعة واحدة
  const saveAllDocuments = async () => {
    if (queue.length === 0) return;
    
    let savedCount = 0;
    let lastSavedDoc: Document | null = null;

    for (let i = 0; i < queue.length; i++) {
      const doc = await saveSingleDocument(i);
      if (doc) {
        savedCount++;
        lastSavedDoc = doc;
      }
    }

    if (savedCount > 0) {
      alert(`تم حفظ عدد (${savedCount}) وثيقة/مستند بنجاح في الأرشيف الرقمي الموحد.`);
      if (lastSavedDoc) {
        onUploadSuccess(lastSavedDoc);
      }
      reset();
    } else {
      alert('فشل حفظ المستندات. تأكد من إتمام قراءة النصوص للمستندات أولاً.');
    }
  };

  // إزالة مستند من الطابور
  const removeQueueItem = (idxToRemove: number) => {
    const updated = queue.filter((_, i) => i !== idxToRemove);
    setQueue(updated);
    if (updated.length === 0) {
      setActiveIdx(-1);
    } else if (activeIdx >= updated.length) {
      setActiveIdx(updated.length - 1);
    }
  };

  const reset = () => {
    setQueue([]);
    setActiveIdx(-1);
    setOllamaError(null);
  };

  return (
    <div className="max-w-6xl mx-auto p-1" dir="rtl">
      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-xl overflow-hidden">
        
        {/* الترويسة الفاخرة */}
        <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
              <Upload className="text-blue-600 animate-bounce" />
              أرشفة وسحب النصوص من وثائق متعددة
            </h2>
            <p className="text-slate-500 mt-2">اسحب مجموعة من الكتب الرسمية أو الصور لمعالجتها وأرشفتها يدوياً وتلقائياً دفعة واحدة</p>
          </div>
          {queue.length > 0 && (
            <button 
              onClick={reset}
              className="px-5 py-2 text-sm font-semibold text-red-500 hover:bg-red-50 rounded-xl transition-all"
            >
              مسح الطابور بالكامل
            </button>
          )}
        </div>

        <div className="p-8">
          {queue.length === 0 ? (
            /* منطقة الإفلات والرفع */
            <div 
              {...getRootProps()} 
              className={`
                border-3 border-dashed rounded-3xl p-20 text-center transition-all duration-300 cursor-pointer
                ${isDragActive ? 'border-blue-500 bg-blue-50 scale-[1.02]' : 'border-slate-200 hover:border-blue-400 hover:bg-slate-50'}
              `}
            >
              <input {...getInputProps()} />
              <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6 text-blue-600">
                <Upload size={40} />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-2">اسحب الوثائق والملفات هنا</h3>
              <p className="text-slate-500 text-base">أو اضغط لاختيار عدة ملفات (صور أو كتب إدارية) من جهازك</p>
              <div className="mt-8 flex justify-center gap-4 text-xs font-semibold text-slate-400">
                <span className="px-4 py-1.5 bg-slate-100 rounded-full">JPG / PNG</span>
                <span className="px-4 py-1.5 bg-slate-100 rounded-full">معالجة دفعية (Multi-Upload)</span>
                <span className="px-4 py-1.5 bg-slate-100 rounded-full">Max 15MB</span>
              </div>
            </div>
          ) : (
            /* واجهة الطابور المتعدد */
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
              
              {/* العمود الأيمن: طابور الملفات المرفوعة */}
              <div className="lg:col-span-1 border-l border-slate-100 pl-4 space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    <span>قائمة الوثائق المرفوعة</span>
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-bold">{queue.length}</span>
                  </h4>
                  {/* زر إضافة المزيد من الصور إلى الطابور الحالي */}
                  <div {...getRootProps()} className="cursor-pointer">
                    <input {...getInputProps()} />
                    <button type="button" className="p-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors" title="إضافة المزيد من الصور">
                      <Plus size={16} />
                    </button>
                  </div>
                </div>

                <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
                  {queue.map((item, idx) => {
                    const isActive = idx === activeIdx;
                    return (
                      <div
                        key={item.id}
                        onClick={() => setActiveIdx(idx)}
                        className={`
                          group p-3 rounded-2xl border transition-all duration-200 cursor-pointer relative flex items-center gap-3
                          ${isActive 
                            ? 'bg-blue-50 border-blue-200 shadow-sm' 
                            : 'bg-white border-slate-150 hover:bg-slate-50 hover:border-slate-300'
                          }
                        `}
                      >
                        {item.preview ? (
                          <img src={item.preview} alt="" className="w-12 h-12 rounded-lg object-cover bg-slate-100 border border-slate-200 shadow-sm" />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400">
                            <File size={20} />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-800 truncate">{item.title || 'وثيقة بلا عنوان'}</p>
                          <p className="text-[10px] text-slate-400 mt-1 truncate">{item.file.name}</p>
                          {item.ocrResult ? (
                            <span className="inline-block mt-1 text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">تم قراءة النص</span>
                          ) : item.isProcessing ? (
                            <span className="inline-block mt-1 text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded animate-pulse">جاري المعالجة {item.progress}%</span>
                          ) : (
                            <span className="inline-block mt-1 text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">بانتظار القراءة</span>
                          )}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeQueueItem(idx);
                          }}
                          className="absolute top-2 left-2 p-1 bg-slate-100 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* العمود الأيسر: معالجة وعرض الوثيقة النشطة المحددة */}
              <div className="lg:col-span-3 space-y-6">
                {activeDoc ? (
                  <div className="space-y-6">
                    {/* معلومات المستند الحالي */}
                    <div className="flex flex-wrap items-center gap-4 p-5 bg-slate-50 rounded-2xl border border-slate-100 justify-between">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="w-14 h-14 bg-white rounded-xl shadow-sm flex items-center justify-center text-blue-600 border border-slate-100">
                          <File size={28} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <input 
                            type="text" 
                            value={activeDoc.title} 
                            onChange={(e) => updateQueueItem(activeDoc.id, { title: e.target.value })}
                            className="text-base font-bold text-slate-900 bg-transparent border-none focus:ring-0 w-full p-0 focus:outline-none"
                            placeholder="تسمية المستند..."
                          />
                          <p className="text-xs text-slate-400 mt-0.5">{activeDoc.file.name} • {(activeDoc.file.size / 1024 / 1024).toFixed(2)} MB</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs bg-slate-200 text-slate-700 font-bold px-3 py-1 rounded-full">رقم الباركود: {activeDoc.barcodeValue}</span>
                      </div>
                    </div>

                    {/* تفاصيل القراءة والصور */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      
                      {/* معاينة صورة الوثيقة */}
                      <div className="space-y-3">
                        <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                          <File size={16} className="text-blue-500" />
                          معاينة صورة الكتاب الرسمي
                        </h4>
                        <div className="h-80 bg-slate-900 rounded-2xl overflow-hidden flex items-center justify-center border border-slate-200 p-2 relative">
                          {activeDoc.preview ? (
                            <img src={activeDoc.preview} alt="" className="max-w-full max-h-full rounded object-contain" />
                          ) : (
                            <div className="text-slate-500 flex flex-col items-center gap-2">
                              <Loader2 className="animate-spin text-blue-500" />
                              <span className="text-xs">جاري تجهيز الصورة...</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* النصوص المستخرجة والتعديل اليدوي */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                            <Type size={16} className="text-blue-500" />
                            استخراج النصوص والتصحيح اليدوي
                          </h4>
                          {activeDoc.ocrResult && (
                            <div className="flex items-center gap-1.5">
                              {/* زر نسخ النص */}
                              <button
                                onClick={handleCopy}
                                className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-200 rounded-lg transition-colors shadow-sm"
                              >
                                {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                                <span>{copied ? 'تم نسخ النص!' : 'نسخ'}</span>
                              </button>
                              
                              {/* زر التبديل للتعديل اليدوي */}
                              <button
                                onClick={() => updateQueueItem(activeDoc.id, { isEditingManually: !activeDoc.isEditingManually })}
                                className={`flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded-lg transition-colors border shadow-sm ${
                                  activeDoc.isEditingManually 
                                    ? 'bg-amber-600 border-amber-500 text-white hover:bg-amber-500' 
                                    : 'bg-blue-50 border-blue-100 text-blue-700 hover:bg-blue-100'
                                }`}
                              >
                                <Edit3 size={12} />
                                <span>{activeDoc.isEditingManually ? 'إنهاء التعديل' : 'تعديل يدوياً ✍️'}</span>
                              </button>
                            </div>
                          )}
                        </div>

                        {/* اختيار محرك القراءة للوثيقة الحالية */}
                        <div className="bg-slate-100 p-1 rounded-xl flex gap-1 border border-slate-200 text-xs">
                          <button
                            type="button"
                            onClick={() => updateQueueItem(activeDoc.id, { ocrEngine: 'python' })}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg font-bold transition-all ${
                              activeDoc.ocrEngine === 'python'
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                            }`}
                          >
                            <Server size={12} />
                            <span>سيرفر بايثون (أوفلاين)</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => updateQueueItem(activeDoc.id, { ocrEngine: 'gemini' })}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg font-bold transition-all ${
                              activeDoc.ocrEngine === 'gemini'
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                            }`}
                          >
                            <Sparkles size={12} />
                            <span>الذكاء الاصطناعي أونلاين</span>
                          </button>
                        </div>

                        {/* صندوق عرض / تعديل النص المستخرج */}
                        <div className="h-64 bg-slate-900 rounded-2xl p-4 overflow-y-auto relative border border-slate-800">
                          <AnimatePresence mode="wait">
                            {activeDoc.isProcessing ? (
                              <motion.div 
                                key="loading"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 flex flex-col items-center justify-center text-blue-400 gap-3 bg-slate-900/95 backdrop-blur-sm p-4 text-center"
                              >
                                <Loader2 className="animate-spin text-blue-500" size={28} />
                                <p className="text-xs font-semibold">
                                  {activeDoc.ocrEngine === 'gemini'
                                    ? 'جاري استخراج وتفريغ النص بنظام Gemini الفائق...'
                                    : 'جاري قراءة أحرف الكتاب وتصحيح العبارات أوفلاين...'}
                                </p>
                                <div className="w-40 h-1 bg-slate-800 rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-blue-500 transition-all duration-300" 
                                    style={{ width: `${activeDoc.progress}%` }} 
                                  />
                                </div>
                              </motion.div>
                            ) : activeDoc.ocrResult ? (
                              <motion.div key="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                                <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 text-[10px]">
                                  <span className="px-2 py-0.5 bg-blue-950 text-blue-300 font-semibold rounded border border-blue-800/50">
                                    المحرك: {activeDoc.ocrResult.engine}
                                  </span>
                                  {activeDoc.ocrResult.enhancedImage && (
                                    <button
                                      onClick={() => updateQueueItem(activeDoc.id, { showEnhancedPreview: !activeDoc.showEnhancedPreview })}
                                      className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded"
                                    >
                                      {activeDoc.showEnhancedPreview ? 'إخفاء المعاينة المحسنة' : 'معاينة الصورة المعززة'}
                                    </button>
                                  )}
                                </div>

                                {activeDoc.showEnhancedPreview && activeDoc.ocrResult.enhancedImage && (
                                  <div className="p-1.5 bg-slate-950 rounded-lg border border-slate-800">
                                    <img src={activeDoc.ocrResult.enhancedImage} alt="" className="max-h-36 rounded object-contain mx-auto" />
                                  </div>
                                )}

                                {activeDoc.isEditingManually ? (
                                  /* حقل التعديل اليدوي للنص المستخرج حديثاً */
                                  <textarea
                                    value={activeDoc.ocrResult.text}
                                    onChange={(e) => {
                                      const updatedText = e.target.value;
                                      updateQueueItem(activeDoc.id, {
                                        ocrResult: { ...activeDoc.ocrResult, text: updatedText }
                                      });
                                    }}
                                    className="w-full h-44 p-3 bg-slate-950 text-slate-100 text-base rounded-xl border border-blue-600 focus:ring-1 focus:ring-blue-500 focus:outline-none leading-loose font-serif text-right resize-none"
                                    style={{ fontFamily: "'Traditional Arabic', 'Amiri', 'Arial', sans-serif" }}
                                    dir="rtl"
                                    placeholder="اكتب أو عدّل النص المستخرج هنا يدوياً..."
                                  />
                                ) : (
                                  /* وضع العرض الفخم المعتاد */
                                  <div 
                                    className="text-slate-100 text-base leading-loose whitespace-pre-wrap font-serif text-right p-1 relative"
                                    style={{ fontFamily: "'Traditional Arabic', 'Amiri', 'Arial', sans-serif" }}
                                    dir="rtl"
                                  >
                                    {activeDoc.isRefining && (
                                      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center text-blue-400 gap-1 z-10">
                                        <Loader2 size={24} className="animate-spin text-blue-500" />
                                        <span className="text-[11px] text-white">جاري تنقيح وتصحيح النص وتطبيق المعالجات اللغوية...</span>
                                      </div>
                                    )}
                                    {activeDoc.ocrResult.text || 'لا يوجد نص مستخرج أو تم تفريغه كلياً.'}
                                  </div>
                                )}
                              </motion.div>
                            ) : (
                              <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-2.5 text-center p-4">
                                <p className="text-[11px] text-slate-400">
                                  {activeDoc.ocrEngine === 'python'
                                    ? '🖥️ معالجة محلية بالكامل تعتمد على الذكاء الاصطناعي ومعاجم لغوية أوفلاين.'
                                    : '⚡ قراءة ذكية مع تدقيق تلقائي فوري لأدق التفاصيل الكوفية والرقعية.'}
                                </p>
                                <button 
                                  onClick={() => processOCR(activeIdx)}
                                  className="px-5 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-500 shadow transition-all flex items-center gap-1.5 active:scale-95"
                                >
                                  <Sparkles size={14} />
                                  قراءة الوثيقة وسحب النص
                                </button>
                              </div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>

                    </div>

                    {/* أداة تنقيح وتعديل النص بالذكاء الاصطناعي */}
                    {activeDoc.ocrResult && !activeDoc.isProcessing && (
                      <motion.div 
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-4 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 rounded-2xl border border-blue-800/60 shadow-lg space-y-3 text-right"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <div className="p-2 bg-blue-600/30 text-blue-400 rounded-xl border border-blue-500/30">
                              <Wand2 size={16} className="text-amber-300" />
                            </div>
                            <div>
                              <h5 className="text-xs font-bold text-white flex items-center gap-1.5">
                                <span>أداة تنقيح وتدقيق النص الفوري</span>
                                {activeDoc.isRefined && (
                                  <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-[10px] font-bold rounded-full border border-emerald-500/40">
                                    تم التدقيق بنجاح
                                  </span>
                                )}
                              </h5>
                              <p className="text-[10px] text-slate-300 mt-0.5">
                                {activeDoc.isRefined && activeDoc.refinementMethod
                                  ? `طريقة المعالجة: ${activeDoc.refinementMethod}`
                                  : 'تصحّح الكلمات الملتصقة والأحرف المتباعدة تلقائياً بضغطة واحدة.'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center flex-wrap gap-1.5">
                            {activeDoc.isRefined && activeDoc.originalUnrefinedText && (
                              <button
                                onClick={handleUndoRefinement}
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium rounded-xl border border-slate-700 transition-colors"
                                title="التراجع إلى النص المستخرج الأصلي"
                              >
                                <RotateCcw size={12} />
                                <span>تراجع</span>
                              </button>
                            )}
                            <button
                              disabled={activeDoc.isRefining}
                              onClick={() => handleRefineText('offline')}
                              className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800/90 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold rounded-xl border border-slate-700 transition-all"
                            >
                              <Server size={12} className="text-blue-400" />
                              <span>تنقيح أوفلاين</span>
                            </button>

                            <button
                              disabled={activeDoc.isRefining}
                              onClick={handleOllamaRefine}
                              className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-900/80 hover:bg-indigo-850 text-indigo-100 text-[11px] font-bold rounded-xl border border-indigo-700/60 transition-all"
                            >
                              <Cpu size={12} className="text-amber-400" />
                              <span>🦙 Ollama أوفلاين</span>
                            </button>

                            <button
                              onClick={() => setShowOllamaSettings(!showOllamaSettings)}
                              className={`p-1.5 rounded-xl border transition-all ${showOllamaSettings ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-850 text-slate-400 border-slate-700'}`}
                            >
                              <Settings size={12} />
                            </button>

                            <button
                              disabled={activeDoc.isRefining}
                              onClick={() => handleRefineText('ai')}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-[11px] font-bold rounded-xl shadow border border-blue-400/30"
                            >
                              <Wand2 size={12} className="text-amber-300" />
                              <span>✨ تنقيح (Gemini)</span>
                            </button>
                          </div>
                        </div>

                        {/* إعدادات Ollama في حال التفعيل */}
                        <AnimatePresence>
                          {(showOllamaSettings || ollamaError) && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              className="overflow-hidden border-t border-slate-800/80 pt-3 space-y-3"
                            >
                              {ollamaError && (
                                <div className="p-2.5 bg-red-950/40 border border-red-850 rounded-xl text-red-200 text-xs">
                                  <p className="font-bold mb-1">⚠️ خطأ Ollama:</p>
                                  <p>{ollamaError}</p>
                                </div>
                              )}

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/40">
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-400 mb-1">اسم النموذج (Ollama Model):</label>
                                  <input 
                                    type="text"
                                    value={ollamaModel}
                                    onChange={(e) => handleOllamaModelChange(e.target.value)}
                                    className="w-full px-2.5 py-1 bg-slate-900 border border-slate-800 text-white rounded-lg text-xs"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-400 mb-1">رابط الخدمة (Ollama Host):</label>
                                  <input 
                                    type="text"
                                    value={ollamaHost}
                                    onChange={(e) => handleOllamaHostChange(e.target.value)}
                                    className="w-full px-2.5 py-1 bg-slate-900 border border-slate-800 text-white rounded-lg text-xs ltr"
                                  />
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    )}

                    {/* الباركود */}
                    <div className="flex flex-col items-center justify-center p-4 border border-slate-100 rounded-2xl bg-slate-50/50">
                      <Barcode value={activeDoc.barcodeValue} width={1.2} height={45} fontSize={11} />
                    </div>

                    {/* شريط الأزرار لحفظ المستندات */}
                    <div className="flex justify-between items-center pt-4 border-t border-slate-100">
                      <div className="text-xs text-slate-400 font-medium">
                        مستندات جاهزة للحفظ في الطابور: {queue.filter(q => q.ocrResult).length} من {queue.length}
                      </div>
                      <div className="flex gap-3">
                        <button
                          onClick={saveCurrentDocument}
                          disabled={!activeDoc.ocrResult || activeDoc.isProcessing}
                          className="px-6 py-2.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl font-bold text-xs transition-all disabled:opacity-50"
                        >
                          حفظ المستند الحالي فقط
                        </button>
                        <button
                          onClick={saveAllDocuments}
                          disabled={queue.length === 0}
                          className="px-8 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-xs shadow-md hover:bg-blue-700 transition-all flex items-center gap-1.5"
                        >
                          <Save size={14} />
                          حفظ جميع مستندات الطابور ({queue.length})
                        </button>
                      </div>
                    </div>

                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-400 py-20">
                    يرجى تحديد وثيقة من الطابور الأيمن لبدء قراءتها وتعديل نصوصها.
                  </div>
                )}
              </div>

            </div>
          )}
        </div>

      </div>
    </div>
  );
}
