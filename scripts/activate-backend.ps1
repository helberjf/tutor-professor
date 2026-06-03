# activate-backend.ps1
# Pressupoe que o backend local ja esta rodando em :8001.
# Sobe tunnel novo e registra na Vercel. Use ativar-tudo.cmd para o fluxo completo.

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$SecretsFile = Join-Path $RepoRoot 'local.secrets'
$RuntimeDir = Join-Path $RepoRoot 'tmp'
$TunnelUrlFile = Join-Path $RuntimeDir 'cloudflare-tunnel-url.txt'
$TunnelStderrFile = Join-Path $RuntimeDir 'cloudflare-tunnel.stderr.log'
$TunnelStdoutFile = Join-Path $RuntimeDir 'cloudflare-tunnel.stdout.log'
$TunnelRunner = Join-Path $PSScriptRoot 'run-tunnel.ps1'
$PowerShellExe = (Get-Command powershell -ErrorAction Stop).Source

$RuntimeBackendSyncUrl = if ($env:ENGLISH_TUTOR_RUNTIME_BACKEND_URL) {
  $env:ENGLISH_TUTOR_RUNTIME_BACKEND_URL
} else {
  'https://english-tutor-kid.vercel.app/api/runtime-backend'
}

$ProgressActivity = 'Ativando backend global'

function Write-Step([string]$Message) {
  Write-Host ''
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Get-ValueFromSecretsFile([string]$Key) {
  if (-not (Test-Path $SecretsFile)) { return $null }
  $match = Get-Content $SecretsFile | Where-Object {
    $_ -match "^\s*$([regex]::Escape($Key))\s*="
  } | Select-Object -First 1
  if (-not $match) { return $null }
  return (($match -split '=', 2)[1]).Trim()
}

function Wait-ForTunnelUrl([string]$FilePath, [int]$TimeoutSeconds = 45) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $startTime = Get-Date
  while ((Get-Date) -lt $deadline) {
    if (Test-Path $FilePath) {
      $raw = (Get-Content -Path $FilePath -ErrorAction SilentlyContinue | Select-Object -First 1)
      if ($raw) {
        $url = $raw.Trim()
        if ($url -match '^https://') { return $url }
      }
    }
    $elapsed = [int]((Get-Date) - $startTime).TotalSeconds
    $pct = [math]::Min(69, 20 + [int](($elapsed / $TimeoutSeconds) * 49))
    Write-Progress -Activity $ProgressActivity `
      -Status "Aguardando Cloudflare Tunnel publicar URL... ($($elapsed)s)" `
      -PercentComplete $pct
    Start-Sleep -Milliseconds 500
  }
  return $null
}

function Stop-RunningCloudflared() {
  $procs = Get-Process -Name cloudflared -ErrorAction SilentlyContinue
  if ($procs) {
    Write-Host "Encerrando $($procs.Count) processo(s) cloudflared antigo(s)..." -ForegroundColor Yellow
    $procs | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 800
  }
}

# ─────────────────────────────────────────────────────────────────────────────

Write-Host ''
Write-Host '=============================================' -ForegroundColor Green
Write-Host '  English Kids Tutor - Ativar Backend Global' -ForegroundColor Green
Write-Host '=============================================' -ForegroundColor Green

# ── 1. Token ──────────────────────────────────────────────────────────────────
Write-Step 'Lendo configuracoes locais'
Write-Progress -Activity $ProgressActivity -Status 'Lendo token...' -PercentComplete 5

$tokenFromFile = Get-ValueFromSecretsFile -Key 'ENGLISH_TUTOR_VERCEL_SYNC_TOKEN'
if ($tokenFromFile) {
  $env:ENGLISH_TUTOR_VERCEL_SYNC_TOKEN = $tokenFromFile
  Write-Host 'Token carregado de local.secrets.' -ForegroundColor Green
}

$syncToken = $env:ENGLISH_TUTOR_VERCEL_SYNC_TOKEN
if (-not $syncToken -or $syncToken -eq 'your_token_here') {
  Write-Progress -Activity $ProgressActivity -Completed
  Write-Host ''
  Write-Host 'X ENGLISH_TUTOR_VERCEL_SYNC_TOKEN nao configurado.' -ForegroundColor Red
  Write-Host '  1. local.secrets: ENGLISH_TUTOR_VERCEL_SYNC_TOKEN=<senha>' -ForegroundColor Yellow
  Write-Host '  2. Vercel env: VERCEL_BACKEND_SYNC_TOKEN=<mesma_senha> + redeploy' -ForegroundColor Yellow
  Write-Host ''
  exit 1
}

