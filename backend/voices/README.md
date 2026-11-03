# Voz local de Piper

Esta prueba usa `es_MX-claude-high`, español de México, un hablante, 22.050 Hz.

- Motor: Piper 1.4.2, GPL-3.0. https://github.com/OHF-Voice/piper1-gpl
- Modelo: https://huggingface.co/rhasspy/piper-voices/tree/main/es/es_MX/claude/high
- Su MODEL_CARD indica Apache-2.0 para el conjunto de datos y remite a https://huggingface.co/spaces/HirCoir/Piper-TTS-Spanish
- Se conserva MODEL_CARD junto al modelo. El motor y el modelo tienen sus propias condiciones de distribución.

Los archivos grandes `.onnx` y `.onnx.json` se descargan durante la instalación; no se guardan en Git. El servidor los carga localmente y mantiene los audios generados en una caché de memoria de hasta 32 MiB. No envía los textos a un servicio de voz externo ni guarda los saludos con nombres en archivos de audio.
