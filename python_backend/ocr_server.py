import os
import base64
import io
import requests
import numpy as np
import cv2
from PIL import Image
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

print("=" * 70)
print("🚀 سيرفر الأرشفة وقراءة الكتب العربية - محلي وأوفلاين 100% (Offline Python Server)")
print("=" * 70)

def preprocess_arabic_document_advanced(pil_img):
    """
    دالة معالجة وتصفية الوثائق والكتب الرسمية العربية بأعلى معايير الرؤية الحاسوبية (OpenCV)
    تقوم بـ:
    1. تحويل الصورة إلى التدرج الرمادي (Grayscale)
    2. معالجة تباين الخطوط (CLAHE)
    3. إزالة الضوضاء والأختام الخفيفة مع الحفاظ على حواف الحروف العربية
    4. معالجة الثنائية التكيفية (Adaptive Thresholding) لتوضيح النقاط والحركات
    """
    try:
        img_np = np.array(pil_img)
        
        # 1. تحويل الصورة لألوان رمادية
        if len(img_np.shape) == 3:
            gray = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)
        else:
            gray = img_np

        # 2. تحسين تباين الإضاءة للوثائق المظلمة أو المسحوقة
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)

        # 3. إزالة التغبيش والضوضاء دون مسح النقاط وحركات اللغة العربية
        denoised = cv2.fastNlMeansDenoising(enhanced, h=10, templateWindowSize=7, searchWindowSize=21)

        # 4. تحويل الصورة إلى أبيض وأسود عالي الحدة (Binarization)
        binary = cv2.adaptiveThreshold(
            denoised, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 15, 8
        )

        return Image.fromarray(binary), Image.fromarray(denoised)
    except Exception as e:
        print(f"تنبيه أثناء معالجة الصورة: {e}")
        return pil_img, pil_img

def try_tesseract_ocr(pil_img):
    """
    قراءة النص باستخدام Tesseract OCR للغة العربية أوفلاين 100%
    """
    try:
        import pytesseract
        # تحديد المسار الافتراضي لـ Tesseract في ويندوز إذا كان مثبتاً
        possible_paths = [
            r'C:\Program Files\Tesseract-OCR\tesseract.exe',
            r'C:\Program Files (x86)\Tesseract-OCR\tesseract.exe',
            r'C:\Users\%USERNAME%\AppData\Local\Programs\Tesseract-OCR\tesseract.exe'
        ]
        for p in possible_paths:
            expanded = os.path.expandvars(p)
            if os.path.exists(expanded):
                pytesseract.pytesseract.tesseract_cmd = expanded
                break

        text = pytesseract.image_to_string(pil_img, lang='ara+eng')
        if text and len(text.strip()) > 10:
            return text.strip()
    except Exception:
        pass
    return None

def try_ollama_vision_ocr(clean_base64_img):
    """
    قراءة الكتب بالذكاء الاصطناعي الأوفلاين 100% عبر Ollama المحلي
    """
    ollama_models = [
        "llama3.2-vision",
        "minicpm-v",
        "llava",
        "bakllava",
        "qwen2-vl"
    ]
    
    url = "http://localhost:11434/api/generate"
    prompt = (
        "أنت خبير محترف في أرشفة وتفريغ الكتب والمستندات الرسمية العربية.\n"
        "قم بقراءة واستخراج جميع النصوص والبيانات والتواريخ والأرقام والأسماء والموضوع والأختام بدقة متناهية (99%+).\n"
        "تعليمات استخراج النصوص:\n"
        "1. اكتب النص العربي كاملاً وبدقة إملاء صحيحة 100%.\n"
        "2. حافظ على الأرقام، التواريخ، الإشارات، والأسماء كما هي بالظبط.\n"
        "3. استخرج نصوص الكتب، العناوين، الجداول، والأختام والترويسة.\n"
        "4. اخرج النص المفرغ النهائي فقط دون أي تعليقات خارجية."
    )

    for model in ollama_models:
        try:
            payload = {
                "model": model,
                "prompt": prompt,
                "stream": False,
                "images": [clean_base64_img]
            }
            res = requests.post(url, json=payload, timeout=40)
            if res.status_code == 200:
                data = res.json()
                text_response = data.get("response", "").strip()
                if text_response and len(text_response) > 15:
                    return text_response, f"الذكاء الاصطناعي الأوفلاين (Ollama {model})"
        except Exception:
            continue

    return None, None

