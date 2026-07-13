[CmdletBinding()]
param(
  [string]$ContainerName = 'english-kids-tutor-kokoro',
  [string]$Image = 'ghcr.io/remsky/kokoro-fastapi-cpu:v0.1.4',
  [int]$HostPort = 8880,
  [int]$ContainerPort = 8880,
  [string]$LocalRepoPath = '',
  [string]$LocalStartScript = 'start-cpu.ps1'
)

$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

function Test-CommandAvailable([string]$Name, [string]$HelpText) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Command '$Name' was not found. $HelpText"
  }
}

function Get-ContainerState([string]$Name) {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'SilentlyContinue'
  $state = docker container inspect --format "{{.State.Status}}" $Name 2>&1
  $code = $LASTEXITCODE
  $ErrorActionPreference = $prev

  if ($code -ne 0) {
    return $null
  }

  $line = $state | Where-Object { $_ -is [string] -and $_ -notmatch 'Error' } | Select-Object -First 1
  if (-not $line) { return $null }
  return $line.Trim()
}

function Resolve-LocalKokoroRepo([string]$PreferredPath) {
  $candidates = @()

  if ($PreferredPath) {
    $candidates += $PreferredPath
  }

  if ($env:KOKORO_LOCAL_REPO) {
    $candidates += $env:KOKORO_LOCAL_REPO
  }

  $candidates += @(
    (Join-Path $RepoRoot 'packages\Kokoro-FastAPI'),
    (Join-Path $RepoRoot 'packages\kokoro-fastapi'),
    (Join-Path $RepoRoot 'packages\kokoro'),
    (Join-Path $RepoRoot 'vendor\Kokoro-FastAPI'),
    (Join-Path $RepoRoot '..\Kokoro-FastAPI')
  )

  foreach ($candidate in $candidates) {
    if (-not $candidate) {
      continue
    }

    try {
      $resolved = (Resolve-Path $candidate -ErrorAction Stop).Path
      if (Test-Path (Join-Path $resolved $LocalStartScript)) {
        return $resolved
      }
    } catch {
    }
  }

  return $null
}

function Start-LocalKokoroRepo([string]$RepoPath) {
  if (-not $RepoPath) {
    return $false
  }

  $startScriptPath = Join-Path $RepoPath $LocalStartScript
  if (-not (Test-Path $startScriptPath)) {
    return $false
  }

  Write-Host ''
  Write-Host 'Tutor and Professor Kokoro TTS' -ForegroundColor Cyan
  Write-Host "Mode: local repository" -ForegroundColor Green
  Write-Host "Repository: $RepoPath"
  Write-Host "Script: $startScriptPath"
  Write-Host "URL: http://127.0.0.1:$HostPort/v1/audio/speech"
  Write-Host ''

  Set-Location $RepoPath
  & $startScriptPath
  return $true
}

$resolvedLocalRepo = Resolve-LocalKokoroRepo -PreferredPath $LocalRepoPath
if ($resolvedLocalRepo) {
  Start-LocalKokoroRepo -RepoPath $resolvedLocalRepo
  exit $LASTEXITCODE
}

Test-CommandAvailable docker 'Install Docker Desktop and try again, or clone Kokoro-FastAPI locally and set KOKORO_LOCAL_REPO.'

docker info *> $null
if ($LASTEXITCODE -ne 0) {
  throw 'No local Kokoro repository was found, and Docker Desktop is not running. Start Docker Desktop or set KOKORO_LOCAL_REPO to your Kokoro-FastAPI folder.'
}

Write-Host ''
Write-Host 'Tutor and Professor Kokoro TTS'
Write-Host 'Mode: docker fallback' -ForegroundColor Yellow
Write-Host "Image: $Image"
Write-Host "URL: http://127.0.0.1:$HostPort/v1/audio/speech"
Write-Host ''

$state = Get-ContainerState -Name $ContainerName

if ($state -eq 'running') {
  Write-Host "Kokoro container '$ContainerName' is already running." -ForegroundColor Green
  docker logs --tail 20 -f $ContainerName
  exit $LASTEXITCODE
}

if ($state) {
  Write-Host "Starting existing Kokoro container '$ContainerName'..." -ForegroundColor Cyan
  docker start $ContainerName | Out-Null
  docker logs --tail 20 -f $ContainerName
  exit $LASTEXITCODE
}

Write-Host "Starting new Kokoro container '$ContainerName'..." -ForegroundColor Cyan
docker run --rm --name $ContainerName -p "${HostPort}:${ContainerPort}" $Image
