[CmdletBinding()]
param(
  [switch]$WithTunnel,
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
$TunnelRunner = Join-Path $PSScriptRoot 'run-tunnel.ps1'
$TunnelUrlFile = Join-Path $RepoRoot 'tmp\cloudflare-tunnel-url.txt'

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

function Wait-ForTunnelUrl([string]$FilePath, [int]$TimeoutSeconds = 25) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

  while ((Get-Date) -lt $deadline) {
    if (Test-Path $FilePath) {
      $url = (Get-Content -Path $FilePath -ErrorAction SilentlyContinue | Select-Object -First 1).Trim()
      if ($url) {
        Write-Host ''
        Write-Host "[Cloudflare URL] $url" -ForegroundColor Green
        Write-Host 'Use this URL in https://english-tutor-kid.vercel.app/connect' -ForegroundColor Green
        Write-Host ''
        return $true
      }
    }

    Start-Sleep -Milliseconds 500
  }

  Write-Host ''
  Write-Host 'Cloudflare URL not captured yet in this terminal.' -ForegroundColor Yellow
  Write-Host "If needed, check: $FilePath" -ForegroundColor Yellow
  Write-Host ''
  return $false
}

Write-Step 'Checking required tools'
Test-CommandAvailable python 'Install Python 3.11+ and try again.'
Test-CommandAvailable pnpm 'Install pnpm and try again.'

if ($WithTunnel) {
  Test-CommandAvailable cloudflared 'Install cloudflared or rerun without -WithTunnel.'
}

Write-Step 'Ensuring local environment files exist'
Initialize-FileFromExample $ApiEnv $ApiEnvExample
Initialize-FileFromExample $WebEnv $WebEnvExample

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

Write-Step 'Initializing database'
Set-Location $RepoRoot
python scripts\init_db.py

if ($CheckOnly) {
  Write-Host ''
  Write-Host 'Check completed. No server windows were started because -CheckOnly was used.' -ForegroundColor Yellow
  exit 0
}

if ($WithTunnel) {
  Write-Step 'Starting Cloudflare Tunnel window'
  Start-Process -FilePath $PowerShellExe -ArgumentList @(
    '-ExecutionPolicy', 'Bypass',
    '-NoExit',
    '-File', $TunnelRunner
  ) | Out-Null

  Write-Step 'Waiting for Cloudflare Tunnel URL'
  Wait-ForTunnelUrl -FilePath $TunnelUrlFile | Out-Null
}

Write-Step 'Starting backend window'
$ApiRunnerArgs = @(
  '-ExecutionPolicy', 'Bypass',
  '-NoExit',
  '-File', $ApiRunner
)

if ($WithTunnel) {
  $ApiRunnerArgs += @(
    '-TunnelUrlFile', $TunnelUrlFile,
    '-WaitForTunnelUrlSeconds', '5'
  )
}

Start-Process -FilePath $PowerShellExe -ArgumentList $ApiRunnerArgs | Out-Null

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
Write-Host 'For Vercel integration, the Cloudflare Tunnel must target the backend on http://localhost:8001.'

if ($WithTunnel) {
  Write-Host 'Tunnel: the extra PowerShell window will try the named tunnel first and fall back to a quick tunnel if local credentials are missing.'
  Write-Host "Tunnel URL file: $TunnelUrlFile"
  Write-Host 'The public Cloudflare URL appears in the tunnel window and is also saved to the file above.'
}
