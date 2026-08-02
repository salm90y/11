/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  FolderSync, 
  Download, 
  FolderCheck, 
  FolderHeart,
  Computer, 
  HelpCircle, 
  CheckCircle2, 
  XCircle,
  FolderPlus,
  ArrowDownToLine,
  RefreshCw,
  Info
} from 'lucide-react';
import { motion } from 'motion/react';
import { Document } from '../types';
import { saveDocToLocalHandle, downloadStructuredZip } from '../utils/pcArchive';

interface PCSettingsProps {
  documents: Document[];
  pcDirectoryHandle: any | null;
  setPcDirectoryHandle: (handle: any | null) => void;
}

export default function PCSettings({ documents, pcDirectoryHandle, setPcDirectoryHandle }: PCSettingsProps) {
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'failed'>('idle');
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncMessage, setSyncMessage] = useState('');
  
  const [zipStatus, setZipStatus] = useState<'idle' | 'loading' | 'success'>('idle');
  const [zipProgress, setZipProgress] = useState(0);

  const handleSelectFolder = async () => {
    try {
      if (!('showDirectoryPicker' in window)) {
        alert(
          "متصفحك لا يدعم الربط المباشر مع مجلدات نظام التشغيل بالكامل.\n\n" +
          "يرجى استخدام متصفح Google Chrome أو Microsoft Edge على الحاسبة الشخصية.\n" +
          "كحل بديل فائق السهولة، يمكنك استخدام خيار 'تنزيل أرشيف الحاسبة كملف ZIP مضغوط' بالأسفل وسيولد لك نفس هيكلية المجلدات تلقائياً!"
        );
        return;
      }

      // @ts-ignore
      const handle = await window.showDirectoryPicker({
        mode: 'readwrite'
      });
      setPcDirectoryHandle(handle);
      setSyncMessage(`تم ربط مجلد الحاسبة [${handle.name}] بنجاح! 🟢 يمكنك الآن المزامنة مباشرة.`);
    } catch (e: any) {
      console.error("Directory picker error:", e);
      if (e.name !== 'AbortError') {
        alert("حدث خطأ أثناء محاولة اختيار المجلد. يرجى التأكد من إعطاء الصلاحيات اللازمة.");
      }
    }
  };

  const handleSyncAllToLocalFolder = async () => {
    if (!pcDirectoryHandle) {
      alert("الرجاء تحديد وربط مجلد الحاسبة أولاً.");
      return;
    }

    if (documents.length === 0) {
      alert("لا توجد مستندات مؤرشفة حالياً لمزامنتها.");
      return;
    }

    setSyncStatus('syncing');
    setSyncProgress(0);
    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < documents.length; i++) {
      try {
        const doc = documents[i];
        await saveDocToLocalHandle(doc, pcDirectoryHandle);
        successCount++;
      } catch (e) {
        console.error("Error syncing doc:", e);
        failedCount++;
      }
      setSyncProgress(Math.round(((i + 1) / documents.length) * 100));
    }

    if (failedCount === 0) {
      setSyncStatus('success');
      setSyncMessage(`تمت المزامنة بنجاح! تم حفظ عدد (${successCount}) وثيقة داخل مجلد الحاسبة [${pcDirectoryHandle.name}] موزعة تلقائياً حسب تصنيف كل كتاب.`);
    } else {
      setSyncStatus('failed');
      setSyncMessage(`اكتملت المزامنة مع وجود أخطاء. تم حفظ (${successCount}) وفشل (${failedCount}) وثيقة. يرجى التأكد من صلاحيات المجلد.`);
    }
  };

  const handleDownloadStructuredZip = async () => {
    setZipStatus('loading');
    setZipProgress(0);
    try {
      await downloadStructuredZip(documents, (progress) => {
        setZipProgress(progress);
      });
      setZipStatus('success');
      setTimeout(() => setZipStatus('idle'), 4000);
    } catch (e) {
      console.error(e);
      alert("حدث خطأ أثناء توليد ملف ZIP.");
      setZipStatus('idle');
    }
  };

  return (
    <div className="space-y-8" dir="rtl">
      {/* Intro Banner */}
      <div className="bg-gradient-to-l from-blue-600 to-indigo-700 p-8 rounded-[2rem] text-white shadow-xl relative overflow-hidden">
        {/* Background Decorative Patterns */}
        <div className="absolute -left-16 -bottom-16 w-64 h-64 rounded-full bg-white/5 blur-3xl pointer-events-none" />
        <div className="absolute right-1/4 -top-12 w-48 h-48 rounded-full bg-white/5 blur-2xl pointer-events-none" />

        <div className="max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 bg-white/10 px-3.5 py-1.5 rounded-full text-xs font-extrabold backdrop-blur-md">
            <Computer size={14} />
            <span>ربط وتصدير الأرشيف للحاسبة الشخصية 💻</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">الأرشفة الذكية ومجلدات الكمبيوتر المحلي</h1>
          <p className="text-blue-100 text-sm leading-relaxed font-medium">
            يقدم النظام طريقتين مذهلتين لحفظ وثائقك وتصنيفها مباشرة داخل حاسبتك الشخصية: 
            سواء من خلال <strong>الربط المباشر الذكي</strong> بمجلد من اختيارك، أو من خلال <strong>تنزيل ملف الأرشيف المهيكل بنقرة واحدة (ZIP)</strong> والذي يقوم تلقائياً بإنشاء مجلد رئيسي باسم "الأرشيف الإلكتروني" ومجلدات فرعية حسب تصنيف كل كتاب.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Right side: Method 1 - Direct Local Sync */}
        <div className="lg:col-span-7 bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm space-y-6 flex flex-col justify-between">
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                <FolderSync size={24} />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">الطريقة الأولى: الربط والمزامنة المباشرة مع الحاسبة</h3>
                <p className="text-xs text-slate-400 font-bold">حفظ تلقائي وفوري ومباشر إلى مجلد الأرشيف في جهازك</p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl space-y-3.5">
              <div className="flex items-center justify-between border-b border-slate-200/50 pb-3">
                <span className="text-xs font-bold text-slate-500">حالة الارتباط بمجلد الحاسبة:</span>
                {pcDirectoryHandle ? (
                  <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 text-xs font-bold px-3 py-1 rounded-full border border-emerald-100">
                    <CheckCircle2 size={14} />
                    متصل بمجلد [{pcDirectoryHandle.name}]
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 text-xs font-bold px-3 py-1 rounded-full border border-amber-100">
                    <XCircle size={14} />
                    غير مرتبط حالياً
                  </span>
                )}
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-extrabold text-slate-700">كيف تعمل هذه الطريقة؟</h4>
                <ul className="text-[11px] text-slate-500 space-y-1.5 list-disc list-inside font-medium leading-relaxed pr-2">
                  <li>قم بإنشاء مجلد في حاسبتك الشخصية وسمّه <strong className="text-slate-800">الأرشيف الإلكتروني</strong>.</li>
                  <li>انقر على زر "ربط وتحديد المجلد" بالأسفل واختر المجلد الذي أنشأته.</li>
                  <li>وافق على منح متصفحك صلاحية التعديل على المجلد لحفظ الملفات بداخله.</li>
                  <li>عند النقر على "مزامنة الآن"، سيقوم النظام بإنشاء مجلدات فرعية تلقائياً (مثل: عقوبات، شكر وتقدير، إجازات...) وحفظ كل كتاب باسمه ورقمه المستخرج داخل المجلد المناسب!</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-slate-100">
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleSelectFolder}
                className="flex-1 px-5 py-3.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold rounded-xl transition-all flex items-center justify-center gap-2 shadow-md shadow-slate-900/10"
              >
                <FolderPlus size={16} />
                <span>{pcDirectoryHandle ? "تغيير المجلد المرتبط 💻" : "ربط وتحديد المجلد بالحاسبة 💻"}</span>
              </button>

              <button
                onClick={handleSyncAllToLocalFolder}
                disabled={!pcDirectoryHandle || syncStatus === 'syncing'}
                className={`flex-1 px-5 py-3.5 text-white text-xs font-extrabold rounded-xl transition-all flex items-center justify-center gap-2 shadow-md ${
                  pcDirectoryHandle 
                    ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-500/20 cursor-pointer' 
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                }`}
              >
                {syncStatus === 'syncing' ? (
                  <RefreshCw size={16} className="animate-spin" />
                ) : (
                  <FolderSync size={16} />
                )}
                <span>مزامنة وحفظ الكل بالحاسبة ⚡</span>
              </button>
            </div>

            {/* Sync Progress Bar */}
            {syncStatus === 'syncing' && (
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs font-extrabold text-slate-600">
                  <span>جاري المزامنة مع المجلد المحلي...</span>
                  <span>{syncProgress}%</span>
                </div>
                <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-600 transition-all duration-300" 
                    style={{ width: `${syncProgress}%` }}
                  />
                </div>
              </div>
            )}

            {syncMessage && (
              <p className={`text-xs font-bold text-center p-3 rounded-xl border ${
                syncStatus === 'success' 
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                  : syncStatus === 'failed'
                  ? 'bg-red-50 text-red-700 border-red-100'
                  : 'bg-blue-50 text-blue-700 border-blue-100'
              }`}>
                {syncMessage}
              </p>
            )}
          </div>
        </div>

        {/* Left side: Method 2 - ZIP Export */}
        <div className="lg:col-span-5 bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm space-y-6 flex flex-col justify-between">
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
                <FolderHeart size={24} />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">الطريقة الثانية: تحميل الأرشيف كملف ZIP مهيكل</h3>
                <p className="text-xs text-slate-400 font-bold">بسيطة، سريعة، وتعمل على جميع الحواسب والمتصفحات</p>
              </div>
            </div>

            <div className="p-4 bg-indigo-50/20 border border-indigo-100/50 rounded-2xl space-y-3.5 text-right">
              <div className="flex items-center gap-1.5 text-xs text-indigo-700 font-extrabold">
                <Info size={16} />
                <span>كيفية الاستخدام:</span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                هذا الخيار آمن ومضمون بنسبة 100%. عند النقر على الزر، سيقوم النظام فوراً بضغط كافة الملفات والأوراق مؤرشفة وتجهيزها في ملف واحد مضغوط.
                <br /><br />
                بمجرد فك ضغط الملف على حاسبتك، ستجد مجلداً رئيسياً باسم <strong className="text-slate-800">الأرشيف الإلكتروني</strong>، وبداخله المجلدات الفرعية مصنفة جاهزة وبها الكتب الرسمية.
              </p>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-slate-100">
            <button
              onClick={handleDownloadStructuredZip}
              disabled={zipStatus === 'loading' || documents.length === 0}
              className={`w-full px-5 py-3.5 text-white text-xs font-extrabold rounded-xl transition-all flex items-center justify-center gap-2 shadow-md ${
                documents.length > 0 
                  ? 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-500/20 cursor-pointer' 
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
              }`}
            >
              {zipStatus === 'loading' ? (
                <RefreshCw size={16} className="animate-spin" />
              ) : (
                <ArrowDownToLine size={16} />
              )}
              <span>تنزيل كامل الأرشيف الهيكلي (ZIP) 📥</span>
            </button>

            {zipStatus === 'loading' && (
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs font-extrabold text-slate-600">
                  <span>جاري ضغط وترتيب الأرشيف...</span>
                  <span>{zipProgress}%</span>
                </div>
                <div className="h-2 bg-indigo-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-indigo-600 transition-all duration-300" 
                    style={{ width: `${zipProgress}%` }}
                  />
                </div>
              </div>
            )}

            {zipStatus === 'success' && (
              <p className="text-xs font-bold text-center p-3 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-xl">
                تم تحميل ملف الأرشيف بنجاح! يمكنك فك الضغط عنه على حاسبتك الشخصية الآن والاستمتاع بالتصنيف المنظم. 🎉
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