@app.route('/api/ocr', methods=['POST', 'OPTIONS'])
def process_ocr():
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'}), 200

    try:
        data = request.get_json(force=True)
        if not data:
            return jsonify({'error': 'لم يتم استلام أي بيانات JSON'}), 400

        base64_str = data.get('image_base64') or data.get('image') or data.get('fileData')
        if not base64_str:
            return jsonify({'error': 'لم يتم إرسال بيانات الصورة'}), 400

        if ',' in base64_str:
            clean_base64 = base64_str.split(',')[1]
        else:
            clean_base64 = base64_str

        # فك تشفير الصورة
        image_bytes = base64.b64decode(clean_base64)
        raw_img = Image.open(io.BytesIO(image_bytes)).convert('RGB')
        
        # معالجة الصورة عبر OpenCV لتحسين وضوح الكلمات
        binary_img, denoised_img = preprocess_arabic_document_advanced(raw_img)

        # 1. المحاولة الأولى: Ollama Vision AI أوفلاين (إذا كان مشغلاً محلياً)
        ai_text, engine_used = try_ollama_vision_ocr(clean_base64)
        if ai_text:
            return jsonify({
                'success': True,
                'text': ai_text,
                'engine': engine_used
            })

        # 2. المحاولة الثانية: Tesseract OCR للغة العربية أوفلاين
        tesseract_text = try_tesseract_ocr(denoised_img)
        if tesseract_text:
            return jsonify({
                'success': True,
                'text': tesseract_text,
                'engine': 'Tesseract Arabic OCR (أوفلاين 100%)'
            })

        # 3. المحاولة الثالثة: EasyOCR مع معالجة الصورة المتقدمة
        try:
            import easyocr
            reader = easyocr.Reader(['ar', 'en'], gpu=False)
            
            # تجربة القراءة على الصورة المصفاة
            img_np = np.array(denoised_img)
            results = reader.readtext(img_np, detail=0, paragraph=True)
            
            # تجربة الثنائية إذا كانت النتائج قليلة
            if not results or len("\n".join(results)) < 20:
                img_np_bin = np.array(binary_img)
                results = reader.readtext(img_np_bin, detail=0, paragraph=True)

            final_text = "\n".join(results)
            if final_text and len(final_text.strip()) > 5:
                return jsonify({
                    'success': True,
                    'text': final_text,
                    'engine': 'EasyOCR + OpenCV Processor (أوفلاين 100%)'
                })
        except Exception as e:
            print(f"تنبيه EasyOCR: {e}")

        # 4. المحاولة الرابعة: PaddleOCR محلياً
        try:
            from paddleocr import PaddleOCR
            ocr = PaddleOCR(lang='ar')
            img_np = np.array(denoised_img)
            result = ocr.ocr(img_np)
            extracted_lines = []
            if result and len(result) > 0:
                for line in result:
                    if line is None:
                        continue
                    for item in line:
                        if isinstance(item, (list, tuple)) and len(item) >= 2:
                            text_info = item[1]
                            if isinstance(text_info, (list, tuple)) and len(text_info) >= 1:
                                extracted_lines.append(str(text_info[0]))
                            elif isinstance(text_info, str):
                                extracted_lines.append(text_info)
            final_text = "\n".join(extracted_lines)
            if final_text and len(final_text.strip()) > 5:
                return jsonify({
                    'success': True,
                    'text': final_text,
                    'engine': 'PaddleOCR (أوفلاين 100%)'
                })
        except Exception as e:
            print(f"تنبيه PaddleOCR: {e}")

        return jsonify({'error': 'لم يتم العثور على نص واضح. يرجى التأكد من وضوح الوثيقة'}), 500

    except Exception as e:
        print(f"حدث خطأ أثناء المعالجة: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    print("=" * 70)
    print("🌐 سيرفر بايثون يستمع الآن على: http://127.0.0.1:5000")
    print("=" * 70)
    app.run(host='0.0.0.0', port=5000, debug=False)
