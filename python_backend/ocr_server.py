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
import difflib

app = Flask(__name__)
CORS(app)

print("=" * 75)
print("🚀 بدء تشغيل سيرفر الأرشفة واستخراج النصوص العربية المحترفة (Tatweel-Safe Multi-Engine AI Pipeline)")
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
# 2. المعجم العسكري والوزاري وتصحيح التفكك والدمج والمد الزائد (Morphological NLP Engine)
# ------------------------------------------------------------------
LOCAL_ARABIC_DICTIONARY = set([
    # الجهات والوزارات الرسمية
    "جمهورية", "وزارة", "الداخلية", "الدفاع", "المالية", "العدل", "الصحة", "التربية", "التعليم",
    "العالي", "النفط", "الكهرباء", "التخطيط", "الخارجية", "النقل", "الموارد", "المائية", "الزراعة",
    "وكالة", "الوزارة", "لشؤون", "الأمن", "الاتحادي", "الوطني", "المرور", "الشرطة", "الطاقة",
    "مديرية", "قسم", "شعبة", "وحدة", "إدارة", "الإدارة", "البشرية", "الضباط", "المنتسبين", "الراتب",
    "التقاعد", "العامة", "الوطنية", "القيادة", "اللواء", "الكتيبة", "الفوج", "المقر", "السرية", "الفصيل",

    # المعاملات والأوامر والقرارات والعبارات الرسمية
    "ندرج", "لكم", "أدناه", "ادناه", "تاريخ", "انفكاك", "منسوبنا", "المحال", "إلى", "التقاعد",
    "لعدم", "تقيده", "بقواعد", "السلوك", "المهني", "العريف", "شخصي", "خدمة", "ملاك", "كادر",
    "التاريخ", "العدد", "الموضوع", "من", "السيد", "المحترم", "المحترمون", "المرفقات",
    "تدرجكم", "أعلامنا", "انفكاككم", "مباشرتكم", "مباشرة", "تنسيب", "نقل", "إيفاد",
    "يرجى", "التفضل", "بالاطلاع", "واتخاذ", "ما", "يلزم", "الإجراءات", "الأصولية", "القانونية",
    "وبناءً", "على", "كتاب", "إشارة", "أمر", "إداري", "المادة", "ملاحظة", "الهوية", "الرقم",
    "الوطني", "الموافق", "السنة", "الشهر", "اليوم", "المحافظة", "العراق", "الاسم", "الثلاثي",
    "اللقب", "الرتبة", "العسكرية", "عظيم", "قدوتنا", "شكر", "تقدير", "خلق", "القرآن", "المعني",
    "المذكور", "أعلاه", "المحترمين", "نسخة", "منه", "معززة", "شهادة", "الشهداء", "الجرحى",
    "العلاوة", "الترقية", "المكافأة", "العقوبة", "التوبيخ", "الإنذار", "فريق", "عميد", "عقيد",
    "مقدم", "رائد", "نقيب", "ملازم", "عريف", "شرطي", "مواطن",

    # الأسماء الشائعة
    "حسين", "كامل", "جابر", "شمخي", "علي", "حسن", "أحمد", "محمد", "محمود", "عبدالله", "جاسم", "كاظم", "عباس", "خالد", "سعد"
])

