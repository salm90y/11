import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { Document, UserRole, Stats } from './src/types';

dotenv.config();

const app = express();
const PORT = 3000;

// Initialize Google GenAI SDK
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Increase limit for base64 uploads
app.use(express.json({ limit: '50mb' }));

// In-memory "database" (Simulating local SQLite for the preview)
const db = {
  documents: [] as Document[],
  users: [
    { id: '1', username: 'admin', role: UserRole.ADMIN, fullName: 'مدير النظام' },
    { id: '2', username: 'user1', role: UserRole.DATA_ENTRY, fullName: 'مدخل بيانات' },
  ],
};

// High-accuracy Gemini Vision OCR Endpoint
app.post('/api/ocr', async (req, res) => {
  try {
    const { image_base64, image, fileData } = req.body;
    const rawBase64 = image_base64 || image || fileData;

    if (!rawBase64) {
      return res.status(400).json({ error: 'لم يتم استلام أي بيانات صورة' });
    }

    const cleanBase64 = rawBase64.includes(',') ? rawBase64.split(',')[1] : rawBase64;
    let mimeType = 'image/jpeg';
    if (rawBase64.startsWith('data:image/png')) {
      mimeType = 'image/png';
    } else if (rawBase64.startsWith('data:image/webp')) {
      mimeType = 'image/webp';
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'لم يتم العثور على GEMINI_API_KEY في النظام' });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: cleanBase64,
            },
          },
          {
            text: `أنت خبير محترف في أرشفة الوثائق والكتب الرسمية وقراءة الخط العربي بالذكاء الاصطناعي.
قم بقراءة واستخراج كافة النصوص والبيانات والتواريخ والأرقام والترویسات والأسماء والأختام والموضوع الموجودة في هذا الكتاب/المستند المرفق بدقة فائقة جداً (100%).
تنبيهات هامة:
1. حافظ على صحة الكلمات والأسماء والأرقام دون أي تحريف أو أخطاء إملائية.
2. اعد تنسيق النص بنفس تراتب الفقرات والأسطر الأصلية للكتاب الرسمي.
3. لا تقم بإضافة أي مقدمات أو خاتمات أو تعليقات خارجية، فقط اكتب النص المفرغ كاملاً.`,
          },
        ],
      },
    });

    const text = response.text || '';
    return res.json({
      success: true,
      text: text.trim(),
      engine: 'Gemini Vision AI (دقة 99.9%)',
    });
  } catch (error: any) {
    console.error('OCR Error:', error);
    return res.status(500).json({
      error: error?.message || 'حدث خطأ أثناء معالجة المستند بالذكاء الاصطناعي',
    });
  }
});

// Documents API
app.get('/api/documents', (req, res) => {
  res.json(db.documents);
});

app.post('/api/documents', (req, res) => {
  const doc: Document = req.body;
  db.documents.push(doc);
  res.json({ success: true, doc });
});

app.delete('/api/documents/:id', (req, res) => {
  const { id } = req.params;
  db.documents = db.documents.filter(d => d.id !== id);
  res.json({ success: true });
});

app.get('/api/stats', (req, res) => {
  const stats: Stats = {
    totalDocuments: db.documents.length,
    documentsByCategory: db.documents.reduce((acc, doc) => {
      acc[doc.category] = (acc[doc.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    dailyUploads: [], 
    recentActivity: db.documents.slice(-5).map(d => ({
      id: d.id,
      user: d.uploaderName,
      action: 'إضافة وثيقة',
      time: d.uploadDate,
    })).reverse(),
  };
  res.json(stats);
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
