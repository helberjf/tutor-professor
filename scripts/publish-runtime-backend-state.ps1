[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$BaseUrl,
  [string]$RemoteName = 'origin',
  [string]$TagName = 'runtime-backend-state',
  [string]$StateFilePath = 'runtime/runtime-backend.json'
)

$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$TempRepoRoot = Join-Path $RepoRoot 'tmp\runtime-backend-state-publisher'

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

function Get-ExistingGitConfig([string]$Key, [string]$DefaultValue) {
  $value = git -C $RepoRoot config --get $Key 2>$null
  if ($LASTEXITCODE -eq 0 -and $value) {
    return ($value | Select-Object -First 1).Trim()
  }

  return $DefaultValue
}

$normalizedBaseUrl = Normalize-BaseUrl -Value $BaseUrl
$remoteUrl = git -C $RepoRoot remote get-url $RemoteName 2>$null
if ($LASTEXITCODE -ne 0 -or -not $remoteUrl) {
  throw "Nao foi possivel localizar o remote '$RemoteName' neste repositorio."
}
$remoteUrl = ($remoteUrl | Select-Object -First 1).Trim()

if (Test-Path $TempRepoRoot) {
  Remove-Item -LiteralPath $TempRepoRoot -Recurse -Force
}

$stateFile = Join-Path $TempRepoRoot $StateFilePath
$stateDir = Split-Path -Parent $stateFile
New-Item -ItemType Directory -Path $stateDir -Force | Out-Null

$record = [ordered]@{
  baseUrl = $normalizedBaseUrl
  host = ([System.Uri]$normalizedBaseUrl).Authority
  updatedAt = (Get-Date).ToUniversalTime().ToString('o')
  source = 'global'
  activatedAt = (Get-Date).ToUniversalTime().ToString('o')
  machineName = $env:COMPUTERNAME
}

$record | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding UTF8

$gitUserName = Get-ExistingGitConfig -Key 'user.name' -DefaultValue 'English Kids Tutor Runtime Sync'
$gitUserEmail = Get-ExistingGitConfig -Key 'user.email' -DefaultValue 'runtime-sync@english-tutor-kid.local'

Push-Location $TempRepoRoot
try {
  git init -b runtime-backend-state | Out-Null
  git config user.name $gitUserName
  git config user.email $gitUserEmail
  git remote add $RemoteName $remoteUrl
  git add $StateFilePath
  git commit -m "Update runtime backend state" | Out-Null
  git push --force $RemoteName "HEAD:refs/tags/$TagName" | Out-Null
} finally {
  Pop-Location
}

Write-Host ''
Write-Host "[GitHub runtime state] published to tag '$TagName'" -ForegroundColor Green
Write-Host "[GitHub runtime state URL] $normalizedBaseUrl" -ForegroundColor Green
Write-Host ''
