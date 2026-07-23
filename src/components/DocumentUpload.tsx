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
  Type
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Barcode from 'react-barcode';
import { Document, DocumentCategory } from '../types';

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
  const [ocrResult, setOcrResult] = useState<{ text: string, category: string } | null>(null);
  const [docTitle, setDocTitle] = useState('');
  const [barcodeValue, setBarcodeValue] = useState('');
  const [progress, setProgress] = useState(0);

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
    setProgress(10);
    
    try {
      // إرسال الصورة للسيرفر المحلي (PaddleOCR)
      const base64Data = preview.split(',')[1];
      const response = await fetch('http://127.0.0.1:5000/api/ocr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image_base64: base64Data,
          image: base64Data,       // احتياطاً
          fileData: base64Data     // احتياطاً
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server error: ${response.status} - ${errorText}`);
      }

      setProgress(90);
      const data = await response.json();
      
      const text = data.text || '';
      setProgress(100);
      
      const category = classifyText(text);
      setOcrResult({ text, category });
    } catch (error) {
      console.error('PaddleOCR Error:', error);
      alert(`حدث خطأ أثناء الاتصال بسيرفر PaddleOCR:\n${error instanceof Error ? error.message : 'خطأ غير معروف'}`);
    } finally {
      setIsProcessing(false);
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
                  <h4 className="font-bold text-slate-900 flex items-center gap-2">
                    <Type size={18} className="text-blue-500" />
                    استخراج النصوص (OCR)
                  </h4>
                  <div className="h-64 bg-slate-900 rounded-2xl p-4 overflow-y-auto relative group">
                    <AnimatePresence mode="wait">
                      {isProcessing ? (
                        <motion.div 
                          key="loading"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="absolute inset-0 flex flex-col items-center justify-center text-blue-400 gap-4 bg-slate-900/50 backdrop-blur-sm"
                        >
                          <Loader2 className="animate-spin" size={32} />
                          <p className="text-sm">جاري المعالجة محلياً (Offline OCR)... {progress}%</p>
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
                          className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap"
                        >
                          {ocrResult.text}
                        </motion.div>
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-4">
                          <p className="text-sm">اضغط على الزر لبدء استخراج النصوص ذكياً</p>
                          <button 
                            onClick={processOCR}
                            className="px-6 py-2 bg-blue-600 text-white rounded-full text-sm font-bold hover:bg-blue-500 transition-colors"
                          >
                            بدء المعالجة الذكية
                          </button>
                        </div>
                      )}
                    </AnimatePresence>
                  </div>
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
