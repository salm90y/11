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


def preprocess_arabic_document(pil_img):
    """
    معالجة رؤية حاسوبية متقدمة (OpenCV) لضبط التباين وتوضيح النقاط والأسطر العربية
    """
    try:
        img_np = np.array(pil_img)
        if len(img_np.shape) == 3:
            gray = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)
        else:
            gray = img_np

        # 1. إزالة الإضاءة الخافتة بزيادة التباين التكيفي (CLAHE)
        clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)

        # 2. إزالة الضوضاء والحفاظ على حواف الحروف
        denoised = cv2.fastNlMeansDenoising(enhanced, h=10)

        # 3. تعديل الحدة لتوضيح الحروف والنقاط
        kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]])
        sharpened = cv2.filter2D(denoised, -1, kernel)

        return Image.fromarray(sharpened), Image.fromarray(denoised)
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
            return jsonify({
                'success': True,
                'text': abbyy_text,
                'engine': 'ABBYY FineReader Engine (أعلى دقة أوفلاين للغة العربية)'
            })

        # 2. التجربة الثانية: Surya OCR (المحرك الذكي للخط العربي أوفلاين)
        if surya_rec_model is not None:
            text = run_surya_ocr(raw_img)
            if text and len(text.strip()) > 10:
                return jsonify({
                    'success': True,
                    'text': text,
                    'engine': 'Surya OCR (أدق محرك أوفلاين للمستندات العربية)'
                })

        # 2. التجربة الثانية: Tesseract OCR للغة العربية
        tess_text = run_tesseract_ocr(sharpened_img)
        if tess_text:
            return jsonify({
                'success': True,
                'text': tess_text,
                'engine': 'Tesseract Arabic OCR (أوفلاين)'
            })

        # 3. التجربة الثالثة: EasyOCR مع ترتيب الأسطر والفرز من اليمين لليسار (Right to Left)
        if easyocr_reader is not None:
            # استخراج الصناديق والتفاصيل
            img_np = np.array(raw_img)
            ocr_results = easyocr_reader.readtext(img_np, paragraph=False)
            
            if not ocr_results:
                ocr_results = easyocr_reader.readtext(np.array(sharpened_img), paragraph=False)

            if ocr_results:
                # ترتيب الأسطر من الأعلى للأسفل (Top to Bottom) ومن اليمين لليسار (Right to Left)
                # كل نصر في ocr_results يحتوي على ([bbox], text, prob)
                lines_dict = {}
                for item in ocr_results:
                    bbox, text_str, prob = item[0], item[1], item[2]
                    if prob < 0.15 or not text_str.strip():
                        continue
                    
                    # حساب منتصف الارتفاع Y وموقع X الأيمن
                    top_y = min(p[1] for p in bbox)
                    right_x = max(p[0] for p in bbox)
                    
                    # تجميع العناصر في نفس السطر (بفارق 15 بكسل)
                    line_key = int(top_y // 18)
                    if line_key not in lines_dict:
                        lines_dict[line_key] = []
                    lines_dict[line_key].append((right_x, text_str))

                # فرز الأسطر عمودياً
                sorted_lines = []
                for line_k in sorted(lines_dict.keys()):
                    # فرز الكلمات داخل السطر نفسه من اليمين إلى اليسار (أكبر X أولاً)
                    words_in_line = sorted(lines_dict[line_k], key=lambda x: x[0], reverse=True)
                    line_text = " ".join(w[1] for w in words_in_line)
                    if line_text.strip():
                        sorted_lines.append(line_text)

                final_text = "\n".join(sorted_lines)
                if final_text and len(final_text.strip()) > 5:
                    return jsonify({
                        'success': True,
                        'text': final_text,
                        'engine': 'EasyOCR + RTL Line Sorting (أوفلاين)'
                    })

        # 4. التجربة الرابعة: PaddleOCR
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
            final_text = "\n".join(lines)
            if final_text and len(final_text.strip()) > 5:
                return jsonify({
                    'success': True,
                    'text': final_text,
                    'engine': 'PaddleOCR (أوفلاين)'
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
