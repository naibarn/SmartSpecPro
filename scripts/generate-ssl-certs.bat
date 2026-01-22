@echo off
REM SSL Certificate Generation Script for SmartSpec Pro (Windows)
REM Generates self-signed SSL certificates for local HTTPS development

setlocal enabledelayedexpansion

set CERT_DIR=nginx\ssl
set DOMAIN=smartspec.local
set SCRIPT_DIR=%~dp0
set PROJECT_ROOT=%SCRIPT_DIR%..

cd /d "%PROJECT_ROOT%"

echo ================================
echo SmartSpec Pro SSL Setup
echo ================================
echo.

REM Check if OpenSSL is installed
where openssl >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: OpenSSL is not installed or not in PATH
    echo.
    echo Please install OpenSSL first:
    echo Option 1: Use Git Bash (includes OpenSSL)
    echo Option 2: Download from: https://slproweb.com/products/Win32OpenSSL.html
    echo Option 3: Install via Chocolatey: choco install openssl
    echo.
    pause
    exit /b 1
)

REM Create SSL directory if it doesn't exist
if not exist "%CERT_DIR%" (
    echo Creating SSL directory: %CERT_DIR%
    mkdir "%CERT_DIR%"
)

REM Check if certificates already exist
if exist "%CERT_DIR%\%DOMAIN%.crt" (
    if exist "%CERT_DIR%\%DOMAIN%.key" (
        echo.
        echo WARNING: SSL certificates already exist!
        set /p REGENERATE="Do you want to regenerate them? (Y/N): "
        if /i not "!REGENERATE!"=="Y" (
            echo Using existing certificates.
            pause
            exit /b 0
        )
        echo Regenerating certificates...
    )
)

echo.
echo Generating SSL certificate for %DOMAIN% and subdomains...
echo.

REM Create OpenSSL config file
echo Creating OpenSSL configuration...
(
echo [req]
echo default_bits = 2048
echo prompt = no
echo default_md = sha256
echo distinguished_name = dn
echo req_extensions = v3_req
echo.
echo [dn]
echo C=TH
echo ST=Bangkok
echo L=Bangkok
echo O=SmartSpec Development
echo OU=Development
echo CN=%DOMAIN%
echo.
echo [v3_req]
echo subjectAltName = @alt_names
echo.
echo [alt_names]
echo DNS.1 = %DOMAIN%
echo DNS.2 = *.%DOMAIN%
echo DNS.3 = localhost
echo DNS.4 = *.localhost
echo IP.1 = 127.0.0.1
echo IP.2 = ::1
) > "%CERT_DIR%\openssl.cnf"

REM Generate private key
echo Step 1/3: Generating private key...
openssl genrsa -out "%CERT_DIR%\%DOMAIN%.key" 2048
if %ERRORLEVEL% neq 0 (
    echo ERROR: Failed to generate private key
    pause
    exit /b 1
)

REM Generate certificate signing request
echo Step 2/3: Generating certificate signing request...
openssl req -new -key "%CERT_DIR%\%DOMAIN%.key" -out "%CERT_DIR%\%DOMAIN%.csr" -config "%CERT_DIR%\openssl.cnf"
if %ERRORLEVEL% neq 0 (
    echo ERROR: Failed to generate CSR
    pause
    exit /b 1
)

REM Generate self-signed certificate
echo Step 3/3: Generating self-signed certificate...
openssl x509 -req -days 365 -in "%CERT_DIR%\%DOMAIN%.csr" -signkey "%CERT_DIR%\%DOMAIN%.key" -out "%CERT_DIR%\%DOMAIN%.crt" -extensions v3_req -extfile "%CERT_DIR%\openssl.cnf"
if %ERRORLEVEL% neq 0 (
    echo ERROR: Failed to generate certificate
    pause
    exit /b 1
)

REM Clean up temporary files
del "%CERT_DIR%\%DOMAIN%.csr"
del "%CERT_DIR%\openssl.cnf"

echo.
echo ================================
echo SUCCESS: SSL certificates generated!
echo ================================
echo.
echo Certificate files:
echo   - Private Key: %CERT_DIR%\%DOMAIN%.key
echo   - Certificate:  %CERT_DIR%\%DOMAIN%.crt
echo.
echo Certificate covers the following domains:
echo   - %DOMAIN%
echo   - *.%DOMAIN% (all subdomains)
echo   - localhost
echo   - *.localhost
echo.
echo ================================
echo Next Steps:
echo ================================
echo.
echo 1. Update your hosts file:
echo    File: C:\Windows\System32\drivers\etc\hosts
echo    (Open Notepad as Administrator)
echo.
echo    Add these lines:
echo    127.0.0.1 smartspec.local
echo    127.0.0.1 docker.smartspec.local
echo.
echo 2. Trust the certificate in your browser:
echo.
echo    Chrome/Edge:
echo    - Settings ^> Privacy and security ^> Security
echo    - Manage certificates ^> Trusted Root Certification Authorities
echo    - Import ^> Select: %CD%\%CERT_DIR%\%DOMAIN%.crt
echo.
echo    Firefox:
echo    - Settings ^> Privacy ^& Security ^> Certificates
echo    - View Certificates ^> Authorities ^> Import
echo    - Select: %CD%\%CERT_DIR%\%DOMAIN%.crt
echo.
echo 3. Restart services:
echo    docker-compose down ^&^& docker-compose up -d
echo.
echo 4. Access via HTTPS:
echo    https://smartspec.local
echo    https://docker.smartspec.local
echo.
echo ================================
echo.
echo Press any key to open the certificate location...
pause >nul

explorer "%CD%\%CERT_DIR%"

endlocal
