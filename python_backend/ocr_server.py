import os
# تعطيل PIR API و oneDNN لمنع مشاكل التنفيذ على معالجات Intel/AMD في ويندوز
os.environ["FLAGS_use_pir_api"] = "0"

import base64
import io
import numpy as np
from PIL import Image
from flask import Flask, request, jsonify
from flask_cors import CORS
from paddleocr import PaddleOCR

app = Flask(__name__)
CORS(app)  # السماح بطلبات CORS من المتصفح

print("جاري تحميل موديل الذكاء الاصطناعي (PaddleOCR)... يرجى الانتظار")
# تهيئة PaddleOCR للغة العربية
ocr = PaddleOCR(lang='ar')
print("تم تحميل الموديل بنجاح! السيرفر جاهز على المنفذ 5000.")

@app.route('/api/ocr', methods=['POST', 'OPTIONS'])
def process_ocr():
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'}), 200

    try:
        data = request.get_json(force=True)
        if not data:
            return jsonify({'error': 'لم يتم استلام أي بيانات JSON'}), 400

        # استخراج كود Base64 للصورة
        base64_str = data.get('image_base64') or data.get('image') or data.get('fileData')
        if not base64_str:
            return jsonify({'error': 'لم يتم إرسال بيانات الصورة image_base64'}), 400

        # تنظيف البادئة إذا كانت موجودة (مثل data:image/png;base64,)
        if ',' in base64_str:
            base64_str = base64_str.split(',')[1]

        # فك تشفير الصورة وتحويلها لمصفوفة NumPy
        image_bytes = base64.b64decode(base64_str)
        img = Image.open(io.BytesIO(image_bytes)).convert('RGB')
        img_np = np.array(img)

        # استدعاء دالة OCR الصحيحة: ocr.ocr(...)
        # تنبيه: الاستدعاء يكون بـ ocr.ocr(img_np) وليس ocr(img_np) مباشرة
        result = ocr.ocr(img_np)

        # تجميع النصوص المستخرجة
        extracted_lines = []
        if result:
            for res in result:
                if res is None:
                    continue
                for item in res:
                    # بناء النتيجة في PaddleOCR: [ [مواضع_النص], (النص_المستخرج, نسبة_الدقة) ]
                    if isinstance(item, (list, tuple)) and len(item) >= 2:
                        text_data = item[1]
                        if isinstance(text_data, (list, tuple)) and len(text_data) >= 1:
                            extracted_lines.append(str(text_data[0]))
                        elif isinstance(text_data, str):
                            extracted_lines.append(text_data)

        final_text = "\n".join(extracted_lines)

        return jsonify({
            'success': True,
            'text': final_text
        })

    except Exception as e:
        print(f"حدث خطأ أثناء المعالجة: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    # تشغيل السيرفر على Port 5000 وبدء الاستماع
    app.run(host='0.0.0.0', port=5000, debug=False)
