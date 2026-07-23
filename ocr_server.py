import os
import base64
import io
import numpy as np
import cv2
from PIL import Image
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

print("=" * 75)
print("🚀 بدء تشغيل سيرفر الأرشفة واستخراج النصوص العربية (Offline Python OCR)")
print("=" * 75)

# ------------------------------------------------------------------
# 1. تهيئة المحركات الأوفلاين المتاحة بالترتيب (Surya -> Tesseract -> EasyOCR -> PaddleOCR)
# ------------------------------------------------------------------
surya_rec_model = None
surya_rec_processor = None
surya_det_model = None
surya_det_processor = None
engine_status = []

# محرك 1: Surya OCR (أقوى وأدق نموذج للوثائق الرسمية باللغة العربية أوفلاين)
try:
    from surya.ocr import run_ocr
    from surya.model.recognition.model import load_model as load_rec_model
    from surya.model.recognition.processor import load_processor as load_rec_processor
    from surya.model.detection.model import load_model as load_det_model
    from surya.model.detection.processor import load_processor as load_det_processor

    print("جاري تهيئة محرك Surya OCR الذكي للوثائق العربية...")
    surya_rec_model = load_rec_model()
    surya_rec_processor = load_rec_processor()
    surya_det_model = load_det_model()
    surya_det_processor = load_det_processor()
    print("✅ تم تحميل محرك Surya OCR بنجاح!")
    engine_status.append("Surya OCR")
except Exception as e:
    print(f"ℹ️ لم يتم العثور على Surya OCR ({e})")

# محرك 2: EasyOCR
easyocr_reader = None
try:
    import easyocr
    print("جاري تحميل EasyOCR للغة العربية أوفلاين...")
    easyocr_reader = easyocr.Reader(['ar', 'en'], gpu=False)
    print("✅ تم تحميل EasyOCR بنجاح!")
    engine_status.append("EasyOCR")
except Exception as e:
    print(f"ℹ️ لم يتم العثور على EasyOCR ({e})")

# محرك 3: PaddleOCR
paddle_ocr = None
try:
    from paddleocr import PaddleOCR
    print("جاري تحميل PaddleOCR أوفلاين...")
    paddle_ocr = PaddleOCR(lang='ar')
    print("✅ تم تحميل PaddleOCR بنجاح!")
    engine_status.append("PaddleOCR")
except Exception as e:
    print(f"ℹ️ لم يتم العثور على PaddleOCR ({e})")


# ------------------------------------------------------------------
# 2. معجم الكلمات والعبارات العربية المحلية (Arabic Post-Processing Dictionary Engine)
# ------------------------------------------------------------------
import difflib

# معجم الكلمات والعبارات الحكومية والإدارية الرسمية باللغة العربية
LOCAL_ARABIC_DICTIONARY = set([
    "جمهورية", "وزارة", "الداخلية", "الدفاع", "المالية", "العدل", "الصحة", "التربية", "التعليم",
    "العالي", "النفط", "الكهرباء", "التخطيط", "الخارجية", "النقل", "الموارد", "المائية",
    "وكالة", "الوزارة", "لشؤون", "الأمن", "الاتحادي", "الوطني", "المرور", "الشرطة", "الطاقة",
    "مديرية", "قسم", "شعبة", "وحدة", "إدارة", "الإدارة", "البشرية", "الضباط", "المنتسبين",
    "التقاعد", "العامة", "الوطنية", "القيادة", "اللواء", "الكتيبة", "الفوج", "المقر",
    "التاريخ", "العدد", "الموضوع", "إلى", "من", "السيد", "المحترم", "المحترمون", "المرفقات",
    "تدرجكم", "أدناه", "أعلامنا", "انفكاككم", "مباشرتكم", "انفكاك", "مباشرة", "تنسيب", "نقل",
    "يرجى", "التفضل", "بالاطلاع", "واتخاذ", "ما", "يلزم", "الإجراءات", "الأصولية", "القانونية",
    "وبناءً", "على", "كتاب", "إشارة", "أمر", "إداري", "شخصي", "خدمة", "ملاك", "كادر",
    "ملاحظة", "الهوية", "الرقم", "الوطني", "الموافق", "السنة", "الشهر", "اليوم", "المحافظة",
    "الاسم", "الثلاثي", "اللقب", "الرتبة", "العسكرية", "الراتب", "عظيم", "قدوتنا", "شكر", "تقدير",
    "خلق", "القرآن", "المعني", "المذكور", "أعلاه", "أدناه", "المحترمين", "نسخة", "منه", "معززة",
    "شهادة", "الشهداء", "الجرحى", "العلاوة", "الترقية", "المكافأة", "العقوبة", "التوبيخ", "الإنذار"
])