# ── 2. Pre-requisitos ─────────────────────────────────────────────────────────
Write-Step 'Verificando pre-requisitos'
Write-Progress -Activity $ProgressActivity -Status 'Checando dependencias...' -PercentComplete 10

if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  Write-Progress -Activity $ProgressActivity -Completed
  Write-Host ''
  Write-Host 'X cloudflared nao encontrado.' -ForegroundColor Red
  Write-Host '  Instale: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/' -ForegroundColor Yellow
  Write-Host ''
  exit 1
}
Write-Host 'cloudflared encontrado.' -ForegroundColor Green

$backendOk = Test-NetConnection -ComputerName '127.0.0.1' -Port 8001 `
  -InformationLevel Quiet -WarningAction SilentlyContinue -ErrorAction SilentlyContinue
if (-not $backendOk) {
  Write-Progress -Activity $ProgressActivity -Completed
  Write-Host ''
  Write-Host 'X Backend nao esta rodando em http://127.0.0.1:8001.' -ForegroundColor Red
  Write-Host '  Use ativar-tudo.cmd para subir tudo automaticamente.' -ForegroundColor Yellow
  Write-Host '  Ou rode .\scripts\run-api.ps1 primeiro e tente novamente.' -ForegroundColor Yellow
  Write-Host ''
  exit 1
}
Write-Host 'Backend respondendo em http://127.0.0.1:8001.' -ForegroundColor Green

# ── 3. Estado limpo ───────────────────────────────────────────────────────────
Write-Step 'Preparando para tunnel novo'
Write-Progress -Activity $ProgressActivity -Status 'Encerrando tunnel antigo...' -PercentComplete 15

Stop-RunningCloudflared

if (-not (Test-Path $RuntimeDir)) {
  New-Item -ItemType Directory -Path $RuntimeDir -Force | Out-Null
}
foreach ($f in @($TunnelUrlFile, $TunnelStderrFile, $TunnelStdoutFile)) {
  if (Test-Path $f) { Remove-Item -LiteralPath $f -Force -ErrorAction SilentlyContinue }
}

# ── 4. Tunnel em janela separada ──────────────────────────────────────────────
Write-Step 'Iniciando Cloudflare Tunnel em janela separada'
Write-Progress -Activity $ProgressActivity -Status 'Subindo Cloudflare Tunnel...' -PercentComplete 20

Start-Process -FilePath $PowerShellExe -ArgumentList @(
  '-ExecutionPolicy', 'Bypass', '-NoExit', '-File', $TunnelRunner
) | Out-Null

# ── 5. Aguardar URL ───────────────────────────────────────────────────────────
$tunnelUrl = Wait-ForTunnelUrl -FilePath $TunnelUrlFile -TimeoutSeconds 90

if (-not $tunnelUrl) {
  Write-Progress -Activity $ProgressActivity -Completed
  Write-Host ''
  Write-Host 'X Tunnel nao publicou URL em 90s.' -ForegroundColor Red
  Write-Host "  Log: $TunnelStderrFile" -ForegroundColor Yellow

  $logFile = if (Test-Path $TunnelStderrFile) { $TunnelStderrFile } `
             elseif (Test-Path $TunnelStdoutFile) { $TunnelStdoutFile } `
             else { $null }
  if ($logFile) {
    $logLines = Get-Content $logFile -ErrorAction SilentlyContinue
    if ($logLines) {
      Write-Host ''
      Write-Host "Saida do cloudflared (ultimas 40 linhas de $([System.IO.Path]::GetFileName($logFile))):" -ForegroundColor Cyan
      $logLines | Select-Object -Last 40 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
    } else {
      Write-Host '  (log vazio — cloudflared pode nao ter iniciado)' -ForegroundColor Yellow
    }
  } else {
    Write-Host '  (nenhum log gerado — cloudflared pode nao ter iniciado)' -ForegroundColor Yellow
  }

  Write-Host ''
  exit 1
}

Write-Host ''
Write-Host "URL do tunnel: $tunnelUrl" -ForegroundColor Green

# ── 6. POST Vercel com retry (Vercel faz o health check — aguarda DNS) ─────────
Write-Step 'Registrando backend na Vercel'

$payload = @{
  baseUrl     = $tunnelUrl
  activatedAt = (Get-Date).ToUniversalTime().ToString('o')
  machineName = $env:COMPUTERNAME
} | ConvertTo-Json

$response = $null
$maxRetries = 15
$retryDelay = 8

for ($attempt = 1; $attempt -le $maxRetries; $attempt++) {
  $pct = [math]::Min(97, 70 + ($attempt * 3))
  Write-Progress -Activity $ProgressActivity `
    -Status "Enviando para Vercel, tentativa $attempt/$maxRetries..." `
    -PercentComplete $pct

  try {
    $response = Invoke-RestMethod -Uri $RuntimeBackendSyncUrl -Method Post `
      -ContentType 'application/json' `
      -Headers @{ Authorization = "Bearer $syncToken" } `
      -Body $payload -ErrorAction Stop
    break
  } catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    $errorBody = $null
    try { $errorBody = $_.ErrorDetails.Message } catch {}

    if ($statusCode -eq 400 -and $attempt -lt $maxRetries) {
      Write-Host "Tentativa $attempt/$($maxRetries): Vercel ainda nao acessa o tunnel (DNS propagando). Aguardando $($retryDelay)s..." -ForegroundColor Yellow
      Start-Sleep -Seconds $retryDelay
      continue
    }

    Write-Progress -Activity $ProgressActivity -Completed
    Write-Host ''
    Write-Host 'X Falha ao enviar para a Vercel.' -ForegroundColor Red
    Write-Host "   Status: $statusCode" -ForegroundColor Gray
    if ($errorBody) { Write-Host "   Detalhes: $errorBody" -ForegroundColor Gray }
    Write-Host ''
    if ($statusCode -eq 401) {
      Write-Host 'Token desalinhado: ENGLISH_TUTOR_VERCEL_SYNC_TOKEN != VERCEL_BACKEND_SYNC_TOKEN (Vercel).' -ForegroundColor Yellow
    } elseif ($statusCode -eq 503) {
      Write-Host 'Vercel: VERCEL_BACKEND_SYNC_TOKEN ou KV/GITHUB_TOKEN nao configurado.' -ForegroundColor Yellow
    } elseif ($statusCode -eq 400) {
      Write-Host 'Vercel nao conseguiu acessar /health mesmo apos retries. Tente novamente.' -ForegroundColor Yellow
    }
    Write-Host ''
    $encoded = [System.Uri]::EscapeDataString($tunnelUrl)
    Write-Host "Alternativa manual: https://english-tutor-kid.vercel.app/connect?apiUrl=$encoded&auto=1" -ForegroundColor Cyan
    Write-Host ''
    exit 1
  }
}

