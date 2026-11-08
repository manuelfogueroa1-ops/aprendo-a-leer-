"""Crea comparaciones de timbre sin reemplazar las grabaciones de la plataforma.

Usa la interpretación grabada, sin reconocimiento de voz ni síntesis de texto.
Los cambios de tono y resonancia no garantizan anonimizar a quien habla.
"""
import json
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf
from imageio_ffmpeg import get_ffmpeg_exe

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'frontend/assets/audio/grabaciones'
OUTPUT = ROOT / 'frontend/assets/audio/muestras-timbre'
OUTPUT.mkdir(parents=True, exist_ok=True)
RATE = 48000
KEYS = ['letras-pregunta-a', 'letras-nombre-a', 'silaba-pa', 'silaba-pe',
        'silaba-pi', 'silaba-po', 'silaba-pu', 'letras-acierto']

pieces = []
for key in KEYS:
    samples, rate = sf.read(SOURCE / f'{key}.wav', dtype='float32')
    if rate != RATE or samples.ndim != 1:
        raise ValueError(f'Formato inesperado: {key}')
    pieces.extend([samples, np.zeros(int(RATE * .4), dtype='float32')])
original = np.concatenate(pieces)
reference = OUTPUT / 'comparacion-original.wav'
sf.write(reference, original, RATE, subtype='PCM_16')

# Conserva el tiempo y las pausas. Cambia tono y resonancias juntos de forma
# moderada para ofrecer dos timbres; no agrega efectos de robot ni reverberación.
report = {'fuentes': KEYS, 'muestras': [],
          'advertencia': 'Cambiar el timbre no garantiza anonimizar la voz.'}
for name, semitones in [('voz-mas-grave', -2.5), ('voz-mas-aguda', 2.5)]:
    pitch = 2 ** (semitones / 12)
    target = OUTPUT / f'{name}.wav'
    filters = (f'rubberband=tempo=1:pitch={pitch:.9f}:formant=shifted:'
               'pitchq=quality:transients=mixed:detector=soft,'
               'alimiter=limit=0.95:level=false:latency=true')
    subprocess.run([get_ffmpeg_exe(), '-hide_banner', '-loglevel', 'error', '-y',
                    '-i', str(reference), '-af', filters, '-ar', str(RATE),
                    '-c:a', 'pcm_s16le', str(target)], check=True)
    converted, rate = sf.read(target)
    if not np.isfinite(converted).all() or np.max(np.abs(converted)) > .951:
        raise ValueError(f'Audio inválido o saturado: {target.name}')
    if abs(len(converted) - len(original)) / RATE > .1:
        raise ValueError(f'Cambió la duración: {target.name}')
    report['muestras'].append({'archivo': target.name, 'semitonos': semitones,
                               'duracion': round(len(converted) / rate, 3),
                               'pico': round(float(np.max(np.abs(converted))), 4)})

(OUTPUT / 'parametros.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False, indent=2))
