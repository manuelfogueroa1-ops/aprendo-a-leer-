"""Muestras fijas sin nombres de alumnos para comparar voces locales."""
from pathlib import Path
import wave
import numpy as np
from kokoro_onnx import Kokoro

root = Path(__file__).resolve().parent.parent
models = root / 'backend/voices/kokoro'
output = root / 'frontend/assets/audio/kokoro'
output.mkdir(parents=True, exist_ok=True)
voice = Kokoro(str(models / 'kokoro-v1.0.onnx'), str(models / 'voices-v1.0.bin'))
for name, text, style in [
    ('buho-dora', '¡Hola! Soy tu amigo búho. Vamos a aprender a leer juntos. Tú puedes, vamos a tu ritmo.', 'ef_dora'),
    ('buho-alex', '¡Hola! Soy tu amigo búho. Vamos a aprender a leer juntos. Tú puedes, vamos a tu ritmo.', 'em_alex'),
    ('silabas-dora', 'pa, pe, pi, po, pu. ma, me, mi, mo, mu.', 'ef_dora'),
    ('palabras-dora', 'La casa. La luna. El gato. La pelota.', 'ef_dora'),
]:
    samples, rate = voice.create(text, voice=style, speed=0.9, lang='es')
    with wave.open(str(output / f'{name}.wav'), 'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        wav.writeframes((np.clip(samples, -1, 1) * 32767).astype(np.int16).tobytes())
    print(f'{name}: {len(samples) / rate:.2f} s', flush=True)
