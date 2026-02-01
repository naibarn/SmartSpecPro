# SmartSpec Pro - Automatic Environment Setup Script
# For Windows (PowerShell)
# Version: 1.0.0

# Requires PowerShell 5.1+ and Administrator privileges

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "Error: This script requires Administrator privileges" -ForegroundColor Red
    Write-Host "Please run PowerShell as Administrator and try again" -ForegroundColor Yellow
    exit 1
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "SmartSpec Pro - Environment Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Function to check if command exists
function Test-Command {
    param($Command)
    $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
}

# Function to print status
function Print-Status {
    param($Message, $Success = $true)
    if ($Success) {
        Write-Host "✓ $Message" -ForegroundColor Green
    } else {
        Write-Host "✗ $Message" -ForegroundColor Red
    }
}

# Function to print info
function Print-Info {
    param($Message)
    Write-Host "→ $Message" -ForegroundColor Cyan
}

# Function to print warning
function Print-Warning {
    param($Message)
    Write-Host "⚠ $Message" -ForegroundColor Yellow
}

Write-Host "Step 1: Installing Chocolatey (Package Manager)"
Write-Host "------------------------------------------------"
if (-not (Test-Command choco)) {
    Print-Info "Installing Chocolatey..."
    Set-ExecutionPolicy Bypass -Scope Process -Force
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
    Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
    Print-Status "Chocolatey installed"
} else {
    Print-Info "Chocolatey already installed"
    choco upgrade chocolatey -y
    Print-Status "Chocolatey updated"
}
Write-Host ""

Write-Host "Step 2: Installing Node.js 22+"
Write-Host "--------------------------------"
if (-not (Test-Command node)) {
    Print-Info "Installing Node.js..."
    choco install nodejs --version=22.0.0 -y
    Print-Status "Node.js installed"
    # Refresh environment variables
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
} else {
    $nodeVersion = (node --version).TrimStart('v').Split('.')[0]
    if ([int]$nodeVersion -lt 22) {
        Print-Warning "Node.js version is less than 22. Upgrading..."
        choco upgrade nodejs -y
        Print-Status "Node.js upgraded"
    } else {
        Print-Info "Node.js $(node --version) already installed"
    }
}
Write-Host ""

Write-Host "Step 3: Installing pnpm"
Write-Host "------------------------"
if (-not (Test-Command pnpm)) {
    Print-Info "Installing pnpm..."
    npm install -g pnpm
    Print-Status "pnpm installed"
    # Refresh environment variables
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
} else {
    Print-Info "pnpm $(pnpm --version) already installed"
}
Write-Host ""

Write-Host "Step 4: Installing Rust"
Write-Host "------------------------"
if (-not (Test-Command rustc)) {
    Print-Info "Installing Rust..."
    # Download and install rustup
    Invoke-WebRequest -Uri "https://win.rustup.rs/x86_64" -OutFile "$env:TEMP\rustup-init.exe"
    Start-Process -FilePath "$env:TEMP\rustup-init.exe" -ArgumentList "-y" -Wait
    Remove-Item "$env:TEMP\rustup-init.exe"
    # Refresh environment variables
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    Print-Status "Rust installed"
} else {
    $rustVersion = (rustc --version).Split(' ')[1]
    Print-Info "Rust $rustVersion already installed"
}
Write-Host ""

Write-Host "Step 5: Installing Python 3.11+"
Write-Host "---------------------------------"
if (-not (Test-Command python)) {
    Print-Info "Installing Python 3.11..."
    choco install python311 -y
    Print-Status "Python 3.11 installed"
    # Refresh environment variables
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
} else {
    $pythonVersion = (python --version).Split(' ')[1]
    Print-Info "Python $pythonVersion already installed"
}
Write-Host ""

Write-Host "Step 6: Installing Visual Studio Build Tools"
Write-Host "----------------------------------------------"
if (-not (Test-Path "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools")) {
    Print-Info "Installing Visual Studio Build Tools..."
    Print-Warning "This may take a while..."
    choco install visualstudio2022buildtools -y
    choco install visualstudio2022-workload-vctools -y
    Print-Status "Visual Studio Build Tools installed"
} else {
    Print-Info "Visual Studio Build Tools already installed"
}
Write-Host ""

Write-Host "Step 7: Installing WebView2"
Write-Host "-----------------------------"
Print-Info "Installing Microsoft Edge WebView2..."
choco install webview2-runtime -y
Print-Status "WebView2 installed"
Write-Host ""

Write-Host "Step 8: Installing project dependencies"
Write-Host "-----------------------------------------"
if (Test-Path "package.json") {
    Print-Info "Installing Node.js dependencies..."
    pnpm install
    Print-Status "Node.js dependencies installed"
} else {
    Print-Warning "package.json not found. Skipping..."
}
Write-Host ""

Write-Host "Step 9: Verifying installation"
Write-Host "--------------------------------"
# Refresh environment variables one more time
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

if (Test-Command node) {
    Print-Info "Node.js: $(node --version)"
} else {
    Print-Warning "Node.js not found in PATH. Please restart PowerShell."
}

if (Test-Command pnpm) {
    Print-Info "pnpm: $(pnpm --version)"
} else {
    Print-Warning "pnpm not found in PATH. Please restart PowerShell."
}

if (Test-Command rustc) {
    $rustInfo = (rustc --version).Split(' ')[0,1] -join ' '
    Print-Info "Rust: $rustInfo"
} else {
    Print-Warning "Rust not found in PATH. Please restart PowerShell."
}

if (Test-Command python) {
    Print-Info "Python: $(python --version)"
} else {
    Print-Warning "Python not found in PATH. Please restart PowerShell."
}
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "✓ Setup Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:"
Write-Host "1. Close and reopen PowerShell (to refresh PATH)"
Write-Host "2. Navigate to project directory"
Write-Host "3. Run: pnpm tauri dev"
Write-Host ""
Write-Host "For production build:"
Write-Host "  pnpm tauri build"
Write-Host ""
Write-Host "Note: You may need to restart your computer for all changes to take effect."
Write-Host ""
