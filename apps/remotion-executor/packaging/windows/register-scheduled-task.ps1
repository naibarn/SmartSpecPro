[CmdletBinding()]
param(
  [ValidateSet("Register", "Unregister")][string]$Action = "Register",
  [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA "SmartAIHub\RemotionExecutor")
)
$ErrorActionPreference = "Stop"
$taskName = "SmartAIHub Remotion Executor"
if ($Action -eq "Unregister") { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue; exit 0 }
$runtimeRoot = Join-Path $InstallRoot "runtime-pack"
$node = Join-Path $runtimeRoot "node\node.exe"
$cli = Join-Path $runtimeRoot "executor\dist\cli.js"
if (-not (Test-Path $node) -or -not (Test-Path $cli)) { throw "Install the verified Remotion Executor pack before registering the scheduled task." }
$action = New-ScheduledTaskAction -Execute $node -Argument "`"$cli`" start"
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel LeastPrivilege
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null
Write-Host "Scheduled task registered: $taskName"