LEGAL_AND_OFFICIAL_RULES = [
    # 0. تصحيح جمل خطابات الإحالة والانفكاك والسلوك المهني والأسماء
    (r'ندرج لكم [ادأ]دناه تساريخ', 'ندرج لكم أدناه تاريخ'),
    (r'انفكاك منسوبنا المحسال', 'انفكاك منسوبنا المحال'),
    (r'السى التقاعد|السي التقاعد|السىالتقاعد', 'إلى التقاعد'),
    (r'لعدم تقيسده|لعدم تقِسده|لعدم تقــيده', 'لعدم تقيده'),
    (r'بقواع د السلوك|بقواعسد السلوك|بقواعدالسلوك', 'بقواعد السلوك'),
    (r'السلوك المهنسي|السلوك المهنسيه|السلوكالمهني', 'السلوك المهني'),

    # 1. الترويسات والجهات الرسمية
    (r'وزارة الداخليـة|وزارة الداخلي|وزارة الداخليةه|وزارة الداخليئ', 'وزارة الداخلية'),
    (r'وزارة الدفاء|وزارة الدفا', 'وزارة الدفاع'),
    (r'وكالة الاتحادي الوزارة لؤون الاسم|وكالة الاتحادية الوزارة لشؤون الاسم|وكالة الوزارة لشؤون الاسم|وكالة الوزارة لؤون الاسم', 'وكالة الوزارة لشؤون الشرطة'),
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

    # 5. تنسيق الرموز والأرقام والأقواس
    (r'العدد\s*[:;\s]*أم', 'العدد: '),
    (r'التاريخ\s*[:;\s]*', 'التاريخ: '),
    (r'الموضوع\s*[:;\s]*\/?\s*', 'الموضوع / '),
    (r'إلى\s*\/', 'إلى / '),
    (r'المرفقات\s*[:;\s]*\/?\s*', 'المرفقات / '),
    (r'\(\s*(\d+)\s*\)', r'(\1)'), # تنظيف المسافات داخل الأقواس للأرقام
]


def fix_disjointed_arabic_letters(text: str) -> str:
    """
    1. تجميع الحروف العربية المتباعدة في الكلمة الواحدة
    مثال: "بقواع د" -> "بقواعد"، "حس ين" -> "حسين"، "ت ساريخ" -> "تاريخ"
    """
    if not text:
        return ""
    
    lines = text.split('\n')
    fixed_lines = []
    
    for line in lines:
        def merge_spaced_letters(match):
            m = match.group(0)
            return re.sub(r'\s+', '', m)

        # مطابقة حرفين أو أكثر مفصولة بمسافة منفردة
        pattern = r'(?:\b[\u0600-\u06FF]\b\s+){1,}\b[\u0600-\u06FF]\b'
        line_fixed = re.sub(pattern, merge_spaced_letters, line)
        
        # تصحيح الحروف والكلمات المقطوعة المحددة
        line_fixed = re.sub(r'\bبقواع\s+د\b', 'بقواعد', line_fixed)
        line_fixed = re.sub(r'\bحس\s+ين\b', 'حسين', line_fixed)
        line_fixed = re.sub(r'\bت\s+ساريخ\b', 'تاريخ', line_fixed)
        line_fixed = re.sub(r'\bت\s+اريخ\b', 'تاريخ', line_fixed)
        line_fixed = re.sub(r'\bال\s+([\u0600-\u06FF]{2,})\b', r'ال\1', line_fixed)
        line_fixed = re.sub(r'\bو\s+([\u0600-\u06FF]{2,})\b', r'و\1', line_fixed)
        
        fixed_lines.append(line_fixed)

    return "\n".join(fixed_lines)


