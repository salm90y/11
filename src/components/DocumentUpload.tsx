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
  RotateCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Barcode from 'react-barcode';
import { Document, DocumentCategory } from '../types';
import { normalizeAndCorrectArabicText } from '../utils/arabicPostProcessor';

interface DocumentUploadProps {
  onUploadSuccess: (doc: Document) => void;
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
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrEngine, setOcrEngine] = useState<'gemini' | 'python'>('python');
  const [ocrResult, setOcrResult] = useState<{ 
    text: string; 
    category: string; 
    engine?: string;
    stages?: Array<{ stage: number; title: string; details: string }>;
    enhancedImage?: string;
  } | null>(null);
  const [showEnhancedPreview, setShowEnhancedPreview] = useState(false);
  const [docTitle, setDocTitle] = useState('');
  const [barcodeValue, setBarcodeValue] = useState('');
  const [progress, setProgress] = useState(0);
  const [copied, setCopied] = useState(false);

  // حالة أداة تنقيح وتعديل النص بالذكاء الاصطناعي
  const [isRefining, setIsRefining] = useState(false);
  const [isRefined, setIsRefined] = useState(false);
  const [refinementMethod, setRefinementMethod] = useState<string | null>(null);
  const [originalUnrefinedText, setOriginalUnrefinedText] = useState<string | null>(null);

  const handleRefineText = async (mode: 'ai' | 'offline' = 'ai') => {
    if (!ocrResult?.text) return;
    setIsRefining(true);
    try {
      if (!originalUnrefinedText) {
        setOriginalUnrefinedText(ocrResult.text);
      }

      const apiUrl = ocrEngine === 'python' && mode === 'offline' 
        ? 'http://127.0.0.1:5000/api/refine-text' 
        : '/api/refine-text';

      let res: Response;
      try {
        res = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: ocrResult.text,
            mode
          })
        });
      } catch (e) {
        res = await fetch('/api/refine-text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: ocrResult.text,
            mode
          })
        });
      }

      if (!res.ok) {
        throw new Error('فشل طلب تنقيح وتعديل النص');
      }

      const data = await res.json();
      if (data.success && data.text) {
        setOcrResult(prev => prev ? { ...prev, text: data.text } : null);
        setIsRefined(true);
        setRefinementMethod(data.method || (mode === 'ai' ? 'تنقيح بالذكاء الاصطناعي (Gemini)' : 'تنقيح لغوي مورفولوجي أوفلاين'));
      }
    } catch (err: any) {
      console.error('Refine error:', err);
      alert(`فشل تنقيح النص: ${err.message || 'حدث خطأ'}`);
    } finally {
      setIsRefining(false);
    }
  };

  const handleUndoRefinement = () => {
    if (originalUnrefinedText && ocrResult) {
      setOcrResult({ ...ocrResult, text: originalUnrefinedText });
      setIsRefined(false);
      setRefinementMethod(null);
    }
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const selectedFile = acceptedFiles[0];
    if (selectedFile) {
      setFile(selectedFile);
      const reader = new FileReader();
      reader.onload = () => {
        setPreview(reader.result as string);
        setBarcodeValue(`DMS-${Math.floor(100000 + Math.random() * 900000)}`);
      };
      reader.readAsDataURL(selectedFile);
      setDocTitle(selectedFile.name.split('.')[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpeg', '.jpg'],
      'image/png': ['.png'],
    },
    multiple: false
  } as any);

  const classifyText = (text: string): DocumentCategory => {
    for (const [category, keywords] of Object.entries(CLASSIFICATION_KEYWORDS)) {
      if (keywords.some(keyword => text.includes(keyword))) {
        return category as DocumentCategory;
      }
    }
    return DocumentCategory.OTHER;
  };

  const processOCR = async () => {
    if (!preview) return;
    setIsProcessing(true);
    setProgress(20);
    
    try {
      const base64Data = preview.split(',')[1];
      let apiUrl = ocrEngine === 'python' ? 'http://127.0.0.1:5000/api/ocr' : '/api/ocr';

      setProgress(40);
      let response: Response;
      let usedEngineName = ocrEngine === 'gemini' ? 'Gemini Vision AI + القاموس العربي' : 'سيرفر بايثون المحلي';

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

        if (!response.ok && ocrEngine === 'python') {
          throw new Error('Python server error');
        }
      } catch (err) {
        // إذا فشل الاتصال بسيرفر بايثون المحلي، التحول التلقائي للمحرك المتقدم
        if (ocrEngine === 'python') {
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

      setProgress(85);
      const data = await response.json();
      
      const rawText = data.text || '';
      // معالجة القاموس والتصحيح العربي المحلي
      const correctedText = normalizeAndCorrectArabicText(rawText);
      const finalEngine = data.engine || usedEngineName;
      const stages = data.stages || [];
      const enhancedImage = data.enhanced_image || null;
      
      setProgress(100);
      
      const category = classifyText(correctedText);
      setOcrResult({ 
        text: correctedText, 
        category, 
        engine: finalEngine,
        stages,
        enhancedImage
      });
    } catch (error: any) {
      console.error('OCR Error:', error);
      alert(`حدث خطأ أثناء معالجة المستند:\n${error.message || 'خطأ غير معروف'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopy = () => {
    if (ocrResult?.text) {
      navigator.clipboard.writeText(ocrResult.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const saveDocument = async () => {
    if (!file || !preview) return;
    
    const newDoc: Document = {
      id: Math.random().toString(36).substr(2, 9),
      title: docTitle,
      category: (ocrResult?.category as DocumentCategory) || DocumentCategory.OTHER,
      uploadDate: new Date().toISOString(),
      fileType: file.type.includes('pdf') ? 'pdf' : 'image',
      uploaderId: '1',
      uploaderName: 'مدير النظام',
      barcode: barcodeValue,
      originalFileName: file.name,
      extractedText: ocrResult?.text || '',
      fileData: preview
    };

    try {
      const response = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newDoc)
      });
      if (response.ok) {
        onUploadSuccess(newDoc);
        reset();
      }
    } catch (error) {
      console.error('Save Error:', error);
    }
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setOcrResult(null);
    setDocTitle('');
    setBarcodeValue('');
    setIsRefined(false);
    setRefinementMethod(null);
    setOriginalUnrefinedText(null);
  };

  return (
    <div className="max-w-4xl mx-auto p-1" dir="rtl">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
        <div className="p-8 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <Upload className="text-blue-600" />
            أرشفة مستند جديد
          </h2>
          <p className="text-slate-500 mt-2">قم برفع الصور أو ملفات PDF لبدء عملية الأرشفة الذكية</p>
        </div>

        <div className="p-8">
          {!file ? (
            <div 
              {...getRootProps()} 
              className={`
                border-3 border-dashed rounded-3xl p-16 text-center transition-all duration-300 cursor-pointer
                ${isDragActive ? 'border-blue-500 bg-blue-50 scale-[1.02]' : 'border-slate-200 hover:border-blue-400 hover:bg-slate-50'}
              `}
            >
              <input {...getInputProps()} />
              <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6 text-blue-600">
                <Upload size={32} />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">اسحب الملف هنا</h3>
              <p className="text-slate-500">أو اضغط لاختيار ملف من جهازك</p>
              <div className="mt-6 flex justify-center gap-4 text-xs font-medium text-slate-400">
                <span className="px-3 py-1 bg-slate-100 rounded-full">JPG / PNG</span>
                <span className="px-3 py-1 bg-slate-100 rounded-full">PDF</span>
                <span className="px-3 py-1 bg-slate-100 rounded-full">Max 10MB</span>
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              <div className="flex items-center gap-6 p-6 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="w-16 h-16 bg-white rounded-xl shadow-sm flex items-center justify-center text-blue-600">
                  <File size={32} />
                </div>
                <div className="flex-1">
                  <input 
                    type="text" 
                    value={docTitle} 
                    onChange={(e) => setDocTitle(e.target.value)}
                    className="text-lg font-bold text-slate-900 bg-transparent border-none focus:ring-0 w-full p-0"
                    placeholder="عنوان المستند..."
                  />
                  <p className="text-sm text-slate-400">{file.name} • {(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
                <button onClick={reset} className="p-2 hover:bg-white rounded-full text-slate-400 hover:text-red-500 transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-900 flex items-center gap-2">
                      <Type size={18} className="text-blue-500" />
                      استخراج النصوص (OCR)
                    </h4>
                    {ocrResult && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleCopy}
                          className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 rounded-lg transition-colors shadow-sm"
                          title="نسخ النص المفرغ"
                        >
                          {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                          <span>{copied ? 'تم النسخ!' : 'نسخ النص'}</span>
                        </button>
                        <button
                          onClick={() => {
                            const blob = new Blob([ocrResult.text], { type: 'text/plain;charset=utf-8' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `${docTitle || 'document'}_arabic_text.txt`;
                            a.click();
                          }}
                          className="flex items-center gap-1.5 px-3 py-1 bg-blue-600 hover:bg-blue-500 text-xs text-white font-medium rounded-lg transition-colors shadow-sm"
                          title="تنزيل كملف نصي للوورد"
                        >
                          <span>تحميل للوورد (Word TXT)</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* اختيار محرك المعالجة */}
                  <div className="bg-slate-100 p-1 rounded-xl flex gap-1 border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setOcrEngine('python')}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                        ocrEngine === 'python'
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                      }`}
                    >
                      <Server size={14} />
                      <span>سيرفر بايثون (Offline 100%)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setOcrEngine('gemini')}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                        ocrEngine === 'gemini'
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                      }`}
                    >
                      <Sparkles size={14} />
                      <span>الذكاء الاصطناعي أونلاين (99.9%)</span>
                    </button>
                  </div>

                  {/* صندوق استعراض النص المفرغ بخط الوورد العربي */}
                  <div className="h-72 bg-slate-900 rounded-2xl p-4 overflow-y-auto relative group border border-slate-800">
                    <AnimatePresence mode="wait">
                      {isProcessing ? (
                        <motion.div 
                          key="loading"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="absolute inset-0 flex flex-col items-center justify-center text-blue-400 gap-4 bg-slate-900/90 backdrop-blur-sm p-4 text-center"
                        >
                          <Loader2 className="animate-spin" size={32} />
                          <p className="text-sm font-semibold">
                            {ocrEngine === 'gemini'
                              ? 'جاري استخراج النصوص بالذكاء الاصطناعي الفائق...'
                              : 'جاري معالجة الصورة بـ OpenCV وتنقية الخطوط أوفلاين...'}
                          </p>
                          <div className="w-48 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-blue-500 transition-all duration-300" 
                              style={{ width: `${progress}%` }} 
                            />
                          </div>
                        </motion.div>
                      ) : ocrResult ? (
                        <motion.div
                          key="result"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="space-y-3"
                        >
                          {ocrResult.engine && (
                            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                              <span className="px-2.5 py-0.5 bg-blue-950 text-blue-300 text-[11px] font-semibold rounded-md border border-blue-800/50">
                                المحرك: {ocrResult.engine}
                              </span>
                              {ocrResult.enhancedImage && (
                                <button
                                  onClick={() => setShowEnhancedPreview(!showEnhancedPreview)}
                                  className="text-[11px] px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition-colors"
                                >
                                  {showEnhancedPreview ? 'إخفاء المعاينة المحسنة' : 'معاينة الصورة المعدلة 2.5x (أبيض وأسود)'}
                                </button>
                              )}
                            </div>
                          )}

                          {showEnhancedPreview && ocrResult.enhancedImage && (
                            <div className="p-2 bg-slate-950 rounded-xl border border-slate-800">
                              <p className="text-[10px] text-blue-400 mb-1 font-bold">صورة الوثيقة بعد التكبير 2.5x وتعديل الميلان والتباين (High-Contrast Binarization):</p>
                              <img src={ocrResult.enhancedImage} alt="Enhanced" className="max-h-48 rounded border border-slate-700 object-contain mx-auto" />
                            </div>
                          )}

                          {/* عرض مراحل الذكاء الاصطناعي الأوفلاين الأربعة */}
                          {ocrResult.stages && ocrResult.stages.length > 0 && (
                            <div className="p-2.5 bg-slate-950/80 rounded-xl border border-blue-900/40 text-right space-y-2">
                              <div className="flex items-center gap-1.5 text-blue-400 font-bold text-xs">
                                <Sparkles size={13} />
                                <span>مراحل معالجة الذكاء الاصطناعي الأوفلاين المكتملة (4 Stages):</span>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 text-[10px]">
                                {ocrResult.stages.map((stg) => (
                                  <div key={stg.stage} className="bg-slate-900/90 p-2 rounded-lg border border-slate-800/80">
                                    <span className="font-bold text-blue-300 block mb-0.5">{stg.title}</span>
                                    <span className="text-slate-400 leading-tight block">{stg.details}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <div 
                            className="text-slate-100 text-base leading-loose whitespace-pre-wrap font-serif tracking-normal text-right p-2 bg-slate-950/60 rounded-xl border border-slate-800/80 relative"
                            style={{ fontFamily: "'Traditional Arabic', 'Amiri', 'Arial', sans-serif" }}
                            dir="rtl"
                          >
                            {isRefining && (
                              <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center text-blue-400 gap-2 z-10">
                                <Loader2 size={28} className="animate-spin text-blue-500" />
                                <span className="text-xs font-bold text-white">جاري تنقيح وتعديل النص بالذكاء الاصطناعي وتصحيح الكشيدة والأسماء...</span>
                              </div>
                            )}
                            {ocrResult.text}
                          </div>
                        </motion.div>
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-3 text-center p-4">
                          <p className="text-xs text-slate-400">
                            {ocrEngine === 'python'
                              ? '🖥️ معالجة حاسوبية متقدمة (OpenCV) لتوضيح الحروف وتعديل الميلان وتصحيح العبارات الرسمية.'
                              : '⚡ محرك أونلاين يستخرج الكتاب الرسمي بدقة 99.9%.'}
                          </p>
                          <button 
                            onClick={processOCR}
                            className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-500 shadow-md transition-all flex items-center gap-2 active:scale-95"
                          >
                            <Sparkles size={16} />
                            بدء القراءة واستخراج النص
                          </button>
                        </div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* شريط زر تنقيح وتعديل النص بالذكاء الاصطناعي (يظهر بعد استخراج النص بالكامل) */}
                  {ocrResult && !isProcessing && (
                    <motion.div 
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-3 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 rounded-2xl border border-blue-800/60 shadow-lg space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="p-2 bg-blue-600/30 text-blue-400 rounded-xl border border-blue-500/30 shadow-inner">
                            <Wand2 size={18} className="animate-pulse text-amber-300" />
                          </div>
                          <div>
                            <h5 className="text-xs font-bold text-white flex items-center gap-1.5">
                              <span>أداة تنقيح وتعديل النص بالذكاء الاصطناعي</span>
                              {isRefined && (
                                <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-[10px] font-bold rounded-full border border-emerald-500/40 flex items-center gap-1">
                                  <CheckCircle2 size={11} /> تم تنقيح وتعديل النص بنجاح
                                </span>
                              )}
                            </h5>
                            <p className="text-[11px] text-slate-300 mt-0.5">
                              {isRefined && refinementMethod
                                ? `طريقة المعالجة والتنقيح: ${refinementMethod}`
                                : 'تصحّح أخطاء مد الحروف (سس)، الكلمات الملتصقة، الحروف المفككة، والأسماء المكتوبة بالخط الرقعي/الإداري.'}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {isRefined && originalUnrefinedText && (
                            <button
                              onClick={handleUndoRefinement}
                              className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl border border-slate-700 transition-colors shadow-sm"
                              title="التراجع إلى النص المستخرج الأصلي"
                            >
                              <RotateCcw size={13} />
                              <span>تراجع للأصلي</span>
                            </button>
                          )}
                          <button
                            disabled={isRefining}
                            onClick={() => handleRefineText('offline')}
                            className="flex items-center gap-1 px-3 py-1.5 bg-slate-800/90 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition-all shadow-sm disabled:opacity-50"
                            title="تنقيح سريع بدون إنترنت باستخدام المعجم المورفولوجي والقانوني المحلي"
                          >
                            <Server size={13} className="text-blue-400" />
                            <span>تنقيح أوفلاين</span>
                          </button>
                          <button
                            disabled={isRefining}
                            onClick={() => handleRefineText('ai')}
                            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl shadow-md hover:shadow-blue-500/25 transition-all active:scale-95 disabled:opacity-50 border border-blue-400/30"
                          >
                            {isRefining ? (
                              <Loader2 size={15} className="animate-spin" />
                            ) : (
                              <Wand2 size={15} className="text-amber-300" />
                            )}
                            <span>✨ تنقيح وتعديل النص بالذكاء الاصطناعي</span>
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>

                <div className="space-y-4 text-center flex flex-col items-center justify-center border border-slate-100 rounded-2xl p-6 bg-slate-50/30">
                  <h4 className="font-bold text-slate-900 flex items-center gap-2 w-full">
                    <BarcodeIcon size={18} className="text-blue-500" />
                    الباركود المولد
                  </h4>
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-inner inline-block">
                    <Barcode 
                      value={barcodeValue} 
                      width={1.5} 
                      height={60} 
                      fontSize={14}
                      background="#ffffff"
                    />
                  </div>
                  <p className="text-xs text-slate-400 mt-2">سيتم طباعة هذا الكود على ملصق الأرشفة</p>
                </div>
              </div>

              <div className="flex justify-end gap-4 pt-4">
                <button 
                  onClick={reset}
                  className="px-8 py-3 rounded-2xl text-slate-500 font-bold hover:bg-slate-100 transition-colors"
                >
                  إلغاء
                </button>
                <button 
                  disabled={isProcessing}
                  onClick={saveDocument}
                  className="px-10 py-3 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-900/20 hover:bg-blue-700 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  <Save size={20} />
                  حفظ في الأرشيف
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
