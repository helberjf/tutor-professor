$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$RuntimeDir = Join-Path $RepoRoot 'tmp'
$TunnelUrlFile = Join-Path $RuntimeDir 'cloudflare-tunnel-url.txt'
$TunnelStdoutFile = Join-Path $RuntimeDir 'cloudflare-tunnel.stdout.log'
$TunnelStderrFile = Join-Path $RuntimeDir 'cloudflare-tunnel.stderr.log'
$TunnelName = $env:CLOUDFLARE_TUNNEL_NAME
$TunnelId = $env:CLOUDFLARE_TUNNEL_ID
$CredentialsFile = if ($env:CLOUDFLARE_TUNNEL_CREDENTIALS_FILE) {
  $env:CLOUDFLARE_TUNNEL_CREDENTIALS_FILE
} elseif ($TunnelId) {
  Join-Path $env:USERPROFILE ".cloudflared\$TunnelId.json"
} else {
  $null
}

function Reset-RuntimeFiles() {
  New-Item -ItemType Directory -Path $RuntimeDir -Force | Out-Null
  foreach ($file in @($TunnelUrlFile, $TunnelStdoutFile, $TunnelStderrFile)) {
    if (Test-Path $file) {
      Remove-Item -LiteralPath $file -Force
    }
  }
}

function Save-TunnelUrl([string]$Line) {
  $patterns = @(
    'https://[a-z0-9\-]+\.trycloudflare\.com',
    'https://[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)+'
  )

  foreach ($pattern in $patterns) {
    if ($Line -match $pattern) {
      $url = $Matches[0].TrimEnd('/', ' ', '|')
      if ($url -match 'website-terms|developers\.cloudflare\.com') {
        return
      }

      Set-Content -Path $TunnelUrlFile -Value $url -Encoding ascii
      Write-Host ''
      Write-Host "[Tunnel URL] $url" -ForegroundColor Green
      Write-Host "[Saved to] $TunnelUrlFile" -ForegroundColor Green
      Write-Host ''
      return
    }
  }
}

function Show-NewLogLines([string]$Path, [ref]$SeenLines) {
  if (-not (Test-Path $Path)) {
    return
  }

  $lines = Get-Content -Path $Path
  if ($lines.Count -le $SeenLines.Value) {
    return
  }

  $newLines = $lines | Select-Object -Skip $SeenLines.Value
  $SeenLines.Value = $lines.Count

  foreach ($line in $newLines) {
    Write-Host $line
    Save-TunnelUrl $line
  }
}

function Start-AndWatchCloudflared([string[]]$Arguments) {
  $process = Start-Process -FilePath 'cloudflared' `
    -ArgumentList $Arguments `
    -RedirectStandardOutput $TunnelStdoutFile `
    -RedirectStandardError $TunnelStderrFile `
    -PassThru

  $stdoutLines = 0
  $stderrLines = 0

  try {
    while (-not $process.HasExited) {
      Show-NewLogLines -Path $TunnelStdoutFile -SeenLines ([ref]$stdoutLines)
      Show-NewLogLines -Path $TunnelStderrFile -SeenLines ([ref]$stderrLines)
      Start-Sleep -Milliseconds 250
    }
  } finally {
    Show-NewLogLines -Path $TunnelStdoutFile -SeenLines ([ref]$stdoutLines)
    Show-NewLogLines -Path $TunnelStderrFile -SeenLines ([ref]$stderrLines)
    if (Test-Path $TunnelUrlFile) {
      Remove-Item -LiteralPath $TunnelUrlFile -Force
    }
    Write-Host ''
    Write-Host 'Tunnel stopped. The saved URL file was cleared to avoid reusing an expired quick tunnel.' -ForegroundColor Yellow
    Write-Host ''
  }

  exit $process.ExitCode
}

Set-Location $RepoRoot
Reset-RuntimeFiles

Write-Host ''
Write-Host 'English Kids Tutor Tunnel'
Write-Host 'Forwarding: http://127.0.0.1:8001'
Write-Host 'Note: this tunnel exposes the backend API. It should not point to the frontend on http://localhost:3000.'
Write-Host "Tunnel URL file: $TunnelUrlFile"
Write-Host "Tunnel logs: $TunnelStderrFile"
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

  Start-AndWatchCloudflared -Arguments @('tunnel', '--config', $TempConfig, 'run', $TunnelName)
}

Write-Host 'Named tunnel settings were not found in the local environment or the credentials file is missing.' -ForegroundColor Yellow
Write-Host 'Falling back to a quick tunnel. This will generate a temporary HTTPS URL.' -ForegroundColor Yellow
Write-Host ''

Start-AndWatchCloudflared -Arguments @('tunnel', '--url', 'http://127.0.0.1:8001')