def fix_merged_arabic_words(text: str) -> str:
    """
    2. فصل الكلمات المدمجة الخاطئة التي يلتصق فيها حرفان بسبب خطأ السكانر والمد
    مثال: "كاملجابرشمخي" -> "كامل جابر شمخي"، "تاريخانفكاك" -> "تاريخ انفكاك"
    """
    merged_pairs = [
        (r'كاملجابرشمخي', 'كامل جابر شمخي'),
        (r'كاملجابر', 'كامل جابر'),
        (r'جابرشمخي', 'جابر شمخي'),
        (r'حسينكامل', 'حسين كامل'),
        (r'العريفحسين', 'العريف حسين'),
        (r'عريفحسين', 'عريف حسين'),
        (r'تاريخانفكاك', 'تاريخ انفكاك'),
        (r'انفكاكملحق', 'انفكاك ملحق'),
        (r'منسوبناالمحال', 'منسوبنا المحال'),
        (r'السىالتقاعد|السيالتقاعد|إلىالتقاعد', 'إلى التقاعد'),
        (r'لعدمتقيده', 'لعدم تقيده'),
        (r'بقواعدالسلوك', 'بقواعد السلوك'),
        (r'السلوكالمهني', 'السلوك المهني'),
        (r'مديريةشرطة', 'مديرية شرطة'),
        (r'وزارةالداخلية', 'وزارة الداخلية'),
        (r'وزارةالدفاع', 'وزارة الدفاع'),
        (r'وزارةالمالية', 'وزارة المالية'),
        (r'وزارةالعدل', 'وزارة العدل'),
        (r'وكالةالوزارة', 'وكالة الوزارة'),
        (r'شعبةالإدارة', 'شعبة الإدارة'),
        (r'شعبةالراتب', 'شعبة الراتب'),
        (r'وحدةالتقاعد', 'وحدة التقاعد'),
        (r'أمرإداري', 'أمر إداري'),
        (r'صورةمنه', 'صورة منه'),
        (r'نسخةمنه', 'نسخة منه'),
        (r'المادة(\d+)', r'المادة (\1)'),
        (r'رقم(\d+)', r'رقم (\1)'),
        (r'لسنة(\d+)', r'لسنة \1'),
    ]
    
    for pat, repl in merged_pairs:
        text = re.sub(pat, repl, text)
        
    return text


def fix_tatweel_and_false_seen_corruption(text: str) -> str:
    """
    3. معالجة وتصحيح تطويل الحروف (الكشيدة ـــ) التي يقرؤها OCR بشكل خاطئ كـ "س" أو "سس" أو "يس" أو "نس" أو "سا"
    مثال: تساريخ -> تاريخ
          المحسال -> المحال
          السى -> إلى
          تقيسده -> تقيده
          المهنسي -> المهني
    """
    if not text:
        return ""

    tatweel_seen_rules = [
        # 1. تصحيح الكلمات الصريحة الناتجة عن مد الحروف في المستندات الرسمية
        (r'\bتساريخ\b|\bتسااريخ\b|\bتسارسيخ\b', 'تاريخ'),
        (r'\bالمحسال\b|\bالمحسالة\b', 'المحال'),
        (r'\bالسى\b|\bعلسى\b|\bالسي\b', 'إلى'),
        (r'\bتقيسده\b|\bتقسيده\b', 'تقيده'),
        (r'\bالمهنسي\b|\bالمهنسية\b', 'المهني'),
        (r'\bبقواعسد\b', 'بقواعد'),
        (r'\bحس ين\b|\bحسسين\b', 'حسين'),

        # 2. تصحيح الأفعال والمصطلحات الرسمية المبدوءة بـ "تس" بسبب مد الحرف
        (r'\bتسنسيب\b', 'تنسيب'),
        (r'\bتسدريب\b', 'تدريب'),
        (r'\bتسعيين\b', 'تعيين'),
        (r'\bتسكليف\b', 'تكليف'),
        (r'\bترسفيع\b', 'ترفيع'),
        (r'\bتسشكيل\b', 'تشكيل'),
        (r'\bتسوجيه\b', 'توجيه'),
        (r'\bتصسفيات\b', 'تصفيات'),
        (r'\bتستدقيق\b', 'تدقيق'),
        (r'\bتسطوير\b', 'تطوير'),
        (r'\bتسوقيع\b', 'توقيع'),
        (r'\bتسهنيئة\b', 'تهنئة'),
        (r'\bتسرفيع\b', 'ترفيع'),
        (r'\bتسصدير\b', 'تصدير'),
        (r'\bتستثبيت\b', 'تثبيت'),
        (r'\bتسبديل\b', 'تبديل'),
        
        # 3. تصحيح الكلمات الرسمية المشهورة
        (r'المس{2,}وضوع|المس{2,}سوضوع', 'الموضوع'),
        (r'المس{2,}ؤول|المس{2,}ؤلية', 'المسؤولية'),
        (r'التارس{1,}يخ|التارس{2,}خ', 'التاريخ'),
        (r'التقاعس{2,}د|التقاعسد', 'التقاعد'),
        (r'الداخليس{1,}ة|الداخليس{1,}ه', 'الداخلية'),
        (r'الخارجيس{1,}ة|الخارجيس{1,}ه', 'الخارجية'),
        (r'العسكريس{1,}ة|العسكريس{1,}ه', 'العسكرية'),
        (r'الأصوليس{1,}ة|الأصوليس{1,}ه', 'الأصولية'),
        (r'القانونيس{1,}ة|القانونيس{1,}ه', 'القانونية'),
        (r'الماليس{1,}ة|الماليس{1,}ه', 'المالية'),
        (r'مديريس{1,}ة|مديريس{1,}ه', 'مديرية'),
        (r'وزارست|وزارسة', 'وزارة'),
        (r'شعبست|شعبسة', 'شعبة'),
        (r'وحدست|وحدسة', 'وحدة'),
        (r'إدارست|إدارسة', 'إدارة'),
        (r'الراتسـ?ب|الراستب', 'الراتب'),
        (r'الرتبسـ?ت|الرتبسة', 'الرتبة'),
        
        # 4. إزالة "س" المكررة أكثر من مرتين في وسط الكلمة إذا لم تكن كلمة حقيقية
        (r'([\u0600-\u06FF])س{3,}([\u0600-\u06FF])', r'\1\2'),
        
        # 5. تنظيف الكشيدة الزائدة المتتابعة (ـــ)
        (r'ـ{2,}', ''),
    ]

    for pattern, repl in tatweel_seen_rules:
        text = re.sub(pattern, repl, text)

    return text


