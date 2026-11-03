# Kokoro local: Dora y Alex

Modelo Kokoro-82M v1.0, Apache-2.0: https://huggingface.co/hexgrad/Kokoro-82M

Adaptador kokoro-onnx 0.4.9, MIT: https://github.com/thewh1teagle/kokoro-onnx

Modelo ONNX y voces: https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0

Voces españolas `ef_dora` y `em_alex`; fonemización `es`. Se conservan sus voces originales, sin elevar artificialmente el tono ni clonar personas. No se garantiza calidad humana: las palabras y sílabas muy cortas requieren revisión con las profesoras. Las muestras están en `frontend/assets/audio/kokoro`.

Los archivos grandes no se incluyen en Git; `scripts/instalar-kokoro.ps1` descarga los pesos y el banco de voces. El modelo utiliza los mismos límites de texto, sesión y caché en memoria de la integración local anterior.
