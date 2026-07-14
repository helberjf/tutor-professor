$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$TempRoot = Join-Path $RepoRoot 'tmp\test-ensure-postgres-docker-not-ready'
$FakeBin = Join-Path $TempRoot 'bin'
$FakeProgramFiles = Join-Path $TempRoot 'ProgramFiles'
$FakeDocker = Join-Path $FakeBin 'docker.cmd'

if (Test-Path $TempRoot) {
  Remove-Item -LiteralPath $TempRoot -Recurse -Force -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Path $FakeBin, $FakeProgramFiles -Force | Out-Null

@'
@echo off
if "%1"=="info" (
  echo failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine 1>&2
  exit /b 1
)
if "%1"=="compose" (
  echo docker compose should not be called when the daemon is offline 1>&2
  exit /b 1
)
exit /b 1
'@ | Set-Content -LiteralPath $FakeDocker -Encoding ASCII

$previousPath = $env:PATH
$previousProgramFiles = $env:ProgramFiles
$previousLocalAppData = $env:LOCALAPPDATA

try {
  $env:PATH = "$FakeBin;$previousPath"
  $env:ProgramFiles = $FakeProgramFiles
  $env:LOCALAPPDATA = Join-Path $TempRoot 'LocalAppData'

  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'ensure-postgres.ps1') `
      -DatabaseUrl 'postgresql://kids_tutor:kids_tutor_secret@127.0.0.1:65432/kids_tutor' `
      -TimeoutSeconds 1 2>&1
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }

  if ($exitCode -eq 0) {
    throw 'ensure-postgres.ps1 unexpectedly succeeded while Docker daemon was offline.'
  }

  $joinedOutput = ($output | Out-String)
  if ($joinedOutput -match 'docker : failed to connect to the docker API') {
    throw "ensure-postgres.ps1 leaked a native Docker stderr failure instead of handling it:`n$joinedOutput"
  }

  if ($joinedOutput -notmatch 'Docker Desktop did not become ready in time') {
    if ($joinedOutput -notmatch 'Docker Desktop was not found') {
      throw "ensure-postgres.ps1 did not show the expected Docker readiness message:`n$joinedOutput"
    }
  }

  Write-Host 'ensure-postgres docker-not-ready check passed.'
} finally {
  $env:PATH = $previousPath
  $env:ProgramFiles = $previousProgramFiles
  $env:LOCALAPPDATA = $previousLocalAppData
  if (Test-Path $TempRoot) {
    Remove-Item -LiteralPath $TempRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
