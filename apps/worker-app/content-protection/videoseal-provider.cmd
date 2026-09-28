@echo off
setlocal
if defined CONTENT_PROTECTION_PYTHON (
  "%CONTENT_PROTECTION_PYTHON%" "%~dp0videoseal-provider.py" %*
) else if exist "%~dp0python\python.exe" (
  "%~dp0python\python.exe" "%~dp0videoseal-provider.py" %*
) else (
  py -3.10 "%~dp0videoseal-provider.py" %*
)
exit /b %ERRORLEVEL%
