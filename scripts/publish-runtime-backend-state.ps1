[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$BaseUrl,
  [string]$SyncUrl = '',
  [string]$SyncToken = ''
)

$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

function Normalize-BaseUrl([string]$Value) {
  $trimmed = if ($null -eq $Value) { '' } else { $Value.Trim() }
  if (-not $trimmed) {
    throw 'Use uma URL HTTPS valida para publicar o backend global.'
  }

  $uri = [System.Uri]$trimmed
  if ($uri.Scheme -ne 'https') {
    throw 'A URL publicada no estado global precisa ser HTTPS.'
  }

  return $trimmed.TrimEnd('/')
}

$normalizedBaseUrl = Normalize-BaseUrl -Value $BaseUrl

# Resolve sync URL and token from parameters or environment variables
if (-not $SyncUrl) {
  $SyncUrl = if ($env:ENGLISH_TUTOR_RUNTIME_BACKEND_URL) {
    $env:ENGLISH_TUTOR_RUNTIME_BACKEND_URL
  } else {
    'https://tuturprofessor.vercel.app/api/runtime-backend'
  }
}

if (-not $SyncToken) {
  $SyncToken = $env:ENGLISH_TUTOR_VERCEL_SYNC_TOKEN
}

if (-not $SyncToken) {
  Write-Host ''
  Write-Host '[GitHub runtime state] skipped: ENGLISH_TUTOR_VERCEL_SYNC_TOKEN nao esta definido.' -ForegroundColor Yellow
  Write-Host ''
  exit 0
}

$payload = @{
  baseUrl     = $normalizedBaseUrl
  activatedAt = (Get-Date).ToUniversalTime().ToString('o')
  machineName = $env:COMPUTERNAME
} | ConvertTo-Json

try {
  $response = Invoke-RestMethod -Uri $SyncUrl -Method Post -ContentType 'application/json' -Headers @{
    Authorization = "Bearer $SyncToken"
  } -Body $payload

  Write-Host ''
  Write-Host "[GitHub runtime state] publicado via Vercel API" -ForegroundColor Green
  Write-Host "[GitHub runtime state URL] $($response.baseUrl)" -ForegroundColor Green
  Write-Host ''
} catch {
  Write-Host ''
  Write-Host "[GitHub runtime state] falhou: $($_.Exception.Message)" -ForegroundColor Yellow
  Write-Host "[Sync URL] $SyncUrl" -ForegroundColor Yellow
  Write-Host ''
  exit 1
}
