[CmdletBinding()]
param(
  [string]$ServerUrl = "https://smartaihub.app",
  [ValidateSet("remotion-executor-windows-x64")]
  [string]$RuntimeId = "remotion-executor-windows-x64",
  [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA "SmartAIHub\RemotionExecutor"),
  [string]$PublicKey = ""
)

$ErrorActionPreference = "Stop"
$ServerUrl = $ServerUrl.TrimEnd("/")
$manifestUri = "$ServerUrl/api/workers/runtime-pack/manifest?runtimeId=$RuntimeId"
$stateRoot = [IO.Path]::GetFullPath($InstallRoot)
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$embeddedPublicKey = Join-Path $scriptRoot "runtime-pack-public-key.pem"
if (-not $PublicKey -and (Test-Path $embeddedPublicKey)) { $PublicKey = Get-Content -Raw -LiteralPath $embeddedPublicKey }
$stagingRoot = Join-Path ([IO.Path]::GetTempPath()) ("smartaihub-remotion-install-" + [guid]::NewGuid().ToString("N"))
$archivePath = Join-Path $stagingRoot "runtime.zip"

if (-not $PublicKey.Trim()) {
  throw "This installer has no pinned SmartAIHub runtime-pack public key. Download the complete signed runtime pack and run the installer from its extracted packaging directory."
}
$node = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $node) { throw "Node.js 22 is required for the signed bootstrap verifier. Install the official SmartAIHub executor bundle or Node.js 22, then run this installer again." }

try {
  New-Item -ItemType Directory -Force -Path $stagingRoot | Out-Null
  $manifest = Invoke-RestMethod -Uri $manifestUri -Method Get -Headers @{ Accept = "application/json" }
  if ($manifest.runtimeId -ne $RuntimeId -or $manifest.allowed -ne $true) { throw "The selected Remotion runtime pack is not published or is disabled." }
  $archiveUri = [Uri]::new(([Uri]$ServerUrl), [string]$manifest.archiveUrl)
  if ($archiveUri.Scheme -ne "https" -or $archiveUri.Host -ne ([Uri]$ServerUrl).Host) { throw "The runtime archive URL is not an allowed SmartAIHub HTTPS URL." }
  Invoke-WebRequest -Uri $archiveUri.AbsoluteUri -OutFile $archivePath -UseBasicParsing
  $actualHash = (Get-FileHash -Algorithm SHA256 -Path $archivePath).Hash.ToLowerInvariant()
  if ($actualHash -ne ([string]$manifest.archiveSha256).ToLowerInvariant()) { throw "Runtime pack checksum verification failed." }

  $env:SMARTAIHUB_VERIFY_ARCHIVE = $archivePath
  $env:SMARTAIHUB_VERIFY_SHA256 = $actualHash
  $env:SMARTAIHUB_VERIFY_SIGNATURE = [string]$manifest.archiveSignature
  $env:SMARTAIHUB_VERIFY_PUBLIC_KEY = $PublicKey
  $verifier = Join-Path $stagingRoot "verify.mjs"
  @'
import crypto from "node:crypto";
import fs from "node:fs";
const archive = fs.readFileSync(process.env.SMARTAIHUB_VERIFY_ARCHIVE);
const digest = crypto.createHash("sha256").update(archive).digest("hex");
if (digest !== process.env.SMARTAIHUB_VERIFY_SHA256) throw new Error("checksum_mismatch");
if (!crypto.verify(null, Buffer.from(digest), crypto.createPublicKey(process.env.SMARTAIHUB_VERIFY_PUBLIC_KEY), Buffer.from(process.env.SMARTAIHUB_VERIFY_SIGNATURE, "base64"))) throw new Error("signature_invalid");
'@ | Set-Content -LiteralPath $verifier -Encoding UTF8
  & $node.Source $verifier
  if ($LASTEXITCODE -ne 0) { throw "Runtime pack Ed25519 signature verification failed." }

  $extractRoot = Join-Path $stagingRoot "extract"
  Expand-Archive -LiteralPath $archivePath -DestinationPath $extractRoot -Force
  $runtimeSource = Join-Path $extractRoot "runtime-pack"
  if (-not (Test-Path (Join-Path $runtimeSource "manifest.json"))) { throw "Runtime archive layout is invalid." }
  New-Item -ItemType Directory -Force -Path $stateRoot | Out-Null
  $runtimeRoot = Join-Path $stateRoot "runtime-pack"
  $previous = "$runtimeRoot.previous"
  Remove-Item -LiteralPath $previous -Recurse -Force -ErrorAction SilentlyContinue
  if (Test-Path $runtimeRoot) { Move-Item -LiteralPath $runtimeRoot -Destination $previous }
  try { Move-Item -LiteralPath $runtimeSource -Destination $runtimeRoot } catch { if (Test-Path $previous) { Move-Item -LiteralPath $previous -Destination $runtimeRoot }; throw }

  $binRoot = Join-Path $env:LOCALAPPDATA "SmartAIHub\bin"
  New-Item -ItemType Directory -Force -Path $binRoot | Out-Null
  $cmdPath = Join-Path $binRoot "smartaihub-remotion-executor.cmd"
@"
@echo off
set "SMARTAIHUB_EXECUTOR_ROOT=$stateRoot"
"$runtimeRoot\node\node.exe" "$runtimeRoot\executor\dist\cli.js" %*
"@ | Set-Content -LiteralPath $cmdPath -Encoding ASCII
  Write-Host "Remotion Executor installed at $stateRoot"
  Write-Host "If SmartAIHub\bin is not on PATH, run: `$env:Path += ';$binRoot'"
  Write-Host "Next: smartaihub-remotion-executor doctor; smartaihub-remotion-executor connect; smartaihub-remotion-executor start"
} finally {
  Remove-Item -LiteralPath $stagingRoot -Recurse -Force -ErrorAction SilentlyContinue
}
