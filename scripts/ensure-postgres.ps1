[CmdletBinding()]
param(
  [string]$DatabaseUrl = '',
  [int]$TimeoutSeconds = 90
)

$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$ApiEnv = Join-Path $RepoRoot 'apps\api\.env'

function Get-EnvValueFromFile([string]$FilePath, [string]$Key) {
  if (-not (Test-Path $FilePath)) {
    return $null
  }

  $match = Get-Content $FilePath | Where-Object {
    $_ -match "^\s*$([regex]::Escape($Key))\s*="
  } | Select-Object -First 1

  if (-not $match) {
    return $null
  }

  return (($match -split '=', 2)[1]).Trim()
}

function Test-TcpPort([string]$HostName, [int]$Port) {
  return Test-NetConnection -ComputerName $HostName -Port $Port `
    -InformationLevel Quiet -WarningAction SilentlyContinue -ErrorAction SilentlyContinue
}

function Wait-ForDockerDaemon([int]$TimeoutSeconds) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-DockerDaemon) {
      return $true
    }
    Start-Sleep -Seconds 3
  }
  return $false
}

function Test-DockerDaemon() {
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    docker info *> $null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
}

function Start-DockerDesktopIfInstalled() {
  $paths = @(
    "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
    "$env:LOCALAPPDATA\Docker\Docker Desktop.exe"
  )

  foreach ($path in $paths) {
    if (Test-Path $path) {
      Start-Process -FilePath $path | Out-Null
      return $true
    }
  }

  return $false
}

if (-not $DatabaseUrl) {
  $DatabaseUrl = $env:DATABASE_URL
}
if (-not $DatabaseUrl) {
  $DatabaseUrl = Get-EnvValueFromFile -FilePath $ApiEnv -Key 'DATABASE_URL'
}

if (-not $DatabaseUrl -or $DatabaseUrl -notmatch '^postgres(?:ql)?://') {
  Write-Host 'PostgreSQL startup skipped because DATABASE_URL is not a PostgreSQL URL.' -ForegroundColor Yellow
  return
}

try {
  $uri = [System.Uri]$DatabaseUrl
} catch {
  throw 'DATABASE_URL is not a valid URL.'
}

$hostName = $uri.Host
$port = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
$isLocalPostgres = $hostName -in @('127.0.0.1', 'localhost')

if (-not $isLocalPostgres) {
  Write-Host "PostgreSQL startup skipped because DATABASE_URL points to remote host '$hostName'." -ForegroundColor Yellow
  return
}

if (Test-TcpPort -HostName $hostName -Port $port) {
  Write-Host "PostgreSQL is already responding on ${hostName}:${port}." -ForegroundColor Green
  return
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker was not found, and PostgreSQL is not responding on ${hostName}:${port}."
}

if (-not (Test-DockerDaemon)) {
  Write-Host 'Docker Desktop is not ready. Starting Docker Desktop...' -ForegroundColor Yellow
  if (-not (Start-DockerDesktopIfInstalled)) {
    throw 'Docker Desktop was not found. Start PostgreSQL manually and try again.'
  }
  if (-not (Wait-ForDockerDaemon -TimeoutSeconds $TimeoutSeconds)) {
    throw 'Docker Desktop did not become ready in time. Start it manually and try again.'
  }
}

Set-Location $RepoRoot
Write-Host 'Starting local PostgreSQL container...' -ForegroundColor Cyan
docker compose up db -d
if ($LASTEXITCODE -ne 0) {
  throw 'Failed to start the local PostgreSQL container.'
}

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
while ((Get-Date) -lt $deadline) {
  if (Test-TcpPort -HostName $hostName -Port $port) {
    Write-Host "PostgreSQL is responding on ${hostName}:${port}." -ForegroundColor Green
    return
  }
  Start-Sleep -Seconds 2
}

throw "PostgreSQL did not respond on ${hostName}:${port} within $TimeoutSeconds seconds."
