[CmdletBinding()]
param([string]$InstallRoot = (Join-Path $env:LOCALAPPDATA "SmartAIHub\RemotionExecutor"))
$ErrorActionPreference = "Stop"
& (Join-Path $PSScriptRoot "register-scheduled-task.ps1") -Action Unregister -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $InstallRoot "runtime-pack") -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $env:LOCALAPPDATA "SmartAIHub\bin\smartaihub-remotion-executor.cmd") -Force -ErrorAction SilentlyContinue
Write-Host "Runtime pack and launcher removed. Protected credentials were not deleted; use logout or Connected Devices to revoke access."
