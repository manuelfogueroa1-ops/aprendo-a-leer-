"""Importa notas de WhatsApp sin modificar los originales. Requiere soundfile/numpy."""
import argparse
import hashlib
import json
import re
import shutil
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf
from imageio_ffmpeg import get_ffmpeg_exe

parser = argparse.ArgumentParser()
parser.add_argument('carpeta', type=Path)
parser.add_argument('--complementar', action='store_true', help='Agrega audios sin retirar los clips ya importados.')
parser.add_argument('--archivos', nargs='+', help='Procesa solo estos nombres de archivo dentro de la carpeta.')
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
destination = root / 'frontend/assets/audio/grabaciones'
originals = destination / 'originales'
originals.mkdir(parents=True, exist_ok=True)
manifest_path = root / 'frontend/grabaciones.js'
previous = json.loads(manifest_path.read_text(encoding='utf-8').removeprefix('window.GrabacionesLectura = ').strip().removesuffix(';')) if args.complementar else {}
clips = previous.get('clips', {}).copy()
report_path = destination / 'informe-importacion.json'
previous_report = json.loads(report_path.read_text(encoding='utf-8')) if args.complementar and report_path.exists() else {}
report = previous_report.get('clips', []).copy()

def speech_ranges(samples, sample_rate, factor=.005):
    frame = int(sample_rate * .02)
    rms = np.array([np.sqrt(np.mean(samples[i:i+frame] ** 2)) for i in range(0, len(samples), frame)])
    threshold = max(.0003, float(np.percentile(rms, 20)) * 3, float(rms.max()) * factor)
    active = np.flatnonzero(rms > threshold)
    groups = np.split(active, np.flatnonzero(np.diff(active) > 12) + 1)
    return [(max(0, int(group[0] * frame - .12 * sample_rate)),
             min(len(samples), int((group[-1] + 1) * frame + .16 * sample_rate)))
            for group in groups if len(group) >= 4]

def save(key, samples, sample_rate, source, start=0, end=None):
    if not len(samples) or np.max(np.abs(samples)) < .0001:
        raise ValueError(f'Audio sin voz: {key}')
    peak = float(np.max(np.abs(samples)))
    # Un solo ajuste por toma; sin cambiar tono, velocidad ni timbre.
    gain = min(12, .85 / peak)
    samples = np.clip(samples * gain, -.95, .95)
    # Fundido de 5 ms en los bordes silenciosos para evitar clics al reproducir.
    fade = min(int(sample_rate * .005), len(samples) // 2)
    samples[:fade] *= np.linspace(0, 1, fade)
    samples[-fade:] *= np.linspace(1, 0, fade)
    filename = key.replace('ñ', 'enie') + '.wav'
    sf.write(destination / filename, samples, sample_rate, subtype='PCM_16')
    version = hashlib.sha256((destination / filename).read_bytes()).hexdigest()[:12]
    duration = round(len(samples) / sample_rate, 3)
    clips[key] = {'url': f'/assets/audio/grabaciones/{filename}?v={version}', 'duracion': duration}
    report[:] = [item for item in report if item['clave'] != key]
    report.append({'clave': key, 'origen': source, 'inicio': round(start / sample_rate, 3),
                   'fin': round((end if end is not None else start + len(samples)) / sample_rate, 3),
                   'duracion': duration, 'ganancia': round(gain, 3)})

if args.archivos and any(Path(name).name != name for name in args.archivos):
    parser.error('--archivos acepta nombres sin ruta; usa carpeta para indicar su ubicación.')
files = sorted(args.carpeta / name for name in args.archivos) if args.archivos else sorted(args.carpeta.glob('*.ogg'))
missing_files = [str(file) for file in files if not file.is_file()]
if missing_files:
    parser.error('No se encontraron los archivos: ' + ', '.join(missing_files))
families = previous_report.get('familias', []).copy()
for file in files:
    if not re.fullmatch(r'(letras|silabas|silaba|parejas|encuentra|ordeno)-[\w-]+', file.stem):
        continue
    shutil.copy2(file, originals / file.name)
    try:
        samples, sample_rate = sf.read(file, dtype='float64')
    except sf.LibsndfileError:
        decoded = subprocess.run([get_ffmpeg_exe(), '-v', 'error', '-i', str(file),
                                  '-f', 'f32le', '-ac', '1', '-ar', '48000', 'pipe:1'],
                                 capture_output=True, check=True)
        samples, sample_rate = np.frombuffer(decoded.stdout, dtype='<f4').astype(np.float64), 48000
    if samples.ndim > 1:
        samples = samples.mean(axis=1)
    ranges = speech_ranges(samples, sample_rate)
    if not ranges:
        raise ValueError(f'No se detectó voz: {file.name}')
    if file.stem.startswith('silabas-familia-'):
        family = file.stem.removeprefix('silabas-familia-')
        for factor in [.005, .007, .01, .015, .02, .03, .05, .07]:
            ranges = speech_ranges(samples, sample_rate, factor)
            if len(ranges) == 5:
                break
        if len(ranges) != 5:
            raise ValueError(f'Revisar {file.name}: se detectaron {len(ranges)} segmentos, se necesitan 5. No se divide automáticamente.')
        if family not in families:
            families.append(family)
        for vowel, (start, end) in zip('aeiou', ranges):
            save(f'silaba-{family}{vowel}', samples[start:end].copy(), sample_rate, file.name, start, end)
    else:
        start, end = ranges[0][0], ranges[-1][1]
        save(file.stem.replace('letras-preguntas-', 'letras-pregunta-'), samples[start:end].copy(), sample_rate, file.name, start, end)

letters_source = (root / 'frontend/actividades/letras-iniciales.js').read_text(encoding='utf-8')
letters = re.findall(r"\{ letter: '([^']+)'", letters_source)
syllable_source = (root / 'frontend/actividades/silabas-iniciales.js').read_text(encoding='utf-8').split('groups.forEach')[0]
bases = re.findall(r"\{ base: '([^']+)', vowels: V5 \}", syllable_source)
required = [f'letras-{kind}-{letter}' for letter in letters for kind in ('pregunta', 'nombre')]
required += [f'silaba-{base}{vowel}' for base in bases for vowel in 'aeiou']
missing = [key for key in required if key not in clips]
if missing:
    raise ValueError(f'Faltan grabaciones necesarias: {missing}')
manifest = {'version': 1, 'clips': clips}
(root / 'frontend/grabaciones.js').write_text('window.GrabacionesLectura = ' + json.dumps(manifest, ensure_ascii=False, indent=2) + ';\n', encoding='utf-8')
report_path.write_text(json.dumps({'archivosOriginales': len(list(originals.glob('*.ogg'))), 'familias': families, 'clips': report, 'bienvenidaLetrasDisponible': 'letras-bienvenida' in clips}, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'Procesados {len(files)} archivos; catálogo de {len(clips)} clips y {len(families) * 5} sílabas. Preguntas y nombres completos.')
