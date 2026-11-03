param([string]$Python = 'python')
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'instalar-piper.ps1') -Python $Python
$projectRoot = Split-Path -Parent $PSScriptRoot
$modelDirectory = Join-Path $projectRoot 'backend/voices/kokoro'
New-Item -ItemType Directory -Force -Path $modelDirectory | Out-Null
$downloads = @{
    'kokoro-v1.0.onnx' = 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx'
    'voices-v1.0.bin' = 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin'
}
foreach ($name in $downloads.Keys) {
    $destination = Join-Path $modelDirectory $name
    if (!(Test-Path -LiteralPath $destination)) { Invoke-WebRequest -Uri $downloads[$name] -OutFile $destination }
}
Write-Output 'Kokoro está listo. Reinicia la aplicación con npm start y selecciona Dora o Alex en el panel docente.'