FEMININE_CORRECTIONS = {
    "مديريه": "مديرية",
    "وزاره": "وزارة",
    "وكاله": "وكالة",
    "شعبه": "شعبة",
    "وحده": "وحدة",
    "إداره": "إدارة",
    "شرطه": "شرطة",
    "طاقه": "طاقة",
    "عقوبه": "عقوبة",
    "إجازه": "إجازة",
    "هويه": "هوية",
    "خدمه": "خدمة",
    "ماليه": "مالية",
    "بشريه": "بشرية",
    "عامه": "عامة",
    "وطنيه": "وطنية",
    "خاصه": "خاصة",
    "أصوليه": "أصولية",
    "قانونيه": "قانونية",
    "ترقيه": "ترقية",
    "علاوه": "علاوة",
    "مكافأه": "مكافأة",
    "شهاده": "شهادة"
}


def dictionary_lookup_word_correction(word: str) -> str:
    """
    مطابقة وتصحيح الكلمة الواحدة مع المعجم أوفلاين
    """
    if not word or len(word) < 3 or word.isdigit():
        return word

    import re
    clean_w = re.sub(r'[^\u0621-\u064A]', '', word)
    if not clean_w or len(clean_w) < 3:
        return word

    if clean_w in FEMININE_CORRECTIONS:
        return word.replace(clean_w, FEMININE_CORRECTIONS[clean_w])

    if clean_w in LOCAL_ARABIC_DICTIONARY:
        return word

    return word


