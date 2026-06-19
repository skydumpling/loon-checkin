param(
  [string]$TaskName = "DailyBrowserCheckin",
  [string]$At = "09:00"
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$cmdPath = Join-Path $scriptDir "run-all.cmd"

if (-not (Test-Path $cmdPath)) {
  throw "Cannot find $cmdPath"
}

$action = New-ScheduledTaskAction -Execute $cmdPath
$trigger = New-ScheduledTaskTrigger -Daily -At $At
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description "Daily browser-based check-in tasks" -Force | Out-Null
Write-Host "Installed scheduled task '$TaskName' at $At"
