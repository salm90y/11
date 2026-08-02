/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import JSZip from 'jszip';
import { Document } from '../types';

/**
 * Helper to convert Base64 image data to a Blob object
 */
export const base64ToBlob = (base64Data: string): Blob | null => {
  try {
    if (!base64Data) return null;
    const parts = base64Data.split(';base64,');
    if (parts.length < 2) return null;
    const contentType = parts[0].split(':')[1] || 'image/png';
    const raw = window.atob(parts[1]);
    const rawLength = raw.length;
    const uInt8Array = new Uint8Array(rawLength);
    for (let i = 0; i < rawLength; ++i) {
      uInt8Array[i] = raw.charCodeAt(i);
    }
    return new Blob([uInt8Array], { type: contentType });
  } catch (e) {
    console.error("Failed to convert base64 to blob:", e);
    return null;
  }
};

/**
 * Gets a clean filename for a document based on its letterNumber
 */
export const getCleanFileName = (doc: Document): string => {
  const number = doc.letterNumber?.trim() || doc.id;
  // Replace characters that are invalid in filenames across Windows, macOS, and Linux
  const cleanNumber = number.replace(/[\/\\:*?"<>|]/g, '-');
  const extension = doc.fileData.includes('image/jpeg') ? 'jpg' : 'png';
  return `${cleanNumber}.${extension}`;
};

/**
 * Saves a single document to the local computer using the File System Access API
 * @param doc The document to save
 * @param rootHandle The DirectoryHandle of the user's selected folder (e.g. "ارشيف الكتروني")
 */
export const saveDocToLocalHandle = async (
  doc: Document,
  rootHandle: any
): Promise<string> => {
  try {
    // 1. Get or create the subfolder named after the document classification/category
    const subFolderName = doc.category || 'أخرى';
    const subFolderHandle = await rootHandle.getDirectoryHandle(subFolderName, { create: true });

    // 2. Prepare file name
    const fileName = getCleanFileName(doc);

    // 3. Create or replace the file inside the subfolder
    const fileHandle = await subFolderHandle.getFileHandle(fileName, { create: true });
    
    // 4. Convert Base64 fileData to Blob
    const blob = base64ToBlob(doc.fileData);
    if (!blob) throw new Error("فشل تحويل بيانات المستند الثنائية.");

    // 5. Create a writable stream and write the blob
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();

    return `${rootHandle.name} / ${subFolderName} / ${fileName}`;
  } catch (error: any) {
    console.error("Error saving document to local handle:", error);
    throw new Error(error.message || "فشل حفظ الملف في المجلد المحدد. الرجاء التأكد من صلاحيات الوصول.");
  }
};

/**
 * Generates and downloads a structured ZIP archive containing all documents
 * mimicking the exact requested folder structure:
 * "ارشيف الكتروني" -> "التصنيف" -> "رقم الكتاب.png"
 */
export const downloadStructuredZip = async (
  documents: Document[],
  onProgress?: (progress: number) => void
): Promise<void> => {
  const zip = new JSZip();
  const rootFolderName = 'الأرشيف الإلكتروني';
  const root = zip.folder(rootFolderName);
  if (!root) throw new Error("فشل إنشاء المجلد الرئيسي في ملف ZIP");

  const total = documents.length;
  for (let i = 0; i < total; i++) {
    const doc = documents[i];
    const categoryName = doc.category || 'أخرى';
    const categoryFolder = root.folder(categoryName);
    
    if (categoryFolder) {
      const blob = base64ToBlob(doc.fileData);
      if (blob) {
        const fileName = getCleanFileName(doc);
        categoryFolder.file(fileName, blob);
      }
    }

    if (onProgress) {
      onProgress(Math.round(((i + 1) / total) * 100));
    }
  }

  // Generate the zip content
  const content = await zip.generateAsync({ type: 'blob' });

  // Download the ZIP file
  const link = document.createElement('a');
  link.href = URL.createObjectURL(content);
  link.download = `ارشيف_الكتروني_مهيكل.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