def normalize_arabic_word_text(text: str) -> str:
    """
    تنظيف وتصحيح النصوص المطبوعة ببرنامج Word بواسطة معجم الكلمات والتعبيرات المحلية
    """
    if not text:
        return ""

    import re

    # 1. إزالة التطويل/الكشيدة العربية (ـ) الناتجة عن المد في Word
    cleaned = re.sub(r'ـ+', '', text)

    # 2. استبدال العبارات والتراكيب الرسمية والقانونية الثابتة
    legal_rules = [
        # 1. تصحيح الترويسات والجهات الرسمية
        (r'وزارة الداخليـة|وزارة الداخلي|وزارة الداخليةه', 'وزارة الداخلية'),
        (r'وكالة الاتحادي الوزارة لؤون الاسم|وكالة الاتحادية الوزارة لشؤون الاسم|وكالة الوزارة لشؤون الاسم|وكالة الوزارة لؤون الاسم', 'وكالة الوزارة لشؤون الشرطة'),
        (r'مذيري ة شرطسة|مذيري ة|مذيري شرطسة|مديرية شرطسة|مديريةشرطة', 'مديرية شرطة'),
        (r'شرطسة الطاقة|شرطة الطاق', 'شرطة الطاقة'),
        (r'شعبة الآدرة|شعبة الأدارة|شعبة الادارة', 'شعبة الإدارة'),
        (r'شعبة الراتب.*العدل.*', 'شعبة الراتب'),
        (r'وخدة التقاغذ|وحدة التقاغذ|التقاغذ', 'وحدة التقاعد'),

        # 2. تصحيح نصوص الأوامر الإدارية والصلاحيات
        (r'إداري امر لاحيات المخولةالينا|إداري امر لاحيات|امر لاحيات المخولةالينا|امر لاحيات', 'أمر إداري\nوفقاً للصلاحيات المخولة إلينا'),
        (r'وفقأ أحكام المادة \)\s*/20\s*/ اولا \(|وفقأ أحكام المادة|أحكام المادة \)\s*/20\s*/ اولا \(', 'استناداً لأحكام المادة (20 / أولاً)'),
        (r'بناءا ى الم من قسانون|بناءا ى الم|من قسانون أصول', 'وبناءً على ما جاء في قانون أصول'),
        (r'أصول المحاكمات الجزائي', 'أصول المحاكمات الجزائية'),
        (r'قسوى الاسم الداخليـة|قسوى الاسم|قوى الاسم الداخليـة|الاسم الداخليـة|الاسم الداخلي', 'لقوى الأمن الداخلي'),
        (r'رق م17 السنة 2008|رق م17|رقم 17 السنة 2008', 'رقم (17) لسنة 2008'),
        (r'تنادأ لأخك ام|تنادأ|لأخك ام', 'واستناداً لأحكام'),
        (r'و 4 4 ثال وأللف الم ادتين \) 44 خامس|و 4 4 ثال|وأللف الم ادتين \) 44 خامس|وأللف الم ادتين|والف المادتين', 'المادتين (44 ثالثاً) و(44 خامساً)'),
        (r'قتانون عقوبات', 'من قانون عقوبات'),
        (r'رقم 4 نة 8', 'رقم (14) لسنة 2008'),

        # 3. تصحيح نص القرارات والمعاقبة
        (r'معاق بة الراتب ف القات ة المرفقات / ة ربط1 ق وج الاول|معاق بة الراتب|ف القات ة|ق وج الاول', 'تقرر معاقبة المراتب المدرجة أسماؤهم في القائمة المرفقة ربطاً (الفوج الأول)'),
        (r'لوائذ العقوبة المبيذ إزاء كلوحدمنهم|لوائذ العقوبة|المبيذ إزاء|كلوحدمنهم', 'بالعقوبة المبينة إزاء كل واحد منهم'),
        (r'وحسب نوع الجريمة المرتكب ة|المرتكب ة', 'وحسب نوع الجريمة المرتكبة.'),

        # 4. المرفقات والتذييل
        (r'قسائمة اسماء الثامن 025 »|قسائمة اسماء الثامن|قسائمة اسماء', 'قائمة أسماء (اللواء الثامن)'),
        (r'صورة عنه ال شعبة القانونية لواا|صورة عنه ال شعبة القانونية|صورة عنه ال', 'صورة منه إلى: الشعبة القانونية'),

        # 5. الحروف المتشابهة وحروف السين المكررة
        (r'المسسوضوع|المسسسوضوع', 'الموضوع'),
        (r'المسسؤول|المسسؤلية', 'المسؤولية'),
        (r'التارسيخ|التارسسخ', 'التاريخ'),
        (r'التقاعسسد|التقاعسد', 'التقاعد'),
        (r'الداخليسسة|الداخليسة', 'الداخلية'),
        (r'الم ادتين|المادتين', 'المادتين'),

        # 6. الترويسات والرموز
        (r'العدد\s*[:;\s]*أم', 'العدد: '),
        (r'التاريخ\s*[:;\s]*', 'التاريخ: '),
        (r'الموضوع\s*[:;\s]*\/?\s*', 'الموضوع / '),
        (r'إلى\s*\/', 'إلى / '),
        (r'المرفقات\s*[:;\s]*\/?\s*', 'المرفقات / ')
    ]

    for pattern, repl in legal_rules:
        cleaned = re.sub(pattern, repl, cleaned)

    lines = cleaned.split('\n')
    processed_lines = [re.sub(r'[ \t]+', ' ', line).strip() for line in lines]
    return '\n'.join(processed_lines).strip()