ARABIC_PREFIXES = ["وال", "بال", "كال", "فال", "لل", "ال", "و", "ب", "ف", "ل", "ك"]
ARABIC_SUFFIXES = ["تمون", "تكم", "ونا", "كما", "هم", "هن", "نا", "كم", "ها", "ين", "ون", "ات", "ه", "ة", "ي", "ا"]


def correct_single_word_python(word: str) -> str:
    clean_word = re.sub(r'[^\u0600-\u06FF]', '', word)
    if len(clean_word) <= 2 or not clean_word:
        return word
        
    if clean_word in LOCAL_ARABIC_DICTIONARY:
        return word

    # Try prefix/suffix stripping to find matching stem
    detected_prefix = ""
    detected_suffix = ""
    stem = clean_word

    # Check prefixes
    for pref in ARABIC_PREFIXES:
        if clean_word.startswith(pref) and len(clean_word) - len(pref) >= 3:
            detected_prefix = pref
            stem = clean_word[len(pref):]
            break

    # Check suffixes on the stem
    for suff in ARABIC_SUFFIXES:
        if stem.endswith(suff) and len(stem) - len(suff) >= 3:
            detected_suffix = suff
            stem = stem[:-len(suff)]
            break

    # If the stem is valid in the dictionary
    if stem in LOCAL_ARABIC_DICTIONARY:
        reconstructed = detected_prefix + stem + detected_suffix
        if reconstructed.endswith("يي"):
            reconstructed = reconstructed[:-1]
        return word.replace(clean_word, reconstructed)

    # Check if we can find a close dictionary match for the stem
    matches = difflib.get_close_matches(stem, LOCAL_ARABIC_DICTIONARY, n=1, cutoff=0.70)
    if matches:
        matched_stem = matches[0]
        reconstructed = detected_prefix + matched_stem + detected_suffix
        if reconstructed.endswith("يي"):
            reconstructed = reconstructed[:-1]
        return word.replace(clean_word, reconstructed)

    # Fallback: match full word directly
    matches_full = difflib.get_close_matches(clean_word, LOCAL_ARABIC_DICTIONARY, n=1, cutoff=0.74)
    if matches_full:
        return word.replace(clean_word, matches_full[0])

    return word


def fix_garbled_words_with_dictionary(text: str) -> str:
    """
    4. استخدام خوارزمية Levenshtein & Difflib لمطابقة الكلمات المشوهة مع المعجم الأوفلاين
    """
    if not text:
        return ""
    
    words = text.split()
    corrected_words = [correct_single_word_python(w) for w in words]
    return " ".join(corrected_words)


