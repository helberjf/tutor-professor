[CmdletBinding()]
param(
  [switch]$WithTunnel,
  [switch]$NoTunnel,
  [switch]$ForceInstall,
  [switch]$CheckOnly
)

$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$ApiDir = Join-Path $RepoRoot 'apps\api'
$WebDir = Join-Path $RepoRoot 'apps\web'
$ApiEnv = Join-Path $ApiDir '.env'
$ApiEnvExample = Join-Path $ApiDir '.env.example'
$WebEnv = Join-Path $WebDir '.env.local'
$WebEnvExample = Join-Path $WebDir '.env.example'
$ApiRequirements = Join-Path $ApiDir 'requirements.txt'
$PowerShellExe = (Get-Command powershell -ErrorAction Stop).Source
$ApiRunner = Join-Path $PSScriptRoot 'run-api.ps1'
$WebRunner = Join-Path $PSScriptRoot 'run-web.ps1'
$KokoroRunner = Join-Path $PSScriptRoot 'run-kokoro.ps1'
$PostgresEnsurer = Join-Path $PSScriptRoot 'ensure-postgres.ps1'
$RuntimeBackendPublisher = Join-Path $PSScriptRoot 'publish-runtime-backend-state.ps1'
$TunnelRunner = Join-Path $PSScriptRoot 'run-tunnel.ps1'
$TunnelUrlFile = Join-Path $RepoRoot 'tmp\cloudflare-tunnel-url.txt'
$TunnelLogFile = Join-Path $RepoRoot 'tmp\cloudflare-tunnel.stderr.log'
$ConnectPageUrl = if ($env:ENGLISH_TUTOR_CONNECT_URL) {
  $env:ENGLISH_TUTOR_CONNECT_URL
} else {
  'https://tutorprofessor.vercel.app/connect'
}
$RuntimeBackendSyncUrl = if ($env:ENGLISH_TUTOR_RUNTIME_BACKEND_URL) {
  $env:ENGLISH_TUTOR_RUNTIME_BACKEND_URL
} else {
  'https://tutorprofessor.vercel.app/api/runtime-backend'
}
$RuntimeBackendSyncToken = $env:ENGLISH_TUTOR_VERCEL_SYNC_TOKEN
$KokoroLocalRepo = if ($env:KOKORO_LOCAL_REPO) {
  $env:KOKORO_LOCAL_REPO
} else {
  ''
}

function Write-Step([string]$Message) {
  Write-Host ''
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Test-CommandAvailable([string]$Name, [string]$HelpText) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Command '$Name' was not found. $HelpText"
  }
}

function Initialize-FileFromExample([string]$Target, [string]$Example) {
  if (Test-Path $Target) {
    return
  }

  Copy-Item $Example $Target
  Write-Host "Created $Target from $Example"
}

function Test-PythonModules([string[]]$Modules) {
  $imports = ($Modules | ForEach-Object { "import $_" }) -join '; '
  python -c $imports *> $null
  return $LASTEXITCODE -eq 0
}

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

function Get-KokoroPortFromUrl([string]$Url) {
  if (-not $Url) {
    return 8880
  }

  try {
    $uri = [System.Uri]$Url
    if ($uri.Port -gt 0) {
      return $uri.Port
    }
  } catch {
  }

  return 8880
}

function Wait-ForTcpPort([string]$HostName, [int]$Port, [int]$TimeoutSeconds = 30) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

  while ((Get-Date) -lt $deadline) {
    if (Test-NetConnection -ComputerName $HostName -Port $Port -InformationLevel Quiet -WarningAction SilentlyContinue) {
      return $true
    }

    Start-Sleep -Seconds 1
  }

  return $false
}

function Test-DockerDaemonAvailable() {
  docker info *> $null
  return $LASTEXITCODE -eq 0
}

function Wait-ForTunnelUrl([string]$FilePath, [int]$TimeoutSeconds = 25) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

  while ((Get-Date) -lt $deadline) {
    if (Test-Path $FilePath) {
      $url = (Get-Content -Path $FilePath -ErrorAction SilentlyContinue | Select-Object -First 1).Trim()
      if ($url) {
        $connectLink = "$ConnectPageUrl?apiUrl=$([System.Uri]::EscapeDataString($url))&auto=1"
        Write-Host ''
        Write-Host "[Cloudflare URL] $url" -ForegroundColor Green
        Write-Host 'Use this URL in https://tutorprofessor.vercel.app/connect' -ForegroundColor Green
        Write-Host "[Auto-connect link] $connectLink" -ForegroundColor Green
        Write-Host ''
        return $url
      }
    }

    Start-Sleep -Milliseconds 500
  }

  Write-Host ''
  Write-Host 'Cloudflare URL not captured yet in this terminal.' -ForegroundColor Yellow
  Write-Host "If needed, check: $FilePath" -ForegroundColor Yellow
  Write-Host ''
  return $null
}

