$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$TunnelName = $env:CLOUDFLARE_TUNNEL_NAME
$TunnelId = $env:CLOUDFLARE_TUNNEL_ID
$CredentialsFile = if ($env:CLOUDFLARE_TUNNEL_CREDENTIALS_FILE) {
  $env:CLOUDFLARE_TUNNEL_CREDENTIALS_FILE
} elseif ($TunnelId) {
  Join-Path $env:USERPROFILE ".cloudflared\$TunnelId.json"
} else {
  $null
}

Set-Location $RepoRoot
Write-Host ''
Write-Host 'English Kids Tutor Tunnel'
Write-Host 'Forwarding: http://127.0.0.1:8001'
Write-Host 'Note: this tunnel exposes the backend API. It should not point to the frontend on http://localhost:3000.'
Write-Host ''

if ($TunnelName -and $TunnelId -and $CredentialsFile -and (Test-Path $CredentialsFile)) {
  $TempConfig = Join-Path $env:TEMP "english-kids-tutor-cloudflared-$TunnelId.yml"
  @"
tunnel: $TunnelId
credentials-file: $CredentialsFile

ingress:
  - service: http://127.0.0.1:8001
  - service: http_status:404
"@ | Set-Content -Path $TempConfig -Encoding ascii

  Write-Host 'Using configured named tunnel from local environment.'
  Write-Host "Tunnel name: $TunnelName"
  Write-Host "Credentials file: $CredentialsFile"
  Write-Host ''

  cloudflared tunnel --config $TempConfig run $TunnelName
  exit $LASTEXITCODE
}

Write-Host 'Named tunnel settings were not found in the local environment or the credentials file is missing.' -ForegroundColor Yellow
Write-Host 'Falling back to a quick tunnel. This will generate a temporary HTTPS URL.' -ForegroundColor Yellow
Write-Host ''

cloudflared tunnel --url http://127.0.0.1:8001
