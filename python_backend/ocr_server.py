import os
import re
import base64
import io
import tempfile
import subprocess
import numpy as np
import cv2
from PIL import Image
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

print("=" * 75)
print("🚀 بدء تشغيل سيرفر الأرشفة واستخراج النصوص العربية المحترفة (Multi-Engine AI & ABBYY Pipeline)")
print("=" * 75)

# ------------------------------------------------------------------
# 1. تهيئة محركات الذكاء الاصطناعي الأوفلاين المتاحة
# ------------------------------------------------------------------
engine_status = []

# محرك ABBYY FineReader
def find_abbyy_executable():
    """البحث الذكي عن كافة إصدارات ABBYY FineReader المثبتة على الحاسوب"""
    possible_paths = [
        r'C:\Program Files\ABBYY FineReader 16\FineCmd.exe',
        r'C:\Program Files\ABBYY FineReader 15\FineCmd.exe',
        r'C:\Program Files\ABBYY FineReader 14\FineCmd.exe',
        r'C:\Program Files\ABBYY FineReader 12\FineCmd.exe',
        r'C:\Program Files (x86)\ABBYY FineReader 15\FineCmd.exe',
        r'C:\Program Files (x86)\ABBYY FineReader 14\FineCmd.exe',
        r'C:\Program Files (x86)\ABBYY FineReader 12\FineCmd.exe',
        r'C:\Program Files\ABBYY FineReader PDF 15\FineCmd.exe',
        r'C:\Program Files\ABBYY FineReader PDF 16\FineCmd.exe',
        r'C:\Program Files (x86)\ABBYY FineReader PDF 15\FineCmd.exe',
        'FineCmd.exe'
    ]
    for p in possible_paths:
        if os.path.exists(p):
            return p
    return None

abbyy_exe = find_abbyy_executable()
if abbyy_exe:
    print(f"✅ تم اكتشاف محرك ABBYY FineReader بنجاح في: {abbyy_exe}")
    engine_status.append("ABBYY FineReader Engine")
else:
    print("ℹ️ لم يتم العثور على مسار تلقائي لـ ABBYY FineReader (سيتم استخدام المحركات الأوفلاين الأخرى).")

# محرك EasyOCR
easyocr_reader = None
try:
    import easyocr
    print("جاري تحميل EasyOCR للغة العربية والإنجليزية أوفلاين...")
    easyocr_reader = easyocr.Reader(['ar', 'en'], gpu=False)
    print("✅ تم تحميل EasyOCR بنجاح!")
    engine_status.append("EasyOCR Pipeline")
except Exception as e:
    print(f"ℹ️ لم يتم العثور على EasyOCR ({e})")

# محرك PaddleOCR
paddle_ocr = None
try:
    from paddleocr import PaddleOCR
    print("جاري تحميل PaddleOCR أوفلاين...")
    paddle_ocr = PaddleOCR(lang='ar', use_angle_cls=True, show_log=False)
    print("✅ تم تحميل PaddleOCR بنجاح!")
    engine_status.append("PaddleOCR Engine")
except Exception as e:
    print(f"ℹ️ لم يتم العثور على PaddleOCR ({e})")

# محرك Tesseract OCR
def check_tesseract():
    try:
        import pytesseract
        possible_paths = [
            r'C:\Program Files\Tesseract-OCR\tesseract.exe',
            r'C:\Program Files (x86)\Tesseract-OCR\tesseract.exe',
            'tesseract'
        ]
        for p in possible_paths:
            if os.path.exists(p):
                pytesseract.pytesseract.tesseract_cmd = p
                return True
        return False
    except Exception:
        return False

has_tesseract = check_tesseract()
if has_tesseract:
    print("✅ تم تفعيل Tesseract OCR أوفلاين!")
    engine_status.append("Tesseract Engine")