function Sync-RuntimeBackend([string]$BaseUrl) {
  if (-not $BaseUrl) {
    Write-Host '[Global backend activation] skipped because no tunnel URL was captured.' -ForegroundColor Yellow
    return $false
  }

  if (-not $RuntimeBackendSyncToken) {
    Write-Host '[Global backend activation] skipped because ENGLISH_TUTOR_VERCEL_SYNC_TOKEN is not set.' -ForegroundColor Yellow
    return $false
  }

  try {
    $payload = @{
      baseUrl = $BaseUrl
      activatedAt = (Get-Date).ToUniversalTime().ToString('o')
      machineName = $env:COMPUTERNAME
    } | ConvertTo-Json

    $response = Invoke-RestMethod -Uri $RuntimeBackendSyncUrl -Method Post -ContentType 'application/json' -Headers @{
      Authorization = "Bearer $RuntimeBackendSyncToken"
    } -Body $payload

    Write-Host ''
    Write-Host "[Global backend activation] $($response.baseUrl)" -ForegroundColor Green
    Write-Host "[Global backend updated at] $($response.updatedAt)" -ForegroundColor Green
    Write-Host ''
    return $true
  } catch {
    Write-Host ''
    Write-Host "[Global backend activation] failed: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "[Global backend sync URL] $RuntimeBackendSyncUrl" -ForegroundColor Yellow
    Write-Host ''
    return $false
  }
}

function Publish-GitHubRuntimeBackendState([string]$BaseUrl) {
  if (-not $BaseUrl) {
    Write-Host '[GitHub runtime state] skipped because no tunnel URL was captured.' -ForegroundColor Yellow
    return $false
  }

  try {
    & $RuntimeBackendPublisher -BaseUrl $BaseUrl
    return $true
  } catch {
    Write-Host ''
    Write-Host "[GitHub runtime state] failed: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host ''
    return $false
  }
}

Write-Step 'Checking required tools'
Test-CommandAvailable python 'Install Python 3.11+ and try again.'
Test-CommandAvailable pnpm 'Install pnpm and try again.'

# Auto-detect tunnel: use it if cloudflared is available, unless -NoTunnel was passed.
# -WithTunnel forces it on (and errors if cloudflared is missing).
$cloudflaredAvailable = [bool](Get-Command cloudflared -ErrorAction SilentlyContinue)
if ($WithTunnel -and -not $cloudflaredAvailable) {
  throw 'cloudflared nao encontrado. Instale cloudflared ou rode sem -WithTunnel.'
}
$UseTunnel = -not $NoTunnel -and ($WithTunnel -or $cloudflaredAvailable)

if ($UseTunnel) {
  Write-Host 'cloudflared encontrado — tunnel sera iniciado automaticamente.' -ForegroundColor Cyan
} else {
  Write-Host 'cloudflared nao encontrado ou -NoTunnel passado — tunnel desativado.' -ForegroundColor Yellow
  Write-Host 'O site na Vercel usara a ultima URL publicada. Para ativar: instale cloudflared.' -ForegroundColor Yellow
}

Write-Step 'Ensuring local environment files exist'
Initialize-FileFromExample $ApiEnv $ApiEnvExample
Initialize-FileFromExample $WebEnv $WebEnvExample

$TtsProvider = Get-EnvValueFromFile -FilePath $ApiEnv -Key 'TTS_PROVIDER'
if (-not $TtsProvider) {
  $TtsProvider = 'kokoro'
}
$KokoroUrl = (Get-EnvValueFromFile -FilePath $ApiEnv -Key 'KOKORO_URL')
if (-not $KokoroUrl) {
  $KokoroUrl = 'http://127.0.0.1:8880/v1/audio/speech'
}
$KokoroPort = Get-KokoroPortFromUrl -Url $KokoroUrl
$ShouldStartKokoro = $TtsProvider -eq 'kokoro' -and ($KokoroUrl -match '^https?://(localhost|127\.0\.0\.1)[:/]')

Write-Step 'Checking backend dependencies'
if ($ForceInstall -or -not (Test-PythonModules @('fastapi', 'sqlmodel', 'uvicorn'))) {
  python -m pip install -r $ApiRequirements
} else {
  Write-Host 'Python dependencies already available.'
}

Write-Step 'Checking frontend dependencies'
if ($ForceInstall -or -not (Test-Path (Join-Path $WebDir 'node_modules'))) {
  Set-Location $WebDir
  pnpm install
  Set-Location $RepoRoot
} else {
  Write-Host 'Node dependencies already installed.'
}

Write-Step 'Ensuring local PostgreSQL is running'
& $PostgresEnsurer

Write-Step 'Initializing database'
Set-Location $RepoRoot
python scripts\init_db.py
if ($LASTEXITCODE -ne 0) {
  throw "Database initialization failed with exit code $LASTEXITCODE."
}

if ($CheckOnly) {
  Write-Host ''
  Write-Host 'Check completed. No server windows were started because -CheckOnly was used.' -ForegroundColor Yellow
  exit 0
}

if ($ShouldStartKokoro) {
  Write-Step 'Starting Kokoro TTS window'
  $KokoroRunnerArgs = @(
    '-ExecutionPolicy', 'Bypass',
    '-NoExit',
    '-File', $KokoroRunner,
    '-HostPort', $KokoroPort
  )

  if ($KokoroLocalRepo) {
    $KokoroRunnerArgs += @(
      '-LocalRepoPath', $KokoroLocalRepo
    )
  }

  Start-Process -FilePath $PowerShellExe -ArgumentList $KokoroRunnerArgs | Out-Null

  Write-Step 'Waiting for Kokoro TTS'
  if (Wait-ForTcpPort -HostName '127.0.0.1' -Port $KokoroPort -TimeoutSeconds 45) {
    Write-Host "Kokoro TTS is responding on http://127.0.0.1:$KokoroPort" -ForegroundColor Green
  } else {
    Write-Host "Kokoro TTS did not respond on http://127.0.0.1:$KokoroPort yet. The launcher tried a local Kokoro repo first and then Docker fallback if needed." -ForegroundColor Yellow
    Write-Host 'The backend will still start, but TTS may keep falling back until Kokoro finishes booting.' -ForegroundColor Yellow
  }
}

Write-Step 'Starting backend window'
$ApiRunnerArgs = @(
  '-ExecutionPolicy', 'Bypass',
  '-NoExit',
  '-File', $ApiRunner
)

if ($UseTunnel) {
  $ApiRunnerArgs += @(
    '-TunnelUrlFile', $TunnelUrlFile,
    '-WaitForTunnelUrlSeconds', '0'
  )
}

Start-Process -FilePath $PowerShellExe -ArgumentList $ApiRunnerArgs | Out-Null

Write-Step 'Waiting for backend to respond on port 8001'
if (Wait-ForTcpPort -HostName '127.0.0.1' -Port 8001 -TimeoutSeconds 30) {
  Write-Host 'Backend is up on http://localhost:8001' -ForegroundColor Green
} else {
  Write-Host 'Backend did not respond on port 8001 within 30 seconds.' -ForegroundColor Yellow
  Write-Host 'The Vercel sync will be skipped. Start the backend manually and run activate-backend.cmd.' -ForegroundColor Yellow
}

if ($UseTunnel) {
  if (Test-Path $TunnelUrlFile) {
    Remove-Item -LiteralPath $TunnelUrlFile -Force
  }
  if (Test-Path $TunnelLogFile) {
    Remove-Item -LiteralPath $TunnelLogFile -Force
  }

  Write-Step 'Starting Cloudflare Tunnel window'
  Start-Process -FilePath $PowerShellExe -ArgumentList @(
    '-ExecutionPolicy', 'Bypass',
    '-NoExit',
    '-File', $TunnelRunner
  ) | Out-Null

  Write-Step 'Waiting for Cloudflare Tunnel URL'
  $TunnelUrl = Wait-ForTunnelUrl -FilePath $TunnelUrlFile

  if ($TunnelUrl) {
    Write-Step 'Publishing global backend state on GitHub'
    $GitHubRuntimeStatePublished = Publish-GitHubRuntimeBackendState -BaseUrl $TunnelUrl

    Write-Step 'Syncing global backend on Vercel'
    $VercelRuntimeBackendSynced = Sync-RuntimeBackend -BaseUrl $TunnelUrl

    if (-not $GitHubRuntimeStatePublished -and -not $VercelRuntimeBackendSynced) {
      Write-Host 'The tunnel URL was captured, but no global activation target accepted it yet.' -ForegroundColor Yellow
      Write-Host 'To activate manually, run activate-backend.cmd after the backend is up.' -ForegroundColor Yellow
    }
  }
}

Write-Step 'Starting frontend window'
Start-Process -FilePath $PowerShellExe -ArgumentList @(
  '-ExecutionPolicy', 'Bypass',
  '-NoExit',
  '-File', $WebRunner
) | Out-Null

Write-Host ''
Write-Host 'Project windows started successfully.' -ForegroundColor Green
Write-Host 'Frontend: http://localhost:3000'
Write-Host 'Backend: http://localhost:8001'
if ($ShouldStartKokoro) {
  Write-Host "Kokoro: http://127.0.0.1:$KokoroPort/v1/audio/speech"
}
Write-Host 'For Vercel integration, the Cloudflare Tunnel must target the backend on http://localhost:8001.'

if ($UseTunnel) {
  Write-Host 'Tunnel: iniciando automaticamente (cloudflared detectado).'
  Write-Host "Tunnel URL file: $TunnelUrlFile"
  Write-Host "Tunnel log file: $TunnelLogFile"
  Write-Host 'The public Cloudflare URL appears in the tunnel window and is also saved to the file above.'
}
