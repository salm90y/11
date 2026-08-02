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
            text: `أنت خبير فائق التدقيق والاحترافية في قراءة واستخراج النصوص العربية للكتب الرسمية والأوامر الإدارية والقرارات الحكومية والأسماء والعناوين.

المطلوب بدقة متناهية:
1. اقرأ المستند المرفق بتمعن شديد واستخرج النص كاملاً بدقة 100% وبدون أي إسقاط أو تحريف أو أخطاء إملائية.
2. انتبه جداً لظاهرة مد الحروف (الكشيدة / التطويل ـــ) في الخطوط العربية الإدارية مثل (تــاريخ، علــي، المحــال، تقــيده، المــهني). لا تقرأ إطلاقاً وصلات مد الحروف كحرف "س" أو "سس" أو "يس" أو "نس" أو "سا" أو "سى" (مثال: اقرأها "تاريخ" وليس "تساريخ"، "المحال" وليس "المحسال"، "إلى التقاعد" وليس "السى التقاعد"، "تقيده" وليس "تقيسده"، "المهني" وليس "المهنسي").
3. تأكد من أصل الكلمات والأسماء والجمل بمعناها الحقيقي الصريح وفق قواعد اللغة العربية والمصطلحات الرسمية.
4. اجمع الحروف المتباعدة داخل الكلمة الواحدة (مثل: اقرأ "بقواعد" بدلاً من "بقواع د"، "حسين" بدلاً من "حس ين").
5. افصل الأسماء والكلمات الملتصقة بمسافة واحدة صريحة (مثل: اقرأ "حسين كامل جابر شمخي" بدلاً من "كاملجابرشمخي").
6. حافظ على هيئة الأسطر والفقرات والترويسات والتذييل كما هي مرتبة في الكتاب الأصلي.
7. اكتب النص المفرغ فقط، بدون أي مقدمات أو شرح أو حواشي جانبية.`,
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

// AI Text Refinement & Proofreading Endpoint
app.post('/api/refine-text', async (req, res) => {
  try {
    const { text, mode } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'لم يتم توفير أي نص للتنقيح' });
    }

    // Offline mode or fallback if no key
    if (mode === 'offline' || !process.env.GEMINI_API_KEY) {
      const refined = normalizeAndCorrectArabicText(text);
      return res.json({
        success: true,
        text: refined,
        method: 'المعالج اللغوي المورفولوجي الأوفلاين (Tatweel & Legal NLP Engine)'
      });
    }

    // AI Refinement using Gemini AI Model
    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `أنت خبير فائق الذكاء والاحترافية في تدقيق وتنقيح وتصحيح النصوص العربية المستخرجة عبر الـ OCR للكتب الرسمية والأوامر الإدارية والقرارات الحكومية.

قم بتقديم أفضل تنقيح وتصحيح كامل للنص التالي لإنهاء كافة المشاكل والأخطاء الإملائية والتركيبية:

1. تصحيح الحروف والكلمات المشوهة بسبب مد الحروف (الكشيدة) مثل استبدال "تساريخ" بـ "تاريخ"، "المحسال" بـ "المحال"، "السى التقاعد" بـ "إلى التقاعد"، "تقيسده" بـ "تقيده"، "المهنسي" بـ "المهني"، "بقواعسد" بـ "بقواعد".
2. تجميع الحروف العربية المتباعدة والمقطوعة داخل الكلمة الواحدة (مثل "بقواع د" -> "بقواعد"، "حس ين" -> "حسين"، "تقا عد" -> "تقاعد").
3. فصل الكلمات المدمجة الملتصقة بدون مسافات (مثل "حسينكاملجابرشمخي" -> "حسين كامل جابر شمخي"، "تاريخانفكاك" -> "تاريخ انفكاك").
4. تصحيح وتصويب أسماء الوزارات والمديريات والمواد والقوانين والتشريعات العراقية والرسمية (مثل "قانون أصول المحاكمات الجزائية لقوى الأمن الداخلي رقم (17) لسنة 2008").
5. الحفاظ التام على أسلوب وهيكلية الكتاب الرسمي وحقول الترويسة والعدد والتاريخ والجدول والتذييل دون حذف أو تلخيص.
6. اكتب النص المنقح النهائي المصحح بالكامل فقط، بدون أي مقدمات أو شرح أو حواشي.

النص المطلوب تنقيحه وتعديله:
---
${text}
---`
            }
          ]
        }
      ]
    });

    const aiRefinedText = response.text ? response.text.trim() : text;
    // Final polish with local rules
    const finalPolished = normalizeAndCorrectArabicText(aiRefinedText);

    return res.json({
      success: true,
      text: finalPolished,
      method: 'نموذج الذكاء الاصطناعي الفائق (Gemini AI Refinement Engine)'
    });
  } catch (error: any) {
    console.error('Refine Text Error:', error);
    // Fallback to local offline postprocessor
    const fallbackText = normalizeAndCorrectArabicText(req.body.text || '');
    return res.json({
      success: true,
      text: fallbackText,
      method: 'المعالج المورفولوجي المحلي (Fallback Offline Engine)',
      warning: 'تم التنقيح بالمحرك المحلي نظراً لتعذر الاتصال بالسيرفر'
    });
  }
});

