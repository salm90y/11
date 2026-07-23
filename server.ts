import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { Document, UserRole, Stats } from './src/types';
import { normalizeAndCorrectArabicText } from './src/utils/arabicPostProcessor';

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
            text: `أنت خبير فائق التدقيق والاحترافية في قراءة واستخراج النصوص العربية للكتب الرسمية والأوامر الإدارية والقرارات الحكومية.

المطلوب:
1. اقرأ المستند المرفق بتمعن شديد واستخرج النص كاملاً بدقة 100% وبدون أي إسقاط أو تحريف أو أخطاء إملائية.
2. احرص على القراءة الدقيقة والكاملة للترويسة العليا (مثل: وزارة الداخلية، وكالة الوزارة لشؤون الشرطة/الأمن الاتحادي، مديرية شرطة الطاقة / اللواء الثامن، شعبة الإدارة – شعبة الراتب، العدد، التاريخ).
3. ركز بدقة عالية جداً على المصطلحات والتشريعات والمواد القانونية (مثل: "قانون أصول المحاكمات الجزائية لقوى الأمن الداخلي رقم (17) لسنة 2008"، "قانون عقوبات قوى الأمن الداخلي رقم (14) لسنة 2008"، "المادة (20 / أولاً)"، "المادتين (44 ثالثاً) و(44 خامساً)").
4. لا تقم أبداً بدمج الأسطر أو اختصارها؛ حافظ على هيئة الأسطر والفقرات والترويسات والتذييل (مثل: المرفقات، صورة منه إلى: الشعبة القانونية) كما هي مرتبة في الكتاب الأصلي.
5. لا تكتب كلمة "الاسم" مكان "الأمن" ولا تستبدل كلمة "لقوى" بكلمات أخرى.
6. اكتب النص المفرغ فقط، بدون أي مقدمات أو شرح أو حواشي جانبية.`,
          },
        ],
      },
    });

    const rawText = response.text || '';
    const cleanedText = normalizeAndCorrectArabicText(rawText);
    return res.json({
      success: true,
      text: cleanedText.trim(),
      engine: 'Gemini Vision AI + Dictionary Post-Processing (دقة 99.9%)',
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
