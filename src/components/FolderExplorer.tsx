/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Folder, 
  FolderOpen, 
  ChevronLeft, 
  ChevronRight, 
  FileText, 
  Search, 
  Trash2, 
  Eye, 
  ArrowRight, 
  Calendar, 
  Tag, 
  Building2,
  Database,
  Grid,
  Layers
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Document, DocumentCategory } from '../types';

interface FolderExplorerProps {
  documents: Document[];
  onView: (doc: Document) => void;
  onDelete: (id: string) => void;
}

export default function FolderExplorer({ documents, onView, onDelete }: FolderExplorerProps) {
  const [currentPath, setCurrentPath] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<'authority' | 'year'>('authority');
  const [searchTerm, setSearchTerm] = useState('');

  // Helper to extract year from document
  const getDocYear = (doc: Document): string => {
    if (doc.letterDate) {
      const match = doc.letterDate.match(/\b(19|20)\d{2}\b/);
      if (match) return `سنة ${match[0]}`;
    }
    try {
      const date = new Date(doc.uploadDate);
      if (!isNaN(date.getTime())) {
        return `سنة ${date.getFullYear()}`;
      }
    } catch (e) {}
    return 'سنة غير محددة';
  };

  // Helper to get Main Folder value for a document
  const getMainFolderValue = (doc: Document): string => {
    if (groupBy === 'authority') {
      return doc.issuingAuthority?.trim() || 'جهة إصدار غير محددة';
    } else {
      return getDocYear(doc);
    }
  };

  // 1. Root Level: Grouping by Issuing Authority or Year
  const getMainFolders = () => {
    const foldersMap: Record<string, { name: string; filesCount: number; subfoldersCount: Set<string> }> = {};
    
    documents.forEach(doc => {
      const mainFolder = getMainFolderValue(doc);
      const subFolder = doc.category || 'أخرى';
      
      if (!foldersMap[mainFolder]) {
        foldersMap[mainFolder] = {
          name: mainFolder,
          filesCount: 0,
          subfoldersCount: new Set<string>()
        };
      }
      
      foldersMap[mainFolder].filesCount += 1;
      foldersMap[mainFolder].subfoldersCount.add(subFolder);
    });

    return Object.values(foldersMap).sort((a, b) => b.filesCount - a.filesCount);
  };

  // 2. Subfolder Level: Grouping documents in a specific Main Folder by Category
  const getSubfolders = (mainFolder: string) => {
    const foldersMap: Record<string, { name: string; filesCount: number; docs: Document[] }> = {};
    
    const filteredDocs = documents.filter(doc => getMainFolderValue(doc) === mainFolder);
    
    filteredDocs.forEach(doc => {
      const subFolder = doc.category || 'أخرى';
      
      if (!foldersMap[subFolder]) {
        foldersMap[subFolder] = {
          name: subFolder,
          filesCount: 0,
          docs: []
        };
      }
      
      foldersMap[subFolder].filesCount += 1;
      foldersMap[subFolder].docs.push(doc);
    });

    return Object.values(foldersMap).sort((a, b) => b.filesCount - a.filesCount);
  };

  // 3. Document Level: Files inside a Main Folder & Subfolder
  const getFiles = (mainFolder: string, subFolder: string) => {
    return documents.filter(doc => {
      const matchesMain = getMainFolderValue(doc) === mainFolder;
      const matchesSub = (doc.category || 'أخرى') === subFolder;
      const matchesSearch = searchTerm === '' || 
        doc.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
        (doc.letterNumber && doc.letterNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
        doc.extractedText.toLowerCase().includes(searchTerm.toLowerCase());
      
      return matchesMain && matchesSub && matchesSearch;
    });
  };

  const handleFolderClick = (folderName: string) => {
    setCurrentPath([...currentPath, folderName]);
  };

  const navigateBack = () => {
    if (currentPath.length > 0) {
      setCurrentPath(currentPath.slice(0, -1));
    }
  };

  const navigateToLevel = (index: number) => {
    if (index === -1) {
      setCurrentPath([]);
    } else {
      setCurrentPath(currentPath.slice(0, index + 1));
    }
  };

  const isRoot = currentPath.length === 0;
  const isSubfolderLevel = currentPath.length === 1;
  const isFileLevel = currentPath.length === 2;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Folder Header Options & Navigation */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        {/* Breadcrumbs */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-2 md:pb-0 text-sm font-bold text-slate-800">
          <button 
            onClick={() => navigateToLevel(-1)}
            className={`px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors flex items-center gap-1.5 ${isRoot ? 'text-blue-600 bg-blue-50' : 'text-slate-500'}`}
          >
            <Database size={16} />
            <span>الأرشيف المجلد الرئيسي</span>
          </button>

          {currentPath.map((folder, idx) => (
            <React.Fragment key={idx}>
              <ChevronLeft size={16} className="text-slate-400 shrink-0" />
              <button
                onClick={() => navigateToLevel(idx)}
                className={`px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors shrink-0 max-w-xs truncate ${
                  idx === currentPath.length - 1 ? 'text-blue-600 bg-blue-50' : 'text-slate-500'
                }`}
              >
                {folder}
              </button>
            </React.Fragment>
          ))}
        </div>

        {/* Level Controls */}
        <div className="flex gap-4 w-full md:w-auto shrink-0 justify-end">
          {/* Quick Search for files */}
          {isFileLevel && (
            <div className="relative w-full md:w-64">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="text" 
                placeholder="البحث في هذا المجلد..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pr-9 pl-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-xs"
              />
            </div>
          )}

          {/* Grouping switcher (only at root) */}
          {isRoot && (
            <div className="bg-slate-100 p-1 rounded-xl flex border border-slate-200 text-xs font-bold w-full md:w-auto">
              <button
                onClick={() => setGroupBy('authority')}
                className={`px-4 py-2 rounded-lg transition-all flex items-center gap-1.5 ${groupBy === 'authority' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              >
                <Building2 size={14} />
                <span>تبويب بجهة الإصدار</span>
              </button>
              <button
                onClick={() => setGroupBy('year')}
                className={`px-4 py-2 rounded-lg transition-all flex items-center gap-1.5 ${groupBy === 'year' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              >
                <Calendar size={14} />
                <span>تبويب بالسنة</span>
              </button>
            </div>
          )}

          {!isRoot && (
            <button
              onClick={navigateBack}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors"
            >
              <ArrowRight size={14} />
              <span>رجوع للخلف</span>
            </button>
          )}
        </div>
      </div>

      {/* Explorer Content view */}
      <AnimatePresence mode="wait">
        {/* 1. Root Level View */}
        {isRoot && (
          <motion.div
            key="root-folders"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6"
          >
            {getMainFolders().map((folder, i) => (
              <motion.div
                key={folder.name}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => handleFolderClick(folder.name)}
                className="group bg-white p-6 rounded-3xl border border-slate-200 hover:border-blue-400 hover:shadow-xl transition-all duration-300 cursor-pointer flex flex-col justify-between h-44 relative overflow-hidden"
              >
                {/* Visual decoration element */}
                <div className="absolute top-0 left-0 w-2 h-full bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />

                <div className="flex justify-between items-start">
                  <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-all duration-300 shadow-sm">
                    <Folder size={28} />
                  </div>
                  <span className="text-[11px] font-bold text-slate-400 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100">
                    {folder.filesCount} وثيقة
                  </span>
                </div>

                <div className="mt-4 space-y-1">
                  <h4 className="font-extrabold text-slate-800 group-hover:text-blue-600 transition-colors text-sm line-clamp-1">
                    {folder.name}
                  </h4>
                  <p className="text-[11px] text-slate-400 font-bold flex items-center gap-1">
                    <Layers size={11} />
                    <span>{folder.subfoldersCount.size} مجلدات فرعية (أصناف)</span>
                  </p>
                </div>
              </motion.div>
            ))}

            {getMainFolders().length === 0 && (
              <div className="col-span-full bg-white p-20 rounded-3xl border border-slate-100 text-center space-y-4">
                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto text-slate-300">
                  <Folder size={40} />
                </div>
                <h3 className="text-xl font-bold text-slate-400">لا توجد مجلدات مؤرشفة حالياً</h3>
                <p className="text-slate-400">قم بأرشفة كتب ومستندات جديدة لتظهر هنا تلقائياً.</p>
              </div>
            )}
          </motion.div>
        )}

        {/* 2. Subfolder Level View */}
        {isSubfolderLevel && (
          <motion.div
            key="sub-folders"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6"
          >
            {getSubfolders(currentPath[0]).map((folder, i) => (
              <motion.div
                key={folder.name}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => handleFolderClick(folder.name)}
                className="group bg-white p-6 rounded-3xl border border-slate-200 hover:border-indigo-400 hover:shadow-xl transition-all duration-300 cursor-pointer flex flex-col justify-between h-44 relative overflow-hidden"
              >
                {/* Visual decoration element */}
                <div className="absolute top-0 left-0 w-2 h-full bg-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity" />

                <div className="flex justify-between items-start">
                  <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300 shadow-sm">
                    <FolderOpen size={28} />
                  </div>
                  <span className="text-[11px] font-bold text-indigo-500 bg-indigo-50/50 px-2.5 py-1 rounded-lg border border-indigo-100/30">
                    {folder.filesCount} كتاب رسمي
                  </span>
                </div>

                <div className="mt-4 space-y-1">
                  <h4 className="font-extrabold text-slate-800 group-hover:text-indigo-600 transition-colors text-sm line-clamp-1">
                    مجلد {folder.name}
                  </h4>
                  <p className="text-[11px] text-slate-400 font-medium">
                    مجلد فرعي للأصناف • {currentPath[0]}
                  </p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* 3. Files Level View */}
        {isFileLevel && (
          <motion.div
            key="folder-files"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {getFiles(currentPath[0], currentPath[1]).map((doc, i) => (
                <motion.div
                  key={doc.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.03 }}
                  className="group bg-white rounded-3xl border border-slate-200 hover:border-blue-300 hover:shadow-lg transition-all duration-300 overflow-hidden flex flex-col justify-between"
                >
                  <div className="relative aspect-[16/10] bg-slate-50 border-b border-slate-100 overflow-hidden">
                    <img 
                      src={doc.fileData} 
                      alt={doc.title}
                      className="w-full h-full object-cover group-hover:scale-103 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button 
                        onClick={() => onView(doc)}
                        className="bg-white text-slate-900 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md hover:bg-slate-100 transition-colors"
                      >
                        <Eye size={14} />
                        عرض الوثيقة
                      </button>
                    </div>
                  </div>

                  <div className="p-5 space-y-3">
                    {/* Document ID as title (رقم المستند هو رقم الكتاب) */}
                    <div>
                      <p className="text-[10px] text-blue-600 font-mono font-bold tracking-wider mb-0.5">
                        📂 رقم المستند (رقم الكتاب):
                      </p>
                      <h4 className="font-extrabold text-slate-900 text-sm font-mono truncate">
                        {doc.letterNumber || 'كتاب بدون رقم'}
                      </h4>
                    </div>

                    <div className="space-y-1.5 pt-1.5 border-t border-slate-100">
                      <p className="text-xs text-slate-500 font-bold line-clamp-1">{doc.title}</p>
                      
                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 font-medium">
                        <span className="flex items-center gap-1">
                          <Building2 size={12} />
                          <span className="truncate max-w-[120px]">{doc.issuingAuthority || 'جهة غير محددة'}</span>
                        </span>
                        <span className="flex items-center gap-1 font-mono">
                          <Calendar size={12} />
                          <span>{doc.letterDate || '-'}</span>
                        </span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex justify-between items-center text-[10px] text-slate-400">
                      <span>بواسطة {doc.uploaderName}</span>
                      <button 
                        onClick={() => onDelete(doc.id)}
                        className="text-slate-300 hover:text-red-500 transition-colors p-1"
                        title="حذف المستند من الأرشيف"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {getFiles(currentPath[0], currentPath[1]).length === 0 && (
              <div className="bg-white p-20 rounded-3xl border border-slate-100 text-center space-y-4">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto text-slate-300">
                  <FileText size={32} />
                </div>
                <h3 className="text-lg font-bold text-slate-400">لا توجد وثائق مطابقة</h3>
                <p className="text-slate-400 text-xs">لا يوجد مستندات في هذا المجلد مطابقة للبحث حالياً.</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
