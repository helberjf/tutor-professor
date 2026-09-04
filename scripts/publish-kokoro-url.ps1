<#
.SYNOPSIS
  Tell the hosted API where Kokoro can be reached right now.

.DESCRIPTION
  When the backend runs on this machine the tunnel exposes the API and the
  frontend is told about it (publish-runtime-backend-state.ps1). When the backend
  runs somewhere else, the direction reverses: the tunnel exposes Kokoro, and it
  is the *backend* that needs to be told the address.

  A quick tunnel gets a new address every restart, and a hosted deployment's
  environment variables are fixed until the next deploy — so the address goes
  into a config row through POST /api/runtime/tts-backend, guarded by a shared
  token.

  With a named tunnel and a fixed hostname you do not need this at all: set
  KOKORO_URL on the API and skip it.

.PARAMETER TunnelUrl
  The tunnel's base address, e.g. https://something.trycloudflare.com. The
  /v1/audio/speech path is appended unless you already included a path.

.PARAMETER ApiUrl
  The API's base address. Defaults to ENGLISH_TUTOR_API_URL.

.PARAMETER SyncToken
  Must match RUNTIME_SYNC_TOKEN on the API. Defaults to
  ENGLISH_TUTOR_RUNTIME_SYNC_TOKEN.

.EXAMPLE
  ./scripts/publish-kokoro-url.ps1 -TunnelUrl https://abc-def.trycloudflare.com
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$TunnelUrl,
  [string]$ApiUrl = '',
  [string]$SyncToken = ''
)

$ErrorActionPreference = 'Stop'

function Resolve-KokoroSpeechUrl([string]$Value) {
  $trimmed = if ($null -eq $Value) { '' } else { $Value.Trim() }
  if (-not $trimmed) {
    throw 'Informe a URL do tunnel do Kokoro.'
  }

  $uri = [System.Uri]$trimmed
  if ($uri.Scheme -ne 'https') {
    # The shared token travels on this request, and the API refuses plain http
    # for the same reason.
    throw 'A URL do Kokoro precisa ser HTTPS.'
  }

  $withoutTrailingSlash = $trimmed.TrimEnd('/')
  if ($uri.AbsolutePath -and $uri.AbsolutePath -ne '/') {
    return $withoutTrailingSlash
  }
  return "$withoutTrailingSlash/v1/audio/speech"
}

$speechUrl = Resolve-KokoroSpeechUrl -Value $TunnelUrl

if (-not $ApiUrl) {
  $ApiUrl = $env:ENGLISH_TUTOR_API_URL
}
if (-not $ApiUrl) {
  throw 'Defina -ApiUrl ou a variavel ENGLISH_TUTOR_API_URL com o endereco da API.'
}

if (-not $SyncToken) {
  $SyncToken = $env:ENGLISH_TUTOR_RUNTIME_SYNC_TOKEN
}
if (-not $SyncToken) {
  # Skipping quietly rather than failing: the tunnel is already up and useful
  # locally, and a missing token is a setup gap, not a reason to stop.
  Write-Host 'ENGLISH_TUTOR_RUNTIME_SYNC_TOKEN nao definido; pulando a publicacao.' -ForegroundColor Yellow
  exit 0
}

$endpoint = "$($ApiUrl.TrimEnd('/'))/api/runtime/tts-backend"
$body = @{ base_url = $speechUrl } | ConvertTo-Json -Compress

try {
  Invoke-RestMethod -Method Post -Uri $endpoint `
    -Headers @{ Authorization = "Bearer $SyncToken" } `
    -ContentType 'application/json' `
    -Body $body | Out-Null
  Write-Host "Kokoro publicado: $speechUrl" -ForegroundColor Green
} catch {
  Write-Host "Falha ao publicar o Kokoro: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