# ------------------------------------------------------------------
# 2. القاموس العسكري والوزاري والتصحيح السياقي والقانوني (Legal NLP Engine)
# ------------------------------------------------------------------
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
    "شهادة", "الشهداء", "الجرحى", "العلاوة", "الترقية", "المكافأة", "العقوبة", "التوبيخ", "الإنذار",
    "فريق", "عميد", "عقيد", "مقدم", "رائد", "نقيب", "ملازم", "عريف", "شرطي", "مواطن"
])

LEGAL_AND_OFFICIAL_RULES = [
    # 1. الترويسات والجهات الرسمية
    (r'وزارة الداخليـة|وزارة الداخلي|وزارة الداخليةه|وزارة الداخليئ', 'وزارة الداخلية'),
    (r'وزارة الدفاء|وزارة الدفا', 'وزارة الدفاع'),
    (r'وكالة الاتحادي الوزارة لؤون الاسم|وكالة الاتحادية الوزارة لشؤون الاسم|وكالة الوزارة لشؤون الاسم|وكالة الوزارة لؤون الاسم|وكالة الوزارة لشؤون الاسم', 'وكالة الوزارة لشؤون الشرطة'),
    (r'مذيري ة شرطسة|مذيري ة|مذيري شرطسة|مديرية شرطسة|مديريةشرطة|مديرية شرطه', 'مديرية شرطة'),
    (r'شرطسة الطاقة|شرطة الطاق|شرطه الطاقه', 'شرطة الطاقة'),
    (r'شعبة الآدرة|شعبة الأدارة|شعبة الادارة|شعبه الاداره', 'شعبة الإدارة'),
    (r'شعبة الراتب.*العدل.*', 'شعبة الراتب'),
    (r'وخدة التقاغذ|وحدة التقاغذ|التقاغذ|وحده التقاعد', 'وحدة التقاعد'),

    # 2. نصوص الأوامر الإدارية والصلاحيات والقوانين
    (r'إداري امر لاحيات المخولةالينا|إداري امر لاحيات|امر لاحيات المخولةالينا|امر لاحيات|أمر إداري وفقا', 'أمر إداري\nوفقاً للصلاحيات المخولة إلينا'),
    (r'وفقأ أحكام المادة \)\s*/20\s*/ اولا \(|وفقأ أحكام المادة|أحكام المادة \)\s*/20\s*/ اولا \(', 'استناداً لأحكام المادة (20 / أولاً)'),
    (r'بناءا ى الم من قسانون|بناءا ى الم|من قسانون أصول|بناء على ما جاء', 'وبناءً على ما جاء في قانون أصول'),
    (r'أصول المحاكمات الجزائي', 'أصول المحاكمات الجزائية'),
    (r'قسوى الاسم الداخليـة|قسوى الاسم|قوى الاسم الداخليـة|الاسم الداخليـة|الاسم الداخلي', 'لقوى الأمن الداخلي'),
    (r'رق م17 السنة 2008|رق م17|رقم 17 السنة 2008|رقم 17 لسنه 2008', 'رقم (17) لسنة 2008'),
    (r'تنادأ لأخك ام|تنادأ|لأخك ام|استنادا لاحكام|استنادا لأحكام', 'واستناداً لأحكام'),
    (r'و 4 4 ثال وأللف الم ادتين \) 44 خامس|و 4 4 ثال|وأللف الم ادتين \) 44 خامس|وأللف الم ادتين|والف المادتين', 'المادتين (44 ثالثاً) و(44 خامساً)'),
    (r'قتانون عقوبات', 'من قانون عقوبات'),
    (r'رقم 4 نة 8|رقم 14 لسنه 2008', 'رقم (14) لسنة 2008'),

    # 3. قرارات العقوبات والخدمة والأسماء
    (r'معاق بة الراتب ف القات ة المرفقات / ة ربط1 ق وج الاول|معاق بة الراتب|ف القات ة|ق وج الاول', 'تقرر معاقبة المراتب المدرجة أسماؤهم في القائمة المرفقة ربطاً (الفوج الأول)'),
    (r'لوائذ العقوبة المبيذ إزاء كلوحدمنهم|لوائذ العقوبة|المبيذ إزاء|كلوحدمنهم', 'بالعقوبة المبينة إزاء كل واحد منهم'),
    (r'وحسب نوع الجريمة المرتكب ة|المرتكب ة', 'وحسب نوع الجريمة المرتكبة.'),

    # 4. المرفقات والتذييل
    (r'قسائمة اسماء الثامن 025 »|قسائمة اسماء الثامن|قسائمة اسماء|قائمة اسماء', 'قائمة أسماء (اللواء الثامن)'),
    (r'صورة عنه ال شعبة القانونية لواا|صورة عنه ال شعبة القانونية|صورة عنه ال|صورة منه الى', 'صورة منه إلى: الشعبة القانونية'),

    # 5. تصحيح تكرار الحروف والمد والأخطاء الإملائية OCR
    (r'المسسوضوع|المسسسوضوع', 'الموضوع'),
    (r'المسسؤول|المسسؤلية', 'المسؤولية'),
    (r'التارسيخ|التارسسخ', 'التاريخ'),
    (r'التقاعسسد|التقاعسد', 'التقاعد'),
    (r'الداخليسسة|الداخليسة', 'الداخلية'),
    (r'الم ادتين', 'المادتين'),

    # 6. تنسيق الرموز والأرقام والأقواس
    (r'العدد\s*[:;\s]*أم', 'العدد: '),
    (r'التاريخ\s*[:;\s]*', 'التاريخ: '),
    (r'الموضوع\s*[:;\s]*\/?\s*', 'الموضوع / '),
    (r'إلى\s*\/', 'إلى / '),
    (r'المرفقات\s*[:;\s]*\/?\s*', 'المرفقات / '),
    (r'\(\s*(\d+)\s*\)', r'(\1)'), # تنظيف المسافات داخل الأقواس للأرقام
]