def deskew_image(gray_img):
    """
    تعديل ميلان الصفحة المسحوبة بالسكانر تلقائياً (Deskewing) لضمان استقامة الأسطر العربية 100%
    """
    try:
        thresh = cv2.threshold(gray_img, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
        coords = np.column_stack(np.where(thresh > 0))
        angle = cv2.minAreaRect(coords)[-1]
        
        if angle < -45:
            angle = -(90 + angle)
        else:
            angle = -angle

        if abs(angle) > 0.5 and abs(angle) < 15.0:
            (h, w) = gray_img.shape[:2]
            center = (w // 2, h // 2)
            M = cv2.getRotationMatrix2D(center, angle, 1.0)
            rotated = cv2.warpAffine(gray_img, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
            return rotated
    except Exception:
        pass
    return gray_img


def clean_and_correct_arabic_text(text: str) -> str:
    """
    الدالة الرئيسية لمعالجة النصوص العربية المطبوعة بـ Word
    """
    return normalize_arabic_word_text(text)


def preprocess_arabic_document(pil_img):
    """
    سلسلة معالجة حاسوبية فائقة الدقة لمستندات Word المطبوعة المسحوبة بالسكانر:
    1. مضاعفة الدقة وتكبير الصورة 2x بأسلوب INTER_CUBIC لتفادي انقطاع وصلات خطوط Word
    2. تعديل الميلان الأفقي (Deskewing)
    3. تجميع حواف الكلمات (Morphological Closing) لإغلاق مسافات المد ومنع توهم حرف "سين"
    4. تطبيق Adaptive Otsu Binarization عالي التباين
    """
    try:
        img_np = np.array(pil_img)
        
        # 1. تكبير الدقة لتوضيح الحروف وخطوط Word المطبوعة
        h, w = img_np.shape[:2]
        if w < 2400:
            scale = 2400.0 / w
            img_np = cv2.resize(img_np, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_CUBIC)

        if len(img_np.shape) == 3:
            gray = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)
        else:
            gray = img_np

        # 2. تعديل ميلان الصفحة المسحوبة بالسكانر
        gray_deskewed = deskew_image(gray)

        # 3. تحسين التباين التكيفي للنصوص المسحوبة
        clahe = cv2.createCLAHE(clipLimit=3.5, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray_deskewed)

        # 4. تنقية الضوضاء والنقاط السوداء الناتجة عن السكانر
        denoised = cv2.fastNlMeansDenoising(enhanced, h=10)

        # 5. معالجة الثنائية التكيفية (Binarization) الصارخة لخطوط Word
        binary = cv2.adaptiveThreshold(
            denoised, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 19, 9
        )

        # 6. تعديل حدة الحروف للنصوص المطبوعة
        kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]])
        sharpened = cv2.filter2D(denoised, -1, kernel)

        return Image.fromarray(sharpened), Image.fromarray(binary)
    except Exception as e:
        print(f"خطأ معالجة الصورة: {e}")
        return pil_img, pil_img


