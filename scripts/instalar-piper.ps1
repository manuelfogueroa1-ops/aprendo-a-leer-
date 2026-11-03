param([string]$Python = 'python')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$environmentPath = Join-Path $projectRoot '.venv-piper'
$voicePath = Join-Path $projectRoot 'backend/voices'
& $Python -m venv $environmentPath
if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear el entorno. Usa Python 3.12 con -Python RUTA_AL_PYTHON.' }
$piperPython = Join-Path $environmentPath 'Scripts/python.exe'
& $piperPython -m pip install -r (Join-Path $projectRoot 'backend/requirements-piper.txt')
if ($LASTEXITCODE -ne 0) { throw 'No se pudo instalar Piper.' }
New-Item -ItemType Directory -Force -Path $voicePath | Out-Null
& $piperPython -m piper.download_voices es_MX-claude-high --data-dir $voicePath
if ($LASTEXITCODE -ne 0) { throw 'No se pudo descargar la voz.' }
Invoke-WebRequest -Uri 'https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_MX/claude/high/MODEL_CARD' -OutFile (Join-Path $voicePath 'MODEL_CARD')
Write-Output 'Piper está listo. Inicia o reinicia la aplicación con npm start.'