if (-not $response) {
  Write-Progress -Activity $ProgressActivity -Completed
  Write-Host ''
  Write-Host 'X Vercel nao aceitou a URL apos todas as tentativas.' -ForegroundColor Red
  Write-Host ''
  exit 1
}

# ── 7. Sucesso ────────────────────────────────────────────────────────────────
Write-Progress -Activity $ProgressActivity -Status 'Concluido!' -PercentComplete 100
Start-Sleep -Milliseconds 300
Write-Progress -Activity $ProgressActivity -Completed

Write-Host ''
Write-Host '=============================================' -ForegroundColor Green
Write-Host '  Backend ativado com sucesso na Vercel!' -ForegroundColor Green
Write-Host '=============================================' -ForegroundColor Green
Write-Host "  URL:        $($response.baseUrl)" -ForegroundColor Green
Write-Host "  Atualizado: $($response.updatedAt)" -ForegroundColor Green
Write-Host ''
Write-Host 'Seu filho pode acessar:' -ForegroundColor Cyan
Write-Host '  https://english-tutor-kid.vercel.app' -ForegroundColor White
Write-Host ''
Write-Host 'IMPORTANTE: a janela do Cloudflare Tunnel precisa ficar aberta.' -ForegroundColor Yellow
Write-Host '            Fechar essa janela desconecta o site.' -ForegroundColor Yellow
Write-Host ''
