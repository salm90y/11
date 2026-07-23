/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum UserRole {
  ADMIN = 'ADMIN',
  DATA_ENTRY = 'DATA_ENTRY',
  VIEWER = 'VIEWER',
}

export interface User {
  id: string;
  username: string;
  role: UserRole;
  fullName: string;
}

export enum DocumentCategory {
  RETIREMENT = 'تقاعد',
  TRANSFER = 'نقل',
  ANNEX = 'إلحاق',
  ENROLLMENT = 'التحاق',
  PENALTY = 'عقوبات',
  LEAVE = 'إجازات',
  ABSENCE = 'غياب',
  DEATH = 'وفاة',
  TERMINATION = 'قطع علاقة',
  DETACHMENT = 'انفكاك',
  ASSIGNMENT = 'تنسيب',
  POSITION = 'منصب',
  PROMOTION = 'ترقية',
  BONUS = 'علاوة',
  ID = 'هويات',
  OTHER = 'أخرى',
}

export interface DocumentMetadata {
  id: string;
  title: string;
  category: DocumentCategory;
  uploadDate: string;
  fileType: 'image' | 'pdf';
  uploaderId: string;
  uploaderName: string;
  barcode: string;
  originalFileName: string;
}

export interface Document extends DocumentMetadata {
  extractedText: string;
  fileData: string; // Base64
}

export interface Stats {
  totalDocuments: number;
  documentsByCategory: Record<string, number>;
  dailyUploads: { date: string; count: number }[];
  recentActivity: { id: string; user: string; action: string; time: string }[];
}
