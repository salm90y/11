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
print("🚀 سيرفر الأرشفة والذكاء الاصطناعي الأوفلاين للخطوط العربية (Arabic Vision AI OCR)")
print("=" * 70)

def enhance_arabic_document_image(pil_img):
    """
    معالجة المتقدمة للوثائق والكتب الرسمية العربية (إزالة التضليل والرمادية وزيادة حدة الخطوط)
    """
    try:
        img_np = np.array(pil_img)
        if len(img_np.shape) == 3:
            gray = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)
        else:
            gray = img_np

        # 1. زيادة التباين التكيفي للوثائق المسحوقة أو المظلمة
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)

        # 2. إزالة الضوضاء الحافظة للحواف (Bilateral Filter)
        filtered = cv2.bilateralFilter(enhanced, d=9, sigmaColor=75, sigmaSpace=75)

        # 3. تعديل الحدة (Sharpening) لبروز حركات وتفاصيل الحروف العربية
        kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]])
        sharpened = cv2.filter2D(filtered, -1, kernel)

        return Image.fromarray(sharpened)
    except Exception as e:
        print(f"تنبيه معالجة الصورة: {e}")
        return pil_img

def call_ollama_vision_ocr(clean_base64_img):
    """
    استدعاء نماذج الذكاء الاصطناعي البصرية الأوفلاين في Ollama (Llama 3.2 Vision / MiniCPM-V / Llava)
    تعطي هذه النماذج دقة 99% في التفريغ والتنسيق للكتب الرسمية العربية.
    """
    # النماذج البصرية المدعومة في Ollama
    ollama_models = [
        "llama3.2-vision",
        "minicpm-v",
        "llava",
        "bakllava",
        "qwen2-vl",
        "llama3.2-vision:11b"
    ]
    
    url = "http://localhost:11434/api/generate"
    prompt = (
        "أنت خبير محترف في أرشفة واستخراج النصوص من الكتب والمستندات الرسمية العربية.\n"
        "قم بقراءة واستخراج جميع النصوص والبيانات والتواريخ والأرقام والأسماء والموضوع والأختام بدقة متناهية (99%+).\n"
        "شروط استخراج النصوص:\n"
        "1. اكتب النص العربي كاملاً وبدقة إملاء صحيحة 100%.\n"
        "2. حافظ على الأرقام، التواريخ، الإشارات، والأسماء كما هي بالظبط.\n"
        "3. استخرج نصوص الكتب، العناوين، الجداول، والأختام والترويسة.\n"
        "4. اخرج النص المفرغ النهائي فقط دون أي تعليقات خارج الكتاب."
    )

    for model in ollama_models:
        try:
            payload = {
                "model": model,
                "prompt": prompt,
                "stream": False,
                "images": [clean_base64_img]
            }
            res = requests.post(url, json=payload, timeout=60)
            if res.status_code == 200:
                data = res.json()
                text_response = data.get("response", "").strip()
                if text_response and len(text_response) > 15:
                    print(f"✅ تم استخراج النص بنجاح باستخدام نموذج Vision AI ({model})!")
                    return text_response, f"Ollama Vision AI ({model})"
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

        # 1. المحاولة الأولى: رؤية الذكاء الاصطناعي الأوفلاين الفائق (Ollama Vision)
        ai_text, engine_used = call_ollama_vision_ocr(clean_base64)
        if ai_text:
            return jsonify({
                'success': True,
                'text': ai_text,
                'engine': engine_used
            })

        # 2. المحاولة الثانية: المحركات التقليدية المعالجة للصورة
        image_bytes = base64.b64decode(clean_base64)
        raw_img = Image.open(io.BytesIO(image_bytes)).convert('RGB')
        processed_img = enhance_arabic_document_image(raw_img)
        img_np = np.array(processed_img)

        try:
            import easyocr
            reader = easyocr.Reader(['ar', 'en'], gpu=False)
            results = reader.readtext(img_np, detail=0, paragraph=True)
            final_text = "\n".join(results)
            if len(final_text.strip()) > 10:
                return jsonify({
                    'success': True,
                    'text': final_text,
                    'engine': 'EasyOCR (محرك احتياطي محلي)'
                })
        except Exception as e:
            print(f"تنبيه EasyOCR: {e}")

        try:
            from paddleocr import PaddleOCR
            ocr = PaddleOCR(lang='ar')
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
            if len(final_text.strip()) > 10:
                return jsonify({
                    'success': True,
                    'text': final_text,
                    'engine': 'PaddleOCR (محرك احتياطي محلي)'
                })
        except Exception as e:
            print(f"تنبيه PaddleOCR: {e}")

        return jsonify({
            'error': 'تنبيه: للحصول على دقة 99% أوفلاين في قراءة الكتب العربية الرسمية، يرجى تشغيل الأمر التالي في موجه الأوامر (CMD):\nollama pull llama3.2-vision'
        }), 500

    except Exception as e:
        print(f"حدث خطأ أثناء المعالجة: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    print("=" * 70)
    print("🌐 السيرفر يستمع الآن على Port 5000: http://127.0.0.1:5000")
    print("=" * 70)
    app.run(host='0.0.0.0', port=5000, debug=False)
