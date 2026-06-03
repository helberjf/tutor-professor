# ativar-tudo.ps1
# Botao unico: sobe backend, tunnel e envia pra Vercel automaticamente.
# Clique duplo em ativar-tudo.cmd para usar.

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$SecretsFile = Join-Path $RepoRoot 'local.secrets'
$RuntimeDir = Join-Path $RepoRoot 'tmp'
$TunnelUrlFile = Join-Path $RuntimeDir 'cloudflare-tunnel-url.txt'
$TunnelStderrFile = Join-Path $RuntimeDir 'cloudflare-tunnel.stderr.log'
$TunnelStdoutFile = Join-Path $RuntimeDir 'cloudflare-tunnel.stdout.log'
$ApiRunner = Join-Path $PSScriptRoot 'run-api.ps1'
$TunnelRunner = Join-Path $PSScriptRoot 'run-tunnel.ps1'
$PowerShellExe = (Get-Command powershell -ErrorAction Stop).Source

$RuntimeBackendSyncUrl = if ($env:ENGLISH_TUTOR_RUNTIME_BACKEND_URL) {
  $env:ENGLISH_TUTOR_RUNTIME_BACKEND_URL
} else {
  'https://english-tutor-kid.vercel.app/api/runtime-backend'
}

$ProgressActivity = 'Ativando backend completo'

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

# Carrega TODOS os pares chave=valor de local.secrets como variaveis de ambiente
# do processo atual. Isso garante que o processo filho do backend herde DATABASE_URL,
# GEMINI_API_KEY e outras variaveis necessarias.
function Import-SecretsToEnv() {
  if (-not (Test-Path $SecretsFile)) { return }
  Get-Content $SecretsFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith('#') -and $line -match '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
      $key   = $Matches[1]
      $value = $Matches[2].Trim()
      Set-Item -Path "env:$key" -Value $value
    }
  }
}

