param(
  [string]$Python = 'py -3.11',
  [string]$Output = "$PSScriptRoot\dist"
)

$ErrorActionPreference = 'Stop'

$venv = Join-Path $PSScriptRoot '.venv'
if (-not (Test-Path $venv)) {
  & cmd /c "$Python -m venv `"$venv`""
}

$pythonExe = Join-Path $venv 'Scripts\python.exe'
if (-not (Test-Path $pythonExe)) {
  throw "Python virtual environment was not created: $pythonExe"
}

& $pythonExe -m pip install --upgrade pip
& $pythonExe -m pip install -r (Join-Path $PSScriptRoot 'requirements-windows.txt')
& $pythonExe -m pip install pyinstaller

New-Item -ItemType Directory -Force -Path $Output | Out-Null
& $pythonExe -m PyInstaller --clean --noconfirm --onefile `
  --name speaker-aware-runner `
  --distpath $Output `
  --workpath (Join-Path $PSScriptRoot '.build') `
  --specpath (Join-Path $PSScriptRoot '.build') `
  (Join-Path $PSScriptRoot 'speaker_aware_runner.py')

& (Join-Path $Output 'speaker-aware-runner.exe') --version
