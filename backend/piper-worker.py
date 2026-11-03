"""Generación local de voz. JSON por stdin/stdout; los audios no se guardan en disco."""
import base64
import io
import json
import logging
import sys
import wave

sys.stdin.reconfigure(encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8")
logging.basicConfig(level=logging.ERROR, stream=sys.stderr)
engine = sys.argv[2] if len(sys.argv) > 2 else 'piper'
if engine == 'kokoro':
    import numpy as np
    from kokoro_onnx import Kokoro
    voice = Kokoro(sys.argv[1], sys.argv[3])
else:
    from piper import PiperVoice, SynthesisConfig
    voice = PiperVoice.load(sys.argv[1])
print(json.dumps({"ready": True}), flush=True)

for line in sys.stdin:
    request = json.loads(line)
    try:
        text = request["texto"].strip()
        # Evita que las sílabas en mayúsculas se interpreten como siglas.
        if request["tipo"] == "letras" and len(text) <= 5:
            text = text.lower()
        output = io.BytesIO()
        with wave.open(output, "wb") as wav:
            if engine == 'kokoro':
                style = 'em_alex' if request.get('voz') == 'kokoro:em_alex' else 'ef_dora'
                samples, rate = voice.create(text, voice=style, speed=0.9, lang='es')
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(rate)
                wav.writeframes((np.clip(samples, -1, 1) * 32767).astype(np.int16).tobytes())
            else:
                config = SynthesisConfig(length_scale=1.13 if request["tipo"] == "letras" else 1.02)
                voice.synthesize_wav(text, wav, syn_config=config)
        print(json.dumps({"id": request["id"], "audio": base64.b64encode(output.getvalue()).decode("ascii")}), flush=True)
    except Exception:
        print(json.dumps({"id": request.get("id"), "error": "No se pudo generar la voz local."}), flush=True)