function Wait-ForTcpPort([string]$HostName, [int]$Port, [int]$TimeoutSeconds = 45) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $ok = Test-NetConnection -ComputerName $HostName -Port $Port `
      -InformationLevel Quiet -WarningAction SilentlyContinue -ErrorAction SilentlyContinue
    if ($ok) { return $true }
    Start-Sleep -Seconds 1
  }
  return $false
}

function Find-UrlInLogFile([string]$LogPath) {
  if (-not (Test-Path $LogPath)) { return $null }
  $lines = Get-Content -Path $LogPath -ErrorAction SilentlyContinue
  if (-not $lines) { return $null }
  foreach ($line in $lines) {
    if ($line -match 'https://[a-z0-9\-]+\.trycloudflare\.com') {
      return $Matches[0].TrimEnd('/', ' ', '|')
    }
  }
  return $null
}

function Wait-ForTunnelUrl([string]$FilePath, [string]$StderrLog = '', [string]$StdoutLog = '', [int]$TimeoutSeconds = 90) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $startTime = Get-Date
  while ((Get-Date) -lt $deadline) {
    # Caminho primario: arquivo escrito por run-tunnel.ps1
    if (Test-Path $FilePath) {
      $raw = (Get-Content -Path $FilePath -ErrorAction SilentlyContinue | Select-Object -First 1)
      if ($raw) {
        $url = $raw.Trim()
        if ($url -match '^https://') { return $url }
      }
    }
    # Fallback: ler o log do cloudflared diretamente (caso run-tunnel.ps1 falhe ao gravar o arquivo)
    $url = Find-UrlInLogFile $StderrLog
    if (-not $url) { $url = Find-UrlInLogFile $StdoutLog }
    if ($url) { return $url }

    $elapsed = [int]((Get-Date) - $startTime).TotalSeconds
    $pct = [math]::Min(69, 30 + [int](($elapsed / $TimeoutSeconds) * 39))
    Write-Progress -Activity $ProgressActivity `
      -Status "Aguardando Cloudflare Tunnel publicar URL... ($($elapsed)s)" `
      -PercentComplete $pct
    Start-Sleep -Milliseconds 500
  }
  return $null
}

function Stop-OldProcesses() {
  $cf = Get-Process -Name cloudflared -ErrorAction SilentlyContinue
  if ($cf) {
    Write-Host "Encerrando $($cf.Count) processo(s) cloudflared antigo(s)..." -ForegroundColor Yellow
    $cf | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 800
  }
}

# ─────────────────────────────────────────────────────────────────────────────

Write-Host ''
Write-Host '====================================================' -ForegroundColor Green
Write-Host '  English Kids Tutor - Ativar Backend Completo' -ForegroundColor Green
Write-Host '====================================================' -ForegroundColor Green
Write-Host ''
Write-Host 'Este script vai:' -ForegroundColor Cyan
Write-Host '  1. Subir o backend local (FastAPI)' -ForegroundColor White
Write-Host '  2. Subir o Cloudflare Tunnel' -ForegroundColor White
Write-Host '  3. Registrar na Vercel automaticamente' -ForegroundColor White
Write-Host ''

# ── 1. Token ──────────────────────────────────────────────────────────────────
Write-Step 'Lendo configuracoes locais'
Write-Progress -Activity $ProgressActivity -Status 'Lendo token...' -PercentComplete 5

# Importa TODAS as variaveis de local.secrets para o ambiente atual.
# Assim o processo filho do backend herda DATABASE_URL, GEMINI_API_KEY, etc.
Import-SecretsToEnv

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
  Write-Host '  Configure em local.secrets e na Vercel (VERCEL_BACKEND_SYNC_TOKEN).' -ForegroundColor Yellow
  Write-Host ''
  exit 1
}

# ── 2. Pre-requisitos ─────────────────────────────────────────────────────────
Write-Step 'Verificando pre-requisitos'
Write-Progress -Activity $ProgressActivity -Status 'Checando cloudflared...' -PercentComplete 10

if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  Write-Progress -Activity $ProgressActivity -Completed
  Write-Host ''
  Write-Host 'X cloudflared nao encontrado.' -ForegroundColor Red
  Write-Host '  Instale: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/' -ForegroundColor Yellow
  Write-Host ''
  exit 1
}
Write-Host 'cloudflared encontrado.' -ForegroundColor Green

# ── 3. Estado limpo ───────────────────────────────────────────────────────────
Write-Step 'Preparando ambiente limpo'
Write-Progress -Activity $ProgressActivity -Status 'Encerrando processos antigos...' -PercentComplete 15

Stop-OldProcesses

if (-not (Test-Path $RuntimeDir)) {
  New-Item -ItemType Directory -Path $RuntimeDir -Force | Out-Null
}
foreach ($f in @($TunnelUrlFile, $TunnelStderrFile, $TunnelStdoutFile)) {
  if (Test-Path $f) { Remove-Item -LiteralPath $f -Force -ErrorAction SilentlyContinue }
}

# ── 4. Backend ────────────────────────────────────────────────────────────────
Write-Step 'Iniciando backend (FastAPI) em janela separada'
Write-Progress -Activity $ProgressActivity -Status 'Subindo backend...' -PercentComplete 20

Start-Process -FilePath $PowerShellExe -ArgumentList @(
  '-ExecutionPolicy', 'Bypass', '-NoExit', '-File', $ApiRunner
) | Out-Null

Write-Host 'Aguardando backend responder em http://127.0.0.1:8001...' -ForegroundColor Yellow
Write-Progress -Activity $ProgressActivity -Status 'Aguardando backend subir...' -PercentComplete 22

if (-not (Wait-ForTcpPort -HostName '127.0.0.1' -Port 8001 -TimeoutSeconds 45)) {
  Write-Progress -Activity $ProgressActivity -Completed
  Write-Host ''
  Write-Host 'X Backend nao respondeu em 45s.' -ForegroundColor Red
  Write-Host '  Verifique a janela do backend para erros.' -ForegroundColor Yellow
  Write-Host ''
  exit 1
}
Write-Host 'Backend respondendo em http://127.0.0.1:8001.' -ForegroundColor Green

# ── 5. Tunnel ─────────────────────────────────────────────────────────────────
Write-Step 'Iniciando Cloudflare Tunnel em janela separada'
Write-Progress -Activity $ProgressActivity -Status 'Subindo tunnel...' -PercentComplete 28

Start-Process -FilePath $PowerShellExe -ArgumentList @(
  '-ExecutionPolicy', 'Bypass', '-NoExit', '-File', $TunnelRunner
) | Out-Null

# ── 6. Aguardar URL ───────────────────────────────────────────────────────────
$tunnelUrl = Wait-ForTunnelUrl -FilePath $TunnelUrlFile -StderrLog $TunnelStderrFile -StdoutLog $TunnelStdoutFile -TimeoutSeconds 90

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
  Write-Host 'Causas comuns:' -ForegroundColor Yellow
  Write-Host '  - cloudflared nao instalado ou fora do PATH' -ForegroundColor White
  Write-Host '  - Firewall bloqueando saida para a Cloudflare' -ForegroundColor White
  Write-Host '  - Conexao lenta: tente rodar de novo' -ForegroundColor White
  Write-Host ''
  exit 1
}

Write-Host ''
Write-Host "URL do tunnel: $tunnelUrl" -ForegroundColor Green

# ── 7. POST Vercel com retry (Vercel faz o health check — aguarda DNS) ─────────
Write-Step 'Registrando backend na Vercel'

# Aguarda DNS propagar antes da primeira tentativa
Write-Host 'Aguardando 20s para DNS do tunnel propagar...' -ForegroundColor Yellow
Write-Progress -Activity $ProgressActivity -Status 'Aguardando DNS propagar...' -PercentComplete 72
Start-Sleep -Seconds 20

$payload = @{
  baseUrl     = $tunnelUrl
  activatedAt = (Get-Date).ToUniversalTime().ToString('o')
  machineName = $env:COMPUTERNAME
} | ConvertTo-Json

$response = $null
$postMaxRetries = 15
$postRetryDelay = 8

for ($attempt = 1; $attempt -le $postMaxRetries; $attempt++) {
  $pct = [math]::Min(97, 70 + ($attempt * 3))
  Write-Progress -Activity $ProgressActivity `
    -Status "Enviando para Vercel, tentativa $attempt/$postMaxRetries..." `
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

    if ($statusCode -eq 400 -and $attempt -lt $postMaxRetries) {
      Write-Host "Tentativa $attempt/$($postMaxRetries): Vercel ainda nao acessa o tunnel (DNS propagando). Aguardando $($postRetryDelay)s..." -ForegroundColor Yellow
      Start-Sleep -Seconds $postRetryDelay
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
    Write-Host 'Backend e tunnel continuam rodando. Tente novamente em 1 minuto.' -ForegroundColor Cyan
    $encoded = [System.Uri]::EscapeDataString($tunnelUrl)
    Write-Host "Ou acesse manualmente: https://english-tutor-kid.vercel.app/connect?apiUrl=$encoded&auto=1" -ForegroundColor Cyan
    Write-Host ''
    exit 1
  }
}

if (-not $response) {
  Write-Progress -Activity $ProgressActivity -Completed
  Write-Host ''
  Write-Host 'X Vercel nao aceitou a URL apos todas as tentativas.' -ForegroundColor Red
  Write-Host '  Tente novamente em 1-2 minutos.' -ForegroundColor Yellow
  Write-Host ''
  exit 1
}

# ── 8. Sucesso ────────────────────────────────────────────────────────────────
Write-Progress -Activity $ProgressActivity -Status 'Concluido!' -PercentComplete 100
Start-Sleep -Milliseconds 300
Write-Progress -Activity $ProgressActivity -Completed

Write-Host ''
Write-Host '====================================================' -ForegroundColor Green
Write-Host '       Backend ativado com sucesso!' -ForegroundColor Green
Write-Host '====================================================' -ForegroundColor Green
Write-Host "  URL:        $($response.baseUrl)" -ForegroundColor Green
Write-Host "  Atualizado: $($response.updatedAt)" -ForegroundColor Green
Write-Host ''
Write-Host 'Seu filho pode acessar agora:' -ForegroundColor Cyan
Write-Host '  https://english-tutor-kid.vercel.app' -ForegroundColor White
Write-Host ''
Write-Host '====================================================' -ForegroundColor Yellow
Write-Host '  IMPORTANTE: Mantenha as janelas abertas!' -ForegroundColor Yellow
Write-Host '====================================================' -ForegroundColor Yellow
Write-Host '  - Janela do BACKEND (FastAPI / Uvicorn)' -ForegroundColor White
Write-Host '  - Janela do TUNNEL  (Cloudflare)' -ForegroundColor White
Write-Host ''
Write-Host '  Fechar qualquer uma delas desconecta o site.' -ForegroundColor White
Write-Host ''
