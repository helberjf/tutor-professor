[CmdletBinding()]
param(
  [string]$TunnelUrlFile = '',
  [int]$WaitForTunnelUrlSeconds = 0
)

$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$ApiDir = Join-Path $RepoRoot 'apps\api'
$PostgresEnsurer = Join-Path $PSScriptRoot 'ensure-postgres.ps1'
$ConnectPageUrl = if ($env:ENGLISH_TUTOR_CONNECT_URL) {
  $env:ENGLISH_TUTOR_CONNECT_URL
} else {
  'https://tuturprofessor.vercel.app/connect'
}

function Get-ConnectLink([string]$TunnelUrl) {
  if (-not $TunnelUrl) {
    return $null
  }

  $encoded = [System.Uri]::EscapeDataString($TunnelUrl)
  return "$ConnectPageUrl?apiUrl=$encoded&auto=1"
}

function Get-TunnelUrl([string]$FilePath) {
  if (-not $FilePath -or -not (Test-Path $FilePath)) {
    return $null
  }

  $value = Get-Content -Path $FilePath -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $value) {
    return $null
  }

  $url = $value.Trim()
  if (-not $url) {
    return $null
  }

  return $url
}

function Wait-ForTunnelUrl([string]$FilePath, [int]$TimeoutSeconds) {
  if (-not $FilePath -or $TimeoutSeconds -le 0) {
    return Get-TunnelUrl $FilePath
  }

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $url = Get-TunnelUrl $FilePath
    if ($url) {
      return $url
    }

    Start-Sleep -Milliseconds 500
  }

  return $null
}

$tunnelUrl = Wait-ForTunnelUrl -FilePath $TunnelUrlFile -TimeoutSeconds $WaitForTunnelUrlSeconds
$connectLink = Get-ConnectLink $tunnelUrl
$kokoroUrl = if ($env:KOKORO_URL) {
  $env:KOKORO_URL
} else {
  'from apps/api/.env or default http://127.0.0.1:8880/v1/audio/speech'
}

Set-Location $ApiDir
Write-Host ''
Write-Host 'Tutor and Professor API'
Write-Host "Folder: $ApiDir"
Write-Host 'URL: http://localhost:8001'
Write-Host "Kokoro URL: $kokoroUrl"
if ($tunnelUrl) {
  Write-Host "Cloudflare URL: $tunnelUrl" -ForegroundColor Green
  Write-Host 'Use this URL in https://tuturprofessor.vercel.app/connect' -ForegroundColor Green
  if ($connectLink) {
    Write-Host "Auto-connect link: $connectLink" -ForegroundColor Green
  }
} elseif ($TunnelUrlFile) {
  Write-Host "Cloudflare URL: waiting or unavailable. Check $TunnelUrlFile" -ForegroundColor Yellow
}
Write-Host ''

& $PostgresEnsurer

python database_bootstrap.py
if ($LASTEXITCODE -ne 0) {
  throw "Database bootstrap failed with exit code $LASTEXITCODE."
}

python -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload
