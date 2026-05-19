# activate-backend.ps1
# Envia a URL do tunnel Cloudflare para a Vercel, ativando o backend remotamente.
# Execute este script sempre que reiniciar o projeto e quiser que o site na Vercel
# se conecte automaticamente ao backend local.
#
# Uso:
#   - Clique duplo em activate-backend.cmd   (mais fácil)
#   - OU abra o PowerShell e execute: .\scripts\activate-backend.ps1

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$SecretsFile = Join-Path $RepoRoot 'local.secrets'
$TunnelUrlFile = Join-Path $RepoRoot 'tmp\cloudflare-tunnel-url.txt'
$ActivateBackendCmdFile = Join-Path $RepoRoot 'activate-backend.cmd'

$RuntimeBackendSyncUrl = if ($env:ENGLISH_TUTOR_RUNTIME_BACKEND_URL) {
  $env:ENGLISH_TUTOR_RUNTIME_BACKEND_URL
} else {
  'https://english-tutor-kid.vercel.app/api/runtime-backend'
}

function Write-Step([string]$Message) {
  Write-Host ''
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Get-ValueFromSecretsFile([string]$Key) {
  if (-not (Test-Path $SecretsFile)) {
    return $null
  }
  $match = Get-Content $SecretsFile | Where-Object {
    $_ -match "^\s*$([regex]::Escape($Key))\s*="
  } | Select-Object -First 1
  if (-not $match) {
    return $null
  }
  return (($match -split '=', 2)[1]).Trim()
}

Write-Host ''
Write-Host '=============================================' -ForegroundColor Green
Write-Host '  English Kids Tutor — Ativar Backend Global' -ForegroundColor Green
Write-Host '=============================================' -ForegroundColor Green

# ── 1. Carregar o token do local.secrets (se existir) ─────────────────────────
Write-Step 'Lendo configurações locais'

$tokenFromFile = Get-ValueFromSecretsFile -Key 'ENGLISH_TUTOR_VERCEL_SYNC_TOKEN'
if ($tokenFromFile) {
  $env:ENGLISH_TUTOR_VERCEL_SYNC_TOKEN = $tokenFromFile
  Write-Host 'Token carregado de local.secrets.' -ForegroundColor Green
}

$syncToken = $env:ENGLISH_TUTOR_VERCEL_SYNC_TOKEN

if (-not $syncToken -or $syncToken -eq 'your_token_here') {
  Write-Host ''
  Write-Host '❌ ENGLISH_TUTOR_VERCEL_SYNC_TOKEN não está configurado.' -ForegroundColor Red
  Write-Host ''
  Write-Host 'Para ativar o backend global, siga os passos:' -ForegroundColor Yellow
  Write-Host ''
  Write-Host '  1. Abra o painel da Vercel:' -ForegroundColor White
  Write-Host '     https://vercel.com/dashboard → seu projeto → Settings → Environment Variables' -ForegroundColor Cyan
  Write-Host ''
  Write-Host '  2. Adicione as variáveis de ambiente na Vercel:' -ForegroundColor White
  Write-Host '     VERCEL_BACKEND_SYNC_TOKEN = qualquer_senha_secreta_aqui' -ForegroundColor Cyan
  Write-Host '     (opcional mas recomendado: KV_REST_API_URL e KV_REST_API_TOKEN' -ForegroundColor Gray
  Write-Host '      OU GITHUB_TOKEN — para persistir a URL entre sessões)' -ForegroundColor Gray
  Write-Host ''
  Write-Host '  3. Copie o arquivo local.secrets.example para local.secrets:' -ForegroundColor White
  Write-Host "     $RepoRoot\local.secrets" -ForegroundColor Cyan
  Write-Host ''
  Write-Host '  4. Edite local.secrets e defina:' -ForegroundColor White
  Write-Host '     ENGLISH_TUTOR_VERCEL_SYNC_TOKEN=qualquer_senha_secreta_aqui' -ForegroundColor Cyan
  Write-Host '     (deve ser o MESMO valor configurado na Vercel)' -ForegroundColor Gray
  Write-Host ''
  Write-Host '  5. Execute activate-backend.cmd novamente.' -ForegroundColor White
  Write-Host ''
  Read-Host 'Pressione Enter para fechar'
  exit 1
}

# ── 2. Obter a URL do tunnel ──────────────────────────────────────────────────
Write-Step 'Obtendo URL do tunnel Cloudflare'

$tunnelUrl = $null

if (Test-Path $TunnelUrlFile) {
  $raw = (Get-Content -Path $TunnelUrlFile -ErrorAction SilentlyContinue | Select-Object -First 1).Trim()
  if ($raw -and $raw -match '^https://') {
    $tunnelUrl = $raw
    Write-Host "URL do tunnel: $tunnelUrl" -ForegroundColor Green
  }
}

if (-not $tunnelUrl) {
  Write-Host ''
  Write-Host '❌ Não foi possível obter a URL do tunnel Cloudflare.' -ForegroundColor Red
  Write-Host ''
  Write-Host 'Certifique-se de que:' -ForegroundColor Yellow
  Write-Host '  • O start-project.cmd foi executado e o tunnel está ativo' -ForegroundColor White
  Write-Host "  • Ou cole manualmente a URL no arquivo: $TunnelUrlFile" -ForegroundColor White
  Write-Host ''

  $manualUrl = Read-Host 'Cole aqui a URL do tunnel (ou pressione Enter para cancelar)'
  $manualUrl = $manualUrl.Trim()

  if (-not $manualUrl -or $manualUrl -notmatch '^https://') {
    Write-Host 'Cancelado.' -ForegroundColor Yellow
    Read-Host 'Pressione Enter para fechar'
    exit 1
  }

  $tunnelUrl = $manualUrl
}

# ── 3. Verificar se o backend está respondendo ────────────────────────────────
Write-Step 'Verificando se o backend está respondendo'

try {
  $healthResponse = Invoke-WebRequest -Uri "$tunnelUrl/health" -Method Get -TimeoutSec 10 -ErrorAction Stop
  Write-Host "Backend respondeu com status $($healthResponse.StatusCode) ✅" -ForegroundColor Green
} catch {
  Write-Host ''
  Write-Host "❌ O backend não respondeu em $tunnelUrl/health" -ForegroundColor Red
  Write-Host "   Erro: $($_.Exception.Message)" -ForegroundColor Gray
  Write-Host ''
  Write-Host 'Certifique-se de que:' -ForegroundColor Yellow
  Write-Host '  • O backend (run-api.ps1) está em execução' -ForegroundColor White
  Write-Host "  • O tunnel aponta para http://localhost:8001" -ForegroundColor White
  Write-Host ''
  Read-Host 'Pressione Enter para fechar'
  exit 1
}

# ── 4. Enviar a URL para a Vercel ─────────────────────────────────────────────
Write-Step 'Enviando URL do backend para a Vercel'

try {
  $payload = @{
    baseUrl     = $tunnelUrl
    activatedAt = (Get-Date).ToUniversalTime().ToString('o')
    machineName = $env:COMPUTERNAME
  } | ConvertTo-Json

  $response = Invoke-RestMethod -Uri $RuntimeBackendSyncUrl -Method Post `
    -ContentType 'application/json' `
    -Headers @{ Authorization = "Bearer $syncToken" } `
    -Body $payload

  Write-Host ''
  Write-Host '✅ Backend ativado com sucesso na Vercel!' -ForegroundColor Green
  Write-Host "   URL: $($response.baseUrl)" -ForegroundColor Green
  Write-Host "   Atualizado em: $($response.updatedAt)" -ForegroundColor Green
  Write-Host ''
  Write-Host 'Agora o seu filho pode acessar:' -ForegroundColor Cyan
  Write-Host '  https://english-tutor-kid.vercel.app' -ForegroundColor White
  Write-Host ''
} catch {
  $statusCode = $_.Exception.Response.StatusCode.value__
  $errorBody = $null
  try { $errorBody = $_.ErrorDetails.Message } catch {}

  Write-Host ''
  Write-Host '❌ Falha ao enviar para a Vercel.' -ForegroundColor Red
  Write-Host "   Status: $statusCode" -ForegroundColor Gray
  if ($errorBody) {
    Write-Host "   Detalhes: $errorBody" -ForegroundColor Gray
  }
  Write-Host "   Erro: $($_.Exception.Message)" -ForegroundColor Gray
  Write-Host ''

  if ($statusCode -eq 401) {
    Write-Host 'O token está errado. Verifique se ENGLISH_TUTOR_VERCEL_SYNC_TOKEN (local) e' -ForegroundColor Yellow
    Write-Host 'VERCEL_BACKEND_SYNC_TOKEN (Vercel) têm o mesmo valor.' -ForegroundColor Yellow
  } elseif ($statusCode -eq 503) {
    Write-Host 'A Vercel não tem VERCEL_BACKEND_SYNC_TOKEN ou nenhum método de armazenamento configurado.' -ForegroundColor Yellow
    Write-Host 'Configure KV_REST_API_URL + KV_REST_API_TOKEN (ou GITHUB_TOKEN) nas env vars da Vercel.' -ForegroundColor Yellow
  }

  Write-Host ''
  Write-Host 'Alternativa manual: acesse a página /connect e cole a URL do tunnel:' -ForegroundColor Yellow
  $encoded = [System.Uri]::EscapeDataString($tunnelUrl)
  Write-Host "  https://english-tutor-kid.vercel.app/connect?apiUrl=$encoded&auto=1" -ForegroundColor Cyan
  Write-Host ''
  Read-Host 'Pressione Enter para fechar'
  exit 1
}

Read-Host 'Pressione Enter para fechar'