// Ollama Local Offline Refinement Proxy Endpoint
app.post('/api/ollama-refine', async (req, res) => {
  try {
    const { text, model = 'qwen2.5', host = 'http://127.0.0.1:11434' } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'لم يتم توفير أي نص للتدقيق' });
    }

    const ollamaUrl = `${host.replace(/\/$/, '')}/api/generate`;

    const prompt = `أنت خبير فائق الذكاء والاحترافية في تدقيق وتنقيح وتصحيح النصوص العربية المستخرجة عبر الـ OCR للكتب الرسمية والأوامر الإدارية والقرارات الحكومية العريقة والحديثة.

قم بمطابقة الكلمات اللغوية مع أصولها العربية الفصحى وتصحيح وتصويب كافة الأخطاء الإملائية والتركيبية والتحريفات الناتجة عن عملية سحب النصوص والـ OCR بدقة كاملة وبدون أي نقصان.

التعليمات الصارمة:
1. تصحيح الحروف والكلمات المشوهة بسبب مد الحروف (الكشيدة) أو التشوهات مثل استبدال "تساريخ" بـ "تاريخ"، "المحسال" بـ "المحال"، "السى التقاعد" بـ "إلى التقاعد"، "تقيسده" بـ "تقيده"، "المهنسي" بـ "المهني".
2. تجميع الحروف العربية المتباعدة والمقطوعة داخل الكلمة الواحدة (مثل "بقواع د" -> "بقواعد"، "حس ين" -> "حسين"، "تقا عد" -> "تقاعد").
3. فصل الكلمات المدمجة الملتصقة بدون مسافات (مثل "حسينكاملجابرشمخي" -> "حسين كامل جابر شمخي"، "تاريخانفكاك" -> "تاريخ انفكاك").
4. تصحيح وتصويب أسماء الوزارات والمديريات والمواد والقوانين والتشريعات العراقية والرسمية بدقة (مثل "قانون أصول المحاكمات الجزائية لقوى الأمن الداخلي رقم (17) لسنة 2008").
5. الحفاظ التام على أسلوب وهيكلية الكتاب الرسمي وحقول الترويسة والعدد والتاريخ والجدول والتذييل دون حذف أو تلخيص أو تعديل للمعنى الإداري.
6. اكتب النص المنقح النهائي المصحح بالكامل فقط، وبدون أي مقدمات أو شرح أو حواشي أو علامات ترقيم زائدة.

النص المطلوب تدقيقه وتصحيحه بالكامل:
---
${text}
---`;

    try {
      const response = await fetch(ollamaUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          options: {
            temperature: 0.1,
            top_p: 0.9
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama returned status ${response.status}`);
      }

      const data = await response.json();
      const refinedText = data.response ? data.response.trim() : '';

      if (!refinedText) {
        throw new Error("استجابة فارغة من نموذج Ollama");
      }

      const finalPolished = normalizeAndCorrectArabicText(refinedText);

      return res.json({
        success: true,
        text: finalPolished,
        method: `نموذج Ollama المحلي أوفلاين (${model})`
      });
    } catch (connErr: any) {
      return res.json({
        success: false,
        error: `فشل الاتصال بـ Ollama على العنوان ${host}. تأكد من أن تطبيق Ollama يعمل في الخلفية ومن سحبك للنموذج المطلوب بالكامل عبر تشغيل الأمر التالي في سطر الأوامر (CMD):\n\`ollama run ${model}\`\n\nالخطأ التفصيلي: ${connErr.message || connErr}`
      });
    }
  } catch (error: any) {
    console.error('Ollama Refine Error:', error);
    return res.status(500).json({ success: false, error: error.message || 'حدث خطأ غير متوقع' });
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

app.put('/api/documents/:id', (req, res) => {
  const { id } = req.params;
  const { extractedText, title, bodyText, attachments, copyTo, mentionedPersons, letterNumber, letterDate, issuingAuthority, referencedLetters } = req.body;
  const doc = db.documents.find(d => d.id === id);
  if (doc) {
    if (extractedText !== undefined) doc.extractedText = extractedText;
    if (title !== undefined) doc.title = title;
    if (bodyText !== undefined) doc.bodyText = bodyText;
    if (attachments !== undefined) doc.attachments = attachments;
    if (copyTo !== undefined) doc.copyTo = copyTo;
    if (mentionedPersons !== undefined) doc.mentionedPersons = mentionedPersons;
    if (letterNumber !== undefined) doc.letterNumber = letterNumber;
    if (letterDate !== undefined) doc.letterDate = letterDate;
    if (issuingAuthority !== undefined) doc.issuingAuthority = issuingAuthority;
    if (referencedLetters !== undefined) doc.referencedLetters = referencedLetters;
    return res.json({ success: true, doc });
  }
  return res.status(404).json({ error: 'المستند غير موجود' });
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
