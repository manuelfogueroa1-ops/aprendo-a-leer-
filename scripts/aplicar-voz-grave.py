"""Aplica el timbre grave aprobado a los clips, conservando las fuentes.

Ejecutar después de importar nuevas grabaciones. Siempre parte de los WAV
originales preparados, por lo que repetir el proceso no acumula el efecto.
"""
import hashlib
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf
from imageio_ffmpeg import get_ffmpeg_exe

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'frontend/assets/audio/grabaciones'
MANIFEST = ROOT / 'frontend/grabaciones.js'
PREFIX = 'window.GrabacionesLectura = '
manifest = json.loads(MANIFEST.read_text(encoding='utf-8').removeprefix(PREFIX).strip().removesuffix(';'))
semitones = -2.5
pitch = 2 ** (semitones / 12)
filters = (f'rubberband=tempo=1:pitch={pitch:.9f}:formant=shifted:'
           'pitchq=quality:transients=mixed:detector=soft,'
           'alimiter=limit=0.95:level=false:latency=true')
report = {'perfil': 'grave', 'semitonos': semitones, 'tempo': 1, 'clips': []}

# Prepara y valida todo antes de cambiar las rutas usadas por la plataforma.
with tempfile.TemporaryDirectory(prefix='.voz-grave-', dir=SOURCE) as temporary:
    prepared = Path(temporary)
    for key, clip in manifest['clips'].items():
        filename = key.replace('ñ', 'enie') + '.wav'
        source = SOURCE / filename
        target = prepared / filename
        original = sf.info(source)
        subprocess.run([get_ffmpeg_exe(), '-hide_banner', '-loglevel', 'error', '-y',
                        '-i', str(source), '-af', filters, '-ar', str(original.samplerate),
                        '-c:a', 'pcm_s16le', str(target)], check=True)
        samples, rate = sf.read(target)
        duration = len(samples) / rate
        peak = float(np.max(np.abs(samples)))
        if not np.isfinite(samples).all() or peak < .0001 or peak > .951:
            raise ValueError(f'Audio vacío, inválido o saturado: {key}')
        if abs(duration - original.duration) > .1:
            raise ValueError(f'Cambió la duración: {key}')
        digest = hashlib.sha256(target.read_bytes()).hexdigest()[:12]
        clip.update(url=f'/assets/audio/grabaciones/grave/{filename}?v={digest}',
                    duracion=round(duration, 3))
        report['clips'].append({'clave': key, 'duracion': round(duration, 3),
                                'pico': round(peak, 4), 'sha256': digest})
    destination = SOURCE / 'grave'
    destination.mkdir(exist_ok=True)
    for file in prepared.iterdir():
        shutil.copy2(file, destination / file.name)

manifest['perfilVoz'] = {'nombre': 'grave', 'semitonos': semitones}
manifest_tmp = MANIFEST.with_suffix('.js.tmp')
manifest_tmp.write_text(PREFIX + json.dumps(manifest, ensure_ascii=False, indent=2) + ';\n', encoding='utf-8')
manifest_tmp.replace(MANIFEST)
(destination / 'informe-conversion.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(f"Voz grave aplicada a {len(report['clips'])} clips. Fuentes intactas; duración y nivel verificados.")