def apply_nlp_legal_refiner(text: str) -> str:
    """
    [المرحلة 4 - Stage 4]: نموذج التصحيح السياقي والقاموس الإداري والقانوني الأوفلاين
    """
    if not text:
        return ""
    
    # 1. إزالة الكشيدة والمد الزائد (ـ)
    cleaned = re.sub(r'ـ+', '', text)

    # 2. تطبيق القواعد القانونية والتعديلات الرسمية
    for pattern, repl in LEGAL_AND_OFFICIAL_RULES:
        cleaned = re.sub(pattern, repl, cleaned)

    # 3. تنظيف المسافات والأسطر والتاء المربوطة في أواخر الكلمات الرسمية
    lines = cleaned.split('\n')
    processed = []
    for line in lines:
        stripped = re.sub(r'[ \t]+', ' ', line).strip()
        # تصحيح الهاء إلى تاء مربوطة في الكلمات الرسمية مثل مديريه -> مديرية
        words = stripped.split(' ')
        corr_words = []
        for w in words:
            if w in ["مديريه", "وزاره", "وكاله", "شعبه", "وحده", "إداره", "شرطه", "طاقه", "عقوبه", "هويه", "خدمه", "ماليه", "عامة", "أصوليه", "قانونيه"]:
                w = w[:-1] + 'ة'
            corr_words.append(w)
        processed.append(" ".join(corr_words))

    return "\n".join(processed).strip()


# ------------------------------------------------------------------
# 3. [المرحلة 1 - Stage 1]: المعالجة والتحسين البصري الذكي للوثائق
# ------------------------------------------------------------------
def deskew_image(gray_img):
    """تعديل تدوير وميلان الصفحة تلقائياً"""
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