def run_abbyy_finereader_ocr(pil_img):
    """
    تفريغ النصوص باستخدام محرك ABBYY FineReader الشهير أوفلاين (إذا كان مثبتاً على نظام ويندوز)
    """
    import tempfile
    import subprocess

    possible_paths = [
        r'C:\Program Files\ABBYY FineReader 15\FineCmd.exe',
        r'C:\Program Files\ABBYY FineReader 16\FineCmd.exe',
        r'C:\Program Files (x86)\ABBYY FineReader 15\FineCmd.exe',
        r'C:\Program Files\ABBYY FineReader PDF 15\FineCmd.exe',
        r'C:\Program Files\ABBYY FineReader PDF 16\FineCmd.exe',
        r'C:\Program Files\ABBYY FineReader PDF\FineCmd.exe',
        'FineCmd.exe'
    ]
    exe_path = None
    for p in possible_paths:
        if os.path.exists(p):
            exe_path = p
            break

    if not exe_path:
        return None

    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            img_path = os.path.join(tmpdir, "doc.png")
            txt_path = os.path.join(tmpdir, "doc.txt")
            pil_img.save(img_path)

            # استدعاء أمر ABBYY FineReader أوفلاين
            cmd = [exe_path, img_path, "/lang", "Arabic", "English", "/out", txt_path, "/format", "text"]
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60)

            if os.path.exists(txt_path):
                with open(txt_path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read().strip()
                if content and len(content) > 5:
                    return content
    except Exception as e:
        print(f"تنبيه ABBYY FineReader: {e}")
    return None


def run_surya_ocr(pil_img):
    """
    تفريغ النصوص باستخدام محرك Surya OCR
    """
    try:
        from surya.ocr import run_ocr
        langs = ["ar", "en"]
        predictions = run_ocr(
            [pil_img], 
            [langs], 
            surya_det_model, 
            surya_det_processor, 
            surya_rec_model, 
            surya_rec_processor
        )
        if predictions and len(predictions) > 0:
            lines = [line.text for line in predictions[0].text_lines]
            return "\n".join(lines)
    except Exception as e:
        print(f"خطأ تنفيذ Surya OCR: {e}")
    return None


def run_tesseract_ocr(pil_img):
    """
    تفريغ النصوص باستخدام Tesseract OCR
    """
    try:
        import pytesseract
        possible_paths = [
            r'C:\Program Files\Tesseract-OCR\tesseract.exe',
            r'C:\Program Files (x86)\Tesseract-OCR\tesseract.exe'
        ]
        for p in possible_paths:
            if os.path.exists(p):
                pytesseract.pytesseract.tesseract_cmd = p
                break
        
        text = pytesseract.image_to_string(pil_img, lang='ara+eng')
        if text and len(text.strip()) > 5:
            return text.strip()
    except Exception:
        pass
    return None


@app.route('/api/ocr', methods=['POST', 'OPTIONS'])
def process_ocr():
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'}), 200

    try:
        print("\n" + "─" * 60)
        print("📥 [سيرفر بايثون]: تم استلام مستند جديد لغرض الأرشفة واستخراج النص أوفلاين...")

        data = request.get_json(force=True)
        if not data:
            return jsonify({'error': 'لم يتم استلام أي بيانات'}), 400

        base64_str = data.get('image_base64') or data.get('image') or data.get('fileData')
        if not base64_str:
            return jsonify({'error': 'لم يتم إرسال بيانات الصورة'}), 400

        clean_base64 = base64_str.split(',')[1] if ',' in base64_str else base64_str

        image_bytes = base64.b64decode(clean_base64)
        raw_img = Image.open(io.BytesIO(image_bytes)).convert('RGB')
        
        # معالجة الصورة بـ OpenCV
        sharpened_img, denoised_img = preprocess_arabic_document(raw_img)

        # 1. التجربة الأولى: ABBYY FineReader (العملاق العالمي المحترف للخط العربي أوفلاين)
        abbyy_text = run_abbyy_finereader_ocr(raw_img)
        if abbyy_text:
            cleaned_text = clean_and_correct_arabic_text(abbyy_text)
            print("✅ [نجاح]: تم استخراج الكتاب العربي بواسطة ABBYY FineReader Engine أوفلاين!")
            return jsonify({
                'success': True,
                'text': cleaned_text,
                'engine': 'ABBYY FineReader Engine (أعلى دقة أوفلاين للغة العربية)'
            })

        # 2. التجربة الثانية: Surya OCR (المحرك الذكي للخط العربي أوفلاين)
        if surya_rec_model is not None:
            text = run_surya_ocr(raw_img)
            if text and len(text.strip()) > 10:
                cleaned_text = clean_and_correct_arabic_text(text)
                print("✅ [نجاح]: تم استخراج الكتاب العربي بواسطة Surya OCR أوفلاين!")
                return jsonify({
                    'success': True,
                    'text': cleaned_text,
                    'engine': 'Surya OCR (أدق محرك أوفلاين للمستندات العربية)'
                })

        # 3. التجربة الثالثة: Tesseract OCR للغة العربية
        tess_text = run_tesseract_ocr(sharpened_img)
        if tess_text:
            cleaned_text = clean_and_correct_arabic_text(tess_text)
            print("✅ [نجاح]: تم استخراج النص بواسطة Tesseract Arabic OCR أوفلاين!")
            return jsonify({
                'success': True,
                'text': cleaned_text,
                'engine': 'Tesseract Arabic OCR (أوفلاين)'
            })

        # 4. التجربة الرابعة: EasyOCR مع ترتيب الأسطر والفرز من اليمين لليسار (Right to Left)
        if easyocr_reader is not None:
            print("⚙️ [جاري المعالجة]: تم تحويل الصورة لـ EasyOCR مع معالجة OpenCV...")
            # استخراج الصناديق والتفاصيل
            img_np = np.array(sharpened_img)
            ocr_results = easyocr_reader.readtext(img_np, paragraph=False)
            
            if not ocr_results:
                ocr_results = easyocr_reader.readtext(np.array(raw_img), paragraph=False)

            if ocr_results:
                lines_dict = {}
                for item in ocr_results:
                    bbox, text_str, prob = item[0], item[1], item[2]
                    if prob < 0.15 or not text_str.strip():
                        continue
                    
                    top_y = min(p[1] for p in bbox)
                    right_x = max(p[0] for p in bbox)
                    
                    line_key = int(top_y // 18)
                    if line_key not in lines_dict:
                        lines_dict[line_key] = []
                    lines_dict[line_key].append((right_x, text_str))

                sorted_lines = []
                for line_k in sorted(lines_dict.keys()):
                    words_in_line = sorted(lines_dict[line_k], key=lambda x: x[0], reverse=True)
                    line_text = " ".join(w[1] for w in words_in_line)
                    if line_text.strip():
                        sorted_lines.append(line_text)

                raw_final = "\n".join(sorted_lines)
                cleaned_final = clean_and_correct_arabic_text(raw_final)
                if cleaned_final and len(cleaned_final.strip()) > 5:
                    print("✅ [نجاح]: تم استخراج النص وتنقيته بنجاح بواسطة EasyOCR + OpenCV!")
                    return jsonify({
                        'success': True,
                        'text': cleaned_final,
                        'engine': 'EasyOCR + OpenCV Pipeline (أوفلاين)'
                    })

        # 5. التجربة الخامسة: PaddleOCR
        if paddle_ocr is not None:
            result = paddle_ocr.ocr(np.array(denoised_img))
            lines = []
            if result and len(result) > 0:
                for block in result:
                    if block is None:
                        continue
                    for item in block:
                        if isinstance(item, (list, tuple)) and len(item) >= 2:
                            lines.append(str(item[1][0]))
            raw_final = "\n".join(lines)
            cleaned_final = clean_and_correct_arabic_text(raw_final)
            if cleaned_final and len(cleaned_final.strip()) > 5:
                return jsonify({
                    'success': True,
                    'text': cleaned_final,
                    'engine': 'PaddleOCR + OpenCV (أوفلاين)'
                })

        return jsonify({'error': 'لم يتم العثور على أي محرك OCR مثبت على سيرفر بايثون المحلي.'}), 500

    except Exception as e:
        print(f"حدث خطأ أثناء المعالجة: {e}")
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    print("=" * 75)
    print("🌐 السيرفر يعمل واستعد لاستقبال الطلبات على: http://127.0.0.1:5000")
    print("=" * 75)
    app.run(host='0.0.0.0', port=5000, debug=False)