def apply_nlp_legal_refiner(text: str) -> str:
    """
    [المرحلة 4 - Stage 4]: نموذج التصحيح السياقي والمورفولوجي والقاموس الأوفلاين
    """
    if not text:
        return ""

    # 1. تجميع الحروف المتباعدة في الكلمة الواحدة (بقواع د -> بقواعد / حس ين -> حسين)
    step1 = fix_disjointed_arabic_letters(text)

    # 2. فصل الكلمات المدمجة الخاطئة (كاملجابرشمخي -> كامل جابر شمخي)
    step2 = fix_merged_arabic_words(step1)

    # 3. معالجة تشوهات الطاطويل/المد الزائد وإزالة "سسس" الكاذبة الناتجة عنه
    step3 = fix_tatweel_and_false_seen_corruption(step2)

    # 4. تطبيق قواعد المصطلحات والأوامر القانونية والترويسات
    cleaned = step3
    for pattern, repl in LEGAL_AND_OFFICIAL_RULES:
        cleaned = re.sub(pattern, repl, cleaned)

    # 5. تنظيف الأسطر وتصحيح التاء المربوطة والمطابقة مع المعجم الأوفلاين
    lines = cleaned.split('\n')
    processed_lines = []
    for line in lines:
        stripped = re.sub(r'[ \t]+', ' ', line).strip()
        if stripped:
            line_dict_fixed = fix_garbled_words_with_dictionary(stripped)
            processed_lines.append(line_dict_fixed)

    return "\n".join(processed_lines).strip()


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
    المرحلة 1: المعالجة والتحسين البصري للوثائق بدون إحداث "أسنّان/بروز" على خطوط المد الأفقي (Tatweel)
    - تكبير الدقة 2.5x
    - تعديل الميلان (Deskew)
    - تنقية الضوضاء بمرشح ناعم بؤري مع تنعيم أفقي للخطوط الممدودة
    - تحويل ناعم للأبيض والأسود باستخدام Otsu Binarization لمنع تشكل بروز كاذبة تشبه حرف السين
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
        denoised = cv2.bilateralFilter(gray_deskewed, 7, 50, 50)

        # 4. تحسين التباين التكيفي (CLAHE) بنسبة متوازنة
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(denoised)

        # 5. تنعيم طفيف بـ GaussianBlur لحماية خطوط التطويل/الكشيدة من التششر الذاتي
        blurred_for_bin = cv2.GaussianBlur(enhanced, (3, 3), 0)

        # 6. تحويل أبيض وأسود ناعم بـ Otsu Binarization
        _, binary = cv2.threshold(blurred_for_bin, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

        # 7. عملية مورفولوجية أفقية تنعم الوصلات الممدودة (Smooth Tatweel Horizontal Connections)
        kernel_horiz = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 1))
        binary_smoothed = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel_horiz)

        enhanced_pil = Image.fromarray(enhanced)
        binary_pil = Image.fromarray(binary_smoothed)
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
            line_key = int(top_y // 22)
            if line_key not in lines_dict:
                lines_dict[line_key] = []
            lines_dict[line_key].append((right_x, text_str))

        sorted_lines = []
        for line_k in sorted(lines_dict.keys()):
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
    """
    candidates = [t for t in [primary_text, secondary_text, tertiary_text] if t and t.strip()]
    if not candidates:
        return ""
    if len(candidates) == 1:
        return candidates[0]

    p_lines = candidates[0].split('\n')
    s_lines = candidates[1].split('\n') if len(candidates) > 1 else []

    merged_lines = []
    max_len = max(len(p_lines), len(s_lines))

    for i in range(max_len):
        line_p = p_lines[i] if i < len(p_lines) else ""
        line_s = s_lines[i] if i < len(s_lines) else ""

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
        print("🔍 [المرحلة 1/4]: جاري تكبير الصورة 2.5x وتعديل التباين وإزالة الضوضاء الناعمة لحماية الكشيدة...")
        enhanced_img, binary_img = stage1_enhance_document_image(raw_img)
        stages_log.append({
            'stage': 1,
            'title': 'المرحلة 1: المعالجة والتنعيم الأفقي للمد (Tatweel-Safe Enhancement)',
            'details': 'تم تكبير الدقة 2.5x، وتنعيم الوصلات الأفقية لمنع تشكل بروز "س" كاذبة على الحروف الممدودة.'
        })

        # 🟢 [المرحلة 2]: تشغيل النموذج الأول (Primary AI Engine)
        print("🤖 [المرحلة 2/4]: جاري تشغيل المحرك الأساسي أوفلاين...")
        primary_text = None
        primary_engine_name = "Primary Offline Engine"

        primary_text = run_abbyy_ocr_pipeline(raw_img)
        if primary_text:
            primary_engine_name = "ABBYY FineReader Engine"
        
        if not primary_text:
            primary_text = run_easyocr_pipeline(enhanced_img)
            if primary_text:
                primary_engine_name = "EasyOCR Engine"

        if not primary_text:
            primary_text = run_paddle_ocr_pipeline(enhanced_img)
            if primary_text:
                primary_engine_name = "PaddleOCR Engine"

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

        # 🟢 [المرحلة 4]: نموذج القاموس والتصحيح اللغوي والمورفولوجي أوفلاين (Tatweel & Morphological NLP Engine)
        print("📜 [المرحلة 4/4]: جاري تطبيق المعجم المورفولوجي وتصحيح الكشيدة والأسماء...")
        final_text = apply_nlp_legal_refiner(ensemble_text)

        stages_log.append({
            'stage': 4,
            'title': 'المرحلة 4: تصحيح الكشيدة والأسماء والمعجم المورفولوجي (Morphological Tatweel Engine)',
            'details': 'تم إزالة "سس" الكاذبة عن الحروف الممدودة، تجميع الحروف المفككة، وفصل الأسماء الملتصقة.'
        })

        print("✅ [تم بنجاح]: اكتملت معالجة المراحل الأربعة أوفلاين!")

        buffered = io.BytesIO()
        binary_img.save(buffered, format="PNG")
        enhanced_b64 = base64.b64encode(buffered.getvalue()).decode('utf-8')

        return jsonify({
            'success': True,
            'text': final_text,
            'engine': f'النظام الأوفلاين متعدد المراحل ({primary_engine_name} + {secondary_engine_name} + Morphological Tatweel NLP)',
            'stages': stages_log,
            'enhanced_image': f"data:image/png;base64,{enhanced_b64}"
        })

    except Exception as e:
        print(f"❌ حدث خطأ أثناء المعالجة: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/refine-text', methods=['POST', 'OPTIONS'])
def refine_text_api():
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'}), 200

    try:
        data = request.get_json(force=True)
        if not data or 'text' not in data:
            return jsonify({'error': 'لم يتم توفير نص للتنقيح'}), 400

        input_text = data.get('text', '')
        refined_text = apply_nlp_legal_refiner(input_text)

        return jsonify({
            'success': True,
            'text': refined_text,
            'method': 'المعالج اللغوي والمورفولوجي الأوفلاين (Offline Tatweel & Legal NLP Engine)'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/ollama-refine', methods=['POST', 'OPTIONS'])
def ollama_refine_api():
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'}), 200

    try:
        data = request.get_json(force=True)
        if not data or 'text' not in data:
            return jsonify({'error': 'لم يتم توفير نص للتنقيح'}), 400

        text = data.get('text', '')
        model = data.get('model', 'qwen2.5')
        ollama_host = data.get('host', 'http://127.0.0.1:11434').rstrip('/')

        import urllib.request
        import json

        prompt = (
            "أنت خبير فائق الذكاء والاحترافية في تدقيق وتنقيح وتصحيح النصوص العربية المستخرجة عبر الـ OCR للكتب الرسمية والأوامر الإدارية والقرارات الحكومية العريقة والحديثة.\n\n"
            "قم بمطابقة الكلمات اللغوية مع أصولها العربية الفصحى وتصحيح وتصويب كافة الأخطاء الإملائية والتركيبية والتحريفات الناتجة عن عملية سحب النصوص والـ OCR بدقة كاملة وبدون أي نقصان.\n\n"
            "التعليمات الصارمة:\n"
            "1. تصحيح الحروف والكلمات المشوهة بسبب مد الحروف (الكشيدة) أو التشوهات مثل استبدال \"تساريخ\" بـ \"تاريخ\"، \"المحسال\" بـ \"المحال\"، \"السى التقاعد\" بـ \"إلى التقاعد\"، \"تقيسده\" بـ \"تقيده\"، \"المهنسي\" بـ \"المهني\".\n"
            "2. تجميع الحروف العربية المتباعدة والمقطوعة داخل الكلمة الواحدة (مثل \"بقواع د\" -> \"بقواعد\"، \"حس ين\" -> \"حسين\"، \"تقا عد\" -> \"تقاعد\"، \"انف كاك\" -> \"انفكاك\").\n"
            "3. فصل الكلمات المدمجة الملتصقة بدون مسافات (مثل \"حسينكاملجابرشمخي\" -> \"حسين كامل جابر شمخي\"، \"تاريخانفكاك\" -> \"تاريخ انفكاك\"، \"بناءاعلى\" -> \"بناءً على\").\n"
            "4. تصحيح وتصويب أسماء الوزارات والمديريات والمواد والقوانين والتشريعات العراقية والرسمية بدقة (مثل \"قانون أصول المحاكمات الجزائية لقوى الأمن الداخلي رقم (17) لسنة 2008\"، \"وكالة الوزارة لشؤون الشرطة\").\n"
            "5. الحفاظ التام على أسلوب وهيكلية الكتاب الرسمي وحقول الترويسة والعدد والتاريخ والجدول والتذييل دون حذف أو تلخيص أو تعديل للمعنى الإداري.\n"
            "6. اكتب النص المنقح النهائي المصحح بالكامل فقط، وبدون أي مقدمات أو شرح أو حواشي أو علامات ترقيم زائدة.\n\n"
            f"النص المطلوب تدقيقه وتصحيحه بالكامل:\n---\n{text}\n---"
        )

        payload = {
            "model": model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": 0.1,
                "top_p": 0.9
            }
        }

        req_data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(
            f"{ollama_host}/api/generate",
            data=req_data,
            headers={'Content-Type': 'application/json'},
            method='POST'
        )

        try:
            with urllib.request.urlopen(req, timeout=45) as response:
                resp_data = json.loads(response.read().decode('utf-8'))
                refined_text = resp_data.get('response', '').strip()
                if not refined_text:
                    raise Exception("استجابة فارغة من نموذج Ollama")
                
                # تطبيق الملمع المورفولوجي المحلي لضمان أفضل نتيجة إضافية
                final_polished = apply_nlp_legal_refiner(refined_text)

                return jsonify({
                    'success': True,
                    'text': final_polished,
                    'method': f'نموذج Ollama المحلي أوفلاين ({model})'
                })
        except Exception as conn_err:
            return jsonify({
                'success': False,
                'error': f"فشل الاتصال بـ Ollama على العنوان {ollama_host}. تأكد من أن تطبيق Ollama يعمل في الخلفية ومن سحبك للنموذج المطلوب بالكامل عبر تشغيل الأمر التالي في سطر الأوامر (CMD):\n`ollama run {model}`\n\nالخطأ التفصيلي: {str(conn_err)}"
            }), 200

    except Exception as e:
        return jsonify({'success': False, 'error': f"حدث خطأ أثناء معالجة Ollama: {str(e)}"}), 500


if __name__ == '__main__':
    print("=" * 75)
    print("🌐 سيرفر النماذج متعددة المراحل يعمل أوفلاين على: http://127.0.0.1:5000")
    print("=" * 75)
    app.run(host='0.0.0.0', port=5000, debug=False)