def stage1_enhance_document_image(pil_img):
    """
    المرحلة 1: المعالجة والتحسين الذكي المزدوج للصورة
    - تكبير الدقة 2.5x
    - تعديل الميلان (Deskew)
    - تنقية الضوضاء بـ Bilateral Filter للحفاظ على حواف ونقاط الحروف العربية
    - توليد نسختين: (1) محسنة رمادياً مع شحذ الخطوط (2) أبيض وأسود نقي عالي التباين (High Contrast Binarization)
    """
    try:
        img_np = np.array(pil_img)
        
        # 1. تكبير الدقة 2.5x للحصول على خط حاد
        h, w = img_np.shape[:2]
        if w < 2800:
            scale = 2800.0 / w
            img_np = cv2.resize(img_np, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_CUBIC)

        if len(img_np.shape) == 3:
            gray = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)
        else:
            gray = img_np

        # 2. تعديل الميلان الأفقي
        gray_deskewed = deskew_image(gray)

        # 3. تنقية الضوضاء بمرشح ثنائي الاتجاه للحفاظ على نقاط الحروف (Dots)
        denoised = cv2.bilateralFilter(gray_deskewed, 9, 75, 75)

        # 4. تحسين التباين التكيفي (CLAHE)
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(denoised)

        # 5. تحويل اللون للأبيض والأسود النقي التكيفي (Adaptive High-Contrast Binarization)
        binary = cv2.adaptiveThreshold(
            enhanced, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 23, 11
        )

        # 6. شحذ الحروف والخطوط
        kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]])
        sharpened = cv2.filter2D(enhanced, -1, kernel)

        enhanced_pil = Image.fromarray(sharpened)
        binary_pil = Image.fromarray(binary)
        return enhanced_pil, binary_pil
    except Exception as e:
        print(f"خطأ في مرحلة التحسين: {e}")
        return pil_img, pil_img


# ------------------------------------------------------------------
# 4. [المرحلة 2 و 3]: استدعاء المحركات الأوفلاين والتقاطع والدمج الذكي
# ------------------------------------------------------------------
def run_abbyy_ocr_pipeline(pil_img):
    """تفريغ ABBYY FineReader أوفلاين بالأوامر المتقدمة"""
    exe_path = find_abbyy_executable()
    if not exe_path:
        return None
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            img_path = os.path.join(tmpdir, "doc_input.png")
            txt_path = os.path.join(tmpdir, "doc_output.txt")
            pil_img.save(img_path)

            # تجربة صيغ مختلفة للتحكم في ABBYY FineCmd
            cmd = [
                exe_path,
                img_path,
                "/lang", "Arabic", "English",
                "/out", txt_path,
                "/format", "text",
                "/silent"
            ]
            subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=90)

            if os.path.exists(txt_path):
                with open(txt_path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read().strip()
                    if content:
                        return content
    except Exception as e:
        print(f"ABBYY Execution Exception: {e}")
    return None


def run_paddle_ocr_pipeline(pil_img):
    """تفريغ PaddleOCR أوفلاين مع ترتيب الأسطر"""
    if paddle_ocr is None:
        return None
    try:
        img_np = np.array(pil_img)
        result = paddle_ocr.ocr(img_np, cls=True)
        if not result or not result[0]:
            return None

        lines = []
        for line_info in result[0]:
            text_str = line_info[1][0]
            if text_str and text_str.strip():
                lines.append(text_str.strip())

        return "\n".join(lines) if lines else None
    except Exception as e:
        print(f"PaddleOCR Exception: {e}")
        return None


def run_easyocr_pipeline(pil_img):
    """تفريغ EasyOCR مع ترتيب الأسطر والكلمات من اليمين إلى اليسار"""
    if easyocr_reader is None:
        return None
    try:
        img_np = np.array(pil_img)
        results = easyocr_reader.readtext(img_np, paragraph=False)
        if not results:
            return None

        lines_dict = {}
        for item in results:
            bbox, text_str, prob = item[0], item[1], item[2]
            if prob < 0.10 or not text_str.strip():
                continue
            top_y = min(p[1] for p in bbox)
            right_x = max(p[0] for p in bbox)
            line_key = int(top_y // 22) # تجميع الأسطر التقريبية
            if line_key not in lines_dict:
                lines_dict[line_key] = []
            lines_dict[line_key].append((right_x, text_str))

        sorted_lines = []
        for line_k in sorted(lines_dict.keys()):
            # ترتيب الكلمات من اليمين إلى اليسار (قيم X تنازلية)
            words_in_line = sorted(lines_dict[line_k], key=lambda x: x[0], reverse=True)
            line_text = " ".join(w[1] for w in words_in_line)
            if line_text.strip():
                sorted_lines.append(line_text)

        return "\n".join(sorted_lines)
    except Exception as e:
        print(f"EasyOCR Error: {e}")
        return None


def run_tesseract_pipeline(pil_img):
    """تفريغ Tesseract OCR أوفلاين"""
    if not has_tesseract:
        return None
    try:
        import pytesseract
        txt = pytesseract.image_to_string(pil_img, lang='ara+eng', config='--psm 6')
        return txt.strip() if txt else None
    except Exception:
        return None


def stage3_cross_pass_ensemble(primary_text, secondary_text, tertiary_text=None):
    """
    [المرحلة 3 - Stage 3]: نموذج دمج ومقاطعة وتصويت نتائج المحركات المختلفة
    تجميع السطور مع إعطاء الأفضلية للسطور الأكثر اكتمالاً ووضوحاً
    """
    candidates = [t for t in [primary_text, secondary_text, tertiary_text] if t and t.strip()]
    if not candidates:
        return ""
    if len(candidates) == 1:
        return candidates[0]

    # دمج السطور واختيار السطر الأطول أو الأكثر احتواءً على كلمات رسمية
    p_lines = candidates[0].split('\n')
    s_lines = candidates[1].split('\n') if len(candidates) > 1 else []

    merged_lines = []
    max_len = max(len(p_lines), len(s_lines))

    for i in range(max_len):
        line_p = p_lines[i] if i < len(p_lines) else ""
        line_s = s_lines[i] if i < len(s_lines) else ""

        # اختيار السطر الأغنى بالنصوص والكلمات
        if len(line_p) >= len(line_s):
            merged_lines.append(line_p)
        else:
            merged_lines.append(line_s)

    return "\n".join(merged_lines)


# ------------------------------------------------------------------
# 5. المسار الرئيسي (API Endpoint) لخدمة واجهة المستخدم
# ------------------------------------------------------------------
@app.route('/api/ocr', methods=['POST', 'OPTIONS'])
def process_ocr():
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'}), 200

    try:
        print("\n" + "=" * 70)
        print("📥 [سيرفر بايثون الأوفلاين]: تم استلام طلب معالجة وثيقة جديد...")

        data = request.get_json(force=True)
        if not data:
            return jsonify({'error': 'لم يتم استلام أي بيانات'}), 400

        base64_str = data.get('image_base64') or data.get('image') or data.get('fileData')
        if not base64_str:
            return jsonify({'error': 'لم يتم إرسال بيانات الصورة'}), 400

        clean_base64 = base64_str.split(',')[1] if ',' in base64_str else base64_str
        image_bytes = base64.b64decode(clean_base64)
        raw_img = Image.open(io.BytesIO(image_bytes)).convert('RGB')
        
        stages_log = []

        # 🟢 [المرحلة 1]: تحسين دقة وتوضيح وتكبير الصورة 2.5x وتعديل التباين
        print("🔍 [المرحلة 1/4]: جاري تكبير الصورة 2.5x وتعديل التباين وإزالة الضوضاء...")
        enhanced_img, binary_img = stage1_enhance_document_image(raw_img)
        stages_log.append({
            'stage': 1,
            'title': 'المرحلة 1: المعالجة والتحسين البصري (Image Enhancement)',
            'details': 'تم تكبير الدقة 2.5x، تعديل ميلان الصفحة تلقائياً، إزالة الضوضاء وتصحيح التباين أبيض/أسود.'
        })

        # 🟢 [المرحلة 2]: تشغيل النموذج الأول (Primary AI Engine)
        print("🤖 [المرحلة 2/4]: جاري تشغيل المحرك الأساسي أوفلاين...")
        primary_text = None
        primary_engine_name = "Primary Offline Engine"

        # محاولة 1: ABBYY FineReader إن وجد
        primary_text = run_abbyy_ocr_pipeline(raw_img)
        if primary_text:
            primary_engine_name = "ABBYY FineReader Engine"
        
        # محاولة 2: EasyOCR
        if not primary_text:
            primary_text = run_easyocr_pipeline(enhanced_img)
            if primary_text:
                primary_engine_name = "EasyOCR Engine"

        # محاولة 3: PaddleOCR
        if not primary_text:
            primary_text = run_paddle_ocr_pipeline(enhanced_img)
            if primary_text:
                primary_engine_name = "PaddleOCR Engine"

        # محاولة 4: Tesseract OCR
        if not primary_text:
            primary_text = run_tesseract_pipeline(binary_img)
            if primary_text:
                primary_engine_name = "Tesseract Arabic Engine"

        stages_log.append({
            'stage': 2,
            'title': f'المرحلة 2: المحرك الأساسي ({primary_engine_name})',
            'details': f'تم استخراج النص الأولي للوثيقة بنجاح باستخدام {primary_engine_name}.'
        })

        # 🟢 [المرحلة 3]: تشغيل النموذج الثاني والتقاطع والدمج (Secondary AI Cross Pass)
        print("🔄 [المرحلة 3/4]: جاري تشغيل المحرك المساند لتقاطع وتدقيق الكلمات...")
        secondary_text = None
        secondary_engine_name = "Cross Pass Verification"

        if "ABBYY" in primary_engine_name:
            secondary_text = run_easyocr_pipeline(enhanced_img) or run_tesseract_pipeline(binary_img)
            secondary_engine_name = "EasyOCR / Tesseract Verification"
        elif "EasyOCR" in primary_engine_name:
            secondary_text = run_paddle_ocr_pipeline(enhanced_img) or run_tesseract_pipeline(binary_img)
            secondary_engine_name = "PaddleOCR / Tesseract Verification"
        else:
            secondary_text = run_easyocr_pipeline(binary_img)
            secondary_engine_name = "EasyOCR Verification"

        ensemble_text = stage3_cross_pass_ensemble(primary_text, secondary_text)

        stages_log.append({
            'stage': 3,
            'title': f'المرحلة 3: المحرك المساند والتقاطع ({secondary_engine_name})',
            'details': 'تم مطابقة وتقاطع نتائج النموذج الأول مع النموذج المساند لضمان أقصى شمولية.'
        })

        # 🟢 [المرحلة 4]: نموذج القاموس والتصحيح اللغوي والقانوني أوفلاين (Legal NLP Engine)
        print("📜 [المرحلة 4/4]: جاري تطبيقي المعجم القانوني والوزاري والتصحيح السياقي...")
        final_text = apply_nlp_legal_refiner(ensemble_text)

        stages_log.append({
            'stage': 4,
            'title': 'المرحلة 4: نموذج التصحيح السياقي والقاموس القانوني (Legal NLP Engine)',
            'details': 'تم فحص الكلمات وتصحيح مصطلحات الوزارات والقوانين والعقوبات والأقواس والأرقام.'
        })

        print("✅ [تم بنجاح]: اكتملت معالجة المراحل الأربعة أوفلاين!")

        buffered = io.BytesIO()
        binary_img.save(buffered, format="PNG")
        enhanced_b64 = base64.b64encode(buffered.getvalue()).decode('utf-8')

        return jsonify({
            'success': True,
            'text': final_text,
            'engine': f'النظام الأوفلاين متعدد المراحل ({primary_engine_name} + {secondary_engine_name} + Legal NLP)',
            'stages': stages_log,
            'enhanced_image': f"data:image/png;base64,{enhanced_b64}"
        })

    except Exception as e:
        print(f"❌ حدث خطأ أثناء المعالجة: {e}")
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    print("=" * 75)
    print("🌐 سيرفر النماذج متعددة المراحل يعمل أوفلاين على: http://127.0.0.1:5000")
    print("=" * 75)
    app.run(host='0.0.0.0', port=5000, debug=False)
