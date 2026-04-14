[CmdletBinding()]
param(
  [string]$TunnelUrlFile = '',
  [int]$WaitForTunnelUrlSeconds = 0
)

$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$ApiDir = Join-Path $RepoRoot 'apps\api'
$ConnectPageUrl = if ($env:ENGLISH_TUTOR_CONNECT_URL) {
  $env:ENGLISH_TUTOR_CONNECT_URL
} else {
  'https://english-tutor-kid.vercel.app/connect'
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

Set-Location $ApiDir
Write-Host ''
Write-Host 'English Kids Tutor API'
Write-Host "Folder: $ApiDir"
Write-Host 'URL: http://localhost:8001'
if ($tunnelUrl) {
  Write-Host "Cloudflare URL: $tunnelUrl" -ForegroundColor Green
  Write-Host 'Use this URL in https://english-tutor-kid.vercel.app/connect' -ForegroundColor Green
  if ($connectLink) {
    Write-Host "Auto-connect link: $connectLink" -ForegroundColor Green
  }
} elseif ($TunnelUrlFile) {
  Write-Host "Cloudflare URL: waiting or unavailable. Check $TunnelUrlFile" -ForegroundColor Yellow
}
Write-Host ''

python -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload
