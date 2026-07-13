$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$TempDir = Join-Path $RepoRoot 'tmp\run-api-env-test'
$TempEnv = Join-Path $TempDir '.env'
$TempSecrets = Join-Path $TempDir 'local.secrets'

New-Item -ItemType Directory -Path $TempDir -Force | Out-Null
Set-Content -Path $TempEnv -Encoding ascii -Value @(
  'CORS_ALLOWED_ORIGINS=http://localhost:3000'
  'FRONTEND_BASE_URL=http://localhost:3000'
)
Set-Content -Path $TempSecrets -Encoding ascii -Value @(
  'CORS_ALLOWED_ORIGINS=https://tutorprofessor.vercel.app'
  'FRONTEND_BASE_URL=https://tutorprofessor.vercel.app'
)

$result = & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'run-api.ps1') `
  -EnvFile $TempEnv `
  -LocalSecretsFile $TempSecrets `
  -CheckEnvOnly

if ($LASTEXITCODE -ne 0) {
  throw "run-api.ps1 env loader check failed with exit code $LASTEXITCODE."
}

$output = ($result -join "`n")
if ($output -notmatch 'CORS_ALLOWED_ORIGINS=https://tutorprofessor\.vercel\.app') {
  throw "run-api.ps1 did not load CORS_ALLOWED_ORIGINS from the env file."
}
if ($output -notmatch 'FRONTEND_BASE_URL=https://tutorprofessor\.vercel\.app') {
  throw "run-api.ps1 did not load FRONTEND_BASE_URL from the env file."
}

Write-Host 'run-api env loader checks passed.'
